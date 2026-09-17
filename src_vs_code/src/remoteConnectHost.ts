import * as vscode from 'vscode';
import { RelayReadiness } from './remoteRoute';
import { RefusalAction } from './remoteWindowMessage';
import { WindowSide, windowSide } from './remoteWindow';
import { WslRelayManager } from './wslRelayManager';
import { RemoteWindowDeps } from './sshConnect';

/**
 * The `vscode` reads behind the remote-window decision, kept in one thin place.
 *
 * <p>The same shape as `keyringWarningHost.ts`: everything that decides anything lives in
 * `remoteWindow`, `remoteRoute` and `remoteWindowMessage`, which import no `vscode` and are table
 * tested. This file only fetches — the window's remote name, its folder authorities, two settings
 * and the relay manager's current state — and runs the command a button asks for.</p>
 */

const SECTION = 'credSshManager';

/** Everything `connectEntity` needs to know about the window it was clicked in. */
export function remoteWindowDeps(
  relays: WslRelayManager,
  runRemedy: (action: RefusalAction) => Promise<boolean>,
): RemoteWindowDeps {
  const configured = configuredDistros();
  const serving = relays.serving();
  const side = windowSide(vscode.env.remoteName, folderAuthorities(), configured, serving);
  return { side, relay: readinessFor(side, relays, serving), runRemedy };
}

/**
 * Every workspace folder's authority.
 *
 * <p>All of them, not the first: folders spanning two distributions is a case the decision has to
 * be able to SEE in order to refuse it, and handing it one folder would hide that.</p>
 */
function folderAuthorities(): string[] {
  return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.authority);
}

function configuredDistros(): string[] {
  return vscode.workspace.getConfiguration(SECTION).get<string[]>('wslRelayDistros', []);
}

/**
 * What the relay is doing for THIS window's distribution.
 *
 * <p>`running` is matched case-insensitively although `socketPathFor` is an exact-key lookup: the
 * spelling has already been settled by `windowSide`, and comparing the two by `===` here would
 * reintroduce the `wsl+ubuntu` / `Ubuntu` mismatch one layer further down.</p>
 */
function readinessFor(
  side: WindowSide,
  relays: WslRelayManager,
  serving: readonly string[],
): RelayReadiness {
  if (side.kind !== 'wsl') {
    return { enabled: false, running: false, socket: '' };
  }
  return {
    enabled: vscode.workspace.getConfiguration(SECTION).get<boolean>('wslAgentRelay', false),
    running: serving.some((distro) => distro.toLowerCase() === side.distro.toLowerCase()),
    socket: relays.socketPathFor(side.distro),
  };
}

/**
 * Run what a refusal's button offers, and say whether connecting is worth trying again.
 *
 * <p>The retry is what makes *Set Up the Relay and Connect* true, and it happens exactly once — the
 * remedy either made the connection possible or it did not, and a second refusal is information
 * rather than a loop.</p>
 *
 * <p>*Open Remote Bridge…* answers `false` on purpose: it is a different route to the vault, not a
 * fix for this SSH connection, so retrying the connect after it would produce the same refusal.</p>
 */
export function remedyRunner(target: unknown): (action: RefusalAction) => Promise<boolean> {
  return async (action) => {
    if (action === 'setUpRelay' || action === 'chooseDistribution') {
      await vscode.commands.executeCommand(`${SECTION}.setUpWslRelay`);
      return true;
    }
    if (action === 'addKeyToAgent') {
      await vscode.commands.executeCommand(`${SECTION}.addKeyToAgent`, target);
      return true;
    }
    if (action === 'openRemoteBridge') {
      await vscode.commands.executeCommand(`${SECTION}.openRemoteBridge`, target);
      return false;
    }
    // `retry` is the whole remedy for a distribution that was merely asleep; `copyWindowsCommand`
    // never reaches here, because it is answered without running a command at all.
    return action === 'retry';
  };
}
