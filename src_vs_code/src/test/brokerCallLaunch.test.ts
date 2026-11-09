import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BridgeContext } from '../bridgeContext';
import type { CallDeps, CallSubject } from '../brokerCall';
import type { Grant, GrantLookup } from '../grantRegistry';
import type { UseActionContext } from '../useActions';
import { loadEachWithVscode } from './vscodeStub';

/**
 * The action boundary (`brokerCall.answer`) with the scope wall's gate in it (E1.3, B3 and B14 at the finest grain):
 * the order is aborted, then the launch gate, then the reservation (a spent token first), then the start — in one
 * synchronous step, so that a refusal at launch has reserved, started and burned nothing.
 */

const [{ performCall }, { OneUseLane }] = loadEachWithVscode(['../brokerCall', '../oneUseLane'], {
  window: {},
  workspace: { getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }) },
}) as [typeof import('../brokerCall'), typeof import('../oneUseLane')];

const CONTEXT: BridgeContext = { bridgeId: 'b1', accountId: 'a1', serverEntityId: 'server1', serverName: 'prod server', target: '', remoteOs: undefined };

function grantOf(secret: string, extra: Partial<Grant> = {}): Grant {
  return { secret, accountId: 'a1', entityId: 'e1', entityName: 'prod', kind: 'ssh', status: 'allowed', mintedAt: 0, lastUsedAt: 0, uses: 0, scope: 'call', ...extra };
}

interface Run {
  readonly events: string[];
  readonly started: UseActionContext[];
}

interface Options {
  readonly aborted?: boolean;
  readonly launch?: () => { code: 'not_found' | 'unauthorized'; message: string } | undefined;
  readonly spend?: string;
  readonly dead?: readonly string[];
  readonly bridged?: boolean;
  readonly hasGate?: boolean;
}

/** The deps of one call, recording what happened in the order it happened. */
function depsFor(options: Options, events: string[]): CallDeps {
  const dead = new Set(options.dead);
  const reserve = (secret: string): GrantLookup => {
    events.push(`reserve ${secret}`);
    return dead.has(secret) ? { kind: 'expired', reason: 'uses' } : { kind: 'live', grant: grantOf(secret) };
  };
  const gate = { atLaunch: () => (events.push('launch gate'), options.launch?.()) };
  return {
    grants: { reserve },
    lane: new OneUseLane(),
    respond: (status) => void events.push(`respond ${status}`),
    log: () => undefined,
    refuse: (code, message) => void events.push(`refuse ${code} ${message}`),
    failed: (why) => void events.push(`failed ${why}`),
    refresh: () => Promise.resolve(undefined),
    burn: () => Promise.resolve(),
    abandon: (stage) => void events.push(`abandon ${stage}`),
    ...(options.hasGate === false ? {} : gate),
  };
}

/** The call: a grant that may carry a bridge, and an action that records its start and the context it was handed. */
function callFor(options: Options, events: string[], started: UseActionContext[]): CallSubject {
  const aborter = new AbortController();
  if (options.aborted === true) {
    aborter.abort();
  }
  const bridge = options.bridged === true ? { bridge: { context: CONTEXT, quiet: true } } : {};
  return {
    grant: grantOf('call-secret', bridge),
    useAction: {
      kind: 'ssh', action: 'exec', mutatesSecrets: false, verb: 'run', summarize: () => 'id', validate: () => ({ ok: true }), describeOutcome: () => 'exit 0',
      run: (ctx) => (events.push('start'), started.push(ctx), Promise.resolve({ status: 200, body: {} })),
    },
    action: 'exec',
    body: {},
    via: 'token',
    caller: undefined,
    summary: 'id',
    table: { entries: [] },
    signal: aborter.signal,
    ...(options.spend === undefined ? {} : { spend: options.spend }),
  };
}

/** One call through `performCall`. */
async function runCall(options: Options = {}): Promise<Run> {
  const events: string[] = [];
  const started: UseActionContext[] = [];
  await performCall(depsFor(options, events), callFor(options, events, started));
  return { events, started };
}

test('with no gate and no spent token the boundary reserves the call grant and starts — as it always did', async () => {
  const { events } = await runCall({ hasGate: false });
  assert.deepEqual(events.slice(0, 2), ['reserve call-secret', 'start']);
});

test('B3: the launch gate is asked after the abort check and before anything is reserved; a refusal reserves, starts and burns nothing', async () => {
  const { events, started } = await runCall({ launch: () => ({ code: 'not_found', message: 'gone' }), spend: 'token-secret' });
  assert.deepEqual(events, ['launch gate', 'refuse not_found gone']);
  assert.deepEqual(started, []);
});

test('a client that has gone is abandoned before the gate is even asked', async () => {
  const { events } = await runCall({ aborted: true, launch: () => ({ code: 'not_found', message: 'gone' }) });
  assert.deepEqual(events, ['abandon before the action started']);
});

test('a gate that admits (answers nothing) lets the call through to its reservation and its start', async () => {
  const { events } = await runCall({ launch: () => undefined });
  assert.deepEqual(events.slice(0, 3), ['launch gate', 'reserve call-secret', 'start']);
});

test('B14: a spent token is reserved FIRST, in the same step, then the call grant, then the start', async () => {
  const { events } = await runCall({ spend: 'token-secret' });
  assert.deepEqual(events.slice(0, 4), ['launch gate', 'reserve token-secret', 'reserve call-secret', 'start']);
});

test('B14: a token that has run out refuses the call with the token\'s own sentence and spends nothing of the call grant', async () => {
  const { events, started } = await runCall({ spend: 'token-secret', dead: ['token-secret'] });
  assert.equal(events.length, 3, events.join(' | '));
  assert.deepEqual(events.slice(0, 2), ['launch gate', 'reserve token-secret']);
  assert.match(events[2], /^refuse unauthorized This grant expired: it reached its limit of /);
  assert.deepEqual(started, []);
});

test('a call that carries no token to spend reserves one grant only', async () => {
  const { events } = await runCall({});
  assert.equal(events.filter((event) => event.startsWith('reserve')).length, 1);
});

test('startNow hands the action the CONTEXT of the bridge and nothing else of it — no switch, no key, no token', async () => {
  const bridged = await runCall({ bridged: true, spend: 'token-secret' });
  assert.equal(bridged.started[0].bridge, CONTEXT, 'the very context the door handed over');
  assert.deepEqual(Object.keys(bridged.started[0].bridge ?? {}).sort(), ['accountId', 'bridgeId', 'remoteOs', 'serverEntityId', 'serverName', 'target']);
  assert.ok(!JSON.stringify(bridged.started[0]).includes('token-secret'), 'the spent token is not in what the action sees');
  const local = await runCall({});
  assert.equal(local.started[0].bridge, undefined, 'a call of the existing doors is not told it is a bridge call');
});
