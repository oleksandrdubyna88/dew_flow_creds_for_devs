import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SECOND_KEYS, SECOND_LABELS } from '../secondValues';
import { SECOND_MODES, clearSecondBox, secondBox, secondModeControl, secondModeOf } from '../secondModeMarkup';

/**
 * S4 — the control that asks whose the other half is, and the box it reveals.
 *
 * <p>What these assert is mostly ABSENCE and derivation: no value is written into the markup, every
 * weave point can have a box, and the answer to "whose half is this" defaults to the safe one. The
 * behaviour — a box appearing when a mode changes, a value reaching the save — belongs to the page
 * script and its own test, because a string that says `display:none` proves nothing about a page.</p>
 */

test('an unknown answer is a DECOY, never the person’s own', () => {
  // The direction this must fail in. A page that sends a mode this build does not know, an older
  // form, a message with the field missing entirely — every one of them means "draw one", because
  // reading "own" out of nothing would weave with an empty half and refuse, or worse not refuse.
  assert.equal(secondModeOf('own'), 'own');
  assert.equal(secondModeOf('decoy'), 'decoy');
  assert.equal(secondModeOf(undefined), 'decoy');
  assert.equal(secondModeOf(''), 'decoy');
  assert.equal(secondModeOf('OWN'), 'decoy', 'and it is the exact word, not a spelling of it');
  assert.equal(secondModeOf(true), 'decoy');
  assert.deepEqual([...SECOND_MODES], ['decoy', 'own'], 'two answers, and the safe one first');
});

test('the mode control offers exactly the two answers, and says what each one costs', () => {
  const html = secondModeControl('weaveSecondMode');

  assert.ok(html.includes('id="weaveSecondMode"'), 'the id the form asked for');
  assert.equal((html.match(/<option /g) ?? []).length, 2);
  assert.ok(html.includes('value="decoy"') && html.includes('value="own"'));
  // The sentence is in the FORM, not only in the help: somebody choosing this is deciding what they
  // will have to remember, and a document they will not open is not where to tell them.
  assert.match(html, /lives inside the woven value/);
  assert.match(html, /both come back when you pick the method/);
});

test('every weave point can have a box, and each is named as a person would say it', () => {
  // Derived: a seventh weave point gets a box here the day it exists, rather than this test going
  // on asserting six.
  for (const key of SECOND_KEYS) {
    const html = secondBox(key, false);
    assert.ok(html.includes(`id="second_${key}"`), `${key} has its own box`);
    assert.ok(html.includes(`data-second="${key}"`), 'and its row is findable by the script');
    assert.ok(html.includes(SECOND_LABELS[key]), 'labelled as a person says it, not as the key');
    assert.ok(!html.includes(`>${key}<`), 'the record key is never shown');
  }
});

test('a box is a password box, so a shoulder does not read the second value either', () => {
  assert.match(secondBox('password2', false), /type="password"/);
  assert.match(secondBox('cvv2', false), /spellcheck="false"/);
  assert.match(secondBox('cvv2', false), /autocomplete="off"/);
});

test('hidden is the FORM’s decision, and the box carries no value either way', () => {
  const shown = secondBox('iban2', false);
  const hidden = secondBox('iban2', true);

  assert.match(hidden, /style="display:none"/);
  assert.match(shown, /style="display:"/);
  for (const html of [shown, hidden]) {
    assert.ok(!html.includes('value='), 'nothing stored is ever written into the markup');
  }
});

test('the CLEAR box is offered only when there is something to clear', () => {
  // An empty box means "keep what is stored" — the rule an empty password box already follows — so
  // deleting a second value has to be something a person says rather than something they omit.
  assert.equal(clearSecondBox('password2', false), '', 'nothing stored, nothing to offer');

  const offered = clearSecondBox('password2', true);
  assert.ok(offered.includes('id="clearSecond_password2"'));
  assert.match(offered, /Clear the stored second password/);
});

test('no control writes a backtick into a page, which would end the template literal it lands in', () => {
  // This has broken the build three times in this repository, and every one of them was a comment
  // or a sentence rather than code. These strings are pasted into a page's template literal.
  const every = [
    secondModeControl('x'),
    ...SECOND_KEYS.flatMap((key) => [secondBox(key, false), clearSecondBox(key, true)]),
  ].join('');

  assert.ok(!every.includes('`'), 'no backtick');
  assert.ok(!every.includes('${'), 'and no unintended interpolation either');
});
