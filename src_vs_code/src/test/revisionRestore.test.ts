import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { SECRET_SLOTS, SecretSlot } from '../entitySlots';
import type { Revision, RevisionSecrets } from '../revisionHistory';
import { readSecret, unlockSecret } from '../secretEnvelope';
import type { StorageManager } from '../storageManager';
import { EntityMetadata, TreeNode } from '../types';
import { loadWithVscode } from './vscodeStub';
import { protectEntity, unprotectEntity } from '../entityPin';
import { protectionDecision } from '../syncPinRule';
import { ACCOUNT, ModalAnswer, PIN, Sinks, clickVscode, locked, memoryStorage, seedEntry, sinks } from './pinWorld';

/**
 * D11 of the entry-PIN plan — *Restore This Version…*.
 *
 * <p>The history row's tooltip said *"Clone it to bring it back"*, and Clone copies metadata only, so
 * the one surviving copy of what an Edit had deleted (D2) was unreachable. Restore writes a kept
 * version back into the SAME entry: through the entry's door, today's state recorded first, every
 * value sealed in memory before the first write when the entry is protected (R3) — so a version from
 * before the PIN comes back sealed — and today's agent access, code-access key and PIN mark kept.</p>
 *
 * <p>Over the REAL `StorageManager`, with the real command registered the way `extension.ts` does.</p>
 */

const ENTRY = 'c1';
const AT = 1_700_000_000_000;

const credential = (over: Partial<EntityMetadata> = {}): EntityMetadata =>
  ({ id: ENTRY, name: 'godaddy', isSshEnabled: false, kind: 'credential', ...over }) as EntityMetadata;

function slot(label: string): SecretSlot {
  const found = SECRET_SLOTS.find((one) => one.label === label);
  assert.ok(found !== undefined, `no slot is called ${label}`);
  return found;
}

interface World {
  restore(): Promise<void>;
  storage: StorageManager;
  s: Sinks;
  /** Every value the keychain was handed since the restore began — R3's evidence. */
  written: string[];
  node(): TreeNode;
}

/** The live entry, one kept version (recorded as the only one), and the command as `extension.ts` registers it. */
async function world(
  live: { details: EntityMetadata; slots: Record<string, string> },
  version: { details?: Partial<EntityMetadata>; name?: string; secrets: RevisionSecrets },
  inputs: (string | undefined)[],
  modal: ModalAnswer[] = ['Restore'],
): Promise<World> {
  const s = sinks();
  s.modalAnswers.push(...modal);
  const stub = clickVscode([...inputs], s);
  const written: string[] = [];
  const storage = memoryStorage(stub, written);
  await seedEntry(storage, live.details, live.slots);
  const name = version.name ?? 'godaddy (old)';
  await storage.recordRevision(ACCOUNT, ENTRY, { at: AT, name, details: { ...live.details, ...version.details, name }, secrets: version.secrets });
  assert.equal((await storage.getHistory(ACCOUNT, ENTRY)).length, 1, 'precondition: the revision validator took the fixture');
  const handlers = new Map<string, (target: unknown) => unknown>();
  const commands = loadWithVscode<typeof import('../pinCommands')>('../pinCommands', stub);
  commands.registerPinCommands({ register: (id, handler) => void handlers.set(id, handler), storage, refresh: () => undefined });
  (require('../envCollectionRef') as typeof import('../envCollectionRef')).setEnvCollection({ replace: () => undefined, delete: () => undefined } as never);
  const node = (): TreeNode => storage.getNode(ACCOUNT, ENTRY) as TreeNode;
  const handler = handlers.get('credSshManager.restoreRevision');
  assert.ok(handler !== undefined, 'Restore This Version… is registered from the PIN commands');
  written.length = 0;
  return { storage, s, written, node, restore: async () => void (await handler({ kind: 'revision', accountId: ACCOUNT, node: node(), index: 0 })) };
}

async function stored(w: World, label: string): Promise<string | undefined> {
  return slot(label).read(w.storage, ACCOUNT, ENTRY);
}

/** A live slot that must be LOCKED under the entry's PIN, opened. */
async function openedLive(w: World, label: string): Promise<string> {
  const raw = await stored(w, label);
  const read = readSecret(raw);
  assert.equal(read.kind, 'locked', `${label} is not sealed after the restore; stored: ${String(raw)}`);
  return read.kind === 'locked' ? unlockSecret(read.envelope, ACCOUNT, PIN) : '';
}

