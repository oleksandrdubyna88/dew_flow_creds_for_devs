import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Where a terminal finds the window: `<globalStorage>/cli-endpoint.json`.
 *
 * <p>Until now the only way to reach a broker was a grant token, and the token carried the port
 * inside it — so discovery was free and no file existed. That is still the right design for a
 * pasted token, and it is why this file <b>contains no secret</b>: it names a port, a pipe and a
 * pid, all of which anyone on the machine could enumerate anyway. What it enables is
 * <code>creds ls</code> and alias calls, where the caller knows a name rather than a token.</p>
 *
 * <p><b>The pid is what makes it truthful.</b> A window that crashes cannot delete its own file,
 * so a stale entry is normal rather than exceptional; a reader checks whether that pid is still
 * alive instead of trusting the file's existence. Without that the CLI would keep dialling a
 * port belonging to a dead window — or worse, to whatever process later inherited it, which is
 * the exact failure the health probe exists to catch.</p>
 *
 * <p>One file per window, named by pid, in a directory rather than one shared file: two windows
 * writing one file is a race with no winner, and a crash would leave the survivor's entry
 * clobbered.</p>
 */

export interface CliEndpoint {
  readonly pid: number;
  readonly port: number;
  /** The socket or pipe address, when this window managed to open one. */
  readonly socket?: string;
  /**
   * Where the SSH agent is listening, when a key is loaded and it is running.
   *
   * <p>Absent whenever the agent is not up, which is most of the time — it starts on the first
   * key and stops on the last. That is exactly why it is re-announced on both edges rather than
   * written once at activation: a reader that trusted a startup snapshot would hand out the
   * address of an agent that has since gone, and on Windows a pipe name whose server is gone is
   * indistinguishable from one that never existed.</p>
   *
   * <p>Like everything else in this file it is <b>not a secret</b>: the address is derived from
   * the pid and anyone on the machine can enumerate it. What it saves is the guessing.</p>
   */
  readonly agentSocket?: string;
  /** ISO-8601, so a human reading the file can tell a fresh window from a forgotten one. */
  readonly startedAt: string;
}

/** The directory holding one file per live window. */
export function endpointDir(storageDir: string): string {
  return path.join(storageDir, 'endpoints');
}

export function endpointPath(storageDir: string, pid: number): string {
  return path.join(endpointDir(storageDir), `window-${pid}.json`);
}

/** The fields a valid announcement always carries, and the type each must be. */
const REQUIRED: readonly (readonly [string, string])[] = [
  ['pid', 'number'],
  ['port', 'number'],
  ['startedAt', 'string'],
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

/** True when a value read back from disk is the shape we wrote. */
export function isCliEndpoint(value: unknown): value is CliEndpoint {
  return (
    isRecord(value) &&
    REQUIRED.every(([key, type]) => typeof value[key] === type) &&
    optionalString(value.socket) &&
    optionalString(value.agentSocket)
  );
}

/**
 * Announce this window.
 *
 * <p>Written 0600 and into a 0700 directory. Neither is a real defence on Windows — the mode
 * bits are advisory there — but the file holds nothing secret, so the permissions are tidiness
 * rather than a boundary. Never throws: a window that cannot announce itself is one the CLI
 * will not find, which is a missing convenience, not a broken broker.</p>
 */
export function writeEndpoint(storageDir: string, endpoint: CliEndpoint): void {
  try {
    fs.mkdirSync(endpointDir(storageDir), { recursive: true, mode: 0o700 });
    fs.writeFileSync(endpointPath(storageDir, endpoint.pid), JSON.stringify(endpoint, null, 2), {
      mode: 0o600,
    });
  } catch {
    // Announcing is best-effort by design; see the note above.
  }
}

export function removeEndpoint(storageDir: string, pid: number): void {
  try {
    fs.unlinkSync(endpointPath(storageDir, pid));
  } catch {
    // Already gone, or never written.
  }
}

/**
 * Every endpoint file that parses, newest first — including stale ones.
 *
 * <p>Liveness is deliberately NOT decided here: this module has no business running
 * `process.kill(pid, 0)` on the extension host's behalf, and the CLI that reads these files is
 * a different process on a possibly different side of a WSL boundary, where our pid namespace
 * does not even apply. The reader decides, and its real test is the health probe.</p>
 */
export function readEndpoints(storageDir: string): CliEndpoint[] {
  let names: string[];
  try {
    names = fs.readdirSync(endpointDir(storageDir));
  } catch {
    return [];
  }
  return names
    .flatMap((name) => parseEndpoint(path.join(endpointDir(storageDir), name)))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function parseEndpoint(file: string): CliEndpoint[] {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return isCliEndpoint(value) ? [value] : [];
  } catch {
    return []; // half-written or hand-edited: not an error, just not an endpoint
  }
}

/** Endpoint files whose window is provably gone, so a sweep can remove them. */
export function staleEndpoints(
  endpoints: readonly CliEndpoint[],
  isAlive: (pid: number) => boolean,
): CliEndpoint[] {
  return endpoints.filter((e) => !isAlive(e.pid));
}
