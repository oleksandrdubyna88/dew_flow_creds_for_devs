import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { describeError } from './describeError';
import { EntityMetadata } from './types';
import { StorageManager } from './storageManager';
import { askpassEnv } from './sshAskpass';
import { noHostSentence } from './sshCommand';
import { buildSshCommand, describeSshTarget } from './terminalManager';
import { sshClientPresent } from './sshProgram';
import { offerToInstall } from './toolEnsure';
import { requestGone } from './requestLife';
import { forgetMaterializedKey, materializePrivateKey, writeAskpassScriptFile } from './keyInstaller';
import { SshCredentialSource, SshCredentialStopped, resolveSshCredential } from './sshCredential';
import { clickOpener } from './pinClick';
import { ConnectionOptions, connectionOptions } from './connectionOptions';
import { materializedKeysDir } from './materializedKeys';
import { WindowSide, terminalPlatform } from './remoteWindow';
import { ConnectRoute, RefusalReason, RelayReadiness, remoteRoute } from './remoteRoute';
import { RefusalAction, windowsClientCaveat } from './remoteWindowMessage';
import { envPrefix } from './wslRelay';
import { socketIsAlive, translateWindowsPath } from './wslProcess';

/**
 * The seam of SSH Connect: everything that happens BEFORE a terminal exists (E1.S3).
 *
 * <p>Moved out of `connectEntity` in the same order, with no new await, so that a second road — the
 * typed line of a terminal on a remote machine, a spawn — can have exactly the decisions the
 * person's Connect has, and nothing else, without opening a terminal first. This file opens none: it
 * never names `createTerminal`, `openSshTerminal`, `sendText` or `show`.</p>
 *
 * <p><b>The contract — what is on disk after each result, and who takes it back</b> (parent plan §4.4,
 * "one owner"):</p>
 * <ul>
 *   <li><b>stopped, refused</b> — nothing on disk. Every exit AFTER `connectionOptions` wrote a pin
 *       file takes it back before returning, through the one helper, `giveBack` — or, for a failed
 *       translation, inside `withTranslatedKnownHosts`.</li>
 *   <li><b>ready</b> — the key (when a stored key was written) and the pin (when pinned) are on disk and
 *       the OWNER of the result calls `cleanup()` on every exit that does not hand the session to a
 *       terminal or a child. After a hand-over it decides when: terminal close, child exit. The seam
 *       does not know about terminals. The askpass script is static and secret-free, shared by every
 *       caller; only the purge on deactivate removes it.</li>
 * </ul>
 */

/**
 * What the WINDOW is, handed in rather than read here so the decision stays testable.
 *
 * <p>Defaulted to a local window, so every caller not yet taught about remote windows behaves
 * exactly as it did — which is also the DoD's "byte-identical locally" clause.</p>
 */
export interface RemoteWindowDeps {
  readonly side: WindowSide;
  readonly relay: RelayReadiness;
  /**
   * Run the remedy a refusal offers, and say whether the connection is worth trying again.
   *
   * <p>A callback, because the remedies need things this function has no business knowing: the tree
   * node for *Add Key to Agent*, the command registry for the rest. Absent means the buttons are
   * shown and do nothing, which no production caller does.</p>
   */
  readonly runRemedy?: (action: RefusalAction) => Promise<boolean>;
  /**
   * The window, read again — because the remedy has just CHANGED it.
   *
   * <p>Found by a code round, and without it the whole *Set Up the Relay and Connect* promise was
   * false: the retry closed over this same record, so it re-read a relay readiness captured before
   * the relay was switched on and refused for exactly the reason that had just been fixed. Absent
   * means the snapshot is reused, which is right for a test and wrong for a window.</p>
   */
  readonly refresh?: () => RemoteWindowDeps;
  /**
   * The Windows OpenSSH client as this window's shell must spell it to launch it — `/mnt/c/…` from
   * WSL — or absent when there is none to lend.
   *
   * <p>Read once by the host module rather than probed here, for the same reason `side` and `relay`
   * are: this function decides, and everything it decides on is handed to it.</p>
   */
  readonly windowsClient?: string;
  /**
   * The platform the EXTENSION HOST runs on — the machine this extension is on, which is the one a
   * refusal has to name and the one a local window composes for.
   *
   * <p><b>The last implicit `process.platform` on this path, and it was caught by CI rather than by
   * me.</b> A test pinning the refusal's heading to "(Windows)" passes on the machine the report came
   * from and fails on the Linux runner, because the sentence is generated from whatever the host
   * happens to be. Reading the environment where the decision is made is the exact shape of defect
   * this whole change is about; it was left in one corner and the corner was the wording.</p>
   *
   * <p>Absent is `process.platform`, which is what every caller meant — so a local window is
   * unchanged and the host module is the only place the environment is read.</p>
   */
  readonly hostPlatform?: NodeJS.Platform;
}

