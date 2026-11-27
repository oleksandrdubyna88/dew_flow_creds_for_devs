import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { checkedPin, hostKeyTold, refusedHostKeySentence, unnamedHostKeySentence } from '../hostKeyPin';

/**
 * G1, E3.S8 (`research/PLAN_person_roads_pin_host_key_E3_S8_spec.md`, section 6): M5 on the rig of E3.S4. TT1 holds the table of the eleven legs, TT2 that the product
 * agrees with the pinned words, TT3 the reading of the screen, TT4 the two forced scripts, TT5 the jump host's config, TT6 the shown messages and their comparison, TT7 the
 * lines that name a file, TT8 the control of (h), TT9 what the real client does with the two configs (where an `ssh` is on the PATH).
 *
 * <p>The lib is read at run time (`createRequire`), so this file compiles before it exists. The product's functions are the real ones; the leg may not read them for its pins.</p>
 */

const SCRIPTS = path.join(__dirname, '..', '..', 'scripts');
const LIB = path.join(SCRIPTS, 'lib', 'toldRecord.cjs');
const ROW_LIB = path.join(SCRIPTS, 'lib', 'rowRecord.cjs');

const scope = cleanupScope();
after(() => scope.close());

/** An export of the lib, checked at run time: the file exists and the name is there. */
function toldLib<T>(name: string, kind: 'function' | 'object' | 'string' = 'function'): T {
  assert.ok(fs.existsSync(LIB), `${LIB} does not exist`);
  const value: unknown = createRequire(__filename)(LIB)[name];
  assert.equal(typeof value, kind, `${name} is not a ${kind} of scripts/lib/toldRecord.cjs`);
  return value as T;
}

const rowLib = (): { handedClientConfig(dir: string, options?: { lines?: string[] }): string } => createRequire(__filename)(ROW_LIB) as { handedClientConfig(dir: string, options?: { lines?: string[] }): string };

const KNOWS = { kind: 'knows', token: 'OpenSSH_10.2' } as const;
const VERIFY = 'Host key verification failed.';
const ME = os.userInfo().username;

