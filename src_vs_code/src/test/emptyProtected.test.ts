import assert from 'node:assert/strict';
import { stored } from '../storedSecret';
import { test } from 'node:test';
import { SECRET_SLOTS } from '../entitySlots';
import type { EntityFormOptions, EntityFormValues } from '../entityFormShape';
import { readSecret, unlockSecret } from '../secretEnvelope';
import type { StorageManager } from '../storageManager';
import { EntityMetadata, TreeNode } from '../types';
import { loadEachWithVscode, loadWithVscode } from './vscodeStub';
import { ACCOUNT, PIN, Sinks, clickVscode, locked, memoryStorage, seedEntry, sinks } from './pinWorld';

/**
 * An entry protected while it held NO value (review of 2026-09-30, entry-PIN plan §16 item 4).
 *
 * <p>*Protect with a PIN…* on an empty entry has nothing to seal, so it writes the mark alone. The door
 * then read "marked, nothing locked" as the 0.99.0 false mark and CLEARED it, and the first value typed
 * into the entry in Edit went into the keychain in the clear — the protection the person chose was gone
 * at the first click, and nothing said so. Now the false-mark repair needs a value in the clear to be the
 * evidence, and a save that stores a first value asks for the entry's first PIN (typed twice, or checked
 * against the protected entries of its folder) and seals every value with it before the first write.</p>
 *
 * <p>Over the REAL `StorageManager` and the real `editNode`; the keychain logs every value it is handed,
 * which is what rule R3's "not even for a moment" is asserted on. The form is a mock that runs the
 * caller's `beforeSave` with the values it will post, as the real `agreed()` does.</p>
 */

const NEW_PIN = '5678';
const FIRST = 'FIRST-SECRET-typed-in-the-form';

const empty = (over: Partial<EntityMetadata> = {}): EntityMetadata =>
  ({ id: 'e1', name: 'new-api', isSshEnabled: false, kind: 'credential', pinProtected: true, ...over }) as EntityMetadata;

/** The details the form posts for a person who renamed the entry — without the mark, as the real allow-list rebuilds them. */
const renamed = (): EntityMetadata => ({ id: 'e1', name: 'renamed', isSshEnabled: false, kind: 'credential' }) as EntityMetadata;

interface Form {
  options?: EntityFormOptions;
  /** `beforeSave` answered false — the real form stays open with everything typed. */
  held?: boolean;
}

interface World {
  storage: StorageManager;
  s: Sinks;
  form: Form;
  written: string[];
  edit(): Promise<void>;
  node(): TreeNode;
  grant(): string | undefined;
}

/** What the form posts: the details it was opened over (the mark dropped, as the real allow-list drops it) plus `over`. */
function posted(options: EntityFormOptions, over: Partial<EntityFormValues>): EntityFormValues {
  const { pinProtected: _dropped, ...rebuilt } = options.initial ?? ({} as EntityMetadata);
  return {
    details: rebuilt as EntityMetadata,
    clearPassword: false,
    clearPrivateKey: false,
    clearVpnConfig: false,
    clearDbConnection: false,
    clearAttachment: false,
    clearImage: false,
    clearTotp: false,
    clearHostKey: false,
    dependsOnColors: [],
    // The real form posts an empty notes box as '' — a value nothing stores.
    newNotes: '',
    ...over,
  };
}

async function world(
  details: EntityMetadata,
  slots: Record<string, string>,
  inputs: (string | undefined)[],
  over: Partial<EntityFormValues>,
  opts: { modals?: string[]; meanwhile?: (storage: StorageManager) => Promise<void>; before?: (storage: StorageManager) => Promise<void> } = {},
): Promise<World> {
  const s = sinks();
  s.modalAnswers.push(...(opts.modals ?? []));
  const stub = clickVscode([...inputs], s);
  const written: string[] = [];
  const storage = memoryStorage(stub, written);
  await opts.before?.(storage);
  await seedEntry(storage, details, slots);
  const form: Form = {};
  const [mod] = loadEachWithVscode(['../entityEditCommands'], stub, {
    './entityFormPanel': {
      showEntityForm: async (options: EntityFormOptions): Promise<EntityFormValues | undefined> => {
        form.options = options;
        await opts.meanwhile?.(storage);
        const values = posted(options, over);
        const agreed = await (options.beforeSave ?? ((): Promise<boolean> => Promise.resolve(true)))(values);
        form.held = !agreed;
        return agreed ? values : undefined;
      },
    },
  }) as [typeof import('../entityEditCommands')];
  (require('../envCollectionRef') as typeof import('../envCollectionRef')).setEnvCollection({ replace: () => undefined, delete: () => undefined } as never);
  const node = (): TreeNode => storage.getNode(ACCOUNT, details.id) as TreeNode;
  const session = require('../pinSession') as typeof import('../pinSession');
  written.length = 0;
  return {
    storage,
    s,
    form,
    written,
    node,
    edit: () => mod.editNode(ACCOUNT, node(), storage, () => undefined),
    grant: () => session.grantedPin(ACCOUNT, details.id),
  };
}

