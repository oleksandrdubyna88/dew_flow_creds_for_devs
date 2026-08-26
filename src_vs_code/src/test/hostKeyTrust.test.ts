import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { formatHostKey, HostKey } from '../hostKeyPin';
import { EntityMetadata } from '../types';

/**
 * The conversation about a host key, and the file that enforces the answer (audit B10).
 *
 * <p>`hostKeyPin.ts` decides; this module is the three things that cannot be pure — spawning
 * `ssh-keyscan`, opening a modal, and writing `known_hosts`. What is pinned here is which
 * verdict speaks and which stays silent, because both mistakes are bad in opposite ways: a
 * dialog on every connection is one people learn to dismiss, and silence on a CHANGED key is
 * the thing `accept-new` used to do.</p>
 */

type Trust = typeof import('../hostKeyTrust');

const KEY: HostKey = { algorithm: 'ssh-ed25519', base64: 'AAAAC3NzaC1lZDI1NTE5AAAAIKNOWNKEY' };
const OTHER: HostKey = { algorithm: 'ssh-ed25519', base64: 'AAAAC3NzaC1lZDI1NTE5AAAAIOTHERKEY' };

interface Asked {
  warnings: string[];
  errors: string[];
  answer?: string;
}

function trust(asked: Asked): Trust {
  return loadWithVscode<Trust>('../hostKeyTrust', {
    window: {
      showWarningMessage: (message: string): Promise<string | undefined> => {
        asked.warnings.push(message);
        return Promise.resolve(asked.answer);
      },
      showErrorMessage: (message: string): Promise<string | undefined> => {
        asked.errors.push(message);
        return Promise.resolve(asked.answer);
      },
    },
    workspace: { getConfiguration: () => ({ get: <T>(_k: string, d: T): T => d }) },
  });
}

function entity(over: Partial<EntityMetadata> = {}): EntityMetadata {
  return { id: 'e1', name: 'prod', isSshEnabled: true, host: 'prod.example.com', ...over };
}

const asked = (): Asked => ({ warnings: [], errors: [] });

test('a key that matches the pin says NOTHING — a prompt here is one people learn to dismiss', async () => {
  const a = asked();

  const outcome = await trust(a).confirmHostKey(entity({ hostKey: formatHostKey(KEY) }), KEY);

  assert.deepEqual(outcome, { proceed: true });
  assert.deepEqual([...a.warnings, ...a.errors], [], 'the common case is silent');
});

test('a host that did not answer is not a host that changed its key', async () => {
  // ssh-keyscan absent, or the box is down. Refusing here would make an outage look like an
  // attack; the pin is still enforced by the known_hosts file, so this is not a way past one.
  const a = asked();

  const outcome = await trust(a).confirmHostKey(entity({ hostKey: formatHostKey(KEY) }), undefined);

  assert.deepEqual(outcome, { proceed: true });
  assert.deepEqual([...a.warnings, ...a.errors], []);
});

test('first contact shows the fingerprint and only proceeds if the person trusts it', async () => {
  // The question accept-new never asked.
  const a = asked();
  a.answer = 'Trust and connect';

  const outcome = await trust(a).confirmHostKey(entity(), KEY);

  assert.equal(outcome.proceed, true);
  assert.equal(outcome.pin, formatHostKey(KEY), 'and the key is handed back to be stored');
  assert.equal(a.warnings.length, 1);
  assert.match(a.warnings[0], /First connection/);
  assert.match(a.warnings[0], /SHA256:/, 'the fingerprint is what makes the question answerable');
});

test('declining first contact refuses the connection and pins nothing', async () => {
  const a = asked();
  a.answer = undefined; // dismissed

  assert.deepEqual(await trust(a).confirmHostKey(entity(), KEY), { proceed: false });
});

test('a CHANGED key is an error, refused by default, and worded as both things it can be', async () => {
  // "The host key changed" is what interception looks like and what a rebuilt server looks
  // like. One button for both would train people to press it.
  const a = asked();
  a.answer = undefined;

  const outcome = await trust(a).confirmHostKey(entity({ hostKey: formatHostKey(KEY) }), OTHER);

  assert.deepEqual(outcome, { proceed: false });
  assert.equal(a.errors.length, 1, 'an ERROR dialog, not a warning');
  assert.match(a.errors[0], /HAS CHANGED/);
  assert.match(a.errors[0], /machine-in-the-middle/);
  assert.match(a.errors[0], /rebuilt or migrated/, 'and the innocent explanation, so it is a real question');
});

test('the way past a mismatch is a DIFFERENT click from trusting a new host', async () => {
  const a = asked();
  a.answer = 'I rebuilt it — replace the pin';

  const outcome = await trust(a).confirmHostKey(entity({ hostKey: formatHostKey(KEY) }), OTHER);

  assert.equal(outcome.proceed, true);
  assert.equal(outcome.pin, formatHostKey(OTHER), 'the new key replaces the old pin');
  // The first-contact button must not also dismiss a mismatch.
  const b = asked();
  b.answer = 'Trust and connect';
  assert.equal((await trust(b).confirmHostKey(entity({ hostKey: formatHostKey(KEY) }), OTHER)).proceed, false);
});

test('the known_hosts file is written where ssh will read it, once there is a pin', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-kh-'));

  const file = trust(asked()).materializeKnownHosts(dir, entity({ hostKey: formatHostKey(KEY) }));

  assert.ok(file !== undefined);
  const line = fs.readFileSync(file, 'utf8');
  assert.match(line, /prod\.example\.com/);
  assert.match(line, /ssh-ed25519/);
});

test('no pin, or no host, means no file — never an empty one ssh would treat as authoritative', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-kh2-'));
  const mod = trust(asked());

  assert.equal(mod.materializeKnownHosts(dir, entity()), undefined, 'no pin yet');
  assert.equal(
    mod.materializeKnownHosts(dir, entity({ hostKey: formatHostKey(KEY), host: undefined })),
    undefined,
    'a pin with nothing to pin it to',
  );
});

test('a non-port-standard host is scanned without ever spawning for an unsafe name', async () => {
  // A host beginning with a dash is a FLAG to getopt. The guard returns before any spawn, so
  // this test needs no process at all — which is the point of the guard being first.
  const outcome = await trust(asked()).scanHostKey('-oProxyCommand=touch /tmp/pwned', undefined);

  assert.equal(outcome, undefined);
});
