// The runner's third round (E2.1, coai code gate round 3 and the Opus review): the macOS holes (a scan with no environment to
// read, a record with no start time), a timeout on every launched process, a second bound after the kill, a scan that reads
// /proc after the process table and never blocks, a pid bound to its start time, and a confirmation that is honest on Windows.
//
// Same rules as the other runner files: private roots through the `roots` seam, no real sweep, seams for what cannot be had.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { formatOwner, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { ENDED, NO_SURVIVORS, RECORD, auditRemoves, exists, lines, nothingSwept, ownerWith, plant, privateRoot, processTree, runner, suite, tableOf, withEnv } from './runnerWorld';

const posixOnly = process.platform === 'win32' ? { skip: 'POSIX: a fake ps script' } : {};

test('[E2.1 Opus 1] on a POSIX that is not Linux the scan cannot read an environment, so it says so, with a reason of its own', async () => {
  const tree = await processTree();

  const found = await tree.findSurvivors({ rootPid: undefined, record: RECORD, platform: 'darwin', table: () => tableOf([]) });
  // The real scan, with a table seam: a host with no `ps` (Windows) would add an entry of its own, and that rightly stays 'unknown'.
  const ended = await tree.endTree(new EventEmitter(), { confirm: ENDED, record: RECORD, platform: 'darwin', survivors: (args: Parameters<typeof tree.findSurvivors>[0]) => tree.findSurvivors({ ...args, table: () => tableOf([]) }) });

  assert.deepEqual(found.unverified, ['no environment scan on this OS']);
  assert.equal(ended.ended, false);
  assert.equal(ended.reason, 'no-scan', 'a reason of its own: the scan could not be done on this OS, nothing else is in doubt');
  assert.equal(ended.alive, 0);
  assert.match(ended.cause ?? '', /no environment scan on this OS/);
});

const NO_SCAN = 'no environment scan on this OS';

test('[E2.1 Opus 1] the fixed no-scan entry beside any other entry, or beside a live survivor, is not "no-scan": the run still fails on it', async () => {
  const tree = await processTree();
  const options = { confirm: ENDED, record: RECORD, platform: 'darwin', pidAlive: () => true, kill: () => undefined, settleTimeoutMs: 30 };

  const beside = await tree.endTree(new EventEmitter(), { ...options, survivors: () => ({ pids: [], unverified: [NO_SCAN, 'the process table could not be read'] }) });
  const alive = await tree.endTree(new EventEmitter(), { ...options, startOf: () => 1, survivors: () => ({ pids: [4242], unverified: [NO_SCAN] }) });

  assert.equal(beside.reason, 'unknown');
  assert.match(beside.cause ?? '', /the process table could not be read/);
  assert.equal(alive.ended, false);
  assert.equal(alive.alive, 1);
  assert.equal(alive.reason, undefined, 'a known live descendant is counted, not excused');
});

test('[E2.1 Opus 1] and the runner, told it is on darwin, with nothing claimed leaves with the suite\'s own code and removes nothing', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const tree = await processTree();
  const survivors = (args: Parameters<typeof tree.findSurvivors>[0]) => tree.findSurvivors({ ...args, table: () => tableOf([]) }); // no host's `ps`: see the test above
  const log = lines();
  let unmarked = '';

  const passed = await runWithAudit([], { spawn: suite(0, () => { unmarked = plant(root, 'mac'); }), roots: [root], sweep: nothingSwept, confirm: ENDED, platform: 'darwin', survivors, write: log.write });
  const failed = await runWithAudit([], { spawn: suite(3), roots: [root], sweep: nothingSwept, confirm: ENDED, platform: 'darwin', survivors, write: lines().write });

  assert.equal(passed, 0, 'a clean run is not failed for a confirmation this OS cannot give');
  assert.equal(failed, 3, 'and a failed suite keeps its own code');
  assert.ok(exists(unmarked));
  assert.ok(!log.seen.some((line) => line.includes('this run left')), log.seen.join(' | '));
});

test('[E2.1 Opus 1] and the runner on darwin still fails when the scan failed for another reason too, even with nothing claimed', async (t) => {
  const { runWithAudit } = await runner();
  const log = lines();

  const code = await runWithAudit([], { spawn: suite(0), roots: [privateRoot(t)], sweep: nothingSwept, confirm: ENDED, platform: 'darwin', survivors: () => ({ pids: [], unverified: [NO_SCAN, 'the process table could not be read'] }), write: log.write });

  assert.equal(code, 1);
  assert.ok(log.seen.some((line) => line.includes('could not be confirmed')), log.seen.join(' | '));
});

