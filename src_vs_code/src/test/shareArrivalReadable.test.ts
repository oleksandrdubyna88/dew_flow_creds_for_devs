/**
 * What an accepted share is worth to the person who accepted it.
 *
 * <p>The existing accept suites read every arriving secret back through `node.id`. Nothing in the
 * product does: the viewer, the tree's copy commands, the env binder and the agent surfaces all key
 * their keychain reads on `node.details.id` — the id INSIDE the record — because `details` is what a
 * `TreeElement` carries. So a node whose two ids disagree passes every test in the suite and arrives
 * at its owner as a name with nothing behind it: no password, no login, no URL, no one-time code.</p>
 *
 * <p>These tests read the way the product reads. They are the only ones that can see that.</p>
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SharePayload, TreeNode } from '../types';
import { ui, loaded, StorageManager, RECIPIENT, PIN, payloadFor, sealedShare, world } from './shareWorld';
import { isProtected } from '../entityPin';

const SEED = 'otpauth://totp/GoDaddy:me@corp.com?secret=JBSWY3DPEHPK3PXP&issuer=GoDaddy&algorithm=SHA1&digits=6&period=30';
/** Login and URL are not metadata — they are stored fields, sealed like the password. */
const FIELDS = JSON.stringify({ login: '149295793', url: 'https://www.godaddy.com' });

/** A credential entry the way the form writes one: a password, its login/URL fields, and a seed. */
async function godaddy(storage: InstanceType<typeof StorageManager>): Promise<TreeNode> {
  const node: TreeNode = {
    id: 'sender-side-godaddy',
    name: 'godaddy',
    type: 'entity',
    parentId: null,
    details: { id: 'sender-side-godaddy', name: 'godaddy', isSshEnabled: false, hasTotp: true },
  };
  await storage.addNode(RECIPIENT.accountId, node);
  await storage.setPassword(RECIPIENT.accountId, node.id, 'pw-of-godaddy');
  await storage.setFieldsRaw(RECIPIENT.accountId, node.id, FIELDS);
  await storage.setTotp(RECIPIENT.accountId, node.id, SEED);
  return node;
}

/** The one arriving node — the entry the share created, never the sender-side original. */
function arrival(w: ReturnType<typeof world>, senderSideId: string): TreeNode {
  const arrived = w.storage.getNodes(RECIPIENT.accountId).find((n) => n.id !== senderSideId);
  assert.ok(arrived !== undefined, 'the share should have created an entry');
  return arrived;
}

test('an accepted entry names itself — the record inside it points at the node it is in', async () => {
  const w = world();
  ui.inputs = [PIN];

  await w.inbox.acceptOne(sealedShare(payloadFor('prod api', 'sender-side-id'), PIN));

  const node = arrival(w, 'sender-side-id');
  assert.equal(
    node.details?.id,
    node.id,
    'every keychain read in the product is keyed by details.id; a stale one finds nothing',
  );
});

test('the password of an accepted share is readable the way the viewer reads it', async () => {
  const w = world();
  ui.inputs = [PIN];

  await w.inbox.acceptOne(sealedShare(payloadFor('prod api', 'sender-side-id'), PIN));

  const node = arrival(w, 'sender-side-id');
  assert.equal(
    await w.storage.getPassword(RECIPIENT.accountId, node.details!.id),
    'pw-of-prod api',
  );
});

test('a shared login arrives with its login, URL, password and one-time code all readable', async () => {
  const w = world();
  const node = await godaddy(w.storage);
  const payload: SharePayload = await loaded.buildSharePayload(w.storage, RECIPIENT.accountId, node, true);
  ui.inputs = [PIN];

  await w.inbox.acceptOne(sealedShare(payload, PIN));

  const arrived = arrival(w, node.id);
  const id = arrived.details!.id;
  // FIRST, and not decoration: this world gives sender and recipient one account, so a stale
  // `details.id` still names the ORIGINAL entry — whose secrets are right there and answer every
  // read below. Without this line the three assertions pass against the sender's own vault and the
  // test reports health while the recipient sees a bare name.
  assert.equal(id, arrived.id, 'the arriving record must name the node it is in');
  assert.equal(await w.storage.getFieldsRaw(RECIPIENT.accountId, id), FIELDS, 'login and URL');
  assert.equal(await w.storage.getPassword(RECIPIENT.accountId, id), 'pw-of-godaddy');
  assert.equal(await w.storage.getTotp(RECIPIENT.accountId, id), SEED, 'the one-time code seed');
});

