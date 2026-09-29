import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SECRET_SLOTS, SecretSlot } from '../entitySlots';
import type { EntityFormOptions, EntityFormValues } from '../entityFormShape';
import { hiddenFromAgents } from '../mcpEntries';
import { PaymentFields, parsePaymentFields } from '../paymentFields';
import { lockSecret, readSecret, unlockSecret } from '../secretEnvelope';
import type { StorageManager } from '../storageManager';
import { EntityMetadata, TreeNode } from '../types';
import { loadWithVscode } from './vscodeStub';

/**
 * D2-D5 of the entry-PIN plan, driven through the REAL `editNode` over the REAL `StorageManager`.
 *
 * <p>The one action that LOST the owner's card: Edit on a protected entry never asked for the PIN,
 * so the form opened over `{}` (the typed getters keep only keys they know, and a locked envelope
 * has none) and Save wrote that `{}` back — `setPayment(undefined)` deletes, and so do the second
 * values and a credential's login/URL. The same save rebuilt `details` from an allow-list with no
 * `pinProtected` in it, so the mark went too; a password typed into the form was stored in the
 * clear; and the save handed the unmarked details to the terminal bindings.</p>
 *
 * <p>Why nothing noticed: the only test that edited a locked entry (`envSaveNotice.test.ts`) ran over
 * a vault whose `setPayment`, `setSecond` and `setFields` were no-ops. This file's vault is the
 * product's own `StorageManager` over an in-memory keychain, every value is really sealed by
 * `lockSecret`, and the form is a mock that posts back exactly what it was given — which is what a
 * person who changed only the name does.</p>
 */

const ACCOUNT = 'a1';
const PIN = '1234';

const CARD: PaymentFields = { number: '4111111111111111', cvv: '123', pin: '4321' };
const SEED = 'otpauth://totp/GitHub:me?secret=JBSWY3DPEHPK3PXP&issuer=GitHub';

/** Locked values, one wrap per plaintext, made once — scrypt costs about a second each. */
const wraps = new Map<string, Promise<string>>();
function locked(plain: string): Promise<string> {
  let wrap = wraps.get(plain);
  if (wrap === undefined) {
    wrap = lockSecret(plain, ACCOUNT, PIN);
    wraps.set(plain, wrap);
  }
  return wrap;
}

interface FakeEnv {
  readonly replaced: Record<string, string>;
  readonly deleted: string[];
  description?: string;
  replace(name: string, value: string): void;
  delete(name: string): void;
}

function fakeEnv(): FakeEnv {
  const self: FakeEnv = {
    replaced: {},
    deleted: [],
    replace(name, value) {
      self.replaced[name] = value;
    },
    delete(name) {
      self.deleted.push(name);
    },
  };
  return self;
}

interface Said {
  infos: string[];
  warnings: string[];
  /** PIN boxes raised — the door asks once; Save asks again only when the grant is gone. */
  boxes: number;
  /** Every progress notification: its title, and what the work it wrapped answered. */
  progress: { title: string; answered: unknown }[];
}

/** The `vscode` the edit path and the storage touch: PIN boxes answered from a queue, notices recorded. */
function stubbedVscode(inputs: (string | undefined)[], said: Said): Record<string, unknown> {
  return {
    window: {
      showInputBox: (): Promise<string | undefined> => {
        said.boxes += 1;
        return Promise.resolve(inputs.shift());
      },
      showQuickPick: (): Promise<undefined> => Promise.resolve(undefined),
      showInformationMessage: (message: string): Promise<undefined> => {
        said.infos.push(message);
        return Promise.resolve(undefined);
      },
      showWarningMessage: (message: string): Promise<undefined> => {
        said.warnings.push(message);
        return Promise.resolve(undefined);
      },
      showErrorMessage: (): undefined => undefined,
      withProgress: async (options: { title: string }, task: (progress: { report(): void }) => Promise<unknown>): Promise<unknown> => {
        const answered = await task({ report: (): void => undefined });
        said.progress.push({ title: options.title, answered });
        return answered;
      },
      createOutputChannel: () => ({ appendLine: (): void => undefined, show: (): void => undefined, dispose: (): void => undefined }),
    },
    workspace: {
      workspaceFolders: undefined,
      getConfiguration: () => ({ get: (_k: string, d: unknown) => d }),
      onDidChangeConfiguration: () => ({ dispose: (): void => undefined }),
      fs: { writeFile: (): Promise<undefined> => Promise.resolve(undefined) },
    },
    Uri: { file: (p: string): object => ({ fsPath: p }), joinPath: (): object => ({}) },
    ViewColumn: { Active: 1 },
    ProgressLocation: { Notification: 15 },
    EventEmitter: class {
      event = (): void => undefined;
      fire(): void {}
    },
    ThemeIcon: class {
      constructor(readonly id: string) {}
    },
    ThemeColor: class {
      constructor(readonly id: string) {}
    },
    TreeItem: class {},
    InputBoxValidationSeverity: { Info: 1, Warning: 2, Error: 3 },
    commands: { registerCommand: () => ({ dispose: (): void => undefined }) },
    env: { clipboard: { writeText: (): Promise<undefined> => Promise.resolve(undefined) }, remoteName: undefined },
  };
}

