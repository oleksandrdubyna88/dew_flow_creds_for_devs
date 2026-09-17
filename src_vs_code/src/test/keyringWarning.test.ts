import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  KEYRING_DOUBTS,
  KeyringProbe,
  SECRET_SERVICE_CLIENTS,
  keyringDoubts,
  keyringMayBeUnprotected,
  keyringWarningMessage,
} from '../keyringWarning';

/**
 * The listing says secrets live in the OS keychain. On a Linux box with no reachable
 * Secret Service that is false — VS Code falls back to a store that is obfuscated
 * rather than encrypted, and says nothing about it. This is the check that at least
 * tells the person.
 *
 * <p>The default probe below is a WORKING desktop: a bus, a desktop environment, and a
 * client installed. Every test names the ONE thing it takes away, so a test cannot pass
 * because the fixture was already broken in some other way.</p>
 */

const probe = (over: Partial<KeyringProbe> = {}): KeyringProbe => ({
  platform: 'linux',
  dbusAddress: 'unix:path=/run/user/1000/bus',
  desktop: 'ubuntu:GNOME',
  desktopSession: 'ubuntu',
  secretServiceClientInstalled: true,
  ...over,
});

test('a working Linux desktop is left alone', () => {
  assert.deepEqual(keyringDoubts(probe()), []);
  assert.equal(keyringMayBeUnprotected(probe()), false);
});

test('macOS and Windows are never warned — they always have a real store', () => {
  // A warning that fires where nothing is wrong teaches people to dismiss warnings, and
  // the one that matters arrives after that habit is formed.
  const broken = { dbusAddress: undefined, desktop: '', desktopSession: '', secretServiceClientInstalled: false };

  assert.deepEqual(keyringDoubts(probe({ platform: 'darwin', ...broken })), []);
  assert.deepEqual(keyringDoubts(probe({ platform: 'win32', ...broken })), []);
});

// --- the three signals, one at a time ---------------------------------------------------

test('no D-Bus session — the case the first version of this check was written for', () => {
  assert.deepEqual(keyringDoubts(probe({ dbusAddress: undefined })), ['no-session-bus']);
  assert.deepEqual(keyringDoubts(probe({ dbusAddress: '' })), ['no-session-bus']);
});

test('no Secret Service client installed — nothing for Chromium to reach at all', () => {
  assert.deepEqual(keyringDoubts(probe({ secretServiceClientInstalled: false })), [
    'no-secret-service-client',
  ]);
});

test('no desktop environment advertised — the store is picked BEFORE anything is tried', () => {
  // Chromium selects the backend from XDG_CURRENT_DESKTOP / DESKTOP_SESSION and picks the
  // basic store for a session that advertises neither. Installing a keyring does not help
  // here, which is exactly why this is its own sentence.
  assert.deepEqual(keyringDoubts(probe({ desktop: undefined, desktopSession: undefined })), [
    'no-desktop-environment',
  ]);
  assert.deepEqual(keyringDoubts(probe({ desktop: '', desktopSession: '' })), [
    'no-desktop-environment',
  ]);
});

test('either spelling of the desktop counts, because either one is what Chromium reads', () => {
  assert.deepEqual(keyringDoubts(probe({ desktop: '', desktopSession: 'ubuntu' })), []);
  assert.deepEqual(keyringDoubts(probe({ desktop: 'KDE', desktopSession: '' })), []);
});

// --- the machine that was silently wrong ------------------------------------------------

