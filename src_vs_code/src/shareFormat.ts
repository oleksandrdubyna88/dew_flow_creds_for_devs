import { withoutSecretClaims } from './secretClaims';
import { resolveKind } from './entityKind';
import * as crypto from 'node:crypto';
import { BackupError, openBlob, readBackupShares, sealBlob } from './cryptoUtils';
import { ShareTranscript, SigningKeypair, signShare } from './shareSignature';
import {
  EntityKind,
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
 * The form a share takes over the **vault server** (0.88.0).
 *
 * <p>The bound form cannot travel here, and finding that out cost the server transport six days
 * of total breakage. Its AAD covers `fromEmail` and `createdAt`, and those are precisely the two
 * fields `POST /api/shares` does not accept from a client: the server stamps the sender from the
 * verified token and the time from its own clock, which is the difference between this transport
 * and a shared folder. An AAD over fields the transport rewrites is an AAD the recipient can
 * never recompute — every server share sealed between 0.82.1 and 0.87 is unopenable.</p>
 *
 * <p>So this form binds only what the sender controls AND the server carries verbatim:
 * `entityName` and `entityKind`. The other two lose nothing by leaving — a token stamp is a
 * stronger claim about the sender than a tag the sender computed itself.</p>
 *
 * <p><b>Only ever honoured for an item that came from a vault server.</b> Off one, it is the
 * shape of security-review finding 7: an AAD that does not cover `fromEmail`, on a transport
 * where anyone with write access can choose one.</p>
 */
export const SHARE_FORMAT_SERVER = 3;

/**
 * Shares sealed before the bound format carry no AAD and open as they always did, marked as
 * such — until this version, from which they are refused with a request to update the sender
 * (the owner, 2026-08-28: "after N versions, stop opening them").
 */
export const LEGACY_SHARES_UNTIL = '0.85.0';

/**
 * Which fields a share's AAD covers. A property of the TRANSPORT the share is going through,
 * never of the payload — see `SHARE_FORMAT_SERVER` for why the two cannot share one answer.
 */
export type ShareForm = 'bound' | 'server' | 'legacy';

/** The plaintext a recipient is shown before anything is decrypted. */
export interface ShareLabel {
  fromEmail: string;
  entityName: string;
  entityKind: EntityKind;
  createdAt: number;
}

/**
 * The label fields this form binds, in one canonical byte string — the same on both ends by
 * construction. `legacy` binds nothing, which is what makes it legacy.
 */
export function shareLabelAad(label: ShareLabel, form: ShareForm = 'bound'): Buffer | undefined {
  if (form === 'legacy') {
    return undefined;
  }
  const bound =
    form === 'server'
      ? { entityName: label.entityName, entityKind: label.entityKind }
      : {
          fromEmail: label.fromEmail,
          entityName: label.entityName,
          entityKind: label.entityKind,
          createdAt: label.createdAt,
        };
  return Buffer.from(JSON.stringify(bound), 'utf8');
}

/** Whether this item's label is bound to its ciphertext — false for a share from an older build. */
export function shareLabelBound(item: Pick<ShareItem, 'format'>): boolean {
  return item.format === SHARE_FORMAT_BOUND;
}

/**
 * Whether the label a recipient is SHOWN is backed by anything at all.
 *
 * <p>Two different things can back it, and the UI must not confuse "unbound" with "unverified".
 * A folder share is backed by its AAD; a server share is backed by the token the server stamped
 * it from — and calling the second one *label not bound* would put a warning on the transport
 * that needs it least.</p>
 */
export function shareLabelTrusted(item: Pick<ShareItem, 'format'>, serverStamped: boolean): boolean {
  return serverStamped || shareLabelBound(item);
}

/** The form an item on the wire was sealed in. */
export function shareFormOf(item: Pick<ShareItem, 'format'>): ShareForm {
  if (item.format === SHARE_FORMAT_BOUND) {
    return 'bound';
  }
  return item.format === SHARE_FORMAT_SERVER ? 'server' : 'legacy';
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

/** Everything about sealing a share that the TRANSPORT decides rather than the payload. */
export interface SealOptions {
  /** Which binding form to seal in. Defaults to the folder form. */
  readonly form?: ShareForm;
  readonly signing?: SigningKeypair;
  readonly toEmail?: string;
}

export function sealShare(
  payload: SharePayload,
  recipientKeyId: string,
  from: StoredAccount,
  pin: string,
  createdAt: number,
  options: SealOptions = {},
): ShareItem {
  const form = options.form ?? 'bound';
  const label: ShareLabel = {
    fromEmail: from.email,
    entityName: payload.node.name,
    entityKind: resolveKind(payload.node.details),
    createdAt,
  };
  const blob = sealBlob(payload, recipientKeyId + pin, shareLabelAad(label, form));
  const item: ShareItem = {
    id: crypto.randomUUID(),
    ...label,
    from: { accountId: from.accountId, email: from.email, provider: from.provider },
    ...formatFieldOf(form),
    ...blob,
  };
  return signedIfPossible(item, options);
}

/**
 * The item with its sender signature, where one can be made.
 *
 * <p>Unsigned when there is no keypair or no addressee to bind to — the server transport supplies
 * neither, and stamps the sender itself, which is stronger.</p>
 */
function signedIfPossible(item: ShareItem, options: SealOptions): ShareItem {
  const { signing, toEmail } = options;
  if (signing === undefined || toEmail === undefined) {
    return item;
  }
  const signed: ShareItem = { ...item, senderPublicKey: signing.publicKey };
  return { ...signed, signature: signShare(signing.privateKey, shareTranscript(signed, toEmail)) };
}

/** The `format` field a form writes. `legacy` writes none — that absence IS the legacy marker. */
function formatFieldOf(form: ShareForm): { format?: number } {
  if (form === 'bound') {
    return { format: SHARE_FORMAT_BOUND };
  }
  return form === 'server' ? { format: SHARE_FORMAT_SERVER } : {};
}

/** Decrypt a share item. Throws BackupError; validates the payload shape. */
/**
 * Open a share. A bound item is opened with its label as AAD — an edited label fails here, as a
 * wrong PIN does. A legacy item opens without, while `currentVersion` still allows it.
 *
 * <p>`serverStamped` says the item was read out of a vault server's inbox, which decides two
 * things nothing in the item itself can: the server form is honoured only there, and the legacy
 * refusal is never applied there — a token-stamped label is not the unverifiable claim that
 * refusal exists to stop, and a server older than contract 2 carries no `format` at all.</p>
 */
export function openShare(
  item: ShareItem,
  recipientKeyId: string,
  pin: string,
  currentVersion: string = '0.0.0',
  serverStamped: boolean = false,
): SharePayload {
  refuseUnopenable(item, currentVersion, serverStamped);
  const payload = openBlob(item, recipientKeyId + pin, shareLabelAad(item, shareFormOf(item)));
  if (!isSharePayload(payload)) {
    throw new BackupError('corrupted', 'The shared item does not match the expected schema.');
  }
  return payload;
}

/** The two refusals that happen before any key is derived. */
function refuseUnopenable(item: ShareItem, currentVersion: string, serverStamped: boolean): void {
  if (item.format === SHARE_FORMAT_SERVER && !serverStamped) {
    throw new BackupError(
      'unsupported-version',
      'This share is in the vault-server form but did not come from a vault server. Only a server can stamp the sender it leaves unbound, so it is refused.',
    );
  }
  refuseStaleLegacy(item, currentVersion, serverStamped);
}

/** A legacy share past `LEGACY_SHARES_UNTIL` is refused with the one useful sentence. */
function refuseStaleLegacy(item: ShareItem, currentVersion: string, serverStamped: boolean): void {
  const openable = serverStamped || shareLabelBound(item) || legacyShareAllowed(currentVersion);
  if (!openable) {
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
export function resolveShares(
  items: OwnedShare[],
  pins: readonly string[],
  currentVersion = '0.0.0',
  /** Per ITEM, because one round can span a folder account and a server account at once. */
  serverStamped: (share: OwnedShare) => boolean = () => false,
): ResolveResult {
  const opened: ResolveResult['opened'] = [];
  const remaining: OwnedShare[] = [];
  for (const owned of items) {
    let payload: SharePayload | undefined;
    for (const pin of pins) {
      try {
        payload = openShare(owned.item, owned.shareKeyId, pin, currentVersion, serverStamped(owned));
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
    // Every claim about a stored secret goes, from the one table — see `secretClaims.ts`. This used
    // to be a hand-written list here and it had drifted: `SharePayload.secrets` has no attachment or
    // image field at all, so that content STRUCTURALLY cannot travel, while its file name, size and
    // "changed by" attribution did. The recipient got a download row for a file nobody sent.
    ...withoutSecretClaims(details),
    notes: undefined,
    dependsOn: undefined,
    depColor: undefined,
    mcp: undefined,
    mcpCreatedByAgent: undefined,
    // The one CONDITIONAL claim: the seed may or may not be travelling in this share, and the flag
    // must say which. Sent with the seed left behind, it gives the recipient a tree row offering
    // *Copy One-Time Code* on an entry that has no seed to compute one from.
    hasTotp: includeTotp ? details.hasTotp : undefined,
  };
}
