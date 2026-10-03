import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { isExternalBundle } from '../externalBundle';
import type { EntityMetadata, TreeNode } from '../types';
import type { ImportedEntity } from '../importFormats';
import { ACCOUNT, PIN } from './pinWorld';
import {
  Arrivals, FIRST_PIN, FOLDER_BOX, NOTE, SECRET, TRANSIT,
  arrivals, boxes, folderShare, infos, neverInTheClear, opened, owned, sealedUnder,
} from './arrivalWorld';

/**
 * A folder that asks for a PIN asks it too when a share or an import lands in it
 * (`PLAN_pin_folder_asks_on_accept_and_import.md`).
 *
 * <p>The person's Add and an agent's create into a folder whose entries are protected ask the folder's PIN
 * and seal every value before its first write (rule R3). An accepted share and an import wrote their new
 * ids through the plain writer — no question, no mark — so the folder kept reading as protected while it
 * held entries in the clear. These tests drive the REAL `ShareInbox` (and the registered import commands)
 * over the real `StorageManager` with every keychain write logged (`pinWorld.ts`, the `addEntityPin.test.ts`
 * pattern): R3 is about the moment between two writes, which a final state cannot show.</p>
 */

// ---------------------------------------------------------------------------------------------
// B3 — one accepted share into a folder that asks is sealed under its PIN.
// ---------------------------------------------------------------------------------------------

test('an accepted folder share into a folder whose entries are protected is sealed under the folder’s PIN before its first write', async () => {
  const w = await arrivals({ protectedIn: ['Production'] }, [TRANSIT, PIN]);
  w.s.modalAnswers.push('Use this PIN');

  await w.inbox.acceptOne(owned(folderShare('prod-db', ['Production'])));

  neverInTheClear(w);
  const [entry] = w.entries();
  assert.ok(entry !== undefined, `nothing arrived: ${infos(w)}`);
  assert.equal(entry.parentId, w.folderId('Production'), 'it landed in the folder its chain names');
  await sealedUnder(w, entry, PIN);
  assert.equal(boxes(w, FOLDER_BOX), 1, 'the question Add asks in that folder, once');
  assert.equal(w.removed.length, 1, 'the share was consumed');
  assert.ok(w.s.infos.includes('Accepted "prod-db".'), infos(w));
});

test('declining the folder’s PIN writes nothing — no value, no node — and the share stays pending, with the reason said', async () => {
  const w = await arrivals({ protectedIn: ['Production'] }, [TRANSIT, undefined]);

  await w.inbox.acceptOne(owned(folderShare('prod-db', ['Production'])));

  assert.deepEqual(w.written, [], 'the keychain was written although the folder’s PIN was declined');
  assert.deepEqual(w.entries(), [], 'a node arrived although the folder’s PIN was declined');
  assert.deepEqual(w.removed, [], 'the share was consumed — the only copy of it');
  assert.ok(w.s.infos.some((m) => m.includes('"Production" asks for a PIN on every entry in it')), infos(w));
  assert.deepEqual(w.s.infos.filter((m) => m.startsWith('Accepted')), [], infos(w));
});

test('a folder that asks by its preference: the subfolder the share creates is asked once, sealed, and created only then', async () => {
  const w = await arrivals({ prefersIn: ['Production'] }, [TRANSIT, FIRST_PIN, FIRST_PIN]);

  await w.inbox.acceptOne(owned(folderShare('prod-db', ['Production', 'db'])));

  neverInTheClear(w);
  const db = w.folderId('db');
  assert.ok(db !== undefined, 'the subfolder the chain names was not created');
  const [entry] = w.entries();
  assert.equal(entry?.parentId, db);
  await sealedUnder(w, entry, FIRST_PIN);
});

test('declined there, not even the subfolder the share would have created is written', async () => {
  const w = await arrivals({ prefersIn: ['Production'] }, [TRANSIT, undefined]);

  await w.inbox.acceptOne(owned(folderShare('prod-db', ['Production', 'db'])));

  assert.equal(w.folderId('db'), undefined, 'a folder shell was written for a declined arrival');
  assert.deepEqual(w.entries(), []);
  assert.deepEqual(w.written, []);
  assert.deepEqual(w.removed, []);
});

