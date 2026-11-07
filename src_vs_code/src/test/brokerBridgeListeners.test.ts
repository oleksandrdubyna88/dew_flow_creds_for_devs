import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import * as net from 'node:net';
import { test } from 'node:test';
import { BridgeContext } from '../bridgeContext';
import { BridgeListener, BridgeListeners } from '../brokerBridgeListeners';
import { BRIDGE_NO_KEY, BRIDGE_WRONG_KEY, doorsFor } from '../brokerOrigin';
import { startLoopbackServer } from '../loopbackServer';
import { CONTEXT, OTHER, SMUGGLED_KEY, Reply, code, keyed, message, pause, raw, refuses } from './bridgeDoorHarness';

/**
 * The third door over real HTTP, and the listener that owns it (E1.2, D1, D4-D8, D10, D12, D13 and D16).
 *
 * <p>`Spied` puts a spy where the router would be, so a test can say what reached it and with which context.
 * What the real router does behind the door is in `brokerBridgeRealDoor.test.ts`.</p>
 */

/** The router replaced by a spy, behind the real doors. */
class Spied {
  readonly seen: { url: string; headers: http.IncomingHttpHeaders; bridge: BridgeContext | undefined }[] = [];
  readonly notes: string[] = [];
  mainPort = 0;
  readonly doors = doorsFor(
    (req, res, bridge) => {
      this.seen.push({ url: req.url ?? '', headers: req.headers, bridge });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    },
    () => this.mainPort,
    (res, status, body) => {
      const payload = JSON.stringify(body);
      res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
      res.end(payload);
    },
    (note) => void this.notes.push(note),
  );
  readonly listeners = new BridgeListeners((port, key, context) => this.doors.forBridge(port, key, context));
}

/** One cell of the door table checked; 1 when it was admitted, else 0. */
function checkCell(reply: Reply, expected: string, label: string): number {
  if (expected === 'ok') {
    assert.equal(reply.status, 200, label);
    return 1;
  }
  assert.equal(reply.status, 403, label);
  assert.equal(code(reply), 'forbidden', label);
  assert.equal(reply.connection, 'close', label);
  assert.equal(message(reply), { NK: BRIDGE_NO_KEY, WK: BRIDGE_WRONG_KEY, R: REFUSED }[expected as 'NK' | 'WK' | 'R'], label);
  return 0;
}

/** The browser/Host refusal, as the main doors say it — recorded here so a drift in it is seen. */
const REFUSED =
  'This is a local agent broker, not a web service. Requests that look like they came from a browser are refused: it answers command-line tools on this machine only.';

/** The headers of one table cell: `Host`, any browser marks, and the key if one is given. */
function cellHeaders(host: string, extra: http.OutgoingHttpHeaders, given: string | undefined): http.OutgoingHttpHeaders {
  return given === undefined ? { Host: host, ...extra } : { Host: host, ...extra, 'X-Creds-Bridge': given };
}

test('D1 over HTTP: the door table reaches the router only for the two admitted cells, and answers the rest as fixed sentences', async () => {
  const s = new Spied();
  const l = await s.listeners.open(CONTEXT);
  try {
    s.mainPort = 5000;
    const bp = l.port;
    const cells: [string, http.OutgoingHttpHeaders, string, string, string][] = [
      [`127.0.0.1:${bp}`, {}, 'NK', 'WK', 'ok'],
      [`localhost:${bp}`, {}, 'NK', 'WK', 'ok'],
      ['127.0.0.1:5000', {}, 'NK', 'WK', 'R'],
      ['localhost', {}, 'NK', 'WK', 'R'],
      ['127.0.0.1:1', {}, 'NK', 'WK', 'R'],
      [`evil.example:${bp}`, {}, 'NK', 'WK', 'R'],
      [`127.0.0.1:${bp}`, { Origin: 'http://evil.example' }, 'R', 'R', 'R'],
      [`127.0.0.1:${bp}`, { 'Sec-Fetch-Site': 'cross-site' }, 'R', 'R', 'R'],
    ];
    let admitted = 0;
    for (const [host, extra, none, wrong, right] of cells) {
      for (const [given, expected] of [[undefined, none], ['not-the-key', wrong], [l.key, right]] as const) {
        const reply = await raw(bp, '/v1/health', cellHeaders(host, extra, given));
        admitted += checkCell(reply, expected, `${host} ${JSON.stringify(extra)} key ${String(given === l.key ? 'right' : given)}`);
      }
    }
    assert.equal(s.seen.length, admitted, 'the router saw exactly the admitted requests and no others');
    assert.equal(admitted, 2);
  } finally {
    s.listeners.closeAll();
  }
});

