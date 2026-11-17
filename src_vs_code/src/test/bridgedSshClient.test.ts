import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TestContext, test } from 'node:test';
import { ownedDir } from '../../scripts/lib/leftovers.cjs';
import { BRIDGED_ENV_POSIX, bridgedSshEnv } from '../bridgedSshEnv';
import { sentences } from '../bridgedSshSentences';
import { BRIDGED_SSH_FLOOR, CLIENT_CHECK_TIMEOUT_MS, ClientRunner, ClientVerdict, bridgedSshClientCheck, clientVerdict, clientVerdictUnder } from '../bridgedSshClient';
import { materializedKeysDir } from '../materializedKeys';
import { notStarted } from '../requestLife';

/**
 * The reading of `ssh -V` (the E1.6 spec §S6.14 Y3, CV1-CV7): what a client answered, under the floor of the parent's Q12.
 *
 * <p>The floor is given to every call here, so these cases hold whatever value `BRIDGED_SSH_FLOOR` has: the cases that read the constant
 * itself are the last ones of the file.</p>
 */

const FLOOR = { other: [8, 9], win32: [9, 5] } as const;
const verdict = (exit: number | null, stdout: string, stderr: string, platform: NodeJS.Platform): ClientVerdict => clientVerdictUnder(FLOOR, exit, stdout, stderr, platform);
const below = (token: string): ClientVerdict => ({ ok: false, sentence: sentences.clientBelowFloor(token, '8.9', '9.5') });
const noVersion = (exit: number | null): ClientVerdict => ({ ok: false, sentence: sentences.clientNoVersion(exit) });

test('CV1: OpenSSH_10.2p1 on linux, exit 0, is ok with version 10.2 (numbers, not text: "10.2" is above "8.9")', () => {
  assert.deepEqual(verdict(0, '', 'OpenSSH_10.2p1 Ubuntu-2ubuntu3, OpenSSL 3.4.1 11 Feb 2025\n', 'linux'), { ok: true, version: '10.2' });
});

test('CV2: OpenSSH_8.9p1 is ok on linux and OpenSSH_8.8p1 is R13', () => {
  assert.deepEqual(verdict(0, '', 'OpenSSH_8.9p1 Ubuntu-3ubuntu0.1, OpenSSL 3.0.2 15 Mar 2022\n', 'linux'), { ok: true, version: '8.9' });
  assert.deepEqual(verdict(0, '', 'OpenSSH_8.8p1, OpenSSL 1.1.1\n', 'linux'), below('OpenSSH_8.8'));
});

test('CV3: OpenSSH_for_Windows_9.5p2 is ok on win32 and OpenSSH_for_Windows_8.1p1 is R13', () => {
  assert.deepEqual(verdict(0, '', 'OpenSSH_for_Windows_9.5p2, LibreSSL 3.8.2\n', 'win32'), { ok: true, version: '9.5' });
  assert.deepEqual(verdict(0, '', 'OpenSSH_for_Windows_8.1p1, LibreSSL 3.0.2\n', 'win32'), below('OpenSSH_for_Windows_8.1'));
});

test('CV4: the portable OpenSSH_9.9p1 on win32 is R13, whatever its number', () => {
  assert.deepEqual(verdict(0, '', 'OpenSSH_9.9p1, OpenSSL 3.3.2\n', 'win32'), below('OpenSSH_9.9'));
});

test('CV5: exit 255 with both streams empty is R12, and the sentence says 255', () => {
  const answer = verdict(255, '', '', 'linux');

  assert.deepEqual(answer, noVersion(255));
  assert.ok(!answer.ok && answer.sentence.includes('(exit 255)'), JSON.stringify(answer));
});

test('CV6: exit 0 with no token, and a stderr of 4000 characters, is R12; the sentence holds no part of the output', () => {
  const noise = 'Z'.repeat(4000);

  const none = verdict(0, 'fine\n', 'no version here\n', 'linux');
  const long = verdict(0, '', noise, 'linux');

  assert.deepEqual(none, noVersion(0));
  assert.deepEqual(long, noVersion(0));
  for (const answer of [none, long]) {
    const said = answer.ok ? '' : answer.sentence;
    assert.deepEqual([said.includes('no version here'), said.includes('ZZZ'), said.length > 0 && said.length < 300], [false, false, true], said);
  }
});

