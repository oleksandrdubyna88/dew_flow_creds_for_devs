/**
 * The message a person is shown for a caught `unknown` (audit 2026-08-25, A1).
 *
 * <p>Twenty-one call sites each carried this ternary inline, and two files had grown their
 * own named copy — `backupManager.describeUnknown` even special-cased `BackupError`, which
 * extends `Error` and whose `message` is already the user-facing sentence, so the special
 * case changed nothing. One function, so the next refinement (say, unwrapping an
 * `AggregateError`) happens everywhere at once.</p>
 */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
