import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SECRET_CLAIM_FIELDS, withoutSecretClaims } from '../secretClaims';
import { shareableDetails } from '../shareFormat';
import { EntityMetadata, TreeNode } from '../types';
import { isProtected } from '../entityPin';
import { lockSecret, readSecret, unlockSecret } from '../secretEnvelope';
import { RECIPIENT, World, sealedShare, ui, world } from './shareWorld';
import { loadWithVscode } from './vscodeStub';

/**
 * Part 2's tail: a shared entry never claims a protection it does not have, and its recipient is
 * offered one of their own.
 */

const details = (over: Partial<EntityMetadata> = {}): EntityMetadata =>
  ({ id: 'e1', name: 'prod-db', isSshEnabled: false, ...over }) as EntityMetadata;

/**
 * THE BUG, and it shipped in 0.99.0.
 *
 * <p>`pinProtected` says "the values of this entry are wrapped". The sender unwraps them at share
 * time — the recipient does not have the sender's PIN and must never be given it — so the mark is
 * false the moment it arrives. And every consequence of it fires against nothing: the entry is
 * hidden from the recipient's agent surfaces, the form says <i>PIN — on</i>, and the command that
 * form points at reads the values, finds nothing locked, and says the entry is not protected.</p>
 */
test('a shared entry does NOT arrive claiming a PIN it does not have', () => {
  const shared = shareableDetails(details({ pinProtected: true }), false);

  assert.equal(shared?.pinProtected, undefined, 'the values were unwrapped; the mark would be a lie');
});

test('…but the WOVEN mark still travels, because the woven string does', () => {
  const shared = shareableDetails(details({ passwordWoven: true }), false);

  assert.equal(shared?.passwordWoven, true, 'or the recipient gets gibberish with no explanation');
});

test('a CLONE does not claim it either — it copies settings, not secrets', () => {
  const cloned = withoutSecretClaims(details({ pinProtected: true }));

  assert.equal(cloned.pinProtected, undefined);
  assert.ok(
    (SECRET_CLAIM_FIELDS as readonly string[]).includes('pinProtected'),
    'it belongs in the one table, not in two places that drift',
  );
});

/**
 * §2.5's unbuilt half: the recipient is TOLD, and asked for a PIN of their own.
 */
test('the sender’s protection travels as an instruction to ASK, not as a claim', () => {
  const shared = shareableDetails(details({ pinProtected: true }), false);
  const plain = shareableDetails(details({}), false);

  assert.equal(shared?.pinAskOnImport, true, 'so the far end knows to offer one');
  assert.equal(plain?.pinAskOnImport, undefined, 'and an ordinary entry asks nothing');
});

test('accepting such a share asks for a PIN and wraps the values under THAT one', async () => {
  const w = world();
  const share = sealedShare(protectedPayload(), 'transit-pin-1111');
  // The share PIN, then the recipient's own, twice.
  ui.inputs = ['transit-pin-1111', 'recipient-pin-2222', 'recipient-pin-2222'];

  await w.inbox.acceptOne(share);

  const node = imported(w);
  assert.notEqual(node, undefined, ui.errors.concat(ui.infos).join(' | '));
  assert.equal(await isProtected(w.storage, RECIPIENT.accountId, node!.id), true, 'wrapped on arrival');
  assert.equal(node!.details?.pinProtected, true, 'and it says so');
  // Under the RECIPIENT's pin — the sender's was never sent.
  const stored = await w.storage.getPassword(RECIPIENT.accountId, node!.id);
  const read = readSecret(stored);
  assert.equal(read.kind, 'locked');
  assert.equal(
    await unlockSecret(read.kind === 'locked' ? read.envelope : ({} as never), RECIPIENT.accountId, 'recipient-pin-2222'),
    'hunter2',
  );
});

test('declining that prompt imports NOTHING — not an unprotected copy', async () => {
  // A person who protected an entry did not agree to share it unprotected, and importing it in the
  // clear would be the product deciding that for them.
  const w = world();
  const share = sealedShare(protectedPayload(), 'transit-pin-1111');
  ui.inputs = ['transit-pin-1111', undefined];

  await w.inbox.acceptOne(share);

  assert.equal(imported(w), undefined, 'no node at all');
  assert.ok(
    ui.infos.concat(ui.errors).some((m) => /PIN/i.test(m)),
    'and the person is told why nothing happened: ' + ui.infos.concat(ui.errors).join(' | '),
  );
});

test('two PINs that do not match import nothing either', async () => {
  const w = world();
  const share = sealedShare(protectedPayload(), 'transit-pin-1111');
  ui.inputs = ['transit-pin-1111', 'recipient-pin-2222', 'a-different-one-3333'];

  await w.inbox.acceptOne(share);

  assert.equal(imported(w), undefined);
});

test('an ORDINARY share still imports without a second question', async () => {
  const w = world();
  const payload = protectedPayload();
  delete (payload.node.details as { pinAskOnImport?: unknown }).pinAskOnImport;
  const share = sealedShare(payload, 'transit-pin-1111');
  ui.inputs = ['transit-pin-1111'];

  await w.inbox.acceptOne(share);

  const node = imported(w);
  assert.notEqual(node, undefined, ui.errors.join(' | '));
  assert.equal(await isProtected(w.storage, RECIPIENT.accountId, node!.id), false);
});

