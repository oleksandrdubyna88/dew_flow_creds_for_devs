import {
  DEFAULT_PASSPHRASE,
  DEFAULT_PASSWORD,
  PassphraseOptions,
  PasswordOptions,
} from './secretGenerator';

/**
 * What an agent may say about the secret it is asking this window to MAKE.
 *
 * <p>Until now it could name a kind and nothing else, so every generated value was
 * `DEFAULT_PASSWORD` — 32 characters of everything. That is a good default and a bad only
 * option: plenty of systems cap the length, forbid symbols, or want a passphrase of a given
 * length, and an agent that cannot say so has one move left, which is to generate the value
 * itself. Then the secret is in its context, and the journal counts it. Widening what it may ASK
 * for is what keeps the value on this side of the wall.</p>
 *
 * <p><b>It says what it wants; it never says what it gets.</b> Every field here is a constraint
 * on the draw, and the draw still happens in the window. There is no option that returns the
 * value, weakens the random source, or names one.</p>
 *
 * <p>Pure: no `vscode`, no storage. The bounds below are the reason this is a module and not
 * three lines at a call site — a length of zero, or every character class off, makes
 * `generatePassword` answer with an EMPTY string, and an empty secret stored as if it were one
 * is the failure this file exists to make impossible.</p>
 */

/** The narrowest and widest a generated password may be. */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/** The same, for a passphrase. Four words is already past a memorable joke; sixty is a paste. */
export const MIN_PASSPHRASE_WORDS = 3;
export const MAX_PASSPHRASE_WORDS = 24;

/** A separator a person could read out. Anything else is refused rather than substituted. */
const SEPARATORS: ReadonlySet<string> = new Set(['-', '_', '.', ' ', '']);

export type OptionsOutcome =
  | { ok: true; password: PasswordOptions; passphrase: PassphraseOptions; said: string }
  | { ok: false; message: string };

/**
 * Read the generation options out of a request body, over the defaults.
 *
 * <p>Field by field and by name, like everything else that crosses this wall. An absent field
 * means "as you normally would" rather than "off": a request that named only a length must not
 * silently lose the symbols.</p>
 *
 * <p>Refusals are sentences an agent can act on, because the alternative to a clear refusal is a
 * weaker secret nobody noticed asking for.</p>
 */
export function readSecretOptions(body: Record<string, unknown>): OptionsOutcome {
  const password = { ...DEFAULT_PASSWORD, ...readPasswordFields(body) };
  const passphrase = { ...DEFAULT_PASSPHRASE, ...readPassphraseFields(body) };
  const refusal = refuse(body, password, passphrase);
  return refusal === undefined
    ? { ok: true, password, passphrase, said: describe(body, password, passphrase) }
    : { ok: false, message: refusal };
}

function readPasswordFields(body: Record<string, unknown>): Partial<PasswordOptions> {
  return {
    ...maybe('length', whole(body.length)),
    ...maybe('lower', flag(body.lower)),
    ...maybe('upper', flag(body.upper)),
    ...maybe('digits', flag(body.digits)),
    ...maybe('symbols', flag(body.symbols)),
    ...maybe('avoidAmbiguous', flag(body.avoidAmbiguous)),
  };
}

function readPassphraseFields(body: Record<string, unknown>): Partial<PassphraseOptions> {
  return {
    ...maybe('words', whole(body.words)),
    ...maybe('separator', typeof body.separator === 'string' ? body.separator : undefined),
    ...maybe('capitalize', flag(body.capitalize)),
    ...maybe('addNumber', flag(body.addNumber)),
  };
}

/**
 * The one refusal that matters, and two that save a wasted round trip.
 *
 * <p>Every character class off is the dangerous one: `generatePassword` answers with an empty
 * string and a description nobody reads, so a vault would end up holding "" as though it were a
 * secret. It is refused here, before anything is drawn.</p>
 */