test('[E2.1 Opus 1] and the runner, told it is on darwin, keeps a claimed folder and fails the run', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const log = lines();
  let left = '';

  const code = await runWithAudit([], { spawn: suite(0, () => { left = plant(root, 'mac', RECORD); }), roots: [root], sweep: nothingSwept, confirm: ENDED, platform: 'darwin', write: log.write });

  assert.equal(code, 1);
  assert.ok(exists(left), 'a folder a detached grandchild may still hold is never removed on a scan that cannot see it');
  assert.ok(log.seen.some((line) => line.includes('could not be confirmed')), log.seen.join(' | '));
});

test('[E2.1 Opus 1] the platforms where a claimed folder is kept are every one but Linux: the runner told darwin or freebsd keeps it, and `auditRemoves` says the same', posixOnly, async (t) => {
  const { runWithAudit } = await runner();
  const platforms = process.platform === 'linux' ? ['linux', 'darwin', 'freebsd'] : ['darwin', 'freebsd']; // the Linux scan reads this machine's /proc
  const seen: string[] = [];

  for (const platform of platforms) {
    const root = privateRoot(t);
    let left = '';
    const code = await runWithAudit([], { spawn: suite(0, () => { left = plant(root, 'plat', RECORD); }), roots: [root], sweep: nothingSwept, confirm: ENDED, platform, write: lines().write });

    assert.equal(code, 1, `${platform}: the folder was claimed, so the run fails`);
    assert.equal(exists(left), !auditRemoves(platform), `${platform}: kept or removed as auditRemoves says`);
    seen.push(`${platform}:${exists(left) ? 'kept' : 'removed'}`);
  }
  assert.deepEqual(seen, platforms.map((platform) => `${platform}:${platform === 'linux' ? 'removed' : 'kept'}`));
});

test('[E2.1 Opus 2] where the record has no start time, a claim older than this run is listed and never removed', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const noStart = formatOwner(ownerWith(process.pid));
  const log = lines();
  let fresh = '';
  let stale = '';

  const code = await runWithAudit([], {
    spawn: suite(0, () => {
      fresh = plant(root, 'fresh', noStart);
      stale = plant(root, 'stale', noStart);
      const old = new Date(Date.now() - 3_600_000);
      fs.utimesSync(`${stale}.owner`, old, old); // a dead run's claim, with the same pid text
    }),
    roots: [root],
    record: noStart,
    sweep: nothingSwept,
    confirm: ENDED,
    survivors: NO_SURVIVORS,
    write: log.write,
  });

  assert.equal(code, 1, 'the fresh claim is this run\'s');
  assert.equal(exists(fresh), false);
  assert.ok(exists(stale) && exists(`${stale}.owner`), 'a claim from before this run cannot be proven to be its own');
  assert.ok(log.seen.some((line) => line.includes('unproven:') && line.includes(stale)), log.seen.join(' | '));
  assert.ok(!log.seen.some((line) => line.includes('left 2 folder')), 'only the fresh one is counted');
});

const withStart = RECORD.split(':').length >= 4 ? {} : { skip: 'this OS gives no start time, so the record has none (the scenario above is the one that applies)' };

test('[E2.1 Opus 2] where the record has a start time the claim\'s age is not asked: the start time already tells the runs apart', withStart, async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  let old = '';

  const code = await runWithAudit([], {
    spawn: suite(0, () => {
      old = plant(root, 'withstart', RECORD);
      const past = new Date(Date.now() - 3_600_000);
      fs.utimesSync(`${old}.owner`, past, past);
    }),
    roots: [root],
    sweep: nothingSwept,
    confirm: ENDED,
    write: lines().write,
  });

  assert.equal(code, 1);
  assert.equal(exists(old), false);
});

