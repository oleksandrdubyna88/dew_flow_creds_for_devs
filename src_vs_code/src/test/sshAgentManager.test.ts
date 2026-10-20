import { requestTimeLine } from '../requestTime';
import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { ALLOW_ONCE, ALLOW_WINDOW, CONSENT_TIMEOUT_MS, DENY, SIGNING_BUTTONS } from '../agentConsent';
import { EntityMetadata, TreeNode } from '../types';
import { describeServerLine, describeSignRequest, encodeString } from '../sshAgentProtocol';
import {
  FakeServer,
  KEY_ID,
  assertNoKeyMaterialLogged,
  keyEntity,
  manager,
  realPrivateKey,
  unanswered,
  world,
} from './sshAgentWorld';
import { HOSTBOUND_METHOD, userauth } from './sshUserauth';

/**
 * The editor's half of the SSH agent (audit A3).
 *
 * <p>The feature's entire claim is that key material lives in this object's memory and nowhere
 * else — no file with mode 0600 to be read, copied, or left behind by a crash — and that every
 * signature is answered by a human. So the tests worth having are about the gate and the
 * lifetime: a key that cannot be served says WHY, an unloaded key takes its material with it,
 * a dismissed dialog refuses that one signature and remembers nothing, and `SSH_AUTH_SOCK`
 * appears only while there is something to serve.</p>
 *
 * <p>`agentConsent.ts` decides what an answer MEANS and is tested there. What is only true
 * here is that the decision is applied — the presence signal fired, the ten-minute window
 * remembered per key, and the window never surviving the key it belongs to.</p>
 *
 * <p>The world — the stub socket server, the `vscode` spy, the temp storage — is `sshAgentWorld.ts`.</p>
 */

test('a key with nothing stored is refused with an instruction, not "could not load"', async () => {
  // Every reason `parseSshPrivateKey` gives is actionable; "could not load the key" is not.
  const w = world({});
  const { instance } = manager(w, { keys: { [KEY_ID]: undefined } });

  const result = await instance.load('a1', keyEntity(KEY_ID, 'prod'));

  assert.equal(result.ok, false);
  assert.match(result.ok ? '' : result.reason, /no private key stored/);
  assert.match(result.ok ? '' : result.reason, /key file \(which the agent cannot serve\)/);
});

test('an unparseable key names the parse failure rather than swallowing it', async () => {
  const w = world({});
  const { instance } = manager(w, { keys: { [KEY_ID]: 'not a key at all' } });

  const result = await instance.load('a1', keyEntity(KEY_ID, 'prod'));

  assert.equal(result.ok, false);
  assert.match(result.ok ? '' : result.reason, /cannot be served/);
});

test('a real key loads, is served, and SSH_AUTH_SOCK appears for every later terminal', async () => {
  const w = world({});
  const { instance, dir } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });

  const result = await instance.load('a1', keyEntity(KEY_ID, 'prod'));

  assert.equal(result.ok, true);
  assert.match(result.ok ? result.fingerprint : '', /^SHA256:/);
  assert.equal(instance.isLoaded(KEY_ID), true);
  assert.equal(w.env.SSH_AUTH_SOCK, path.join(dir, 'agent-' + String(process.pid) + '.sock'));
  assert.match(w.envDescription, /CredsForDevs/);
});

test('unloading a key takes its material AND its allow-window with it', async () => {
  // A ten-minute allowance that outlived the key would apply to whatever was loaded next
  // under the same entity id.
  const w = world({ answers: [ALLOW_WINDOW] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  const gate = w.server() as FakeServer;
  const key = { entityId: KEY_ID, name: 'prod', fingerprint: 'SHA256:x' };
  await gate.confirm(key, { kind: 'auth' });

  assert.equal(instance.unload(KEY_ID), true);
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  w.answers = [DENY];
  const allowedAgain = await (w.server() as FakeServer).confirm(key, { kind: 'auth' });

  assert.equal(allowedAgain, false, 'the window did not survive the unload');
});

test('unloading the LAST key stops the agent and removes SSH_AUTH_SOCK', async () => {
  // Leaving the variable pointing at a dead socket makes every later `ssh` hang instead of
  // falling back to its own key.
  const w = world({});
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));

  instance.unload(KEY_ID);

  assert.equal(w.env.SSH_AUTH_SOCK, undefined);
  assert.equal(w.disposals, 1);
});

