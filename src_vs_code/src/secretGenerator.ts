import * as crypto from 'node:crypto';

/**
 * Making a secret rather than thinking one up.
 *
 * <p>Three kinds, because they answer three different questions: a **password** for a form
 * that will never be typed by hand, a **passphrase** for the one secret a person does have to
 * type or say aloud (a vault PIN, a share PIN), and an **Ed25519 key pair** — which is the
 * interesting one, because a key generated here goes straight into the vault and, with the SSH
 * agent, is used without ever being a file. `ssh-keygen` cannot do that: it writes to disk by
 * definition.</p>
 *
 * <p><b>Randomness.</b> `crypto.randomInt` throughout — it rejects out-of-range draws rather
 * than taking a modulus, so every character is equally likely. `Math.random()` appears nowhere
 * in this file and must not: it is seeded predictably and is not a source for anything anyone
 * relies on.</p>
 *
 * <p><b>Entropy is reported, not implied.</b> Every generator returns the bits it actually drew,
 * computed from the alphabet it drew from — so the UI states a fact instead of colouring a bar.
 * A passphrase's word list is exactly 256 words, which makes that arithmetic exact: eight bits
 * per word, no rounding to flatter the result.</p>
 *
 * <p>Pure and `vscode`-free.</p>
 */

export const LOWER = 'abcdefghijklmnopqrstuvwxyz';
export const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const DIGITS = '0123456789';
/** Punctuation that survives a shell, a URL and a CSV without quoting arguments. */
export const SYMBOLS = '!#%*+-=?@^_~';
/** Characters that are read wrong when a secret is copied off a screen or read aloud. */
export const AMBIGUOUS = 'Il1O0o';

export interface PasswordOptions {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  /** Drop `Il1O0o`, for a secret somebody will read from a screen. */
  avoidAmbiguous: boolean;
}

export interface GeneratedSecret {
  value: string;
  /** log2 of the number of equally likely values this draw could have produced. */
  entropyBits: number;
  /** One line for the UI — what it is and how strong, without a bar to interpret. */
  description: string;
}

/** The lengths the form offers. The owner's list, verbatim; 32 is the default. */
export const PASSWORD_LENGTH_CHOICES: readonly number[] = [6, 8, 12, 16, 32, 64];

export const DEFAULT_PASSWORD: PasswordOptions = {
  // 32, deliberately (was 20): the owner's choice for what an unattended click produces —
  // recorded in PLAN_tails T14a as a behaviour change, not a side effect.
  length: 32,
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
  avoidAmbiguous: false,
};

/** The four selectable classes, in the order they appear in the UI. */
const CLASS_SETS: ReadonlyArray<[keyof Omit<PasswordOptions, 'length' | 'avoidAmbiguous'>, string]> = [
  ['lower', LOWER],
  ['upper', UPPER],
  ['digits', DIGITS],
  ['symbols', SYMBOLS],
];

function withoutAmbiguous(set: string, avoid: boolean): string {
  return avoid ? [...set].filter((c) => !AMBIGUOUS.includes(c)).join('') : set;
}

function alphabetFor(options: PasswordOptions): string {
  return enabledClasses(options).join('');
}

/** One character, uniformly. */
function pick(alphabet: string): string {
  return alphabet[crypto.randomInt(alphabet.length)];
}

