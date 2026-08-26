import type { ChildProcess } from 'node:child_process';
import * as childProcess from 'node:child_process';

/**
 * Actually ending a child process — which is two problems, not one.
 *
 * <p><b>A polite signal is not a guarantee.</b> `SIGTERM` can be ignored; a process that ignores
 * it survives for as long as it likes. So the signal is escalated to `SIGKILL` after a grace
 * period. `sshExecRunner.ts` has always done this for its `ssh` children; this module is that
 * logic extracted so there is one copy of it.</p>
 *
 * <p><b>On Windows, a shell-spawned child is not the process you want to kill.</b>
 * `spawn(line, [], { shell: true })` starts `cmd.exe` (or PowerShell), which starts the real
 * program as a GRANDchild. `ChildProcess.kill()` ends the wrapper and leaves the program
 * running — with, in this extension's case, resolved secrets still in its environment and no
 * terminal left to notice. `taskkill /T` walks the tree; POSIX needs nothing extra here because
 * the shell is replaced by `exec` in the common case and the signal reaches the group.</p>
 *
 * <p>The argv is a pure decision so it is a unit test; running it is not.</p>
 */

/** How long a process gets to exit politely before it is killed outright. */
export const KILL_GRACE_MS = 2_000;

/**
 * The command that ends a whole process tree, or `undefined` when the platform needs no help.
 *
 * <p>Only for children spawned through a SHELL: a directly-spawned binary is its own process and
 * `kill()` reaches it. Asking `taskkill /T` to walk a one-process tree is harmless but pointless,
 * and the flag that says which case this is belongs at the call site that knows.</p>
 */
export function treeKillArgv(pid: number, platform: NodeJS.Platform): string[] | undefined {
  if (platform !== 'win32' || !Number.isInteger(pid) || pid <= 0) {
    return undefined;
  }
  return ['taskkill', '/pid', String(pid), '/T', '/F'];
}

export interface KillOptions {
  /** True when the child was spawned through a shell, so the real program is a grandchild. */
  tree: boolean;
  platform?: NodeJS.Platform;
}

/**
 * End `child`: the tree first where that is a separate step, then SIGTERM, then SIGKILL.
 *
 * <p>Every step is best-effort. A child that has already exited makes `kill` a no-op and
 * `taskkill` fail, and neither is a problem worth surfacing — the goal state is "not running",
 * which is already true.</p>
 */
function signal(child: ChildProcess, name: 'SIGTERM' | 'SIGKILL'): void {
  try {
    child.kill(name);
  } catch {
    // Already reaped, which is the state this was aiming for.
  }
}

/** The tree command for this child, when the platform and the spawn shape both call for one. */
function treeCommandFor(child: ChildProcess, options: KillOptions): string[] | undefined {
  if (!options.tree || child.pid === undefined) {
    return undefined;
  }
  return treeKillArgv(child.pid, options.platform ?? process.platform);
}

/** The tree step, where the platform has one. Best-effort: the signals are the fallback. */
function killTree(child: ChildProcess, options: KillOptions): void {
  const argv = treeCommandFor(child, options);
  if (argv === undefined) {
    return;
  }
  try {
    childProcess.execFileSync(argv[0], argv.slice(1), { stdio: 'ignore', timeout: 5_000 });
  } catch {
    // Already gone, or taskkill is unavailable.
  }
}

export function killChild(child: ChildProcess, options: KillOptions): void {
  killTree(child, options);
  signal(child, 'SIGTERM');
  const escalate = setTimeout(() => signal(child, 'SIGKILL'), KILL_GRACE_MS);
  // Never hold the extension host open for a process that is already on its way out.
  (escalate as unknown as { unref?: () => void }).unref?.();
}
