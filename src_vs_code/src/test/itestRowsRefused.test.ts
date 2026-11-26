import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { formatHostKey, hostKeyFingerprint } from '../hostKeyPin';
import { Parts, World, click, ownKeyFile, ran, settled, world } from './personRoadsWorld';
import { loadWithVscode } from './vscodeStub';

/**
 * G1, E3.S5 (`todo/PLAN_person_roads_pin_host_key_E3_S5_spec.md`, §7): M4 and M9 on the rig of E3.S4. RF1 to RF3 hold the pure rules of the
 * refused legs (`scripts/lib/refusedRecord.cjs`: the two tables of legs, the message that a refused leg expects, the judge of its counts),
 * RF4 to RF6 hold the world's additions (`replaceHost`, `said[].at`, `shares`, `updates`, `connectOptions`), RF7 holds the finder of a
 * program on a `PATH` (`scripts/itestRowRefused.cjs`) and RF8 holds the observer of `./sshExecRunner` (D1).
 *
 * <p>The lib and the scripts are read at run time (`createRequire`), so this file compiles before they exist; the world's additions are read
 * through a cast, so it compiles before they exist. The product's functions are the real ones.</p>
 */

const SCRIPTS = path.join(__dirname, '..', '..', 'scripts');
const LIB = path.join(SCRIPTS, 'lib', 'refusedRecord.cjs');
const REFUSED = path.join(SCRIPTS, 'itestRowRefused.cjs');
const RIG = path.join(SCRIPTS, 'itestRowRig.cjs');

const scope = cleanupScope();
after(() => scope.close());

/** An export of a script, checked at run time: the file exists and the name is there. */
function exportOf<T>(file: string, name: string, kind: 'function' | 'object' = 'function'): T {
  assert.ok(fs.existsSync(file), `${file} does not exist`);
  const value: unknown = createRequire(__filename)(file)[name];
  assert.equal(typeof value, kind, `${name} is not a ${kind} of ${path.relative(SCRIPTS, file)}`);
  return value as T;
}

interface Spec {
  readonly name: string;
  readonly row: string;
  readonly case: string;
  readonly road: string;
  readonly state: string;
  readonly credential: string;
  readonly k1: string;
}
interface Expected {
  readonly prefix: string;
  readonly text: string;
  readonly code?: string;
}
interface Check {
  readonly name: string;
  readonly ok: boolean;
  readonly detail?: string;
}
interface Counts {
  starts: {
    total: number;
    questions: number;
    connectionStarts: number;
    byRoad: Record<'install' | 'bridge' | 'check', { starts: number; connectionStarts: number }>;
    list: { kind: string; whole: boolean }[];
  };
  question: { startedAt: number; ms: number; exitCode: number | null }[];
  bridges: unknown[];
  counterparts: { connections: number | null; authAttempts: number | null }[];
}
type Product = Record<string, (...args: never[]) => string>;

const { unusablePinSentence, pinWriteFailedSentence } = loadWithVscode<typeof import('../personPin')>('../personPin', {});
const PRODUCT = { unusablePinSentence, pinWriteFailedSentence } as unknown as Product;

const specs = (name: 'M4_LEGS' | 'M9_LEGS'): readonly Spec[] => exportOf<readonly Spec[]>(LIB, name, 'object');

const M4_NAMES = [
  'm4-a-none', 'm4-a-empty', 'm4-a-space',
  ...['b', 'c', 'd'].flatMap((one) => ['install-cold', 'install-warm', 'bridge-cold', 'bridge-warm'].map((rest) => `m4-${one}-${rest}`)),
];
const M9_NAMES = [
  ...['key', 'password'].flatMap((one) => ['install-cold', 'install-warm', 'bridge-cold', 'bridge-warm'].map((rest) => `m9-${one}-${rest}`)),
  'm9-key-repair', 'm9-password-connect',
];

