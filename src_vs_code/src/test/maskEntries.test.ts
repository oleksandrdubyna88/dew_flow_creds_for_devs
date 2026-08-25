import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SecretSource, maskEntriesFor } from '../maskEntries';
import { EntityMetadata } from '../types';
import { buildMaskTable, maskText, placeholderFor } from '../secretMasker';

/**
 * What goes into the mask table, and — as much as the point — what does not: the table is
 * built from ONE entity, the one the grant points at. A table over the whole vault would put
 * a keychain read per secret on every agent call, which is the cost 0.57.0 removed elsewhere.
 */

interface Stub extends SecretSource {
  reads: string[];
}

function source(
  secrets: Partial<Record<'password' | 'privateKey' | 'vpnConfig' | 'dbConnection' | 'notes', string>>,
  details?: Partial<EntityMetadata>,
): Stub {
  const reads: string[] = [];
  const read = (name: keyof typeof secrets) => (accountId: string, entityId: string) => {
    reads.push(`${name}:${accountId}:${entityId}`);
    return Promise.resolve(secrets[name]);
  };
  return {
    reads,
    getNode: () => ({
      details: { id: 'e1', name: 'prod-db', isSshEnabled: false, ...details } as EntityMetadata,
    }),
    getPassword: read('password'),
    getPrivateKey: read('privateKey'),
    getVpnConfig: read('vpnConfig'),
    getDbConnection: read('dbConnection'),
    getNotes: read('notes'),
  };
}

test('every stored secret of the entity becomes an entry, with a field label', async () => {
  const stub = source({ password: 'hunter2-hunter2', notes: 'a long enough note to mask' });
  const entries = await maskEntriesFor(stub, 'a1', 'e1');

  assert.deepEqual(
    entries.map((e) => e.label).sort(),
    ['NOTES', 'PASSWORD'],
  );
  assert.equal(entries.some((e) => e.value === 'hunter2-hunter2'), true);
});

test('an env-binding name is used as the label, because that is the name the person chose', async () => {
  const stub = source(
    { password: 'hunter2-hunter2' },
    { envBindings: { password: 'PROD_DB_PASSWORD' } },
  );
  const entries = await maskEntriesFor(stub, 'a1', 'e1');

  assert.equal(entries[0].label, 'PROD_DB_PASSWORD');
  const masked = maskText('pw=hunter2-hunter2', buildMaskTable(entries));
  assert.equal(masked.text, `pw=${placeholderFor('PROD_DB_PASSWORD')}`);
});

test('the password inside a connection string is masked on its own too', async () => {
  // A client prints the password by itself (PGPASSWORD, its own error text), not only as
  // part of the URL it was parsed from.
  const stub = source({ dbConnection: 'postgres://u:p%40ssw0rd-long@host:5432/db' });
  const entries = await maskEntriesFor(stub, 'a1', 'e1');
  const table = buildMaskTable(entries);

  assert.equal(maskText('psql: FATAL password "p@ssw0rd-long" failed', table).hits, 1);
  assert.equal(maskText('DSN=postgres://u:p%40ssw0rd-long@host:5432/db', table).hits >= 1, true);
});

test('a connection string that is not a URL yields no extra entry and does not throw', async () => {
  const stub = source({ dbConnection: 'Server=tcp:host,1433;User Id=sa;Password=verysecret1' });
  const entries = await maskEntriesFor(stub, 'a1', 'e1');

  assert.equal(entries.length, 1, 'the string itself, and nothing derived from a failed parse');
  assert.equal(entries[0].label, 'DB_CONNECTION');
});

test('absent and empty secrets contribute nothing', async () => {
  const stub = source({ password: '', privateKey: undefined });
  assert.deepEqual(await maskEntriesFor(stub, 'a1', 'e1'), []);
});

test('exactly one entity is read — never the vault', async () => {
  // The guard against the obvious wrong design. Five reads, all for the grant's own entity.
  const stub = source({ password: 'hunter2-hunter2' });
  await maskEntriesFor(stub, 'a1', 'e1');

  assert.equal(stub.reads.length, 5);
  assert.equal(stub.reads.every((r) => r.endsWith(':a1:e1')), true, stub.reads.join(', '));
});
