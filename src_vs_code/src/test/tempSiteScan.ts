import * as ts from 'typescript';

/**
 * The temp-site scan of `leftoversSites.test.ts`, over the TypeScript syntax tree rather than over text, so a word in a
 * comment or a string is not a site and a call spelled across lines still is one.
 *
 * <p>A raw temp site is a CALL that makes or names a temp path: `os.tmpdir()` (or an imported `tmpdir()`), and
 * `fs.mkdtemp` / `fs.mkdtempSync` / `fs.promises.mkdtemp`. Everything of the leftovers contract goes through
 * `scripts/lib/leftovers.cjs` instead (`ownedDir`, `tempRoot`, `shortSocketRoot`).</p>
 *
 * <p>Not named `*.test.ts`, so the runner never treats it as a suite.</p>
 */

/** The line numbers (1-based) of every raw temp call in `source`. */
export function rawTempSites(source: string, fileName = 'file.ts'): number[] {
  const tree = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true);
  const lines: number[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isTempCall(node.expression)) {
      lines.push(tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return lines;
}

const TEMP_CALLS = new Set(['tmpdir', 'mkdtemp', 'mkdtempSync']);

function calleeName(callee: ts.Expression): string {
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return ts.isIdentifier(callee) ? callee.text : '';
}

const isTempCall = (callee: ts.Expression): boolean => TEMP_CALLS.has(calleeName(callee));

/**
 * SKELETON of the [E2.1 code 11] discovery: every `.ts` file under `root`, as paths relative to it, minus the exclusions. It finds
 * nothing yet; `leftoversSites.test.ts` is written against it and watched failing first.
 */
export function discoverSources(_root: string, _excluded: ReadonlyMap<string, string>): string[] {
  return [];
}
