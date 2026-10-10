import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { NOT_LAUNCHED, abandonedWhenClosed, endedAfter, endedStage, notStarted } from '../requestLife';

/**
 * Whether `res` `close` with the response unfinished is a reliable "the client is gone"
 * (`PLAN_wsl_bridge_outlives_its_client.md` §5.7; the question the consultant asked of E4.S1).
 *
 * <p>Measured over BOTH transports the broker listens on — the loopback port and the second listener
 * (`brokerListeners.ts`: a unix socket, or a named pipe on Windows) — in the four shapes that matter: a
 * normal answer, keep-alive reuse, a client that destroys its connection mid-wait, and a raw half-close.
 * The first two must never fire the signal; the last two must.</p>
 */

interface Served {
  /** The signal of each request, in arrival order. */
  signals: AbortSignal[];
  /** Answer the oldest unanswered request. */
  answerNext(): void;
  connect(): http.RequestOptions;
  close(): Promise<void>;
}

let pipes = 0;

function pipePath(): string {
  pipes += 1;
  const name = `creds-life-${process.pid}-${pipes}`;
  return process.platform === 'win32' ? `\\\\.\\pipe\\${name}` : path.join(os.tmpdir(), `${name}.sock`);
}

async function serve(over: 'port' | 'pipe'): Promise<Served> {
  const signals: AbortSignal[] = [];
  const pending: http.ServerResponse[] = [];
  const server = http.createServer((req, res) => {
    signals.push(abandonedWhenClosed(res));
    req.resume();
    pending.push(res);
  });
  const where = over === 'port' ? 0 : pipePath();
  await new Promise<void>((resolve) => (over === 'port' ? server.listen(0, '127.0.0.1', resolve) : server.listen(where, resolve)));
  const address = server.address();
  return {
    signals,
    answerNext: () => pending.shift()?.end('{}'),
    connect: () =>
      over === 'port'
        ? { host: '127.0.0.1', port: (address as net.AddressInfo).port }
        : { socketPath: where as string },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

function post(options: http.RequestOptions, agent?: http.Agent): { req: http.ClientRequest; done: Promise<number | 'gone'> } {
  const req = http.request({ ...options, agent, method: 'POST', path: '/', headers: { 'Content-Length': 2 } });
  const done = new Promise<number | 'gone'>((resolve) => {
    req.on('response', (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    });
    req.on('error', () => resolve('gone'));
  });
  req.end('{}');
  return { req, done };
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function arrived(s: Served, count: number): Promise<void> {
  const deadline = Date.now() + 3000;
  while (s.signals.length < count) {
    assert.ok(Date.now() < deadline, `only ${s.signals.length} of ${count} requests arrived`);
    await pause(5);
  }
}

for (const over of ['port', 'pipe'] as const) {
  test(`${over}: an answered request never fires its signal`, async () => {
    const s = await serve(over);
    try {
      const call = post(s.connect());
      await arrived(s, 1);
      s.answerNext();
      assert.equal(await call.done, 200);
      await pause(50);

      assert.equal(s.signals[0].aborted, false, 'a finished response read as a client that left');
    } finally {
      await s.close();
    }
  });

  test(`${over}: keep-alive reuse — two answered requests on one connection fire nothing`, async () => {
    const s = await serve(over);
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    try {
      const first = post(s.connect(), agent);
      await arrived(s, 1);
      s.answerNext();
      await first.done;
      const second = post(s.connect(), agent);
      await arrived(s, 2);
      s.answerNext();
      await second.done;
      await pause(50);

      assert.deepEqual(
        s.signals.map((signal) => signal.aborted),
        [false, false],
      );
    } finally {
      agent.destroy();
      await s.close();
    }
  });

  test(`${over}: a client that destroys its connection mid-wait fires the signal`, async () => {
    const s = await serve(over);
    try {
      const call = post(s.connect());
      await arrived(s, 1);
      assert.equal(s.signals[0].aborted, false);

      call.req.destroy();
      await pause(100);

      assert.equal(s.signals[0].aborted, true, 'the client left and nothing noticed');
    } finally {
      await s.close();
    }
  });
}

test('a client that half-closes while waiting is treated as gone — Node ends a half-closed connection', async () => {
  // Measured on this Node, not assumed: the server does not allow half-open sockets by default, so a FIN
  // after the request tears the connection down and the response can no longer be delivered. No client
  // of this broker half-closes (the CLI and creds-mcp use .NET's HttpClient, the scripts use fetch), and
  // if one did, its answer would be undeliverable anyway — so "gone" is the truthful reading.
  const s = await serve('port');
  try {
    const target = s.connect();
    const socket = net.connect(target.port as number, '127.0.0.1');
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
    socket.end('POST / HTTP/1.1\r\nHost: x\r\nContent-Length: 2\r\n\r\n{}');
    await arrived(s, 1);
    await pause(100);

    assert.equal(s.signals[0].aborted, true);
    socket.destroy();
  } finally {
    await s.close();
  }
});

/**
 * The request's end, as the journal reads it (E4.S4): the stage travels ON the error, and only a request's
 * own end — branded with a `Symbol.for` key every copy of the module shares — may put words into the
 * journal that way. A foreign `AbortError` that happens to carry a `stage` is not one (own review).
 */
test('a request’s end carries its stage: "not launched" for a refused start, the typed step for a chain that typed', () => {
  assert.equal(endedStage(notStarted()), NOT_LAUNCHED);
  assert.match(endedStage(endedAfter('a dependency step had been typed')) ?? '', /^after a dependency step had been typed/);
  assert.equal(notStarted().name, 'AbortError', 'as Node names a cancelled operation');
});

test('a foreign AbortError with a stage of its own is NOT read as a request’s end — its words never reach the journal', () => {
  const forged = Object.assign(new Error('a library said so'), { name: 'AbortError', stage: 'after something it made up' });

  assert.equal(endedStage(forged), undefined);
  assert.equal(endedStage(new Error('plain')), undefined);
  assert.equal(endedStage(undefined), undefined);
});