function memento(): { get<T>(key: string, fallback?: T): T | undefined; update(key: string, value: unknown): Promise<void> } {
  const map = new Map<string, unknown>();
  return {
    get: <T>(key: string, fallback?: T): T | undefined => (map.has(key) ? (map.get(key) as T) : fallback),
    update: (key: string, value: unknown): Promise<void> => {
      map.set(key, value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value);
      return Promise.resolve();
    },
  };
}

/**
 * The keychain, in memory — and every value ever handed to `store`, in order, in `written`. Rule R3
 * is about the moment BETWEEN two writes ("never in the clear, not even for a moment"), which the
 * final state cannot show: a save that wrote plaintext and then ran the `protectEntity` sweep ends
 * exactly where a sealed save ends. The log is what sees the difference.
 */
function secrets(written: string[]): { keys(): string[]; get(k: string): Promise<string | undefined>; store(k: string, v: string): Promise<void>; delete(k: string): Promise<void>; onDidChange(): void } {
  const map = new Map<string, string>();
  return {
    keys: () => [...map.keys()],
    get: (k) => Promise.resolve(map.get(k)),
    store: (k, v) => {
      map.set(k, v);
      written.push(v);
      return Promise.resolve();
    },
    delete: (k) => {
      map.delete(k);
      return Promise.resolve();
    },
    onDidChange: () => {},
  };
}

/** What the person did in the form, beyond leaving everything as it was. */
interface Answer {
  name?: string;
  newPassword?: string;
  newPayment?: PaymentFields;
  /** The vault locked while the form was open: every grant is gone by the time Save is pressed. */
  lockVaultBeforeSave?: boolean;
}

/** What the form was given, and whether its own last gate (`beforeSave`) held the save back. */
interface Form {
  options?: EntityFormOptions;
  /** `beforeSave` answered false — the real form then stays open with everything typed. */
  heldAtSave?: boolean;
}

/**
 * The form, as a mock that does what the real one does at the two points that matter here: it runs
 * `beforeSave` before answering (Cancel when it refuses), and it posts back EXACTLY the prefill it
 * was given — the way the real `toValues` does for a person who changed only the name. `details`
 * are rebuilt WITHOUT `pinProtected`, because the real form's allow-list has no such field (D3).
 */
function formAnswer(options: EntityFormOptions, answer: Answer, form: Form, lockVault: () => void): Promise<EntityFormValues | undefined> {
  form.options = options;
  if (answer.lockVaultBeforeSave === true) {
    lockVault();
  }
  const gate = options.beforeSave ?? ((): Promise<boolean> => Promise.resolve(true));
  return gate().then((agreed) => {
    form.heldAtSave = !agreed;
    return agreed ? posted(options, answer) : undefined;
  });
}

