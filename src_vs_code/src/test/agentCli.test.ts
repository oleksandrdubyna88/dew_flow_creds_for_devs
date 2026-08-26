import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { EXIT } from '../agentCliOutcome';
import { SERVICE_NAME } from '../brokerProtocol';
import { formatToken } from '../grantToken';

/**
 * The command an AI coding agent actually runs (audit A3).
 *
 * <p>`agentCliArgs`, `agentCliOutcome` and `grantToken` are pure and tested. This file has no
 * exports at all — it runs `main()` on import — so the only honest way to test it is the way
 * it is used: spawned as a process, pointed at a real loopback server.</p>
 *
 * <p><b>The property worth the setup is the pre-flight check.</b> A closed window frees its
 * port and the OS hands the number out again, so before the bearer token is sent anywhere the
 * CLI asks `/v1/health` whether the port still belongs to a CredsForDevs broker. Without it a
 * grant token would be posted to whatever unrelated process inherited the number. The test
 * below stands up a server that is NOT a broker and asserts it never sees an
 * `Authorization` header — which is the only way to observe that the token stayed home.</p>
 *
 * <p>The exit codes are the other half. A remote command's own code passes through untouched
 * so that `&&`, `||` and `$?` behave as they would around a real `ssh`; the mechanism's own
 * failures use a reserved band and always print a `[creds-for-devs]` line, so a collision with
 * a remote code is still legible.</p>
 */

const CLI = path.join(__dirname, '..', 'agentCli.js');

interface Received {
  method: string;
  url: string;
  authorization: string | undefined;
  body: string;
}

interface Broker {
  port: number;
  received: Received[];
  close(): void;
}

/** What a handler may answer: a value to serialise, or raw bytes for the malformed cases. */
type Answer = { status: number; body: unknown } | { status: number; raw: string };

/** A loopback server answering whatever the test tells it to. */
function broker(handler: (received: Received) => Answer): Promise<Broker> {
  const received: Received[] = [];
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (c: Buffer) => chunks.push(c));
      request.on('end', () => {
        const entry: Received = {
          method: request.method ?? '',
          url: request.url ?? '',
          authorization: request.headers.authorization,
          body: Buffer.concat(chunks).toString('utf8'),
        };
        received.push(entry);
        const answer = handler(entry);
        response.writeHead(answer.status, { 'Content-Type': 'application/json' });
        response.end('raw' in answer ? answer.raw : JSON.stringify(answer.body));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolve({
        port,
        received,
        close: (): void => {
          server.close();
        },
      });
    });
  });
}

/** The healthy answer, so a test only has to describe the call it cares about. */
function healthy(answer: (received: Received) => Answer): (received: Received) => Answer {
  return (received) =>
    received.url === '/v1/health'
      ? { status: 200, body: { service: SERVICE_NAME } }
      : answer(received);
}

function run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

const SECRET = 'abcdef0123456789';

test('a malformed token is refused BEFORE anything is sent anywhere', async () => {
  const result = await run(['ssh', 'not-a-token', '--', 'echo hi']);

  assert.equal(result.code, EXIT.usage);
  assert.match(result.stderr, /\[creds-for-devs\]/, 'the reserved band always announces itself');
  assert.match(result.stderr, /grant token/);
});

test('a port that is NOT a CredsForDevs broker never receives the token', async () => {
  // The whole reason the health check exists: a closed window frees its port and the OS hands
  // the number out again. Without this the bearer token would be posted to whatever process
  // inherited it.
  const impostor = await broker(() => ({ status: 200, body: { service: 'something-else' } }));
  try {
    const result = await run(['ssh', formatToken(impostor.port, SECRET), '--', 'echo hi']);

    assert.equal(result.code, EXIT.brokerUnreachable);
    assert.ok(
      impostor.received.every((r) => r.authorization === undefined),
      'the token was sent to a stranger: ' + JSON.stringify(impostor.received),
    );
    assert.ok(
      impostor.received.every((r) => !r.body.includes(SECRET)),
      'the secret appeared in a request body',
    );
  } finally {
    impostor.close();
  }
});

test('a port with nothing listening at all fails cleanly, and says why', async () => {
  const dead = await broker(() => ({ status: 200, body: {} }));
  const port = dead.port;
  dead.close();
  await new Promise((r) => setTimeout(r, 50));

  const result = await run(['ssh', formatToken(port, SECRET), '--', 'echo hi']);

  assert.equal(result.code, EXIT.brokerUnreachable);
  assert.match(result.stderr, /has closed or reloaded/, 'and tells the agent what to ask for');
});

test('a healthy broker gets the token as a Bearer header, and the command in the body', async () => {
  const server = await broker(
    healthy(() => ({ status: 200, body: { exitCode: 0, stdout: 'hello\n', stderr: '' } })),
  );
  try {
    const result = await run(['ssh', formatToken(server.port, SECRET), '--', 'echo hello']);

    const call = server.received.find((r) => r.url === '/v1/use/exec');
    assert.ok(call !== undefined, 'the exec route was called');
    assert.equal(call.authorization, `Bearer ${SECRET}`);
    assert.deepEqual(JSON.parse(call.body), { command: 'echo hello' });
    assert.equal(result.stdout, 'hello\n');
    assert.equal(result.code, 0);
  } finally {
    server.close();
  }
});

