import * as assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { ConsentQuestion } from '../brokerConsent';
import type { Grant } from '../grantRegistry';
import { loadWithVscode } from './vscodeStub';

/**
 * The moment a prompt is spent (E1.3 epoch 3, A.3.5): the consent gate says so, immediately before it shows a dialog.
 *
 * <p>The window of dialogs counts what was SHOWN, not what was admitted or what was answered. A dialog nobody answers is
 * still on a person's screen, and a call refused before it never was. So the gate calls `prompted` once per dialog, before
 * the dialog exists, and not at all when the grant already says allowed or denied, or when a request joins a dialog that is
 * already open.</p>
 */

type Gate = typeof import('../brokerConsent');

interface Seen {
  readonly dialogs: string[];
  readonly prompted: ConsentQuestion[];
  /** What `dialogClosed` was told, in order: the `keep` of each close (Amendment 3, C.3). */
  readonly closed: boolean[];
  /** What `prompted` had been told when the first dialog was shown: it must be called BEFORE the dialog. */
  promptedWhenShown: number[];
}

interface GateOptions {
  /** The consent timeout the gate waits (mocked `CONSENT_TIMEOUT_MS`), in place of five minutes. */
  readonly timeoutMs?: number;
  /** What `deps.log` hears: the journal lines of the gate itself. */
  readonly lines?: object[];
  /** Calls to `onUserPresent`. */
  readonly presence?: { count: number };
}

/** One person-present call, counted when the test asked to count them. */
function countPresence(presence: { count: number } | undefined): void {
  if (presence !== undefined) {
    presence.count += 1;
  }
}

function gateOver(grants: object, options: GateOptions = {}): { gate: InstanceType<Gate['ConsentGate']>; seen: Seen; answer(choice: string | undefined): void; fail(error: unknown): void; notices: string[] } {
  const seen: Seen = { dialogs: [], prompted: [], closed: [], promptedWhenShown: [] };
  const notices: string[] = [];
  let fail: (error: unknown) => void = () => undefined;
  let answer: (choice: string | undefined) => void = () => undefined;
  const stub = {
    window: {
      showWarningMessage: (text: string): Promise<string | undefined> => {
        seen.dialogs.push(text);
        seen.promptedWhenShown.push(seen.prompted.length);
        return new Promise((resolve, reject) => {
          answer = resolve;
          fail = reject;
        });
      },
      showInformationMessage: (text: string): Promise<undefined> => {
        notices.push(text);
        return Promise.resolve(undefined);
      },
    },
    workspace: { getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }) },
  };
  const mocks = options.timeoutMs === undefined ? undefined : { './agentConsent': { ...(require('../agentConsent') as object), CONSENT_TIMEOUT_MS: options.timeoutMs } };
  const { ConsentGate } = loadWithVscode<Gate>('../brokerConsent', stub, mocks);
  const gate = new ConsentGate({
    grants: grants as never,
    actions: { actionsFor: () => [{ verb: 'run a command on' }] } as never,
    onUserPresent: () => countPresence(options.presence),
    log: (entry) => void options.lines?.push(entry),
    prompted: (question) => void seen.prompted.push(question),
    dialogClosed: (_question, keep) => void seen.closed.push(keep),
  });
  return { gate, seen, answer: (choice) => answer(choice), fail: (error) => fail(error), notices };
}

/** A registry that knows one grant and what it says. */
function registry(status: string): { get(secret: string): { status: string } | undefined; allow(secret: string): void; deny(secret: string): void } {
  const state = { status };
  return { get: () => state, allow: () => void (state.status = 'allowed'), deny: () => void (state.status = 'denied') };
}

