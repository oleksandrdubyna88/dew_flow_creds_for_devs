/**
 * Which entry each SSH Connect terminal of this window was opened for.
 *
 * <p>An SSH terminal's title names its folder and entry (`Creds SSH: <folder> / <entry>`), and the title is also how a
 * second Connect finds the session again. Two entries may share a name in one folder, so a title alone could bring
 * another entry's session forward — a shell on the wrong server — or, on the password path, close it. Reuse and
 * disposal therefore ask this map as well. A terminal this window did not open (one restored after a reload) is
 * nobody's, so it is neither reused nor closed; Connect opens a new one beside it.</p>
 *
 * <p>No `vscode` import: the keys are the terminal objects themselves, held weakly, so a closed terminal leaves
 * nothing behind.</p>
 */
const ownerOf = new WeakMap<object, string>();

/** Remembers that `terminal` was opened for the entry `entryId`. */
export function claimSshTerminal(terminal: object, entryId: string): void {
  ownerOf.set(terminal, entryId);
}

/** True only for a terminal this window opened for `entryId`. */
export function isSshTerminalOf(terminal: object, entryId: string): boolean {
  return ownerOf.get(terminal) === entryId;
}
