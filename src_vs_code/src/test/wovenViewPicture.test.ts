import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MiniDocument, MiniWindow, runFragment } from './miniDom';
import { viewWeaveScripts } from '../viewWeaveScripts';
import { SHUFFLE_CODES } from '../shuffle';

/**
 * The picture, RUN rather than string-matched.
 *
 * <p>Every earlier test of this family asserted against a page script's generated SOURCE, and issue
 * #51 survived all of them: the source said the right thing while the picture rendered as three grey
 * unboxed lines, because the block it painted into carried no class. So this executes the fragment
 * against `miniDom` and reads the tree that comes out.</p>
 */

const KEY = 'pin';
const CODE = SHUFFLE_CODES[2];

/** The page the viewer draws for one woven field, as far as this fragment touches it. */
function page(): { document: MiniDocument; window: MiniWindow; posted: unknown[] } {
  const document = new MiniDocument();
  const host = document.place('host');
  host.dataset.wovenHost = '';
  host.dataset.entity = 'e1';
  const rows = document.place(`payRows_${KEY}`, 'div', host);
  rows.hidden = true;
  document.place(`payReading_${KEY}_a`, 'div', rows);
  document.place(`payReading_${KEY}_b`, 'div', rows);
  document.place(`payExample_${KEY}`, 'div', rows);
  document.place(`payNote_${KEY}`, 'div', host);
  const pick = document.place(`pick_${KEY}`, 'select', host);
  pick.className = 'mixPick';
  pick.dataset.key = KEY;
  // The picker must hold the method the answers name, or `payReading`'s stale-answer guard drops
  // every one of them — and a test asserting "nothing was painted" would pass without ever having
  // painted anything. In the page this value comes from the selected option.
  pick.value = CODE;
  const posted: unknown[] = [];
  const window = new MiniWindow();
  runFragment(viewWeaveScripts(), document, [], posted, window);
  return { document, window, posted };
}

/** A reading answer, in the shape both hosts post. */
function reading(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'paymentReading',
    entityId: 'e1',
    key: KEY,
    code: CODE,
    ok: true,
    words: false,
    first: [...'4821'],
    second: [...'9137'],
    woven: [
      { text: '4', side: 'first' },
      { text: '9', side: 'second' },
      { text: '8', side: 'first' },
      { text: '1', side: 'second' },
    ],
    methodName: 'Method 3',
    visibleMs: 0,
    ...extra,
  };
}

test('a reading paints a three-column picture under the two rows, captioned by the ROWS', () => {
  const { document, window } = page();

  window.deliver(reading());

  const block = document.querySelector('.weaveEx[data-field="pin"]');
  assert.ok(block !== null, 'the block exists — without its class no colour rule reaches it (#51)');
  assert.equal(block.parent?.id, `payExample_${KEY}`, 'and it is inside the picture host');
  assert.ok(block.querySelector('.exTok.first') !== null, 'one half is painted');
  assert.ok(block.querySelector('.exTok.second') !== null, 'and so is the other');
  assert.match(block.textContent, /Method 3/, 'titled with the method a person sees');
  assert.ok(!/f\d/.test(block.textContent), 'and never with the raw code');
  assert.match(block.textContent, /First row/, 'the columns are named after the rows');
  assert.match(block.textContent, /Second row/);
});

test('the painted picture names neither row as the real one', () => {
  const { document, window } = page();

  window.deliver(reading());

  const block = document.querySelector('.weaveEx[data-field="pin"]');
  assert.ok(!/real|decoy|your (value|password)/i.test(block!.textContent));
});

test('a phrase that closes itself takes its picture with it', () => {
  // `runFragment` runs a timeout immediately, so a reading that carries one has already closed by
  // the time this returns. A picture of twelve words surviving that close would defeat the measure
  // the ninety seconds exist to provide.
  const { document, window } = page();
  // First prove this page CAN paint — otherwise the assertions below pass on a page where nothing
  // was ever drawn, which is exactly how this test failed to test anything on its first writing.
  window.deliver(reading());
  assert.ok(document.querySelector('.weaveEx[data-field="pin"]') !== null, 'painted before it closes');

  window.deliver(reading({ words: true, visibleMs: 90000 }));

  assert.equal(document.querySelector('.weaveEx[data-field="pin"]'), null, 'the picture went with it');
  assert.equal(document.getElementById(`payRows_${KEY}`)?.hidden, true, 'and the rows are hidden');
});

