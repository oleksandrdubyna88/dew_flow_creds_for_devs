// `npm run itest:all` (E2.2.S1): the harness runner records its run, sweeps both roots at the start, ends the WHOLE tree of a harness that
// hangs, stops when a signal comes, and reads a Windows harness's output at its end. These scenarios drive `runHarnesses` of
// `scripts/run-itests.mjs` with fixture harnesses (small scripts the test writes into an owned folder), private roots, and the runner's
// seams. No real harness runs, and no test sweeps the real temp root.
//
// There is NO harness-wide end audit (D4): a harness's children may still be ending when it exits. S1.7 is written as a pin so an audit
// added later goes red.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import type { Scope } from '../../scripts/lib/leftovers.cjs';
import { formatOwner, isMine, ownedDir, thisOwner } from '../../scripts/lib/leftovers.cjs';
import { RECORD, SRC_VS_CODE, WRAPPER, isAlive, lines, ownerWith, privateRoot, runner } from './runnerWorld';

interface Harness {
  name: string;
  script: string;
  needs: string;
  windows: boolean;
}
interface RunResult {
  code: number;
  out: string;
  err: string;
  timedOut: boolean;
  overflow: boolean;
  spawnFailed: boolean;
  spawnError?: string;
}
interface RunCall {
  command: string;
  args: string[];
  options: { timeoutMs?: number; maxOutputBytes?: number; containTree?: boolean; env?: NodeJS.ProcessEnv };
}
interface ItestSeams {
  spawn?: (command: string, args: string[], options: object) => unknown;
  run?: (command: string, args: string[], options: RunCall['options']) => Promise<RunResult>;
  write?: (text: string) => void;
  platform?: string;
  timeoutMs?: number;
  harnesses?: Harness[];
  compile?: boolean;
  sweep?: (options: { repo: string; tmp: string }) => object;
  sweepOptions?: Record<string, unknown>;
  roots?: string[];
  record?: string;
  signals?: EventEmitter;
  loadHelpers?: () => Promise<unknown>;
  confirm?: (tree?: unknown) => Promise<{ ended: boolean; alive: number; reason?: string }>;
  survivors?: (query: object) => { pids: number[]; unverified: string[] };
}
interface Itests {
  runHarnesses(args: string[], seams?: ItestSeams): Promise<number>;
}
const ITESTS = path.join(SRC_VS_CODE, 'scripts', 'run-itests.mjs');
const itests = async (): Promise<Itests> => (await import(pathToFileURL(ITESTS).href)) as Itests;

const posixOnly = process.platform === 'win32' ? { skip: 'the signal reaches a harness through its process group; Windows stops the job' } : {};
const winOnly = process.platform === 'win32' ? {} : { skip: 'Windows lists `unverified:` and removes nothing' };

/** A fixture harness: the script the test wrote, listed the way the runner lists a real one. */
function harness(dir: string, name: string, body: string): Harness {
  const script = path.join(dir, `${name}.cjs`);
  fs.writeFileSync(script, body);
  return { name, script, needs: 'nothing', windows: false };
}

/** The seams every scenario shares: no compile, a private root, a sweep that finds nothing, and the run's record. */
function base(t: Scope, text: string[]): ItestSeams {
  return {
    compile: false,
    roots: [privateRoot(t)],
    sweep: () => ({ removed: [], preserved: [], listed: [], errors: [] }),
    record: RECORD,
    write: (chunk) => text.push(chunk),
  };
}

/** A foreign record that names a live process: this process's parent. */
const foreignRecord = (): string => formatOwner(ownerWith(process.ppid, thisOwner().start ?? 1));
const elevenMinutesOn = (): number => Date.now() + 11 * 60_000;
const DEAD_PID = 4242;
const probe = (pid: number): { state: string } => ({ state: pid === DEAD_PID ? 'dead' : 'live' });
const deadRecord = (): string => formatOwner(ownerWith(DEAD_PID, thisOwner().start ?? 1));

/** A folder `testsToDelete-<owner>-<token>-<what>-abc123` claimed by `record`, made by hand. */
function planted(root: string, token: string, what: string, record: string): string {
  const dir = path.join(root, `testsToDelete-${thisOwner().owner}-${token}-${what}-abc123`);
  fs.mkdirSync(dir);
  fs.writeFileSync(`${dir}.owner`, `${record}\n`);
  return dir;
}

