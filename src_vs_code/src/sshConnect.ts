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
import { connectionOptions } from './connectionOptions';
import { WindowSide, terminalPlatform } from './remoteWindow';
import { RefusalReason, RelayReadiness, remoteRoute } from './remoteRoute';
import { RefusalAction, refusalFor } from './remoteWindowMessage';
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
// eslint-disable-next-line complexity, max-lines-per-function
export async function connectEntity(
  accountId: string,
  entity: EntityMetadata,
  storage: StorageManager,
  storageDir: string,
  /**
   * True when the SSH agent already serves the key this entity would use. Then no `-i` and no
   * file: `ssh` finds the key through SSH_AUTH_SOCK, and the key never touches the disk for
   * the human path either. Optional so the agent-free callers are unchanged.
   */
  agentServesKey = false,
  remote: RemoteWindowDeps = LOCAL_WINDOW,
  /**
   * The retry budget, spent by the one recursive call this function makes.
   *
   * <p>A refusal's button runs a remedy and then tries again; the second attempt must NOT offer
   * another retry, or the pair becomes a ride a person can stay on indefinitely. A code round
   * pointed out that the plan claimed "at most once" while nothing enforced it.</p>
   */
  allowRetry = true,
): Promise<boolean> {
  const side = remote.side;
  // The retry re-READS the window: the remedy it follows exists to change the very state the first
  // attempt refused on.
  const retry = allowRetry
    ? (): Promise<boolean> =>
        connectEntity(
          accountId,
          entity,
          storage,
          storageDir,
          agentServesKey,
          remote.refresh?.() ?? remote,
          false,
        )
    : undefined;
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
  const route = remoteRoute(side, source.kind, agentServesKey, remote.relay);
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
  const options = await withTranslatedKnownHosts(resolved, side);
  if (options === undefined) {
    return refuseAndOfferTheFix(['known-hosts-translation-failed'], entity, remote, retry);
  }

  const platform = terminalPlatform(side, process.platform);
  if (platform === undefined) {
    // Unreachable: `remoteRoute` refuses every side whose shell cannot be named. Kept as a refusal
    // rather than a cast, so a future route that forgets says so instead of composing for a guess.
    forgetOurPin(options.knownHostsFile);
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
      forgetOurPin(options.knownHostsFile);
      return refuseAndOfferTheFix(['relay-socket-unusable'], entity, remote, retry);
    }
    return openSshTerminal({ ...entity, sshKeyPath: undefined }, options, platform, prefix) !== undefined;
  }
  if (agentServesKey && source.kind === 'storedKey') {
    // Deliberately nothing: the agent answers, and writing the key out would defeat the
    // feature exactly where a person can see it working.
    return openSshTerminal({ ...entity, sshKeyPath: undefined }, options, platform) !== undefined;
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
  options: Awaited<ReturnType<typeof connectionOptions>>,
  side: WindowSide,
): Promise<typeof options> {
  if (options === undefined || side.kind !== 'wsl' || options.knownHostsFile === undefined) {
    return options;
  }
  const inside = await translateWindowsPath(side.distro, options.knownHostsFile);
  if (inside.length === 0) {
    forgetOurPin(options.knownHostsFile);
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
  const side = remote.side;
  const refusal = refusalFor(reasons, {
    distro: side.kind === 'wsl' ? side.distro : '',
    remoteName: side.kind === 'other' ? side.remoteName : 'wsl',
    hostPlatform: process.platform,
  });
  const chosen = await vscode.window.showWarningMessage(
    refusal.message,
    { modal: true },
    ...refusal.buttons.map((button) => button.label),
  );
  const action = refusal.buttons.find((button) => button.label === chosen)?.action;
  if (action === undefined) {
    return false;
  }
  if (action === 'copyWindowsCommand') {
    await copyTheWindowsCommand(entity);
    return false;
  }
  // ONE retry, never a loop: the remedy either made the connection possible or it did not, and a
  // second refusal is information rather than a failure to report. The retry itself passes
  // `undefined`, which is what spends the budget.
  if ((await remote.runRemedy?.(action)) === true && retry !== undefined) {
    return retry();
  }
  return false;
}

/**
 * The line to paste into a terminal on the machine that actually holds the key.
 *
 * <p>It is the BARE connection, and the message says so: the refusal happens before
 * `connectionOptions` has resolved a jump host or pinned a host key, so the copied line carries
 * neither. Pasting a command that silently dropped a bastion or a pin would be worse than one that
 * says it is minimal — a code round asked for the difference to be stated rather than discovered.</p>
 */
async function copyTheWindowsCommand(entity: EntityMetadata): Promise<void> {
  const command = buildSshCommand(entity, process.platform);
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
function forgetOurPin(knownHostsFile: string | undefined): void {
  if (knownHostsFile === undefined || !knownHostsFile.includes('known_hosts-')) {
    return;
  }
  forgetMaterializedKey(knownHostsFile);
}
