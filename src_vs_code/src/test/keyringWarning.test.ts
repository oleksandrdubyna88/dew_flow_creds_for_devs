import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keyringMayBeUnprotected, keyringWarningMessage } from '../keyringWarning';

/**
 * The listing says secrets live in the OS keychain. On a Linux box with no
 * reachable Secret Service that is false — VS Code falls back to a store that is
 * obfuscated rather than encrypted, and says nothing about it. This is the check
 * that at least tells the person.
 */

const probe = (over: Partial<Parameters<typeof keyringMayBeUnprotected>[0]> = {}) => ({
  platform: 'linux' as NodeJS.Platform,
  dbusAddress: 'unix:path=/run/user/1000/bus',
  remoteName: undefined,
  ...over,
});

test('Linux with no D-Bus session is the case worth warning about', () => {
  assert.equal(keyringMayBeUnprotected(probe({ dbusAddress: undefined })), true);
  assert.equal(keyringMayBeUnprotected(probe({ dbusAddress: '' })), true);
});

test('Linux with a D-Bus session is left alone', () => {
  assert.equal(keyringMayBeUnprotected(probe()), false);
});

test('macOS and Windows are never warned — they always have a real store', () => {
  // A warning that fires where nothing is wrong teaches people to dismiss warnings,
  // and the one that matters arrives after that habit is formed.
  assert.equal(keyringMayBeUnprotected(probe({ platform: 'darwin', dbusAddress: undefined })), false);
  assert.equal(keyringMayBeUnprotected(probe({ platform: 'win32', dbusAddress: undefined })), false);
});

test('the message admits it is a guess, and still says what to do', () => {
  // Nothing exposes which backend Chromium picked, so asserting a fault would be
  // claiming knowledge we do not have — but stopping at "may" would leave the
  // reader with nothing to act on.
  const message = keyringWarningMessage();

  assert.match(message, /may have no OS keyring/);
  assert.match(message, /obfuscated rather than encrypted/);
  assert.match(message, /gnome-keyring or kwallet/);
});

test('the message does not name keytar — VS Code does not use it', () => {
  // It appears in this repo only as a transitive dev dependency of vsce. Naming it
  // would send whoever goes to check into the wrong place.
  assert.doesNotMatch(keyringWarningMessage(), /keytar/i);
});
