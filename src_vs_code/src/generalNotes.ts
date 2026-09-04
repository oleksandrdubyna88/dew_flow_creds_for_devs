import { EntityMetadata } from './types';

/**
 * What the General section SAYS about the two protections — facts, not controls.
 *
 * <p>Both are here for the same reason: neither is a field. Weaving cannot be undone at all (the
 * method is stored nowhere, so a build offering "turn this off" would be claiming something it
 * cannot do), and a PIN is set by a command because doing it re-writes every secret the entry holds
 * and can take a second per slot — a checkbox that did that quietly on Save would hide both the
 * cost and the fact that a forgotten PIN cannot be recovered by anyone, us included.</p>
 *
 * <p>Their own module because `entityFormPage.ts` sits at the 800-line ceiling and two blocks of
 * prose about protections are exactly what leaves cleanly.</p>
 */

/** A woven password, stated — and exact about which part cannot be undone. */
export function wovenState(d: EntityMetadata | undefined): string {
  return d?.passwordWoven !== true
    ? ''
    : `<p class="hint woven"><b>Woven — on.</b> This entry’s password is stored interleaved with a
       decoy under a method only you know. <b>The stored value cannot be unwoven</b> — that needs the
       method, and nothing here has it. What you can do is REPLACE it: type a new password below.
       The weaving box is already ticked so a replacement stays protected; untick it deliberately to
       store the new password in the clear.</p>`;
}

/** A PIN, stated — with where to change it, and what it costs to forget it. */
export function pinState(d: EntityMetadata | undefined): string {
  return d?.pinProtected !== true
    ? ''
    : `<p class="hint woven"><b>PIN — on.</b> Every secret this entry holds is wrapped under a
       PIN of its own, and you were asked for it to open this form. Nothing automatic can use this
       entry while that is true, and agents do not see it at all. Right-click the entry in the tree
       for <i>Remove PIN Protection…</i>. There is no recovery for a forgotten PIN.</p>`;
}
