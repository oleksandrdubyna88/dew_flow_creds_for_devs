import { FORM_SECTIONS, FormSection } from './formSections';

/**
 * The show/hide switch, generated from the section catalog rather than written twice.
 *
 * <p>It used to be a hand-written ladder of `show('vpnSection', kind === 'vpn')` lines beside the
 * markup that declared those ids. Two lists agreeing by habit is how `script` shipped as a kind
 * nobody could select — so the ladder is now emitted from `FORM_SECTIONS`, and a section that
 * exists has a rule by construction.</p>
 *
 * <p>Its own module because `entityFormScript.ts` sat at 798 lines against an 800-line limit.
 * Like the picker, this returns a FRAGMENT: it runs inside the page's one script, beside the
 * `val` and `show` helpers it uses.</p>
 */

/** `kind === 'vpn'`, or a disjunction for a section that serves several kinds. */
function kindTest(section: FormSection): string {
  if (section.kinds.length === 0) {
    return 'true';
  }
  return section.kinds.map((kind) => `kind === '${kind}'`).join(' || ');
}

function visibilityLine(section: FormSection): string {
  const kinds = kindTest(section);
  const guarded = section.condition === undefined ? kinds : `(${kinds}) && ${section.condition}`;
  return `    show('${section.id}', ${guarded});`;
}

export function formVisibilityScript(): string {
  // Emitted for every section, including the ones that are always on: `show(id, true)` costs a
  // style write nobody sees, and the alternative is a list of exceptions to keep in step.
  const lines = FORM_SECTIONS.map((section) => visibilityLine(section)).join('\n');
  return `
  // ---- one type, one visible section — generated from FORM_SECTIONS ----
  function currentKind() { return val('entityType'); }
  function updateVisibility() {
    const kind = currentKind();
${lines}
    updateLifetimeChoices(kind);
  }
`;
}
