import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pinState } from '../generalNotes';
import { EntityMetadata } from '../types';

/**
 * D17 of the entry-PIN plan — the banner the edit form shows on a protected entry must be TRUE.
 *
 * <p>It used to say two things the product did not do: that the person "was asked for it to open
 * this form" (Edit asked nothing until 1.12) and that "every secret this entry holds is wrapped"
 * (attachments and images deliberately are not — `entitySlots.ts` says why). A banner that
 * promises a protection the product does not give is worse than no banner.</p>
 */

test('the PIN banner says that Save seals what you change, and that the attachment and image are outside the PIN', () => {
  // Whitespace collapsed, as the page renders it: the source wraps the sentence across lines.
  const banner = pinState({ id: 'e', name: 'n', pinProtected: true } as EntityMetadata).replace(/\s+/g, ' ');

  assert.match(banner, /PIN — on/);
  assert.match(banner, /Saving seals every value you change under the same PIN/);
  assert.match(banner, /all but its attachment and image/, 'the two slots the wrap skips are named');
  assert.match(banner, /Remove PIN Protection…/, 'the way out is named, and it is the tree command that exists');
  assert.match(banner, /no recovery for a forgotten PIN/);
  assert.ok(!/asked for it to open this form/.test(banner), 'the old sentence about a question Edit never asked');
});

test('an entry without the mark gets no banner', () => {
  assert.equal(pinState({ id: 'e', name: 'n' } as EntityMetadata), '');
  assert.equal(pinState(undefined), '');
});
