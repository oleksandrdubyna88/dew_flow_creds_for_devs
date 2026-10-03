import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FIRST_PIN, FOLDER_BOX, TRANSIT, arrivals, boxes, folderShare, infos, owned, sealedUnder } from './arrivalWorld';

/**
 * The security review of `PLAN_pin_folder_asks_on_accept_and_import.md` (2026-10-03): six findings after
 * the code round, each a test here, RED first, over the same arrival world as `arrivalPin.test.ts`.
 */

test('a folder question that FAILS still ends the batch with its tally, and keeps the shares', async () => {
  const w = await arrivals({ protectedIn: ['Production'] }, [TRANSIT]);
  w.boxRule(FOLDER_BOX, new Error('the input box broke'));

  await w.inbox.acceptMany([owned(folderShare('alpha', ['Production'])), owned(folderShare('beta', ['Production']))])
    .catch((error: unknown) => assert.fail(`acceptMany threw instead of showing its tally: ${String(error)}`));

  const tally = w.s.infos.find((m) => m.startsWith('Accepted')) ?? '';
  assert.match(tally, /^Accepted 0 item\(s\), 2 still pending\./, infos(w));
  assert.deepEqual(w.removed, [], 'a share whose folder question failed was consumed');
  assert.deepEqual(w.entries(), []);
});

/** The first PIN of a folder that asks while holding nothing — typed twice (`pinOnCreate.firstPinHere`). */
const FIRST_PIN_BOX = /A PIN for "this entry"/;

test('a batch is not asked again for a subfolder the same batch created — one question for the whole landing', async () => {
  const w = await arrivals({ prefersIn: ['Production'] }, [TRANSIT, FIRST_PIN, FIRST_PIN]);

  await w.inbox.acceptMany([owned(folderShare('alpha', ['Production', 'Sub'])), owned(folderShare('beta', ['Production', 'Sub']))]);

  assert.equal(boxes(w, FOLDER_BOX), 0, `the subfolder the batch itself created was asked again: ${w.events.join(' | ')}`);
  assert.equal(boxes(w, FIRST_PIN_BOX), 2, 'one first PIN, typed twice, for both shares');
  const entries = w.entries();
  assert.deepEqual(entries.map((n) => n.name).sort(), ['alpha', 'beta'], infos(w));
  for (const entry of entries) {
    assert.equal(entry.parentId, w.folderId('Sub'));
    await sealedUnder(w, entry, FIRST_PIN);
  }
});