test('CV7: a token on stdout only is R12, and a token that is not at the start of stderr ("banner OpenSSH_9.9p1") is R12', () => {
  assert.deepEqual(verdict(0, 'OpenSSH_9.9p1\n', '', 'linux'), noVersion(0));
  assert.deepEqual(verdict(0, '', 'banner OpenSSH_9.9p1\n', 'linux'), noVersion(0));
});

test('an exit that is not 0 is R12 even when a token stands in stderr; a killed child (no exit code) is R12 too', () => {
  assert.deepEqual(verdict(1, '', 'OpenSSH_10.2p1\n', 'linux'), noVersion(1));
  assert.deepEqual(verdict(null, '', 'OpenSSH_10.2p1\n', 'linux'), noVersion(null));
});

test('R12 and R13 say what was just checked: no entry, and the token only (a version line after it is never quoted)', () => {
  const old = verdict(0, '', 'OpenSSH_8.6p1 Ubuntu-4ubuntu0.7, OpenSSL 3.0.2 15 Mar 2022\n', 'linux');

  assert.deepEqual(old, { ok: false, sentence: 'The ssh on this computer answered OpenSSH_8.6. A Remote Bridge needs OpenSSH 8.9 or newer, and on Windows the OpenSSH that Windows ships, 9.5 or newer.' });
  assert.equal(sentences.clientNoVersion(255), 'ssh did not answer its version under the environment a Remote Bridge gives it (exit 255). No call can go through a Remote Bridge from this computer until it does.');
});

/* ---------------------------------------------------------------------------------------------------------------
 * The spawn that asks (§S6.14 Y3): the program, the argv, the environment, the folder, the bound, and what is kept
 * ------------------------------------------------------------------------------------------------------------- */

interface Seen {
  readonly argv: string[];
  readonly options: Parameters<ClientRunner>[1];
  readonly folder: { readonly existed: boolean; readonly files: string[] };
}

/** A runner that records what it was given, and what its folder held while it ran, and answers from `answers` (the last again). */
function recordingRunner(answers: readonly (() => ReturnType<ClientRunner>)[]): { run: ClientRunner; seen: Seen[] } {
  const seen: Seen[] = [];
  const run: ClientRunner = (argv, options) => {
    const dir = options.cwd as string;
    seen.push({ argv, options, folder: { existed: fs.existsSync(dir), files: fs.existsSync(dir) ? fs.readdirSync(dir) : [] } });
    return answers[Math.min(seen.length - 1, answers.length - 1)]();
  };
  return { run, seen };
}

const answer = (exitCode: number | null, stderr: string): (() => ReturnType<ClientRunner>) => () => Promise.resolve({ exitCode, stdout: '', stderr });
const GOOD = answer(0, 'OpenSSH_10.2p1 Ubuntu-2ubuntu3\n');
const OLD = answer(0, 'OpenSSH_8.6p1 Ubuntu-4ubuntu0.7\n');
const SOURCE: NodeJS.ProcessEnv = { PATH: '/usr/bin', HOME: '/home/someone', BRIDGE_TEST_SECRET: 'a-secret', SSH_AUTH_SOCK: '/run/agent.sock' };

function storage(t: TestContext): string {
  return ownedDir(t, 'client');
}

test('the check asks `ssh -V` of the call\'s program, under the bridged environment, in an empty folder of its own under keys/<pid>/, with a 10 s bound', async (t) => {
  const dir = storage(t);
  const { run, seen } = recordingRunner([GOOD]);
  const guards = { signal: [new AbortController().signal], startGate: new AbortController().signal };

  const verdict = await bridgedSshClientCheck({ storageDir: dir, run, floor: FLOOR, platform: 'linux', source: SOURCE })({ program: '/opt/ssh', guards });

  assert.deepEqual(verdict, { ok: true, version: '10.2' });
  assert.equal(seen.length, 1);
  const [one] = seen;
  assert.deepEqual(one.argv, ['-V']);
  assert.equal(one.options.program, '/opt/ssh');
  assert.deepEqual(one.options.env, bridgedSshEnv(SOURCE, 'linux'));
  assert.deepEqual(Object.keys(one.options.env).sort(), [...BRIDGED_ENV_POSIX].sort());
  assert.equal(one.options.timeoutMs, 10_000);
  assert.equal(CLIENT_CHECK_TIMEOUT_MS, 10_000);
  assert.equal(one.options.signal, guards.signal);
  assert.equal(one.options.startGate, guards.startGate);
  assert.equal(path.dirname(one.options.cwd as string), materializedKeysDir(dir), 'a folder of this window\'s keys/<pid>/');
  assert.deepEqual(one.folder, { existed: true, files: [] }, 'it was there and held nothing while ssh ran');
  assert.equal(fs.existsSync(one.options.cwd as string), false, 'and it is removed afterwards');
});