function posted(options: EntityFormOptions, answer: Answer): EntityFormValues {
  const { pinProtected: _dropped, ...rebuilt } = options.initial ?? ({} as EntityMetadata);
  return {
    details: { ...rebuilt, name: answer.name ?? rebuilt.name, hasTotp: options.hasStoredTotp || undefined } as EntityMetadata,
    newPassword: answer.newPassword,
    clearPassword: false,
    newSecond: options.storedSecond,
    clearPrivateKey: false,
    clearVpnConfig: false,
    clearDbConnection: false,
    newNotes: options.initialNotes,
    clearAttachment: false,
    clearImage: false,
    clearTotp: false,
    clearHostKey: false,
    dependsOnColors: [],
    ...kindAnswer(rebuilt.kind, options, answer),
  };
}

/** The one record each kind's form posts back — what `toValues` sends for that kind and no other. */
const BY_KIND: Readonly<Record<string, (options: EntityFormOptions, answer: Answer) => Partial<EntityFormValues>>> = {
  db: (options) => ({ newDbConnection: options.initialDbConnection }),
  credential: (options) => ({ newFields: options.initialFields }),
  config: (options) => ({ newConfigBody: options.initialConfigBody }),
  payment: (options, answer) => ({ newPayment: answer.newPayment ?? options.initialPayment }),
};

function kindAnswer(kind: string | undefined, options: EntityFormOptions, answer: Answer): Partial<EntityFormValues> {
  return (BY_KIND[kind ?? ''] ?? ((): Partial<EntityFormValues> => ({})))(options, answer);
}

interface World {
  edit(): Promise<void>;
  storage: StorageManager;
  /** What the form was GIVEN — the prefill, which is where D2's "opens over {}" is visible. */
  form: Form;
  /** Every value the keychain was handed, in order (`secrets`). */
  written: string[];
  env: FakeEnv;
  said: Said;
  node(): TreeNode;
}

/** The entry, seeded through the slot table so a slot is named the way the product names it. */
async function world(
  details: EntityMetadata,
  slots: Record<string, string>,
  inputs: (string | undefined)[],
  answer: Answer = {},
): Promise<World> {
  const said: Said = { infos: [], warnings: [], boxes: 0, progress: [] };
  const stub = stubbedVscode([...inputs], said);
  const { StorageManager } = loadWithVscode<typeof import('../storageManager')>('../storageManager', stub);
  const written: string[] = [];
  const storage = new StorageManager(memento() as never, secrets(written) as never);
  await storage.addNode(ACCOUNT, { id: details.id, name: details.name, type: 'entity', parentId: null, details });
  for (const slot of SECRET_SLOTS) {
    const value = slots[slot.label];
    if (value !== undefined) {
      await slot.write(storage, ACCOUNT, details.id, value);
    }
  }
  const form: Form = {};
  // Loaded LAST, so the `pinSession` and `envCollectionRef` instances a plain `require` answers
  // afterwards are the ones this module captured (the trap `envSaveNotice.test.ts` documents).
  const mod = loadWithVscode<typeof import('../entityEditCommands')>('../entityEditCommands', stub, {
    './entityFormPanel': {
      showEntityForm: (options: EntityFormOptions) => formAnswer(options, answer, form, () => session().forgetAllPins()),
    },
  });
  const session = (): typeof import('../pinSession') => require('../pinSession') as typeof import('../pinSession');
  const env = fakeEnv();
  (require('../envCollectionRef') as typeof import('../envCollectionRef')).setEnvCollection(env as never);
  const node = (): TreeNode => {
    const found = storage.getNode(ACCOUNT, details.id);
    assert.ok(found !== undefined, 'the entry vanished from the tree');
    return found;
  };
  // Only what the EDIT writes: the seeding above is not the subject.
  written.length = 0;
  return { storage, form, written, env, said, node, edit: () => mod.editNode(ACCOUNT, node(), storage, () => undefined) };
}

function slotNamed(label: string): SecretSlot {
  const slot = SECRET_SLOTS.find((one) => one.label === label);
  assert.ok(slot !== undefined, `no slot is called ${label}`);
  return slot;
}

/** The slot's value, which must be LOCKED, opened with the PIN — or the assertion names what is there instead. */
async function opened(w: World, label: string): Promise<string> {
  const raw = await slotNamed(label).read(w.storage, ACCOUNT, w.node().id);
  const read = readSecret(raw);
  assert.equal(read.kind, 'locked', `${label} is not locked; stored: ${String(raw)}`);
  return read.kind === 'locked' ? unlockSecret(read.envelope, ACCOUNT, PIN) : '';
}

