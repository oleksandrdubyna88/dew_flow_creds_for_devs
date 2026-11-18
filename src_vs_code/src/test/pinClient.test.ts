import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TestContext, test } from 'node:test';
import { ownedDir } from '../../scripts/lib/leftovers.cjs';
import { CLIENT_CHECK_TIMEOUT_MS, ClientRunner, clientVerdict, versionTokenOf } from '../bridgedSshClient';
import { BRIDGED_ENV_POSIX, BRIDGED_ENV_WINDOWS, bridgedSshEnv } from '../bridgedSshEnv';
import { KNOWN_HOSTS_COMMAND_SINCE, PinClient, PinClientCall, pinClientAsker, pinClientOf } from '../pinClient';

/**
 * G1, E2.S1: what the `ssh` program says of itself, read for a pinned call as one of three (the parent's §3.10, test 19, its unit half).
 * `knows`: OpenSSH 8.5 or newer, so `KnownHostsCommand=none` can be written. `older`: a version below 8.5, which has no such option.
 * `unreadable`: no version could be read, and a pinned call is then refused (E2.S2). The token is the bridged road's
 * (`versionTokenOf`); the floor, the platforms and what is kept are this plan's own. Amendment (consult 85d3babf): only the NEWER answer is
 * kept; an older one is used for its call and asked again by the next, so a client replaced by a newer one is never left without the word.
 */

const knows = (token: string): PinClient => ({ kind: 'knows', token });
const older = (token: string): PinClient => ({ kind: 'older', token });
const unreadable = (exitCode: number | null): PinClient => ({ kind: 'unreadable', exitCode });

test('V1: a version at or above 8.5 knows the option: 10.2, 8.5 itself, 9.0, 8.10 (numbers, not text) and 11.0', () => {
  assert.deepEqual(pinClientOf(0, 'OpenSSH_10.2p1 Ubuntu-2ubuntu3.8, OpenSSL 3.5.5 27 Jan 2026\n'), knows('OpenSSH_10.2'));
  assert.deepEqual(pinClientOf(0, 'OpenSSH_8.5p1, OpenSSL 1.1.1k\n'), knows('OpenSSH_8.5'));
  assert.deepEqual(pinClientOf(0, 'OpenSSH_9.0p1\n'), knows('OpenSSH_9.0'));
  assert.deepEqual(pinClientOf(0, 'OpenSSH_8.10p1\n'), knows('OpenSSH_8.10'));
  assert.deepEqual(pinClientOf(0, 'OpenSSH_11.0\n'), knows('OpenSSH_11.0'));
  assert.deepEqual(KNOWN_HOSTS_COMMAND_SINCE, [8, 5]);
});

test('V2: a version below 8.5 is OLDER, a success of its own and never "unreadable": 8.4, 7.9, 6.6 and 8.1 of Windows', () => {
  assert.deepEqual(pinClientOf(0, 'OpenSSH_8.4p1 Debian-5+deb11u3, OpenSSL 1.1.1w\n'), older('OpenSSH_8.4'));
  assert.deepEqual(pinClientOf(0, 'OpenSSH_7.9p1\n'), older('OpenSSH_7.9'));
  assert.deepEqual(pinClientOf(0, 'OpenSSH_6.6.1p1\n'), older('OpenSSH_6.6'));
  assert.deepEqual(pinClientOf(0, 'OpenSSH_for_Windows_8.1p1, LibreSSL 3.0.2\r\n'), older('OpenSSH_for_Windows_8.1'));
});

test('V3: any OpenSSH token counts on every platform: the build that Windows ships and the portable one read alike (not the bridge\'s win32 rule)', () => {
  assert.deepEqual(pinClientOf(0, 'OpenSSH_for_Windows_9.5p2, LibreSSL 3.8.2\r\n'), knows('OpenSSH_for_Windows_9.5'));
  assert.deepEqual(pinClientOf(0, 'OpenSSH_9.9p1, OpenSSL 3.3.2\n'), knows('OpenSSH_9.9'));
  // The control: the bridged road refuses the portable build on win32 (its CV4). This reading takes no platform at all.
  assert.equal(clientVerdict(0, '', 'OpenSSH_9.9p1, OpenSSL 3.3.2\n', 'win32').ok, false);
  assert.equal(pinClientOf.length, 2, 'exit code and stderr: no platform, no stdout');
});

