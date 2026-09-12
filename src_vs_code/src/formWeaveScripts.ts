import { cardFormScript } from './cardFormScript';
import { phraseFormScript } from './phraseFormScript';
import { wovenFormScript } from './wovenFormScript';
import { weaveExamplePainterScript } from './weaveExampleScript';

/**
 * The whole weaving story's page script, in the one order it can be assembled in.
 *
 * <p>Four fragments that only work together: the shared painter, then the three forms that call it.
 * The painter must come FIRST — a form script that runs before `paintExample` exists throws at the
 * first method pick — and it must appear exactly ONCE, which is the defect this module exists to
 * make impossible. Two copies is how the password example came to be drawn without the `.weaveEx`
 * block every colour rule is scoped under (issue #51): three grey unboxed lines, from a painter
 * that was a near-verbatim copy of one that worked.</p>
 *
 * <p>Its own module because `entityFormScript.ts` sits at its 800-line ceiling and because the
 * ordering rule above is a fact about these four, not about the page that hosts them.</p>
 */
export function formWeaveScripts(): string {
  return `  ${weaveExamplePainterScript()}

  ${cardFormScript()}
${wovenFormScript()}
  ${phraseFormScript()}`;
}
