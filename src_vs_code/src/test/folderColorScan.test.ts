import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

/**
 * A folder-named terminal wears its folder's colour (`PLAN_folder_colors.md` §6.5, E1.S3), and a scan keeps it so: a terminal is
 * coloured only when it is CREATED, so a site that builds a key or creates a terminal and forgets the colour is a terminal that
 * stays grey for good. Three structural checks over every `.ts` file under `src` except `src/test`, in the shape of
 * `terminalTitleScan.test.ts`: lines whose trimmed text starts with `//`, `*` or `/*` are skipped, and a call's text runs from
 * its name to the balanced closing parenthesis, over lines. A fourth, fifth and sixth test keep the scan itself alive.
 *
 * <p><b>What X1 does not see</b> (the cadence consultation, 2026-11-12): it checks a MODULE, not the order inside a function, so a
 * NEW road inside a module that already calls `ensureFolderColor(` passes it uncoloured. The follow-up is a shared async
 * "allocate, then key" helper with the synchronous lookup-only builders exempted.</p>
 */

const SRC = path.join(__dirname, '..', '..', 'src');

interface Allowed {
  readonly file: string;
  /** The exact trimmed line; absent: the whole file. */
  readonly line?: string;
  readonly because: string;
}

/** X1: the places that build a key without colouring its folder first. */
const KEY_WITHOUT_COLOUR: readonly Allowed[] = [
  { file: 'terminalTitles.ts', because: 'the builder itself' },
  {
    file: 'terminalManager.ts',
    line: "place: SshTerminalPlace = { title: sshTerminalTitle(entryTerminalKey(entity.name, undefined)), accountId: '' },",
    because: 'the default place has no folder, so it has no colour',
  },
];

/** X2: the terminals created for a title that names no folder. The line is the first trimmed line of the `createTerminal(` call. */
const PLAIN_TERMINALS: readonly Allowed[] = [
  { file: 'dependencyRunHost.ts', line: 'const terminal = vscode.window.createTerminal({ name });', because: 'the dependency chain\'s terminal (D3): it names the owner of the chain, not a folder' },
  { file: 'entityViewerCommands.ts', line: 'const terminal = vscode.window.createTerminal({ name: `env check: ${name}` });', because: '`env check: …`: it names a check, not a folder' },
  { file: 'maskedTerminal.ts', line: 'const terminal = vscode.window.createTerminal({ name: options.name, pty: run.pty });', because: 'the masked run\'s terminal (D3): it names the entry, not a folder' },
];

interface Source {
  readonly file: string;
  /** The file with every comment line blanked, so a line number is still the line number. */
  readonly code: string;
}

interface Call {
  readonly file: string;
  readonly line: number;
  /** The first line of the call, trimmed. */
  readonly head: string;
  /** From the name to the balanced closing parenthesis, over lines. */
  readonly text: string;
}

const isComment = (line: string): boolean => /^(\/\/|\*|\/\*)/.test(line.trim());

/** Every `.ts` file under `dir`, except the tests (`src/test`). */
function filesUnder(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => filesOf(dir, entry));
}

function filesOf(dir: string, entry: fs.Dirent): string[] {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) {
    return full === path.join(SRC, 'test') ? [] : filesUnder(full);
  }
  return entry.name.endsWith('.ts') ? [full] : [];
}

function sourceOf(file: string, text: string): Source {
  return { file, code: text.split('\n').map((line) => (isComment(line) ? '' : line)).join('\n') };
}

function sources(): Source[] {
  return filesUnder(SRC).map((full) => sourceOf(path.relative(SRC, full).split(path.sep).join('/'), fs.readFileSync(full, 'utf8')));
}

/** The text from `open` (the index of a `(`) to its balanced closing parenthesis; the rest of the file when it never closes. */
function balanced(code: string, open: number): string {
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    depth += parenDelta(code[i]);
    if (depth === 0) {
      return code.slice(open, i + 1);
    }
  }
  return code.slice(open);
}

const parenDelta = (char: string): number => (char === '(' ? 1 : char === ')' ? -1 : 0);

/** Every call whose name matches `name` (a regex source, followed by `(`), not the `function` line that declares it. */
function callsOf(source: Source, name: string): Call[] {
  const pattern = new RegExp(`(?<!function\\s+)${name}\\(`, 'g');
  const calls: Call[] = [];
  for (const match of source.code.matchAll(pattern)) {
    const line = source.code.slice(0, match.index).split('\n').length;
    const open = match.index + match[0].length - 1;
    calls.push({ file: source.file, line, head: source.code.split('\n')[line - 1].trim(), text: match[0].slice(0, -1) + balanced(source.code, open) });
  }
  return calls;
}

