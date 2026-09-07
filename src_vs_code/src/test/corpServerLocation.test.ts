import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCorpServerLocation, isServerLocation } from '../vaultTransport';

/**
 * Which locations a corporate client may be built for.
 *
 * <p>The gap this closes was real rather than theoretical: `isServerLocation` is a test for
 * `http(s)://`, and an https GIT REMOTE passes it — so a vault synced to
 * `https://git.example.com/team/vault.git` would have been handed a client that sends
 * `Authorization: Bearer <token>` to a git host. Four factories asked that half-question; they ask
 * this one now.</p>
 */

test('a vault server is one', () => {
  assert.equal(isCorpServerLocation('https://vault.corp.com'), true);
  assert.equal(isCorpServerLocation('http://127.0.0.1:5113'), true);
});

test('an https GIT REMOTE is not — no corporate client, no bearer token to a git host', () => {
  assert.equal(isCorpServerLocation('https://git.example.com/team/vault.git'), false);
  assert.equal(isCorpServerLocation('https://github.com/acme/vault.git'), false);
});

test('and the narrower rule is the one that changed — the control the structural rule asks for', () => {
  // `isServerLocation` says YES to the git remote, which is exactly why asking it alone was the
  // defect. A scan whose pattern stops matching anything passes for ever; this is what keeps the
  // difference between the two visible.
  assert.equal(isServerLocation('https://github.com/acme/vault.git'), true);
  assert.equal(isServerLocation('https://vault.corp.com'), true);
});

test('a folder is not one either', () => {
  assert.equal(isCorpServerLocation('D:\\vaults'), false);
  assert.equal(isCorpServerLocation('/mnt/nas/vault'), false);
  assert.equal(isCorpServerLocation('\\\\nas\\vaults'), false);
});
