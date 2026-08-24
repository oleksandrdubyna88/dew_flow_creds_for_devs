/**
 * Pure scheduling and naming for automatic vault snapshots — no `vscode` import, so the
 * rules below are unit tests rather than hopeful comments.
 *
 * <p><b>A snapshot is not a sync.</b> Sync keeps one live file per account and MERGES:
 * delete a credential on one machine and the deletion travels to every other. That is
 * the correct behaviour for a vault and useless as a safety net, because there is no
 * point in time to go back to. A snapshot is a dated, read-only copy of the same
 * ciphertext, and it is what you restore from when the answer to "who deleted it" is
 * "you did, last Tuesday".</p>
 *
 * <p>The rules here are the ones the server's backup learned when its restore was first
 * rehearsed, applied on the client: retention must never empty the destination, and
 * identical bytes must not be re-uploaded to a metered folder every day.</p>
 */

import { sanitizeEmailForFilename } from './backupNaming';

/** `2026-08-23T14:05:09Z` → `20260823T140509Z`. Sorts lexically into time order. */
function stamp(when: Date): string {
  return when.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

/**
 * The name one snapshot gets.
 *
 * The provider is in the name, not only the email: the same address signed in through two
 * identity providers is two separate vaults, and one must never prune or restore the other.
 */
export function snapshotFileName(email: string, provider: string, when: Date): string {
  const account = sanitizeEmailForFilename(email) || 'account';
  const source = sanitizeEmailForFilename(provider) || 'x';
  return `vault_${account}_${source}_${stamp(when)}.enc`;
}

const STAMP = '(\\d{8}T\\d{6}Z)';

function snapshotPattern(email: string, provider: string): RegExp {
  const account = sanitizeEmailForFilename(email) || 'account';
  const source = sanitizeEmailForFilename(provider) || 'x';
  return new RegExp(`^vault_${account}_${source}_${STAMP}\\.enc$`);
}

/**
 * Whether a file is a snapshot of THIS account.
 *
 * Deliberately strict. The live sync file is `vault_<account>.enc` — no provider, no
 * stamp — and it sits in the same folder when the two locations are the same one.
 * Treating it as an expired snapshot would delete the working vault.
 */
export function isSnapshotOf(fileName: string, email: string, provider: string): boolean {
  return snapshotPattern(email, provider).test(fileName);
}

/** The instant encoded in a snapshot name, or undefined when it is not one of ours. */
function takenAt(fileName: string): Date | undefined {
  const match = fileName.match(new RegExp(`_${STAMP}\\.enc$`));
  if (match === null) {
    return undefined;
  }
  const [, s] = match;
  const iso =
    `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T` +
    `${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`;
  const when = new Date(iso);
  return Number.isNaN(when.getTime()) ? undefined : when;
}

/**
 * Which snapshots to delete — and the one that is never among them.
 *
 * <p><b>The newest is always kept, whatever its age.</b> A laptop closed for a year, a
 * destination that was unreachable for a month, or a clock that jumped would otherwise
 * turn "prune old backups" into "delete every backup" — at exactly the moment the
 * backups matter. Anything this cannot parse belongs to somebody else and is left
 * alone.</p>
 */
export function snapshotsToPrune(fileNames: string[], retainDays: number, now: Date): string[] {
  if (retainDays <= 0) {
    return [];
  }

  const dated = fileNames
    .map((name) => ({ name, when: takenAt(name) }))
    .filter((entry): entry is { name: string; when: Date } => entry.when !== undefined)
    .sort((a, b) => b.when.getTime() - a.when.getTime());

  const cutoff = now.getTime() - retainDays * 24 * 60 * 60 * 1000;
  // `slice(1)` is the whole guarantee: the newest is never a candidate.
  return dated.slice(1).filter((entry) => entry.when.getTime() < cutoff).map((entry) => entry.name);
}

/**
 * Whether a snapshot is due.
 *
 * <p>A `lastRun` in the FUTURE counts as due. A clock that jumped forward and back would
 * otherwise suspend backups until real time caught up, which can be months — and the
 * machine whose clock is wrong is not the machine to trust with "no backup needed".</p>
 */
export function dueForSnapshot(
  lastRun: Date | undefined,
  now: Date,
  intervalHours: number,
): boolean {
  if (intervalHours <= 0) {
    return false; // explicitly disabled
  }
  if (lastRun === undefined) {
    return true; // never run: do it now, so a wrong path is found immediately
  }
  const elapsed = now.getTime() - lastRun.getTime();
  return elapsed < 0 || elapsed >= intervalHours * 60 * 60 * 1000;
}
