/**
 * What the status bar says, as data.
 *
 * <p>Carved out of `statusBar.ts` for the reason the repo already learned once with
 * `sshCommand.ts` and `entityText.ts`: the module that touches `vscode` cannot be imported by a
 * `node:test` suite, so wording that lives there is wording nobody checks. The item's whole job
 * is to be read, which makes its text the part most worth a test.</p>
 */

/** Icon plus label. `$(…)` names a codicon; `~spin` animates it. */
export function statusText(locked: boolean, syncing: boolean): string {
  if (syncing) {
    return '$(sync~spin) CredsForDevs';
  }
  return locked ? '$(lock) Vault locked' : '$(unlock) Vault open';
}

/**
 * The hover.
 *
 * <p>It names the CONSEQUENCE, not just the state: "locked" alone does not tell anyone that
 * their background sync has stopped, which is the thing they would actually want to know.</p>
 */
export function statusTooltip(locked: boolean, syncing: boolean): string {
  if (syncing) {
    return 'CredsForDevs: syncing…';
  }
  return locked
    ? 'CredsForDevs: the vault is locked — background sync is paused. Click to unlock.'
    : 'CredsForDevs: the vault is open. Click to lock it and clear the cached key.';
}

/** Clicking does the obvious thing for the state, rather than opening a menu of one option. */
export function statusCommand(locked: boolean): string {
  return locked ? 'credSshManager.unlockWithSecurityKey' : 'credSshManager.lockVaults';
}
