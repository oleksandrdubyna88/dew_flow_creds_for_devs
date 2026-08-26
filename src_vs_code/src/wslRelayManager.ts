import { spawn } from 'node:child_process';
import { isSafeShellWord, relayArgv, socketFromExportLine } from './wslRelay';

/**
 * The `creds relay` this window is holding open inside WSL.
 *
 * <p>Same shape and the same reason as `sshBridgeManager.ts`: something has to own a long-lived
 * child, and the spawner is injected so the lifetime rules are a unit test rather than something
 * you discover by leaving a window open overnight.</p>
 *
 * <p><b>The relay must not outlive the agent it reaches.</b> A socket inside the distribution is
 * an opening onto a key held in this window; leaving one behind after the key is unloaded would
 * mean a path in WSL that answers for nothing, or worse, answers for whatever window announced
 * itself next. So it starts when the agent starts, and dies when the agent stops or the window
 * does.</p>
 *
 * <p><b>Restarts are bounded, on purpose.</b> The common failure is `creds` not being installed in
 * the distribution, and a relay that respawns forever would be a login shell started every second
 * for the rest of the session. Three quick failures and it stops, having said why.</p>
 */

/** A running `wsl.exe`, as much of it as this needs. */
export interface RelayProcess {
  kill(): void;
  /** Resolves when the process ends, with its exit code when there was one. */
  readonly exited: Promise<number | null>;
  /** Called for each line the relay writes to stdout; the first names the socket. */
  onLine(handler: (line: string) => void): void;
}

export type RelaySpawner = (args: readonly string[]) => RelayProcess;

/** A quick exit means it never got going — see the restart note above. */
export const QUICK_FAILURE_MS = 5_000;
export const MAX_QUICK_FAILURES = 3;

export interface RelayStartRefusal {
  readonly ok: false;
  readonly reason: string;
}

export class WslRelayManager {
  private current: RelayProcess | undefined;
  private startedAt = 0;
  private quickFailures = 0;
  private wanted: { command: string; distro: string } | undefined;
  private socket = '';

  constructor(
    private readonly spawn: RelaySpawner,
    private readonly log: (message: string) => void,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Where the relay said it is listening, once it has said so. */
  get socketPath(): string {
    return this.socket;
  }

  get running(): boolean {
    return this.current !== undefined;
  }

  /**
   * Start the relay, replacing any this window already had.
   *
   * <p>Replacing rather than refusing: the caller starting a second one has decided the first is
   * stale, and refusing would leave the window holding a child nobody asked for.</p>
   */
  start(command: string, distro: string): { ok: true } | RelayStartRefusal {
    const refusal = refuse(command, distro);
    if (refusal !== undefined) {
      return { ok: false, reason: refusal };
    }
    this.stop();
    this.wanted = { command, distro };
    this.quickFailures = 0;
    this.launch();
    return { ok: true };
  }

  stop(): void {
    this.wanted = undefined;
    this.socket = '';
    const running = this.current;
    this.current = undefined;
    running?.kill();
  }

  dispose(): void {
    this.stop();
  }

  private launch(): void {
    const wanted = this.wanted;
    if (wanted === undefined) {
      return;
    }
    const child = this.spawn(relayArgv(wanted.command, wanted.distro));
    this.current = child;
    this.startedAt = this.now();
    child.onLine((line) => this.readSocket(line));
    void child.exited.then((code) => this.onExit(child, code));
  }

  private readSocket(line: string): void {
    const path = socketFromExportLine(line);
    if (path.length > 0) {
      this.socket = path;
      this.log(`wsl relay listening on ${path}`);
    }
  }

  /**
   * Only the child we are still holding may change anything.
   *
   * <p>A relay killed by `stop()` resolves its `exited` afterwards, and without this check that
   * late resolution would restart a relay the caller had just turned off — the same guard the
   * bridge manager needs for the same reason.</p>
   */
  private onExit(child: RelayProcess, code: number | null): void {
    if (this.current !== child) {
      return;
    }
    this.current = undefined;
    this.socket = '';
    const quick = this.now() - this.startedAt < QUICK_FAILURE_MS;
    this.quickFailures = quick ? this.quickFailures + 1 : 0;
    this.log(`wsl relay ended (exit ${code ?? 'signal'})`);
    this.restartOrGiveUp();
  }

  private restartOrGiveUp(): void {
    if (this.wanted === undefined) {
      return;
    }
    if (this.quickFailures >= MAX_QUICK_FAILURES) {
      this.log(
        `wsl relay failed ${MAX_QUICK_FAILURES} times in a row — not restarting it again. ` +
          'Check that `creds` is installed inside the distribution.',
      );
      this.wanted = undefined;
      return;
    }
    this.launch();
  }
}

/** The reason this may not start, or undefined when it may. */
function refuse(command: string, distro: string): string | undefined {
  if (!isSafeShellWord(command)) {
    return `"${command}" is not a plain command name — refusing to build a shell line out of it.`;
  }
  if (distro.length > 0 && !isSafeShellWord(distro)) {
    return `"${distro}" is not a plain distribution name.`;
  }
  return undefined;
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
  child.stderr.on('data', (chunk: string) => onStderr(chunk.trimEnd()));
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
