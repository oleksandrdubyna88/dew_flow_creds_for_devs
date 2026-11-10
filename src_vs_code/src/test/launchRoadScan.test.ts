import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

/**
 * One road from a Terminal entry and its SSH link to a launch (parent `PLAN_terminal_command_over_ssh.md` §4.5, spec
 * `PLAN_terminal_command_over_ssh_E1_S2_spec.md` §S2.7). `remoteLaunch.ts` is that road; this scan pins who still reaches
 * a terminal or a child WITHOUT it, today, so that E2 and E3 each shrink a list instead of widening a hole. Machinery of
 * `commandRoadScan.test.ts`: the whole text of every shipped source file, each match reported as `file:line` with the
 * line's trimmed text, an allow-list keyed by file and exact trimmed line, a stale-entry test and a self-check.
 *
 * <p>An E2 or E3 story that switches a road edits the lists below in the SAME commit, and the stale-entry test makes it.</p>
 */

const SRC = path.join(__dirname, '..', '..', 'src');

const RESOLVE_IMPORT = /import\s+(?:type\s+)?\{[^}]*\bresolveCommand\b[^}]*\}\s*from/g;
const SSH_LINK_READS = [/\.\s*sshEntityId\b/g, /\{[^{}]*\bsshEntityId\b[^{}]*\}\s*=[^=>]/g, /\[\s*['"`]sshEntityId['"`]\s*\]/g];
const SENDS = [/\.sendText\s*\(/g, /\.executeCommand\s*\(/g, /\bsendGuarded\s*\(/g, /\btypeIntoNew\s*\(/g, /\btypeAll\s*\(/g, /\brunMasked\s*\(/g, /\bcapturedRun\s*\(/g, /\bchildProcess\.spawn\s*\(/g];
const REFUSAL_CALL = /\bsshLinkRefusal\s*\(/g;

/** The road files of spec §S2.7 scan 3: where a line is typed into a terminal or handed to a child. */
const ROAD_FILES = [
  'commands/runCommands.ts',
  'commands/folderRunCommand.ts',
  'folderRun.ts',
  'dependencyRun.ts',
  'dependencyRunHost.ts',
  'vpnLauncherRun.ts',
  'agentUseActions.ts',
  'terminalGuard.ts',
  'pinnedTerminal.ts',
  'maskedTerminal.ts',
];

interface Site {
  readonly file: string;
  readonly line: number;
  readonly text: string;
  /** The function declared last before the end of the match: who reads. */
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
      const line = text.slice(0, match.index).split('\n').length;
      return { file, line, text: lines[line - 1].trim(), within: enclosing(text.slice(0, match.index + match[0].length)) };
    }),
  );
}

function sites(patterns: readonly RegExp[], only?: readonly string[]): Site[] {
  return sourceFiles(SRC)
    .map((full) => ({ full, rel: path.relative(SRC, full).split(path.sep).join('/') }))
    .filter(({ rel }) => only === undefined || only.includes(rel))
    .flatMap(({ full, rel }) => sitesIn(rel, fs.readFileSync(full, 'utf8'), patterns));
}

/** `count` is how many matches of the scan's patterns the line holds, 1 unless said: each allowed site is COUNTED, not looked up. */
type AllowList = Record<string, { line: string; because: string; count?: number }[]>;

const allowedIn = (list: AllowList, site: Site): boolean => (list[site.file] ?? []).some((a) => a.line === site.text);

/** `file | trimmed line`, one entry per match, sorted: what the scan found, and what the list says it should find. */
const foundList = (list: readonly Site[]): string[] => list.map((s) => `${s.file} | ${s.text}`).sort();
const expectedList = (list: AllowList): string[] =>
  Object.entries(list)
    .flatMap(([file, rows]) => rows.flatMap((a) => Array.from({ length: a.count ?? 1 }, () => `${file} | ${a.line}`)))
    .sort();

function stale(list: AllowList, found: readonly Site[]): string[] {
  return Object.entries(list).flatMap(([file, rows]) =>
    rows.filter((a) => !found.some((s) => s.file === file && s.text === a.line)).map((a) => `${file}: ${a.line}`),
  );
}

// ---- scan 1: who imports resolveCommand -----------------------------------------------------------------------------

/**
 * Sorted, compared whole, so a new importer and a vanished one both fail. The target state (parent §4.5 (1)) is
 * `commandLine.ts`' own users, `remoteLaunch.ts`, and the display-only readers; each of E2 and E3 removes road files.
 */
const RESOLVE_IMPORTERS = ['agentUseActions.ts', 'commands/runCommands.ts', 'remoteLaunch.ts'];

test('resolveCommand_is_imported_only_by_the_listed_files', () => {
  const importers = [...new Set(sites([RESOLVE_IMPORT]).map((s) => s.file))].sort();
  assert.deepEqual(importers, RESOLVE_IMPORTERS, 'a road that resolves its own line skips the link: ask remoteLaunch.ts (and edit this list in the same commit)');
});

// ---- scan 2: who reads the SSH link ---------------------------------------------------------------------------------

/** The plumbing of S1 (`PLAN_terminal_command_over_ssh_E1.md` S1.3) plus `sshLinkOf`'s one read. A road asks `sshLinkOf`. */
const ALLOWED_LINK_READS: AllowList = {
  'typeGuards.ts': [{ line: "(v.sshEntityId === undefined || typeof v.sshEntityId === 'string') &&", because: 'the validator at the door (two reads on the line)', count: 2 }],
  'execFormFields.ts': [
    { line: "return entityPicker(text, d?.sshEntityId ?? '', candidates.map((c) => ({ id: c.id, label: c.name })));", because: "the form's select shows the stored choice" },
    { line: "sshEntityId: kind === 'terminal' ? otherEntityId(text(data.sshEntityId), selfId) : undefined,", because: "the form's scrub on save: Terminal entries only, never itself" },
  ],
  'idQuarantine.ts': [{ line: "...remappedRef('sshEntityId', details.sshEntityId, to),", because: 'a backup import remaps the id with the others' }],
  'entityViewerCommands.ts': [{ line: 'sshLinkName: nameOf(storage, accountId, details.sshEntityId || undefined),', because: "the viewer's row shows the name, a display" }],
  'remoteLaunch.ts': [
    { line: 'const id = entry.sshEntityId;', because: 'sshLinkOf row L1: the ONE reader; the S1 refusal answers through it' },
    { line: 'return { ...incoming, sshEntityId: existing?.sshEntityId };', because: "keepingSshLink: Update it on a share keeps the RECIPIENT's own link (D4); a copy of the id, no launch" },
  ],
};

test('sshEntityId_is_read_only_by_the_plumbing_and_sshLinkOf', () => {
  // Compared whole and sorted (as scan 4 is): a SECOND identical read passes `allowedIn` by text, and must not.
  assert.deepEqual(foundList(sites(SSH_LINK_READS)), expectedList(ALLOWED_LINK_READS), 'a road reads the link itself (or an allowed read is doubled): it must ask sshLinkOf');
});

// ---- scan 3: who types into a terminal or spawns a child ------------------------------------------------------------

/** Today's sites by exact trimmed line, each with the road it is and the epic that will change it. */
const ALLOWED_SENDS: AllowList = {
  'commands/runCommands.ts': [
    { line: "const sent = await sendGuarded(entry.key, { kind: 'entry', terminalOs: entry.details.terminalOs }, () => line);", because: 'Run in Terminal, an entry with no link: the local road, unchanged' },
    { line: "const sent = await sendGuarded(entry.key, { kind: 'ssh', env: ready.env }, () => typed.line);", because: 'Run in Terminal over SSH (E2.S1): the line typedLine built from the prepared snapshot' },
    { line: "opened.terminal.sendText([ready.plan.command, ...ready.plan.args, quoteFor(opened.shell.family, scriptPath)].join(' '), true);", because: 'Run Script in a terminal: a script, never linked (E1.S1 scrub)' },
    { line: 'runMasked(host, job, refs);', because: 'Run with Secrets, the call: E3 switches it to the remote script on stdin' },
    { line: 'function runMasked(host: RunCommandsHost, job: SecretsJob, refs: ResolvedRefs): void {', because: 'Run with Secrets, the declaration: E3' },
  ],
  'commands/folderRunCommand.ts': [
    { line: 'say(reportNotice(folder.name, typeAll(plan, chosen, keyOfRow, prepared)));', because: 'Run Folder, the call (E2.S2): after every linked row is prepared and the run-level stop is read' },
    { line: 'function typeAll(plan: FolderPlan, chosen: Chosen, keyOfRow: KeyOfRow, prepared: Prepared): readonly FolderOutcome[] {', because: 'Run Folder, the declaration (E2.S2): synchronous from the last re-check to the last send' },
    {
      line: "return typeLine(row, toClose, () => typeIntoNew(keyOfRow(row), { kind: 'entry', terminalOs: row.details.terminalOs }, () => row.line));",
      because: 'Run Folder, one unlinked row into a new terminal: its own line, the local road (E2.S2)',
    },
    {
      line: "const sent = typeIntoNew(key, { kind: 'ssh', env: state.ready.env }, () => state.typed);",
      because: "Run Folder, one linked row into a new terminal: the line typedLine built from the row's prepared snapshot, with a password session's own environment (E2.S2)",
    },
  ],
  'dependencyRunHost.ts': [
    { line: 'terminal.sendText(step.typed, true);', because: "a chain step with no shell integration: the line is the step's typed text, from the prepared snapshot when linked (E2.S3)" },
    { line: 'execution = integration.executeCommand(line);', because: "a chain step through shell integration: the line is the step's typed text (E2.S3)" },
  ],
  'vpnLauncherRun.ts': [
    {
      line: "const sent = await sendGuarded(launcherKey(ctx, launcher), { kind: 'entry', terminalOs: launcher.terminalOs }, (family) => withConfig(line, configPath, family), ctx.startGate);",
      because: "the VPN launcher with no link, or an agent's start: the local road, unchanged",
    },
    { line: "const sent = await sendGuarded(launcherKey(ctx, launcher), { kind: 'ssh', env: ready.env }, () => typed.line);", because: "a VPN launcher over SSH on the person's Start (E2.S1)" },
  ],
  'agentUseActions.ts': [{ line: 'const run = capturedRun(entity.terminalOs, line, hostShell(process.platform, fs.existsSync, hasPwsh));', because: 'the agent creds_run: E3 spawns ssh with the remote word' }],
  'terminalGuard.ts': [
    { line: 'export async function sendGuarded(', because: 'the guarded send: the road under Run in Terminal and the VPN launcher' },
    { line: 'return typeIntoNew(key, target, lineFor);', because: 'sendGuarded opens a new terminal when none is reusable (always, for a password session)' },
    { line: 'export function typeIntoNew(key: EntryTerminalKey, target: SendTarget, lineFor: (family: ShellFamily) => string): NewTerminalSend {', because: 'the new-terminal send under the folder run' },
    { line: 'terminal.sendText(line, true);', because: 'the ONE sendText of the guarded roads: the typed line arrives here' },
  ],
  'pinnedTerminal.ts': [{ line: 'opened.terminal.sendText(line, true);', because: 'the pinned-shell opener used by the launchers (E2)' }],
  'maskedTerminal.ts': [{ line: 'const child = childProcess.spawn(options.commandLine, [], {', because: 'the masked child of Run with Secrets: E3' }],
};

test('terminals_and_children_are_reached_only_from_the_listed_lines', () => {
  // Compared whole and sorted: a second identical `sendText` in a road file passes `allowedIn` by text, and must not.
  assert.deepEqual(foundList(sites(SENDS, ROAD_FILES)), expectedList(ALLOWED_SENDS), 'a new (or a doubled) send or spawn in a road file: it must go through remoteLaunch.ts or be listed with a reason');
});

// ---- scan 4: who calls the S1 refusal -------------------------------------------------------------------------------

/** `file:function` pairs, one per match of the pattern: the declaration, then every call (a function that calls twice is listed twice). E2 and E3 shrink it. */
const REFUSAL_SITES = [
  'agentUseActions.ts:terminalRunAction',
  'commands/runCommands.ts:secretsRefusal',
  'dependencyRun.ts:stepRefusal',
  'remoteLaunch.ts:sshLinkRefusal',
  'vpnLauncherRun.ts:launcherRefusal',
];

test('the_s1_refusal_has_only_its_declaration_and_the_listed_callers', () => {
  const found = sites([REFUSAL_CALL]).map((s) => `${s.file}:${s.within}`);
  assert.deepEqual(found.sort(), REFUSAL_SITES, 'a road switched to planLaunch removes its pair here; a new caller must not appear');
});

// ---- the lists keep no stale entry, and the scan finds what it is about ---------------------------------------------

test('the_allow_list_has_no_stale_entry', () => {
  assert.deepEqual(stale(ALLOWED_LINK_READS, sites(SSH_LINK_READS)), [], 'an allowed read that is gone would let another be added unseen');
  assert.deepEqual(stale(ALLOWED_SENDS, sites(SENDS, ROAD_FILES)), [], 'an allowed send that is gone would let another be added unseen');
  for (const list of [ALLOWED_LINK_READS, ALLOWED_SENDS]) {
    for (const rows of Object.values(list)) {
      assert.ok(rows.every((r) => r.because.length > 0), 'every allowed line carries a reason');
    }
  }
});

test('the_scan_still_finds_what_it_is_about', () => {
  assert.ok(sites([RESOLVE_IMPORT]).some((s) => s.file === 'remoteLaunch.ts'), 'the import scan does not find remoteLaunch.ts');
  assert.ok(sites(SSH_LINK_READS).some((s) => s.file === 'remoteLaunch.ts' && allowedIn(ALLOWED_LINK_READS, s)), "the read scan does not find sshLinkOf's line");
  assert.ok(sites(SENDS, ROAD_FILES).some((s) => s.file === 'terminalGuard.ts' && s.text === 'terminal.sendText(line, true);'), 'the send scan does not find terminalGuard.ts');
  const importLiteral = "import {\n  a,\n  resolveCommand,\n} from './commandLine';";
  assert.equal(sitesIn('literal.ts', importLiteral, [RESOLVE_IMPORT]).length, 1);
  const readLiteral = 'const x = entry\n  ?.\n    sshEntityId;';
  assert.equal(sitesIn('literal.ts', readLiteral, SSH_LINK_READS).length, 1);
  const sendLiteral = 'terminal\n  .sendText(\n    line,\n    true,\n  );';
  assert.equal(sitesIn('literal.ts', sendLiteral, SENDS).length, 1);
  assert.equal(sitesIn('literal.ts', 'x = sshLinkRefusal\n(\n  d)', [REFUSAL_CALL]).length, 1);
  assert.equal(sitesIn('literal.ts', 'x\n  .executeCommand(\n y)', SENDS).length, 1);
});