test('D4: a key is per listener — A on B is a wrong key; a re-open of one id gets a new port and a new key', async () => {
  const s = new Spied();
  try {
    const a = await s.listeners.open(CONTEXT);
    const b = await s.listeners.open(OTHER);
    assert.notEqual(a.key, b.key);
    assert.notEqual(a.port, b.port);
    assert.match(a.key, /^[A-Za-z0-9_-]{43}$/, '32 bytes, base64url');

    const crossed = await raw(b.port, '/v1/health', { Host: `127.0.0.1:${b.port}`, 'X-Creds-Bridge': a.key });
    assert.equal(message(crossed), BRIDGE_WRONG_KEY);
    assert.equal((await raw(a.port, '/v1/health', keyed(a))).status, 200);

    const again = await s.listeners.open(CONTEXT);
    assert.notEqual(again.port, a.port, 'a new port');
    assert.notEqual(again.key, a.key, 'a new key');
    assert.ok(await refuses(a.port), 'the old port is closed');
    const stale = await raw(again.port, '/v1/health', { Host: `127.0.0.1:${again.port}`, 'X-Creds-Bridge': a.key });
    assert.equal(message(stale), BRIDGE_WRONG_KEY, 'and the old key opens nothing');
    assert.equal((await raw(b.port, '/v1/health', keyed(b))).status, 200, 'the other bridge is untouched');
  } finally {
    s.listeners.closeAll();
  }
});

/**
 * A socket that has been answered once and is part-way into its next request: `server.close()` alone
 * leaves it open (measured on this runtime), `closeAllConnections()` ends it. `ended` resolves true when
 * the socket reports its close, false after two seconds.
 */