/** Every slot as stored, byte for byte. */
async function rawSlots(w: World): Promise<Record<string, string | undefined>> {
  const out: Record<string, string | undefined> = {};
  for (const slot of SECRET_SLOTS) {
    out[slot.label] = await slot.read(w.storage, ACCOUNT, w.node().id);
  }
  return out;
}

const card = (): EntityMetadata =>
  ({ id: 'p1', name: 'orest payoneer', isSshEnabled: false, kind: 'payment', isPayment: true, paymentForm: 'card', pinProtected: true, hasTotp: true }) as EntityMetadata;

const credential = (over: Partial<EntityMetadata> = {}): EntityMetadata =>
  ({ id: 'c1', name: 'godaddy', isSshEnabled: false, kind: 'credential', pinProtected: true, ...over }) as EntityMetadata;

async function protectedCard(inputs: (string | undefined)[], answer: Answer): Promise<World> {
  return world(
    card(),
    {
      'payment details': await locked(JSON.stringify(CARD)),
      'second values': await locked('{"cvv2":"999"}'),
      'one-time-code seed': await locked(SEED),
      notes: await locked('the note'),
    },
    inputs,
    answer,
  );
}

// ---------------------------------------------------------------------------------------------
// D2 — Save never erases what Edit could not read.
// ---------------------------------------------------------------------------------------------

test('editing only the NAME of a protected card keeps every payment field, its second values, its seed and Copy Code', async () => {
  const w = await protectedCard([PIN], { name: 'renamed' });

  await w.edit();

  assert.equal(w.node().name, 'renamed', 'the edit happened');
  assert.equal(w.said.boxes, 1, 'one PIN, at the door');
  assert.deepEqual(parsePaymentFields(await opened(w, 'payment details')), CARD, 'the card is still there, and still locked');
  assert.equal(await opened(w, 'second values'), '{"cvv2":"999"}');
  assert.equal(await opened(w, 'one-time-code seed'), SEED);
  assert.equal(w.node().details?.hasTotp, true, 'the tree keeps Copy Code');
});

test('editing only the NAME of a protected credential keeps its login and URL, and its password', async () => {
  const fields = '{"login":"me","url":"https://godaddy.com"}';
  const w = await world(credential(), { password: await locked('hunter2'), 'login and URL': await locked(fields) }, [PIN], { name: 'renamed' });

  await w.edit();

  assert.equal(w.node().name, 'renamed');
  assert.equal(await opened(w, 'login and URL'), fields);
  assert.equal(await opened(w, 'password'), 'hunter2', 'an empty password box means keep — and keep means keep LOCKED');
});

test('Edit prefills the OPENED values — the note, the card, the second values, the seed — never the envelope', async () => {
  const w = await protectedCard([PIN], {});

  await w.edit();

  const options = w.form.options;
  assert.ok(options !== undefined, 'the form opened');
  assert.equal(options.initialNotes, 'the note');
  assert.deepEqual(options.initialPayment, CARD);
  assert.deepEqual(options.storedSecond, { cvv2: '999' });
  assert.equal(options.hasStoredTotp, true);
  assert.match(options.storedTotpDescription ?? '', /GitHub/, 'the seed was opened and described');
  assert.ok(!JSON.stringify(options).includes('"lock"'), 'an envelope reached the form');
});

test('Edit REFUSES over a damaged value, says so, and overwrites nothing', async () => {
  const damaged = '{"v":1,"lock":{"wrap":{}}}';
  const w = await world(card(), { notes: damaged, 'payment details': await locked(JSON.stringify(CARD)) }, [PIN], { name: 'renamed' });
  const before = await rawSlots(w);

  await w.edit();

  assert.equal(w.form.options, undefined, 'the form must not open over a value nothing can read');
  assert.match(w.said.warnings[0] ?? '', /cannot be read/);
  assert.match(w.said.warnings[0] ?? '', /Edit is not opened, so nothing can overwrite it/);
  assert.deepEqual(await rawSlots(w), before, 'byte-identical');
  assert.equal(w.node().name, 'orest payoneer');
});

