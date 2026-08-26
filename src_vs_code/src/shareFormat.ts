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

export function sealShare(
  payload: SharePayload,
  recipientKeyId: string,
  from: StoredAccount,
  pin: string,
  createdAt: number,
  signing?: SigningKeypair,
  toEmail?: string,
): ShareItem {
  const blob = sealBlob(payload, recipientKeyId + pin);
  const item: ShareItem = {
    id: crypto.randomUUID(),
    fromEmail: from.email,
    from: { accountId: from.accountId, email: from.email, provider: from.provider },
    entityName: payload.node.name,
    entityKind: resolveKind(payload.node.details),
    createdAt,
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
export function openShare(
  item: ShareItem,
  recipientKeyId: string,
  pin: string,
): SharePayload {
  const payload = openBlob(item, recipientKeyId + pin);
  if (!isSharePayload(payload)) {
    throw new BackupError('corrupted', 'The shared item does not match the expected schema.');
  }
  return payload;
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
export function resolveShares(items: OwnedShare[], pins: readonly string[]): ResolveResult {
  const opened: ResolveResult['opened'] = [];
  const remaining: OwnedShare[] = [];
  for (const owned of items) {
    let payload: SharePayload | undefined;
    for (const pin of pins) {
      try {
        payload = openShare(owned.item, owned.shareKeyId, pin);
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
 * <p>Here rather than inline in `shareInbox.ts` so that "what leaves this vault" is one pure
 * function with a test, instead of a spread nobody would notice a new field being absent from.
 * A field added to `EntityMetadata` travels by default; making it NOT travel is the decision
 * that has to be visible.</p>
 */
export function shareableDetails(
  details: EntityMetadata | undefined,
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
  };
}