test('Restore brings the version back into the same entry and records today’s state first', async () => {
  const w = await world(
    { details: credential(), slots: { password: 'new pw', notes: 'new note' } },
    { secrets: { password: 'old pw', notes: 'old note', fields: '{"login":"me"}' } },
    [],
  );

  await w.restore();

  assert.equal(await stored(w, 'password'), 'old pw');
  assert.equal(await stored(w, 'notes'), 'old note');
  assert.equal(await stored(w, 'login and URL'), '{"login":"me"}');
  assert.equal(w.node().name, 'godaddy (old)', 'the name it had then is part of the version');
  const [newest] = await w.storage.getHistory(ACCOUNT, ENTRY);
  assert.deepEqual([newest.name, newest.secrets.password, newest.secrets.notes], ['godaddy', 'new pw', 'new note'], 'so the restore can be undone the same way');
  assert.match(w.s.warnings[0] ?? '', /^Restore "godaddy" to the version replaced at .+\? What it holds now becomes its newest previous version, so this can be undone the same way\.$/);
  assert.match(w.s.infos.join(' '), /"godaddy \(old\)" is back to the version replaced at .+\. Its agent access and code-access key are today's, not that version's\./);
});

test('restoring into a protected entry SEALS a version from before the PIN — nothing is ever stored in the clear', async () => {
  const w = await world(
    { details: credential({ pinProtected: true }), slots: { password: await locked('new pw'), notes: await locked('new note') } },
    { secrets: { password: 'old pw', notes: 'old note', payment: '{"cvv":"123"}' } },
    [PIN],
  );

  await w.restore();

  assert.equal(await openedLive(w, 'password'), 'old pw');
  assert.equal(await openedLive(w, 'notes'), 'old note');
  assert.equal(await openedLive(w, 'payment details'), '{"cvv":"123"}');
  for (const plain of ['old pw', 'old note', '{"cvv":"123"}']) {
    assert.ok(!w.written.includes(plain), `"${plain}" reached the keychain in the clear, even for a moment`);
  }
  assert.equal(w.node().details?.pinProtected, true, 'the mark is today’s');
});

test('Restore keeps today’s agent access, code-access key, PIN mark and file claims — and derives the code flag from the seed', async () => {
  const today = { pinProtected: true, mcp: { read: false } as never, configKeyHash: 'today-key', notForExport: true, attachmentFileName: 'today.pdf', hasTotp: true };
  const then = { mcp: { read: true, exec: true } as never, configKeyHash: 'revoked-key', notForExport: undefined, attachmentFileName: 'gone.pdf', tags: ['then'] };
  const w = await world({ details: credential(today), slots: { password: await locked('new pw') } }, { details: then, secrets: { password: 'old pw' } }, [PIN]);

  await w.restore();

  const details = w.node().details as EntityMetadata;
  assert.deepEqual(
    [details.pinProtected, details.mcp, details.configKeyHash, details.notForExport, details.attachmentFileName],
    [true, { read: false }, 'today-key', true, 'today.pdf'],
    'a restore never widens agent access and never revives a revoked key',
  );
  assert.deepEqual(details.tags, ['then'], 'while the version’s own content comes back');
  assert.equal(details.hasTotp, undefined, 'the version held no seed, so the row must not offer Copy Code');
});

test('Restore removes every value the version did not hold — the password included, though an empty write keeps it', async () => {
  const w = await world({ details: credential(), slots: { password: 'new pw', 'database connection': 'postgres://x', notes: 'now' } }, { secrets: { notes: 'then' } }, []);

  await w.restore();

  assert.equal(await stored(w, 'password'), undefined);
  assert.equal(await stored(w, 'database connection'), undefined);
  assert.equal(await stored(w, 'notes'), 'then');
});

test('a declined PIN restores nothing and records nothing', async () => {
  const live = { password: await locked('new pw') };
  const w = await world({ details: credential({ pinProtected: true }), slots: live }, { secrets: { password: 'old pw' } }, [undefined]);

  await w.restore();

  assert.equal(await stored(w, 'password'), live.password, 'byte-identical');
  assert.equal((await w.storage.getHistory(ACCOUNT, ENTRY)).length, 1);
  assert.deepEqual(w.written, []);
});

test('a declined confirmation restores nothing', async () => {
  const w = await world({ details: credential(), slots: { password: 'new pw' } }, { secrets: { password: 'old pw' } }, [], [undefined]);

  await w.restore();

  assert.equal(await stored(w, 'password'), 'new pw');
  assert.deepEqual(w.written, []);
});

