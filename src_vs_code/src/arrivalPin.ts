import type { CreatePin } from './pinOnCreate';
import type { StorageManager } from './storageManager';
import type { FolderType } from './types';

/**
 * Whether an ARRIVAL — an accepted share, an import — lands in a folder that asks for a PIN, and the
 * answer, once per folder (`PLAN_pin_folder_asks_on_accept_and_import.md` §3.1).
 *
 * <p>A folder whose entries are protected promises that nothing in it is stored in the clear. The person's
 * Add and an agent's create keep that promise (`pinOnCreate.pinForNewEntry`, `agentCreatePin`); an accepted
 * share and an import wrote their new ids plain. They now ask the SAME question Add asks there — reused,
 * not copied: this module decides WHICH folder is asked and remembers the answer, and the question itself
 * is a port ({@link FolderQuestion}), bound to `pinOnCreate` where the commands are wired. That is why it
 * imports no `vscode` (the repository's rule 3, and the plan round's finding 5).</p>
 *
 * <p>The decision is taken before any write of its landing — the values, the node, and the folders the
 * arrival creates (§3.2) — and no lease is held across it: the writers take the lease per write, after.</p>
 */

/** One folder an arrival walks or creates, by name — the shape of a share's `folderPath`. */
export interface FolderSeg {
  readonly name: string;
  readonly folderType?: FolderType;
}

/** Where an arrival lands: its account, the deepest folder that exists (`null`, the root), and what it creates below it. */
export interface Landing {
  readonly accountId: string;
  readonly existing: string | null;
  readonly creates: readonly FolderSeg[];
}

/**
 * The question Add asks, as a port. `ask` is `pinOnCreate.pinForNewEntry` in that folder; `prefers` is
 * `pinOnCreate.folderPrefersPin` — whether the folder, or one above it, carries the preference.
 */
export interface FolderQuestion {
  readonly ask: (accountId: string, folderId: string) => Promise<CreatePin>;
  readonly prefers: (accountId: string, folderId: string) => boolean;
}

/** The per-command memo: one answer per destination folder. */
export interface ArrivalPins {
  settledFor(landing: Landing): Promise<CreatePin>;
}

const NONE: CreatePin = { kind: 'none' };

/**
 * Where `chain` lands under `under` — read only, nothing written: each name reuses a child folder of that
 * name, as a share's landing always has (`shareImport.landShare`), and the first name with no such folder
 * starts what the arrival creates.
 */
export function landingOf(storage: StorageManager, accountId: string, under: string | null, chain: readonly FolderSeg[]): Landing {
  let existing = under;
  for (const [at, seg] of chain.entries()) {
    const found = storage.getChildren(accountId, existing).find((n) => n.type === 'folder' && n.name === seg.name);
    if (found === undefined) {
      return { accountId, existing, creates: chain.slice(at) };
    }
    existing = found.id;
  }
  return { accountId, existing, creates: [] };
}

/**
 * The answers for one command — an `acceptOne`, an `acceptMany`'s whole conversation (whichever
 * accounts its shares are for: the memo is keyed by account and folder), one import — and dropped with it. Nothing is persisted and nothing is granted to the window, as Add grants nothing.
 *
 * <ul>
 *   <li>the root asks nothing;</li>
 *   <li>a landing that creates no folder is asked what Add asks in the folder it lands in;</li>
 *   <li>a landing that creates folders lands in folders that are empty, where Add could only be asked
 *       through a preference: no preference on the existing folder or above → nothing; a preference → the
 *       answer settled for the existing folder, so one folder's whole landing subtree is one question
 *       (§9.1 — not Add's fresh first PIN per new subfolder).</li>
 * </ul>
 *
 * <p>Every answer is kept, a decline too: a folder declined is not asked again within the same command.</p>
 */
export function arrivalPins(question: FolderQuestion): ArrivalPins {
  const settled = new Map<string, Promise<CreatePin>>();
  const askedIn = (accountId: string, folderId: string): Promise<CreatePin> => {
    const key = JSON.stringify([accountId, folderId]);
    const known = settled.get(key) ?? question.ask(accountId, folderId);
    settled.set(key, known);
    return known;
  };
  return {
    settledFor: ({ accountId, existing, creates }) => {
      if (existing === null) {
        return Promise.resolve(NONE);
      }
      return creates.length === 0 || question.prefers(accountId, existing) ? askedIn(accountId, existing) : Promise.resolve(NONE);
    },
  };
}

/** Why an arrival into this folder wrote nothing — the sentence a declined landing says. */
export function declinedLanding(folderName: string): string {
  return `the folder "${folderName}" asks for a PIN on every entry in it, and none was given`;
}
