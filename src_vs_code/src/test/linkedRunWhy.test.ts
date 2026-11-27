import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { journalLine, linkedRunRefused, terminalRunAction } from '../agentUseActions';
import { sshLinkOf } from '../remoteLaunch';
import type { TreeNode } from '../types';
import { ACCOUNT_1, AgentStorage, GateWorld, agentStorage, detailsOf, gateWorld, terminalNode, trashFolder, usableSsh } from './agentSshWorld';

/**
 * The journal reason of a linked run (N9; `todo/PLAN_agent_small_truths_n8_n9_n2.md` section 2.2, rows W1-W3 and WG1-WG3).
 *
 * <p>In a vault that does not change during the call `sshLinkOf` refuses a folder and a trashed entry first, each with its own reason, so
 * `whyUnusable` is never asked about them. These rows give it the states anyway, in the shape of row L6 of `agentSshGate.test.ts`: the first
 * read of `s1` answers a usable SSH entry (so the link is `linked`), and each later read answers the nodes of the case. The reason must
 * come from the node for each state that the lookup refuses, and the agent's answer must not change by a byte.</p>
 */

/** The agent's answer for a closed SSH entry, in the same world shape: the bytes that every cause must give. */
const REFUSED = { ok: false, code: 'denied', message: linkedRunRefused('deploy') };

/** A world whose `s1` is a usable SSH entry at the link's read and `later` at each read after it (the nodes of the case). */
function changingWorld(later: readonly TreeNode[]): GateWorld {
  const base = agentStorage({ [ACCOUNT_1]: [terminalNode(), usableSsh('s1')] });
  const after = agentStorage({ [ACCOUNT_1]: [terminalNode(), ...later] });
  let readsOfS1 = 0;
  const storage: AgentStorage = {
    ...base,
    getNode: (account, id) => {
      if (id !== 's1') {
        return after.getNode(account, id);
      }
      readsOfS1 += 1;
      return readsOfS1 > 1 ? after.getNode(account, id) : base.getNode(account, id);
    },
  };
  return gateWorld({ storage });
}

/** The guards WG1 and WG2: the agent's answer is the one sentence, nothing ran, and the note names no SSH entry, id or host. */
function assertOnlyTheReasonChanged(w: GateWorld, reason: string): void {
  const result = terminalRunAction(w.deps).validate({}, w.ctx);

  assert.deepEqual(result, REFUSED);
  assert.deepEqual(w.notes, [journalLine('deploy', reason)]);
  assert.equal(w.overSsh.calls.length, 0, 'nothing ran');
  assert.equal(w.slots.taken, 0, 'no slot was taken');
  assert.equal(w.trustReads.count, 0, 'the trust store was not read');
  for (const named of ['prod box', 'prod.example', 's1']) {
    assert.ok(!w.notes[0]!.includes(named), `the note names ${named}: ${w.notes[0]}`);
  }
}

test('W1: the journal says the SSH entry is in the Trash when the node is under the Trash at the gate, its switch on', () => {
  const w = changingWorld([trashFolder(), { ...usableSsh('s1'), parentId: 'trash' }]);

  assertOnlyTheReasonChanged(w, 'the SSH entry is in the Trash');
});

test('W2: the journal says the SSH link points to a folder when the node is a folder at the gate', () => {
  const w = changingWorld([{ id: 's1', name: 'a folder', type: 'folder', parentId: null }]);

  assertOnlyTheReasonChanged(w, 'the SSH link points to a folder, not to an entry');
});

test('W3: the Trash is the reason also when the entry under it has a PIN of its own', () => {
  const w = changingWorld([trashFolder(), { ...usableSsh('s1', { pinProtected: true }), parentId: 'trash' }]);

  assertOnlyTheReasonChanged(w, 'the SSH entry is in the Trash');
});

test('WG3: in a vault that does not change, a link to a folder keeps the reason that sshLinkOf gives, and the agent reads the one sentence', () => {
  const w = gateWorld({ acct1: [{ id: 's1', name: 'a folder', type: 'folder', parentId: null }] });
  const link = sshLinkOf(detailsOf(w, 'e1'), (id) => w.storage.getNode(ACCOUNT_1, id));
  assert.equal(link.kind, 'refused', 'the world is meant to be refused by the link');
  const reason = (link as { reason: string }).reason;

  const result = terminalRunAction(w.deps).validate({}, w.ctx);

  assert.deepEqual(result, REFUSED);
  assert.deepEqual(w.notes, [journalLine('deploy', reason)]);
  assert.ok(reason.includes('no longer in this vault'), reason);
});