function refuse(
  body: Record<string, unknown>,
  password: PasswordOptions,
  passphrase: PassphraseOptions,
): string | undefined {
  const checks: readonly [boolean, string][] = [
    [noClasses(password), `A password needs at least one character set. Ask for lower, upper, digits or symbols.`],
    [outOfRange(password.length, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH), lengthRefusal(password.length)],
    [outOfRange(passphrase.words, MIN_PASSPHRASE_WORDS, MAX_PASSPHRASE_WORDS), wordsRefusal(passphrase.words)],
    [!SEPARATORS.has(passphrase.separator), separatorRefusal(passphrase.separator)],
    [wanted(body) && body.secretKind === undefined, 'Generation options were given without `secretKind`. Name what to make — "password" or "passphrase" — or drop the options.'],
  ];
  return checks.find(([failed]) => failed)?.[1];
}

function noClasses(options: PasswordOptions): boolean {
  return !options.lower && !options.upper && !options.digits && !options.symbols;
}

function outOfRange(value: number, low: number, high: number): boolean {
  return value < low || value > high;
}

function lengthRefusal(length: number): string {
  return `A generated password is ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters; ${length} is outside that.`;
}

function wordsRefusal(words: number): string {
  return `A passphrase is ${MIN_PASSPHRASE_WORDS}–${MAX_PASSPHRASE_WORDS} words; ${words} is outside that.`;
}

function separatorRefusal(separator: string): string {
  return `"${separator}" is not an offered separator. Use one of - _ . a space, or an empty string.`;
}

/** Did the request carry any generation option at all? */
export function wanted(body: Record<string, unknown>): boolean {
  return OPTION_FIELDS.some((field) => body[field] !== undefined);
}

const OPTION_FIELDS: readonly string[] = [
  'length',
  'lower',
  'upper',
  'digits',
  'symbols',
  'avoidAmbiguous',
  'words',
  'separator',
  'capitalize',
  'addNumber',
];

/**
 * What the consent modal adds, in the person's words.
 *
 * <p>Only when something was asked for. A prompt that recited the defaults on every call would
 * be a prompt people stop reading, which is the failure mode that matters most on the one screen
 * that stands between an agent and a vault.</p>
 */
function describe(
  body: Record<string, unknown>,
  password: PasswordOptions,
  passphrase: PassphraseOptions,
): string {
  if (!wanted(body)) {
    return '';
  }
  return body.secretKind === 'passphrase' ? describePassphrase(passphrase) : describePassword(password);
}

function describePassword(options: PasswordOptions): string {
  const sets = CLASS_LABELS.filter(([key]) => options[key]).map(([, label]) => label);
  const ambiguous = options.avoidAmbiguous ? ', no look-alike characters' : '';
  return `${options.length} characters from ${sets.join(' + ')}${ambiguous}`;
}

/** The four classes as a person reads them, in the order the form shows. */
const CLASS_LABELS: readonly [keyof PasswordOptions, string][] = [
  ['lower', 'a-z'],
  ['upper', 'A-Z'],
  ['digits', '0-9'],
  ['symbols', 'symbols'],
];

function describePassphrase(options: PassphraseOptions): string {
  const extras = [
    options.capitalize ? 'capitalised' : '',
    options.addNumber ? 'with a digit' : '',
  ].filter((extra) => extra.length > 0);
  const separator = options.separator === '' ? 'joined' : `separated by "${options.separator}"`;
  return [`${options.words} words`, separator, ...extras].join(', ');
}

function maybe<T>(key: string, value: T | undefined): Record<string, T> {
  return value === undefined ? {} : { [key]: value };
}

/** A whole number, or nothing. A string is accepted: a model sends `"32"` as often as `32`. */
function whole(raw: unknown): number | undefined {
  const value = typeof raw === 'string' ? Number(raw) : raw;
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

/** A boolean, or nothing. `"true"` and `"false"` are accepted for the same reason. */
function flag(raw: unknown): boolean | undefined {
  if (typeof raw === 'boolean') {
    return raw;
  }
  return raw === 'true' || (raw === 'false' ? false : undefined);
}
