import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMaskTable } from '../secretMasker';
import { CLEAN_REPORT, describeScan, scanForSecrets } from '../secretScan';

/**
 * The scan is the honest half of "AI context masking": VS Code has no clipboard-change event
 * and Windows captures the clipboard at copy time, so nothing can watch continuously. What
 * can be done exactly is answer on demand — and never name the value while doing it.
 */

const PASSWORD = 'Tr0ub4dor&3-horse-battery';
const TOKEN = 'ghp_0123456789abcdefghijABCDEFGHIJ';
const table = buildMaskTable([
  { value: PASSWORD, label: 'DB_PASSWORD' },
  { value: TOKEN, label: 'GH_TOKEN' },
]);

test('a clean text reports nothing', () => {
  const report = scanForSecrets('const x = 1;\nconsole.log("ok");', table);

  assert.deepEqual(report, CLEAN_REPORT);
  assert.equal(describeScan(report, 'the clipboard'), 'No vault secrets found in the clipboard.');
});

test('a secret is found and located by line, by its label', () => {
  const text = ['# config', `password = ${PASSWORD}`, 'debug = true'].join('\n');
  const report = scanForSecrets(text, table);

  assert.equal(report.total, 1);
  assert.deepEqual(report.hits, [{ label: 'DB_PASSWORD', line: 2, count: 1 }]);
});

test('two different secrets in one text are both named', () => {
  const text = [`export TOKEN=${TOKEN}`, '', `export PGPASSWORD=${PASSWORD}`].join('\n');
  const report = scanForSecrets(text, table);

  assert.equal(report.total, 2);
  assert.deepEqual(report.hits.map((h) => h.label).sort(), ['DB_PASSWORD', 'GH_TOKEN']);
});

test('repeats are counted, and the first line is the one reported', () => {
  const text = [`a=${PASSWORD}`, `b=${PASSWORD}`].join('\n');
  const report = scanForSecrets(text, table);

  assert.equal(report.total, 2);
  assert.equal(report.hits[0].line, 1);
  assert.equal(report.hits[0].count, 2);
});

test('the message never contains the secret itself', () => {
  // The report exists to say "do not paste this". Printing the value to make that point
  // would leak it into a notification and the editor's message history.
  const report = scanForSecrets(`pw=${PASSWORD}`, table);
  const message = describeScan(report, 'this file');

  assert.equal(message.includes(PASSWORD), false);
  assert.equal(message.includes('DB_PASSWORD'), true);
  assert.equal(message.includes('Do not paste'), true);
});

test('the message counts correctly for one and for many', () => {
  const one = describeScan({ hits: [{ label: 'A', line: 3, count: 1 }], total: 1 }, 'the clipboard');
  const many = describeScan(
    { hits: [{ label: 'A', line: 3, count: 1 }, { label: 'B', line: 9, count: 2 }], total: 3 },
    'the clipboard',
  );

  assert.ok(one.startsWith('1 vault secret is'), one);
  assert.ok(many.startsWith('3 vault secrets are'), many);
  assert.ok(many.includes('A (line 3)') && many.includes('B (line 9)'), many);
});

test('an empty table finds nothing, however alarming the text looks', () => {
  const report = scanForSecrets('password=hunter2\nAKIAIOSFODNN7EXAMPLE', buildMaskTable([]));

  assert.equal(report.total, 0, 'no guessing: only values that are actually in the vault');
});
