import { asElement } from './commandTargets';
import { pickAccount } from './dialogs';
import type { StorageManager } from './storageManager';
import { StoredAccount } from './types';

/**
 * The account a command was invoked on — an account or team-scope row, the account object
 * itself (a notification button, a hook) — or, when the command came from the palette, a pick.
 */
export async function accountFromTargetOrPick(
  target: unknown,
  storage: StorageManager,
  placeHolder: string,
): Promise<StoredAccount | undefined> {
  return accountOf(target) ?? pickAccount(storage, placeHolder);
}

/** The account a target names outright, or nothing. */
function accountOf(target: unknown): StoredAccount | undefined {
  return elementAccount(asElement(target)) ?? (looksLikeAccount(target) ? (target as StoredAccount) : undefined);
}

/**
 * The account a tree row names outright, or nothing.
 *
 * <p>Exported so it is a unit test rather than something discovered by right-clicking: this module
 * reaches `vscode` through `dialogs`, so the test loads it under a stub.</p>
 */
export function elementAccount(element: ReturnType<typeof asElement>): StoredAccount | undefined {
  return element !== undefined && WITH_ACCOUNT.has(element.kind)
    ? (element as { account: StoredAccount }).account
    : undefined;
}

/**
 * The row kinds that carry a whole `StoredAccount`.
 *
 * <p>A SET rather than a growing `||` chain, because `complexity: 4` is an eslint error here and
 * six alternatives are not four. The Server section's four kinds joined in 2026-09-12: without
 * them, right-clicking the Backup row and pressing *Configure backup…* fell through to
 * `pickAccount` and asked "Which server's backup?" about the row just clicked.</p>
 */
const WITH_ACCOUNT: ReadonlySet<string> = new Set([
  'account', 'teamScope', 'serverScope', 'serverVersion', 'serverVaults', 'serverBackup',
]);

function looksLikeAccount(target: unknown): boolean {
  return (
    typeof target === 'object' &&
    target !== null &&
    typeof (target as StoredAccount).accountId === 'string' &&
    typeof (target as StoredAccount).email === 'string'
  );
}
