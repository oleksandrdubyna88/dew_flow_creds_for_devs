import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { reachesEditor, runtimeImports, withoutComments } from './importWalk';

/**
 * `withoutComments` reads the SYNTAX of a source, not its characters (the re-review for epoch 6): a string that holds `/*` before a real
 * import and one that holds the closing mark after it must not blank the import and leave R2 blind to what it loads.
 */

const OPEN = '/' + '*';
const CLOSE = '*' + '/';

test('a string holding the opening of a block comment before a real import, and the closing after it, blanks nothing', () => {
  const source = [`const open = '${OPEN}';`, `import { real } from './real';`, `import * as vscode from 'vscode';`, `const close = '${CLOSE}';`].join('\n');
  assert.deepEqual(runtimeImports(source), ['real'], 'the relative import is still found');
  assert.equal(reachesEditor(source), true, 'and so is the editor import R2 exists to find');
});

test('the same with a template literal and a regular expression (a character class holds the marks) around the import', () => {
  const template = ['const t = `${1} ' + OPEN + ' ${2}`;', `import { real } from './real';`, 'const u = `${3} ' + CLOSE + ' ${4}`;'].join('\n');
  assert.deepEqual(runtimeImports(template), ['real']);
  const regex = ['const r = /[/*]/;', `import * as vscode from 'vscode';`, 'const q = /[*/]/;'].join('\n');
  assert.equal(reachesEditor(regex), true);
});

test('real comments are still blanked: a block comment, a whole-line comment and a trailing comment name no import', () => {
  const source = [
    `${OPEN} import * as vscode from 'vscode'; ${CLOSE}`,
    `// import { gone } from './gone';`,
    `const x = 1; // import * as vscode from 'vscode';`,
    `import { kept } from './kept';`,
  ].join('\n');
  assert.deepEqual(runtimeImports(source), ['kept']);
  assert.equal(reachesEditor(source), false);
});

test('a comment marker inside a string that follows `//` text is not a comment: a URL in a string keeps the import after it', () => {
  const source = [`const url = 'http://example.test/${OPEN}';`, `import * as vscode from 'vscode';`].join('\n');
  assert.equal(reachesEditor(source), true);
});

test('withoutComments keeps the line structure, so a reported line is still the source\'s', () => {
  const source = [`${OPEN} one`, 'two', `${CLOSE} const x = 1;`, '// tail', 'const y = 2;'].join('\n');
  assert.equal(withoutComments(source).split('\n').length, source.split('\n').length);
  assert.ok(withoutComments(source).includes('const y = 2;'));
});
