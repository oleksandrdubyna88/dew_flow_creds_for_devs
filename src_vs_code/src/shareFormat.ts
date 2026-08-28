import { resolveKind } from './entityKind';
import * as crypto from 'node:crypto';
import { BackupError, openBlob, readBackupShares, sealBlob } from './cryptoUtils';
import { ShareTranscript, SigningKeypair, signShare } from './shareSignature';
import {
  EntityMetadata,
  OwnedShare,
  ShareItem,
  SharePayload,
  StoredAccount,
  isShareItem,
  isSharePayload,
} from './types';

/**
 * Pure helpers for the sharing mechanics — no `vscode` imports, so all of
 * this is unit-testable. Shares live as a PLAINTEXT array in the vault
 * file envelope (next to, never inside, the owner's encrypted payload);
 * each item's content is individually encrypted with
 * scrypt(recipientAccountId + one-time share PIN).
 */

/**
 * Build an encrypted share item bound to `recipientKeyId` — the recipient's
 * accountId (folder transport) or email (server transport); the recipient's
 * side must present the same value to open it.
 */
/**
 * The bytes a signature covers, rebuilt from an item as it sits on disk.
 *
 * <p>`toEmail` is not a field of `ShareItem` — it is where the item was FOUND,
 * which is exactly why it belongs in the transcript: a share copied out of Bob's
 * file into Carol's is being read with a different `toEmail` than it was signed
 * with, and the signature stops matching.</p>
 */
export function shareTranscript(item: ShareItem, toEmail: string): ShareTranscript {
  return {
    shareId: item.id,
    fromEmail: item.fromEmail,
    toEmail: toEmail.toLowerCase(),
    createdAt: item.createdAt,
    senderPublicKey: item.senderPublicKey ?? '',
    kdfN: item.kdfN,
    kdfR: item.kdfR,
    kdfP: item.kdfP,
    data: item.data,
    tag: item.tag,
  };
}

/**
 * The share format that binds the label to the ciphertext (security-review finding 7, shipped
 * 2026-08-28). `fromEmail`, `entityName`, `entityKind` and `createdAt` sit beside the ciphertext
 * in plaintext — a recipient is shown "Accept X from Y" before anything is decrypted — and until
 * this format nothing tied them to what was sealed: a label could be edited after the fact and
 * the item would still open. Now they are GCM additional authenticated data: an edited label
 * breaks decryption instead of changing what the person is shown.
 */
export const SHARE_FORMAT_BOUND = 2;

/**
 * Shares sealed before the bound format carry no AAD and open as they always did, marked as
 * such — until this version, from which they are refused with a request to update the sender
 * (the owner, 2026-08-28: "after N versions, stop opening them").
 */
export const LEGACY_SHARES_UNTIL = '0.85.0';

/** The four label fields, in one canonical byte string — the same on both ends by construction. */
export function shareLabelAad(label: { fromEmail: string; entityName: string; entityKind: string; createdAt: number }): Buffer {
  return Buffer.from(
    JSON.stringify({
      fromEmail: label.fromEmail,
      entityName: label.entityName,
      entityKind: label.entityKind,
      createdAt: label.createdAt,
    }),
    'utf8',
  );
}

/** Whether this item's label is bound to its ciphertext — false for a share from an older build. */
export function shareLabelBound(item: Pick<ShareItem, 'format'>): boolean {
  return item.format === SHARE_FORMAT_BOUND;
}

/** Whether a build of `version` still opens legacy (unbound) shares. */
export function legacyShareAllowed(version: string): boolean {
  return compareVersions(version, LEGACY_SHARES_UNTIL) < 0;
}

