import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import * as http from 'node:http';
import { call, code, share, world } from './brokerWorld';

/**
 * A raw request, because `fetch` will not let a caller set `Host` — it is a forbidden header name and
 * is silently replaced. A rebound browser sends it for real, so the test has to as well.
 */
function raw(port: number, path: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, path, method: 'GET', headers }, (response) => {
      let text = '';
      response.on('data', (chunk) => {
        text += String(chunk);
      });
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body: text }));
    });
    request.on('error', reject);
    request.end();
  });
}

/**
 * The door, over real HTTP — that the refusal happens BEFORE anything routes.
 *
 * <p>`brokerOrigin.test.ts` decides the headers; this proves where the decision is applied. The
 * alias door is the one that matters: it needs no token, its authorisation is a rate limit and the
 * consent modal, so before this a page the person merely visited could raise that modal in their
 * editor and — on Allow — run the stored command.</p>
 */

test('an Origin header is refused at the door, and no dialog is raised — both doors', async () => {
  const w = world({
    alias: { accountId: 'a1', entityId: 'e1', entityName: 'prod', kind: 'ssh' },
    secrets: [],
  });
  try {
    const { port, secret } = await share(w);
    const browser = { Origin: 'http://evil.example' };

    const token = await call(port, '/v1/use/exec', { token: secret, body: { command: 'id' }, headers: browser });
    const alias = await call(port, '/v1/alias/exec', { body: { alias: 'prod', command: 'id' }, headers: browser });

    assert.equal(code(token), 'forbidden');
    assert.equal(code(alias), 'forbidden');
    assert.deepEqual(w.ran, [], 'nothing ran');
    assert.deepEqual(w.dialogs, [], 'and nobody was asked — the modal is the whole point');
  } finally {
    w.server.dispose();
  }
});

test('the unauthenticated read routes are behind the door too', async () => {
  // These authenticate nothing by design, and they are what a rebound page would read: alias names,
  // entry names, folders. `Origin` does not catch a rebind — `Host` does — but both arrive here.
  const w = world({ aliasList: [{ name: 'prod', kind: 'ssh' }] });
  try {
    const { port } = await share(w);

    const open = await call(port, '/v1/aliases', { method: 'GET' });
    const shut = await call(port, '/v1/aliases', { method: 'GET', headers: { Origin: 'http://evil.example' } });

    assert.equal(open.status, 200, 'a real client still reads them');
    assert.equal(code(shut), 'forbidden');
  } finally {
    w.server.dispose();
  }
});

test('a rebound Host is refused even with no Origin at all — health included', async () => {
  // The DNS-rebinding shape: the page is same-origin after the rebind, so the browser sends no
  // Origin on its GET. What it cannot forge is the name it was loaded from.
  const w = world({});
  try {
    const { port } = await share(w);

    const real = await raw(port, '/v1/health', { Host: `127.0.0.1:${port}` });
    const rebound = await raw(port, '/v1/health', { Host: 'evil.example' });
    const wrongPort = await raw(port, '/v1/health', { Host: `127.0.0.1:${port + 1}` });

    assert.equal(real.status, 200, 'the address a real client composes');
    assert.equal(rebound.status, 403);
    assert.match(rebound.body, /not a web service/);
    assert.equal(wrongPort.status, 403, 'a browser sends the port it connected to');
  } finally {
    w.server.dispose();
  }
});

test('the refusal says what this is', async () => {
  const w = world({});
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/health', { method: 'GET', headers: { Origin: 'null' } });

    assert.match(String((answer.body as { error?: { message?: string } }).error?.message), /not a web service/);
  } finally {
    w.server.dispose();
  }
});
