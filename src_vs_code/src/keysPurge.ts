/**
 * Which `keys/<name>/` subdirs belong to a process that is no longer alive — the crash
 * leftovers safe to sweep.
 *
 * <p>Materialized key material is written under a per-window `keys/<pid>/` directory so one
 * window's purge cannot delete another's in-use file. This decides what a purge may reclaim
 * from windows that crashed without cleaning up: only a numeric name whose pid is dead,
 * never a live window's directory, never a non-pid entry (a legacy flat file, a stray).</p>
 *
 * <p>Pure — the liveness check is injected — so the rule is a unit test rather than a
 * comment, and lives here rather than in `keyInstaller.ts` (which imports `vscode`).</p>
 */
// eslint-disable-next-line complexity
export function deadPidSubdirs(
  entries: readonly string[],
  isAlive: (pid: number) => boolean,
): string[] {
  const dead: string[] = [];
  for (const name of entries) {
    const pid = Number(name);
    if (Number.isInteger(pid) && pid > 0 && !isAlive(pid)) {
      dead.push(name);
    }
  }
  return dead;
}
