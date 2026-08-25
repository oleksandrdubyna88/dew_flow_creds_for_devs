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

test('a key-value connection string yields its password as well as itself', async () => {
  // This test previously asserted the opposite — that a non-URL string contributed nothing
  // beyond itself — which pinned a defect as if it were the design: every MSSQL entity is
  // stored in exactly this dialect, so the one thing the extraction exists for was skipped
  // for the whole dialect.
  const stub = source({ dbConnection: 'Server=tcp:host,1433;User Id=sa;Password=verysecret1' });
  const entries = await maskEntriesFor(stub, 'a1', 'e1');

  assert.deepEqual(entries.map((e) => e.label), ['DB_CONNECTION', 'DB_PASSWORD']);
  assert.equal(entries[1].value, 'verysecret1');
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

/**
 * The password inside an MSSQL connection string.
 *
 * <p>MSSQL entities are stored in ADO key-value form — `buildDbConnectionString('mssql', …)`
 * and the form's own builder both produce `Server=…;Database=…;User Id=…;Password=…`, which is
 * also the shape people paste straight out of Azure or SSMS. It is not a URL, so the extraction
 * that finds the embedded password in `postgresql://user:pw@host/db` found nothing here and the
 * bare password was never masked — for the one dialect whose connection strings are never URLs.
 * The whole connection string was still masked, so this only showed when the password appeared
 * on its own: a client's error message, or a launcher that puts it in the environment, which is
 * exactly what `buildDbQueryLaunch` does with `SQLCMDPASSWORD`.</p>
 */
test('an MSSQL key-value connection string yields its embedded password too', async () => {
  const stub = source({
    dbConnection: 'Server=sql.example.com,1433;Database=orders;User Id=svc_app;Password=S3cret-Pa55word',
  });

  const entries = await maskEntriesFor(stub, 'a1', 'e1');

  assert.equal(
    entries.some((e) => e.value === 'S3cret-Pa55word' && e.label === 'DB_PASSWORD'),
    true,
    `the bare password must be maskable on its own: ${JSON.stringify(entries)}`,
  );
});

test('the MSSQL password is actually masked out of text that only contains the password', async () => {
  const stub = source({
    dbConnection: 'Server=sql.example.com,1433;Database=orders;User Id=svc_app;Password=S3cret-Pa55word',
  });
  const table = buildMaskTable(await maskEntriesFor(stub, 'a1', 'e1'));

  const masked = maskText('Login failed for user with password S3cret-Pa55word.', table);

  assert.equal(masked.text.includes('S3cret-Pa55word'), false, masked.text);
  assert.equal(masked.text.includes(placeholderFor('DB_PASSWORD')), true, masked.text);
});

test('a value that is neither a URL nor key-value simply adds nothing', async () => {
  // The extraction must never throw on a connection string it does not understand — a
  // malformed value means nothing extra to mask, not a broken agent call.
  const stub = source({ dbConnection: 'this is not a connection string at all' });

  const entries = await maskEntriesFor(stub, 'a1', 'e1');

  assert.deepEqual(entries.map((e) => e.label), ['DB_CONNECTION']);
});
