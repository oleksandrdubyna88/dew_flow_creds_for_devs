import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { SshCommandOptions, buildSshCommand } from '../sshCommand';
import { resolveJumpChain } from '../sshOptions';
import { isEntityMetadata } from '../typeGuards';
import { EntityMetadata } from '../types';

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

/** The quoters and the one win32 word rule: every CALL (and definition) of them. */
const QUOTER_CALLS = /\b(?:quoteFor|shellQuote|lineWord|windowsWord)\s*\(/g;

/** A replace whose pattern or search text holds a quote character, the ASCII ones, the backtick and U+2018..U+201F. */
const QUOTE_ESCAPERS = /\.replace(?:All)?\(\s*(?:\/(?:[^/\n\\]|\\.)*['"`‘-‟](?:[^/\n\\]|\\.)*\/[a-z]*|'(?:["`‘-‟]|\\')'|"(?:['`‘-‟]|\\")"|`['"‘-‟]`)/g;

/** A template literal that wraps an interpolation in quotes next to a shell token (`ssh -`, `export`, `$env:`, `env N=`, `eval '`, `-c '`, …). */
const SHELL_TEMPLATES =
  /`[^`\n]*(?:\bssh -|\bssh (?=['"])|git config|\bexport \w*[=\s]|\benv (?:\$\{\w+\}|\w+)=|\beval(?= ')|\$env:|Start-Process|-ArgumentList|UserKnownHostsFile|-i (?=['"])|-c (?=['"]))[^`\n]*['"]\$\{[^`]*`|`[^`\n]*['"]\$\{[^`\n]*(?:\bssh -|git config|\bexport |\$env:|Start-Process|UserKnownHostsFile|-i )[^`\n]*`|`[^`\n]*['"]\$\$\{[^`\n]*`/g;

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
    { file: 'remoteLaunch.ts', line: 'return [\'ssh\', ...portArgv(ssh.port, \'linux\'), ...sshOptionArgv(ssh, jump), \'--\', sshDestination(ssh), quoteFor(\'posix\', line)].join(\' \');', parser: 'none', vault: 'text', because: 'the trust line the person approves: shown, never typed' },
    { file: 'remoteLaunch.ts', line: 'return `${name}=${quoteFor(\'posix\', value)}; export ${name}`;', parser: 'posix', vault: 'guarded', because: 'the secrets script a REMOTE POSIX shell reads (file descriptor 3, SECRETS_REMOTE_COMMAND); the name is checked, the value is single-quoted', proof: 'remoteLaunch.test.ts :: R23' },
    { file: 'sshCommand.ts', line: 'function shellQuote(value: string, platform: NodeJS.Platform = process.platform): string {', parser: 'cmd-or-powershell', vault: 'definition', because: 'win32: the word comes from windowsWord; POSIX: a double-quoted word with its specials escaped' },
    { file: 'sshCommand.ts', line: 'function windowsWord(value: string, ordinary: WindowsOrdinary, keyPrefix = \'\'): string {', parser: 'powershell', vault: 'definition', because: 'THE one win32 word rule: a single-quoted word for anything PowerShell would expand or read as something else, else bare or "…"' },
    { file: 'sshCommand.ts', line: 'return quoteFor(\'powershell\', `${keyPrefix}${value}`);', parser: 'powershell', vault: 'guarded', because: 'a value PowerShell would expand or end: the key-value prefix goes inside the single quotes', proof: `${SSH_COMMAND} :: S2 win32` },
    { file: 'sshCommand.ts', line: 'return POWERSHELL_BARE_SAFE.test(word) ? word : quoteFor(\'powershell\', word);', parser: 'powershell', vault: 'guarded', because: 'a line word is bare only when it is plain: a login with `$`, a jump chain with `,`, a leading `@` are quoted', proof: `${SSH_COMMAND} :: S4 win32` },
    { file: 'sshCommand.ts', line: 'return port !== undefined && port !== DEFAULT_SSH_PORT ? [\'-p\', lineWord(String(port), platform)] : [];', parser: 'powershell', vault: 'guarded', because: 'portArgv: the port is a number by type and a string by data (sync, import); win32 goes through the word rule, a POSIX word stays bare (typeGuards refuses a non-number port)', proof: `${SSH_COMMAND} :: S5 win32` },
    { file: 'sshCommand.ts', line: 'return windowsWord(value, \'double-quoted\');', parser: 'cmd-or-powershell', vault: 'guarded', because: 'the -i key path is entry data and nothing validates it', proof: `${SSH_COMMAND} :: S2 win32` },
    { file: 'sshCommand.ts', line: 'function lineWord(word: string, platform: NodeJS.Platform): string {', parser: 'powershell', vault: 'definition', because: 'win32: the line word of the one word rule' },
    { file: 'sshCommand.ts', line: 'return platform === \'win32\' ? windowsWord(word, \'bare\') : word;', parser: 'powershell', vault: 'guarded', because: 'a login may hold `$`; a jump chain holds `,`', proof: `${SSH_COMMAND} :: S4 win32` },
    { file: 'sshCommand.ts', line: 'parts.push(...sshOptionArgv(entity, options.jump).map((word) => lineWord(word, platform)));', parser: 'powershell', vault: 'guarded', because: 'the -J value and the forwards come from entries', proof: `${SSH_COMMAND} :: S4 win32` },
    { file: 'sshCommand.ts', line: 'return remote === undefined ? [target] : [\'--\', target, quoteFor(platform === \'win32\' ? \'powershell\' : \'posix\', remote.command)];', parser: 'powershell', vault: 'guarded', because: 'the remote command is entry data', proof: `${SSH_COMMAND} :: C4b` },
    { file: 'sshCommand.ts', line: 'return lineWord(destination, platform);', parser: 'powershell', vault: 'guarded', because: 'the destination: a login may hold `$`', proof: `${SSH_COMMAND} :: S4 win32` },
    { file: 'sshCommand.ts', line: 'return /[\\\\"$`]/.test(destination) ? shellQuote(destination, platform) : destination;', parser: 'posix', vault: 'guarded', because: 'the destination for a POSIX shell: `\\`, `"`, `$` and the backtick are escaped in a double-quoted word', proof: `${SSH_COMMAND} :: a domain login survives a POSIX shell` },
    { file: 'sshCommand.ts', line: ': `UserKnownHostsFile=${shellQuote(file, platform)}`;', parser: 'cmd-or-powershell', vault: 'none', because: 'the same pin file, for a POSIX shell' },
    { file: 'sshCommand.ts', line: '? windowsWord(file, \'double-quoted\', \'UserKnownHostsFile=\')', parser: 'powershell', vault: 'none', because: 'the pin file is a sanitised name under the extension storage', proof: `${SSH_COMMAND} :: S3 win32` },
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
    { file: 'remoteLaunch.ts', line: 'return text.replace(/\'/g, `\'\\\\\'\'`);', parser: 'posix', vault: 'guarded', because: 'singleQuotedBody, the one escape of the stay-open wrapper and of loginShellCommand: the line becomes one POSIX single-quoted word for the REMOTE shell (the entry\'s command, run remotely by design)', proof: 'remoteLaunchDelivery.test.ts :: the_wrapper_keeps_the_login_shell' },
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
    { file: 'remoteLaunch.ts', line: 'return `exec \\${SHELL:-sh} -l -c \'${singleQuotedBody(inner)}\'`;', parser: 'posix', vault: 'guarded', because: 'loginShellCommand: the remote command of every road, the inner text single-quoted by singleQuotedBody (above); its text holds no `"` of its own', proof: 'remoteLaunchDelivery.test.ts :: bash_delivers_one_remote_element_byte_equal' },
    { file: 'remoteLaunch.ts', line: 'return `eval \'${quoted}\'; s=$?; test $s -eq 0 || printf \'creds: the command ended with exit code %s\\\\n\' $s >&2; exec \\${SHELL:-sh} -l`;', parser: 'posix', vault: 'guarded', because: 'the stay-open wrapper, `quoted` is the line with every quote escaped (above)', proof: 'remoteLaunchDelivery.test.ts :: the_wrapper_keeps_the_login_shell' },
    { file: 'runPlan.ts', line: 'return family === \'powershell\' ? `$env:${name}` : `"$${name}"`;', parser: 'posix', vault: 'none', because: 'the variable name is CREDS_REF_<n> (refVarName)' },
    { file: 'runPlan.ts', line: 'bash: (name) => `"$${name}"`,', parser: 'posix', vault: 'none', because: 'the same CREDS_REF_<n> name' },
    { file: 'sharePayloadBuild.ts', line: 'return `"${nodes[0].name}" is marked Not for export — nothing to share.`;', parser: 'none', vault: 'text', because: 'a message' },
    { file: 'wslRelay.ts', line: 'return usable ? `env ${name}=\'${value}\' ` : \'\';', parser: 'posix', vault: 'none', because: 'a socket path from the relay; a value holding any of the four curly quotes or the ASCII one is dropped, not quoted', proof: 'wslRelay.test.ts :: curly single quote' },
  ],
  batch: [
    { file: 'sshAskpass.ts', line: 'content: \'@echo off\\r\\nsetlocal EnableDelayedExpansion\\r\\necho(!CREDS_SSH_PASSWORD!\\r\\n\',', parser: 'cmd', vault: 'guarded', because: 'the password is read by delayed expansion, after cmd has parsed the line; the file has CRLF line ends', proof: 'sshAskpass.test.ts :: delayed expansion' },
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

test('the patterns count a quoting line added to a source file (they find the new line; they do not judge whether it is quoted)', () => {
  const text = fs.readFileSync(path.join(SRC, 'sshCommand.ts'), 'utf8');
  const withNew = `${text}\nconst bad = \`-i "\${entity.sshKeyPath}"\`;\nconst worse = quoteFor('powershell', entity.sshKeyPath);\n`;
  assert.equal(foundIn('sshCommand.ts', withNew, QUOTER_CALLS).length, foundIn('sshCommand.ts', text, QUOTER_CALLS).length + 1);
  assert.equal(foundIn('sshCommand.ts', withNew, SHELL_TEMPLATES).length, foundIn('sshCommand.ts', text, SHELL_TEMPLATES).length + 1);
});

// ---- the words the win32 line PUSHES, quoted or not: every string field of the entity, fed a hostile value ---------------
//
// The scan above pins the CALLS that quote. It cannot see a word that is pushed into the line with no call at all (the
// destination was one, until this fix). So this road test goes the other way round: for every string field `buildSshCommand`
// reads on win32, a hostile value goes in, and the line that comes out is read WORD BY WORD. Each word must be a plain
// whitelisted word, a well-formed `"…"` word with nothing PowerShell expands in it, or a well-formed PowerShell
// single-quoted word. A value the field's own validator refuses makes `buildSshCommand` return undefined (or drop the
// forward), which is also fine: the hostile text then is not in the line at all.

/**
 * The checker's OWN grammar of a safe word (not imported from the source: a check that shares the source's mistake agrees
 * with it). A word is one of: a plain word (and not one that starts with `@`, or with `-` and holds `:`); a `"…"` word,
 * optionally behind a `Name=`, that holds nothing PowerShell expands or reads as a closing double quote; a single-quoted
 * word that closes with the quote it opened with and holds no single-quote character except as a doubled pair of the same one.
 * A word ends at a space or at the end of the line.
 */
const SINGLE_QUOTE_CHARS = "'\u2018\u2019\u201A\u201B";
const DOUBLED_SINGLE = [...SINGLE_QUOTE_CHARS].map((q) => `${q}${q}`).join('|');
const SAFE_SINGLE = [...SINGLE_QUOTE_CHARS].map((q) => `${q}(?:[^${SINGLE_QUOTE_CHARS}]|${DOUBLED_SINGLE})*${q}`).join('|');
const SAFE_DOUBLE = '(?:[A-Za-z]+=)?"[^"\u201C\u201D\u201E\u201F\u2033$`]*"';
const SAFE_PLAIN = '(?![@]|-[^: ]*:)[A-Za-z0-9._:@\\\\/[\\]=+-]+';
const SAFE_WORD = new RegExp(`(?:${SAFE_SINGLE}|${SAFE_DOUBLE}|${SAFE_PLAIN})(?= |$)`, 'y');

/** What is wrong with the win32 line as PowerShell would read it, or `undefined` when every word is safe. */
function lineProblem(line: string): string | undefined {
  let at = 0;
  while (at < line.length) {
    if (line[at] === ' ') {
      at += 1;
      continue;
    }
    SAFE_WORD.lastIndex = at;
    const word = SAFE_WORD.exec(line);
    if (word === null) {
      return `the word at ${at} is not plain, "…" or single-quoted: ${JSON.stringify(line)}`;
    }
    at += word[0].length;
  }
  return undefined;
}

test('the word checker of the road test below refuses what it is written to refuse, and accepts an ordinary line', () => {
  const bad = [
    'ssh -J a@b,c@d deploy@example.com',
    'ssh a$(x)b@example.com',
    'ssh "a$HOME" x',
    'ssh \'a\'b\' x',
    'ssh a;b',
    'ssh -i "a\u201C; x; \u201Db" h',
    'ssh -i "a\u201F; x; \u2033b" h',
    'ssh \'a\u2019b\' h',
    'ssh @x h',
    'ssh -p:1 h',
    'ssh a`b h',
    'ssh "unclosed h',
  ];
  for (const line of bad) {
    assert.notEqual(lineProblem(line), undefined, line);
  }
  const good = [
    'ssh deploy@example.com',
    'ssh -i "C:\\Users\\me\\my keys\\k" -p 2200 -J \'a@b,c@d\' -L 5432:db:5432 -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\k h" \'a$HOME@h\'',
    "ssh 'a''b' 'a\u2019\u2019b' deploy@[2001:db8::1]",
  ];
  for (const line of good) {
    assert.equal(lineProblem(line), undefined, line);
  }
});

/** Values a vault entry could carry into any field. */
const HOSTILE = ['a$(x)b', "a'b", 'a\u2019b', 'a\u2018b', 'a,b', 'a;b', 'a b', 'a`b', 'a"b', 'a\u201Cb', 'a\u201Fb', 'a\u2033b', 'a$b', 'a|b', 'a&b', 'a%b', 'a(b)', 'a<b', 'a!b', '@a', '-p:1'];

const ROAD_BASE: EntityMetadata = { id: 'e1', name: 'prod', host: 'example.com', user: 'deploy', isSshEnabled: true };

interface RoadCase {
  readonly entity: EntityMetadata;
  readonly options?: SshCommandOptions;
}

/** A jump chain of one hop, made by the walk that produces the real `-J` value. */
function viaJump(hop: Partial<EntityMetadata>): RoadCase {
  const hopEntity: EntityMetadata = { ...ROAD_BASE, id: 'h1', name: 'hop', user: 'j', host: 'bastion', ...hop };
  const entity: EntityMetadata = { ...ROAD_BASE, jumpHostEntityId: 'h1' };
  const chain = resolveJumpChain(entity, (id) => (id === 'h1' ? hopEntity : undefined));
  return { entity, options: { jump: chain.ok ? chain.value : undefined } };
}

/**
 * Every string field `buildSshCommand` reads on win32, each with a way to put a value into it. The ports are NOT here: a
 * port is a `number` by type (the entity's and a jump hop's alike), so a string cannot be built into this fixture without a
 * cast. A string port can only arrive as JSON, and the next test feeds it through the door that JSON comes through.
 */
const ROAD_FIELDS: Record<string, (v: string) => RoadCase> = {
  sshKeyPath: (v) => ({ entity: { ...ROAD_BASE, sshKeyPath: v } }),
  user: (v) => ({ entity: { ...ROAD_BASE, user: v } }),
  host: (v) => ({ entity: { ...ROAD_BASE, host: v } }),
  'forward.bindAddress': (v) => ({ entity: { ...ROAD_BASE, portForwards: [{ kind: 'local', bindAddress: v, bindPort: 1, host: 'db', hostPort: 2 }] } }),
  'forward.host': (v) => ({ entity: { ...ROAD_BASE, portForwards: [{ kind: 'remote', bindPort: 1, host: v, hostPort: 2 }] } }),
  'jump hop user': (v) => viaJump({ user: v }),
  'jump hop host': (v) => viaJump({ host: v }),
  'options.jump': (v) => ({ entity: ROAD_BASE, options: { jump: v } }),
  'options.knownHostsFile': (v) => ({ entity: ROAD_BASE, options: { knownHostsFile: v } }),
};

/** One field fed every hostile value: how many reached a line, and the first thing wrong with a line, if any. */
function roadOf(put: (v: string) => RoadCase): { reached: number; problem?: string } {
  let reached = 0;
  for (const value of HOSTILE) {
    const { entity, options } = put(value);
    const line = buildSshCommand(entity, 'win32', { program: 'ssh', ...options });
    if (line === undefined) {
      continue; // the field's own validator refused the value: nothing of it reached a line
    }
    reached += 1;
    const problem = lineProblem(line);
    if (problem !== undefined) {
      return { reached, problem: `${JSON.stringify(value)}: ${problem}` };
    }
  }
  return { reached };
}

test('road: a string in a port field never becomes an entity: isEntityMetadata refuses it, so the builder cannot be handed one', () => {
  // The shape a vault, a sync, a share or an import writes: JSON, so a port can be any string there. Nothing is cast: the
  // value goes in as `unknown`, which is what the guard takes.
  const wire = (extra: Record<string, unknown>): unknown => ({ ...ROAD_BASE, ...extra });
  assert.equal(isEntityMetadata(wire({})), true, 'the control: the same record without a hostile port is an entity');
  assert.equal(isEntityMetadata(wire({ port: 2200 })), true, 'the control: a number port is an entity');
  const forward = (row: Record<string, unknown>): unknown => wire({ portForwards: [{ kind: 'local', bindPort: 1, host: 'db', hostPort: 2, ...row }] });
  assert.equal(isEntityMetadata(forward({})), true, 'the control: a forward with number ports is an entity');
  for (const value of [...HOSTILE, '22', '']) {
    assert.equal(isEntityMetadata(wire({ port: value })), false, `port ${JSON.stringify(value)} was accepted`);
    assert.equal(isEntityMetadata(forward({ bindPort: value })), false, `forward bindPort ${JSON.stringify(value)} was accepted`);
    assert.equal(isEntityMetadata(forward({ hostPort: value })), false, `forward hostPort ${JSON.stringify(value)} was accepted`);
  }
  // A jump hop is an entity too and is read through the same guard, so its port is covered by the loop above.
});

test('road: every string field the win32 line reads, given a hostile value, is refused or comes out as plain, "…" or single-quoted words only', () => {
  for (const [field, put] of Object.entries(ROAD_FIELDS)) {
    const road = roadOf(put);
    assert.equal(road.problem, undefined, `${field} = ${road.problem}`);
    // The fields nothing validates must have been fed for real, or the test proves nothing about them.
    const open = ['sshKeyPath', 'options.jump', 'options.knownHostsFile'].includes(field);
    assert.ok(!open || road.reached === HOSTILE.length, `${field}: every hostile value must have reached a line (${road.reached})`);
  }
});
