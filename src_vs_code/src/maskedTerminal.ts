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
 * <p>Input is forwarded to the child's stdin, so a prompt can still be answered by hand — except in argv mode with a script on
 * stdin (below).</p>
 *
 * <p><b>The argv mode of Run with Secrets over SSH (E3.S1).</b> The child is a program and its arguments, spawned with
 * `shell: false`, in a folder the caller names (never the workspace). A script goes to its stdin once and stdin is then closed, so
 * keystrokes are NOT forwarded. The run ends exactly once (`onEnded`: the child's end, a failed start, a close before the start, a
 * throw from `show()`), and its end destroys stdin, so a part of the script not yet taken by the child (it holds the values) is
 * dropped and never written later; `open()` after the end spawns nothing and writes nothing.</p>
 */

/** What every masked run has, shell or argv. */
interface MaskedRunBase {
  /** Terminal name, as it appears in the panel. */
  name: string;
  /**
   * Variables the child gets on top of the parent environment (the resolved secrets). In argv mode this carries NO resolved
   * value: the askpass variables of a password SSH entry and `SSH_AUTH_SOCK` only (E3-D8) — the values go in `stdinText`.
   */
  env: Record<string, string>;
  /**
   * Values to replace in everything the child prints. A `{ value, label }` pair makes the
   * placeholder name which secret stood there, which is worth doing when several are in play.
   */
  secrets: readonly (string | MaskEntry)[];
  /** One line written before the run, explaining what is masked. */
  banner: string;
  /**
   * Written to the child's stdin ONCE, right after the spawn, and stdin is then closed (the script of Run with Secrets over
   * SSH). Keystrokes are then NOT forwarded: stdin is the script, and it is closed.
   */
  stdinText?: string;
  /**
   * Called EXACTLY ONCE for a run whose terminal was made, when the run ends (E3-D7): the child's `close`, its `error`, a failed
   * start, the terminal closed before the child started, or a throw from `show()` — whichever comes first. A throw from
   * `createTerminal` is the caller's to clean: no terminal, no run.
   */
  onEnded?: () => void;
}

/** The shell variant: the command line runs through a shell (today's Run with Secrets on this machine). */
interface MaskedShellRun extends MaskedRunBase {
  /** The command line, run through a shell — the same text *Run in Terminal* would send. */
  commandLine: string;
  /** Working directory; the first workspace folder when omitted — the shell variant only. */
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
  argv?: undefined;
}

/**
 * The argv variant (Run with Secrets over SSH, E3.S1): the program and its arguments, spawned with `shell: false`. `cwd` is
 * REQUIRED, so argv mode never falls back to the workspace folder (E3-D5, round 2 B1).
 */
interface MaskedArgvRun extends MaskedRunBase {
  argv: readonly [string, ...string[]];
  cwd: string;
  commandLine?: undefined;
  shell?: undefined;
}

/** Exactly one of `commandLine` and `argv` is set, in the type. */
export type MaskedRunOptions = MaskedShellRun | MaskedArgvRun;

const CRLF = '\r\n';

/** Terminals need CRLF; a child writes LF and the line would stair-step without this. */
function forTerminal(text: string): string {
  return text.replace(/(?<!\r)\n/g, CRLF);
}

/** What one run holds: its options, its two emitters and its state (`over` once it has ended). */
interface Run {
  readonly options: MaskedRunOptions;
  readonly writer: vscode.EventEmitter<string>;
  readonly closer: vscode.EventEmitter<number>;
  child: childProcess.ChildProcessWithoutNullStreams | undefined;
  over: boolean;
  /** The run's ONE once-only end (E3-D7): the first call destroys stdin and calls `onEnded`; later calls do nothing. */
  readonly ended: () => void;
}

/**
 * Open the terminal and run. Returns it so a caller can dispose it; the child is killed when
 * the terminal closes, and the terminal reports the exit code rather than vanishing.
 *
 * <p>A throw from `createTerminal` is the caller's to clean (no terminal, no run). A throw from `show()` comes AFTER it, so VS Code
 * may still call `open()` later: the run is ended first (a later `open()` spawns nothing and writes nothing), the terminal is
 * disposed, and the error is rethrown.</p>
 */
export function runInMaskedTerminal(options: MaskedRunOptions): vscode.Terminal {
  const run = maskedRun(options);
  const terminal = vscode.window.createTerminal({ name: options.name, pty: run.pty });
  try {
    terminal.show();
  } catch (error) {
    run.ended();
    terminal.dispose();
    throw error;
  }
  return terminal;
}

