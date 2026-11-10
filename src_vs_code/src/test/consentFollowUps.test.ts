import * as assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { VpnUseDeps, vpnAction } from '../agentUseActions';
import { RotateDeps, rotateAction } from '../rotateAction';
import { NEW_SECRET_PLACEHOLDER } from '../secretRotation';
import { stored } from '../storedSecret';
import type { UseAction } from '../useActions';
import { message, pause } from './bridgeDoorHarness';
import { Ask, Door, answeredAtOnce, send, sendAbortable, until } from './bridgeWallWorld';
import { share, world as brokerWorld } from './brokerWorld';
import { loadWithVscode } from './vscodeStub';
import { memoryTrust, storageOf, world as vpnWorld } from './vpnWorld';
import { BUSY_PLACE } from '../aliasThrottle';

/**
 * The follow-up contract of the one dialog place (parent §4.10), per action, through the local doors (the alias and the MCP door):
 * what an action may ask AFTER the person's Allow keeps the place until the call ends, and a client that leaves frees nothing of it
 * (the call is still waiting on the prompt). The real factories carry the flag; the broker, the doors and the throttle are real.
 *
 * <p>`down` runs the real `runVpn` over the VPN test world, with no VPN client on the PATH, so the install offer is the real
 * `offerToInstall` and is held open here. `rotate` is the real wrapper over a store that awaits the prompts its real roads await
 * (the store-under-PIN modal, the copy offer, the PIN prompt): the roads themselves are `rotationStore.ts`'s, and the flag is what
 * is under test, so each is stood in by a held prompt.</p>
 */

const scope = cleanupScope();
after(() => scope.close());

const BUSY = BUSY_PLACE;
const door = (port: number): Door => ({ port, headers: { Host: `127.0.0.1:${port}` } });

/** A prompt the test answers by hand: `ask()` is awaited by the code under test, `answer()` is the person's click. */
function heldPrompt(): { ask(): Promise<void>; answer(): void; asked(): boolean } {
  let answer = (): void => undefined;
  let asked = false;
  return {
    ask: () => {
      asked = true;
      return new Promise<void>((resolve) => {
        answer = resolve;
      });
    },
    answer: () => answer(),
    asked: () => asked,
  };
}

/** Let every request still waiting on a prompt go, then dispose: a failed scenario must not leave the process held open by a pending call. */
function settle(bw: ReturnType<typeof brokerWorld>, release: () => void): void {
  bw.openDialogs.forEach((resolve) => resolve('Deny'));
  release();
  bw.server.dispose();
}

const TARGET = (kind: string): { accountId: string; entityId: string; entityName: string; kind: string } => ({ accountId: 'a1', entityId: 'e1', entityName: 'prod', kind });

/** The second and third asks at the standing place: an alias call and an MCP call, both told busy with no new modal. */
async function assertBusyOnBothDoors(port: number, action: string, dialogs: () => number, what: string): Promise<void> {
  const asks: Array<[string, Ask]> = [
    ['an alias call', { path: `/v1/alias/${action}`, body: { alias: 'one', statement: `x ${NEW_SECRET_PLACEHOLDER}` } }],
    ['an MCP call', { path: `/v1/mcp/use/${action}`, body: { entry: 'e1', statement: `x ${NEW_SECRET_PLACEHOLDER}` } }],
  ];
  for (const [who, ask] of asks) {
    const refused = await answeredAtOnce(send(door(port), ask), `${what}: ${who} was let in while the follow-up prompt stands`);
    assert.deepEqual([refused.status, message(refused)], [429, BUSY], `${what}: ${who}`);
  }
  assert.equal(dialogs(), 1, `${what}: no second modal opened`);
}