test('Restore refuses over a damaged live value and overwrites nothing — it is the only copy of what was there', async () => {
  const damaged = '{"v":1,"lock":{"wrap":{}}}';
  const w = await world({ details: credential(), slots: { password: 'new pw', notes: damaged } }, { secrets: { password: 'old pw', notes: 'old note' } }, []);

  await w.restore();

  assert.equal(await stored(w, 'notes'), damaged);
  assert.equal(await stored(w, 'password'), 'new pw');
  assert.match(w.s.warnings.join(' '), /holds a protected value that cannot be read: notes will not open\..*Nothing was restored\./);
});

test('a version sealed under the PIN the entry used to have is restored with THAT PIN, into the unprotected entry', async () => {
  // Plan gate, finding 3, on the Restore road: unprotected elsewhere, this machine's history still sealed.
  const w = await world({ details: credential(), slots: { password: 'new pw' } }, { secrets: { password: await locked('old pw', '9876') } }, ['9876']);

  await w.restore();

  assert.deepEqual(w.s.boxPrompts, ['This kept version is sealed under the PIN the entry used to have. Enter it to restore it.']);
  assert.equal(await stored(w, 'password'), 'old pw', 'the entry is unprotected, so the value comes back as it is');
});

test('a restore killed between two slot writes leaves nothing in the clear, and running it again converges on the version', async () => {
  // Plan gate, finding 1. `SecretStorage` has no transaction; the promise is that every value was
  // sealed BEFORE the first write, and that re-running finishes the job.
  const s = sinks();
  const stub = clickVscode([], s);
  const written: string[] = [];
  const storage = memoryStorage(stub, written);
  await seedEntry(storage, credential({ pinProtected: true }), { notes: await locked('new note'), 'login and URL': await locked('{"login":"new"}'), password: await locked('new pw') });
  const version: Revision = { at: AT, name: 'godaddy', details: credential({ pinProtected: true }), secrets: { notes: 'old note', fields: '{"login":"old"}', password: 'old pw' } };
  const { restoreVersion } = loadWithVscode<typeof import('../restoreVersion')>('../restoreVersion', stub);
  const realWrite = storage.setFieldsRaw.bind(storage);
  let killed = false;
  storage.setFieldsRaw = async (a, e, v) => {
    if (!killed) {
      killed = true;
      throw new Error('the window was closed');
    }
    return realWrite(a, e, v);
  };
  written.length = 0;

  await assert.rejects(restoreVersion(storage, ACCOUNT, ENTRY, version, PIN), /the window was closed/);
  assert.ok(killed, 'the kill landed between the notes and the login');
  for (const plain of ['old note', '{"login":"old"}', 'old pw']) {
    assert.ok(!written.includes(plain), `"${plain}" was stored in the clear by the interrupted run`);
  }

  await restoreVersion(storage, ACCOUNT, ENTRY, version, PIN);

  const opened = async (label: string): Promise<string> => {
    const read = readSecret(await slot(label).read(storage, ACCOUNT, ENTRY));
    assert.equal(read.kind, 'locked', `${label} is not sealed`);
    return read.kind === 'locked' ? unlockSecret(read.envelope, ACCOUNT, PIN) : '';
  };
  assert.deepEqual([await opened('notes'), await opened('login and URL'), await opened('password')], ['old note', '{"login":"old"}', 'old pw']);
  assert.ok(!written.some((value) => ['old note', '{"login":"old"}', 'old pw'].includes(value)), 'and not by the run that finished it');
});

test('a history row’s tooltip offers Restore This Version…, not a Clone that copies metadata only', () => {
  class Item {
    tooltip?: string;
    constructor(readonly label: string) {}
  }
  const { revisionRowItem } = loadWithVscode<typeof import('../revisionRowItem')>('../revisionRowItem', {
    TreeItem: Item,
    TreeItemCollapsibleState: { None: 0 },
    ThemeIcon: class {},
    ThemeColor: class {},
  });
  const node = { id: ENTRY, name: 'godaddy', type: 'entity', parentId: null, details: credential() } as TreeNode;

  const item = revisionRowItem({ kind: 'revision', accountId: ACCOUNT, node, index: 0 }, { at: AT, name: 'godaddy', details: credential() }) as unknown as Item;

  assert.match(String(item.tooltip), /Right-click → Restore This Version… to bring it back\./);
  assert.doesNotMatch(String(item.tooltip), /Clone/);
});

test('Restore This Version… is contributed on every history row and hidden from the palette, which has no row to act on', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
    contributes: { commands: { command: string; title: string }[]; menus: Record<string, { command: string; when?: string; group?: string }[]> };
  };
  const id = 'credSshManager.restoreRevision';

  assert.equal(manifest.contributes.commands.find((c) => c.command === id)?.title, 'Restore This Version…');
  assert.deepEqual(
    manifest.contributes.menus['view/item/context'].filter((m) => m.command === id).map((m) => [m.when, m.group]),
    [['view == credSshManagerView && viewItem =~ /^revision/', '3_manage@0']],
  );
  assert.equal(manifest.contributes.menus.commandPalette.find((m) => m.command === id)?.when, 'false');
});

