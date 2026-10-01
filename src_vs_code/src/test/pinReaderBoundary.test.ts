import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { SECRET_SLOTS } from '../entitySlots';
import type { StorageManager } from '../storageManager';
import { SlotRead, containsOneOf, localGates, slotReads, ungated } from './readerScan';

/**
 * The reader boundary — why the class of bug behind the owner's lost card cannot come back quietly
 * (entry-PIN plan §7 item 2).
 *
 * <p>The card vanished because a reader took a slot's RAW stored string and treated it as the value:
 * a locked envelope parsed to `{}` and the card had no shape. The design record's defence was a
 * hand-written survey of readers, and it never had a row for the viewer's card or the edit form — a
 * list a person keeps in step with the code is the list that falls behind. So this test derives the
 * readers from the code and the getters from the slot table, and asks a person only the one thing a
 * scan cannot know: WHAT KIND of reader each file is.</p>
 *
 * <ul>
 *   <li><b>carrier</b> — moves the stored string without reading it as a value: sync/backup/snapshot
 *       plumbing, the seal/unseal of the PIN itself, counts of what is sealed. Sealed in, sealed out.</li>
 *   <li><b>door</b> — a click: the value is opened through the entry's door. The file must contain a
 *       door primitive (`admitEntry`, `openStored`, `openedText`, `clickedSecret`, …).</li>
 *   <li><b>automatic</b> — nothing is asked (rule R2): the file must contain a refusal primitive
 *       (`automaticPinRefusal`, `pinFieldRefusal`, `automaticOpener`, `isLockedSecret`, …).</li>
 *   <li><b>presence</b> — the file only asks whether a value EXISTS: every read must be
 *       `(await ….getX(…)) !== undefined`, which is true of an envelope exactly when it is of a value.</li>
 * </ul>
 *
 * <p>What counts as a read: ANY reference to a getter the slot table reads through — a call, a
 * `.bind`, a bracket access, a destructured binding, the getter handed on as a value (derived by
 * running each row's `read` against a recording storage — an eleventh slot is covered with no line
 * written here) — a `.read(` call in a file that walks the slot table, and `getHistory`, because a
 * kept version holds the same ten values (`SMALL_FIELDS`, asserted against the table by
 * `slotTable.test.ts`). The scan is the TypeScript syntax tree (`readerScan.ts`), and a door's or an
 * automatic reader's primitive must sit in the NEAREST FUNCTION of each read — per function, not per
 * file (review of 2026-09-30: a regular expression for `.getX(` and a per-file primitive check let a
 * `.bind` alias, a bracket access and an extra ungated function in a classified file through).
 * Modules that read no slot themselves — `pinClick`, `secretOpener`, `revisionDoor`,
 * `shareUpdateSeal`, `syncProtection` — are the primitives or take their values from a caller, and
 * the table refuses to list a file that reads nothing, so it can never go stale in that direction
 * either.</p>
 */

const SRC = path.join(__dirname, '..', '..', 'src');

type ReaderKind = 'carrier' | 'door' | 'automatic' | 'presence';

/**
 * Every `src/**` file that reads a slot, and what kind of reader it is. Keys are paths relative to
 * `src/`, with forward slashes. A file that does two kinds of reading lists both, and must satisfy both.
 */
