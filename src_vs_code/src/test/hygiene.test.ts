import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { test } from 'node:test';
import {
  PasswordEntry,
  WEAK_BITS,
  breachFinding,
  countInHibpRange,
  findEnvSecrets,
  findReusedPasswords,
  findUnencryptedKeyFiles,
  findWeakPasswords,
  hibpPrefix,
  looksEncrypted,
  renderReport,
  secretAssignments,
  sortFindings,
} from '../hygiene';

const SECRET = 'Tr0ub4dor&3-correct-horse';

function entry(name: string, value: string): PasswordEntry {
  return { entityName: name, accountEmail: 'me@corp.com', field: 'password', value };
}

// ---- the invariant that matters most ---------------------------------------

test('NO finding ever contains the password that caused it', () => {
  // A health report is a document people paste into a chat window. If the value appeared in
  // it, the report would be the leak.
  const entries = [entry('prod-db', SECRET), entry('staging-db', SECRET), entry('weak', 'abc')];
  const findings = [
    ...findReusedPasswords(entries),
    ...findWeakPasswords(entries),
    breachFinding(entry('pwned', SECRET), 42),
  ];
  const report = renderReport(findings, { entities: 3, files: 0 }, true);

  assert.ok(findings.length >= 3, 'precondition: there are findings to inspect');
  for (const finding of findings) {
    const text = `${finding.title} ${finding.advice} ${finding.where}`;
    assert.equal(text.includes(SECRET), false, `the value leaked into: ${finding.title}`);
    assert.equal(text.includes('abc'), false, `the weak value leaked into: ${finding.title}`);
  }
  assert.equal(report.includes(SECRET), false, 'the value leaked into the rendered report');
});

// ---- reuse ------------------------------------------------------------------

test('entries sharing a password are reported once, naming all of them', () => {
  const findings = findReusedPasswords([
    entry('prod-db', SECRET),
    entry('staging-db', SECRET),
    entry('other', 'a-completely-different-value-here'),
  ]);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'high');
  assert.match(findings[0].title, /2 entries share one password/);
  assert.match(findings[0].title, /"prod-db"/);
  assert.match(findings[0].title, /"staging-db"/);
});

test('distinct passwords produce no reuse finding, and empty values are not "shared"', () => {
  assert.deepEqual(findReusedPasswords([entry('a', 'one-value-here'), entry('b', 'another-value')]), []);
  assert.deepEqual(findReusedPasswords([entry('a', ''), entry('b', '')]), [], 'two blanks are not reuse');
});

// ---- weakness ---------------------------------------------------------------

test('a weak password is reported with its bits; a strong one is not reported at all', () => {
  const weak = findWeakPasswords([entry('router', 'hunter2')]);
  assert.equal(weak.length, 1);
  assert.match(weak[0].title, /weak password \(about \d+ bits\)/);

  const strong = findWeakPasswords([entry('good', 'k7#Qv2!zR9$mW4xL8&pT')]);
  assert.deepEqual(strong, [], 'a generated-strength password must not be nagged about');
});

test('the strength line is a documented constant, not a magic number in a branch', () => {
  assert.equal(WEAK_BITS, 60);
  // Just under and just over the line behave differently, which is what makes it a line.
  assert.equal(findWeakPasswords([entry('x', 'aaaa')], 1000).length, 1);
  assert.equal(findWeakPasswords([entry('x', 'aaaa')], 0).length, 0);
});

// ---- key files --------------------------------------------------------------

const PLAIN_PEM = crypto
  .generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  .privateKey.toString();

const ENCRYPTED_PEM = crypto
  .generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: 'x' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  .privateKey.toString();

test('an unencrypted private key file is reported; an encrypted one is not', () => {
  const findings = findUnencryptedKeyFiles([
    { path: '~/.ssh/id_ed25519', content: PLAIN_PEM },
    { path: '~/.ssh/id_protected', content: ENCRYPTED_PEM },
  ]);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].where, '~/.ssh/id_ed25519');
  assert.equal(findings[0].severity, 'medium', 'an unencrypted key is normal, not a catastrophe');
  assert.match(findings[0].advice, /ssh-keygen -p/);
  assert.match(findings[0].advice, /SSH agent/);
});

test('a public key, a config file and a known_hosts are not private keys', () => {
  const findings = findUnencryptedKeyFiles([
    { path: '~/.ssh/id_ed25519.pub', content: 'ssh-ed25519 AAAAC3Nz... me@host' },
    { path: '~/.ssh/config', content: 'Host prod\n  HostName 10.0.0.1\n' },
    { path: '~/.ssh/known_hosts', content: 'github.com ssh-ed25519 AAAAC3Nz...' },
  ]);
  assert.deepEqual(findings, []);
});