// ---------------------------------------------------------------------------------------------
// Rule R3 at WRITE time (review of 2026-09-30): protection is re-read AFTER the confirmation, because
// another window or a sync can change it while the modal waits for an answer.
// ---------------------------------------------------------------------------------------------

/** Protect `c1` the way another window does — every value sealed, then the mark and the epoch in one write. */
async function protectedElsewhere(storage: StorageManager): Promise<void> {
  await protectEntity(storage, ACCOUNT, ENTRY, PIN);
  await storage.updateNodeFields(ACCOUNT, ENTRY, protectionDecision(true));
}

/** A confirmation that is answered only after `meanwhile` has happened. */
function answeredAfter(meanwhile: () => Promise<unknown>): ModalAnswer {
  return async () => {
    await meanwhile();
    return 'Restore';
  };
}

test('an entry PROTECTED while the confirmation was open is not restored in the clear — nothing is restored, and it says why', async () => {
  let storage: StorageManager | undefined;
  const w = await world(
    { details: credential(), slots: { password: 'new pw' } },
    { secrets: { password: 'old pw', notes: 'old note' } },
    [],
    [answeredAfter(() => protectedElsewhere(storage as StorageManager))],
  );
  storage = w.storage;

  await w.restore();

  for (const plain of ['old pw', 'old note']) {
    assert.ok(!w.written.includes(plain), `"${plain}" was written in the clear into an entry protected a moment earlier`);
  }
  assert.equal(await openedLive(w, 'password'), 'new pw', 'the protected value stays exactly as the other window sealed it');
  assert.equal(w.node().details?.pinProtected, true);
  assert.match(w.s.warnings.join(' '), /"godaddy" was protected with a PIN while this confirmation was open\. Nothing was restored\. Run Restore This Version… again\./);
});

test('an entry UNPROTECTED while the confirmation was open is not sealed again without a decision — nothing is restored', async () => {
  let storage: StorageManager | undefined;
  const w = await world(
    { details: credential({ pinProtected: true }), slots: { password: await locked('new pw') } },
    { secrets: { password: 'old pw' } },
    [PIN],
    [answeredAfter(() => unprotectEntity(storage as StorageManager, ACCOUNT, ENTRY, PIN))],
  );
  storage = w.storage;

  await w.restore();

  assert.equal(await stored(w, 'password'), 'new pw', 'the value Remove PIN unsealed stays as it left it');
  assert.match(w.s.warnings.join(' '), /"godaddy" stopped being protected with a PIN while this confirmation was open .* Nothing was restored\. Run Restore This Version… again\./);
});

test('the PIN is read AFTER the confirmation: a vault locked while it was open asks again, and the restore still seals', async () => {
  const w = await world(
    { details: credential({ pinProtected: true }), slots: { password: await locked('new pw') } },
    { secrets: { password: 'old pw' } },
    [PIN, PIN],
    [answeredAfter(async () => (require('../pinSession') as typeof import('../pinSession')).forgetAllPins())],
  );

  await w.restore();

  assert.equal(w.s.boxes, 2, 'the door, then the PIN again for the write — the grant it took is gone');
  assert.equal(await openedLive(w, 'password'), 'old pw');
  assert.ok(!w.written.includes('old pw'), 'sealed before it was written');
});

test('restoring into an entry protected while empty asks for its first PIN and seals the version before the first write', async () => {
  // Protect with a PIN… on an empty entry writes the mark alone (§16 item 4): the version's values are
  // the entry's first, and they go in sealed under a PIN chosen now — typed twice, nothing to check it on.
  const w = await world({ details: credential({ pinProtected: true }), slots: {} }, { secrets: { password: 'old pw', notes: 'old note' } }, ['5678', '5678']);

  await w.restore();

  for (const plain of ['old pw', 'old note']) {
    assert.ok(!w.written.includes(plain), `"${plain}" reached the keychain in the clear, even for a moment`);
  }
  const read = readSecret(await stored(w, 'password'));
  assert.equal(read.kind, 'locked', 'the restored password is not sealed');
  assert.equal(read.kind === 'locked' ? await unlockSecret(read.envelope, ACCOUNT, '5678') : '', 'old pw');
  assert.equal(w.s.boxes, 2, 'a NEW PIN, typed twice');
  assert.equal(w.node().details?.pinProtected, true);
});
