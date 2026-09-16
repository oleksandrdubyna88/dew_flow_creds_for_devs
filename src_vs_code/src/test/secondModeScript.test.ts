import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MiniDocument, runFragment } from './miniDom';
import { secondModeScript } from '../secondModeScript';

/**
 * S4 — the page's half, RUN rather than read.
 *
 * <p>Issue #51 is why these run. Every page test here used to match the generated SOURCE, the source
 * said what it should, and the picture on screen was three grey lines; `miniDom.ts` exists so a page
 * script is executed against a document instead of being grepped. A test that asserted this fragment
 * contains the word `display` would pass for a fragment that never runs.</p>
 */

/** A form with the mode select and two rows, the way the markup emits them. */
function form(mode: string, off: readonly string[] = []): MiniDocument {
  const document = new MiniDocument();
  const picker = document.place('weaveSecondMode', 'select');
  picker.className = 'secondMode';
  picker.value = mode;
  for (const key of ['password2', 'cvv2']) {
    const row = document.place(`row_${key}`, 'div');
    row.className = 'secondRow';
    row.dataset.second = key;
    if (off.includes(key)) {
      row.dataset.secondOff = 'yes';
    }
    const input = document.place(`second_${key}`, 'input', row);
    input.value = '';
  }
  return document;
}

function displayOf(document: MiniDocument, id: string): string {
  return document.getElementById(id)?.style.display ?? '(no such row)';
}

function rowOf(document: MiniDocument, key: string): { display: string; value: string } {
  return {
    display: displayOf(document, `row_${key}`),
    value: document.getElementById(`second_${key}`)?.value ?? '(no such box)',
  };
}

test('the boxes are hidden on load when the answer is a decoy', () => {
  const document = form('decoy');

  runFragment(secondModeScript(), document, ['refreshSecondMode']);

  assert.equal(rowOf(document, 'password2').display, 'none');
  assert.equal(rowOf(document, 'cvv2').display, 'none');
});

test('and shown on load when it is already the person’s own — without waiting for a change', () => {
  // A form restored with the mode on `own` has to show its boxes immediately. Wiring the listener
  // and stopping there is the version of this that looks right in review and is empty on screen.
  const document = form('own');

  runFragment(secondModeScript(), document, ['refreshSecondMode']);

  assert.equal(rowOf(document, 'password2').display, '');
  assert.equal(rowOf(document, 'cvv2').display, '');
});

test('switching to a decoy EMPTIES the box it hides', () => {
  // The defect nobody finds: a value typed, the mode switched back, the box hidden but still read by
  // the save — and a value the person believes they discarded is woven in. The form would look
  // exactly right the whole time.
  const document = form('own');
  const lifted = runFragment(secondModeScript(), document, ['refreshSecondMode']);
  const typed = document.getElementById('second_password2');
  if (typed !== null) {
    typed.value = 'the other password';
  }

  (document.getElementById('weaveSecondMode') as { value: string }).value = 'decoy';
  lifted.refreshSecondMode?.();

  assert.deepEqual(rowOf(document, 'password2'), { display: 'none', value: '' }, 'hidden AND emptied');
});

test('a row switched off by the form stays hidden even in own mode', () => {
  // `data-second-off` is the form saying "this field is not being woven, so it has no other half".
  // The mode must not override that: a box for a field nobody is weaving is a box for nothing.
  const document = form('own', ['cvv2']);

  runFragment(secondModeScript(), document, ['refreshSecondMode']);

  assert.equal(rowOf(document, 'password2').display, '');
  assert.equal(rowOf(document, 'cvv2').display, 'none');
});

test('a page with no control at all does not throw', () => {
  // Most forms have no weave point. The fragment ships on every page, so "there is nothing here"
  // has to be an ordinary answer rather than an exception that stops every later script on the page.
  const document = new MiniDocument();

  assert.doesNotThrow(() => runFragment(secondModeScript(), document, ['refreshSecondMode']));
});

test('the fragment contains no backtick, which would end the template literal it is pasted into', () => {
  assert.ok(!secondModeScript().includes('`'));
});

/**
 * Two controls on one page, and each governs only its own fieldset.
 *
 * <p>Not decoration: the entity form carries the password's control and the payment section's, and a
 * fragment that took `querySelector('.secondMode')` would let the password's answer decide whether a
 * card's boxes are shown — and empty them when it did not.</p>
 */
function twoForms(passwordMode: string, paymentMode: string): MiniDocument {
  const document = new MiniDocument();
  for (const [id, mode, key] of [
    ['weaveSecondMode', passwordMode, 'password2'],
    ['mixSecondMode', paymentMode, 'cvv2'],
  ] as const) {
    const set = document.place(`set_${key}`, 'fieldset');
    const picker = document.place(id, 'select', set);
    picker.className = 'secondMode';
    picker.value = mode;
    const row = document.place(`row_${key}`, 'div', set);
    row.className = 'secondRow';
    row.dataset.second = key;
    document.place(`second_${key}`, 'input', row).value = '';
  }
  return document;
}

test('one form on OWN and one on decoy: each fieldset answers for itself', () => {
  const document = twoForms('own', 'decoy');

  runFragment(secondModeScript(), document, ['refreshSecondMode']);

  assert.equal(displayOf(document, 'row_password2'), '', 'the password’s box is shown');
  assert.equal(displayOf(document, 'row_cvv2'), 'none', 'and the card’s is not');
});

test('and the other way round, so neither is right by accident', () => {
  const document = twoForms('decoy', 'own');

  runFragment(secondModeScript(), document, ['refreshSecondMode']);

  assert.equal(displayOf(document, 'row_password2'), 'none');
  assert.equal(displayOf(document, 'row_cvv2'), '');
});

test('a value typed under one control is not emptied by the other one’s answer', () => {
  // The sharper half of the same defect: taking the first control would EMPTY the boxes of a form
  // whose own answer is `own`, and the person would watch what they typed disappear.
  const document = twoForms('decoy', 'own');
  const lifted = runFragment(secondModeScript(), document, ['refreshSecondMode']);
  const typed = document.getElementById('second_cvv2');
  if (typed !== null) {
    typed.value = '481';
  }

  lifted.refreshSecondMode?.();

  assert.equal(document.getElementById('second_cvv2')?.value, '481', 'still there');
});