/** The password slot, which must be SEALED — opened with `pin`, or the assertion names what is stored. */
async function sealedPassword(w: World, pin: string, id = 'e1'): Promise<string> {
  const raw = await w.storage.getPassword(ACCOUNT, id);
  const read = readSecret(raw);
  assert.equal(read.kind, 'locked', `the password is not sealed; stored: ${String(raw)}`);
  return read.kind === 'locked' ? unlockSecret(read.envelope, ACCOUNT, pin) : '';
}

function inTheClear(w: World, plain: string): string[] {
  return w.written.filter((value) => value.includes(plain));
}

async function slotsStored(storage: StorageManager, id = 'e1'): Promise<string[]> {
  const stored = await Promise.all(SECRET_SLOTS.map((slot) => slot.read(storage, ACCOUNT, id)));
  return SECRET_SLOTS.filter((_slot, at) => stored[at] !== undefined).map((slot) => slot.label);
}

// ---------------------------------------------------------------------------------------------
// The door.
// ---------------------------------------------------------------------------------------------

test('the door keeps the mark of an entry protected while empty', async () => {
  const storage = memoryStorage(clickVscode([], sinks()));
  await seedEntry(storage, empty(), {});
  const { admit } = loadWithVscode<typeof import('../pinAdmission')>('../pinAdmission', {});

  const admission = await admit(storage, ACCOUNT, 'e1', { accountId: ACCOUNT, entityId: 'e1', entryName: 'new-api', ask: () => assert.fail('nothing is sealed, so nothing is asked') });

  assert.equal(admission.kind, 'in');
  assert.equal(storage.getNode(ACCOUNT, 'e1')?.details?.pinProtected, true, 'the protection the person chose was cleared as if it were the 0.99.0 false mark');
});

test('the legacy false mark over plain values is still cleared', async () => {
  // The 0.99.0 share: marked, and its values arrived in the clear. A value in the clear is the evidence.
  const storage = memoryStorage(clickVscode([], sinks()));
  await seedEntry(storage, empty({ id: 'l1' }), { password: 'arrived plain' });
  const { admit } = loadWithVscode<typeof import('../pinAdmission')>('../pinAdmission', {});

  await admit(storage, ACCOUNT, 'l1', { accountId: ACCOUNT, entityId: 'l1', entryName: 'new-api', ask: () => assert.fail('nothing is sealed') });

  assert.equal(storage.getNode(ACCOUNT, 'l1')?.details?.pinProtected, undefined, 'the mark claims a lock no value has');
});

// ---------------------------------------------------------------------------------------------
// Edit.
// ---------------------------------------------------------------------------------------------

test('a first secret typed into an entry protected while it was empty never reaches the keychain in the clear', async () => {
  const w = await world(empty(), {}, [NEW_PIN, NEW_PIN], { newPassword: FIRST });

  await w.edit();

  assert.deepEqual(inTheClear(w, FIRST), [], 'the first value of a protected entry was stored in the clear');
  assert.equal(await sealedPassword(w, NEW_PIN), FIRST, 'sealed under the PIN typed twice at Save');
  assert.equal(w.s.boxes, 2, 'a NEW PIN: typed twice, because nothing can check it');
  assert.match(w.s.boxTitles[0] ?? '', /A PIN for "new-api"/);
  assert.equal(w.node().details?.pinProtected, true, 'the mark stays');
  assert.equal(w.grant(), NEW_PIN, 'the PIN is granted to this window, like any PIN that opened the entry');
});

