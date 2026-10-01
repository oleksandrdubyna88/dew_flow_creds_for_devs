import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { SECRET_SLOTS, SlotSink } from '../entitySlots';
import { Finding, funnelUses, importedUses, readsKeptVersions, slotWritesOverStorage, storageWrites } from './funnelScan';

/**
 * The funnel — the syntax half (`PLAN_typed_stored_secrets.md` §3 item 1, T3).
 *
 * <p>A stored secret reaches text, and text reaches a stored form, only through a handful of modules:
 * the parser, the producers of a stored form, the doors, the carriers that move a stored string without
 * reading it. Every other module asks one of those. The phantom type (`storedSecret.ts`) makes the
 * compiler hold that since the getters return it (T5); for what a type cannot see — a cast above all —
 * this scan holds it: a module outside the allowlist that calls `readSecret(`, `isLockedSecret(`,
 * `plainSecret(`, `lockSecret(`, `sealValue(`, `stored(`, `carried(` or their siblings, or writes
 * `as StoredSecret`, fails here naming file and line.</p>
 *
 * <p>Two structural companions (`testing.md`, <i>a structural test that matches nothing passes forever</i>):
 * a NEGATIVE fixture — a source outside the allowlist that calls `carried()` must be reported — and a
 * POSITIVE control — the scan still finds the parser's known callers in the modules allowed to call it.</p>
 *
 * <p>And the rule of the second plan round's finding 0: a kept version is admitted ONCE, by
 * `revisionDoor.openKeptVersion`, and read through a silent gate after that — so no module that reads
 * kept versions opens one with `clickOpener`, whose door would be a second question about an entry the
 * person answered for a moment ago.</p>
 */

const SRC = path.join(__dirname, '..', '..', 'src');

/**
 * The funnel's functions, and the modules that define them (`entityPin` re-exports `sealValue`).
 * `storedRead` is the getters' mint.
 */
const FUNNEL = ['stored', 'storedRead', 'carried', 'readSecret', 'isLockedSecret', 'isCorruptSecret', 'isWovenSecret', 'plainSecret', 'lockSecret', 'sealValue', 'sealText'];
const DEFINED_IN = ['storedSecret', 'secretEnvelope', 'sealValue', 'entityPin'];

/** The modules that may use the funnel, each with its reason (the plan's §3 table). */
const ALLOWED: Readonly<Record<string, string>> = {
  'storedSecret.ts': 'the type, `stored`, `carried`',
  'storageManager.ts': 'mints at `this.secrets.get` (`storedRead`); the typed setters serialise then mint; `carried` at the keychain write',
  'secretEnvelope.ts': 'the parser and the producers of a stored form — `carried` inside its own parse is funnel-internal',
  'sealValue.ts': 'the one sealing rule',
  'pinAttempts.ts': 'the one `unlockSecret` choke point',
  'revisionHistory.ts': 'the kept versions\' parse boundary (`isRevisionList`, `pushRevision` mints what it keeps)',
  'revisionStore.ts': 'the kept versions\' parse boundary (`pushRevision`)',
  'secretMaps.ts': 'a raw carrier: chest ↔ bundle maps',
  'syncPinRule.ts': 'the sealed-state rule over the bundle\'s map strings',
  'syncProtection.ts': 'a raw carrier: `revisionFromSnapshot`',
  'exportSecrets.ts': 'stored → wire, through the export\'s opener',
  'sharePayloadBuild.ts': 'stored → wire for an unprotected entry\'s share',
  'shareRecipientPin.ts': 'the recipient\'s own wrap of an arriving payload, in memory before any write',
  'entryWriter.ts': 'text → stored: the plain and the sealing writer',
  'pinGate.ts': 'the door primitive and the refusals',
  'pinAdmission.ts': 'the door: the first sealed slot decides whether it asks — `carried` in `openedText`\'s unprotected branch is funnel-internal',
  'secretOpener.ts': 'the openers, and the two owner-less reads — `carried` in `unsealedText` is funnel-internal',
  'pinClick.ts': 'the click door: a sealed value needs the door',
  'entityPin.ts': 'Protect / Remove PIN: seals and opens in place',
  'historyPin.ts': 'seals and opens kept versions in place',
  'restoreVersion.ts': 'Restore\'s writes, sealed in memory before the first one',
  'entitySlots.ts': 'the table: types only',
  'entityFieldReading.ts': 'a metadata value read as the plain stored form it is (legacy note / public key kept in node metadata)',
  'envApply.ts': 'a metadata value read as the plain stored form it is (legacy note / public key kept in node metadata)',
};

function sourceFiles(dir: string = SRC): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'test' ? [] : sourceFiles(full);
    }
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

function relative(full: string): string {
  return path.relative(SRC, full).split(path.sep).join('/');
}

function eachSource<T>(scan: (file: string, text: string) => T[]): T[] {
  return sourceFiles().flatMap((full) => scan(relative(full), fs.readFileSync(full, 'utf8')));
}

function usesIn(file: string, text: string): Finding[] {
  return funnelUses(file, text, FUNNEL, DEFINED_IN);
}