const LOCAL_WINDOW: RemoteWindowDeps = {
  side: { kind: 'local' },
  relay: { enabled: false, running: false, socket: '' },
};

/** What preparing needs. */
export interface PrepareOptions {
  /**
   * The profile. Tests pass a partial one (`sshConnectWorld.storageWith`): besides the modules they replace, the connect
   * path reads only `getNode` (the terminal title's folder, `sshConnect.placeOf`).
   */
  readonly storage: StorageManager;
  readonly storageDir: string;
  /**
   * True when the SSH agent already serves the key this entity would use. Then no `-i` and no
   * file: `ssh` finds the key through SSH_AUTH_SOCK, and the key never touches the disk for the
   * human path either. Absent is `false`, which is what the agent-free callers meant.
   */
  readonly agentServesKey?: boolean;
  /** What the WINDOW is. Absent is a local window, which is what every caller meant before this. */
  readonly remote?: RemoteWindowDeps;
  /**
   * The agent request this connection is for, when an agent asked (`PLAN_wsl_bridge_outlives_its_client.md`
   * §5.7). Fired means the client that asked has gone: nothing is opened for it, and nothing is ASKED for it
   * either (E4.S4) — read at the entry, after the credential lookup, inside the host-key conversation and
   * inside a refusal, as well as after the last await before each terminal opens. A terminal already open
   * stays open. Absent for the person's own Connect, which no request can outlive.
   */
  readonly startGate?: AbortSignal;
  /**
   * Make this preparation's files its own: the key is written as `<id>-<uuid>.key` and the pin as
   * `known_hosts-<id>-<uuid>`, a fresh uuid per preparation, in the same `keys/<pid>/` folder so the purge
   * still owns them. Two prepares of one SSH entry then never share a path, and `cleanup()` of one cannot
   * delete the other's files (lead amendment §S3.13 A1). Every road passes it; `connectEntity` never does,
   * so SSH Connect keeps today's file names.
   */
  readonly isolate?: boolean;
}

/** `connect.remote`, or a local window. Used by prepare and by connectEntity's retry. */
export function windowOf(connect: PrepareOptions): RemoteWindowDeps {
  return connect.remote ?? LOCAL_WINDOW;
}

export type PreparedSsh = ReadySsh | RefusedSsh | StoppedSsh;

