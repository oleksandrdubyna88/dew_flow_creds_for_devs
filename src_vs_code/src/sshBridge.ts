import { EntityMetadata } from './types';

/**
 * The broker, reachable from a machine you are working on over Remote-SSH.
 *
 * <p>The direction is the thing to get straight first. VS Code's own port forwarding shows a
 * LOCAL client a service running on the REMOTE side; this needs the opposite — a remote process
 * reaching a service on your laptop. That is `ssh -R`, and it is why none of the editor's
 * built-in forwarding helps.</p>
 *
 * <p><b>Forward to the loopback PORT, not to a local socket.</b> The obvious shape is
 * `-R <remote.sock>:<local.sock>`, and on Linux and macOS it works. It cannot work from Windows:
 * our local endpoint there is a named pipe, and OpenSSH has no way to forward to one. Since
 * `-R <remote.sock>:127.0.0.1:<port>` is accepted on every platform and the broker already
 * listens on that port, one form serves all three hosts instead of two code paths where the
 * Windows one would be the untested half.</p>
 *
 * <p><b>What the remote can reach, exactly.</b> The forwarded socket is an opening into the
 * broker on your machine, so its file permissions are the boundary on that side — hence a path
 * under the remote user's own runtime directory rather than a world-writable one, and hence
 * `StreamLocalBindMask` narrowing it to the owner. Beyond that nothing changes: a caller still
 * needs a grant token or an enabled alias, the consent modal still appears **on your machine**
 * because the broker is local, and no key or password ever exists on the remote side.</p>
 *
 * <p>Pure and `vscode`-free, like `sshExecCommand.ts` beside it, so the flag rules are a unit
 * test rather than something discovered on a customer's jump box.</p>
 */

/** Where the forwarded socket lands on the remote host. */
export interface RemoteSocket {
  readonly path: string;
}

/**
 * A per-user, per-window path on the remote.
 *
 * <p>`/tmp/creds-<user>-<id>.sock` rather than a fixed name: a shared build host has other
 * people on it, and a predictable path is one another user can create first, so that our bind
 * either fails or — worse, with `StreamLocalBindUnlink` — replaces theirs. The id makes
 * collision a non-event and two of your own windows independent.</p>
 *
 * <p>Not `$XDG_RUNTIME_DIR`, though it would be the tidier home: it is unset on plenty of
 * sshd-spawned sessions, and a path that resolves to `/creds-…sock` at the filesystem root
 * fails in a way that reads as our bug. `/tmp` is present on every POSIX host this runs on.</p>
 */
export function remoteSocketPath(user: string, id: string): string {
  // No dot in the allowed set, deliberately. Stripping only the slashes turns
  // `../../etc/cron.d/evil` into `....etccron.devil` — harmless as a path, since it can no
  // longer leave /tmp, but it carries `..` into a filename and reads as something that got
  // away from us. A user name with dots (`first.last`) becomes `firstlast`, which costs
  // nothing: the id is what makes the path unique, not the name.
  const safeUser = user.replace(/[^A-Za-z0-9_-]/g, '') || 'user';
  return `/tmp/creds-${safeUser}-${id}.sock`;
}

/** A short, non-guessable id for one bridge. Injected so the argv is a pure function. */
export function bridgeId(random: () => string): string {
  return random().replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase();
}

export interface BridgeOptions {
  /** The loopback port the broker listens on, taken from a live grant token. */
  readonly port: number;
  readonly remote: RemoteSocket;
  /** Materialized private key, when the entity authenticates with one. */
  readonly keyPath?: string;
  readonly knownHostsFile?: string;
  /** `ssh` argv fragments the human path already composes — jump host and the rest. */
  readonly extra?: readonly string[];
}

/** `-R` needs a numeric, in-range port; a bridge to port 0 would forward to nothing. */
function isUsablePort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port <= 65535;
}

