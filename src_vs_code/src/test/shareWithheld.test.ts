import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EntityMetadata } from '../types';
import { ACCOUNT, PIN, clickVscode, locked, memoryStorage, seedEntry, sinks } from './pinWorld';

/**
 * The share's "not sent" notice for a PIN-protected entry — D9 of the entry-PIN plan.
 *
 * <p>The notice is computed from what the entry HOLDS. It read the record through the typed getters,
 * which keep only the keys they know, so a protected card's record read as `{}` and the payment
 * record as its envelope: the sender of a protected card was told nothing was withheld while its CVV
 * and its second values were. The share has already admitted the entry by then, so the notice opens
 * the records with the grant that door left — silently, because a second box about the same entry a
 * moment later would be a question the person already answered.</p>
 */

const CARD = { number: '4111111111111111', cvv: '123', pin: '4321' };

test('sharing a protected card still names the CVV, the PIN and the second values as withheld', async () => {
  const storage = memoryStorage(clickVscode([], sinks()));
  const details = { id: 'p1', name: 'orest payoneer', kind: 'payment', isPayment: true, isSshEnabled: false, pinProtected: true } as EntityMetadata;
  await seedEntry(storage, details, { 'payment details': await locked(JSON.stringify(CARD)), 'second values': await locked('{"cvv2":"999"}') });
  const { withheldNoteFor } = require('../shareWithheld') as typeof import('../shareWithheld');
  // What the share's door leaves behind.
  (require('../pinSession') as typeof import('../pinSession')).grantPin(ACCOUNT, 'p1', PIN);

  const note = await withheldNoteFor(storage, ACCOUNT, [{ node: { id: 'p1', name: 'orest payoneer', details } }]);

  for (const name of ['cvv', 'pin', 'Second CVV']) {
    assert.ok(note.includes(name), `the notice does not name ${name}: "${note}"`);
  }
  assert.ok(!note.includes('123') && !note.includes('999'), 'names, never values');
});

test('without the grant nothing is asked for — the notice is computed from what opens, silently', async () => {
  const s = sinks();
  const storage = memoryStorage(clickVscode([], s));
  const details = { id: 'p1', name: 'orest payoneer', kind: 'payment', isPayment: true, isSshEnabled: false, pinProtected: true } as EntityMetadata;
  await seedEntry(storage, details, { 'payment details': await locked(JSON.stringify(CARD)) });
  const { withheldNoteFor } = require('../shareWithheld') as typeof import('../shareWithheld');

  const note = await withheldNoteFor(storage, ACCOUNT, [{ node: { id: 'p1', name: 'orest payoneer', details } }]);

  assert.equal(s.boxes, 0);
  assert.ok(!note.includes('lock'), 'an envelope never reaches the notice');
});
