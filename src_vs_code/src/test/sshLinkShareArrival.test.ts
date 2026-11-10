import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SharePayload } from '../types';
import { ui, RECIPIENT, PIN, payloadFor, sealedShare, world } from './shareWorld';

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
