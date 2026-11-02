// The start-of-run sweep, wired (F22, release cc24f9e): `runWithAudit`'s DEFAULT sweep is the mounted reference's
// `sweepLeftovers` with this repository's token bound AFTER the caller's options, loaded fail-closed. These scenarios run the REAL
// sweep, in private roots only (a `roots` seam), with the reference's own test seams (`probe`, `now`) handed in through
// `sweepOptions`; the real temp root is never swept by a test.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { formatOwner, thisOwner } from '../../scripts/lib/leftovers.cjs';
import { ENDED, exists, lines, me, ownerWith, privateRoot, runner, suite } from './runnerWorld';

const posixOnly = process.platform === 'win32' ? { skip: 'the reference sweep only LISTS on Windows (F16): the Windows scenario below' } : {};
const winOnly = process.platform === 'win32' ? {} : { skip: 'Windows lists `unverified:` and removes nothing' };

/** A folder `testsToDelete-<owner>-<token>-<what>-abc123` claimed by `record`. */
function folder(root: string, token: string, what: string, record: string): string {
  const dir = path.join(root, `testsToDelete-${me}-${token}-${what}-abc123`);
  fs.mkdirSync(dir);
  fs.writeFileSync(`${dir}.owner`, `${record}\n`);
  return dir;
}

const DEAD_PID = 4242;
/** A record naming a pid the probe will call dead: this process's host and namespace, so only the liveness decides. */
const deadRecord = (): string => formatOwner(ownerWith(DEAD_PID, thisOwner().start ?? 1));
const liveRecord = (): string => formatOwner(thisOwner());
const elevenMinutesOn = (): number => Date.now() + 11 * 60_000;
const probe = (pid: number): { state: string } => ({ state: pid === DEAD_PID ? 'dead' : 'live' });

test('[E2.1 F22 wiring] the default sweep collects a dead, old creds folder, and keeps a conventions folder and a live creds folder', posixOnly, async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const dead = folder(root, 'creds', 'dead', deadRecord());
  const live = folder(root, 'creds', 'live', liveRecord());
  const other = folder(root, 'conventions', 'dead', deadRecord());
  const log = lines();

  const code = await runWithAudit([], { spawn: suite(0), roots: [root], confirm: ENDED, sweepOptions: { probe, now: elevenMinutesOn() }, write: log.write });

  assert.equal(code, 0, 'a sweep never changes the exit code');
  assert.equal(exists(dead) || exists(`${dead}.owner`), false, 'the dead creds folder and its claim are collected');
  assert.ok(exists(live) && exists(`${live}.owner`), 'a live run\'s folder survives');
  assert.ok(exists(other) && exists(`${other}.owner`), 'another token\'s folder is not this repository\'s business');
  assert.deepEqual(log.seen.filter((line) => line.includes('leftovers error')), []);
});

test('[E2.1 F22 wiring] the sweep\'s report lines are written as sweepAll writes them', posixOnly, async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  folder(root, 'creds', 'dead', deadRecord());
  folder(root, 'creds', 'live', liveRecord());
  const unmarked = path.join(root, `testsToDelete-${me}-creds-nobody-abc123`);
  fs.mkdirSync(unmarked);
  const log = lines();

  await runWithAudit([], { spawn: suite(0), roots: [root], confirm: ENDED, sweepOptions: { probe, now: elevenMinutesOn() }, write: log.write });

  const real = fs.realpathSync(root);
  assert.ok(log.seen.includes(`run-tests: leftovers in ${real} — removed 1, preserved 1`), log.seen.join(' | '));
  assert.ok(log.seen.some((line) => line.startsWith('run-tests: unmarked:') && line.includes(unmarked)), 'an unmarked folder is listed');
});

test('[E2.1 F22 wiring] the consumer\'s token cannot be overridden by the caller\'s options', posixOnly, async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const other = folder(root, 'conventions', 'dead', deadRecord());

  await runWithAudit([], { spawn: suite(0), roots: [root], confirm: ENDED, sweepOptions: { probe, now: elevenMinutesOn(), token: 'conventions' }, write: lines().write });

  assert.ok(exists(other) && exists(`${other}.owner`), 'a `token` in the options did not turn the sweep onto another repository\'s folders');
});

test('[E2.1 F22 wiring] a sweep that cannot be loaded is one report line, removes nothing, and leaves the exit code as the suite\'s', posixOnly, async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const dead = folder(root, 'creds', 'dead', deadRecord());
  const log = lines();

  const code = await runWithAudit([], {
    spawn: suite(3),
    roots: [root],
    confirm: ENDED,
    sweepOptions: { probe, now: elevenMinutesOn() },
    loadSweep: async () => {
      throw new Error('Cannot find module leftovers-sweep.mjs');
    },
    write: log.write,
  });

  assert.equal(code, 3);
  assert.ok(exists(dead) && exists(`${dead}.owner`), 'nothing is removed by a sweep that did not load');
  assert.equal(log.seen.filter((line) => line.includes('sweep')).length, 1, log.seen.join(' | '));
  assert.match(log.seen[0], /Cannot find module leftovers-sweep\.mjs/);
});

test('[E2.1 F22 wiring] on Windows the sweep lists `unverified:` and removes nothing (F16)', winOnly, async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const dead = folder(root, 'creds', 'dead', deadRecord());
  const log = lines();

  const code = await runWithAudit([], { spawn: suite(0), roots: [root], confirm: ENDED, sweepOptions: { probe, now: elevenMinutesOn() }, write: log.write });

  assert.equal(code, 0);
  assert.ok(exists(dead));
  assert.ok(log.seen.some((line) => line.includes('unverified:')), log.seen.join(' | '));
});
