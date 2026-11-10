import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import type { PreparedSsh, ReadySsh } from '../sshSession';
import type { PreparedForTyping } from '../remoteLaunch';
import {
  OPTIONS,
  OUR_PIN,
  WSL_NO_RELAY,
  WSL_READY,
  WSL_WINDOWS_CLIENT,
  entity,
  storage,
  world,
} from './sshConnectWorld';

/**
 * The seam of SSH Connect: everything that happens BEFORE a terminal exists (E1.S3).
 *
 * <p>Tested through the same stub world as `connectEntity` (`sshConnectWorld.ts`), so one set of
 * mocks serves both suites. The questions here are the ones nothing a caller can see answers: what
 * is on disk after each result, who takes it back, and that preparing opens no terminal at all.</p>
 */

const ready = (p: PreparedSsh): ReadySsh => {
  assert.equal(p.kind, 'ready');
  return p as ReadySsh;
};

const STORED = { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' };
const base = { storage, storageDir: '/storage' };
const KEY = '/storage/keys/k1.key';

test('prepare opens no terminal and sends nothing — stored key, relay, password', async () => {
  const worlds = [
    { w: world({ source: STORED, options: OPTIONS, sshTerminal: {} }), connect: { ...base } },
    {
      w: world({ source: STORED, options: OPTIONS }),
      connect: { ...base, agentServesKey: true, remote: WSL_READY },
    },
    { w: world({ source: { kind: 'password', password: 'hunter2' }, options: OPTIONS }), connect: { ...base } },
  ];
  for (const { w, connect } of worlds) {
    const prepared = await w.seam.prepareSshSession('a1', entity(), connect);

    assert.equal(prepared.kind, 'ready');
    assert.deepEqual(w.sshTerminals, [], 'no openSshTerminal');
    assert.deepEqual(w.created, [], 'no createTerminal');
  }
});

test('ready with a stored key wrote the key; cleanup deletes it and our pin', async () => {
  const w = world({ source: STORED, options: { knownHostsFile: OUR_PIN } });

  const r = ready(await w.seam.prepareSshSession('a1', entity(), base));

  assert.equal(r.materializedKeyPath, KEY);
  assert.equal(r.entity.sshKeyPath, KEY);
  assert.deepEqual(w.materialised, [KEY]);
  assert.deepEqual(w.forgotten, []);
  r.cleanup();
  assert.deepEqual(w.forgotten, [KEY, OUR_PIN]);
});

test('cleanup twice forgets once', async () => {
  const w = world({ source: STORED, options: { knownHostsFile: OUR_PIN } });
  const r = ready(await w.seam.prepareSshSession('a1', entity(), base));

  r.cleanup();
  r.cleanup();

  assert.equal(w.forgotten.length, 2);
});

test('a refused window leaves no pin file, asks no host key, shows no modal', async () => {
  const w = world({ source: STORED, options: { knownHostsFile: OUR_PIN } });

  const p = await w.seam.prepareSshSession('a1', entity(), { ...base, agentServesKey: false, remote: WSL_NO_RELAY });

  assert.equal(p.kind, 'refused');
  assert.deepEqual((p as { reasons: unknown }).reasons, ['relay-off', 'agent-has-no-key']);
  assert.equal((p as { retryable: boolean }).retryable, true);
  assert.deepEqual(w.hostKeyAsked, []);
  assert.deepEqual(w.materialised, []);
  assert.deepEqual(w.forgotten, []);
  assert.deepEqual(w.warnings, [], 'the modal is the caller’s');
});

test('a late refusal takes its pin back — failed translation, dead adopted relay', async () => {
  const failed = world({ source: STORED, options: { knownHostsFile: OUR_PIN }, translated: '' });

  const first = await failed.seam.prepareSshSession('a1', entity(), { ...base, agentServesKey: true, remote: WSL_READY });

  assert.equal(first.kind, 'refused');
  assert.deepEqual((first as { reasons: unknown }).reasons, ['known-hosts-translation-failed']);
  assert.deepEqual(failed.forgotten, [OUR_PIN]);

  const dead = world({ source: STORED, options: { knownHostsFile: OUR_PIN }, socketAlive: false });
  const adopted = { ...WSL_READY, relay: { ...WSL_READY.relay, adopted: true } };

  const second = await dead.seam.prepareSshSession('a1', entity(), { ...base, agentServesKey: true, remote: adopted });

  assert.equal(second.kind, 'refused');
  assert.deepEqual((second as { reasons: unknown }).reasons, ['relay-not-running']);
  assert.deepEqual(dead.forgotten, [OUR_PIN]);
  assert.deepEqual(dead.sshTerminals, []);
});

test('a request already gone is asked nothing and stops', async () => {
  const request = new AbortController();
  request.abort();
  const w = world({ source: { ...STORED, warning: 'old key' }, options: OPTIONS });

  const p = await w.seam.prepareSshSession('a1', entity(), { ...base, startGate: request.signal });

  assert.equal(p.kind, 'stopped');
  assert.equal((p as { why: string }).why, 'request-gone');
  assert.deepEqual(w.openers, []);
  assert.deepEqual(w.hostKeyAsked, []);
  assert.deepEqual(w.warnings, []);
  assert.deepEqual(w.created, []);
});

test('a request gone during the lookup gets no host-key question and no warning', async () => {
  const request = new AbortController();
  const w = world({
    source: { ...STORED, warning: 'old key' },
    options: OPTIONS,
    duringLookup: () => request.abort(),
  });

  const p = await w.seam.prepareSshSession('a1', entity(), { ...base, startGate: request.signal });

  assert.equal(p.kind, 'stopped');
  assert.equal((p as { why: string }).why, 'request-gone');
  assert.deepEqual(w.hostKeyAsked, []);
  assert.deepEqual(w.warnings, []);
});

test('a request gone after the host-key step stops and takes the pin back', async () => {
  const request = new AbortController();
  const w = world({
    source: STORED,
    options: { knownHostsFile: OUR_PIN },
    duringHostKey: () => request.abort(),
  });

  const p = await w.seam.prepareSshSession('a1', entity(), { ...base, startGate: request.signal });

  assert.equal(p.kind, 'stopped');
  assert.equal((p as { why: string }).why, 'request-gone');
  assert.deepEqual(w.forgotten, [OUR_PIN]);
  assert.deepEqual(w.materialised, []);
});

test('a password gives an env with the password and no terminal; accept-new only without a pin', async () => {
  const unpinned = world({ source: { kind: 'password', password: 'hunter2' }, options: OPTIONS });

  const r = ready(await unpinned.seam.prepareSshSession('a1', entity(), base));

  assert.equal(r.env?.CREDS_PASSWORD, 'hunter2');
  assert.equal(r.env?.SSH_ASKPASS, '/storage/keys/askpass.sh');
  assert.equal(r.acceptNew, true);
  assert.equal(r.entity.sshKeyPath, undefined);
  assert.equal(r.materializedKeyPath, undefined);
  assert.deepEqual(unpinned.created, []);

  const pinned = world({
    source: { kind: 'password', password: 'hunter2' },
    options: { knownHostsFile: '/storage/known_hosts' },
  });

  const second = ready(await pinned.seam.prepareSshSession('a1', entity(), base));

  assert.equal(second.acceptNew, false);
});

test('a password entity with no host stops with the sentence and writes nothing', async () => {
  const w = world({ source: { kind: 'password', password: 'hunter2' }, options: OPTIONS });

  const p = await w.seam.prepareSshSession('a1', entity({ host: undefined }), base);

  assert.equal(p.kind, 'stopped');
  assert.equal((p as { why: string }).why, 'no-host');
  assert.match(w.warnings[0], /no host configured/);
  assert.deepEqual(w.created, []);
});

test('a key that cannot be written stops, says so, and takes the pin back', async () => {
  const w = world({ source: STORED, options: { knownHostsFile: OUR_PIN }, materialiseFails: true });

  const p = await w.seam.prepareSshSession('a1', entity(), base);

  assert.equal(p.kind, 'stopped');
  assert.equal((p as { why: string }).why, 'key-write-failed');
  assert.match(w.errors[0], /Could not write the stored key/);
  assert.deepEqual(w.forgotten, [OUR_PIN]);
});

test('the snapshot is the entity handed in; the key path is set or cleared on the copy; jump and target are read off it', async () => {
  const options = { knownHostsFile: undefined, jump: 'jump.corp' };
  const ssh = entity();
  const stored = world({ source: STORED, options });

  const r = ready(await stored.seam.prepareSshSession('a1', ssh, base));

  assert.equal(r.snapshot, ssh, 'the same object, not a copy');
  assert.equal(ssh.sshKeyPath, undefined, 'the argument is never written to');
  assert.equal(r.entity.sshKeyPath, KEY);
  assert.equal(r.jump, 'jump.corp');
  assert.equal(r.target, 'prod.corp.com');

  const agent = world({ source: STORED, options });
  const served = ready(await agent.seam.prepareSshSession('a1', entity({ sshKeyPath: '/old' }), { ...base, agentServesKey: true }));
  assert.equal(served.entity.sshKeyPath, undefined, 'cleared when the agent answers');

  const own = world({ source: { kind: 'keyPath', path: '/home/me/.ssh/id_ed25519' }, options });
  const owned = ready(await own.seam.prepareSshSession('a1', entity(), base));
  assert.equal(owned.entity.sshKeyPath, '/home/me/.ssh/id_ed25519');
  assert.equal(owned.materializedKeyPath, undefined);
  owned.cleanup();
  assert.deepEqual(own.forgotten, [], 'the person’s own key file is never touched');
});

test('the relay route: prefix, no key, linux, nothing to clean', async () => {
  const w = world({ source: STORED, options: OPTIONS });

  const r = ready(await w.seam.prepareSshSession('a1', entity(), { ...base, agentServesKey: true, remote: WSL_READY }));

  assert.equal(r.prefix, "env SSH_AUTH_SOCK='/run/user/1000/creds-agent.sock' ");
  assert.equal(r.platform, 'linux');
  assert.equal(r.entity.sshKeyPath, undefined);
  assert.equal(r.materializedKeyPath, undefined);
  assert.deepEqual(w.materialised, []);
  r.cleanup();
  assert.deepEqual(w.forgotten, []);
});

test('the Windows-client route: program word, key written, pin not translated, the caveat said', async () => {
  const w = world({ source: STORED, options: { knownHostsFile: OUR_PIN }, translated: '/mnt/c/x' });
  const forwarding = entity({
    portForwards: [{ kind: 'local', bindPort: 5432, host: 'db', hostPort: 5432 }],
  } as never);

  const r = ready(
    await w.seam.prepareSshSession('a1', forwarding, { ...base, agentServesKey: false, remote: WSL_WINDOWS_CLIENT }),
  );

  assert.equal(r.options.program, '/mnt/c/Windows/System32/OpenSSH/ssh.exe');
  assert.equal(r.options.knownHostsFile, OUR_PIN);
  assert.deepEqual(w.translated, []);
  assert.deepEqual(w.materialised, [KEY]);
  assert.equal(r.platform, 'linux');
  assert.equal(w.warnings.length, 1);
  assert.match(w.warnings[0], /binds on WINDOWS/);
});

test('the order of the awaits: PIN, then host key, then translation', async () => {
  const trace: string[] = [];
  const w = world({
    source: STORED,
    options: { knownHostsFile: OUR_PIN },
    duringLookup: () => trace.push('lookup'),
    duringHostKey: () => trace.push('hostKey'),
    duringTranslate: () => trace.push('translate'),
  });

  ready(await w.seam.prepareSshSession('a1', entity(), { ...base, agentServesKey: true, remote: WSL_READY }));

  assert.deepEqual(trace, ['lookup', 'hostKey', 'translate']);
});

test('ready has exactly its contract’s keys and no command line', async () => {
  const w = world({ source: STORED, options: OPTIONS });

  const r = ready(await w.seam.prepareSshSession('a1', entity(), base));

  assert.deepEqual(Object.keys(r).sort(), [
    'acceptNew',
    'cleanup',
    'entity',
    'env',
    'jump',
    'kind',
    'materializedKeyPath',
    'options',
    'platform',
    'prefix',
    'snapshot',
    'target',
  ]);
});

test('cleanup never deletes a known_hosts file outside our directory', async () => {
  const w = world({ source: STORED, options: { knownHostsFile: '/home/someone/.ssh/known_hosts-e1' } });
  const r = ready(await w.seam.prepareSshSession('a1', entity(), base));

  r.cleanup();

  assert.deepEqual(w.forgotten, [KEY]);
});

test('the local window with no ssh client: the install offer carries the gate, nothing else happens', async () => {
  const startGate = new AbortController().signal;
  const w = world({ source: STORED, options: OPTIONS, sshMissing: true });

  const p = await w.seam.prepareSshSession('a1', entity(), { ...base, startGate });

  assert.equal(p.kind, 'stopped');
  assert.equal((p as { why: string }).why, 'ssh-client-missing');
  assert.deepEqual(w.installOffers, [{ tool: 'ssh', startGate }]);
  assert.deepEqual(w.openers, []);
});

test('ReadySsh is assignable to S2’s PreparedForTyping with no adapter', async () => {
  const w = world({ source: STORED, options: OPTIONS });

  const r = ready(await w.seam.prepareSshSession('a1', entity(), base));
  // The compile-time pin: S2's `PreparedForTyping` (`remoteLaunch.ts`, E1.S2 spec §S2.2, amended) takes `ReadySsh` as it is.
  const typed: PreparedForTyping = r;

  assert.equal(typed.entity, r.entity);
  assert.equal(typed.prefix, undefined);
});

test('T20: two isolated prepares of one SSH entry write four distinct files; cleaning the second leaves the first', async () => {
  const dir = path.dirname(OUR_PIN);
  const w = world({
    source: STORED,
    pinFor: (suffix) => ({ knownHostsFile: `${dir}/known_hosts-e1${suffix === undefined ? '' : `-${suffix}`}` }),
  });
  const isolated = { ...base, isolate: true };

  const first = ready(await w.seam.prepareSshSession('a1', entity(), isolated));
  const second = ready(await w.seam.prepareSshSession('a1', entity(), isolated));

  const files = [
    first.materializedKeyPath,
    first.options.knownHostsFile,
    second.materializedKeyPath,
    second.options.knownHostsFile,
  ];
  assert.ok(files.every((f) => f !== undefined));
  assert.equal(new Set(files).size, 4, `four distinct files: ${files.join(', ')}`);
  assert.match(first.materializedKeyPath as string, /\/k1-[0-9a-f-]{36}\.key$/);
  assert.match(first.options.knownHostsFile as string, /known_hosts-e1-[0-9a-f-]{36}$/);
  assert.notEqual(w.pinSuffixes[0], w.pinSuffixes[1]);

  second.cleanup();

  assert.deepEqual(w.forgotten, [second.materializedKeyPath, second.options.knownHostsFile]);
  first.cleanup();
  assert.equal(w.forgotten.length, 4);
});

test('T21: a non-isolated prepare writes today’s names', async () => {
  const w = world({ source: STORED, options: { knownHostsFile: OUR_PIN } });

  const r = ready(await w.seam.prepareSshSession('a1', entity(), base));

  assert.equal(r.materializedKeyPath, KEY);
  assert.equal(r.options.knownHostsFile, OUR_PIN);
  assert.deepEqual(w.pinSuffixes, [undefined], 'no suffix asked of the known_hosts writer');
});
