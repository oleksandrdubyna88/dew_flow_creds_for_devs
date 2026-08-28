import { generateSigningKeypair, verifyShare } from '../shareSignature';
import { judgeSender } from '../senderPinning';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BackupError, encryptJson, sealBlob } from '../cryptoUtils';
import {
  LEGACY_SHARES_UNTIL,
  envelopeWithShares,
  legacyShareAllowed,
  openShare,
  shareLabelBound,
  resolveShares,
  sealShare,
  shareTranscript,
  shareableDetails,
  sharesFromEnvelope,
} from '../shareFormat';
import { EntityMetadata, ShareItem, SharePayload, StoredAccount } from '../types';

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

/**
 * A signed share, end to end through the real seal path. The unit tests on
 * shareSignature prove the primitive; these prove the wiring carries the right
 * fields into it — which is the part that actually goes wrong.
 */
const signer = generateSigningKeypair();
const bob = { accountId: 'a-bob', email: 'bob@corp.com', provider: 'google' as const };

function sealed(toEmail: string) {
  return sealShare(
    { node: { id: 'n1', name: 'prod', type: 'entity' as const }, secrets: {} },
    'recipient-key-id',
    bob,
    'a-good-share-pin',
    1_756_000_000_000,
    signer,
    toEmail,
  );
}

test('a signed share verifies where it was addressed', () => {
  const item = sealed('carol@corp.com');

  assert.equal(item.senderPublicKey, signer.publicKey);
  assert.equal(verifyShare(signer.publicKey, shareTranscript(item, 'carol@corp.com'), item.signature ?? ''), true);
});

test(`the same item found in somebody ELSE's file does not verify`, () => {
  // toEmail is where the item was found, not a field it carries — which is what
  // makes copying it into another inbox detectable.
  const item = sealed('carol@corp.com');

  assert.equal(verifyShare(signer.publicKey, shareTranscript(item, 'dave@corp.com'), item.signature ?? ''), false);
});

test('sealing without a keypair stays unsigned rather than failing', () => {
  // The server transport passes neither, and stamps the sender itself.
  const item = sealShare(
    { node: { id: 'n1', name: 'prod', type: 'entity' as const }, secrets: {} },
    'rk', bob, 'a-good-share-pin', 1,
  );

  assert.equal(item.signature, undefined);
  assert.equal(item.senderPublicKey, undefined);
});

test('a fresh signed share reads as first contact, and as verified once pinned', async () => {
  const item = sealed('carol@corp.com');
  const share = { transcript: shareTranscript(item, 'carol@corp.com'), signature: item.signature };
  const pins: Record<string, Record<string, string>> = {};
  const store = {
    get: (k: string) => pins[k],
    update: (k: string, v: Record<string, string>) => {
      pins[k] = v;
      return Promise.resolve();
    },
  };

  assert.equal(judgeSender(store, 'acct', share), 'firstContact');
  await store.update('credSshManager.pinnedSenderKeys.acct', { 'bob@corp.com': signer.publicKey });
  assert.equal(judgeSender(store, 'acct', share), 'verified');
});

test('a shared copy carries no dependency of the vault it left', () => {
  // `dependsOn` names ids in the SENDER's vault. Sent as-is, the recipient's resolver would
  // report a permanent "no longer exists" for a relationship that was never theirs; the colour
  // would claim other entries need this one, and none of those entries are being sent.
  const shared = shareableDetails({
    id: 'e1',
    name: 'access-server',
    isSshEnabled: true,
    host: '10.0.0.1',
    notes: 'a secret note',
    dependsOn: ['v1', 'v2'],
    depColor: 'depColor7',
    mcp: { delete: 'any' },
    mcpCreatedByAgent: true,
  }, false);

  assert.notEqual(shared, undefined);
  const details = shared as EntityMetadata;
  assert.equal(details.dependsOn, undefined);
  assert.equal(details.depColor, undefined);
  assert.equal(details.notes, undefined, 'a note is a secret and travels sealed, not here');
  // The expensive pair. Shipped as they are, this entry arrives in somebody else's vault already
  // authorised for somebody else's agent — a permission granted by a person who was never asked,
  // to software they have not seen.
  assert.equal(details.mcp, undefined);
  assert.equal(details.mcpCreatedByAgent, undefined);
  // Everything the recipient can actually use survives — this is a strip, not a rewrite.
  assert.equal(details.host, '10.0.0.1');
  assert.equal(details.name, 'access-server');
});

