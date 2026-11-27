import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { BridgeOptIns } from '../bridgeOptIns';
import { BRIDGE_FLOW_CONTEXT, BRIDGE_FLOW_ENABLED } from '../bridgeFlowSwitch';
import { KEY, ROW, click, settled, world, writtenKey } from './personRoadsWorld';

/**
 * The switch of the Remote Bridge's new flow (the plan's §4.5; change 11.1, S5). SW1 owns the shipped default: the constant reads `false`
 * and the manifest declares no `activationEvents` (D19); E4.1's commit flips both, and this test with them. SW2 to SW4 hold what the
 * switch off means, through the person-roads world with `bridgeFlow: false`: the released road, and no restore. SW5 holds that production
 * hands no `bridgeFlow`, so the constant decides there.
 */

const SRC = path.join(__dirname, '..', '..', 'src');
const scope = cleanupScope();
after(() => scope.close());

test('SW1: the shipped default is off, and the manifest declares no activationEvents while it is (D19)', () => {
  assert.equal(BRIDGE_FLOW_ENABLED, false, 'the new flow is off in every build that ships; only the owner\'s pilot build turns it on, at build time');
  const manifest = JSON.parse(fs.readFileSync(path.join(SRC, '..', 'package.json'), 'utf8')) as { activationEvents?: unknown };
  assert.equal(manifest.activationEvents, undefined, 'activationEvents lands with the flip (E4.1), never before');
  const palette = (manifest as { contributes: { menus: { commandPalette: { command: string; when?: string }[] } } }).contributes.menus.commandPalette;
  assert.deepEqual(palette.filter((one) => one.command === 'credSshManager.prepareDbContainer'), [{ command: 'credSshManager.prepareDbContainer', when: BRIDGE_FLOW_CONTEXT }], 'Prepare Database Container shows only where the new flow is on');
  const extension = fs.readFileSync(path.join(SRC, 'extension.ts'), 'utf8');
  assert.match(extension, /executeCommand\('setContext', BRIDGE_FLOW_CONTEXT, BRIDGE_FLOW_ENABLED\)/, 'the context key is the constant');
});

test('SW2: switch off, Open Remote Bridge is the released road: a token minted, the forward to the main broker port, no listener of its own, no note', async () => {
  const w = world({ bridgeFlow: false, clicks: [writtenKey('/storage/keys/1/call.key')] });
  await click(w, 'openRemoteBridge');
  await settled();

  assert.equal(w.shares.length, 1, 'one token minted, as the released road does');
  assert.deepEqual([w.listeners.length, w.notes.length], [0, 0], 'no listener of its own and no note on the server');
  assert.equal(w.children.length, 1, 'one bridge ssh');
  const forward = w.bridgeArgvs[0][w.bridgeArgvs[0].indexOf('-R') + 1];
  assert.match(forward, /:127\.0\.0\.1:4242$/, 'the forward goes to the main broker port');
  assert.ok(w.infos.some((text) => text.startsWith('Bridge open to "box". Open an SSH session there, paste the setup block')), `the setup block is offered: ${JSON.stringify(w.infos)}`);
  assert.equal(w.bridges.isOpen(KEY), true);
});

test('SW3: switch off, Close stops the old road\'s bridge', async () => {
  const w = world({ bridgeFlow: false, clicks: [writtenKey('/storage/keys/1/call.key')] });
  await click(w, 'openRemoteBridge');
  await settled();
  assert.equal(w.bridges.isOpen(KEY), true);

  await click(w, 'closeRemoteBridge');
  await settled();
  assert.ok(w.children[0].killed > 0, 'the bridge ssh was stopped');
  assert.ok(w.infos.includes('The bridge to "box" is closed.'), `Close said so: ${JSON.stringify(w.infos)}`);
});

test('SW4: switch off, a bridge opened and not Closed before is NOT restored at registration; switch on, it is', async () => {
  const off = ownedDir(scope, 'sw4-off');
  new BridgeOptIns(off, () => undefined).add({ accountId: ROW.accountId, serverId: ROW.node.id });
  const quiet = world({ bridgeFlow: false, storageDir: off, clicks: [writtenKey('/storage/keys/1/call.key')] });
  await settled();
  assert.deepEqual([quiet.children.length, quiet.listeners.length, quiet.shares.length], [0, 0, 0], 'nothing started, no listener, no token');

  // The control: the same opt-in with the switch on is restored, so SW4's quiet is the switch and not a world that restores nothing.
  const on = ownedDir(scope, 'sw4-on');
  new BridgeOptIns(on, () => undefined).add({ accountId: ROW.accountId, serverId: ROW.node.id });
  const restored = world({ bridgeFlow: true, storageDir: on, clicks: [writtenKey('/storage/keys/1/call.key')] });
  await settled();
  assert.equal(restored.listeners.length, 1, 'the switch on restores the opted-in bridge: a listener of its own');
});

test('SW5: production hands no bridgeFlow, so the constant of bridgeFlowSwitch.ts decides there', () => {
  const extension = fs.readFileSync(path.join(SRC, 'extension.ts'), 'utf8');
  assert.equal(/\bbridgeFlow\s*:/.test(extension), false, 'extension.ts names no bridgeFlow: a build turns the flow on by the constant alone');
  const commands = fs.readFileSync(path.join(SRC, 'commands', 'agentCommands.ts'), 'utf8');
  assert.match(commands, /host\.bridgeFlow \?\? BRIDGE_FLOW_ENABLED/, 'the command module falls back to the constant');
});
