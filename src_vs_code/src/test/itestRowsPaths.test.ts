import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { PIN_PATH_KINDS, checkedPin, formatHostKey, hostKeyWords, pinPathRefusal, pinPathSentence } from '../hostKeyPin';

/**
 * G1, E3.S7 (`todo/PLAN_person_roads_pin_host_key_E3_S7_spec.md`, §7): M7, M12 and M14 on the rig of E3.S4. PT1 and PT2 hold the tables of the
 * legs (and that the product agrees with them), PT3 how `ssh` prints a path and the bare word's twin, PT4 the `/dev/null` scan, PT5 E1's words with a
 * path as it is, PT6 the no-path judge, PT7 the listing of a folder, PT8 the kind words of sentence E, PT9 what the real client does with the words
 * of M7 (where an `ssh` is on the PATH), PT10 the exec world.
 *
 * <p>The lib and the world are read at run time (`createRequire`), so this file compiles before they exist. The product's functions are the real ones.</p>
 */

const SCRIPTS = path.join(__dirname, '..', '..', 'scripts');
const LIB = path.join(SCRIPTS, 'lib', 'pathRecord.cjs');
const WORLD = path.join(__dirname, 'personRoadsWorld.js');

const scope = cleanupScope();
after(() => scope.close());

/** An export of the lib, checked at run time: the file exists and the name is there. */
function pathLib<T>(name: string, kind: 'function' | 'object' = 'function'): T {
  assert.ok(fs.existsSync(LIB), `${LIB} does not exist`);
  const value: unknown = createRequire(__filename)(LIB)[name];
  assert.equal(typeof value, kind, `${name} is not a ${kind} of scripts/lib/pathRecord.cjs`);
  return value as T;
}

const KNOWS = { kind: 'knows', token: 'OpenSSH_10.2' } as const;
const UUID = '0b2c6c52-7d3e-4a38-9f0e-0123456789ab';

interface M7Leg {
  readonly name: string;
  readonly shape: string;
  readonly folder: string;
  readonly word: string;
  readonly run: string;
}
interface M12Leg {
  readonly name: string;
  readonly letter: string | null;
  readonly kind: string | null;
  readonly kinds?: readonly string[];
  readonly road: string | null;
  readonly folder?: string;
  readonly cases?: readonly { readonly letter: string; readonly kind: string; readonly pathname: (leg: string, uuid: string) => string }[];
}
interface Coverage {
  readonly ok: boolean;
  readonly missing: readonly string[];
  readonly extra: readonly string[];
}

const M7_NAMES = [
  'm7-a-m1', 'm7-a-m2-mismatch', 'm7-a-m2-switch',
  'm7-b-m1', 'm7-b-m2-mismatch', 'm7-b-m2-switch',
  'm7-c-m1', 'm7-c-m2-mismatch', 'm7-c-m2-switch', 'm7-c-collision-k1', 'm7-c-collision-k2',
  'm7-d-m1', 'm7-d-m2-mismatch', 'm7-d-m2-switch',
  'm7-e-m1', 'm7-e-m2-mismatch', 'm7-e-m2-switch',
];

const countOf = (text: string, character: string): number => text.split(character).length - 1;

/** Per shape one m1, one mismatch and one switch, and one folder. */
function assertRunsPerShape(legs: readonly M7Leg[]): void {
  for (const shape of ['a', 'b', 'c', 'd', 'e']) {
    const own = legs.filter((one) => one.shape === shape);
    for (const run of ['m1', 'mismatch', 'switch']) {
      assert.equal(own.filter((one) => one.run === run).length, 1, `(${shape}) has one ${run}`);
    }
    assert.equal(new Set(own.map((one) => one.folder)).size, 1, `(${shape}) has one folder`);
  }
}

