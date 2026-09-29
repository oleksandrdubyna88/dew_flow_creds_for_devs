import * as vscode from 'vscode';
import { plainHistoryValues, protectHistory } from './historyPin';
import { firstLockedStored } from './pinAdmission';
import { grantedPin } from './pinSession';
import type { StorageManager } from './storageManager';

/**
 * The door heals this machine's KEPT versions (entry-PIN plan §5.7, D10).
 *
 * <p>History is per machine and never synced (`revisionStore.ts`), so *Protect with a PIN…* can only
 * seal the history of the machine it ran on. Every other machine still holds its own kept versions of
 * the entry in the clear — and would until three edits pushed them out. So after a door lets somebody
 * into a protected entry, with the PIN in this window's session, the kept versions still in the
 * clear are sealed under it.</p>
 *
 * <p><b>In the background, with the status bar saying so.</b> Sealing costs about a second per value
 * and a history can hold thirty; a *Copy Password* must not suddenly take twenty seconds because it
 * happened to be the first click on this machine. Nothing waits for it, and a failure is not a
 * failure of the click — the next door tries again, which is also what makes a half-done run safe.</p>
 *
 * <p>Only for an entry that holds a LOCKED value now. A grant can outlive the protection — the entry
 * was unprotected on another machine and synced here this afternoon, and this morning's PIN is still
 * in memory — and sealing the history under it would re-protect what the person unprotected.</p>
 */
export function healKeptVersions(storage: StorageManager, accountId: string, entityId: string, entryName: string): void {
  const pin = grantedPin(accountId, entityId);
  if (pin !== undefined) {
    void sealInBackground(storage, accountId, entityId, entryName, pin);
  }
}

async function sealInBackground(storage: StorageManager, accountId: string, entityId: string, entryName: string, pin: string): Promise<void> {
  try {
    if (!(await needsSealing(storage, accountId, entityId))) {
      return;
    }
    const work = protectHistory(storage, accountId, entityId, pin);
    vscode.window.setStatusBarMessage(`Sealing the kept versions of "${entryName}" under its PIN…`, work);
    await work;
  } catch {
    /* said above: best-effort, and the next door tries again */
  }
}

/** A kept value in the clear, in an entry that is protected now — the two facts that make sealing right. */
async function needsSealing(storage: StorageManager, accountId: string, entityId: string): Promise<boolean> {
  return (
    (await firstLockedStored(storage, accountId, entityId)) !== undefined
    && plainHistoryValues(await storage.getHistory(accountId, entityId)) > 0
  );
}
