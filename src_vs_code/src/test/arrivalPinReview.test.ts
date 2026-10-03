import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isExternalBundle } from '../externalBundle';
import type { EntityMetadata, TreeNode } from '../types';
import { protectEntity } from '../entityPin';
import { ACCOUNT, PIN } from './pinWorld';
import { Arrivals, FIRST_PIN, FOLDER_BOX, NOTE, SECRET, TRANSIT, arrivals, boxes, folderShare, infos, owned, sealedUnder } from './arrivalWorld';

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

/**
 * A CredsForDevs export of a folder that ASKS for a PIN: the export strips `pinProtected` from its entries but
 * keeps the folder's `folderAsksForPin` — `alpha` inside `Vault`, and `loose` at the bundle's root.
 */
function preferringBundle(): string {
  const entry = (id: string, name: string, parentId: string | null): TreeNode => ({
    id, name, type: 'entity', parentId, details: { id, name, isSshEnabled: false } as EntityMetadata,
  });
  const bundle = {
    format: 'creds-for-devs-external',
    version: 1,
    nodes: [{ id: 'b-vault', name: 'Vault', type: 'folder', parentId: null, folderType: 'any', folderAsksForPin: true }, entry('b-alpha', 'alpha', 'b-vault'), entry('b-loose', 'loose', null)],
    secrets: {
      'b-alpha': { password: `${SECRET}-alpha`, notes: `${NOTE}-alpha` },
      'b-loose': { password: `${SECRET}-loose`, notes: `${NOTE}-loose` },
    },
  };
  assert.ok(isExternalBundle(bundle), 'the fixture is not a bundle the import accepts');
  return JSON.stringify(bundle);
}

test('a bundle that recreates a folder asking for a PIN seals what lands in it — one first PIN — even at the root', async () => {
  const w = await arrivals({}, [FIRST_PIN, FIRST_PIN]);

  await w.importInto('credSshManager.importExternal', '', '/exports/handover.json', preferringBundle());

  assert.equal(boxes(w, FIRST_PIN_BOX), 2, `the folder that asks was recreated and filled with no question: ${w.events.join(' | ')}`);
  const byName = new Map(w.entries().map((n) => [n.name, n]));
  await sealedUnder(w, byName.get('alpha') as TreeNode, FIRST_PIN);
  assert.deepEqual(w.written.filter((v) => v.includes(`${SECRET}-alpha`) || v.includes(`${NOTE}-alpha`)), [], 'alpha reached the keychain in the clear (R3)');
  const loose = byName.get('loose') as TreeNode;
  assert.equal(await w.storage.getPassword(ACCOUNT, loose.id), `${SECRET}-loose`, 'an entry outside the folder that asks is written as before');
});

test('declined, nothing of what that folder would hold is written — not the folder either — and the rest of the bundle lands', async () => {
  const w = await arrivals({}, [undefined]);

  await w.importInto('credSshManager.importExternal', '', '/exports/handover.json', preferringBundle());

  assert.equal(w.folderId('Vault'), undefined, 'the folder that asks was written for an entry a decline kept out');
  assert.deepEqual(w.entries().map((n) => n.name), ['loose']);
  assert.match(infos(w), /1 not imported: "alpha" — the folder "Vault" asks for a PIN on every entry in it, and none was given/, infos(w));
});

/** The sender's id every share of one entry carries, so a second share of it is an UPDATE candidate. */
const SAME_ENTRY = 'same-sender-entry';

/**
 * Accept `old-db` at the root, then protect the local copy with `PIN` the way Protect does — the entry a
 * later share of the same sender updates. The write log and the events start empty after it.
 */
async function protectedRootEntry(w: Arrivals): Promise<string> {
  w.inputs.push(TRANSIT);
  await w.inbox.acceptOne(owned(folderShare('old-db', [], {}, SAME_ENTRY)));
  const [entry] = w.entries();
  await protectEntity(w.storage, ACCOUNT, entry.id, PIN);
  await w.storage.updateDetailsFields(ACCOUNT, entry.id, { pinProtected: true });
  w.written.length = 0;
  w.events.length = 0;
  return entry.id;
}

test('a declined door on Update it writes nothing — not even the folders the share would have placed the entry in', async () => {
  const w = await arrivals({}, []);
  const id = await protectedRootEntry(w);

  w.inputs.push(TRANSIT, undefined);
  w.s.modalAnswers.push('Update it');
  await w.inbox.acceptOne(owned(folderShare('new-db', ['Fresh'], {}, SAME_ENTRY)));

  assert.equal(w.folderId('Fresh'), undefined, 'an empty folder was written for an update whose door was declined');
  assert.equal(w.storage.getNode(ACCOUNT, id)?.name, 'old-db', 'the entry was updated although its door was declined');
  assert.equal(w.removed.length, 1, 'the declined update consumed its share');
});

/** Accept `old-db` at the root, unprotected — the entry a later share of the same sender updates. */
async function plainRootEntry(w: Arrivals): Promise<string> {
  w.inputs.push(TRANSIT);
  await w.inbox.acceptOne(owned(folderShare('old-db', [], {}, SAME_ENTRY)));
  const [entry] = w.entries();
  w.written.length = 0;
  w.events.length = 0;
  return entry.id;
}

/** The arriving values of `new-db`, as any keychain write that carried them in the clear would show them. */
function newValuesInTheClear(w: Arrivals): string[] {
  return w.written.filter((v) => v.includes(`${SECRET}-new-db`) || v.includes(`${NOTE}-new-db`));
}

test('Update it that moves an unprotected root entry into a folder that asks is asked that folder’s PIN, and seals what arrives', async () => {
  const w = await arrivals({ protectedIn: ['Production'] }, []);
  const id = await plainRootEntry(w);

  w.inputs.push(TRANSIT, PIN);
  w.s.modalAnswers.push('Update it', 'Use this PIN');
  await w.inbox.acceptOne(owned(folderShare('new-db', ['Production'], {}, SAME_ENTRY)));

  assert.deepEqual(newValuesInTheClear(w), [], 'the update moved the entry into a folder that asks and wrote what arrived in the clear');
  const entry = w.storage.getNode(ACCOUNT, id) as TreeNode;
  assert.equal(entry.parentId, w.folderId('Production'), 'precondition: the update placed the root entry in the share’s folder');
  await sealedUnder(w, entry, PIN);
});

test('declined, an Update it into a folder that asks writes nothing, and the share stays', async () => {
  const w = await arrivals({ protectedIn: ['Production'] }, []);
  const id = await plainRootEntry(w);

  w.inputs.push(TRANSIT, undefined);
  w.s.modalAnswers.push('Update it');
  await w.inbox.acceptOne(owned(folderShare('new-db', ['Production'], {}, SAME_ENTRY)));

  assert.deepEqual(w.written, [], 'the keychain was written although the folder’s PIN was declined');
  const entry = w.storage.getNode(ACCOUNT, id) as TreeNode;
  assert.equal(entry.name, 'old-db');
  assert.equal(entry.parentId, null, 'the entry was moved although the folder’s PIN was declined');
  assert.equal(w.removed.length, 1, 'the declined update consumed its share');
  assert.ok(w.s.infos.some((m) => m.includes('"Production" asks for a PIN on every entry in it')), infos(w));
});