test('a shared config keeps its format and file name, and loses the key hash', () => {
  // The sixth stripped field, and the one this module's own doc predicted: "a field added to
  // EntityMetadata travels by default; making it NOT travel is the decision that has to be
  // visible." A config key is minted by ONE window for ONE vault and only its hash is kept — so a
  // recipient carrying that hash has an entry claiming a key they were never given, cannot use,
  // and cannot revoke, because revoking clears a hash whose key is in somebody else's clipboard.
  const shared = shareableDetails({
    id: 'e2',
    name: 'appsettings.Development.json',
    isSshEnabled: false,
    kind: 'config',
    isConfig: true,
    configFormat: 'json',
    configFileName: 'appsettings.Development.json',
    configKeyHash: 'Zm9vYmFyZm9vYmFyZm9vYmFyZm9vYmFyZm9vYmFyZm9vYmE=',
  }, false) as EntityMetadata;

  assert.equal(shared.configKeyHash, undefined, 'the recipient cannot use or revoke this key');
  // Everything they CAN use survives — this is a strip, not a rewrite. Without the format the
  // document cannot be validated, laid out as fields, or written with the right extension.
  assert.equal(shared.configFormat, 'json');
  assert.equal(shared.configFileName, 'appsettings.Development.json');
  assert.equal(shared.isConfig, true);
});

test('an entity with no metadata at all stays that way', () => {
  assert.equal(shareableDetails(undefined, false), undefined);
});

test('the one-time-code flag travels only when the seed does', () => {
  // The seventh stripped field, and the only conditional one. `hasTotp` is what the tree builds
  // its `:totp` token from, so a copy carrying the flag without the seed shows a recipient a
  // *Copy One-Time Code* action on an entry that cannot compute one — the same shape of
  // half-delivery the config key hash was, in a different field.
  const entry: EntityMetadata = { id: 'e3', name: 'GitHub', isSshEnabled: false, hasTotp: true };

  assert.equal((shareableDetails(entry, true) as EntityMetadata).hasTotp, true);
  assert.equal((shareableDetails(entry, false) as EntityMetadata).hasTotp, undefined);
  // The entry itself is untouched either way — this is a copy, not an edit of the vault.
  assert.equal(entry.hasTotp, true);
});

// ---- the label is bound to the ciphertext (security-review finding 7, 2026-08-28) ----

test('a sealed share opens; the same share with its fromEmail edited afterwards does NOT', () => {
  const item = sealShare(payload('orders-db'), user.accountId, admin, '1234', NOW);
  assert.equal(shareLabelBound(item), true, 'a new share is bound');
  assert.equal(openShare(item, user.accountId, '1234').node.name, 'orders-db');
  const relabelled = { ...item, fromEmail: 'colleague@x' };
  assert.throws(() => openShare(relabelled, user.accountId, '1234'), BackupError, 'an edited sender breaks decryption');
  const renamed = { ...item, entityName: 'production-db' };
  assert.throws(() => openShare(renamed, user.accountId, '1234'), BackupError, 'an edited name breaks decryption');
  const redated = { ...item, createdAt: NOW + 1 };
  assert.throws(() => openShare(redated, user.accountId, '1234'), BackupError);
});

test('a legacy share — no format, no AAD — still opens, is reported unbound, and is refused from the cutoff version', () => {
  // As 0.81 wrote it: sealed without AAD, carrying no `format`.
  const legacyBlob = sealShareLegacy(payload('old'), user.accountId, admin, '1234', NOW);
  assert.equal(shareLabelBound(legacyBlob), false);
  assert.equal(openShare(legacyBlob, user.accountId, '1234', '0.82.0').node.name, 'old', 'opens on 0.82');
  assert.equal(openShare(legacyBlob, user.accountId, '1234', '0.84.9').node.name, 'old', 'opens right before the cutoff');
  assert.throws(
    () => openShare(legacyBlob, user.accountId, '1234', LEGACY_SHARES_UNTIL),
    (error: unknown) => error instanceof BackupError && /older than/.test(error.message),
    'refused from the cutoff on, with a sentence about updating the sender',
  );
  assert.equal(legacyShareAllowed('0.82.0'), true);
  assert.equal(legacyShareAllowed('0.85.0'), false);
  assert.equal(legacyShareAllowed('1.0.0'), false);
});

/** A share as pre-0.82 builds sealed it: no AAD, no `format`. */
function sealShareLegacy(p: SharePayload, recipientKeyId: string, from: StoredAccount, pin: string, createdAt: number): ShareItem {
  const blob = sealBlob(p, recipientKeyId + pin);
  return {
    id: 'legacy-1',
    fromEmail: from.email,
    from,
    entityName: p.node.name,
    entityKind: 'db',
    createdAt,
    ...blob,
  };
}