export interface ReadySsh {
  readonly kind: 'ready';
  /**
   * The SSH entity EXACTLY as handed in — the one snapshot (parent §4.4). The same object, not a copy.
   * The trust line, the typed line and a spawn argv are built from this; nobody re-reads storage after prepare.
   */
  readonly snapshot: EntityMetadata;
  /**
   * `snapshot` with `sshKeyPath` SET to the file `-i` must name, or CLEARED when the agent answers
   * (the relay route and the agent-serves-key route). What `buildSshCommand` and `openSshTerminal` take.
   * For a password it is the snapshot's own value, unchanged: it can carry an `sshKeyPath`
   * (`sshCredential.ts`), and then `-i` is on the password line, as SSH Connect always did.
   */
  readonly entity: EntityMetadata;
  /** Jump, known_hosts file (translated for a WSL shell), program word on the Windows-client route. */
  readonly options: ConnectionOptions;
  /** The platform whose SHELL parses the line — the terminal's, never `process.platform`. */
  readonly platform: NodeJS.Platform;
  /** `env SSH_AUTH_SOCK='…' ` on the relay route; `undefined` on every other route. */
  readonly prefix: string | undefined;
  /** The askpass environment — ONLY for a password credential. It holds the password. Never logged. */
  readonly env: Record<string, string> | undefined;
  /** Add `-o StrictHostKeyChecking=accept-new`: true for a password credential WITHOUT a pinned host key. */
  readonly acceptNew: boolean;
  /** `options.jump` — the resolved `-J` value, for the trust line. */
  readonly jump: string | undefined;
  /** `describeSshTarget(entity)` — the `SSH: <target>` terminal name. `undefined` when the entity has no host. */
  readonly target: string | undefined;
  /** The key file THIS preparation wrote, or `undefined`. connectEntity's two forget sites read it. */
  readonly materializedKeyPath: string | undefined;
  /**
   * Forget the materialised key and our pin file. Idempotent: the second call does nothing. The OWNER calls
   * it on every exit that did not hand the session to a terminal or a child (parent §4.4 "one owner").
   */
  cleanup(): void;
}

export interface RefusedSsh {
  readonly kind: 'refused';
  /** For `refuseAndOfferTheFix`, ordered as `remoteRoute` orders them. */
  readonly reasons: readonly RefusalReason[];
  /** False only for the `not-wsl` refusal of an unnameable platform (the original passed no retry). */
  readonly retryable: boolean;
}

export type StopReason =
  | 'request-gone'
  | 'ssh-client-missing'
  | 'credential-stopped'
  | 'connection-options'
  | 'key-write-failed'
  | 'no-host';

export interface StoppedSsh {
  readonly kind: 'stopped';
  /** Why. Nothing in connectEntity reads it; tests and a later log line do. */
  readonly why: StopReason;
}

/** What each step knows: the arguments, the credential, the route, and — later — the connection options. */
interface Gathered {
  readonly accountId: string;
  readonly ssh: EntityMetadata;
  readonly connect: PrepareOptions;
  readonly remote: RemoteWindowDeps;
  readonly source: SshCredentialSource;
}

interface Routed extends Gathered {
  readonly route: Exclude<ConnectRoute, { kind: 'refuse' }>;
  readonly windowsClient: string;
}

interface Resolved extends Routed {
  /** What `connectionOptions` returned — the name of the pin file we wrote is HERE, never on `options`. */
  readonly resolved: ConnectionOptions;
  readonly suffix: string | undefined;
}

interface Composed extends Resolved {
  readonly options: ConnectionOptions;
}

interface Staged extends Composed {
  readonly platform: NodeJS.Platform;
}

/** What a branch decides: the entity as the line needs it, and the route's extras. */
interface Parts {
  readonly entity: EntityMetadata;
  readonly prefix?: string;
  readonly env?: Record<string, string>;
  readonly acceptNew?: boolean;
  readonly materializedKeyPath?: string;
}

type Outcome = PreparedSsh | Promise<PreparedSsh>;

/**
 * Everything SSH Connect does before a terminal exists, in the same order, opening no terminal.
 * Every dialog connectEntity showed before a terminal is still shown here: the install offer, the credential
 * warning, the Windows-client caveat, the key-write error, the no-host sentence. The refusal MODAL is not:
 * `refused` is returned and the caller shows it (connectEntity: `refuseAndOfferTheFix`; a road: its own sentence).
 */
export async function prepareSshSession(
  accountId: string,
  ssh: EntityMetadata,
  connect: PrepareOptions,
): Promise<PreparedSsh> {
  const remote = windowOf(connect);
  const looked = await lookedUp(accountId, ssh, connect, remote);
  return looked.kind === 'stopped' ? looked : routed({ accountId, ssh, connect, remote, source: looked });
}