async function heldOpen(l: BridgeListener): Promise<{ held: net.Socket; ended: Promise<boolean> }> {
  const held = net.connect(l.port, '127.0.0.1');
  const ended = new Promise<boolean>((resolve) => {
    held.on('close', () => resolve(true));
    held.on('error', () => undefined);
    held.resume(); // unread data would keep the socket from ever reporting its end
    setTimeout(() => resolve(false), 2_000).unref();
  });
  await new Promise((resolve) => held.write(`GET /v1/health HTTP/1.1\r\nHost: 127.0.0.1:${l.port}\r\nX-Creds-Bridge: ${l.key}\r\n\r\n`, resolve));
  await new Promise((resolve) => setTimeout(resolve, 100));
  held.write(`GET /v1/health HTTP/1.1\r\nHost: 127.0.0.1:${l.port}\r\nX-Part`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  return { held, ended };
}

test('D5: the key dies with the listener — new connections are refused, and a held-open connection is cut', async () => {
  const s = new Spied();
  const l = await s.listeners.open(CONTEXT);
  const agent = new http.Agent({ keepAlive: true });
  const { held, ended } = await heldOpen(l);
  try {
    assert.equal((await raw(l.port, '/v1/health', keyed(l), { agent })).status, 200, 'served while open, on a kept-alive agent');
    const closing = l.close();
    assert.equal(await ended, true, 'the held connection was cut by close()');
    await closing;
    assert.ok(await refuses(l.port), 'a new connection is refused');
    await assert.rejects(raw(l.port, '/v1/health', keyed(l), { agent }), 'the kept-alive agent gets no answer');
  } finally {
    held.destroy();
    agent.destroy();
    s.listeners.closeAll();
  }
});

test('D5: closeAll cuts a held-open connection too — dispose does not leave a key that still answers', async () => {
  const s = new Spied();
  const l = await s.listeners.open(CONTEXT);
  const { held, ended } = await heldOpen(l);
  try {
    s.listeners.closeAll();
    assert.equal(await ended, true, 'the held connection was cut by closeAll()');
  } finally {
    held.destroy();
  }
});

test('D5: close() is memoised — a second call is the same promise and a no-op', async () => {
  const s = new Spied();
  const l = await s.listeners.open(CONTEXT);
  const first = l.close();
  assert.equal(l.close(), first);
  await first;
  await l.close();
  assert.deepEqual(s.listeners.ports(), []);
});

test('D6: two listeners at once — own port, key and context; closing one leaves the other serving', async () => {
  const s = new Spied();
  try {
    const a = await s.listeners.open(CONTEXT);
    const b = await s.listeners.open(OTHER);
    await raw(a.port, '/v1/health', keyed(a));
    await raw(b.port, '/v1/health', keyed(b));
    assert.deepEqual(s.seen.map((x) => x.bridge), [CONTEXT, OTHER]);
    await a.close();
    assert.ok(await refuses(a.port));
    assert.equal((await raw(b.port, '/v1/health', keyed(b))).status, 200);
    assert.deepEqual(s.listeners.ports(), [b.port]);
  } finally {
    s.listeners.closeAll();
  }
});

test('D7: the right key reaches the router with its context — frozen, equal, no key; the other doors see undefined', async () => {
  const s = new Spied();
  const main = await startLoopbackServer();
  const socketLike = await startLoopbackServer();
  s.mainPort = main.port;
  main.server.on('request', s.doors.onThePort);
  socketLike.server.on('request', s.doors.onTheSocket);
  try {
    // A caller that hands `open` an object with a `key` on it (a cast, a spread of something wider) must not
    // see that key reach the router: the input has to carry one for the assertion below to mean anything.
    const carrying = { ...CONTEXT, key: SMUGGLED_KEY } as unknown as BridgeContext;
    assert.ok('key' in carrying);
    const l = await s.listeners.open(carrying);
    await raw(l.port, '/v1/health', keyed(l));
    await raw(main.port, '/v1/health', { Host: `127.0.0.1:${main.port}` });
    await raw(socketLike.port, '/v1/health', { Host: 'anything' });
    const [onBridge, onPort, onSocket] = s.seen;
    assert.deepEqual(onBridge.bridge, CONTEXT);
    assert.ok(Object.isFrozen(onBridge.bridge));
    assert.ok(!('key' in (onBridge.bridge as object)));
    assert.ok(!JSON.stringify(onBridge.bridge).includes(SMUGGLED_KEY), 'a key on the input is not handed on');
    assert.ok(!JSON.stringify(onBridge.bridge).includes(l.key), 'the key is nowhere in what the router is given');
    assert.equal(onPort.bridge, undefined);
    assert.equal(onSocket.bridge, undefined);
  } finally {
    s.listeners.closeAll();
    main.server.close();
    socketLike.server.close();
  }
});

test('D8: nothing in a request sets the context — headers and a query string naming another entry change nothing', async () => {
  const s = new Spied();
  try {
    const l = await s.listeners.open(CONTEXT);
    await raw(
      l.port,
      '/v1/health?server=entry-server-2&serverEntityId=entry-server-2&bridgeId=bridge-2',
      keyed(l, { 'X-Creds-Server': 'other', 'X-Bridge-Id': 'other', 'X-Creds-Server-Entity': 'entry-server-2' }),
    );
    assert.equal(s.seen.length, 1);
    assert.deepEqual(s.seen[0].bridge, CONTEXT);
  } finally {
    s.listeners.closeAll();
  }
});

test('D10: each note is said once per window, across listeners', async () => {
  const s = new Spied();
  try {
    const a = await s.listeners.open(CONTEXT);
    const b = await s.listeners.open(OTHER);
    for (const l of [a, b]) {
      await raw(l.port, '/v1/health', keyed(l, { Origin: 'http://evil.example' }));
      await raw(l.port, '/v1/health', { Host: `127.0.0.1:${l.port}` });
      await raw(l.port, '/v1/health', { Host: `127.0.0.1:${l.port}`, 'X-Creds-Bridge': 'wrong' });
    }
    const browser = s.notes.filter((n) => n.includes('browser-shaped'));
    const key = s.notes.filter((n) => n.includes('without its key'));
    assert.equal(browser.length, 1);
    assert.equal(key.length, 1);
    assert.equal(s.notes.length, 2, 'and no other note');
    assert.equal(
      key[0],
      'Something on this machine called a Remote Bridge listener without its key, and it was refused. Nothing ran and nothing was asked of you. An older creds on that server does this too; updating it stops this line.',
    );
    assert.ok(!key[0].includes(a.key) && !key[0].includes(b.key), 'no key in a note');
  } finally {
    s.listeners.closeAll();
  }
});

test('D16: the right key sent twice is a wrong key', async () => {
  const s = new Spied();
  try {
    const l = await s.listeners.open(CONTEXT);
    const reply = await raw(l.port, '/v1/health', { Host: `127.0.0.1:${l.port}`, 'X-Creds-Bridge': [l.key, l.key] });
    assert.equal(reply.status, 403);
    assert.equal(message(reply), BRIDGE_WRONG_KEY);
    assert.equal(s.seen.length, 0);
  } finally {
    s.listeners.closeAll();
  }
});

/** A `start` whose FIRST call waits for the test, to make two opens for one id overlap. */
function gatedStart(): { start: () => ReturnType<typeof startLoopbackServer>; release: () => void; calls: () => number } {
  let calls = 0;
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    start: () => {
      calls += 1;
      return calls === 1 ? gate.then(() => startLoopbackServer()) : startLoopbackServer();
    },
    release: () => release(),
    calls: () => calls,
  };
}

