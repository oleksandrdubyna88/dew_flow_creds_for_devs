import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  StoredAccount,
  TeamMember,
  isBackupBundle,
  isEntityMetadata,
  teamOthers,
} from '../types';

const entity = {
  id: 'e1',
  name: 'prod key',
  isSshEnabled: false,
  isSshKey: true,
  publicKey: 'ssh-ed25519 AAAA... user@host',
  sshKeyEntityId: 'e2',
};

test('accepts entity metadata with key fields and the SSH-key flag', () => {
  assert.ok(isEntityMetadata(entity));
  assert.ok(isEntityMetadata({ id: 'e', name: 'n', isSshEnabled: false }));
});

test('rejects entity metadata with wrongly typed key fields', () => {
  assert.equal(isEntityMetadata({ ...entity, isSshKey: 'yes' }), false);
  assert.equal(isEntityMetadata({ ...entity, publicKey: 42 }), false);
  assert.equal(isEntityMetadata({ ...entity, sshKeyEntityId: 7 }), false);
});

test('accepts backup bundles with and without privateKeys (pre-0.5 compat)', () => {
  const nodes = [{ id: 'e1', name: 'prod key', type: 'entity', details: entity }];
  assert.ok(isBackupBundle({ nodes, passwords: { e1: 'pw' } }));
  assert.ok(isBackupBundle({ nodes, passwords: {}, privateKeys: { e1: '-----BEGIN...' } }));
  assert.equal(isBackupBundle({ nodes, passwords: {}, privateKeys: { e1: 5 } }), false);
});

// --- who belongs in a team list ---------------------------------------------

test('a team list does not offer you the very account you are looking at', () => {
  const me: StoredAccount = { accountId: 'a-1', email: 'me@corp.com', provider: 'microsoft' };
  const members: TeamMember[] = [
    member(me, true),
    member({ accountId: 'b-1', email: 'colleague@corp.com', provider: 'microsoft' }, false),
  ];

  const shown = teamOthers(me, members);

  assert.deepEqual(shown.map((m: TeamMember) => m.account.email), ['colleague@corp.com']);
});

test('your OTHER accounts stay, because sharing between your own vaults is a real thing', () => {
  const work: StoredAccount = { accountId: 'a-1', email: 'me@corp.com', provider: 'microsoft' };
  const personal: StoredAccount = { accountId: 'a-2', email: 'me@gmail.com', provider: 'google' };
  const members = [member(work, true), member(personal, true)];

  const shown = teamOthers(work, members);

  assert.deepEqual(shown.map((m: TeamMember) => m.account.email), ['me@gmail.com']);
  assert.equal(shown[0].isSelf, true, 'it is still yours, and the UI still says so');
});

test('the same email on two providers is two accounts, not one', () => {
  const microsoft: StoredAccount = { accountId: 'a-1', email: 'me@corp.com', provider: 'microsoft' };
  const google: StoredAccount = { accountId: 'a-2', email: 'me@corp.com', provider: 'google' };

  const shown = teamOthers(microsoft, [member(microsoft, true), member(google, true)]);

  assert.equal(shown.length, 1, 'matching on the email alone would hide a legitimate target');
  assert.equal(shown[0].account.provider, 'google');
});

test('the server transport, which keys members by email, is matched too', () => {
  // ServerTransport builds members with accountId = the email, so the ids do not line
  // up with the local account's own id and only email+provider can match.
  const me: StoredAccount = { accountId: 'local-guid-1', email: 'me@corp.com', provider: 'microsoft' };
  const asTheServerSeesMe: StoredAccount = {
    accountId: 'me@corp.com',
    email: 'me@corp.com',
    provider: 'microsoft',
  };

  const shown = teamOthers(me, [member(asTheServerSeesMe, true)]);

  assert.deepEqual(shown, []);
});

test('email comparison ignores case, because identity providers do not agree on it', () => {
  const me: StoredAccount = { accountId: 'a-1', email: 'Me@Corp.com', provider: 'microsoft' };
  const shouted: StoredAccount = { accountId: 'x', email: 'ME@CORP.COM', provider: 'microsoft' };

  assert.deepEqual(teamOthers(me, [member(shouted, true)]), []);
});

test('an empty team stays empty', () => {
  const me: StoredAccount = { accountId: 'a-1', email: 'me@corp.com', provider: 'microsoft' };
  assert.deepEqual(teamOthers(me, []), []);
});

function member(account: StoredAccount, isSelf: boolean): TeamMember {
  return { account, location: '/nas', shareKeyId: account.accountId, isSelf };
}