test('looksEncrypted knows both shapes, and does not call unreadable "unencrypted"', () => {
  assert.equal(looksEncrypted(ENCRYPTED_PEM), true);
  assert.equal(looksEncrypted(PLAIN_PEM), false);
  assert.equal(looksEncrypted('-----BEGIN RSA PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\n...'), true);
  // A truncated openssh key: refusing to guess is the safe direction — it must not be
  // reported as an unencrypted key on the strength of a parse failure.
  assert.equal(looksEncrypted('-----BEGIN OPENSSH PRIVATE KEY-----\n!!!not base64!!!\n'), true);
});

// ---- .env -------------------------------------------------------------------

test('a .env with plaintext credentials is reported by NAME, never by value', () => {
  const content = [
    '# deployment',
    'DB_PASSWORD=hunter2',
    'export API_TOKEN="abc123"',
    'PUBLIC_URL=https://example.com',
    'EMPTY_SECRET=',
    'SAFE_PASSWORD=creds://me@corp.com/prod-db/password',
  ].join('\n');

  const findings = findEnvSecrets([{ path: '.env', content }]);

  assert.equal(findings.length, 1);
  assert.match(findings[0].title, /DB_PASSWORD/);
  assert.match(findings[0].title, /API_TOKEN/);
  assert.equal(findings[0].title.includes('hunter2'), false);
  assert.equal(findings[0].title.includes('abc123'), false);
});

test('a placeholder, a comment, a non-secret name and an existing reference are not findings', () => {
  assert.deepEqual(secretAssignments('EMPTY_SECRET='), []);
  assert.deepEqual(secretAssignments('# DB_PASSWORD=hunter2'), []);
  assert.deepEqual(secretAssignments('PUBLIC_URL=https://example.com'), []);
  assert.deepEqual(secretAssignments('DB_PASSWORD=creds://a@b.c/db/password'), []);
  assert.deepEqual(secretAssignments('DB_PASSWORD=real'), ['DB_PASSWORD']);
});

test('a .env with nothing secret in it produces no finding', () => {
  assert.deepEqual(findEnvSecrets([{ path: '.env', content: 'NODE_ENV=production\nPORT=3000\n' }]), []);
});

// ---- the breach check, which is the only thing that can leave the machine ----

test('only five hex characters travel — the k-anonymity split', () => {
  const { prefix, suffix } = hibpPrefix('password');
  const full = crypto.createHash('sha1').update('password').digest('hex').toUpperCase();

  assert.equal(prefix.length, 5);
  assert.match(prefix, /^[0-9A-F]{5}$/);
  assert.equal(prefix + suffix, full, 'the two halves are the whole hash, and only one is sent');
  assert.equal(full.includes(prefix), true);
  assert.equal(prefix.includes('password'), false);
});

test('the count is read out of the returned bucket, locally', () => {
  const { suffix } = hibpPrefix('password');
  const body = ['0018A45C4D1DEF81644B54AB7F969B88D65:1', `${suffix}:37359195`, 'ABCDEF0123456789:2'].join('\r\n');

  assert.equal(countInHibpRange(body, suffix), 37_359_195);
});

test('a suffix that is not in the bucket is zero — "not here", not "safe"', () => {
  assert.equal(countInHibpRange('ABCDEF:5', 'FFFFFF'), 0);
  assert.equal(countInHibpRange('', 'FFFFFF'), 0);
});

test('a malformed bucket line does not throw', () => {
  assert.equal(countInHibpRange('garbage\n\nAB:notanumber', 'AB'), 0);
});

// ---- the report -------------------------------------------------------------

test('findings are ordered high first, so the report reads top-down', () => {
  const sorted = sortFindings([
    { severity: 'low', title: 'c', advice: '', where: '' },
    { severity: 'high', title: 'b', advice: '', where: '' },
    { severity: 'medium', title: 'a', advice: '', where: '' },
  ]);
  assert.deepEqual(sorted.map((f) => f.severity), ['high', 'medium', 'low']);
});

test('a clean report says what was checked rather than printing nothing', () => {
  const report = renderReport([], { entities: 12, files: 4 }, false);
  assert.match(report, /12 stored secret\(s\) and 4 file\(s\)/);
  assert.match(report, /Nothing to report/);
  assert.match(report, /Breach check: off\. Nothing left this machine\./);
});

test('with the breach check on, the report states exactly what was sent', () => {
  const report = renderReport([], { entities: 1, files: 0 }, true);
  assert.match(report, /five characters of each password's SHA-1 were sent; the password was not/);
});