const said = (finding: Finding): string => `src/${finding.file}:${finding.line} ${finding.what}`;

// ---- the funnel ----

test('no module outside the funnel parses a stored string, mints or strips one, or seals one', () => {
  const outside = eachSource(usesIn).filter((finding) => ALLOWED[finding.file] === undefined);

  assert.deepEqual(outside.map(said), [], 'a module outside the funnel uses it — ask an opener, a door or a writer instead');
});

test('the companion: the scan still finds the funnel\'s known callers inside it', () => {
  const found = eachSource(usesIn);
  const seen = (file: string, what: string): boolean => found.some((finding) => finding.file === file && finding.what === what);

  assert.ok(seen('secretOpener.ts', 'readSecret('), 'the opener\'s own parse is no longer seen');
  assert.ok(seen('pinGate.ts', 'readSecret('), 'the door primitive\'s parse is no longer seen');
  assert.ok(seen('entityPin.ts', 'sealValue('), 'Protect\'s sealing is no longer seen');
  assert.ok(seen('shareRecipientPin.ts', 'lockSecret('), 'the recipient\'s wrap is no longer seen');
  assert.ok(seen('exportSecrets.ts', 'carried('), 'the export\'s byte-identical carry is no longer seen');
});

test('the negative fixture: a module outside the allowlist that strips a stored secret is reported', () => {
  const source = [
    "import { carried, StoredSecret } from './storedSecret';",
    "import * as env from '../secretEnvelope';",
    "import { sealValue as seal } from './entityPin';",
    'export function leak(s: StoredSecret): string { return carried(s); }',
    'export const kind = (raw: string) => env.readSecret(raw).kind;',
    'export const sealer = seal;',
    'export const forged = (raw: string) => raw as unknown as StoredSecret;',
  ].join('\n');

  assert.deepEqual(usesIn('fixture.ts', source).map(said), [
    'src/fixture.ts:4 carried(',
    'src/fixture.ts:5 readSecret(',
    'src/fixture.ts:6 sealValue(',
    'src/fixture.ts:7 as StoredSecret',
  ]);
});

test('a local function that happens to share a funnel name is not a use of the funnel', () => {
  const source = 'function stored(x: string): string { return x; }\nexport const y = stored("a");';

  assert.deepEqual(usesIn('fixture.ts', source), [], 'cardFormFields.ts has its own `stored(` and parses nothing');
});

// ---- a kept version is admitted once (second plan round, finding 0) ----

/** The modules that read kept versions and reach for the click opener. */
function clickOpenedKeptReaders(): string[] {
  return sourceFiles()
    .map((full) => [relative(full), fs.readFileSync(full, 'utf8')] as const)
    .filter(([file, text]) => readsKeptVersions(file, text).length > 0 && importedUses(file, text, 'clickOpener', 'pinClick').length > 0)
    .map(([file]) => file);
}

test('no reader of a kept version opens it with clickOpener — the version was admitted once, by openKeptVersion', () => {
  assert.deepEqual(clickOpenedKeptReaders(), [], 'a second door for a version the door admitted a moment ago: open it through a silent gate');
});

test('the companion: the scan still sees kept-version readers and click openers', () => {
  const kept = new Set(eachSource(readsKeptVersions).map((finding) => finding.file));
  const clicks = new Set(eachSource((file, text) => importedUses(file, text, 'clickOpener', 'pinClick')).map((finding) => finding.file));

  assert.ok(kept.has('entityViewerCommands.ts') && kept.has('configCommands.ts'), 'the viewer and Show Config Changes read kept versions');
  assert.ok(clicks.has('sshConnect.ts'), 'Connect opens its credential with a click opener');
  const fixture = "import { clickOpener } from './pinClick';\nasync function f(s: S) { const [v] = await s.getHistory('a', 'e'); return clickOpener(s, 'a', 'x')(o, v.secrets.config); }";
  assert.equal(readsKeptVersions('fixture.ts', fixture).length > 0 && importedUses('fixture.ts', fixture, 'clickOpener', 'pinClick').length > 0, true, 'the fixture is not seen');
});

// ---- the stored-form rule (permanent): no slot is written through the storage itself but here ----
//
// T4 added this as an INTERIM rule while the setters took `string`. Since T5 the TYPE refuses the storage
// as a plaintext writer, so its additions-pass pattern — `applyAdditions(storage, …)` — was retired with
// T5's eleventh commit (`fixtures/typed/storage_is_not_a_writer.ts` is its compile-time twin). What stays
// is what a type cannot see: a `StoredSecret` does not say whether it is plain or sealed, so a plain
// stored form copied into a protected entry type-checks — through `storage.set<Slot>(`, through an alias
// of the storage (`store: storage`, `const vault = storage`; restored after E3's test-diff check, any
// name but `storage`), or through a typed setter (`setFields`, `setPayment`, `setSecond`) taking a record.

/**
 * The slot setters, asked of the slot table rather than typed out — each row's `write` run against a
 * recording storage — plus the typed setter beside each raw one (`setFieldsRaw` → `setFields`), which
 * serialises and then calls it. An eleventh slot is covered with no line written here.
 */