test('a good verdict is kept per program for the life of the check; a bad one is asked again; another program is asked', async (t) => {
  const dir = storage(t);
  const { run, seen } = recordingRunner([OLD, GOOD]);
  const check = bridgedSshClientCheck({ storageDir: dir, run, floor: FLOOR, platform: 'linux', source: SOURCE });

  const first = await check({ program: 'ssh' });
  const second = await check({ program: 'ssh' });
  const third = await check({ program: 'ssh' });
  const other = await check({ program: '/other/ssh' });

  assert.equal(first.ok, false);
  assert.deepEqual([second, third, other], [{ ok: true, version: '10.2' }, { ok: true, version: '10.2' }, { ok: true, version: '10.2' }]);
  assert.deepEqual(seen.map((one) => one.options.program), ['ssh', 'ssh', '/other/ssh'], 'the bad one was asked again, the good one once, the other program on its own');
});

test('a runner that cannot start ssh is R12, and the folder is gone; a request that ended is not an answer and its error goes on', async (t) => {
  const dir = storage(t);
  const missing = recordingRunner([() => Promise.reject(Object.assign(new Error('spawn ssh ENOENT'), { code: 'ENOENT' }))]);
  const check = bridgedSshClientCheck({ storageDir: dir, run: missing.run, floor: FLOOR, platform: 'linux', source: SOURCE });

  assert.deepEqual(await check({ program: 'ssh' }), { ok: false, sentence: sentences.clientNoVersion(null) });
  assert.deepEqual(fs.readdirSync(materializedKeysDir(dir)), []);

  const gone = recordingRunner([() => Promise.reject(notStarted())]);
  await assert.rejects(bridgedSshClientCheck({ storageDir: dir, run: gone.run, floor: FLOOR })({ program: 'ssh' }), (error: Error) => error.name === 'AbortError');
  assert.deepEqual(fs.readdirSync(materializedKeysDir(dir)), []);
});

test('a runner that cannot start ssh leaves one journal note with the cause, beside R12 (the judge, 2026-11-16)', async (t) => {
  const dir = storage(t);
  const notes: string[] = [];
  const missing = recordingRunner([() => Promise.reject(Object.assign(new Error('spawn ssh ENOENT'), { code: 'ENOENT' }))]);
  const check = bridgedSshClientCheck({ storageDir: dir, run: missing.run, floor: FLOOR, platform: 'linux', source: SOURCE, note: (line) => notes.push(line) });

  assert.deepEqual(await check({ program: 'ssh' }), { ok: false, sentence: sentences.clientNoVersion(null) });
  assert.deepEqual(notes, ['ssh:exec — the client check could not start ssh: spawn ssh ENOENT']);
});

test('a request or window that ended while ssh -V ran is not R12: the ended error goes on, nothing is kept, and the next call asks again (the judge, 2026-11-16)', async (t) => {
  const dir = storage(t);
  for (const guards of [{ signal: AbortSignal.abort() }, { signal: [new AbortController().signal, AbortSignal.abort()] }, { startGate: AbortSignal.abort() }]) {
    const killed = recordingRunner([answer(null, ''), GOOD]);
    const check = bridgedSshClientCheck({ storageDir: dir, run: killed.run, floor: FLOOR, platform: 'linux', source: SOURCE });

    await assert.rejects(check({ program: 'ssh', guards }), (error: Error) => error.name === 'AbortError', JSON.stringify(Object.keys(guards)));
    assert.deepEqual(await check({ program: 'ssh' }), { ok: true, version: '10.2' });
    assert.equal(killed.seen.length, 2, 'the ended ask kept nothing');
  }
  assert.deepEqual(fs.readdirSync(materializedKeysDir(dir)), []);
});