const stopped = (why: StopReason): StoppedSsh => ({ kind: 'stopped', why });

const refused = (reasons: readonly RefusalReason[], retryable: boolean): RefusedSsh => ({
  kind: 'refused',
  reasons,
  retryable,
});

/** Rows 1-6: the request, the ssh client, the credential. Nothing is on disk before any of them returns. */
async function lookedUp(
  accountId: string,
  ssh: EntityMetadata,
  connect: PrepareOptions,
  remote: RemoteWindowDeps,
): Promise<SshCredentialSource | StoppedSsh> {
  const early = await entryGate(connect, remote.side);
  if (early !== undefined) {
    return early;
  }
  // Every value opened by its OWNER through that entry's door (entry-PIN plan, D6): a borrowed key
  // entity asks its own PIN. A stop has been said already, or the person declined.
  const { storage } = connect;
  return credentialOutcome(
    connect,
    await resolveSshCredential(storage, accountId, ssh, clickOpener(storage, accountId, 'connect')),
  );
}

async function entryGate(connect: PrepareOptions, side: WindowSide): Promise<StoppedSsh | undefined> {
  // A request already gone is asked nothing — not even its credential's PIN (E4.S4). This is also what ends
  // a remedy's retry: the second attempt enters here.
  if (requestGone(connect.startGate)) {
    return stopped('request-gone');
  }
  // The terminal ssh opens in would only say "command not found" AFTER a key may have been
  // materialised; checking first costs one stat and produces an offer instead of a corpse
  // (tails T20).
  //
  // SKIPPED in a remote window, deliberately: it stats the extension HOST's PATH, which is the
  // wrong machine — it would vouch for a client the terminal will not use, and offer to install one
  // where the person is not working. Probing the right machine costs a `wsl -e command -v ssh` on
  // every click, and the failure it guards against (`ssh: command not found`) lands in a terminal
  // the person is already looking at.
  if (side.kind === 'local' && !sshClientPresent()) {
    // An agent's request travels with the offer: a client gone while it is open gets no installer (E4.S3).
    await offerToInstall('ssh', connect.startGate);
    return stopped('ssh-client-missing');
  }
  return undefined;
}

function credentialOutcome(
  connect: PrepareOptions,
  source: SshCredentialSource | SshCredentialStopped,
): SshCredentialSource | StoppedSsh {
  // The lookup can wait on the entry's PIN box. A client gone while it was open is told nothing and asked
  // nothing more — no warning, no refusal, no host-key question (E4.S4).
  if (requestGone(connect.startGate)) {
    return stopped('request-gone');
  }
  if (source.warning !== undefined) {
    void vscode.window.showWarningMessage(source.warning);
  }
  return source.kind === 'stopped' ? stopped('credential-stopped') : source;
}

/** Row 7. The route decision comes BEFORE `connectionOptions`, which writes a known_hosts file, and
 * before anything materialises a key — so a refused window leaves nothing on disk at all. */
function routed(g: Gathered): Outcome {
  const windowsClient = g.remote.windowsClient ?? '';
  const route = remoteRoute(
    g.remote.side,
    g.source.kind,
    g.connect.agentServesKey === true,
    g.remote.relay,
    windowsClient.length > 0,
  );
  return route.kind === 'refuse' ? refused(route.reasons, true) : withOptions({ ...g, route, windowsClient });
}

/** Row 8. The connection-manager half (audit D7/B10): which bastion to go through, and whether this
 * host is the one it claims to be. Resolved BEFORE anything is written to disk or a terminal
 * opened, so a refused host key costs nothing and leaves nothing behind. The request travels with
 * it: the host-key question is not raised, and no pin is written, for a client that has gone. */
async function withOptions(r: Routed): Promise<PreparedSsh> {
  const { connect } = r;
  const suffix = connect.isolate === true ? randomUUID() : undefined;
  const resolved = await connectionOptions(
    r.accountId,
    r.ssh,
    connect.storage,
    connect.storageDir,
    connect.startGate,
    suffix,
  );
  return resolved === undefined ? stopped('connection-options') : composed({ ...r, resolved, suffix });
}

