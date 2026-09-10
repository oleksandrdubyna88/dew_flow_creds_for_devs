import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { KEY_ID, PIN, RECIPIENT, SENDER, TEAM_MEMBER, payloadFor, sealedShare, ui, world } from './shareWorld';
import { TreeNode } from '../types';

/**
 * The defect this change exists for: a share that will not open leaves NOTHING behind.
 *
 * <p>Reported 2026-09-10 — a sender on Windows and a recipient on macOS, both on 1.4.0, where every
 * server share and every password-protected export failed at the far end while the same sender's
 * shares to a third person on Windows worked in both directions, twice. Three different things can
 * cause that and the toast names only one of them ("does not decrypt with that PIN"), so the report
 * arrived as a screenshot of a toast with nothing attached and could not be taken further.</p>
 *
 * <p>Both accept paths are covered because the BATCH one is the worse of the two: the per-PIN
 * `try/catch` in `resolveShares` swallows the exception so the round can move on to the next item,
 * so a mixed batch could report "accepted 1, 1 still pending" with no record anywhere of what
 * happened to the second.</p>
 *
 * <p>The harness is `shareWorld.ts`, the same one `shareInbox.test.ts` drives — real `sealShare`
 * and `openShare`, not stubs of them, so what is asserted here is what the real crypto reports.</p>
 */

const failures = (logged: { message: string }[]): string[] =>
  logged.filter((line) => line.message.includes('ACCEPT FAILED')).map((line) => line.message);

test('a single accept that fails writes a line naming what could not be told apart', async () => {
  const w = world();
  const share = sealedShare(payloadFor('ionos server', 'sender-1'), PIN);
  // The reported symptom, reproduced exactly: the right PIN with one character the chat added.
  ui.inputs = [`${PIN} `];

  await w.inbox.acceptOne(share);

  assert.equal(failures(w.logged).length, 1, `nothing was written; got ${JSON.stringify(w.logged)}`);
  const line = failures(w.logged)[0];
  // The three fields a reader compares, in the order `shareDiagnostics.ts`'s header prescribes.
  assert.match(line, /blob=[0-9a-f]{8}/);
  assert.match(line, /key=[0-9a-f]{8}/);
  assert.match(line, /aad=\{/);
  // And the one that names THIS failure without anybody having to compare anything at all.
  assert.match(line, new RegExp(`pin len=${PIN.length + 1} .* ws=trailing`));
  assert.match(line, /entity=ionos server/);
  assert.match(line, new RegExp(`keyId=${KEY_ID}`));
  assert.match(line, /reason=wrong-password/);
  assert.ok(!line.includes(PIN), `the secret leaked: ${line}`);
});

test('a BATCH accept reports the item that failed, not just a count of what is pending', async () => {
  const w = world();
  const opens = sealedShare(payloadFor('opens fine', 'sender-1'), PIN);
  const resists = sealedShare(payloadFor('will not open', 'sender-2'), 'a-different-share-pin');
  // One PIN for both, then Escape — the round-robin's normal shape.
  ui.inputs = [PIN, undefined];

  await w.inbox.acceptMany([opens, resists]);

  // Exactly one line, for exactly the item that did not open. This is the path that used to
  // swallow the reason with the exception and report only "1 still pending".
  const lines = failures(w.logged);
  assert.equal(lines.length, 1, `expected one failure line; got ${JSON.stringify(w.logged)}`);
  assert.match(lines[0], /entity=will not open/);
  assert.match(lines[0], /reason=wrong-password/);
  assert.ok(!lines[0].includes('opens fine'));
});

test('a share that opens writes no failure line, and the send half is recorded', async () => {
  const w = world();
  const share = sealedShare(payloadFor('ionos server', 'sender-1'), PIN);
  ui.inputs = [PIN];

  await w.inbox.acceptOne(share);

  assert.deepEqual(failures(w.logged), []);
});

test('the sender records its half, so the two machines have something to compare', async () => {
  const w = world();
  const node: TreeNode = {
    id: 'sender-side-ionos',
    name: 'ionos server',
    type: 'entity',
    parentId: null,
    details: { id: 'sender-side-ionos', name: 'ionos server', isSshEnabled: true },
  };
  await w.storage.addNode(RECIPIENT.accountId, node);
  await w.storage.setPassword(RECIPIENT.accountId, node.id, 'pw');
  ui.quickPickAnswers = [[{ label: SENDER.email, member: TEAM_MEMBER }]];
  ui.inputs = [PIN, PIN];

  await w.inbox.shareNodes(RECIPIENT.accountId, [node]);

  const sent = w.logged.filter((line) => line.message.includes('share SENT')).map((line) => line.message);
  assert.equal(sent.length, 1, `nothing was recorded; got ${JSON.stringify(w.logged)}`);
  // The same three fields the recipient's line carries, so one can be laid beside the other.
  assert.match(sent[0], /blob=[0-9a-f]{8}/);
  assert.match(sent[0], /key=[0-9a-f]{8}/);
  assert.match(sent[0], new RegExp(`pin len=${PIN.length} `));
  assert.match(sent[0], /entity/i);
  assert.ok(!sent[0].includes(PIN), `the secret leaked: ${sent[0]}`);
});
