import { DistroProblem, WindowSide } from './remoteWindow';

/**
 * What a Connect click may do in THIS window — compose the line as always, go through the WSL agent
 * relay, or refuse and say everything that is missing.
 *
 * <p><b>Why a table and not a chain of ifs.</b> The defect this plan exists for was a path that
 * composed a command without ever asking which machine would run it, and the failure surfaced one
 * argument at a time: fix the `-i` and the pinned `UserKnownHostsFile` breaks the same way, fix that
 * and the askpass script does. So the decision is one total function over
 * (side × credential × agent × relay readiness), unit-tested as a table, and every caller branches
 * on its result rather than re-deriving a piece of it.</p>
 *
 * <p><b>Readiness is a record, not a socket path.</b> An earlier draft passed the socket string
 * alone, and the plan round was right that it cannot tell "the relay is switched off" from "it is on
 * but has not started yet" — two different sentences with two different buttons.</p>
 *
 * <p><b>A refusal carries every reason, ordered by what must be fixed FIRST.</b> That is
 * `wslRelayReadiness.ts`'s rule, and it is here for the same reason: an operator who fixes one thing
 * and is only then told about the next is an operator who stops reading.</p>
 *
 * <p>Pure, and imports no `vscode`.</p>
 */

/**
 * What the connection would authenticate with — `sshCredential.ts`'s four answers.
 *
 * <p>A runtime tuple with the type derived from it, not the other way round: a test that retypes a
 * list the code also holds will not notice the fifth entry, and the route matrix is exactly such a
 * test. It iterates this.</p>
 */
export const CREDENTIAL_KINDS = ['storedKey', 'keyPath', 'password', 'none'] as const;

export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

/** Everything known about the relay for THIS window's distribution, read in one pass. */
export interface RelayReadiness {
  /** `credSshManager.wslAgentRelay`. */
  readonly enabled: boolean;
  /** `WslRelayManager.serving()` names this distribution. */
  readonly running: boolean;
  /**
   * True when this socket belongs to a relay ANOTHER window started and we adopted.
   *
   * <p>Does not change the route — an adopted relay is a working relay — but the caller must ask
   * the distribution whether the socket is still there before using it, because nothing tells this
   * window when the relay that owns it exits. Absent is false, which is what every caller predating
   * the adoption change meant.</p>
   */
  readonly adopted?: boolean;
  /** `WslRelayManager.socketPathFor(distro)` — empty until the relay has said where it listens. */
  readonly socket: string;
}

/**
 * Every way a Connect click can be refused, as a runtime tuple so tests iterate the SAME list the
 * code holds rather than a copy of it.
 *
 * <p>Two entries `remoteRoute` never returns are raised by the CALL SITE after this function has
 * already answered `agent` or `compose`: `known-hosts-translation-failed`, when asking the
 * distribution where a pinned `known_hosts` file lives gets no answer, and `relay-socket-unusable`,
 * when the socket path cannot be put in front of a command safely. They live in this union because
 * the wording module takes one kind of reason, not three — flagged by a code round, and named here
 * rather than left to be rediscovered.</p>
 */
export const REFUSAL_REASONS = [
  'not-wsl',
  'distro-ambiguous',
  'distro-unknown',
  'relay-off',
  'relay-not-running',
  'agent-has-no-key',
  'credential-is-a-password',
  'credential-is-a-key-path',
  'relay-socket-unusable',
  'known-hosts-translation-failed',
] as const;

export type RefusalReason = (typeof REFUSAL_REASONS)[number];