/** Rows 9-10. */
async function composed(r: Resolved): Promise<PreparedSsh> {
  // A pinned host key's known_hosts file is on THIS machine, so the distribution is asked where it
  // is. The pin survives — unlike a private key, `UserKnownHostsFile` has no mode requirement, and
  // /mnt/c cannot hold one anyway.
  // NOT on the Windows-client route, and that exception is the route in one line: nothing it hands
  // over is read by the distribution, so nothing it hands over may be translated. A `/mnt/c/…` path
  // is precisely what `ssh.exe` cannot open.
  const viaClient = r.route.kind === 'windowsClient';
  const translated = viaClient
    ? r.resolved
    : await withTranslatedKnownHosts(r.resolved, r.remote.side, r.connect.storageDir);
  if (translated === undefined) {
    return refused(['known-hosts-translation-failed'], true);
  }
  // The client is a separate fact from the shell: `platform` below still says which shell parses
  // this line, and it is still the distribution's.
  return platformed({ ...r, options: viaClient ? { ...translated, program: r.windowsClient } : translated });
}

/** Rows 11-12. */
function platformed(c: Composed): Outcome {
  const platform = terminalPlatform(c.remote.side, c.remote.hostPlatform ?? process.platform);
  if (platform === undefined) {
    // Unreachable: `remoteRoute` refuses every side whose shell cannot be named. Kept as a refusal
    // rather than a cast, so a future route that forgets says so instead of composing for a guess.
    giveBack(c);
    return refused(['not-wsl'], false);
  }
  if (requestGone(c.connect.startGate)) {
    giveBack(c);
    return stopped('request-gone');
  }
  return routeBranch({ ...c, platform });
}

/** Rows 13-23. */
function routeBranch(s: Staged): Outcome {
  return s.route.kind === 'agent' ? relayBranch(s, s.route.socketPath) : keyOrPasswordBranch(s);
}

/** Rows 13-16: the WSL route — no `-i` and nothing on disk, this ONE command pointed at the relay's socket. */
async function relayBranch(s: Staged, socketPath: string): Promise<PreparedSsh> {
  // A per-command prefix rather than the window's environment collection, which is a
  // single namespace for every terminal and so cannot serve a Windows shell and a WSL one at once.
  const prefix = envPrefix('SSH_AUTH_SOCK', socketPath);
  if (prefix.length === 0) {
    // Found by a code round, and it is the worst failure this file could have had. `envPrefix`
    // DROPS a value it cannot quote — right for its original caller, where the relay then falls
    // back to the PATH — but here the fallback is `ssh` with no agent and no `-i`, which does not
    // fail: it silently authenticates with whatever keys that shell already has. Refusing is the
    // only honest answer.
    return lateRefusal(s, ['relay-socket-unusable']);
  }
  // An ADOPTED relay is asked whether it is still there. It belongs to another window, and this
  // one cannot observe its exit — so `serving()` would go on advertising a socket that is gone,
  // and the line above would point `SSH_AUTH_SOCK` at nothing while carrying no `-i`, which does
  // not fail: ssh falls back to whatever keys that shell has. The same reasoning as the empty
  // prefix two lines up, for a state that arrives later. Raised by a review of the adoption fix.
  if (!(await adoptedSocketStillThere(s.remote.relay, s.remote.side))) {
    return lateRefusal(s, ['relay-not-running']);
  }
  if (requestGone(s.connect.startGate)) {
    giveBack(s);
    return stopped('request-gone');
  }
  return ready(s, { entity: { ...s.ssh, sshKeyPath: undefined }, prefix });
}

