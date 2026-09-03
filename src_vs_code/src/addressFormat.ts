/**
 * A postal address as SIX cells, and as the block a courier reads.
 *
 * <p>The billing address was one free textarea, which is where an address goes to become
 * unusable: nobody can copy just the postcode out of it, a form that asks for "city" cannot be
 * filled from it, and two people write the same address three ways.</p>
 *
 * <h3>The doctrine this is built on, and it is not this module's own</h3>
 *
 * <p>Taken from `commandParse.ts`, which does the same job for a pasted command line: <i>"every
 * guess it makes is written into a field the user can see and correct, never applied
 * invisibly."</i> Splitting an address is guessing by nature — there is no punctuation that
 * reliably separates a street from a district — so the only honest shape is one where every guess
 * lands in a box somebody can fix in a second.</p>
 *
 * <p>Pure and free of `vscode`: the parse and the country table are unit tests rather than
 * something checked by typing into a form.</p>
 */

export interface AddressCells {
  readonly line1: string;
  readonly line2: string;
  readonly city: string;
  readonly region: string;
  readonly postal: string;
  /** The card's own `country` field — this module never owns a second one. */
  readonly country: string;
}

export const EMPTY_ADDRESS: AddressCells = {
  line1: '',
  line2: '',
  city: '',
  region: '',
  postal: '',
  country: '',
};

/**
 * How a country writes the city, the region and the postcode.
 *
 * <p>Five entries and a generic order, by the owner's decision — a table of two hundred countries
 * is a library, and a build that formats forty countries wrongly to look complete is worse than one
 * that formats five rightly and the rest plainly.</p>
 *
 * <p>`UA` is here deliberately even though its order IS the generic one: an absent entry reads as
 * "nobody considered it", and somebody adding a sixth country should be able to see which five were
 * looked at.</p>
 */
type Locality = 'us' | 'postalFirst' | 'postcodeOwnLine' | 'plain';

const LOCALITY: Readonly<Record<string, Locality>> = {
  US: 'us',
  DE: 'postalFirst',
  PL: 'postalFirst',
  GB: 'postcodeOwnLine',
  UK: 'postcodeOwnLine',
  UA: 'plain',
};

/** What a person may have typed in the country box, mapped to the code the table is keyed by. */
const COUNTRY_NAMES: Readonly<Record<string, string>> = {
  'UNITED STATES': 'US',
  'UNITED STATES OF AMERICA': 'US',
  USA: 'US',
  GERMANY: 'DE',
  DEUTSCHLAND: 'DE',
  POLAND: 'PL',
  POLSKA: 'PL',
  'UNITED KINGDOM': 'GB',
  ENGLAND: 'GB',
  SCOTLAND: 'GB',
  WALES: 'GB',
  UKRAINE: 'UA',
};

/** The two-letter code this country box names, or `''` when nothing in the table claims it. */
export function countryCode(country: string): string {
  const text = country.trim().toUpperCase();
  const named = COUNTRY_NAMES[text];
  return named ?? (LOCALITY[text] === undefined ? '' : text);
}

/**
 * The address as it is written where it is delivered.
 *
 * <p>Empty cells contribute no line at all, so a half-filled address is short rather than gappy —
 * the same rule `describeCommand` follows for an argument with no note.</p>
 */
export function formatAddress(cells: AddressCells): string {
  const code = countryCode(cells.country);
  return [cells.line1, cells.line2, ...localityLines(cells, LOCALITY[code] ?? 'plain'), cells.country]
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

/** The middle of the block — the part that actually differs between countries. */
function localityLines(cells: AddressCells, locality: Locality): readonly string[] {
  const table: Readonly<Record<Locality, readonly string[]>> = {
    us: [joined([cells.city, joined([cells.region, cells.postal], ' ')], ', ')],
    postalFirst: [joined([cells.postal, cells.city], ' '), cells.region],
    postcodeOwnLine: [cells.city, cells.region, cells.postal],
    plain: [cells.city, cells.region, cells.postal],
  };
  return table[locality];
}

/** Join what is actually there, so no separator is ever left dangling on an empty cell. */
function joined(parts: readonly string[], separator: string): string {
  return parts.map((part) => part.trim()).filter((part) => part.length > 0).join(separator);
}

/**
 * A pasted address, split into cells — every one of them a guess somebody can correct.
 *
 * <p>The rules are deliberately few, because a clever parser that is right 80% of the time is
 * harder to correct than a plain one that is right 60%: a person who trusts it stops reading it.
 * Lines (or commas) are the units; a postcode is recognised by shape at the end; the last line is
 * the country when the country table knows it; what is left over is the street.</p>
 */
export function parseAddress(text: string): AddressCells {
  const parts = text
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const country = takeCountry(parts);
  const postal = takePostal(parts);
  return { ...EMPTY_ADDRESS, ...placeLines(parts), postal, country };
}

/** The country is the last line, when the table knows the name — never when it is the only line. */
function takeCountry(parts: string[]): string {
  const named = countryCode(lastOf(parts)) !== '';
  return named && parts.length > 1 ? popped(parts) : '';
}

/** The last part, or nothing — one place, so the callers below stay single-condition. */
function lastOf(parts: readonly string[]): string {
  return parts[parts.length - 1] ?? '';
}

/** Take the last part off. Only called where the length has just been checked. */
function popped(parts: string[]): string {
  return parts.pop() ?? '';
}

/**
 * Whatever is left, laid into street / second line / city / region.
 *
 * <p>Four lines or more mean a second street line; three mean street, city, region; two mean street
 * and city. Anything past four is left where the first four put it rather than guessed at further —
 * a parser that keeps going gets more wrong per line, and every line here has to be read by a
 * person anyway.</p>
 */
function placeLines(parts: readonly string[]): Partial<AddressCells> {
  const shapes: Readonly<Record<number, readonly (keyof AddressCells)[]>> = {
    0: [],
    1: ['line1'],
    2: ['line1', 'city'],
    3: ['line1', 'city', 'region'],
  };
  const names = shapes[Math.min(parts.length, 4)] ?? ['line1', 'line2', 'city', 'region'];
  return Object.fromEntries(names.map((name, at) => [name, parts[at] ?? '']));
}

/**
 * A postcode, taken OUT of the parts so it cannot also be read as a city.
 *
 * <p>Recognised by shape and only at the end, where every country puts it: digits, or the British
 * letter-digit pattern. A token that is only digits and sits in the middle is a house number.</p>
 */
function takePostal(parts: string[]): string {
  const atEnd = looksPostal(lastOf(parts)) && parts.length > 1;
  return atEnd ? popped(parts) : trailingPostal(parts);
}

/** Digits, or the British letter-digit pattern. Nothing else is a postcode anywhere we format. */
function looksPostal(text: string): boolean {
  return /^[0-9]{4,6}$/.test(text) || /^[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}$/i.test(text);
}

/**
 * A postcode written on the same line as the city — `1011 AB Amsterdam`, `10115 Berlin`.
 *
 * <p>Left in place when it is found: the line is rewritten without it, so the city cell gets the
 * city and the postcode cell gets the postcode, and nothing is silently dropped.</p>
 */
function trailingPostal(parts: string[]): string {
  const at = parts.findIndex((part) => /^[0-9]{4,6}\s+\S/.test(part));
  if (at === -1) {
    return '';
  }
  const [, code, rest] = /^([0-9]{4,6})\s+(.+)$/.exec(parts[at]) ?? ['', '', ''];
  parts[at] = rest;
  return code;
}
