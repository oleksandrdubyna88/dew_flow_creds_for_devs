import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ShareDiagnostic,
  externalExportLine,
  externalImportFailedLine,
  shareAcceptFailedLine,
  shareSentLine,
  ShareAttempt,
  attemptOf,
  rememberAttempt,
} from '../shareDiagnostics';
import { describeTransitSecret } from '../transitSecretReport';
import { BackupError } from '../cryptoUtils';

/**
 * The four lines, against the promise their module's header makes: that a reader can pair two
 * machines by `blob=`, then read `blob=`, `key=` and `aad=` in that order and reach a cause.
 */

const BLOB = { salt: 'c2FsdA==', iv: 'aXZpdml2', tag: 'dGFndGFn', data: 'zqxjvkbnmCIPHERTEXT' };

const PIN = 'able-acid-army-atom-avid-away';

const SENT: ShareDiagnostic = {
  keyId: 'mark@remsoft.dev',
  entityName: 'ionos server',
  pinShape: describeTransitSecret(PIN),
  keyFingerprint: 'a1b2c3d4',
  blob: BLOB,
  form: 'server',
  format: 3,
  aad: '{"entityName":"ionos server","entityKind":"ssh"}',
};

test('the sent line carries every field the diagnosis needs', () => {
  const line = shareSentLine('mark@remsoft.dev', SENT);

  assert.match(line, /^share SENT/);
  assert.match(line, /to=mark@remsoft\.dev/);
  assert.match(line, /keyId=mark@remsoft\.dev/);
  assert.match(line, /form=server/);
  assert.match(line, /format=3/);
  assert.match(line, /blob=[0-9a-f]{8}/);
  assert.match(line, /key=a1b2c3d4/);
  assert.match(line, /aad=\{"entityName":"ionos server"/);
  assert.match(line, /pin len=29 cp=29 ws=none unusual=none/);
});

test('the two machines can be paired by blob, and the pair reads as one story', () => {
  const sender = shareSentLine('mark@remsoft.dev', SENT);
  const recipient = shareAcceptFailedLine({
    fromEmail: 'oleksandr.dubyna@remsoft.dev',
    intoEmail: 'mark@remsoft.dev',
    serverStamped: true,
    reason: 'wrong-password',
    // The same share, opened with a PIN that picked up a trailing space on the way.
    diagnostic: { ...SENT, pinShape: describeTransitSecret(`${PIN} `), keyFingerprint: '9988aabb' },
  });

  const blobOf = (line: string): string => /blob=([0-9a-f]{8})/.exec(line)?.[1] ?? '';
  assert.equal(blobOf(sender), blobOf(recipient));
  // Step 2 of the header's order: same bytes, different key, and the shape says which half moved.
  assert.match(sender, /key=a1b2c3d4/);
  assert.match(recipient, /key=9988aabb/);
  assert.match(sender, /pin len=29/);
  assert.match(recipient, /pin len=30 cp=30 ws=trailing/);
});

test('an absent format and an unbound label are stated, not omitted', () => {
  const line = shareSentLine('mark@remsoft.dev', { ...SENT, format: undefined, aad: '' });

  assert.match(line, /format=none/);
  assert.match(line, /aad=none/);
});

test('a fingerprint that could not be taken says so instead of reading as empty', () => {
  const line = shareSentLine('mark@remsoft.dev', { ...SENT, keyFingerprint: '' });

  assert.match(line, /key=unavailable/);
});

test('a file that could not be parsed far enough to have bytes says so', () => {
  const line = externalImportFailedLine({
    file: 'ionos-server.enc',
    secretShape: describeTransitSecret('MarkTestVault2026'),
    keyFingerprint: '',
    reason: 'corrupted',
  });

  assert.match(line, /blob=unavailable/);
  assert.match(line, /key=unavailable/);
  assert.match(line, /reason=corrupted/);
});

test('the export line names the file, the bytes and the password shape — and that nothing is bound', () => {
  const line = externalExportLine({
    file: 'ionos-server.enc',
    secretShape: describeTransitSecret('MarkTestVault2026'),
    keyFingerprint: 'deadbeef',
    blob: BLOB,
  });

  assert.match(line, /^export WRITTEN/);
  assert.match(line, /file=ionos-server\.enc/);
  assert.match(line, /key=deadbeef/);
  // An external export binds no label, so the reader is stopped before comparing one.
  assert.match(line, /aad=none/);
  assert.match(line, /password len=17 cp=17 ws=none unusual=none/);
});

test('a forged entity name cannot become a second log line, or a second FIELD', () => {
  // Both halves of the same attack, and the second was found by a review round: a name that ends
  // the line forges a whole entry, and a name carrying the field separator forges a `blob=` ahead
  // of the real one, which is what every reader — a regex and an eye alike — would then take.
  const forged = 'ionos server\nshare ACCEPT FAILED · blob=deadbeef · key=cafebabe';

  const line = shareAcceptFailedLine({
    fromEmail: 'attacker@elsewhere.test',
    intoEmail: 'mark@remsoft.dev',
    serverStamped: true,
    reason: 'wrong-password',
    diagnostic: { ...SENT, entityName: forged },
  });

  assert.ok(!line.includes('\n'));
  assert.match(line, /\\u000a/);
  // The property is not that the text `blob=` is absent — it is inside a name somebody chose, and
  // removing it would be censoring the field this line exists to show. The property is that it
  // cannot be READ as a field: split on the separator and exactly one part begins with `blob=`,
  // and it is the real one.
  const fields = line.split(' · ');
  const blobFields = fields.filter((field) => field.startsWith('blob='));
  assert.equal(blobFields.length, 1, `a forged field survived: ${line}`);
  assert.notEqual(blobFields[0], 'blob=deadbeef');
});

test('no line ever contains the secret', () => {
  const lines = [
    shareSentLine('mark@remsoft.dev', SENT),
    shareAcceptFailedLine({
      fromEmail: 'a@b.test',
      intoEmail: 'c@d.test',
      serverStamped: false,
      reason: 'wrong-password',
      diagnostic: SENT,
    }),
    externalExportLine({ file: 'f.enc', secretShape: SENT.pinShape, keyFingerprint: 'deadbeef', blob: BLOB }),
    externalImportFailedLine({ file: 'f.enc', secretShape: SENT.pinShape, keyFingerprint: '', reason: 'wrong-password' }),
  ];

  for (const line of lines) {
    assert.ok(!line.includes('able-acid'), `leaked in: ${line}`);
    assert.ok(!line.includes('avid-away'), `leaked in: ${line}`);
  }
});

test('a terminal failure is not overwritten by a later wrong PIN', () => {
  // The PIN order a review round reached this by: the item fails for a reason no PIN can change,
  // and the next PIN the person types would otherwise relabel it as a wrong password like the rest.
  const attempts = new Map<string, ShareAttempt>();
  const terminal = attemptOf('aaaaaaaa', new BackupError('unsupported-version', 'too new'), 'first-pin-here');
  const retryable = attemptOf('bbbbbbbb', new BackupError('wrong-password', 'nope'), 'second-pin-here');

  rememberAttempt(attempts, 'share-1', terminal);
  rememberAttempt(attempts, 'share-1', retryable);

  assert.equal(attempts.get('share-1'), terminal);
});

test('a wrong PIN IS replaced by the next attempt — it is the one kind a later PIN can change', () => {
  const attempts = new Map<string, ShareAttempt>();
  const first = attemptOf('aaaaaaaa', new BackupError('wrong-password', 'nope'), 'first-pin-here');
  const second = attemptOf('bbbbbbbb', new BackupError('corrupted', 'malformed'), 'second-pin-here');

  rememberAttempt(attempts, 'share-1', first);
  rememberAttempt(attempts, 'share-1', second);

  assert.equal(attempts.get('share-1'), second);
});

test('an attempt carries a shape and never the secret it was made with', () => {
  const attempt = attemptOf('aaaaaaaa', undefined, 'zqxjvkbnm-the-pin');

  assert.ok(!JSON.stringify(attempt).includes('zqxjvkbnm'), JSON.stringify(attempt));
  assert.match(attempt.pinShape, /len=17/);
});

test('a file path with no password says so, instead of describing an empty one', () => {
  // `len=0 … unusual=EMPTY` would read as "somebody submitted an empty password", which is a
  // different failure and would be chased as one.
  const line = externalImportFailedLine({
    file: 'ionos-server.enc',
    secretShape: '',
    keyFingerprint: '',
    reason: 'EBUSY: resource busy or locked',
  });

  assert.match(line, /password not-asked/);
  assert.doesNotMatch(line, /len=0/);
});