/** Run with the ambient `TESTSTODELETE_RUN` set to `value`, or removed when `undefined`. */
async function withAmbient<T>(value: string | undefined, body: () => Promise<T>): Promise<T> {
  const saved = process.env.TESTSTODELETE_RUN;
  if (value === undefined) delete process.env.TESTSTODELETE_RUN;
  else process.env.TESTSTODELETE_RUN = value;
  try {
    return await body();
  } finally {
    if (saved === undefined) delete process.env.TESTSTODELETE_RUN;
    else process.env.TESTSTODELETE_RUN = saved;
  }
}

const PRINT_RECORD = "console.log('RECORD=' + String(process.env.TESTSTODELETE_RUN));";
const recordOf = (text: string[]): string => /RECORD=(.*)/.exec(text.join(''))?.[1] ?? '<no output>';

test('[S1.1] every harness child gets the runner\'s record, whatever the ambient environment held', async (t) => {
  const { runHarnesses } = await itests();
  const dir = ownedDir(t, 'itest');
  const fixture = harness(dir, 'record', PRINT_RECORD);
  const foreign = foreignRecord();
  assert.notEqual(foreign, RECORD, 'premise: the foreign record is not the held one');

  const cleared: string[] = [];
  await withAmbient(undefined, () => runHarnesses([], { ...base(t, cleared), harnesses: [fixture] }));
  const set: string[] = [];
  await withAmbient(foreign, () => runHarnesses([], { ...base(t, set), harnesses: [fixture] }));

  assert.equal(recordOf(cleared), RECORD, '(a) the ambient key was cleared, so only the runner can have set it');
  assert.equal(recordOf(set), RECORD, '(b) a foreign live record in the ambient environment is not passed on');
});

test('[S1.2] the sweep is called once per canonical root, and all calls come before the first harness starts', async (t) => {
  const { runHarnesses } = await itests();
  const dir = ownedDir(t, 'itest');
  const first = fs.realpathSync(privateRoot(t));
  const second = fs.realpathSync(privateRoot(t));
  assert.notEqual(first, second, 'premise: the two roots differ, so "once per root" is two calls');
  const events: string[] = [];

  await runHarnesses([], {
    ...base(t, []),
    harnesses: [harness(dir, 'quiet', 'process.exit(0);')],
    roots: [first, second, first],
    sweep: ({ tmp }) => {
      events.push(`sweep ${tmp}`);
      return { removed: [], preserved: [], listed: [], errors: [] };
    },
    spawn: (command, args, options) => {
      events.push('start');
      return spawn(command, args, options as object);
    },
  });

  assert.deepEqual(events, [`sweep ${first}`, `sweep ${second}`, 'start']);
});

test('[S1.3] a sweep that throws is one `run-itests:` line and the harnesses\' own exit code; the E2.1 runner still says `run-tests:`', async (t) => {
  const { runHarnesses } = await itests();
  const dir = ownedDir(t, 'itest');
  const text: string[] = [];

  const code = await runHarnesses([], {
    ...base(t, text),
    harnesses: [harness(dir, 'quiet', 'process.exit(0);')],
    sweep: () => {
      throw new Error('boom');
    },
  });

  assert.equal(code, 0, 'the harness exits 0, and a sweep never changes the code');
  assert.deepEqual(text.join('').split('\n').filter((line) => line.includes('sweep')), ['run-itests: leftovers sweep failed (boom)']);
  const { runWithAudit } = await runner();
  const old = lines();
  await runWithAudit([], {
    spawn: () => {
      const child = new EventEmitter();
      setImmediate(() => child.emit('exit', 0, null));
      return child;
    },
    roots: [privateRoot(t)],
    sweep: () => {
      throw new Error('boom');
    },
    confirm: async () => ({ ended: true, alive: 0 }),
    survivors: () => ({ pids: [], unverified: [] }),
    write: old.write,
  });
  assert.deepEqual(old.seen.filter((line) => line.includes('sweep')), ['run-tests: leftovers sweep failed (boom)']);
});

test('[S1.4] the REAL sweep, in a private root: a dead, old creds folder is collected; a live one and a conventions one stay', { skip: process.platform === 'win32' ? 'Windows: the next scenario' : false }, async (t) => {
  const { runHarnesses } = await itests();
  const dir = ownedDir(t, 'itest');
  const root = fs.realpathSync(privateRoot(t));
  const dead = planted(root, 'creds', 'dead', deadRecord());
  const live = planted(root, 'creds', 'live', foreignRecord());
  const other = planted(root, 'conventions', 'dead', deadRecord());
  for (const folder of [dead, live, other]) assert.ok(fs.existsSync(folder), 'premise: each folder is there before the run');
  const text: string[] = [];
  const { sweep: _fake, ...seams } = base(t, text);

  const code = await runHarnesses([], { ...seams, roots: [root], harnesses: [harness(dir, 'quiet', 'process.exit(0);')], sweepOptions: { probe, now: elevenMinutesOn() } });

  assert.equal(code, 0);
  assert.equal(fs.existsSync(dead) || fs.existsSync(`${dead}.owner`), false, 'the dead folder and its claim are collected');
  assert.ok(fs.existsSync(live) && fs.existsSync(`${live}.owner`), 'a live run\'s folder stays');
  assert.ok(fs.existsSync(other) && fs.existsSync(`${other}.owner`), 'another token\'s folder is not this repository\'s business');
});

