import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FieldReading } from '../fieldReading';
import type { SecretRefField } from '../secretRef';
import { EntityMetadata } from '../types';
import { ACCOUNT, clickVscode, locked, memoryStorage, seedEntry, sinks } from './pinWorld';
import { loadWithVscode } from './vscodeStub';

/**
 * What a `creds://` reference reads — D7 of the entry-PIN plan, over the real vault.
 *
 * <p>A reference is resolved by nobody in particular: a terminal, a config, an agent's command line.
 * So it is automatic, and a protected entry's value must come back WITHHELD with the sentence — never
 * as the envelope, and never as "absent". Until 1.12 the note of a protected entry resolved to its
 * envelope, and its one-time code read as "there is no seed".</p>
 */

const SEED = 'otpauth://totp/GitHub:me?secret=JBSWY3DPEHPK3PXP&issuer=GitHub';

async function read(field: SecretRefField, slots: Record<string, string>, pinProtected: boolean): Promise<FieldReading> {
  const s = sinks();
  const stub = clickVscode([], s);
  const storage = memoryStorage(stub);
  const details = { id: 'e1', name: 'prod', kind: 'credential', isSshEnabled: false, pinProtected } as EntityMetadata;
  await seedEntry(storage, details, slots);
  const { entityFieldReading } = loadWithVscode<typeof import('../entityFieldReading')>('../entityFieldReading', stub);
  const reading = await entityFieldReading(storage, ACCOUNT, 'e1', field);
  assert.equal(s.boxes, 0, 'a reference never prompts');
  return reading;
}

test('a creds:// reference to a protected NOTE is withheld with the PIN sentence, never the envelope', async () => {
  const reading = await read('notes', { notes: await locked('the runbook') }, true);

  assert.equal(reading.kind, 'withheld', `the note resolved to ${JSON.stringify(reading).slice(0, 60)}…`);
  assert.match(reading.kind === 'withheld' ? reading.reason : '', /"prod" is protected with its own PIN, so it cannot be used automatically/);
});

test('a creds:// reference to a protected one-time CODE is withheld, not absent', async () => {
  const reading = await read('totp', { 'one-time-code seed': await locked(SEED) }, true);

  assert.equal(reading.kind, 'withheld', 'a stored seed read as "there is no seed"');
});

test('an unprotected note and code still resolve', async () => {
  assert.deepEqual(await read('notes', { notes: 'the runbook' }, false), { kind: 'value', value: 'the runbook' });
  const code = await read('totp', { 'one-time-code seed': SEED }, false);
  assert.match(code.kind === 'value' ? code.value : '', /^\d{6}$/);
});
