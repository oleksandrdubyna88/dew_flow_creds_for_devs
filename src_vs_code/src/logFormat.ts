/**
 * What a diagnostic line looks like, and where the file for this run lives (audit A6).
 *
 * <p>Pure and free of `vscode`, so the two things worth getting right — that a line is
 * readable and greppable, and that a run has its own file — are unit tests rather than
 * hopes.</p>
 *
 * <p>The shape follows the family logging rule (`.claude/rules/shared/common/logging-serilog.md`):
 * a folder per day, a file per RUN rather than per day, and **UTC everywhere**. The last one is
 * not a preference — a window opened at 01:00 local on one side of midnight and a sync failing
 * at 23:00 on the other would land in two different day folders, and correlating them is the
 * one time anybody reads these files.</p>
 */

export type LogLevel = 'info' | 'warn' | 'error';

/** Fixed width so the level column lines up and `grep ' ERR '` finds every failure. */
const LEVEL_TEXT: Readonly<Record<LogLevel, string>> = {
  info: 'INF',
  warn: 'WRN',
  error: 'ERR',
};

function two(n: number): string {
  return String(n).padStart(2, '0');
}

/** `HH:mm:ss` in UTC — the same clock the folder name uses. */
export function timeOfDay(at: Date): string {
  return `${two(at.getUTCHours())}:${two(at.getUTCMinutes())}:${two(at.getUTCSeconds())}`;
}

/** `yyyy-MM-dd` in UTC. */
export function dayFolder(at: Date): string {
  return `${at.getUTCFullYear()}-${two(at.getUTCMonth() + 1)}-${two(at.getUTCDate())}`;
}

/**
 * One line: `[HH:mm:ss LVL] source: message`.
 *
 * <p>`source` is the module that spoke, so a reader can tell a sync failure from a backup one
 * without reading the sentence. Newlines in `message` are folded to spaces: a log where one
 * event can span lines is a log where `grep` lies about what happened.</p>
 */
export function formatLine(at: Date, level: LogLevel, source: string, message: string): string {
  return `[${timeOfDay(at)} ${LEVEL_TEXT[level]}] ${source}: ${message.replace(/\r?\n/g, ' ')}`;
}

/**
 * The path of THIS run's file, relative to the extension's storage folder:
 * `logs/{yyyy-MM-dd}/creds-{HH-mm-ss}-{pid}.log`.
 *
 * <p>A file per run, not per day, because the question anyone actually asks is "what did THAT
 * run do" — and a day-rolling file merges every run of the day into one scroll. The pid
 * disambiguates two windows opened in the same second, which is the normal case when VS Code
 * restores a workspace.</p>
 */
export function logFilePath(startedAt: Date, pid: number): string {
  const clock = `${two(startedAt.getUTCHours())}-${two(startedAt.getUTCMinutes())}-${two(startedAt.getUTCSeconds())}`;
  return `logs/${dayFolder(startedAt)}/creds-${clock}-${pid}.log`;
}

/**
 * Whether a run's file is old enough to delete, given a retention window in days.
 *
 * <p>Kept here rather than in the sweeper so the boundary is testable without a filesystem:
 * a file exactly at the limit is KEPT, because "7 days" that silently means "6 and a bit"
 * is the kind of arithmetic nobody re-derives when a log they wanted is missing.</p>
 */
export function isExpiredLogDay(folder: string, now: Date, retainDays: number): boolean {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(folder);
  if (parsed === null || retainDays <= 0) {
    return false; // not one of ours, or retention disabled — never delete
  }
  const day = Date.UTC(Number(parsed[1]), Number(parsed[2]) - 1, Number(parsed[3]));
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return (today - day) / 86_400_000 > retainDays;
}
