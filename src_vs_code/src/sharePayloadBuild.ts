import { StorageManager } from './storageManager';
import { PinGate } from './pinGate';
import { openedText } from './pinAdmission';
import { SharePayload, TreeNode } from './types';
import { shareableDetails } from './shareFormat';
import { redactPaymentForShare } from './paymentRedaction';

/**
 * Reading one entry out of the vault and into a share payload.
 *
 * <p>Its own module because `shareInbox.ts` is at the 800-line ceiling and this is the half of it
 * that is about a VALUE rather than about the conversation around sending it: what travels, what is
 * redacted, and — since the entry PIN — what has to be unwrapped before it can travel at all.</p>
 */
/**
 * Everything an entity carries, packaged for a share.
 *
 * <p><b>`includeTotp` is a parameter and not a default</b> because the one-time-code seed is the
 * only secret here whose sharing is a separate decision. Every other field in this payload is
 * something the recipient needs in order to use what they were given; a TOTP seed is the sender's
 * <i>second factor</i>, and handing it over lets the recipient produce codes for that login for as
 * long as the seed lives. Sometimes that is exactly the intent — a shared service account nobody
 * owns personally — and sometimes it is the last thing the sender meant to do. So the caller asks,
 * and passes the answer here.</p>
 *
 * <p>This used to read every secret except this one, while the accept side wrote
 * `payload.secrets.totp` if it ever arrived — so a shared entry silently lost its second factor
 * while its metadata still said it had one.</p>
 */
export async function buildSharePayload(
  storage: StorageManager,
  accountId: string,
  node: TreeNode,
  includeTotp: boolean,
  /**
   * Set for an entry protected with its own PIN — every value is unwrapped through it.
   *
   * <p>It has to be. What is stored for such an entry is ciphertext under a key only the sender's
   * PIN opens, and the recipient does not have that PIN and must never be given it — the share's
   * own transit PIN is a one-time transfer secret, not somebody's protection. So a payload built
   * from the stored bytes would be gibberish nobody could ever open. The sender types the PIN at
   * share time, which is also what the owner asked for: <i>"и что б пошарить такую запись - нужно
   * тоже в процесе шары ввести пин код (что б случайно не пошарить)"</i>.</p>
   */
  gate?: PinGate,
): Promise<SharePayload> {
  const open = (stored: string | undefined): Promise<string | undefined> =>
    gate === undefined ? Promise.resolve(stored) : openedText(stored, gate);
  const note = (await open(await storage.getNotes(accountId, node.id))) ?? node.details?.notes;
  // Read only when it is going to travel: a seed nobody asked to send has no business being
  // fetched out of the keychain, let alone sealed into a payload.
  const seed = includeTotp ? await open(await storage.getTotp(accountId, node.id)) : undefined;
  // The flag follows the SEED, not the request and not the stored metadata. `hasTotp` is a
  // plaintext convenience that can outlive what it describes, and a copy carrying it over an
  // empty keychain shows the recipient a *Copy One-Time Code* row with nothing behind it. Derived
  // here rather than trusted, so "the flag travels exactly when the seed does" is structural.
  const sharedDetails = shareableDetails(node.details, seed !== undefined);
  return {
    node: { ...node, details: sharedDetails, parentId: null, children: undefined },
    secrets: {
      password: await open(await storage.getPassword(accountId, node.id)),
      privateKey: await open(await storage.getPrivateKey(accountId, node.id)),
      vpnConfig: await open(await storage.getVpnConfig(accountId, node.id)),
      dbConnection: await open(await storage.getDbConnection(accountId, node.id)),
      notes: note,
      totp: seed,
      // Handing a colleague the document IS the feature. Sealed like every other secret here.
      config: await open(await storage.getConfigBody(accountId, node.id)),
      fields: await open(await storage.getFieldsRaw(accountId, node.id)),
      // The ONE stripping direction in the product. Handing a colleague a card is the feature — they
      // need the number and the expiry — and the CVV and the PIN are the two fields that are only
      // ever proof the holder is present, so they do not leave the vault they were typed into.
      // `paymentRedaction.ts` owns the list; this line must not grow a second opinion about it.
      payment: redactPaymentForShare(await open(await storage.getPaymentRaw(accountId, node.id))),
    },
  };
}

/**
 * How many of the selected entries carry a one-time-code seed.
 *
 * <p><b>The flag first, then the keychain.</b> `hasTotp` is a plaintext convenience the tree reads
 * once per row, and it is right almost always — but it is a description of a secret, not the
 * secret, and the two can disagree: an entry written by an older build, an import, an edit to the
 * metadata. A question gated on the flag alone is therefore a question that sometimes never gets
 * asked, and an unasked question is a silent "no": the seed could never be opted IN.</p>
 *
 * <p>So an entry the flag does not vouch for is checked against the keychain. That is a real read
 * per unflagged entry, and it is affordable here for the reason it is not affordable in the tree
 * (audit finding C1): this runs once, on an explicit action, over the handful of rows somebody
 * selected — not on every row of every folder every time one is expanded.</p>
 */
export async function countTotpEntries(
  storage: StorageManager,
  accountId: string,
  nodes: readonly TreeNode[],
): Promise<number> {
  let count = 0;
  for (const entity of entitiesIn(storage, accountId, nodes)) {
    count += (await carriesSeed(storage, accountId, entity)) ? 1 : 0;
  }
  return count;
}

/** Every entity in the selection, folders walked through. */
function entitiesIn(
  storage: StorageManager,
  accountId: string,
  nodes: readonly TreeNode[],
): TreeNode[] {
  const entities: TreeNode[] = [];
  const walk = (node: TreeNode): void => {
    if (node.type === 'entity') {
      entities.push(node);
      return;
    }
    for (const child of storage.getChildren(accountId, node.id)) {
      walk(child);
    }
  };
  for (const node of nodes) {
    walk(node);
  }
  return entities;
}

/** The flag if it vouches for one; otherwise the keychain, which is the truth. */
async function carriesSeed(storage: StorageManager, accountId: string, entity: TreeNode): Promise<boolean> {
  if (entity.details?.hasTotp === true) {
    return true;
  }
  return (await storage.getTotp(accountId, entity.id)) !== undefined;
}

/** What an empty selection says — one folder named, or the plural nobody has to count. */
export function nothingToShare(nodes: readonly TreeNode[]): string {
  return nodes.length === 1
    ? `Folder "${nodes[0].name}" holds no entities — nothing to share.`
    : 'Nothing to share — the selected folders hold no entities.';
}