test('[S1.4] on Windows the sweep lists `unverified:` and removes nothing (F16)', winOnly, async (t) => {
  const { runHarnesses } = await itests();
  const dir = ownedDir(t, 'itest');
  const root = fs.realpathSync(privateRoot(t));
  const dead = planted(root, 'creds', 'dead', deadRecord());
  const live = planted(root, 'creds', 'live', foreignRecord());
  const text: string[] = [];
  const { sweep: _fake, ...seams } = base(t, text);

  await runHarnesses([], { ...seams, roots: [root], harnesses: [harness(dir, 'quiet', 'process.exit(0);')], sweepOptions: { probe, now: elevenMinutesOn() } });

  assert.ok(fs.existsSync(dead) && fs.existsSync(live), 'nothing is removed on Windows');
  assert.ok(text.join('').includes('unverified:'), text.join(''));
});

interface SweepResult {
  removed: string[];
  preserved: Array<{ path: string; reason: string }>;
}
type ReferenceSweep = (options: Record<string, unknown>) => SweepResult;

/** A real `node -e` child makes an owned folder the natural way: it loads the wrapper, with the run's record in its environment. */
function naturalFolder(root: string, record: string): Promise<{ dir: string; stop: () => void }> {
  const code = `const l = require(${JSON.stringify(WRAPPER)}); const s = l.cleanupScope(); console.log(l.ownedDir(s, 'trace', { parent: ${JSON.stringify(root)} })); setInterval(() => {}, 1000);`;
  const child = spawn(process.execPath, ['-e', code], { env: { ...process.env, TESTSTODELETE_RUN: record }, stdio: ['ignore', 'pipe', 'inherit'] });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.stdout.once('data', (chunk: Buffer) => resolve({ dir: chunk.toString().trim(), stop: () => child.kill('SIGKILL') }));
  });
}

test('[S1.5] ownership trace: a folder made the natural way under the run\'s record is read by the real sweep, and kept as `live`', { skip: process.platform === 'win32' ? 'Windows lists `unverified:` (F16)' : false }, async (t) => {
  const { runHarnesses } = await itests();
  const { loadReferenceSweep } = (await import(pathToFileURL(path.join(SRC_VS_CODE, 'scripts', 'run-tests.mjs')).href)) as { loadReferenceSweep(helper: unknown): Promise<ReferenceSweep> };
  const helper = await import('../../scripts/lib/leftovers.cjs');
  const root = fs.realpathSync(privateRoot(t));
  const natural = await naturalFolder(root, RECORD);
  t.after(natural.stop);
  const claim = `${natural.dir}.owner`;
  assert.equal(fs.readFileSync(claim, 'utf8').trim(), RECORD, 'premise: the claim text equals the record');
  assert.ok(isMine(claim), 'premise: the folder is the caller\'s on this OS');
  const reference = await loadReferenceSweep(helper);
  const reasons: Array<Array<{ path: string; reason: string }>> = [];
  const dir = ownedDir(t, 'itest');
  const spy = (now: number | undefined) => (options: Record<string, unknown>): SweepResult => {
    const result = reference({ ...options, token: helper.REPO_TOKEN, ...(now === undefined ? {} : { now }) });
    reasons.push(result.preserved);
    return result;
  };

  await runHarnesses([], { ...base(t, []), roots: [root], harnesses: [harness(dir, 'quiet', 'process.exit(0);')], sweep: spy(undefined) });
  assert.equal(reasons.at(0)?.find((entry) => entry.path === natural.dir)?.reason, 'young', 'premise: without `now` the folder is kept only for its age');
  await runHarnesses([], { ...base(t, []), roots: [root], harnesses: [harness(dir, 'quiet', 'process.exit(0);')], sweep: spy(elevenMinutesOn()) });

  const kept = reasons.at(-1)?.find((entry) => entry.path === natural.dir);
  assert.equal(kept?.reason, 'live', 'the runner\'s sweep read the folder, asked the real probe, and kept it');
  assert.ok(fs.existsSync(natural.dir) && fs.existsSync(claim));
});