const READERS: Readonly<Record<string, ReaderKind | readonly ReaderKind[]>> = {
  'agentUseActions.ts': 'automatic', // the broker's db query: pinFieldRefusal before the client
  'commands/entityCommands.ts': 'door', // Copy Password / DB / Code, Connect DB, Install SSH Key
  'configCommands.ts': ['door', 'automatic'], // Show Config Changes (click) and the config route body
  'configWrite.ts': 'door', // Write Config File
  'editPrefill.ts': ['door', 'presence'], // Edit's prefill, behind the door, through a silent gate; what the form is told exists
  'entityEditCommands.ts': 'presence', // "a private key is stored" for the form
  'entityFieldReading.ts': 'automatic', // creds:// references
  'entityFlags.ts': 'automatic', // the tree's hints: a sealed body is not judged
  'entityPin.ts': 'carrier', // Protect / Remove PIN: the seal itself
  'entitySlots.ts': 'carrier', // the slot table
  'entityViewerCommands.ts': 'door', // the viewer and the revision viewer
  'envApply.ts': 'automatic', // terminal variables
  'exportSecrets.ts': 'door', // export, after admitForExport
  'extension.ts': 'carrier', // rotation's current value, refused by rotateAction.protectedSlot
  'gitSigningKey.ts': 'door', // Git signing config
  'historyHeal.ts': 'carrier', // counts this machine's plaintext kept values
  'historyPin.ts': 'door', // seals and opens kept versions under the PIN
  'hygieneScan.ts': 'automatic', // the password-hygiene scan skips sealed values
  'maskEntries.ts': 'automatic', // output masking skips sealed values
  'mcpEntries.ts': 'automatic', // agents: a protected entry is hidden by its mark
  'openSite.ts': 'door', // Open Site in Browser
  'pinAdmission.ts': 'door', // the door itself
  'pinCommands.ts': 'carrier', // counts sealed kept values to offer Remove PIN
  'restoreVersion.ts': 'carrier', // Restore's writes: sealed in memory before the first write
  'revisionRestore.ts': 'door', // Restore This Version…: the live door, then the version
  'revisionSnapshot.ts': 'carrier', // a snapshot keeps the stored strings as they are
  'sharePayloadBuild.ts': ['door', 'presence'], // a share, after the share's door; whether a seed exists
  'shareWithheld.ts': 'door', // the share's "not sent" notice, with the share's grant
  'sshAgentManager.ts': 'automatic', // Add Key to Agent (click opener passed in) and the startup sweep
  'sshCredential.ts': 'automatic', // SSH connect: automatic opener by default, a click opener passed in
  'transportFactory.ts': 'automatic', // the git deploy key
  'viewerOptions.ts': 'door', // the viewer's gated reader
  'vpnLauncherRun.ts': 'door', // Start VPN
  'vpnRun.ts': 'door', // Save VPN Config
};

const DOOR_PRIMITIVES = ['admitEntry(', 'openStored(', 'openedText(', 'clickedSecret(', 'clickOpener(', 'gatedSecretReader(', 'openEntryForEdit(', 'openKeptVersion(', 'openRevision(', 'exportOpener'];
// `plainText(` and `unsealedText(` since the typed-secrets plan's T3: the owner-less reads that replaced
// `isLockedSecret(` in the scans (hygiene, masker, tree hints), which may no longer parse a stored string
// themselves (`storedSecretFunnel.test.ts`). They refuse a sealed value exactly as that call did.
const REFUSAL_PRIMITIVES = ['automaticPinRefusal(', 'pinFieldRefusal(', 'pinRefusalFor(', 'automaticOpener', 'isLockedSecret(', 'hiddenFromAgents(', 'plainText(', 'unsealedText('];

/** The getter each row of the slot table reads through — asked of the table, never typed out. */
function slotGetters(): string[] {
  return SECRET_SLOTS.map((slot) => {
    let called = '';
    const recorder = new Proxy(
      {},
      {
        get: (_target, name) => (): Promise<undefined> => {
          called = String(name);
          return Promise.resolve(undefined);
        },
      },
    );
    void slot.read(recorder as unknown as StorageManager, 'a', 'e');
    return called;
  });
}

/** The kept versions hold the same values as the slots, so reading them is reading the slots. */
const KEPT_VERSIONS_GETTER = 'getHistory';

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

/** The source with its comments blanked (newlines kept, so a line number still points at the line). */
function code(full: string): string {
  const text = fs.readFileSync(full, 'utf8');
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (_all, before: string) => before);
}

/** Every slot read in one file — the slot table's own `.read(` counted where the file walks the table. */
function readsIn(file: string, text: string): SlotRead[] {
  return slotReads(file, text, [...slotGetters(), KEPT_VERSIONS_GETTER], /from '\.{1,2}\/entitySlots'/.test(text));
}

