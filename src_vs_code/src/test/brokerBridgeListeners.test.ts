import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import * as net from 'node:net';
import { test } from 'node:test';
import { BridgeContext } from '../bridgeContext';
import { BRIDGE_NOT_SERVED } from '../bridgeAllowList';
import { BridgeListener, BridgeListeners } from '../brokerBridgeListeners';
import { BRIDGE_NO_KEY, BRIDGE_WRONG_KEY, doorsFor } from '../brokerOrigin';
import { startLoopbackServer } from '../loopbackServer';
import { call, share, world } from './brokerWorld';

/**
 * The third door over real HTTP, and the listener that owns it (E1.2, D1-D13 and D16).
 *
 * <p>Two harnesses. `Spied` puts a spy where the router would be, so a test can say what reached it and
 * with which context. `world` is the real broker, for what the real router does behind the door.</p>
 */

const CONTEXT: BridgeContext = {
  bridgeId: 'bridge-1',
  accountId: 'acct-1',
  serverEntityId: 'entry-server-1',
  serverName: 'prod-server',
  target: 'me@host:22',
  remoteOs: 'linux',
};
const OTHER: BridgeContext = { ...CONTEXT, bridgeId: 'bridge-2', serverEntityId: 'entry-server-2', serverName: 'other-server' };

interface Reply {
  readonly status: number;
  readonly body: string;
  readonly connection: string | undefined;
}

/** A request with the headers a test chooses, `Host` included — `fetch` would replace it. */
function raw(
  port: number,
  route: string,
  headers: http.OutgoingHttpHeaders,
  options: { method?: string; agent?: http.Agent; body?: string } = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: '127.0.0.1', port, path: route, method: options.method ?? 'GET', headers, agent: options.agent },
      (response) => {
        let text = '';
        response.on('data', (chunk) => {
          text += String(chunk);
        });
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body: text, connection: response.headers.connection }));
      },
    );
    request.on('error', reject);
    request.setTimeout(5_000, () => request.destroy(new Error(`no answer from port ${port} for ${route}`)));
    request.end(options.body);
  });
}

const message = (reply: Reply): string => (JSON.parse(reply.body) as { error: { message: string } }).error.message;
const code = (reply: Reply): string => (JSON.parse(reply.body) as { error: { code: string } }).error.code;

/** A connection attempt to a port nothing listens on is refused; this resolves true when it is. */
function refuses(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.on('connect', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(true));
  });
}

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

const keyed = (listener: BridgeListener, extra: http.OutgoingHttpHeaders = {}): http.OutgoingHttpHeaders => ({
  Host: `127.0.0.1:${listener.port}`,
  'X-Creds-Bridge': listener.key,
  ...extra,
});

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
    const l = await s.listeners.open(CONTEXT);
    await raw(l.port, '/v1/health', keyed(l));
    await raw(main.port, '/v1/health', { Host: `127.0.0.1:${main.port}` });
    await raw(socketLike.port, '/v1/health', { Host: 'anything' });
    const [onBridge, onPort, onSocket] = s.seen;
    assert.deepEqual(onBridge.bridge, CONTEXT);
    assert.ok(Object.isFrozen(onBridge.bridge));
    assert.ok(!('key' in (onBridge.bridge as object)));
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

/* ---------------- the real broker behind the door ---------------- */

test('D9: the real router — health is served, everything else is a not_supported with Connection: close', async () => {
  const w = world({ aliasList: [{ name: 'prod', kind: 'ssh' }] });
  try {
    const { port: main } = await share(w);
    const l = await w.server.openBridgeListener(CONTEXT);
    const theirs = await raw(l.port, '/v1/health', keyed(l));
    const ours = await raw(main, '/v1/health', { Host: `127.0.0.1:${main}` });
    assert.equal(theirs.status, 200);
    assert.equal(theirs.body, ours.body, 'its usual body');

    const refused: [string, string][] = [
      ['POST', '/v1/use/exec'],
      ['GET', '/v1/aliases'],
      ['POST', '/v1/config/read'],
      ['GET', '/v1/nope'],
      ['GET', '/v1/mcp/entries'],
    ];
    for (const [method, route] of refused) {
      const reply = await raw(l.port, route, keyed(l), { method, body: method === 'POST' ? '{"command":"id"}' : undefined });
      assert.equal(reply.status, 404, `${method} ${route}`);
      assert.equal(code(reply), 'not_supported', `${method} ${route}`);
      assert.equal(message(reply), BRIDGE_NOT_SERVED, `${method} ${route}`);
      assert.equal(reply.connection, 'close', `${method} ${route}`);
    }
    assert.deepEqual(w.ran, []);
    assert.deepEqual(w.dialogs, []);
    assert.equal((await call(main, '/v1/aliases', { method: 'GET' })).status, 200, 'the main port still serves what the bridge does not');
  } finally {
    w.server.dispose();
  }
});

