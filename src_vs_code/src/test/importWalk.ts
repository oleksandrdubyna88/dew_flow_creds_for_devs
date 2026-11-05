/**
 * The runtime imports of a module, followed to the end (R2 of the Remote Bridge boundary).
 *
 * <p>A module that imports no editor itself can still reach one through a module it imports, and a test that read only
 * the listed files said "pure" of a file that could not be `require`d without a stub (E1.3 epoch 3, A.1). This walks
 * `import ... from './x'`, `export ... from './x'`, a bare `import './x'` and `require('./x')`, skips the `type`
 * forms (erased by the compiler: they load nothing), and answers the chain to the first module that reaches `vscode`.
 * Not a test file: `node:test` is pointed at `*.test.js` only.</p>
 */

const EDITOR = /\b(?:from\s+|import\s+|require\(\s*)['"]vscode['"]/;
const RELATIVE = /(?:^|[\s;])(?:(?:import|export)\s+(?!type\b)[^;'"]*?\bfrom\s+|import\s+|require\(\s*)['"](\.\/[^'"]+)['"]/g;

/** Source with its comments blanked, so prose that names `from 'vscode'` is not an import. */
export function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** The sibling modules a source loads at run time, as names without extension. */
export function runtimeImports(source: string): string[] {
  const code = withoutComments(source);
  return [...code.matchAll(RELATIVE)].map((match) => match[1].replace(/^\.\//, '').replace(/\.(?:js|ts)$/, ''));
}

/** Whether a source reaches the editor itself. */
export function reachesEditor(source: string): boolean {
  return EDITOR.test(withoutComments(source));
}

/**
 * The chain from `start` to the first module that imports or requires `vscode` (`['a', 'b', 'vscode']`), or `undefined`
 * when none does. `read` answers a module's source by name, `undefined` when there is none such (an unknown module ends
 * a branch; the caller's own test says the walk found real files).
 */
export function chainToEditor(start: string, read: (name: string) => string | undefined): string[] | undefined {
  return chainFrom(start, [], read, new Set());
}

function chainFrom(name: string, via: string[], read: (name: string) => string | undefined, seen: Set<string>): string[] | undefined {
  const source = seen.has(name) ? undefined : read(name);
  seen.add(name);
  if (source === undefined) {
    return undefined;
  }
  const here = [...via, name];
  return reachesEditor(source) ? [...here, 'vscode'] : firstChain(runtimeImports(source), here, read, seen);
}

function firstChain(names: string[], here: string[], read: (name: string) => string | undefined, seen: Set<string>): string[] | undefined {
  for (const next of names) {
    const found = chainFrom(next, here, read, seen);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/** Every module the walk visited from `start`, for a test that wants to say the walk really walked. */
export function closureOf(start: string, read: (name: string) => string | undefined): string[] {
  const seen = new Set<string>();
  const walk = (name: string): void => {
    const source = seen.has(name) ? undefined : read(name);
    seen.add(name);
    for (const next of source === undefined ? [] : runtimeImports(source)) {
      walk(next);
    }
  };
  walk(start);
  return [...seen];
}
