import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { MAX_UNIX_SOCKET_PATH, socketPathFor, startExtraListener } from '../brokerListeners';

/**
 * The second way in to the broker. What these pin is mostly that it behaves like the port —
 * the same handler, the same answers — and that it cleans up after itself, because a socket
 * left behind by a crashed window is what makes the next one fail to start.
 */

test('the path carries the pid, so two windows of one profile cannot collide', () => {
  const a = socketPathFor('/tmp/store', 111, 'linux');
  const b = socketPathFor('/tmp/store', 222, 'linux');

  assert.notEqual(a, b);
  assert.match(a ?? '', /111/);
});

test('Windows gets a pipe name, not a file path', () => {
  const address = socketPathFor('C:/Users/dev/store', 4242, 'win32');

  assert.equal(address, '\\\\.\\pipe\\creds-for-devs-4242');
  assert.equal(address?.includes('C:/Users'), false, 'a pipe is not in the storage directory');
});

test('a storage path too long for a unix socket is refused here, not at listen()', () => {
  // The OS limit is around 104 bytes and real globalStorage paths get close. Failing at
  // `listen` would surface as EADDRINUSE-adjacent noise nobody can act on; answering
  // `undefined` lets the caller run with the port alone, which still works.
  const deep = '/home/dev/' + 'nested/'.repeat(20) + 'storage';
  assert.ok(deep.length > MAX_UNIX_SOCKET_PATH);

  assert.equal(socketPathFor(deep, 1, 'linux'), undefined);
});

test('a path that fits is returned as it is', () => {
  const address = socketPathFor('/tmp/s', 7, 'linux');

  assert.equal(address, path.join('/tmp/s', 'broker-7.sock'));
});

/* --- the live half: POSIX only, because a named pipe needs no unlink and no chmod --- */

const posixOnly = process.platform === 'win32' ? { skip: 'unix sockets only' } : {};

test('the socket answers exactly what the port would, from the same handler', posixOnly, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-sock-'));
  const handler: http.RequestListener = (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'creds-for-devs-agent' }));
  };
  const address = socketPathFor(dir, process.pid, process.platform) as string;
  const listener = await startExtraListener(handler, address, process.platform);

  try {
    // `http.request` with `socketPath` is how a client actually reaches a unix socket, and is
    // what the bridge relays into — `fetch` has no portable way to name one.
    const body = await new Promise<string>((resolve, reject) => {
      const req = http.request({ socketPath: address, path: '/v1/health', method: 'GET' }, (res) => {
        let text = '';
        res.on('data', (chunk) => (text += String(chunk)));
        res.on('end', () => resolve(text));
      });
      req.on('error', reject);
      req.end();
    });

    assert.deepEqual(JSON.parse(body), { ok: true, service: 'creds-for-devs-agent' });
  } finally {
    await listener.close();
  }
});

test('the socket is owner-only, which the loopback port never was', posixOnly, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-sock-'));
  const address = socketPathFor(dir, process.pid, process.platform) as string;
  const listener = await startExtraListener(() => {}, address, process.platform);

  try {
    const mode = fs.statSync(address).mode & 0o777;
    assert.equal(mode, 0o600, `mode was 0${mode.toString(8)}`);
  } finally {
    await listener.close();
  }
});

test('closing removes the socket, so the next window is not blocked by a corpse', posixOnly, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-sock-'));
  const address = socketPathFor(dir, process.pid, process.platform) as string;
  const listener = await startExtraListener(() => {}, address, process.platform);
  assert.equal(fs.existsSync(address), true);

  await listener.close();

  assert.equal(fs.existsSync(address), false);
});

test('a socket left by a killed window does not stop the next one binding', posixOnly, async () => {
  // The path carries the pid, so anything already there belongs to a process that is gone.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-sock-'));
  const address = socketPathFor(dir, process.pid, process.platform) as string;
  fs.writeFileSync(address, 'a corpse from a killed window');

  const listener = await startExtraListener(() => {}, address, process.platform);

  try {
    assert.equal(fs.statSync(address).isSocket(), true, 'the stale file was replaced by a socket');
  } finally {
    await listener.close();
  }
});
