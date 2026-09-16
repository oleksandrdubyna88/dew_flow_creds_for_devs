import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REMEMBER_TIMEOUT_MS, answeredHere, recordConsent } from '../brokerConsentMemory';

/**
 * What happens to a person's answer after they give it — and what must not happen to their call.
 *
 * <p>Every test here is about the same asymmetry: remembering is a convenience worth one dialog,
 * and the call is the work somebody asked for. Nothing that goes wrong with the first may cost
 * them the second.</p>
 */

const RUNGS = 'true,true,false,false,,false,false,';

function record(over: Partial<Parameters<typeof recordConsent>[0]> = {}): {
  args: Parameters<typeof recordConsent>[0];
  notes: { outcome: string; detail: string; via: string }[];
} {
  const notes: { outcome: string; detail: string; via: string }[] = [];
  return {
    notes,
    args: {
      remember: () => Promise.resolve(),
      accountId: 'a1',
      entityId: 'e1',
      entityName: 'prod',
      via: 'mcp',
      asked: true,
      rungs: RUNGS,
      note: (entry) => notes.push({ outcome: entry.outcome, detail: entry.detail, via: entry.via }),
      ...over,
    },
  };
}

test('an answered MCP dialog is the one thing remembered', async () => {
  const written: string[] = [];
  const { args, notes } = record({
    remember: (_a, entityId, rungs) => {
      written.push(`${entityId}:${rungs}`);
      return Promise.resolve();
    },
  });

  await recordConsent(args);

  assert.deepEqual(written, [`e1:${RUNGS}`]);
  assert.deepEqual(notes, [], 'a write that worked says nothing');
});

test('a token or alias answer never silences the MCP door', async () => {
  // The two dialogs say different things, so allowing one must not stand in for the other.
  for (const via of ['token', 'alias', 'config'] as const) {
    const written: string[] = [];
    const { args } = record({ via, remember: (_a, id) => Promise.resolve(void written.push(id)) });

    await recordConsent(args);

    assert.deepEqual(written, [], `an answer at the ${via} door was remembered for mcp`);
  }
});

test('a call nobody was asked about is not remembered', async () => {
  // Otherwise "once every twelve hours" becomes "once, ever": each quiet call would push the
  // window forward and the next dialog would never come.
  const written: string[] = [];
  const { args } = record({ asked: false, remember: (_a, id) => Promise.resolve(void written.push(id)) });

  await recordConsent(args);

  assert.deepEqual(written, []);
});

test('a missing or empty fingerprint is not remembered', async () => {
  // The empty string is what a lookup that does not know about the field reads as, and it matches
  // no resolved ladder — a stamp written under it could never be matched, so the person would
  // answer once and be asked forever.
  for (const rungs of [undefined, '']) {
    const written: string[] = [];
    const { args } = record({ rungs, remember: (_a, id) => Promise.resolve(void written.push(id)) });

    await recordConsent(args);

    assert.deepEqual(written, [], `a fingerprint of ${JSON.stringify(rungs)} was recorded`);
  }
  assert.equal(answeredHere('mcp', true, ''), false);
  assert.equal(answeredHere('mcp', true, RUNGS), true);
});

test('a write that REJECTS does not fail the call, and says why in the journal', async () => {
  // What the person answered was about the call, not about whether this machine wrote it down.
  const { args, notes } = record({ remember: () => Promise.reject(new Error('globalState is full')) });

  await recordConsent(args);

  assert.equal(notes.length, 1);
  assert.equal(notes[0].outcome, 'not remembered');
  assert.match(notes[0].detail, /globalState is full/);
  assert.match(notes[0].detail, /true,true/, 'and the fingerprint is on the line, so it can be acted on');
  assert.equal(notes[0].via, 'mcp', 'on the door the journal filters by');
});

test('a write that never ANSWERS does not hold the call either', async () => {
  // The failure a catch cannot see. Without a bound, a store that stops answering would hold a
  // call the person already allowed — and a throttle slot with it — for as long as it liked.
  const { args, notes } = record({ remember: () => new Promise<void>(() => undefined), timeoutMs: 5 });

  await recordConsent(args);

  assert.equal(notes.length, 1, 'the call was still waiting');
  assert.equal(notes[0].outcome, 'not remembered');
  assert.match(notes[0].detail, /did not answer/);
});

test('two seconds is the stated bound', () => {
  // Far more than a Memento write needs, far less than an agent will wait.
  assert.equal(REMEMBER_TIMEOUT_MS, 2_000);
});

test('a window with no vault to remember into is not a failure', async () => {
  const { args, notes } = record({ remember: undefined });

  await recordConsent(args);

  assert.deepEqual(notes, [], 'there was nothing to write and nothing went wrong');
});
