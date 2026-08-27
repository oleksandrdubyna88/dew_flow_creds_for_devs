import * as crypto from 'node:crypto';

/**
 * Time-based one-time passwords (RFC 6238 over RFC 4226), plus the `otpauth://` URI every
 * authenticator app exports, plus Steam's variant.
 *
 * <p>Pure and `vscode`-free, so the RFC's own test vectors are a unit test rather than a
 * hopeful comment. The seed is a secret like a password; what this module derives from it —
 * a code that is valid for one period — is the thing a person types into a login form, and
 * it is the ONLY value the viewer is ever sent (see `entityViewPanel.ts`).</p>
 *
 * <p>The stored form is the canonical URI, so the algorithm, digit count and period travel
 * with the seed: a bare base32 secret typed into the form is canonicalised to
 * `otpauth://totp/code?secret=…&algorithm=SHA1&digits=6&period=30` before it is stored.</p>
 */

export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';

export interface TotpConfig {
  secret: Buffer;
  algorithm: TotpAlgorithm;
  /** 6–8 for RFC codes; always 5 for Steam. */
  digits: number;
  /** Seconds per code. */
  period: number;
  /** Steam Guard: five characters from `STEAM_ALPHABET` instead of decimal digits. */
  steam: boolean;
  label?: string;
  issuer?: string;
}

const ALGORITHMS: readonly TotpAlgorithm[] = ['SHA1', 'SHA256', 'SHA512'];
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const STEAM_ALPHABET = '23456789BCDFGHJKMNPQRTVWXY';
const STEAM_DIGITS = 5;
const DEFAULTS = { algorithm: 'SHA1' as TotpAlgorithm, digits: 6, period: 30 };

/** Upper-cased, spaces/dashes/padding stripped; undefined when a character is not base32. */
function normalizeBase32(text: string): string | undefined {
  const compact = text.toUpperCase().replace(/[\s-]+/g, '').replace(/=+$/, '');
  if (compact.length === 0 || !/^[A-Z2-7]+$/.test(compact)) {
    return undefined;
  }
  return compact;
}

export function decodeBase32(text: string): Buffer | undefined {
  const compact = normalizeBase32(text);
  if (compact === undefined) {
    return undefined;
  }
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of compact) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hmacDigest(algorithm: TotpAlgorithm, secret: Buffer, counter: number): Buffer {
  const message = Buffer.alloc(8);
  message.writeUInt32BE(Math.floor(counter / 0x1_0000_0000), 0);
  message.writeUInt32BE(counter >>> 0, 4);
  return crypto.createHmac(algorithm.toLowerCase(), secret).update(message).digest();
}

/** RFC 4226 §5.3: dynamic truncation to a 31-bit integer. */
function truncate(digest: Buffer): number {
  const offset = digest[digest.length - 1] & 0x0f;
  return (
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3]
  );
}

function steamCode(value: number): string {
  let rest = value;
  let out = '';
  for (let i = 0; i < STEAM_DIGITS; i += 1) {
    out += STEAM_ALPHABET[rest % STEAM_ALPHABET.length];
    rest = Math.floor(rest / STEAM_ALPHABET.length);
  }
  return out;
}

/** The code valid at `nowMs`. */
/**
 * Bytes → base32, the direction a seed travels when it arrives as raw bytes.
 *
 * <p>Lives here rather than beside its one caller because this module owns the alphabet, and a
 * second copy of `ABCDEFGHIJKLMNOPQRSTUVWXYZ234567` in another file is a second thing to keep
 * right. No padding: `otpauth://` secrets are written without it, and {@link decodeBase32}
 * accepts it either way.</p>
 */
export function encodeBase32(bytes: Buffer): string {
  let text = '';
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      text += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return bits === 0 ? text : text + BASE32_ALPHABET[(value << (5 - bits)) & 31];
}

export function totpCode(config: TotpConfig, nowMs: number): string {
  const counter = Math.floor(nowMs / 1000 / config.period);
  const value = truncate(hmacDigest(config.algorithm, config.secret, counter));
  if (config.steam) {
    return steamCode(value);
  }
  return String(value % 10 ** config.digits).padStart(config.digits, '0');
}

/** Milliseconds until the code at `nowMs` stops being valid. */
export function totpRemainingMs(config: TotpConfig, nowMs: number): number {
  const periodMs = config.period * 1000;
  return periodMs - (nowMs % periodMs);
}

/** What a display is sent about a one-time code: the code, when it expires, how it is configured. */
export interface TotpSnapshot {
  code: string;
  /** ms epoch. */
  validUntil: number;
  /** Seconds per code, so a page can draw the countdown. */
  period: number;
  /** `GitHub · 6 digits · SHA1 · every 30 s` — what a person compares with their app. */
  description: string;
}

/** The current code for a stored seed; undefined when there is no seed or it does not parse. */
export function totpSnapshot(storedUri: string | undefined, nowMs: number): TotpSnapshot | undefined {
  const parsed = storedUri === undefined ? undefined : parseTotpSecret(storedUri);
  if (parsed === undefined) {
    return undefined;
  }
  return {
    code: totpCode(parsed.config, nowMs),
    validUntil: nowMs + totpRemainingMs(parsed.config, nowMs),
    period: parsed.config.period,
    description: describeTotp(parsed.config),
  };
}

