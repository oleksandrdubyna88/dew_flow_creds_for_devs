import { PaymentFields, parsePaymentFields } from './paymentFields';

/**
 * A record with a woven field cannot be edited in the form — and the reason is not tidiness.
 *
 * <p>Without this guard, a card with a mixed PIN opens for editing. The form has no original to show
 * (there is none: the value is stored woven with a decoy, under a code kept nowhere), so it puts the
 * <b>8 stored digits</b> where 4 belong. Saving then either fails validation or weaves them
 * <b>again</b> — 16 digits under two unknown codes. The same number becomes 32, then 64. Irreversibly
 * destroyed, one save at a time, with no error at any step.</p>
 *
 * <p><b>The condition is "has a mixed field", never "is a phrase".</b> A phrase is the case people
 * picture, but a card with a woven PIN is the same state and the same destruction — and it is the one
 * nobody pictures, which is exactly why the condition is written this way and tested this way.</p>
 *
 * <p>Two mechanisms, and both are wanted. The <b>context token</b> hides the menu item, so nobody is
 * offered something that will be refused; the <b>guard</b> is the guarantee, because a command can be
 * reached from the palette, a keybinding, or another extension. The token is UX; the guard is the
 * contract.</p>
 *
 * <p>Pure: no `vscode`, so both callers can be tested without one.</p>
 */
export function hasMixedField(fields: PaymentFields): boolean {
  return (fields.shuffledFields ?? []).length > 0;
}

/** The same question against the stored JSON, for callers holding the raw record. */
export function rawHasMixedField(raw: string | undefined): boolean {
  return hasMixedField(parsePaymentFields(raw));
}

/**
 * What the person is told instead of being given a form that would destroy their value.
 *
 * <p>It names the fields — never their values — and says what to do about it, because a refusal that
 * does not offer a way forward is a bug report waiting to be filed.</p>
 */
export function mixedEditRefusal(fields: PaymentFields): string {
  const names = fields.shuffledFields ?? [];
  return (
    `This entry has ${names.length === 1 ? 'a field' : 'fields'} stored woven with a decoy `
    + `(${names.join(', ')}). There is no original to put back in the form — editing it would weave `
    + 'the woven value a second time and destroy it. Delete the entry and create it again, or view it '
    + 'and unweave the field first.'
  );
}
