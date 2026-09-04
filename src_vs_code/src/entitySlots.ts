/**
 * The secret slots one entry can hold, as a table rather than as nine hand-written pairs.
 *
 * <p>Written once because everything that walks an entry's secrets has to walk the SAME nine, and
 * a tenth slot added to one walker and not the others is a value that silently stops being
 * protected. `protect` and `unprotect` both read this, and so does the count an entry reports about
 * itself.</p>
 *
 * <p><b>Attachments and images are deliberately absent.</b> They are base64 blobs a viewer streams
 * into a webview, sometimes megabytes of them, and wrapping one means holding the whole thing in
 * memory twice to seal it. A PIN on the attachment of an entry whose password is already locked
 * buys nothing an attacker who has the file does not already have — and it would make the wrap slow
 * enough that people stop using it, which costs more than it saves.</p>
 *
 * <p><b>The order matters and is fixed.</b> `SecretStorage` has no transaction, so a process killed
 * part-way through leaves some slots wrapped and some not. The password is LAST on the way in, so
 * an interruption leaves the most-wanted value in the state the person last chose deliberately
 * rather than half-way through a change they did not watch finish. (A reviewer's finding: the plan
 * had claimed an atomicity nothing here can deliver.)</p>
 */

import { StorageManager } from './storageManager';

export interface SecretSlot {
  /** What this slot is called when a person is told about it. */
  readonly label: string;
  readonly read: (storage: StorageManager, accountId: string, entityId: string) => Thenable<string | undefined>;
  readonly write: (storage: StorageManager, accountId: string, entityId: string, value: string) => Promise<void>;
}

export const SECRET_SLOTS: readonly SecretSlot[] = [
  {
    label: 'notes',
    read: (s, a, e) => s.getNotes(a, e),
    write: (s, a, e, v) => s.setNotes(a, e, v),
  },
  {
    label: 'login and URL',
    read: (s, a, e) => s.getFieldsRaw(a, e),
    write: (s, a, e, v) => s.setFieldsRaw(a, e, v),
  },
  {
    label: 'payment details',
    read: (s, a, e) => s.getPaymentRaw(a, e),
    write: (s, a, e, v) => s.setPaymentRaw(a, e, v),
  },
  {
    label: 'config body',
    read: (s, a, e) => s.getConfigBody(a, e),
    write: (s, a, e, v) => s.setConfigBody(a, e, v),
  },
  {
    label: 'database connection',
    read: (s, a, e) => s.getDbConnection(a, e),
    write: (s, a, e, v) => s.setDbConnection(a, e, v),
  },
  {
    label: 'VPN configuration',
    read: (s, a, e) => s.getVpnConfig(a, e),
    write: (s, a, e, v) => s.setVpnConfig(a, e, v),
  },
  {
    label: 'one-time-code seed',
    read: (s, a, e) => s.getTotp(a, e),
    write: (s, a, e, v) => s.setTotp(a, e, v),
  },
  {
    label: 'private key',
    read: (s, a, e) => s.getPrivateKey(a, e),
    write: (s, a, e, v) => s.setPrivateKey(a, e, v),
  },
  // Last on purpose — see the note above.
  {
    label: 'password',
    read: (s, a, e) => s.getPassword(a, e),
    // `setPassword` treats an empty string as "keep what is stored", which is right for a form and
    // wrong here: this writes a value it has just transformed and must never be a no-op. Nothing
    // reaches it empty — a slot with no value is skipped before the write — and `putSecret` is not
    // public, so the guard is the caller's and is asserted.
    write: (s, a, e, v) => s.setPassword(a, e, v),
  },
];
