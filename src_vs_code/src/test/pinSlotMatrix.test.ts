import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFields, serializeFields } from '../entityFields';
import type { EntityFormOptions, EntityFormValues } from '../entityFormShape';
import type { EntityViewOptions } from '../entityViewPage';
import { SECRET_SLOTS, SecretSlot } from '../entitySlots';
import { parsePaymentFields, serializePaymentFields } from '../paymentFields';
import type { Revision, RevisionSecrets } from '../revisionHistory';
import { parseSecondValues, serializeSecondValues } from '../secondValues';
import { readSecret, unlockSecret } from '../secretEnvelope';
import type { StorageManager } from '../storageManager';
import { totpSnapshot } from '../totp';
import { EntityKind, EntityMetadata, TreeNode } from '../types';
import { ACCOUNT, PIN, clickVscode, locked, memoryStorage, seedEntry, sinks } from './pinWorld';
import { loadEachWithVscode } from './vscodeStub';

/**
 * The slot matrix (entry-PIN plan §7 item 5): for EVERY slot of the table, with ONLY that slot
 * sealed, every surface that carries it gets the plaintext and never `"lock":`.
 *
 * <p>The owner's card was one slot on one surface. The defects the audit found after it were the same
 * shape on other cells of the same grid — the second values in the viewer, login/URL in export, notes
 * in `creds://` — and each was invisible to a test written for the cell someone happened to think of.
 * So the grid is walked whole: ten slots × every surface, over the REAL `StorageManager` with real
 * `lockSecret` wraps, through the product's own entry points.</p>
 *
 * <ul>
 *   <li><b>Clicks get the plaintext</b> — the live viewer, the revision viewer, Edit's prefill, the
 *       click door every sink goes through (`clickedSecret`; `pinReaderBoundary` holds every door
 *       file to it), export and the share payload. One PIN, at the first door.</li>
 *   <li><b>Automatic readers get a SAID refusal</b> — terminal variables and `creds://` answer
 *       `withheld` with the PIN sentence (rule R2). The plan's §7 list put them under "receives the
 *       plaintext"; that would be the leak D5 closed, so this asserts the rule instead.</li>
 *   <li><b>Edit-save</b>: an untouched save leaves every slot byte-identical; a changed slot is stored
 *       sealed and opens to the new text.</li>
 * </ul>
 *
 * <p>The fixture table is typed `Record<keyof RevisionSecrets, …>` — the column a slot is kept under
 * (`slotTable.test.ts` holds the ten columns equal to `SMALL_FIELDS`) — so an eleventh slot with no
 * fixture here does not compile.</p>
 */

type SlotField = keyof RevisionSecrets;

interface Fixture {
  readonly plain: string;
  readonly changed: string;
  /** A piece of `changed` that nothing else holds — what the keychain's write log is searched for (R3). */
  readonly telltale: string;
  readonly kind: EntityKind;
  /** The text a record is compared as — the serialiser that owns it, so key order is not a difference. */
  readonly canon: (text: string) => string;
}

const same = (text: string): string => text;
const fields = (text: string): string => serializeFields(parseFields(text)) ?? '';
const payment = (text: string): string => serializePaymentFields(parsePaymentFields(text)) ?? '';
const second = (text: string): string => serializeSecondValues(parseSecondValues(text)) ?? '';

