import { spawn } from 'node:child_process';
import { isSafeShellWord, relayArgv, socketFromBusyLine, socketFromExportLine } from './wslRelay';

/**
 * The `creds relay` processes this window is holding open inside WSL — one per distribution.
 *
 * <p>Same shape and the same reason as `sshBridgeManager.ts`: something has to own long-lived
 * children, and the spawner is injected so the lifetime rules are a unit test rather than
 * something you discover by leaving a window open overnight.</p>
 *
 * <p><b>One per distribution, not one in total.</b> The socket lives inside a distribution's own
 * filesystem, so a relay in `Ubuntu` is invisible from `Ubuntu-26.04` — two distributions need two
 * relays, and there is nothing to share between them. The first version held a single child and
 * quietly served whichever distribution WSL called default, which is a choice made for the person
 * rather than by them.</p>
 *
 * <p><b>A relay must not outlive the agent it reaches.</b> A socket inside a distribution is an
 * opening onto a key held in this window; leaving one behind after the key is unloaded would mean
 * a path in WSL that answers for nothing, or worse, answers for whatever window announced itself
 * next. So they start when the agent starts, and die when it stops or the window does.</p>
 *
 * <p><b>Restarts are bounded, per distribution.</b> The common failure is `creds` not being
 * installed in that one, and an unbounded respawn would be a login shell started every few
 * milliseconds for the rest of the session. Three quick failures and that distribution is left
 * alone, having said why — the others carry on.</p>
 */

/** A running `wsl.exe`, as much of it as this needs. */
export interface RelayProcess {
  kill(): void;
  /** Resolves when the process ends, with its exit code when there was one. */
  readonly exited: Promise<number | null>;
  /**
   * Called for each line the relay writes, on EITHER stream.
   *
   * <p>Its first stdout line names the socket it opened. Its refusal to take a socket somebody else
   * already serves goes to stderr and names that one — both are answers to "where is it", which is
   * why stderr is read here and not only logged.</p>
   */
  onLine(handler: (line: string) => void): void;
}

export type RelaySpawner = (args: readonly string[]) => RelayProcess;

/** A quick exit means it never got going — see the restart note above. */
export const QUICK_FAILURE_MS = 5_000;
export const MAX_QUICK_FAILURES = 3;

/** The distribution WSL calls default, as a key. Empty because that is what `relayArgv` takes. */
export const DEFAULT_DISTRO = '';

export interface RelayStartRefusal {
  readonly ok: false;
  readonly reason: string;
}

/** One distribution's relay and what we know about it. */
interface Relay {
  child: RelayProcess;
  socket: string;
  startedAt: number;
  /**
   * True when this socket belongs to a relay somebody else already had running.
   *
   * <p>Our child refused to start and named the path; we use it and must NOT restart the child,
   * count the refusal as a failure, or kill what is serving it.</p>
   */
  adopted: boolean;
}

export class WslRelayManager {
  private readonly open = new Map<string, Relay>();

  /**
   * Consecutive quick failures per distribution.
   *
   * <p>Kept beside `open` rather than inside it because it has to OUTLIVE the entry: the count
   * is what a restart decision reads, and the entry is gone by then.</p>
   */
  private readonly failures = new Map<string, number>();

  /** What the caller asked for, so a relay that dies on its own can be brought back. */
  private wanted: { command: string; distros: readonly string[]; windowsBinary: string } | undefined;