const covers = (a: Allowed, file: string, line: string): boolean => a.file === file && (a.line === undefined || line === a.line);
const where = (calls: readonly Call[]): string[] => calls.map((c) => `${c.file}:${c.line}  ${c.head.slice(0, 140)}`);

// ---------- X1 ----------

/** Key builders (`entryTerminalKeyOf(`, `entryTerminalKey(`) that sit in a module holding no `ensureFolderColor(`. */
function keyBuildersWithoutColour(all: readonly Source[]): Call[] {
  return all.flatMap((source) => {
    const builders = [...callsOf(source, 'entryTerminalKeyOf'), ...callsOf(source, 'entryTerminalKey')].filter((call) => !KEY_WITHOUT_COLOUR.some((a) => covers(a, call.file, call.head)));
    return callsOf(source, 'ensureFolderColor').length > 0 ? [] : builders;
  });
}

test('every_module_that_builds_a_terminal_key_colours_the_folder_first', () => {
  assert.deepEqual(where(keyBuildersWithoutColour(sources())), [], 'a module builds a terminal key and never calls ensureFolderColor( first: its terminals stay grey');
});

// ---------- X2 ----------

/** `vscode.window.createTerminal(` calls that neither spread the helper nor sit in the plain list. */
function uncolouredCreations(all: readonly Source[]): Call[] {
  return all.flatMap((source) =>
    callsOf(source, 'vscode\\.window\\.createTerminal').filter((call) => !call.text.includes('folderColorOption(') && !PLAIN_TERMINALS.some((a) => covers(a, call.file, call.head))),
  );
}

