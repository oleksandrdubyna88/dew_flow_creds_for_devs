import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHECK_INTERVAL_MS,
  CheckStore,
  WslCheckDeps,
  activationCheck,
  checkDistro,
  dismissForVersion,
  recordedInstall,
  rememberInstall,
} from '../wslMcpCheck';
import { ProbeAnswer } from '../wslMcpInstall';

/**
 * Plan §5.8 / E4.S2 — WHEN the stale-install check runs, without a distribution to run it in.
 *
 * <p>The rules a person would notice if they broke: activation never wakes a stopped distribution
 * (the VM start is seconds of their machine, for a check nobody asked for), it asks each
 * distribution at most once a day, it says nothing when no install is recorded, and "Not for this
 * version" holds until the version changes.</p>
 */

const LINUX = '/home/dev/.local/bin/creds-mcp';
const WINDOWS = '/mnt/c/Users/dev/AppData/creds-mcp.exe';
const DAY = CHECK_INTERVAL_MS;

class FakeStore implements CheckStore {
  readonly values = new Map<string, unknown>();
  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }
  update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }
}

interface World {
  readonly deps: WslCheckDeps;
  readonly state: FakeStore;
  readonly probed: string[][];
  readonly listed: { count: number };
  clock: number;
}

function world(running: string[], answer: (argv: readonly string[]) => ProbeAnswer = olderAnswer): World {
  const state = new FakeStore();
  const probed: string[][] = [];
  const listed = { count: 0 };
  const w: World = {
    state,
    probed,
    listed,
    clock: 10 * DAY,
    deps: {
      state,
      runningDistros: () => {
        listed.count += 1;
        return Promise.resolve([...running]);
      },
      probe: (argv) => {
        probed.push([...argv]);
        return Promise.resolve(answer(argv));
      },
      now: () => w.clock,
    },
  };
  return w;
}

function olderAnswer(): ProbeAnswer {
  return { kind: 'exited', code: 0, stdout: `creds-mcp 0.10.0\nwindows half: creds-mcp 0.10.0 (${WINDOWS})\n` };
}

function currentAnswer(): ProbeAnswer {
  return { kind: 'exited', code: 0, stdout: `creds-mcp 0.12.0\nwindows half: creds-mcp 0.12.0 (${WINDOWS})\n` };
}

const install = { linuxBinary: LINUX, windowsBinary: WINDOWS };

async function reported(w: World, expected = '0.12.0'): Promise<string[]> {
  const seen: string[] = [];
  await activationCheck(w.deps, expected, (result) => {
    seen.push(result.distro);
    return Promise.resolve();
  });
  return seen;
}

test('the install records the block\'s two paths per distribution, and reads them back', async () => {
  const w = world([]);
  await rememberInstall(w.state, 'Ubuntu', install);
  await rememberInstall(w.state, 'Debian', { linuxBinary: '/opt/creds-mcp', windowsBinary: WINDOWS });

  assert.deepEqual(recordedInstall(w.state, 'Ubuntu'), install);
  assert.deepEqual(recordedInstall(w.state, 'Debian'), { linuxBinary: '/opt/creds-mcp', windowsBinary: WINDOWS });
  assert.equal(recordedInstall(w.state, 'Arch'), undefined);
});

test('a STOPPED distribution is never probed at activation — the VM is not woken for a check', async () => {
  const w = world(['Debian']); // Ubuntu is recorded but not running
  await rememberInstall(w.state, 'Ubuntu', install);

  assert.deepEqual(await reported(w), []);
  assert.deepEqual(w.probed, [], 'a stopped distribution was asked, which starts its VM');
});

test('a running, recorded, older install is probed with the recorded paths and reported', async () => {
  const w = world(['Ubuntu']);
  await rememberInstall(w.state, 'Ubuntu', install);

  assert.deepEqual(await reported(w), ['Ubuntu']);
  assert.deepEqual(w.probed, [['-d', 'Ubuntu', '-e', 'env', `CREDS_MCP_WINDOWS_BINARY=${WINDOWS}`, LINUX, '--version']]);
});