const FIXTURES: Readonly<Record<SlotField, Fixture>> = {
  notes: { plain: 'the note', changed: 'a note typed today', telltale: 'typed today', kind: 'credential', canon: same },
  fields: { plain: '{"login":"me","url":"https://example.com"}', changed: '{"login":"you","url":"https://example.org"}', telltale: 'example.org', kind: 'credential', canon: fields },
  second: { plain: '{"password2":"swordfish"}', changed: '{"password2":"marlin"}', telltale: 'marlin', kind: 'credential', canon: second },
  payment: { plain: '{"number":"4111111111111111","expiry":"12/30"}', changed: '{"number":"5500000000000004","expiry":"01/31"}', telltale: '5500000000000004', kind: 'payment', canon: payment },
  config: { plain: 'API_KEY=first\n', changed: 'API_KEY=second\n', telltale: 'API_KEY=second', kind: 'config', canon: same },
  dbConnection: { plain: 'postgresql://app:db-secret@db.example.com:5432/app', changed: 'postgresql://app:db-rotated@db.example.com:5432/app', telltale: 'db-rotated', kind: 'db', canon: same },
  vpnConfig: { plain: '[Interface]\nPrivateKey=vpn-first\n', changed: '[Interface]\nPrivateKey=vpn-second\n', telltale: 'vpn-second', kind: 'vpn', canon: same },
  totp: {
    plain: 'otpauth://totp/GitHub:me?secret=JBSWY3DPEHPK3PXP&issuer=GitHub',
    changed: 'otpauth://totp/GitHub:me?secret=KRSXG5CTMVRXEZLU&issuer=GitHub',
    telltale: 'KRSXG5CTMVRXEZLU',
    kind: 'credential',
    canon: same,
  },
  privateKey: { plain: 'ssh-key-first', changed: 'ssh-key-second', telltale: 'ssh-key-second', kind: 'sshkey', canon: same },
  password: { plain: 'hunter2', changed: 'NEW-PW', telltale: 'NEW-PW', kind: 'credential', canon: same },
};

const SEALED = /"lock":/;

// ---- the world: one entry, ONE slot sealed, every surface loaded into one graph ----

type Modules = {
  viewer: typeof import('../entityViewerCommands');
  edit: typeof import('../entityEditCommands');
  prefill: typeof import('../editPrefill');
  click: typeof import('../pinClick');
  prompt: typeof import('../pinPrompt');
  exports: typeof import('../exportSecrets');
  share: typeof import('../sharePayloadBuild');
  env: typeof import('../envApply');
  refs: typeof import('../entityFieldReading');
};

interface World {
  readonly storage: StorageManager;
  readonly details: EntityMetadata;
  readonly slot: SecretSlot;
  readonly fixture: Fixture;
  readonly m: Modules;
  /** Every page the viewers showed. */
  readonly shown: EntityViewOptions[];
  /** What the edit form posts back — set before an edit. */
  post: (options: EntityFormOptions) => EntityFormValues;
  readonly boxes: () => number;
  /** Every value the keychain was ever handed, in order — rule R3 is about the moment between writes. */
  readonly written: string[];
  node(): TreeNode;
}

function slotFor(field: SlotField): SecretSlot {
  const slot = SECRET_SLOTS.find((one) => one.revisionField === field);
  assert.ok(slot !== undefined, `the slot table has no row kept as ${field}`);
  return slot;
}

async function world(field: SlotField): Promise<World> {
  const fixture = FIXTURES[field];
  const slot = slotFor(field);
  const said = sinks();
  const stub = clickVscode([PIN], said);
  const written: string[] = [];
  const storage = memoryStorage(stub, written);
  const details = { id: `e-${field}`, name: `entry with ${field}`, isSshEnabled: false, kind: fixture.kind, isPayment: fixture.kind === 'payment' || undefined, paymentForm: fixture.kind === 'payment' ? 'card' : undefined, pinProtected: true } as EntityMetadata;
  await seedEntry(storage, details, { [slot.label]: await locked(fixture.plain) });
  const shown: EntityViewOptions[] = [];
  const self: World = {
    storage,
    details,
    slot,
    fixture,
    shown,
    m: {} as Modules,
    post: () => assert.fail('no edit answer was set'),
    boxes: () => said.boxes,
    written,
    node: () => storage.getNode(ACCOUNT, details.id) as TreeNode,
  };
  const loaded = loadEachWithVscode(
    ['../entityViewerCommands', '../entityEditCommands', '../editPrefill', '../pinClick', '../pinPrompt', '../exportSecrets', '../sharePayloadBuild', '../envApply', '../entityFieldReading'],
    stub,
    {
      './entityViewPanel': { showEntityView: (options: EntityViewOptions): void => void shown.push(options) },
      './entityFormPanel': { showEntityForm: (options: EntityFormOptions) => Promise.resolve(self.post(options)) },
    },
  );
  const [viewer, edit, prefill, click, prompt, exports, share, env, refs] = loaded as never[];
  Object.assign(self.m, { viewer, edit, prefill, click, prompt, exports, share, env, refs });
  (require('../pinSession') as typeof import('../pinSession')).forgetAllPins();
  (require('../envCollectionRef') as typeof import('../envCollectionRef')).setEnvCollection({ replace: () => undefined, delete: () => undefined } as never);
  return self;
}

