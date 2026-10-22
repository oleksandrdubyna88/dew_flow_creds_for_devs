import * as vscode from 'vscode';

/**
 * The idle auto-lock setting, in ONE place (#197, E3.3). Three sites read it — the idle timer in `extension.ts`, *Set
 * Auto-Lock* in `keyCommands.ts` and the SSH agent's wiring — and each used to carry its own default, so a change of
 * the default would have been three edits and a quiet disagreement.
 *
 * <p>It is also what BOUNDS a long SSH login window: a window lasts at most until the vault locks, and the vault
 * locks after this many idle minutes. That is why the setting is `"scope": "application"` in `package.json` — a
 * repository's `.vscode/settings.json` must not be able to raise it.</p>
 */

/** What the setting reads when nobody set it; `package.json` says the same. */
export const AUTO_LOCK_DEFAULT_MINUTES = 60;

/**
 * Minutes of idle time before the vaults lock. `0` — and any negative number, which the rules read the same way —
 * means auto-lock is off. Returned as it is: callers decide what a non-positive value means.
 */
export function autoLockMinutesSetting(): number {
  return vscode.workspace.getConfiguration('credSshManager').get<number>('autoLockMinutes', AUTO_LOCK_DEFAULT_MINUTES);
}
