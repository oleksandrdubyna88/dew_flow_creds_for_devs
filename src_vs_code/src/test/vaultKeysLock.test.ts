import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALLOW_ONCE, ALLOW_WINDOW } from '../agentConsent';
import { evictAndLock } from '../corpBindingWiring';
import {
  FakeServer,
  KEY_ID,
  SIGNED_BYTES,
  agentEnv,
  agentStorage,
  keyEntity,
  keyMaterialLogged,
  realPrivateKey,
  servedKey,
  storageDir,
  unanswered,
  world,
} from './sshAgentWorld';
import { ACCOUNT, PIN, VaultKeysModule, secretStorage, storePin, vaultWithTwoWraps } from './vaultKeysWorld';

/**
 * Every lock of the vault ends every SSH signing window (#197, E2.1).
 *
 * <p>The three roads to a lock — the idle timer, *Lock Vaults*, a corporate deactivation — all end in
 * `VaultKeys.lock()`, so the guarantee is stated at that one method on a REAL `VaultKeys`, and the manager is
 * the one `wireSshAgent` builds: the wiring itself is under test, not only the helper it calls. Both are loaded
 * into ONE module graph (the world's `also`), because `loadWithVscode` evicts the whole graph on every call
 * and two loads would hand each module its own copy of the other.</p>
 *
 * <p>What a window MEANS is `allowWindows.test.ts`; how the manager gates is `sshAgentManagerWindows.test.ts`.
 * What is only true here is that the lock reaches the agent, ends the windows and nothing else.</p>
 */

type Wiring = typeof import('../sshAgentWiring');

const key = { entityId: KEY_ID, name: 'prod', fingerprint: 'SHA256:abc' };
const login = { kind: 'ssh-login', user: 'me', service: 'ssh-connection' };

/** A real `VaultKeys` and a real manager joined by `wireSshAgent`, with one key loaded and the gate in hand. */
async function rig(options: Parameters<typeof world>[0]): Promise<{
  w: ReturnType<typeof world>;
  vaultKeys: InstanceType<VaultKeysModule['VaultKeys']>;
  agent: ReturnType<Wiring['wireSshAgent']>;
  context: { subscriptions: { dispose(): unknown }[] };
  gate: FakeServer;
  /** The tree, as `wireSshAgent` is handed it: counts the repaints and holds the row-text hook the wiring assigns. */
  provider: { refreshes: number; refresh(): void; signWindowLabel(accountId: string, nodeId: string): string };
}> {
  const w = world({ ...options, also: ['../vaultKeys', '../sshAgentWiring'] });
  const [keysModule, wiring] = w.modules as [VaultKeysModule, Wiring];
  const vaultKeys = new keysModule.VaultKeys(secretStorage(new Map()));
  const context = { subscriptions: [] as { dispose(): unknown }[] };
  const provider = {
    refreshes: 0,
    refresh(): void {
      provider.refreshes += 1;
    },
    signWindowLabel: (_accountId: string, _nodeId: string): string => '',
  };
  const agent = wiring.wireSshAgent({
    context,
    storage: agentStorage({ keys: { [KEY_ID]: realPrivateKey() } }) as never,
    storageDir: storageDir(),
    envCollection: agentEnv(w) as never,
    // The real `VaultKeys`, with its presence signal counted on the world: `wireSshAgent` hands the manager
    // `vaultKeys.noteUserActivity` as the moment a human answered.
    vaultKeys: {
      onDidLock: vaultKeys.onDidLock,
      noteUserActivity: () => {
        w.presence += 1;
        vaultKeys.noteUserActivity();
      },
    },
    provider,
    onAddress: () => undefined,
  });
  await agent.load('a1', keyEntity(KEY_ID, 'prod'));
  return { w, vaultKeys, agent, context, gate: w.server() as FakeServer, provider };
}

