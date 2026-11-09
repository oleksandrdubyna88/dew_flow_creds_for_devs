import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUSY_PLACE } from '../aliasThrottle';
import type { McpFolderHooks } from '../brokerFolderDoor';
import { CONSENT_TIMED_OUT_ON_PLACE } from '../brokerProtocol';
import { GRANT_NOT_ALLOWED } from '../brokerRequests';
import { Reply, code, message, pause } from './bridgeDoorHarness';
import { ACCOUNT, Ask, Door, WallWorld, answeredAtOnce, send, settleAll, until, viaMain, wallWorld } from './bridgeWallWorld';
import { World, share, world as brokerWorld } from './brokerWorld';

/**
 * The fix-forward of epoch 8 for E1.5 (spec A8.2): the late-answer words (F2), a modal that cannot open (F3), the folder verbs' timeout
 * sentence (F7). The place that outlives a request (F1) is in `consentContractVpn.test.ts`; the sentences are pinned as literals here, so a
 * change of the constant fails a test that does not import it.
 */

const LATE_NOTICE = 'That request had already ended, so this answer changed nothing.';
const late = (button: string): string => `"${button}" answered after its call had ended; the answer changed nothing`;

const alias = (command = 'id'): Ask => ({ path: '/v1/alias/exec', body: { alias: 'one', command } });
const tokenAsk = async (ww: WallWorld): Promise<Ask> => ({ path: '/v1/use/exec', token: await ww.tokenFor(ACCOUNT, 'e1', 'prod'), body: { command: 'id' } });
const ignoredLines = (audit: string[]): string[] => audit.filter((line) => line.includes('→ ignored'));

/* ---------------------------------------------------------------------------------------------------------------
 * F2c — two dialogs on one local token: the notice is still true when the next call is not asked
 * ------------------------------------------------------------------------------------------------------------- */