test('[E2.1 code3 9, Opus 3] a `ps` that hangs is "cannot confirm", inside its own bound, and is killed', posixOnly, async (t) => {
  const tree = await processTree();
  const bin = ownedDir(t, 'fakeps');
  const marker = path.join(bin, 'started');
  fs.writeFileSync(path.join(bin, 'ps'), `#!/bin/sh\ntouch ${marker}\nexec sleep 30\n`, { mode: 0o755 });
  const began = Date.now();

  const found = await withEnv({ PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` }, () => tree.findSurvivors({ rootPid: 123456, record: RECORD, platform: 'darwin', psTimeoutMs: 300 }));

  assert.ok(exists(marker), 'the fake ps ran');
  assert.ok(Date.now() - began < 10_000, 'it did not wait for the sleep');
  assert.ok(found.unverified.some((entry) => /timed out|could not be read/.test(entry)), JSON.stringify(found));
});

test('[E2.1 Opus bound] if the kill does not end the coordinator the runner gives up after a second bound and lists and fails', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const log = lines();
  let left = '';
  const stubborn = (): EventEmitter => {
    left = plant(root, 'stuck', RECORD);
    return Object.assign(new EventEmitter(), { stop: () => undefined }); // the kill changes nothing
  };
  const began = Date.now();

  const code = await runWithAudit([], { spawn: stubborn, roots: [root], sweep: nothingSwept, confirm: ENDED, timeoutMs: 30, hardBoundMs: 80, write: log.write });

  assert.equal(code, 124);
  assert.ok(Date.now() - began < 5000, 'it returned');
  assert.ok(exists(left), 'a coordinator that is still alive keeps its folders');
  assert.ok(log.seen.some((line) => line.includes('did not exit') && line.includes('not removed')), log.seen.join(' | '));
});

test('[E2.1 code3 5] unverified causes are kept even when known survivors remain', async () => {
  const tree = await processTree();

  const ended = await tree.endTree(new EventEmitter(), {
    confirm: ENDED,
    survivors: () => ({ pids: [4_194_305], unverified: ['/proc/9/environ cannot be read'] }),
    pidAlive: () => true,
    kill: () => undefined,
    settleTimeoutMs: 60,
  });

  assert.equal(ended.ended, false);
  assert.equal(ended.alive, 1);
  assert.match(ended.cause ?? '', /\/proc\/9\/environ cannot be read/);
});

test('[E2.1 code3 3/6] the scan is asynchronous: it never blocks the event loop with a sleep', async () => {
  const tree = await processTree();

  const pending = tree.findSurvivors({ rootPid: undefined, record: RECORD, platform: 'linux', procRoot: path.join(path.sep, 'no', 'such', 'proc'), table: () => tableOf([]) });

  assert.ok(pending instanceof Promise);
  await pending;
});

test('[E2.1 code3 3/6, 11] an unreadable environment of a process that is not ours is not retried; one that is ours is retried before it is a doubt', async (t) => {
  const tree = await processTree();
  const proc = ownedDir(t, 'proc2');
  fs.mkdirSync(path.join(proc, '4242', 'environ'), { recursive: true }); // a directory: reading it fails with EISDIR, whoever runs the test
  const waits: number[] = [];
  const query = { rootPid: undefined, record: RECORD, platform: 'linux', procRoot: proc, table: () => tableOf([4242]), pause: async (ms: number) => { waits.push(ms); } };

  const strangers = await tree.findSurvivors({ ...query, ours: () => false });
  const strangerWaits = waits.length;
  const mine = await tree.findSurvivors({ ...query, ours: () => true });

  assert.deepEqual(strangers, { pids: [], unverified: [] });
  assert.equal(strangerWaits, 0, 'no retry for somebody else\'s process');
  assert.equal(mine.unverified.length, 1);
  assert.equal(waits.length, 3, 'three retries, each an awaited pause');
});

test('[E2.1 code3 7] /proc entries are matched against the process table before anything is stat-ed or dated', async (t) => {
  const tree = await processTree();
  const proc = ownedDir(t, 'proc3');
  fs.mkdirSync(path.join(proc, '4242'));
  fs.mkdirSync(path.join(proc, '4243'));
  fs.writeFileSync(path.join(proc, '4242', 'environ'), `TESTSTODELETE_RUN=${RECORD}`);
  fs.writeFileSync(path.join(proc, '4243', 'environ'), `TESTSTODELETE_RUN=${RECORD}`);
  const dated: number[] = [];

  const found = await tree.findSurvivors({ rootPid: undefined, record: RECORD, platform: 'linux', procRoot: proc, table: () => tableOf([4242]), startOf: (pid) => { dated.push(pid); return 1; } });

  assert.deepEqual(found.pids, [4242], 'only the pid the table knows');
  assert.ok(!dated.includes(4243));
});

test('[E2.1 code3 10] each survivor is bound to its start time and verified again right before it is signalled', async () => {
  const tree = await processTree();
  const killed: number[] = [];
  const starts = [100, 200, 200, 200]; // at the scan, then a pid that has been reused by another process

  const ended = await tree.endTree(new EventEmitter(), {
    confirm: ENDED,
    survivors: () => ({ pids: [4_194_305], unverified: [] }),
    startOf: () => starts.shift(),
    pidAlive: () => true,
    kill: (pid) => { killed.push(pid); },
    settleTimeoutMs: 80,
  });

  assert.deepEqual(killed, [], 'a reused pid is not signalled');
  assert.equal(ended.ended, true, 'and it is not the run\'s survivor any more');
});

test('[E2.1 code3 10, Opus] a group that is already gone is not signalled and no chain is walked from its (reusable) pid', async () => {
  const tree = await processTree();
  const asked: Array<number | undefined> = [];
  let signalled = 0;

  await tree.endTree({ pid: 4_194_305 }, {
    confirm: ENDED,
    survivors: (query) => { asked.push(query.rootPid); return { pids: [], unverified: [] }; },
    killGroup: () => { signalled += 1; },
  });

  assert.equal(signalled, 0);
  assert.deepEqual(asked, [undefined]);
});

test('[E2.1 Opus] on Windows, through a seam that gives a pid, the confirmation still has no handle: kill(-pid, 0) proves nothing there', async () => {
  const tree = await processTree();

  const answer = await tree.confirmTreeEnded({ root: process.pid }, { platform: 'win32' });

  assert.deepEqual(answer, { ended: false, alive: 0, reason: 'no-handle' });
});

// ---- code gate round 4 ------------------------------------------------------------------------------------------------------

test('[E2.1 code4 1] a foreign folder that has a foreign claim is LISTED as foreign, and nothing is removed', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const log = lines();
  let dir = '';

  const code = await runWithAudit([], { spawn: suite(0, () => { dir = plant(root, 'alien', RECORD); }), roots: [root], sweep: nothingSwept, confirm: ENDED, mine: () => false, write: log.write });

  assert.equal(code, 0, 'it is not a folder this run left');
  assert.ok(exists(dir) && exists(`${dir}.owner`));
  assert.ok(log.seen.some((line) => line.includes('foreign:') && line.includes(`${dir}.owner`)), `the claim is listed, not silently dropped: ${log.seen.join(' | ')}`);
});

test('[E2.1 code4 6] the claim is checked first and is the single authority: for a foreign claim the folder is never asked about', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const asked: string[] = [];
  let dir = '';

  await runWithAudit([], {
    spawn: suite(0, () => { dir = plant(root, 'once', RECORD); }),
    roots: [root],
    sweep: nothingSwept,
    confirm: ENDED,
    mine: (target) => { asked.push(target); return false; },
    write: lines().write,
  });

  assert.deepEqual(asked, [`${dir}.owner`], 'one question, about the claim, and no second stat of the folder');
});

test('[E2.1 code4 9] the `count` of a confirmation may be asynchronous (it is a `ps` run through the shared launcher): it is awaited', async () => {
  const tree = await processTree();

  const answer = await tree.confirmTreeEnded({ root: 1 }, { timeoutMs: 20, probe: () => true, count: async () => 3, pause: async () => undefined, platform: 'linux', now: (() => { let t = 0; return () => (t += 15); })() });

  assert.deepEqual(answer, { ended: false, alive: 3 });
});

test('[E2.1 code4 9] a `ps` that hangs with a child of its own is killed WHOLE, through the shared launcher, inside the ceiling', posixOnly, async (t) => {
  const tree = await processTree();
  const bin = ownedDir(t, 'fakeps2');
  fs.writeFileSync(path.join(bin, 'ps'), '#!/bin/sh\nsleep 30 &\nwait\n', { mode: 0o755 });
  const began = Date.now();

  const found = await withEnv({ PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` }, () => tree.findSurvivors({ rootPid: 123456, record: RECORD, platform: 'darwin', psTimeoutMs: 300 }));

  assert.ok(Date.now() - began < 10_000, 'the grandchild of the hung ps did not hold the run for its 30 seconds');
  assert.ok(found.unverified.some((entry) => /timed out/.test(entry)), JSON.stringify(found));
});

