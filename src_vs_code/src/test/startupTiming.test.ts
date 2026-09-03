import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PhaseTimer, SLOW_COMMAND_MS, timed } from '../startupTiming';

/**
 * The instrument, tested — because an instrument that lies is worse than none, and this one is
 * going to be the only evidence behind whatever the slow-startup report turns out to be.
 */

/** A clock that advances only when told, so a duration is an assertion rather than a flake. */
function clockOf(steps: readonly number[]): () => number {
  let at = 0;
  let index = 0;
  return () => {
    at += index < steps.length ? steps[index] : 0;
    index += 1;
    return at;
  };
}

test('a phase is the time since the PREVIOUS mark, not since the start', () => {
  // 0 (construction), then +100, +250, +40.
  const timer = new PhaseTimer(clockOf([0, 100, 250, 40]));

  timer.mark('storage');
  timer.mark('tree');
  timer.mark('commands');

  assert.deepEqual(timer.marks, [
    { name: 'storage', ms: 100 },
    { name: 'tree', ms: 250 },
    { name: 'commands', ms: 40 },
  ]);
  assert.equal(timer.totalMs, 390, 'the total is still the whole span');
});

test('the summary leads with the total, because that is the number being complained about', () => {
  const timer = new PhaseTimer(clockOf([0, 100, 250]));
  timer.mark('storage');
  timer.mark('tree');

  assert.equal(timer.summary(), '350ms — storage 100ms, tree 250ms');
});

test('a timer nobody marked still reports its span rather than an empty string', () => {
  assert.equal(new PhaseTimer(clockOf([0])).summary(), '0ms');
});

test('a slow command names itself; a quick one says nothing at all', async () => {
  const lines: string[] = [];
  const sink = { info: (source: string, message: string) => lines.push(`${source}: ${message}`) };

  const slow = timed('credSshManager.openTerminal', () => 'done', sink, clockOf([0, 5000]));
  const quick = timed('credSshManager.copy', () => 'done', sink, clockOf([0, 12]));

  assert.equal(await slow(), 'done', 'the answer is passed through untouched');
  assert.equal(await quick(), 'done');
  assert.deepEqual(lines, ['timing: credSshManager.openTerminal took 5000ms']);
});

test('a command that takes five seconds and THEN fails is still reported, and still throws', async () => {
  const lines: string[] = [];
  const sink = { info: (_source: string, message: string) => lines.push(message) };
  const failing = timed(
    'credSshManager.runCommand',
    () => {
      throw new Error('no such host');
    },
    sink,
    clockOf([0, 5000]),
  );

  await assert.rejects(failing(), /no such host/, 'the instrument must not swallow the failure');
  assert.deepEqual(lines, ['credSshManager.runCommand took 5000ms and failed']);
});

test('the threshold is high enough that an ordinary click writes nothing', () => {
  assert.ok(SLOW_COMMAND_MS >= 500, 'below half a second nobody is waiting');
});
