import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  STEAM_ALPHABET,
  decodeBase32,
  parseTotpSecret,
  totpCode,
  totpRemainingMs,
  describeTotp,
} from '../totp';

/**
 * RFC 6238, Appendix B. The three reference secrets are the ASCII digits repeated to the
 * digest's block size; the table lists eight-digit codes at six instants.
 */
const SHA1_SECRET = Buffer.from('12345678901234567890', 'ascii');
const SHA256_SECRET = Buffer.from('12345678901234567890123456789012', 'ascii');
const SHA512_SECRET = Buffer.from(
  '1234567890123456789012345678901234567890123456789012345678901234',
  'ascii',
);

const VECTORS: Array<[number, string, string, string]> = [
  [59, '94287082', '46119246', '90693936'],
  [1111111109, '07081804', '68084774', '25091201'],
  [1111111111, '14050471', '67062674', '99943326'],
  [1234567890, '89005924', '91819424', '93441116'],
  [2000000000, '69279037', '90698825', '38618901'],
  [20000000000, '65353130', '77737706', '47863826'],
];

const base = { digits: 8, period: 30, steam: false };

test('RFC 6238 vectors — SHA1, SHA256 and SHA512', () => {
  for (const [seconds, sha1, sha256, sha512] of VECTORS) {
    const now = seconds * 1000;
    assert.equal(totpCode({ ...base, secret: SHA1_SECRET, algorithm: 'SHA1' }, now), sha1);
    assert.equal(totpCode({ ...base, secret: SHA256_SECRET, algorithm: 'SHA256' }, now), sha256);
    assert.equal(totpCode({ ...base, secret: SHA512_SECRET, algorithm: 'SHA512' }, now), sha512);
  }
});

test('six digits are the last six of the eight-digit code, zero-padded', () => {
  const code = totpCode({ ...base, digits: 6, secret: SHA1_SECRET, algorithm: 'SHA1' }, 59_000);
  assert.equal(code, '287082');
});

test('base32 decodes RFC 4648 vectors, ignoring case, spaces and padding', () => {
  assert.equal(decodeBase32('MZXW6===')?.toString('ascii'), 'foo');
  assert.equal(decodeBase32('MZXW6YTBOI======')?.toString('ascii'), 'foobar');
  assert.equal(decodeBase32('mzxw 6ytb oi')?.toString('ascii'), 'foobar');
  assert.equal(decodeBase32('MZXW6YTB0I'), undefined, 'a zero is not in the alphabet');
  assert.equal(decodeBase32(''), undefined);
});

test('an otpauth URI is parsed with every parameter and canonicalised', () => {
  const parsed = parseTotpSecret(
    'otpauth://totp/Example:alice@corp.com?secret=jbswy3dpehpk3pxp&issuer=Example&algorithm=sha256&digits=7&period=60',
  );
  assert.notEqual(parsed, undefined);
  const { config, uri } = parsed!;
  assert.equal(config.algorithm, 'SHA256');
  assert.equal(config.digits, 7);
  assert.equal(config.period, 60);
  assert.equal(config.issuer, 'Example');
  assert.equal(config.label, 'alice@corp.com');
  assert.equal(config.secret.toString('hex'), '48656c6c6f21deadbeef');
  assert.equal(
    uri,
    'otpauth://totp/Example%3Aalice%40corp.com?secret=JBSWY3DPEHPK3PXP&issuer=Example&algorithm=SHA256&digits=7&period=60',
  );
  // Canonical output re-parses to the same configuration.
  assert.deepEqual(parseTotpSecret(uri)?.config, config);
});

test('a bare base32 secret is accepted with defaults, spaces and lowercase included', () => {
  const parsed = parseTotpSecret('jbsw y3dp ehpk 3pxp');
  assert.notEqual(parsed, undefined);
  assert.equal(parsed!.config.algorithm, 'SHA1');
  assert.equal(parsed!.config.digits, 6);
  assert.equal(parsed!.config.period, 30);
  assert.equal(parsed!.uri, 'otpauth://totp/code?secret=JBSWY3DPEHPK3PXP&algorithm=SHA1&digits=6&period=30');
});

test('the issuer prefix of the label is used when no issuer parameter is present', () => {
  const parsed = parseTotpSecret('otpauth://totp/GitHub:octocat?secret=JBSWY3DPEHPK3PXP');
  assert.equal(parsed?.config.issuer, 'GitHub');
  assert.equal(parsed?.config.label, 'octocat');
});

test('Steam Guard codes are five characters from the Steam alphabet', () => {
  const parsed = parseTotpSecret('otpauth://totp/Steam:me?secret=JBSWY3DPEHPK3PXP&encoder=steam');
  assert.equal(parsed?.config.steam, true);
  assert.equal(parsed?.config.digits, 5);
  const code = totpCode(parsed!.config, 59_000);
  assert.equal(code.length, 5);
  for (const ch of code) {
    assert.ok(STEAM_ALPHABET.includes(ch), `${ch} is not a Steam character`);
  }
  assert.notEqual(code, totpCode(parsed!.config, 59_000 + 31_000), 'the code moves with the period');
  assert.ok(parsed!.uri.endsWith('&encoder=steam'));
});

test('malformed seeds are refused rather than stored', () => {
  assert.equal(parseTotpSecret(''), undefined);
  assert.equal(parseTotpSecret('otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP'), undefined, 'HOTP is not TOTP');
  assert.equal(parseTotpSecret('otpauth://totp/x?secret=NOT!BASE32'), undefined);
  assert.equal(parseTotpSecret('otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&algorithm=MD5'), undefined);
  assert.equal(parseTotpSecret('otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&digits=9'), undefined);
  assert.equal(parseTotpSecret('otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&period=0'), undefined);
  assert.equal(parseTotpSecret('otpauth://totp/x'), undefined, 'no secret at all');
  assert.equal(parseTotpSecret('https://example.com/?secret=JBSWY3DPEHPK3PXP'), undefined);
});

test('remaining time counts down to the next period boundary', () => {
  const config = { ...base, period: 30, secret: SHA1_SECRET, algorithm: 'SHA1' as const };
  assert.equal(totpRemainingMs(config, 0), 30_000);
  assert.equal(totpRemainingMs(config, 59_000), 1_000);
  assert.equal(totpRemainingMs(config, 60_000), 30_000);
  assert.equal(totpRemainingMs(config, 60_500), 29_500);
});

test('describeTotp names the parameters a person would compare with their app', () => {
  assert.equal(
    describeTotp({ ...base, digits: 6, secret: SHA1_SECRET, algorithm: 'SHA1', issuer: 'GitHub' }),
    'GitHub · 6 digits · SHA1 · every 30 s',
  );
  assert.equal(
    describeTotp({ ...base, digits: 5, steam: true, secret: SHA1_SECRET, algorithm: 'SHA1' }),
    'Steam Guard · every 30 s',
  );
});
