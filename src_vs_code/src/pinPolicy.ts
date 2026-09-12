/**
 * One place for PIN strength. The PIN is the sole barrier protecting vault
 * ciphertext that deliberately lives in shared/offline locations (NAS, vault
 * server, other users' share inboxes), so a short PIN is offline-brute-forceable.
 * Pure — unit-testable, no vscode.
 *
 * <p><b>Why this is not NIST 800-63B.</b> That guidance — eight characters, a
 * blocklist, no composition rules — is written for an authenticator behind a
 * rate limiter, where the attacker gets a handful of throttled tries. Here the
 * attacker already holds the file and guesses offline, unthrottled, as fast as
 * the KDF allows. At the shipped scrypt cost (N=2^17, ~100 ms/guess) an
 * all-digit eight-character PIN is 10^8 guesses: tens of hours on one modern
 * GPU, less on a rented cluster. The length floor alone accepted exactly that.</p>
 *
 * <p><b>A share PIN is the sharper case.</b> A share is sealed with
 * `recipientKeyId + pin`, and on the server transport `recipientKeyId` is the
 * recipient's EMAIL — public, usually derivable from a name. There the PIN is
 * not half the secret; it is all of it. And a PIN spoken over the phone
 * ("tell it to them out-of-band") is exactly the one people make numeric.</p>
 *
 * <p><b>What is rejected, and what is merely reported.</b> A floor high enough
 * to matter is high enough that people write PINs on monitors, so the hard
 * rules cover only the demonstrably weak — all digits under twelve, one
 * character repeated, the obvious list — and everything above that gets an
 * advisory estimate instead of a refusal.</p>
 */

export const MIN_PIN_LENGTH = 8;

/** All digits is a 10-symbol alphabet; it needs length to be worth anything. */
export const MIN_DIGITS_ONLY_LENGTH = 12;

/**
 * Which lock a PIN is for. `vault` is every box that seals ciphertext leaving the machine — the
 * vault itself, a sync, a backup, a share in transit. `entry` is the second lock on one entry
 * behind an already-open vault (`validateEntryPin` says why it is judged differently). The
 * DEFAULT everywhere is `vault`: a caller that forgets to say gets the stricter rule, which is the
 * safe direction to be wrong in.
 */
export type PinScope = 'vault' | 'entry';

/** The entry PIN's floor — half the vault's, for the reason `validateEntryPin` records. */
export const MIN_ENTRY_PIN_LENGTH = 4;

/**
 * Whether a PIN is being INVENTED or TYPED BACK. It is not a display preference: it decides which
 * yardstick the floor is measured with, and `entering` is the one that must never refuse more than
 * it did yesterday — see {@link typedLength}.
 */
export type PinMode = 'choosing' | 'entering';

/**
 * How many characters a PERSON typed — not how many UTF-16 code units they occupy.
 *
 * <p><b>Why the floors cannot use `value.length`.</b> One flag emoji is four code units, so
 * `🇺🇸` alone cleared the entry floor of four; a woman-technologist is a joined sequence of
 * seven, so one keypress cleared the VAULT floor of eight — the floor the 2026-08-24 review's
 * M-1 finding exists to hold. An attacker guessing emoji guesses whole characters out of a set
 * far smaller than the code-unit arithmetic implies, so the count that matters is this one.
 * (Found by the automated reviewer on PR #78, CWE-521.)</p>
 *
 * <p>The fallback counts CODE POINTS when `Intl.Segmenter` is missing. That still catches the
 * flag and every surrogate pair; it counts a joined sequence as its parts, which under-refuses
 * rather than over-refuses — the only direction a fallback here may be wrong in.</p>
 */
export function typedLength(value: string): number {
  return GRAPHEMES === undefined ? [...value].length : [...GRAPHEMES.segment(value)].length;
}

/** Built once: an input box validates on every keystroke, and a Segmenter per keystroke is not free. */
const GRAPHEMES = buildSegmenter();

function buildSegmenter(): Intl.Segmenter | undefined {
  try {
    return new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  } catch {
    return undefined;
  }
}

/**
 * The length a floor is judged against, which depends on why the box is open.
 *
 * <p><b>`entering` keeps counting code units, deliberately.</b> An entry PIN is stored nowhere and
 * has no recovery — the vault recovery code opens the VAULT, not an entry — and `entryPinGate`'s
 * validator BLOCKS Enter on a refusal. So applying the stricter count to a PIN that already exists
 * would not make anybody's PIN stronger; it would shred every value behind a one-emoji PIN set
 * before this rule existed. The code-unit floor stays there as what it has always been in that
 * box: a catch for a typo far shorter than any real PIN.</p>
 */
function measuredLength(value: string, mode: PinMode): number {
  return mode === 'choosing' ? typedLength(value) : value.length;
}

/**
 * Seconds per guess at the shipped scrypt parameters. Deliberately the cost on
 * ATTACKER hardware, not ours: a memory-hard KDF is slower on a GPU per lane
 * than on a CPU, but 128 MiB per lane is what caps the parallelism, and the
 * estimate should not flatter us.
 */
