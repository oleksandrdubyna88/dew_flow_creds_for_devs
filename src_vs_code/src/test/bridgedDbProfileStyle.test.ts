import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

/**
 * The coding-style rule held by `bridgedDbProfile.ts` (`common/coding-style.md`: expected failures are values, not exceptions; never mutate an existing object),
 * kept as a scan so a later edit cannot slide back. A refusal here is an expected outcome of reading a stored connection, so it travels as a value; and a field
 * object, a pairs array or a set is never written into after it is made. The scan runs over the code with its comments and string literals taken out, and a
 * companion test proves each shape still matches a known instance, so a reformat cannot leave the prohibition matching nothing.
 */

const SOURCE = path.join(__dirname, '..', '..', 'src', 'bridgedDbProfile.ts');

/** The text with block comments, line comments and the contents of string literals removed. */
function code(text: string): string {
  return text
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/^\s*\/\/.*$/gm, '')
    .replaceAll(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replaceAll(/`(?:[^`\\]|\\.)*`/g, '``');
}

const THROW = /\bthrow\b|extends Error/g;
/** A write into a property or an element of an existing object: `object.name = …`, `object[key] = …`. */
const PROPERTY_WRITE = /\b[A-Za-z_]\w*(?:\.[A-Za-z_]\w*|\[[^\]\n]+\])\s*(?:[-+*/|&^]|\?\?|\|\||&&)?=(?![=>])/g;
/** A method that changes the object it is called on. */
const MUTATING_CALL = /\.(?:push|pop|shift|unshift|splice|sort|reverse|add|set|delete|clear|fill)\(|\bObject\.assign\(/g;
const CATCH = /\bcatch\b/g;

const matches = (pattern: RegExp, text: string): string[] => text.match(pattern) ?? [];

test('the scan still finds a known instance of each shape it forbids, and of the two boundaries it allows', () => {
  assert.equal(matches(THROW, 'function f() { throw new Refused("x"); }').length, 1);
  assert.equal(matches(THROW, 'class Refused extends Error {}').length, 1);
  assert.equal(matches(PROPERTY_WRITE, 'fields[name] = value;').length, 1);
  assert.equal(matches(PROPERTY_WRITE, 'fields.host = value;').length, 1);
  assert.equal(matches(PROPERTY_WRITE, 'const fields: Fields = {}; const x = a.b === c;').length, 0, 'a declaration and a comparison are not a write');
  assert.equal(matches(MUTATING_CALL, 'seen.add(key); pairs.push(x);').length, 2);
  const text = code(fs.readFileSync(SOURCE, 'utf8'));
  assert.equal(matches(CATCH, text).length, 2, 'the two boundaries of a parser that throws: decodeURIComponent and new URL');
  assert.ok(text.includes('decodeURIComponent(') && text.includes('new URL('), 'and they are what the file wraps');
});

test('bridgedDbProfile.ts throws nothing: a refusal is a value that the helpers return', () => {
  assert.deepEqual(matches(THROW, code(fs.readFileSync(SOURCE, 'utf8'))), []);
});

test('bridgedDbProfile.ts writes into no object it was given or made: fields and pairs are built new', () => {
  const text = code(fs.readFileSync(SOURCE, 'utf8'));
  assert.deepEqual(matches(PROPERTY_WRITE, text), [], 'no property or element write');
  assert.deepEqual(matches(MUTATING_CALL, text), [], 'no call that changes its object');
});
