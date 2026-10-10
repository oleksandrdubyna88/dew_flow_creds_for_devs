import {
  ProbeAnswer,
  RecordedWslInstall,
  StaleVerdict,
  canJudge,
  staleVerdict,
  versionArgv,
} from './wslMcpInstall';

/**
 * WHEN the stale WSL install check runs, and against what — plan §5.8, E4.S2.
 *
 * <p>No `vscode` here, so the rules a person would notice if they broke are unit tests: activation
 * never wakes a stopped distribution, it asks each one at most once a day, it starts nothing at all
 * when no install is recorded, and *Not for this version* holds until the version changes. The
 * dialogs and the Update are `mcpInstallTarget.ts`; the verdict and the probe's argv are
 * `wslMcpInstall.ts`.</p>
 *
 * <p><b>What is recorded, and why it is all the check can know.</b> The extension copies a config
 * block; it never writes — or reads — the client's file (a client's per-user config also holds other
 * servers' env values; question consultation `85327e0e`). So the install records the block's two
 * paths per distribution at the moment the block reaches the clipboard, and the check replays exactly
 * those. An install the extension did not make is *not recorded*, never guessed at.</p>
 */

/** The `globalState` subset this needs — a `vscode.Memento` satisfies it structurally. */
export interface CheckStore {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

export interface WslCheckDeps {
  readonly state: CheckStore;
  /** `wsl -l --running -q`, bounded — the only call made before anything is known to be running. */
  runningDistros(): Promise<string[]>;
  /** The bounded `--version` probe. */
  probe(argv: readonly string[]): Promise<ProbeAnswer>;
  now(): number;
}

/** At activation, each distribution is asked at most this often. */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

const INSTALLS = 'wslMcpCheck.installs';
const LAST_CHECKED = 'wslMcpCheck.lastChecked';
const DISMISSED = 'wslMcpCheck.dismissed';

/** Remember the block just copied for `distro` — called by the install the moment it is on the clipboard. */
export async function rememberInstall(state: CheckStore, distro: string, install: RecordedWslInstall): Promise<void> {
  await state.update(INSTALLS, { ...installs(state), [distro]: install });
}

/** The block last copied for `distro`, or nothing when this extension never set one up there. */
export function recordedInstall(state: CheckStore, distro: string): RecordedWslInstall | undefined {
  // An OWN property only: a distribution named `constructor` or `toString` must not read `{}`'s
  // inherited member as an install (code round, finding 3).
  return ownValue(installs(state), distro);
}

function ownValue<T>(map: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

/** *Not for this version*: stay quiet about `distro` at activation while `expected` is what this window ships. */
export async function dismissForVersion(state: CheckStore, distro: string, expected: string): Promise<void> {
  await state.update(DISMISSED, { ...mapAt<string>(state, DISMISSED), [distro]: expected });
}

function installs(state: CheckStore): Readonly<Record<string, RecordedWslInstall>> {
  return mapAt<RecordedWslInstall>(state, INSTALLS);
}

function mapAt<T>(state: CheckStore, key: string): Readonly<Record<string, T>> {
  return state.get<Record<string, T>>(key) ?? {};
}

export type CheckResult =
  | { kind: 'not-recorded'; distro: string }
  | { kind: 'refused'; distro: string; install: RecordedWslInstall }
  | { kind: 'verdict'; distro: string; install: RecordedWslInstall; verdict: StaleVerdict };

/** Ask `distro`'s recorded install for its version — the explicit check, with no clock and no dismissal. */
export async function checkDistro(deps: WslCheckDeps, distro: string, expected: string): Promise<CheckResult> {
  const install = recordedInstall(deps.state, distro);
  if (install === undefined) {
    return { kind: 'not-recorded', distro };
  }
  const argv = versionArgv(distro, install);
  if (argv.length === 0) {
    return { kind: 'refused', distro, install };
  }
  return { kind: 'verdict', distro, install, verdict: staleVerdict(await deps.probe(argv), expected) };
}

/**
 * The activation check: recorded, RUNNING, due and not dismissed — and only an OLDER verdict is reported.
 *
 * <p>Nothing is spawned when no install is recorded or this window's own `creds-mcp` predates
 * `--version` — a machine that never set up WSL pays nothing for the feature. A timed-out probe is
 * silent here (it is no evidence), and stamps the clock like any other answer, so a hung distribution
 * is not asked again on every window reload.</p>
 */
export async function activationCheck(
  deps: WslCheckDeps,
  expected: string,
  report: (result: CheckResult & { kind: 'verdict' }) => Promise<void>,
): Promise<void> {
  for (const distro of await dueDistros(deps, expected)) {
    await stamp(deps, distro);
    const result = await checkDistro(deps, distro, expected);
    if (result.kind === 'verdict' && result.verdict.kind === 'older') {
      await report(result);
    }
  }
}

async function dueDistros(deps: WslCheckDeps, expected: string): Promise<string[]> {
  const recorded = Object.keys(installs(deps.state));
  if (recorded.length === 0 || !canJudge(expected)) {
    return [];
  }
  const running = new Set(await deps.runningDistros());
  const checked = mapAt<number>(deps.state, LAST_CHECKED);
  const dismissed = mapAt<string>(deps.state, DISMISSED);
  return recorded.filter(
    (distro) => running.has(distro) && isDue(ownValue(checked, distro), deps.now()) && ownValue(dismissed, distro) !== expected,
  );
}

/**
 * Due when never asked, a day or more ago — or "in the future", because a clock set back must not
 * silence the check until it catches up.
 */
export function isDue(lastMs: number | undefined, nowMs: number): boolean {
  if (lastMs === undefined) {
    return true;
  }
  const elapsed = nowMs - lastMs;
  return elapsed < 0 || elapsed >= CHECK_INTERVAL_MS;
}

async function stamp(deps: WslCheckDeps, distro: string): Promise<void> {
  await deps.state.update(LAST_CHECKED, { ...mapAt<number>(deps.state, LAST_CHECKED), [distro]: deps.now() });
}