/** `pinnedTerminal(` / `sendPinned(` calls given a folder title that pass no `color:`. */
function uncolouredTitledCalls(all: readonly Source[]): Call[] {
  return all.flatMap((source) =>
    [...callsOf(source, 'pinnedTerminal'), ...callsOf(source, 'sendPinned')].filter(
      (call) => /\b(entryTerminalTitle|sshTerminalTitle)\(/.test(call.text) && !call.text.includes('color:'),
    ),
  );
}

test('every_terminal_created_for_a_folder_title_passes_the_colour_helper', () => {
  const all = sources();
  assert.deepEqual(where(uncolouredCreations(all)), [], 'a createTerminal( call neither spreads folderColorOption( nor is a plain terminal');
  assert.deepEqual(where(uncolouredTitledCalls(all)), [], 'a pinnedTerminal( or sendPinned( call is given a folder title and no color:');
});

// ---------- X3 ----------

interface Literal {
  readonly line: number;
  readonly text: string;
}

/** The text of every innermost `{…}` of `code`: a brace pair with no brace pair inside it. */
function innermostLiterals(code: string): Literal[] {
  const found: Literal[] = [];
  const open: { at: number; hasChild: boolean }[] = [];
  for (let i = 0; i < code.length; i += 1) {
    if (code[i] === '{') {
      open.forEach((o) => (o.hasChild = true));
      open.push({ at: i, hasChild: false });
    } else if (code[i] === '}') {
      closed(code, i, open.pop(), found);
    }
  }
  return found;
}

/** A closing brace: when its pair holds no other pair, its text is a literal. */
function closed(code: string, at: number, last: { at: number; hasChild: boolean } | undefined, found: Literal[]): void {
  if (last !== undefined && !last.hasChild) {
    found.push({ line: code.slice(0, last.at).split('\n').length, text: code.slice(last.at + 1, at) });
  }
}

const names = (text: string, property: string): boolean => new RegExp(`(^|[\\s,;])${property}\\s*(:|,|;|$)`).test(text);

/** Literals that spell a terminal key by hand: both `entryName` and `folderName` as properties. */
function handWrittenKeys(source: Source): Literal[] {
  return innermostLiterals(source.code).filter((literal) => names(literal.text, 'entryName') && names(literal.text, 'folderName'));
}

test('no_module_but_terminalTitles_writes_a_terminal_key_by_hand', () => {
  const offenders = sources()
    .filter((source) => source.file !== 'terminalTitles.ts')
    .flatMap((source) => handWrittenKeys(source).map((literal) => `${source.file}:${literal.line}  {${literal.text.trim().slice(0, 100)}}`));
  assert.deepEqual(offenders, [], 'a key literal outside terminalTitles.ts would carry no folderColor, whatever its folder wears');
});

// ---------- X4 to X6: the scan stays alive ----------

const one = (all: readonly Source[], file: string): Source => {
  const found = all.find((source) => source.file === file);
  assert.ok(found, `${file} is not under src`);
  return found;
};

test('the_scan_still_finds_what_it_is_about', () => {
  const all = sources();
  const runCommands = one(all, 'commands/runCommands.ts');
  assert.ok(callsOf(runCommands, 'entryTerminalKeyOf').length > 0, 'X1 finds runCommands.ts as a key builder');
  assert.ok(callsOf(runCommands, 'ensureFolderColor').length > 0, 'and finds the call it holds');
  const connect = one(all, 'sshConnect.ts');
  const password = callsOf(connect, 'vscode\\.window\\.createTerminal');
  assert.equal(password.length, 1, 'X2 finds the password terminal in sshConnect.ts');
  assert.ok(password[0].text.includes('folderColorOption('), 'as a coloured site');
  const script = callsOf(runCommands, 'pinnedTerminal').filter((call) => call.text.includes('entryTerminalTitle('));
  assert.equal(script.length, 1, 'and the launchScript call');
  assert.ok(script[0].text.includes('color:'));
  const builder = handWrittenKeys(one(all, 'terminalTitles.ts'));
  assert.ok(builder.length >= 1, 'X3 finds the literal in terminalTitles.ts');
  for (const plain of PLAIN_TERMINALS) {
    assert.ok(callsOf(one(all, plain.file), 'vscode\\.window\\.createTerminal').length > 0, `${plain.file} still creates a terminal`);
  }
});

test('fixtures_are_read_the_way_the_code_is_written', () => {
  const threeLines = sourceOf('fixture.ts', ['const t = vscode.window.createTerminal({', '  name: title,', '  ...folderColorOption(key),', '});'].join('\n'));
  const sites = callsOf(threeLines, 'vscode\\.window\\.createTerminal');
  assert.equal(sites.length, 1, 'a three-line call is ONE site');
  assert.ok(sites[0].text.includes('folderColorOption('), 'with the helper on its third line');
  assert.deepEqual(uncolouredCreations([threeLines]), [], 'and it is coloured');
  const grey = sourceOf('fixture.ts', ['const t = vscode.window.createTerminal({', '  name: title,', '});'].join('\n'));
  assert.equal(uncolouredCreations([grey]).length, 1, 'without it the same shape is a finding');
  const commented = sourceOf('fixture.ts', ['// vscode.window.createTerminal({ name })', ' * pinnedTerminal(entryTerminalTitle(key))'].join('\n'));
  assert.equal(callsOf(commented, 'vscode\\.window\\.createTerminal').length + callsOf(commented, 'pinnedTerminal').length, 0, 'a comment line is skipped');
  const declared = sourceOf('fixture.ts', 'export function pinnedTerminal(name: string): PinnedTerminal {');
  assert.equal(callsOf(declared, 'pinnedTerminal').length, 0, 'the function line is not a call');

  assert.equal(handWrittenKeys(sourceOf('fixture.ts', 'const e = { accountId, entityId, entryName };')).length, 0, 'the shape at rotationWaiting.ts is not a key');
  assert.equal(handWrittenKeys(sourceOf('fixture.ts', 'const k = { entryName,\n  folderName: f };')).length, 1, 'a key spelled over two lines is one');
  assert.equal(handWrittenKeys(sourceOf('fixture.ts', 'const k = { entryName, folderName };')).length, 1, 'and so is the shorthand');

  const unpaired = sourceOf('fixture.ts', 'const k = entryTerminalKeyOf(storage, a, id, name);');
  assert.equal(keyBuildersWithoutColour([unpaired]).length, 1, 'a key builder with no ensureFolderColor( beside it is a finding');
  const paired = sourceOf('fixture.ts', 'await ensureFolderColor(s, a, id);\nconst k = entryTerminalKeyOf(storage, a, id, name);');
  assert.equal(keyBuildersWithoutColour([paired]).length, 0, 'and with it, it is not');
  const titled = sourceOf('fixture.ts', 'pinnedTerminal(entryTerminalTitle(key),\n  { env, fresh: true });');
  assert.equal(uncolouredTitledCalls([titled]).length, 1, 'a titled pinnedTerminal( call without color: is a finding');
});

test('the_allow_lists_have_no_stale_entry', () => {
  const all = sources();
  const stale = [
    ...KEY_WITHOUT_COLOUR.filter((a) => !callsOf(one(all, a.file), 'entryTerminalKey').concat(callsOf(one(all, a.file), 'entryTerminalKeyOf')).some((call) => covers(a, call.file, call.head))),
    ...PLAIN_TERMINALS.filter((a) => !callsOf(one(all, a.file), 'vscode\\.window\\.createTerminal').some((call) => covers(a, call.file, call.head))),
  ].map((a) => `${a.file}: ${a.line ?? '(whole file)'}`);
  assert.deepEqual(stale, [], 'an allowed line that is no longer there would let another line be added unseen');
});