test('every lock ends the SSH windows: Lock Vaults and the idle timer, through VaultKeys.lock()', async () => {
  const { w, vaultKeys, gate } = await rig({ answers: [ALLOW_WINDOW, ALLOW_ONCE] });
  await gate.confirm(key, login);
  assert.equal(await gate.confirm(key, login), true, 'the window covers the second signature');
  assert.equal(w.dialogs.length, 1, 'and it is covered without a dialog (the guard that a window was open)');

  vaultKeys.lock();
  await gate.confirm(key, login);

  assert.equal(w.dialogs.length, 2, 'the lock left the window open');
});

test('corporate deactivation ends the windows too: evictAndLock(vaultKeys)(account)', async () => {
  // Deactivation calls `lock()` directly and skips the command's own steps — it must not skip this one.
  const { w, vaultKeys, gate } = await rig({ answers: [ALLOW_WINDOW, ALLOW_ONCE] });
  await gate.confirm(key, login);

  evictAndLock(vaultKeys)(ACCOUNT);
  await gate.confirm(key, login);

  assert.equal(w.dialogs.length, 2, 'the deactivation left the window open');
});

test('a second lock listener does not displace the agent', async () => {
  // The reason `onDidLock` is multicast: a settable callback would let the next subsystem replace this one.
  const { w, vaultKeys, gate } = await rig({ answers: [ALLOW_WINDOW, ALLOW_ONCE] });
  const heard: string[] = [];
  vaultKeys.onDidLock(() => heard.push('other subsystem'));
  await gate.confirm(key, login);

  vaultKeys.lock();
  await gate.confirm(key, login);

  assert.equal(heard.length, 1, 'the other listener was not told');
  assert.equal(w.dialogs.length, 2, 'the agent was displaced by the other listener');
});

test('a lock ends windows and never unloads or revokes a key', async () => {
  // R8: the key stays loaded and signs again after one more answer; only the WINDOW is gone.
  const { w, vaultKeys, agent, gate } = await rig({ answers: [ALLOW_WINDOW, ALLOW_ONCE] });
  await gate.confirm(key, login);
  const captured = servedKey(w);

  vaultKeys.lock();
  assert.equal(await gate.confirm(key, login), true, 'one more answer and it signs');

  assert.equal(agent.isLoaded(KEY_ID), true, 'the key was unloaded');
  assert.ok(Buffer.isBuffer(captured.sign(SIGNED_BYTES, 0)), 'the captured key object was revoked');
  assert.equal(w.dialogs.length, 2, 'the next signature asked again');
});

test('an answer given across a lock signs once and opens no window', async () => {
  // O3 on purpose: the per-use prompt works while locked, so an explicit "Allow" is consent for ONE signature;
  // the WINDOW is what the lock fences. (The information message that says so is E2.3's.)
  const modal = unanswered();
  const { w, vaultKeys, gate } = await rig({ answers: [modal.answer, ALLOW_ONCE] });

  const pending = gate.confirm(key, login);
  vaultKeys.lock();
  modal.clickLate(ALLOW_WINDOW);

  assert.equal(await pending, true, 'the explicit answer allows this one signature');
  await gate.confirm(key, login);
  assert.equal(w.dialogs.length, 2, 'the answer given across the lock opened a window');
});

test('unlocking re-arms nothing: the next signatures still ask, every time', async () => {
  // Guard, green before and after: the unlock opens no window of its own, so each signature asks.
  const { w, vaultKeys, gate } = await rig({ answers: [ALLOW_ONCE, ALLOW_ONCE], typed: PIN });
  await storePin(vaultKeys, PIN);
  vaultKeys.lock();

  const unlocked = await vaultKeys.unlock(ACCOUNT, vaultWithTwoWraps().content, { interactive: true });
  assert.notEqual(unlocked, undefined, 'the fixture really unlocks the vault');
  assert.equal(vaultKeys.isLocked(), false);
  await gate.confirm(key, login);
  await gate.confirm(key, login);

  assert.equal(w.dialogs.length, 2, 'the unlock brought a window back');
});

