import * as fs from 'node:fs';
import * as vscode from 'vscode';

import { binaryIn, recordedVersion } from './binaryInstaller';
import { CREDS_MCP, ridFor } from './credsInstall';
import { MCP_CLIENT_TARGETS, installedMessage, mcpServerBlock } from './mcpClientConfig';
import { parseDistros } from './wslRelay';
import { runWsl, runWslOutcome, runWslRaw, runningDistros } from './wslProcess';
import {
  CheckResult,
  CheckStore,
  WslCheckDeps,
  activationCheck,
  checkDistro,
  dismissForVersion,
  rememberInstall,
} from './wslMcpCheck';
import {
  RecordedWslInstall,
  canJudge,
  cannotJudgeMessage,
  currentInstallMessage,
  helpArgv,
  installArgv,
  installFailure,
  installedPathFrom,
  knowsTheBridge,
  notRecordedMessage,
  refusedPathMessage,
  staleBinaryWarning,
  staleInstallMessage,
  unansweredMessage,
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
export async function offerMcpClientConfig(windowsBinary: string, host: WslCheckHost): Promise<void> {
  const distro = await chooseAgentHome();
  if (distro === undefined) {
    return;
  }
  await (distro === WINDOWS ? offerForWindows(windowsBinary) : installIntoWsl(distro, windowsBinary, host));
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
async function installIntoWsl(distro: string, windowsBinary: string, host: WslCheckHost): Promise<void> {
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

  await handOver(distro, { linuxBinary, windowsBinary: translated }, host);
}

/**
 * The block on the clipboard, remembered, and the binary asked whether it is any good.
 *
 * <p>Remembered the moment it is on the clipboard (plan §5.8): those two paths are all the stale
 * check can ever know about this distribution, because the client's config is never read.</p>
 */
async function handOver(distro: string, install: RecordedWslInstall, host: WslCheckHost): Promise<void> {
  await vscode.env.clipboard.writeText(wslServerBlock(install.linuxBinary, install.windowsBinary));
  await rememberInstall(host.state, distro, install);

  // Asked of the binary itself, because the alternative failure is silent: a release published
  // before the bridge answers "no window answered" — word for word what a closed window says.
  if (!knowsTheBridge(await runWsl(helpArgv(distro, install.linuxBinary)))) {
    void vscode.window.showWarningMessage(staleBinaryWarning(distro, install.linuxBinary));
    return;
  }
  if (await staleAfterInstall(distro, host)) {
    return;
  }
  void vscode.window.showInformationMessage(
    wslInstalledMessage(distro, install.linuxBinary),
    ...MCP_CLIENT_TARGETS.map((target) => target.path),
  );
}

// ---------- a stale install says so (plan §5.8, E4.S2) ----------

/**
 * What the install and the check need of the window: its storage folder (where the Windows half lives)
 * and a state store — plain values, so registering the check needs nothing of the editor's API.
 */
export interface WslCheckHost {
  /** The extension's global storage folder — where the Windows half is installed. */
  readonly storageDir: string;
  readonly state: CheckStore;
}

/** How long the `--version` probe may take: the Windows half it asks is bounded at 3 s inside it. */
const VERSION_TIMEOUT_MS = 15_000;

/**
 * The command, and the once-a-day look at activation.
 *
 * <p>The activation look is fire-and-forget: it must never hold up activation, and it starts no
 * `wsl.exe` at all on a machine where no WSL install is recorded (`activationCheck`). It can never
 * fail activation either — a failure only means no reminder today, and it is written to the
 * diagnostic log rather than left as an unhandled rejection.</p>
 */
export function registerWslMcpCheck(
  register: (command: string, handler: (...args: unknown[]) => unknown) => void,
  host: WslCheckHost,
  warn: (message: string) => void,
): void {
  // One id: the panel's *Install…* submenu button and the palette entry run this one handler.
  register('credSshManager.checkWslMcpInstall', () => checkWslMcpInstall(host));
  if (process.platform === 'win32') {
    checkAtActivation(host).catch((error: unknown) => warn(`the daily WSL MCP install check failed: ${String(error)}`));
  }
}

function checkDeps(host: WslCheckHost): WslCheckDeps {
  return {
    state: host.state,
    runningDistros: () => runningDistros(),
    probe: (argv) => runWslOutcome(argv, VERSION_TIMEOUT_MS),
    now: () => Date.now(),
  };
}

async function checkAtActivation(host: WslCheckHost): Promise<void> {
  const expected = recordedVersion(host.state, CREDS_MCP);
  await activationCheck(checkDeps(host), expected, (result) => {
    // Not awaited: a notification nobody clicks must not hold up the next distribution.
    void offerStale(result, expected, host, true);
    return Promise.resolve();
  });
}

/** *Check the WSL MCP install* — a running distribution, its recorded install, the verdict, always shown. */
async function checkWslMcpInstall(host: WslCheckHost): Promise<void> {
  const expected = recordedVersion(host.state, CREDS_MCP);
  if (!canJudge(expected)) {
    await offerInstallFirst(cannotJudgeMessage(expected));
    return;
  }
  const distro = await pickRunningDistro();
  if (distro === undefined) {
    return;
  }
  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Asking the MCP server in ${distro} its version…` },
    () => checkDistro(checkDeps(host), distro, expected),
  );
  await showResult(result, expected, host);
}

/** Only RUNNING distributions are offered — the explicit check never starts a VM either. */
async function pickRunningDistro(): Promise<string | undefined> {
  const running = await runningDistros();
  if (running.length === 0) {
    void vscode.window.showInformationMessage(
      'No WSL distribution is running. Start the one your agent lives in, then check again — this ' +
        'check never starts one.',
    );
    return undefined;
  }
  return running.length === 1
    ? running[0]
    : vscode.window.showQuickPick(running, { title: 'Which distribution does the agent run in?' });
}

async function showResult(result: CheckResult, expected: string, host: WslCheckHost): Promise<void> {
  switch (result.kind) {
    case 'not-recorded':
      return offerUpdate(notRecordedMessage(result.distro), result.distro, host);
    case 'refused':
      return offerUpdate(refusedPathMessage(result.distro), result.distro, host);
    default:
      return showVerdict(result, expected, host);
  }
}

async function showVerdict(result: CheckResult & { kind: 'verdict' }, expected: string, host: WslCheckHost): Promise<void> {
  const { verdict, distro, install } = result;
  if (verdict.kind === 'unknown') {
    void vscode.window.showWarningMessage(unansweredMessage(distro));
    return;
  }
  if (verdict.kind === 'current') {
    void vscode.window.showInformationMessage(currentInstallMessage(distro, install.linuxBinary, verdict));
    return;
  }
  await offerStale(result, expected, host, true);
}

/**
 * Older: the person's three answers — **Update**, **Later**, **Not for this version**.
 *
 * <p>Straight after an install there is no Update to offer (`withUpdate` false): it would install the
 * same release again. What is left to say is that it is older, and the person can silence it.</p>
 */
async function offerStale(
  result: CheckResult & { kind: 'verdict' },
  expected: string,
  host: WslCheckHost,
  withUpdate: boolean,
): Promise<void> {
  if (result.verdict.kind !== 'older') {
    return;
  }
  const text = staleInstallMessage(result.distro, result.install.linuxBinary, expected, result.verdict);
  const choices = withUpdate ? ['Update', 'Later', 'Not for this version'] : ['Later', 'Not for this version'];
  await applyStaleChoice(await vscode.window.showWarningMessage(text, ...choices), result.distro, expected, host);
}

/** Later is nothing at all: the once-a-day clock asks again tomorrow. */
async function applyStaleChoice(
  picked: string | undefined,
  distro: string,
  expected: string,
  host: WslCheckHost,
): Promise<void> {
  if (picked === 'Update') {
    await updateWslInstall(distro, host);
  } else if (picked === 'Not for this version') {
    await dismissForVersion(host.state, distro, expected);
  }
}

async function offerUpdate(text: string, distro: string, host: WslCheckHost): Promise<void> {
  if ((await vscode.window.showWarningMessage(text, 'Update', 'Later')) === 'Update') {
    await updateWslInstall(distro, host);
  }
}

/** Update = the existing install into WSL, pointed at this window's Windows half — then its block on the clipboard. */
async function updateWslInstall(distro: string, host: WslCheckHost): Promise<void> {
  const rid = ridFor(process.platform, process.arch);
  const windowsBinary = rid === undefined ? '' : binaryIn(vscode.Uri.file(host.storageDir), CREDS_MCP, rid).fsPath;
  if (windowsBinary === '' || !fs.existsSync(windowsBinary)) {
    await offerInstallFirst('The MCP server is not installed on this machine, so there is no Windows half to point at.');
    return;
  }
  await installIntoWsl(distro, windowsBinary, host);
}

async function offerInstallFirst(text: string): Promise<void> {
  const install = 'Install the MCP Server…';
  if ((await vscode.window.showWarningMessage(text, install)) === install) {
    await vscode.commands.executeCommand('credSshManager.installMcpServer');
  }
}

/** After an install: older is said at once (without Update — it would install the same release again). */
async function staleAfterInstall(distro: string, host: WslCheckHost): Promise<boolean> {
  const expected = recordedVersion(host.state, CREDS_MCP);
  if (!canJudge(expected)) {
    return false;
  }
  const result = await checkDistro(checkDeps(host), distro, expected);
  if (result.kind !== 'verdict' || result.verdict.kind !== 'older') {
    return false;
  }
  void offerStale(result, expected, host, false);
  return true;
}
