import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

/**
 * One builder for a Creds terminal title (`PLAN_terminal_titles_folder.md`, story S3). A terminal's title is both the name it
 * is created under and the key it is found by, so a second place that wrote one would let find and create part. No file under
 * `src` builds a title except `terminalTitles.ts`; every other line that holds one of these shapes sits in the allow-list
 * below, keyed by file and exact trimmed line, with its reason, and an entry that no longer matches fails the second test.
 * The same patterns run over `src/test`: no test asserts an old title literal.
 */

const SRC = path.join(__dirname, '..', '..', 'src');

const PATTERNS: readonly RegExp[] = [
  /Creds: /,
  /Creds run: /,
  /Creds VPN: /,
  /CredsForDevs: \$\{/,
  /CredsForDevs: before /,
  /CredsForDevs run: /,
  /CredsForDevs VPN: /,
  /'CredsForDevs: a'/, // an entry terminal's old title, as a test would write it
];

interface Allowed {
  readonly file: string;
  /** The exact trimmed line; absent: the whole file (a help article, a pure test of the literals). */
  readonly line?: string;
  readonly because: string;
}

const PREFIX = 'a message prefix on a notification, not a terminal title';
const HELP = 'the help quotes the title to the reader';

const ALLOWED: readonly Allowed[] = [
  { file: 'terminalTitles.ts', because: 'the one builder' },
  { file: 'test/terminalTitleScan.test.ts', because: 'this scan: its own patterns and fixtures' },
  { file: 'test/terminalTitles.test.ts', because: 'the pure tests assert the literals' },
  { file: 'test/terminalTitleRoads.test.ts', line: "const w = folderWorld([session('a')], { preopened: ['CredsForDevs: a'] });", because: 'the pinned one-time effect: a terminal with the OLD title is not found' },
  { file: 'test/terminalTitleRoads.test.ts', line: "const old = w.terminals.find((t) => t.name === 'CredsForDevs: a');", because: 'the same pinned one-time effect: the old terminal is looked up by its old title' },
  { file: 'test/vpnGoneRequest.test.ts', line: 'const VPN_TERMINAL = /^Creds VPN: /;', because: 'the shape of the built-in VPN terminal, read by regex: an independent pin of the title' },
  { file: 'test/folderRunHelp.test.ts', line: "'Creds: before <folder>',", because: 'VERBATIM: the label the help must carry byte for byte' },
  { file: 'helpEn.ts', because: HELP },
  { file: 'helpDe.ts', because: HELP },
  { file: 'helpEs.ts', because: HELP },
  { file: 'helpRu.ts', because: HELP },
  { file: 'helpUk.ts', because: HELP },
  { file: 'transportFactory.ts', line: '(message) => void vscode.window.showWarningMessage(`CredsForDevs: ${message}`),', because: PREFIX },
  { file: 'extension.ts', line: 'void vscode.window.showWarningMessage(`CredsForDevs: ${storage.metadataFault}`);', because: PREFIX },
  { file: 'extension.ts', line: 'void vscode.window.showWarningMessage(`CredsForDevs: ${started.reason}`);', because: PREFIX },
  { file: 'commands/treeMutationCommands.ts', line: 'void vscode.window.showErrorMessage(`CredsForDevs: ${describeError(error)}`);', because: PREFIX },
  { file: 'commands/wslRelayCommands.ts', line: 'void vscode.window.showErrorMessage(`CredsForDevs: ${started.reason}`);', because: PREFIX },
  { file: 'commands/wslRelayCommands.ts', line: 'void vscode.window.showWarningMessage(`CredsForDevs: ${itDidNotAnswer(distro, listed)}`);', because: PREFIX },
  { file: 'commands/wslRelayCommands.ts', line: '`CredsForDevs: ${itWorks(distro, socketPath, fingerprint)}`,', because: PREFIX },
];

interface Site {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(full);
    }
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/** Every line of `text` that holds one of the title shapes. */
function sitesIn(file: string, text: string): Site[] {
  return text.split('\n').flatMap((line, index) => (PATTERNS.some((p) => p.test(line)) ? [{ file, line: index + 1, text: line.trim() }] : []));
}

function allSites(): Site[] {
  return sourceFiles(SRC).flatMap((full) => sitesIn(path.relative(SRC, full).split(path.sep).join('/'), fs.readFileSync(full, 'utf8')));
}

const covers = (a: Allowed, s: Site): boolean => a.file === s.file && (a.line === undefined || a.line === s.text);
const where = (list: readonly Site[]): string[] => list.map((s) => `${s.file}:${s.line}  ${s.text.slice(0, 140)}`);

test('no_source_builds_a_title_outside_terminalTitles', () => {
  const offenders = allSites().filter((s) => !ALLOWED.some((a) => covers(a, s)));
  assert.deepEqual(where(offenders), [], 'a Creds terminal title is built outside terminalTitles.ts, or a test asserts an old literal');
});

test('the_allow_list_has_no_stale_entry', () => {
  const found = allSites();
  const stale = ALLOWED.filter((a) => !found.some((s) => covers(a, s))).map((a) => `${a.file}: ${a.line ?? '(whole file)'}`);
  assert.deepEqual(stale, [], 'an allowed line that is no longer there would let another line be added unseen');
});

test('the_scan_still_finds_what_it_is_about', () => {
  const fixture = 'const t = `Creds: ${folder} / ${name}`; x(`CredsForDevs: before ${o}`); y(`CredsForDevs run: ${n}`); z(`Creds VPN: ${n}`);';
  assert.equal(sitesIn('fixture.ts', fixture).length, 1, 'one line holds the shapes');
  for (const pattern of PATTERNS.slice(0, 7)) {
    assert.ok(pattern.test('Creds: x Creds run: x Creds VPN: x CredsForDevs: ${x} CredsForDevs: before x CredsForDevs run: x CredsForDevs VPN: x'), String(pattern));
  }
  const builder = sitesIn('terminalTitles.ts', fs.readFileSync(path.join(SRC, 'terminalTitles.ts'), 'utf8'));
  assert.ok(builder.length >= 3, `terminalTitles.ts shows ${builder.length} sites`);
});