/** Rows 17-23. */
function keyOrPasswordBranch(s: Staged): Outcome {
  if (agentServesTheKey(s)) {
    // Deliberately nothing: the agent answers, and writing the key out would defeat the
    // feature exactly where a person can see it working.
    return ready(s, { entity: { ...s.ssh, sshKeyPath: undefined } });
  }
  windowsClientNote(s.route, s.ssh);
  return s.source.kind === 'password' ? passwordBranch(s, s.source.password) : keyBranch(s);
}

/**
 * `route.kind === 'compose'` is what keeps "nothing on disk" true rather than merely hopeful. The agent this
 * trusts is reached through the extension host's own environment, which a WSL shell does not
 * share — so on the Windows-client route the same `-i`-less line would authenticate with
 * whatever the WINDOWS agent happened to hold, and the whole point of naming this entity's key
 * would be gone. That route materialises instead.
 */
function agentServesTheKey(s: Staged): boolean {
  return s.connect.agentServesKey === true && s.source.kind === 'storedKey' && s.route.kind === 'compose';
}

/** Row 18. */
function windowsClientNote(route: Routed['route'], ssh: EntityMetadata): void {
  if (route.kind === 'windowsClient') {
    const caveat = windowsClientCaveat(ssh);
    if (caveat.length > 0) {
      void vscode.window.showWarningMessage(caveat);
    }
  }
}

/** Rows 19-20, and the `ready` of a key or no credential at all. */
function keyBranch(s: Staged): PreparedSsh {
  const key = keyFile(s.source, s.connect.storageDir, s.suffix);
  if (key === 'failed') {
    giveBack(s);
    return stopped('key-write-failed');
  }
  return ready(s, { entity: { ...s.ssh, sshKeyPath: key.keyPath }, materializedKeyPath: key.materialized });
}

function keyFile(
  source: SshCredentialSource,
  storageDir: string,
  suffix: string | undefined,
): { keyPath?: string; materialized?: string } | 'failed' {
  if (source.kind === 'storedKey') {
    try {
      const keyPath = materializePrivateKey(storageDir, source.keyEntityId, source.content, suffix);
      return { keyPath, materialized: keyPath };
    } catch (error) {
      void vscode.window.showErrorMessage(`Could not write the stored key to disk: ${describeError(error)}`);
      return 'failed';
    }
  }
  return source.kind === 'keyPath' ? { keyPath: source.path } : {};
}

/**
 * Rows 21-23. No key anywhere, but a password stored: supplied through SSH_ASKPASS in a dedicated terminal,
 * so nobody retypes what the vault already knows. The password rides the terminal's ENVIRONMENT — not a
 * file, not the command line.
 */
function passwordBranch(s: Staged, password: string): PreparedSsh {
  // `platform` rather than `process.platform`, although the route refuses a password in every
  // remote window and so this can only be a local one today: reading the host's platform HERE is
  // the defect the whole change is about, and leaving one copy of it behind is how it comes back.
  const command = buildSshCommand(s.ssh, s.platform, s.options);
  if (command === undefined || describeSshTarget(s.ssh) === undefined) {
    void vscode.window.showWarningMessage(noHostSentence(s.ssh.name));
    giveBack(s);
    return stopped('no-host');
  }
  const scriptPath = writeAskpassScriptFile(s.connect.storageDir, s.platform);
  // INHERITED DEFECT (parent plan, risk 7): askpass answers EVERY password prompt of the ssh process,
  // the jump host's included, with this password. A password entity with a `-J` hop has the same flaw on
  // every road. Not fixed here: PLAN_askpass_answers_the_hop.md.
  const env = askpassEnv(scriptPath, password, s.platform);
  // accept-new: with SSH_ASKPASS_REQUIRE=force even the host-key yes/no question would be
  // answered by the askpass program — with the password. A PINNED host needs no such
  // question, and must not have it softened, so the option is added only without a pin.
  return ready(s, { entity: { ...s.ssh }, env, acceptNew: s.options.knownHostsFile === undefined });
}

/** A refusal after the pin file was written: ours to take back first. */
function lateRefusal(s: Staged, reasons: readonly RefusalReason[]): RefusedSsh {
  giveBack(s);
  return refused(reasons, true);
}