test('a refusal leaves no stale picture under it', () => {
  const { document, window } = page();
  window.deliver(reading());
  assert.ok(document.querySelector('.weaveEx[data-field="pin"]') !== null, 'painted first');

  window.deliver({ type: 'paymentReading', entityId: 'e1', key: KEY, ok: false, why: 'cannot be read' });

  assert.equal(document.querySelector('.weaveEx[data-field="pin"]'), null, 'and taken away');
  assert.equal(document.getElementById(`payNote_${KEY}`)?.textContent, 'cannot be read', 'the reason is said');
});

test('picking another method takes the previous reading and its picture off the screen', () => {
  const { document, window, posted } = page();
  window.deliver(reading());
  assert.ok(document.querySelector('.weaveEx[data-field="pin"]') !== null, 'a reading is on screen');

  // Fired on the element the listener is bound to, with the picker as the target: `miniDom` does not
  // bubble, and `change` does in a browser. What this pins is the handler's own behaviour — that it
  // reads the key off the target and closes that field — not the bubbling, which is the platform's.
  const pick = document.getElementById(`pick_${KEY}`)!;
  document.getElementById('host')!.fire('change', { target: pick });

  assert.equal(document.getElementById(`payRows_${KEY}`)?.hidden, true, 'the rows are hidden again');
  assert.equal(document.querySelector('.weaveEx[data-field="pin"]'), null, 'and the picture is gone');
  assert.ok(
    posted.some((m) => (m as { type?: string }).type === 'paymentClose'),
    'and the host is told, so a phrase’s buffers are released too',
  );
});

test('a stale answer for a method the picker no longer shows paints nothing', () => {
  const { document, window } = page();
  // The person moved the picker on while the host was answering the previous method.
  document.getElementById(`pick_${KEY}`)!.value = SHUFFLE_CODES[7];

  window.deliver(reading());

  assert.equal(document.querySelector('.weaveEx[data-field="pin"]'), null, 'no picture for a dropped answer');
  // The companion: with the picker back on the answered method, the very same message DOES paint —
  // so the assertion above is about the guard rather than about a page that paints nothing at all.
  document.getElementById(`pick_${KEY}`)!.value = CODE;
  window.deliver(reading());
  assert.ok(document.querySelector('.weaveEx[data-field="pin"]') !== null, 'and the guard is the reason');
});

test('the picture under a WRONG method is shaped exactly like one under the right method', () => {
  // The property the whole scheme rests on: a wrong method answers in the same shape as a right one.
  const right = page();
  const wrong = page();

  right.window.deliver(reading());
  wrong.window.deliver(reading({ first: [...'2317'], second: [...'9481'] }));

  const shapeOf = (document: MiniDocument): string => {
    const block = document.querySelector('.weaveEx[data-field="pin"]');
    return `${block!.querySelectorAll('.exTok.first').length}/${block!.querySelectorAll('.exTok.second').length}`;
  };
  assert.equal(shapeOf(right.document), shapeOf(wrong.document), 'same counts, same columns');
});

/**
 * The assembly, asserted the way the form's is: painter first, exactly once.
 *
 * <p>Issue #51 was two copies of the painter. This page now inlines it too, so the same claim has to
 * hold here — and a sub-script that referenced it without it being defined would throw at the first
 * reading rather than paint something nobody can read.</p>
 */
test('the viewer inlines the painter exactly ONCE, ahead of everything that calls it', () => {
  const script = viewWeaveScripts();

  assert.equal(script.split('function paintExample(').length - 1, 1, 'one definition');
  assert.ok(
    script.indexOf('function paintExample(') < script.indexOf('payPicture(msg.key, msg)'),
    'and it is defined before the line that calls it',
  );
  assert.equal(script.split('function payPicture(').length - 1, 1, 'one picture fragment too');
  assert.match(script, /querySelector\('\[data-woven-host\]'\)/, 'the card script is in here as well');
});