test('RF1: M4 has 15 legs and M9 has 10, each name once, each with a credential the rig knows; one road and one state per refused leg', () => {
  const m4 = specs('M4_LEGS');
  const m9 = specs('M9_LEGS');
  assert.deepEqual(m4.map((one) => one.name), M4_NAMES);
  assert.deepEqual(m9.map((one) => one.name), M9_NAMES);
  assert.equal(new Set([...m4, ...m9].map((one) => one.name)).size, 25, 'every name is unique');
  assert.ok(Object.isFrozen(m4) && Object.isFrozen(m9), 'the tables are frozen');
  const known = new Set(['stored', 'named', 'password']);
  for (const one of [...m4, ...m9]) {
    assert.ok(known.has(one.credential), `${one.name}: credential ${one.credential} is not one the rig knows`);
    assert.ok(one.name.startsWith(one.row.toLowerCase()), `${one.name} belongs to its row ${one.row}`);
  }
  const refused = [...m4.filter((one) => one.case !== 'a'), ...m9.filter((one) => /-(install|bridge)-/.test(one.name))];
  assert.equal(refused.length, 20, '12 refused legs of M4 and 8 of M9');
  for (const one of refused) {
    assert.ok(['install', 'bridge'].includes(one.road), `${one.name}: one road`);
    assert.ok(['cold', 'warm'].includes(one.state), `${one.name}: one state`);
    assert.ok(one.name.endsWith(`${one.road}-${one.state}`), `${one.name} says its road and state`);
  }
  assert.deepEqual(m4.filter((one) => one.case === 'a').map((one) => [one.road, one.state, one.credential]), [['five', 'cold', 'named'], ['five', 'cold', 'named'], ['five', 'cold', 'named']]);
  assert.deepEqual(m4.filter((one) => one.case === 'd').map((one) => one.credential), ['named', 'named', 'named', 'named'], '(d) is built on a key named by its path');
  assert.deepEqual(m4.filter((one) => one.case === 'b' || one.case === 'c').map((one) => one.credential), Array(8).fill('stored'));
  assert.deepEqual(m9.filter((one) => one.name.startsWith('m9-password-') && one.state !== undefined && /-(install|bridge)-/.test(one.name)).map((one) => one.k1), Array(4).fill('passwords'));
});

/** The counts of a cold refused call as it should be: one `-V`, nothing else. */
function coldCounts(): Counts {
  return {
    starts: {
      total: 1,
      questions: 1,
      connectionStarts: 0,
      byRoad: { install: { starts: 0, connectionStarts: 0 }, bridge: { starts: 0, connectionStarts: 0 }, check: { starts: 0, connectionStarts: 0 } },
      list: [{ kind: 'question', whole: true }],
    },
    question: [{ startedAt: 100, ms: 20, exitCode: 0 }],
    bridges: [],
    counterparts: [{ connections: 0, authAttempts: 0 }],
  };
}

/** The counts of a warm refused call: no start of any kind. */
function warmCounts(): Counts {
  const cold = coldCounts();
  return { ...cold, starts: { ...cold.starts, total: 0, questions: 0, list: [] }, question: [] };
}

const COLD = { name: 'm4-b-install-cold', row: 'M4', case: 'b', road: 'install', state: 'cold', credential: 'stored', k1: 'plain' };
const WARM = { ...COLD, name: 'm4-b-install-warm', state: 'warm' };
const TIMING = { questionEnd: 120, sentenceAt: 130 };

type Judge = (counts: Counts, spec: Spec, timing: { questionEnd: number | null; sentenceAt: number | null }) => Check[];
const judge = (counts: Counts, spec: Spec = COLD, timing: { questionEnd: number | null; sentenceAt: number | null } = TIMING): Check[] => exportOf<Judge>(LIB, 'refusedChecks')(counts, spec, timing);
const reds = (checks: readonly Check[]): string[] => checks.filter((one) => !one.ok).map((one) => /\((R\.\d)\)/.exec(one.name)?.[1] ?? one.name);