test('an entry sealed under TWO PINs asks once, and refuses Edit naming the value the PIN does not open', async () => {
  // Two protects with different PINs on two machines, then a sync that mixed the slots (§5.9's last
  // row): the door opens the first locked slot, and a second box per slot the grant cannot open is a
  // question the person cannot tell apart from the first — and a PIN typed there would be granted.
  const w = await world(
    card(),
    { notes: await locked('the note'), 'payment details': await lockSecret(JSON.stringify(CARD), ACCOUNT, '9876') },
    [PIN, '9876'],
    { name: 'renamed' },
  );
  const before = await rawSlots(w);

  await w.edit();

  assert.equal(w.said.boxes, 1, 'one box, at the door — the slots behind it are opened with what the door granted');
  assert.equal(w.form.options, undefined, 'the form must not open over a value this PIN cannot read');
  assert.match(
    w.said.warnings.join(' '),
    /The value "payment details" of "orest payoneer" is sealed under a different PIN; Edit is not opened, so nothing can overwrite it\./,
  );
  assert.deepEqual(await rawSlots(w), before, 'byte-identical');
});

test('opening Edit again and again on an entry sealed under two PINs asks once and never cools it down', async () => {
  // The silent opens behind the door try the GRANTED PIN on the slot sealed under the other one. A
  // PIN the person already typed correctly is not a guess: counted as one, the sixth Edit found the
  // entry cooling; forgotten, every Edit asked the door's question again.
  const w = await world(
    card(),
    { notes: await locked('the note'), 'payment details': await lockSecret(JSON.stringify(CARD), ACCOUNT, '9876') },
    [PIN, PIN, PIN, PIN, PIN, PIN, PIN],
  );
  const { cooldownMs } = require('../pinAttempts') as typeof import('../pinAttempts');

  for (let i = 0; i < 6; i += 1) {
    await w.edit();
  }

  assert.equal(w.said.boxes, 1, 'the door asked once; the grant it left is still there for every later Edit');
  assert.equal(cooldownMs(ACCOUNT, 'p1', Date.now()), 0, 'no wrong attempt was counted');
  assert.doesNotMatch(w.said.warnings.join(' '), /Too many wrong PINs/);
  assert.equal(w.said.warnings.filter((m) => m.includes('sealed under a different PIN')).length, 6, 'each Edit names the value it cannot open');
});

test('a declined door opens no form, changes nothing, and says nothing more', async () => {
  const w = await protectedCard([undefined], { name: 'renamed' });
  const before = await rawSlots(w);

  await w.edit();

  assert.equal(w.form.options, undefined, 'the form opened without the PIN');
  assert.deepEqual(w.said.warnings, []);
  assert.deepEqual(await rawSlots(w), before);
  assert.equal(w.node().name, 'orest payoneer');
});

test('Edit on a protected entry says it is opening the values while it unseals them — §8, seven scrypt opens take seconds', async () => {
  const w = await protectedCard([PIN], { name: 'renamed' });

  await w.edit();

  assert.equal(w.said.progress.length, 1, 'a form that takes seconds to appear must say it is working');
  assert.match(w.said.progress[0].title, /"orest payoneer"/);
  assert.equal((w.said.progress[0].answered as { kind?: string }).kind, 'open', 'the slots were opened INSIDE the notification, not before or after it');
});

test('Edit on an entry with no PIN opens with no progress notification — there is nothing to unseal', async () => {
  const w = await world(credential({ pinProtected: undefined }), { password: 'plain', notes: 'plain note' }, [], { name: 'renamed' });

  await w.edit();

  assert.equal(w.node().name, 'renamed', 'the edit happened');
  assert.deepEqual(w.said.progress, [], 'a notification that flashes for an instant is noise');
});

// ---------------------------------------------------------------------------------------------
// D3 — the mark follows the values.
// ---------------------------------------------------------------------------------------------

test('an edit never takes an entry\'s PIN mark off, and the entry stays hidden from agents', async () => {
  const w = await protectedCard([PIN], { name: 'renamed' });

  await w.edit();

  assert.equal(w.node().details?.pinProtected, true, 'the row would go :pinoff and Remove PIN Protection… would disappear');
  assert.equal(hiddenFromAgents(w.node()), true);
});

