import { EntityMetadata } from './types';
import { escapeHtml } from './webviewHtml';

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

/**
 * The VIEWER's twin of `wovenState`: one sentence in Main naming what is stored woven.
 *
 * <p>Here rather than in `entityViewPage.ts` so the form's sentence and the viewer's cannot drift
 * into contradicting each other, which is this module's stated job and the reason it exists. ONE
 * statement, in one place, for every kind of entry: a payment record's woven fields are drawn in
 * the *Payment instrument* frame, and somebody asking "is this entry woven" should not have to know
 * which frame to look in.</p>
 *
 * <p>It names what is woven and says what to do about it. It offers no CONTROL, because nothing
 * here can undo a weave — that needs the method, and nothing in this build has it.</p>
 */
export function wovenViewNote(password: boolean, fields: readonly string[]): string {
  const named = [...(password ? ['the password'] : []), ...fields];
  if (named.length === 0) {
    return '';
  }
  // Escaped because this is a site that builds markup, not because today's labels need it. They are
  // constants of this build; the question a boundary answers is whether it is safe WHATEVER it is
  // handed, and a label list that one day comes from a record would arrive here unannounced.
  const safe = named.map(escapeHtml);
  const list = safe.length === 1 ? safe[0] : `${safe.slice(0, -1).join(', ')} and ${safe.at(-1)}`;
  return `<p class="hint woven"><b>Woven — on.</b> This entry stores ${list} interleaved with a
     second value, under a method only you know. Pick that method below and press Show: both rows
     come back, and you read the one you recognise. Nothing here can unweave the stored value — that
     needs the method, and nothing in this build has it.</p>`;
}

/**
 * *Not for export* (#122) — the one CONTROL in this module, because unlike the two facts around it
 * the mark costs nothing to set or clear. Not drawn when the form authors an entry for someone else.
 * The hint says what the mark does NOT stop, so nobody reads it as more than it is.
 */
export function notForExportField(d: EntityMetadata | undefined, forSomeoneElse: boolean): string {
  if (forSomeoneElse) {
    return '';
  }
  return `<div class="check"><input id="notForExport" type="checkbox"${d?.notForExport === true ? ' checked' : ''}>
       <label for="notForExport">Not for export</label></div>
    <p class="hint">This entry is never sent by <i>Share with…</i> or written by <i>Export / Share
       Externally…</i>; inside a shared or exported folder it is left out and named. Agents, backup,
       sync and your own use are unaffected. An older version of this extension does not know the
       mark and drops it when it saves or syncs the entry.</p>`;
}

/**
 * The VIEWER's twin of `notForExportField` — one sentence in Main, so somebody wondering why
 * *Share with…* is missing from this entry's menu can see the reason without opening Edit.
 */
export function notForExportViewNote(marked: boolean): string {
  return marked
    ? `<p class="hint"><b>Not for export — on.</b> <i>Share with…</i> and <i>Export / Share
       Externally…</i> leave this entry behind. Untick it in Edit, General section.</p>`
    : '';
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
