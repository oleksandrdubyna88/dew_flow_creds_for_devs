/**
 * What this extension tells the vault server it speaks, and what it makes of the answer.
 *
 * <p><b>Why a version exists before anything is broken.</b> A server is updated by one person on
 * one evening; the extension is updated by everyone on their own schedule, so an old client
 * meeting a new server is the ordinary state of the world rather than an edge case. On the day a
 * response shape changes, the old clients are already installed and have no way to say what they
 * speak — so the handshake has to predate the first breaking change or it never usefully exists.
 * Today every shape still matches, which is exactly why it is cheap now.</p>
 *
 * <p><b>The header, not `/api/client-config`.</b> That endpoint documents its own reason for
 * having exactly one field. A header is better here regardless: every response carries the
 * server's version, so this learns it from a call it was making anyway.</p>
 *
 * <p>Pure and `vscode`-free.</p>
 */

/** What this build speaks. Bump when the extension can no longer read an older server. */
export const CLIENT_CONTRACT_VERSION = 1;

/** Sent on every request, and read off every response. Must match the server's constant. */
export const CONTRACT_HEADER = 'X-Creds-Contract';

/** HTTP's own word for "your client is too old", so no vocabulary is invented. */
export const UPGRADE_REQUIRED = 426;

/**
 * What the server said its version is, or 0 when it did not say.
 *
 * <p>A server older than this mechanism sends nothing, which is not a fault — it is every
 * deployment that has not been updated yet.</p>
 */
export function serverContractFrom(header: string | null): number {
  const parsed = Number.parseInt((header ?? '').trim(), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

/** True when the server has moved on and this extension has not. */
export function serverIsAhead(serverContract: number): boolean {
  return serverContract > CLIENT_CONTRACT_VERSION;
}

/**
 * What to tell someone whose extension the server will no longer serve.
 *
 * <p>It quotes the server rather than replacing its sentence: the server is the side that knows
 * WHY it stopped, and a generic "update required" sends people to the wrong place.</p>
 */
export function tooOldMessage(location: string, serverSaid: string): string {
  const said = serverSaid.trim();
  return (
    `The vault server at ${location} no longer serves this version of CredsForDevs. ` +
    `Update the extension.${said.length > 0 ? ` Server said: ${said}` : ''}`
  );
}

/** The gentler half: it still works, but it is behind. Said once, not per request. */
export function serverAheadMessage(location: string, serverContract: number): string {
  return (
    `The vault server at ${location} speaks contract ${serverContract}; this extension speaks ` +
    `${CLIENT_CONTRACT_VERSION}. Everything still works — update when convenient.`
  );
}
