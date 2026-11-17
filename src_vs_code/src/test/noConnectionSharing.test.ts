import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type TestContext, test } from 'node:test';
import { ownedFile } from '../../scripts/lib/leftovers.cjs';
import { buildBridgeArgv } from '../sshBridge';
import { type SshExecAuth, buildSshExecArgv } from '../sshExecCommand';
import { EntityMetadata } from '../types';
import { importedUses } from './funnelScan';
import { withoutTheTwo } from './noSharingArgv';
import { discoverSources } from './tempSiteScan';

/**
 * G2 (`PLAN_bridge_no_connection_sharing.md` §7.2 item 6 and §7.3): the extension's own `ssh` calls share no connection.
 *
 * <p><b>Part 1 asks the real client.</b> `sshExecCommand.test.ts` and `sshBridge.test.ts` show that the two options are in the
 * argv. That is what was SENT. Here the PATH's `ssh -G` resolves each argv under a config file that shares connections and
 * prints what is IN EFFECT. `-G` connects to nothing, so this runs wherever an `ssh` client is. It shows what one client
 * resolves; that a resolved `controlmaster false` really keeps a call out of a master is shown against a real `sshd`
 * (section 9 of `scripts/ssh-agent-itest.cjs`). On Windows it shows that Win32-OpenSSH takes the two words and resolves them
 * the same way, and nothing about sharing there.</p>
 *
 * <p><b>Part 2 is the list of places.</b> Every place that starts an `ssh` from an argv, and every place that builds one, by
 * file and function. A new place fails the list until somebody has looked at where its argv comes from.</p>
 */

/* --- part 1: the real client --- */

/** The control path of the config below. `ssh -G` never makes it. */
const CONTROL_PATH = '/nonexistent/creds-test/cm.sock';

/** What a laptop that shares connections has in its `~/.ssh/config`. */
const SHARING_CONFIG = `Host *\n  ControlMaster auto\n  ControlPath ${CONTROL_PATH}\n  ControlPersist yes\n`;

// The PATH lookup is on purpose: the PATH's ssh is the client the extension starts, and it is the thing asked here.
const ssh = (args: readonly string[]) => spawnSync('ssh', [...args], { encoding: 'utf8', timeout: 15_000 }); // NOSONAR: the PATH's ssh is the subject

const HAS_SSH = ssh(['-V']).error === undefined;

/** Locally a machine with no ssh skips, with the reason; where CI=true nothing skips, so a missing ssh fails. */
const NEEDS_SSH = { skip: HAS_SSH || process.env.CI === 'true' ? false : 'no ssh on the PATH' };

/** The lines `ssh -G` prints for `argv` under the sharing config. */
function resolved(t: TestContext, argv: readonly string[]): string[] {
  const config = ownedFile(t, 'nsh', 'ssh_config');
  fs.writeFileSync(config, SHARING_CONFIG);
  const run = ssh(['-G', '-F', config, ...argv]);
  assert.equal(run.status, 0, `ssh -G did not resolve the argv: ${run.error ?? run.stderr}`);
  return run.stdout.split(/\r?\n/);
}

/** The lines that say whether, and where, this call would share. */
const sharing = (lines: readonly string[]): string => lines.filter((line) => /^control(master|path) /.test(line)).join(' | ');

/** A control path that is in effect: any `controlpath` line except `controlpath none` (OpenSSH 10.2 and 9.5 print no line at all). */
const controlPaths = (lines: readonly string[]): string[] => lines.filter((line) => line.startsWith('controlpath ') && line !== 'controlpath none');

const HOST: EntityMetadata = { id: 'e1', name: 'build box', host: 'build.example.com', user: 'dev', isSshEnabled: true };

/** `-o` words only: the first `-o` value wins. The flags `-S` and `-M` would override the two options, so `extra` must never carry them (H4 of the plan). */
const HOSTILE_EXTRA = ['-o', 'ControlMaster=auto', '-o', 'ControlPath=/x'];

function tunnelArgv(auth: SshExecAuth, extra: readonly string[] = []): string[] {
  const argv = buildBridgeArgv(HOST, { port: 51234, remote: { path: '/tmp/creds-dev-abc.sock' }, auth, extra }, () => true);
  assert.ok(argv !== undefined, 'expected an argv');
  return argv;
}

