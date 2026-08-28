/* eslint-disable complexity, max-lines-per-function -- command registrations moved verbatim out of extension.ts
   (roadmap A1 stage 2, 2026-08-28): one function that registers a family of closures, each the size it
   was. The ceilings are a boundary for NEW code here; a handler meets them when it is next touched. */
import { SshAgentManager } from '../sshAgentManager';
import { WslRelayManager } from '../wslRelayManager';
import * as vscode from 'vscode';
import { parseDistros } from '../wslRelay';
import { runWslRaw } from '../wslProcess';
import { ReadinessCheck } from '../wslRelayReadiness';
import { failed } from '../wslRelayReadiness';
import { whatIsMissing } from '../wslRelayReadiness';
import { runWsl } from '../wslProcess';
import { itDidNotAnswer } from '../wslRelayReadiness';
import { itWorks } from '../wslRelayReadiness';
import { rcSnippet } from '../wslRelay';
import { rcAlreadyHasIt } from '../wslRelay';
export interface WslRelayCommandsHost {
  readonly register: (command: string, handler: (...args: unknown[]) => unknown) => void;
  readonly relaySettings: () => { enabled: boolean; command: string; distros: string[] };
  readonly sshAgent: SshAgentManager;
  readonly windowsCredsForWsl: () => string;
  readonly wslRelay: WslRelayManager;
}

