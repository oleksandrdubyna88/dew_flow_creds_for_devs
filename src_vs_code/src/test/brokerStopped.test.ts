import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { world } from './brokerWorld';

/**
 * `stopped`: the broker's check before anything an Allow triggers (E1.3 epoch 3, A.3.4) — has the client gone, does the
 * scope wall refuse this call now. The scenarios S27 and S28 reach it through a real bridge; these ask it directly, because
 * a client that leaves BETWEEN consent and the preparation is a window no request can be timed into from outside.
 */

interface Stopped {
  stopped(res: unknown, call: unknown, stage: string, atLaunch: () => { code: string; message: string } | undefined): boolean;
}

async function setup(): Promise<{ w: ReturnType<typeof world>; call: (signal: AbortSignal) => unknown; res: { writes: Array<[number, string]> } }> {
  const w = world({});
  await w.server.ensureStarted();
  const grants = (w.server as unknown as { grants: { mint(a: string, e: string, n: string, k: string): object } }).grants;
  const grant = grants.mint('a1', 'e1', 'prod', 'ssh');
  const call = (signal: AbortSignal): unknown => ({ grant, action: 'exec', summary: 'id', via: 'mcp', caller: undefined, signal, body: {}, useAction: {} });
  return { w, call, res: { writes: [] } };
}

const fakeRes = (writes: Array<[number, string]>): unknown => {
  let status = 0;
  return { writeHead: (code: number) => void (status = code), end: (payload: string) => void writes.push([status, payload]) };
};

test('stopped: a client that has gone stops the call with ONE line in the journal, and the wall is not even asked', async () => {
  const { w, call, res } = await setup();
  try {
    const gone = new AbortController();
    gone.abort();
    let asked = 0;
    const stopped = (w.server as unknown as Stopped).stopped(fakeRes(res.writes), call(gone.signal), 'after consent', () => (asked += 1, undefined));
    assert.equal(stopped, true);
    assert.equal(asked, 0, 'the wall was not asked about a request nobody waits for');
    assert.deepEqual(res.writes, [], 'and nothing was written to a socket nobody reads');
    assert.deepEqual(w.audit.filter((line) => /ABANDONED/.test(line)).map((line) => /the client left after consent/.test(line)), [true]);
  } finally {
    w.server.dispose();
  }
});

test('stopped: a live client whose call the wall refuses is answered with the refusal, and the call goes no further', async () => {
  const { w, call, res } = await setup();
  try {
    const stopped = (w.server as unknown as Stopped).stopped(fakeRes(res.writes), call(new AbortController().signal), 'after consent', () => ({ code: 'denied', message: 'nope' }));
    assert.equal(stopped, true);
    assert.equal(res.writes.length, 1, 'one answer');
    assert.equal(res.writes[0][0], 403);
    assert.deepEqual(JSON.parse(res.writes[0][1]), { error: { code: 'denied', message: 'nope' } });
    assert.ok(w.audit.some((line) => line.includes('denied')), 'and a line in the journal for the refusal');
  } finally {
    w.server.dispose();
  }
});

test('stopped: a live client the wall admits goes on, with nothing written or journalled', async () => {
  const { w, call, res } = await setup();
  try {
    const before = w.audit.length;
    assert.equal((w.server as unknown as Stopped).stopped(fakeRes(res.writes), call(new AbortController().signal), 'after consent', () => undefined), false);
    assert.deepEqual(res.writes, []);
    assert.equal(w.audit.length, before);
  } finally {
    w.server.dispose();
  }
});