function maskedRun(options: MaskedRunOptions): { pty: vscode.Pseudoterminal; ended: () => void } {
  const writer = new vscode.EventEmitter<string>();
  const closer = new vscode.EventEmitter<number>();
  const run: Run = {
    options,
    writer,
    closer,
    child: undefined,
    over: false,
    ended: (): void => {
      if (run.over) {
        return;
      }
      run.over = true;
      run.child?.stdin.destroy();
      options.onEnded?.();
    },
  };
  const pty: vscode.Pseudoterminal = {
    onDidWrite: writer.event,
    onDidClose: closer.event,
    open: () => openRun(run),
    close: () => closeRun(run),
    handleInput: (data) => inputRun(run, data),
  };
  return { pty, ended: run.ended };
}

function openRun(run: Run): void {
  if (run.over) {
    return; // closed before it started, or a `show()` that threw: nothing is spawned, nothing is written
  }
  run.writer.fire(forTerminal(`${run.options.banner}\n`));
  const started = spawnChild(run.options);
  if (!started.ok) {
    run.writer.fire(forTerminal(`\nCould not start: ${started.reason}\n`));
    run.closer.fire(1);
    run.ended();
    return;
  }
  run.child = started.child;
  listenToChild(run, started.child, new SecretMasker(run.options.secrets));
  if (run.options.stdinText !== undefined) {
    started.child.stdin.end(run.options.stdinText);
  }
}

function listenToChild(run: Run, child: childProcess.ChildProcessWithoutNullStreams, masker: SecretMasker): void {
  const emit = (chunk: Buffer): void => run.writer.fire(forTerminal(masker.push(chunk.toString('utf8'))));
  child.stdout.on('data', emit);
  child.stderr.on('data', emit);
  child.on('error', (error) => {
    run.writer.fire(forTerminal(`\n${describeError(error)}\n`));
    run.closer.fire(1);
    run.ended();
  });
  child.on('close', (code) => {
    // The held-back tail is released before the exit line, or the last characters of the
    // output would arrive after it — or not at all.
    run.writer.fire(forTerminal(masker.flush()));
    run.writer.fire(forTerminal(`\n[exit ${code ?? 'killed'}]\n`));
    run.closer.fire(code ?? 1);
    run.ended();
  });
}

function closeRun(run: Run): void {
  if (run.child === undefined) {
    run.ended(); // the terminal closed before the child started
    return;
  }
  // `tree: true` because the spawn may go through a SHELL: on Windows the child is cmd.exe
  // or PowerShell and the real program is a grandchild, so killing the child alone would
  // leave it running — with the resolved secrets still in its environment and no terminal
  // left to notice. Closing the panel has to mean the process is gone. In argv mode there is no
  // shell and the child IS the program (`ssh`); `tree: true` stays — on Windows it also ends a
  // jump host's helper `ssh`, on POSIX that helper is OpenSSH's to end (E3-D11, hand check 3).
  killChild(run.child, { tree: true });
}

function inputRun(run: Run, data: string): void {
  if (run.options.stdinText !== undefined) {
    return; // stdin is the script, and it is closed: no echo, no write
  }
  // Echo, because a pipe does not: without it typing into a prompt shows nothing.
  run.writer.fire(data === '\r' ? CRLF : data);
  writeToChild(run.child, data === '\r' ? '\n' : data);
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

/** What `spawnChild` starts: the program, its arguments, whether a shell parses it, and where. */
export interface Launch {
  readonly program: string;
  readonly args: readonly string[];
  readonly shell: string | boolean;
  readonly cwd: string | undefined;
}

/**
 * The one spawn of the masked run. Argv mode: the program and its arguments, `shell: false`, in the folder the caller named (never
 * the workspace, E3-D5). Shell variant (today): the command line through the shell the caller named, in the workspace folder when
 * no `cwd` was given.
 */
export function launchOf(options: MaskedRunOptions): Launch {
  if (options.argv !== undefined) {
    return { program: options.argv[0], args: options.argv.slice(1), shell: false, cwd: options.cwd };
  }
  return { program: options.commandLine, args: [], shell: shellOption(options.shell), cwd: workingDirectory(options.cwd) };
}

/** Start the child through the shell the caller named — the same one the rewrite used — or by argv. */
function spawnChild(options: MaskedRunOptions): SpawnResult {
  try {
    const launch = launchOf(options);
    const child = childProcess.spawn(launch.program, launch.args, {
      shell: launch.shell,
      cwd: launch.cwd,
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
