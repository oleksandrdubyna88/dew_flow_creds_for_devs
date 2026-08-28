/* eslint-disable complexity, max-lines-per-function -- command registrations moved verbatim out of extension.ts
   (roadmap A1 stage 2, 2026-08-28): one function that registers a family of closures, each the size it
   was. The ceilings are a boundary for NEW code here; a handler meets them when it is next touched. */
import { RefSource } from '../secretRef';
import { StorageManager } from '../storageManager';
import { VaultKeys } from '../vaultKeys';
import { nodeAt } from '../entityViewerCommands';
import { asElement } from '../commandTargets';
import { buildCommandLine } from '../commandLine';
import * as vscode from 'vscode';
import { isCommandTrusted } from '../commandTrust';
import { confirmCommandMessage } from '../commandTrust';
import { trustCommand } from '../commandTrust';
import { scriptRunPlan } from '../scriptRun';
import { detectSecretPrints } from '../scriptRender';
import { resolveScriptEnv } from '../scriptRender';
import { safeFileComponent } from '../materializedKeys';
import { materializedKeyPath } from '../materializedKeys';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { lockToOwner } from '../materializedKeys';
import { planRefs } from '../runPlan';
import { resolveSecretRefs } from '../secretRef';
import { rewriteScriptRefs } from '../runPlan';
import { buildCommandLineWithRefs } from '../runPlan';
import { refField } from '../runPlan';
import { runInMaskedTerminal } from '../maskedTerminal';
import { maskingBanner } from '../extension';
export interface RunCommandsHost {
  readonly context: vscode.ExtensionContext;
  readonly refSource: RefSource;
  readonly register: (command: string, handler: (...args: unknown[]) => unknown) => void;
  readonly storage: StorageManager;
  readonly storageDir: string;
  readonly vaultKeys: VaultKeys;
}