test("a remote command's own exit code passes through untouched", async () => {
  // So that `&&`, `||` and `$?` behave exactly as they would around a real ssh. A code
  // rewritten into the reserved band would silently change the meaning of an agent's script.
  const server = await broker(
    healthy(() => ({ status: 200, body: { exitCode: 42, stdout: '', stderr: 'nope\n' } })),
  );
  try {
    const result = await run(['ssh', formatToken(server.port, SECRET), '--', 'false']);

    assert.equal(result.code, 42);
    assert.match(result.stderr, /nope/);
  } finally {
    server.close();
  }
});

test('a refusal by the human is a distinct code from a mechanism failure', async () => {
  // An agent that cannot tell "you were denied" from "the broker broke" retries the wrong one.
  const server = await broker(
    healthy(() => ({ status: 403, body: { error: { code: 'denied', message: 'the human declined' } } })),
  );
  try {
    const result = await run(['ssh', formatToken(server.port, SECRET), '--', 'echo hi']);

    assert.equal(result.code, EXIT.denied);
    assert.match(result.stderr, /the human declined/, 'the broker’s own words, not a generic line');
  } finally {
    server.close();
  }
});

test('an unknown token gets its own code, so an agent knows to ask for a fresh grant', async () => {
  const server = await broker(
    healthy(() => ({ status: 401, body: { error: { code: 'unauthorized', message: 'no such grant' } } })),
  );
  try {
    assert.equal(
      (await run(['ssh', formatToken(server.port, SECRET), '--', 'echo hi'])).code,
      EXIT.unknownToken,
    );
  } finally {
    server.close();
  }
});

test('a consent timeout is not confused with a denial', async () => {
  const server = await broker(
    healthy(() => ({ status: 408, body: { error: { code: 'consent_timeout', message: 'nobody answered' } } })),
  );
  try {
    assert.equal(
      (await run(['ssh', formatToken(server.port, SECRET), '--', 'echo hi'])).code,
      EXIT.consentTimeout,
    );
  } finally {
    server.close();
  }
});

test('an error code nobody taught this about is a broker failure, not a crash', async () => {
  const server = await broker(
    healthy(() => ({ status: 500, body: { error: { code: 'something_new', message: 'unexpected' } } })),
  );
  try {
    assert.equal(
      (await run(['ssh', formatToken(server.port, SECRET), '--', 'echo hi'])).code,
      EXIT.brokerFailure,
    );
  } finally {
    server.close();
  }
});

test('a successful env export reports success — it carries no exitCode at all', async () => {
  // The recorded defect: `exitCode ?? brokerFailure` made every verb whose success body has no
  // exitCode — env, vpn-up, vpn-down — report a working call as failure 95 and print nothing.
  const server = await broker(healthy(() => ({ status: 200, body: { written: 3 } })));
  try {
    const result = await run(['env', formatToken(server.port, SECRET)]);

    assert.equal(result.code, 0, `env reported ${result.code}: ${result.stderr}`);
  } finally {
    server.close();
  }
});

test('a successful vpn-up reports success for the same reason', async () => {
  const server = await broker(healthy(() => ({ status: 200, body: { opened: true } })));
  try {
    assert.equal((await run(['vpn-up', formatToken(server.port, SECRET)])).code, 0);
  } finally {
    server.close();
  }
});

test('each verb goes to its OWN route', async () => {
  // A verb sent to the wrong route is authorised for the entity but performs the wrong action.
  const routes: [string[], string][] = [
    [['terminal'], '/v1/use/terminal'],
    [['run'], '/v1/use/run'],
    [['env'], '/v1/use/exportEnv'],
    [['vpn-up'], '/v1/use/up'],
    [['vpn-down'], '/v1/use/down'],
  ];
  for (const [args, expected] of routes) {
    const server = await broker(healthy(() => ({ status: 200, body: { opened: true, written: 0, exitCode: 0 } })));
    try {
      await run([...args, formatToken(server.port, SECRET)]);
      assert.ok(
        server.received.some((r) => r.url === expected),
        `${args[0]} should call ${expected}, saw ${server.received.map((r) => r.url).join()}`,
      );
    } finally {
      server.close();
    }
  }
});

test('a broker that answers unreadable JSON is reported, not thrown out of', async () => {
  // Truncated or non-JSON bytes: a proxy's error page, a half-written response. The CLI must
  // report it rather than throw an unhandled SyntaxError out of the process.
  const server = await broker(healthy(() => ({ status: 200, raw: '{"stdout": "hel' })));
  try {
    const result = await run(['ssh', formatToken(server.port, SECRET), '--', 'echo hi']);

    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /\[creds-for-devs\]/);
  } finally {
    server.close();
  }
});