test('THE REGRESSION: a WSL distribution with systemd was told nothing, and it was the worst case', () => {
  // Measured 2026-09-17 on the reporting machine. `systemd=true` gives it a session bus, so
  // the D-Bus-only check answered "fine" — while there was no org.freedesktop.secrets on
  // that bus (not even activatable), no libsecret anywhere, no kwalletd, and an empty
  // XDG_CURRENT_DESKTOP. Chromium picks BASIC_TEXT there with certainty.
  const wsl = probe({
    dbusAddress: 'unix:path=/run/user/1000/bus',
    desktop: undefined,
    desktopSession: undefined,
    secretServiceClientInstalled: false,
  });

  assert.equal(keyringMayBeUnprotected(wsl), true, 'a false negative in a security warning');
  assert.deepEqual(
    keyringDoubts(wsl),
    ['no-secret-service-client', 'no-desktop-environment'],
    'both hold, and either alone would send the reader somewhere that does not fix it',
  );
});

test('every reason is reported, ordered by what has to be fixed first', () => {
  const nothing = probe({
    dbusAddress: undefined,
    desktop: undefined,
    desktopSession: undefined,
    secretServiceClientInstalled: false,
  });

  assert.deepEqual(keyringDoubts(nothing), [...KEYRING_DOUBTS], 'the production order, not a copy');
});

// --- the wording ------------------------------------------------------------------------

test('every doubt has a clause, so a new one cannot be added without wording it', () => {
  for (const doubt of KEYRING_DOUBTS) {
    const message = keyringWarningMessage([doubt]);

    assert.doesNotMatch(message, /undefined/, `${doubt} leaked an undefined into the sentence`);
    assert.ok(message.length > 200, `${doubt} produced a stub`);
  }
});

test('the message says WHICH machine — installing it on the wrong one is the main way to not help', () => {
  // PLAN_tails_2 §2.3: extensionKind: ["ui"] keeps the host on the computer running the
  // window, so a reader who fixes the machine they connected TO finds it did nothing.
  const message = keyringWarningMessage(['no-session-bus']);

  assert.match(message, /computer running this VS Code window/);
  assert.match(message, /not a machine you are connected to/);
});

test('the message admits it is a guess, and still says what to do', () => {
  // Nothing exposes which backend Chromium picked, so asserting a fault would be claiming
  // knowledge we do not have — but stopping at "may" would leave the reader with nothing
  // to act on.
  const message = keyringWarningMessage(['no-secret-service-client', 'no-desktop-environment']);

  assert.match(message, /may have\s+no OS keyring/);
  assert.match(message, /obfuscated\s+rather than encrypted/);
  assert.match(message, /gnome-keyring or kwallet/);
  assert.match(message, /neither libsecret nor kwallet/);
  assert.match(message, /no desktop environment is advertised/);
});

test('an empty list still says something, rather than an empty warning nobody notices', () => {
  assert.match(keyringWarningMessage([]), /nothing specific was detected/);
});

test('the message does not name keytar — VS Code does not use it', () => {
  // It appears in this repo only as a transitive dev dependency of vsce. Naming it would
  // send whoever goes to check into the wrong place.
  assert.doesNotMatch(keyringWarningMessage([...KEYRING_DOUBTS]), /keytar/i);
});

// --- where a client is looked for -------------------------------------------------------

test('the client paths cover the three library layouts and both kwallet daemons', () => {
  // Being generous here is the safe direction: a path this list misses produces a warning
  // nobody needed, never a silence somebody did.
  assert.ok(SECRET_SERVICE_CLIENTS.includes('/usr/lib/x86_64-linux-gnu/libsecret-1.so.0'), 'multiarch');
  assert.ok(SECRET_SERVICE_CLIENTS.includes('/usr/lib64/libsecret-1.so.0'), 'Fedora/RHEL');
  assert.ok(SECRET_SERVICE_CLIENTS.includes('/usr/lib/libsecret-1.so.0'), 'Arch');
  assert.ok(SECRET_SERVICE_CLIENTS.some((p) => p.endsWith('kwalletd5')), 'KDE 5');
  assert.ok(SECRET_SERVICE_CLIENTS.some((p) => p.endsWith('kwalletd6')), 'KDE 6');
  assert.ok(
    SECRET_SERVICE_CLIENTS.every((p) => p.startsWith('/')),
    'absolute, because the host stats them directly',
  );
});