const SECONDS_PER_GUESS = 0.1;

/**
 * The passwords a guessing run tries first. Deliberately tiny and embedded:
 * `zxcvbn` is 800 KB for the last few percent of accuracy, and this extension
 * has zero runtime dependencies — a property worth more than that.
 */
const COMMON = new Set([
  'password', 'passw0rd', 'letmein', 'welcome', 'monkey', 'dragon', 'sunshine',
  'princess', 'football', 'baseball', 'iloveyou', 'trustno1', 'superman',
  'qwerty', 'qwertyuiop', 'qwerty123', 'asdfgh', 'zxcvbn', 'abc123', 'admin',
  'administrator', 'root', 'toor', 'secret', 'changeme', 'default', 'test',
  'guest', 'login', 'master', 'shadow', 'killer', 'freedom', 'whatever',
  'starwars', 'pokemon', 'computer', 'internet', 'samsung', 'google',
]);

/** Undo the substitutions people believe hide a word, then strip the decoration. */
function normalizeForBlocklist(value: string): string {
  return value
    .toLowerCase()
    // Decoration first: '!' is both trailing decoration and a leetspeak 'i', and
    // substituting before stripping turned 'letmein!' into 'letmeini', which is
    // in no list at all.
    .replace(/[^a-z0-9]+$/, '')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/[4@]/g, 'a')
    .replace(/[3]/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[^a-z]+$/, '')
    .replace(/^[^a-z]+/, '');
}

/**
 * Returns an error message for a too-weak PIN, or undefined when acceptable.
 *
 * <p>`mode` decides only how the length floor is COUNTED ({@link measuredLength}); every other rule
 * here reads the same in both. It defaults to `choosing`, the stricter count, so a caller that says
 * nothing gets the floor the M-1 finding asked for rather than the one that lets an emoji through.</p>
 */
// eslint-disable-next-line complexity
export function validatePin(value: string, mode: PinMode = 'choosing'): string | undefined {
  if (value.length === 0) {
    return 'PIN must not be empty.';
  }
  if (measuredLength(value, mode) < MIN_PIN_LENGTH) {
    return `Use at least ${MIN_PIN_LENGTH} characters — this PIN guards data stored off your machine.`;
  }
  if (new Set(value).size === 1) {
    return 'Use more than one character — a repeated character is guessed immediately.';
  }
  if (/^\d+$/.test(value) && value.length < MIN_DIGITS_ONLY_LENGTH) {
    return `All digits gives an attacker only ten options per character. Use at least ${MIN_DIGITS_ONLY_LENGTH} digits, or add letters.`;
  }
  if (COMMON.has(normalizeForBlocklist(value))) {
    return 'That PIN is too common — it is in every guessing list, and the file it guards is offline-attackable.';
  }
  return undefined;
}

/**
 * The refusal for a PIN on ONE ENTRY — the second lock, asked after the vault is open.
 *
 * <p>Issue #55: this PIN reached `validatePin` and was judged by the vault's rules, so `1234` was
 * refused with <i>"this PIN guards data stored off your machine"</i> — a sentence about the vault,
 * shown for an entry. Here the only rule is a floor of {@link MIN_ENTRY_PIN_LENGTH}: any characters,
 * digits included, repeats included, no blocklist, no crack-time estimate.</p>
 *
 * <p><b>The trade-off, so it is a decision and not an oversight.</b> The entry wrap uses the vault's
 * own scrypt primitive, and the wrapped envelope DOES leave the machine — backups and sync carry it.
 * A four-character entry PIN is therefore offline-attackable by somebody who holds the file <b>and</b>
 * has the vault open. That is a weaker position than the vault PIN's, by design: the vault PIN is the
 * first lock and keeps its floor (the 2026-08-24 security review's M-1 is why that floor is eight,
 * and this function must never be a way around it); the entry PIN is a lock against a shoulder, a
 * screen share, an agent, a colleague at an unlocked desk — and a lock nobody sets because the box
 * refuses `1234` is weaker than one that is set. The owner chose this.</p>
 *
 * <p><b>Four CHARACTERS, counted as a person types them</b> ({@link typedLength}) — and only while
 * one is being chosen. A PIN being typed back is still measured in code units, because this lock
 * has no recovery and a floor raised under an existing PIN destroys what it guards.</p>
 */
export function validateEntryPin(value: string, mode: PinMode = 'choosing'): string | undefined {
  if (value.length === 0) {
    return 'PIN must not be empty.';
  }
  if (measuredLength(value, mode) < MIN_ENTRY_PIN_LENGTH) {
    return `Use at least ${MIN_ENTRY_PIN_LENGTH} characters.`;
  }
  return undefined;
}

/**
 * A deliberately pessimistic entropy estimate: a run of same-case letters is
 * counted as ONE dictionary word (~14 bits), not as random characters, because
 * an attacker guesses words before characters. A genuinely random eight-letter
 * string is therefore under-rated — which is the safe direction to be wrong in
 * when the number is advice about a secret.
 */
