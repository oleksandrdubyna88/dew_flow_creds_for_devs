import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import { test } from 'node:test';
import { World, call, share, world } from './brokerWorld';

/**
 * A request whose client is gone can authorise nothing (`PLAN_wsl_bridge_outlives_its_client.md` §2.3,
 * §5.7, story E4.S1).
 *
 * <p>The defect, as it stood: the broker never observed a caller leaving. An MCP client closed while its
 * consent modal was open left the modal behind; a person clicking <i>Allow</i> on it later allowed the
 * grant and RAN the action for a request nobody was waiting for, and wrote the answer to a dead socket.
 * The modal itself cannot be closed from code — the owner decided a defused one is enough (§3.3) — so
 * what is asserted here is that clicking it changes nothing, and that every later point on the path
 * (the consent memory, the mask read, the one-use queue, the action start and the action itself) sees
 * the client gone.</p>
 *
 * <p>Every test drives the real broker over real HTTP and hangs up the way a client does: by destroying
 * its connection with the response still pending.</p>
 */

interface Hanging {
  /** Destroy the connection, response still pending — what a closed MCP client's transport does. */
  hangUp(): void;
  /** The status the client received, or `'hung up'` when it left first. */
  answered: Promise<number | 'hung up'>;
}

function hanging(port: number, path: string, body: unknown, token?: string): Hanging {
  const payload = JSON.stringify(body);
  const req = http.request({
    host: '127.0.0.1',
    port,
    path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
    },
  });
  const answered = new Promise<number | 'hung up'>((resolve) => {
    req.on('response', (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    });
    req.on('error', () => resolve('hung up'));
    req.on('close', () => resolve('hung up'));
  });
  req.end(payload);
  return { hangUp: () => req.destroy(), answered };
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll until `ready`, failing with `what` rather than hanging the suite. */
async function until(ready: () => boolean, what: string, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!ready()) {
    if (Date.now() > deadline) {
      assert.fail(`timed out waiting for ${what}`);
    }
    await pause(5);
  }
}

/** Long enough for the broker to observe a loopback connection closing. */
const CLOSE_SEEN_MS = 100;

const abandonedLines = (w: World): string[] => w.audit.filter((line) => /ABANDONED/.test(line));

test('a client that leaves while the modal is open: a late Allow grants nothing and runs nothing', async () => {
  const w = world({ holdDialogs: true });
  try {
    const { port, secret } = await share(w);
    const gone = hanging(port, '/v1/use/exec', { command: 'uptime' }, secret);
    await until(() => w.openDialogs.length === 1, 'the consent modal');

    gone.hangUp();
    await pause(CLOSE_SEEN_MS);
    w.openDialogs.shift()?.('Allow');
    await pause(CLOSE_SEEN_MS);

    assert.deepEqual(w.ran, [], 'the action ran for a request nobody was waiting for');
    assert.ok(!w.audit.some((line) => /ALLOWED/.test(line)), `the late click allowed the grant: ${w.audit.join(' | ')}`);
    assert.equal(abandonedLines(w).length, 1, `one ABANDONED line: ${w.audit.join(' | ')}`);
    assert.equal(w.presence, 0, 'a click on a dead prompt decides nothing, presence included');

    // The grant is still unanswered, so the next live call on it is ASKED rather than waved through.
    const next = hanging(port, '/v1/use/exec', { command: 'df -h' }, secret);
    await until(() => w.openDialogs.length === 1, 'a fresh consent modal for the next call');
    w.openDialogs.shift()?.('Deny');
    assert.equal(await next.answered, 403);
    assert.deepEqual(w.ran, []);
  } finally {
    w.server.dispose();
  }
});

