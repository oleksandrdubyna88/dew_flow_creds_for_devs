import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeUnattended } from '../entryWriter';
import { sealingForNew, unattendedSealing } from '../sealingAtWrite';
import { EntityMetadata } from '../types';
import { ACCOUNT, clickVscode, locked, memoryStorage, seedEntry, sinks } from './pinWorld';

/**
 * The proofs a write needs (`PLAN_typed_stored_secrets.md` §2.4, T4) — the constructors of a `Sealing`
 * that are not the interactive re-read: a brand-new entry's (`sealingForNew`) and an unattended write's
 * (`unattendedSealing`), over the real `StorageManager`.
 *
 * <p>The unattended one is the rule the first plan gate's finding 0 wrote: nothing automatic holds a
 * PIN, so on an entry that is protected — by a sealed slot OR by the mark alone — the proof permits
 * nothing, and says why in the PIN sentence; it is never `sealed`.</p>
 */

const entry = (over: Partial<EntityMetadata> = {}): EntityMetadata =>
  ({ id: 'db1', name: 'prod db', kind: 'db', isSshEnabled: false, ...over }) as EntityMetadata;

async function vaultWith(details: EntityMetadata, slots: Record<string, string>): Promise<ReturnType<typeof memoryStorage>> {
  const storage = memoryStorage(clickVscode([], sinks()));
  await seedEntry(storage, details, slots);
  return storage;
}

test('the unattended sealing of an entry with a sealed slot is stopped, with the PIN sentence', async () => {
  const storage = await vaultWith(entry(), { 'database connection': await locked('postgres://u:p@h/db'), password: 'hunter2' });

  const sealing = await unattendedSealing(storage, ACCOUNT, { id: 'db1', name: 'prod db' });

  assert.equal(sealing.kind, 'stopped', 'an unattended write was permitted into an entry with a sealed slot');
  assert.match(sealing.kind === 'stopped' ? sealing.reason : '', /"prod db" is protected with its own PIN, so it cannot be used automatically/);
});

test('the unattended sealing of an entry with the mark alone is stopped — every slot in the clear changes nothing', async () => {
  const storage = await vaultWith(entry({ pinProtected: true }), { password: 'hunter2' });

  const sealing = await unattendedSealing(storage, ACCOUNT, { id: 'db1', name: 'prod db' });

  assert.equal(sealing.kind, 'stopped', 'an unattended write was permitted into an entry that claims a PIN');
  assert.match(sealing.kind === 'stopped' ? sealing.reason : '', /protected with its own PIN/);
});

test('the unattended sealing of a plain, unmarked entry is plain — and no unattended sealing is ever sealed', async () => {
  const plain = await unattendedSealing(await vaultWith(entry(), { password: 'hunter2' }), ACCOUNT, { id: 'db1', name: 'prod db' });

  assert.equal(plain.kind, 'plain', 'the positive: an ordinary entry can still be written unattended');
  const answers = [
    plain,
    await unattendedSealing(await vaultWith(entry(), { password: await locked('x') }), ACCOUNT, { id: 'db1', name: 'prod db' }),
    await unattendedSealing(await vaultWith(entry({ pinProtected: true }), {}), ACCOUNT, { id: 'db1', name: 'prod db' }),
  ];
  assert.deepEqual(answers.filter((one) => one.kind === 'sealed'), [], 'nothing automatic holds a PIN');
});

test('a new entry\'s sealing is plain when the folder asks nothing, sealed with the folder\'s PIN, and stopped when the PIN was not settled', () => {
  assert.equal(sealingForNew({ kind: 'none' }).kind, 'plain');
  const sealed = sealingForNew({ kind: 'pin', pin: '2468' });
  assert.deepEqual([sealed.kind, sealed.kind === 'sealed' ? sealed.pin : ''], ['sealed', '2468']);
  assert.equal(sealingForNew({ kind: 'cancelled' }).kind, 'stopped');
});

test('an unattended write (the rotation\'s store) into a protected entry is refused with the PIN sentence and writes nothing; a plain one is written', async () => {
  const written: string[] = [];
  const guarded = memoryStorage(clickVscode([], sinks()), written);
  await seedEntry(guarded, entry({ pinProtected: true }), { password: 'hunter2' });
  written.length = 0;

  await assert.rejects(
    writeUnattended(guarded, ACCOUNT, { id: 'db1', name: 'prod db' }, (writer) => writer.setPassword(ACCOUNT, 'db1', 'rotated-1')),
    /"prod db" is protected with its own PIN, so it cannot be used automatically.* Nothing was stored\./,
  );
  assert.deepEqual(written, [], 'the rotated value reached the keychain');

  const plain = await vaultWith(entry(), { password: 'hunter2' });
  await writeUnattended(plain, ACCOUNT, { id: 'db1', name: 'prod db' }, (writer) => writer.setPassword(ACCOUNT, 'db1', 'rotated-2'));
  assert.equal(await plain.getPassword(ACCOUNT, 'db1'), 'rotated-2', 'the positive: an unprotected entry is rotated');
});
