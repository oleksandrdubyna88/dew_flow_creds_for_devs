import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { Finding, funnelUses, importedUses, readsKeptVersions } from './funnelScan';

/**
 * The funnel — the syntax half (`PLAN_typed_stored_secrets.md` §3 item 1, T3).
 *
 * <p>A stored secret reaches text, and text reaches a stored form, only through a handful of modules:
 * the parser, the producers of a stored form, the doors, the carriers that move a stored string without
 * reading it. Every other module asks one of those. The phantom type (`storedSecret.ts`) will make the
 * compiler hold that once the getters return it (E3); until then — and for what a type cannot see, a
 * cast — this scan holds it: a module outside the allowlist that calls `readSecret(`, `isLockedSecret(`,
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

/** The funnel's functions, and the modules that define them (`entityPin` re-exports `sealValue`). */
const FUNNEL = ['stored', 'carried', 'readSecret', 'isLockedSecret', 'isCorruptSecret', 'isWovenSecret', 'plainSecret', 'lockSecret', 'sealValue'];
const DEFINED_IN = ['storedSecret', 'secretEnvelope', 'sealValue', 'entityPin'];

/** The modules that may use the funnel, each with its reason (the plan's §3 table). */
const ALLOWED: Readonly<Record<string, string>> = {
  'storedSecret.ts': 'the type, `stored`, `carried`',
  'storageManager.ts': 'mints at `this.secrets.get`; the typed setters serialise then store',
  'secretEnvelope.ts': 'the parser and the producers of a stored form',
  'sealValue.ts': 'the one sealing rule',
  'pinAttempts.ts': 'the one `unlockSecret` choke point',
  'revisionHistory.ts': 'the kept versions\' parse boundary (`isRevisionList`)',
  'revisionStore.ts': 'the kept versions\' parse boundary (`pushRevision`)',
  'secretMaps.ts': 'a raw carrier: chest ↔ bundle maps',
  'syncPinRule.ts': 'the sealed-state rule over the bundle\'s map strings',
  'syncProtection.ts': 'a raw carrier: `revisionFromSnapshot`',
  'exportSecrets.ts': 'stored → wire, through the export\'s opener',
  'sharePayloadBuild.ts': 'stored → wire for an unprotected entry\'s share',
  'shareRecipientPin.ts': 'the recipient\'s own wrap of an arriving payload, in memory before any write',
  'entryWriter.ts': 'text → stored: the plain and the sealing writer',
  'pinGate.ts': 'the door primitive and the refusals',
  'pinAdmission.ts': 'the door: the first sealed slot decides whether it asks',
  'secretOpener.ts': 'the openers, and the two owner-less reads',
  'pinClick.ts': 'the click door: a sealed value needs the door',
  'entityPin.ts': 'Protect / Remove PIN: seals and opens in place',
  'historyPin.ts': 'seals and opens kept versions in place',
  'restoreVersion.ts': 'Restore\'s writes, sealed in memory before the first one',
  'entitySlots.ts': 'the table: types only',
  // Until T4 moves the two sealing writers into `entryWriter.ts` — the next story of this epic.
  'editPrefill.ts': 'Edit\'s sealing writer, until T4 moves it into entryWriter.ts',
  'shareUpdateSeal.ts': 'the share update\'s sealing writer, until T4 moves it into entryWriter.ts',
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