test('a silent signature is not presence', async () => {
  // I7: only a human answering counts. A signature a window covers is not the person being there.
  const { w, gate } = await rig({ answers: [ALLOW_WINDOW] });
  await gate.confirm(key, login);
  assert.equal(w.presence, 1, 'the answer was presence');

  assert.equal(await gate.confirm(key, login), true);

  assert.equal(w.presence, 1, 'a covered signature counted as presence');
});

test('wireSshAgent puts the manager and the lock subscription into context.subscriptions', async () => {
  const { w, vaultKeys, agent, context, gate } = await rig({ answers: [ALLOW_WINDOW, ALLOW_WINDOW] });
  assert.equal(context.subscriptions.length, 2, 'the manager and the lock link');
  assert.equal(context.subscriptions[0], agent, 'the manager is disposed with the extension');
  await gate.confirm(key, login);

  context.subscriptions[1].dispose();
  vaultKeys.lock();

  assert.equal(await gate.confirm(key, login), true);
  assert.equal(w.dialogs.length, 1, 'the second subscription is not the link to the lock: disposed, the lock still ended the window');
});

/**
 * The row is told to repaint (#197, E2.2): one test per way the book of windows changes, through the manager
 * `wireSshAgent` built and the stub provider it was handed. `onWindowsChanged` is a field the WIRING sets, so a
 * deleted assignment is these five going red, not a tree that shows a window for ten minutes after it ended.
 */
test('the row is told to repaint when a window is granted', async () => {
  const { gate, provider } = await rig({ answers: [ALLOW_WINDOW] });
  const before = provider.refreshes;

  await gate.confirm(key, login);

  assert.ok(provider.refreshes > before, 'a grant did not repaint the row');
});

test('the row is told to repaint when a window expires', async (t) => {
  // Mocked setTimeout and Date: the window runs out at ten minutes on the wall clock, the timer looks every five.
  const { gate, provider } = await rig({ answers: [ALLOW_WINDOW] });
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.UTC(2026, 8, 24, 10, 0, 0) });
  await gate.confirm(key, login);
  const before = provider.refreshes;

  t.mock.timers.tick(5 * 60_000);
  t.mock.timers.tick(5 * 60_000);

  assert.ok(provider.refreshes > before, 'an expired window did not repaint the row');
});

test('the row is told to repaint when the vault locks', async () => {
  const { gate, vaultKeys, provider } = await rig({ answers: [ALLOW_WINDOW] });
  await gate.confirm(key, login);
  const before = provider.refreshes;

  vaultKeys.lock();

  assert.ok(provider.refreshes > before, 'a lock did not repaint the row');
});

test('the row is told to repaint when Ask for Every Use Again is used', async () => {
  const { gate, agent, provider } = await rig({ answers: [ALLOW_WINDOW] });
  await gate.confirm(key, login);
  const before = provider.refreshes;

  agent.endWindows(KEY_ID);

  assert.ok(provider.refreshes > before, 'the button did not repaint the row');
});

test('the row is told to repaint when the key is unloaded', async () => {
  const { gate, agent, provider } = await rig({ answers: [ALLOW_WINDOW] });
  await gate.confirm(key, login);
  const before = provider.refreshes;

  agent.unload(KEY_ID);

  assert.ok(provider.refreshes > before, 'an unload did not repaint the row');
});

test('the row text reaches the tree through the wiring: a grant, then the provider says the key signs without asking', async () => {
  const { gate, provider } = await rig({ answers: [ALLOW_WINDOW] });
  assert.equal(provider.signWindowLabel('a1', KEY_ID), '', 'nothing is open before the grant');
  await gate.confirm(key, login);

  assert.match(provider.signWindowLabel('a1', KEY_ID), /^signs without asking until \d\d:\d\d( tomorrow)?$/);
  assert.equal(provider.signWindowLabel('another-account', KEY_ID), '', 'the same id in another account is not this key');
});

test('nothing this suite logged carries key material', () => {
  // The last test of the file: every captured log, against every key the file loaded (C12).
  assert.deepEqual(keyMaterialLogged(), [], 'a log line carries key material');
});