test('the MCP door: a late Allow after the client left runs nothing and remembers nothing', async () => {
  const w = world({ holdDialogs: true, mcpUse: 'usable' });
  try {
    const { port } = await share(w);
    const gone = hanging(port, '/v1/mcp/use/exec', { entry: 'e1', command: 'uptime' });
    await until(() => w.openDialogs.length === 1, 'the consent modal');

    gone.hangUp();
    await pause(CLOSE_SEEN_MS);
    w.openDialogs.shift()?.('Allow');
    await pause(CLOSE_SEEN_MS);

    assert.deepEqual(w.ran, [], 'the action ran for a request nobody was waiting for');
    assert.deepEqual(w.consents, [], 'a consent nobody was waiting for was remembered for next time');
    assert.equal(abandonedLines(w).length, 1, w.audit.join(' | '));
  } finally {
    w.server.dispose();
  }
});

test('the alias door: a late Allow after the client left runs nothing', async () => {
  const w = world({ holdDialogs: true, alias: { accountId: 'a1', entityId: 'e9', entityName: 'prod', kind: 'ssh' } });
  try {
    const { port } = await share(w);
    const gone = hanging(port, '/v1/alias/exec', { alias: 'prod', command: 'uptime' });
    await until(() => w.openDialogs.length === 1, 'the consent modal');

    gone.hangUp();
    await pause(CLOSE_SEEN_MS);
    w.openDialogs.shift()?.('Allow');
    await pause(CLOSE_SEEN_MS);

    assert.deepEqual(w.ran, []);
    assert.equal(abandonedLines(w).length, 1, w.audit.join(' | '));
  } finally {
    w.server.dispose();
  }
});

test('one token, two waiters on one modal: the one that left does not decide it for the one still there', async () => {
  const w = world({ holdDialogs: true });
  try {
    const { port, secret } = await share(w);
    const stays = hanging(port, '/v1/use/exec', { command: 'uptime' }, secret);
    const leaves = hanging(port, '/v1/use/exec', { command: 'df -h' }, secret);
    await until(() => w.openDialogs.length === 1, 'one shared consent modal');
    await pause(CLOSE_SEEN_MS);
    assert.equal(w.dialogs.length, 1, 'two calls on one token share one modal');

    leaves.hangUp();
    await pause(CLOSE_SEEN_MS);
    w.openDialogs.shift()?.('Allow');

    assert.equal(await stays.answered, 200, 'the live request still got its answer');
    assert.deepEqual(
      w.ran.map((r) => r.body.command),
      ['uptime'],
      'only the live request ran',
    );
    assert.equal(abandonedLines(w).length, 1, w.audit.join(' | '));
  } finally {
    w.server.dispose();
  }
});

test('the client leaves after consent, before the action starts: the action never starts', async () => {
  // The mask table is the last thing read before the start, so a hang-up inside that read is a
  // hang-up at the boundary: nothing awaits between it and the start but the check itself.
  let gone: Hanging | undefined;
  const w = world({
    masker: async () => {
      gone?.hangUp();
      await pause(CLOSE_SEEN_MS);
      return [];
    },
  });
  try {
    const { port, secret } = await share(w);
    gone = hanging(port, '/v1/use/exec', { command: 'uptime' }, secret);

    await until(() => abandonedLines(w).length > 0 || w.ran.length > 0, 'the call to end', 3000);
    await pause(CLOSE_SEEN_MS);

    assert.deepEqual(w.ran, [], 'the action started for a client that had already gone');
    assert.equal(abandonedLines(w).length, 1, w.audit.join(' | '));
  } finally {
    w.server.dispose();
  }
});