// ---------------------------------------------------------------------------------------------
// D4 — a protected entry is never written in the clear.
// ---------------------------------------------------------------------------------------------

test('a new password typed into a protected entry is stored LOCKED and opens to the new text', async () => {
  const w = await world(credential(), { password: await locked('hunter2') }, [PIN], { newPassword: 'NEW-PW' });

  await w.edit();

  assert.equal(await opened(w, 'password'), 'NEW-PW');
  assert.deepEqual(w.written.filter((value) => value.includes('NEW-PW')), [], 'the new password was in the keychain in the clear, if only for a moment (R3)');
});

test('a changed card field is stored LOCKED and opens to the new record', async () => {
  const w = await protectedCard([PIN], { newPayment: { ...CARD, cvv: '999' } });

  await w.edit();

  assert.deepEqual(parsePaymentFields(await opened(w, 'payment details')), { ...CARD, cvv: '999' });
  assert.deepEqual(w.written.filter((value) => value.includes('"999"')), [], 'the changed card was in the keychain in the clear (R3)');
});

test('an untouched save rewrites no sealed value — every slot stays byte-identical', async () => {
  // Rule R4's second half: no re-seal of what did not change, so nothing churns on sync.
  const w = await protectedCard([PIN], { name: 'renamed' });
  const before = await rawSlots(w);

  await w.edit();

  assert.equal(w.node().name, 'renamed', 'the edit happened');
  assert.deepEqual(await rawSlots(w), before);
  // The kept revision IS written (history records every save); what must not be is a fresh wrap.
  assert.deepEqual(w.written.filter((value) => readSecret(value).kind === 'locked'), [], 'a value was re-sealed, so it churns on sync');
});

test('the vault locking while the form is open makes Save ask again; a decline keeps everything as it was', async () => {
  const w = await protectedCard([PIN, undefined], { name: 'renamed', lockVaultBeforeSave: true });
  const before = await rawSlots(w);

  await w.edit();

  assert.equal(w.said.boxes, 2, 'once at the door, once at Save');
  assert.equal(w.form.heldAtSave, true, 'the decline must keep the form OPEN with what was typed — not close it and drop the save');
  assert.equal(w.node().name, 'orest payoneer', 'nothing was saved');
  assert.deepEqual(await rawSlots(w), before);
});

test('the vault locking while the form is open makes Save ask again; the PIN typed there seals the save', async () => {
  const w = await protectedCard([PIN, PIN], { name: 'renamed', newPayment: { ...CARD, cvv: '999' }, lockVaultBeforeSave: true });

  await w.edit();

  assert.equal(w.said.boxes, 2);
  assert.equal(w.node().name, 'renamed');
  assert.deepEqual(parsePaymentFields(await opened(w, 'payment details')), { ...CARD, cvv: '999' });
});

// ---------------------------------------------------------------------------------------------
// D5 — terminal variables never receive a value of a protected entry.
// ---------------------------------------------------------------------------------------------

test('an Edit that types a new password hands the env bindings the MARKED details and writes no variable', async () => {
  // Two bindings, two roads: the password is refused by the WRAP (it is sealed now), the public key —
  // metadata, never wrapped — is refused by the MARK alone. Passing the form's unmarked details wrote
  // $PUB, and would have written $PROD_PW too before the seal.
  const details = credential({ envBindings: { password: 'PROD_PW', publicKey: 'PUB' }, publicKey: 'ssh-ed25519 AAAA' });
  const w = await world(details, { password: await locked('hunter2') }, [PIN], { newPassword: 'NEW-PW' });

  await w.edit();

  assert.deepEqual(w.env.replaced, {}, 'a value of a protected entry reached the environment collection');
  const warnings = w.said.warnings.join(' ');
  assert.match(warnings, /\$PROD_PW was not written: .*protected with its own PIN/);
  assert.match(warnings, /\$PUB was not written: .*protected with its own PIN/);
  assert.deepEqual(w.said.infos, [], 'nothing was set, so nothing claims to be');
});