test('a share whose chain names no existing folder, and a single-entry share, ask nothing and land as before', async () => {
  const w = await arrivals({ protectedIn: ['Production'] }, [TRANSIT, TRANSIT]);

  await w.inbox.acceptOne(owned(folderShare('elsewhere-db', ['Elsewhere'])));
  await w.inbox.acceptOne(owned(folderShare('root-db', [])));

  assert.equal(boxes(w, FOLDER_BOX), 0, 'a folder PIN was asked where no folder asks');
  const names = w.entries().map((n) => n.name).sort();
  assert.deepEqual(names, ['elsewhere-db', 'root-db']);
  for (const entry of w.entries()) {
    assert.equal(await w.storage.getPassword(ACCOUNT, entry.id), `${SECRET}-${entry.name}`, 'written as before, under the vault alone');
    assert.equal(entry.details?.pinProtected, undefined);
  }
});

test('a folder that only HOLDS protected entries does not reach a subfolder the share creates (§9.1)', async () => {
  const w = await arrivals({ protectedIn: ['Production'] }, [TRANSIT]);

  await w.inbox.acceptOne(owned(folderShare('prod-db', ['Production', 'db'])));

  assert.equal(boxes(w, FOLDER_BOX), 0, 'Add into an empty subfolder of it asks nothing, and neither does an arrival');
  const [entry] = w.entries();
  assert.equal(entry?.parentId, w.folderId('db'));
  assert.equal(await w.storage.getPassword(ACCOUNT, entry.id), `${SECRET}-prod-db`);
});

// ---------------------------------------------------------------------------------------------
// B4 — a batch asks once per folder, and never inside the lease.
// ---------------------------------------------------------------------------------------------

/** The modals that asked to agree to the count a typed PIN opens — Add's *Use this PIN*. */
function agreements(w: Arrivals): number {
  return w.events.filter((e) => e.startsWith('modal:This PIN opens')).length;
}

test('acceptMany over three shares into one protected folder asks its PIN once — one box, one Use this PIN — and seals all three', async () => {
  const w = await arrivals({ protectedIn: ['Production'] }, [TRANSIT, PIN]);
  w.s.modalAnswers.push('Use this PIN');

  await w.inbox.acceptMany(['alpha', 'beta', 'gamma'].map((name) => owned(folderShare(name, ['Production']))));

  assert.equal(boxes(w, FOLDER_BOX), 1, `the folder was asked once per share: ${w.events.join(' | ')}`);
  assert.equal(agreements(w), 1, 'one agreement for the whole batch');
  neverInTheClear(w);
  const entries = w.entries();
  assert.equal(entries.length, 3, infos(w));
  for (const entry of entries) {
    await sealedUnder(w, entry, PIN);
  }
  assert.ok(w.s.infos.includes('Accepted 3 item(s).'), infos(w));
});

test('two folders are two questions; the first declined leaves its shares pending and named, and the second is still asked', async () => {
  const w = await arrivals({ protectedIn: ['Production', 'Staging'] }, [TRANSIT, undefined, PIN]);
  w.s.modalAnswers.push('Use this PIN');

  await w.inbox.acceptMany([
    owned(folderShare('alpha', ['Production'])),
    owned(folderShare('beta', ['Production'])),
    owned(folderShare('gamma', ['Staging'])),
  ]);

  assert.equal(boxes(w, FOLDER_BOX), 2, `one question per folder: ${w.events.join(' | ')}`);
  assert.deepEqual(w.entries().map((n) => n.name), ['gamma'], 'only the share into the folder that was answered arrived');
  await sealedUnder(w, w.entries()[0], PIN);
  assert.deepEqual(w.removed.map((share) => share.item.entityName), ['gamma'], 'the declined folder’s shares stay in the inbox');
  const tally = w.s.infos.find((m) => m.startsWith('Accepted')) ?? '';
  assert.match(tally, /^Accepted 1 item\(s\), 2 still pending\./, infos(w));
  assert.match(tally, /"Production"/, `the tally does not name the declined folder: ${tally}`);
});