for (const verb of ['up', 'down'] as const) {
  test(`${verb}: with no VPN client the install offer follows the Allow — real factory, real runVpn: it keeps the place, a client leaving frees nothing, and the click does`, async () => {
    const vw = vpnWorld({}, { holdDialogs: /is not installed\. Install it\?/ });
    const mocks = {
      './vpnExec': { resolveVpnLauncher: () => ({ kind: 'missing', looked: [] }) },
      './toolCheck': { installRecipe: () => ({ display: 'WireGuard', command: 'install-wireguard', note: '' }) },
    };
    const { agentVpnOpener } = loadWithVscode<{ agentVpnOpener: (...args: unknown[]) => VpnUseDeps['open'] }>('../vpnRun', vw.vscode, mocks);
    const open = agentVpnOpener(storageOf({ vpn: { id: 'vpn', name: 'ops relay stage', isSshEnabled: false, isVpn: true, vpnType: 'wireguard' } }), ownedDir(scope, 'down'), { noteUserActivity: () => undefined }, memoryTrust());
    const deps: VpnUseDeps = { storage: { getNode: () => ({ id: 'e1', name: 'prod', type: 'entity', details: { id: 'e1', name: 'prod', isSshEnabled: false, isVpn: true, vpnType: 'wireguard' } }) }, open: (accountId, _entityId, act, gate) => open(accountId, 'vpn', act, gate) };
    const bw = brokerWorld({ kind: 'vpn', holdDialogs: true, supports: [verb], realActions: { [verb]: vpnAction(deps, verb) }, aliasMap: { one: TARGET('vpn') }, mcpUse: 'usable' });
    try {
      const { port } = await share(bw);
      const first = sendAbortable(door(port), { path: `/v1/alias/${verb}`, body: { alias: 'one' } });
      first.reply.catch(() => undefined);
      await until(() => bw.openDialogs.length === 1, 'the consent dialog of the ' + verb);
      bw.openDialogs[0]('Allow');
      await until(() => vw.held.length === 1, 'the install offer, after the Allow');

      await assertBusyOnBothDoors(port, verb, () => bw.dialogs.length, 'while the offer stands');
      first.abort();
      await pause(300); // long enough for the broker to see the socket close; the call itself has not ended: it waits on the offer
      await assertBusyOnBothDoors(port, verb, () => bw.dialogs.length, 'after the client left: the offer is still on screen');

      vw.held[0].answer(undefined);
      const next = send(door(port), { path: `/v1/alias/${verb}`, body: { alias: 'one' } });
      await until(() => bw.openDialogs.length === 2, 'the next call to be asked once the offer was answered');
      bw.openDialogs[1](undefined);
      await next.catch(() => undefined);
    } finally {
      settle(bw, () => vw.held.forEach((held) => held.answer(undefined)));
    }
  });
}

/** The real `rotate` wrapper over a scripted statement, whose store awaits the three prompts of its awaited roads in turn. */
function rotating(prompts: ReturnType<typeof heldPrompt>[]): UseAction {
  const underlying: UseAction = {
    kind: 'db',
    action: 'query',
    mutatesSecrets: false,
    verb: 'run a query against',
    validate: () => ({ ok: true }),
    summarize: () => 'x',
    describeOutcome: () => 'ok',
    run: () => Promise.resolve({ status: 200, body: { exitCode: 0, stdout: 'ALTER\n' } }),
  };
  const deps: RotateDeps = {
    generate: () => ({ ok: true, value: 'NEW-secret-4b7e', kind: 'password' }),
    entity: () => ({ id: 'e1', name: 'orders-db', kind: 'db', isSshEnabled: false, dbType: 'mysql' }),
    current: () => Promise.resolve(stored('mysql://app:old-password-9f2c@db-01.example.internal:3306/orders')),
    snapshot: () => Promise.resolve({ at: 1, name: 'orders-db', details: { id: 'e1', name: 'orders-db', isSshEnabled: false }, secrets: {} }),
    record: () => Promise.resolve(),
    store: async () => {
      for (const prompt of prompts) {
        await prompt.ask();
      }
      return 'stored' as const;
    },
  };
  return rotateAction(underlying, 'query', deps);
}

test('rotate: the store-under-PIN modal, the copy offer and the PIN prompt each keep the place — busy at every one, free after the last', async () => {
  const prompts = [heldPrompt(), heldPrompt(), heldPrompt()];
  const bw = brokerWorld({ kind: 'db', holdDialogs: true, supports: ['rotate'], realActions: { rotate: rotating(prompts) }, aliasMap: { one: TARGET('db') }, mcpUse: 'usable' });
  try {
    const { port } = await share(bw);
    const first = send(door(port), { path: '/v1/alias/rotate', body: { alias: 'one', statement: `ALTER USER app IDENTIFIED BY '${NEW_SECRET_PLACEHOLDER}'` } });
    await until(() => bw.openDialogs.length === 1, 'the consent dialog of the rotate');
    bw.openDialogs[0]('Allow');
    for (const [index, prompt] of prompts.entries()) {
      await until(() => prompt.asked(), `prompt ${index + 1} of the rotation`);
      await assertBusyOnBothDoors(port, 'rotate', () => bw.dialogs.length, `at prompt ${index + 1}`);
      prompt.answer();
    }
    assert.equal((await first).status, 200);
    const next = send(door(port), { path: '/v1/alias/rotate', body: { alias: 'one', statement: `ALTER USER app IDENTIFIED BY '${NEW_SECRET_PLACEHOLDER}'` } });
    await until(() => bw.openDialogs.length === 2, 'the next rotate to be asked: the place came back when the rotation ended');
    bw.openDialogs[1]('Deny');
    await next;
  } finally {
    settle(bw, () => prompts.forEach((prompt) => prompt.answer()));
  }
});
