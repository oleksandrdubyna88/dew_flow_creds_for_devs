import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

/**
 * Every place that builds a shell word for a shell WE do not control the parse of (E1.S2 review, F1-sweep;
 * `common/security.md` § "A measure applied at SOME of its sites").
 *
 * <p>Two PowerShell holes were found one at a time by a reviewer: `quoteFor('powershell', …)` doubled only the ASCII
 * `'` (PowerShell also reads U+2018, U+2019, U+201A and U+201B as single quotes), and the Windows `"…"` word of
 * `sshCommand.ts` ran `$(…)`, `$name` and the backtick. A third, the askpass `.bat`, was found by listing the sites. This
 * test is that list kept: the shapes below are matched across the whole text of every shipped source file, and the
 * found sites must equal the table, by file and exact trimmed line, each occurrence counted (as `launchRoadScan.test.ts`
 * counts its sends). A new place that quotes, escapes or wraps a value for a shell fails until a row names it, the
 * shell that parses it, and whether data from the vault, a sync, a share or an import can reach it.</p>
 *
 * <p>`vault`: `none` = nothing an entry holds reaches it (a local path, a fixed name, a validated name); `guarded` = it
 * can, and `proof` names the test that feeds the hostile value through the road; `definition` = the quoter itself;
 * `text` = a message or a clipboard text, not parsed by a shell WE start.</p>
 */

const SRC = path.join(__dirname, '..', '..', 'src');
const TESTS = path.join(__dirname, '..', '..', 'src', 'test');

