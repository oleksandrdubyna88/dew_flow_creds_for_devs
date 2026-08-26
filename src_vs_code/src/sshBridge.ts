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
 * broker on your machine, so its file permissions are the boundary on that side. **We cannot set
 * them** — for a `-R` forward the socket is created by sshd, so the SERVER's
 * `StreamLocalBindMask` governs (default 0177, owner-only). This was measured, after a version
 * of this file spent a while claiming a client-side flag did it; see {@link FIXED_OPTIONS}. What
 * we can do is LOOK, which {@link modeCheckCommand} is for.</p>
 *
 * <p>Beyond that nothing changes: a caller still needs a grant token or an enabled alias, the
 * consent modal still appears **on your machine** because the broker is local, and no key or
 * password ever exists on the remote side.</p>
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
 * <p>`/tmp/creds-<user>-<id>.sock` rather than a fixed name, and the random id turns out to
 * carry more weight than it was given. A predictable path on a shared build host is one another
 * user can create first, so our bind would simply fail. It also happens to be the only thing
 * saving us from our own dead sockets: sshd will not unlink an existing socket unless its
 * `StreamLocalBindUnlink` is on, and the default is off — measured, refusing the bind with
 * `remote port forwarding failed for listen path …`. A fixed path would therefore have worked
 * exactly once per host, until the first dropped connection.</p>
 *
 * <p>Not `$XDG_RUNTIME_DIR`, though it would be the tidier home: it is unset on plenty of
 * sshd-spawned sessions, and a path that resolves to `/creds-…sock` at the filesystem root
 * fails in a way that reads as our bug. `/tmp` is present on every POSIX host this runs on.</p>
 */
/**
 * The user name as it may appear in a path — and in the sweep's glob, which is interpolated into
 * a shell command, so this is the only thing standing between a crafted user name and that shell.
 */
export function safeUserComponent(user: string): string {
  return user.replace(/[^A-Za-z0-9_-]/g, '') || 'user';
}