test('[E2.1 code4 12] a survivor with no start time to bind is never signalled; alive, it keeps the answer at not-ended', async () => {
  const tree = await processTree();
  const killed: number[] = [];

  const ended = await tree.endTree(new EventEmitter(), {
    confirm: ENDED,
    survivors: () => ({ pids: [4_194_305], unverified: [] }),
    startOf: () => undefined,
    pidAlive: () => true,
    kill: (pid) => { killed.push(pid); },
    settleTimeoutMs: 80,
  });

  assert.deepEqual(killed, [], 'a pid that cannot be told from a reused one is not killed');
  assert.equal(ended.ended, false);
  assert.equal(ended.alive, 1);
});

test('[E2.1 code4 12] a survivor with no start time that is already dead is simply gone', async () => {
  const tree = await processTree();
  const killed: number[] = [];

  const ended = await tree.endTree(new EventEmitter(), {
    confirm: ENDED,
    survivors: () => ({ pids: [4_194_305], unverified: [] }),
    startOf: () => undefined,
    pidAlive: () => false,
    kill: (pid) => { killed.push(pid); },
    settleTimeoutMs: 80,
  });

  assert.deepEqual(killed, []);
  assert.deepEqual(ended, { ended: true, alive: 0 });
});

test('[E2.1 code4 12] a survivor whose start time was bound IS killed, and polled until it is dead', async () => {
  const tree = await processTree();
  const killed: number[] = [];
  const answers = [true, false];

  const ended = await tree.endTree(new EventEmitter(), {
    confirm: ENDED,
    survivors: () => ({ pids: [4_194_305], unverified: [] }),
    startOf: () => 700,
    pidAlive: () => answers.shift() ?? false,
    kill: (pid) => { killed.push(pid); },
    settleTimeoutMs: 500,
  });

  assert.ok(killed.length >= 1 && killed.every((pid) => pid === 4_194_305), 'signalled (again at each poll while it lives)');
  assert.equal(ended.ended, true);
});