/**
 * The options every bridge carries, each one standing in for a failure.
 *
 * <p>Keepalives: a bridge is a long-lived connection with nothing to say, and without them a
 * NAT or a corporate firewall drops it silently — the remote's next call then hangs until its
 * own timeout, which reads as the broker being broken rather than the tunnel being gone.</p>
 *
 * <p>`ExitOnForwardFailure`: without it ssh connects, the `-R` quietly fails to bind, and the
 * remote gets "connection refused" from a bridge everyone believes is up.</p>
 *
 * <p>`StreamLocalBindUnlink`: a socket left by a dropped session makes every later bind fail.
 * `StreamLocalBindMask=0177` clears every bit but the owner's, which on a shared host is the
 * boundary between this opening and the other people logged in.</p>
 */
const FIXED_OPTIONS: readonly string[] = [
  '-o', 'ServerAliveInterval=30',
  '-o', 'ServerAliveCountMax=3',
  '-o', 'ExitOnForwardFailure=yes',
  '-o', 'StreamLocalBindUnlink=yes',
  '-o', 'StreamLocalBindMask=0177',
  '-o', 'ConnectTimeout=10',
];

/** A pinned host key when the entity has one; otherwise trust on first use, as the exec path does. */
function hostKeyArgv(knownHostsFile: string | undefined): string[] {
  return knownHostsFile === undefined
    ? ['-o', 'StrictHostKeyChecking=accept-new']
    : ['-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${knownHostsFile}`];
}

function keyArgv(keyPath: string | undefined): string[] {
  return keyPath !== undefined && keyPath.length > 0 ? ['-i', keyPath] : [];
}

/** Port 22 is left unsaid, because ssh already knows it. */
function portArgv(port: number | undefined): string[] {
  return port !== undefined && port !== 22 ? ['-p', String(port)] : [];
}

/** Whether a bridge to this entity can be built at all. */
function isReachable(
  entity: EntityMetadata,
  options: BridgeOptions,
  isSafeTarget: (entity: EntityMetadata) => boolean,
): boolean {
  return isSafeTarget(entity) && (entity.host ?? '').length > 0 && isUsablePort(options.port);
}

/** `user@host`, or the bare host when the entity names no user. */
function targetOf(entity: EntityMetadata): string {
  const host = entity.host ?? '';
  return entity.user ? `${entity.user}@${host}` : host;
}

/**
 * The argv for the bridge connection, or `undefined` when the entity cannot be reached safely.
 *
 * <p>Reuses the refusals `sshExecCommand.ts` documents rather than restating them: a host that
 * is empty or begins with a dash is refused by `isSafeTarget`, and `--` ends option parsing
 * before the target.</p>
 */
export function buildBridgeArgv(
  entity: EntityMetadata,
  options: BridgeOptions,
  isSafeTarget: (entity: EntityMetadata) => boolean,
): string[] | undefined {
  if (!isReachable(entity, options, isSafeTarget)) {
    return undefined;
  }

  return [
    ...FIXED_OPTIONS,
    ...hostKeyArgv(options.knownHostsFile),
    // No shell, no command: this connection exists only to carry the forward.
    '-N',
    '-R', `${options.remote.path}:127.0.0.1:${options.port}`,
    ...(options.extra ?? []),
    ...keyArgv(options.keyPath),
    ...portArgv(entity.port),
    // `--` ends option parsing before the target: without it a host beginning with a dash is a
    // FLAG to ssh's own getopt, and `-oProxyCommand=` runs a LOCAL command before any
    // authentication. `shell: false` does not help — the injection is in ssh's parser.
    '--',
    targetOf(entity),
  ];
}

/**
 * What to tell the person to run on the remote side.
 *
 * <p>An environment variable rather than a flag because it survives into whatever the person
 * runs next — a script, a `git` hook, an agent — without every one of them learning a new
 * argument. It names a socket, never a secret: the token or alias is still required.</p>
 */
export function remoteInstructions(remote: RemoteSocket): string {
  return [
    `export CREDS_BROKER_SOCKET=${remote.path}`,
    '',
    'Then `creds` works on this host exactly as it does on your own machine — and the',
    'credential still never arrives here: the request travels back over this SSH connection,',
    'your laptop performs it, and only the output returns. The consent prompt appears there.',
  ].join('\n');
}