test('D12: two overlapping opens for one id — only the second serves, the first port is dead and its key is wrong', async () => {
  const s = new Spied();
  const gated = gatedStart();
  const listeners = new BridgeListeners((port, key, context) => s.doors.forBridge(port, key, context), gated.start);
  try {
    const first = listeners.open(CONTEXT);
    const second = listeners.open(CONTEXT);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(gated.calls(), 1, 'the second open waits its turn: it has not started a server');
    gated.release();
    const [a, b] = await Promise.all([first, second]);

    assert.equal((await raw(b.port, '/v1/health', keyed(b))).status, 200, 'the second serves');
    assert.ok(await refuses(a.port), 'the first port refuses connections');
    const stale = await raw(b.port, '/v1/health', { Host: `127.0.0.1:${b.port}`, 'X-Creds-Bridge': a.key });
    assert.equal(message(stale), BRIDGE_WRONG_KEY);
    assert.deepEqual(listeners.ports(), [b.port]);
  } finally {
    listeners.closeAll();
  }
});

/** Every call of `start` waits for its own release, in the order the test chooses. */
function steppedStart(): { start: () => ReturnType<typeof startLoopbackServer>; release: (call: number) => void; calls: () => number } {
  const gates: (() => void)[] = [];
  return {
    start: () => {
      const gate = new Promise<void>((resolve) => gates.push(resolve));
      return gate.then(() => startLoopbackServer());
    },
    release: (call) => gates[call - 1](),
    calls: () => gates.length,
  };
}

test('D12: three overlapping opens for one id run one after another — only the third serves, the other two ports are dead', async () => {
  const s = new Spied();
  const stepped = steppedStart();
  const listeners = new BridgeListeners((port, key, context) => s.doors.forBridge(port, key, context), stepped.start);
  try {
    const first = listeners.open(CONTEXT);
    const second = listeners.open(CONTEXT);
    const third = listeners.open(CONTEXT);
    await pause(50);
    assert.equal(stepped.calls(), 1, 'only the first has started a server: the others wait their turn');
    stepped.release(1);
    await first;
    await pause(50);
    assert.equal(stepped.calls(), 2, 'the third waits for the SECOND, not only for the first');
    stepped.release(2);
    await second;
    await pause(50);
    assert.equal(stepped.calls(), 3);
    stepped.release(3);
    const [a, b, c] = await Promise.all([first, second, third]);

    assert.equal((await raw(c.port, '/v1/health', keyed(c))).status, 200, 'the third serves');
    assert.ok(await refuses(a.port), 'the first port is dead');
    assert.ok(await refuses(b.port), 'the second port is dead');
    for (const old of [a, b]) {
      assert.equal(message(await raw(c.port, '/v1/health', { Host: `127.0.0.1:${c.port}`, 'X-Creds-Bridge': old.key })), BRIDGE_WRONG_KEY);
    }
    assert.deepEqual(listeners.ports(), [c.port], 'one entry');
  } finally {
    listeners.closeAll();
  }
});

