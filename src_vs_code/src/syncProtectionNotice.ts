import * as vscode from 'vscode';
import { healKeptVersions } from './historyHeal';
import type { StorageManager } from './storageManager';
import { ProtectionConflict, conflictNotice } from './syncProtection';

export { keepProtectionLosers } from './syncProtection';

/**
 * The sync's word about a protection conflict it settled (entry-PIN plan §5.9) — the `vscode` edge of
 * `syncProtection.ts`, so the cycle in `syncManager.ts` (at its 800-line ceiling) spends one line on it.
 *
 * <p>Once per entry, after the merge is applied: the sentence says which decision won and where this
 * machine's own copy went. The same background seal the door runs is scheduled for the entry, so a
 * plaintext loser recorded under a Protect that won is sealed as soon as this window holds the PIN;
 * with no grant it is sealed at the first door (plan gate, finding 0).</p>
 *
 * <p>Coordinate with `PLAN_sync_says_what_already_happened.md`: once that plan's summary exists, these
 * sentences go through it rather than as a notification of their own.</p>
 */
export function tellProtectionLosers(storage: StorageManager, accountId: string, conflicts: readonly ProtectionConflict[]): void {
  for (const conflict of conflicts) {
    void vscode.window.showWarningMessage(conflictNotice(conflict));
    healKeptVersions(storage, accountId, conflict.id, conflict.name);
  }
}
