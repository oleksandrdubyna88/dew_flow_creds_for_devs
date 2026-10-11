import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  CliEndpoint,
  endpointPath,
  isCliEndpoint,
  pidIsAlive,
  readEndpoints,
  removeEndpoint,
  staleEndpoints,
  sweepStaleEndpoints,
  writeEndpoint,
} from '../cliEndpoint';

/**
 * How a terminal finds a window — and, as much as the point, what the file may never contain.
 */

function store(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'creds-endpoint-'));
}

const ENDPOINT: CliEndpoint = {
  pid: 4242,
  port: 51234,
  socket: '/tmp/store/broker-4242.sock',
  startedAt: '2026-08-26T10:00:00.000Z',
};

test('a window announces itself and can be read back', () => {
  const dir = store();
  writeEndpoint(dir, ENDPOINT);

  assert.deepEqual(readEndpoints(dir), [ENDPOINT]);
});

test('the file holds no secret — only what anyone on the machine could enumerate anyway', () => {
  // The whole reason this file is safe to exist. A token, a secret or a key here would turn a
  // convenience into the thing the broker's design spent its effort avoiding.
  const dir = store();
  writeEndpoint(dir, ENDPOINT);

  const raw = fs.readFileSync(endpointPath(dir, ENDPOINT.pid), 'utf8');

  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ['pid', 'port', 'socket', 'startedAt']);
  for (const forbidden of ['secret', 'token', 'password', 'key']) {
    assert.equal(raw.toLowerCase().includes(forbidden), false, `${forbidden} must never appear`);
  }
});

test('two windows each get their own file rather than racing over one', () => {
  const dir = store();
  writeEndpoint(dir, ENDPOINT);
  writeEndpoint(dir, { ...ENDPOINT, pid: 7, port: 1, startedAt: '2026-08-26T09:00:00.000Z' });

  assert.equal(readEndpoints(dir).length, 2);
});

test('the newest window is listed first, because that is the one a person just opened', () => {
  const dir = store();
  writeEndpoint(dir, { ...ENDPOINT, pid: 1, startedAt: '2026-08-26T09:00:00.000Z' });
  writeEndpoint(dir, { ...ENDPOINT, pid: 2, startedAt: '2026-08-26T11:00:00.000Z' });

  assert.deepEqual(readEndpoints(dir).map((e) => e.pid), [2, 1]);
});

test('closing removes the announcement', () => {
  const dir = store();
  writeEndpoint(dir, ENDPOINT);

  removeEndpoint(dir, ENDPOINT.pid);

  assert.deepEqual(readEndpoints(dir), []);
});

test('a half-written or hand-edited file is skipped, not thrown over', () => {
  // A window killed mid-write leaves exactly this, and it must not stop the CLI finding the
  // other windows.
  const dir = store();
  writeEndpoint(dir, ENDPOINT);
  fs.mkdirSync(path.join(dir, 'endpoints'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'endpoints', 'window-99.json'), '{"pid": 99, "por');
  fs.writeFileSync(path.join(dir, 'endpoints', 'window-98.json'), '{"unrelated": true}');

  assert.deepEqual(readEndpoints(dir).map((e) => e.pid), [ENDPOINT.pid]);
});

test('no endpoints directory at all is an empty list, not a crash', () => {
  assert.deepEqual(readEndpoints(store()), []);
});

test('announcing never throws, even into a directory that cannot be created', () => {
  // A window that cannot announce itself is one the CLI will not find. That is a missing
  // convenience; taking the broker down over it would be a real fault.
  assert.doesNotThrow(() => writeEndpoint('\0not-a-path', ENDPOINT));
});

test('a stale window is identified by its pid being gone, never by the file existing', () => {
  // A crashed window cannot delete its own file, so staleness is the normal case rather than
  // the exception.
  const live = { ...ENDPOINT, pid: 1 };
  const dead = { ...ENDPOINT, pid: 2 };

  assert.deepEqual(
    staleEndpoints([live, dead], (pid) => pid === 1),
    [dead],
  );
});

test('the validator refuses a shape it did not write', () => {
  assert.equal(isCliEndpoint(ENDPOINT), true);
  assert.equal(isCliEndpoint({ ...ENDPOINT, port: '51234' }), false);
  assert.equal(isCliEndpoint({ pid: 1, port: 2 }), false, 'startedAt is required');
  assert.equal(isCliEndpoint(null), false);
  assert.equal(isCliEndpoint('a string'), false);
});

test('a socket-less window is still a valid announcement', () => {
  // Windows without a pipe, or a POSIX storage path too long for a socket: the port alone
  // still works and the CLI must not discard the window over a missing optional field.
  const { socket: _socket, ...withoutSocket } = ENDPOINT;

  assert.equal(isCliEndpoint(withoutSocket), true);
  const dir = store();
  writeEndpoint(dir, withoutSocket);
  assert.equal(readEndpoints(dir)[0].socket, undefined);
});

