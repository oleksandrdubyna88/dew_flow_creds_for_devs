import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { sentences } from '../bridgedSshSentences';
import { ClientVerdict, clientVerdictUnder } from '../bridgedSshClient';

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