interface M5Leg {
  readonly name: string;
  readonly letter: string;
  readonly pinned: boolean;
  readonly target: string;
  readonly quiet?: boolean;
  readonly script?: string;
}
interface Said {
  readonly kind: string;
  readonly text: string;
  readonly at?: number;
}
interface Counts {
  readonly install: number;
  readonly bridge: number;
  readonly log: number;
}
interface Told {
  readonly c: Counts;
  readonly d: Counts;
  readonly holds: { readonly cWords: number; readonly dWords: number; readonly notOpen: number; readonly notChecked: number };
}
interface Judged {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

const NAMES = ['m5-a', 'm5-e', 'm5-f', 'm5-g', 'm5-h', 'm5-b', 'm5-b-unpinned', 'm5-c', 'm5-c-unpinned', 'm5-d', 'm5-d-unpinned'];

test('TT1: M5_LEGS holds the eleven legs of the table, each once and in order; pinned is false for the three unpinned twins alone, each right after its pinned twin with its letter and target; script is fail for (g) and zero for (h) alone; quiet for (e) alone', () => {
  const legs = toldLib<readonly M5Leg[]>('M5_LEGS', 'object');
  assert.deepEqual(legs.map((one) => one.name), NAMES);
  assert.equal(new Set(legs.map((one) => one.name)).size, 11, 'each name once');
  assert.deepEqual(legs.filter((one) => !one.pinned).map((one) => one.name), ['m5-b-unpinned', 'm5-c-unpinned', 'm5-d-unpinned']);
  for (const twin of legs.filter((one) => !one.pinned)) {
    const at = legs.indexOf(twin);
    assert.equal(legs[at - 1].name, twin.name.replace('-unpinned', ''), `${twin.name} follows its pinned twin`);
    assert.equal(legs[at - 1].letter, twin.letter, `${twin.name}: the letter`);
    assert.equal(legs[at - 1].target, twin.target, `${twin.name}: the target`);
  }
  assert.deepEqual(legs.map((one) => [one.letter, one.target]), [['a', 'k2'], ['e', 'k2'], ['f', 'hop'], ['g', 'forced'], ['h', 'forced'], ['b', 'stopped'], ['b', 'stopped'], ['c', 'refusedLogin'], ['c', 'refusedLogin'], ['d', 'silent'], ['d', 'silent']]);
  assert.deepEqual(legs.filter((one) => one.script !== undefined).map((one) => `${one.name}:${one.script}`), ['m5-g:fail', 'm5-h:zero']);
  assert.deepEqual(legs.filter((one) => one.quiet === true).map((one) => one.name), ['m5-e']);
  assert.ok(Object.isFrozen(legs), 'the table is frozen');
});

test('TT2: the product agrees with the pins: sentence C holds C_WORDS and not D_WORDS, sentence D the reverse; hostKeyTold answers the bridge forms that start with the literal prefixes, and nothing for an exit code of 0', () => {
  const cWords = toldLib<string>('C_WORDS', 'string');
  const dWords = toldLib<string>('D_WORDS', 'string');
  const notOpen = toldLib<(name: string) => string>('NOT_OPEN');
  const notChecked = toldLib<(name: string) => string>('NOT_CHECKED');
  assert.ok(refusedHostKeySentence('box').includes(cWords), 'C holds its words');
  assert.ok(!refusedHostKeySentence('box').includes(dWords), 'C holds not the words of D');
  assert.ok(unnamedHostKeySentence('box').includes(dWords), 'D holds its words');
  assert.ok(!unnamedHostKeySentence('box').includes(cWords), 'D holds not the words of C');
  assert.equal(notOpen('box'), 'The bridge to "box" is not open: ');
  assert.equal(notChecked('box'), 'The bridge to "box" could not be checked: ');
  const file = '/o/keys/known_hosts-e1-x';
  const checked = checkedPin(file, KNOWS);
  assert.ok(checked.ok, 'the fixture pin is checked');
  const named = hostKeyTold(checked.pin, `Offending ED25519 key in ${file}:1\n${VERIFY}\n`, 'box', 255);
  assert.ok(named?.bridge.startsWith(notOpen('box')), 'with the Offending line: the form of C');
  assert.ok(named?.bridge.endsWith(refusedHostKeySentence('box')));
  const lineOnly = hostKeyTold(checked.pin, `${VERIFY}\n`, 'box', 255);
  assert.ok(lineOnly?.bridge.startsWith(notChecked('box')), 'with the line alone: the form of D');
  assert.equal(hostKeyTold(checked.pin, `Offending ED25519 key in ${file}:1\n${VERIFY}\n`, 'box', 0), undefined, 'exit 0: nothing');
});

/** The words of the two sentences of the entry `box`, as the leg reads them. */
const WORDS = { c: refusedHostKeySentence('box'), d: unnamedHostKeySentence('box') };

test('TT3: toldOf counts the install\'s message (any kind), the bridge\'s error message and the log line apart, and the pinned words and prefixes held; what stands before from is not counted', () => {
  const toldOf = toldLib<(said: readonly Said[], from: number, words: { c: string; d: string }, name: string) => Told>('toldOf');
  const notOpen = toldLib<(name: string) => string>('NOT_OPEN');
  const notChecked = toldLib<(name: string) => string>('NOT_CHECKED');
  const cWords = toldLib<string>('C_WORDS', 'string');
  const one = toldOf([{ kind: 'error', text: WORDS.c }], 0, WORDS, 'box');
  assert.deepEqual([one.c.install, one.c.bridge, one.c.log], [1, 0, 0], 'C as one error is the install\'s message');
  assert.equal(toldOf([{ kind: 'warning', text: WORDS.c }], 0, WORDS, 'box').c.install, 1, 'a message of any kind');
  const bridge = toldOf([{ kind: 'error', text: notOpen('box') + WORDS.c }], 0, WORDS, 'box');
  assert.deepEqual([bridge.c.install, bridge.c.bridge, bridge.c.log], [0, 1, 0], 'the prefix and C as an error is the bridge\'s message');
  assert.equal(bridge.holds.notOpen, 1);
  const log = toldOf([{ kind: 'log', text: notOpen('box') + WORDS.c }], 0, WORDS, 'box');
  assert.deepEqual([log.c.install, log.c.bridge, log.c.log], [0, 0, 1], 'the same text as a log line does not count as the bridge\'s message');
  const logOnlyD = toldOf([{ kind: 'log', text: notChecked('box') + WORDS.d }], 0, WORDS, 'box');
  assert.deepEqual([logOnlyD.d.install, logOnlyD.d.bridge, logOnlyD.d.log], [0, 0, 1]);
  const d = toldOf([{ kind: 'error', text: notChecked('box') + WORDS.d }, { kind: 'error', text: WORDS.d }], 0, WORDS, 'box');
  assert.deepEqual([d.d.install, d.d.bridge, d.c.install, d.c.bridge], [1, 1, 0, 0]);
  const reworded = toldOf([{ kind: 'error', text: `"box" ${cWords}. Another tail.` }], 0, WORDS, 'box');
  assert.deepEqual([reworded.holds.cWords, reworded.c.install, reworded.holds.dWords], [1, 0, 0], 'the words are held, the sentence is not equal');
  const before = toldOf([{ kind: 'error', text: WORDS.c }, { kind: 'error', text: WORDS.d }], 2, WORDS, 'box');
  assert.deepEqual([before.c.install, before.d.install, before.holds.cWords, before.holds.dWords], [0, 0, 0, 0], 'items before from are not counted');
  const later = toldOf([{ kind: 'error', text: WORDS.c }, { kind: 'error', text: WORDS.d }], 1, WORDS, 'box');
  assert.deepEqual([later.c.install, later.d.install], [0, 1]);
});

test('TT4: forcedScript has four lines each: the first three equal (the shebang, a comment, the printf of the verification line to stderr), the last the exec of the original command or exit 255; an unknown kind throws', () => {
  const forced = toldLib<(kind: string) => string>('forcedScript');
  const zero = forced('zero').split('\n');
  const fail = forced('fail').split('\n');
  assert.deepEqual(zero.slice(0, 3), fail.slice(0, 3), 'the first three lines are one text');
  assert.equal(zero[0], '#!/bin/sh');
  assert.ok(zero[1].startsWith('#'), 'a comment');
  assert.equal(zero[2], `printf '%s\\n' '${VERIFY}' >&2`);
  assert.equal(zero[3], 'exec "$SHELL" -c "$SSH_ORIGINAL_COMMAND"');
  assert.equal(fail[3], 'exit 255');
  assert.deepEqual([zero[4], fail[4], zero.length, fail.length], ['', '', 5, 5], 'four lines, then the final newline');
  assert.throws(() => forced('other'));
  assert.throws(() => forced(''));
});

test('TT5: jumpConfig writes Host jump with its nine lines first, then Host 127.0.0.1 with ProxyJump jump, then exactly the rows\' handed config; a path with a space throws', () => {
  const jump = toldLib<(dir: string, parts: { jumpPort: number; user: string; identityFile: string; jumpKnownHosts: string }) => string>('jumpConfig');
  const dir = '/o/leg';
  const parts = { jumpPort: 4242, user: 'someone', identityFile: '/o/leg/home_key', jumpKnownHosts: '/o/leg/jump_known_hosts' };
  const handed = rowLib().handedClientConfig(dir);
  const expected = [
    'Host jump', '  HostName 127.0.0.1', '  Port 4242', '  User someone', '  IdentityFile /o/leg/home_key', '  IdentitiesOnly yes', '  BatchMode yes',
    '  StrictHostKeyChecking yes', '  UserKnownHostsFile /o/leg/jump_known_hosts', '  GlobalKnownHostsFile /dev/null', '', 'Host 127.0.0.1', '  ProxyJump jump', '',
  ].join('\n');
  const text = jump(dir, parts);
  assert.equal(text, `${expected}\n${handed}`);
  assert.ok(text.startsWith('Host jump\n'), 'the jump block comes first');
  assert.ok(text.endsWith(handed), 'the rows\' handed config is last, unchanged');
  assert.throws(() => jump('/o/with space', parts), /white space|space/i);
  assert.throws(() => jump(dir, { ...parts, identityFile: '/o/a b/key' }), /white space|space/i);
  assert.throws(() => jump(dir, { ...parts, jumpKnownHosts: '/o/a\tb/jump' }), /white space|space/i);
});

test('TT6: shownOf leaves out the log lines and keeps kinds and order; sameShown is ok for equal lists and not ok, with the first difference, for a changed word, kind or order, an empty list or a null', () => {
  const shown = toldLib<(said: readonly Said[], from: number) => { kind: string; text: string }[]>('shownOf');
  const same = toldLib<(a: unknown, b: unknown) => { ok: boolean; diff: string | null }>('sameShown');
  const said: Said[] = [{ kind: 'info', text: 'before', at: 1 }, { kind: 'error', text: 'one', at: 2 }, { kind: 'log', text: 'a log line', at: 3 }, { kind: 'warning', text: 'two', at: 4 }];
  assert.deepEqual(shown(said, 1), [{ kind: 'error', text: 'one' }, { kind: 'warning', text: 'two' }]);
  assert.deepEqual(shown(said, 4), []);
  const list = [{ kind: 'info', text: 'a' }, { kind: 'error', text: 'b' }];
  assert.equal(same(list, [...list]).ok, true);
  const word = same(list, [{ kind: 'info', text: 'a' }, { kind: 'error', text: 'c' }]);
  assert.equal(word.ok, false);
  assert.match(String(word.diff), /c/, 'the first difference is named');
  assert.equal(same(list, [{ kind: 'warning', text: 'a' }, { kind: 'error', text: 'b' }]).ok, false, 'a kind');
  assert.equal(same(list, [list[1], list[0]]).ok, false, 'the order');
  assert.equal(same(list, [list[0]]).ok, false, 'a shorter list');
  assert.equal(same([], []).ok, false, 'two empty lists could not fail');
  assert.equal(same(list, []).ok, false);
  assert.equal(same(null, list).ok, false);
  assert.equal(same(list, null).ok, false);
  assert.equal(same(null, null).ok, false);
  const sockets = toldLib<(said: readonly Said[], from: number, sockets: readonly string[]) => string[]>('logsOf');
  assert.deepEqual(sockets([{ kind: 'info', text: 'x' }, { kind: 'log', text: '/tmp/creds-a.sock is there' }, { kind: 'log', text: 'other' }], 0, ['/tmp/creds-a.sock']), ['<socket> is there', 'other']);
});

test('TT7: pinLines finds a line that holds the file, a CR LF line and a line with the file\'s backslash doubled; it finds none for another file or for a file that is a prefix of a longer name', () => {
  const lines = toldLib<(stderr: string, file: string) => string[]>('pinLines');
  assert.deepEqual(lines('x\nOffending ED25519 key in /a/pin-1:1\nHost key verification failed.\n', '/a/pin-1'), ['Offending ED25519 key in /a/pin-1:1']);
  assert.deepEqual(lines('Offending ED25519 key in /a/pin-1:1\r\nHost key verification failed.\r\n', '/a/pin-1'), ['Offending ED25519 key in /a/pin-1:1']);
  assert.deepEqual(lines('Offending ED25519 key in /a/end\\\\/pin:1\n', '/a/end\\/pin'), ['Offending ED25519 key in /a/end\\\\/pin:1'], 'ssh prints each backslash twice');
  assert.deepEqual(lines('Offending ED25519 key in /a/pin-1:1\n', '/a/pin-2'), []);
  assert.deepEqual(lines('Offending ED25519 key in /a/pin-12:1\n', '/a/pin-1'), [], 'a file that is a prefix of a longer name');
  assert.deepEqual(lines('Host key verification failed.\n', '/a/pin-1'), []);
  assert.deepEqual(lines('', '/a/pin-1'), []);
});

/** An evidence record as (g) or (h) leaves it: the runs, the forced line and what was told. */
function record(code: number, told: Told): Record<string, unknown> {
  const stderr = `${VERIFY}\n`;
  return {
    runs: [{ kind: 'probe', exitCode: code, stderr }, { kind: 'sweep', exitCode: code, stderr }, { kind: 'mode', exitCode: code, stderr }],
    forced: { line: VERIFY },
    told,
    toldParts: { install: told },
  };
}
const NONE: Counts = { install: 0, bridge: 0, log: 0 };
const ZERO: Told = { c: NONE, d: NONE, holds: { cWords: 0, dWords: 0, notOpen: 0, notChecked: 0 } };
const SHOWED_D: Told = { c: NONE, d: { install: 1, bridge: 1, log: 1 }, holds: { cWords: 0, dWords: 3, notOpen: 0, notChecked: 2 } };

test('TT8: controlOfH is ok for a pair as (g) and (h) leave it; each of a null g, a mode check of g that ended with 0, a g with no D on the install, an h that showed D, a probe of h that ended with 255 and two different forced lines is not ok, with its problem', () => {
  const control = toldLib<(g: unknown, h: unknown) => Judged>('controlOfH');
  const g = record(255, SHOWED_D);
  const h = record(0, ZERO);
  assert.deepEqual(control(g, h), { ok: true, problems: [] });
  const bad = (judged: Judged, pattern: RegExp, why: string): void => {
    assert.equal(judged.ok, false, why);
    assert.ok(judged.problems.some((one) => pattern.test(one)), `${why}: ${JSON.stringify(judged.problems)}`);
  };
  bad(control(null, h), /\(g\)/, 'a null g');
  bad(control(g, null), /\(h\)/, 'a null h');
  const gModeZero = { ...g, runs: [{ kind: 'probe', exitCode: 255 }, { kind: 'mode', exitCode: 0 }] };
  bad(control(gModeZero, h), /mode/, 'g\'s mode check with 0');
  bad(control({ ...g, told: { ...SHOWED_D, d: { install: 0, bridge: 1, log: 1 } } }, h), /install/, 'g without D on the install');
  bad(control({ ...g, told: { ...SHOWED_D, d: { install: 1, bridge: 0, log: 1 } } }, h), /bridge/, 'g without D in the bridge\'s form');
  bad(control(g, { ...h, told: SHOWED_D }), /\(h\)/, 'h that showed D');
  bad(control(g, { ...h, told: { ...ZERO, c: { install: 1, bridge: 0, log: 0 } } }), /\(h\)/, 'h that showed C');
  bad(control(g, { ...h, runs: [{ kind: 'probe', exitCode: 255 }, { kind: 'mode', exitCode: 0 }] }), /probe/, 'h\'s probe with 255');
  bad(control(g, { ...h, forced: { line: 'another line' } }), /forced line/, 'two different forced lines');
  bad(control({ ...g, forced: { line: null } }, { ...h, forced: { line: null } }), /forced line/, 'no forced line read');
  bad(control({ ...g, runs: [] }, h), /probe/, 'a g with no run read');
  // The stderr that the product really read (review of E3.S8): each probe and mode check holds the verification line as a whole line and no Offending line, and (g)'s and (h)'s are one text.
  const withStderr = (record: Record<string, unknown>, kind: string, stderr: unknown): Record<string, unknown> => ({
    ...record,
    runs: (record.runs as { kind: string }[]).map((run) => (run.kind === kind ? { ...run, stderr } : run)),
  });
  bad(control(withStderr(g, 'probe', null), h), /stderr/, 'g\'s probe stderr not read');
  bad(control(withStderr(g, 'mode', 'something else\n'), h), /stderr/, 'g\'s mode stderr holds no verification line');
  bad(control(g, withStderr(h, 'probe', '')), /stderr/, 'h\'s probe stderr is empty');
  bad(control(withStderr(g, 'probe', `Offending ED25519 key in /a/pin:1\n${VERIFY}\n`), h), /Offending/, 'g\'s probe stderr holds an Offending line');
  bad(control(g, withStderr(h, 'mode', `${VERIFY}\nand a second line\n`)), /not one text|equal/, 'g\'s and h\'s mode stderr differ');
  assert.deepEqual(control(withStderr(g, 'probe', `${VERIFY}\r\n`), withStderr(h, 'probe', `${VERIFY}\r\n`)), { ok: true, problems: [] }, 'CR LF in both is still one text');
  // The install's road alone counts the sentence once (review of E3.S8).
  bad(control({ ...g, toldParts: { install: ZERO } }, h), /install/, 'g showed D on the whole screen but not on the install\'s road');
  bad(control(g, { ...h, toldParts: { install: SHOWED_D } }), /\(h\)/, 'h showed D on the install\'s road');
  bad(control({ ...g, toldParts: undefined }, h), /install/, 'g\'s install part not read');
});

/** What `ssh -G` resolves under `-F file` for `args`, with a home of its own (nothing is read or written there). */
function resolved(file: string, args: readonly string[]): { code: number | null; stdout: string; stderr: string } {
  const home = ownedDir(scope, 'tt9-home');
  const said = spawnSync('ssh', ['-G', '-F', file, ...args], { encoding: 'utf8', env: { ...process.env, HOME: home }, timeout: 15_000 });
  return { code: said.status, stdout: said.stdout, stderr: said.stderr };
}
const lineOf = (stdout: string, key: string): string | undefined => stdout.split('\n').find((line) => line.startsWith(`${key} `))?.slice(key.length + 1);
const hasSsh = spawnSync('ssh', ['-V']).error === undefined;

test('TT9: the real client resolves proxyjump jump for the destination, the jump file and strict checking for jump, and the quiet level (QUIET, which ssh -G prints as SILENT) for the quiet handed config', { skip: !hasSsh }, () => {
  const jump = toldLib<(dir: string, parts: { jumpPort: number; user: string; identityFile: string; jumpKnownHosts: string }) => string>('jumpConfig');
  const dir = ownedDir(scope, 'tt9');
  const jumpFile = path.join(dir, 'jump_known_hosts');
  const config = path.join(dir, 'client_config');
  fs.writeFileSync(config, jump(dir, { jumpPort: 4242, user: ME, identityFile: path.join(dir, 'key'), jumpKnownHosts: jumpFile }));
  const destination = resolved(config, ['-p', '1', `${ME}@127.0.0.1`]);
  assert.equal(destination.code, 0, destination.stderr);
  assert.equal(lineOf(destination.stdout, 'proxyjump'), 'jump');
  const hop = resolved(config, ['jump']);
  assert.equal(hop.code, 0, hop.stderr);
  assert.equal(lineOf(hop.stdout, 'userknownhostsfile'), jumpFile);
  assert.equal(lineOf(hop.stdout, 'stricthostkeychecking'), 'true');
  assert.equal(lineOf(hop.stdout, 'port'), '4242');
  const quiet = path.join(dir, 'quiet_config');
  fs.writeFileSync(quiet, rowLib().handedClientConfig(dir, { lines: ['LogLevel QUIET'] }));
  const said = resolved(quiet, ['-p', '1', `${ME}@127.0.0.1`]);
  assert.equal(said.code, 0, said.stderr);
  // `ssh -G` prints the level of `LogLevel QUIET` as SILENT (OpenSSH's own first name of that level; measured 2026-11-24, 10.2p1): the spec says QUIET.
  assert.match(lineOf(said.stdout, 'loglevel') ?? '', /^(QUIET|SILENT)$/);
});