test('RF2: a refused leg\'s counts are judged apart: cold one `-V` that ended before the sentence, warm none, and nothing connects', () => {
  assert.deepEqual(reds(judge(coldCounts())), [], 'cold: one -V, 0 connection starts, 0 attempts: all ok');
  assert.ok(judge(coldCounts()).length >= 5, 'R.1 to R.5 are judged');
  assert.deepEqual(reds(judge(warmCounts(), WARM)), [], 'warm: no start of any kind: all ok');

  const two = coldCounts();
  two.starts = { ...two.starts, total: 2, questions: 2, list: [...two.starts.list, { kind: 'question', whole: true }] };
  two.question = [...two.question, { startedAt: 110, ms: 5, exitCode: 0 }];
  assert.deepEqual(reds(judge(two)), ['R.5'], 'two -V starts cold');
  assert.deepEqual(reds(judge(coldCounts(), WARM)), ['R.5'], 'one -V start warm');

  for (const road of ['install', 'bridge', 'check'] as const) {
    const started = coldCounts();
    started.starts = { ...started.starts, total: 2, connectionStarts: 1, byRoad: { ...started.starts.byRoad, [road]: { starts: 1, connectionStarts: 1 } }, list: [...started.starts.list, { kind: road === 'check' ? 'sweep' : road, whole: true }] };
    assert.ok(reds(judge(started)).includes('R.1'), `a connection start on the ${road} road`);
  }
  const check = coldCounts();
  check.starts = { ...check.starts, total: 2, byRoad: { ...check.starts.byRoad, check: { starts: 1, connectionStarts: 0 } }, list: [...check.starts.list, { kind: 'mode', whole: true }] };
  assert.ok(reds(judge(check)).includes('R.2'), 'a start of the socket check, of any kind');

  const attempt = coldCounts();
  attempt.counterparts = [{ connections: 0, authAttempts: 1 }];
  assert.ok(reds(judge(attempt)).includes('R.3'), 'one authentication attempt');
  const connection = coldCounts();
  connection.counterparts = [{ connections: 1, authAttempts: 0 }];
  assert.ok(reds(judge(connection)).includes('R.3'), 'one Connection from');
  const unread = coldCounts();
  unread.counterparts = [{ connections: null, authAttempts: null }];
  assert.ok(reds(judge(unread)).includes('R.3'), 'a count that could not be read is not 0');

  const bridged = coldCounts();
  bridged.bridges = [{}];
  assert.ok(reds(judge(bridged)).includes('R.4'), 'a bridge was spawned');

  assert.deepEqual(reds(judge(coldCounts(), COLD, { questionEnd: 131, sentenceAt: 130 })), ['R.5'], 'the question ended AFTER the sentence');
  assert.deepEqual(reds(judge(coldCounts(), COLD, { questionEnd: null, sentenceAt: 130 })), ['R.5'], 'a time that was not read');
  assert.deepEqual(reds(judge(coldCounts(), COLD, { questionEnd: 120, sentenceAt: null })), ['R.5'], 'a sentence with no time');
});

const A_KEY = 'The saved host key of "box" cannot be used, so nothing was sent to that host. Get the host\'s key fingerprint from the person who runs the server. Then use Connect SSH on this entry, and go on only if it shows that fingerprint: Trust and connect saves the key.';
const A_PASSWORD = 'The saved host key of "box" cannot be used, so nothing was sent to that host. Do not use Connect SSH to save it again: this entry signs in with a password, and when Connect SSH cannot read the host\'s key first, it sends the password without checking the host. There is no safe repair for such an entry yet; the bridge and the install stay refused for it.';

test('RF3: the message a refused leg expects is the product\'s own function: A word for word in the login\'s form, B by its opening and EACCES', () => {
  const expectedMessage = exportOf<(product: Product, spec: Spec, name: string) => Expected>(LIB, 'expectedMessage');
  const messageMatches = exportOf<(text: string, expected: Expected) => boolean>(LIB, 'messageMatches');
  const of = (changes: Partial<Spec>): Expected => expectedMessage(PRODUCT, { ...COLD, ...changes }, 'box');

  const install = of({});
  assert.equal(install.prefix, 'Cannot reach "box": ');
  assert.equal(install.text, A_KEY, 'a stored key gets the key form');
  assert.equal(of({ road: 'bridge' }).prefix, 'Cannot bridge to "box": ');
  assert.equal(of({ credential: 'named', case: 'c' }).text, A_KEY, 'a named key gets the key form');
  assert.equal(of({ credential: 'password' }).text, A_PASSWORD, 'a password gets the password form');
  assert.equal(install.text, unusablePinSentence('box', 'key'), 'and the form is the product\'s');

  assert.ok(messageMatches(`Cannot reach "box": ${A_KEY}`, install));
  assert.equal(messageMatches(`Cannot reach "box": ${A_KEY} `, install), false, 'A is compared whole');
  assert.equal(messageMatches(`Cannot bridge to "box": ${A_KEY}`, install), false, 'the road\'s prefix counts');
  assert.equal(messageMatches(`Cannot reach "box": ${A_PASSWORD}`, install), false, 'the password form is not the key form');

  const write = of({ case: 'd', credential: 'named' });
  assert.equal(write.code, 'EACCES');
  assert.ok(write.text.startsWith('Could not write the saved host key of "box" to disk: '), write.text);
  assert.ok(messageMatches('Cannot reach "box": Could not write the saved host key of "box" to disk: EACCES: permission denied, open \'/o/x\'', write));
  assert.equal(messageMatches('Cannot reach "box": Could not write the saved host key of "box" to disk: ENOSPC: no space left on device, open \'/o/x\'', write), false, 'B needs EACCES');
  assert.equal(messageMatches(`Cannot reach "box": ${A_KEY}`, write), false, 'A is not B');
  assert.equal(messageMatches('Cannot reach "box": EACCES', write), false, 'EACCES alone is not B');
});