test('an entry updated in place by a re-share still names itself', async () => {
  const w = world();
  ui.inputs = [PIN];
  await w.inbox.acceptOne(sealedShare(payloadFor('prod api', 'sender-side-id'), PIN));
  ui.inputs = [PIN];
  ui.warningAnswer = 'Update it';

  await w.inbox.acceptOne(sealedShare(payloadFor('prod api v2', 'sender-side-id'), PIN));

  const node = arrival(w, 'sender-side-id');
  assert.equal(node.details?.id, node.id, 'the update keeps its own id, and the record must follow');
  assert.equal(
    await w.storage.getPassword(RECIPIENT.accountId, node.details!.id),
    'pw-of-prod api v2',
  );
});

/**
 * The repair, not the guard: a vault that ALREADY holds entries broken by an older build.
 *
 * <p>Every share accepted before the fix wrote its secrets under the node's own id and left the
 * record pointing at the sender's — so the values are on disk and simply unreachable. The read path
 * corrects the id as the nodes load, which is what brings those entries back without asking anybody
 * to re-share. Written through `addNode` because that is how such a node got there: the writer
 * normalises nothing, the reader does.</p>
 */
test('an entry already stored with a stale record id reads back naming itself', async () => {
  const w = world();
  const broken: TreeNode = {
    id: 'local-id',
    name: 'accepted by an older build',
    type: 'entity',
    parentId: null,
    details: { id: 'sender-side-id', name: 'accepted by an older build', isSshEnabled: false },
  };
  await w.storage.addNode(RECIPIENT.accountId, broken);
  await w.storage.setPassword(RECIPIENT.accountId, 'local-id', 'the value that was never lost');

  const read = w.storage.getNode(RECIPIENT.accountId, 'local-id');

  assert.equal(read?.details?.id, 'local-id', 'repaired on the way out of storage');
  assert.equal(
    await w.storage.getPassword(RECIPIENT.accountId, read!.details!.id),
    'the value that was never lost',
    'and the secret it could not reach is reachable again',
  );
});

test('a folder, which has no record of its own, passes through the repair untouched', async () => {
  const w = world();
  const folder: TreeNode = { id: 'f1', name: 'Production', type: 'folder', parentId: null };
  await w.storage.addNode(RECIPIENT.accountId, folder);

  const read = w.storage.getNode(RECIPIENT.accountId, 'f1');

  assert.equal(read?.details, undefined);
  assert.equal(read?.name, 'Production');
});

/**
 * The batch accept is the same decision as the single one, asked once per item.
 *
 * <p>`acceptMany` imported the opened payload RAW — it never went through the recipient-PIN wrap —
 * so an entry its sender had protected landed unprotected on the far end, and the instruction that
 * travels with it (`pinAskOnImport`: ask this person for a PIN of their own) was honoured on one of
 * the two accept paths. Accepting a batch is the ordinary way to clear an inbox, so this was not a
 * corner: it was the common route past the protection.</p>
 */
function protectedPayload(name: string): SharePayload {
  return {
    node: {
      id: `sender-${name}`,
      name,
      type: 'entity',
      parentId: null,
      details: { id: `sender-${name}`, name, isSshEnabled: false, pinAskOnImport: true },
    },
    secrets: { password: `pw-of-${name}` },
  };
}

test('accepting a batch asks for the recipient’s own PIN and wraps what arrives', async () => {
  const w = world();
  // The share PIN for the batch, then the recipient's own PIN, typed twice.
  ui.inputs = [PIN, 'recipient-pin-2222', 'recipient-pin-2222'];

  await w.inbox.acceptMany([sealedShare(protectedPayload('prod-db'), PIN)]);

  const node = arrival(w, 'sender-prod-db');
  assert.equal(node.details?.pinProtected, true, 'wrapped on arrival, and it says so');
  assert.equal(node.details?.pinAskOnImport, undefined, 'the instruction is spent');
  assert.equal(await isProtected(w.storage, RECIPIENT.accountId, node.id), true);
});

test('declining the PIN in a batch imports nothing, and keeps the share to accept again', async () => {
  const w = world();
  ui.inputs = [PIN, undefined];

  await w.inbox.acceptMany([sealedShare(protectedPayload('prod-db'), PIN)]);

  assert.equal(
    w.storage.getNodes(RECIPIENT.accountId).length,
    0,
    'an unprotected copy is not what the sender agreed to share',
  );
  assert.deepEqual(w.removed, [], 'and the only copy of the decision is still in the inbox');
  assert.ok(
    ui.infos.some((m) => /1 still pending/.test(m)),
    'counted where the person reads it: ' + ui.infos.join(' | '),
  );
});

/**
 * The repair has to SURVIVE being written back — the reviewers' sharpest question.
 *
 * <p>A read-time normalisation would be worth little if the next save undid it, so this drives the
 * ordinary edit path over a repaired entry: read it (repaired), write a field through the storage
 * API, and read it again. What lands on disk must carry the corrected record, and the secret must
 * still be reachable through it.</p>
 */
