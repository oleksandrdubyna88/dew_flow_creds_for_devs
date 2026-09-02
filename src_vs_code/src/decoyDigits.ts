import { binOf, luhn } from './cardBrand';

/**
 * A decoy that does not look like the thing it hides is not a decoy.
 *
 * <p>Weaving a real value with a fake half only helps if a reader cannot tell which half is which. So
 * a decoy card number passes Luhn and carries a BIN of the same system; a decoy IBAN converges mod-97
 * with the same country code. A decoy that is "just digits" separates the two halves at a glance, and
 * leaves the person believing in protection they do not have — which is worse than no decoy, because
 * no decoy at least looks like what it is.</p>
 *
 * <p><b>The inverse matters as much.</b> An internal account number gets a decoy of the same length and
 * alphabet and <b>nothing more</b> — no country code, no checksum. Standard structure beside a
 * non-standard real value separates the halves just as surely, in the other direction.</p>
 *
 * <p><b>The collision guard lives here, next to the generator</b>, not at each field. A draw equal to
 * the original is discarded and redrawn, so one implementation covers every field kind rather than
 * being remembered once per kind. At a CVV that is one draw in a thousand and not theoretical: in that
 * state the "decoy" IS the real CVV, the record shows it twice, and nobody ever finds out.</p>
 *
 * <p>Pure: no `vscode`, and the randomness is a parameter. `shuffle.ts` knows nothing about words or
 * digits and must stay that way — the difference between them lives only here.</p>
 */
export type DecoyKind = 'card' | 'iban' | 'account' | 'digits';

export interface DecoySpec {
  readonly kind: DecoyKind;
  readonly original: string;
}

/** A source of numbers in [0, 1). Injected so a test can script a collision. */
export type Random = () => number;

/**
 * How many draws before giving up.
 *
 * <p>A bound rather than a `while (true)`: a source that never varies — a broken RNG, a scripted test —
 * would otherwise hang the extension. Thirty-two attempts is far beyond what any real source needs
 * (a colliding CVV is 1 in 1000) and instant to exhaust when something is genuinely wrong.</p>
 */
const MAX_ATTEMPTS = 32;

/**
 * A decoy for this value: the same shape, and never the value itself.
 *
 * <p>Throws rather than returning the original when it cannot find a different draw. Handing back the
 * original would be the one outcome that silently destroys the point — and a caller that sees an error
 * can say so, where a caller handed a duplicate cannot know.</p>
 */
export function generateDecoy(spec: DecoySpec, random: Random): string {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = draw(spec, random);
    if (candidate !== spec.original) {
      return candidate;
    }
  }
  throw new Error(
    `Could not produce a decoy different from the value it hides after ${MAX_ATTEMPTS} attempts.`,
  );
}

function draw(spec: DecoySpec, random: Random): string {
  const makers: Readonly<Record<DecoyKind, (original: string, random: Random) => string>> = {
    card: cardDecoy,
    iban: ibanDecoy,
    account: accountDecoy,
    digits: digitsDecoy,
  };
  return makers[spec.kind](spec.original, random);
}

/** Digits of the same length, and nothing else — a CVV or a PIN has no structure to imitate. */
function digitsDecoy(original: string, random: Random): string {
  return [...original].map(() => digit(random)).join('');
}

/**
 * A card number: the original's BIN, random middle, and a last digit chosen to satisfy Luhn.
 *
 * <p>The check digit is computed rather than drawn, because a decoy that fails the checksum is the
 * half a reader discards first.</p>
 */
function cardDecoy(original: string, random: Random): string {
  const digits = original.replace(/\D/g, '');
  const bin = binOf(digits);
  const middle = Array.from({ length: Math.max(0, digits.length - bin.length - 1) }, () => digit(random)).join('');
  return withLuhnDigit(`${bin}${middle}`);
}

/** The body plus the one digit that makes the whole thing converge. */
function withLuhnDigit(body: string): string {
  for (let last = 0; last < 10; last++) {
    const candidate = `${body}${last}`;
    if (luhn(candidate)) {
      return candidate;
    }
  }
  return `${body}0`; // Unreachable: one of the ten always converges.
}

/** An IBAN: the original's country, random body, and the two check digits that make it converge. */
function ibanDecoy(original: string, random: Random): string {
  const country = original.slice(0, 2).toUpperCase();
  const body = [...original.slice(4)].map((character) => alphanumeric(character, random)).join('');
  return `${country}${ibanCheckDigits(country, body)}${body}`;
}

/** The two digits that make `country + checks + body` converge — computed, never drawn. */
function ibanCheckDigits(country: string, body: string): string {
  const remainder = mod97(`${body}${country}00`);
  return String(98 - remainder).padStart(2, '0');
}

/**
 * Does this IBAN converge? Exported because the decoy has to be checkable from outside.
 *
 * <p>Rearrange so the country and check digits go last, map letters to numbers, and take mod 97 —
 * a valid IBAN leaves 1.</p>
 */
export function ibanConverges(iban: string): boolean {
  const trimmed = iban.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{6,30}$/.test(trimmed)) {
    return false;
  }
  return mod97(`${trimmed.slice(4)}${trimmed.slice(0, 4)}`) === 1;
}

/** Digit by digit, so a 34-character IBAN never becomes a number JavaScript cannot hold. */
function mod97(input: string): number {
  let remainder = 0;
  for (const character of input) {
    const value = /\d/.test(character) ? character : String(character.charCodeAt(0) - 55);
    remainder = Number(`${remainder}${value}`) % 97;
  }
  return remainder;
}

/**
 * An internal account: the same length, the same alphabet, the same shape — and nothing more.
 *
 * <p>Position by position, so a letter stays a letter and a separator stays exactly where it was. No
 * checksum and no country code, deliberately: a standard-shaped decoy beside a non-standard real value
 * is as good as a signpost.</p>
 */
function accountDecoy(original: string, random: Random): string {
  return [...original].map((character) => alphanumeric(character, random)).join('');
}

/** A digit for a digit, a letter for a letter, and anything else kept as it is. */
function alphanumeric(character: string, random: Random): string {
  if (/\d/.test(character)) {
    return digit(random);
  }
  return /[A-Za-z]/.test(character) ? letter(random, character) : character;
}

function digit(random: Random): string {
  return String(Math.min(9, Math.floor(random() * 10)));
}

/** A letter of the same case, so an all-caps account number stays all-caps. */
function letter(random: Random, like: string): string {
  const index = Math.min(25, Math.floor(random() * 26));
  const base = like === like.toUpperCase() ? 65 : 97;
  return String.fromCharCode(base + index);
}