test('F2c: a late Deny on the older of two dialogs of one local token changes nothing, and the next call is NOT asked — the notice promises nothing about it', async () => {
  const ww = await wallWorld({ holdDialogs: true, consentTimeoutMs: 100 });
  try {
    const token = await tokenAsk(ww);
    assert.equal((await send(viaMain(ww), token)).status, 504, 'the first call timed out; its dialog stands');
    const second = send(viaMain(ww), token);
    await until(() => ww.w.openDialogs.length === 2, 'the second dialog of the same token, beside the standing one');
    ww.w.openDialogs[1]('Allow');
    assert.equal((await second).status, 200, 'the newer dialog Allowed: the second call ran');
    ww.w.openDialogs[0]('Deny');
    await until(() => ignoredLines(ww.w.audit).length === 1, 'the late Deny to be written');
    assert.ok(ignoredLines(ww.w.audit)[0].includes(late('Deny')), ignoredLines(ww.w.audit)[0]);
    assert.equal(ww.w.audit.filter((line) => line.includes('DENIED')).length, 0, 'no tombstone');
    assert.deepEqual(ww.w.notices, [LATE_NOTICE]);
    const dialogs = ww.w.dialogs.length;
    const third = await send(viaMain(ww), token);
    assert.equal(third.status, 200, third.body);
    assert.equal(ww.w.dialogs.length, dialogs, 'the third call was not asked: the grant is allowed');
    assert.equal(ww.w.ran.length, 2, 'and it ran');
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * F2d — a policy turned to never-ask while the dialog stands
 * ------------------------------------------------------------------------------------------------------------- */

test('F2d: a policy turned to never-ask while a dialog stands — the late Allow changes nothing, and the next call is not asked either', async () => {
  let policy: 'every12h' | 'never' = 'every12h';
  const w = brokerWorld({
    holdDialogs: true,
    consentTimeoutMs: 100,
    mcpResolve: (id) =>
      id === 'e1'
        ? { kind: 'usable', target: { accountId: 'a1', entityId: 'e1', entityName: 'prod', kind: 'ssh' }, preConsented: policy === 'never', rungs: 'r', remembers: false }
        : undefined,
  } as Parameters<typeof brokerWorld>[0]);
  try {
    const { port } = await share(w);
    const door: Door = { port, headers: { Host: `127.0.0.1:${port}` } };
    const ask: Ask = { path: '/v1/mcp/use/exec', body: { entry: 'e1', command: 'id' } };
    assert.equal((await send(door, ask)).status, 504, 'asked, and nobody answered');
    policy = 'never';
    w.openDialogs[0]('Allow');
    await until(() => ignoredLines(w.audit).length === 1, 'the late Allow to be written');
    assert.ok(ignoredLines(w.audit)[0].includes(late('Allow')));
    assert.equal(w.audit.filter((line) => line.includes('ALLOWED')).length, 0);
    assert.deepEqual(w.notices, [LATE_NOTICE]);
    const dialogs = w.dialogs.length;
    assert.equal((await send(door, ask)).status, 200, 'the second call ran');
    assert.equal(w.dialogs.length, dialogs, 'and was not asked');
    assert.ok(w.audit.some((line) => line.includes('allowed without a prompt')), 'it is the policy that let it through');
  } finally {
    w.openDialogs.forEach((answer) => answer('Deny'));
    w.server.dispose();
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * F3a — a modal that cannot open frees the place
 * ------------------------------------------------------------------------------------------------------------- */

test('F3a: a modal that throws synchronously is a dismissal — 504 with the grant sentence, nothing recorded, nothing unhandled — and the next call is asked', async () => {
  const escaped: unknown[] = [];
  const spy = (reason: unknown): void => void escaped.push(reason);
  process.on('unhandledRejection', spy);
  const ww = await wallWorld({ holdDialogs: true, throwDialogs: 1 });
  try {
    const first = await send(viaMain(ww), alias());
    assert.deepEqual([first.status, code(first), message(first)], [504, 'consent_timeout', GRANT_NOT_ALLOWED]);
    assert.equal(ww.w.dialogs.length, 0, 'no dialog opened');
    assert.deepEqual(ignoredLines(ww.w.audit), []);
    assert.deepEqual(ww.w.notices, []);
    assert.equal(ww.w.presence, 0);
    const second = send(viaMain(ww), alias());
    await until(() => ww.w.openDialogs.length === 1, 'the second call to be asked: the place was freed');
    assert.equal(ww.w.dialogs.length, 1);
    ww.w.openDialogs[0]('Allow');
    assert.equal((await second).status, 200);
    await pause(30);
    assert.deepEqual(escaped, [], 'nothing escaped as an unhandled rejection');
  } finally {
    process.off('unhandledRejection', spy);
    settleAll(ww);
    ww.dispose();
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * F7a — a folder verb's timeout sentence (a guard: the code was built before this test)
 * ------------------------------------------------------------------------------------------------------------- */

const FOLDER_HOOKS: McpFolderHooks = {
  list: () => [],
  choose: () => ({ ok: true, target: { accountId: 'a1', entityId: 'f1', entityName: 'Servers', kind: 'folder' }, summary: 'staging in "Servers"', edit: {} }),
  create: () => Promise.resolve({ id: 'f2', name: 'staging' }),
  edit: () => Promise.resolve(true),
  remove: () => Promise.resolve(true),
};

const folderAsk: Ask = { path: '/v1/mcp/folder/create', body: { name: 'staging', parent: 'f1' } };

async function folderWorld(timeoutMs?: number): Promise<{ w: World; door: Door }> {
  const w = brokerWorld({ holdDialogs: true, consentTimeoutMs: timeoutMs, alias: { accountId: 'a1', entityId: 'e1', entityName: 'prod', kind: 'ssh' }, mcpUse: 'usable' });
  w.server.setFolderHooks(FOLDER_HOOKS);
  const { port } = await share(w);
  return { w, door: { port, headers: { Host: `127.0.0.1:${port}` } } };
}

const busy = async (door: Door, ask: Ask, what: string): Promise<void> => {
  const refused: Reply = await answeredAtOnce(send(door, ask), `${what}: not answered at once`);
  assert.deepEqual([refused.status, message(refused)], [429, BUSY_PLACE], what);
};

test('F7a: a timed-out folder verb hears the place clause, and the place is held; a dismissed one is answered as before and the next call is asked', async () => {
  const slow = await folderWorld(100);
  try {
    const reply = await send(slow.door, folderAsk);
    assert.deepEqual([reply.status, code(reply), message(reply)], [504, 'consent_timeout', CONSENT_TIMED_OUT_ON_PLACE]);
    assert.equal(slow.w.dialogs.length, 1);
    await busy(slow.door, { path: '/v1/alias/exec', body: { alias: 'prod', command: 'id' } }, 'a local alias call');
    await busy(slow.door, folderAsk, 'a second folder call');
  } finally {
    slow.w.openDialogs.forEach((answer) => answer('Deny'));
    slow.w.server.dispose();
  }
  const escaped = await folderWorld();
  try {
    const pending = send(escaped.door, folderAsk);
    await until(() => escaped.w.openDialogs.length === 1, 'the folder verb\'s dialog');
    escaped.w.openDialogs[0](undefined);
    const reply = await pending;
    assert.deepEqual([reply.status, code(reply), message(reply)], [504, 'consent_timeout', 'The human did not allow this.']);
    const next = send(escaped.door, { path: '/v1/alias/exec', body: { alias: 'prod', command: 'id' } });
    await until(() => escaped.w.openDialogs.length === 2, 'the next call to be asked');
    escaped.w.openDialogs[1]('Allow');
    assert.equal((await next).status, 200);
  } finally {
    escaped.w.openDialogs.forEach((answer) => answer('Deny'));
    escaped.w.server.dispose();
  }
});