// ---- what each surface shows of the slot ----

/** The viewer's page, read the way the page asks for it: eager text, or the per-request resolvers. */
const FROM_VIEW: Readonly<Record<SlotField, (page: EntityViewOptions) => Promise<string | undefined>>> = {
  notes: (page) => Promise.resolve(page.notes),
  fields: (page) => Promise.resolve(serializeFields(page.fields ?? {})),
  second: async (page) => serializeSecondValues(await (page.resolveSecond ?? (() => Promise.resolve({})))()),
  payment: async (page) => serializePaymentFields(await (page.resolvePayment ?? (() => Promise.resolve({})))()),
  config: (page) => Promise.resolve(page.config),
  dbConnection: (page) => Promise.resolve(page.resolveSecret('dbConnection')),
  vpnConfig: (page) => Promise.resolve(page.resolveSecret('vpnConfig')),
  // The viewer never hands out the seed — the CODE it derives is what a person copies.
  totp: (page) => Promise.resolve(page.resolveSecret('totp')),
  privateKey: (page) => Promise.resolve(page.resolveSecret('privateKey')),
  password: (page) => Promise.resolve(page.resolveSecret('password')),
};

/** What the viewer should show: the plaintext, or for the seed the code it derives right now. */
function shownAs(field: SlotField, fixture: Fixture): string[] {
  if (field !== 'totp') {
    return [fixture.canon(fixture.plain)];
  }
  const now = Date.now();
  // Either side of a period boundary: the code read a moment ago or the one read a moment later.
  return [codeAt(fixture.plain, now), codeAt(fixture.plain, now + 1500)];
}

function codeAt(seed: string, at: number): string {
  return totpSnapshot(seed, at)?.code ?? '';
}

/** Edit's prefill: seven slots are opened into the form, three only reported as present. */
type Prefill = import('../editPrefill').EditPrefill;
const FROM_PREFILL: Readonly<Record<SlotField, (prefill: Prefill) => string | boolean | undefined>> = {
  notes: (p) => p.notes,
  fields: (p) => p.fieldsRaw,
  second: (p) => p.secondRaw,
  payment: (p) => p.paymentRaw,
  config: (p) => p.configBody,
  dbConnection: (p) => p.dbConnection,
  totp: (p) => p.totp,
  vpnConfig: (p) => p.hasVpnConfig,
  privateKey: (p) => p.hasPrivateKey,
  password: (p) => p.hasPassword,
};

/** The export file's record of the entry, as the slot's own text. */
type Exported = import('../externalBundle').ExternalSecrets;
const FROM_EXPORT: Readonly<Record<SlotField, (s: Exported) => string | undefined>> = {
  notes: (s) => s.notes,
  fields: (s) => serializeFields({ login: s.login, url: s.url }),
  second: (s) => s.second,
  payment: (s) => s.payment,
  config: (s) => s.config,
  dbConnection: (s) => s.dbConnection,
  vpnConfig: (s) => s.vpnConfig,
  totp: (s) => s.totp,
  privateKey: (s) => s.privateKey,
  password: (s) => s.password,
};

/** The share payload — which carries no second values at all (they are named as not sent). */
type Shared = import('../types').SharePayload['secrets'];
const FROM_SHARE: Readonly<Record<SlotField, ((s: Shared) => string | undefined) | 'not carried'>> = {
  notes: (s) => s.notes,
  fields: (s) => s.fields,
  second: 'not carried',
  payment: (s) => s.payment,
  config: (s) => s.config,
  dbConnection: (s) => s.dbConnection,
  vpnConfig: (s) => s.vpnConfig,
  totp: (s) => s.totp,
  privateKey: (s) => s.privateKey,
  password: (s) => s.password,
};

