import * as assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { endpointDir, readEndpoints, writeEndpoint } from '../cliEndpoint';
import { world } from './brokerWorld';

/**
 * The window retires the announcements of windows that crashed — when it is built, which in VS Code is once,
 * in `activate` (research/PLAN_stale_endpoint_files_slow_every_refusal.md §4.2).
 *
 * <p>The sweep's predicate had a unit test for weeks and no caller; 35 files piled up on the reporting machine,
 * and every CLI and MCP walk dialled each one. So this drives the REAL broker constructor rather than the
 * function: what is guarded is the call.</p>
 */

function storage(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'creds-sweep-'));
}

/** The pid of a process this test started and that has exited — never a guessed number. */
async function exitedPid(): Promise<number> {
  const child = spawn(process.execPath, ['-e', '0'], { stdio: 'ignore' });
  const pid = child.pid ?? 0;
  await new Promise<void>((resolve) => child.once('exit', () => resolve()));
  return pid;
}

function announce(dir: string, pid: number): void {
  writeEndpoint(dir, { pid, port: 51234, startedAt: '2026-10-11T10:00:00.000Z' });
}

test('building the broker removes a crashed window\'s announcement and keeps this window\'s own', async () => {
  const dir = storage();
  const dead = await exitedPid();
  announce(dir, dead);
  announce(dir, process.pid);

  const w = world({ storageDir: dir });
  try {
    assert.deepEqual(
      readEndpoints(dir).map((e) => e.pid),
      [process.pid],
      `the announcement of pid ${dead}, which has exited, is still in the folder`,
    );
  } finally {
    w.server.dispose();
  }
});

test('a broker with no storage folder sweeps nothing and does not fail', () => {
  const w = world({});
  w.server.dispose();
  assert.ok(true, 'constructed and disposed without a folder');
});

test('a storage folder with no endpoints folder yet is not an error', () => {
  const dir = storage();
  const w = world({ storageDir: dir });
  w.server.dispose();
  assert.equal(fs.existsSync(endpointDir(dir)), false, 'the sweep creates nothing');
});