function readsOf(file: string): SlotRead[] {
  return readsIn(file, fs.readFileSync(path.join(SRC, file), 'utf8'));
}

function allReads(): SlotRead[] {
  return sourceFiles().flatMap((full) => readsOf(relative(full)));
}

function kindsOf(file: string): readonly ReaderKind[] {
  const kind = READERS[file];
  if (kind === undefined) {
    return [];
  }
  return typeof kind === 'string' ? [kind] : kind;
}

/** The primitives each gated class must show. */
const PRIMITIVES: Readonly<Record<'door' | 'automatic', readonly string[]>> = { door: DOOR_PRIMITIVES, automatic: REFUSAL_PRIMITIVES };

/**
 * What each class of reader must show, read by read, in a file whose source is `text`: a door or a
 * refusal primitive in the read's own function — or a call of one of the file's own helpers that holds
 * one (`localGates`) — or, for presence, the presence shape. A carrier moves sealed strings and shows
 * nothing.
 */
function ruleFor(kind: ReaderKind, file: string, text: string): ((read: SlotRead) => boolean) | undefined {
  if (kind === 'carrier') {
    return undefined;
  }
  if (kind === 'presence') {
    return (read) => read.presence;
  }
  return containsOneOf([...PRIMITIVES[kind], ...localGates(file, text, PRIMITIVES[kind])]);
}

/**
 * Functions that read a slot and RETURN or hand on the stored string to a caller that gates it. The
 * scan cannot follow a value across a return or a parameter, so each is named here, per function, with
 * the gate its value goes through — a person's claim, checked from both sides: a function listed here
 * that no longer needs it (it reads nothing, or now holds its primitive) fails the test below, and a new
 * ungated function anywhere in a classified file fails the boundary naming itself.
 */
const GATED_BY_CALLER: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'commands/entityCommands.ts': {
    readPassword: 'a SlotRead handed to clickedValue, which reads through clickedSecret',
    readDb: 'a SlotRead handed to clickedValue, which reads through clickedSecret',
    readTotp: 'a SlotRead handed to clickedValue (Copy One-Time Code), which reads through clickedSecret',
    readKey: 'a SlotRead handed straight to clickedSecret (Install SSH Key)',
  },
  'entityFlags.ts': {
    read: 'history HEADS only (dates and names), and the password as a has-one flag',
  },
  'entityViewerCommands.ts': {
    nodeAt: 'resolves a history row; the revision viewer and Restore open it through revisionDoor.openKeptVersion',
  },
  'exportSecrets.ts': {
    secretsOf: 'every value goes through the ExportOpen it is given — exportOpener, a silent gate that throws on what it cannot open',
  },
  'gitSigningKey.ts': {
    readKey: 'a SlotRead handed straight to clickedSecret (Copy Git Signing Config)',
  },
  'historyPin.ts': {
    protectHistory: 'seals kept plaintext under the PIN it is given — a carrier inside a door file',
    unprotectHistory: 'opens kept values with the PIN already checked against the entry (openHistory, retryGranted)',
  },
  'mcpEntries.ts': {
    storedSecrets: 'has-one flags, and the connection string for the shaper; agents never see a protected entry (hiddenFromAgents, by the mark)',
  },
  'pinAdmission.ts': {
    firstLockedStored: 'looks only for a sealed value (isLockedSecret) to decide whether the door must ask',
  },
  'revisionRestore.ts': {
    agreed: 'counts and dates the kept versions for the confirmation; no value is used',
  },
  'sshCredential.ts': {
    passwordOwner: 'returns the stored password with its OWNER; the caller opens it through the opener it was given',
  },
  'transportFactory.ts': {
    findPrivateKey: 'returns the stored key with its owner; usableDeployKey refuses a sealed one (pinFieldRefusal) before materializePrivateKey',
  },
  'viewerOptions.ts': {
    password: 'storageSecretReader, the raw reader; its one caller wraps it in gatedSecretReader',
    privateKey: 'storageSecretReader, the raw reader; its one caller wraps it in gatedSecretReader',
    vpnConfig: 'storageSecretReader, the raw reader; its one caller wraps it in gatedSecretReader (typed since T5)',
    dbConnection: 'storageSecretReader, the raw reader; its one caller wraps it in gatedSecretReader',
    totpSeed: 'storageSecretReader, the raw reader; its one caller wraps it in gatedSecretReader',
    paymentRaw: 'storageSecretReader, the raw reader; its one caller wraps it in gatedSecretReader (typed since T5)',
    secondRaw: 'storageSecretReader, the raw reader; its one caller wraps it in gatedSecretReader (typed since T5)',
  },
};

