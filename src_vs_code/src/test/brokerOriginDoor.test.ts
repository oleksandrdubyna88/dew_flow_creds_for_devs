import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { socketPathFor } from '../brokerListeners';
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

/**
 * The OTHER listener — and the reason this test exists at all.
 *
 * <p>Both listeners share one router, so the socket inherited the `Host` check, and there is no
 * `Host` a socket client can pass: it was never told a port. The alias call over the socket — the
 * WSL bridge's whole reason for existing — started answering 403, and it reached main, because the
 * only thing exercising that path was a POSIX-only case in the CLI integration suite.</p>
 *
 * <p>This drives the real second listener through the real door on BOTH platforms: a unix socket on
 * POSIX, a named pipe on Windows. Nothing else in the unit suite had ever opened it.</p>
 */

/**
 * A request down the socket or pipe — there is no port here, which is the whole point.
 *
 * <p>The status can come back as `'closed'` rather than as a number: the door answers and then
 * closes (`Connection: close`, because the body was never read), and over a pipe that close can
 * beat the client's own write, which then sees EPIPE. So the CLIENT's view cannot decide whether a
 * refusal happened — a crash looks the same from here, which the review gate pointed out is a test
 * that passes for a door that stopped working. What decides is the note the door says, which is
 * server-side and deterministic: see `refusedAtTheDoor`.</p>
 */
function overSocket(socketPath: string, route: string, headers: Record<string, string>): Promise<number | 'closed'> {
  return new Promise((resolve, reject) => {
    const request = http.request({ socketPath, path: route, method: 'GET', headers }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode ?? 0));
    });
    request.on('error', (error: NodeJS.ErrnoException) => {
      const hungUp = error.code === 'EPIPE' || error.code === 'ECONNRESET';
      return hungUp ? resolve('closed') : reject(error);
    });
    onlyForSoLong(request, reject);
    request.end();
  });
}

/** The door's own record that it turned something away — said once per window, into the journal. */
const saidSo = (w: { audit: string[] }): boolean =>
  w.audit.some((line) => line.includes('browser-shaped request'));

/**
 * Wait for that record.
 *
 * <p>Over a pipe the client can see its own write fail before the server has finished answering,
 * so "the client is back" is not "the server is done". Polling rather than sleeping: it returns the
 * moment the note is there, so the green case costs a few milliseconds. The budget is generous
 * because a tight one is a flaky test on a loaded runner and buys nothing — a real regression never
 * produces the note at all, and then this is two seconds, once.</p>
 */
async function refusedAtTheDoor(w: { audit: string[] }): Promise<boolean> {
  for (let waited = 0; waited < WAIT_FOR_THE_NOTE_MS && !saidSo(w); waited += 5) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return saidSo(w);
}

const WAIT_FOR_THE_NOTE_MS = 2_000;

/**
 * How long a socket request may take before the test gives up.
 *
 * <p>Without one, a listener that accepts a connection and then stalls hangs the runner for ever:
 * `http.request` has no deadline of its own, and node:test never reaches the cleanup. A regression
 * should fail, not wedge CI.</p>
 */
const SOCKET_DEADLINE_MS = 5_000;

/** Destroy a request that is going nowhere, so the promise settles either way. */
function onlyForSoLong(request: http.ClientRequest, reject: (why: Error) => void): void {
  request.setTimeout(SOCKET_DEADLINE_MS, () => {
    const why = new Error(`no answer over the socket within ${SOCKET_DEADLINE_MS}ms`);
    request.destroy(why);
    reject(why);
  });
}

/** A window with its SECOND listener open, and the address a bridge would forward. */
function withSocket(): { w: ReturnType<typeof world>; address: string; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-door-'));
  const w = world({ storageDir: dir });
  const address = socketPathFor(dir, process.pid, process.platform);
  assert.notEqual(address, undefined, 'the harness knows where the second listener would be');
  return { w, address: address as string, dir };
}

/** A POST down the socket, since the token door is a POST route. */
function post(
  socketPath: string,
  route: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<{ status: number; body: string }> {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = http.request(
      { socketPath, path: route, method: 'POST', headers: { 'Content-Type': 'application/json', ...headers } },
      (response) => {
        let text = '';
        response.on('data', (chunk) => {
          text += String(chunk);
        });
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body: text }));
      },
    );
    request.on('error', reject);
    onlyForSoLong(request, reject);
    request.end(payload);
  });
}

/**
 * ONE window, three questions — because the pipe name carries the pid, so two windows in one test
 * process would fight over the same address. That is not a harness quirk: `socketPathFor` is per
 * pid precisely because one VS Code window is one process, and a second world here is a situation
 * the product does not have. Sequential subtests share the window, in the order the door sees them.
 */
test('the socket listener, through the real door', async (t) => {
  const { w, address, dir } = withSocket();
  try {
    await share(w);

    await t.test('admits a client that cannot name a port', async () => {
      // What the bridge sends: a URL it invented, because nobody told it a port.
      assert.equal(await overSocket(address, '/v1/health', { Host: '127.0.0.1:1' }), 200);
      assert.equal(await overSocket(address, '/v1/health', {}), 200, 'nor does having no Host at all');
      assert.equal(saidSo(w), false, 'and the door turned nothing away');
    });

    await t.test('still refuses the browser headers, which cost nothing to keep', async () => {
      const refused = await overSocket(address, '/v1/health', { Origin: 'https://evil.example' });

      // The client's view first — it must never be served — and then the door's own record, which
      // is what tells a REFUSAL from a crash. "Not 200" alone would pass for a listener that died.
      assert.notEqual(refused, 200, `a browser header must not be served, got ${String(refused)}`);
      assert.ok(await refusedAtTheDoor(w), 'the door has to say it turned this away');
    });

    await t.test('is not an authentication bypass: a call with no token is still refused', async () => {
      // The invariant the Host exemption rests on, asserted rather than assumed. The socket's own
      // guard is its file mode and the grant token; if this change had let the router run without
      // one, both subtests above would still pass. (A reviewer asked for exactly this.)
      const noToken = await post(address, '/v1/use/exec', {}, { command: 'id' });
      const wrongToken = await post(address, '/v1/use/exec', { Authorization: 'Bearer nope' }, { command: 'id' });

      assert.equal(noToken.status, 401, noToken.body);
      assert.equal(wrongToken.status, 401, wrongToken.body);
      assert.deepEqual(w.ran, [], 'and nothing ran');
      assert.deepEqual(w.dialogs, [], 'and nobody was asked');
    });
  } finally {
    w.server.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
