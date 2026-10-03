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
  /**
   * The folder asks for a PIN on every entry created in it (`TreeNode.folderAsksForPin`) — a CredsForDevs
   * export keeps that preference, so a bundle can recreate such a folder (the security review, finding 3).
   */
  readonly folderAsksForPin?: boolean;
}

/** Where an arrival lands: its account, the deepest folder that exists (`null`, the root), and what it creates below it. */
export interface Landing {
  readonly accountId: string;
  readonly existing: string | null;
  readonly creates: readonly FolderSeg[];
}

/**
 * The question Add asks, as a port. `ask` is `pinOnCreate.pinForNewEntry` in that folder; `prefers` is
 * `pinOnCreate.folderPrefersPin` — whether the folder, or one above it, carries the preference; `first` is
 * the first PIN of a folder that asks and holds nothing yet, typed twice — what Add asks in a folder the
 * arrival itself creates WITH the preference; `folderName` names that folder in the box, because one arrival
 * can recreate several (second code round, finding 4).
 */
export interface FolderQuestion {
  readonly ask: (accountId: string, folderId: string) => Promise<CreatePin>;
  readonly prefers: (accountId: string, folderId: string) => boolean;
  readonly first: (accountId: string, folderName: string) => Promise<CreatePin>;
}

/** A folder of one account — or, for a folder the arrival creates, its `name` and no id yet (`folderId` `''`). */
export interface FolderRef {
  readonly accountId: string;
  readonly folderId: string;
  readonly name?: string;
}

/** The per-command memo: one answer per destination folder. */
export interface ArrivalPins {
  settledFor(landing: Landing): Promise<CreatePin>;
  /**
   * The folders `landing` CREATED, once written: a later landing inside one of them is that landing's
   * question, already answered — not a new one (the security review, finding 5: a batch whose first share
   * created `Prod/Sub` asked `Sub` again for the second, which now held the first one's protected entry).
   */
  created(landing: Landing, folderIds: readonly string[]): void;
  /**
   * The folders whose question was declined in this command — what a batch's tally names. A question that
   * FAILED (rejected) is not a decline and is not named; the shares it stopped are already counted as failed.
   * Never rejects: a batch must still end with its tally (the security review, finding 6).
   */
  declined(): Promise<readonly FolderRef[]>;
  /** The folder a landing is asked in — what its decline names — or nothing when it asks nothing. Asks nothing itself. */
  askedFolder(landing: Landing): FolderRef | undefined;
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
  return new ArrivalMemo(question);
}

/** The memo behind `arrivalPins`: the answers asked, and what each folder this command created inherited. */
class ArrivalMemo implements ArrivalPins {
  private readonly settled = new Map<string, Known>();
  /** A folder this command created → the answer of the landing that created it. */
  private readonly inherited = new Map<string, Known>();

  constructor(private readonly question: FolderQuestion) {}

  settledFor(landing: Landing): Promise<CreatePin> {
    return this.answerFor(landing).answer;
  }

  /**
   * The folder a landing's answer came from: the one it inherited from, unless a folder it creates asks on
   * its own (second code round, findings 1 and 6 — an inherited decline named the created folder, or none).
   */
  askedFolder(landing: Landing): FolderRef | undefined {
    const up = this.upOf(landing);
    return up === undefined ? askingFor(this.question, landing)?.folder : this.belowFolder(up, landing);
  }

  created(landing: Landing, folderIds: readonly string[]): void {
    // Each created folder takes the answer of the landing that ENDS at it, and only an answer a QUESTION gave
    // at or above it: a folder that asks hands its answer to itself and below, never to a plain folder above
    // it — which is asked what Add asks there when something lands in it later (second code round, finding
    // 3). Read from the memo, never asked: this runs while the folders are written.
    for (const [at, folderId] of folderIds.entries()) {
      const known = this.peek({ ...landing, creates: landing.creates.slice(0, at + 1) });
      if (known !== undefined) {
        this.inherited.set(JSON.stringify([landing.accountId, folderId]), known);
      }
    }
  }

  async declined(): Promise<readonly FolderRef[]> {
    const answers = await Promise.all([...this.settled.values()].map(async ({ folder, answer }) => ({ folder, kind: await kindOf(answer) })));
    return answers.filter((a) => a.kind === 'cancelled').flatMap((a) => (a.folder === undefined ? [] : [a.folder]));
  }

  private upOf(landing: Landing): Known | undefined {
    return this.inherited.get(JSON.stringify([landing.accountId, landing.existing]));
  }