function runArgv(auth: SshExecAuth, bridged: boolean): string[] {
  const argv = buildSshExecArgv(HOST, undefined, 'id', auth, { bridged });
  assert.ok(argv !== undefined, 'expected an argv');
  return argv;
}

/** Every kind of argv the extension starts an `ssh` with. */
const PRODUCTION: readonly (readonly [string, string[]])[] = [
  ['the tunnel of a bridge, a key', tunnelArgv('key')],
  ['the tunnel of a bridge, a password', tunnelArgv('askpass')],
  ['a run off a bridge, a key', runArgv('key', false)],
  ['a run off a bridge, a password', runArgv('askpass', false)],
  ['a bridged run, a key', runArgv('key', true)],
  ['a bridged run, a password', runArgv('askpass', true)],
];

test('where CI=true an ssh client is on the PATH: a skipped check on the runner proves nothing', { skip: process.env.CI === 'true' ? false : 'only where CI=true' }, () => {
  assert.equal(HAS_SSH, true, 'no ssh on the PATH of the runner');
});

test('G2: under a config that shares connections, the real ssh resolves every argv of the extension to no sharing', NEEDS_SSH, (t) => {
  for (const [name, argv] of PRODUCTION) {
    const lines = resolved(t, argv);
    assert.ok(lines.includes('controlmaster false'), `${name}: this ssh would share a connection: ${sharing(lines)}`);
    assert.deepEqual(controlPaths(lines), [], `${name}: a control path is in effect`);
  }
});

test('the control: the same argvs without the two options DO share under this config, so the file can show the fault', NEEDS_SSH, (t) => {
  for (const [name, argv] of PRODUCTION) {
    const lines = resolved(t, withoutTheTwo(argv));
    assert.ok(lines.includes('controlmaster auto'), `${name}: ${sharing(lines)}`);
    assert.deepEqual(controlPaths(lines), [`controlpath ${CONTROL_PATH}`], name);
  }
});

test('G2: a caller\'s own sharing words in extra change nothing: the first value wins, and the two options stand first', NEEDS_SSH, (t) => {
  const lines = resolved(t, tunnelArgv('key', HOSTILE_EXTRA));
  assert.ok(lines.includes('controlmaster false'), `this ssh would share a connection: ${sharing(lines)}`);
  assert.deepEqual(controlPaths(lines), [], 'a control path is in effect');
});

test('G2: the tunnel still asks for its own forward', NEEDS_SSH, (t) => {
  for (const auth of ['key', 'askpass'] as const) {
    const forwards = resolved(t, tunnelArgv(auth)).filter((line) => line.startsWith('remoteforward '));
    assert.deepEqual(forwards, ['remoteforward /tmp/creds-dev-abc.sock [127.0.0.1]:51234'], auth);
  }
});

/* --- part 2: the places --- */

const SRC = path.resolve(__dirname, '..', '..', 'src');

/** Every shipped source file. The tests build argvs of their own and are not places the extension starts an `ssh` from. */
const SOURCES = discoverSources(SRC, new Map([['test', 'the tests are not shipped: they build argvs of their own']]));

const read = (file: string): string => fs.readFileSync(path.join(SRC, file), 'utf8');

/** `file#function` of every reference to `name` imported from the module `from`, sorted. */
const usesOf = (name: string, from: string): string[] =>
  SOURCES.flatMap((file) => importedUses(file, read(file), name, from).map((use) => `${file}#${use.within}`)).sort();

/** `file` once per match of `pattern` in it. */
const matchesOf = (pattern: RegExp): string[] => SOURCES.flatMap((file) => (read(file).match(pattern) ?? []).map(() => file));

const HOW_TO_FIX =
  'a place that starts an ssh, or builds its argv, was added, moved or renamed. Its argv must come from buildSshExecArgv or buildBridgeArgv: both say NO_CONNECTION_SHARING. Then edit this list in the same commit';

