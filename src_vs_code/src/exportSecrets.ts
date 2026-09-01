import { ExternalSecrets } from './externalBundle';
import { parseFields } from './entityFields';

/** The nine secret readers the export walks — the storage, by the part of it this needs. */
export interface SecretReader {
  getPassword(accountId: string, id: string): Thenable<string | undefined>;
  getPrivateKey(accountId: string, id: string): Thenable<string | undefined>;
  getVpnConfig(accountId: string, id: string): Thenable<string | undefined>;
  getDbConnection(accountId: string, id: string): Thenable<string | undefined>;
  getNotes(accountId: string, id: string): Thenable<string | undefined>;
  getAttachment(accountId: string, id: string): Thenable<string | undefined>;
  getImage(accountId: string, id: string): Thenable<string | undefined>;
  getTotp(accountId: string, id: string): Thenable<string | undefined>;
  getConfigBody(accountId: string, id: string): Thenable<string | undefined>;
  getFieldsRaw(accountId: string, id: string): Thenable<string | undefined>;
  getPaymentRaw(accountId: string, id: string): Thenable<string | undefined>;
}

/**
 * Every stored secret of the given entities, keyed by entity id — a kind an entity does
 * not have is simply absent. The external-export path used to walk the seven kinds by
 * hand right beside `exportBundle`'s own walk (audit 2026-08-25, A1); a kind added to
 * one loop and not the other would have exported silently incomplete files.
 */
export async function exportSecretsFor(
vault: SecretReader,
accountId: string,
entityIds: readonly string[],
): Promise<Record<string, ExternalSecrets>> {
  const out: Record<string, ExternalSecrets> = {};
  for (const id of entityIds) {
    const s: ExternalSecrets = {};
    const put = <K extends keyof ExternalSecrets>(key: K, value: string | undefined): void => {
      if (value !== undefined) {
        s[key] = value;
      }
    };
    put('password', await vault.getPassword(accountId, id));
    put('privateKey', await vault.getPrivateKey(accountId, id));
    put('vpnConfig', await vault.getVpnConfig(accountId, id));
    put('dbConnection', await vault.getDbConnection(accountId, id));
    put('notes', await vault.getNotes(accountId, id));
    put('attachment', await vault.getAttachment(accountId, id));
    put('image', await vault.getImage(accountId, id));
    put('totp', await vault.getTotp(accountId, id));
    put('config', await vault.getConfigBody(accountId, id));
    // The whole record, CVV and PIN included — see ExternalSecrets.payment for why.
    put('payment', await vault.getPaymentRaw(accountId, id));
    const fields = parseFields(await vault.getFieldsRaw(accountId, id));
    put('login', fields.login);
    put('url', fields.url);
    out[id] = s;
  }
  return out;
}

