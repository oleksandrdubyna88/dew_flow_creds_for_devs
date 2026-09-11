import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, code, overlapping, share, world } from './brokerWorld';

/**
 * A one-use entry is used once, and a call cap is a cap (audit 2026-09-09, finding #3).
 *
 * <p>Two check-then-act gaps across `await` boundaries, in one function. `lookup` applied the cap
 * before the body was read and before anybody was asked; `touch` counted the use after both. And
 * the broker SHARES one consent dialog between concurrent first calls, deliberately — so two
 * requests under `cap: 1` both passed at `uses: 0`, both waited for the same Allow, and both ran.
 * The burn of a one-use entry happens after the answer is on the wire, also deliberately, so two
 * concurrent calls on such an entry both ran before either burned.</p>
 *
 * <p>Re-ranked against the audit, which called the one-use half "an additional risk nearby":
 * `agentGrantMaxCalls` defaults to 0, so the cap bites only somebody who turned it on, while
 * "Until an agent uses it once" is an option in the entry form — a promise the interface makes to
 * everyone. The one-use half is the serious one.</p>
 */

/** Two calls on one token, started before either can finish. */
async function bothAtOnce(port: number, secret: string): Promise<number[]> {
  const answers = await Promise.all([
    call(port, '/v1/use/exec', { token: secret, body: { command: 'id' } }),
    call(port, '/v1/use/exec', { token: secret, body: { command: 'id' } }),
  ]);
  return answers.map((a) => a.status);
}

test('two concurrent calls on a ONE-USE entry run it once, and the second is refused', async () => {
  // The audit's shape, and the promise the entry form makes. Before the fix both reached `run`,
  // because the burn that would have stopped the second happens after the first has answered.
  const w = world({ oneUse: true, burns: true, answers: ['Allow', 'Allow'] });
  try {
    const { port, secret } = await share(w);

    const statuses = await bothAtOnce(port, secret);

    assert.equal(w.ran.length, 1, `the action must run once, ran ${w.ran.length}`);
    assert.deepEqual(w.burned, ['e1'], 'and the entry burns once');
    assert.equal(statuses.filter((s) => s === 200).length, 1, 'one caller got the result');
    assert.equal(statuses.filter((s) => s === 404).length, 1, 'the other is told it is already used');
  } finally {
    w.server.dispose();
  }
});

test('a THIRD call after the pair is refused too, without running', async () => {
  const w = world({ oneUse: true, burns: true, answers: ['Allow', 'Allow', 'Allow'] });
  try {
    const { port, secret } = await share(w);
    await bothAtOnce(port, secret);

    const late = await call(port, '/v1/use/exec', { token: secret, body: { command: 'id' } });

    assert.equal(code(late), 'not_found');
    assert.equal(w.ran.length, 1);
  } finally {
    w.server.dispose();
  }
});

test('two DOORS onto the same one-use entry still use it once', async () => {
  // The reason the lane is keyed by entity and not by token. The MCP door mints a grant per
  // call, so "one token, one use" would have been no guarantee at all: two different secrets
  // reach the same entry, and before the fix both ran.
  const w = world({ oneUse: true, burns: true, mcpUse: 'usable', answers: ['Allow', 'Allow'] });
  try {
    const { port, secret } = await share(w);

    const answers = await Promise.all([
      call(port, '/v1/use/exec', { token: secret, body: { command: 'id' } }),
      call(port, '/v1/mcp/use/exec', { body: { entry: 'e1', command: 'id' } }),
    ]);

    assert.equal(w.ran.length, 1, `two doors, one use, ran ${w.ran.length}`);
    assert.equal(answers.filter((a) => a.status === 200).length, 1);
    assert.equal(answers.filter((a) => code(a) === 'not_found').length, 1);
  } finally {
    w.server.dispose();
  }
});

