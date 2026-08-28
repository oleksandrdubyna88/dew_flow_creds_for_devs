import { EntityMetadata, isEntityMetadata } from './types';

/**
 * The last few versions of an entity, so a change can be looked at and undone by hand.
 *
 * <p>Two limits stated here rather than discovered later:</p>
 *
 * <p><b>Three revisions.</b> A cap, not a journal — the question this answers is "what did
 * this look like before somebody changed it", which the last few versions answer and an
 * unbounded log does not.</p>
 *
 * <p><b>No attachments in a revision.</b> Files and images are capped at 4 MB each; three
 * copies of them per entity would multiply the vault by more than the history is worth.
 * A revision carries the metadata and the small secrets — password, key, VPN config,
 * connection string, notes.</p>
 *
 * <p>And one property worth being blunt about: history means an OLD password stays
 * retrievable after it was replaced. That is the point of the feature, and it is also a
 * fact to know before turning it on — it is why the revisions live in the same encrypted
 * store as the current secrets and never anywhere looser.</p>
 */

export const MAX_REVISIONS = 3;

/** The small secret fields a revision keeps. Attachments are deliberately absent. */
export interface RevisionSecrets {
  password?: string;
  privateKey?: string;
  vpnConfig?: string;
  dbConnection?: string;
  notes?: string;
  /** The canonical `otpauth://` URI — a replaced seed is still a seed. */
  totp?: string;
  /** The config file's previous contents — an edit that breaks a config must be undoable. */
  config?: string;
  /** The login/URL JSON as it was. */
  fields?: string;
}

export interface Revision {
  /** When this version was replaced (ms epoch). */
  at: number;
  /** The name it had then — a rename is one of the things people look history up for. */
  name: string;
  details: EntityMetadata;
  secrets: RevisionSecrets;
}

/**
 * A revision without its secrets — what the TREE needs to draw a history row.
 *
 * <p>The tree caches history in extension-host memory for the whole session so that a row
 * can be built synchronously. Caching full revisions would keep every replaced password
 * resident for hours; the head keeps the date, the name and the metadata, and a handler that
 * needs the secret reads the revision from SecretStorage at that moment.</p>
 */
export type RevisionHead = Omit<Revision, 'secrets'>;

export function revisionHead(revision: Revision): RevisionHead {
  const { secrets: _secrets, ...head } = revision;
  return head;
}

const SMALL_FIELDS = ['password', 'privateKey', 'vpnConfig', 'dbConnection', 'notes', 'totp', 'config', 'fields'] as const;

/** A copy of the list with `revision` newest-first, capped, attachments stripped. */
export function pushRevision(list: readonly Revision[], revision: Revision): Revision[] {
  const secrets: RevisionSecrets = {};
  for (const field of SMALL_FIELDS) {
    const value = (revision.secrets as Record<string, unknown>)[field];
    if (typeof value === 'string' && value.length > 0) {
      secrets[field] = value;
    }
  }
  return [{ ...revision, secrets }, ...list].slice(0, MAX_REVISIONS);
}

/** One line for a picker: when it was replaced, and what it was called then. */
export function summarizeRevision(revision: RevisionHead): string {
  return `${new Date(revision.at).toLocaleString()} — "${revision.name}"`;
}

/**
 * Whether a value read back from storage is a revision list.
 *
 * <p>It arrives as JSON that a previous version of this extension wrote; reading it
 * optimistically is how one malformed record takes out the whole history view.</p>
 */
export function isRevisionList(value: unknown): value is Revision[] {
  return (
    Array.isArray(value) &&
    value.every(
      // eslint-disable-next-line complexity
      (r) =>
        typeof r === 'object' &&
        r !== null &&
        typeof (r as Revision).at === 'number' &&
        typeof (r as Revision).name === 'string' &&
        isEntityMetadata((r as Revision).details) &&
        typeof (r as Revision).secrets === 'object' &&
        (r as Revision).secrets !== null,
    )
  );
}
