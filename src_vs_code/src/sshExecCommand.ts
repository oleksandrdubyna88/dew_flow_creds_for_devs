import { EntityMetadata } from './types';
import { DEFAULT_SSH_PORT, isSafeSshTarget } from './sshCommand';
import { sshOptionArgv } from './sshOptions';
import { BRIDGED_ASKPASS_OPTIONS, bridgedHostWord, bridgedKeyPathProblem, unsafeBridgedUser } from './bridgedSshConfig';

/** The vault-resolved half, identical in meaning to `SshCommandOptions` on the human path. */
export interface SshExecOptions {
  jump?: string;
  knownHostsFile?: string;
  /** A bridged call: ONE fresh connection that carries the command and nothing else, whatever the entry or a config file says (Amendment 3, C.1-C.2). */
  bridged?: boolean;
  /** Ask ssh for no remote pty: `-T` is the FIRST word of the argv (E3's two roads, parent D16). Absent or `false`: today's argv. */
  noTty?: boolean;
  /**
   * Whether the extension's OWN agent serves this call (E3's two roads, parent D17 (b)). `false` and an entry that forwards the agent: no `-A`,
   * and `-o ForwardAgent=no`. `true` or absent: today's argv.
   */
  ownAgent?: boolean;
  /**
   * A bridged call only (E1.6): the relative name of the per-call `-F` file, `c.conf`. The spawn's `cwd` is the folder that holds it. A bridged
   * call with no file is refused (`undefined`), like an unsafe host.
   */
  configFile?: string;
  /** A bridged call only: the destination's host key is pinned in the file's destination block (`StrictHostKeyChecking=yes`), or not (`accept-new`). */
  pinned?: boolean;
}

/**
 * The options of a bridged call, in this order. `ForwardAgent=no` alone is not enough: a multiplexed session inherits the
 * master's forwarded agent and authenticates nothing itself, so connection sharing is off (`ControlPath=none` disables it;
 * `ControlMaster=no` is belt and braces). `ClearAllForwardings=yes` drops every port forwarding a config file names;
 * `ForwardX11=no` and `Tunnel=no` the two other channels a config can open. Checked with `ssh -G -F none` on OpenSSH 10.2:
 * controlmaster false, clearallforwardings yes, forwardx11 no, tunnel false, forwardagent no, and no localforward/remoteforward
 * line even with -L and -R on the command line.
 */
export const BRIDGED_SSH_OPTIONS: readonly string[] = [
  '-o', 'ForwardAgent=no',
  '-o', 'ControlPath=none',
  '-o', 'ControlMaster=no',
  '-o', 'ClearAllForwardings=yes',
  '-o', 'ForwardX11=no',
  '-o', 'Tunnel=no',
];

/**
 * Assemble the argv for a non-interactive agent `ssh` exec — an ARRAY, never
 * a shell string. The remote command is passed as ssh's single trailing
 * operand and reaches the remote shell exactly as typed; nothing the agent
 * supplies is ever parsed by a LOCAL shell, because there is no local shell in
 * the path (`spawn('ssh', argv, {shell:false})`).
 *
 * Pure and `vscode`-free so the flag rules are a unit test. Sibling of
 * `sshCommand.ts`'s `buildSshCommand`, which returns a quoted string for a
 * human terminal — the two must not be collapsed: turning the string back into
 * an argv is exactly the re-entry into shell parsing this file exists to avoid.
 */

/** Caller-supplied command guard: non-empty, no NUL, within a sane length. */
export const MAX_REMOTE_COMMAND_CHARS = 8000;

// eslint-disable-next-line complexity
export function validateRemoteCommand(command: unknown): { ok: true } | { ok: false; message: string } {
  if (typeof command !== 'string') {
    return { ok: false, message: 'command must be a string' };
  }
  if (command.length === 0) {
    return { ok: false, message: 'command must not be empty' };
  }
  if (command.length > MAX_REMOTE_COMMAND_CHARS) {
    return { ok: false, message: `command must be at most ${MAX_REMOTE_COMMAND_CHARS} characters` };
  }
  if (command.includes('\0')) {
    return { ok: false, message: 'command must not contain a NUL byte' };
  }
  return { ok: true };
}

