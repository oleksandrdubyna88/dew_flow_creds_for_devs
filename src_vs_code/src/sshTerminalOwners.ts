/**
 * Which entry, of which account, each SSH Connect terminal of this window was opened for.
 *
 * <p>An SSH terminal's tab names its folder and entry (`Creds SSH: <folder> / <entry>`), but the tab is NOT how a
 * session is found again. Two entries may share a name in one folder, the same entry id may exist in two accounts, and
 * a move changes the folder half of the tab. A lookup by title would then bring another entry's session forward (a
 * shell on the wrong server), or on the password road close it, or miss this entry's own session after a move and
 * leave its tab, which holds the password in its environment, open. So reuse and disposal ask this map, keyed by the
 * terminal object (the extension host keeps one object per terminal for its whole life), and never the title.</p>
 *
 * <p>A terminal this window did not open (one restored after a reload) is nobody's, so it is neither reused nor
 * closed; Connect opens a new one beside it. No `vscode` import, and the keys are held weakly, so a closed terminal
 * leaves nothing behind.</p>
 */
const ownerOf = new WeakMap<object, string>();

/** One string per (account, entry): an account id never holds a NUL, so two pairs never collide. */
const ownerKey = (accountId: string, entryId: string): string => `${accountId}\u0000${entryId}`;

/** Remembers that `terminal` was opened for the entry `entryId` of the account `accountId`. */
export function claimSshTerminal(terminal: object, accountId: string, entryId: string): void {
  ownerOf.set(terminal, ownerKey(accountId, entryId));
}

/** True only for a terminal this window opened for that entry of that account. */
export function isSshTerminalOf(terminal: object, accountId: string, entryId: string): boolean {
  return ownerOf.get(terminal) === ownerKey(accountId, entryId);
}
