import { weaveExamplePainterScript } from './weaveExampleScript';
import { paymentCardScript } from './paymentViewCard';

/**
 * The viewer's page script, assembled in the ONE order it can be assembled in.
 *
 * <p>Painter first, exactly once, then the picture fragment that calls it, then the card script that
 * drives both. The mirror of `formWeaveScripts.ts`, and it exists for the reason that one does:
 * issue #51 was two copies of the painter, one of which created its block without the class every
 * colour rule is scoped under, so the picture rendered as three grey unboxed lines and every test
 * of it passed. One definition, inlined once, and a sub-script that forgot it would throw at the
 * first reading rather than paint something nobody can read.</p>
 *
 * <p><b>No backticks below.</b> This is a template literal producing browser JavaScript, and one
 * backtick — inside a comment included — ends the string, with the error landing on a later line.</p>
 */
export function viewWeaveScripts(): string {
  return `${weaveExamplePainterScript()}
${payPictureScript()}
${paymentCardScript()}`;
}

/**
 * The picture under a reading: the two rows the person is already looking at, and the stored value
 * with every token coloured by which of those two rows it came from.
 *
 * <p>The columns are captioned <b>First row</b> and <b>Second row</b> — the same ordinals the rows
 * themselves print. The painter's own default names the second column the decoy, which is true on
 * the FORM, where both halves were made up for the picture, and would be a disclosure here: these
 * two rows are a real reading that the build refuses to tell apart.</p>
 *
 * <p>Nothing here knows which row is the person's. The tags arrive already meaning first row and
 * second row, computed host-side from the same order the rows were drawn in.</p>
 */
function payPictureScript(): string {
  return `  function payPicture(key, answer) {
    var host = document.getElementById('payExample_' + key);
    if (!host) { return; }
    if (!answer || !answer.woven) { host.textContent = ''; return; }
    paintExample(
      'payExample_' + key,
      key,
      answer.methodName + ' — where each token of the stored value came from',
      answer,
      'First row',
      'Second row'
    );
  }
`;
}