/** A whole bridged call grant, the shape `GrantRegistry.mint` makes; the gate reads its status from the registry fake, not from here. */
const grant: Grant = {
  secret: 's',
  accountId: 'a1',
  entityId: 'e1',
  entityName: 'prod',
  kind: 'ssh',
  status: 'pending',
  mintedAt: 0,
  lastUsedAt: 0,
  uses: 0,
  scope: 'call',
  bridge: { context: { bridgeId: 'b1', accountId: 'a1', serverEntityId: 's1', serverName: 'prod server', target: '', remoteOs: undefined }, quiet: false },
};
const question = (via: ConsentQuestion['via']): ConsentQuestion => ({ grant, action: 'exec', verb: 'run a command on', summary: 'id', caller: undefined, via, coverage: 'call' });
const never = new AbortController().signal;

test('prompted is called once, with the question and its door, BEFORE the dialog is shown', async () => {
  const { gate, seen, answer } = gateOver(registry('pending'));
  const outcome = gate.consent(question('mcp'), never);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(seen.dialogs.length, 1, 'a dialog was shown');
  assert.deepEqual(seen.promptedWhenShown, [1], 'and prompted had already been told about it');
  assert.equal(seen.prompted.length, 1);
  assert.equal(seen.prompted[0].via, 'mcp', 'with the door the call came in by');
  assert.equal(seen.prompted[0].grant, grant, 'and the grant, whose bridge says which window to stamp');
  answer('Allow');
  assert.equal(await outcome, 'allowed');
});

test('a dialog nobody answers has still been counted: prompted does not wait for the answer', async () => {
  const { gate, seen } = gateOver(registry('pending'));
  void gate.consent(question('alias'), never);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(seen.prompted.length, 1, 'counted with the dialog still open');
});

test('a grant that already says allowed or denied shows no dialog and spends no prompt', async () => {
  for (const [status, outcome] of [['allowed', 'allowed'], ['denied', 'denied']] as const) {
    const { gate, seen } = gateOver(registry(status));
    assert.equal(await gate.consent(question('mcp'), never), outcome);
    assert.deepEqual([seen.dialogs.length, seen.prompted.length], [0, 0], status);
  }
});

test('a request that joins a dialog already open shows nothing new and spends nothing more', async () => {
  const { gate, seen, answer } = gateOver(registry('pending'));
  const first = gate.consent(question('token'), never);
  const second = gate.consent(question('token'), never);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual([seen.dialogs.length, seen.prompted.length], [1, 1]);
  answer('Allow');
  await Promise.all([first, second]);
});

test('a request that has already gone shows no dialog and spends no prompt', async () => {
  const { gate, seen } = gateOver(registry('pending'));
  const gone = new AbortController();
  gone.abort();
  assert.equal(await gate.consent(question('mcp'), gone.signal), 'abandoned');
  assert.deepEqual([seen.dialogs.length, seen.prompted.length], [0, 0]);
});

test('a gate with no prompted hook still asks (the hook is optional, as it is for a test of the gate alone)', async () => {
  const stub = { window: { showWarningMessage: (): Promise<string> => Promise.resolve('Allow') }, workspace: { getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }) } };
  const { ConsentGate } = loadWithVscode<Gate>('../brokerConsent', stub);
  const grants = registry('pending');
  const gate = new ConsentGate({ grants: grants as never, actions: { actionsFor: () => [] } as never, onUserPresent: () => undefined, log: () => undefined });
  assert.equal(await gate.consent(question('mcp'), never), 'allowed');
});

/* ---------------------------------------------------------------------------------------------------------------
 * Amendment 3, C.3 — the close of a dialog says whether the place is kept: only for an Allow of a call that may ask again
 * ------------------------------------------------------------------------------------------------------------- */

/** The `keep` the gate reports when its dialog is answered `choice` for a question that does (or does not) declare a follow-up. */
async function keepFor(choice: string | undefined, followUp: boolean | undefined): Promise<boolean[]> {
  const { gate, seen, answer } = gateOver(registry('pending'));
  const outcome = gate.consent({ ...question('mcp'), followUp }, never);
  await new Promise<void>((resolve) => setImmediate(resolve));
  answer(choice);
  await outcome;
  return seen.closed;
}

