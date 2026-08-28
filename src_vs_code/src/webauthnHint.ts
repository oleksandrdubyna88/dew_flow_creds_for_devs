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
 * <p><b>Why `userVerification: 'required'` is worth that cost.</b> The RP ID here
 * is the bare `localhost` — not because it has to be: measured on 2026-08-28
 * (Edge 151, Windows 11, YubiKey), `creds-for-devs.localhost` resolves to loopback,
 * is a secure context and works as an RP ID with PRF, so a distinguishing name is
 * possible and is `todo/PLAN_extension_security_tail.md` item 1, whose cost is the
 * re-registration of every key. Until that ships, any other local page on any
 * `localhost` port can ask for the same credential, and `credentialId` and
 * `prfSalt` sit in the vault envelope in plaintext by design. Under `'preferred'`
 * a touch was the whole barrier, and a person who does not read the origin in
 * the browser's own dialog gives away the PRF secret that unwraps the master
 * key. Under `'required'` the key demands its PIN or a biometric as well. It
 * does not close the hole — the RP ID change would — but it stops a stolen
 * prompt from costing a fingertip.</p>
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
