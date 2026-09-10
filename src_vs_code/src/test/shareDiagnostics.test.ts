import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ShareDiagnostic,
  externalExportLine,
  externalImportFailedLine,
  shareAcceptFailedLine,
  shareSentLine,
} from '../shareDiagnostics';

/**
 * The four lines, against the promise their module's header makes: that a reader can pair two
 * machines by `blob=`, then read `blob=`, `key=` and `aad=` in that order and reach a cause.
 */

const BLOB = { salt: 'c2FsdA==', iv: 'aXZpdml2', tag: 'dGFndGFn', data: 'zqxjvkbnmCIPHERTEXT' };

const SENT: ShareDiagnostic = {
  keyId: 'mark@remsoft.dev',
  secret: 'able-acid-army-atom-avid-away',
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
    entityName: 'ionos server',
    fromEmail: 'oleksandr.dubyna@remsoft.dev',
    intoEmail: 'mark@remsoft.dev',
    serverStamped: true,
    reason: 'wrong-password',
    // The same share, opened with a PIN that picked up a trailing space on the way.
    diagnostic: { ...SENT, secret: `${SENT.secret} `, keyFingerprint: '9988aabb' },
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
    secret: 'MarkTestVault2026',
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
    secret: 'MarkTestVault2026',
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

test('a forged entity name cannot become a second log line', () => {
  const line = shareAcceptFailedLine({
    entityName: 'ionos server\nshare ACCEPT FAILED · entity=something else',
    fromEmail: 'attacker@elsewhere.test',
    intoEmail: 'mark@remsoft.dev',
    serverStamped: true,
    reason: 'wrong-password',
    diagnostic: SENT,
  });

  assert.ok(!line.includes('\n'));
  assert.match(line, /\\u000a/);
});

test('no line ever contains the secret', () => {
  const lines = [
    shareSentLine('mark@remsoft.dev', SENT),
    shareAcceptFailedLine({
      entityName: 'ionos server',
      fromEmail: 'a@b.test',
      intoEmail: 'c@d.test',
      serverStamped: false,
      reason: 'wrong-password',
      diagnostic: SENT,
    }),
    externalExportLine({ file: 'f.enc', secret: SENT.secret, keyFingerprint: 'deadbeef', blob: BLOB }),
    externalImportFailedLine({ file: 'f.enc', secret: SENT.secret, keyFingerprint: '', reason: 'wrong-password' }),
  ];

  for (const line of lines) {
    assert.ok(!line.includes('able-acid'), `leaked in: ${line}`);
    assert.ok(!line.includes('avid-away'), `leaked in: ${line}`);
  }
});
