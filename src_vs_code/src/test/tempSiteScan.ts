import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

/**
 * The temp-site scan of `leftoversSites.test.ts`, over the TypeScript syntax tree rather than over text, so a word in a
 * comment or a string is not a site and a call spelled across lines still is one.
 *
 * <p>A raw temp site is a CALL that makes or names a temp path: `os.tmpdir()` (or an imported `tmpdir()`), and
 * `fs.mkdtemp` / `fs.mkdtempSync` / `fs.promises.mkdtemp`, and a call through a local alias of a named import of one of them
 * (`import { mkdtempSync as make }`). Everything of the leftovers contract goes through
 * `scripts/lib/leftovers.cjs` instead (`ownedDir`, `tempRoot`, `shortSocketRoot`).</p>
 *
 * <p>Not named `*.test.ts`, so the runner never treats it as a suite.</p>
 */

/** The line numbers (1-based) of every raw temp call in `source`. */
export function rawTempSites(source: string, fileName = 'file.ts'): number[] {
  const tree = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true);
  const lines: number[] = [];
  const aliases = tempAliases(tree);
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isTempCall(node.expression, aliases)) {
      lines.push(tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return lines;
}

const TEMP_CALLS = new Set(['tmpdir', 'mkdtemp', 'mkdtempSync']);

/**
 * The local names the file gives to the temp calls by a named import: `import { mkdtempSync as make } from 'node:fs'` makes `make`
 * one. Only the imported name is looked at, whatever the module is called, so a re-exporting helper cannot hide a call either.
 */
function tempAliases(tree: ts.SourceFile): ReadonlySet<string> {
  const imports = tree.statements.filter(ts.isImportDeclaration);
  const specifiers = imports.flatMap((statement) => namedImports(statement.importClause?.namedBindings));
  return new Set(specifiers.filter((element) => TEMP_CALLS.has((element.propertyName ?? element.name).text)).map((element) => element.name.text));
}

function namedImports(bindings: ts.NamedImportBindings | undefined): readonly ts.ImportSpecifier[] {
  return bindings !== undefined && ts.isNamedImports(bindings) ? bindings.elements : [];
}

function calleeName(callee: ts.Expression): string {
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return ts.isIdentifier(callee) ? callee.text : '';
}

/** A temp call by its own name, or by a bare local alias of one (`make(...)`; a property named like an alias is not it). */
const isTempCall = (callee: ts.Expression, aliases: ReadonlySet<string>): boolean =>
  TEMP_CALLS.has(calleeName(callee)) || (ts.isIdentifier(callee) && aliases.has(callee.text));

/**
 * Every `.ts` file under `root`, as paths relative to it (with `/`), minus the exclusions: an entry of `excluded` is a file's
 * relative path or a folder's, and takes everything below the folder. A new test file is read the day it is written, with no
 * list to extend [E2.1 code 11].
 */
export function discoverSources(root: string, excluded: ReadonlyMap<string, string>): string[] {
  const found: string[] = [];
  const walk = (relative: string): void => {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      visit(relative === '' ? entry.name : `${relative}/${entry.name}`, entry);
    }
  };
  const visit = (child: string, entry: fs.Dirent): void => {
    if (excluded.has(child)) return;
    if (entry.isDirectory()) walk(child);
    else if (entry.name.endsWith('.ts')) found.push(child);
  };
  walk('');
  return found.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); // code-unit order, the same on every machine (a locale order is not)
}
