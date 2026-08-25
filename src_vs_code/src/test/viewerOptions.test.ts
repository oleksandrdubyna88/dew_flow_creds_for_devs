import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dbDisplay,
  revisionSecretReader,
  secretResolver,
  storageSecretReader,
  ViewerSecretField,
} from '../viewerOptions';
import { snapshotForRevision } from '../revisionSnapshot';
import { Revision } from '../revisionHistory';
import { EntityMetadata } from '../types';

/**
 * The shared half of the two entity viewers, and the shared before-overwrite snapshot
 * (audit 2026-08-25, A1). Each used to exist twice; what is asserted here is exactly what
 * would have drifted: the field-to-secret mapping, the db display arithmetic, and the five
 * secrets a revision must capture.
 */

const FIELDS: ViewerSecretField[] = ['password', 'privateKey', 'vpnConfig', 'dbConnection', 'dbPassword'];

test('the resolver maps every viewer field, including the parsed db password', async () => {
  const reader = {
    password: () => Promise.resolve('pw'),
    privateKey: () => Promise.resolve('key'),
    vpnConfig: () => Promise.resolve('vpn'),
    dbConnection: () => Promise.resolve('postgresql://u:db-secret@h:5432/db'),
  };
  const resolve = secretResolver(reader);

  const got: Record<string, string | undefined> = {};
  for (const field of FIELDS) {
    got[field] = await resolve(field);
  }

  assert.deepEqual(got, {
    password: 'pw',
    privateKey: 'key',
    vpnConfig: 'vpn',
    dbConnection: 'postgresql://u:db-secret@h:5432/db',
    dbPassword: 'db-secret',
  });
});

test('dbPassword resolves to nothing when there is no connection string', async () => {
  const resolve = secretResolver({
    password: () => Promise.resolve(undefined),
    privateKey: () => Promise.resolve(undefined),
    vpnConfig: () => Promise.resolve(undefined),
    dbConnection: () => Promise.resolve(undefined),
  });

  assert.equal(await resolve('dbPassword'), undefined);
});

test('a revision reader answers from the record; a storage reader from the storage', async () => {
  const revision: Revision = {
    at: 1,
    name: 'old',
    details: { id: 'e1', name: 'old', isSshEnabled: false },
    secrets: { password: 'old-pw', dbConnection: 'mysql://u:x@h/db' },
  };
  const fromRevision = secretResolver(revisionSecretReader(revision));
  assert.equal(await fromRevision('password'), 'old-pw');
  assert.equal(await fromRevision('privateKey'), undefined);
  assert.equal(await fromRevision('dbPassword'), 'x');

  const asked: string[] = [];
  const storage = {
    getPassword: (a: string, id: string) => {
      asked.push(`pw:${a}:${id}`);
      return Promise.resolve('live-pw');
    },
    getPrivateKey: () => Promise.resolve(undefined),
    getVpnConfig: () => Promise.resolve(undefined),
    getDbConnection: () => Promise.resolve(undefined),
  };
  const fromStorage = secretResolver(storageSecretReader(storage as never, 'acc', 'e1'));
  assert.equal(await fromStorage('password'), 'live-pw');
  assert.deepEqual(asked, ['pw:acc:e1'], 'reads are lazy: only the asked field was read');
});

test('dbDisplay: explicit port kept, missing port becomes the type default and says so', () => {
  const explicit = dbDisplay('postgresql://u:p@h:6001/db', 'postgres');
  assert.equal(explicit.dbParts?.port, '6001');
  assert.equal(explicit.dbPortIsDefault, false);

  const defaulted = dbDisplay('postgresql://u:p@h/db', 'postgres');
  assert.equal(defaulted.dbParts?.port, '5432');
  assert.equal(defaulted.dbPortIsDefault, true);
});

test('dbDisplay never carries the password inline, but says one exists', () => {
  const withPw = dbDisplay('mysql://u:hunter2@h:3306/db', 'mysql');
  assert.equal(withPw.dbParts?.password, undefined);
  assert.equal(withPw.dbHasPassword, true);

  const none = dbDisplay(undefined, 'mysql');
  assert.deepEqual(none, { dbParts: undefined, dbPortIsDefault: false, dbHasPassword: false });
});

test('snapshotForRevision captures all five secrets of the given entity, as it is now', async () => {
  const reads: string[] = [];
  const value = (name: string) => (_a: string, id: string) => {
    reads.push(`${name}:${id}`);
    return Promise.resolve(`${name}-of-${id}`);
  };
  const storage = {
    getPassword: value('password'),
    getPrivateKey: value('privateKey'),
    getVpnConfig: value('vpnConfig'),
    getDbConnection: value('dbConnection'),
    getNotes: value('notes'),
  };
  const details: EntityMetadata = { id: 'e9', name: 'renamed already', isSshEnabled: false };

  const before = Date.now();
  const snapshot = await snapshotForRevision(storage as never, 'acc', {
    id: 'e9',
    name: 'the OLD name',
    details,
  });

  assert.equal(snapshot.name, 'the OLD name', 'history keeps the name it had then');
  assert.equal(snapshot.details, details);
  assert.ok(snapshot.at >= before);
  assert.deepEqual(snapshot.secrets, {
    password: 'password-of-e9',
    privateKey: 'privateKey-of-e9',
    vpnConfig: 'vpnConfig-of-e9',
    dbConnection: 'dbConnection-of-e9',
    notes: 'notes-of-e9',
  });
  assert.equal(reads.length, 5, 'every secret kind was read exactly once');
});