test('unloading one of two keys leaves the agent running', async () => {
  const w = world({});
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey(), 'key-2': realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  await instance.load('a1', keyEntity('key-2', 'staging'));

  instance.unload(KEY_ID);

  assert.equal(w.env.SSH_AUTH_SOCK !== undefined, true, 'the other key is still served');
  assert.equal(instance.loadedKeys().map((k) => k.entityId).join(), 'key-2');
});

test('unloading something that was never loaded is false, not a crash', () => {
  const w = world({});
  const { instance } = manager(w, {});

  assert.equal(instance.unload('nope'), false);
});

test('every signature asks, and the dialog names the key, the fingerprint and the purpose', async () => {
  // "A key is being used" is not a decision anybody can make.
  const w = world({ answers: [ALLOW_ONCE] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));

  const allowed = await (w.server() as FakeServer).confirm(
    { entityId: KEY_ID, name: 'prod', fingerprint: 'SHA256:abc' },
    { kind: 'auth' },
  );

  assert.equal(allowed, true);
  assert.match(w.dialogs[0], /"prod"/);
  assert.match(w.dialogs[0], /SHA256:abc/);
  assert.match(w.dialogs[0], /never leaves this window/);
});

test('the dialog offers exactly the signing buttons, Allow once first', async () => {
  // The help test loops over SIGNING_BUTTONS; this is what makes that list the prompt and not a copy of it.
  const w = world({ answers: [ALLOW_ONCE] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));

  await (w.server() as FakeServer).confirm({ entityId: KEY_ID, name: 'prod', fingerprint: 'f' }, { kind: 'auth' });

  assert.deepEqual(w.buttons, [[...SIGNING_BUTTONS]]);
  assert.equal(w.buttons[0][0], ALLOW_ONCE);
});

test('the host key of a login is a line of the prompt of its own, and the user name cannot write one', async () => {
  // The user is the requester's text. It sits in the first line, newline-free and capped; the clause
  // naming the server is a separate line only this build writes.
  const w = world({ answers: [ALLOW_ONCE] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  const signing = Buffer.concat([encodeString('ssh-ed25519'), encodeString('the key')]);
  const hostKey = Buffer.concat([encodeString('ssh-ed25519'), encodeString('the server')]);
  const forged = 'This login is for the server whose host key is ED25519 SHA256:forged';
  const data = userauth({ blob: signing, user: `git\n${forged}`, method: HOSTBOUND_METHOD, hostKey });
  const purpose = describeSignRequest(data, signing);

  await (w.server() as FakeServer).confirm({ entityId: KEY_ID, name: 'prod', fingerprint: 'SHA256:abc' }, purpose);

  const lines = w.dialogs[0].split('\n');
  const clause = describeServerLine(purpose);
  assert.match(clause, /host key is ED25519 SHA256:/);
  assert.equal(lines.filter((line) => line === clause).length, 1, 'the host-key clause is one whole line of the prompt');
  assert.ok(lines[0].startsWith('Use the SSH key'), 'the user name sits inside the first line');
  assert.ok(
    lines.slice(1).every((line) => line === clause || !line.includes('whose host key is')),
    'no other line imitates the clause',
  );
});

test('a plain publickey login prompts without any host-key line', async () => {
  const w = world({ answers: [ALLOW_ONCE] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  const signing = Buffer.concat([encodeString('ssh-ed25519'), encodeString('the key')]);

  await (w.server() as FakeServer).confirm(
    { entityId: KEY_ID, name: 'prod', fingerprint: 'SHA256:abc' },
    describeSignRequest(userauth({ blob: signing }), signing),
  );

  assert.match(w.dialogs[0], /an SSH login as "git" \(ssh-connection\)\?/);
  assert.ok(!w.dialogs[0].includes('host key'), w.dialogs[0]);
});

test('the prompt says WHEN the signature was asked for, on its second line (#131 tail)', async () => {
  // A stopped clock, so the assertion is exact (testing.md: a test about time freezes the clock the
  // code reads). The prompt refuses after CONSENT_TIMEOUT_MS; the time says how stale it is.
  const asked = new Date(Date.UTC(2026, 8, 24, 9, 30, 0));
  const w = world({ answers: [ALLOW_ONCE] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() }, clock: () => asked });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));

  await (w.server() as FakeServer).confirm({ entityId: KEY_ID, name: 'prod', fingerprint: 'SHA256:abc' }, { kind: 'auth' });

  const [question, when, blank] = w.dialogs[0].split('\n');
  assert.match(question, /^Use the SSH key "prod" to sign .*\?$/);
  assert.equal(when, requestTimeLine(asked.getTime(), -asked.getTimezoneOffset()));
  assert.equal(blank, '', 'a blank line still separates the head from the fingerprint');
});

test('the ten-minute window starts at the CLICK, not when the prompt was raised', async () => {
  // agentConsent.ts: "ten minutes from that moment". The prompt's time and the window's start are
  // two facts on purpose; anchoring the window at the request would hand someone who answers a
  // fifteen-minute-old prompt a window that has already closed.
  const MIN = 60_000;
  let now = Date.UTC(2026, 8, 24, 9, 0, 0);
  const w = world({ answers: [ALLOW_WINDOW, ALLOW_ONCE] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() }, clock: () => new Date(now) });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  const key = { entityId: KEY_ID, name: 'prod', fingerprint: 'SHA256:abc' };
  const server = w.server() as FakeServer;

  const answered = server.confirm(key, { kind: 'auth' });
  now += 15 * MIN; // the prompt sat for fifteen minutes before "Allow for 10 minutes"
  await answered;

  now += 9 * MIN;
  await server.confirm(key, { kind: 'auth' });
  assert.equal(w.dialogs.length, 1, 'nine minutes after the click is inside the window');
  now += 2 * MIN;
  await server.confirm(key, { kind: 'auth' });
  assert.equal(w.dialogs.length, 2, 'eleven minutes after the click asks again');
});