test('RF3b: a password leg also holds the form apart from the key form: the expected text is not the key form, and the shown text never offers Trust and connect (HC6)', () => {
  const expectedMessage = exportOf<(product: Product, spec: Spec, name: string) => Expected & { keyForm?: string }>(LIB, 'expectedMessage');
  const passwordFormOk = exportOf<(shown: string, expected: Expected & { keyForm?: string }) => boolean>(LIB, 'passwordFormOk');
  const password = expectedMessage(PRODUCT, { ...COLD, credential: 'password' }, 'box');
  assert.equal(password.keyForm, A_KEY, 'the key form is carried, read from the product');
  assert.ok(passwordFormOk(`${password.prefix}${A_PASSWORD}`, password), 'the password form passes');
  assert.equal(passwordFormOk(`${password.prefix}${A_KEY}`, password), false, 'the key form shown to a password entry fails');
  assert.equal(passwordFormOk(`${password.prefix}${A_PASSWORD} Trust and connect`, password), false, 'an offer of Trust and connect fails');
  const blind = { unusablePinSentence: () => A_KEY, pinWriteFailedSentence: PRODUCT.pinWriteFailedSentence } as unknown as Product;
  const mutated = expectedMessage(blind, { ...COLD, credential: 'password' }, 'box');
  assert.equal(passwordFormOk(`${mutated.prefix}${A_KEY}`, mutated), false, 'a product whose sentence ignores the login gives the expected text the key form: caught, though shown equals expected');
  const same = { unusablePinSentence: () => 'the same words for both forms', pinWriteFailedSentence: PRODUCT.pinWriteFailedSentence } as unknown as Product;
  const alike = expectedMessage(same, { ...COLD, credential: 'password' }, 'box');
  assert.equal(passwordFormOk(`${alike.prefix}${alike.text}`, alike), false, 'the expected text equal to the key form fails even when it never says Trust and connect');
  assert.equal(expectedMessage(PRODUCT, COLD, 'box').keyForm, undefined, 'a key entry carries no key form to compare');
  assert.ok(passwordFormOk(`Cannot reach "box": ${A_KEY}`, expectedMessage(PRODUCT, COLD, 'box')), 'and nothing else is asked of it');
});

const TEST_KEY = (() => {
  const blob = Buffer.concat([Buffer.from([0, 0, 0, 11]), Buffer.from('ssh-ed25519'), Buffer.from([0, 0, 0, 32]), createHash('sha256').update('RF-test-key').digest()]);
  return { algorithm: 'ssh-ed25519', base64: blob.toString('base64') };
})();
const PIN = formatHostKey(TEST_KEY);

/** The additions of the world (D3), read through a cast so this file compiles before they exist. */
interface Added {
  replaceHost(host: string): void;
  snapshot(): Record<string, unknown>;
  shares: { at: number; saidBefore: number }[];
  updates: Record<string, unknown>[];
  connectOptions(): Promise<{ knownHostsFile?: string; pin?: string } | undefined>;
}
const added = (w: World): Added => w as unknown as Added;

