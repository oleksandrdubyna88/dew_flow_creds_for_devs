import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { SECRET_SLOTS } from '../entitySlots';
import type { StorageManager } from '../storageManager';

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
 * <p>What counts as a read: a call of any getter the slot table reads through (derived by running
 * each row's `read` against a recording storage — an eleventh slot is covered with no line written
 * here), a `.read(` in a file that walks the slot table, and `getHistory(`, because a kept version
 * holds the same ten values (`SMALL_FIELDS`, asserted against the table by `slotTable.test.ts`).
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
  'editPrefill.ts': 'door', // Edit's prefill, behind the door, through a silent gate
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
  'sharePayloadBuild.ts': 'door', // a share, after the share's door
  'shareWithheld.ts': 'door', // the share's "not sent" notice, with the share's grant
  'sshAgentManager.ts': 'automatic', // Add Key to Agent (click opener passed in) and the startup sweep
  'sshCredential.ts': 'automatic', // SSH connect: automatic opener by default, a click opener passed in
  'transportFactory.ts': 'automatic', // the git deploy key
  'viewerOptions.ts': 'door', // the viewer's gated reader
  'vpnLauncherRun.ts': 'door', // Start VPN
  'vpnRun.ts': 'door', // Save VPN Config
};

const DOOR_PRIMITIVES = ['admitEntry(', 'openStored(', 'openedText(', 'clickedSecret(', 'clickOpener(', 'gatedSecretReader(', 'openEntryForEdit(', 'openKeptVersion(', 'openRevision(', 'exportOpener'];
const REFUSAL_PRIMITIVES = ['automaticPinRefusal(', 'pinFieldRefusal(', 'pinRefusalFor(', 'automaticOpener', 'isLockedSecret(', 'hiddenFromAgents('];

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

interface Read {
  readonly file: string;
  readonly line: number;
  readonly getter: string;
}

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

function lineOf(text: string, at: number): number {
  return text.slice(0, at).split('\n').length;
}

/** Every slot read in one file: getter calls, and the slot table's own `.read(` where it is walked. */
function readsIn(file: string, text: string, getters: readonly string[]): Read[] {
  const calls = new RegExp(`\\.(${getters.join('|')})\\s*(?:\\?\\.)?\\(`, 'g');
  const found = [...text.matchAll(calls)].map((m) => ({ file, line: lineOf(text, m.index ?? 0), getter: m[1] }));
  const walksTable = /from '\.{1,2}\/entitySlots'/.test(text);
  const tableReads = walksTable ? [...text.matchAll(/\.read\(/g)].map((m) => ({ file, line: lineOf(text, m.index ?? 0), getter: 'slot.read' })) : [];
  return [...found, ...tableReads];
}

function allReads(): Read[] {
  const getters = [...slotGetters(), KEPT_VERSIONS_GETTER];
  return sourceFiles().flatMap((full) => readsIn(relative(full), code(full), getters));
}

function kindsOf(file: string): readonly ReaderKind[] {
  const kind = READERS[file];
  if (kind === undefined) {
    return [];
  }
  return typeof kind === 'string' ? [kind] : kind;
}

/** The presence shape: `(await x.getY(…)) !== undefined`, and nothing else. */
function presenceReads(text: string, getters: readonly string[]): number {
  const shape = new RegExp(`\\(await\\s+[\\w.]+\\.(${getters.join('|')})\\([^()]*\\)\\)\\s*!==\\s*undefined`, 'g');
  return [...text.matchAll(shape)].length;
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
  const entityEdit = code(path.join(SRC, 'entityEditCommands.ts'));
  assert.equal(presenceReads(entityEdit, slotGetters()), 1, 'the presence shape still matches the one presence read in entityEditCommands');
});

// ---- the boundary ----

test('every file that reads a slot is classified — an unlisted reader fails naming file, line and getter', () => {
  const unlisted = allReads().filter((read) => READERS[read.file] === undefined);
  assert.deepEqual(
    unlisted.map((read) => `src/${read.file}:${read.line} calls ${read.getter} — classify this reader in READERS (carrier, door, automatic or presence)`),
    [],
  );
});

test('the table lists no file that reads nothing — it cannot go stale either way', () => {
  const readers = new Set(allReads().map((read) => read.file));
  assert.deepEqual(Object.keys(READERS).filter((file) => !readers.has(file)), [], 'listed, but reads no slot any more: take it out of READERS');
});

test('a DOOR file opens through a door primitive', () => {
  const doorless = Object.keys(READERS)
    .filter((file) => kindsOf(file).includes('door'))
    .filter((file) => !DOOR_PRIMITIVES.some((primitive) => code(path.join(SRC, file)).includes(primitive)));
  assert.deepEqual(doorless.map((file) => `src/${file} is a door but contains none of ${DOOR_PRIMITIVES.join(' ')}`), []);
});

test('an AUTOMATIC file refuses through a refusal primitive — nothing automatic gets a sealed value', () => {
  const unguarded = Object.keys(READERS)
    .filter((file) => kindsOf(file).includes('automatic'))
    .filter((file) => !REFUSAL_PRIMITIVES.some((primitive) => code(path.join(SRC, file)).includes(primitive)));
  assert.deepEqual(unguarded.map((file) => `src/${file} is automatic but contains none of ${REFUSAL_PRIMITIVES.join(' ')}`), []);
});

test('a PRESENCE file only asks whether a value exists', () => {
  const getters = [...slotGetters(), KEPT_VERSIONS_GETTER];
  const wrong = Object.keys(READERS)
    .filter((file) => kindsOf(file).includes('presence'))
    .flatMap((file) => {
      const text = code(path.join(SRC, file));
      const reads = readsIn(file, text, getters);
      return reads.length === presenceReads(text, getters)
        ? []
        : reads.map((read) => `src/${read.file}:${read.line} ${read.getter} — a presence reader may only compare with !== undefined`);
    });
  assert.deepEqual(wrong, []);
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
