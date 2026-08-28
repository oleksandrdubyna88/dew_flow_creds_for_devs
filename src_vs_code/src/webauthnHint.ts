/**
 * What to tell a person when the browser refuses a security-key prompt.
 *
 * <p>Split out of `webauthnPrf.ts` because that file needs `vscode` and this
 * decision is worth asserting: the messages are the only thing standing between a
 * raised security bar and a user who thinks their key broke.</p>
 */

/**
 * Turn the browser's deliberately vague refusal into something actionable.
 *
 * <p><b>Why the guessing is unavoidable.</b> WebAuthn returns a generic
 * `NotAllowedError` for a cancelled prompt, a timeout AND a missing PIN, on
 * purpose — distinguishing them would let a page fingerprint the authenticator.
 * So this cannot say which happened, and must not pretend to: it names both.</p>
 *
 * <p><b>Why `userVerification: 'required'` is worth that cost.</b> Since 0.81 the
 * RP ID is `creds-for-devs.localhost` (`webauthnRp.ts`), so no other local page
 * can ask the key for this vault's credential — but a key registered before
 * that is bound to the bare `localhost` until it is re-registered, and while it
 * is, any page on any `localhost` port can ask, with `credentialId` and
 * `prfSalt` sitting in the envelope in plaintext by design. Under `'preferred'`
 * a touch was the whole barrier, and a person who does not read the origin in
 * the browser's own dialog gives away the PRF secret that unwraps the master
 * key. Under `'required'` the key demands its PIN or a biometric as well — the
 * floor that holds for legacy and current registrations alike.</p>
 */
export function browserErrorHint(error: string): string {
  if (/prf/i.test(error) || /not supported/i.test(error)) {
    return `${error} — the PRF extension needs Chrome/Edge and a FIDO2 key with hmac-secret (YubiKey 5 and newer).`;
  }
  if (/notallowed/i.test(error)) {
    return (
      `${error} — this vault asks the key to verify you, not just to be touched. ` +
      'Either the prompt was cancelled or timed out, or the authenticator has no PIN ' +
      'or biometric set up. Set a PIN on the key (ykman fido access change-pin) or ' +
      'enable Windows Hello / Touch ID, then try again. The browser does not say ' +
      'which of these it was, on purpose.'
    );
  }
  return error;
}
