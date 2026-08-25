import { DatedFile, agedOut } from './backupSchedule';

/**
 * Where the agent broker's audit goes on disk, and what ages out.
 *
 * <p>The output channel was the whole audit surface, and it is a buffer in the
 * window. Closing the window is also how a grant is revoked — so the record of
 * what an agent did was destroyed at exactly the moment it stopped being live
 * and started being history. The shared rule
 * (`.claude/rules/shared/common/logging-serilog.md`) had already said this in
 * general: "a log that only exists in a terminal buffer is gone the moment the
 * window closes", and required a file per run. This is that file.</p>
 *
 * <p>Shape and timezone follow the same rule: `logs/{yyyy-MM-dd}/agent-{HH-mm-ss}-{pid}.log`,
 * UTC throughout. UTC is not a preference — a local-time day folder and a UTC one
 * split the same evening in two, and the one time anybody correlates them is while
 * chasing an incident across both.</p>
 *
 * <p>Pure: no `vscode`, no `fs`. The caller owns the filesystem; this owns the rules.</p>
 */

/** A run's own file. The pid disambiguates two windows opened in the same second. */
export function auditFileName(startedAt: Date, pid: number): string {
  const t = startedAt.toISOString();
  return `agent-${t.slice(11, 13)}-${t.slice(14, 16)}-${t.slice(17, 19)}-${pid}.log`;
}

/** A folder per day, so a week of work is seven directories rather than one listing. */
export function auditDayFolder(startedAt: Date): string {
  return startedAt.toISOString().slice(0, 10);
}

/**
 * The instant a file name says it was started, or undefined when the name is not
 * one of ours. Undefined rather than a guess: a foreign file in the folder must be
 * left alone, never pruned on a misread.
 */
export function auditStartedAt(day: string, fileName: string): Date | undefined {
  const match = fileName.match(/^agent-(\d{2})-(\d{2})-(\d{2})-\d+\.log$/);
  if (match === null || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return undefined;
  }
  const [, hh, mm, ss] = match;
  const when = new Date(`${day}T${hh}:${mm}:${ss}Z`);
  return Number.isNaN(when.getTime()) ? undefined : when;
}

/** One day folder's worth of log files, with the day they were found under. */
export interface AuditLogFile {
  day: string;
  fileName: string;
}

/**
 * Which audit logs have aged out, across every day folder at once.
 *
 * <p>Deliberately the same two rules snapshots get, through the same function:
 * `retainDays <= 0` keeps everything, and the newest survives whatever its age.
 * The second matters more here than for snapshots — the newest audit file is the
 * one covering the session somebody is asking about.</p>
 */
export function auditLogsToPrune(
  files: readonly AuditLogFile[],
  retainDays: number,
  now: Date,
): AuditLogFile[] {
  const dated: DatedFile[] = [];
  const byName = new Map<string, AuditLogFile>();
  for (const file of files) {
    const when = auditStartedAt(file.day, file.fileName);
    if (when === undefined) {
      continue; // not ours — leave it alone
    }
    const key = `${file.day}/${file.fileName}`;
    dated.push({ name: key, when });
    byName.set(key, file);
  }
  return agedOut(dated, retainDays, now)
    .map((key) => byName.get(key))
    .filter((file): file is AuditLogFile => file !== undefined);
}

/** How long an audit file is kept. Long enough to answer "what happened last week". */
export const AUDIT_RETAIN_DAYS = 14;
