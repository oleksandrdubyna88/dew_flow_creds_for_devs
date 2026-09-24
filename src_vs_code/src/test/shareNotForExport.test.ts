import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TreeNode } from '../types';
import { ui, loaded, RECIPIENT, SENDER, KEY_ID, PIN, TEAM_MEMBER, payloadFor, sealedShare, world } from './shareWorld';
import type { World } from './shareWorld';

/**
 * Issue #122 — a FOLDER shared through the real `ShareInbox` never carries an entry marked
 * *Not for export*, at any depth, and never asks about that entry's one-time code.
 *
 * <p>The handler filters what was SELECTED; the folder walk is where a marked entry could still slip
 * out (gate plan round, finding 9), so this drives the whole conversation and opens what reached the
 * wire.</p>
 */

async function add(w: World, node: TreeNode, totp = false): Promise<TreeNode> {
  await w.storage.addNode(RECIPIENT.accountId, node);
  if (node.type === 'entity') {
    await w.storage.setPassword(RECIPIENT.accountId, node.id, `pw-${node.id}`);
    if (totp) {
      await w.storage.setTotp(RECIPIENT.accountId, node.id, 'JBSWY3DPEHPK3PXP');
    }
  }
  return node;
}

function entity(id: string, parentId: string, marked: boolean, hasTotp = false): TreeNode {
  const details = { id, name: id, isSshEnabled: false, ...(hasTotp ? { hasTotp } : {}), ...(marked ? { notForExport: true } : {}) };
  return { id, name: id, type: 'entity', parentId, details };
}

test('sharing a folder delivers its unmarked entries only — a marked one at any depth stays', async () => {
  const w = world();
  const ops = await add(w, { id: 'ops', name: 'ops', type: 'folder', parentId: null });
  await add(w, entity('prod', 'ops', true, true), true);
  await add(w, entity('stage', 'ops', false));
  await add(w, { id: 'inner', name: 'inner', type: 'folder', parentId: 'ops' });
  await add(w, entity('vault-key', 'inner', true));
  await add(w, entity('grafana', 'inner', false));
  // No TOTP question: the only seed in the folder belongs to the marked entry. So the first pick is
  // the recipients, then the share PIN twice.
  ui.quickPickAnswers = [[{ label: SENDER.email, member: TEAM_MEMBER }]];
  ui.inputs = [PIN, PIN];

  await w.inbox.shareNodes(RECIPIENT.accountId, [ops]);

  assert.equal(ui.quickPickTitles.includes('What travels with this share?'), false, 'a marked seed is not a question');
  const names = w.delivered.map((item) => loaded.openShare(item as never, KEY_ID, PIN).node.name).sort();
  assert.deepEqual(names, ['grafana', 'stage']);
});

test('a marked entry handed straight to the inbox yields nothing — the walk is the second guard', async () => {
  const w = world();
  const prod = await add(w, entity('prod', 'nowhere', true));
  ui.quickPickAnswers = [[{ label: SENDER.email, member: TEAM_MEMBER }]];
  ui.inputs = [PIN, PIN];

  await w.inbox.shareNodes(RECIPIENT.accountId, [prod]);

  assert.deepEqual(w.delivered, []);
  // Said as what it is — the folder sentence ("holds no entities") would be false about an entry.
  assert.ok(ui.infos.includes('"prod" is marked Not for export — nothing to share.'), ui.infos.join(' | '));
});

test('accepting an UPDATE keeps the mark the recipient set on their copy', async () => {
  // The sender's payload never carries the mark (a marked entry does not leave), so rebuilding the
  // node from it on "Update it" dropped the recipient's own mark silently — and their next folder
  // share sent the entry on (own review, correctness).
  const w = world();
  ui.inputs = [PIN];
  await w.inbox.acceptOne(sealedShare(payloadFor('prod api', 'sender-side-id'), PIN));
  const [mine] = w.storage.getNodes(RECIPIENT.accountId);
  await w.storage.updateNode(RECIPIENT.accountId, { ...mine, details: { ...mine.details!, notForExport: true } });

  ui.inputs = [PIN];
  ui.warningAnswer = 'Update it';
  await w.inbox.acceptOne(sealedShare(payloadFor('prod api v2', 'sender-side-id'), PIN));

  const [updated] = w.storage.getNodes(RECIPIENT.accountId);
  assert.equal(updated.name, 'prod api v2', 'the update itself landed');
  assert.equal(updated.details?.notForExport, true);
});
