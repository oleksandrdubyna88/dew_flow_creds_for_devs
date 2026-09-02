import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FORM_SECTIONS, colorCollisionsForKind, sectionsForKind } from '../formSections';
import { PAYMENT_FORMS } from '../paymentForm';

/**
 * The card form: a section that appears for `payment`, and a card fieldset inside it that appears
 * only for the card FORM.
 *
 * <p>Two levels of visibility, and the mechanism for the second already exists — `keySection` is the
 * precedent, hidden by `condition` when an SSH connection borrows another entry's key. The plan says
 * to use it rather than invent a second ladder, and the show/hide script is generated from
 * `FORM_SECTIONS`, so a correct entry here needs no change to `formVisibilityScript.ts` at all.</p>
 */

function sectionById(id: string) {
  const found = FORM_SECTIONS.find((section) => section.id === id);
  assert.ok(found !== undefined, `${id} is not in the catalog`);
  return found;
}

test('a payment entry gets the form selector, and only a payment entry does', () => {
  const forPayment = sectionsForKind('payment').map((s) => s.id);
  assert.ok(forPayment.includes('paymentSection'), 'the selector is there for a payment');

  for (const kind of ['credential', 'ssh', 'db', 'config'] as const) {
    assert.ok(
      !sectionsForKind(kind).includes(sectionById('paymentSection')),
      `${kind} must not be offered a payment form`,
    );
  }
});

test('the card fieldset is gated on the FORM, not on the kind', () => {
  // The distinction that makes this two sections instead of one: every payment has a form selector,
  // and only a card has card fields. Bank details and a phrase are the same kind and must not see
  // a CVV box.
  const card = sectionById('cardSection');
  assert.deepEqual(card.kinds, ['payment'], 'the kind narrows it first');
  assert.equal(card.condition, "val('paymentForm') === 'card'", 'and the form narrows it second');
});

test('the selector itself has no condition, or a payment could not choose its form', () => {
  assert.equal(sectionById('paymentSection').condition, undefined);
});

test('no two sections a payment entry can show at once wear the same colour', () => {
  // The property the whole scheme rests on, and the one thing adding a section most easily breaks.
  assert.deepEqual(colorCollisionsForKind('payment'), []);
});

test('adding the payment sections broke no other kind’s colours', () => {
  const broken = (['credential', 'ssh', 'sshkey', 'vpn', 'db', 'terminal', 'script', 'config'] as const).flatMap(
    (kind) => colorCollisionsForKind(kind),
  );
  assert.deepEqual(broken, []);
});

test('every payment form the model knows can actually be chosen', () => {
  // The selector and the model are one thing or they are two things that will drift: a form with no
  // option is a form nobody can pick, and an option with no form is one nothing can store.
  assert.deepEqual([...PAYMENT_FORMS].sort(), ['bank', 'card', 'phrase']);
});