test('an unanswered signing prompt is refused after the consent timeout, and says so', async () => {
  // It never expired: a prompt found an hour later still signed, and the ssh or git that asked
  // waited forever. The broker's modal has refused after five minutes since it shipped.
  const modal = unanswered();
  const w = world({ answers: [modal.answer] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() }, consentTimeoutMs: 20 });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));

  const allowed = await (w.server() as FakeServer).confirm({ entityId: KEY_ID, name: 'prod', fingerprint: 'SHA256:abc' }, { kind: 'auth' });

  assert.equal(allowed, false);
  assert.equal(w.presence, 0, 'nobody answered: that is not presence');
  assert.ok(w.logs.some((line) => /no answer .*refused/i.test(line)), w.logs.join('\n'));
});

test('a click AFTER the timeout changes nothing — a late ten-minute Allow opens no window', async () => {
  const modal = unanswered();
  const w = world({ answers: [modal.answer, ALLOW_ONCE] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() }, consentTimeoutMs: 20 });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  const key = { entityId: KEY_ID, name: 'prod', fingerprint: 'SHA256:abc' };
  const server = w.server() as FakeServer;

  assert.equal(await server.confirm(key, { kind: 'auth' }), false);
  modal.clickLate(ALLOW_WINDOW); // VS Code cannot close a modal, so it can still be clicked
  await new Promise((resolve) => setImmediate(resolve));

  await server.confirm(key, { kind: 'auth' });
  assert.equal(w.dialogs.length, 2, 'the late Allow opened no window: the next signature asked again');
  assert.equal(w.presence, 1, 'only the answered second dialog counts as presence');
});

test('a modal that REJECTS (the window closing under it) is a refusal, not a crash', async () => {
  // Handled at once, so a load that one day awaits real I/O cannot turn it into an unhandled rejection.
  const closing = Promise.reject(new Error('the window is closing'));
  closing.catch(() => undefined);
  const w = world({ answers: [closing] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() }, consentTimeoutMs: 1000 });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));

  const allowed = await (w.server() as FakeServer).confirm({ entityId: KEY_ID, name: 'prod', fingerprint: 'SHA256:abc' }, { kind: 'auth' });

  assert.equal(allowed, false);
  assert.equal(w.logs.some((line) => /no answer/.test(line)), false, 'a rejection is not a timeout');
  assert.ok(w.logs.some((line) => /the window is closing/.test(line)), 'but it is said, not swallowed');
});