test('a call that arrives AFTER the first has finished is refused, not run', async () => {
  // The sequential case, and it is not the concurrent one with a gap in it. Whether an entry is
  // one-use is answered from STORAGE, and a burned entry is not in storage — so by the time this
  // call asks, the entry no longer looks one-use, and it skipped the queue entirely and ran. The
  // lane decides first now. Found by the gate, after the harness stopped pretending a burned entry
  // still reads as one-use.
  const w = world({ oneUse: true, burns: true, answers: ['Allow', 'Allow'] });
  try {
    const { port, secret } = await share(w);
    assert.equal((await call(port, '/v1/use/exec', { token: secret, body: { command: 'id' } })).status, 200);
    assert.deepEqual(w.burned, ['e1'], 'the entry is gone from storage now');

    const after = await call(port, '/v1/use/exec', { token: secret, body: { command: 'id' } });

    assert.equal(code(after), 'not_found');
    assert.equal(w.ran.length, 1, `nothing ran a second time, ran ${w.ran.length}`);
  } finally {
    w.server.dispose();
  }
});

test('an ordinary entry still runs two calls AT ONCE — only one-use queues', async () => {
  // The cost this design refuses to pay, and the assertion has to be about overlap rather than
  // about `ran`: a queue that ran both in turn would leave exactly the same two entries. The
  // first shape of this test did, and would have passed against a lane keyed by token — which
  // is what the code did until this test was written, since every call reuses one token.
  const w = world({ burns: true, answers: ['Allow', 'Allow'] });
  const peak = overlapping(w, 2);
  try {
    const { port, secret } = await share(w);

    const statuses = await bothAtOnce(port, secret);

    assert.deepEqual(statuses, [200, 200]);
    assert.equal(peak(), 2, `both must be inside the action at once, peaked at ${peak()}`);
  } finally {
    w.server.dispose();
  }
});

test('a one-use entry does the opposite: the second call never overlaps the first', async () => {
  const w = world({ oneUse: true, burns: true, answers: ['Allow', 'Allow'] });
  const peak = overlapping(w, 2);
  try {
    const { port, secret } = await share(w);

    await bothAtOnce(port, secret);

    assert.equal(peak(), 1, `one-use means one at a time, peaked at ${peak()}`);
  } finally {
    w.server.dispose();
  }
});

test('under a call cap of ONE, two concurrent calls share a dialog and only one runs', async () => {
  // The audit reproduced `configuredMaxCalls=1; executed=2; dialogs=1`. The cap is checked before
  // two awaits and was counted after them; it is one synchronous step now.
  const w = world({ maxCalls: 1, answers: ['Allow', 'Allow'] });
  try {
    const { port, secret } = await share(w);

    const statuses = await bothAtOnce(port, secret);

    assert.equal(w.ran.length, 1, `cap=1 must mean one run, ran ${w.ran.length}`);
    assert.equal(w.dialogs.length, 1, 'and concurrent first calls still share one dialog');
    assert.equal(statuses.filter((s) => s === 401).length, 1, 'the other is told the token is spent');
  } finally {
    w.server.dispose();
  }
});

test('the cap refusal says it ran out of CALLS, not out of time', async () => {
  const w = world({ maxCalls: 1, answers: ['Allow', 'Allow'] });
  try {
    const { port, secret } = await share(w);
    await call(port, '/v1/use/exec', { token: secret, body: { command: 'id' } });

    const second = await call(port, '/v1/use/exec', { token: secret, body: { command: 'id' } });

    assert.match(
      String((second.body as { error?: { message?: string } }).error?.message),
      /limit of 1 calls/,
      'an agent told "it expired" would hunt for a typo in a token that was correct',
    );
  } finally {
    w.server.dispose();
  }
});

test('a REFUSED consent spends nothing — the cap is for calls that happened', async () => {
  const w = world({ maxCalls: 1, answers: ['Deny', 'Allow'] });
  try {
    const { port, secret } = await share(w);
    assert.equal(code(await call(port, '/v1/use/exec', { token: secret, body: { command: 'id' } })), 'denied');

    // A denial is terminal for the token, so this asserts the counter rather than a second run:
    // what must not happen is the refusal having consumed the one use.
    assert.equal(w.ran.length, 0);
  } finally {
    w.server.dispose();
  }
});