test('a folder that cannot be removed is one journal note, and the verdict is still given', async (t) => {
  const dir = storage(t);
  const notes: string[] = [];
  const { run } = recordingRunner([GOOD]);
  const nodeFs = require('node:fs') as typeof fs;
  const real = nodeFs.rmSync;
  t.mock.method(nodeFs, 'rmSync', (target: fs.PathLike, options?: fs.RmOptions): void => {
    if (String(target).startsWith(materializedKeysDir(dir))) {
      throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
    }
    real(target, options);
  });

  const verdict = await bridgedSshClientCheck({ storageDir: dir, run, floor: FLOOR, platform: 'linux', source: SOURCE, note: (line) => notes.push(line) })({ program: 'ssh' });

  assert.deepEqual(verdict, { ok: true, version: '10.2' });
  assert.deepEqual(notes, ['ssh:exec — the folder of the client check could not be removed: EPERM: operation not permitted']);
  t.mock.restoreAll();
  fs.rmSync(materializedKeysDir(dir), { recursive: true, force: true });
});

/** A stand-in `ssh`: a shell script in a folder of its own, named to the check as the program. */
function standIn(t: TestContext, body: string): string {
  const file = path.join(ownedDir(t, 'standin'), 'ssh');
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return file;
}

const posix = process.platform === 'win32' ? { skip: 'a shell script stands in for ssh' } : {};

test('the real runner: a stand-in that prints its version on stderr is ok; one that exits 255 is R12 with 255; one that never answers is killed at the bound and is R12', posix, async (t) => {
  const dir = storage(t);
  const check = bridgedSshClientCheck({ storageDir: dir, floor: FLOOR, platform: 'linux', source: SOURCE, timeoutMs: 1_000 });
  const marker = path.join(ownedDir(t, 'marker'), 'ran');

  assert.deepEqual(await check({ program: standIn(t, 'echo "OpenSSH_9.9p1, OpenSSL 3.3" >&2') }), { ok: true, version: '9.9' });
  assert.deepEqual(await check({ program: standIn(t, 'exit 255') }), { ok: false, sentence: sentences.clientNoVersion(255) });
  const startedAt = Date.now();
  const silent = await check({ program: standIn(t, `sleep 2; echo done > "${marker}"; exec sleep 30`) });

  assert.deepEqual(silent, { ok: false, sentence: sentences.clientNoVersion(null) });
  assert.ok(Date.now() - startedAt < 5_000, 'it did not wait for the child');
  assert.deepEqual(fs.readdirSync(materializedKeysDir(dir)), [], 'no folder is left');
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(fs.existsSync(marker), false, 'the child was killed at the bound and never went on');
});

/* ---------------------------------------------------------------------------------------------------------------
 * The floor itself (the owner's Q12, 2026-11-16): the cases above hold under an injected floor; these read the constant
 * ------------------------------------------------------------------------------------------------------------- */

test('the floor is OpenSSH 8.9, and Win32-OpenSSH 9.5 on Windows', () => {
  assert.deepEqual(BRIDGED_SSH_FLOOR, { other: [8, 9], win32: [9, 5] });
});

test('CV2, CV3 and CV4 under the constant: 8.9 is ok and 8.8 is R13 on linux; 9.5p2 is ok and 8.1 is R13 on win32; the portable 9.9 is R13 on win32', () => {
  assert.deepEqual(clientVerdict(0, '', 'OpenSSH_8.9p1 Ubuntu-3ubuntu0.1\n', 'linux'), { ok: true, version: '8.9' });
  assert.deepEqual(clientVerdict(0, '', 'OpenSSH_8.8p1\n', 'linux'), below('OpenSSH_8.8'));
  assert.deepEqual(clientVerdict(0, '', 'OpenSSH_for_Windows_9.5p2, LibreSSL 3.8.2\n', 'win32'), { ok: true, version: '9.5' });
  assert.deepEqual(clientVerdict(0, '', 'OpenSSH_for_Windows_8.1p1, LibreSSL 3.0.2\n', 'win32'), below('OpenSSH_for_Windows_8.1'));
  assert.deepEqual(clientVerdict(0, '', 'OpenSSH_9.9p1\n', 'win32'), below('OpenSSH_9.9'));
});

test('a check built with no floor of its own is under the constant: 8.6 is refused with the R13 sentence of the owner\'s floor', async (t) => {
  const { run } = recordingRunner([OLD]);

  const verdict = await bridgedSshClientCheck({ storageDir: storage(t), run, platform: 'linux', source: SOURCE })({ program: 'ssh' });

  assert.deepEqual(verdict, { ok: false, sentence: 'The ssh on this computer answered OpenSSH_8.6. A Remote Bridge needs OpenSSH 8.9 or newer, and on Windows the OpenSSH that Windows ships, 9.5 or newer.' });
});
