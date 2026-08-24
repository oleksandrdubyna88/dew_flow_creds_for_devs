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

/** Returns an error message for a too-weak PIN, or undefined when acceptable. */
export function validatePin(value: string): string | undefined {
  if (value.length === 0) {
    return 'PIN must not be empty.';
  }
  if (value.length < MIN_PIN_LENGTH) {
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
 * A deliberately pessimistic entropy estimate: a run of same-case letters is
 * counted as ONE dictionary word (~14 bits), not as random characters, because
 * an attacker guesses words before characters. A genuinely random eight-letter
 * string is therefore under-rated — which is the safe direction to be wrong in
 * when the number is advice about a secret.
 */
function estimateBits(value: string): number {
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
 * Advisory: shown live in the input box, never a refusal — the refusals are in
 * `validatePin`. Ends in "at best" because the estimate assumes the attacker
 * guesses no better than this heuristic does.
 */
export function describePinStrength(value: string): string {
  if (value.length === 0) {
    return '';
  }
  const guesses = Math.pow(2, Math.max(0, estimateBits(value) - 1));
  return `Offline guessing: about ${humanDuration(guesses * SECONDS_PER_GUESS)} at best.`;
}