test('D1 on the real broker: a refusal runs nothing and asks nobody', async () => {
  const w = world({ alias: { accountId: 'a1', entityId: 'e1', entityName: 'prod', kind: 'ssh' }, secrets: [] });
  try {
    await share(w);
    const l = await w.server.openBridgeListener(CONTEXT);
    const bad: http.OutgoingHttpHeaders[] = [
      { Host: `127.0.0.1:${l.port}` },
      { Host: `127.0.0.1:${l.port}`, 'X-Creds-Bridge': 'nope' },
      { Host: 'evil.example', 'X-Creds-Bridge': l.key },
      keyed(l, { Origin: 'http://evil.example' }),
    ];
    for (const headers of bad) {
      const reply = await raw(l.port, '/v1/alias/exec', headers, { method: 'POST', body: '{"alias":"prod","command":"id"}' });
      assert.equal(reply.status, 403, JSON.stringify(headers));
    }
    assert.deepEqual(w.ran, []);
    assert.deepEqual(w.dialogs, []);
  } finally {
    w.server.dispose();
  }
});

test('D3: the key header changes nothing on the main port', async () => {
  const w = world({ aliasList: [{ name: 'prod', kind: 'ssh' }] });
  try {
    const { port } = await share(w);
    const l = await w.server.openBridgeListener(CONTEXT);
    const plain = await raw(port, '/v1/aliases', { Host: `127.0.0.1:${port}` });
    const withKey = await raw(port, '/v1/aliases', { Host: `127.0.0.1:${port}`, 'X-Creds-Bridge': l.key });
    const wrong = await raw(port, '/v1/aliases', { Host: `127.0.0.1:${port}`, 'X-Creds-Bridge': 'junk' });
    assert.deepEqual([withKey.status, withKey.body], [plain.status, plain.body]);
    assert.deepEqual([wrong.status, wrong.body], [plain.status, plain.body]);
    assert.equal(plain.status, 200);
    const refused = await raw(port, '/v1/aliases', { Host: `127.0.0.1:${port + 1}`, 'X-Creds-Bridge': l.key });
    assert.equal(refused.status, 403, 'and a right key does not buy a wrong Host on the port');
    assert.match(message(refused), /not a web service/);
  } finally {
    w.server.dispose();
  }
});

test('D10 on the real broker: the key note and the browser note are each said once in the journal', async () => {
  const w = world({});
  try {
    const { port } = await share(w);
    const a = await w.server.openBridgeListener(CONTEXT);
    const b = await w.server.openBridgeListener(OTHER);
    for (const l of [a, b]) {
      await raw(l.port, '/v1/health', { Host: `127.0.0.1:${l.port}` });
      await raw(l.port, '/v1/health', { Host: `127.0.0.1:${l.port}` });
    }
    await raw(port, '/v1/health', { Host: `127.0.0.1:${port}`, Origin: 'http://evil.example' });
    await raw(a.port, '/v1/health', keyed(a, { Origin: 'http://evil.example' }));
    assert.equal(w.audit.filter((line) => line.includes('without its key')).length, 1);
    assert.equal(w.audit.filter((line) => line.includes('browser-shaped')).length, 1, 'one window, one browser note, whichever listener');
  } finally {
    w.server.dispose();
  }
});

test('D11: dispose closes every listener', async () => {
  const w = world({});
  await share(w);
  const a = await w.server.openBridgeListener(CONTEXT);
  const b = await w.server.openBridgeListener(OTHER);
  assert.equal((await raw(a.port, '/v1/health', keyed(a))).status, 200);
  w.server.dispose();
  assert.ok(await refuses(a.port));
  assert.ok(await refuses(b.port));
});
