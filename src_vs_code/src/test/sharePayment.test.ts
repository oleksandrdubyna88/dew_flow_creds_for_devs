import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TreeNode } from '../types';
import {
  ui,
  loaded,
  StorageManager,
  RECIPIENT,
  PIN,
  sealedShare,
  TEAM_MEMBER,
  world,
} from './shareWorld';

/**
 * What a payment record does and does not carry across the share boundary, on the REAL paths.
 *
 * <p>Split out of `shareInbox.test.ts` when these cases took that file past the 800-line ceiling.
 * The harness is shared (`shareWorld.ts`) rather than copied, so both suites drive the same
 * `ShareInbox` — which is the whole claim being tested: that redaction holds where it is WIRED, not
 * only where it is computed.</p>
 */

/** A payment instrument in the sender's vault, with the two fields that must not travel. */
async function cardEntry(storage: InstanceType<typeof StorageManager>): Promise<TreeNode> {
  const node: TreeNode = {
    id: 'sender-side-card',
    name: 'Visa',
    type: 'entity',
    parentId: null,
    details: {
      id: 'sender-side-card',
      name: 'Visa',
      isSshEnabled: false,
      kind: 'payment',
      isPayment: true,
      paymentForm: 'card',
    },
  };
  await storage.addNode(RECIPIENT.accountId, node);
  await storage.setPayment(RECIPIENT.accountId, node.id, {
    number: '4111111111111111',
    expiry: '12/29',
    holder: 'A Person',
    cvv: '123',
    pin: '4321',
    shuffledFields: ['cvv'],
  });
  return node;
}

test('sharing a card carries the number and leaves the CVV and the PIN behind', async () => {
  // The one stripping direction in the product, asserted where it happens rather than only in
  // `paymentRedaction.test.ts`: that file proves the rule, this one proves the rule is WIRED. The
  // parent plan's §2.5 exists because the promise had three statements and one test.
  const w = world();
  const node = await cardEntry(w.storage);

  const payload = await loaded.buildSharePayload(w.storage, RECIPIENT.accountId, node, false);
  const shared = JSON.parse(payload.secrets.payment ?? '{}') as Record<string, unknown>;

  assert.equal(shared.number, '4111111111111111', 'handing a colleague a card IS the feature');
  assert.equal(shared.expiry, '12/29');
  assert.equal(shared.holder, 'A Person');
  assert.equal(shared.cvv, undefined, 'the CVV does not leave the vault it was typed into');
  assert.equal(shared.pin, undefined);
  assert.deepEqual(
    shared.shuffledFields,
    undefined,
    'and the woven-field name goes with it, or the recipient draws a picker over a field they do not have',
  );
});

test('the sender still has everything after sharing', async () => {
  // Redaction shapes the COPY. A redaction that reached back into the vault would be the worst
  // possible reading of "the CVV does not travel".
  const w = world();
  const node = await cardEntry(w.storage);

  await loaded.buildSharePayload(w.storage, RECIPIENT.accountId, node, false);

  const mine = await w.storage.getPayment(RECIPIENT.accountId, node.id);
  assert.equal(mine.cvv, '123', 'sharing a card must not empty my own');
  assert.equal(mine.pin, '4321');
});

test('an accepted card arrives with its number, and with no CVV to arrive with', async () => {
  const w = world();
  const share = sealedShare(
    {
      node: {
        id: 'sender-side-card',
        name: 'Visa',
        type: 'entity',
        parentId: null,
        details: {
          id: 'sender-side-card',
          name: 'Visa',
          isSshEnabled: false,
          kind: 'payment',
          isPayment: true,
          paymentForm: 'card',
        },
      },
      secrets: { payment: '{"number":"4111111111111111","expiry":"12/29"}' },
    },
    PIN,
  );
  ui.inputs = [PIN];

  await w.inbox.acceptOne(share);

  const nodes = w.storage.getNodes(RECIPIENT.accountId);
  const arrived = await w.storage.getPayment(RECIPIENT.accountId, nodes[0].id);
  assert.equal(arrived.number, '4111111111111111', 'a card that arrived without its number is not a card');
  assert.equal(arrived.expiry, '12/29');
  assert.equal(arrived.cvv, undefined);
});

test('a keychain that refuses fails the whole share instead of omitting the card', async () => {
  // Accepted from the review as a Minor: the claim was that a rejected read already fails the build,
  // because `secrets.get` REJECTS rather than resolving undefined and nothing on the share path
  // catches it — but nothing ASSERTED it. A later caller-level catch that turned the rejection into a
  // cheerful "shared" would recreate exactly the ambiguity the loud-refusal finding removed, and no
  // existing test would notice.
  const w = world();
  const node = await cardEntry(w.storage);

  const boom = new Error('keychain unavailable');
  (w.storage as unknown as { getPaymentRaw: () => Promise<string> }).getPaymentRaw = () =>
    Promise.reject(boom);

  await assert.rejects(
    () => loaded.buildSharePayload(w.storage, RECIPIENT.accountId, node, false),
    /keychain unavailable/,
    'the build must fail, so nothing is sealed and nothing is delivered',
  );
});

