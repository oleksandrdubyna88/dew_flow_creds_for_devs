import * as vscode from 'vscode';

import { MCP_CLIENT_TARGETS, installedMessage, mcpServerBlock } from './mcpClientConfig';
import { parseDistros } from './wslRelay';
import { runWsl, runWslRaw } from './wslProcess';
import {
  helpArgv,
  installArgv,
  installFailure,
  installedPathFrom,
  knowsTheBridge,
  staleBinaryWarning,
  wslInstalledMessage,
  wslPathArgv,
  wslServerBlock,
} from './wslMcpInstall';

/**
 * After the Windows binary is in place: where does the agent that will start it actually run?
 *
 * <p><b>Why this question exists at all.</b> The install button had one answer for a machine with
 * two places an MCP client can live. On Windows it was right; inside WSL it handed over a config
 * naming a `.exe` a Linux shell cannot start, and the failure arrives later, in another program,
 * as "server exited". Asking costs one pick and removes the whole class.</p>
 *
 * <p><b>It is asked only when there is a choice.</b> No WSL, or no distribution worth offering,
 * and the Windows answer is the only one — so it is taken silently, exactly as before.</p>
 *
 * <p>The config is still OFFERED, never written. That file belongs to another program, a person
 * may have several clients, and a credential manager silently editing the file that grants an
 * agent access to itself is the wrong instinct in the wrong place.</p>
 */
export async function offerMcpClientConfig(windowsBinary: string): Promise<void> {
  const distro = await chooseAgentHome();
  if (distro === undefined) {
    return;
  }
  await (distro === WINDOWS ? offerForWindows(windowsBinary) : installIntoWsl(distro, windowsBinary));
}

/** The sentinel for "the agent runs here", told apart from a distribution named anything. */
const WINDOWS = Symbol('windows');
type AgentHome = string | typeof WINDOWS;

async function chooseAgentHome(): Promise<AgentHome | undefined> {
  const distros = process.platform === 'win32' ? parseDistros(await runWslRaw(['-l', '-q'])) : [];
  if (distros.length === 0) {
    return WINDOWS;
  }
  const picked = await vscode.window.showQuickPick(
    [
      {
        label: 'This machine (Windows)',
        description: 'the agent runs in a Windows terminal or app',
        home: WINDOWS as AgentHome,
      },
      ...distros.map((name) => ({
        label: `Inside WSL — ${name}`,
        description: 'installs the Linux half there and points it back at this window',
        home: name as AgentHome,
      })),
    ],
    {
      title: 'Where does the agent run?',
      placeHolder: 'A client inside WSL cannot start a Windows executable — it needs its own half.',
    },
  );
  return picked?.home;
}

async function offerForWindows(windowsBinary: string): Promise<void> {
  await vscode.env.clipboard.writeText(mcpServerBlock(windowsBinary));
  void vscode.window.showInformationMessage(
    installedMessage(windowsBinary),
    ...MCP_CLIENT_TARGETS.map((target) => target.path),
  );
}

/**
 * The Linux half, into the distribution, pointed at the Windows one.
 *
 * <p>The same published one-liner the *Copy install command…* item hands out — it resolves the
 * newest release itself and refuses a download whose checksum does not match, and having the
 * button run a DIFFERENT installer than the one we tell people to paste would be two things to
 * keep correct.</p>
 */
async function installIntoWsl(distro: string, windowsBinary: string): Promise<void> {
  const output = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Installing the MCP server in ${distro}…` },
    () => runWsl(installArgv(distro)),
  );
  const linuxBinary = installedPathFrom(output);
  if (linuxBinary === '') {
    void vscode.window.showErrorMessage(installFailure(distro, output));
    return;
  }

  // Asked, not composed: `/mnt/c/...` is the default automount root and not a rule.
  const translated = (await runWsl(wslPathArgv(distro, windowsBinary))).trim();
  if (translated === '') {
    void vscode.window.showErrorMessage(
      `Installed ${linuxBinary} in ${distro}, but ${distro} could not translate the Windows path ` +
        `${windowsBinary}. Point the server at it by hand with CREDS_MCP_WINDOWS_BINARY.`,
    );
    return;
  }

  await vscode.env.clipboard.writeText(wslServerBlock(linuxBinary, translated));

  // Asked of the binary itself, because the alternative failure is silent: a release published
  // before the bridge answers "no window answered" — word for word what a closed window says.
  if (!knowsTheBridge(await runWsl(helpArgv(distro, linuxBinary)))) {
    void vscode.window.showWarningMessage(staleBinaryWarning(distro, linuxBinary));
    return;
  }

  void vscode.window.showInformationMessage(
    wslInstalledMessage(distro, linuxBinary),
    ...MCP_CLIENT_TARGETS.map((target) => target.path),
  );
}
