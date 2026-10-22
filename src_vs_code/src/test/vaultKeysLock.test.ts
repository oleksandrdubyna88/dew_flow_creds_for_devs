import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALLOW_ONCE, ALLOW_WINDOW } from '../agentConsent';
import { evictAndLock } from '../corpBindingWiring';
import { makeLockNow } from '../lockNow';
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
import { LONGER } from './sshAgentLongerRig';
import { StubEventEmitter } from './vscodeStub';
import { ACCOUNT, PIN, VaultKeysModule, secretStorage, vaultWithTwoWraps } from './vaultKeysWorld';

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
async function rig(
  options: Parameters<typeof world>[0],
  /** Subscribed to the lock BEFORE `wireSshAgent` subscribes the agent — the order a second subsystem could have. */
  subscribeFirst: (onDidLock: InstanceType<VaultKeysModule['VaultKeys']>['onDidLock']) => void = () => undefined,
): Promise<{
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
  subscribeFirst(vaultKeys.onDidLock);
  const context = { subscriptions: [] as { dispose(): unknown }[] };
  const provider = {
    refreshes: 0,
    refresh(): void {
      provider.refreshes += 1;
    },
    signWindowLabel: (_accountId: string, _nodeId: string): string => '',
  };
  // The real `VaultKeys`, with its presence signal counted on the world: `wireSshAgent` hands the manager
  // `vaultKeys.noteUserActivity` as the moment a human answered. The lock state and the auto-lock rule are the real
  // ones too — they are what `connectAgentToSettings` reads (#197, E3.3).
  const wiredKeys = {
    onDidLock: vaultKeys.onDidLock,
    isLocked: () => vaultKeys.isLocked(),
    dueForAutoLock: (nowMs: number, idleMinutes: number) => vaultKeys.dueForAutoLock(nowMs, idleMinutes),
    noteUserActivity: () => {
      w.presence += 1;
      vaultKeys.noteUserActivity();
    },
  };
  const agent = wiring.wireSshAgent({
    context,
    storage: agentStorage({ keys: { [KEY_ID]: realPrivateKey() } }) as never,
    storageDir: storageDir(),
    envCollection: agentEnv(w) as never,
    vaultKeys: wiredKeys,
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

test('lockNow — what the idle timer and Lock Vaults both call — ends the SSH windows', async () => {
  // Through the same function the extension builds (`makeLockNow`), over the real VaultKeys: a lockNow that stopped
  // calling `vaultKeys.lock()` would leave a notice and an open window.
  const { w, vaultKeys, gate } = await rig({ answers: [ALLOW_WINDOW, ALLOW_ONCE] });
  const lockNow = makeLockNow({ vaultKeys, closeForms: () => 0, refreshReadiness: () => Promise.resolve(undefined), say: () => undefined });
  await gate.confirm(key, login);

  lockNow('Vaults locked.');
  await gate.confirm(key, login);

  assert.equal(w.dialogs.length, 2, 'lockNow left the window open');
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

test('a lock listener subscribed BEFORE the agent\'s that throws does not stop the agent\'s windows ending', async () => {
  // VS Code's Emitter isolates listener errors; the stub must too, or this ordering would hide the very defect
  // it exists to show: a throwing earlier subscriber leaving every signing window open after a lock.
  const { w, vaultKeys, gate } = await rig({ answers: [ALLOW_WINDOW, ALLOW_ONCE] }, (onDidLock) => {
    onDidLock(() => {
      throw new Error('a subscriber that always fails');
    });
  });
  await gate.confirm(key, login);

  vaultKeys.lock();
  await gate.confirm(key, login);

  assert.equal(w.dialogs.length, 2, 'the throwing listener stopped the agent from ending the window');
  assert.equal(
    StubEventEmitter.reported.some((error) => error.message === 'a subscriber that always fails'),
    true,
    'the listener error was swallowed without being reported',
  );
});

test('a lock after VaultKeys is disposed is harmless: it still locks, and tells nobody', async () => {
  // The extension disposes VaultKeys (and so its lock event) on deactivation; the idle timer's last tick, or a
  // corporate eviction, may still lock after that. It must neither throw nor reach a listener of a dead event.
  const { vaultKeys } = await rig({});
  const heard: string[] = [];
  vaultKeys.onDidLock(() => heard.push('heard'));
  vaultKeys.dispose();

  assert.doesNotThrow(() => vaultKeys.lock());

  assert.deepEqual(heard, [], 'a listener of the disposed event was told');
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

test('an answer given across a lock is said in the agent log: allowed once, no window was opened', async () => {
  // The audit (Fable): the lock fence changes the outcome of a timed answer, so the record must say so.
  const modal = unanswered();
  const { w, vaultKeys, gate } = await rig({ answers: [modal.answer] });

  const pending = gate.confirm(key, login);
  vaultKeys.lock();
  modal.clickLate(ALLOW_WINDOW);
  await pending;

  assert.ok(
    w.logs.some((line) => line.endsWith('"prod": answered "Allow for 10 minutes" after the vaults were locked — allowed once, no window was opened')),
    `the log does not say the answer crossed the lock: ${JSON.stringify(w.logs)}`,
  );
});

test('an answer given with no lock in between logs no fence line', async () => {
  const { w, gate } = await rig({ answers: [ALLOW_WINDOW] });

  await gate.confirm(key, login);

  assert.deepEqual(w.logs.filter((line) => line.includes('allowed once, no window was opened')), [], 'a plain grant logged a fence');
});

test('an unlock opens no window of its own: the next signatures still ask, every time', async () => {
  // Guard, green before and after: an unlock opens no window of its own, so each signature asks. The
  // INTERACTIVE unlock is used because the silent route refuses while the vault is locked (a lock means
  // "refuse the stored secret until a person says otherwise"); `typed` answers its PIN prompt, so no PIN
  // needs to be stored first.
  const { w, vaultKeys, gate } = await rig({ answers: [ALLOW_ONCE, ALLOW_ONCE], typed: PIN });
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
  assert.equal(context.subscriptions.length, 3, 'the manager, the lock link and the settings link (E3.3)');
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

/**
 * The login windows and the wiring (#197, E3.3): what `connectAgentToSettings` tells the manager, and what it does
 * when auto-lock is turned off. The manager's own rules are `sshAgentManagerLonger.test.ts`; these are about the
 * SEAM — a deleted assignment is a prompt that never offers the button, or a window that outlives its auto-lock.
 */
const gitSignature = { kind: 'sshsig', namespace: 'git' };
const FOUR = ['Allow once', 'Allow for 10 minutes', 'Allow longer…', 'Deny'];
const THREE = ['Allow once', 'Allow for 10 minutes', 'Deny'];

test('W1 setting idle auto-lock to 0 ends every login window, keeps the 10-minute ones, tells the person once and repaints the row', async () => {
  const { w, agent, gate, provider } = await rig({ answers: [LONGER, ALLOW_WINDOW] });
  w.pickAnswers.push('4 hours');
  await gate.confirm(key, login);
  await gate.confirm(key, gitSignature);
  assert.deepEqual(Object.keys(agent.windowsFor('a1', KEY_ID)).sort(), ['all', 'login'], 'the control: both windows are open');
  const repaints = provider.refreshes;

  w.changeSetting('autoLockMinutes', 0);

  assert.deepEqual(Object.keys(agent.windowsFor('a1', KEY_ID)), ['all'], 'only the 10-minute window is left');
  assert.deepEqual(w.infos, ['Idle auto-lock is off, so the login windows of 1 key were ended — a long window needs a lock to end it.']);
  assert.ok(provider.refreshes > repaints, 'the row was repainted');
  w.changeSetting('autoLockMinutes', 60);
  assert.deepEqual(Object.keys(agent.windowsFor('a1', KEY_ID)), ['all'], 'the login window was ENDED, not hidden: turning auto-lock back on does not bring it back');
  w.changeSetting('autoLockMinutes', 0);
  w.changeSetting('somethingElse', 1);
  assert.equal(w.infos.length, 1, 'with no login window open the person is told nothing, and an unrelated setting does nothing');
});

test('W2 wireSshAgent tells the manager whether the vault is locked, whether auto-lock is overdue and what it is set to', async (t) => {
  // Unlocked, auto-lock 60, not overdue: the prompt offers the button.
  const open = await rig({ answers: [ALLOW_ONCE] });
  await open.gate.confirm(key, login);
  assert.deepEqual(open.w.buttons[0], FOUR, 'the control: wired, a login prompt offers Allow longer…');

  // Locked: the same prompt does not.
  const locked = await rig({ answers: [ALLOW_ONCE] });
  locked.vaultKeys.lock();
  await locked.gate.confirm(key, login);
  assert.deepEqual(locked.w.buttons[0], THREE, 'a locked vault offers no longer window');
  assert.ok(locked.w.dialogs[0].includes('Longer windows need the vault unlocked'), locked.w.dialogs[0]);

  // Auto-lock off in the settings: nor does this one.
  const off = await rig({ answers: [ALLOW_ONCE] });
  off.w.settings.autoLockMinutes = 0;
  await off.gate.confirm(key, login);
  assert.deepEqual(off.w.buttons[0], THREE, 'auto-lock 0 offers no longer window');

  // Overdue: a granted window is not honoured once the idle time has passed, whatever the timer has not yet done.
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 21, 9, 0, 0) });
  const overdue = await rig({ answers: [LONGER, ALLOW_ONCE] });
  overdue.w.pickAnswers.push('4 hours');
  await overdue.gate.confirm(key, login);
  assert.equal(await overdue.gate.confirm(key, login), true);
  assert.equal(overdue.w.dialogs.length, 1, 'the control: the window covers while the vault was used a moment ago');

  t.mock.timers.tick(61 * 60_000);

  assert.deepEqual(overdue.agent.windowsFor('a1', KEY_ID), {}, 'overdue: the row hides the window');
  await overdue.gate.confirm(key, login);
  assert.equal(overdue.w.dialogs.length, 2, 'overdue: the login prompts although the idle timer has not locked yet');
});

test('W3 a login window granted on a vault that was never unlocked still has an auto-lock to end it', async () => {
  // `dueForAutoLock` is false while `lastActivity` is unset (a vault never unlocked would never lock). The click on
  // the prompt IS activity — through `onUserPresent` — and that is what gives the window its end.
  const { w, vaultKeys, gate } = await rig({ answers: [LONGER] });
  w.pickAnswers.push('4 hours');
  const later = Date.now() + 2 * 60 * 60_000;
  assert.equal(vaultKeys.dueForAutoLock(later, 60), false, 'the control: no activity yet, so nothing is due');

  await gate.confirm(key, login);

  assert.equal(vaultKeys.dueForAutoLock(later, 60), true, 'the pick counted as activity, so the vault is due for auto-lock');
});

test('W4 a lock through the real seam ends a login window too — it does not come back when the vault is unlocked', async () => {
  const { w, vaultKeys, agent, gate } = await rig({ answers: [LONGER, ALLOW_ONCE], typed: PIN });
  w.pickAnswers.push('4 hours');
  await gate.confirm(key, login);
  assert.notDeepEqual(agent.windowsFor('a1', KEY_ID), {}, 'the control: the login window is open');

  vaultKeys.lock();
  const unlocked = await vaultKeys.unlock(ACCOUNT, vaultWithTwoWraps().content, { interactive: true });

  assert.notEqual(unlocked, undefined, 'the fixture really unlocks the vault');
  assert.deepEqual(agent.windowsFor('a1', KEY_ID), {}, 'the lock ENDED the login window: unlocking opens none of its own');
  await gate.confirm(key, login);
  assert.equal(w.dialogs.length, 2, 'the next login prompts');
});

test('nothing this suite logged carries key material', () => {
  // The last test of the file: every captured log, against every key the file loaded (C12).
  assert.deepEqual(keyMaterialLogged(), [], 'a log line carries key material');
});
