import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { MiniDocument, MiniElement, runFragment } from './miniDom';
import { HOST_CHK, McpPageOptions, chooseAsk, elementAt, mcpPage } from './mcpFormFixture';
import { mcpSwitchScript } from '../mcpSwitchScript';
import { jsonForScript } from '../webviewHtml';
import { readMcpAccess } from '../mcpAccess';
import type { McpAccess } from '../mcpAccess';

/**
 * The Agent-access page script, RUN rather than read (#95, S3.1).
 *
 * <p>What it decides is which of TWO axes a save writes: the permission ladder and the consent
 * cadence. Emitting one because the other was touched is the regression the whole per-axis model
 * exists to prevent — a folder handed an all-off ladder because somebody chose a cadence is a
 * folder whose children have silently stopped inheriting rights from above, and nothing on screen
 * would say so.</p>
 *
 * <p>Run, because a test that matched this fragment's SOURCE would pass for a fragment that never
 * executes; `miniDom.ts` exists for exactly that lesson. The fixture's ids come from the same two
 * lists the markup is built from, so a control renamed in one place cannot leave this file testing
 * a page that no longer exists.</p>
 */

interface Page {
  document: MiniDocument;
  collect: () => unknown;
  box: (id: string) => MiniElement;
}

/** The markup from `mcpFormFixture`, with this script running over it. */
function page(mcp: McpAccess | undefined, options: McpPageOptions = {}): Page {
  const document = mcpPage(mcp, options);
  const lifted = runFragment(`${HOST_CHK}\n${mcpSwitchScript(mcp)}`, document, ['collectMcp']);
  return {
    document,
    collect: () => lifted.collectMcp(),
    box: (id: string) => elementAt(document, id),
  };
}

function choose(page: Page, value: string): void {
  chooseAsk(page.document, value);
}

function tick(page: Page, id: string): void {
  page.box(id).checked = true;
  page.box(id).fire('change');
}

/** The posted object as a record, or a failure naming what came back instead. */
function posted(value: unknown): Record<string, unknown> {
  assert.ok(typeof value === 'object' && value !== null, `nothing was posted: ${String(value)}`);
  return value as Record<string, unknown>;
}

test('each choice posts its own value, and Inherit posts null', () => {
  // The mapping, one row per control. A test that asserted only "a policy was posted" would pass
  // for a page that serialized `always` whichever radio was picked — and the person would get a
  // different consent cadence from the one they chose.
  for (const [value, expected] of [
    ['always', 'always'],
    ['every12h', 'every12h'],
    ['never', 'never'],
    ['inherit', null],
  ] as const) {
    const one = page(undefined);
    choose(one, value);

    assert.equal(posted(one.collect()).ask, expected, `choosing ${value}`);
  }
});

test('touching only a radio on an inheriting record posts a policy and NO ladder', () => {
  // The regression this pair of flags exists for. A ladder emitted here is an all-off ladder — a
  // folder that has decided "nothing", which stops every entry beneath it inheriting from above.
  const one = page(undefined);

  choose(one, 'never');
  const out = posted(one.collect());

  assert.equal(out.ask, 'never');
  assert.equal(out.view, undefined, 'a ladder was written because a cadence was chosen');
  assert.deepEqual(Object.keys(out), ['ask']);
  assert.deepEqual(readMcpAccess(out), { ask: 'never' }, 'and the reader sees a policy-only record');
});

test('touching only a switch posts a ladder and NO policy', () => {
  const one = page(undefined);

  tick(one, 'mcpView');
  const out = posted(one.collect());

  assert.equal(out.view, true);
  assert.ok(!('ask' in out), 'a cadence was written because a switch was ticked');
});

test('choosing Inherit posts ask: null, which is what takes a policy back', () => {
  // `undefined` would be DROPPED by JSON.stringify, and a key that never arrives is
  // indistinguishable from one nobody touched — the answer would never be taken back.
  const one = page({ ask: 'never' }, { checked: 'never' });

  choose(one, 'inherit');
  const out = posted(one.collect());

  assert.equal(out.ask, null);
  assert.ok('ask' in out, 'the key has to survive the wire for the reader to see it');
  assert.equal(readMcpAccess(out), undefined, 'and the reader turns it back into no record at all');
});

test('a form opened on a decided ladder keeps posting it when only the policy is touched', () => {
  // Opening a form must not silently narrow what is already stored.
  // The fixture ticks them from the record, exactly as the markup does.
  const one = page({ view: true, use: true });

  choose(one, 'every12h');
  const out = posted(one.collect());

  assert.equal(out.view, true, 'the stored ladder was dropped by a save that only chose a cadence');
  assert.equal(out.use, true);
  assert.equal(out.ask, 'every12h');
});

test('nothing touched and nothing decided posts undefined', () => {
  // An inheriting folder opened and saved unchanged stays inheriting. This is the oldest
  // guarantee in this script and the two flags must not have cost it.
  assert.equal(page(undefined).collect(), undefined);
});

test('a page with NO radios keeps the policy the record already had', () => {
  // The entity form until S3.2: a decided cadence, and no control offering to change it. Answering
  // `null` here would take back a policy the person was never shown, on a save about something
  // else entirely.
  const one = page({ view: true, ask: 'never' }, { radios: false });

  const out = posted(one.collect());

  assert.equal(out.ask, 'never', 'a form with no control for it silently cleared the policy');
  assert.equal(out.view, true);
});

test('a page with no radios never marks the policy touched', () => {
  // With nothing decided and no control, a save writes no policy at all — not `null`, which the
  // reader would read as an answer being taken back.
  const one = page(undefined, { radios: false });

  tick(one, 'mcpView');
  const out = posted(one.collect());

  assert.ok(!('ask' in out), 'a page that never offered the choice wrote one anyway');
});

test('a stored cadence that is not one of the three words cannot close the script tag', () => {
  // The type says `McpAskPolicy`; the VALUE comes off a vault record that arrived by sync or by
  // import, so "our own user typed it" is not an argument. `JSON.stringify` escapes quotes and
  // leaves `</script>` alone — which ends the inline script tag and parses the rest as markup.
  // Built with JSON.parse rather than a cast: a fixture that lies to the compiler proves nothing.
  const record: McpAccess = JSON.parse('{"ask":"</script><img src=x onerror=alert(1)>"}');

  const script = mcpSwitchScript(record);

  assert.ok(!script.includes('</script>'), 'the fragment carries a tag that ends its own script');
  assert.ok(
    script.includes(jsonForScript(record.ask)),
    'the sanctioned escaper was not used, so a stored tag reached the page raw',
  );
});
