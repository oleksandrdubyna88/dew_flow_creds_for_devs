import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseOtpQrText } from '../otpMigration';
import { QR_CORPUS, matrixOf } from './qrCorpus';
import { decodeMatrix } from '../qrDecode';

/** The text of a corpus symbol, decoded the way the feature decodes it. */
function textOf(name: string): string {
  const fixture = QR_CORPUS.find((entry) => entry.name === name);
  assert.ok(fixture !== undefined, `the corpus lost "${name}"`);
  const result = decodeMatrix(matrixOf(fixture));
  assert.ok(result.ok);
  return result.text;
}

test('an enrolment QR gives one account, canonicalised', () => {
  const reading = parseOtpQrText(textOf('otpauth github'));
  assert.equal(reading.skipped.length, 0);
  assert.equal(reading.accounts.length, 1);
  assert.equal(reading.accounts[0].title, 'GitHub · me@example.com');
  assert.match(reading.accounts[0].uri, /^otpauth:\/\/totp\/GitHub%3Ame%40example\.com\?secret=JBSWY3DPEHPK3PXP/);
  assert.match(reading.accounts[0].description, /6 digits · SHA1 · every 30 s/);
});

test('the parameters an enrolment QR carries survive into what is stored', () => {
  const reading = parseOtpQrText(textOf('otpauth aws sha256'));
  assert.equal(reading.accounts.length, 1);
  assert.match(reading.accounts[0].uri, /algorithm=SHA256/);
  assert.match(reading.accounts[0].uri, /digits=8/);
  assert.match(reading.accounts[0].uri, /period=60/);
  assert.match(reading.accounts[0].description, /8 digits · SHA256 · every 60 s/);
});

test('a Google Authenticator export gives every account it holds', () => {
  const reading = parseOtpQrText(textOf('google authenticator export, 10 accounts'));
  assert.equal(reading.accounts.length, 10);
  assert.equal(reading.skipped.length, 0);
  assert.deepEqual(
    reading.accounts.slice(0, 3).map((account) => account.title),
    ['GitHub · user0@example.com', 'AWS · user1@example.com', 'Google · user2@example.com'],
  );
  for (const account of reading.accounts) {
    assert.match(account.uri, /^otpauth:\/\/totp\/[^?]+\?secret=[A-Z2-7]+&issuer=/);
  }
});

test('a counter-based entry is refused BY NAME, not dropped', () => {
  // The export in this fixture holds a HOTP entry on purpose. Copying one does not give you a
  // second working authenticator — it desynchronises the counter and breaks the first.
  const reading = parseOtpQrText(textOf('google authenticator export, 3 accounts'));
  assert.equal(reading.accounts.length, 2);
  assert.equal(reading.skipped.length, 1);
  assert.match(reading.skipped[0], /legacy@old\.net/);
  assert.match(reading.skipped[0], /counter-based \(HOTP\)/);
});

test('an export entry keeps its own algorithm and digit count', () => {
  const reading = parseOtpQrText(textOf('google authenticator export, 3 accounts'));
  const aws = reading.accounts.find((account) => account.title.startsWith('AWS'));
  assert.ok(aws !== undefined);
  assert.match(aws.uri, /algorithm=SHA256/);
  assert.match(aws.uri, /digits=8/);
});

test('url-safe base64 in the export is read the same as the standard alphabet', () => {
  const standard = textOf('google authenticator export, 1 account');
  const data = /[?&]data=([^&]+)/.exec(standard)?.[1];
  assert.ok(data !== undefined);
  const urlSafe = standard.replace(
    data,
    encodeURIComponent(decodeURIComponent(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')),
  );
  assert.deepEqual(parseOtpQrText(urlSafe).accounts, parseOtpQrText(standard).accounts);
});

test('a QR that is not an authenticator code says what it actually is', () => {
  for (const name of ['café menu', 'wi-fi wpa', 'vcard', 'ticket, numeric only']) {
    const reading = parseOtpQrText(textOf(name));
    assert.equal(reading.accounts.length, 0, name);
    assert.equal(reading.skipped.length, 1, name);
    assert.match(reading.skipped[0], /not an authenticator code/);
  }
});

test('a QR carrying plain words is never mistaken for a base32 seed', () => {
  // The seed field accepts a bare base32 secret typed by hand, and `HELLO WORLD` is valid
  // base32. A poster that says it must not become a stored credential.
  const reading = parseOtpQrText('HELLO WORLD');
  assert.equal(reading.accounts.length, 0);
  assert.match(reading.skipped[0], /not an authenticator code/);
});

test('a truncated or corrupt export is refused rather than half-read', () => {
  const full = textOf('google authenticator export, 3 accounts');
  const data = /[?&]data=([^&]+)/.exec(full)?.[1] ?? '';
  const half = full.replace(data, data.slice(0, Math.floor(data.length / 2)));
  const reading = parseOtpQrText(half);
  assert.ok(
    reading.accounts.length < 3,
    'half an export must not answer as if it were whole',
  );
  assert.ok(reading.accounts.length === 0 || reading.skipped.length > 0);

  assert.deepEqual(parseOtpQrText('otpauth-migration://offline?data=').accounts, []);
  assert.match(parseOtpQrText('otpauth-migration://offline').skipped[0], /no data/);
});