/** A fixture that starts a grandchild, prints its pid, and hangs. */
const HANGS_WITH_GRANDCHILD = [
  "const { spawn } = require('node:child_process');",
  "const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
  "console.log('GRANDCHILD=' + grandchild.pid);",
  'setInterval(() => {}, 1000);',
].join('\n');

test('[S1.6] a timeout ends the harness\'s WHOLE tree: the grandchild is dead and the summary says `killed`', async (t) => {
  const { runHarnesses } = await itests();
  const dir = ownedDir(t, 'itest');
  const text: string[] = [];
  let pid = 0;
  let aliveAtPrint = false;
  const seams = base(t, text);
  seams.write = (chunk) => {
    text.push(chunk);
    const printed = /GRANDCHILD=(\d+)/.exec(chunk)?.[1];
    if (printed !== undefined && pid === 0) {
      pid = Number(printed);
      aliveAtPrint = process.platform === 'win32' || isAlive(pid);
    }
  };

  try {
    await runHarnesses([], { ...seams, harnesses: [harness(dir, 'hang', HANGS_WITH_GRANDCHILD)], timeoutMs: process.platform === 'win32' ? 20_000 : 2000 });

    assert.ok(pid > 0, `premise: the harness printed its grandchild's pid (${text.join('')})`);
    assert.ok(aliveAtPrint, 'premise: the grandchild was alive when its pid was printed');
    assert.equal(isAlive(pid), false, 'the grandchild is dead after the runner returned');
    assert.match(text.join(''), /^FAIL\s+itest:hang\s+hang: no exit within .* — killed/m);
  } finally {
    if (pid > 0) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // already gone
      }
    }
  }
});

test('[S1.7] pin: a harness that leaves a folder claimed with the run\'s record and exits 0 — the runner exits 0 and removes nothing (no audit)', async (t) => {
  const { runHarnesses } = await itests();
  const dir = ownedDir(t, 'itest');
  const root = fs.realpathSync(privateRoot(t));
  const leaves = `const l = require(${JSON.stringify(WRAPPER)}); console.log(l.ownedDir(l.cleanupScope(), 'left', { parent: ${JSON.stringify(root)} }));`;
  const text: string[] = [];

  const code = await runHarnesses([], { ...base(t, text), harnesses: [harness(dir, 'leaves', leaves)] });

  const left = text.join('').split('\n').find((line) => line.startsWith(root)) ?? '<none>';
  assert.equal(fs.readFileSync(`${left}.owner`, 'utf8').trim(), RECORD, 'premise: the claim text equals the record');
  assert.equal(code, 0);
  assert.ok(fs.existsSync(left) && fs.existsSync(`${left}.owner`), 'the folder and its claim are still there: a harness\'s children may still be ending, so the runner audits nothing');
});

test('[S1.8] helpers that cannot be loaded: one line naming the submodule command, no harness starts, exit 1', async (t) => {
  const { runHarnesses } = await itests();
  const dir = ownedDir(t, 'itest');
  const text: string[] = [];
  let starts = 0;
  let sweeps = 0;

  const code = await runHarnesses([], {
    ...base(t, text),
    harnesses: [harness(dir, 'quiet', 'process.exit(0);')],
    loadHelpers: async () => {
      throw new Error('leftovers: the shared rules are not mounted (x/owned.mjs is missing) — run: git submodule update --init .claude/rules/shared');
    },
    sweep: () => {
      sweeps += 1;
      return {};
    },
    spawn: (command, args, options) => {
      starts += 1;
      return spawn(command, args, options as object);
    },
  });

  assert.equal(code, 1);
  assert.equal(starts, 0, 'no harness was started');
  assert.equal(sweeps, 0, 'nothing was swept');
  const said = text.join('').split('\n').filter((line) => line !== '');
  assert.equal(said.length, 1, said.join(' | '));
  assert.match(said[0], /^run-itests: .*git submodule update --init \.claude\/rules\/shared/);
});

