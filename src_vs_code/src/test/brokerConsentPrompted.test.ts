import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ConsentQuestion } from '../brokerConsent';
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
  /** What `prompted` had been told when the first dialog was shown: it must be called BEFORE the dialog. */
  promptedWhenShown: number[];
}

function gateOver(grants: object): { gate: InstanceType<Gate['ConsentGate']>; seen: Seen; answer(choice: string | undefined): void } {
  const seen: Seen = { dialogs: [], prompted: [], promptedWhenShown: [] };
  let answer: (choice: string | undefined) => void = () => undefined;
  const stub = {
    window: {
      showWarningMessage: (text: string): Promise<string | undefined> => {
        seen.dialogs.push(text);
        seen.promptedWhenShown.push(seen.prompted.length);
        return new Promise((resolve) => {
          answer = resolve;
        });
      },
    },
    workspace: { getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }) },
  };
  const { ConsentGate } = loadWithVscode<Gate>('../brokerConsent', stub);
  const gate = new ConsentGate({
    grants: grants as never,
    actions: { actionsFor: () => [{ verb: 'run a command on' }] } as never,
    onUserPresent: () => undefined,
    log: () => undefined,
    prompted: (question) => void seen.prompted.push(question),
  });
  return { gate, seen, answer: (choice) => answer(choice) };
}

/** A registry that knows one grant and what it says. */
function registry(status: string): { get(secret: string): { status: string } | undefined; allow(secret: string): void; deny(secret: string): void } {
  const state = { status };
  return { get: () => state, allow: () => void (state.status = 'allowed'), deny: () => void (state.status = 'denied') };
}

const grant = { secret: 's', accountId: 'a1', entityId: 'e1', entityName: 'prod', kind: 'ssh', status: 'pending', bridge: { context: { bridgeId: 'b1' }, quiet: false } };
const question = (via: ConsentQuestion['via']): ConsentQuestion => ({ grant: grant as never, action: 'exec', verb: 'run a command on', summary: 'id', caller: undefined, via });
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
