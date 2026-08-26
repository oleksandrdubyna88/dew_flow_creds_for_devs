import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SECRET_REF_FIELDS,
  RefSource,
  findSecretRefs,
  parseSecretRef,
  resolveSecretRefs,
} from '../secretRef';

test('a well-formed reference parses into account, entity path and field', () => {
  const ref = parseSecretRef('creds://work@corp.com/prod-db/password');
  assert.deepEqual(ref, { account: 'work@corp.com', entityPath: ['prod-db'], field: 'password' });
});

test('a folder path in the entity segment is kept as segments', () => {
  const ref = parseSecretRef('creds://me@x.io/Servers/EU/gateway/privateKey');
  assert.deepEqual(ref, { account: 'me@x.io', entityPath: ['Servers', 'EU', 'gateway'], field: 'privateKey' });
});

test('percent-encoding in a segment is decoded', () => {
  const ref = parseSecretRef('creds://me@x.io/prod%20db/dbPassword');
  assert.deepEqual(ref?.entityPath, ['prod db']);
});

test('every documented field is accepted and nothing else', () => {
  for (const field of SECRET_REF_FIELDS) {
    assert.notEqual(parseSecretRef(`creds://a@b.c/e/${field}`), undefined, field);
  }
  assert.equal(parseSecretRef('creds://a@b.c/e/salary'), undefined, 'an unknown field is refused');
});

test('malformed references are refused rather than half-parsed', () => {
  assert.equal(parseSecretRef('creds://a@b.c/password'), undefined, 'no entity segment');
  assert.equal(parseSecretRef('creds:///e/password'), undefined, 'no account');
  assert.equal(parseSecretRef('https://a@b.c/e/password'), undefined, 'wrong scheme');
  assert.equal(parseSecretRef('creds://a@b.c/e/'), undefined, 'empty field');
  assert.equal(parseSecretRef('just a value'), undefined);
});

test('findSecretRefs pulls every reference out of a larger string, de-duplicated', () => {
  const found = findSecretRefs('Bearer creds://a@b.c/api/password and creds://a@b.c/api/password again');
  assert.deepEqual(found, ['creds://a@b.c/api/password']);
});

// ---- resolution against a fake vault ----------------------------------------

const source: RefSource = {
  accounts: () => [
    { accountId: 'w', email: 'work@corp.com' },
    { accountId: 'p', email: 'me@personal.io' },
  ],
  entities: (accountId) =>
    accountId === 'w'
      ? [
          { id: 'db1', name: 'prod-db', path: ['prod-db'] },
          { id: 's1', name: 'gw', path: ['Servers', 'gw'] },
          { id: 's2', name: 'gw', path: ['Other', 'gw'] }, // deliberately duplicate name
        ]
      : [],
  fieldValue: (accountId, entityId, field) =>
    Promise.resolve(accountId === 'w' && entityId === 'db1' && field === 'password' ? 'hunter2' : undefined),
};

test('a reference resolves to the field value by account email and entity name', async () => {
  const out = await resolveSecretRefs(['creds://work@corp.com/prod-db/password'], source);
  assert.equal(out.ok, true);
  assert.deepEqual(out.ok ? out.values : null, { 'creds://work@corp.com/prod-db/password': 'hunter2' });
});

test('a duplicate entity name is refused as ambiguous unless a folder path disambiguates', async () => {
  const ambiguous = await resolveSecretRefs(['creds://work@corp.com/gw/password'], source);
  assert.equal(ambiguous.ok, false);
  assert.match(ambiguous.ok ? '' : ambiguous.error, /ambiguous/i);

  const byPath = await resolveSecretRefs(['creds://work@corp.com/Servers/gw/password'], source);
  // The path names one entity, so it is no longer ambiguous (its field is empty here, a
  // different, clearer error than ambiguity).
  assert.equal(byPath.ok, false);
  assert.match(byPath.ok ? '' : byPath.error, /has no|empty/i);
});

test('an unknown account or entity is a distinct, named error', async () => {
  const noAccount = await resolveSecretRefs(['creds://ghost@nowhere/e/password'], source);
  assert.equal(noAccount.ok, false);
  assert.match(noAccount.ok ? '' : noAccount.error, /account/i);

  const noEntity = await resolveSecretRefs(['creds://work@corp.com/absent/password'], source);
  assert.equal(noEntity.ok, false);
  assert.match(noEntity.ok ? '' : noEntity.error, /entity|no .*absent/i);
});

test('the account match ignores case, as identity providers do', async () => {
  const out = await resolveSecretRefs(['creds://WORK@CORP.COM/prod-db/password'], source);
  assert.equal(out.ok && out.values['creds://WORK@CORP.COM/prod-db/password'], 'hunter2');
});
