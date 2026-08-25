/**
 * Which scopes the Microsoft sign-in is asked for when talking to a vault SERVER.
 *
 * <p>The distinction this file exists for: an access token for `user.read` is a
 * <b>Graph</b> token, and Microsoft deliberately makes Graph access tokens unverifiable
 * by third parties (a nonce in the header defeats standard JWKS validation) — a vault
 * server can never accept one, whatever its issuer or tenant. A token minted for the
 * operator's OWN Entra app registration (`api://&lt;client-id&gt;/vault.access`) is an
 * ordinary validatable JWT, which is exactly what `MS_AUDIENCES` on the server pins.</p>
 */
export function microsoftServerScopes(apiScope: string | undefined): string[] {
  const scope = (apiScope ?? '').trim();
  return scope.length > 0 ? [scope] : ['user.read'];
}
