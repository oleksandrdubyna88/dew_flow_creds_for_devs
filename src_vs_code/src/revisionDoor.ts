import * as vscode from 'vscode';
import { RevisionOpen, openRevision } from './historyPin';
import { admitEntry, entryPinGate } from './pinPrompt';
import { Revision } from './revisionHistory';
import type { StorageManager } from './storageManager';

/**
 * The door to one KEPT version — the live entry's door, then the version itself opened (entry-PIN
 * plan §5.7, D10). What the revision viewer and *Restore This Version…* stand behind.
 *
 * <p><b>The LIVE entry's PIN is asked for every version of a protected entry</b>, a version from
 * before the PIN included: a history row that opened with no PIN would be a way round the PIN of the
 * entry it belongs to (plan gate, finding 0). The version is then opened with that grant, silently.</p>
 *
 * <p><b>A version the grant does not open asks for its OWN PIN</b>, with its own sentence, and that
 * PIN is never granted: the live grant is the PIN the entry uses now, and replacing it with the one
 * it used to have would turn the next click into a wrong-PIN message. That is also the road when the
 * live entry holds no grant at all because it was unprotected on another machine while this
 * machine's kept versions stayed sealed (plan gate, finding 3).</p>
 */

/** The words each box says: the live entry's door, and the version's own box. */
export interface RevisionPurposes {
  /** e.g. *"see this previous version"* — `pinGate.pinPromptFor` turns it into the door's sentence. */
  readonly door: string;
  /** e.g. *"see it"* — `historyPin.versionPrompt` turns it into the version's sentence. */
  readonly version: string;
}

/** The version with every value opened, or `undefined` — and anything but a decline has been said. */
export async function openKeptVersion(
  storage: StorageManager,
  accountId: string,
  liveId: string,
  revision: Revision,
  purposes: RevisionPurposes,
): Promise<Revision | undefined> {
  const live = storage.getNode(accountId, liveId);
  if (live === undefined) {
    void vscode.window.showWarningMessage('The entry this version belongs to no longer exists, so the version cannot be opened.');
    return undefined;
  }
  const gate = await admitEntry(storage, accountId, liveId, live.name, purposes.door);
  if (gate === undefined) {
    return undefined;
  }
  const askVersion = (prompt: string): Thenable<string | undefined> => entryPinGate(accountId, liveId, live.name).ask(prompt, live.name);
  return told(await openRevision(revision, gate, askVersion, purposes.version));
}

/** The opened version — or nothing, having said why unless the person declined. */
function told(opened: RevisionOpen): Revision | undefined {
  if (opened.kind === 'open') {
    return opened.revision;
  }
  if (opened.reason !== '') {
    void vscode.window.showWarningMessage(opened.reason);
  }
  return undefined;
}