test('a one-use call queued behind another, whose client leaves while it waits, never starts', async () => {
  // The one-use lane is the longest wait on the path, and it sits immediately before the start. The
  // first call FAILS, so the entry is not spent and the queued call would otherwise take its turn.
  const w = world({ oneUse: true });
  w.result = { status: 502, body: { error: 'the far side refused' } };
  let release = (): void => undefined;
  w.hold = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  try {
    const { port, secret } = await share(w);
    const first = hanging(port, '/v1/use/exec', { command: 'first' }, secret);
    await until(() => w.ran.length === 1, 'the first call inside the action');
    const queued = hanging(port, '/v1/use/exec', { command: 'second' }, secret);
    await pause(CLOSE_SEEN_MS);

    queued.hangUp();
    await pause(CLOSE_SEEN_MS);
    w.hold = undefined;
    release();
    assert.equal(await first.answered, 502);
    await pause(CLOSE_SEEN_MS);

    assert.deepEqual(
      w.ran.map((r) => r.body.command),
      ['first'],
      'the queued call started after its client had gone',
    );
    assert.equal(abandonedLines(w).length, 1, w.audit.join(' | '));
  } finally {
    w.server.dispose();
  }
});

test('the client leaves after the action started: the action is handed a signal, and it fires', async () => {
  const w = world({});
  let release = (): void => undefined;
  w.hold = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  try {
    const { port, secret } = await share(w);
    const gone = hanging(port, '/v1/use/exec', { command: 'sleep 600' }, secret);
    await until(() => w.ran.length === 1, 'the action to start');
    const signal = w.actionSignals[0];
    assert.ok(signal !== undefined, 'the action was started without the request’s signal, so nothing can cancel it');
    assert.equal(signal.aborted, false, 'a live request does not start an action already cancelled');

    gone.hangUp();
    await pause(CLOSE_SEEN_MS);

    assert.equal(signal.aborted, true, 'the client left and the action’s signal did not fire');
  } finally {
    release();
    w.server.dispose();
  }
});

test('a finished request never fires its signal — keep-alive reuse included', async () => {
  // The other half of the contract: `close` after a COMPLETED response is not a client leaving.
  const w = world({});
  try {
    const { port, secret } = await share(w);
    await call(port, '/v1/use/exec', { token: secret, body: { command: 'one' } });
    await call(port, '/v1/use/exec', { token: secret, body: { command: 'two' } });
    await pause(CLOSE_SEEN_MS);

    assert.equal(w.actionSignals.length, 2);
    assert.ok(
      w.actionSignals.every((signal) => signal?.aborted === false),
      'a request that was answered had its signal fired afterwards',
    );
    assert.deepEqual(abandonedLines(w), []);
  } finally {
    w.server.dispose();
  }
});

test('an MCP delete whose client left during the modal moves nothing to the Trash', async () => {
  const w = world({ holdDialogs: true, mcpUse: 'usable', trash: true });
  try {
    const { port } = await share(w);
    const gone = hanging(port, '/v1/mcp/delete', { entry: 'e1' });
    await until(() => w.openDialogs.length === 1, 'the delete prompt');

    gone.hangUp();
    await pause(CLOSE_SEEN_MS);
    w.openDialogs.shift()?.('Allow');
    await pause(CLOSE_SEEN_MS);

    assert.deepEqual(w.trashed, []);
    assert.equal(abandonedLines(w).length, 1, w.audit.join(' | '));
  } finally {
    w.server.dispose();
  }
});

test('an MCP create whose client left during the folder PIN step makes nothing, and the step is told', async () => {
  const w = world({ create: 'open' });
  let gone: Hanging | undefined;
  w.holdSettle = async () => {
    gone?.hangUp();
    await pause(CLOSE_SEEN_MS);
  };
  try {
    const { port } = await share(w);
    gone = hanging(port, '/v1/mcp/create', { name: 'new-box', kind: 'ssh' });

    await until(() => w.settleDeadlines.length === 1, 'the PIN step');
    await pause(CLOSE_SEEN_MS * 2);

    assert.deepEqual(w.created, [], 'an entry was made for a client that had gone');
    assert.equal(w.settleSignals.length, 1, 'the PIN step was not handed the request’s signal, so its box could not close');
    assert.equal(w.settleSignals[0].aborted, true);
    assert.equal(abandonedLines(w).length, 1, w.audit.join(' | '));
  } finally {
    w.server.dispose();
  }
});
