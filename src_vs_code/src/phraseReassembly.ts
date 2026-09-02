import { ShuffleCode, unshuffleTokens } from './shuffle';
import { PhraseLayout, dehorizontalize } from './phraseLayout';

/**
 * Rebuilding a woven field for the viewer — and telling the reader NOTHING about whether it worked.
 *
 * <p>The parent plan's own trap, and it is worth stating before the code: a "valid BIP-39" tick beside
 * the result turns twelve methods into one second of enumeration, for exactly the person this scheme
 * defends against. So there is no checksum check here, no "looks real" mark, no validation of any
 * kind. A correct method and a wrong one produce answers <b>identical in form</b>: two rows of words.
 * The test states that as a property, because it is the requirement.</p>
 *
 * <h3>Two steps, and the second one is the one that gets forgotten</h3>
 *
 * <p>`unshuffleTokens` returns the two COLUMNS that were woven. Under the vertical layout those
 * columns are the real phrase and the decoy, and nothing more is needed. Under the horizontal layout
 * they are not — each is half real and half decoy — so rendering them straight would show neither
 * phrase, for half of all records. A review caught the missing step before it could ship.</p>
 *
 * <p>Host-side, following the mechanism the product already has: a TOTP is recomputed per request and
 * its seed never reaches the page (`entityViewPanel`/`viewerOptions`). Both halves come back as
 * ARRAYS — never a joined string, on either side (measure 5.1).</p>
 *
 * <p>Pure: no `vscode`.</p>
 */
export interface Reassembled {
  readonly real: readonly string[];
  readonly decoy: readonly string[];
}

/**
 * The two rows to show, for this method and layout.
 *
 * <p>Which row is "real" is the reader's business, not ours: under a wrong method both are noise, and
 * this function cannot tell and must not appear to. The names say which column the arithmetic PUTS
 * where, and nothing about whether either is anybody's phrase.</p>
 */
export function reassemble(
  mixed: readonly string[],
  code: ShuffleCode,
  layout: PhraseLayout,
): Reassembled {
  const columns = unshuffleTokens(mixed, code);
  return dehorizontalize(columns.first, columns.second, layout);
}

/**
 * Every way a woven field could be read, for a picker that offers them.
 *
 * <p>Deliberately NOT ranked, scored or filtered. Ranking would be the hint this module exists to
 * withhold: any ordering that put a likelier answer first would be doing the enumeration for whoever
 * is reading over somebody's shoulder.</p>
 */
export function everyReading(
  mixed: readonly string[],
  codes: readonly ShuffleCode[],
  layouts: readonly PhraseLayout[],
): ReadonlyArray<{ code: ShuffleCode; layout: PhraseLayout; reading: Reassembled }> {
  return codes.flatMap((code) =>
    layouts.map((layout) => ({ code, layout, reading: reassemble(mixed, code, layout) })),
  );
}