test('the answer spans the whole conversation: shares opened by two transit PINs into one folder are one question', async () => {
  const w = await arrivals({ protectedIn: ['Production'] }, [TRANSIT, PIN, 'transit-pin-2222']);
  w.s.modalAnswers.push('Use this PIN');

  await w.inbox.acceptMany([owned(folderShare('alpha', ['Production'])), owned(folderShare('beta', ['Production']), 'transit-pin-2222')]);

  assert.equal(boxes(w, FOLDER_BOX), 1, `asked again in the second PIN round: ${w.events.join(' | ')}`);
  assert.equal(w.entries().length, 2, infos(w));
  for (const entry of w.entries()) {
    await sealedUnder(w, entry, PIN);
  }
});

test('no lease is held across the folder’s PIN box — a second window’s runOrSkip from inside the box runs', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arrival-lease-'));
  try {
    const w = await arrivals({ protectedIn: ['Production'], lockDir: dir }, [TRANSIT, PIN]);
    w.s.modalAnswers.push('Use this PIN');
    // The control: the probe CAN see a held lease — from inside this window's own write, it is skipped.
    const control = await w.storage.writes.run(() => w.probe());
    assert.equal(control, 'skipped', 'the probe cannot see a held lease, so it proves nothing');

    await w.inbox.acceptMany([owned(folderShare('alpha', ['Production'])), owned(folderShare('beta', ['Production']))]);

    assert.ok(w.probes.length > 0, 'precondition: the folder’s PIN box was raised');
    assert.deepEqual(w.probes.filter((p) => p !== 'ran'), [], 'the folder’s PIN box was raised while this window held the lease');
    assert.equal(w.entries().length, 2, infos(w));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------------------
// B5 — the sender's protection and the folder's ask are one question.
// ---------------------------------------------------------------------------------------------

/** The recipient's OWN PIN box for an entry its sender had protected (`shareRecipientPin` → `newPin`). */
const OWN_PIN_BOX = (name: string): RegExp => new RegExp(`A PIN for "${name}"$`);
const OWN_PIN = 'recipient-own-9753';

test('a share its sender protected, into a folder that asks, is asked ONE question — the folder’s — and sealed under the folder’s PIN', async () => {
  const w = await arrivals({ protectedIn: ['Production'] }, [TRANSIT, PIN, OWN_PIN, OWN_PIN]);
  w.s.modalAnswers.push('Use this PIN');

  await w.inbox.acceptOne(owned(folderShare('prod-db', ['Production'], { pinAskOnImport: true })));

  assert.equal(boxes(w, OWN_PIN_BOX('prod-db')), 0, `the recipient’s own PIN was asked as well as the folder’s: ${w.events.join(' | ')}`);
  assert.equal(boxes(w, FOLDER_BOX), 1, `the folder was not asked: ${w.events.join(' | ')}`);
  neverInTheClear(w);
  const [entry] = w.entries();
  assert.ok(entry !== undefined, infos(w));
  assert.equal(entry.details?.pinAskOnImport, undefined, 'the sender’s instruction is spent — the folder’s PIN acted on it');
  await sealedUnder(w, entry, PIN);
});

test('into a folder that asks nothing, the sender’s protection still asks the recipient’s own PIN, as before', async () => {
  const w = await arrivals({}, [TRANSIT, OWN_PIN, OWN_PIN]);

  await w.inbox.acceptOne(owned(folderShare('prod-db', [], { pinAskOnImport: true })));

  assert.equal(boxes(w, OWN_PIN_BOX('prod-db')), 2, 'typed twice');
  const [entry] = w.entries();
  assert.ok(entry !== undefined, infos(w));
  assert.equal(entry.details?.pinProtected, true);
  assert.equal(await opened(await w.storage.getPassword(ACCOUNT, entry.id), OWN_PIN), `${SECRET}-prod-db`);
});

test('an update candidate asks the recipient’s own PIN only AFTER Update it — and not at all when the question is dismissed', async () => {
  const w = await arrivals({}, [TRANSIT]);
  await w.inbox.acceptOne(owned(folderShare('prod-db', [], {}, 'same-sender-id')));
  w.events.length = 0;

  w.inputs.push(TRANSIT);
  w.s.modalAnswers.push(undefined);
  await w.inbox.acceptOne(owned(folderShare('prod-db', [], { pinAskOnImport: true }, 'same-sender-id')));
  assert.equal(boxes(w, OWN_PIN_BOX('prod-db')), 0, `a PIN was asked for a share the person then dismissed: ${w.events.join(' | ')}`);

  w.events.length = 0;
  w.inputs.push(TRANSIT, OWN_PIN, OWN_PIN);
  w.s.modalAnswers.push('Update it');
  await w.inbox.acceptOne(owned(folderShare('prod-db', [], { pinAskOnImport: true }, 'same-sender-id')));
  const question = w.events.findIndex((e) => e.startsWith('modal:') && e.includes('already came from'));
  const own = w.events.findIndex((e) => e.startsWith('box:') && OWN_PIN_BOX('prod-db').test(e));
  assert.ok(question >= 0 && own > question, `the own PIN must come after Update it: ${w.events.join(' | ')}`);
});

// ---------------------------------------------------------------------------------------------
// B6 — an import from another tool honours the folder.
// ---------------------------------------------------------------------------------------------

/** A CSV export as a password manager writes it — one row per entry, each filed under `folder`. */
function csvExport(names: readonly string[], folder = 'Team'): string {
  return ['name,password,notes,folder', ...names.map((name) => `${name},${SECRET}-${name},${NOTE}-${name},${folder}`)].join('\n');
}

test('an import from another tool into a folder that asks is sealed under its PIN before its first write — one question for the whole file', async () => {
  const w = await arrivals({ prefersIn: ['Production'] }, [FIRST_PIN, FIRST_PIN]);
  w.s.modalAnswers.push('Import');

  await w.importInto('credSshManager.importFrom', 'Production', '/exports/bitwarden.csv', csvExport(['alpha', 'beta']));

  neverInTheClear(w);
  assert.equal(w.events.filter((e) => e.startsWith('box:')).length, 2, `one first PIN, typed twice, for both entries: ${w.events.join(' | ')}`);
  const team = w.folderId('Team');
  assert.equal(w.storage.getNode(ACCOUNT, team ?? '')?.parentId, w.folderId('Production'), 'the file’s folder lands in the folder it was imported into');
  assert.deepEqual(w.entries().map((n) => n.name).sort(), ['alpha', 'beta']);
  for (const entry of w.entries()) {
    assert.equal(entry.parentId, team);
    await sealedUnder(w, entry, FIRST_PIN);
  }
});

test('declined, the import writes nothing of what that folder would have held — not even the folder made for it — and says which entries it skipped', async () => {
  const w = await arrivals({ prefersIn: ['Production'] }, [undefined]);
  w.s.modalAnswers.push('Import');

  await w.importInto('credSshManager.importFrom', 'Production', '/exports/bitwarden.csv', csvExport(['alpha', 'beta']));

  assert.deepEqual(w.written, [], 'the keychain was written although the folder’s PIN was declined');
  assert.deepEqual(w.entries(), []);
  assert.equal(w.folderId('Team'), undefined, 'a folder was made for entries a decline kept out');
  const said = infos(w);
  assert.match(said, /Imported 0 entr\(ies\)/, said);
  assert.match(said, /2 not imported: "alpha" — the folder "Production" asks for a PIN on every entry in it, and none was given; "beta"/, said);
});

test('importEntities: a declined destination skips only its own entries — the rest of the file is imported', async () => {
  const w = await arrivals({ protectedIn: ['Production'] }, [undefined]);
  const parentId = w.folderId('Production') ?? null;
  const entity = (name: string, folder?: string): ImportedEntity => ({
    name,
    ...(folder === undefined ? {} : { folder }),
    details: { name, isSshEnabled: false },
    secrets: { password: `${SECRET}-${name}` },
  });

  const outcome = await w.importEntities({ accountId: ACCOUNT, parentId }, [entity('direct'), entity('filed', 'Other')]);

  assert.equal(outcome.created, 1);
  assert.deepEqual(outcome.skipped, ['"direct" — the folder "Production" asks for a PIN on every entry in it, and none was given']);
  const [filed] = w.entries();
  assert.equal(filed?.name, 'filed', 'a folder that only HOLDS protected entries does not reach a folder the import makes (§9.1)');
  assert.equal(await w.storage.getPassword(ACCOUNT, filed.id), `${SECRET}-filed`);
});

// ---------------------------------------------------------------------------------------------
// B7 — a CredsForDevs bundle import honours the folder.
// ---------------------------------------------------------------------------------------------

/** A plain CredsForDevs export: `alpha` at its root, `beta` inside its folder `Team` — checked by the real validator. */
function bundleFile(): string {
  const entry = (id: string, name: string, parentId: string | null): TreeNode => ({
    id, name, type: 'entity', parentId, details: { id, name, isSshEnabled: false } as EntityMetadata,
  });
  const bundle = {
    format: 'creds-for-devs-external',
    version: 1,
    nodes: [entry('b-alpha', 'alpha', null), { id: 'b-team', name: 'Team', type: 'folder', parentId: null, folderType: 'any' }, entry('b-beta', 'beta', 'b-team')],
    secrets: {
      'b-alpha': { password: `${SECRET}-alpha`, notes: `${NOTE}-alpha` },
      'b-beta': { password: `${SECRET}-beta`, notes: `${NOTE}-beta` },
    },
  };
  assert.ok(isExternalBundle(bundle), 'the fixture is not a bundle the import accepts — every assertion below would be about nothing');
  return JSON.stringify(bundle);
}

test('a bundle imported into a folder that asks is sealed under its PIN before its first write — at most one question for the whole bundle', async () => {
  const w = await arrivals({ prefersIn: ['Production'] }, [FIRST_PIN, FIRST_PIN]);

  await w.importInto('credSshManager.importExternal', 'Production', '/exports/handover.json', bundleFile());

  neverInTheClear(w);
  assert.equal(w.events.filter((e) => e.startsWith('box:')).length, 2, `one first PIN, typed twice, for the whole bundle: ${w.events.join(' | ')}`);
  assert.deepEqual(w.entries().map((n) => n.name).sort(), ['alpha', 'beta']);
  for (const entry of w.entries()) {
    await sealedUnder(w, entry, FIRST_PIN);
  }
  assert.equal(w.storage.getNode(ACCOUNT, w.folderId('Team') ?? '')?.parentId, w.folderId('Production'));
});

test('declined, nothing of the bundle under that folder is written — no value, no entry, no folder — and the message says so', async () => {
  const w = await arrivals({ prefersIn: ['Production'] }, [undefined]);

  await w.importInto('credSshManager.importExternal', 'Production', '/exports/handover.json', bundleFile());

  assert.deepEqual(w.written, [], 'the keychain was written although the folder’s PIN was declined');
  assert.deepEqual(w.entries(), []);
  assert.equal(w.folderId('Team'), undefined, 'the bundle’s folder was written for entries a decline kept out');
  assert.match(infos(w), /Imported 0 node\(s\) from handover\.json\. 2 not imported: "alpha" — the folder "Production" asks for a PIN/, infos(w));
});

test('a folder that only HOLDS protected entries seals the bundle’s root entry under its PIN, and not the entry in a folder the bundle makes (§9.1)', async () => {
  const w = await arrivals({ protectedIn: ['Production'] }, [PIN]);
  w.s.modalAnswers.push('Use this PIN');

  await w.importInto('credSshManager.importExternal', 'Production', '/exports/handover.json', bundleFile());

  assert.equal(boxes(w, FOLDER_BOX), 1, w.events.join(' | '));
  const byName = new Map(w.entries().map((n) => [n.name, n]));
  await sealedUnder(w, byName.get('alpha') as TreeNode, PIN);
  assert.deepEqual(w.written.filter((v) => v.includes(`${SECRET}-alpha`) || v.includes(`${NOTE}-alpha`)), [], 'the root entry reached the keychain in the clear before it was sealed (R3)');
  const beta = byName.get('beta') as TreeNode;
  assert.equal(await w.storage.getPassword(ACCOUNT, beta.id), `${SECRET}-beta`, 'Add into an empty subfolder of it asks nothing, and neither does a bundle');
});