test('V4: no token at the very start of stderr is unreadable, with the exit code: empty, a banner first, a token later in a line, a blank first line', () => {
  assert.deepEqual(pinClientOf(0, ''), unreadable(0));
  assert.deepEqual(pinClientOf(0, 'banner OpenSSH_9.9p1\n'), unreadable(0));
  assert.deepEqual(pinClientOf(0, 'Warning: something\nOpenSSH_9.9p1\n'), unreadable(0));
  assert.deepEqual(pinClientOf(0, '\nOpenSSH_9.9p1\n'), unreadable(0));
  assert.deepEqual(pinClientOf(0, ' OpenSSH_9.9p1\n'), unreadable(0));
  assert.deepEqual(pinClientOf(0, 'Dropbear v2022.83\n'), unreadable(0));
  assert.deepEqual(pinClientOf(0, 'OpenSSH_9\n'), unreadable(0), 'a token with no minor number is no version');
});

test('V5: an exit that is not 0 is unreadable even with a token in stderr; a killed child (no exit code) too', () => {
  assert.deepEqual(pinClientOf(1, 'OpenSSH_10.2p1\n'), unreadable(1));
  assert.deepEqual(pinClientOf(255, ''), unreadable(255));
  assert.deepEqual(pinClientOf(null, 'OpenSSH_10.2p1\n'), unreadable(null));
});

test('V6: the reading is the bridged road\'s one parser: for each fixture the token is `versionTokenOf`\'s, text and numbers', () => {
  for (const stderr of ['OpenSSH_10.2p1 x\n', 'OpenSSH_8.4p1\n', 'OpenSSH_for_Windows_9.5p2\r\n']) {
    const token = versionTokenOf(stderr);
    const read = pinClientOf(0, stderr);
    assert.ok(token !== undefined && read.kind !== 'unreadable');
    assert.equal(read.token, token.text);
  }
  assert.deepEqual(versionTokenOf('OpenSSH_for_Windows_9.5p2\r\n'), { text: 'OpenSSH_for_Windows_9.5', version: [9, 5], windowsBuild: true });
  assert.deepEqual(versionTokenOf('OpenSSH_10.2p1 x\n'), { text: 'OpenSSH_10.2', version: [10, 2], windowsBuild: false });
  assert.equal(versionTokenOf('banner OpenSSH_9.9p1'), undefined);
});

/* ---- the asking ---------------------------------------------------------------------------------------------------- */

interface Seen {
  argv: string[];
  options: Parameters<ClientRunner>[1];
}

/** A runner that records each call and answers what the test says, in order; the last answer repeats. */
function recordingRunner(answers: readonly (() => ReturnType<ClientRunner>)[]): { run: ClientRunner; seen: Seen[] } {
  const seen: Seen[] = [];
  const run: ClientRunner = (argv, options) => {
    seen.push({ argv, options });
    return answers[Math.min(seen.length - 1, answers.length - 1)]();
  };
  return { run, seen };
}

const answer = (exitCode: number | null, stderr: string, stdout = ''): (() => ReturnType<ClientRunner>) => () => Promise.resolve({ exitCode, stdout, stderr });
const NEW = answer(0, 'OpenSSH_10.2p1 Ubuntu-2ubuntu3\n');
const OLD = answer(0, 'OpenSSH_8.4p1 Debian-5\n');
const NONE = answer(1, '');
/** The environment of a call: the lookup names, a password of an askpass login, and the agent's socket. */
const CALL_ENV: NodeJS.ProcessEnv = { PATH: '/usr/bin', HOME: '/home/someone', CREDS_SSH_PASSWORD: 'a-secret', SSH_ASKPASS: '/x/askpass', SSH_AUTH_SOCK: '/run/agent.sock' };
const call = (more: Partial<PinClientCall> = {}): PinClientCall => ({ program: 'ssh', env: CALL_ENV, ...more });

test('A1: the question is `ssh -V` of the call\'s program, in the call\'s folder, with the lookup names of the call\'s environment and no secret of it, under the 10 s bound', async () => {
  const { run, seen } = recordingRunner([NEW]);
  const ask = pinClientAsker({ run, platform: 'linux' });

  assert.deepEqual(await ask(call({ program: '/opt/ssh', cwd: '/some/folder' })), knows('OpenSSH_10.2'));

  assert.equal(seen.length, 1);
  const [one] = seen;
  assert.deepEqual(one.argv, ['-V']);
  assert.equal(one.options.program, '/opt/ssh');
  assert.equal(one.options.cwd, '/some/folder');
  assert.deepEqual(one.options.env, bridgedSshEnv(CALL_ENV, 'linux'));
  assert.deepEqual(Object.keys(one.options.env).sort(), [...BRIDGED_ENV_POSIX].sort(), 'PATH and HOME: no password, no askpass, no agent socket');
  assert.equal(one.options.timeoutMs, CLIENT_CHECK_TIMEOUT_MS);
  assert.equal(CLIENT_CHECK_TIMEOUT_MS, 10_000);
  assert.equal(one.options.signal, undefined);
  assert.equal(one.options.startGate, undefined);
});

