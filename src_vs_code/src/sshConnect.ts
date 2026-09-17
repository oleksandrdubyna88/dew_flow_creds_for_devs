import { describeError } from './describeError';
import * as vscode from 'vscode';
import { EntityMetadata } from './types';
import { StorageManager } from './storageManager';
import { askpassEnv } from './sshAskpass';
import { buildSshCommand, describeSshTarget, openSshTerminal } from './terminalManager';
import { sshClientPresent } from './sshProgram';
import { offerToInstall } from './toolEnsure';
import {
  forgetMaterializedKey,
  materializePrivateKey,
  writeAskpassScriptFile,
} from './keyInstaller';
import { resolveSshCredential } from './sshCredential';
import { ConnectionOptions, connectionOptions } from './connectionOptions';
import * as path from 'node:path';
import { materializedKeysDir } from './materializedKeys';
import { WindowSide, terminalPlatform } from './remoteWindow';
import { RefusalReason, RelayReadiness, remoteRoute } from './remoteRoute';
import {
  RefusalAction,
  RefusalContext,
  RemoteRefusal,
  refusalFor,
  windowsClientCaveat,
} from './remoteWindowMessage';
import { envPrefix } from './wslRelay';
import { translateWindowsPath } from './wslProcess';

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

/**
 * The human Connect path: open an SSH session for an entity in a VS Code
 * terminal. Moved out of `extension.ts` so the agent broker's terminal action
 * can call the exact same code the tree's Connect button runs.
 */
export interface ConnectOptions {
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
   * The retry budget, spent by the one recursive call this function makes.
   *
   * <p>A refusal's button runs a remedy and then tries again; the second attempt must NOT offer
   * another retry, or the pair becomes a ride a person can stay on indefinitely. A code round
   * pointed out that the plan claimed "at most once" while nothing enforced it.</p>
   */
  readonly allowRetry?: boolean;
}