  constructor(
    private readonly spawn: RelaySpawner,
    private readonly log: (message: string) => void,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Where each relay said it is listening, once it has said so. */
  socketPathFor(distro: string): string {
    return this.open.get(distro)?.socket ?? '';
  }

  /** The distributions currently being served. */
  serving(): string[] {
    return [...this.open.keys()];
  }

  get running(): boolean {
    return this.open.size > 0;
  }

  /**
   * Serve exactly these distributions, replacing whatever was running.
   *
   * <p>Replacing rather than merging: the caller has just chosen, and a distribution they left out
   * of that choice should stop being served rather than linger because it was picked last time.</p>
   */
  start(command: string, distros: readonly string[], windowsBinary = ''): { ok: true } | RelayStartRefusal {
    const refusal = refuse(command, distros);
    if (refusal !== undefined) {
      return { ok: false, reason: refusal };
    }
    this.stop();
    this.failures.clear();
    this.wanted = { command, distros: [...distros], windowsBinary };
    distros.forEach((distro) => this.launch(distro));
    return { ok: true };
  }

  stop(): void {
    this.wanted = undefined;
    const running = [...this.open.values()];
    this.open.clear();
    running.forEach((relay) => relay.child.kill());
  }

  dispose(): void {
    this.stop();
  }

  private launch(distro: string): void {
    const wanted = this.wanted;
    if (wanted === undefined) {
      return;
    }
    const child = this.spawn(relayArgv(wanted.command, distro, wanted.windowsBinary));
    this.open.set(distro, { child, socket: '', startedAt: this.now(), adopted: false });
    child.onLine((line) => this.readSocket(distro, child, line));
    void child.exited.then((code) => this.onExit(distro, child, code));
  }

  private readSocket(distro: string, child: RelayProcess, line: string): void {
    const relay = this.open.get(distro);
    if (relay?.child !== child) {
      return;
    }
    const ours = socketFromExportLine(line);
    if (ours.length > 0) {
      relay.socket = ours;
      this.log(`wsl relay for ${name(distro)} listening on ${ours}`);
      return;
    }
    // Somebody else's relay is already serving that path. That is the state we wanted, reached by
    // another route — so it is adopted rather than reported as "no socket", which is what this
    // said before and which sent a person to check an installation that was fine.
    const theirs = socketFromBusyLine(line);
    if (theirs.length > 0) {
      relay.socket = theirs;
      relay.adopted = true;
      this.log(`wsl relay for ${name(distro)}: using the one already serving ${theirs}`);
    }
  }

  /**
   * Only the child we are still holding for that distribution may change anything.
   *
   * <p>A relay killed by `stop()` resolves its `exited` afterwards, and without this check that
   * late resolution would restart one the caller had just turned off — the same guard the bridge
   * manager needs for the same reason.</p>
   */
  private onExit(distro: string, child: RelayProcess, code: number | null): void {
    const relay = this.open.get(distro);
    if (relay?.child !== child) {
      return;
    }
    if (relay.adopted) {
      // Our child exited because it refused to hijack a live socket. The entry STAYS, so
      // `socketPathFor` and `serving()` keep answering with the relay that is actually there;
      // restarting would only collide again, and counting it as a failure would burn the budget
      // three times and then declare a working relay broken.
      return;
    }
    this.open.delete(distro);
    this.failures.set(distro, nextFailureCount(this.failures.get(distro), this.now() - relay.startedAt));
    this.log(`wsl relay for ${name(distro)} ended (${describeExit(code)})`);
    this.restartOrGiveUp(distro);
  }

  /** True while the caller still asks for this distribution — a `stop()` clears that. */
  private stillWanted(distro: string): boolean {
    return this.wanted !== undefined && this.wanted.distros.includes(distro);
  }

  private restartOrGiveUp(distro: string): void {
    if (!this.stillWanted(distro)) {
      return;
    }
    if ((this.failures.get(distro) ?? 0) >= MAX_QUICK_FAILURES) {
      this.log(
        `wsl relay for ${name(distro)} failed ${MAX_QUICK_FAILURES} times in a row — not ` +
          'restarting it again. Check that `creds` is installed inside that distribution.',
      );
      return;
    }
    this.launch(distro);
  }
}

/** A run shorter than the threshold never got going; anything longer resets the count. */
function nextFailureCount(previous: number | undefined, ranFor: number): number {
  return ranFor < QUICK_FAILURE_MS ? (previous ?? 0) + 1 : 0;
}

/** An exit code, or the fact that there was not one. */
function describeExit(code: number | null): string {
  return code === null ? 'no exit code — killed or never started' : `exit ${code}`;
}

/** What to call a distribution in a log line when the caller named none. */
function name(distro: string): string {
  return distro.length > 0 ? distro : 'the default distribution';
}

/** The reason this may not start, or undefined when it may. */
function refuse(command: string, distros: readonly string[]): string | undefined {
  if (!isSafeShellWord(command)) {
    return `"${command}" is not a plain command name — refusing to build a shell line out of it.`;
  }
  const bad = distros.find((distro) => distro.length > 0 && !isSafeShellWord(distro));
  return bad === undefined ? undefined : `"${bad}" is not a plain distribution name.`;
}

/**
 * The real thing: one `wsl.exe`, its stdout read a line at a time.
 *
 * <p>stdin is ignored and stderr is forwarded to the log rather than parsed — the relay writes
 * its diagnostics there and the one line we act on to stdout, which is what makes the split
 * useful rather than decorative.</p>
 */
export function spawnWslRelay(args: readonly string[], onStderr: (text: string) => void): RelayProcess {
  const child = spawn('wsl.exe', [...args], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let pending = '';
  const handlers: ((line: string) => void)[] = [];
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? '';
    lines.forEach((line) => handlers.forEach((handler) => handler(line)));
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    onStderr(chunk.trimEnd());
    // ALSO to the line handlers. The relay announces where it is listening on stdout, but it
    // refuses a socket somebody else is already serving on STDERR — and that refusal names the
    // path, which is the one thing the manager needs to adopt it instead of declaring a working
    // relay broken. Both streams carry lines about the same thing; only one was being read.
    chunk.split(/\r?\n/).forEach((line) => {
      if (line.trim().length > 0) {
        handlers.forEach((handler) => handler(line));
      }
    });
  });
  return {
    kill: () => child.kill(),
    exited: new Promise((resolve) => {
      child.on('exit', (code) => resolve(code));
      // A wsl.exe that cannot be started never emits 'exit'; without this the manager would wait
      // for a child that does not exist and never count the failure.
      child.on('error', () => resolve(null));
    }),
    onLine: (handler) => handlers.push(handler),
  };
}