/** A world with a stand-in resolve and a stand-in runner, over an owned storage folder, the entry pinned with a test key. */
function pinnedWorld(what: string, more: Partial<Parts> = {}): { w: World; dir: string; seen: string[] } {
  const dir = ownedDir(scope, what);
  const seen: string[] = [];
  const parts: Parts = {
    storageDir: dir,
    realForget: true,
    host: '127.0.0.1',
    port: 2222,
    hostKey: PIN,
    clicks: [ownKeyFile('/o/user_key'), ownKeyFile('/o/user_key')],
    run: (_index, argv) => {
      seen.push(argv.join(' '));
      return ran('creds=-\narch=x86_64\nos=Linux\nget=/usr/bin/curl\n');
    },
    ...more,
  };
  return { w: world(parts), dir, seen };
}

test('RF4: replaceHost gives the next read a NEW snapshot whose host cannot form a known-hosts line, and the one read before is not changed', async () => {
  const { w } = pinnedWorld('rf4');
  const before = added(w).snapshot();
  assert.equal(before.host, '127.0.0.1');
  added(w).replaceHost('not a host');
  const after = added(w).snapshot();
  assert.equal(before.host, '127.0.0.1', 'the snapshot read before the replace still has its old host');
  assert.equal(after.host, 'not a host');
  assert.notEqual(before, after, 'a new object');
  assert.equal(after.hostKey, PIN, 'the saved key is the one it was');

  await click(w, 'installRemoteCli');
  await settled();
  assert.deepEqual(w.errors, [`Cannot reach "box": ${unusablePinSentence('box', 'key')}`], 'sentence A in the key form');
  assert.equal(w.runs.length, 0, 'the stand-in runner saw no run: nothing was sent');
});

test('RF5: every thing said has a time that does not go back, and a bridge click opens its own listener before the refusal is shown and closes it', async () => {
  const { w } = pinnedWorld('rf5', { hostKey: 'not a host key' });
  await click(w, 'openRemoteBridge');
  await settled();
  const said = (w as unknown as { said: { kind: string; text: string; at: number }[] }).said;
  assert.ok(said.length > 0, 'something was said');
  assert.ok(said.every((one) => typeof one.at === 'number'), 'every entry has a time');
  assert.ok(said.every((one, at) => at === 0 || one.at >= said[at - 1].at), 'the times do not go back');
  const refusal = said.findIndex((one) => one.kind === 'error' && one.text.startsWith('Cannot bridge to "box": '));
  assert.ok(refusal >= 0, `the refusal was shown: ${JSON.stringify(said)}`);
  // Change 11.1, S1: the click mints no shared token; it opens a listener of its own (a port and a key of its own), and a refusal closes it.
  assert.equal(added(w).shares.length, 0, 'no shared token was minted');
  const { listeners } = w;
  assert.equal(listeners.length, 1, 'one listener was opened');
  assert.ok(listeners[0].saidBefore <= refusal, 'it was opened before the refusal was shown');
  assert.ok(listeners[0].at <= said[refusal].at);
  assert.equal(listeners[0].closed, true, 'the refusal closed it');
});

/** The scan of the entry's host, as `ssh-keyscan -p 2222 127.0.0.1` prints it. */
const SCAN = `# 127.0.0.1:2222 SSH-2.0-OpenSSH_10.2\n[127.0.0.1]:2222 ${TEST_KEY.algorithm} ${TEST_KEY.base64}\n`;

/** What Connect's options answered, as the test reads it: the pin it saved and the file it named, with its text. */
function connectAnswer(options: { knownHostsFile?: string; pin?: string } | undefined): { pin: string | undefined; file: string; text: string } {
  assert.ok(options?.knownHostsFile !== undefined, 'Connect\'s options named a known-hosts file');
  return { pin: options.pin, file: options.knownHostsFile, text: fs.readFileSync(options.knownHostsFile, 'utf8') };
}

/** The answer of a person who trusts only the key with this fingerprint: the first button of a question that shows it, nothing for any other. */
const trusting = (fingerprint: string) => (message: string, rest: readonly unknown[]): string | undefined => (message.includes(fingerprint) ? rest.find((one): one is string => typeof one === 'string') : undefined);

/** The text of the entry's known-hosts line for the scanned key, as Connect and the pin writer both write it. */
const KNOWN_LINE = `[127.0.0.1]:2222 ${TEST_KEY.algorithm} ${TEST_KEY.base64}\n`;