function gatedByCaller(read: SlotRead): boolean {
  return GATED_BY_CALLER[read.file]?.[read.within] !== undefined;
}

/** A classified file's reads that meet none of its classes' rules, before the caller-gated list. */
function unmet(file: string): SlotRead[] {
  const text = fs.readFileSync(path.join(SRC, file), 'utf8');
  const rules = kindsOf(file).flatMap((kind) => ruleFor(kind, file, text) ?? []);
  return rules.length === 0 ? [] : ungated(readsIn(file, text), rules);
}

/** The reads that break the boundary: unmet, and not a function named in GATED_BY_CALLER. */
function breaking(file: string): SlotRead[] {
  return unmet(file).filter((read) => !gatedByCaller(read));
}

// ---- the companions: the scan still sees what it is meant to see ----

test('the getters are derived from the slot table — one per slot, none of them empty', () => {
  const getters = slotGetters();
  assert.equal(getters.length, SECRET_SLOTS.length);
  assert.ok(getters.every((name) => /^get[A-Z]/.test(name)), `a row read through something that is not a getter: ${getters.join(', ')}`);
  assert.equal(new Set(getters).size, getters.length, 'two slots read through one getter');
  assert.ok(getters.includes('getPaymentRaw'), 'the card — the slot the owner lost — is among them');
});

test('the scan still matches known readers — a pattern that matches nothing would pass over everything', () => {
  const reads = allReads();
  const seen = (file: string, getter: string): boolean => reads.some((read) => read.file === file && read.getter === getter);
  assert.ok(seen('viewerOptions.ts', 'getPaymentRaw'), 'viewerOptions reads the card');
  assert.ok(seen('editPrefill.ts', 'slot.read'), 'editPrefill walks the slot table');
  assert.ok(seen('historyPin.ts', KEPT_VERSIONS_GETTER), 'historyPin reads the kept versions');
  assert.ok(fs.readFileSync(path.join(SRC, 'storageManager.ts'), 'utf8').includes(`${KEPT_VERSIONS_GETTER}(`), 'the kept-versions getter still exists');
  assert.equal(readsOf('entityEditCommands.ts').filter((read) => read.presence).length, 1, 'the presence shape still matches the one presence read in entityEditCommands');
});

// ---- the boundary ----

test('every file that reads a slot is classified — an unlisted reader fails naming file, line and getter', () => {
  const unlisted = allReads().filter((read) => READERS[read.file] === undefined);
  assert.deepEqual(
    unlisted.map((read) => `src/${read.file}:${read.line} reads ${read.getter} — classify this reader in READERS (carrier, door, automatic or presence)`),
    [],
  );
});

test('the table lists no file that reads nothing — it cannot go stale either way', () => {
  const readers = new Set(allReads().map((read) => read.file));
  assert.deepEqual(Object.keys(READERS).filter((file) => !readers.has(file)), [], 'listed, but reads no slot any more: take it out of READERS');
});

test('every read in a classified file meets its class — per FUNCTION: a door or refusal primitive in the function the read sits in, the presence shape per read', () => {
  const failures = Object.keys(READERS).flatMap((file) =>
    breaking(file).map((read) => `src/${read.file}:${read.line} ${read.getter} in ${read.within} — no ${kindsOf(file).join('/')} primitive (or presence shape) in that function`),
  );
  assert.deepEqual(failures, []);
});