/** A payload shaped like one a protected entry produces: values in the CLEAR, and the ask-mark. */
function protectedPayload(): { node: TreeNode; secrets: Record<string, string> } {
  return {
    node: {
      id: 'sender-e1',
      name: 'prod-db',
      type: 'entity',
      parentId: null,
      details: { id: 'sender-e1', name: 'prod-db', isSshEnabled: false, pinAskOnImport: true } as unknown as EntityMetadata,
    } as TreeNode,
    secrets: { password: 'hunter2' },
  };
}

/** The entry this accept created, if it created one. */
function imported(w: World): TreeNode | undefined {
  return w.storage.getNodes(RECIPIENT.accountId).find((n) => n.type === 'entity' && n.name === 'prod-db');
}

/**
 * A folder can ask for a PIN even while it is EMPTY — the gap the derived signal cannot close.
 */
test('a folder carrying the preference asks, even with no protected sibling', async () => {
  const nodes = [
    { id: 'f1', name: 'Production', type: 'folder', parentId: null, folderAsksForPin: true } as TreeNode,
  ];
  const storage = { getNodes: () => nodes } as never;
  const mod = pinOnCreate();

  const answer = await mod.pinForNewEntry(storage, 'a1', 'f1');

  assert.equal(answer.kind, 'cancelled', 'it asked — and the box was dismissed');
});

test('a folder without the preference and without protected siblings is not asked', async () => {
  const nodes = [{ id: 'f1', name: 'Open', type: 'folder', parentId: null } as TreeNode];
  const storage = { getNodes: () => nodes } as never;
  const mod = pinOnCreate(() => assert.fail('nothing here asks for a PIN'));

  assert.deepEqual(await mod.pinForNewEntry(storage, 'a1', 'f1'), { kind: 'none' });
});

function pinOnCreate(onAsk: () => unknown = () => undefined): typeof import('../pinOnCreate') {
  return loadWithVscode<typeof import('../pinOnCreate')>('../pinOnCreate', {
    window: {
      showInputBox: () => Promise.resolve(onAsk()),
      showWarningMessage: () => Promise.resolve(undefined),
    },
  });
}

/** The sealed payload carries the ask-mark; the ShareItem the server sees does not. */
test('the ask-mark is INSIDE the sealed part — the server learns nothing', () => {
  const share = sealedShare(protectedPayload(), 'transit-pin-1111');

  const onTheWire = JSON.stringify(share.item);

  assert.ok(!onTheWire.includes('pinAskOnImport'), onTheWire.slice(0, 300));
  assert.ok(!onTheWire.includes('pinProtected'), 'nor the mark it replaces');
  // What the server DOES see is unchanged by this work and is a deliberate, documented exposure:
  // the entry's name, its kind, and the sealed blob. Asserted so that a future field cannot join
  // them unnoticed.
  assert.ok(onTheWire.includes('"data"'), 'the sealed blob is what travels');
  assert.ok(onTheWire.includes('prod-db'), 'and the name, which the relay has always seen');
});

/**
 * The damage 0.99.0 already did, repaired where it is cheapest to notice.
 *
 * <p>Anyone who accepted a protected share before the fix has a copy carrying `pinProtected` over
 * values that were never wrapped. Stripping the mark from FUTURE shares does nothing for them, and
 * the state is self-diagnosing: the mark says the values are locked and `readSecret` says they are
 * not. So the door repairs it — `admit` already reads the slots to decide whether to ask, so the
 * check costs nothing, and it heals on the first open.</p>
 */
test('a mark with nothing locked under it is CLEARED, not asked about', async () => {
  const w = world();
  await w.storage.addNode(RECIPIENT.accountId, {
    id: 'false-mark',
    name: 'arrived-before-the-fix',
    type: 'entity',
    parentId: null,
    details: { id: 'false-mark', name: 'arrived-before-the-fix', isSshEnabled: false, pinProtected: true },
  } as TreeNode);
  await w.storage.setPassword(RECIPIENT.accountId, 'false-mark', 'hunter2');
  const mod = loadWithVscode<typeof import('../pinAdmission')>('../pinAdmission', {});

  const admission = await mod.admit(w.storage, RECIPIENT.accountId, 'false-mark', {
    accountId: RECIPIENT.accountId,
    entityId: 'false-mark',
    entryName: 'arrived-before-the-fix',
    ask: () => assert.fail('there is nothing locked to ask about'),
  });

  assert.equal(admission.kind, 'in');
  assert.equal(
    w.storage.getNode(RECIPIENT.accountId, 'false-mark')?.details?.pinProtected,
    undefined,
    'the mark went, so the entry stops hiding from agents and stops claiming a lock',
  );
});

test('a TRUE mark is left alone — the repair is about the false one only', async () => {
  const w = world();
  await w.storage.addNode(RECIPIENT.accountId, {
    id: 'really-locked',
    name: 'really-locked',
    type: 'entity',
    parentId: null,
    details: { id: 'really-locked', name: 'really-locked', isSshEnabled: false, pinProtected: true },
  } as TreeNode);
  await w.storage.setPassword(
    RECIPIENT.accountId,
    'really-locked',
    await lockSecret('hunter2', RECIPIENT.accountId, 'a-real-pin-4444'),
  );
  const mod = loadWithVscode<typeof import('../pinAdmission')>('../pinAdmission', {});

  await mod.admit(w.storage, RECIPIENT.accountId, 'really-locked', {
    accountId: RECIPIENT.accountId,
    entityId: 'really-locked',
    entryName: 'really-locked',
    ask: () => Promise.resolve('a-real-pin-4444'),
  });

  assert.equal(
    w.storage.getNode(RECIPIENT.accountId, 'really-locked')?.details?.pinProtected,
    true,
    'it is locked, so the mark is true and stays',
  );
});
