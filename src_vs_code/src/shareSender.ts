import { isServerLocation } from './vaultTransport';

/**
 * How much a share's claimed sender is worth, and how to say so.
 *
 * <p>The accept dialog read *Accept "X" from vasya@company.com*, in the same
 * voice it uses for everything else — as if the name were established. On the
 * **server** transport it is: the server stamps `fromEmail` from the token that
 * authorised the POST, and a client cannot supply its own. On a **shared folder**
 * it is not. `appendShares` writes whatever the caller handed it, so anyone who
 * can write to that folder can compose an item labelled as coming from a
 * colleague, seal it under a PIN they invented, and coach that PIN over the
 * phone while impersonating them. What the victim then imports is an
 * attacker-chosen SSH key, VPN config or password, into their own vault.</p>
 *
 * <p>The cryptographic fix is sender signatures — `todo/PLAN_nas_sender_pki.md`,
 * a separate piece of work. This is the part that costs nothing and should not
 * wait for it: <b>when trust cannot be guaranteed, it must not be simulated in
 * the interface.</b> A name presented plainly is a claim the product is making
 * on the sender's behalf.</p>
 *
 * <p>Pure and `vscode`-free, so the wording is a test rather than a hope.</p>
 */

/**
 * Whether the transport at `location` proves who sent a share.
 *
 * <p>An unset location cannot prove anything either — it means the account has
 * no sync configured, so any share sitting there arrived some other way.</p>
 */
export function senderIsVerified(location: string | undefined): boolean {
  return location !== undefined && location.length > 0 && isServerLocation(location);
}

/**
 * The sender as the dialog should show them.
 *
 * <p>Verified: the address alone, because qualifying a fact makes every other
 * fact look qualified too. Unverified: the address, a warning sign, and the
 * reason — a bare "unverified" invites the reading "probably fine".</p>
 */
export function describeSender(fromEmail: string, location: string | undefined): string {
  return senderIsVerified(location)
    ? fromEmail
    : `${fromEmail} ⚠ unverified — a shared folder lets anyone write this name`;
}