test('RF6: Connect\'s options, from the world\'s own graph: one question with the fingerprint, one update that holds the scanned key, and the next click is pinned', async () => {
  const fingerprint = hostKeyFingerprint(TEST_KEY);
  const scanned = { exitCode: 0, stdout: SCAN, stderr: '', stdoutTruncated: false, stderrTruncated: false, timedOut: false, durationMs: 1 };
  const { w, dir, seen } = pinnedWorld('rf6', {
    hostKey: 'not a host key',
    answer: trusting(fingerprint),
    mocks: { './sshExecRunner': { runBounded: () => Promise.resolve(scanned), runSshExec: () => Promise.reject(new Error('RF6: nothing may start ssh here')) } },
  });
  const answer = connectAnswer(await added(w).connectOptions());
  assert.equal(w.asked.length, 1, 'one question');
  assert.ok(w.asked[0].message.includes(fingerprint), w.asked[0].message);
  assert.ok(w.asked[0].message.includes('First connection to "box"'), w.asked[0].message);
  assert.deepEqual(added(w).updates.map((one) => one.hostKey), [PIN], 'ONE update, and it holds the scanned key');
  assert.equal(added(w).snapshot().hostKey, PIN, 'the snapshot holds it from the next read on');
  assert.equal(answer.pin, PIN);
  assert.equal(path.basename(answer.file), 'known_hosts-e1', `Connect's file: ${answer.file}`);
  assert.equal(answer.text, KNOWN_LINE);

  await click(w, 'installRemoteCli');
  await settled();
  assert.deepEqual(w.errors, [], 'the install is not refused');
  assert.equal(seen.length, 1, 'the probe ran');
  const named = w.runs[0].knownHosts;
  assert.ok(named !== undefined, 'the run names a known-hosts file');
  assert.match(path.basename(named.file), /^known_hosts-e1-[0-9a-f-]{36}$/, 'the run names a file of the call');
  assert.equal(named.text, KNOWN_LINE);
  assert.ok(fs.existsSync(dir));
});

test('RF7: toolOnPath finds the FIRST executable of a name on a PATH, passes over a file with no execute bit, and finds none when there is none', () => {
  const toolOnPath = exportOf<(env: NodeJS.ProcessEnv, name: string) => string | undefined>(REFUSED, 'toolOnPath');
  const first = ownedDir(scope, 'rf7-first');
  const second = ownedDir(scope, 'rf7-second');
  const none = ownedDir(scope, 'rf7-none');
  const make = (dir: string, mode: number): string => {
    const file = path.join(dir, 'the-tool');
    fs.writeFileSync(file, '#!/bin/sh\n', { mode });
    fs.chmodSync(file, mode);
    return file;
  };
  const env = (...dirs: string[]): NodeJS.ProcessEnv => ({ PATH: dirs.join(path.delimiter) });

  const inSecond = make(second, 0o700);
  assert.equal(toolOnPath(env(none, first, second), 'the-tool'), inSecond, 'the second folder\'s, when the first has none');
  const inFirst = make(first, 0o700);
  assert.equal(toolOnPath(env(none, first, second), 'the-tool'), inFirst, 'the first folder\'s when both have one');
  fs.chmodSync(inFirst, 0o600);
  assert.equal(toolOnPath(env(first, second), 'the-tool'), inSecond, 'a file without the execute bit is passed over');
  assert.equal(toolOnPath(env(none, first), 'the-tool'), undefined, 'none when neither has an executable');
  assert.equal(toolOnPath({}, 'the-tool'), undefined, 'a missing PATH names no folder');
});

test('RF8: the module that the rig hands the world for ./sshExecRunner has every function of the real one (D1), so Connect\'s scan is the real scan', () => {
  const observedModule = exportOf<(runner: Record<string, unknown>, questions: unknown[]) => Record<string, unknown>>(RIG, 'observedModule');
  const real = createRequire(__filename)('../sshExecRunner') as Record<string, unknown>;
  const functions = Object.keys(real).filter((name) => typeof real[name] === 'function');
  assert.ok(functions.length >= 2 && functions.includes('runSshExec') && functions.includes('runBounded'), `the real module's functions: ${functions.join(', ')}`);
  const handed = observedModule(real, []);
  assert.deepEqual(functions.filter((name) => typeof handed[name] !== 'function'), [], 'every function of the real module is handed');
  assert.equal(handed.runBounded, real.runBounded, 'runBounded is the real one, not observed');
  assert.notEqual(handed.runSshExec, real.runSshExec, 'runSshExec is the observer');
});