test('the sender is told which payment fields did not go, and never told a value', async () => {
  // `withheldFromShare` existed, was tested, and was never CALLED — the same helper-with-no-caller
  // defect the gate had already caught me at one story earlier, found this time by four reviewers at
  // once. So the assertion is on the NOTIFICATION rather than on the function: what the person reads.
  const w = world();
  const node = await cardEntry(w.storage);
  const payload = await loaded.buildSharePayload(w.storage, RECIPIENT.accountId, node, false);

  await w.inbox.deliverBatch(RECIPIENT.accountId, [payload], [TEAM_MEMBER as never], PIN);

  const said = ui.infos.join(' | ');
  assert.match(said, /Shared "Visa"/, 'it still reports the share');
  assert.match(said, /Not sent, and they cannot be: cvv, pin/, `the withheld names never reached the person: ${said}`);
  assert.equal(said.includes('123'), false, 'and no value did either — this string is logged by UI layers');
  assert.equal(said.includes('4321'), false);
  assert.equal(said.includes('4111'), false);
});

test('a share with nothing withheld says nothing about withholding', async () => {
  // A sentence that always appears is a sentence nobody reads.
  const w = world();
  const node: TreeNode = {
    id: 'plain-card',
    name: 'Bank details',
    type: 'entity',
    parentId: null,
    details: { id: 'plain-card', name: 'Bank details', isSshEnabled: false, kind: 'payment', isPayment: true },
  };
  await w.storage.addNode(RECIPIENT.accountId, node);
  await w.storage.setPayment(RECIPIENT.accountId, node.id, { iban: 'PL61109010140000071219812874' });
  const payload = await loaded.buildSharePayload(w.storage, RECIPIENT.accountId, node, false);

  await w.inbox.deliverBatch(RECIPIENT.accountId, [payload], [TEAM_MEMBER as never], PIN);

  assert.equal(/Not sent/.test(ui.infos.join(' | ')), false);
});

test('an unreadable payment payload KEEPS the share, so accepting again on a newer build is possible', async () => {
  // The review's finding on my own fix: the warning advised checking for an update while
  // `removeOwnShare` had already discarded the only queued copy, so there was nothing left to accept
  // after updating. Advice the code makes impossible is worse than no advice.
  const w = world();
  const share = sealedShare(
    {
      node: {
        id: 'sender-side-card',
        name: 'Visa',
        type: 'entity',
        parentId: null,
        details: { id: 'sender-side-card', name: 'Visa', isSshEnabled: false, kind: 'payment', isPayment: true },
      },
      secrets: { payment: '{not json' },
    },
    PIN,
  );
  ui.inputs = [PIN];

  await w.inbox.acceptOne(share);

  const nodes = w.storage.getNodes(RECIPIENT.accountId);
  assert.equal(nodes.length, 1, 'the entry still arrives — the readable half is theirs');
  assert.deepEqual(await w.storage.getPayment(RECIPIENT.accountId, nodes[0].id), {}, 'nothing unreadable is stored');
  assert.deepEqual(w.removed, [], 'and the share is KEPT, so it can be accepted again after an update');
});

test('a readable share is still removed from the queue once accepted', async () => {
  // The other side of the same branch: keeping every share would leave the inbox filling forever.
  const w = world();
  const share = sealedShare(
    {
      node: {
        id: 'sender-side-card',
        name: 'Visa',
        type: 'entity',
        parentId: null,
        details: { id: 'sender-side-card', name: 'Visa', isSshEnabled: false, kind: 'payment', isPayment: true },
      },
      secrets: { payment: '{"number":"4111111111111111"}' },
    },
    PIN,
  );
  ui.inputs = [PIN];

  await w.inbox.acceptOne(share);

  assert.equal(w.removed.length, 1, 'accepted and cleared');
});

test('a keychain failure while naming withheld fields does not make a delivered share look failed', async () => {
  // The review's sharpest finding on my own wiring: the note was interpolated into the SUCCESS
  // message, after `appendShares` had already succeeded. A read that rejected there rejected the whole
  // method — recipients held the share, the sender saw no success, and a retry would deliver twice.
  // Computing it before the first delivery means such a failure happens BEFORE anything is sent,
  // which is the only honest place for it.
  const w = world();
  const node = await cardEntry(w.storage);
  const payload = await loaded.buildSharePayload(w.storage, RECIPIENT.accountId, node, false);

  (w.storage as unknown as { getPaymentRaw: () => Promise<string> }).getPaymentRaw = () =>
    Promise.reject(new Error('keychain unavailable'));

  await assert.rejects(
    () => w.inbox.deliverBatch(RECIPIENT.accountId, [payload], [TEAM_MEMBER as never], PIN),
    /keychain unavailable/,
    'the failure must land before delivery, not after',
  );
  assert.deepEqual(w.delivered, [], 'nothing was delivered, so a retry cannot duplicate');
});
