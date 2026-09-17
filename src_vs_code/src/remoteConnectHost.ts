import * as vscode from 'vscode';
import { RelayReadiness } from './remoteRoute';
import { RefusalAction } from './remoteWindowMessage';
import { WindowSide, windowSide } from './remoteWindow';
import { WslRelayManager } from './wslRelayManager';
import { RemoteWindowDeps } from './sshConnect';
import { wslWindowsSshClient } from './sshProgram';

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
  return {
    side,
    relay: readinessFor(side, relays, serving),
    // Read once per click, and it is one `existsSync` on this machine. Not gated on `side`: a local
    // window ignores it, and gating it here would put the same condition in two files.
    windowsClient: wslWindowsSshClient(),
    // Read HERE and nowhere below. This module is the one place that touches the environment, so
    // everything downstream is decided from a value it was handed.
    hostPlatform: process.platform,
    runRemedy,
    // Read again after a remedy has run, because the remedy exists to change exactly this. Without
    // it the retry re-uses a readiness captured BEFORE the relay was switched on and refuses for
    // the reason that was just fixed — which made "Set Up the Relay and Connect" a false promise.
    refresh: (): RemoteWindowDeps => remoteWindowDeps(relays, runRemedy),
  };
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
    adopted: relays.isAdopted(side.distro),
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
    if (RELAY_SETUP.includes(action)) {
      // ANSWERED, not assumed — the same lesson as *Add Key to Agent* one button along. That command
      // returns early on a cancelled picker, a distribution that is not ready and a relay that would
      // not start; reading `true` regardless meant cancelling the picker still produced a retry and
      // a second identical refusal. Raised by a review.
      return (await vscode.commands.executeCommand(`${SECTION}.setUpWslRelay`)) === true;
    }
    return action === 'addKeyToAgent' ? addKeyToAgent(target) : otherRemedy(action, target);
  };
}

/** Both are answered by the setup walkthrough: it is where a distribution is chosen. */
const RELAY_SETUP: readonly RefusalAction[] = ['setUpRelay', 'chooseDistribution'];

async function otherRemedy(action: RefusalAction, target: unknown): Promise<boolean> {
  if (action === 'openRemoteBridge') {
    await vscode.commands.executeCommand(`${SECTION}.openRemoteBridge`, target);
    return false;
  }
  // `retry` is the whole remedy for a distribution that was merely asleep; `copyWindowsCommand`
  // never reaches here, because it is answered without running a command at all.
  return action === 'retry';
}

/**
 * Load this entity's key into the agent, and say whether connecting is now worth retrying.
 *
 * <p>That command acts on a TREE ROW. The broker's terminal action has an entity and no row, so it
 * passes no target — and running the command with `undefined` would open a picker nobody asked for,
 * or do nothing while we reported a fix. Say plainly that we could not, and do not retry.</p>
 *
 * <p><b>ANSWERED, not assumed.</b> The command can fail — a key entry that has gone, a key in a
 * format the agent cannot read — and reporting success regardless is what put a second identical
 * dialog on screen the instant the first was dismissed: the retry fired, refused for the same
 * reason, and said so again. It returns a boolean for exactly this caller.</p>
 */
async function addKeyToAgent(target: unknown): Promise<boolean> {
  if (target === undefined) {
    void vscode.window.showInformationMessage(
      'Add this key to the SSH agent from its row in the CredsForDevs view, then connect again.',
    );
    return false;
  }
  return (await vscode.commands.executeCommand(`${SECTION}.addKeyToAgent`, target)) === true;
}