test('[S1.10] a SIGTERM while the first harness runs: it reaches the harness, the second never starts, the runner exits 143', posixOnly, async (t) => {
  const { runHarnesses } = await itests();
  const dir = ownedDir(t, 'itest');
  const marks = ownedDir(t, 'marks');
  const first = [
    `const fs = require('node:fs'); const mark = (n) => fs.writeFileSync(${JSON.stringify(marks)} + '/' + n, '1');`,
    "process.on('SIGTERM', () => { mark('first-got-term'); process.exit(0); });",
    "console.log('READY');",
    'setTimeout(() => process.exit(0), 1500);',
  ].join('\n');
  const second = `require('node:fs').writeFileSync(${JSON.stringify(marks)} + '/second-started', '1');`;
  const both = [harness(dir, 'first', first), harness(dir, 'second', second)];

  const without: string[] = [];
  await runHarnesses([], { ...base(t, without), harnesses: both, signals: new EventEmitter() });
  assert.ok(fs.existsSync(path.join(marks, 'second-started')), 'premise: without a signal the second harness starts');
  fs.rmSync(path.join(marks, 'second-started'));
  fs.rmSync(path.join(marks, 'first-got-term'), { force: true });

  const signals = new EventEmitter();
  const seams = base(t, []);
  seams.write = (chunk) => {
    if (chunk.includes('READY')) signals.emit('SIGTERM');
  };
  const code = await runHarnesses([], { ...seams, harnesses: both, signals });

  assert.ok(fs.existsSync(path.join(marks, 'first-got-term')), 'the running harness got the SIGTERM');
  assert.equal(fs.existsSync(path.join(marks, 'second-started')), false, 'the second harness never started');
  assert.equal(code, 143);
});

/** What a Windows `run` returns when nothing is special. */
const ran = (over: Partial<RunResult> = {}): RunResult => ({ code: 0, out: '', err: '', timedOut: false, overflow: false, spawnFailed: false, ...over });

test('[S1.11] the Windows branch through the `run` seam: budget and timeout reach it, SKIP is read from `out`, an overflow and a failed start are FAIL lines', async (t) => {
  const { runHarnesses } = await itests();
  const dir = ownedDir(t, 'itest');
  const names = ['skips', 'floods', 'cannot', 'slow', 'fine'];
  const harnesses = names.map((name) => harness(dir, name, 'process.exit(0);'));
  const answers: Record<string, RunResult> = {
    skips: ran({ out: 'SKIP — no WSL here\n' }),
    floods: ran({ overflow: true, code: -1 }),
    cannot: ran({ spawnFailed: true, spawnError: 'ENOENT', code: -1 }),
    slow: ran({ timedOut: true, code: -1 }),
    fine: ran({ out: 'all good\n', err: 'a warning\n' }),
  };
  const calls: RunCall[] = [];
  const text: string[] = [];

  const code = await runHarnesses([], {
    ...base(t, text),
    harnesses,
    platform: 'win32',
    timeoutMs: 12_345,
    run: async (command, args, options) => {
      calls.push({ command, args, options });
      return answers[path.basename(args[0], '.cjs')];
    },
  });

  assert.equal(calls.length, names.length, 'premise: the seam is called once per harness');
  for (const call of calls) {
    assert.equal(call.options.timeoutMs, 12_345);
    assert.equal(call.options.maxOutputBytes, 32 * 1024 * 1024);
    assert.equal(call.options.containTree, true);
  }
  const out = text.join('');
  assert.match(out, /^skipped\s+itest:skips\s+no WSL here/m);
  assert.match(out, /^FAIL\s+itest:floods\s+floods: wrote more than 33554432 bytes — the tree was ended/m);
  assert.match(out, /^FAIL\s+itest:cannot\s+could not start node: ENOENT/m);
  assert.match(out, /^FAIL\s+itest:slow\s+slow: no exit within 12.345 seconds — killed/m);
  assert.match(out, /^pass\s+itest:fine/m);
  assert.ok(out.includes('all good') && out.includes('a warning'), 'the output is written when the harness ends');
  assert.equal(code, 1);
});

test('[S1.12] the summary names each harness\'s output size in bytes', async (t) => {
  const { runHarnesses } = await itests();
  const dir = ownedDir(t, 'itest');
  const text: string[] = [];

  await runHarnesses([], { ...base(t, text), harnesses: [harness(dir, 'loud', "process.stdout.write('x'.repeat(100));")] });

  assert.match(text.join(''), /^pass\s+itest:loud\s+\(100 bytes of output\)/m);
});

test('[S1.13] a tree that is not confirmed ended after the timeout is one more line in that harness\'s FAIL detail; nothing is removed', posixOnly, async (t) => {
  const { runHarnesses } = await itests();
  const dir = ownedDir(t, 'itest');
  const text: string[] = [];

  await runHarnesses([], {
    ...base(t, text),
    harnesses: [harness(dir, 'hang', 'setInterval(() => {}, 1000);')],
    timeoutMs: 500,
    confirm: async () => ({ ended: false, alive: 2 }),
    survivors: () => ({ pids: [], unverified: [] }),
  });

  assert.match(text.join(''), /^FAIL\s+itest:hang\s+hang: no exit within .* — killed; the end of its process tree is not confirmed \(2 still alive\)/m);
});