test('an entry repaired on read stays repaired after an ordinary edit, and keeps its secret', async () => {
  const w = world();
  await w.storage.addNode(RECIPIENT.accountId, {
    id: 'local-id',
    name: 'accepted by an older build',
    type: 'entity',
    parentId: null,
    details: { id: 'sender-side-id', name: 'accepted by an older build', isSshEnabled: false },
  });
  await w.storage.setPassword(RECIPIENT.accountId, 'local-id', 'still here');

  await w.storage.updateDetailsFields(RECIPIENT.accountId, 'local-id', { host: 'example.com' });

  const after = w.storage.getNode(RECIPIENT.accountId, 'local-id');
  assert.equal(after?.details?.id, 'local-id', 'the write did not put the stale id back');
  assert.equal(after?.details?.host, 'example.com', 'and it is the same record, edited');
  assert.equal(await w.storage.getPassword(RECIPIENT.accountId, after!.details!.id), 'still here');
});

test('a repaired entry keeps its own node id — nothing mints a new one on write', async () => {
  // The drift the reviewers described needs a write path that RE-IDS a node. There is none:
  // `withOwnId` moves the record onto the node's id, never the node onto a new one.
  const w = world();
  await w.storage.addNode(RECIPIENT.accountId, {
    id: 'local-id',
    name: 'one entry',
    type: 'entity',
    parentId: null,
    details: { id: 'sender-side-id', name: 'one entry', isSshEnabled: false },
  });

  await w.storage.updateDetailsFields(RECIPIENT.accountId, 'local-id', { user: 'root' });

  const nodes = w.storage.getNodes(RECIPIENT.accountId);
  assert.equal(nodes.length, 1, 'one entry in, one entry out — no duplicate under a second id');
  assert.equal(nodes[0].id, 'local-id');
});

/**
 * A batch is several PINs, and declining ONE must not cost the others.
 *
 * <p>The alternative the gate proposed — ask once and wrap the whole batch under a single PIN — is
 * deliberately not taken: a batch routinely holds entries from different senders, and one PIN across
 * all of them is a protection the person did not choose. So the prompt is per item, and what has to
 * be true is that a cancel is local to the item it was asked for.</p>
 */
test('declining one item’s PIN in a batch still imports the others', async () => {
  const w = world();
  // Share PIN; then Esc on the first entry's own PIN; then the second entry's, typed twice.
  ui.inputs = [PIN, undefined, 'recipient-pin-2222', 'recipient-pin-2222'];

  await w.inbox.acceptMany([
    sealedShare(protectedPayload('first'), PIN),
    sealedShare(protectedPayload('second'), PIN),
  ]);

  const names = w.storage.getNodes(RECIPIENT.accountId).map((n) => n.name);
  assert.deepEqual(names, ['second'], 'the cancel was local to the item it was asked for');
  assert.deepEqual(w.removed.map((s) => s.item.entityName), ['second'], 'and the declined one is kept');
});

test('the Keep both branch names its copy too, and its secret is readable', async () => {
  // The third import branch. The other two are covered above, and a regression confined to this one
  // would leave the duplicate pointing at the sender's id while every other test stayed green.
  const w = world();
  ui.inputs = [PIN];
  await w.inbox.acceptOne(sealedShare(payloadFor('prod api', 'sender-side-id'), PIN));
  const first = arrival(w, 'sender-side-id');
  ui.inputs = [PIN];
  ui.warningAnswer = 'Keep both';

  await w.inbox.acceptOne(sealedShare(payloadFor('prod api', 'sender-side-id'), PIN));

  const kept = w.storage.getNodes(RECIPIENT.accountId).find((n) => n.id !== first.id);
  assert.ok(kept !== undefined, 'Keep both should have made a second entry');
  assert.equal(kept.details?.id, kept.id, 'the copy names itself');
  assert.equal(await w.storage.getPassword(RECIPIENT.accountId, kept.details!.id), 'pw-of-prod api');
});

test('every protected item in a batch is wrapped, not only the first', async () => {
  // The security question asked of the loop: it wraps each item, rather than wrapping one and
  // importing the rest as they arrived. Two items, two PINs, both entries protected at the end.
  const w = world();
  ui.inputs = [PIN, 'pin-for-first-1111', 'pin-for-first-1111', 'pin-for-second-2222', 'pin-for-second-2222'];

  await w.inbox.acceptMany([
    sealedShare(protectedPayload('first'), PIN),
    sealedShare(protectedPayload('second'), PIN),
  ]);

  const nodes = w.storage.getNodes(RECIPIENT.accountId);
  assert.deepEqual(nodes.map((n) => n.name).sort(), ['first', 'second']);
  for (const node of nodes) {
    assert.equal(node.details?.pinProtected, true, `${node.name} arrived unprotected`);
    assert.equal(await isProtected(w.storage, RECIPIENT.accountId, node.id), true, node.name);
  }
});