export type ConnectRoute =
  /** Compose the line as always — for the platform `terminalPlatform` names, which may be linux. */
  | { kind: 'compose' }
  /** No `-i` at all: the agent answers through the relay, and the key never enters the distribution. */
  | { kind: 'agent'; socketPath: string }
  /**
   * Run the WINDOWS ssh client from the distribution's shell, with the key still on the Windows
   * disk and still spelled the Windows way.
   *
   * <p><b>The premise this module was built on was half wrong, and measuring it is what found
   * that.</b> `ssh -i <windows path>` cannot work with the DISTRIBUTION'S client — /mnt/c is 0777,
   * `chmod` there is a no-op, and OpenSSH ignores such a key. It works perfectly with the WINDOWS
   * client, which WSL launches through interop and which reads Windows paths under Windows ACLs.
   * Measured on the reporter's machine with the very ed25519 key our own agent cannot parse.</p>
   *
   * <p>So the key never enters the distribution here either — it never leaves Windows at all — and
   * the route needs no agent, no relay, no parser, and not even the distribution's NAME.</p>
   *
   * <p><b>What it costs, and it is not nothing.</b> The client is a Windows program: it reads
   * Windows `~/.ssh/config` and Windows `known_hosts`, it resolves names and opens sockets from
   * Windows, and a `-L` forward binds on WINDOWS rather than inside the distribution. That last one
   * is a silent change of meaning, which is why the caller says so out loud.</p>
   */
  | { kind: 'windowsClient' }
  /** Never empty, and ordered: the first reason is the one the button fixes. */
  | { kind: 'refuse'; reasons: readonly RefusalReason[] };

/**
 * The whole decision.
 *
 * @param agentServesKey `SshAgentManager.servesKeyFor(node)` — the agent already holds this key.
 * @param windowsClient whether the built-in Windows OpenSSH is installed AND reachable from the
 *   distribution. Defaulted to false, which is every answer this function gave before the route
 *   existed — so a caller that has not been taught to probe cannot be changed by it.
 */
export function remoteRoute(
  side: WindowSide,
  credential: CredentialKind,
  agentServesKey: boolean,
  relay: RelayReadiness,
  windowsClient = false,
): ConnectRoute {
  if (side.kind === 'local') {
    return { kind: 'compose' };
  }
  if (side.kind === 'other') {
    // Remote-SSH, a dev container, Codespaces: nothing here bridges those, and the broker's own
    // `ssh -R` bridge is a different plan. Refusing is the honest answer, not a Windows path.
    //
    // The Windows client does not rescue these either: it is reachable from WSL because WSL runs on
    // THIS machine. A container or a Remote-SSH host is somewhere else, with no interop to borrow.
    return { kind: 'refuse', reasons: ['not-wsl'] };
  }
  return wslRoute(side.problem, credential, agentServesKey, relay, windowsClient);
}

function wslRoute(
  problem: DistroProblem | undefined,
  credential: CredentialKind,
  agentServesKey: boolean,
  relay: RelayReadiness,
  windowsClient: boolean,
): ConnectRoute {
  if (credential === 'password') {
    // The askpass helper is a SCRIPT this shell would have to run, and the password rides the
    // terminal's environment to reach it. Neither is made reachable by a relay, and the Windows
    // client does not take them either — a Windows program cannot exec a shell script the
    // distribution holds, and the environment does not cross interop unless WSLENV names it.
    return { kind: 'refuse', reasons: ['credential-is-a-password'] };
  }
  const distro = distroProblem(problem);
  if (credential === 'none') {
    // Nothing to authenticate with, so nothing of ours crosses: `ssh user@host` composes for the
    // distribution's shell exactly as it does for a Windows one, and it is the distribution's own
    // client that should answer. The distribution still has to be known, because a pinned host key
    // is translated against it.
    return distro === undefined ? { kind: 'compose' } : { kind: 'refuse', reasons: [distro] };
  }
  return keyRoute(credential, distro, agentServesKey, relay, windowsClient);
}

