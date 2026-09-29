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

import type { RevisionSecrets } from './revisionHistory';
import { StorageManager } from './storageManager';

export interface SecretSlot {
  /** What this slot is called when a person is told about it. */
  readonly label: string;
  /**
   * The field a kept revision holds this slot under (`RevisionSecrets`), so a restore and the
   * history rewrite walk THIS table rather than a second list of ten names that drifts from it.
   * `slotTable.test.ts` asserts the ten against `revisionHistory.SMALL_FIELDS`.
   */
  readonly revisionField: keyof RevisionSecrets;
  readonly read: (storage: StorageManager, accountId: string, entityId: string) => Thenable<string | undefined>;
  readonly write: (storage: StorageManager, accountId: string, entityId: string, value: string) => Promise<void>;
  /**
   * Empty the slot — through the deleter the slot really has. Written down per slot because the
   * setters disagree about what nothing means: `setNotes(undefined)` deletes, `setPassword('')`
   * KEEPS, so a restore that "wrote nothing" to remove a value the version lacked would leave the
   * password exactly where it was. Only the password's own `deletePassword` removes it.
   */
  readonly remove: (storage: StorageManager, accountId: string, entityId: string) => Promise<void>;
}

export const SECRET_SLOTS: readonly SecretSlot[] = [
  {
    label: 'notes',
    revisionField: 'notes',
    read: (s, a, e) => s.getNotes(a, e),
    write: (s, a, e, v) => s.setNotes(a, e, v),
    remove: (s, a, e) => s.setNotes(a, e, undefined),
  },
  {
    label: 'login and URL',
    revisionField: 'fields',
    read: (s, a, e) => s.getFieldsRaw(a, e),
    write: (s, a, e, v) => s.setFieldsRaw(a, e, v),
    remove: (s, a, e) => s.setFieldsRaw(a, e, undefined),
  },
  {
    // A second value is a secret like any other here: wrapped under the entry's PIN with the rest,
    // and every walker of this table gets it without a line written anywhere else.
    label: 'second values',
    revisionField: 'second',
    read: (s, a, e) => s.getSecondRaw(a, e),
    write: (s, a, e, v) => s.setSecondRaw(a, e, v),
    remove: (s, a, e) => s.setSecondRaw(a, e, undefined),
  },
  {
    label: 'payment details',
    revisionField: 'payment',
    read: (s, a, e) => s.getPaymentRaw(a, e),
    write: (s, a, e, v) => s.setPaymentRaw(a, e, v),
    remove: (s, a, e) => s.setPaymentRaw(a, e, undefined),
  },
  {
    label: 'config body',
    revisionField: 'config',
    read: (s, a, e) => s.getConfigBody(a, e),
    write: (s, a, e, v) => s.setConfigBody(a, e, v),
    remove: (s, a, e) => s.setConfigBody(a, e, undefined),
  },
  {
    label: 'database connection',
    revisionField: 'dbConnection',
    read: (s, a, e) => s.getDbConnection(a, e),
    write: (s, a, e, v) => s.setDbConnection(a, e, v),
    remove: (s, a, e) => s.deleteDbConnection(a, e),
  },
  {
    label: 'VPN configuration',
    revisionField: 'vpnConfig',
    read: (s, a, e) => s.getVpnConfig(a, e),
    write: (s, a, e, v) => s.setVpnConfig(a, e, v),
    remove: (s, a, e) => s.deleteVpnConfig(a, e),
  },
  {
    label: 'one-time-code seed',
    revisionField: 'totp',
    read: (s, a, e) => s.getTotp(a, e),
    write: (s, a, e, v) => s.setTotp(a, e, v),
    remove: (s, a, e) => s.deleteTotp(a, e),
  },
  {
    label: 'private key',
    revisionField: 'privateKey',
    read: (s, a, e) => s.getPrivateKey(a, e),
    write: (s, a, e, v) => s.setPrivateKey(a, e, v),
    remove: (s, a, e) => s.deletePrivateKey(a, e),
  },
  // Last on purpose — see the note above.
  {
    label: 'password',
    revisionField: 'password',
    read: (s, a, e) => s.getPassword(a, e),
    // `setPassword` treats an empty string as "keep what is stored", which is right for a form and
    // wrong here: this writes a value it has just transformed and must never be a no-op. Nothing
    // reaches it empty — a slot with no value is skipped before the write — and `putSecret` is not
    // public, so the guard is the caller's and is asserted.
    write: (s, a, e, v) => s.setPassword(a, e, v),
    // Its DELETER, for the same reason: an empty write keeps.
    remove: (s, a, e) => s.deletePassword(a, e),
  },
];
