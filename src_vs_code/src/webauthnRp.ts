/**
 * The WebAuthn relying-party id the security-key flow binds credentials to — and the one it
 * used to (security-tail item 1, shipped 2026-08-28).
 *
 * <p>WebAuthn scopes a credential by RP ID *string*: under the bare `localhost` every local page
 * on every port could ask the key for this vault's PRF secret, and the `credentialId` and
 * `prfSalt` it needs sit in the envelope in plaintext by design. A name under the `.localhost`
 * TLD is loopback by RFC 6761 with no DNS setup, and the owner measured it on 2026-08-28: Edge 151
 * resolves `creds-for-devs.localhost`, treats the page as a secure context and answers both
 * `create` and `get` with the PRF extension. So new registrations bind to that name.</p>
 *
 * <p>An existing credential cannot follow: the authenticator scopes it by the RP it was created
 * under, so a wrap without `rpId` is a LEGACY wrap — it still opens the vault, under `localhost`,
 * and the person is offered a re-registration once it does. Nothing is ever removed until its
 * replacement is in the envelope; a PIN keeps working throughout.</p>
 */

export const CURRENT_RP_ID = 'creds-for-devs.localhost';
export const LEGACY_RP_ID = 'localhost';

/** The RP ID a WebAuthn wrap was created under — absent means the pre-0.81 bare `localhost`. */
export function wrapRpId(wrap: { rpId?: string }): string {
  return wrap.rpId ?? LEGACY_RP_ID;
}

/** A security-key wrap still bound to the bare `localhost`: usable, and due for re-registration. */
export function isLegacyKeyWrap(wrap: { kind: string; rpId?: string }): boolean {
  return wrap.kind === 'webauthn' && wrapRpId(wrap) === LEGACY_RP_ID;
}

/** The notification after a legacy key opened the vault — an offer, never a block. */
export function migrationOfferText(email: string, label: string | undefined): string {
  return (
    `Re-register "${label ?? 'this security key'}" for ${email} to complete a security improvement: ` +
    `keys are now bound to ${CURRENT_RP_ID} instead of any local page. The old registration and the ` +
    'PIN keep working until you do.'
  );
}
