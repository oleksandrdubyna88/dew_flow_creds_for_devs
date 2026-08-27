import * as crypto from 'node:crypto';

/**
 * The printable recovery code — generation, formatting, parsing, checksum.
 *
 * <p>`RC1-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-CCCC`: 30 symbols of Crockford Base32
 * (no `I L O U`), drawn one at a time with `crypto.randomInt` — uniform, and 32 is a
 * power of two so there is no modulo bias to reason about. That is 150 bits exactly,
 * reported unrounded (the same ethos `pinPolicy.ts` states for its own estimate).</p>
 *
 * <p>`CCCC` is a deterministic checksum over the 30-symbol core, so a mistyped
 * character is caught locally — with a message that says "check the code" — before a
 * decrypt attempt whose only vocabulary is "wrong". Parsing is case-insensitive,
 * ignores spaces and dashes, and maps the Crockford confusables (`O→0`, `I/L→1`),
 * because the code exists to be read back from paper by a stressed human.</p>
 *
 * <p>Pure — no `vscode`, no I/O — so every guarantee here is a unit test.</p>
 */

/** Crockford Base32: digits + letters minus the four confusables. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PREFIX = 'RC1';
/** 30 × log2(32) = 150 bits. */
const CORE_LENGTH = 30;
const CHECKSUM_LENGTH = 4;
const GROUP = 5;
const BODY_RE = new RegExp(`^[${ALPHABET}]{${CORE_LENGTH + CHECKSUM_LENGTH}}$`);

export interface GeneratedRecoveryCode {
  /** The grouped display form: `RC1-XXXXX-…-CCCC`. Shown once, printed, never stored. */
  formatted: string;
  /** The HKDF input: UTF-8 bytes of the 30-symbol core — never the display form. */
  secret: Buffer;
  /** Exact, unrounded. */
  entropyBits: number;
}

export type RecoveryCodeError = 'bad-format' | 'bad-checksum';

export function isRecoveryCodeError(value: unknown): value is RecoveryCodeError {
  return value === 'bad-format' || value === 'bad-checksum';
}

/** First 4 digest bytes mapped into the alphabet — 256 % 32 = 0, so `%` is unbiased. */
function checksum(core: string): string {
  const digest = crypto
    .createHash('sha256')
    .update(`cred-ssh-manager/recovery-checksum:${core}`)
    .digest();
  let out = '';
  for (let i = 0; i < CHECKSUM_LENGTH; i++) {
    out += ALPHABET[digest[i] % ALPHABET.length];
  }
  return out;
}

export function generateRecoveryCode(): GeneratedRecoveryCode {
  let core = '';
  for (let i = 0; i < CORE_LENGTH; i++) {
    core += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  const groups: string[] = [];
  for (let i = 0; i < CORE_LENGTH; i += GROUP) {
    groups.push(core.slice(i, i + GROUP));
  }
  return {
    formatted: [PREFIX, ...groups, checksum(core)].join('-'),
    secret: Buffer.from(core, 'utf8'),
    entropyBits: CORE_LENGTH * Math.log2(ALPHABET.length),
  };
}

/** What a person typed, normalized: case, separators, and the Crockford confusables. */
function normalize(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/**
 * Parse a typed code back to the HKDF input. Returns a typed error, never a guess:
 * `bad-format` is "this is not shaped like a code", `bad-checksum` is "shaped right,
 * one of the characters is off — go look at the paper again".
 */
export function parseRecoveryCode(input: string): { secret: Buffer } | RecoveryCodeError {
  const cleaned = normalize(input);
  if (!cleaned.startsWith(PREFIX) || !BODY_RE.test(cleaned.slice(PREFIX.length))) {
    return 'bad-format';
  }
  const core = cleaned.slice(PREFIX.length, PREFIX.length + CORE_LENGTH);
  return cleaned.endsWith(checksum(core)) ? { secret: Buffer.from(core, 'utf8') } : 'bad-checksum';
}

/** Live validation text for an input box — undefined when the code reads clean. */
export function describeRecoveryCodeInput(input: string): string | undefined {
  const parsed = parseRecoveryCode(input);
  if (!isRecoveryCodeError(parsed)) {
    return undefined;
  }
  return parsed === 'bad-checksum'
    ? 'One of the characters looks mistyped — the checksum does not match.'
    : 'Not a complete recovery code yet — it reads RC1-XXXXX-…-CCCC.';
}