test('K7: dialogClosed is told to keep the place for an Allow of a call that declares a follow-up, and for nothing else', async () => {
  assert.deepEqual(await keepFor('Allow', true), [true], 'Allow + followUp: kept');
  assert.deepEqual(await keepFor('Allow', false), [false], 'Allow without a follow-up (exec, query): freed (P2)');
  assert.deepEqual(await keepFor('Allow', undefined), [false], 'a question that does not say: freed');
  assert.deepEqual(await keepFor('Deny', true), [false], 'a Deny frees the place');
  assert.deepEqual(await keepFor(undefined, true), [false], 'a dismissed dialog frees it');
});

test('K7 (change 6.1): a follow-up given as a function is asked when the dialog closes on an Allow — never before it opens, never for a Deny or a dismissal, and a throw keeps nothing', async () => {
  const asked: string[] = [];
  let up = false;
  const flag = (): boolean => (asked.push(up ? 'up' : 'down'), up);
  const closed = async (choice: string | undefined, followUp: () => boolean): Promise<boolean[]> => {
    const { gate, seen, answer } = gateOver(registry('pending'));
    const outcome = gate.consent({ ...question('mcp'), followUp }, never);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(asked, [], 'not asked while the dialog is open');
    up = true; // what the flag reads changes while the dialog is on screen
    answer(choice);
    await outcome;
    return seen.closed;
  };
  assert.deepEqual(await closed('Allow', flag), [true], 'Allow: read at the close, and it reads the state of THEN');
  assert.deepEqual(asked, ['up']);
  asked.length = 0;
  assert.deepEqual(await closed('Deny', flag), [false]);
  assert.deepEqual(await closed(undefined, flag), [false]);
  assert.deepEqual(asked, [], 'a Deny or a dismissal never asks it');
  assert.deepEqual(await closed('Allow', () => { throw new Error('the flag could not be read'); }), [false], 'a flag that throws keeps nothing and the place is still given back');
});

