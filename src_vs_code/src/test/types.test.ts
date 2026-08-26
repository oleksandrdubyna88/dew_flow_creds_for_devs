import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ENTITY_KINDS,
  ENTITY_KIND_LABELS,
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

test('the totp record is optional (pre-0.57 bundles) and, when present, all strings', () => {
  const nodes = [{ id: 'e1', name: 'prod key', type: 'entity', details: entity }];
  assert.ok(isBackupBundle({ nodes, passwords: {} }));
  assert.ok(isBackupBundle({ nodes, passwords: {}, totps: { e1: 'otpauth://totp/x?secret=JBSWY3DP' } }));
  assert.equal(isBackupBundle({ nodes, passwords: {}, totps: { e1: 42 } }), false);
});

test('hasTotp is a boolean flag on the metadata — a seed can never sit there', () => {
  assert.ok(isEntityMetadata({ ...entity, hasTotp: true }));
  assert.equal(isEntityMetadata({ ...entity, hasTotp: 'otpauth://totp/x?secret=JBSWY3DP' }), false);
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

test('every entity kind has a label and an icon, so no picker can omit one', () => {
  // The folder-type picker and the form both build their lists from this table. When it
  // was three hand-written copies, adding `terminal` reached two of them and the folder
  // picker kept offering five — making the new kind uncreatable.
  for (const kind of ENTITY_KINDS) {
    const entry = ENTITY_KIND_LABELS[kind];
    assert.ok(entry, `no label for kind "${kind}"`);
    assert.ok(entry.label.length > 0, `empty label for "${kind}"`);
    assert.ok(entry.icon.length > 0, `empty icon for "${kind}"`);
  }
  assert.equal(
    Object.keys(ENTITY_KIND_LABELS).length,
    ENTITY_KINDS.length,
    'the table and the kind list must not drift',
  );
});

test('the Microsoft scope for server calls is the configured API scope, or Graph for none', () => {
  const { microsoftServerScopes } = require('../msScopes');

  // A Graph token (user.read) can NEVER be validated by the vault server — Microsoft
  // makes Graph access tokens unverifiable for third parties by design. The API scope
  // from the operator's own Entra app registration is what produces a validatable token.
  assert.deepEqual(microsoftServerScopes('api://1234/vault.access'), ['api://1234/vault.access']);
  assert.deepEqual(microsoftServerScopes('  api://1234/vault.access  '), ['api://1234/vault.access']);
  assert.deepEqual(microsoftServerScopes(''), ['user.read']);
  assert.deepEqual(microsoftServerScopes(undefined), ['user.read']);
});

test('a folder of type project survives validation — it must sync', () => {
  const { isTreeNode } = require('../types');

  assert.equal(
    isTreeNode({ id: 'f1', name: 'proj', type: 'folder', folderType: 'project', parentId: null }),
    true,
  );
});