test('declining the new PIN saves nothing and keeps the form', async () => {
  const w = await world(empty(), {}, [undefined], { newPassword: FIRST, details: renamed() });

  await w.edit();

  assert.equal(w.form.held, true, 'the form must stay open with what was typed');
  assert.deepEqual(await slotsStored(w.storage), [], 'nothing was stored');
  assert.deepEqual(inTheClear(w, FIRST), []);
  assert.equal(w.node().name, 'new-api', 'nothing was saved');
  assert.equal(w.node().details?.pinProtected, true);
});

test('a save that adds no value to an entry protected while empty asks nothing, stores nothing secret, and keeps the mark', async () => {
  const w = await world(empty(), {}, [], { details: renamed() });

  await w.edit();

  assert.equal(w.node().name, 'renamed', 'the save happened');
  assert.equal(w.s.boxes, 0, 'no value, so no PIN to choose');
  assert.deepEqual(await slotsStored(w.storage), []);
  assert.equal(w.node().details?.pinProtected, true, 'the mark stays');
});

test('in a folder that holds protected entries, the first PIN of an entry protected while empty is checked against them', async () => {
  const folder = async (storage: StorageManager): Promise<void> => {
    await storage.addNode(ACCOUNT, { id: 'f1', name: 'prod', type: 'folder', parentId: null });
    await storage.addNode(ACCOUNT, { id: 's1', name: 'prod-db', type: 'entity', parentId: 'f1', details: { id: 's1', name: 'prod-db', isSshEnabled: false, pinProtected: true } as EntityMetadata });
    await storage.setPassword(ACCOUNT, 's1', stored(await locked('sibling pw')));
  };
  const w = await world(empty(), {}, [PIN], { newPassword: FIRST }, { modals: ['Use this PIN'], before: folder });
  await w.storage.updateNodeFields(ACCOUNT, 'e1', { parentId: 'f1' });

  await w.edit();

  assert.equal(w.s.boxes, 1, 'typed once: the protected sibling is the check');
  assert.match(w.s.warnings.join(' '), /This PIN opens 1 of the 1 protected entries in this folder\./);
  assert.equal(await sealedPassword(w, PIN), FIRST, 'sealed under the PIN the folder already uses');
  assert.deepEqual(inTheClear(w, FIRST), []);
});

test('an entry that became protected-while-empty while the form was open is not saved in the clear', async () => {
  // Opened over a value in the clear under the 0.99.0 false mark (the door clears that mark); while
  // the form is open, another window empties the entry and protects it — the mark alone again.
  const w = await world(empty(), { notes: 'plain at open' }, [], { newPassword: FIRST, newNotes: undefined }, {
    meanwhile: async (storage) => {
      await storage.setNotes(ACCOUNT, 'e1', undefined);
      await storage.updateDetailsFields(ACCOUNT, 'e1', { pinProtected: true });
    },
  });

  await w.edit();

  assert.deepEqual(inTheClear(w, FIRST), [], 'a first value went into a protected entry in the clear');
  assert.equal(await w.storage.getPassword(ACCOUNT, 'e1'), undefined, 'nothing was written');
  assert.match(w.s.warnings.join(' '), /"new-api" was protected with a PIN while this form was open\. Nothing was saved\./);
});

test('a save stores a secret only when a slot the PIN covers would hold something — an empty box, an empty record and a file do not', async () => {
  const { addsSecret } = require('../applyFormSecrets') as typeof import('../applyFormSecrets');
  const base = posted({ initial: empty() } as EntityFormOptions, {});

  assert.equal(await addsSecret({ ...base, newPassword: '', newFields: { login: '', url: '' }, newPayment: {}, newAttachment: 'QUJD' }), false);
  assert.equal(await addsSecret({ ...base, newNotes: 'a note' }), true);
  assert.equal(await addsSecret({ ...base, newFields: { login: 'me' } }), true, 'a login is a value like any other');
  assert.equal(await addsSecret({ ...base, newPassword: 'pw', clearPassword: true }), false, 'a cleared password is a removal, not an addition');
});