test('a current install is probed but NOT reported at activation', async () => {
  const w = world(['Ubuntu'], currentAnswer);
  await rememberInstall(w.state, 'Ubuntu', install);

  assert.deepEqual(await reported(w), []);
  assert.equal(w.probed.length, 1);
});

test('a timed-out probe is silent at activation', async () => {
  const w = world(['Ubuntu'], () => ({ kind: 'timeout' }));
  await rememberInstall(w.state, 'Ubuntu', install);

  assert.deepEqual(await reported(w), []);
});

test('activation asks each distribution at most once a day', async () => {
  const w = world(['Ubuntu']);
  await rememberInstall(w.state, 'Ubuntu', install);

  await reported(w);
  w.clock += DAY - 1;
  await reported(w);
  assert.equal(w.probed.length, 1, 'asked twice within a day');

  w.clock += 1;
  await reported(w);
  assert.equal(w.probed.length, 2, 'not asked again after a day');
});

test('the once-a-day clock is per distribution', async () => {
  const w = world(['Ubuntu', 'Debian']);
  await rememberInstall(w.state, 'Ubuntu', install);
  await reported(w);
  await rememberInstall(w.state, 'Debian', install);

  assert.deepEqual(await reported(w), ['Debian'], 'a fresh distribution waited on another one\'s clock');
});

test('a clock that went BACKWARDS does not silence the check for ever', async () => {
  const w = world(['Ubuntu']);
  await rememberInstall(w.state, 'Ubuntu', install);
  await reported(w);
  w.clock -= 30 * DAY;

  assert.deepEqual(await reported(w), ['Ubuntu']);
});

test('nothing recorded → no wsl.exe is started at all, not even to list distributions', async () => {
  const w = world(['Ubuntu']);

  assert.deepEqual(await reported(w), []);
  assert.equal(w.listed.count, 0, 'listed distributions for a machine with nothing to check');
});

test('below the first release with --version nothing is started', async () => {
  const w = world(['Ubuntu']);
  await rememberInstall(w.state, 'Ubuntu', install);

  assert.deepEqual(await reported(w, '0.9.1'), []);
  assert.equal(w.listed.count, 0);
});

test('"Not for this version" holds for that version and lapses when the version changes', async () => {
  const w = world(['Ubuntu']);
  await rememberInstall(w.state, 'Ubuntu', install);
  await dismissForVersion(w.state, 'Ubuntu', '0.12.0');

  assert.deepEqual(await reported(w, '0.12.0'), []);
  w.clock += DAY;
  assert.deepEqual(await reported(w, '0.13.0'), ['Ubuntu'], 'a dismissal of 0.12.0 silenced 0.13.0');
});

test('an explicit check ignores the daily clock and the dismissal, and reports a current install too', async () => {
  const w = world(['Ubuntu'], currentAnswer);
  await rememberInstall(w.state, 'Ubuntu', install);
  await dismissForVersion(w.state, 'Ubuntu', '0.12.0');
  await reported(w);

  const result = await checkDistro(w.deps, 'Ubuntu', '0.12.0');

  assert.equal(result.kind, 'verdict');
  assert.equal(result.kind === 'verdict' && result.verdict.kind, 'current');
});

test('an explicit check of a distribution with nothing recorded says so and starts nothing', async () => {
  const w = world(['Ubuntu']);

  assert.deepEqual(await checkDistro(w.deps, 'Ubuntu', '0.12.0'), { kind: 'not-recorded', distro: 'Ubuntu' });
  assert.deepEqual(w.probed, []);
});

test('a recorded path the probe cannot pass safely is refused, not run', async () => {
  const w = world(['Ubuntu']);
  await rememberInstall(w.state, 'Ubuntu', { linuxBinary: '/home/a=b/creds-mcp', windowsBinary: WINDOWS });

  const result = await checkDistro(w.deps, 'Ubuntu', '0.12.0');

  assert.equal(result.kind, 'refused');
  assert.deepEqual(w.probed, []);
});