/** What an edit posts to CHANGE only this slot to `text`; everything else as the form was given it. */
const CHANGING: Readonly<Record<SlotField, (text: string) => Partial<EntityFormValues>>> = {
  notes: (text) => ({ newNotes: text }),
  fields: (text) => ({ newFields: parseFields(text) }),
  second: (text) => ({ newSecond: parseSecondValues(text) }),
  payment: (text) => ({ newPayment: parsePaymentFields(text) }),
  config: (text) => ({ newConfigBody: text }),
  dbConnection: (text) => ({ newDbConnection: text }),
  vpnConfig: (text) => ({ newVpnConfig: text }),
  totp: (text) => ({ newTotp: text }),
  privateKey: (text) => ({ newPrivateKey: text }),
  password: (text) => ({ newPassword: text }),
};

/** The form's answer for a person who changed nothing — exactly what it was given (`editProtected.test.ts`). */
function untouched(options: EntityFormOptions): EntityFormValues {
  return {
    details: { ...(options.initial as EntityMetadata), hasTotp: options.hasStoredTotp || undefined },
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
    ...kindRecord(options),
  };
}

/** The one record each kind's form posts back — what `toValues` sends for that kind and no other. */
const BY_KIND: Partial<Record<EntityKind, (options: EntityFormOptions) => Partial<EntityFormValues>>> = {
  credential: (options) => ({ newFields: options.initialFields }),
  config: (options) => ({ newConfigBody: options.initialConfigBody }),
  db: (options) => ({ newDbConnection: options.initialDbConnection }),
  payment: (options) => ({ newPayment: options.initialPayment }),
};

function kindRecord(options: EntityFormOptions): Partial<EntityFormValues> {
  const pick = BY_KIND[options.initial?.kind ?? 'credential'];
  return pick === undefined ? {} : pick(options);
}

async function rawSlots(w: World): Promise<Record<string, string | undefined>> {
  const out: Record<string, string | undefined> = {};
  for (const slot of SECRET_SLOTS) {
    out[slot.label] = await slot.read(w.storage, ACCOUNT, w.details.id);
  }
  return out;
}

// ---- one surface each ----

/** The live viewer — the first door; its one box grants the PIN for everything after it. */
async function viewerShows(w: World, field: SlotField): Promise<void> {
  await w.m.viewer.openEntityViewer(ACCOUNT, w.node(), w.storage, { cliAliases: [], codeAccess: false, bridgeOpen: false, wslRelay: false } as never);
  assert.equal(w.shown.length, 1, 'the viewer opened');
  const shown = await FROM_VIEW[field](w.shown[0]);
  assert.ok(shownAs(field, w.fixture).includes(String(shown)), `the viewer did not show the ${field}: ${String(shown)}`);
}

function gateOf(w: World): import('../pinGate').PinGate {
  return w.m.prompt.entryPinGate(ACCOUNT, w.details.id, w.details.name);
}

/** Edit's prefill, behind the same grant: the plaintext for the seven it prefills, presence for the rest. */
async function prefillHolds(w: World, field: SlotField): Promise<void> {
  const opened = await w.m.prefill.openEntryForEdit(w.storage, ACCOUNT, w.details.id, gateOf(w));
  assert.ok(opened.kind === 'open', `Edit refused to open: ${JSON.stringify(opened)}`);
  const prefilled = FROM_PREFILL[field](opened.prefill);
  const expected = typeof prefilled === 'string' ? w.fixture.canon(prefilled) : prefilled;
  assert.ok(expected === true || expected === w.fixture.canon(w.fixture.plain), `the form was not given the ${field}: ${String(prefilled)}`);
  assert.doesNotMatch(JSON.stringify(opened.prefill), SEALED);
}

/** The click door every sink stands behind. */
async function clickOpens(w: World): Promise<void> {
  const clicked = await w.m.click.clickedSecret(w.storage, ACCOUNT, w.details, w.slot.read, 'use it');
  assert.ok(clicked.kind === 'open', `the click was stopped: ${JSON.stringify(clicked)}`);
  assert.equal(w.fixture.canon(String(clicked.value)), w.fixture.canon(w.fixture.plain), 'the sink got something other than the plaintext');
}

async function exportCarries(w: World, field: SlotField): Promise<void> {
  const exported = (await w.m.exports.exportSecretsFor(w.storage as never, ACCOUNT, [w.details.id]))[w.details.id];
  assert.equal(w.fixture.canon(String(FROM_EXPORT[field](exported))), w.fixture.canon(w.fixture.plain), `the export did not carry the ${field}`);
  assert.doesNotMatch(JSON.stringify(exported), SEALED);
}

