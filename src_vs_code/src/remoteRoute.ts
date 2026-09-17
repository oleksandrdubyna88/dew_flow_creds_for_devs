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

/** What the connection would authenticate with — `sshCredential.ts`'s four answers. */
export type CredentialKind = 'storedKey' | 'keyPath' | 'password' | 'none';

/** Everything known about the relay for THIS window's distribution, read in one pass. */
export interface RelayReadiness {
  /** `credSshManager.wslAgentRelay`. */
  readonly enabled: boolean;
  /** `WslRelayManager.serving()` names this distribution. */
  readonly running: boolean;
  /** `WslRelayManager.socketPathFor(distro)` — empty until the relay has said where it listens. */
  readonly socket: string;
}

export type RefusalReason =
  | 'not-wsl'
  | 'distro-ambiguous'
  | 'distro-unknown'
  | 'relay-off'
  | 'relay-not-running'
  | 'agent-has-no-key'
  | 'credential-is-a-password'
  | 'credential-is-a-key-path'
  | 'known-hosts-translation-failed';

export type ConnectRoute =
  /** Compose the line as always — for the platform `terminalPlatform` names, which may be linux. */
  | { kind: 'compose' }
  /** No `-i` at all: the agent answers through the relay, and the key never enters the distribution. */
  | { kind: 'agent'; socketPath: string }
  /** Never empty, and ordered: the first reason is the one the button fixes. */
  | { kind: 'refuse'; reasons: readonly RefusalReason[] };

/**
 * The whole decision.
 *
 * @param agentServesKey `SshAgentManager.servesKeyFor(node)` — the agent already holds this key.
 */
export function remoteRoute(
  side: WindowSide,
  credential: CredentialKind,
  agentServesKey: boolean,
  relay: RelayReadiness,
): ConnectRoute {
  if (side.kind === 'local') {
    return { kind: 'compose' };
  }
  if (side.kind === 'other') {
    // Remote-SSH, a dev container, Codespaces: nothing here bridges those, and the broker's own
    // `ssh -R` bridge is a different plan. Refusing is the honest answer, not a Windows path.
    return { kind: 'refuse', reasons: ['not-wsl'] };
  }
  return wslRoute(side.problem, credential, agentServesKey, relay);
}

function wslRoute(
  problem: DistroProblem | undefined,
  credential: CredentialKind,
  agentServesKey: boolean,
  relay: RelayReadiness,
): ConnectRoute {
  const blocked = credentialCannotCross(credential);
  if (blocked !== undefined) {
    // A password rides an askpass SCRIPT and a key path names a file on the Windows disk. Neither
    // is made reachable by a perfect relay, so listing relay problems beside them would be noise
    // pointing at a button that cannot help.
    return { kind: 'refuse', reasons: [blocked] };
  }
  const distro = distroProblem(problem);
  if (credential === 'none') {
    // Nothing to authenticate with, so nothing of ours crosses: `ssh user@host` composes for the
    // distribution's shell exactly as it does for a Windows one. The distribution still has to be
    // known, because a pinned host key is translated against it.
    return distro === undefined ? { kind: 'compose' } : { kind: 'refuse', reasons: [distro] };
  }
  return storedKeyRoute(distro, agentServesKey, relay);
}

/** The stored-key case: the only one the relay can serve, and the only one that can list several. */
function storedKeyRoute(
  distro: RefusalReason | undefined,
  agentServesKey: boolean,
  relay: RelayReadiness,
): ConnectRoute {
  const reasons = [distro, relayProblem(relay), agentServesKey ? undefined : ('agent-has-no-key' as const)];
  const missing = reasons.filter((reason): reason is RefusalReason => reason !== undefined);
  if (missing.length > 0) {
    return { kind: 'refuse', reasons: missing };
  }
  return { kind: 'agent', socketPath: relay.socket };
}

function credentialCannotCross(credential: CredentialKind): RefusalReason | undefined {
  if (credential === 'password') {
    return 'credential-is-a-password';
  }
  return credential === 'keyPath' ? 'credential-is-a-key-path' : undefined;
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