test('A2: a call that names no folder is asked in none (the runner then starts it in the window\'s own, as the call will be); on win32 the lookup names are Windows\'', async () => {
  const { run, seen } = recordingRunner([NEW]);
  const source: NodeJS.ProcessEnv = { Path: 'C:\\Windows\\System32\\OpenSSH', SystemRoot: 'C:\\Windows', ProgramData: 'C:\\ProgramData', CREDS_SSH_PASSWORD: 'a-secret' };

  await pinClientAsker({ run, platform: 'win32' })({ program: 'ssh', env: source });

  assert.equal('cwd' in seen[0].options, false, 'no cwd key at all');
  assert.deepEqual(seen[0].options.env, bridgedSshEnv(source, 'win32'));
  assert.equal(Object.keys(seen[0].options.env).every((name) => [...BRIDGED_ENV_WINDOWS, 'USERNAME', 'USERDOMAIN', 'LOGONSERVER'].includes(name)), true);
});

test('A3: only the NEWER answer is kept: a new client is asked once however many calls follow, an older one is asked again by each call', async () => {
  const fresh = recordingRunner([NEW]);
  const askNew = pinClientAsker({ run: fresh.run, platform: 'linux' });
  assert.deepEqual([await askNew(call()), await askNew(call()), await askNew(call())], [knows('OpenSSH_10.2'), knows('OpenSSH_10.2'), knows('OpenSSH_10.2')]);
  assert.equal(fresh.seen.length, 1);

  const aged = recordingRunner([OLD]);
  const askOld = pinClientAsker({ run: aged.run, platform: 'linux' });
  assert.deepEqual([await askOld(call()), await askOld(call()), await askOld(call())], [older('OpenSSH_8.4'), older('OpenSSH_8.4'), older('OpenSSH_8.4')]);
  assert.equal(aged.seen.length, 3, 'the older answer is used for its call and NOT kept: the next pinned call asks again');
});

test('A4: "unreadable" is never kept: the next call asks again, and takes the answer it then gets', async () => {
  const { run, seen } = recordingRunner([NONE, NONE, NEW]);
  const ask = pinClientAsker({ run, platform: 'linux' });

  assert.deepEqual(await ask(call()), unreadable(1));
  assert.deepEqual(await ask(call()), unreadable(1));
  assert.deepEqual(await ask(call()), knows('OpenSSH_10.2'));
  assert.deepEqual(await ask(call()), knows('OpenSSH_10.2'));
  assert.equal(seen.length, 3);
});

test('A5: an answer is kept for one program, one folder and one PATH: another program, another folder and another PATH are each asked', async () => {
  const { run, seen } = recordingRunner([NEW]);
  const ask = pinClientAsker({ run, platform: 'linux' });

  await ask(call());
  await ask(call({ program: '/opt/ssh' }));
  await ask(call({ cwd: '/some/folder' }));
  await ask(call({ env: { ...CALL_ENV, PATH: '/opt/bin:/usr/bin' } }));
  await ask(call({ env: { ...CALL_ENV, CREDS_SSH_PASSWORD: 'another' } }));
  await ask(call());

  assert.deepEqual(seen.map((one) => [one.options.program, one.options.cwd, one.options.env.PATH]), [
    ['ssh', undefined, '/usr/bin'],
    ['/opt/ssh', undefined, '/usr/bin'],
    ['ssh', '/some/folder', '/usr/bin'],
    ['ssh', undefined, '/opt/bin:/usr/bin'],
  ]);
});

test('A6: a runner that cannot start ssh, and one that throws at once, are "unreadable" with no exit code; the asker never throws, and asks again', async () => {
  const failing: ClientRunner = () => Promise.reject(new Error('spawn ssh ENOENT'));
  const throwing: ClientRunner = () => {
    throw new Error('EACCES');
  };

  assert.deepEqual(await pinClientAsker({ run: failing, platform: 'linux' })(call()), unreadable(null));
  assert.deepEqual(await pinClientAsker({ run: throwing, platform: 'linux' })(call()), unreadable(null));

  const { run, seen } = recordingRunner([() => Promise.reject(new Error('spawn ssh ENOENT')), NEW]);
  const ask = pinClientAsker({ run, platform: 'linux' });
  assert.deepEqual([await ask(call()), await ask(call())], [unreadable(null), knows('OpenSSH_10.2')]);
  assert.equal(seen.length, 2);
});

