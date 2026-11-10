import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SharePayload, TreeNode } from '../types';
import { ui, RECIPIENT, PIN, payloadFor, sealedShare, world } from './shareWorld';
import { updateInPlace } from '../shareUpdateSeal'; // after shareWorld: its vscode stub must be installed first

/**
 * E1.S1 (D4): a received entry never arrives linked. The link names an entity of the SENDER's vault, and a
 * payload can carry one that this build's own share builder would not write (an older build, a hand-made share).
 * Driven through the real `ShareInbox`, as `shareInbox.test.ts` is.
 */

/** A terminal entry whose payload carries a link, the way `shareableDetails` would never write it. */
function linkedPayload(name: string): SharePayload {
  const payload = payloadFor(name, 'sender-side-id');
  const details = { ...payload.node.details!, isTerminal: true, command: 'ls', sshEntityId: 's-sender' };
  return { ...payload, node: { ...payload.node, details } };
}

test('R6_an_accepted_share_whose_payload_carries_an_ssh_link_lands_without_it', async () => {
  const w = world();
  ui.inputs = [PIN];

  await w.inbox.acceptOne(sealedShare(linkedPayload('deploy'), PIN));

  const nodes = w.storage.getNodes(RECIPIENT.accountId);
  assert.equal(nodes.length, 1, 'the share landed');
  assert.equal(nodes[0].details?.command, 'ls', 'the rest of the entry arrived');
  assert.equal(nodes[0].details?.sshEntityId, undefined);
});

test('R6b_an_update_in_place_from_the_same_sender_does_not_set_the_link_either', async () => {
  const w = world();
  ui.inputs = [PIN];
  await w.inbox.acceptOne(sealedShare(payloadFor('deploy', 'sender-side-id'), PIN));

  ui.inputs = [PIN];
  ui.warningAnswer = 'Update it';
  await w.inbox.acceptOne(sealedShare(linkedPayload('deploy'), PIN));

  const nodes = w.storage.getNodes(RECIPIENT.accountId);
  assert.equal(nodes.length, 1, 'updated in place, not duplicated');
  assert.equal(nodes[0].details?.command, 'ls', 'the update was applied');
  assert.equal(nodes[0].details?.sshEntityId, undefined);
});

const OWN_LINK = 'my-own-ssh-entry';

/** The details of an update `updateInPlace` built: it must have built one. */
function detailsOf(update: Awaited<ReturnType<typeof updateInPlace>>): NonNullable<TreeNode['details']> {
  assert.ok(update?.node.details !== undefined, 'the update was built');
  return update.node.details;
}

/** The details the recipient's vault holds for `id`: it must hold the entry. */
function detailsAt(w: ReturnType<typeof world>, id: string): NonNullable<TreeNode['details']> {
  const details = w.storage.getNode(RECIPIENT.accountId, id)?.details;
  assert.ok(details !== undefined, `the recipient holds ${id}`);
  return details;
}

test('F2_update_it_keeps_the_recipients_own_link_and_never_takes_the_senders', async () => {
  const w = world();
  ui.inputs = [PIN];
  await w.inbox.acceptOne(sealedShare(payloadFor('deploy', 'sender-side-id'), PIN));
  const [mine] = w.storage.getNodes(RECIPIENT.accountId);
  await w.storage.updateDetailsFields(RECIPIENT.accountId, mine.id, { sshEntityId: OWN_LINK });
  assert.equal(detailsAt(w, mine.id).sshEntityId, OWN_LINK, 'the fixture holds the recipient\'s link');

  ui.inputs = [PIN];
  ui.warningAnswer = 'Update it';
  await w.inbox.acceptOne(sealedShare(linkedPayload('deploy'), PIN));

  const nodes = w.storage.getNodes(RECIPIENT.accountId);
  assert.equal(nodes.length, 1, 'updated in place, not duplicated');
  assert.equal(detailsAt(w, mine.id).command, 'ls', 'the update was applied');
  assert.equal(detailsAt(w, mine.id).sshEntityId, OWN_LINK, 'the recipient\'s link survives the update, and the sender\'s (s-sender) never lands');
});

test('F2b_updateInPlace_itself_keeps_the_recipients_link_and_drops_a_forged_one_whatever_the_caller_stripped', async () => {
  const w = world();
  ui.inputs = [PIN];
  await w.inbox.acceptOne(sealedShare(payloadFor('deploy', 'sender-side-id'), PIN));
  const [mine] = w.storage.getNodes(RECIPIENT.accountId);
  const forged = linkedPayload('deploy');

  // An unlinked entry and a payload that carries a link: still unlinked.
  const unlinked = detailsOf(await updateInPlace(w.storage, RECIPIENT.accountId, mine.id, forged, null));
  assert.equal(unlinked.command, 'ls', 'the payload was applied');
  assert.equal(unlinked.sshEntityId, undefined, 'a forged link does not set one');

  // A linked entry and a payload that carries ANOTHER link: the recipient\'s own.
  await w.storage.updateDetailsFields(RECIPIENT.accountId, mine.id, { sshEntityId: OWN_LINK });
  const linked = detailsOf(await updateInPlace(w.storage, RECIPIENT.accountId, mine.id, forged, null));
  assert.equal(linked.sshEntityId, OWN_LINK);
});