test('K7 (E1.5): an unanswered dialog (the call\'s timeout) frees NOTHING although the call declares a follow-up — the place is freed by whatever ends the dialog, with keep false', async () => {
  const stub = { window: { showWarningMessage: (): Promise<string | undefined> => new Promise(() => undefined) }, workspace: { getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }) } };
  const closed: boolean[] = [];
  const { ConsentGate } = loadWithVscode<Gate>('../brokerConsent', stub, { './agentConsent': { ...(require('../agentConsent') as object), CONSENT_TIMEOUT_MS: 30 } });
  const gate = new ConsentGate({ grants: registry('pending') as never, actions: { actionsFor: () => [] } as never, onUserPresent: () => undefined, log: () => undefined, dialogClosed: (_q, keep) => void closed.push(keep) });
  // The gate's timer is `unref`'d on purpose (the HTTP server keeps a real process alive; the timer need not), so on a runner whose only
  // pending work is this wait the loop would end and the test be cancelled. A referenced keep-alive holds it open, and is cleared in `finally`.
  const keepAlive = setInterval(() => undefined, 1_000);
  try {
    assert.equal(await gate.consent({ ...question('mcp'), followUp: true }, never), 'timeout');
    assert.deepEqual(closed, [], 'the timer told the throttle nothing: the dialog is still on screen');
  } finally {
    clearInterval(keepAlive);
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * E1.5 — a late answer is read by one road, and the arbitration between the timer and the answer is explicit
 * ------------------------------------------------------------------------------------------------------------- */

const LATE_NOTICE = 'That request had already ended; nothing ran. The next one will ask again.';
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** One late case of C16: a click after the call timed out (`leaving` false), or after the only waiter left (`leaving` true). */
async function lateClick(leaving: boolean): Promise<void> {
  const lines: object[] = [];
  const presence = { count: 0 };
  const grants = registry('pending');
  const allowed: string[] = [];
  grants.allow = () => void allowed.push('allow');
  const { gate, seen, answer, notices } = gateOver(grants, { timeoutMs: leaving ? 5_000 : 30, lines, presence });
  const waiter = new AbortController();
  const outcome = gate.consent({ ...question('mcp'), followUp: true }, waiter.signal);
  await settle();
  if (leaving) {
    waiter.abort();
  }
  assert.equal(await outcome, leaving ? 'abandoned' : 'timeout');
  assert.deepEqual(seen.closed, [], 'nothing was told to the throttle before the click');
  answer('Allow');
  await settle();
  assert.deepEqual(seen.closed, [false], 'the click frees the place and never keeps it');
  assert.deepEqual(lines.map((line) => (line as { outcome: string; detail: string }).detail), ['"Allow" answered after its call had ended; nothing ran']);
  assert.deepEqual(lines.map((line) => (line as { outcome: string }).outcome), ['ignored']);
  assert.deepEqual(notices, [LATE_NOTICE]);
  assert.equal(presence.count, 0, 'onUserPresent was not called');
  assert.deepEqual(allowed, [], 'grants.allow was not called');
}

test('C16: the two late cases share one road — a click after the call timed out, and a click after every waiter left: one ignored line, one notice, nothing decided, and closed is [] until the click', async () => {
  const keepAlive = setInterval(() => undefined, 1_000);
  try {
    await lateClick(false);
    await lateClick(true);
  } finally {
    clearInterval(keepAlive);
  }
});

test('C21: arbitration, both orders — the timer and the answer, the waiter and the answer', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    // (a) an answer before the timer: allowed, and the flag is read at the close
    {
      const a = gateOver(registry('pending'), { timeoutMs: 30 });
      const outcome = a.gate.consent({ ...question('mcp'), followUp: true }, never);
      await settle();
      mock.timers.tick(29);
      a.answer('Allow');
      assert.equal(await outcome, 'allowed');
      assert.deepEqual(a.seen.closed, [true], '(a) kept: the flag was read at the close');
    }
    // (b) the timer, then an answer in the next microtask: the late road
    {
      const lines: object[] = [];
      const b = gateOver(registry('pending'), { timeoutMs: 30, lines });
      const outcome = b.gate.consent({ ...question('mcp'), followUp: true }, never);
      await settle();
      mock.timers.tick(30);
      assert.equal(await outcome, 'timeout');
      b.answer('Allow');
      await settle();
      assert.deepEqual(b.seen.closed, [false], '(b) freed, never kept');
      assert.deepEqual(lines.map((line) => (line as { outcome: string }).outcome), ['ignored'], '(b) one ignored line, and no ALLOWED');
    }
    // (c) the waiter leaves at 29 ms, then Allow at 29.5: no live waiter, so keep was never computed
    {
      const c = gateOver(registry('pending'), { timeoutMs: 30 });
      const waiter = new AbortController();
      const outcome = c.gate.consent({ ...question('mcp'), followUp: true }, waiter.signal);
      await settle();
      mock.timers.tick(29);
      waiter.abort();
      assert.equal(await outcome, 'abandoned');
      c.answer('Allow');
      await settle();
      assert.deepEqual(c.seen.closed, [false], '(c) never [true]: no live waiter');
    }
    // (d) the answer resolves and the timer ticks in the same macrotask, the tick first: the late road, because the timer had settled the call
    {
      const lines: object[] = [];
      const d = gateOver(registry('pending'), { timeoutMs: 30, lines });
      const outcome = d.gate.consent({ ...question('mcp'), followUp: true }, never);
      await settle();
      mock.timers.tick(30);
      d.answer('Allow');
      assert.equal(await outcome, 'timeout');
      await settle();
      assert.deepEqual(d.seen.closed, [false], '(d) the late road');
      assert.deepEqual(lines.map((line) => (line as { outcome: string }).outcome), ['ignored']);
    }
  } finally {
    mock.timers.reset();
  }
});