export function remoteSocketPath(user: string, id: string): string {
  // No dot in the allowed set, deliberately. Stripping only the slashes turns
  // `../../etc/cron.d/evil` into `....etccron.devil` — harmless as a path, since it can no
  // longer leave /tmp, but it carries `..` into a filename and reads as something that got
  // away from us. A user name with dots (`first.last`) becomes `firstlast`, which costs
  // nothing: the id is what makes the path unique, not the name.
  return `/tmp/creds-${safeUserComponent(user)}-${id}.sock`;
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
 * The options every bridge carries, each one standing in for a failure — and, as importantly,
 * the two that were here and did nothing.
 *
 * <p>Keepalives: a bridge is a long-lived connection with nothing to say, and without them a
 * NAT or a corporate firewall drops it silently — the remote's next call then hangs until its
 * own timeout, which reads as the broker being broken rather than the tunnel being gone.</p>
 *
 * <p>`ExitOnForwardFailure`: without it ssh connects, the `-R` quietly fails to bind, and the
 * remote gets "connection refused" from a bridge everyone believes is up. This one is genuinely
 * the client's and was measured working — see below.</p>
 *
 * <h3>What was removed, and why it matters more than what stayed</h3>
 *
 * <p>This list used to carry `StreamLocalBindMask=0177` and `StreamLocalBindUnlink=yes`, with a
 * comment claiming they made the remote socket owner-only and stopped a stale socket blocking
 * the next bind. **Both were inert**, and it took a real remote host to find out: for a `-R`
 * forward the socket is created by **sshd**, so the SERVER's copies of those options govern and
 * the client's are ignored.</p>
 *
 * <p>Measured on OpenSSH 9.6p1 (Ubuntu), against a throwaway sshd with the stock defaults:</p>
 * <ul>
 *   <li>client asked for `StreamLocalBindMask=0000` — deliberately world-writable — and the
 *       socket still came out `srw-------`. The mode is the server's `StreamLocalBindMask`,
 *       whose default is 0177;</li>
 *   <li>a socket left behind by an ended session was NOT removed, and the next bind was refused
 *       with `remote port forwarding failed for listen path …` even with the client sending
 *       `StreamLocalBindUnlink=yes`. The server's default is `no` and it is the one that counts.</li>
 * </ul>
 *
 * <p>So the good news is real but not ours: the socket IS owner-only, by sshd's default. The bad
 * news is that we cannot make it so — a host whose admin widened `StreamLocalBindMask` would
 * hand every login on that box an opening into this machine's broker, and no flag here would
 * stop it. That is why {@link modeCheckCommand} exists: the mode is now OBSERVED after the
 * bridge is up, rather than asserted by a flag that never applied.</p>
 *
 * <p>The stale-socket refusal cannot bite us for a different reason — {@link remoteSocketPath}
 * gives every bridge a fresh random path, so nothing of ours ever collides. What it does leave
 * is litter: one dead socket per dropped bridge, which nobody unlinks. Bounded and inert
 * (owner-only, in a sticky `/tmp`), but real.</p>
 */
const FIXED_OPTIONS: readonly string[] = [
  '-o', 'ServerAliveInterval=30',
  '-o', 'ServerAliveCountMax=3',
  '-o', 'ExitOnForwardFailure=yes',
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

/**
 * The command that reports the forwarded socket's real permissions.
 *
 * <p>Because the client cannot SET them (see {@link FIXED_OPTIONS}), the only honest thing left
 * is to look. `stat` is in coreutils on every Linux this runs on; a host without it answers
 * nothing and the caller says so rather than claiming the socket is safe.</p>
 *
 * <p>Run through the same exec path the broker already uses, so it needs no new capability and
 * no second way of reaching the host.</p>
 */
export function modeCheckCommand(remote: RemoteSocket): string {
  return `stat -c %a ${remote.path} 2>/dev/null || echo unknown`;
}

/** Whether an observed mode means "owner only", which is the only acceptable answer. */
export function isOwnerOnlyMode(mode: string): boolean {
  return /^0?600$/.test(mode.trim());
}

/**
 * What to tell the person about a socket that is readable by anyone else on that host.
 *
 * <p>Not a failure of the bridge — it works — but a fact about where it now reaches, and one
 * they can only act on if somebody says it out loud.</p>
 */
export function describeWideSocket(mode: string, remote: RemoteSocket): string {
  return (
    `The bridge is up, but ${remote.path} on that host has mode ${mode} rather than 600. ` +
    'Anyone else logged in there can reach this machine\'s broker through it — they would still ' +
    'face the consent prompt here, but they should not be able to raise one at all. That mode ' +
    "comes from the host's sshd (StreamLocalBindMask, default 0177) and cannot be set from this " +
    'end; ask whoever administers it.'
  );
}

/**
 * Remove this user's dead bridge sockets on the remote host.
 *
 * <p><b>Why anything is left to remove.</b> For a `-R` forward sshd creates the socket and, by
 * default, does not unlink it when the session ends (`StreamLocalBindUnlink no` — measured).
 * Nothing else does either, so every dropped bridge leaves a file behind. They are inert —
 * owner-only, in a sticky `/tmp` — but they accumulate for as long as the host lives.</p>
 *
 * <p><b>The one way to get this wrong is to delete a LIVE one.</b> Another window's bridge is a
 * file of exactly the same shape, and removing it would break a tunnel somebody is using with no
 * indication of why. So liveness is decided by whether anything is actually listening, which
 * `ss -lx` answers — verified on a real host: the dead socket was swept, the live one kept, and
 * the live bridge still answered afterwards.</p>
 *
 * <p>And if `ss` is missing the command sweeps <b>nothing</b>. That is not tidiness: without it
 * the liveness test silently answers "not listening" for every socket, and the sweep would
 * delete every live bridge on the host. A little litter is the safe failure; the other one is
 * not.</p>
 */
export function sweepCommand(user: string): string {
  const pattern = `/tmp/creds-${safeUserComponent(user)}-*.sock`;
  return (
    'command -v ss >/dev/null 2>&1 || exit 0; ' +
    `for f in ${pattern}; do ` +
    '[ -e "$f" ] || continue; ' +
    'ss -lx 2>/dev/null | grep -qF "$f" || rm -f "$f"; ' +
    'done'
  );
}
