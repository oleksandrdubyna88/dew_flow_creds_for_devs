import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import * as ts from 'typescript';

/**
 * The compile-fail harness (research/PLAN_typed_stored_secrets.md §3 item 3, gate finding 5): what the
 * TYPES promise, proven inside `npm test`.
 *
 * <p>Every file under `src/test/fixtures/typed/` starts with one header line — `// expect TS<code> at
 * line <n>` or `// expect compiles` — and is compiled here as its own program, with the project's own
 * `tsconfig.json` compiler options, and the diagnostics of the fixture file must be exactly that one
 * code at that line, or none. The fixtures are excluded from `tsc -p ./` and from `eslint src` (a file
 * that is MEANT not to compile cannot be part of the build), which is why this is a test and not the
 * build: nothing else would ever compile them.</p>
 *
 * <p>Three things this harness refuses to do silently (E1 plan round, finding 0):</p>
 * <ul>
 *   <li>The fixture directory is resolved from the PACKAGE ROOT. The fixtures are `.ts` and are never
 *       emitted, so a directory taken from this file's own `__dirname` (`out/test/…`) would hold
 *       nothing — and a harness over nothing passes.</li>
 *   <li>Finding zero fixtures FAILS, for the same reason.</li>
 *   <li>A `// expect compiles` fixture must exist: it is the positive control that programs were
 *       built, the import resolved and the checker ran. Without it, every red fixture could be red
 *       for a reason that has nothing to do with the type it is about (a path, an option).</li>
 * </ul>
 */

const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES = path.join(PACKAGE_ROOT, 'src', 'test', 'fixtures', 'typed');

/** What a fixture's first line says must happen. `code` absent: it must compile. */
interface Expectation {
  readonly code?: number;
  readonly line?: number;
}

const HEADER = /^\/\/ expect (?:TS(\d+) at line (\d+)|compiles)\s*$/;

function fixtureFiles(): string[] {
  if (!fs.existsSync(FIXTURES)) {
    return [];
  }
  return fs
    .readdirSync(FIXTURES)
    .filter((name) => name.endsWith('.ts'))
    .sort();
}

function expectationOf(file: string): Expectation {
  const first = fs.readFileSync(path.join(FIXTURES, file), 'utf8').split(/\r?\n/, 1)[0] ?? '';
  const match = HEADER.exec(first);
  assert.ok(match, `${file} has no header — its first line must be "// expect TS<code> at line <n>" or "// expect compiles", found: ${first}`);
  return match[1] === undefined ? {} : { code: Number(match[1]), line: Number(match[2]) };
}

/** The project's own compiler options, read from its tsconfig — never a second copy written here. */
function projectOptions(): ts.CompilerOptions {
  const configPath = path.join(PACKAGE_ROOT, 'tsconfig.json');
  const read = ts.readConfigFile(configPath, (p) => ts.sys.readFile(p));
  assert.equal(read.error, undefined, `tsconfig.json did not parse`);
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, PACKAGE_ROOT);
  return { ...parsed.options, noEmit: true };
}

/** One diagnostic of the fixture file, as a failure message names it. */
interface Found {
  readonly code: number;
  readonly line: number;
  readonly text: string;
}

function describeFound(found: readonly Found[]): string {
  return found.map((one) => `TS${one.code} at line ${one.line}: ${one.text}`).join('; ');
}

/**
 * The previous fixture's program, handed to the next as `oldProgram` so the unchanged source files —
 * the lib `.d.ts` files above all — are reused rather than parsed again for every fixture (E1 code
 * round, finding 5). Each fixture still gets a program whose only root is itself.
 */
let previous: ts.Program | undefined;

/** Build one program over the fixture, check it, and keep the diagnostics that belong to the fixture. */
function compile(file: string, options: ts.CompilerOptions): Found[] {
  const full = path.join(FIXTURES, file);
  const program = ts.createProgram([full], options, undefined, previous);
  previous = program;
  const own = program.getSourceFile(full);
  assert.ok(own, `${file} was not part of the program built for it`);
  return ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.file === undefined || diagnostic.file === own)
    .map((diagnostic) => ({
      code: diagnostic.code,
      line: diagnostic.file === undefined ? 0 : diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1,
      text: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
    }));
}

function assertCompiles(file: string, found: readonly Found[]): void {
  assert.equal(found.length, 0, `expected ${file} to compile — got: ${describeFound(found)}`);
}

function assertRefused(file: string, expected: Expectation, found: readonly Found[]): void {
  const wanted = `TS${expected.code} at line ${expected.line} of ${file}`;
  assert.notEqual(found.length, 0, `expected ${wanted} — the fixture compiled`);
  const got = found.map((one) => `TS${one.code} at line ${one.line}`);
  assert.ok(got.length === 1 && got[0] === `TS${expected.code} at line ${expected.line}`, `expected ${wanted} — got: ${describeFound(found)}`);
}

const files = fixtureFiles();
const options = projectOptions();

test('the harness finds its fixtures, from the package root, and at least one of them must compile', () => {
  assert.ok(fs.existsSync(path.join(PACKAGE_ROOT, 'package.json')), `${PACKAGE_ROOT} is not the package root`);
  assert.notEqual(files.length, 0, `no fixtures under ${FIXTURES} — a harness over nothing passes`);
  const controls = files.filter((file) => expectationOf(file).code === undefined);
  assert.notEqual(controls.length, 0, 'no "// expect compiles" fixture — nothing proves the programs are built and checked');
});

for (const file of files) {
  const expected = expectationOf(file);
  const says = expected.code === undefined ? 'compiles' : `is refused with TS${expected.code} at line ${expected.line}`;
  test(`${file} ${says}`, (t) => {
    const started = performance.now();
    const found = compile(file, options);
    t.diagnostic(`program built and checked in ${Math.round(performance.now() - started)} ms`);
    if (expected.code === undefined) {
      assertCompiles(file, found);
    } else {
      assertRefused(file, expected, found);
    }
  });
}
