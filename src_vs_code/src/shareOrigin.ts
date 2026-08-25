/**
 * Which local entry an incoming share is an update OF.
 *
 * <p><b>The problem.</b> Accepting a share always minted a fresh local id, so a colleague
 * who re-sent the same credential six months later handed you a second copy beside the
 * first, with nothing on either saying which one was current.</p>
 *
 * <p><b>The problem this must not create.</b> The obvious fix — let the sender's own id
 * address the local entry — is the attack the fresh-id rule was written against: a sender
 * could then name an entry of yours they never sent and silently replace its contents. So
 * the map lives HERE, on this machine, keyed by the pair <i>(who sent it, what they called
 * it)</i>. A sender who never sent you a given thing can never match one, whatever id they
 * claim.</p>
 *
 * <p>Local and not synced, deliberately: it records what THIS machine accepted from whom.
 * A second machine that accepted the same share keeps its own record, and one that never
 * saw it correctly offers a plain new item.</p>
 */

export function originKey(senderEmail: string, senderEntityId: string): string {
  return `${senderEmail.trim().toLowerCase()}|${senderEntityId}`;
}

/** The local entity this pair updated last, if it is still in the vault. */
export function resolveOrigin(
  map: Readonly<Record<string, string>>,
  senderEmail: string,
  senderEntityId: string,
  stillExists: (localNodeId: string) => boolean,
): string | undefined {
  const localId = map[originKey(senderEmail, senderEntityId)];
  if (localId === undefined) {
    return undefined;
  }
  // A mapping to something deleted must read as "no previous copy", or the update path
  // would try to overwrite a node that is gone and fail where a plain add would work.
  return stillExists(localId) ? localId : undefined;
}

/** A copy of the map with this pair pointing at `localNodeId`. */
export function recordOrigin(
  map: Readonly<Record<string, string>>,
  senderEmail: string,
  senderEntityId: string,
  localNodeId: string,
): Record<string, string> {
  return { ...map, [originKey(senderEmail, senderEntityId)]: localNodeId };
}