test('A7: a version on stdout only is "unreadable": stdout is never read', async () => {
  const { run } = recordingRunner([answer(0, '', 'OpenSSH_10.2p1\n')]);
  assert.deepEqual(await pinClientAsker({ run, platform: 'linux' })(call()), unreadable(0));
});

test('A8: two calls at once that find nothing kept each ask, and both get the answer; the next call asks no more', async () => {
  const { run, seen } = recordingRunner([NEW]);
  const ask = pinClientAsker({ run, platform: 'linux' });

  assert.deepEqual(await Promise.all([ask(call()), ask(call())]), [knows('OpenSSH_10.2'), knows('OpenSSH_10.2')]);
  await ask(call());

  assert.equal(seen.length, 2, 'at most one question per call that found nothing kept; none after');
});

test('A9: an older answer is not kept, so a client replaced by a newer one is seen: older, then newer (asked again, the word is added), then the cache', async () => {
  const { run, seen } = recordingRunner([OLD, NEW]);
  const ask = pinClientAsker({ run, platform: 'linux' });

  assert.deepEqual(await ask(call()), older('OpenSSH_8.4'));
  assert.deepEqual(await ask(call()), knows('OpenSSH_10.2'), 'the second call asks again and reads the newer client');
  assert.deepEqual(await ask(call()), knows('OpenSSH_10.2'));
  assert.equal(seen.length, 2, 'the third call is served from the cache: the newer answer is kept');
});

/* ---- the real runner -------------------------------------------------------------------------------------------------- */

/** A stand-in `ssh`: a shell script in a folder of its own, named to the asker as the program. */
function standIn(t: TestContext, body: string): string {
  const file = path.join(ownedDir(t, 'standin'), 'ssh');
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return file;
}

const posix = process.platform === 'win32' ? { skip: 'a shell script stands in for ssh' } : {};

test('R1: the real runner: a stand-in of 10.2 knows, one of 8.4 is older, one that exits 255 is unreadable with 255, one that never answers is killed at the bound', posix, async (t) => {
  const ask = pinClientAsker({ timeoutMs: 1_000 });
  const marker = path.join(ownedDir(t, 'marker'), 'ran');
  const env = { PATH: process.env.PATH, HOME: process.env.HOME };

  assert.deepEqual(await ask({ program: standIn(t, 'echo "OpenSSH_10.2p1 Ubuntu, OpenSSL 3.5" >&2'), env }), knows('OpenSSH_10.2'));
  assert.deepEqual(await ask({ program: standIn(t, 'echo "OpenSSH_8.4p1 Debian" >&2'), env }), older('OpenSSH_8.4'));
  assert.deepEqual(await ask({ program: standIn(t, 'echo "OpenSSH_10.2p1"; exit 0'), env }), unreadable(0), 'the version on stdout only');
  assert.deepEqual(await ask({ program: standIn(t, 'exit 255'), env }), unreadable(255));
  const startedAt = Date.now();
  const silent = await ask({ program: standIn(t, `sleep 2; echo done > "${marker}"; exec sleep 30`), env });

  assert.deepEqual(silent, unreadable(null));
  assert.ok(Date.now() - startedAt < 5_000, 'it did not wait for the child');
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(fs.existsSync(marker), false, 'the child was killed at the bound and never went on');
});

/** The `ssh` of this machine's PATH, when it has one: the test below is skipped without it, and says so. */
function pathSsh(): string | undefined {
  const names = process.platform === 'win32' ? ['ssh.exe'] : ['ssh'];
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter((dir) => dir !== '');
  return dirs.flatMap((dir) => names.map((name) => path.join(dir, name))).find((file) => fs.existsSync(file));
}

test('R2: the real client of this machine\'s PATH answers a version that can be read (skipped where PATH has no ssh)', pathSsh() === undefined ? { skip: 'no ssh on PATH' } : {}, async () => {
  const read = await pinClientAsker()({ program: 'ssh', env: process.env });

  assert.notEqual(read.kind, 'unreadable', JSON.stringify(read));
  assert.match((read as { token: string }).token, /^OpenSSH_(for_Windows_)?\d+\.\d+$/);
});