/** A real zombie and the live parent that does not reap it: the shell starts a child, then becomes `sleep`, which waits for nobody. */
async function zombieOfALiveParent(t: { after: (fn: () => void) => void }): Promise<{ zombie: number; parent: number }> {
  const parent = spawn('sh', ['-c', 'sleep 0 & echo $!; exec sleep 30'], { stdio: ['ignore', 'pipe', 'ignore'] });
  t.after(() => { parent.kill('SIGKILL'); });
  const zombie = await new Promise<number>((resolve, reject) => {
    parent.stdout.once('data', (chunk: Buffer) => { resolve(Number(String(chunk).trim())); });
    parent.once('error', reject);
  });
  const state = (): string => {
    try {
      const stat = fs.readFileSync(`/proc/${zombie}/stat`, 'utf8');
      return stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3);
    } catch {
      return '';
    }
  };
  for (let attempt = 0; attempt < 200 && state() !== 'Z'; attempt += 1) await new Promise((resolve) => { setTimeout(resolve, 10); });
  assert.equal(state(), 'Z', 'the premise: the child is a zombie');
  return { zombie, parent: parent.pid as number };
}

const linuxOnly = process.platform === 'linux' ? {} : { skip: 'Linux: a zombie is read from /proc' };

test('[E2.1 review 8] a survivor that is a zombie has ended: the default check does not hold the run open for it, while a live process still does', linuxOnly, async (t) => {
  const tree = await processTree();
  const { zombie, parent } = await zombieOfALiveParent(t);
  const options = { confirm: ENDED, record: RECORD, platform: 'linux', kill: () => undefined, settleTimeoutMs: 60 };

  const ofTheZombie = await tree.endTree(new EventEmitter(), { ...options, survivors: () => ({ pids: [zombie], unverified: [] }) });
  const ofTheLive = await tree.endTree(new EventEmitter(), { ...options, survivors: () => ({ pids: [parent], unverified: [] }) });

  assert.deepEqual(ofTheZombie, { ended: true, alive: 0 });
  assert.equal(ofTheLive.ended, false, 'the check still sees a live process: it is not a check that says "ended" for everything');
  assert.equal(ofTheLive.alive, 1);
});