test('G2: an ssh is started from an argv only at the listed places', () => {
  assert.ok(SOURCES.length > 100, `the discovery found only ${SOURCES.length} files`);
  assert.deepEqual(
    usesOf('runSshExec', 'sshExecRunner'),
    ['commands/agentCommands.ts#runRemote', 'commands/agentCommands.ts#sweepDeadSockets', 'commands/agentCommands.ts#verifyBridgeSocket', 'sshUseActions.ts#execOverSsh'],
    HOW_TO_FIX,
  );
  assert.deepEqual(matchesOf(/\bbridges\s*\.\s*start\s*\(/g), ['commands/agentCommands.ts'], HOW_TO_FIX);
  assert.deepEqual(usesOf('secretsLaunch', 'remoteLaunch'), ['commands/runCommands.ts#launchesOf'], HOW_TO_FIX);
});

test('G2: and each of them takes its argv from one of the two builders', () => {
  assert.deepEqual(
    usesOf('buildSshExecArgv', 'sshExecCommand'),
    ['commands/agentCommands.ts#runRemote', 'commands/agentCommands.ts#sweepDeadSockets', 'commands/agentCommands.ts#verifyBridgeSocket', 'remoteLaunch.ts#secretsArgv', 'sshUseActions.ts#execArgv'],
    HOW_TO_FIX,
  );
  assert.deepEqual(usesOf('buildBridgeArgv', 'sshBridge'), ['commands/agentCommands.ts#registerAgentCommands'], HOW_TO_FIX);
});

test('G2: the two options are spelled in one file', () => {
  // `Name=value` only: prose may name the options (`ControlMaster`) and a config line (`ControlMaster auto`).
  const spelled = [...new Set(matchesOf(/control(master|path|persist)\s*=/gi))];
  assert.deepEqual(spelled, ['sshExecCommand.ts'], 'an option that names connection sharing is spelled outside sshExecCommand.ts: use NO_CONNECTION_SHARING');
});

test('G2: no other door to a spawned ssh: the generic runner, the spawn launches, the manager and the process modules are listed whole', () => {
  // `runBounded` starts ANY program with ANY argv: `runBounded('ssh', …)` would be an ssh that never met a builder. Every use is listed,
  // so a new one is red until somebody has looked at what it starts. The programs of today are git, ssh-keyscan, a script's own
  // interpreter, a saved terminal command and a database client: none is `ssh`.
  assert.deepEqual(
    usesOf('runBounded', 'sshExecRunner'),
    ['agentUseActions.ts#run', 'agentUseActions.ts#run', 'agentUseActions.ts#spawnLocal', 'configWrite.ts#boundedGit', 'gitTracked.ts#isTrackedHere', 'hostKeyTrust.ts#scanHostKey', 'transportFactory.ts#build'],
    HOW_TO_FIX,
  );
  // The two ways to name the program of a spawned ssh. `openSshBinary` is called by `sshSpawnLaunch` only (and `openSshProgram` is a string for a terminal).
  assert.deepEqual(usesOf('sshSpawnLaunch', 'sshProgram'), ['sshRoad.ts#spawnLaunchOf', 'sshUseActions.ts#agentAwareLaunch'], HOW_TO_FIX);
  assert.deepEqual(usesOf('openSshBinary', 'sshProgram'), [], HOW_TO_FIX);
  // A second bridge manager would start tunnels beside the one that `extension.ts` builds, with a spawner of its own.
  assert.deepEqual(matchesOf(/\bnew\s+SshBridgeManager\s*\(/g), ['extension.ts'], HOW_TO_FIX);
  // A namespace import or a `require` of the runner is invisible to `usesOf`, which follows named bindings: so every file that names
  // the module at all is listed.
  assert.deepEqual(
    [...new Set(matchesOf(/['"]\.{1,2}\/(?:[\w-]+\/)*sshExecRunner['"]/g))],
    ['agentUseActions.ts', 'commands/agentCommands.ts', 'configWrite.ts', 'gitTracked.ts', 'hostKeyTrust.ts', 'sshUseActions.ts', 'transportFactory.ts'],
    HOW_TO_FIX,
  );
  // A raw `spawn` of `ssh` has to live in a file that imports `child_process`: they are listed whole.
  assert.deepEqual(
    [...new Set(matchesOf(/^\s*(?:import\b[^\n]*\bfrom|(?:const|let|var)\b[^\n]*=\s*require\()\s*['"](?:node:)?child_process['"]/gm))],
    ['binaryInstaller.ts', 'bridgeSpawner.ts', 'childKill.ts', 'helpLookup.ts', 'installFlow.ts', 'maskedTerminal.ts', 'materializedKeys.ts', 'sshExecRunner.ts', 'wslProcess.ts', 'wslRelayManager.ts'],
    HOW_TO_FIX,
  );
});
