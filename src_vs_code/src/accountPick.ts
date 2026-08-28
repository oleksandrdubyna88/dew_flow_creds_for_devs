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

function elementAccount(element: ReturnType<typeof asElement>): StoredAccount | undefined {
  if (element === undefined) {
    return undefined;
  }
  return element.kind === 'account' || element.kind === 'teamScope' ? element.account : undefined;
}

function looksLikeAccount(target: unknown): boolean {
  return (
    typeof target === 'object' &&
    target !== null &&
    typeof (target as StoredAccount).accountId === 'string' &&
    typeof (target as StoredAccount).email === 'string'
  );
}