/** What a person compares with their authenticator app's settings. */
export function describeTotp(config: TotpConfig): string {
  const shape = config.steam ? 'Steam Guard' : `${config.digits} digits · ${config.algorithm}`;
  const issuer = config.issuer !== undefined && config.issuer.length > 0 ? `${config.issuer} · ` : '';
  return `${issuer}${shape} · every ${config.period} s`;
}

function parseAlgorithm(raw: string | null): TotpAlgorithm | undefined {
  if (raw === null || raw.length === 0) {
    return DEFAULTS.algorithm;
  }
  const name = raw.toUpperCase().replace(/-/g, '');
  return (ALGORITHMS as readonly string[]).includes(name) ? (name as TotpAlgorithm) : undefined;
}

function inRange(value: number, min: number, max: number): number | undefined {
  return value >= min && value <= max ? value : undefined;
}

function parseInteger(raw: string | null, fallback: number, min: number, max: number): number | undefined {
  if (raw === null || raw.length === 0) {
    return fallback;
  }
  return /^\d+$/.test(raw) ? inRange(Number(raw), min, max) : undefined;
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** The label path split into issuer and account the way authenticator apps write it. */
function splitLabel(pathname: string, issuerParam: string | null): { label: string; issuer?: string } {
  const label = safeDecode(pathname.replace(/^\/+/, ''));
  const colon = label.indexOf(':');
  if (colon > 0) {
    return { label: label.slice(colon + 1).trim(), issuer: issuerParam ?? label.slice(0, colon).trim() };
  }
  return { label, issuer: issuerParam ?? undefined };
}

/** The URL, but only when it really is an `otpauth://totp/…`. */
function readOtpauthUrl(text: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return undefined;
  }
  return url.protocol === 'otpauth:' && url.host.toLowerCase() === 'totp' ? url : undefined;
}

function isSteamUri(url: URL): boolean {
  return url.searchParams.get('encoder')?.toLowerCase() === 'steam';
}

/** The two parameters without which no code can be computed at all. */
function readSeed(url: URL): { secret: Buffer; algorithm: TotpAlgorithm } | undefined {
  const secret = decodeBase32(url.searchParams.get('secret') ?? '');
  const algorithm = parseAlgorithm(url.searchParams.get('algorithm'));
  if (secret === undefined || algorithm === undefined) {
    return undefined;
  }
  return { secret, algorithm };
}

/** How the code is shaped: how many characters, and for how long. */
function readShape(url: URL, steam: boolean): { digits: number; period: number } | undefined {
  const digits = steam ? STEAM_DIGITS : parseInteger(url.searchParams.get('digits'), DEFAULTS.digits, 6, 8);
  const period = parseInteger(url.searchParams.get('period'), DEFAULTS.period, 1, 3600);
  if (digits === undefined || period === undefined) {
    return undefined;
  }
  return { digits, period };
}

function parseUri(text: string): TotpConfig | undefined {
  const url = readOtpauthUrl(text);
  if (url === undefined) {
    return undefined;
  }
  const steam = isSteamUri(url);
  const seed = readSeed(url);
  const shape = readShape(url, steam);
  if (seed === undefined || shape === undefined) {
    return undefined;
  }
  const { label, issuer } = splitLabel(url.pathname, url.searchParams.get('issuer'));
  return { ...seed, ...shape, steam, label, issuer };
}

/** The value when it has one, the fallback when it is absent or blank. */
function nonEmpty(value: string | undefined, fallback: string): string {
  return value !== undefined && value.length > 0 ? value : fallback;
}

/** The stored form: everything the code depends on, in one string. */
function canonicalUri(config: TotpConfig, secretBase32: string): string {
  const label = nonEmpty(config.label, 'code');
  const issuer = nonEmpty(config.issuer, '');
  const path = issuer.length > 0 ? `${issuer}:${label}` : label;
  const params = [`secret=${secretBase32}`];
  if (issuer.length > 0) {
    params.push(`issuer=${encodeURIComponent(issuer)}`);
  }
  params.push(`algorithm=${config.algorithm}`, `digits=${config.digits}`, `period=${config.period}`);
  if (config.steam) {
    params.push('encoder=steam');
  }
  return `otpauth://totp/${encodeURIComponent(path)}?${params.join('&')}`;
}

/**
 * Read what a person pasted — an `otpauth://totp/…` URI or a bare base32 secret — into a
 * configuration and its canonical URI. `undefined` means "not a TOTP seed": the caller refuses
 * to store it rather than storing something that will never produce the right code.
 */
function fromUri(trimmed: string): { config: TotpConfig; uri: string } | undefined {
  const config = parseUri(trimmed);
  if (config === undefined) {
    return undefined;
  }
  const secretBase32 = normalizeBase32(new URL(trimmed).searchParams.get('secret') ?? '');
  return secretBase32 === undefined
    ? undefined
    : { config, uri: canonicalUri(config, secretBase32) };
}

function fromBareSecret(trimmed: string): { config: TotpConfig; uri: string } | undefined {
  const secretBase32 = normalizeBase32(trimmed);
  if (secretBase32 === undefined) {
    return undefined;
  }
  const secret = decodeBase32(secretBase32);
  if (secret === undefined) {
    return undefined;
  }
  const config: TotpConfig = { secret, ...DEFAULTS, steam: false, label: 'code' };
  return { config, uri: canonicalUri(config, secretBase32) };
}

export function parseTotpSecret(text: string): { config: TotpConfig; uri: string } | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (/^otpauth:/i.test(trimmed)) {
    return fromUri(trimmed);
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return undefined; // some other URL — not a secret at all
  }
  return fromBareSecret(trimmed);
}