export function registerRunCommands(host: RunCommandsHost): void {
  const { context, refSource, register, storage, storageDir, vaultKeys } = host;

  register('credSshManager.runCommand', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = await nodeAt(asElement(target), storage);
    if (element?.kind !== 'node') {
      return;
    }
    const d = element.node.details;
    const line = buildCommandLine(d?.command ?? '', d?.commandArgs);
    if (line.length === 0) {
      void vscode.window.showWarningMessage(
        `"${element.node.name}" has no command yet — edit it and fill in the command.`,
      );
      return;
    }
    // Read before it runs, once per exact line per machine. The justification for
    // running unconfirmed was "these are commands you wrote yourself" — true until
    // sync and Accept Share, both of which can deliver a command entry from
    // somewhere else, under a name the reader has no reason to distrust.
    if (!isCommandTrusted(context.globalState, element.node.id, line)) {
      const choice = await vscode.window.showWarningMessage(
        confirmCommandMessage(element.node.name, line),
        { modal: true },
        'Run',
      );
      if (choice !== 'Run') {
        return;
      }
      await trustCommand(context.globalState, element.node.id, line);
    }

    // A dedicated terminal per entry, reused: running the same command twice should not
    // leave two panels behind, and mixing it into whatever terminal happened to be open
    // loses the association between the entry and its output.
    const name = `CredsForDevs: ${element.node.name}`;
    const existing = vscode.window.terminals.find((t) => t.name === name);
    const terminal = existing ?? vscode.window.createTerminal({ name });
    terminal.show();
    // Runs it. The first version put the line on the prompt and left Enter to the user;
    // the operator asked for the button to do the whole job, which is theirs to decide —
    // these are commands they wrote and saved themselves, not something arriving from
    // elsewhere. `Copy Command` remains for the times you want to edit before running.
    terminal.sendText(line, true);
  });

  register('credSshManager.runScript', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = await nodeAt(asElement(target), storage);
    if (element?.kind !== 'node' || element.node.details === undefined) {
      return;
    }
    const details = element.node.details;
    if (details.script === undefined || details.script.trim().length === 0) {
      void vscode.window.showWarningMessage('This script is empty — open Edit and write it first.');
      return;
    }
    const plan = scriptRunPlan(details.scriptLanguage ?? 'other', process.platform);
    if (plan.kind === 'unsupported') {
      void vscode.window.showInformationMessage(plan.reason);
      return;
    }
    // Same content-trust gate the saved terminal commands have had since sync and
    // Accept Share made "you wrote this yourself" untrue. A script arriving from
    // elsewhere is one click from running; the fingerprint is of the exact body, so an
    // edit asks again and a re-run of the approved one does not.
    if (!isCommandTrusted(context.globalState, element.node.id, details.script)) {
      const approved = await vscode.window.showWarningMessage(
        confirmCommandMessage(element.node.name, details.script),
        { modal: true },
        'Run',
      );
      if (approved !== 'Run') {
        return;
      }
      await trustCommand(context.globalState, element.node.id, details.script);
    }

    // Values live in the environment now, but the script is the user's own code and can
    // print them itself. Notice, say so once per exact body, never block.
    const printed = detectSecretPrints(
      details.script,
      Object.keys(resolveScriptEnv(details.script, details.scriptVars, details.scriptLanguage ?? 'other').env),
      details.scriptLanguage ?? 'other',
    );
    if (printed.length > 0) {
      const key = `scriptPrint:${element.node.id}`;
      if (!isCommandTrusted(context.globalState, key, details.script)) {
        const go = await vscode.window.showWarningMessage(
          `This script prints ${printed.map((n) => '${' + n + '}').join(', ')} — the value will be visible in the terminal and its history. Run anyway?`,
          { modal: true },
          'Run',
        );
        if (go !== 'Run') {
          return;
        }
        await trustCommand(context.globalState, key, details.script);
      }
    }

    // The values go into the terminal's ENVIRONMENT; the file gets a body that reads
    // them by name. Before this, the substituted body — values and all — was written to
    // disk and left there until the next purge.
    const resolved = resolveScriptEnv(details.script, details.scriptVars, details.scriptLanguage ?? 'other');
    // The id is vault data — import and restore write an envelope's ids verbatim — so it is
    // sanitised before it becomes a path. See `safeFileComponent`.
    const fileName = `script-${safeFileComponent(details.id)}${plan.extension}`;
    const scriptPath = materializedKeyPath(storageDir, fileName);
    fs.mkdirSync(path.dirname(scriptPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      scriptPath,
      resolved.body.endsWith('\n') ? resolved.body : resolved.body + '\n',
      { mode: 0o700 },
    );
    lockToOwner(scriptPath);

    // A FRESH terminal every run: VS Code can only set a terminal's environment when it
    // is created, so a reused one would run this script with the PREVIOUS entry's values
    // — the same reasoning the SSH password path already follows.
    const name = `CredsForDevs: ${element.node.name}`;
    vscode.window.terminals.find((t) => t.name === name && t.exitStatus === undefined)?.dispose();
    const terminal = vscode.window.createTerminal({ name, env: resolved.env });
    terminal.show();
    terminal.sendText([plan.command, ...plan.args, `"${scriptPath}"`].join(' '), true);
  });

  /**
   * Run a stored command or script with `creds://` references resolved into the CHILD's
   * environment, and every resolved value masked in what the child prints.
   *
   * <p>The broker's `env` verb writes values into this window's terminal environment, where any
   * later shell can read them back with `printenv`. This is the stronger shape: the value exists
   * in one child process, for one run, and never reaches the screen.</p>
   */
  register('credSshManager.runWithSecrets', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = await nodeAt(asElement(target), storage);
    if (element?.kind !== 'node' || element.node.details === undefined) {
      return;
    }
    const details = element.node.details;
    const isScript = details.isScript === true;
    const rawBody = isScript
      ? (details.script ?? '')
      : buildCommandLine(details.command ?? '', details.commandArgs);
    if (rawBody.trim().length === 0) {
      void vscode.window.showWarningMessage(
        `"${element.node.name}" has nothing to run yet — open Edit and fill in the ${isScript ? 'script' : 'command'}.`,
      );
      return;
    }

    // The same content-trust gate the ordinary Run has: a body can arrive by sync or by an
    // accepted share, and resolving secrets into it makes reading it first matter more, not less.
    if (!isCommandTrusted(context.globalState, element.node.id, rawBody)) {
      const choice = await vscode.window.showWarningMessage(
        confirmCommandMessage(element.node.name, rawBody),
        { modal: true },
        'Run',
      );
      if (choice !== 'Run') {
        return;
      }
      await trustCommand(context.globalState, element.node.id, rawBody);
    }

    const scriptPlan = isScript
      ? scriptRunPlan(details.scriptLanguage ?? 'other', process.platform)
      : undefined;
    if (scriptPlan?.kind === 'unsupported') {
      void vscode.window.showInformationMessage(scriptPlan.reason);
      return;
    }

    // A script's own variables travel the way they always have; references are the addition.
    const scriptEnv = isScript
      ? resolveScriptEnv(details.script ?? '', details.scriptVars, details.scriptLanguage ?? 'other')
      : undefined;
    const searched = isScript
      ? [scriptEnv?.body ?? '', ...(details.scriptVars ?? []).map((v) => v.value)]
      : [details.command ?? '', ...(details.commandArgs ?? []).map((a) => a.value)];
    const plan = planRefs(searched);
    if (plan.refs.length === 0) {
      void vscode.window.showWarningMessage(
        `"${element.node.name}" holds no creds:// reference. Write one as a value — ` +
          'creds://<account email>/<entity>/<field> — then run this again. ' +
          `Nothing was run.`,
      );
      return;
    }

    const resolution = await resolveSecretRefs(plan.refs, refSource);
    if (!resolution.ok) {
      void vscode.window.showErrorMessage(`Nothing was run: ${resolution.error}`);
      return;
    }

    const env: Record<string, string> = { ...(scriptEnv?.env ?? {}) };
    for (const ref of plan.refs) {
      env[plan.names[ref]] = resolution.values[ref];
    }
    // Script variable VALUES are masked too: a body may print those as readily as a reference,
    // and the point of owning the output is that neither reaches the screen. Each carries the
    // NAME it is read by, so the placeholder says which secret stood there.
    const secrets = [
      ...plan.refs.map((ref) => ({ value: resolution.values[ref], label: plan.names[ref] })),
      ...Object.entries(scriptEnv?.env ?? {}).map(([label, value]) => ({ value, label })),
    ];

    let commandLine: string;
    if (isScript && scriptPlan?.kind === 'run') {
      const body = rewriteScriptRefs(scriptEnv?.body ?? '', plan, details.scriptLanguage ?? 'other');
      const scriptPath = materializedKeyPath(storageDir, `run-${details.id}${scriptPlan.extension}`);
      fs.mkdirSync(path.dirname(scriptPath), { recursive: true, mode: 0o700 });
      fs.writeFileSync(scriptPath, body.endsWith('\n') ? body : `${body}\n`, { mode: 0o700 });
      lockToOwner(scriptPath);
      commandLine = [scriptPlan.command, ...scriptPlan.args, `"${scriptPath}"`].join(' ');
    } else {
      commandLine = buildCommandLineWithRefs(
        details.command ?? '',
        details.commandArgs,
        plan,
        process.platform,
        vscode.env.shell,
      );
    }

    const described = plan.refs
      .map((ref) => `${plan.names[ref]} = ${refField(ref) ?? 'value'} of ${ref.replace(/^creds:\/\//, '')}`)
      .join('; ');
    runInMaskedTerminal({
      name: `CredsForDevs run: ${element.node.name}`,
      commandLine,
      env,
      secrets,
      // The same shell the rewrite above spelled its variable reads for.
      shell: vscode.env.shell,
      banner: `${described}\r\n${maskingBanner(secrets)}`,
    });
  });
}
