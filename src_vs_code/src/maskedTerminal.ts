import { describeError } from './describeError';
import * as childProcess from 'node:child_process';
import * as vscode from 'vscode';
import { SecretMasker } from './outputMask';
import { killChild } from './childKill';
import type { MaskEntry } from './secretMasker';

/**
 * A terminal whose output the extension owns, so a secret the child was given cannot appear in
 * it — the `op run` shape, done with the one VS Code API that makes it possible.
 *
 * <p>`vscode.window.createTerminal({ env })` hands the child straight to the terminal renderer:
 * the extension never sees a byte, which is why the script feature could only ever WARN that a
 * body prints its own variables. An `ExtensionTerminalOptions` pseudoterminal is the other way
 * round — we spawn the process, we own both streams, and what reaches the screen is whatever we
 * write. So every chunk goes through `SecretMasker` first.</p>
 *
 * <p><b>What this trades away, stated rather than discovered later.</b> A pseudoterminal has no
 * PTY behind it: the child sees a pipe, not a terminal. Programs that ask for a password
 * interactively, draw a progress bar, or colour their output by detecting a TTY will behave as
 * they do when piped. That is the price of seeing the output at all, and it is why *Run in
 * Terminal* stays exactly as it was — this is a second door, not a replacement.</p>
 *
 * <p>Input is forwarded to the child's stdin, so a prompt can still be answered by hand.</p>
 */

export interface MaskedRunOptions {
  /** Terminal name, as it appears in the panel. */
  name: string;
  /** The command line, run through a shell — the same text *Run in Terminal* would send. */
  commandLine: string;
  /** Variables the child gets on top of the parent environment (the resolved secrets). */
  env: Record<string, string>;
  /**
   * Values to replace in everything the child prints. A `{ value, label }` pair makes the
   * placeholder name which secret stood there, which is worth doing when several are in play.
   */
  secrets: readonly (string | MaskEntry)[];
  /** Working directory; the first workspace folder when omitted. */
  cwd?: string;
  /**
   * The shell to run the line through — `vscode.env.shell`, so the shell that EXECUTES the
   * command is the same one whose syntax the references were rewritten into.
   *
   * <p>Left unset, Node's `shell: true` uses `ComSpec` on Windows, which is cmd.exe: a command
   * a person wrote for PowerShell would then run in the wrong shell, and a `$env:NAME` read
   * would arrive as a literal string. Passing it explicitly is what keeps
   * `runPlan.shellRead()` and this spawn talking about the same shell.</p>
   */
  shell?: string;
  /** One line written before the run, explaining what is masked. */
  banner: string;
}

const CRLF = '\r\n';

/** Terminals need CRLF; a child writes LF and the line would stair-step without this. */
function forTerminal(text: string): string {
  return text.replace(/(?<!\r)\n/g, CRLF);
}

/**
 * Open the terminal and run. Returns it so a caller can dispose it; the child is killed when
 * the terminal closes, and the terminal reports the exit code rather than vanishing.
 */
export function runInMaskedTerminal(options: MaskedRunOptions): vscode.Terminal {
  const writer = new vscode.EventEmitter<string>();
  const closer = new vscode.EventEmitter<number>();
  let child: childProcess.ChildProcessWithoutNullStreams | undefined;

  const pty: vscode.Pseudoterminal = {
    onDidWrite: writer.event,
    onDidClose: closer.event,
    open(): void {
      writer.fire(forTerminal(`${options.banner}\n`));
      const masker = new SecretMasker(options.secrets);
      const started = spawnChild(options);
      if (!started.ok) {
        writer.fire(forTerminal(`\nCould not start: ${started.reason}\n`));
        closer.fire(1);
        return;
      }
      child = started.child;
      const emit = (chunk: Buffer): void => writer.fire(forTerminal(masker.push(chunk.toString('utf8'))));
      child.stdout.on('data', emit);
      child.stderr.on('data', emit);
      child.on('error', (error) => {
        writer.fire(forTerminal(`\n${describeError(error)}\n`));
        closer.fire(1);
      });
      child.on('close', (code) => {
        // The held-back tail is released before the exit line, or the last characters of the
        // output would arrive after it — or not at all.
        writer.fire(forTerminal(masker.flush()));
        writer.fire(forTerminal(`\n[exit ${code ?? 'killed'}]\n`));
        closer.fire(code ?? 1);
      });
    },
    close(): void {
      if (child === undefined) {
        return;
      }
      // `tree: true` because the spawn goes through a SHELL: on Windows the child is cmd.exe
      // or PowerShell and the real program is a grandchild, so killing the child alone would
      // leave it running — with the resolved secrets still in its environment and no terminal
      // left to notice. Closing the panel has to mean the process is gone.
      killChild(child, { tree: true });
    },
    handleInput(data: string): void {
      // Echo, because a pipe does not: without it typing into a prompt shows nothing.
      writer.fire(data === '\r' ? CRLF : data);
      writeToChild(child, data === '\r' ? '\n' : data);
    },
  };

  const terminal = vscode.window.createTerminal({ name: options.name, pty });
  terminal.show();
  return terminal;
}


/**
 * Forward a keystroke to the child, and never let a late one take the window down.
 *
 * <p>There is a real race: the child exits (its stdio ends) just as a key arrives, and
 * `write()` after a stream has ended emits `ERR_STREAM_WRITE_AFTER_END`. With nothing listening
 * on that stream's `error`, Node throws it — which in an extension host is not a dropped
 * keystroke but "Extension host terminated unexpectedly". The check and the listener in
 * `spawnChild` are both needed: the check for the ordinary case, the listener for the race the
 * check cannot win.</p>
 */
function acceptsInput(child: childProcess.ChildProcessWithoutNullStreams): boolean {
  return child.exitCode === null && !child.stdin.destroyed && child.stdin.writable;
}

function writeToChild(child: childProcess.ChildProcessWithoutNullStreams | undefined, data: string): void {
  if (child !== undefined && acceptsInput(child)) {
    child.stdin.write(data);
  }
}

type SpawnResult =
  | { ok: true; child: childProcess.ChildProcessWithoutNullStreams }
  | { ok: false; reason: string };

/** The shell to run through: the one the caller named, else Node's default for the platform. */
function shellOption(shell: string | undefined): string | true {
  return shell !== undefined && shell.length > 0 ? shell : true;
}

function workingDirectory(cwd: string | undefined): string | undefined {
  return cwd ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/** Start the child through the shell the caller named — the same one the rewrite used. */
function spawnChild(options: MaskedRunOptions): SpawnResult {
  try {
    const child = childProcess.spawn(options.commandLine, [], {
      shell: shellOption(options.shell),
      cwd: workingDirectory(options.cwd),
      env: { ...process.env, ...options.env },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as childProcess.ChildProcessWithoutNullStreams;
    // An EPIPE on stdin is the child having exited, not a fault worth throwing out of the
    // extension host. Without this listener Node treats it as unhandled — see `writeToChild`.
    child.stdin.on('error', () => undefined);
    return { ok: true, child };
  } catch (error) {
    return { ok: false, reason: describeError(error) };
  }
}