/** Fisher–Yates with a uniform source — so the guaranteed characters are not at fixed positions. */
function shuffle(values: string[]): string[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The classes that were switched on, each as its (possibly filtered) alphabet. */
function enabledClasses(options: PasswordOptions): string[] {
  return CLASS_SETS.filter(([flag]) => options[flag])
    .map(([, set]) => withoutAmbiguous(set, options.avoidAmbiguous))
    .filter((set) => set.length > 0);
}

/**
 * A password of `length` characters.
 *
 * <p>One character from every selected class is guaranteed and then the whole thing is
 * shuffled: a rule like "must contain a digit" is what the site asks for, and a password that
 * fails it silently is worse than a slightly shorter draw. The entropy reported is that of the
 * plain uniform draw, which very slightly overstates the constrained one — stated here rather
 * than quietly rounded, and the difference is under a bit at these lengths.</p>
 *
 * <p>Returns an empty value when no class is selected: there is nothing to draw from, and
 * inventing a default would hand back a password the caller did not ask for.</p>
 */
export function generatePassword(options: PasswordOptions): GeneratedSecret {
  const alphabet = alphabetFor(options);
  const classes = enabledClasses(options);
  if (alphabet.length === 0 || options.length <= 0) {
    return { value: '', entropyBits: 0, description: 'Nothing to draw from — choose at least one character set.' };
  }
  const guaranteed = classes.slice(0, options.length).map(pick);
  const rest = Array.from({ length: Math.max(0, options.length - guaranteed.length) }, () => pick(alphabet));
  const value = shuffle([...guaranteed, ...rest]).join('');
  const entropyBits = value.length * Math.log2(alphabet.length);
  return {
    value,
    entropyBits,
    description: `${value.length} characters from a ${alphabet.length}-symbol set — ${Math.round(entropyBits)} bits.`,
  };
}

/**
 * Exactly 256 four-letter words, so a passphrase's strength is eight bits per word with no
 * rounding. Short and unambiguous on purpose: this is the secret somebody types on a phone
 * keyboard or reads down a telephone.
 *
 * <p>Written here rather than taken from the EFF list — that list is 1296 words under CC-BY,
 * and an attribution obligation inside an MIT extension for 2.3 extra bits per word is a poor
 * trade. `secretGenerator.test.ts` asserts the count and the uniqueness, which is what the
 * arithmetic actually depends on.</p>
 */
export const WORDS: readonly string[] = (
  'able acid aged also area army away baby ' +
  'back ball band bank base bath bear beat ' +
  'bell belt bend best bike bird bite blue ' +
  'boat body bold bolt bone book boot born ' +
  'both bowl bulk bush busy cake call calm ' +
  'camp cane card care cart case cash cast ' +
  'cave cell chat chef chip city clay clip ' +
  'club coal coat code coin cold cook cool ' +
  'copy cord core corn cost cove crew crop ' +
  'cube cure curl dark dawn deal dear debt ' +
  'deck deep deer desk dice diet dirt dish ' +
  'dive dock door dose dove down draw drop ' +
  'drum dual duck dust duty each earn east ' +
  'easy edge exit face fact fade fair fall ' +
  'farm fast fate fear feed feel file fill ' +
  'film find fine fire firm fish five flag ' +
  'flat flee flow foam fold folk food foot ' +
  'fork form fort four free frog fuel full ' +
  'fund gain game gate gear gift girl give ' +
  'glad glow goal goat gold golf good gray ' +
  'grid grin grip grow gulf hair half hall ' +
  'hand hang hard harm hawk head heal heap ' +
  'hear heat herb hero hide high hill hint ' +
  'hold hole holy home hook hope horn host ' +
  'hour huge hunt hurt icon idea inch iron ' +
  'item jazz join joke jump junk keen keep ' +
  'kick kind king kiss kite knee knot lace ' +
  'lake lamp land lane last late lawn lazy ' +
  'leaf lean leap left lend lens life lift ' +
  'like lime line link lion list live load ' +
  'loan lock loft logo long look loop lord ' +
  'loss loud love luck lump lung mail main'
).split(' ');

export const WORD_LIST_SIZE = WORDS.length;

export interface PassphraseOptions {
  words: number;
  separator: string;
  /** Capitalise each word — for the sites that demand an upper-case letter. */
  capitalize: boolean;
  /** Append one digit, for the same reason. */
  addNumber: boolean;
}

export const DEFAULT_PASSPHRASE: PassphraseOptions = {
  words: 6,
  separator: '-',
  capitalize: false,
  addNumber: false,
};

function capitalizeWord(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * A passphrase drawn word by word.
 *
 * <p>The reported entropy counts ONLY the words — the optional capital and the trailing digit
 * are there to satisfy a composition rule, not to add strength, and counting them would be the
 * kind of flattery that makes a number useless.</p>
 */
export function generatePassphrase(options: PassphraseOptions): GeneratedSecret {
  const count = Math.max(1, Math.floor(options.words));
  const drawn = Array.from({ length: count }, () => WORDS[crypto.randomInt(WORDS.length)]);
  const shaped = options.capitalize ? drawn.map(capitalizeWord) : drawn;
  const joined = shaped.join(options.separator);
  const value = options.addNumber ? `${joined}${crypto.randomInt(10)}` : joined;
  const entropyBits = count * Math.log2(WORDS.length);
  return {
    value,
    entropyBits,
    description: `${count} words from a ${WORDS.length}-word list — ${Math.round(entropyBits)} bits.`,
  };
}

export interface GeneratedKeyPair {
  /** PKCS#8 PEM — what goes into the vault, and what the SSH agent parses. */
  privateKey: string;
  /** `ssh-ed25519 AAAA… comment`, for `authorized_keys` and for a forge's signing-key box. */
  publicLine: string;
  comment: string;
}

export type SshKeyTypeId =
  | 'ed25519'
  | 'ecdsa-p256'
  | 'ecdsa-p384'
  | 'ecdsa-p521'
  | 'rsa-3072'
  | 'rsa-4096';

export interface SshKeyTypeChoice {
  readonly id: SshKeyTypeId;
  readonly label: string;
  /** One honest line for the picker — the weaker options say so instead of posing as equals. */
  readonly note: string;
}

/**
 * The key types the form offers, in the order the picker shows them.
 *
 * <p>This used to be no list at all — one button, Ed25519, with a comment arguing that offering
 * RSA-2048 "would only let somebody pick the weaker option". The owner overruled the
 * no-choice half (some hosts genuinely refuse Ed25519), and the comment's real point survives
 * as two properties of this catalog: <b>Ed25519 stays first and default</b>, and the weaker
 * options are labelled as what they are. RSA-2048 — the option the old comment was actually
 * protecting people from — is still not offered (PLAN_tails T14b).</p>
 */
export const SSH_KEY_TYPES: readonly SshKeyTypeChoice[] = [
  { id: 'ed25519', label: 'Ed25519 (recommended)', note: 'The modern default: short keys, fast, no parameters to get wrong.' },
  { id: 'ecdsa-p256', label: 'ECDSA P-256', note: 'For hosts that require NIST curves.' },
  { id: 'ecdsa-p384', label: 'ECDSA P-384', note: 'For hosts that require NIST curves.' },
  { id: 'ecdsa-p521', label: 'ECDSA P-521', note: 'For hosts that require NIST curves.' },
  { id: 'rsa-3072', label: 'RSA 3072', note: 'Larger and slower — compatibility with older servers only.' },
  { id: 'rsa-4096', label: 'RSA 4096', note: 'Larger and slower — compatibility with older servers only.' },
];

/**
 * A fresh key pair of the chosen type, in memory.
 *
 * <p>The public LINE is built by the caller through `sshKeyParse`, so there is exactly one
 * implementation of the SSH wire format in this codebase rather than a second one here.</p>
 */
export function generateKeyPairOf(type: SshKeyTypeId): { privateKey: string; publicKeyPem: string } {
  const pem = {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  } as const;
  const pair =
    type === 'ed25519'
      ? crypto.generateKeyPairSync('ed25519', { ...pem })
      : type.startsWith('ecdsa-')
        ? crypto.generateKeyPairSync('ec', {
            namedCurve: { 'ecdsa-p256': 'prime256v1', 'ecdsa-p384': 'secp384r1', 'ecdsa-p521': 'secp521r1' }[
              type as 'ecdsa-p256' | 'ecdsa-p384' | 'ecdsa-p521'
            ],
            ...pem,
          })
        : crypto.generateKeyPairSync('rsa', {
            modulusLength: type === 'rsa-3072' ? 3072 : 4096,
            ...pem,
          });
  return { privateKey: pair.privateKey.toString(), publicKeyPem: pair.publicKey.toString() };
}

/** The old single-type entry point; kept so existing callers read unchanged. */
export function generateEd25519(): { privateKey: string; publicKeyPem: string } {
  return generateKeyPairOf('ed25519');
}