// eslint-disable-next-line complexity
export function estimateBits(value: string): number {
  const tokens = value.match(/[a-z]+|[A-Z]+|\d+|[^a-zA-Z\d]+/g) ?? [];
  let bits = 0;
  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      bits += token.length * Math.log2(10);
    } else if (/^[^a-zA-Z\d]+$/.test(token)) {
      bits += token.length * Math.log2(33);
    } else if (token.length >= 4) {
      // One pick from a ~20k word list, plus a little for an unusual length.
      bits += Math.log2(20000) + Math.max(0, token.length - 8) * Math.log2(26);
    } else {
      bits += token.length * Math.log2(26);
    }
  }
  // Mixed case across the whole value is one more bit of choice, not per letter.
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) {
    bits += 1;
  }
  return bits;
}

// eslint-disable-next-line complexity
function humanDuration(seconds: number): string {
  const MINUTE = 60, HOUR = 3600, DAY = 86_400, YEAR = 31_557_600;
  if (seconds < MINUTE) return 'seconds';
  if (seconds < HOUR) return `${Math.round(seconds / MINUTE)} minutes`;
  if (seconds < DAY) return `${Math.round(seconds / HOUR)} hours`;
  if (seconds < 30 * DAY) return `${Math.round(seconds / DAY)} days`;
  if (seconds < YEAR) return `${Math.round(seconds / (30 * DAY))} months`;
  const years = seconds / YEAR;
  if (years < 1000) return `${Math.round(years)} years`;
  if (years < 1e6) return `${Math.round(years / 1000)} thousand years`;
  if (years < 1e9) return `${Math.round(years / 1e6)} million years`;
  return 'centuries beyond counting';
}

/**
 * How long an offline attacker who holds the file would need, on average.
 * Advisory, never a refusal — the refusals are in `validatePin`. Reaches input boxes
 * through `pinFeedback('choosing')`; nothing shows it while a PIN is merely re-entered. Ends in "at best" because the estimate assumes the attacker
 * guesses no better than this heuristic does.
 */
export function describePinStrength(value: string): string {
  if (value.length === 0) {
    return '';
  }
  const guesses = Math.pow(2, Math.max(0, estimateBits(value) - 1));
  return `Offline guessing: about ${humanDuration(guesses * SECONDS_PER_GUESS)} at best.`;
}

/** What an input box shows for a PIN: a refusal, advice, or nothing. */
export interface PinFeedback {
  readonly message: string;
  readonly kind: 'error' | 'advice';
}

/**
 * The one validator every PIN input box consumes, in one of two modes.
 *
 * <p>`choosing` — the PIN is being INVENTED here (a new sync PIN, a share PIN, an export
 * password): refusals first, and above them the live crack-time estimate, because now is the
 * one moment the person can act on it. `entering` — the PIN already exists and is merely being
 * typed back: refusals still apply (they catch typos shorter than any real PIN) and the floor is
 * measured the older, looser way ({@link measuredLength}), but the estimate is withheld. Telling
 * someone their existing PIN is weak while they unlock with it is not advice; it is nagging, and
 * it teaches them to stop reading the box that also carries the refusals.</p>
 *
 * <p>The refusal text is `validatePin`'s own, byte for byte — one refusal rule, two callers,
 * pinned by test so the paths cannot drift. This function exists because its predecessor did
 * not: `describePinStrength` was documented as "shown live in the input box" while nothing but
 * its own test ever called it ([PLAN_tails.md] T1).</p>
 *
 * <p>`scope` (issue #55) picks the lock: the `entry` scope answers with `validateEntryPin`'s refusal
 * or nothing at all — no estimate in either mode, because the estimate is computed for an attacker
 * who holds the file and no PIN, which is not the threat that lock faces. It defaults to `vault`,
 * so the four boxes that ask for an entry's PIN have to SAY so, and every other box is unchanged.</p>
 */
export function pinFeedback(
  value: string,
  mode: PinMode,
  scope: PinScope = 'vault',
): PinFeedback | undefined {
  return scope === 'entry' ? entryFeedback(value, mode) : vaultFeedback(value, mode);
}

/**
 * The entry scope: a refusal, or silence.
 *
 * <p>`mode` reaches the validator even though no estimate is ever shown here — it is what decides
 * whether the floor counts characters or code units, and the box that UNLOCKS an entry is the one
 * place that distinction protects somebody rather than lecturing them.</p>
 */
function entryFeedback(value: string, mode: PinMode): PinFeedback | undefined {
  const refusal = validateEntryPin(value, mode);
  return refusal === undefined ? undefined : { message: refusal, kind: 'error' };
}

/** The vault scope — the rule every box had before scopes existed, unchanged. */
function vaultFeedback(value: string, mode: PinMode): PinFeedback | undefined {
  const refusal = validatePin(value, mode);
  if (refusal !== undefined) {
    return { message: refusal, kind: 'error' };
  }
  if (mode === 'entering') {
    return undefined;
  }
  const estimate = describePinStrength(value);
  return estimate === '' ? undefined : { message: estimate, kind: 'advice' };
}
