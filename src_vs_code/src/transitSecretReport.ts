/**
 * What can be said about a transit secret in a log line, and what may never be.
 *
 * <p>A transit secret is one that crosses to another person out-of-band, once: the share PIN and
 * the export password (`transitPinPrompt.ts`). When one of them fails to open what it should,
 * every path reports the same sentence — *"wrong master PIN/password or the data was modified"* —
 * and nobody can tell whether the secret was actually wrong, because the field is masked and the
 * value is gone. This module says what the string LOOKED like without saying what it was.</p>
 *
 * <h3>The contract that makes the answer worth anything</h3>
 * <p>The value reported here must be the EXACT string handed to the key derivation — not a copy
 * taken before a trim, a normalisation or a concatenation. A report describing the raw field while
 * the key came from a different string is worse than no report: it accuses the transport of a
 * mangling that the code did itself. Callers pass the same variable to both, and the tests assert
 * it at the two call sites that matter.</p>
 *
 * <h3>Why a named character may be printed and an unnamed one may not</h3>
 * <p>The failure this exists to catch is a secret that did not survive a chat: a hyphen turned into
 * an en dash, a non-breaking space, a zero-width character, a trailing space picked up by a
 * double-click. Naming those is the whole diagnostic, and it costs almost nothing — the table below
 * is fifteen entries long, so "there is an en dash at index 4" narrows one position to one of
 * fifteen possibilities.</p>
 *
 * <p>Printing an ARBITRARY code point does not cost almost nothing. A secret written entirely in a
 * non-Latin script would be reconstructed character by character in the log, which is exactly the
 * promise this module exists to keep. So an unnamed non-ASCII code point is only ever COUNTED, and
 * a value with no printable ASCII in it at all gets no per-character detail whatsoever — there is
 * no bulk left for the positions to be a small part of.</p>
 */

/** One substitution worth naming, at the code-point index it was found. */
export interface NamedCharacter {
  readonly name: string;
  readonly at: number;
}

export interface TransitSecretReport {
  /** UTF-16 code units — what `.length` answers, and what a length check would compare. */
  readonly units: number;
  /** Real characters. Differs from `units` exactly when something is outside the BMP. */
  readonly codePoints: number;
  /** Printable ASCII characters. Zero means the value carries no bulk that positions could hide in. */
  readonly printableAscii: number;
  readonly whitespace: 'none' | 'leading' | 'trailing' | 'both';
  /** Substitutions from the table below. Empty when `printableAscii` is zero — see the header. */
  readonly named: readonly NamedCharacter[];
  /**
   * Code points outside printable ASCII that are NOT individually named above. Counted, never
   * printed — and the count is exact by construction (`codePoints - printableAscii - named`), so a
   * value made entirely of named characters, which prints no positions at all, still says how many
   * unusual characters are in it instead of reading as clean.
   */
  readonly otherUnnamed: number;
}

/**
 * The characters a secret picks up on its way through a chat, an email client or a phone.
 *
 * <p>Every one of them is a substitution FOR an ASCII character that a drawn passphrase actually
 * contains — the separator is `-` (`secretGenerator.ts`) — or an invisible character inserted
 * around it. That is the criterion for being in this table: it must be something the transport did,
 * not something a person would choose. A table of things people choose would be a table of secrets.</p>
 */
const NAMED: ReadonlyMap<number, string> = new Map([
  [0x2010, 'U+2010 HYPHEN'],
  [0x2011, 'U+2011 NON-BREAKING HYPHEN'],
  [0x2012, 'U+2012 FIGURE DASH'],
  [0x2013, 'U+2013 EN DASH'],
  [0x2014, 'U+2014 EM DASH'],
  [0x2015, 'U+2015 HORIZONTAL BAR'],
  [0x2212, 'U+2212 MINUS SIGN'],
  [0x00ad, 'U+00AD SOFT HYPHEN'],
  [0x00a0, 'U+00A0 NO-BREAK SPACE'],
  [0x2007, 'U+2007 FIGURE SPACE'],
  [0x202f, 'U+202F NARROW NO-BREAK SPACE'],
  [0x2018, 'U+2018 LEFT SINGLE QUOTE'],
  [0x2019, 'U+2019 RIGHT SINGLE QUOTE'],
  [0x201c, 'U+201C LEFT DOUBLE QUOTE'],
  [0x201d, 'U+201D RIGHT DOUBLE QUOTE'],
  [0x200b, 'U+200B ZERO WIDTH SPACE'],
  [0x200c, 'U+200C ZERO WIDTH NON-JOINER'],
  [0x200d, 'U+200D ZERO WIDTH JOINER'],
  [0xfeff, 'U+FEFF BYTE ORDER MARK'],
]);

/** How many named characters a line may print before it stops naming and starts counting. */
const MAX_NAMED = 8;