/** The quoters and the one win32 word guard: every CALL (and definition) of them. */
const QUOTER_CALLS = /\b(?:quoteFor|shellQuote|lineWord)\s*\(/g;

/** A replace whose pattern or search text holds a quote character, the ASCII ones, the backtick and U+2018..U+201F. */
const QUOTE_ESCAPERS = /\.replace(?:All)?\(\s*(?:\/(?:[^/\n\\]|\\.)*['"`‘-‟](?:[^/\n\\]|\\.)*\/[a-z]*|'(?:["`‘-‟]|\\')'|"(?:['`‘-‟]|\\")"|`['"‘-‟]`)/g;

/** A template literal that wraps an interpolation in quotes next to a shell token (`ssh -`, `export`, `$env:`, `env N=`, `eval '`, …). */
const SHELL_TEMPLATES =
  /`[^`\n]*(?:\bssh -|\bssh (?=['"])|git config|\bexport \w*[=\s]|\benv (?:\$\{\w+\}|\w+)=|\beval(?= ')|\$env:|Start-Process|-ArgumentList|UserKnownHostsFile|-i (?=['"]))[^`\n]*['"]\$\{[^`]*`|`[^`\n]*['"]\$\{[^`\n]*(?:\bssh -|git config|\bexport |\$env:|Start-Process|UserKnownHostsFile|-i )[^`\n]*`|`[^`\n]*['"]\$\$\{[^`\n]*`/g;

/** A batch file's text: its content is parsed by cmd.exe. */
const BATCH_FILES = /@echo off/g;

type Vault = 'none' | 'guarded' | 'definition' | 'text';
type Parser = 'powershell' | 'posix' | 'cmd' | 'cmd-or-powershell' | 'html' | 'none';

interface Site {
  readonly file: string;
  readonly line: string;
  readonly parser: Parser;
  readonly vault: Vault;
  readonly because: string;
  /** For `guarded`: `<test file> :: <test name fragment>`, a test that feeds the hostile value through this road. */
  readonly proof?: string;
}

const SSH_COMMAND = 'sshCommand.test.ts';

const SITES: Record<'calls' | 'escapers' | 'templates' | 'batch', readonly Site[]> = {
  calls: [
    { file: 'commands/runCommands.ts', line: 'opened.terminal.sendText([ready.plan.command, ...ready.plan.args, quoteFor(opened.shell.family, scriptPath)].join(\' \'), true);', parser: 'powershell', vault: 'none', because: 'Run Script: a path under the extension storage; the id in the name goes through safeFileComponent (materializedKeyPath)' },
    { file: 'commands/runCommands.ts', line: 'return [job.script.plan.command, ...job.script.plan.args, quoteFor(pinnedShell().family, scriptPath)].join(\' \');', parser: 'powershell', vault: 'none', because: 'the same path, shown in the secrets question' },
    { file: 'hostShell.ts', line: 'export function quoteFor(family: ShellFamily, value: string): string {', parser: 'powershell', vault: 'definition', because: 'the one quoter: PowerShell doubles each of the four curly single quotes and the ASCII one with itself' },
    { file: 'remoteCliInstall.ts', line: 'const env = prefix.length > 0 ? `CREDS_PREFIX=${quoteFor(\'posix\', prefix)} ` : \'\';', parser: 'posix', vault: 'none', because: 'the install prefix a person typed, quoted for the remote POSIX shell' },
    { file: 'sshCommand.ts', line: 'function shellQuote(value: string, platform: NodeJS.Platform = process.platform): string {', parser: 'cmd-or-powershell', vault: 'definition', because: 'win32: "…" for a plain value, a PowerShell single-quoted word for any value PowerShell would expand or end' },
    { file: 'sshCommand.ts', line: 'return POWERSHELL_DOUBLE_QUOTED_UNSAFE.test(value) ? quoteFor(\'powershell\', value) : `"${value}"`;', parser: 'cmd-or-powershell', vault: 'guarded', because: 'the -i key path is entry data and nothing validates it', proof: `${SSH_COMMAND} :: S2 win32` },
    { file: 'sshCommand.ts', line: 'function lineWord(word: string, platform: NodeJS.Platform): string {', parser: 'powershell', vault: 'definition', because: 'win32: a bare word only when it is plain, else one single-quoted word' },
    { file: 'sshCommand.ts', line: 'return platform === \'win32\' && !POWERSHELL_BARE_SAFE.test(word) ? quoteFor(\'powershell\', word) : word;', parser: 'powershell', vault: 'guarded', because: 'a login may hold `$`', proof: `${SSH_COMMAND} :: S4 win32` },
    { file: 'sshCommand.ts', line: 'parts.push(...sshOptionArgv(entity, options.jump).map((word) => lineWord(word, platform)));', parser: 'powershell', vault: 'guarded', because: 'the -J value and the forwards come from entries', proof: `${SSH_COMMAND} :: S4 win32` },
    { file: 'sshCommand.ts', line: 'return lineWord(destination, platform);', parser: 'powershell', vault: 'guarded', because: 'the destination: a login may hold `$`', proof: `${SSH_COMMAND} :: S4 win32` },
    { file: 'sshCommand.ts', line: 'return /[\\\\"$`]/.test(destination) ? shellQuote(destination, platform) : destination;', parser: 'posix', vault: 'guarded', because: 'the destination for a POSIX shell: `\\`, `"`, `$` and the backtick are escaped in a double-quoted word', proof: `${SSH_COMMAND} :: a domain login survives a POSIX shell` },
    { file: 'sshCommand.ts', line: '? quoteFor(\'powershell\', `UserKnownHostsFile=${file}`)', parser: 'powershell', vault: 'none', because: 'the pin file is a sanitised name under the extension storage', proof: `${SSH_COMMAND} :: S3 win32` },
    { file: 'sshCommand.ts', line: ': `UserKnownHostsFile=${shellQuote(file, platform)}`;', parser: 'cmd-or-powershell', vault: 'none', because: 'the same pin file' },
    { file: 'sshCommand.ts', line: 'parts.push(\'-i\', shellQuote(entity.sshKeyPath, platform));', parser: 'cmd-or-powershell', vault: 'guarded', because: 'the -i key path is entry data (import of a ~/.ssh/config IdentityFile, sync, share)', proof: `${SSH_COMMAND} :: S2 win32` },
    { file: 'vpnCommand.ts', line: 'return \'Start-Process -Verb RunAs -FilePath \' + quoteFor(\'powershell\', exe) + \' -ArgumentList \' + quoteFor(\'powershell\', args);', parser: 'powershell', vault: 'none', because: 'a program path and the arguments the extension composed; the quoter is the fixed one' },
    { file: 'vpnCommand.ts', line: 'return \'Start-Process -Verb RunAs -FilePath \' + quoteFor(\'powershell\', exe) + \' -ArgumentList \' + quoteFor(\'powershell\', args);', parser: 'powershell', vault: 'none', because: 'a program path and the arguments the extension composed; the quoter is the fixed one' },
    { file: 'vpnLauncher.ts', line: 'return line.split(CONFIG_TOKEN).join(quoteFor(family, configPath));', parser: 'powershell', vault: 'none', because: 'the config file path under the extension storage; the name is vpnTunnelName, [a-z0-9_=+.-]' },
    { file: 'vpnRun.ts', line: 'const line = `& ${quoteFor(\'powershell\', exe)} ${quoteFor(\'powershell\', `--import-profile=${configPath}`)}`;', parser: 'powershell', vault: 'none', because: 'a program path and the stored config file path' },
    { file: 'vpnRun.ts', line: 'const line = `& ${quoteFor(\'powershell\', exe)} ${quoteFor(\'powershell\', `--import-profile=${configPath}`)}`;', parser: 'powershell', vault: 'none', because: 'a program path and the stored config file path' },
  ],
  escapers: [
    { file: 'bridgeConsentText.ts', line: 'return cleanCallerField(name).replaceAll(\'"\', "\'");', parser: 'none', vault: 'text', because: 'a name shown in a dialog' },
    { file: 'brokerCaller.ts', line: 'return tabTitle === \'\' ? sessionName : `"${tabTitle.replaceAll(\'"\', "\'").replaceAll(\'·\', \'-\')}"`;', parser: 'none', vault: 'text', because: 'a title shown in a dialog' },
    { file: 'commands/exportCommand.ts', line: 'const cleaned = name.replace(/[\\/:*?"<>|]/g, \'-\').replace(/^\\.+/, \'\').trim();', parser: 'none', vault: 'text', because: 'a file name, written by the extension' },
    { file: 'hostShell.ts', line: 'return "\'" + value.replace(/\'/g, `\'"\'"\'`) + "\'";', parser: 'posix', vault: 'definition', because: 'the POSIX quoter: a single quote closes, escapes and reopens' },
    { file: 'hygiene.ts', line: 'const value = rawValue.trim().replace(/^["\']|["\']$/g, \'\');', parser: 'none', vault: 'text', because: 'strips quotes off a parsed value; builds no shell word' },
    { file: 'importFormats.ts', line: 'value: match[2].trim().replace(/^["\']|["\']$/g, \'\'),', parser: 'none', vault: 'text', because: 'strips quotes off an imported value; builds no shell word' },
    { file: 'sshAgentProtocol.ts', line: 'const safe = withoutControlChars(raw).replace(/[\\\\"]/g, String.raw`\\$&`);', parser: 'none', vault: 'text', because: 'text inside a prompt sentence' },
    { file: 'sshCommand.ts', line: 'return `"${value.replace(/([\\\\"$`])/g, \'\\\\$1\')}"`;', parser: 'posix', vault: 'guarded', because: 'POSIX double-quoted word: `\\`, `"`, `$` and the backtick are escaped', proof: `${SSH_COMMAND} :: a dollar in a login` },
    { file: 'webviewHtml.ts', line: 'return escapeHtmlForHighlighting(value).replace(/\'/g, \'&#39;\');', parser: 'html', vault: 'text', because: 'HTML' },
    { file: 'webviewHtml.ts', line: '.replace(/"/g, \'&quot;\');', parser: 'html', vault: 'text', because: 'HTML' },
  ],
  templates: [
    { file: 'configFormat.ts', line: '? `"${text.split(\'=\')[0].trim()}" is not a name a shell could export — use letters, digits and underscore, not starting with a digit.`', parser: 'none', vault: 'text', because: 'a message' },
    { file: 'envProbe.ts', line: 'return `if ($env:${name}) { "${name}: SET (len=$($env:${name}.Length))" } else { "${name}: NOT SET" }`;', parser: 'powershell', vault: 'none', because: 'the name passed isValidEnvName, [A-Za-z_][A-Za-z0-9_]*' },
    { file: 'envProbe.ts', line: 'return `if [ -n "$${name}" ]; then echo "${name}: SET (len=\\${#${name}})"; else echo "${name}: NOT SET"; fi`;', parser: 'posix', vault: 'none', because: 'the same validated name' },
    { file: 'gitRemote.ts', line: 'env.GIT_SSH_COMMAND = `ssh -i "${auth.keyPath}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`;', parser: 'posix', vault: 'none', because: 'git runs it with sh; the key path is materializePrivateKey under the extension storage, the id through safeFileComponent' },
    { file: 'gitSigningConfig.ts', line: 'commands.push(`git config --global gpg.ssh.program "${WINDOWS_SSH_KEYGEN}"`);', parser: 'cmd-or-powershell', vault: 'none', because: 'a constant path, copied for the person to paste' },
    { file: 'gitSigningConfig.ts', line: '? `$env:SSH_AUTH_SOCK = "${socketPath}"`', parser: 'powershell', vault: 'none', because: 'the agent\'s own pipe name, copied for the person to paste' },
    { file: 'gitSigningConfig.ts', line: ': `export SSH_AUTH_SOCK="${socketPath}"`;', parser: 'posix', vault: 'none', because: 'the agent\'s own socket path, copied for the person to paste' },
    { file: 'keyInstaller.ts', line: 'const use = plan.privateKey !== undefined ? ` Use it with: ssh -i "${plan.privatePath}" …` : \'\';', parser: 'none', vault: 'text', because: 'a message; the path is ~/.ssh/<sanitised base>' },
    { file: 'runPlan.ts', line: 'return family === \'powershell\' ? `$env:${name}` : `"$${name}"`;', parser: 'posix', vault: 'none', because: 'the variable name is CREDS_REF_<n> (refVarName)' },
    { file: 'runPlan.ts', line: 'bash: (name) => `"$${name}"`,', parser: 'posix', vault: 'none', because: 'the same CREDS_REF_<n> name' },
    { file: 'sharePayloadBuild.ts', line: 'return `"${nodes[0].name}" is marked Not for export — nothing to share.`;', parser: 'none', vault: 'text', because: 'a message' },
    { file: 'wslRelay.ts', line: 'return usable ? `env ${name}=\'${value}\' ` : \'\';', parser: 'posix', vault: 'none', because: 'a socket path from the relay; a value holding any of the four curly quotes or the ASCII one is dropped, not quoted', proof: 'wslRelay.test.ts :: curly single quote' },
  ],
  batch: [
    { file: 'sshAskpass.ts', line: 'return { name: \'askpass.bat\', content: \'@echo off\\nsetlocal EnableDelayedExpansion\\necho(!CREDS_SSH_PASSWORD!\\n\' };', parser: 'cmd', vault: 'guarded', because: 'the password is read by delayed expansion, after cmd has parsed the line', proof: 'sshAskpass.test.ts :: delayed expansion' },
  ],
};

const PATTERNS: Record<keyof typeof SITES, RegExp> = {
  calls: QUOTER_CALLS,
  escapers: QUOTE_ESCAPERS,
  templates: SHELL_TEMPLATES,
  batch: BATCH_FILES,
};

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'test' ? [] : sourceFiles(full);
    }
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/** Every match of `pattern` in `text`, the whole text at a time, as `file | trimmed first line of the match`. */
function foundIn(file: string, text: string, pattern: RegExp): string[] {
  const lines = text.split('\n');
  return [...text.matchAll(new RegExp(pattern.source, pattern.flags))].map((match) => {
    const line = text.slice(0, match.index).split('\n').length;
    return `${file} | ${lines[line - 1].trim()}`;
  });
}

function found(pattern: RegExp): string[] {
  return sourceFiles(SRC)
    .flatMap((full) => foundIn(path.relative(SRC, full).split(path.sep).join('/'), fs.readFileSync(full, 'utf8'), pattern))
    .sort();
}

const expectedFor = (kind: keyof typeof SITES): string[] => SITES[kind].map((site) => `${site.file} | ${site.line}`).sort();

for (const kind of Object.keys(SITES) as (keyof typeof SITES)[]) {
  test(`${kind}: every site that quotes or escapes for a shell is in the table, each counted once`, () => {
    assert.deepEqual(
      found(PATTERNS[kind]),
      expectedFor(kind),
      'a new (or a duplicated) site: classify it in SITES with the shell that parses it and whether vault data reaches it — and fix it if it does',
    );
  });
}

test('a site vault data reaches names the test that feeds it a hostile value, and that test exists', () => {
  const guarded = Object.values(SITES).flat().filter((site) => site.vault === 'guarded');
  assert.ok(guarded.length >= 8, 'the guarded rows went missing');
  for (const site of guarded) {
    assert.ok(site.proof !== undefined, `${site.file} | ${site.line}: reached by vault data and no proof named`);
    const [file, name] = (site.proof as string).split(' :: ');
    const text = fs.readFileSync(path.join(TESTS, file), 'utf8');
    assert.ok(text.includes(name), `${site.proof}: no such test in ${file}`);
  }
});

test('the vault column holds one of the four words, and the parser column one of the six', () => {
  const vaults = new Set<string>(['none', 'guarded', 'definition', 'text']);
  const parsers = new Set<string>(['powershell', 'posix', 'cmd', 'cmd-or-powershell', 'html', 'none']);
  for (const site of Object.values(SITES).flat()) {
    assert.ok(vaults.has(site.vault) && parsers.has(site.parser) && site.because.length >= 4, `${site.file} | ${site.line}`);
  }
});

// ---- the patterns still find what they are about (a scan that matches nothing passes forever) ----------------------

test('the patterns match the shapes they are written for, across line breaks too', () => {
  const calls = 'const a = quoteFor(\n  family,\n  value,\n);\nshellQuote (x);';
  assert.equal(foundIn('f.ts', calls, QUOTER_CALLS).length, 2);
  assert.equal(foundIn('f.ts', "v.replace(/’/g, '');", QUOTE_ESCAPERS).length, 1, 'a curly quote in the pattern');
  assert.equal(foundIn('f.ts', "v.replaceAll('\"', '');", QUOTE_ESCAPERS).length, 1);
  assert.equal(foundIn('f.ts', "v.replace(/a/g, '');", QUOTE_ESCAPERS).length, 0, 'no quote, no match');
  assert.equal(foundIn('f.ts', "`env ${name}='${value}' `", SHELL_TEMPLATES).length, 1);
  assert.equal(foundIn('f.ts', "`eval '${quoted}'; echo`", SHELL_TEMPLATES).length, 1);
  assert.equal(foundIn('f.ts', '`ssh -i "${path}" host`', SHELL_TEMPLATES).length, 1);
  assert.equal(foundIn('f.ts', '`"$${name}"`', SHELL_TEMPLATES).length, 1);
  assert.equal(foundIn('f.ts', '`<option value="${id}">`', SHELL_TEMPLATES).length, 0, 'HTML is not a shell word');
  assert.equal(foundIn('f.ts', "'@echo off\\n'", BATCH_FILES).length, 1);
});

test('a new unquoted PowerShell quoting site would be found: a line added to a source file shows up', () => {
  const text = fs.readFileSync(path.join(SRC, 'sshCommand.ts'), 'utf8');
  const withNew = `${text}\nconst bad = \`-i "\${entity.sshKeyPath}"\`;\nconst worse = quoteFor('powershell', entity.sshKeyPath);\n`;
  assert.equal(foundIn('sshCommand.ts', withNew, QUOTER_CALLS).length, foundIn('sshCommand.ts', text, QUOTER_CALLS).length + 1);
  assert.equal(foundIn('sshCommand.ts', withNew, SHELL_TEMPLATES).length, foundIn('sshCommand.ts', text, SHELL_TEMPLATES).length + 1);
});
