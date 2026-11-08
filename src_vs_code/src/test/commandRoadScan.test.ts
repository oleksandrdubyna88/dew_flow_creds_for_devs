import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

/**
 * One road to a command's line (parent `PLAN_terminal_folder_run.md` §1, story S2). `resolveCommand` fills `{name}`;
 * a road that joined the stored pieces itself would type a template, or a name nobody judged. The shape of
 * `commandsRegistered.test.ts` and `scriptInterpolation.test.ts`: the whole text of every shipped source file,
 * each match reported as `file:line` with the line's trimmed text.
 *
 * <p>A structural test must find what it is about: the companion at the end proves the patterns still match
 * (`common/testing.md`, "A structural test that matches nothing").</p>
 */

const SRC = path.join(__dirname, '..', '..', 'src');

const CALL = /\bbuildCommandLine\s*\(/g;
const IMPORT = /import\s*\{[^}]*\bbuildCommandLine\b[^}]*\}/g;
const READS = [/\.\s*commandArgs\b/g, /\{[^{}]*\bcommandArgs\b[^{}]*\}\s*=[^=>]/g, /\[\s*['"`]commandArgs['"`]\s*\]/g];
const LINE_CALLER = /\bexecutableLine\s*\(/g;

interface Site {
  readonly file: string;
  readonly line: number;
  readonly text: string;
  /** The function declared last before the match: who reads. */
  readonly within: string;
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'test' ? [] : sourceFiles(full);
    }
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

function enclosing(before: string): string {
  const names = [...before.matchAll(/\bfunction\s+(\w+)/g)];
  return names.length === 0 ? '' : names[names.length - 1][1];
}

/** Every match of `patterns` in `text`, whole text at a time, never line by line. */
function sitesIn(file: string, text: string, patterns: readonly RegExp[]): Site[] {
  const lines = text.split('\n');
  return patterns.flatMap((pattern) =>
    [...text.matchAll(new RegExp(pattern.source, pattern.flags))].map((match) => {
      const before = text.slice(0, match.index);
      const line = before.split('\n').length;
      // Up to the end of the match, so a declaration is inside itself.
      return { file, line, text: lines[line - 1].trim(), within: enclosing(text.slice(0, match.index + match[0].length)) };
    }),
  );
}

function sites(...patterns: RegExp[]): Site[] {
  return sourceFiles(SRC).flatMap((full) => sitesIn(path.relative(SRC, full).split(path.sep).join('/'), fs.readFileSync(full, 'utf8'), patterns));
}

const where = (list: readonly Site[]): string[] => list.map((s) => `${s.file}:${s.line}  ${s.text}`);

test('buildCommandLine_is_called_and_imported_only_in_commandLine', () => {
  const calls = sites(CALL).filter((s) => s.file !== 'commandLine.ts');
  assert.deepEqual(where(calls), [], 'the raw join is read outside commandLine.ts: ask resolveCommand instead');
  assert.deepEqual(where(sites(IMPORT)), [], 'buildCommandLine is imported by nobody: it is commandLine.ts own join');
});

/** Keyed by file, valued by the exact trimmed line: moving a line cannot widen the exemption. */
const ALLOWED_READS: Record<string, { line: string; because: string }[]> = {
  'entityFormPanel.ts': [{ line: 'const raw = data.commandArgs;', because: "the webview's POST, not a stored line" }],
  'entityFormScript.ts': [{ line: 'args: rowsJson(d?.commandArgs),', because: 'the rows the form edits: stored text' }],
  'entityShape.ts': [
    {
      line: "export type TerminalShape = EntityBase & { kind: 'terminal'; command?: string; commandArgs?: EntityMetadata['commandArgs']; commandNote?: string };",
      because: 'a type, not a read',
    },
  ],
  'entityViewCopy.ts': [{ line: 'value = normalizeArgs(d.commandArgs)[Number(arg[1])]?.value;', because: "Copy of one stored row, the parent table's raw row" }],
  'entityViewPage.ts': [
    { line: '...(d.isTerminal ? normalizeArgs(d.commandArgs).map((a, i) => argRow(a, i)) : []),', because: "the stored rows, the parent table's raw row" },
  ],
  'runPlan.ts': [
    {
      line: "return [details.command ?? '', ...(details.commandArgs ?? []).map((row) => row.value)];",
      because: "the bridge wall's reference scan reads the stored rows, disabled ones too: a search text, never a line a terminal receives",
    },
  ],
  'typeGuards.ts': [{ line: '(v.commandArgs === undefined || isCommandArgArray(v.commandArgs)) &&', because: 'the validator at the door' }],
};

const allowed = (site: Site): boolean => (ALLOWED_READS[site.file] ?? []).some((a) => a.line === site.text);

test('commandArgs_is_read_only_where_a_reason_is_written', () => {
  const offenders = sites(...READS).filter((s) => s.file !== 'commandLine.ts' && !allowed(s));
  assert.deepEqual(where(offenders), [], 'a stored row read outside the road: a template would reach a display, a modal or a terminal');
});

test('the_allow_list_has_no_stale_entry', () => {
  const found = sites(...READS);
  const stale = Object.entries(ALLOWED_READS).flatMap(([file, list]) =>
    list.filter((a) => !found.some((s) => s.file === file && s.text === a.line)).map((a) => `${file}: ${a.line}`),
  );
  assert.deepEqual(stale, [], 'an allowed line that is no longer there would let another line be added unseen');
});

test('executableLine_has_only_its_three_readers', () => {
  const readers = sites(LINE_CALLER).map((s) => `${s.file}:${s.within}`);
  assert.deepEqual(
    readers.sort(),
    ['commandTargets.ts:hasCommand', 'dependencyRun.ts:executableLine', 'dependencyRun.ts:visitNode', 'vpnLauncherRun.ts:launcherLine'],
    'a fourth reader could type the template a refused name answers',
  );
});

test('the_scan_still_finds_what_it_is_about', () => {
  assert.ok(sites(CALL).filter((s) => s.file === 'commandLine.ts').length >= 2, 'the call scan finds nothing in commandLine.ts');
  assert.ok(
    sites(...READS).some((s) => s.file === 'typeGuards.ts' && allowed(s)),
    'the read scan no longer finds the typeGuards.ts line',
  );
  const literal = 'const x = buildCommandLine(\n  a,\n  b?.\n    commandArgs,\n);';
  assert.equal(sitesIn('literal.ts', literal, [CALL]).length, 1);
  assert.equal(sitesIn('literal.ts', literal, READS).length, 1);
});