function codePointOf(character: string): number {
  return character.codePointAt(0) ?? 0;
}

function isPrintableAscii(codePoint: number): boolean {
  return codePoint >= 0x20 && codePoint <= 0x7e;
}

function countPrintableAscii(value: string): number {
  let found = 0;
  for (const character of value) {
    found += isPrintableAscii(codePointOf(character)) ? 1 : 0;
  }
  return found;
}

function namedCharacters(value: string): NamedCharacter[] {
  const found: NamedCharacter[] = [];
  let at = 0;
  for (const character of value) {
    const name = NAMED.get(codePointOf(character));
    if (name !== undefined) {
      found.push({ name, at });
    }
    at += 1;
  }
  return found;
}

function whitespaceEdges(value: string): TransitSecretReport['whitespace'] {
  const leading = /^\s/.test(value);
  const trailing = /\s$/.test(value);
  if (leading) {
    return trailing ? 'both' : 'leading';
  }
  return trailing ? 'trailing' : 'none';
}

/**
 * Everything sayable about `value`, and nothing else.
 *
 * <p>`named` is deliberately empty when the value has no printable ASCII at all: with no bulk to
 * hide in, a list of positions IS the value. The count in `otherUnnamed` still says that something
 * unusual is there, which is the part a reader needs.</p>
 */
export function transitSecretReport(value: string): TransitSecretReport {
  const printableAscii = countPrintableAscii(value);
  const codePoints = [...value].length;
  const named = printableAscii === 0 ? [] : namedCharacters(value);
  return {
    units: value.length,
    codePoints,
    printableAscii,
    whitespace: whitespaceEdges(value),
    named,
    otherUnnamed: codePoints - printableAscii - named.length,
  };
}

function namedField(report: TransitSecretReport): string {
  const shown = report.named.slice(0, MAX_NAMED).map((one) => `${one.name}@${one.at}`);
  const hidden = report.named.length - shown.length;
  return hidden > 0 ? `${shown.join(',')},+${hidden} more` : shown.join(',');
}

function unusualField(report: TransitSecretReport): string {
  const parts = [namedField(report)].filter((part) => part !== '');
  if (report.otherUnnamed > 0) {
    parts.push(`outside-ascii x${report.otherUnnamed}`);
  }
  return parts.length === 0 ? 'none' : parts.join(' ');
}

/**
 * The one-line form that goes into the diagnostic channel.
 *
 * <p>`len` and `cp` first because they are what two people compare down a phone line, and they
 * settle the commonest case on their own: a recipient whose PIN is one character longer than the
 * sender's has a trailing space, whatever the rest of the line says.</p>
 */
export function describeTransitSecret(value: string): string {
  const report = transitSecretReport(value);
  if (report.codePoints === 0) {
    return 'len=0 cp=0 ws=none unusual=EMPTY';
  }
  return `len=${report.units} cp=${report.codePoints} ws=${report.whitespace} unusual=${unusualField(report)}`;
}

/** How much of a caller-supplied field one log line may carry. */
const MAX_FIELD = 120;

function isControlCharacter(codePoint: number): boolean {
  return codePoint < 0x20 || codePoint === 0x7f || codePoint === 0x2028 || codePoint === 0x2029;
}

/**
 * The character a diagnostic line uses between its fields, and which therefore may not appear
 * inside one.
 *
 * <p>Escaping newlines stops a name forging a whole second LINE; this stops it forging a FIELD.
 * A share whose entity is called `x · blob=deadbeef` would otherwise put a second `blob=` ahead of
 * the real one, and every reader that splits on the separator — a person's eye included — would
 * take the attacker's value. Raised by a review round, which is the only way this kind of thing is
 * ever found: it is invisible until somebody writes the malicious name down.</p>
 */
const FIELD_SEPARATOR = 0x00b7;

function escapeControl(value: string): string {
  let escaped = '';
  for (const character of value) {
    const codePoint = codePointOf(character);
    escaped += isControlCharacter(codePoint) || codePoint === FIELD_SEPARATOR
      ? `\\u${codePoint.toString(16).padStart(4, '0')}`
      : character;
  }
  return escaped;
}

/**
 * A caller-supplied string made safe to put in one log line.
 *
 * <p>Entity names, addresses and labels are written by people — including, on a share, by the
 * person at the OTHER end. A newline in an entity name would end the line and start one that looks
 * like a genuine diagnostic entry, so a single share could forge as many as it liked; a terminal
 * control sequence in an output channel is worse. Both become visible escapes here, and the field
 * is bounded so one enormous name cannot push the rest of the line out of view.</p>
 */
export function logSafe(value: string): string {
  const escaped = escapeControl(value);
  return escaped.length <= MAX_FIELD ? escaped : `${escaped.slice(0, MAX_FIELD)}...(+${escaped.length - MAX_FIELD})`;
}