/** The folder of each shape holds the characters that its row names. */
function assertFolders(legs: readonly M7Leg[]): void {
  const folder = (shape: string): string => legs.find((one) => one.shape === shape)?.folder ?? '';
  assert.equal(folder('a'), 'with space');
  assert.equal(countOf(folder('b'), "'"), 1);
  assert.ok(!/\s/.test(folder('b')), '(b) holds no space');
  assert.equal(countOf(folder('c'), "'"), 2);
  assert.ok(!/\s/.test(folder('c')), '(c) holds no space');
  assert.ok(/\s/.test(folder('d')), '(d) holds a space');
  assert.equal(countOf(folder('d'), "'"), 1, '(d) holds an apostrophe');
  assert.ok(folder('e').endsWith('\\'), '(e) ends with a backslash');
  assert.equal(countOf(folder('e'), '\\'), 1, '(e) holds ONE backslash');
  assert.ok(!/[\s']/.test(folder('e')), '(e) holds no space and no apostrophe');
}

test('PT1: M7_LEGS holds the 17 legs of the table, each once: per shape one m1, one mismatch and one switch, the collision on (c) only, the folder of each shape holds its characters, and only (e) is bare', () => {
  const legs = pathLib<readonly M7Leg[]>('M7_LEGS', 'object');
  assert.deepEqual(legs.map((one) => one.name), M7_NAMES);
  assert.equal(new Set(legs.map((one) => one.name)).size, 17, 'each name once');
  assertRunsPerShape(legs);
  assertFolders(legs);
  assert.deepEqual(legs.filter((one) => one.run.startsWith('collision')).map((one) => `${one.shape}:${one.run}`), ['c:collision-k1', 'c:collision-k2']);
  assert.deepEqual(legs.filter((one) => one.word === 'bare').map((one) => one.shape), ['e', 'e', 'e']);
  assert.deepEqual([...new Set(legs.filter((one) => one.word === 'quoted').map((one) => one.shape))], ['a', 'b', 'c', 'd']);
});

const M12_NAMES = [
  'm12-rule',
  'm12-a-install', 'm12-a-bridge', 'm12-b-install', 'm12-b-bridge', 'm12-c-install', 'm12-c-bridge',
  'm12-d-install', 'm12-d-bridge', 'm12-e-install', 'm12-e-bridge', 'm12-f-install', 'm12-f-bridge',
];
const M12_KINDS = ['quote', 'doubleBackslash', 'percent', 'variable', 'backslashApostrophe', 'control'];
const M12_FOLDERS = ['q"uote', '\\\\unc', 'pct%h', 'var${HOME}', "it\\'s", 'tab\tname'];

const kindsOf = (legs: readonly M12Leg[]): string[] => legs.flatMap((one) => [...(one.kind === null ? [] : [one.kind]), ...(one.kinds ?? [])]);

/** How many legs hold `kind`: two roads for a kind of a folder, ONE leg (the rule's) for the two that no folder can give. */
const legsOfKind = (legs: readonly M12Leg[], kind: string): number => kindsOf(legs).filter((one) => one === kind).length;

/** The table's road legs, and the coverage judged both ways. */
function assertCoverage(legs: readonly M12Leg[]): void {
  const coverage = pathLib<(productKinds: readonly string[], legs: readonly M12Leg[]) => Coverage>('coverage');
  const product = Object.keys(PIN_PATH_KINDS);
  assert.deepEqual(coverage(product, legs), { ok: true, missing: [], extra: [] });
  assert.deepEqual(coverage([...product, 'newKind'], legs).missing, ['newKind']);
  assert.equal(coverage([...product, 'newKind'], legs).ok, false);
  const renamed = legs.map((one) => (one.name === 'm12-a-install' ? { ...one, kind: 'gone' } : one));
  assert.deepEqual(coverage(product, renamed).extra, ['gone']);
  assert.equal(coverage(product, renamed).ok, false);
  assert.equal(coverage([], legs).ok, false, 'an empty list of the product\'s kinds could not fail');
}

/** The product agrees with the table (the test may read the product; the leg may not). */
function assertProductAgrees(legs: readonly M12Leg[]): void {
  for (const leg of legs.filter((one) => one.road !== null)) {
    assert.equal(pinPathRefusal(`/o/leg/st/${leg.folder}/keys/1/known_hosts-e1-${UUID}`), leg.kind, leg.name);
  }
  assert.equal(pinPathRefusal('/o/leg/x'), undefined, 'the leg\'s folder alone is no refusal');
  const cases = legs[0].cases ?? [];
  assert.deepEqual(cases.map((one) => [one.letter, one.kind]), [['g', 'lastBackslash'], ['h', 'tilde']]);
  for (const one of cases) {
    assert.equal(pinPathRefusal(one.pathname('/o/leg', UUID)), one.kind, `(${one.letter})`);
  }
  assert.ok(cases[0].pathname('/o/leg', UUID).endsWith('\\'), '(g) ends with a backslash');
  assert.ok(cases[1].pathname('/o/leg', UUID).startsWith('~/'), '(h) starts with a tilde');
}

/** For each M7 folder: no refusal, and the product's word is the table's (quoted for (a)-(d), bare for (e)). */
function assertWordsAgree(m7: readonly M7Leg[]): void {
  for (const leg of m7) {
    const file = `/o/leg/st/${leg.folder}/keys/1/known_hosts-e1-${UUID}`;
    const checked = checkedPin(file, KNOWS);
    assert.equal(pinPathRefusal(file), undefined, `${leg.name}: no refusal`);
    assert.ok(checked.ok && checked.pin.word === (leg.word === 'quoted' ? `"${file}"` : file), `${leg.name}: the word of the product is the table's`);
  }
}

test('PT2: M12_LEGS holds the 13 legs, m12-rule first; the eight kinds are the literals of the table; coverage is read both ways; the product agrees with the table', () => {
  const legs = pathLib<readonly M12Leg[]>('M12_LEGS', 'object');
  assert.deepEqual(legs.map((one) => one.name), M12_NAMES);
  assert.deepEqual([...new Set(kindsOf(legs))].sort(), [...M12_KINDS, 'lastBackslash', 'tilde'].sort());
  const roads = legs.filter((one) => one.road !== null);
  assert.equal(roads.length, 12);
  assert.deepEqual(roads.map((one) => [one.letter, one.kind, one.folder, one.road]), M12_KINDS.flatMap((kind, at) => ['install', 'bridge'].map((road) => ['abcdef'[at], kind, M12_FOLDERS[at], road])));
  assert.deepEqual([...M12_KINDS, 'lastBackslash', 'tilde'].map((kind) => legsOfKind(legs, kind)), [2, 2, 2, 2, 2, 2, 1, 1]);
  assertCoverage(legs);
  assertProductAgrees(legs);
  assertWordsAgree(pathLib<readonly M7Leg[]>('M7_LEGS', 'object'));
});

test('PT3: printedBySsh doubles a backslash and throws on a byte outside printable ASCII; offendingNames reads a whole line with the printed name; resolvedBare takes the apostrophes out', () => {
  const printed = pathLib<(file: string) => string>('printedBySsh');
  const offending = pathLib<(stderr: string, file: string) => boolean>('offendingNames');
  const bare = pathLib<(file: string) => string>('resolvedBare');
  assert.equal(printed('/a/end\\/k'), '/a/end\\\\/k');
  assert.equal(printed('/a/plain/k'), '/a/plain/k');
  assert.throws(() => printed('/a/J\u00f6rg/k'));
  assert.throws(() => printed('/a/tab\tname/k'));
  const file = '/a/end\\/k';
  const line = 'Offending ED25519 key in /a/end\\\\/k:1';
  assert.equal(offending(`${line}\nHost key verification failed.\n`, file), true);
  assert.equal(offending(`x\r\n${line}\r\nHost key verification failed.\r\n`, file), true);
  assert.equal(offending('Offending ED25519 key in /a/end\\/k:1\n', file), false, 'the name as it is, with one backslash');
  assert.equal(offending(`xx ${line}\n`, file), false, 'inside a longer line');
  assert.equal(offending(`${line} and more\n`, file), false, 'a longer line');
  assert.equal(offending('Offending ED25519 key in /a/end\\\\/k:\n', file), false, 'no line number');
  assert.equal(bare("/a/x'y'z/k"), '/a/xyz/k');
  assert.equal(bare('/a/plain/k'), '/a/plain/k');
});

test('PT4: devNullIn finds a known-hosts option set to /dev/null (either form, the value quoted or not, the name in any case) and nothing else', () => {
  const find = pathLib<(argv: readonly string[]) => { option: string; value: string }[]>('devNullIn');
  assert.deepEqual(find(['-o', 'UserKnownHostsFile=/dev/null']).map((one) => one.value), ['/dev/null']);
  assert.deepEqual(find(['-oGlobalKnownHostsFile="/dev/null"']).map((one) => one.value), ['"/dev/null"']);
  assert.equal(find(['-o', 'userknownhostsfile=/dev/null']).length, 1);
  assert.equal(find(['-o', 'UserKnownHostsFile=/dev/null', '-o', 'GlobalKnownHostsFile=/dev/null']).length, 2);
  const checked = checkedPin('/o/k', KNOWS);
  assert.ok(checked.ok);
  assert.deepEqual(find(hostKeyWords(checked.pin)), []);
  assert.deepEqual(find(['-o', 'StrictHostKeyChecking=accept-new']), []);
  assert.deepEqual(find(['-F', '/dev/null', '-p', '1']), []);
  assert.deepEqual(find(['-p', '1', '--', '-o', 'UserKnownHostsFile=/dev/null']), [], 'after --');
  assert.deepEqual(find(['-o', 'UserKnownHostsFile=/dev/nullx']), []);
  // The forms that ssh also accepts (measured 2026-11-24, OpenSSH 10.2p1; review of E3.S7): a space or white space around the equals sign, several files in one value, a quoted word beside a bare one.
  assert.deepEqual(find(['-o', 'UserKnownHostsFile /dev/null']).map((one) => one.value), ['/dev/null'], 'a space in place of =');
  assert.equal(find(['-oUserKnownHostsFile /dev/null']).length, 1, '-oName value');
  assert.equal(find(['-o', 'UserKnownHostsFile = /dev/null']).length, 1, 'white space around =');
  assert.equal(find(['-o', 'userknownhostsfile "/dev/null"']).length, 1, 'the name in any case, the value quoted, after a space');
  assert.deepEqual(find(['-o', 'GlobalKnownHostsFile=/x/a /dev/null']).map((one) => one.value), ['/dev/null'], 'a list: the second file');
  assert.deepEqual(find(['-o', 'UserKnownHostsFile="/x" /dev/null']).map((one) => one.value), ['/dev/null'], 'a quoted file and a bare one');
  assert.deepEqual(find(['-o', 'UserKnownHostsFile=/dev/null "/x/a b"']).map((one) => one.value), ['/dev/null'], 'the first of a list');
  assert.deepEqual(find(['-o', 'UserKnownHostsFile="/x/a b" /y']), [], 'a quoted word with a space is ONE word');
  assert.deepEqual(find(['-o', 'UserKnownHostsFile="/x/dev/null"']), [], 'a path that only ends like it');
  assert.deepEqual(find(['-o', 'IdentityFile /dev/null', '-o', 'KnownHostsCommand /dev/null']), [], 'other options');
});

test('PT5: e1WordsRaw writes the six words with the path as it is in both, and throws on white space or a double quote', () => {
  const raw = pathLib<(file: string) => string[]>('e1WordsRaw');
  assert.deepEqual(raw("/a/x'y'z/k"), ['-o', 'StrictHostKeyChecking=yes', '-o', "UserKnownHostsFile=/a/x'y'z/k", '-o', "GlobalKnownHostsFile=/a/x'y'z/k"]);
  assert.throws(() => raw('/a/with space/k'));
  assert.throws(() => raw('/a/q"uote/k'));
});

test('PT6: noPathIn is not ok for the storage path, the folder\'s name alone or any slash, and names what it found; sentence E of the quote kind is ok', () => {
  const none = pathLib<(text: string, parts: readonly string[]) => { ok: boolean; found: string[] }>('noPathIn');
  const parts = ['/o/st/q"uote', 'q"uote', '/o'];
  const withPath = none('cannot use /o/st/q"uote/keys here', parts);
  assert.equal(withPath.ok, false);
  assert.ok(withPath.found.includes('/o/st/q"uote'), JSON.stringify(withPath));
  assert.deepEqual(none('the folder q"uote is bad', parts).found, ['q"uote']);
  assert.equal(none('a text with a / in it', parts).ok, false);
  assert.ok(none('a text with a / in it', parts).found.includes('/'));
  assert.deepEqual(none(pinPathSentence('box', 'quote'), parts), { ok: true, found: [] });
});

test('PT7: listingOf lists a file with its SHA-256, a folder and a nested file by relative path, sorted; a folder that is not there is []', () => {
  const listing = pathLib<(dir: string) => { rel: string; type: string; sha256: string | null }[]>('listingOf');
  const dir = ownedDir(scope, 'pt7');
  fs.writeFileSync(path.join(dir, 'b.txt'), 'hello');
  fs.mkdirSync(path.join(dir, 'd'));
  fs.writeFileSync(path.join(dir, 'd', 'e.txt'), 'nested');
  const sha = (text: string): string => crypto.createHash('sha256').update(text).digest('hex');
  assert.deepEqual(listing(dir), [
    { rel: 'b.txt', type: 'file', sha256: sha('hello') },
    { rel: 'd', type: 'dir', sha256: null },
    { rel: path.join('d', 'e.txt'), type: 'file', sha256: sha('nested') },
  ]);
  assert.deepEqual(listing(path.join(dir, 'absent')), []);
  assert.deepEqual(listing(ownedDir(scope, 'pt7-empty')), []);
});

test('PT8: KIND_WORDS holds the six kinds of the road legs, as the plan words them, and each is inside the product\'s sentence E', () => {
  const words = pathLib<Record<string, string>>('KIND_WORDS', 'object');
  assert.deepEqual(Object.keys(words).sort(), [...M12_KINDS].sort());
  assert.deepEqual(words, {
    quote: 'a double quote',
    doubleBackslash: 'two backslashes in a row (a network path)',
    percent: 'a percent sign',
    variable: 'the characters ${',
    backslashApostrophe: 'a backslash before an apostrophe',
    control: 'a control character',
  });
  for (const kind of M12_KINDS) {
    assert.ok(pinPathSentence('box', kind as keyof typeof PIN_PATH_KINDS).includes((words as Record<string, string>)[kind]), kind);
  }
});

/** What `ssh -G` resolves for the two known-hosts options of one word, with no config and a home of its own (nothing is read or written there). */
function resolved(word: string): { code: number | null; user: string | undefined; global: string | undefined; stderr: string } {
  const home = ownedDir(scope, 'pt9-home');
  const said = spawnSync('ssh', ['-G', '-F', '/dev/null', '-o', `UserKnownHostsFile=${word}`, '-o', `GlobalKnownHostsFile=${word}`, '-p', '1', 'someone@127.0.0.1'], { encoding: 'utf8', env: { ...process.env, HOME: home }, timeout: 15_000 });
  const value = (key: string): string | undefined => said.stdout.split('\n').find((line) => line.startsWith(`${key} `))?.slice(key.length + 1);
  return { code: said.status, user: value('userknownhostsfile'), global: value('globalknownhostsfile'), stderr: said.stderr };
}
const hasSsh = spawnSync('ssh', ['-V']).error === undefined;

test('PT9: the real client resolves both lists to the one path for each word of M7; the bare word of (c) resolves the twin; the bare word of (b) ends with invalid quotes', { skip: !hasSsh }, () => {
  const word = pathLib<(file: string, how: string) => string>('expectedWord');
  const bare = pathLib<(file: string) => string>('resolvedBare');
  const m7 = pathLib<readonly M7Leg[]>('M7_LEGS', 'object');
  const seen = new Set<string>();
  for (const leg of m7) {
    if (seen.has(leg.shape)) {
      continue;
    }
    seen.add(leg.shape);
    const file = path.join(ownedDir(scope, 'pt9'), 'st', leg.folder, 'keys', '1', 'known_hosts-e1-x');
    const read = resolved(word(file, leg.word));
    assert.equal(read.code, 0, `${leg.shape}: ${read.stderr}`);
    assert.deepEqual([read.user, read.global], [file, file], `${leg.shape}: both lists resolve to the path`);
  }
  const c = path.join(ownedDir(scope, 'pt9-c'), 'st', "x'y'z", 'keys', '1', 'known_hosts-e1-x');
  const twin = resolved(c);
  assert.equal(twin.code, 0);
  assert.deepEqual([twin.user, twin.global], [bare(c), bare(c)], 'the bare word of (c) resolves the twin in both lists');
  assert.notEqual(bare(c), c);
  const b = path.join(ownedDir(scope, 'pt9-b'), 'st', "it's", 'keys', '1', 'known_hosts-e1-x');
  const invalid = resolved(b);
  assert.equal(invalid.code, 255);
  assert.ok(invalid.stderr.includes('invalid quotes'), invalid.stderr);
});

interface ExecAnswer {
  readonly status: number;
  readonly body: { error?: { code: string; message: string } };
}
interface ExecWorld {
  run(command: string): Promise<ExecAnswer>;
  notes: string[];
  said: { kind: string; text: string }[];
}
type ExecWorldOf = (parts: Record<string, unknown>) => ExecWorld;

test('PT10: the exec world with a storage folder that has a double quote in its name and a saved key: run answers no_credential with sentence E of the quote kind, and no run and no file was made', async () => {
  assert.ok(fs.existsSync(WORLD), `${WORLD} does not exist; compile first`);
  const execWorld = (createRequire(__filename)(WORLD) as { execWorld?: ExecWorldOf }).execWorld;
  assert.equal(typeof execWorld, 'function', 'execWorld is not a function');
  const storageDir = path.join(ownedDir(scope, 'pt10'), 'q"uote');
  fs.mkdirSync(storageDir);
  const keyFile = path.join(ownedDir(scope, 'pt10-key'), 'user_key');
  fs.writeFileSync(keyFile, 'not a real key, never read: the call is refused before it is used\n', { mode: 0o600 });
  const runs: (readonly string[])[] = [];
  const mocks = { './sshExecRunner': { runSshExec: (argv: readonly string[]): never => { runs.push(argv); throw new Error('no run may start'); } } };
  const hostKey = formatHostKey({ algorithm: 'ssh-ed25519', base64: 'AAAAC3NzaC1lZDI1NTE5AAAAIKNOWNKEY' });
  const world = (execWorld as ExecWorldOf)({ host: '127.0.0.1', user: 'someone', port: 1, hostKey, storageDir, vault: { keyPath: keyFile }, mocks });
  const answer = await world.run('true');
  assert.equal(answer.body.error?.code, 'no_credential', JSON.stringify(answer));
  assert.equal(answer.body.error?.message, pinPathSentence('box', 'quote'));
  assert.deepEqual(runs, [], 'no run of the client, the question included');
  assert.deepEqual(pathLib<(dir: string) => unknown[]>('listingOf')(storageDir), [], 'nothing was written into the storage folder');
});