/**
 * How the exec authenticates, because it decides one ssh option that must not
 * be guessed. `askpass` means the password rides `SSH_ASKPASS` (the mechanism
 * the human Connect path has used since 0.42.0); `key` means a key file or
 * nothing at all.
 */
export type SshExecAuth = 'askpass' | 'key';

/** `-T` as the first word, only when the caller asks (E3's two roads, parent D16): ssh asks for no remote pty, also when a config says `RequestTTY force`. */
function noTtyPrefix(options: SshExecOptions): string[] {
  return options.noTty === true ? ['-T'] : [];
}

/** Whether this call must not forward the agent: the entry asks for it and the extension's own agent is not up (`ownAgent === false`). */
function agentForwardTakenAway(entity: EntityMetadata, options: SshExecOptions): boolean {
  return entity.agentForward === true && options.ownAgent === false;
}

/**
 * The entry as the shared composer gets it. A bridged call is one fresh connection: its forwards and `-A` are off. A call whose
 * extension agent is not up has `-A` off. `-A` would win over `-o ForwardAgent=no` in either order (S3.14 item 3), so the entry's own flag is
 * taken away, not out-voted.
 */
function composedEntity(entity: EntityMetadata, options: SshExecOptions): EntityMetadata {
  if (options.bridged === true) {
    return { ...entity, agentForward: false, portForwards: [] };
  }
  return agentForwardTakenAway(entity, options) ? { ...entity, agentForward: false } : entity;
}

/** `-o ForwardAgent=no` for a call whose `-A` was taken away, so a config's `ForwardAgent yes` does not forward the person's own agent (parent D17 (b)). A bridged call has it among its six. */
function ownAgentWords(entity: EntityMetadata, options: SshExecOptions): string[] {
  return options.bridged !== true && agentForwardTakenAway(entity, options) ? ['-o', 'ForwardAgent=no'] : [];
}