/**
 * A key of either kind: the only cases with two working answers, so the ORDER is the decision.
 *
 * <p>The relay is tried first and that is deliberate. It runs the distribution's own client, so the
 * connection behaves like every other connection made from that shell — its `~/.ssh/config`, its
 * resolver, its network namespace, its idea of `localhost` for a forward. The Windows client is the
 * one that always works, not the one that always fits, so it takes the cases the relay cannot serve
 * rather than the cases it would rather have.</p>
 *
 * <p>A key PATH goes straight here: it names a file on the Windows disk, which is exactly what the
 * Windows client wants and exactly what no relay can carry.</p>
 */
function keyRoute(
  credential: CredentialKind,
  distro: RefusalReason | undefined,
  agentServesKey: boolean,
  relay: RelayReadiness,
  windowsClient: boolean,
): ConnectRoute {
  if (relayAnswers(credential, distro, agentServesKey, relay)) {
    return { kind: 'agent', socketPath: relay.socket };
  }
  if (windowsClient) {
    // Note what is NOT consulted: the distribution's name. Nothing is translated on this route, so
    // an ambiguous or unnameable distribution stops being a reason to refuse at all.
    return { kind: 'windowsClient' };
  }
  return keyRefusal(credential, distro, agentServesKey, relay);
}

/**
 * All three conditions together, because they are one question: can the relay serve THIS key.
 *
 * <p>A key PATH is excluded by the first clause and not by an oversight — there is nothing in the
 * vault for an agent to hold.</p>
 */
function relayAnswers(
  credential: CredentialKind,
  distro: RefusalReason | undefined,
  agentServesKey: boolean,
  relay: RelayReadiness,
): boolean {
  return credential === 'storedKey' && distro === undefined && agentServesKey && relayProblem(relay) === undefined;
}

function keyRefusal(
  credential: CredentialKind,
  distro: RefusalReason | undefined,
  agentServesKey: boolean,
  relay: RelayReadiness,
): ConnectRoute {
  if (credential === 'keyPath') {
    // A key path names a file on the Windows disk, so no relay problem is worth listing beside it:
    // a perfect relay would not make it reachable, and the button would point nowhere.
    return { kind: 'refuse', reasons: ['credential-is-a-key-path'] };
  }
  return storedKeyRoute(distro, agentServesKey, relay);
}

/**
 * The stored-key case: the only one the relay can serve, and the only one that can list several.
 *
 * <p><b>An unresolved distribution short-circuits.</b> The code round caught this: readiness is read
 * for ONE distribution, so when we could not name it, `running` is false and `socket` is empty
 * whatever the machine is actually doing — and reporting `relay-off` there states something about a
 * relay we never asked about. Telling somebody their relay is off while it is running is worse than
 * telling them one thing at a time, which is the only rule it appears to break.</p>
 */
function storedKeyRoute(
  distro: RefusalReason | undefined,
  agentServesKey: boolean,
  relay: RelayReadiness,
): ConnectRoute {
  if (distro !== undefined) {
    return { kind: 'refuse', reasons: [distro] };
  }
  const missing = [
    relayProblem(relay),
    agentServesKey ? undefined : ('agent-has-no-key' as const),
  ].filter((reason): reason is RefusalReason => reason !== undefined);

  return missing.length > 0 ? { kind: 'refuse', reasons: missing } : { kind: 'agent', socketPath: relay.socket };
}

function distroProblem(problem: DistroProblem | undefined): RefusalReason | undefined {
  if (problem === 'ambiguous') {
    return 'distro-ambiguous';
  }
  return problem === 'unknown' ? 'distro-unknown' : undefined;
}

/**
 * Off, or on but not yet listening — two sentences, two buttons.
 *
 * <p>An empty socket with the relay reported as running is treated as not running: the relay
 * announces its address on its first line of stdout, so until it has said, there is nothing to point
 * `SSH_AUTH_SOCK` at.</p>
 */
function relayProblem(relay: RelayReadiness): RefusalReason | undefined {
  if (!relay.enabled) {
    return 'relay-off';
  }
  return relay.running && relay.socket.length > 0 ? undefined : 'relay-not-running';
}
