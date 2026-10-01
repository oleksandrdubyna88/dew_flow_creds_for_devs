import assert from 'node:assert/strict';
import { test } from 'node:test';
import { protectEntity } from '../entityPin';
import { ui, RECIPIENT, PIN, payloadFor, sealedShare, world } from './shareWorld';

/**
 * A batch accept survives one share being refused (the E2 security review, finding 5).
 *
 * <p>`importOpened` imported the opened shares one after another and caught nothing, so ONE share whose
 * write was refused — an *Update it* into an entry another window protected between the decision and the
 * write (`ProtectedMeanwhile`) — aborted the whole batch: every share after it left unimported, nothing
 * said about which, and no tally. Now each share's failure is that share's: it is kept in the inbox,
 * written to the diagnostic log like any failed accept, and named in the tally; the rest go on.</p>
 */

test('two shares accepted together, the first refused — the second is still imported, and the tally names the first as failed', async () => {
  const w = world();
  ui.inputs = [PIN];
  await w.inbox.acceptOne(sealedShare(payloadFor('prod api', 'sender-side-id'), PIN));
  const [mine] = w.storage.getNodes(RECIPIENT.accountId);
  // The first share updates `prod api`; another window protects it between the update's decision and
  // its first write (the revision of what it was is recorded in between).
  const record = w.storage.recordRevision.bind(w.storage);
  let once = false;
  w.storage.recordRevision = async (a, e, revision) => {
    await record(a, e, revision);
    if (!once) {
      once = true;
      await protectEntity(w.storage, RECIPIENT.accountId, mine.id, '2468');
      await w.storage.updateDetailsFields(RECIPIENT.accountId, mine.id, { pinProtected: true });
    }
  };
  const consumed = w.removed.length;
  const refused = sealedShare(payloadFor('prod api v2', 'sender-side-id'), PIN);
  const fresh = sealedShare(payloadFor('ionos server', 'sender-side-other'), PIN);

  ui.inputs = [PIN];
  ui.warningAnswer = 'Update it';
  const outcome = await w.inbox.acceptMany([refused, fresh]).then(() => 'finished', (error: unknown) => error);

  assert.equal(outcome, 'finished', `one refused share aborted the whole batch: ${String(outcome)}`);
  assert.ok(w.storage.getNodes(RECIPIENT.accountId).some((node) => node.name === 'ionos server'), 'the second share was not imported');
  assert.deepEqual(w.removed.slice(consumed).map((share) => share.item.entityName), ['ionos server'], 'the refused share was consumed — the only copy of the update');
  assert.match(ui.infos[ui.infos.length - 1] ?? '', /Accepted 1 item\(s\), 1 still pending\. Not saved: "prod api v2" — .*was protected with a PIN/, 'the tally does not name the refused share');
  assert.ok(JSON.stringify(w.logged).includes('prod api v2'), 'the refused share left no line in the diagnostic log');
});
