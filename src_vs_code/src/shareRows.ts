import { nasPathFor } from './nasPaths';
import { senderIsVerified } from './shareSender';
import { matchesTerms } from './treeSearch';
import { OwnedShare } from './types';

/** What the share helpers read: the shares, and the account a share arrived on. */
export interface ShareSources {
  readonly ownShares: readonly OwnedShare[];
  readonly accountFor: (accountId: string) => Parameters<typeof nasPathFor>[0] | undefined;
}

/**
 * Whether ANY share under this sender arrived somewhere its sender could be written by hand.
 * One unverifiable share is enough to make the name a claim, so the group is marked on "any",
 * never on "most".
 */
export function unverifiedSender(sources: ShareSources, email: string): boolean {
  return sources.ownShares
    .filter((share) => share.item.fromEmail === email)
    .some((share) => {
      const account = sources.accountFor(share.accountId);
      return !senderIsVerified(account === undefined ? undefined : nasPathFor(account));
    });
}

/**
 * Shares the filter keeps — matched on what their row shows: the entity's name, its kind, and
 * who sent it. Never on the payload, which is still encrypted anyway.
 */
export function sharedMatches(shares: readonly OwnedShare[], terms: readonly string[]): OwnedShare[] {
  if (terms.length === 0) {
    return [...shares];
  }
  return shares.filter((share) =>
    matchesTerms(`${share.item.entityName} ${share.item.entityKind} ${share.item.fromEmail}`.toLowerCase(), terms),
  );
}
