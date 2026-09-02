/**
 * The grammar of a `SecretStorage` key, and the escape that makes it unambiguous.
 *
 * <p>Extracted from `storageManager.ts` while the `payment` secret was being added, for the reason
 * `typeGuards.ts` was extracted from `types.ts`: that file is exempted from the 800-line ceiling and
 * the ratchet lets an exempted file SHRINK, never grow, so a new secret kind could not add a line to
 * it. These functions are the obvious tenants — pure, `vscode`-free string builders that read
 * nothing off the manager and that nothing else in the file wants to be near.</p>
 *
 * <p>They also belong together on their own merit: every one of them is one line of the same
 * concatenation, and the ONE thing that makes that concatenation safe — `keyPart` — is a security
 * boundary with a real exploit behind it, described below. A reader auditing that boundary should
 * find every key built through it in one place, not spread down a 1100-line class.</p>
 */

/**
 * The entity-id part of a SecretStorage key.
 *
 * <p>These keys are built by concatenation — `${accountId}_${entityId}`, with a `:sshPrivateKey`
 * / `:vpnConfig` / `:notes` / … suffix for every kind but the password — and concatenation
 * without an escape is ambiguous. The ambiguity was reachable: an entity whose id is
 * `x:sshPrivateKey` produced exactly the key that holds entity `x`'s PRIVATE KEY, so saving the
 * crafted entity's password destroyed a real key and reading that key back returned the
 * attacker's password, with no error anywhere.</p>
 *
 * <p>Ordinary ids are uuids, so accepting a share cannot reach this (`shareInbox` mints a fresh
 * local id) — but import and restore write an envelope's nodes with their own ids.</p>
 *
 * <p><b>Only the three separator characters are escaped, and a uuid contains none of them</b>,
 * so every key an installed build already wrote is unchanged. `%` is escaped first and for that
 * exact reason: without it an entity literally named `x%3AsshPrivateKey` would encode onto the
 * same key as one named `x:sshPrivateKey`, trading one collision for another.</p>
 */
export function keyPart(entityId: string): string {
  return entityId.replace(/%/g, '%25').replace(/:/g, '%3A').replace(/_/g, '%5F');
}

/** Tenant-scoped SecretStorage key: `${accountId}_${entityId}`. */
export function secretKey(accountId: string, entityId: string): string {
  return `${accountId}_${keyPart(entityId)}`;
}

/** One entity's key for one suffixed kind — every builder below is this, named. */
function suffixed(accountId: string, entityId: string, suffix: string): string {
  return `${accountId}_${keyPart(entityId)}:${suffix}`;
}

/** SecretStorage key for an entity's SSH private key content. */
export function privateKeySecretKey(accountId: string, entityId: string): string {
  return suffixed(accountId, entityId, 'sshPrivateKey');
}

/**
 * The account's own Ed25519 signing identity for shares on the folder transport.
 * Keyed by account, not by entity — it identifies the signer, not a credential.
 */
export function signingKeySecretKey(accountId: string): string {
  return `${accountId}:shareSigningKey`;
}

/**
 * This officer's share of the organisation's recovery key.
 *
 * <p>Keyed by account like the signing identity, and in SecretStorage rather than in the vault
 * payload for one reason worth stating: the payload syncs to a server, and a share that syncs
 * is a share sitting beside the very escrow wraps it exists to open. On the OS keychain it
 * stays on the machines its owner actually uses — which is also why accepting an invite is
 * something an officer does once per machine rather than once.</p>
 */
export function orgEscrowShareSecretKey(accountId: string): string {
  return `${accountId}:orgEscrowShare`;
}

/** SecretStorage key for an entity's VPN config file content. */
export function vpnConfigSecretKey(accountId: string, entityId: string): string {
  return suffixed(accountId, entityId, 'vpnConfig');
}

/** SecretStorage key for an entity's notes (kept out of plaintext globalState). */
export function notesSecretKey(accountId: string, entityId: string): string {
  return suffixed(accountId, entityId, 'notes');
}

/** SecretStorage key for a credential's login and URL (JSON) — a secret, exactly like the notes. */
export function fieldsSecretKey(accountId: string, entityId: string): string {
  return suffixed(accountId, entityId, 'fields');
}

/** SecretStorage key for a config entity's file contents — a secret, exactly like the notes. */
export function configSecretKey(accountId: string, entityId: string): string {
  return suffixed(accountId, entityId, 'config');
}

/**
 * SecretStorage key for a payment instrument's fields (JSON) — one key for the card number, the
 * CVV, the PIN, the bank details and the woven phrase together. `paymentFields.ts` says why one.
 */
export function paymentSecretKey(accountId: string, entityId: string): string {
  return suffixed(accountId, entityId, 'payment');
}

export function historySecretKey(accountId: string, entityId: string): string {
  return suffixed(accountId, entityId, 'history');
}

export function attachmentSecretKey(accountId: string, entityId: string): string {
  return suffixed(accountId, entityId, 'attachment');
}

export function imageSecretKey(accountId: string, entityId: string): string {
  return suffixed(accountId, entityId, 'image');
}

/** SecretStorage key for an entity's DB connection string. */
export function dbConnSecretKey(accountId: string, entityId: string): string {
  return suffixed(accountId, entityId, 'dbConn');
}

/** SecretStorage key for an entity's TOTP seed (the canonical `otpauth://` URI). */
export function totpSecretKey(accountId: string, entityId: string): string {
  return suffixed(accountId, entityId, 'totp');
}

/** Every suffixed per-entity kind, so one list decides what an entity OWNS. */
const ENTITY_KEY_BUILDERS: ReadonlyArray<(accountId: string, entityId: string) => string> = [
  secretKey,
  privateKeySecretKey,
  vpnConfigSecretKey,
  notesSecretKey,
  fieldsSecretKey,
  configSecretKey,
  paymentSecretKey,
  attachmentSecretKey,
  imageSecretKey,
  dbConnSecretKey,
  totpSecretKey,
  // Previous versions of a secret are secrets.
  historySecretKey,
];

/**
 * Every SecretStorage key one entity owns.
 *
 * <p>Its original home was `storageManager.ts`, and its original reason still holds: the list existed
 * TWICE, hand-written in `removeAccount` and in the delete path, and the failure mode of that shape is
 * silent in the worst possible way — a kind added to one block and not the other leaves a plaintext
 * secret in the OS keychain after the entity that explained it is gone, where nothing will ever look
 * for it again.</p>
 *
 * <p>It moved HERE when the orphan sweep was built, because the sweep needs it and lives outside
 * `StorageManager` (that class holds the keychain handle privately and its file is at its size-ratchet
 * baseline, so it can shrink but never grow). Beside the builders it is made of is where it belongs
 * anyway: this file already owns the question "what key does this become".</p>
 */
export function entitySecretKeys(accountId: string, entityId: string): readonly string[] {
  return ENTITY_KEY_BUILDERS.map((build) => build(accountId, entityId));
}