/** The two words that say how the host's key is trusted. On a bridge the pin is in the file's destination block, so no word names `UserKnownHostsFile`. */
function hostKeyWords(options: SshExecOptions): string[] {
  if (options.bridged === true) {
    return ['-o', `StrictHostKeyChecking=${options.pinned === true ? 'yes' : 'accept-new'}`];
  }
  return options.knownHostsFile === undefined
    ? ['-o', 'StrictHostKeyChecking=accept-new']
    : ['-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${options.knownHostsFile}`];
}

/** What a bridged call adds after the six options: the password words for a password destination, then the one file `ssh` may read. */
function bridgedWords(auth: SshExecAuth, configFile: string): string[] {
  return [...BRIDGED_SSH_OPTIONS, ...(auth === 'askpass' ? BRIDGED_ASKPASS_OPTIONS : []), '-F', configFile];
}

const userTaken = (entity: EntityMetadata): boolean => entity.user === undefined || entity.user.length === 0 || !unsafeBridgedUser(entity.user);
const keyTaken = (keyPath: string | undefined): boolean => keyPath === undefined || keyPath.length === 0 || bridgedKeyPathProblem(keyPath) === undefined;

/** The file is named and no known-hosts file is (the pin is in the file), and the user and the key path pass their rules. */
function valuesTaken(entity: EntityMetadata, keyPath: string | undefined, options: SshExecOptions): boolean {
  return options.configFile !== undefined && options.knownHostsFile === undefined && userTaken(entity) && keyTaken(keyPath);
}

/**
 * The destination word of a bridged call, or `undefined` when the call is refused: no file, a known-hosts file given (the pin is in the file), a user
 * or a host or a key path that a bridge does not take. The writer has refused these already, with the reason; this is the second line, on the
 * one function that builds the argv. The host is the `Host` word: with its brackets off, because `ssh` cannot resolve a bracketed destination (X8).
 */
function bridgedTarget(entity: EntityMetadata, keyPath: string | undefined, options: SshExecOptions): string | undefined {
  const word = bridgedHostWord(entity.host as string, 'destination');
  return word !== undefined && valuesTaken(entity, keyPath, options) ? targetOf(entity.user, word) : undefined;
}

const targetOf = (user: string | undefined, host: string): string => (user ? `${user}@${host}` : host);

/**
 * `[(-o BatchMode=yes | -o NumberOfPasswordPrompts=1), -o
 *   StrictHostKeyChecking=accept-new, -o ConnectTimeout=10, (-i keyPath)?,
 *   (-p port)?, user@host, command]`. Returns `undefined` with no host.
 *
 * <p><b>Why BatchMode is conditional.</b> An unattended exec must never hang on
 * a prompt, and `BatchMode=yes` is the usual way to say so — but BatchMode has
 * historically ALSO meant "never ask for a password", by zeroing
 * `NumberOfPasswordPrompts`, which would silently disable the askpass path this
 * feature exists to use. The evidence is ambiguous: `ssh -G -o BatchMode=yes`
 * on OpenSSH 10.3 still reports `numberofpasswordprompts 3`, and that dump is
 * not the authentication code. Rather than depend on an interaction we cannot
 * test without a live SSH server, the password branch takes the ssh options the
 * human path already proves in production and adds nothing: forced askpass
 * answers the prompt, and stdin is closed, so there is no prompt left to hang
 * on. `NumberOfPasswordPrompts=1` replaces BatchMode's protection where it
 * actually mattered — a wrong stored password fails once instead of asking our
 * script for the same wrong password three times.</p>
 *
 * <p>The key branch keeps `BatchMode=yes`: there, nothing supplies a
 * passphrase, so failing fast is exactly right.</p>
 */
// eslint-disable-next-line complexity
export function buildSshExecArgv(
  entity: EntityMetadata,
  keyPath: string | undefined,
  remoteCommand: string,
  auth: SshExecAuth = 'key',
  options: SshExecOptions = {},
): string[] | undefined {
  if (!isSafeSshTarget(entity)) {
    return undefined;
  }
  const bridged = options.bridged === true;
  const target = bridged ? bridgedTarget(entity, keyPath, options) : targetOf(entity.user, entity.host as string); // isSafeSshTarget above proved the host non-empty
  if (target === undefined) {
    return undefined;
  }
  const argv: string[] = [
    ...noTtyPrefix(options),
    ...(auth === 'askpass' ? ['-o', 'NumberOfPasswordPrompts=1'] : ['-o', 'BatchMode=yes']),
  ];
  // A pinned key is enforced here exactly as on the human path (audit B10): with a pin, a
  // changed host key fails the call instead of being accepted silently. An agent's exec is
  // precisely where nobody is watching a warning scroll past.
  argv.push(...hostKeyWords(options), '-o', 'ConnectTimeout=10');
  // The same shared composer the human path uses — see `sshOptions.ts`. A bridged call is one fresh connection: the composer gets the
  // entry with its forwards and `-A` off, and BRIDGED_SSH_OPTIONS tells ssh to share no connection and clear what a config file adds.
  // `-A` would win over `-o ForwardAgent=no` in either order (S3.14 item 3), so the entry's own flag is taken away, not out-voted.
  argv.push(...sshOptionArgv(composedEntity(entity, options), options.jump), ...ownAgentWords(entity, options));
  if (bridged) {
    argv.push(...bridgedWords(auth, options.configFile as string));
  }
  if (keyPath !== undefined && keyPath.length > 0) {
    argv.push('-i', keyPath);
  }
  if (entity.port !== undefined && entity.port !== DEFAULT_SSH_PORT) {
    argv.push('-p', String(entity.port));
  }
  // `--` ends option parsing. Without it a host beginning with a dash is a FLAG to
  // ssh's own getopt, and `-oProxyCommand=…` runs a LOCAL command before any
  // authentication — proven against OpenSSH 10.3, which executed it. `shell: false`
  // does not help: the injection is in ssh's parser, not a shell's.
  argv.push('--', target, remoteCommand);
  return argv;
}
