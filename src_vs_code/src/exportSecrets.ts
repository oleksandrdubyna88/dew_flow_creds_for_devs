import { ExternalSecrets } from './externalBundle';
import { parseFields } from './entityFields';
import { PinGate, PinOpen, openStored, silentPinGate } from './pinGate';
import { plainSecret, readSecret } from './secretEnvelope';
import { StoredSecret, seamText } from './storedSecret';
import { TreeNode } from './types';

/** The nine secret readers the export walks — the storage, by the part of it this needs. */
export interface SecretReader {
  getPassword(accountId: string, id: string): Thenable<string | undefined>;
  getPrivateKey(accountId: string, id: string): Thenable<StoredSecret | undefined>;
  getVpnConfig(accountId: string, id: string): Thenable<StoredSecret | undefined>;
  getDbConnection(accountId: string, id: string): Thenable<StoredSecret | undefined>;
  getNotes(accountId: string, id: string): Thenable<StoredSecret | undefined>;
  getAttachment(accountId: string, id: string): Thenable<string | undefined>;
  getImage(accountId: string, id: string): Thenable<string | undefined>;
  getTotp(accountId: string, id: string): Thenable<StoredSecret | undefined>;
  getConfigBody(accountId: string, id: string): Thenable<StoredSecret | undefined>;
  getFieldsRaw(accountId: string, id: string): Thenable<StoredSecret | undefined>;
  getSecondRaw(accountId: string, id: string): Thenable<StoredSecret | undefined>;
  getPaymentRaw(accountId: string, id: string): Thenable<StoredSecret | undefined>;
}

/**
 * One stored value of one entity, as it goes into the file — opened, or a throw; never an envelope.
 *
 * <p>Entry-PIN plan, D8: the envelope is bound to THIS account and could not be opened at the other
 * end, so a sealed value goes in opened, protected by the file's own password. `exportOpener` opens
 * with the grant the export's door left (a silent gate: the door has asked already) and throws on a
 * value no grant opens, which the command answers "Export failed… Nothing was written."</p>
 */
export type ExportOpen = (stored: StoredSecret | string | undefined, entityId: string) => Promise<string | undefined>;

/**
 * The export's opener. A value that is not sealed goes in BYTE-IDENTICAL — a woven password keeps its
 * envelope, so the import restores the mark — and a sealed one is opened and re-marked woven if it
 * was. `nameOf` names the entry in the refusal.
 */
export function exportOpener(accountId: string, nameOf: (entityId: string) => string = (id) => id): ExportOpen {
  return async (stored, entityId) => {
    const read = readSecret(stored);
    if (read.kind === 'value' || read.kind === 'absent') {
      return seamText(stored);
    }
    return openedForFile(stored, read.kind === 'locked' && read.woven, silentPinGate(accountId, entityId, nameOf(entityId)));
  };
}

/** A sealed (or damaged) value, opened with the grant — or the throw that stops the whole export. */
async function openedForFile(stored: StoredSecret | string | undefined, woven: boolean, gate: PinGate): Promise<string> {
  const opened = await openStored(stored, gate);
  if (opened.kind !== 'value') {
    throw new Error(notOpened(opened, gate.entryName));
  }
  return plainSecret(opened.value, woven);
}

/** Why the file cannot be written — ending where the command adds ". Nothing was written." */
function notOpened(opened: PinOpen, name: string): string {
  return opened.kind === 'corrupt'
    ? opened.reason.replace(/.$/, '')
    : `"${name}" is protected with its own PIN, and one of its values did not open with the PIN given for it`;
}

/**
 * Every stored secret of the given entities, keyed by entity id — a kind an entity does
 * not have is simply absent. The external-export path used to walk the seven kinds by
 * hand right beside `exportBundle`'s own walk (audit 2026-08-25, A1); a kind added to
 * one loop and not the other would have exported silently incomplete files.
 *
 * <p>Every value goes through `open` (above) — the attachment and the image excepted, which are
 * outside the PIN (`entitySlots.ts`) and are handed through as stored.</p>
 */
export async function exportSecretsFor(
  vault: SecretReader,
  accountId: string,
  entityIds: readonly string[],
  open: ExportOpen = exportOpener(accountId),
): Promise<Record<string, ExternalSecrets>> {
  const out: Record<string, ExternalSecrets> = {};
  for (const id of entityIds) {
    out[id] = await secretsOf(vault, accountId, id, (stored) => open(stored, id));
  }
  return out;
}

async function secretsOf(
  vault: SecretReader,
  accountId: string,
  id: string,
  open: (stored: StoredSecret | string | undefined) => Promise<string | undefined>,
): Promise<ExternalSecrets> {
  const s: ExternalSecrets = {};
  const put = <K extends keyof ExternalSecrets>(key: K, value: string | undefined): void => {
    if (value !== undefined) {
      s[key] = value;
    }
  };
  const opened = async (read: Thenable<StoredSecret | string | undefined>): Promise<string | undefined> => open(await read);
  put('password', await opened(vault.getPassword(accountId, id)));
  put('privateKey', await opened(vault.getPrivateKey(accountId, id)));
  put('vpnConfig', await opened(vault.getVpnConfig(accountId, id)));
  put('dbConnection', await opened(vault.getDbConnection(accountId, id)));
  put('notes', await opened(vault.getNotes(accountId, id)));
  put('attachment', await vault.getAttachment(accountId, id));
  put('image', await vault.getImage(accountId, id));
  put('totp', await opened(vault.getTotp(accountId, id)));
  put('config', await opened(vault.getConfigBody(accountId, id)));
  // The whole record, CVV and PIN included — see ExternalSecrets.payment for why.
  put('payment', await opened(vault.getPaymentRaw(accountId, id)));
  // The whole record of second values too. An export is a full, deliberate copy — it already
  // carries private keys and a CVV — and one that silently left a value behind would be a restore
  // that quietly loses half of what somebody typed.
  put('second', await opened(vault.getSecondRaw(accountId, id)));
  // Opened BEFORE it is parsed: an envelope parses as `{}`, which dropped a protected entry's
  // login and URL from every export (D8).
  const fields = parseFields(await opened(vault.getFieldsRaw(accountId, id)));
  put('login', fields.login);
  put('url', fields.url);
  return s;
}

/**
 * A node as it goes into the file: without the PIN claim. The values in the file are opened, and the
 * PIN that sealed them is this person's — a copy that claimed one would hide itself from the
 * recipient's agents and offer a Remove-PIN that has nothing to remove.
 */
export function exportedNode(node: TreeNode): TreeNode {
  return node.details?.pinProtected === true ? { ...node, details: { ...node.details, pinProtected: undefined } } : node;
}