/** @returns whether a terminal was actually opened — a remote window can refuse. */
// eslint-disable-next-line complexity, max-lines-per-function
export async function connectEntity(
  accountId: string,
  entity: EntityMetadata,
  connect: ConnectOptions,
): Promise<boolean> {
  const { storage, storageDir } = connect;
  const agentServesKey = connect.agentServesKey === true;
  const remote = connect.remote ?? LOCAL_WINDOW;
  const side = remote.side;
  const hostPlatform = remote.hostPlatform ?? process.platform;
  // The retry re-READS the window: the remedy it follows exists to change the very state the first
  // attempt refused on.
  const retry =
    connect.allowRetry === false
      ? undefined
      : (): Promise<boolean> =>
          connectEntity(accountId, entity, {
            ...connect,
            remote: remote.refresh?.() ?? remote,
            allowRetry: false,
          });
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
    await offerToInstall('ssh');
    return false;
  }
  const source = await resolveSshCredential(storage, accountId, entity);
  if (source.warning !== undefined) {
    void vscode.window.showWarningMessage(source.warning);
  }

  // The route decision comes BEFORE `connectionOptions`, which writes a known_hosts file, and
  // before anything materialises a key — so a refused window leaves nothing on disk at all.
  const windowsClient = remote.windowsClient ?? '';
  const route = remoteRoute(side, source.kind, agentServesKey, remote.relay, windowsClient.length > 0);
  if (route.kind === 'refuse') {
    return refuseAndOfferTheFix(route.reasons, entity, remote, retry);
  }

  // The connection-manager half (audit D7/B10): which bastion to go through, and whether this
  // host is the one it claims to be. Resolved BEFORE anything is written to disk or a terminal
  // opened, so a refused host key costs nothing and leaves nothing behind.
  const resolved = await connectionOptions(accountId, entity, storage, storageDir);
  if (resolved === undefined) {
    return false;
  }

  // A pinned host key's known_hosts file is on THIS machine, so the distribution is asked where it
  // is. The pin survives — unlike a private key, `UserKnownHostsFile` has no mode requirement, and
  // /mnt/c cannot hold one anyway.
  // NOT on the Windows-client route, and that exception is the route in one line: nothing it hands
  // over is read by the distribution, so nothing it hands over may be translated. A `/mnt/c/…` path
  // is precisely what `ssh.exe` cannot open.
  const translated =
    route.kind === 'windowsClient' ? resolved : await withTranslatedKnownHosts(resolved, side, storageDir);
  if (translated === undefined) {
    return refuseAndOfferTheFix(['known-hosts-translation-failed'], entity, remote, retry);
  }
  // The client is a separate fact from the shell: `platform` below still says which shell parses
  // this line, and it is still the distribution's.
  const options: ConnectionOptions =
    route.kind === 'windowsClient' ? { ...translated, program: windowsClient } : translated;

  const platform = terminalPlatform(side, hostPlatform);
  if (platform === undefined) {
    // Unreachable: `remoteRoute` refuses every side whose shell cannot be named. Kept as a refusal
    // rather than a cast, so a future route that forgets says so instead of composing for a guess.
    forgetOurPin(options.knownHostsFile, storageDir);
    return refuseAndOfferTheFix(['not-wsl'], entity, remote, undefined);
  }

  let keyPath: string | undefined;
  let materialized: string | undefined;
  if (route.kind === 'agent') {
    // The WSL route: no `-i` and nothing on disk, with this ONE command pointed at the relay's
    // socket. A per-command prefix rather than the window's environment collection, which is a
    // single namespace for every terminal and so cannot serve a Windows shell and a WSL one at once.
    const prefix = envPrefix('SSH_AUTH_SOCK', route.socketPath);
    if (prefix.length === 0) {
      // Found by a code round, and it is the worst failure this file could have had. `envPrefix`
      // DROPS a value it cannot quote — right for its original caller, where the relay then falls
      // back to the PATH — but here the fallback is `ssh` with no agent and no `-i`, which does not
      // fail: it silently authenticates with whatever keys that shell already has. Refusing is the
      // only honest answer.
      // Late refusal, so the host-pin file `connectionOptions` wrote is ours to take back.
      forgetOurPin(options.knownHostsFile, storageDir);
      return refuseAndOfferTheFix(['relay-socket-unusable'], entity, remote, retry);
    }
    return openSshTerminal({ ...entity, sshKeyPath: undefined }, options, platform, prefix) !== undefined;
  }
  if (agentServesKey && source.kind === 'storedKey' && route.kind === 'compose') {
    // Deliberately nothing: the agent answers, and writing the key out would defeat the
    // feature exactly where a person can see it working.
    //
    // `route.kind === 'compose'` is what keeps that true rather than merely hopeful. The agent this
    // trusts is reached through the extension host's own environment, which a WSL shell does not
    // share — so on the Windows-client route the same `-i`-less line would authenticate with
    // whatever the WINDOWS agent happened to hold, and the whole point of naming this entity's key
    // would be gone. That route materialises instead, below.
    return openSshTerminal({ ...entity, sshKeyPath: undefined }, options, platform) !== undefined;
  }
  if (route.kind === 'windowsClient') {
    const caveat = windowsClientCaveat(entity);
    if (caveat.length > 0) {
      void vscode.window.showWarningMessage(caveat);
    }
  }
  if (source.kind === 'storedKey') {
    try {
      keyPath = materializePrivateKey(storageDir, source.keyEntityId, source.content);
      materialized = keyPath;
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Could not write the stored key to disk: ${describeError(error)}`,
      );
      return false;
    }
  } else if (source.kind === 'keyPath') {
    keyPath = source.path;
  }

  // No key anywhere, but a password stored: supply it through SSH_ASKPASS in a
  // dedicated terminal, so nobody retypes what the vault already knows. The password
  // rides the terminal's ENVIRONMENT — not a file, not the command line.
  if (source.kind === 'password') {
    // `platform` rather than `process.platform`, although the route refuses a password in every
    // remote window and so this can only be a local one today: reading the host's platform HERE is
    // the defect the whole change is about, and leaving one copy of it behind is how it comes back.
    const command = buildSshCommand(entity, platform, options);
    const target = describeSshTarget(entity);
    if (command === undefined || target === undefined) {
      void vscode.window.showWarningMessage(`"${entity.name}" has no host configured — cannot start SSH.`);
      return false;
    }
    const scriptPath = writeAskpassScriptFile(storageDir, platform);
    // A FRESH terminal every time: the env carries this entity's password, and reusing
    // one would run the new session with the previous entity's credentials.
    const name = `SSH: ${target}`;
    vscode.window.terminals.find((t) => t.name === name && t.exitStatus === undefined)?.dispose();
    const passTerminal = vscode.window.createTerminal({
      name,
      env: askpassEnv(scriptPath, source.password, platform),
    });
    passTerminal.show();
    // accept-new: with SSH_ASKPASS_REQUIRE=force even the host-key yes/no question would be
    // answered by the askpass program — with the password. A PINNED host needs no such
    // question, and must not have it softened, so the option is added only without a pin.
    const line =
      options.knownHostsFile === undefined
        ? command.replace(/^ssh /, 'ssh -o StrictHostKeyChecking=accept-new ')
        : command;
    passTerminal.sendText(line, true);
    return true;
  }

  const terminal = openSshTerminal({ ...entity, sshKeyPath: keyPath }, options, platform);
  // Wipe the decrypted key from disk as soon as the session ends.
  if (materialized !== undefined) {
    if (terminal === undefined) {
      forgetMaterializedKey(materialized);
    } else {
      const sub = vscode.window.onDidCloseTerminal((closed) => {
        if (closed === terminal) {
          forgetMaterializedKey(materialized as string);
          sub.dispose();
        }
      });
    }
  }
  return terminal !== undefined;
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
 * Say what is wrong, name both machines, and offer the one button that fixes the first thing.
 *
 * <p>Modal, because it replaces a command that would otherwise have been typed into a terminal and
 * failed there — a notification in the corner would be read after the person had already gone
 * looking for the missing file, which is exactly the wasted trip this message exists to prevent.</p>
 */
async function refuseAndOfferTheFix(
  reasons: readonly RefusalReason[],
  entity: EntityMetadata,
  remote: RemoteWindowDeps,
  /**
   * What to do after the remedy — or `undefined` when there is to be no retry.
   *
   * <p>`undefined` is how the budget is spent: the retry passes it, so a second refusal offers its
   * button and then stops rather than handing the person a modal they can ride round for ever. The
   * plan claimed "at most once" before a code round pointed out that nothing enforced it.</p>
   */
  retry: (() => Promise<boolean>) | undefined,
): Promise<boolean> {
  const action = await askAndPick(refusalFor(reasons, refusalContext(remote)));
  if (action === undefined) {
    return false;
  }
  if (action === 'copyWindowsCommand') {
    await copyTheWindowsCommand(entity, remote.hostPlatform ?? process.platform);
    return false;
  }
  return runRemedyAndRetry(action, remote, retry);
}

/** Show the modal and turn the label the person pressed back into the action it stands for. */
async function askAndPick(refusal: RemoteRefusal): Promise<RefusalAction | undefined> {
  const chosen = await vscode.window.showWarningMessage(
    refusal.message,
    { modal: true },
    ...refusal.buttons.map((button) => button.label),
  );
  return refusal.buttons.find((button) => button.label === chosen)?.action;
}

/**
 * ONE retry, never a loop: the remedy either made the connection possible or it did not, and a
 * second refusal is information rather than a failure to report. The retry itself passes
 * `undefined` for its own retry, which is what spends the budget.
 */
async function runRemedyAndRetry(
  action: RefusalAction,
  remote: RemoteWindowDeps,
  retry: (() => Promise<boolean>) | undefined,
): Promise<boolean> {
  if ((await remote.runRemedy?.(action)) === true && retry !== undefined) {
    return retry();
  }
  return false;
}

/** Which two machines the wording names, read off the window once. */
function refusalContext(remote: RemoteWindowDeps): RefusalContext {
  const side = remote.side;
  return {
    distro: side.kind === 'wsl' ? side.distro : '',
    remoteName: side.kind === 'other' ? side.remoteName : 'wsl',
    hostPlatform: remote.hostPlatform ?? process.platform,
  };
}

/**
 * The line to paste into a terminal on the machine that actually holds the key.
 *
 * <p>It is the BARE connection, and the message says so: the refusal happens before
 * `connectionOptions` has resolved a jump host or pinned a host key, so the copied line carries
 * neither. Pasting a command that silently dropped a bastion or a pin would be worse than one that
 * says it is minimal — a code round asked for the difference to be stated rather than discovered.</p>
 */
async function copyTheWindowsCommand(entity: EntityMetadata, hostPlatform: NodeJS.Platform): Promise<void> {
  const command = buildSshCommand(entity, hostPlatform);
  if (command === undefined) {
    return;
  }
  await vscode.env.clipboard.writeText(command);
  void vscode.window.showInformationMessage(
    `Copied, and it is the bare connection — any jump host or pinned host key this entry uses is ` +
      `NOT in it. Run it in a terminal on this computer: ${command}`,
  );
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
