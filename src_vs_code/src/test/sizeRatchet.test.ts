import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { ratchet, tightened } from '../sizeRatchet';

/**
 * T3 — the ratchet. An exempted file may shrink, never grow; the message names the file and
 * both numbers, because a bare "too big" is a check people disable.
 */

test('at baseline passes; one line larger fails naming the file and both numbers', () => {
  const ok = ratchet({ 'a.ts': 100 }, { 'a.ts': 100 });
  assert.equal(ok[0].state, 'ok');
  const grew = ratchet({ 'a.ts': 100 }, { 'a.ts': 101 });
  assert.equal(grew[0].state, 'grew');
  assert.match(grew[0].message, /a\.ts grew: 101 lines against a baseline of 100/);
});

test('smaller passes and asks for the baseline to be lowered — the only way it moves', () => {
  const shrank = ratchet({ 'a.ts': 100 }, { 'a.ts': 90 });
  assert.equal(shrank[0].state, 'shrank');
  assert.deepEqual(tightened({ 'a.ts': 100, 'b.ts': 50 }, { 'a.ts': 90, 'b.ts': 60 }), { 'a.ts': 90, 'b.ts': 50 });
});

test('a baselined file nobody measured is a failure, not a silent pass', () => {
  const [verdict] = ratchet({ 'gone.ts': 100 }, {});
  assert.equal(verdict.state, 'unlisted');
});

test('the checked-in baseline names exactly the files that carry the max-lines disable', () => {
  const root = path.join(__dirname, '..', '..');
  const baseline = JSON.parse(fs.readFileSync(path.join(root, '.size-baseline.json'), 'utf8')) as Record<string, number>;
  const exempted = fs
    .readdirSync(path.join(root, 'src'))
    .filter((name) => name.endsWith('.ts'))
    .filter((name) => /eslint-disable max-lines\b/.test(fs.readFileSync(path.join(root, 'src', name), 'utf8').split('\n', 3).join('\n')))
    .map((name) => `src/${name}`)
    .sort();
  assert.deepEqual(Object.keys(baseline).sort(), exempted, 'an exempted file without a baseline can grow unwatched');
  for (const [file, limit] of Object.entries(baseline)) {
    const lines = (fs.readFileSync(path.join(root, file), 'utf8').match(/\n/g) ?? []).length;
    assert.ok(lines <= limit, `${file} is ${lines} lines against a baseline of ${limit} — the ratchet would fail CI`);
  }
});