// ---------------------------------------------------------------------------------------------
// The edges of the save: a wrong PIN at Save, an entry unprotected meanwhile, and the writer's own rules.
// ---------------------------------------------------------------------------------------------

test('a WRONG PIN at Save is said, keeps the form open, and saves nothing', async () => {
  const w = await protectedCard([PIN, '0000'], { name: 'renamed', lockVaultBeforeSave: true });
  const before = await rawSlots(w);

  await w.edit();

  assert.equal(w.form.heldAtSave, true, 'the form stays open with what was typed');
  assert.match(w.said.warnings.join(' '), /That PIN does not open this entry/);
  assert.equal(w.node().name, 'orest payoneer');
  assert.deepEqual(await rawSlots(w), before);
});

test('Save refuses, and says why, when the entry stopped being protected while the form was open', async () => {
  // Sealing it would re-protect it without the person's decision; writing it plain would drop the
  // mark in silence. Neither — the sentence says what to do instead.
  const w = await world(credential(), { password: 'plain now' }, []);
  const { pinForSave } = require('../editPrefill') as typeof import('../editPrefill');
  const reported: string[] = [];
  const gate = { accountId: ACCOUNT, entityId: 'c1', entryName: 'godaddy', ask: (): Promise<string> => assert.fail('there is no PIN to ask for') };

  assert.equal(await pinForSave(w.storage, gate, (reason) => reported.push(reason)), undefined);
  assert.match(reported[0] ?? '', /"godaddy" stopped being protected with a PIN while this form was open/);
  assert.match(reported[0] ?? '', /Nothing was saved/);
});

test('the sealing writer still deletes on nothing, keeps on an empty password, and leaves the attachment outside the PIN', async () => {
  const w = await world(credential(), { password: await locked('hunter2'), notes: await locked('the note') }, []);
  const { openEntryForEdit, sealedWriter } = require('../editPrefill') as typeof import('../editPrefill');
  const gate = { accountId: ACCOUNT, entityId: 'c1', entryName: 'godaddy', ask: (): Promise<string> => Promise.resolve(PIN) };
  // What the door leaves behind: the prefill opens with the grant and never asks (the silent gate).
  (require('../pinSession') as typeof import('../pinSession')).grantPin(ACCOUNT, 'c1', PIN);
  const open = await openEntryForEdit(w.storage, ACCOUNT, 'c1', gate);
  assert.ok(open.kind === 'open', 'the entry opened');
  assert.equal(open.prefill.locked, true);
  assert.equal(open.prefill.notes, 'the note');
  const password = await w.storage.getPassword(ACCOUNT, 'c1');
  const writer = sealedWriter(w.storage, ACCOUNT, 'c1', PIN, open.prefill);

  await writer.setPassword(ACCOUNT, 'c1', '');
  await writer.setNotes(ACCOUNT, 'c1', undefined);
  await writer.setAttachment(ACCOUNT, 'c1', 'QUJD');

  assert.equal(await w.storage.getPassword(ACCOUNT, 'c1'), password, 'an empty password box means keep, byte for byte');
  assert.equal(await w.storage.getNotes(ACCOUNT, 'c1'), undefined, 'undefined is still a delete (Rule A)');
  assert.equal(await w.storage.getAttachment(ACCOUNT, 'c1'), 'QUJD', 'the attachment is outside the PIN and is written as it came');
});

test('a save that fails part-way says so, stored nothing in the clear, and left the node as it was', async () => {
  const w = await protectedCard([PIN], { name: 'renamed', newPayment: { ...CARD, cvv: '999' } });
  const storage = w.storage as unknown as { setPaymentRaw: (...args: unknown[]) => Promise<void> };
  storage.setPaymentRaw = (): Promise<void> => Promise.reject(new Error('the keychain refused the write'));

  await w.edit();

  assert.match(w.said.warnings.join(' '), /Saving "orest payoneer" stopped part-way: the keychain refused the write\. Nothing was stored in the clear/);
  assert.deepEqual(w.written.filter((value) => value.includes('"999"')), [], 'no plaintext reached the keychain');
  assert.equal(w.node().name, 'orest payoneer', 'the node is written after the additions, so it did not move');
});
