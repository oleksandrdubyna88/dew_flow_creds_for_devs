import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeChanges, diffConfigs, summarizeChanges } from '../configDiff';

/**
 * What a colleague changed, by key.
 *
 * <p>"The config changed" is what a sync says today, and it is what makes a shared config
 * something you accept rather than something you review. Somebody added a connection string, or
 * moved a port, or removed a flag you were relying on — three different days, and a line diff of
 * a reformatted document tells you none of them.</p>
 */

const BEFORE = JSON.stringify(
  {
    ConnectionStrings: { Default: 'Server=localhost' },
    Serilog: { MinimumLevel: { Default: 'Information' } },
    Port: 5432,
  },
  null,
  2,
);

test('an added key is reported as added, with its new value', () => {
  const after = JSON.stringify({ ...JSON.parse(BEFORE), Feature: { NewThing: true } }, null, 2);

  const changes = diffConfigs('json', BEFORE, after);

  assert.deepEqual(changes, [{ kind: 'added', path: 'Feature:NewThing', after: 'true' }]);
});

test('a removed key is reported as removed, with what it used to be', () => {
  const after = JSON.stringify({ ConnectionStrings: { Default: 'Server=localhost' }, Port: 5432 }, null, 2);

  const changes = diffConfigs('json', BEFORE, after);

  assert.deepEqual(changes, [
    { kind: 'removed', path: 'Serilog:MinimumLevel:Default', before: 'Information' },
  ]);
});

test('a changed value carries both sides', () => {
  const after = BEFORE.replace('Server=localhost', 'Server=prod');

  const changes = diffConfigs('json', BEFORE, after);

  assert.deepEqual(changes, [
    {
      kind: 'changed',
      path: 'ConnectionStrings:Default',
      before: 'Server=localhost',
      after: 'Server=prod',
    },
  ]);
});

test('reformatting alone is not a change — the diff is by key, not by line', () => {
  // The property that makes this worth having. A colleague who reindented the file has changed
  // nothing, and a line diff would say otherwise about every line.
  const reindented = JSON.stringify(JSON.parse(BEFORE));

  assert.deepEqual(diffConfigs('json', BEFORE, reindented), []);
});

test('a type change IS a change, and is not normalised away', () => {
  // `5432` becoming `"5432"` is worth seeing: one binds to an int property and the other may not.
  const after = BEFORE.replace('"Port": 5432', '"Port": "5432"');

  const changes = diffConfigs('json', BEFORE, after);

  assert.deepEqual(changes.map((c) => c.kind), ['changed']);
  assert.equal(changes[0].path, 'Port');
});

test('the three kinds are grouped, not interleaved', () => {
  // Read for three different reasons — what is new, what is gone, what moved — so a reader
  // scanning for one should not have to filter the others out by eye.
  const after = JSON.stringify(
    { ConnectionStrings: { Default: 'Server=prod' }, Port: 5432, Added: 1 },
    null,
    2,
  );

  const kinds = diffConfigs('json', BEFORE, after).map((change) => change.kind);

  assert.deepEqual(kinds, ['added', 'removed', 'changed']);
});

test('filling in an empty config reports every key as added, not nothing', () => {
  const changes = diffConfigs('json', '', BEFORE);

  assert.equal(changes.length, 3);
  assert.ok(changes.every((change) => change.kind === 'added'));
});

test('an unparsable side reports nothing rather than reporting everything removed', () => {
  // A diff computed from half a document would say every key was removed — a frightening and
  // false way to say "this does not parse". `describeConfigProblem` is what says that.
  assert.deepEqual(diffConfigs('json', BEFORE, '{"broken": '), []);
  assert.deepEqual(diffConfigs('json', '{"broken": ', BEFORE), []);
});

test('env files diff by variable name', () => {
  const before = '# a note\nDB_PASSWORD=old\nPORT=5432\n';
  const after = '# a different note\nDB_PASSWORD=new\nEXTRA=1\n';

  const changes = diffConfigs('env', before, after);

  assert.deepEqual(
    changes.map((change) => `${change.kind} ${change.path}`),
    ['added EXTRA', 'removed PORT', 'changed DB_PASSWORD'],
  );
});

test('a format with no field view diffs to nothing rather than to noise', () => {
  assert.deepEqual(diffConfigs('yaml', 'a: 1', 'a: 2'), []);
});

test('the description NEVER carries a value — only which keys moved', () => {
  // This text goes to a toast, an output channel, a line somebody screenshots. A config holds
  // connection strings and passwords; which keys moved is the reviewable half and carries none.
  const after = BEFORE.replace('Server=localhost', 'Server=prod;Password=hunter2');

  const text = describeChanges(diffConfigs('json', BEFORE, after));

  assert.match(text, /ConnectionStrings:Default/);
  assert.equal(text.includes('hunter2'), false, 'a password reached a notification');
  assert.equal(text.includes('Server='), false, 'a value reached a notification');
});

test('nothing changed says so, in both shapes', () => {
  assert.equal(describeChanges([]), 'No keys changed.');
  assert.equal(summarizeChanges([]), 'no keys changed');
});

test('the summary counts each kind, and names only the kinds that happened', () => {
  const after = JSON.stringify({ ConnectionStrings: { Default: 'Server=prod' }, Added: 1 }, null, 2);

  const summary = summarizeChanges(diffConfigs('json', BEFORE, after));

  assert.match(summary, /1 added/);
  assert.match(summary, /1 changed/);
  assert.match(summary, /2 removed/);
});