function slotSetters(): string[] {
  const raw = SECRET_SLOTS.map((slot) => {
    let called = '';
    const recorder = new Proxy({}, { get: (_target, name) => (): Promise<void> => ((called = String(name)), Promise.resolve()) });
    void slot.write(recorder as unknown as SlotSink, 'a', 'e', 'v');
    return called;
  });
  return [...raw, ...raw.filter((name) => name.endsWith('Raw')).map((name) => name.slice(0, -'Raw'.length))];
}

/** The two modules that may hand a value to the storage's own setter: the writer, and the table it walks. */
const WRITERS = new Set(['entryWriter.ts', 'entitySlots.ts']);

function writesIn(file: string, text: string): Finding[] {
  return storageWrites(file, text, slotSetters());
}

test('a slot is written through the storage itself only inside entryWriter.ts and the slot table — every other write comes from writerFor', () => {
  const outside = eachSource(writesIn).filter((finding) => !WRITERS.has(finding.file));

  assert.deepEqual(outside.map(said), [], 'the storage handed out as a writer: take one from entryWriter.writerFor instead');
});

test('the companions: the setters come from the table, and the scan still finds the writer\'s own writes', () => {
  const setters = slotSetters();
  assert.equal(setters.length, SECRET_SLOTS.length + 3, `the table's setters: ${setters.join(', ')}`);
  assert.ok(setters.includes('setPaymentRaw') && setters.includes('setPayment'), 'the card — raw and typed');
  const sanctioned = eachSource(writesIn).filter((finding) => finding.file === 'entryWriter.ts');
  assert.ok(sanctioned.some((finding) => finding.what === 'storage.setPassword('), 'the plain writer\'s own write is no longer seen');
});

test('the negative fixture: a slot setter called on the storage is reported, raw or typed, and so is the storage bound to another name — a deletion is not a write', () => {
  const source = [
    'export async function b(ctx: C, s: StoredSecret) { await ctx.storage.setPassword("a", "e", s); }',
    'export async function c(storage: S) { await storage.setFields("a", "e", { login: "x" }); }',
    'export async function d(storage: S) { await storage.setNotes("a", "e", undefined); }',
    'export const deps = { store: storage };',
    'export class I { f() { let store = this.deps.storage; return store; } }',
    'export async function e(storage: S, s: StoredSecret) { const vault = storage; await vault.setPassword("a", "e", s); }',
  ].join('\n');

  assert.deepEqual(writesIn('fixture.ts', source).map(said), [
    'src/fixture.ts:1 storage.setPassword(',
    'src/fixture.ts:2 storage.setFields(',
    'src/fixture.ts:4 store: storage',
    'src/fixture.ts:5 store: storage',
    'src/fixture.ts:6 vault: storage',
  ]);
});

// ---- ...and no slot table row writes through the storage itself, but these (the E2 security review, finding 2) ----

/**
 * `slot.write(storage, …)` stores a value with nothing between it and the keychain — no lease, no
 * re-check of the decision it was made under. Restore's plain path did that, and an entry protected
 * between its decision and its writes was restored in the clear. Allowed only here, each with its reason,
 * keyed `file#function`.
 */
const SLOT_WRITERS: Readonly<Record<string, string>> = {
  'entityPin.ts#sealIfStill': 'Protect: the SEAL, written under the lease after the slot was read again',
  'entityPin.ts#unprotectEntity': 'Remove PIN Protection…: the values the person\'s own PIN opened, by the person\'s decision',
  'restoreVersion.ts#writeSealed': 'Restore\'s sealed road: every value sealed in memory under the entry\'s PIN before the first write (R3)',
};

const slotWriteKey = (finding: Finding): string => `${finding.file}#${finding.what.replace(/^slot\.(write|store)\(storage in /, '')}`;

test('no slot table row is handed the storage itself as its writer outside the allowlist — every other value goes through writerFor', () => {
  const outside = eachSource(slotWritesOverStorage).filter((finding) => SLOT_WRITERS[slotWriteKey(finding)] === undefined);

  assert.deepEqual(outside.map(said), [], 'a slot written through the storage itself: take a writer from entryWriter.writerFor');
});

test('the companions: every allowlisted slot writer is still there, and the scan reports one it is shown', () => {
  const seen = new Set(eachSource(slotWritesOverStorage).map(slotWriteKey));
  assert.deepEqual(Object.keys(SLOT_WRITERS).filter((key) => !seen.has(key)), [], 'an allowlist entry matches nothing — take it out');
  const fixture = [
    'export async function restoreAround(storage: S, slot: T) { await slot.write(storage, "a", "e", "v"); }',
    'export const viaArrow = async (ctx: C, slot: T) => slot.write(ctx.storage, "a", "e", "v");',
    'export async function viaWriter(writer: W, slot: T) { await slot.write(writer, "a", "e", "v"); }',
  ].join('\n');
  assert.deepEqual(slotWritesOverStorage('fixture.ts', fixture).map(said), [
    'src/fixture.ts:1 slot.write(storage in restoreAround',
    'src/fixture.ts:2 slot.write(storage in viaArrow',
  ]);
});