// --- the agent's address, for a relay inside WSL (0.65.0) -----------------------------------
//
// A window in WSL cannot open a Windows named pipe, so `creds relay` bridges a unix socket to it
// — and has to be told where "it" is without being handed a pid. The address is not a secret: it
// is derived from the pid and anyone on the machine can enumerate it.

test('the agent address round-trips when one is running', () => {
  const dir = store();
  const withAgent: CliEndpoint = { ...ENDPOINT, agentSocket: '\\.\pipe\creds-for-devs-agent-4242' };

  writeEndpoint(dir, withAgent);

  assert.deepEqual(readEndpoints(dir), [withAgent]);
});

test('an announcement without an agent is still valid — that is the usual state', () => {
  // The agent runs only while a key is loaded, which is a minority of any session. Requiring the
  // field would make every ordinary window unreadable to the CLI.
  assert.equal(isCliEndpoint({ pid: 1, port: 2, startedAt: 'x' }), true);
});

test('an agent address of the wrong type is refused rather than passed on', () => {
  assert.equal(isCliEndpoint({ pid: 1, port: 2, startedAt: 'x', agentSocket: 42 }), false);
});

// --- the sweep at activation (PLAN_stale_endpoint_files_slow_every_refusal.md §4.2) -----------------

/** The sweep's own folder: one file per pid, as windows write them. */
function announced(...pids: number[]): string {
  const dir = store();
  for (const pid of pids) {
    writeEndpoint(dir, { ...ENDPOINT, pid });
  }
  return dir;
}

function pidsIn(dir: string): number[] {
  return readEndpoints(dir)
    .map((e) => e.pid)
    .sort((a, b) => a - b);
}

test('a crashed window is swept at the next activation; this window and a live one are kept', () => {
  // The measured case: 33 of 35 files named a pid that was gone, and nothing ever removed one.
  const own = 100;
  const live = 200;
  const crashed = [300, 400];
  const dir = announced(own, live, ...crashed);

  const removed = sweepStaleEndpoints(dir, own, (pid) => pid === live);

  assert.deepEqual(removed.sort((a, b) => a - b), crashed, 'the crashed windows are the ones removed');
  assert.deepEqual(pidsIn(dir), [own, live], 'the sweep never removes its own file or a live window\'s');
});

test('the sweep never removes its own file, even if its own pid were asked about and read as dead', () => {
  const dir = announced(100);

  assert.deepEqual(sweepStaleEndpoints(dir, 100, () => false), []);
  assert.deepEqual(pidsIn(dir), [100]);
});

test('a folder that cannot be read is not an error and removes nothing', () => {
  assert.deepEqual(sweepStaleEndpoints(path.join(store(), 'missing'), 1, () => false), []);
  assert.doesNotThrow(() => sweepStaleEndpoints('\0not-a-path', 1, () => false));
});

test('only ESRCH says a pid is gone — EPERM is a live process this user may not signal', () => {
  const throwing = (code: string) => () => {
    throw Object.assign(new Error(code), { code });
  };

  assert.equal(pidIsAlive(42, () => true), true, 'a signal that succeeds is a live process');
  assert.equal(pidIsAlive(42, throwing('ESRCH')), false, 'no such process');
  assert.equal(pidIsAlive(42, throwing('EPERM')), true, 'measured: a reused pid held by a protected process');
  assert.equal(pidIsAlive(42, throwing('EINVAL')), true, 'anything unexpected is not proof of death');
  assert.equal(pidIsAlive(0, throwing('ESRCH')), true, 'pid 0 is not a window; it is never proved gone');
  assert.equal(pidIsAlive(-1, throwing('ESRCH')), true, 'a negative pid is a process group on POSIX, never a window');
});

test('the real pid probe: this process is alive, and an exited child is gone', async () => {
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, ['-e', '0'], { stdio: 'ignore' });
  const pid = child.pid ?? 0;
  await new Promise<void>((resolve) => child.once('exit', () => resolve()));

  assert.equal(pidIsAlive(process.pid), true);
  assert.equal(pidIsAlive(pid), false, `pid ${pid} exited and must read as gone`);
});

test('a sweep with the real probe removes an exited process\'s file and keeps this one\'s', async () => {
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, ['-e', '0'], { stdio: 'ignore' });
  const dead = child.pid ?? 0;
  await new Promise<void>((resolve) => child.once('exit', () => resolve()));
  const dir = announced(process.pid, dead);

  sweepStaleEndpoints(dir, process.pid);

  assert.deepEqual(pidsIn(dir), [process.pid]);
});
