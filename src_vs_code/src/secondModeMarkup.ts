import { SECOND_LABELS, SecondKey, firstKeyOf } from './secondValues';

/**
 * The control that asks whose the other half is, and the box it reveals — ONE shape for three forms.
 *
 * <p>This is the phrase form's `secondColumn()` widened rather than copied. That form has offered the
 * choice since phrases shipped — *"A decoy, generated for you"* against *"My own words"* — and #52 is
 * the same choice asked of a password, a card number, a CVV, a PIN, an IBAN and an account number.
 * A second control shape for one decision, three fields away from the first, is exactly the drift the
 * reuse rule exists to stop, and a plan round's reviewers asking for "an explicit toggle" were asking
 * for the one this product already had.</p>
 *
 * <h3>One mode per FORM, and a box per field</h3>
 *
 * <p>Whose the other half is, is a decision somebody makes once for what they are saving; WHICH value
 * goes opposite which field is per field. So the mode is emitted once — beside the method, which is
 * governed the same way — and the boxes are emitted per weave point under it. The payment form's
 * existing *"Give each field its own method…"* expander is the precedent for making the mode
 * per-field later, if anybody ever asks for one field's partner to be typed and another's drawn.</p>
 *
 * <h3>Nothing stored is written into this markup</h3>
 *
 * <p>The boxes are always empty, exactly as the card and bank fieldsets are. A second value is a
 * secret, and a secret rendered into a page's HTML is a secret in a string the webview holds, in a
 * process the page can be inspected in. `hasStored` only decides whether the CLEAR affordance is
 * offered and what the hint says — never a value.</p>
 *
 * <p>Pure: no `vscode`.</p>
 */

/**
 * Which control answers for which boxes. One page carries more than one.
 *
 * <p>A union rather than a string, so a box and a control that are meant to belong together cannot be
 * given two spellings of the same scope and quietly stop finding each other.</p>
 */
export const SECOND_SCOPES = ['password', 'payment'] as const;
export type SecondScope = (typeof SECOND_SCOPES)[number];

/** The two answers. `own` is the only one that reveals a box, and the only one a pair rule judges. */
export const SECOND_MODES = ['decoy', 'own'] as const;
export type SecondMode = (typeof SECOND_MODES)[number];

/** Anything that is not the word `own` is a decoy — an unknown value must never mean "use theirs". */
export function secondModeOf(value: unknown): SecondMode {
  return value === 'own' ? 'own' : 'decoy';
}

/**
 * The select, and the SCOPE it answers for.
 *
 * <p>Named rather than inferred from the page's shape. The first version scoped a control to its
 * enclosing fieldset, which worked until the payment boxes moved into the card and bank fieldsets
 * while the control stayed in the shared weaving block outside them — at which point it would have
 * governed every row on the page, the password's included, and emptied what somebody had typed. A
 * scope the markup states cannot be broken by moving markup.</p>
 */
export function secondModeControl(id: string, scope: SecondScope): string {
  return `    <label for="${id}">The other half</label>
    <select id="${id}" class="secondMode" data-second-scope="${scope}">
      <option value="decoy">A decoy, generated for you</option>
      <option value="own">My own second value — a real one I choose</option>
    </select>
    <p class="hint">A decoy is made up and means nothing, which is all it has to do. Your OWN second
    value is a real one you keep — two passwords, two seed phrases — and then both halves of what is
    stored are yours, and both come back when you pick the method. It is never written down beside
    them: it lives inside the woven value, which is what stops a reader of the vault subtracting one
    half to get the other.</p>`;
}

/**
 * One field's box, and whether the field it belongs to is being WOVEN.
 *
 * <p>`woven` is the form's business rather than this module's, so it is passed in. It decides two
 * things at once: the row's starting display, and the attribute the page script reads afterwards.</p>
 *
 * <p><b>A field that is NOT being woven always has a box.</b> A second value can be kept without
 * weaving anything — that is half of what #52 asked for — and the mode has nothing to decide there,
 * because there is only one way to get a value nobody is weaving. The first version of this put every
 * box behind the mode, and the code round found what that cost: the state table's "weaving off and
 * the box filled" row could not be reached at all, while the storage, the save, the viewer and the
 * share policy all supported it.</p>
 */
export function secondBox(key: SecondKey, woven: boolean, scope: SecondScope): string {
  // The FIELD is named here rather than derived page-side by trimming the key's last character. That
  // trim works until a weave point ends in a digit and is then wrong silently — the trap
  // `secondValues.ts` records about its own reverse lookup — and a page script has no table to use
  // instead. So the answer travels with the markup.
  return `    <div class="secondRow" data-second="${key}" data-second-field="${firstKeyOf(key)}" data-second-woven="${woven ? 'yes' : 'no'}" data-second-scope="${scope}" style="display:${woven ? 'none' : ''}">
      <label for="second_${key}">${SECOND_LABELS[key]}</label>
      <input id="second_${key}" type="password" spellcheck="false" autocomplete="off">
    </div>`;
}

/**
 * The box that DELETES a stored second value, offered only when there is one.
 *
 * <p>The `clearPassword` affordance, for the reason it exists there: an empty box means "keep what is
 * stored", because a person editing an unrelated field must not silently lose a secret by leaving a
 * box alone. Deleting one therefore has to be something they say, and this is how this product
 * already asks it.</p>
 */
export function clearSecondBox(key: SecondKey, hasStored: boolean): string {
  return hasStored
    ? `    <div class="check"><input id="clearSecond_${key}" class="clearSecond" data-second="${key}" type="checkbox">
      <label for="clearSecond_${key}">Clear the stored ${SECOND_LABELS[key].toLowerCase()}</label></div>`
    : '';
}