/**
 * The one give-back: every `stopped` and `refused` exit after `connectionOptions` returned — except a failed
 * translation, which gives the pin back inside `withTranslatedKnownHosts`. On `resolved`,
 * never on `options`: on the relay route the latter has already been TRANSLATED, so deleting by that name
 * would hand the guard a /mnt/c path that can never be under our own directory and leave the real file
 * behind. Found by writing the adopted-socket test.
 */
function giveBack(r: Resolved): void {
  forgetOurPin(r.resolved.knownHostsFile, r.connect.storageDir);
}

function ready(s: Staged, parts: Parts): ReadySsh {
  const { materializedKeyPath } = parts;
  const { storageDir } = s.connect;
  const pin = s.resolved.knownHostsFile;
  let done = false;
  return {
    kind: 'ready',
    snapshot: s.ssh,
    entity: parts.entity,
    options: s.options,
    platform: s.platform,
    prefix: parts.prefix,
    env: parts.env,
    acceptNew: parts.acceptNew === true,
    jump: s.options.jump,
    target: describeSshTarget(parts.entity),
    materializedKeyPath,
    cleanup: (): void => {
      if (done) {
        return;
      }
      done = true;
      if (materializedKeyPath !== undefined) {
        forgetMaterializedKey(materializedKeyPath);
      }
      forgetOurPin(pin, storageDir);
    },
  };
}

/**
 * The pinned host key's file, as the distribution can open it — or `undefined`, meaning refuse.
 *
 * <p>`materializeKnownHosts` has already written a file on THIS machine by the time we get here, so
 * every refusal path deletes it: a connection that did not happen must leave nothing behind, which
 * is the same guarantee the materialised key has had since it was written.</p>
 *
 * <p>Unlike a private key the pin survives translation — OpenSSH imposes no mode requirement on
 * `UserKnownHostsFile`, which is just as well, since /mnt/c cannot hold one.</p>
 */
async function withTranslatedKnownHosts(
  options: ConnectionOptions,
  side: WindowSide,
  storageDir: string,
): Promise<ConnectionOptions | undefined> {
  if (side.kind !== 'wsl' || options.knownHostsFile === undefined) {
    return options;
  }
  const inside = await translateWindowsPath(side.distro, options.knownHostsFile);
  if (inside.length === 0) {
    forgetOurPin(options.knownHostsFile, storageDir);
    return undefined;
  }

  return { ...options, knownHostsFile: inside };
}

/**
 * Whether the socket may be used — trivially true unless it was ADOPTED.
 *
 * <p>One `wsl.exe` on a click that would otherwise have used a path nobody checked, and only for the
 * case that needs it: a relay this window started is watched, and its exit takes the entry with it.
 * An adopted one has no such witness.</p>
 */
async function adoptedSocketStillThere(relay: RelayReadiness, side: WindowSide): Promise<boolean> {
  if (relay.adopted !== true || side.kind !== 'wsl') {
    return true;
  }
  return socketIsAlive(side.distro, relay.socket);
}

/**
 * Delete a host-pin file THIS connection created — and only such a file.
 *
 * <p>`connectionOptions` writes it through `materializeKnownHosts`, into the same per-window
 * `keys/<pid>/` directory the decrypted key goes to, so a refusal can take it back. The guard is
 * there because a code round was right that an unguarded `rm` on whatever path the field holds is
 * one future refactor away from deleting somebody's own `known_hosts`.</p>
 */
function forgetOurPin(knownHostsFile: string | undefined, storageDir: string): void {
  if (knownHostsFile === undefined) {
    return;
  }
  // Inside the directory we write into, decided by the same function that builds it — not a name
  // that merely LOOKS like ours. A substring match is a guess about somebody else's file.
  const ours = materializedKeysDir(storageDir);
  if (path.relative(ours, knownHostsFile).startsWith('..')) {
    return;
  }
  forgetMaterializedKey(knownHostsFile);
}
