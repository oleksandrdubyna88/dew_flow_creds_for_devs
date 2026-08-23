import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BackupError, encryptJson } from '../cryptoUtils';
import {
  envelopeWithShares,
  openShare,
  resolveShares,
  sealShare,
  sharesFromEnvelope,
} from '../shareFormat';
import { SharePayload, StoredAccount } from '../types';

const NOW = 1_800_000_000_000;
const admin: StoredAccount = { accountId: 'admin-1', email: 'admin@x', provider: 'microsoft' };
const user: StoredAccount = { accountId: 'user-1', email: 'user@x', provider: 'google' };

function payload(name: string): SharePayload {
  return {
    node: {
      id: `id-${name}`,
      name,
      type: 'entity',
      parentId: null,
      details: { id: `id-${name}`, name, isSshEnabled: false, isDb: true, dbType: 'mysql' },
    },
    secrets: { dbConnection: 'mysql://u:p@h/db' },
  };
}

test('share round-trips with the recipient key id + PIN', () => {
  const item = sealShare(payload('orchestrator'), user.accountId, admin, '1234', NOW);
  assert.equal(item.entityName, 'orchestrator');
  assert.equal(item.entityKind, 'db');
  assert.equal(item.fromEmail, 'admin@x');
  const opened = openShare(item, user.accountId, '1234');
  assert.equal(opened.secrets.dbConnection, 'mysql://u:p@h/db');
});

test('a share is bound to the recipient: same PIN, other key id fails', () => {
  const item = sealShare(payload('x'), user.accountId, admin, '1234', NOW);
  assert.throws(() => openShare(item, 'someone-else', '1234'), BackupError);
  assert.throws(() => openShare(item, user.accountId, 'wrong'), BackupError);
});

test('server transport binds to the email instead of the account id', () => {
  // The vault server exposes emails, so shares are sealed to the email.
  const item = sealShare(payload('srv'), user.email, admin, 'pin', NOW);
  assert.equal(openShare(item, user.email, 'pin').node.name, 'srv');
  assert.throws(() => openShare(item, user.accountId, 'pin'), BackupError);
});

test('shares append into a vault envelope and read back; payload untouched', () => {
  const vault = encryptJson({ nodes: [], passwords: {} }, user.accountId + 'ownpin', user);
  const item = sealShare(payload('a'), user.accountId, admin, 'p', NOW);
  const withShare = envelopeWithShares(vault, (current) => [...current, item]);
  assert.equal(sharesFromEnvelope(withShare).length, 1);
  // owner's encrypted payload fields are carried verbatim
  const before = JSON.parse(vault) as Record<string, string>;
  const after = JSON.parse(withShare) as Record<string, string>;
  for (const f of ['salt', 'iv', 'tag', 'data']) {
    assert.equal(after[f], before[f]);
  }
  const removed = envelopeWithShares(withShare, (current) =>
    current.filter((s) => s.id !== item.id),
  );
  assert.equal(sharesFromEnvelope(removed).length, 0);
});

test('folderPath survives the share round-trip', () => {
  const p = payload('in-folder');
  p.folderPath = [{ name: 'db', folderType: 'db' }, { name: 'prod' }];
  const item = sealShare(p, user.accountId, admin, 'pin', NOW);
  const opened = openShare(item, user.accountId, 'pin');
  assert.deepEqual(opened.folderPath, [{ name: 'db', folderType: 'db' }, { name: 'prod' }]);
});

test('resolveShares opens what the known PINs unlock and keeps the rest', () => {
  const owned = (name: string, pin: string) => ({
    accountId: user.accountId,
    shareKeyId: user.accountId,
    item: sealShare(payload(name), user.accountId, admin, pin, NOW),
  });
  const a = owned('a', 'pin1');
  const b = owned('b', 'pin2');
  const c = owned('c', 'pin1');

  const round1 = resolveShares([a, b, c], ['pin1']);
  assert.deepEqual(round1.opened.map((o) => o.item.entityName).sort(), ['a', 'c']);
  assert.deepEqual(round1.remaining.map((o) => o.item.entityName), ['b']);

  const round2 = resolveShares(round1.remaining, ['pin1', 'pin2']);
  assert.equal(round2.opened.length, 1);
  assert.equal(round2.remaining.length, 0);
});
