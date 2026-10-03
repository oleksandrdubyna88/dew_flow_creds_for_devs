import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FOLDER_BOX, TRANSIT, arrivals, folderShare, infos, owned } from './arrivalWorld';

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
