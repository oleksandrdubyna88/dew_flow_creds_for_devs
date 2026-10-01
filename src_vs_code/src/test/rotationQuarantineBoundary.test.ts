import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import * as ts from 'typescript';

/**
 * The rotation's held value is reached by ONE module (rotation-quarantine plan §4.1, Q2).
 *
 * <p>A value the vault could not store waits in its own keychain item, readable by the OS keychain's
 * protection alone. It must never reach an agent reader, a listing, a log or a payload — and the way to keep
 * that true as the code grows is that nothing but `rotationQuarantine.ts` can name the item: the key builder
 * (`rotationQuarantineSecretKey`), the store (`QuarantineStore`, `quarantineStore`), the one field that holds
 * it (`StorageManager.heldRotations`) and the index key. `secretKeys.ts` defines the builder, and
 * `storageManager.ts` may name the store only to declare and fill that field.</p>
 *
 * <p>The structural companions (`testing.md`): a NEGATIVE fixture — a planted reference from `mcpEntries.ts`
 * is reported — and a POSITIVE control — the scan still finds the known references.</p>
 */

const SRC = path.join(__dirname, '..', '..', 'src');

/** The names that reach the item. An identifier, a property name or a string literal. */
const NAMES = new Set(['rotationQuarantineSecretKey', 'QuarantineStore', 'quarantineStore', 'heldRotations', 'credSshManager.rotationQuarantine']);

/** Where they may appear, and why. */
const ALLOWED: Readonly<Record<string, string>> = {
  'rotationQuarantine.ts': 'the module: the store, the index, the hold and the release',
  'secretKeys.ts': 'defines the key builder and lists it among what an entry owns',
};

/** `storageManager.ts` may name the store only to declare and make its one field — exactly these. */
const STORAGE_FIELD = ['import QuarantineStore', 'import quarantineStore', 'heldRotations', 'QuarantineStore', 'heldRotations', 'quarantineStore'];

interface Reference {
  readonly file: string;
  readonly line: number;
  readonly what: string;
}

function referencesIn(file: string, text: string): Reference[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found: Reference[] = [];
  const visit = (node: ts.Node): void => {
    const name = nameOf(node);
    if (name !== undefined && NAMES.has(name)) {
      found.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, what: labelOf(node, name) });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function nameOf(node: ts.Node): string | undefined {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : undefined;
}

function labelOf(node: ts.Node, name: string): string {
  return ts.findAncestor(node, ts.isImportDeclaration) === undefined ? name : `import ${name}`;
}

function sourceFiles(dir: string = SRC): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'test' ? [] : sourceFiles(full);
    }
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

function everyReference(): Reference[] {
  return sourceFiles().flatMap((full) => referencesIn(path.relative(SRC, full).split(path.sep).join('/'), fs.readFileSync(full, 'utf8')));
}

const said = (reference: Reference): string => `src/${reference.file}:${reference.line} ${reference.what}`;

test('nothing but rotationQuarantine.ts names the held value\'s key, its store or its index — storageManager.ts only declares the one field', () => {
  const all = everyReference();
  const outside = all.filter((reference) => ALLOWED[reference.file] === undefined && reference.file !== 'storageManager.ts');
  const storage = all.filter((reference) => reference.file === 'storageManager.ts').map((reference) => reference.what);

  assert.deepEqual(outside.map(said), [], 'a module outside the quarantine reaches the held value — ask rotationQuarantine.ts instead');
  assert.deepEqual(storage, STORAGE_FIELD, 'storageManager.ts names the held value beyond declaring and making its one field');
});

test('the negative fixture: a reference planted in mcpEntries.ts is reported, by field, by builder and by index key', () => {
  const planted = [
    "import { rotationQuarantineSecretKey } from './secretKeys';",
    'export async function leak(storage: S) { return storage.heldRotations.read("a", "e"); }',
    'export const key = rotationQuarantineSecretKey("a", "e");',
    "export const index = state.get('credSshManager.rotationQuarantine');",
  ].join('\n');

  assert.deepEqual(referencesIn('mcpEntries.ts', planted).map(said), [
    'src/mcpEntries.ts:1 import rotationQuarantineSecretKey',
    'src/mcpEntries.ts:2 heldRotations',
    'src/mcpEntries.ts:3 rotationQuarantineSecretKey',
    'src/mcpEntries.ts:4 credSshManager.rotationQuarantine',
  ]);
});

test('the positive control: the scan still finds the module\'s own references and the key\'s definition', () => {
  const all = everyReference();
  const seen = (file: string, what: string): boolean => all.some((reference) => reference.file === file && reference.what === what);

  assert.ok(seen('rotationQuarantine.ts', 'rotationQuarantineSecretKey'), 'the module\'s own use of the key is no longer seen');
  assert.ok(seen('rotationQuarantine.ts', 'quarantineStore'), 'the module\'s own store is no longer seen');
  assert.ok(seen('storageManager.ts', 'heldRotations'), 'the one field is no longer seen');
  assert.ok(seen('secretKeys.ts', 'rotationQuarantineSecretKey'), 'the builder\'s definition is no longer seen');
});
