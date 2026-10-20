import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FakeServer,
  KEY_ID,
  assertNoKeyMaterialLogged,
  keyEntity,
  keyMaterialIn,
  manager,
  realPrivateKey,
  unanswered,
  world,
} from './sshAgentWorld';

/**
 * What the SSH agent writes to its log, and when it must write nothing (#197, the E1.2 review).
 *
 * <p>The log is the person's only record of what the agent signed, so two things about it are
 * guarantees rather than details: one call is one line whatever the key is called (a name is free
 * text — imports and shares set it), and a window that is closing writes nothing to a channel that is
 * already gone, because a throw there escapes into a handler nobody awaits.</p>
 */

const KEY = { entityId: KEY_ID, name: 'prod', fingerprint: 'SHA256:abc' };

/** A prompt left open while the window closes — and the confirm waiting on it. */
async function promptOpenAcrossDispose(consentTimeoutMs: number): Promise<{
  modal: ReturnType<typeof unanswered>;
  w: ReturnType<typeof world>;
  pending: Promise<boolean>;
  logsAtDispose: number;
}> {
  const modal = unanswered();
  const w = world({ answers: [modal.answer] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() }, consentTimeoutMs });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  const pending = (w.server() as FakeServer).confirm(KEY, { kind: 'auth' });
  instance.dispose();
  return { modal, w, pending, logsAtDispose: w.logs.length };
}

test('a prompt that runs out of time after the window closed refuses and writes nothing', async () => {
  const { w, pending, logsAtDispose } = await promptOpenAcrossDispose(20);

  assert.equal(await pending, false);
  assert.equal(w.logs.length, logsAtDispose, 'the timeout wrote into a disposed channel');
});

test('a prompt that FAILS after the window closed refuses and writes nothing', async () => {
  const { modal, w, pending, logsAtDispose } = await promptOpenAcrossDispose(200);

  modal.failLate(new Error('the window is closing'));

  assert.equal(await pending, false);
  assert.equal(w.logs.length, logsAtDispose, 'the failure wrote into a disposed channel');
});

test('an answer that arrives after the window closed does not throw and writes nothing', async () => {
  const { modal, w, pending, logsAtDispose } = await promptOpenAcrossDispose(200);

  modal.clickLate('Allow once');
  await pending;

  assert.equal(w.logs.length, logsAtDispose);
});

test('a key named with line breaks writes one line per log call, never a forged SIGNED line', async () => {
  // The name is free text (an import, a share). Written raw, "x<newline>SIGNED with ..." is two lines in the
  // channel, and the second one reads as the agent's own record of a signature that never happened.
  const w = world({});
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  const name = 'x' + String.fromCharCode(10) + 'SIGNED with "y"' + String.fromCharCode(0x2028) + 'z';

  await instance.load('a1', keyEntity(KEY_ID, name));
  instance.unload(KEY_ID);

  const lines = w.logs.flatMap((entry) => entry.split(/[\n\r\u2028\u2029]/));
  assert.equal(lines.length, w.logs.length, `a name forged lines:\n${lines.join('\n')}`);
});

test('the key-material guard sees a PEM header and the base64 body of a key it was told about', () => {
  const pem = realPrivateKey();
  const body = pem
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('-----'))
    .join('');

  assert.equal(keyMaterialIn(['the key -----BEGIN PRIVATE KEY----- leaked'], []).length, 1);
  assert.equal(keyMaterialIn([`loaded ${body}`], [pem]).length, 1);
  assert.deepEqual(keyMaterialIn(['loaded "prod" (SHA256:abc)'], [pem]), []);
});

test('nothing this suite logged carries key material', () => {
  assertNoKeyMaterialLogged();
});
