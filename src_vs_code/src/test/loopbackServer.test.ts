import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { startLoopbackServer } from '../loopbackServer';

/**
 * The listener the OAuth redirect catcher, the WebAuthn bridge and the agent broker share
 * (audit A3).
 *
 * <p>Eight lines, and the reason they were centralised is that all three carry a security
 * property that is easy to lose in a copy: the socket binds 127.0.0.1 and NOTHING ELSE. A
 * bind to 0.0.0.0 would put an OAuth code catcher and an agent broker on every interface of
 * the machine, reachable from the network, and it would look identical in every test that
 * only checked "a port came back".</p>
 */

test('it binds LOOPBACK, never every interface', async () => {
  const { server, port } = await startLoopbackServer();

  try {
    const address = server.address() as AddressInfo;
    assert.equal(address.address, '127.0.0.1', 'not 0.0.0.0 — nothing here is for the network');
    assert.equal(address.port, port, 'and the reported port is the one it is listening on');
  } finally {
    server.close();
  }
});

test('the port is assigned by the OS and is already listening when it resolves', async () => {
  // The caller's next move is to put this port into a redirect URI, so a promise that
  // resolved before the socket was up would produce a race nobody could reproduce.
  const { server, port } = await startLoopbackServer();

  try {
    assert.ok(port > 0 && port < 65536, `a real port: ${port}`);
    assert.equal(server.listening, true);
  } finally {
    server.close();
  }
});

test('two listeners get two different ports', async () => {
  // Port 0 each time, so a second window opening a second broker cannot collide with the first.
  const a = await startLoopbackServer();
  const b = await startLoopbackServer();

  try {
    assert.notEqual(a.port, b.port);
  } finally {
    a.server.close();
    b.server.close();
  }
});
