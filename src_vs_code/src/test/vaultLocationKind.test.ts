import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { isServerLocation } from '../vaultTransport';

/**
 * Which kind of location a configured string names (audit A3).
 *
 * <p>One predicate, and getting it wrong is expensive in a specific way: a location routed
 * to the WRONG transport does not fail loudly, it syncs to a place the colleague's window is
 * not reading — so both people believe they are sharing a vault and neither sees the other's
 * entries. `transportFactory.ts` tests the routing that consumes this; what is only true here
 * is what counts as a server URL at all.</p>
 *
 * <p>The ordering that makes this safe lives in the factory: a `https://…/vault.git` URL is
 * indistinguishable from a server by this predicate alone, so git is recognised FIRST. This
 * file pins the predicate's own behaviour, including that it says "yes" to that git URL.</p>
 */

test('an http or https URL is a server location', () => {
  assert.equal(isServerLocation('https://vault.corp.com'), true);
  assert.equal(isServerLocation('http://10.0.0.5:8080'), true);
});

test('the scheme is matched case-insensitively — a pasted URL is not always lower case', () => {
  assert.equal(isServerLocation('HTTPS://vault.corp.com'), true);
  assert.equal(isServerLocation('Http://vault.corp.com'), true);
});

test('surrounding whitespace from a paste does not change the answer', () => {
  // A settings value pasted from a browser or a chat message routinely carries a space.
  assert.equal(isServerLocation('  https://vault.corp.com  '), true);
});

test('a filesystem path is NOT a server, on either platform', () => {
  // Routing a NAS folder to the server transport would try to authenticate against a
  // directory, and the operator would be told their credentials were refused.
  assert.equal(isServerLocation('/mnt/nas/vaults'), false);
  assert.equal(isServerLocation('\\\\nas\\vaults'), false);
  assert.equal(isServerLocation('C:\\Users\\me\\vaults'), false);
});

test('an empty or unset location is not a server', () => {
  assert.equal(isServerLocation(''), false);
  assert.equal(isServerLocation('   '), false);
});

test('a scheme that merely CONTAINS http is not a server', () => {
  // The anchor matters: a folder named after a URL must not be dialled.
  assert.equal(isServerLocation('/mnt/http-backups'), false);
  assert.equal(isServerLocation('ssh://git@corp.com/vault.git'), false);
});

test('an https git URL answers YES here — which is why the factory checks git first', () => {
  // Recorded so the ordering in transportFactory.ts is not "tidied" into a different one:
  // this predicate cannot tell the two apart, and it is not supposed to.
  assert.equal(isServerLocation('https://github.com/me/vault.git'), true);
});