/** `major.minor.patch` as three numbers — a missing or unparsable part counts as 0. */
function versionParts(version: string): [number, number, number] {
  const parts = version.split('.').map((part) => Number.parseInt(part, 10));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function compareVersions(a: string, b: string): number {
  const pa = versionParts(a);
  const pb = versionParts(b);
  const first = [0, 1, 2].find((i) => pa[i] !== pb[i]);
  return first === undefined ? 0 : pa[first] - pb[first];
}

export function sealShare(
  payload: SharePayload,
  recipientKeyId: string,
  from: StoredAccount,
  pin: string,
  createdAt: number,
  signing?: SigningKeypair,
  toEmail?: string,
): ShareItem {
  const label = {
    fromEmail: from.email,
    entityName: payload.node.name,
    entityKind: resolveKind(payload.node.details),
    createdAt,
  };
  const blob = sealBlob(payload, recipientKeyId + pin, shareLabelAad(label));
  const item: ShareItem = {
    id: crypto.randomUUID(),
    ...label,
    from: { accountId: from.accountId, email: from.email, provider: from.provider },
    format: SHARE_FORMAT_BOUND,
    ...blob,
  };
  // Unsigned when there is no keypair or no addressee to bind to — the server
  // transport supplies neither, and stamps the sender itself, which is stronger.
  if (signing === undefined || toEmail === undefined) {
    return item;
  }
  const signed: ShareItem = { ...item, senderPublicKey: signing.publicKey };
  return { ...signed, signature: signShare(signing.privateKey, shareTranscript(signed, toEmail)) };
}

/** Decrypt a share item. Throws BackupError; validates the payload shape. */
/**
 * Open a share. A bound item is opened with its label as AAD — an edited label fails here, as a
 * wrong PIN does. A legacy item opens without, while `currentVersion` still allows it.
 */
export function openShare(
  item: ShareItem,
  recipientKeyId: string,
  pin: string,
  currentVersion: string = '0.0.0',
): SharePayload {
  refuseStaleLegacy(item, currentVersion);
  const payload = openBlob(item, recipientKeyId + pin, aadFor(item));
  if (!isSharePayload(payload)) {
    throw new BackupError('corrupted', 'The shared item does not match the expected schema.');
  }
  return payload;
}

/** The AAD a bound item was sealed with; nothing for a legacy one. */
function aadFor(item: ShareItem): Buffer | undefined {
  return shareLabelBound(item) ? shareLabelAad(item) : undefined;
}

/** A legacy share past `LEGACY_SHARES_UNTIL` is refused with the one useful sentence. */
function refuseStaleLegacy(item: ShareItem, currentVersion: string): void {
  if (!shareLabelBound(item) && !legacyShareAllowed(currentVersion)) {
    throw new BackupError(
      'unsupported-version',
      'This share was sent by an extension older than 0.82 and can no longer be opened — ask the sender to update CredsForDevs and share again.',
    );
  }
}

/** Read + validate the shares array of a vault file (no decryption). */
export function sharesFromEnvelope(fileContent: string): ShareItem[] {
  try {
    return readBackupShares(fileContent).filter(isShareItem);
  } catch {
    return [];
  }
}

/**
 * Rewrite a vault file's plaintext `shares` array WITHOUT touching any
 * other envelope field (the owner's encrypted payload is carried verbatim).
 */
// eslint-disable-next-line complexity
export function envelopeWithShares(
  fileContent: string,
  mutate: (current: ShareItem[]) => ShareItem[],
): string {
  const env = JSON.parse(fileContent) as Record<string, unknown>;
  if (env === null || typeof env !== 'object' || typeof env.format !== 'string') {
    throw new Error('Not a vault file.');
  }
  const current = Array.isArray(env.shares) ? env.shares.filter(isShareItem) : [];
  const next = mutate(current);
  const copy = { ...env };
  if (next.length > 0) {
    copy.shares = next;
  } else {
    delete copy.shares;
  }
  return JSON.stringify(copy, null, 2);
}

export interface ResolveResult {
  opened: Array<OwnedShare & { payload: SharePayload }>;
  remaining: OwnedShare[];
}

/**
 * The accept-all round: try every known PIN on every remaining item.
 * Items that open move to `opened`; the caller prompts for another PIN for
 * `remaining[0]` and calls again, until done or the user gives up.
 */
// eslint-disable-next-line complexity
export function resolveShares(items: OwnedShare[], pins: readonly string[], currentVersion = '0.0.0'): ResolveResult {
  const opened: ResolveResult['opened'] = [];
  const remaining: OwnedShare[] = [];
  for (const owned of items) {
    let payload: SharePayload | undefined;
    for (const pin of pins) {
      try {
        payload = openShare(owned.item, owned.shareKeyId, pin, currentVersion);
        break;
      } catch {
        // wrong pin for this item — try the next one
      }
    }
    if (payload !== undefined) {
      opened.push({ ...owned, payload });
    } else {
      remaining.push(owned);
    }
  }
  return { opened, remaining };
}

/**
 * The metadata a shared copy carries — which is the stored metadata minus everything that only
 * means something inside the vault it left.
 *
 * <p>Five fields go, each for its own reason. <b>`notes`</b> is a secret and travels in the
 * sealed payload, not here. <b>`dependsOn`</b> names entity ids in the SENDER's vault: in the
 * recipient's they address nothing, so the lazy resolver would show them a permanent "no longer
 * exists" for a relationship that was never theirs. <b>`depColor`</b> goes with it, because a
 * colour is a statement about the other entries that need this one — and none of those are being
 * sent.</p>
 *
 * <p><b>`mcp` and `mcpCreatedByAgent` are the expensive pair.</b> They say what an AGENT may do
 * with this entry, and they are a decision the sender made about the sender's own machine.
 * Shipped as they are, an entry arrives in somebody else's vault already authorised for
 * somebody else's agent — a permission granted by a person who was never asked, to software they
 * have not seen. Sharing is how a credential reaches a colleague; it must not also be how an
 * agent reaches one.</p>
 *
 * <p><b>`configKeyHash` is the sixth, and it is the one this file's last paragraph predicted.</b> A
 * config key is minted by ONE window for ONE vault, and only its hash is kept. Shipped as it is,
 * the recipient's entry claims a key they were never given, cannot use, and — worse — cannot
 * revoke, because revoking clears a hash whose key lives in somebody else's clipboard. They enable
 * code access themselves and get their own.</p>
 *
 * <p>Here rather than inline in `shareInbox.ts` so that "what leaves this vault" is one pure
 * function with a test, instead of a spread nobody would notice a new field being absent from.
 * A field added to `EntityMetadata` travels by default; making it NOT travel is the decision
 * that has to be visible.</p>
 */
export function shareableDetails(
  details: EntityMetadata | undefined,
  includeTotp: boolean,
): EntityMetadata | undefined {
  if (details === undefined) {
    return undefined;
  }
  return {
    ...details,
    notes: undefined,
    dependsOn: undefined,
    depColor: undefined,
    mcp: undefined,
    mcpCreatedByAgent: undefined,
    configKeyHash: undefined,
    // The seventh, and the only CONDITIONAL one: `hasTotp` is a claim about a secret that may or
    // may not be travelling in this share, and the flag must say which. Sent with the seed left
    // behind, it gives the recipient a tree row offering *Copy One-Time Code* on an entry that
    // has no seed to compute one from — a promise the entry cannot keep.
    hasTotp: includeTotp ? details.hasTotp : undefined,
  };
}