test('D12: a third open waits for the second whatever became of it', async () => {
  const s = new Spied();
  let calls = 0;
  const listeners = new BridgeListeners(
    (port, key, context) => s.doors.forBridge(port, key, context),
    () => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('the first bind failed')) : startLoopbackServer();
    },
  );
  try {
    const first = listeners.open(CONTEXT);
    const second = listeners.open(CONTEXT);
    await assert.rejects(first, /the first bind failed/);
    const l = await second;
    assert.equal((await raw(l.port, '/v1/health', keyed(l))).status, 200, 'a failed open does not wedge the id');
  } finally {
    listeners.closeAll();
  }
});

test('D13: open after closeAll rejects with the disposed sentence and binds nothing', async () => {
  const s = new Spied();
  let started = 0;
  const listeners = new BridgeListeners(
    (port, key, context) => s.doors.forBridge(port, key, context),
    () => {
      started += 1;
      return startLoopbackServer();
    },
  );
  listeners.closeAll();
  await assert.rejects(listeners.open(CONTEXT), new Error('The broker is disposed; no Remote Bridge can open.'));
  assert.equal(started, 0);
  assert.deepEqual(listeners.ports(), []);
});

test('D13: an open whose start resolves after closeAll leaves no listening port', async () => {
  const s = new Spied();
  const gated = gatedStart();
  let bound = 0;
  const listeners = new BridgeListeners(
    (port, key, context) => s.doors.forBridge(port, key, context),
    async () => {
      const started = await gated.start();
      bound = started.port;
      return started;
    },
  );
  const pending = listeners.open(CONTEXT);
  const outcome = assert.rejects(pending, new Error('The broker is disposed; no Remote Bridge can open.'));
  await new Promise((resolve) => setTimeout(resolve, 20));
  listeners.closeAll();
  gated.release();
  await outcome;
  assert.notEqual(bound, 0, 'the server really was bound');
  assert.ok(await refuses(bound), 'and it is not listening');
  assert.deepEqual(listeners.ports(), []);
});

test('D13: a closeAll while the superseded listener is still closing rejects the open — it never resolves with a dead listener', async () => {
  const s = new Spied();
  const bound: number[] = [];
  let calls = 0;
  let closeBegan = (): void => undefined;
  const began = new Promise<void>((resolve) => {
    closeBegan = resolve;
  });
  let finishClose = (): void => undefined;
  const listeners = new BridgeListeners(
    (port, key, context) => s.doors.forBridge(port, key, context),
    async () => {
      const started = await startLoopbackServer();
      bound.push(started.port);
      calls += 1;
      if (calls === 1) {
        // The FIRST listener's close is held, so the second open sits at `await previous.listener.close()`.
        const realClose = started.server.close.bind(started.server);
        started.server.close = ((callback?: (error?: Error) => void) => {
          finishClose = () => void realClose(callback);
          closeBegan();
          return started.server;
        }) as typeof started.server.close;
      }
      return started;
    },
  );
  try {
    await listeners.open(CONTEXT);
    const second = listeners.open(CONTEXT);
    const outcome = assert.rejects(second, new Error('The broker is disposed; no Remote Bridge can open.'));
    await began;
    assert.equal(bound.length, 2, 'the second listener is bound and registered; the open is waiting on the first one closing');
    listeners.closeAll();
    finishClose();
    await outcome;
    assert.deepEqual(listeners.ports(), []);
    assert.ok(await refuses(bound[1]), 'and the second port is not listening');
  } finally {
    finishClose();
    listeners.closeAll();
  }
});