test('the caller-gated list names exactly the functions that need it — none stale, none now gated on their own', () => {
  const needed = new Set(Object.keys(READERS).flatMap((file) => unmet(file).map((read) => `${read.file}#${read.within}`)));
  const listed = Object.entries(GATED_BY_CALLER).flatMap(([file, functions]) => Object.keys(functions).map((name) => `${file}#${name}`));
  assert.deepEqual(listed.filter((entry) => !needed.has(entry)), [], 'listed in GATED_BY_CALLER, but it reads nothing ungated any more: take it out');
  assert.ok(needed.size > 0, 'the companion: the per-function scan still finds functions whose gate is their caller');
});

// ---- the scanner itself, over fixtures: what the text scan let through ----

const FIXTURE_GETTERS = ['getPassword'];

test('the scan sees a getter that is not called: a .bind alias, a bracket access, a destructured binding, the getter handed on as a value', () => {
  const sources = [
    'const read = storage.getPassword.bind(storage);',
    "const value = await storage['getPassword']('a', 'e');",
    'const { getPassword } = storage;',
    'const { getPassword: read } = storage;',
    'use(storage.getPassword);',
  ];
  for (const source of sources) {
    assert.deepEqual(slotReads('fixture.ts', source, FIXTURE_GETTERS).map((read) => read.getter), ['getPassword'], `not seen: ${source}`);
  }
  assert.deepEqual(slotReads('fixture.ts', "// storage.getPassword(\nconst s = 'storage.getPassword(';", FIXTURE_GETTERS), [], 'a comment or a string is not a read');
});

test('a door file with one gated and one ungated function FAILS, naming the ungated one — the per-file check it replaces passed it', () => {
  const source = [
    'export async function copied(s: S) { return openStored(await s.getPassword("a", "e"), gate); }',
    'export async function leaked(s: S) { return s.getPassword("a", "e"); }',
  ].join('\n');

  const failing = ungated(slotReads('fixture.ts', source, FIXTURE_GETTERS), [containsOneOf(DOOR_PRIMITIVES)]);

  assert.deepEqual(failing.map((read) => [read.within, read.line]), [['leaked', 2]]);
  assert.ok(DOOR_PRIMITIVES.some((primitive) => source.includes(primitive)), 'the refuted per-file rule: the file contains a door primitive, so it passed');
});

test('the primitive counts only in the NEAREST function — a callback that reads outside the gate is its own function', () => {
  const source = 'export async function outer(s: S) { await admitEntry(s); return () => s.getPassword("a", "e"); }';

  assert.deepEqual(ungated(slotReads('fixture.ts', source, FIXTURE_GETTERS), [containsOneOf(DOOR_PRIMITIVES)]).map((read) => read.within), ['the function at line 1']);
});

test('presence is judged per read: `(await x.getY(…)) !== undefined` is one, the bare value is not', () => {
  const source = 'async function f(s: S) { const has = (await s.getPassword("a", "e")) !== undefined; const value = await s.getPassword("a", "e"); }';

  assert.deepEqual(slotReads('fixture.ts', source, FIXTURE_GETTERS).map((read) => read.presence), [true, false]);
});

// ---- §7 item 4: no path bypasses the attempt limit ----

test('unlockSecret( is called only in secretEnvelope.ts and pinAttempts.ts — every PIN try is counted', () => {
  const callers = sourceFiles()
    .filter((full) => code(full).includes('unlockSecret('))
    .map(relative);
  assert.deepEqual(
    callers.filter((file) => file !== 'pinAttempts.ts' && file !== 'secretEnvelope.ts'),
    [],
    'a PIN tried here bypasses the five-wrong-PINs wait (D16): go through pinAttempts.attemptUnlock',
  );
  assert.ok(callers.includes('pinAttempts.ts'), 'the companion: the choke point itself is still found by this scan');
});