export function registerWslRelayCommands(host: WslRelayCommandsHost): void {
  const { register, relaySettings, sshAgent, windowsCredsForWsl, wslRelay } = host;

  register('credSshManager.setUpWslRelay', async () => {
    if (process.platform !== 'win32') {
      void vscode.window.showInformationMessage(
        'The WSL relay is a Windows-only bridge — elsewhere ssh reaches the agent directly.',
      );
      return;
    }
    const chosen = await chooseDistros();
    if (chosen === undefined) {
      return;
    }
    const missing = await whatIsNotReady(chosen);
    if (missing.length > 0) {
      void vscode.window.showWarningMessage(missing, { modal: true });
      return;
    }
    const config = vscode.workspace.getConfiguration('credSshManager');
    await config.update('wslRelayDistros', chosen, vscode.ConfigurationTarget.Global);
    await config.update('wslAgentRelay', true, vscode.ConfigurationTarget.Global);

    const { command } = relaySettings();
    const started = wslRelay.start(command, chosen, windowsCredsForWsl());
    if (!started.ok) {
      void vscode.window.showErrorMessage(`CredsForDevs: ${started.reason}`);
      return;
    }
    for (const distro of chosen) {
      await setUpOneDistro(distro);
    }
  });

  /**
   * Which distributions to serve.
   *
   * <p>A socket lives inside one distribution's filesystem, so this is a real choice and not a
   * detail: a relay in one is invisible from the other. With a single distribution there is
   * nothing to ask about; with several, picking silently would be choosing for the person.</p>
   *
   * <p>Returns undefined when they cancelled — which is different from choosing none.</p>
   */
  async function chooseDistros(): Promise<string[] | undefined> {
    const found = parseDistros(await runWslRaw(['-l', '-q']));
    if (found.length === 0) {
      void vscode.window.showErrorMessage(
        'CredsForDevs: no WSL distributions found. `wsl -l -q` listed none.',
      );
      return undefined;
    }
    if (found.length === 1) {
      return [found[0]];
    }
    const already = new Set(relaySettings().distros);
    const picked = await vscode.window.showQuickPick(
      found.map((distro) => ({ label: distro, picked: already.has(distro) })),
      {
        canPickMany: true,
        title: `Found ${found.length} WSL distributions`,
        placeHolder: 'Which should reach the SSH agent? Pick one, several, or all.',
      },
    );
    return picked === undefined ? undefined : picked.map((item) => item.label);
  }

  /**
   * Everything that has to be true before a relay can work, checked before one is started.
   *
   * <p>All of them at once rather than the first failure: someone who has installed neither half
   * should hear that once, not discover the second after fixing the first.</p>
   */
  async function whatIsNotReady(distros: readonly string[]): Promise<string> {
    const windowsBinary = windowsCredsForWsl();
    for (const distro of distros) {
      const checks: ReadinessCheck[] = [
        {
          label: 'the Windows half (`creds.exe`) is installed',
          ok: windowsBinary.length > 0,
          fix: 'run "Install `creds` (terminal CLI)" from the Install... menu',
        },
        {
          label: '`creds` is installed inside the distribution',
          ok: await credsIsInside(distro),
          fix: 'use "Copy install command for another machine..." and run it there',
        },
        {
          label: 'a key is loaded into the SSH agent',
          ok: sshAgent.socketPath !== undefined,
          fix: 'right-click a key under "ssh keys" and choose "Add to SSH Agent"',
        },
      ];
      if (failed(checks).length > 0) {
        return whatIsMissing(distro, checks);
      }
    }
    return '';
  }

  /** Whether the chosen command resolves inside that distribution. */
  async function credsIsInside(distro: string): Promise<boolean> {
    const { command } = relaySettings();
    const distroArgv = distro.length > 0 ? ['-d', distro] : [];
    const found = await runWsl([
      ...distroArgv,
      '-e',
      'bash',
      '-lc',
      `command -v ${command} >/dev/null 2>&1 && echo yes`,
    ]);
    return found.includes('yes');
  }

  /**
   * Ask the agent, through the relay, whether it answers — and say so either way.
   *
   * <p>The half people asked for. A setup that ends in silence is one you have to go and test
   * yourself, which is what the setup was for.</p>
   */
  async function verifyThroughRelay(distro: string, socketPath: string): Promise<void> {
    const distroArgv = distro.length > 0 ? ['-d', distro] : [];
    const listed = await runWsl([
      ...distroArgv,
      '-e',
      'bash',
      '-lc',
      `SSH_AUTH_SOCK=${socketPath} ssh-add -l 2>&1`,
    ]);
    const fingerprint = /SHA256:[A-Za-z0-9+/=]+/.exec(listed)?.[0];
    if (fingerprint === undefined) {
      void vscode.window.showWarningMessage(`CredsForDevs: ${itDidNotAnswer(distro, listed)}`);
      return;
    }
    void vscode.window.showInformationMessage(
      `CredsForDevs: ${itWorks(distro, socketPath, fingerprint)}`,
    );
  }

  /** Wait for one distribution's relay to name its socket, then offer the export line. */
  async function setUpOneDistro(distro: string): Promise<void> {
    const socketPath = await waitForRelaySocket(distro);
    if (socketPath.length === 0) {
      void vscode.window.showErrorMessage(
        `CredsForDevs: the relay in ${distro || 'the default distribution'} reported no socket. ` +
          'Check that `creds` is installed there, and see the "CredsForDevs: Diagnostics" channel.',
      );
      return;
    }
    await offerTheExportLine(socketPath, distro);
    await verifyThroughRelay(distro, socketPath);
  }

  /** The relay names its socket on its first line of output; give it a moment to say so. */
  async function waitForRelaySocket(distro: string): Promise<string> {
    for (let attempt = 0; attempt < 20 && wslRelay.socketPathFor(distro).length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return wslRelay.socketPathFor(distro);
  }

  async function offerTheExportLine(socketPath: string, distro: string): Promise<void> {
    const snippet = rcSnippet(socketPath);
    const choice = await vscode.window.showInformationMessage(
      `${distro || 'The default distribution'}: the relay is listening on ${socketPath}. ` +
        'Add this to that shell so ssh and git there find it?',
      { modal: true, detail: snippet.trim() },
      'Add to ~/.bashrc',
      'Copy the line',
    );
    if (choice === 'Copy the line') {
      await vscode.env.clipboard.writeText(snippet.trim());
      return;
    }
    if (choice === 'Add to ~/.bashrc') {
      await appendToBashrc(snippet, distro);
    }
  }

  /**
   * Append the block, unless it is already there.
   *
   * <p>The text goes in on the child's STDIN and is never spliced into the command, so nothing
   * about the path or the marker can be read as shell syntax. Idempotent by the marker rather
   * than the path: someone who moved the socket has our line with a path we would not match, and
   * a second export would quietly fight their choice.</p>
   */
  async function appendToBashrc(snippet: string, distro: string): Promise<void> {
    const distroArgv = distro.length > 0 ? ['-d', distro] : [];
    const existing = await runWsl([...distroArgv, '-e', 'bash', '-lc', 'cat "$HOME/.bashrc" 2>/dev/null']);
    if (rcAlreadyHasIt(existing)) {
      void vscode.window.showInformationMessage('CredsForDevs: your ~/.bashrc already points at the relay.');
      return;
    }
    await runWsl([...distroArgv, '-e', 'bash', '-lc', 'cat >> "$HOME/.bashrc"'], snippet);
    void vscode.window.showInformationMessage(
      'CredsForDevs: added to ~/.bashrc. Open a NEW WSL terminal, then `ssh-add -l` should list your key.',
    );
  }
}