test('closeAll is synchronous: the ports are gone when it returns, and every listener is closed', async () => {
  const s = new Spied();
  const a = await s.listeners.open(CONTEXT);
  const b = await s.listeners.open(OTHER);
  s.listeners.closeAll();
  assert.deepEqual(s.listeners.ports(), []);
  assert.ok(await refuses(a.port));
  assert.ok(await refuses(b.port));
});

test('open refuses an empty identity before it binds anything', async () => {
  const s = new Spied();
  let started = 0;
  const listeners = new BridgeListeners(
    (port, key, context) => s.doors.forBridge(port, key, context),
    () => {
      started += 1;
      return startLoopbackServer();
    },
  );
  await assert.rejects(listeners.open({ ...CONTEXT, serverEntityId: '' }), /non-empty serverEntityId/);
  assert.equal(started, 0);
});

test('open refuses a missing identity field before it binds anything — it does not pass as undefined', async () => {
  const s = new Spied();
  let started = 0;
  const listeners = new BridgeListeners(
    (port, key, context) => s.doors.forBridge(port, key, context),
    () => {
      started += 1;
      return startLoopbackServer();
    },
  );
  const lacking: Record<string, unknown> = { ...CONTEXT };
  delete lacking.serverName;
  try {
    await assert.rejects(listeners.open(lacking as unknown as BridgeContext), /non-empty serverName/);
    assert.equal(started, 0);
    assert.deepEqual(listeners.ports(), []);
  } finally {
    listeners.closeAll();
  }
});

test('the listener hands the router a context that is a frozen copy, not the caller\'s object', async () => {
  const s = new Spied();
  try {
    const mine = { ...CONTEXT };
    const l = await s.listeners.open(mine);
    mine.serverEntityId = 'changed-afterwards';
    await raw(l.port, '/v1/health', keyed(l));
    assert.equal(s.seen[0].bridge?.serverEntityId, 'entry-server-1');
  } finally {
    s.listeners.closeAll();
  }
});

test('turns: the chain entry of a bridge id is dropped when its turn settles — opens for many distinct ids leave nothing behind, a failed open included', async () => {
  const spied = new Spied();
  try {
    for (const id of ['t-a', 't-b', 't-c']) {
      await spied.listeners.open({ ...CONTEXT, bridgeId: id });
    }
    await assert.rejects(spied.listeners.open({ ...CONTEXT, bridgeId: 't-d' }, () => Promise.reject(new Error('the broker would not start'))));
    assert.equal(spied.listeners.pendingTurns(), 0, 'one entry per distinct bridge id, for ever, is a leak');
  } finally {
    spied.listeners.closeAll();
  }
});

test('turns: overlapping opens of ONE id still run one after another, and the first settling does not drop the entry the second still owns', async () => {
  const spied = new Spied();
  const order: string[] = [];
  const gate = (): { wait: Promise<void>; release(): void } => {
    let release = (): void => undefined;
    return { wait: new Promise<void>((resolve) => { release = resolve; }), release: () => release() };
  };
  const [one, two] = [gate(), gate()];
  try {
    const first = spied.listeners.open({ ...CONTEXT, bridgeId: 't-same' }, async () => {
      order.push('first starts');
      await one.wait;
      order.push('first ends');
    });
    const second = spied.listeners.open({ ...CONTEXT, bridgeId: 't-same' }, async () => {
      order.push('second starts');
      await two.wait;
    });
    await pause(30);
    assert.deepEqual(order, ['first starts'], 'the second waits for the first');
    one.release();
    await first;
    await pause(30);
    assert.deepEqual(order, ['first starts', 'first ends', 'second starts']);
    assert.equal(spied.listeners.pendingTurns(), 1, 'the first settled; the second still owns the entry');
    two.release();
    await second;
    await pause(30);
    assert.equal(spied.listeners.pendingTurns(), 0, 'and the last to settle drops it');
  } finally {
    one.release();
    two.release();
    spied.listeners.closeAll();
  }
});