async function shareCarries(w: World, field: SlotField): Promise<void> {
  const payload = await w.m.share.buildSharePayload(w.storage, ACCOUNT, w.node(), true, gateOf(w));
  const fromShare = FROM_SHARE[field];
  if (fromShare !== 'not carried') {
    assert.equal(w.fixture.canon(String(fromShare(payload.secrets))), w.fixture.canon(w.fixture.plain), `the share did not carry the ${field}`);
  }
  assert.doesNotMatch(JSON.stringify(payload), SEALED);
}

// ---- the matrix ----

for (const field of Object.keys(FIXTURES) as SlotField[]) {
  test(`only the ${field} is sealed: every click surface gets the plaintext after ONE PIN, and never "lock":`, async () => {
    const w = await world(field);

    await viewerShows(w, field);
    await prefillHolds(w, field);
    await clickOpens(w);
    await exportCarries(w, field);
    await shareCarries(w, field);

    assert.equal(w.boxes(), 1, 'one PIN, at the first door — every surface after it used the grant');
  });

  test(`only the ${field} is sealed: terminal variables and creds:// are refused in words, never handed "lock":`, async () => {
    const w = await world(field);
    const readings = [
      ...(['password', 'privateKey', 'dbConnection', 'dbPassword'] as const).map((one) => w.m.env.bindableFieldReading(w.storage, ACCOUNT, w.details, one)),
      ...(['password', 'privateKey', 'dbConnection', 'dbPassword', 'notes', 'totp'] as const).map((one) => w.m.refs.entityFieldReading(w.storage, ACCOUNT, w.details.id, one)),
    ];
    for (const reading of await Promise.all(readings)) {
      assert.equal(reading.kind, 'withheld', `an automatic reader was handed ${JSON.stringify(reading)}`);
      assert.match(reading.kind === 'withheld' ? reading.reason : '', /is protected with its own PIN, so it cannot be used automatically/);
    }
    assert.equal(w.boxes(), 0, 'nothing automatic asks');
  });

  test(`only the ${field} is sealed: a kept version of it opens in the revision viewer to the plaintext`, async () => {
    const w = await world(field);
    const revision: Revision = { at: 1_700_000_000_000, name: w.details.name, details: w.details, secrets: { [field]: await locked(w.fixture.plain) } };

    await w.m.viewer.openRevisionViewer(ACCOUNT, w.node(), revision, w.storage);

    assert.equal(w.shown.length, 1, 'the revision viewer opened');
    assert.ok(shownAs(field, w.fixture).includes((await FROM_VIEW[field](w.shown[0])) ?? ''), `the kept ${field} was not shown`);
    assert.equal(w.boxes(), 1, 'the live entry\'s door, once');
  });

  test(`only the ${field} is sealed: an untouched Edit-save leaves every slot byte-identical; a changed one is stored sealed and opens to the new text`, async () => {
    const w = await world(field);
    const before = await rawSlots(w);

    w.post = untouched;
    await w.m.edit.editNode(ACCOUNT, w.node(), w.storage, () => undefined);
    assert.deepEqual(await rawSlots(w), before, 'an untouched save re-sealed or rewrote a value (R4)');
    assert.equal(w.node().details?.pinProtected, true, 'the mark went (D3)');

    w.post = (options) => ({ ...untouched(options), ...CHANGING[field](w.fixture.changed) });
    w.written.length = 0;
    await w.m.edit.editNode(ACCOUNT, w.node(), w.storage, () => undefined);
    // The final state cannot show R3: a save that wrote plaintext and then ran the protectEntity sweep
    // ends exactly where a sealed save ends. The write log can.
    assert.deepEqual(w.written.filter((value) => value.includes(w.fixture.telltale)), [], `the new ${field} reached the keychain in the clear, if only for a moment (R3)`);
    const read = readSecret(await w.slot.read(w.storage, ACCOUNT, w.details.id));
    assert.equal(read.kind, 'locked', `the changed ${field} was stored in the clear (R3)`);
    const now = read.kind === 'locked' ? await unlockSecret(read.envelope, ACCOUNT, PIN) : '';
    assert.equal(w.fixture.canon(now), w.fixture.canon(w.fixture.changed));
  });
}
