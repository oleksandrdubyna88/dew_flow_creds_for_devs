import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { BridgeContext } from '../bridgeContext';
import { BRIDGE_NOT_SERVED } from '../bridgeAllowList';
import { socketPathFor } from '../brokerListeners';
import { CONTEXT, OTHER, Reply, code, emptyWall, keyed, message, pause, raw, refuses } from './bridgeDoorHarness';
import { call, share, world } from './brokerWorld';

/**
 * The third door in front of the REAL broker (E1.2, D1, D3, D9-D11, K5, K10 and the late open).
 *
 * <p>`brokerBridgeListeners.test.ts` puts a spy where the router would be; here nothing is replaced, so what
 * these show is what `handle`, the guard and `dispose` really do behind the door.</p>
 */

test('D9: the real router — health is served, a route the table does not serve is a not_supported with Connection: close', async () => {
  const w = world({ aliasList: [{ name: 'prod', kind: 'ssh' }], hooks: emptyWall() });
  try {
    const { port: main } = await share(w);
    const l = await w.server.openBridgeListener(CONTEXT);
    const theirs = await raw(l.port, '/v1/health', keyed(l));
    const ours = await raw(main, '/v1/health', { Host: `127.0.0.1:${main}` });
    assert.equal(theirs.status, 200);
    assert.equal(theirs.body, ours.body, 'its usual body');

    // E1.2 served health alone; from E1.3 the table serves more (`bridgeAllowList.test.ts` pins exactly what),
    // so what is asked here is a route it does not.
    const refused: [string, string][] = [
      ['POST', '/v1/use/run'],
      ['POST', '/v1/config/read'],
      ['GET', '/v1/nope'],
      ['POST', '/v1/mcp/delete'],
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
    assert.equal(JSON.parse((await raw(l.port, '/v1/aliases', keyed(l))).body).aliases.length, 0, 'and the bridge lists nothing of a vault whose scope is empty');
  } finally {
    w.server.dispose();
  }
});

test('D1 on the real broker: a refusal runs nothing and asks nobody', async () => {
  const w = world({ alias: { accountId: 'a1', entityId: 'e1', entityName: 'prod', kind: 'ssh' }, secrets: [], hooks: emptyWall() });
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
  const w = world({ aliasList: [{ name: 'prod', kind: 'ssh' }], hooks: emptyWall() });
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

test('D3: the key header changes nothing on the socket door either', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-d3-'));
  const w = world({ aliasList: [{ name: 'prod', kind: 'ssh' }], storageDir: dir, hooks: emptyWall() });
  try {
    await share(w);
    const l = await w.server.openBridgeListener(CONTEXT);
    const socketPath = socketPathFor(dir, process.pid, process.platform) as string;
    const onSocket = (headers: http.OutgoingHttpHeaders): Promise<Reply> => raw(0, '/v1/aliases', headers, { socketPath });
    const plain = await onSocket({});
    const withKey = await onSocket({ 'X-Creds-Bridge': l.key });
    const wrong = await onSocket({ 'X-Creds-Bridge': 'junk' });
    assert.equal(plain.status, 200);
    assert.deepEqual([withKey.status, withKey.body], [plain.status, plain.body]);
    assert.deepEqual([wrong.status, wrong.body], [plain.status, plain.body]);
  } finally {
    w.server.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('K5: through the real handle — a server named in a header, a query or a body never reaches or alters the context', async () => {
  const w = world({ aliasList: [{ name: 'prod', kind: 'ssh' }], hooks: emptyWall() });
  try {
    const { port: main } = await share(w);
    // The real `handle` is called; this only records the third argument it was given and what it looked like after.
    const inner = w.server as unknown as {
      handle: (req: http.IncomingMessage, res: http.ServerResponse, bridge: BridgeContext | undefined) => Promise<void>;
    };
    const real = inner.handle.bind(inner);
    const seen: { bridge: BridgeContext | undefined; before: string; after: string }[] = [];
    inner.handle = async (req, res, bridge) => {
      const before = JSON.stringify(bridge);
      await real(req, res, bridge);
      seen.push({ bridge, before, after: JSON.stringify(bridge) });
    };
    const l = await w.server.openBridgeListener(CONTEXT);
    const claims = { 'X-Creds-Server': 'entry-server-2', 'X-Bridge-Id': 'bridge-2', 'X-Creds-Server-Entity': 'entry-server-2' };
    const plain = await raw(l.port, '/v1/health', keyed(l));
    const claiming = await raw(l.port, '/v1/health?server=entry-server-2&bridgeId=bridge-2', keyed(l, claims));
    const refused = await raw(l.port, '/v1/use/run', keyed(l, claims), { method: 'POST', body: '{"server":"entry-server-2","command":"id"}' });
    await raw(main, '/v1/health', { Host: `127.0.0.1:${main}`, ...claims });

    await pause(50);
    assert.equal(seen.length, 4, 'every request went through the real handle');
    assert.deepEqual([claiming.status, claiming.body], [plain.status, plain.body], 'the answer is the same');
    assert.equal(code(refused), 'not_supported');
    for (const request of seen.slice(0, 3)) {
      assert.deepEqual(request.bridge, CONTEXT, 'the context handle was given is the one the open made');
      assert.ok(Object.isFrozen(request.bridge));
      assert.equal(request.after, request.before, 'and handle left it as it found it');
    }
    assert.equal(seen[1].bridge, seen[0].bridge, 'one object for the life of the listener, not one made per request');
    assert.equal(seen[3].bridge, undefined, 'the main port still hands handle no context');
    assert.deepEqual(w.ran, []);
  } finally {
    w.server.dispose();
  }
});

test('K10: a refused route is answered before its body arrives — Content-Length 1000, five bytes sent, still a 404', async () => {
  const w = world({ hooks: emptyWall() });
  try {
    await share(w);
    const l = await w.server.openBridgeListener(CONTEXT);
    const socket = net.connect(l.port, '127.0.0.1');
    const answered = new Promise<string>((resolve, reject) => {
      let text = '';
      socket.on('data', (chunk) => {
        text += String(chunk);
      });
      socket.on('end', () => resolve(text));
      socket.on('close', () => resolve(text));
      socket.on('error', () => undefined);
      setTimeout(() => reject(new Error('no answer while the body was still incomplete: the body was read before the route was refused')), 2_000).unref();
    });
    socket.write(
      `POST /v1/use/run HTTP/1.1\r\nHost: 127.0.0.1:${l.port}\r\nX-Creds-Bridge: ${l.key}\r\n`
        + 'Content-Type: application/json\r\nContent-Length: 1000\r\n\r\n{"com',
    );
    try {
      const text = await answered;
      assert.match(text, /^HTTP\/1\.1 404 /);
      assert.match(text, /connection: close/i);
      assert.ok(text.includes(BRIDGE_NOT_SERVED));
    } finally {
      socket.destroy();
    }
    assert.deepEqual(w.ran, []);
  } finally {
    w.server.dispose();
  }
});

test('openBridgeListener after dispose refuses before it starts anything — no main port, no note, no output channel', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-late-'));
  const w = world({ storageDir: dir, hooks: emptyWall() });
  try {
    w.server.dispose();
    await assert.rejects(w.server.openBridgeListener(CONTEXT), new Error('The broker is disposed; no Remote Bridge can open.'));
    const inside = w.server as unknown as { server: http.Server | undefined; port: number };
    assert.equal(inside.server, undefined, 'the main port was not bound');
    assert.equal(inside.port, 0);
    assert.equal(w.outputChannels, 0, 'the output channel was not created');
    assert.deepEqual(fs.readdirSync(dir), [], 'no endpoint note and no journal file were written');
    assert.deepEqual(w.audit, []);
  } finally {
    w.server.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('D10 on the real broker: the key note and the browser note are each said once in the journal', async () => {
  const w = world({ hooks: emptyWall() });
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
  const w = world({ hooks: emptyWall() });
  await share(w);
  const a = await w.server.openBridgeListener(CONTEXT);
  const b = await w.server.openBridgeListener(OTHER);
  assert.equal((await raw(a.port, '/v1/health', keyed(a))).status, 200);
  w.server.dispose();
  assert.ok(await refuses(a.port));
  assert.ok(await refuses(b.port));
});