  private belowFolder(up: Known, landing: Landing): FolderRef | undefined {
    return preferringCreated(this.question, landing)?.folder ?? up.folder;
  }

  private asked(asking: Asking): Known {
    const known = this.settled.get(asking.key) ?? { folder: asking.folder, answer: asking.ask() };
    this.settled.set(asking.key, known);
    return known;
  }

  /** The answer the memo already holds for a landing — a folder it creates that asks first — or none yet. */
  private peek(landing: Landing): Known | undefined {
    const own = preferringCreated(this.question, landing);
    return (own === undefined ? undefined : this.settled.get(own.key)) ?? this.levelKnown(landing);
  }

  /** The answer of the level the landing starts from: inherited, or the existing folder's question if one was asked. */
  private levelKnown(landing: Landing): Known | undefined {
    const up = this.upOf(landing);
    if (up !== undefined) {
      return up;
    }
    const asking = askingFor(this.question, landing);
    return asking === undefined ? undefined : this.settled.get(asking.key);
  }

  private answerFor(landing: Landing): Known {
    const up = this.upOf(landing);
    return up === undefined ? this.decided(landing) : this.below(up, landing);
  }

  /**
   * An answer inherited from the landing that created the existing folder covers this landing — unless it is
   * no PIN and a folder this landing CREATES asks for one: that folder is decided on its own (the second code
   * round's finding 0: a plain `Project` the batch created handed its "no PIN" to `Project/Secrets`, which
   * asks, and its entries were written in the clear).
   */
  private below(up: Known, landing: Landing): Known {
    const own = preferringCreated(this.question, landing);
    return own === undefined ? up : { folder: own.folder, answer: up.answer.then((answer) => (answer.kind === 'pin' ? answer : this.asked(own).answer)) };
  }

  private decided(landing: Landing): Known {
    const asking = askingFor(this.question, landing);
    return asking === undefined ? NO_QUESTION : this.asked(asking);
  }
}

/** An answer with the folder it was asked in — what a decline names. */
interface Known {
  readonly folder: FolderRef | undefined;
  readonly answer: Promise<CreatePin>;
}

const NO_QUESTION: Known = { folder: undefined, answer: Promise.resolve(NONE) };

/** Which question a landing is asked, keyed for the memo — not asked yet. */
interface Asking {
  readonly key: string;
  readonly folder: FolderRef;
  readonly ask: () => Promise<CreatePin>;
}

/**
 * The question for one landing, or none: the existing folder's (Add's question there) when the landing creates
 * nothing or the existing folder carries the preference; otherwise the first PIN of the first folder the
 * landing CREATES that carries the preference — one answer for everything landing under it (§9.1).
 */
function askingFor(question: FolderQuestion, landing: Landing): Asking | undefined {
  const { accountId, existing, creates } = landing;
  if (existing !== null && (creates.length === 0 || question.prefers(accountId, existing))) {
    return { key: JSON.stringify([accountId, existing]), folder: { accountId, folderId: existing }, ask: () => question.ask(accountId, existing) };
  }
  return preferringCreated(question, landing);
}

/** The first created folder that carries the preference, asked its first PIN — keyed by the chain down to it. */
function preferringCreated(question: FolderQuestion, { accountId, existing, creates }: Landing): Asking | undefined {
  const at = creates.findIndex((seg) => seg.folderAsksForPin === true);
  if (at < 0) {
    return undefined;
  }
  const chain = creates.slice(0, at + 1).map((seg) => seg.name);
  return { key: JSON.stringify([accountId, existing, ...chain]), folder: { accountId, folderId: '', name: chain[at] }, ask: () => question.first(accountId, chain[at]) };
}

/** A folder's name for a sentence: its own when the arrival creates it, the node's otherwise, `''` for none. */
export function folderNameOf(storage: StorageManager, folder: FolderRef | undefined): string {
  return folder?.name ?? nodeName(storage, folder);
}

function nodeName(storage: StorageManager, folder: FolderRef | undefined): string {
  return folder === undefined ? '' : (storage.getNode(folder.accountId, folder.folderId)?.name ?? '');
}

/** An answer's kind — `failed` for a question that rejected, which is neither a PIN nor a decline. */
function kindOf(answer: Promise<CreatePin>): Promise<CreatePin['kind'] | 'failed'> {
  return answer.then((pin) => pin.kind, () => 'failed' as const);
}

/** Why an arrival into this folder wrote nothing — the sentence a declined landing says. */
export function declinedLanding(folderName: string): string {
  return `the folder "${folderName}" asks for a PIN on every entry in it, and none was given`;
}