test('a bound under a minute is said in seconds, never "0 minutes"', async () => {
  const w = world({ answers: [ALLOW_ONCE] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() }, consentTimeoutMs: 20 });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));

  await (w.server() as FakeServer).confirm({ entityId: KEY_ID, name: 'prod', fingerprint: 'SHA256:abc' }, { kind: 'auth' });

  assert.match(w.dialogs[0], /Unanswered, it is refused after 1 second\./);
});

test('the prompt states its deadline, derived from the same constant the broker uses', async () => {
  const w = world({ answers: [ALLOW_ONCE] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));

  await (w.server() as FakeServer).confirm({ entityId: KEY_ID, name: 'prod', fingerprint: 'SHA256:abc' }, { kind: 'auth' });

  assert.equal(CONSENT_TIMEOUT_MS, 5 * 60_000);
  assert.match(w.dialogs[0], /Unanswered, it is refused after 5 minutes\./);
});

test('answering a dialog is the one provable moment of human presence', async () => {
  const w = world({ answers: [ALLOW_ONCE] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));

  await (w.server() as FakeServer).confirm({ entityId: KEY_ID, name: 'prod', fingerprint: 'f' }, { kind: 'auth' });

  assert.equal(w.presence, 1);
});

test('"allow once" is exactly once — the next signature asks again', async () => {
  const w = world({ answers: [ALLOW_ONCE, ALLOW_ONCE] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  const gate = w.server() as FakeServer;
  const key = { entityId: KEY_ID, name: 'prod', fingerprint: 'f' };

  await gate.confirm(key, { kind: 'auth' });
  await gate.confirm(key, { kind: 'auth' });

  assert.equal(w.dialogs.length, 2);
});

test('the ten-minute window covers the SECOND use without a dialog', async () => {
  // `git push` signs and authenticates in one breath; two modals per push teaches people to
  // click without reading, which is worse than one they actually see.
  const w = world({ answers: [ALLOW_WINDOW] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  const gate = w.server() as FakeServer;
  const key = { entityId: KEY_ID, name: 'prod', fingerprint: 'f' };

  await gate.confirm(key, { kind: 'auth' });
  const second = await gate.confirm(key, { kind: 'gitCommit' });

  assert.equal(second, true);
  assert.equal(w.dialogs.length, 1, 'one dialog covered both halves of the push');
});

test('the window is per KEY — it never covers a different one', async () => {
  const w = world({ answers: [ALLOW_WINDOW, DENY] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey(), 'key-2': realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  await instance.load('a1', keyEntity('key-2', 'staging'));
  const gate = w.server() as FakeServer;

  await gate.confirm({ entityId: KEY_ID, name: 'prod', fingerprint: 'f' }, { kind: 'auth' });
  const other = await gate.confirm({ entityId: 'key-2', name: 'staging', fingerprint: 'g' }, { kind: 'auth' });

  assert.equal(other, false, 'allowing one key allowed nothing else');
});

test('a DISMISSED dialog refuses this signature and remembers nothing', async () => {
  // The same rule the broker's consent follows: a mis-click must not lock a key out for the
  // window's life, and must not silently allow anything either.
  const w = world({ answers: [undefined, ALLOW_ONCE] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  const gate = w.server() as FakeServer;
  const key = { entityId: KEY_ID, name: 'prod', fingerprint: 'f' };

  assert.equal(await gate.confirm(key, { kind: 'auth' }), false);
  assert.equal(await gate.confirm(key, { kind: 'auth' }), true, 'and the next use is asked, not refused');
  assert.equal(w.presence, 1, 'a dismissal proves nobody was there');
});

test('an explicit Deny refuses without remembering a refusal either', async () => {
  const w = world({ answers: [DENY, ALLOW_ONCE] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  const gate = w.server() as FakeServer;
  const key = { entityId: KEY_ID, name: 'prod', fingerprint: 'f' };

  assert.equal(await gate.confirm(key, { kind: 'auth' }), false);
  assert.equal(await gate.confirm(key, { kind: 'auth' }), true);
});

function node(id: string, sshAgent: boolean, extra: Partial<EntityMetadata> = {}): TreeNode {
  return {
    id,
    name: id,
    type: 'entity',
    details: { id, name: id, kind: 'sshkey', sshAgent, ...extra },
  } as TreeNode;
}

test('loadMarked loads only the entities that ask to be served', async () => {
  const w = world({});
  const { instance } = manager(w, {
    keys: { wanted: realPrivateKey(), unwanted: realPrivateKey() },
    nodes: [node('wanted', true), node('unwanted', false)],
  });

  assert.equal(await instance.loadMarked(), 1);
  assert.equal(instance.isLoaded('unwanted'), false);
});

test('a marked key that cannot be loaded is logged ONCE, never a modal at every window start', async () => {
  // A key that stopped being loadable would otherwise open a dialog on every single startup.
  const w = world({});
  const { instance } = manager(w, {
    keys: { broken: 'not a key' },
    nodes: [node('broken', true)],
  });

  assert.equal(await instance.loadMarked(), 0);
  assert.deepEqual(w.dialogs, []);
  assert.ok(w.logs.some((l) => /could not load "broken"/.test(l)), w.logs.join(' | '));
});

test('loadMarked does not reload what is already loaded', async () => {
  const w = world({});
  const { instance } = manager(w, {
    keys: { wanted: realPrivateKey() },
    nodes: [node('wanted', true)],
  });
  await instance.loadMarked();

  assert.equal(await instance.loadMarked(), 0, 'a sync does not re-add every key');
  assert.equal(instance.loadedKeys().length, 1);
});

test('an SSH entity pointing at a loaded KEY entity is served by the agent', async () => {
  // This is what decides whether Connect writes the key to disk or lets the agent answer.
  const w = world({});
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));

  const sshEntity = { id: 'ssh-1', name: 'host', type: 'entity', details: { id: 'ssh-1', sshKeyEntityId: KEY_ID } } as TreeNode;
  assert.equal(instance.servesKeyFor(sshEntity), true);
});

test('an entity with no details at all is not served', () => {
  const w = world({});
  const { instance } = manager(w, {});

  assert.equal(instance.servesKeyFor({ id: 'x', name: 'x', type: 'folder' } as TreeNode), false);
});

test('disposing drops every key — that is the whole revocation story', async () => {
  const w = world({});
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));

  instance.dispose();

  assert.deepEqual(instance.loadedKeys(), []);
  assert.equal(instance.isLoaded(KEY_ID), false);
  assert.equal(w.disposals, 1, 'and the socket is gone with it');
});

/** The key object the (stub) server holds for the first served key — the thing a late caller would sign with. */
function servedKey(w: { server(): FakeServer | undefined }): { sign(data: Buffer, flags: number): Buffer | undefined } {
  const keys = (w.server() as FakeServer).keys() as { sign(data: Buffer, flags: number): Buffer | undefined }[];
  return keys[0];
}

const SIGNED_BYTES = Buffer.from('bytes a client wants signed');

test('a replaced key object refuses to sign, even with identical public bytes', async () => {
  // I1: a signature is made only by the object that is served NOW. Replacing it revokes the old one by
  // object, so a holder that forgot to ask the server's list cannot sign with a key that was re-added.
  const w = world({});
  const pem = realPrivateKey();
  const { instance } = manager(w, { keys: { [KEY_ID]: pem } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  const old = servedKey(w);

  await instance.load('a1', keyEntity(KEY_ID, 'prod'));

  assert.equal(old.sign(SIGNED_BYTES, 0), undefined, 'the replaced object still signed');
  assert.notEqual(servedKey(w).sign(SIGNED_BYTES, 0), undefined, 'the replacement signs (the guard that the fixture is a real key)');
  assert.ok(w.logs.some((line) => /refused to sign with "prod": the key was removed or replaced/.test(line)), w.logs.join('\n'));
});

test('an unloaded key object refuses to sign', async () => {
  const w = world({});
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  const served = servedKey(w);
  assert.notEqual(served.sign(SIGNED_BYTES, 0), undefined, 'signs while it is loaded');

  instance.unload(KEY_ID);

  assert.equal(served.sign(SIGNED_BYTES, 0), undefined, 'the unloaded object still signed');
});

test("a disposed manager's key objects refuse to sign", async () => {
  const w = world({});
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  const served = servedKey(w);

  instance.dispose();

  assert.equal(served.sign(SIGNED_BYTES, 0), undefined, 'the object outlived its manager');
});

test('nothing this suite logged carries key material', () => {
  // The last test of the file: every captured log, against every key the file loaded.
  assertNoKeyMaterialLogged();
});
