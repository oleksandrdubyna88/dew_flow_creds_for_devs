import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FrameReader,
  MAX_FRAME_BYTES,
  SSH_AGENTC_SIGN_REQUEST,
  SSH_AGENT_IDENTITIES_ANSWER,
  SSH_AGENT_SIGN_RESPONSE,
  ByteReader,
  decodeSignRequest,
  describePurpose,
  describePurposeForLog,
  describeServerLine,
  describeSignRequest,
  encodeFrame,
  encodeIdentitiesAnswer,
  encodeSignResponse,
  encodeString,
  keyFingerprintOf,
  keyTypeOf,
  describeUnknownShape,
} from '../sshAgentProtocol';
import { HOSTBOUND_METHOD, userauth } from './sshUserauth';

const blob = (type: string, body = 'body') => Buffer.concat([encodeString(type), encodeString(body)]);

/** The key the agent is asked to sign with, the key a login names, and a server's host key. */
const SIGNING_KEY = blob('ssh-ed25519', 'the key the agent signs with');
const OTHER_KEY = blob('ssh-ed25519', 'a different key');
const HOST_KEY = blob('ssh-ed25519', 'the server host key');

test('a frame split across chunks is assembled; several in one chunk all arrive', () => {
  const reader = new FrameReader();
  const frame = encodeFrame(Buffer.from([11]));

  assert.deepEqual(reader.push(frame.subarray(0, 2)), [], 'nothing complete yet');
  assert.deepEqual(reader.push(frame.subarray(2)).map((f) => [...f]), [[11]]);

  const two = Buffer.concat([encodeFrame(Buffer.from([11])), encodeFrame(Buffer.from([13, 1]))]);
  assert.deepEqual(reader.push(two).map((f) => [...f]), [[11], [13, 1]]);
});

test('an oversize announced length is refused rather than buffered', () => {
  const reader = new FrameReader();
  const header = Buffer.alloc(4);
  header.writeUInt32BE(MAX_FRAME_BYTES + 1, 0);

  assert.deepEqual(reader.push(header), []);
  assert.equal(reader.overflow, true);
});

test('the identities answer lays out count, blob and comment', () => {
  const payload = encodeIdentitiesAnswer([{ publicBlob: blob('ssh-ed25519'), comment: 'prod key' }]);
  const reader = new ByteReader(payload);

  assert.equal(reader.readByte(), SSH_AGENT_IDENTITIES_ANSWER);
  assert.equal(reader.readUInt32(), 1);
  assert.equal(keyTypeOf(reader.readString() as Buffer), 'ssh-ed25519');
  assert.equal(reader.readString()?.toString('utf8'), 'prod key');
  assert.equal(reader.done, true);
});

test('an empty agent still answers with a well-formed, zero-length list', () => {
  const reader = new ByteReader(encodeIdentitiesAnswer([]));
  assert.equal(reader.readByte(), SSH_AGENT_IDENTITIES_ANSWER);
  assert.equal(reader.readUInt32(), 0);
  assert.equal(reader.done, true);
});

test('a sign response is the number then the signature as a string', () => {
  const reader = new ByteReader(encodeSignResponse(Buffer.from('sig')));
  assert.equal(reader.readByte(), SSH_AGENT_SIGN_RESPONSE);
  assert.equal(reader.readString()?.toString('utf8'), 'sig');
});

test('a sign request round-trips through decode', () => {
  const flags = Buffer.alloc(4);
  flags.writeUInt32BE(0x04, 0);
  const payload = Buffer.concat([
    Buffer.from([SSH_AGENTC_SIGN_REQUEST]),
    encodeString(blob('ssh-rsa')),
    encodeString(Buffer.from('to be signed')),
    flags,
  ]);

  const request = decodeSignRequest(payload);
  assert.equal(keyTypeOf(request?.publicBlob as Buffer), 'ssh-rsa');
  assert.equal(request?.data.toString('utf8'), 'to be signed');
  assert.equal(request?.flags, 0x04);
});

test('a truncated or wrong-typed sign request is refused, never half-read', () => {
  assert.equal(decodeSignRequest(Buffer.from([SSH_AGENTC_SIGN_REQUEST])), undefined);
  assert.equal(decodeSignRequest(Buffer.from([11, 0, 0, 0, 0])), undefined, 'not a sign request');
});

// ---- what is being signed: the sentence the human's decision rests on -------

test('a complete publickey userauth is recognised, with the user and the service', () => {
  // The positive companion of the refusals below: a file of "unrecognised" cases passes
  // vacuously when the fixture itself is what the parser rejects (testing.md).
  const data = userauth({ blob: SIGNING_KEY, user: 'deploy' });

  const purpose = describeSignRequest(data, SIGNING_KEY);
  // `hostKey` is omitted, not `undefined`: `deepEqual` tells the two apart, and so does a reader.
  assert.deepEqual(purpose, { kind: 'ssh-login', user: 'deploy', service: 'ssh-connection' });
  assert.match(describePurpose(purpose), /SSH login as "deploy"/);
});

test('a host-bound OpenSSH login is described as a login to that host key', () => {
  // OpenSSH 8.9+ asks for `publickey-hostbound-v00@openssh.com` and appends the server host key
  // (PROTOCOL §3.1). It used to land in "a signature whose purpose this build does not recognise".
  const data = userauth({ blob: SIGNING_KEY, method: HOSTBOUND_METHOD, hostKey: HOST_KEY });

  const purpose = describeSignRequest(data, SIGNING_KEY);
  const fingerprint = keyFingerprintOf(HOST_KEY);
  assert.deepEqual(purpose, {
    kind: 'ssh-login',
    user: 'git',
    service: 'ssh-connection',
    hostKey: fingerprint,
    hostKeyType: 'ED25519',
  });
  // The server clause is a line of its own, named by key TYPE as `ssh-keygen -l` names it, and it
  // says only what is true: the signature is accepted by the server holding that host key.
  assert.equal(describeServerLine(purpose), `This login is for the server whose host key is ED25519 ${fingerprint}`);
  assert.ok(!describePurpose(purpose).includes(fingerprint), 'the sentence the user name sits in carries no host-key clause');
  assert.ok(!/to the server with host key|the server says/.test(describePurpose(purpose) + describeServerLine(purpose)));
});

test('a host key of a type this build cannot name is shown as UNKNOWN, never as the client wrote it', () => {
  // The host key blob is the client's text: its type string must not reach the prompt.
  const odd = blob('ssh-evil "pwned"\nSHA256:forged');
  const purpose = describeSignRequest(userauth({ blob: SIGNING_KEY, method: HOSTBOUND_METHOD, hostKey: odd }), SIGNING_KEY);

  assert.equal(describeServerLine(purpose), `This login is for the server whose host key is UNKNOWN ${keyFingerprintOf(odd)}`);
});

test('the host-key clause is named per key type, as ssh-keygen -l names them', () => {
  const openssh = ['@openssh', 'com'].join('.');
  const cases: [string, string][] = [
    ['ssh-rsa', 'RSA'],
    ['ecdsa-sha2-nistp256', 'ECDSA'],
    ['ssh-dss', 'DSA'],
    [`sk-ssh-ed25519${openssh}`, 'ED25519-SK'],
  ];
  for (const [type, shown] of cases) {
    const hostKey = blob(type);
    const purpose = describeSignRequest(userauth({ blob: SIGNING_KEY, method: HOSTBOUND_METHOD, hostKey }), SIGNING_KEY);
    assert.ok(describeServerLine(purpose).endsWith(`is ${shown} ${keyFingerprintOf(hostKey)}`), describeServerLine(purpose));
  }
});

test('a plain publickey login has no server line at all', () => {
  const purpose = describeSignRequest(userauth({ blob: SIGNING_KEY }), SIGNING_KEY);
  assert.equal(describeServerLine(purpose), '');
  assert.equal(describeServerLine({ kind: 'unknown' }), '');
});

test('a userauth with bytes after its last field is unrecognised', () => {
  // The prefix a parser stops reading at is where a different request can hide.
  const tail = Buffer.from('more');
  assert.deepEqual(describeSignRequest(userauth({ blob: SIGNING_KEY, trailing: tail }), SIGNING_KEY), {
    kind: 'unknown',
  });
  const hostBound = userauth({ blob: SIGNING_KEY, method: HOSTBOUND_METHOD, hostKey: HOST_KEY, trailing: tail });
  assert.deepEqual(describeSignRequest(hostBound, SIGNING_KEY), { kind: 'unknown' });
});

test('a userauth for a different public key is unrecognised', () => {
  // A login that names key A is not a login by key B — it is whatever else key B was asked to sign.
  const data = userauth({ blob: OTHER_KEY });
  assert.deepEqual(describeSignRequest(data, SIGNING_KEY), { kind: 'unknown' });
});

test('a userauth without the signature flag is unrecognised', () => {
  // `has_signature = FALSE` is the probe a client sends to ask whether a key would be accepted;
  // it is not the signed request, and a signature over it is not a login.
  const data = userauth({ blob: SIGNING_KEY, hasSignature: false });
  assert.deepEqual(describeSignRequest(data, SIGNING_KEY), { kind: 'unknown' });
});

test('a userauth cut short after the method is unrecognised', () => {
  // The old fixture, moved: this is all the earlier prefix parse needed to call it a login.
  const data = userauth({ blob: SIGNING_KEY, upTo: 'method' });
  assert.deepEqual(describeSignRequest(data, SIGNING_KEY), { kind: 'unknown' });
});

test('a host-bound userauth without its host key is unrecognised', () => {
  const data = userauth({ blob: SIGNING_KEY, method: HOSTBOUND_METHOD });
  assert.deepEqual(describeSignRequest(data, SIGNING_KEY), { kind: 'unknown' });
});

test('a git commit signature is recognised by its SSHSIG namespace', () => {
  const data = Buffer.concat([Buffer.from('SSHSIG'), encodeString('git'), encodeString('')]);

  const purpose = describeSignRequest(data, SIGNING_KEY);
  assert.deepEqual(purpose, { kind: 'sshsig', namespace: 'git' });
  assert.match(describePurpose(purpose), /Git signature/);
});

test('another SSHSIG namespace is named rather than mislabelled as git', () => {
  const data = Buffer.concat([Buffer.from('SSHSIG'), encodeString('file')]);
  assert.match(describePurpose(describeSignRequest(data, SIGNING_KEY)), /"file" namespace/);
});

test('an SSHSIG namespace is the requester\'s text: it cannot start a line, end its quotation or run long', () => {
  const clause = 'This login is for the server whose host key is ED25519 SHA256:FAKE';
  const data = Buffer.concat([Buffer.from('SSHSIG'), encodeString(`x"\n${clause}${'y'.repeat(200)}`)]);

  const said = describePurpose(describeSignRequest(data, SIGNING_KEY));

  assert.ok(!said.includes('\n'), JSON.stringify(said));
  assert.ok(!/[\p{C}\p{Zl}\p{Zp}]/u.test(said), JSON.stringify(said));
  const shown = /^a signature in the "(.*)" namespace$/u.exec(said)?.[1];
  assert.ok(shown !== undefined && [...shown].length <= 64, `the namespace is capped at 64 characters: ${said}`);
  assert.ok(shown?.startsWith('x\\"?'), `the quote is escaped and the newline is gone: ${said}`);
});

test('an unrecognised blob says so instead of guessing', () => {
  // A wrong description is worse than a vague one — it is what the decision rests on.
  const purpose = describeSignRequest(Buffer.from('some other protocol entirely'), SIGNING_KEY);
  assert.deepEqual(purpose, { kind: 'unknown' });
  assert.match(describePurpose(purpose), /does not recognise/);
});

test('a userauth blob for a method other than publickey is not reported as a login', () => {
  const data = userauth({ blob: SIGNING_KEY, user: 'u', method: 'password' });
  assert.deepEqual(describeSignRequest(data, SIGNING_KEY), { kind: 'unknown' });
});

test('a user name is untrusted text: it cannot end the sentence, start a line or imitate the host-key clause', () => {
  // The user comes from whoever asked for the signature (a forwarded agent serves a REMOTE ssh).
  // Quote, newline, an RTL mark and the host-key clause itself, then 200 more characters.
  const clause = 'This login is for the server whose host key is ED25519 SHA256:forged';
  const hostile = `root" (ssh-connection)\n${clause}\u202e${'x'.repeat(200)}`;
  const purpose = describeSignRequest(userauth({ blob: SIGNING_KEY, user: hostile }), SIGNING_KEY);

  const said = describePurpose(purpose);
  assert.ok(!/[\p{C}\p{Zl}\p{Zp}]/u.test(said), JSON.stringify(said));
  assert.ok(!said.includes('root" '), `the quote in the name is escaped: ${said}`);
  const shown = /^an SSH login as "(.*)" \(ssh-connection\)$/u.exec(said)?.[1];
  assert.ok(shown !== undefined && [...shown].length <= 64, `the name is capped at 64 characters: ${said}`);
  assert.ok(shown?.endsWith('…'), 'a cut name says so');
  assert.equal(describeServerLine(purpose), '', 'a plain publickey request names no host key, whatever the user wrote');
});

test('a short plain user name is shown as it is', () => {
  const purpose = describeSignRequest(userauth({ blob: SIGNING_KEY, user: 'deploy' }), SIGNING_KEY);
  assert.equal(describePurpose(purpose), 'an SSH login as "deploy" (ssh-connection)');
});

test('the log line keeps the raw user name, the prompt never does', () => {
  const user = 'a\u202eb';
  const purpose = describeSignRequest(userauth({ blob: SIGNING_KEY, user }), SIGNING_KEY);

  assert.ok(describePurposeForLog(purpose).includes(user), 'the raw value is in the log');
  assert.ok(!describePurpose(purpose).includes(user), 'and not in the prompt');
  assert.ok(!describePurposeForLog({ kind: 'unknown' }).includes('SSH login'));
});

test('a userauth for a service other than ssh-connection is unrecognised', () => {
  const data = userauth({ blob: SIGNING_KEY, service: 'ssh-userauth' });
  assert.deepEqual(describeSignRequest(data, SIGNING_KEY), { kind: 'unknown' });
});

test('a request whose message number is not 50 is unrecognised', () => {
  // The 0x32 after the session id is what tells a login from a certificate body (see describeSignRequest).
  for (const messageType of [0, 49, 51, 0x32 + 0x80]) {
    const data = userauth({ blob: SIGNING_KEY, messageType });
    assert.deepEqual(describeSignRequest(data, SIGNING_KEY), { kind: 'unknown' }, `message number ${messageType}`);
  }
});

test('the session id must be the size of a key-exchange hash', () => {
  // SHA-1, SHA-256, SHA-384, SHA-512. Anything between is not a session id.
  for (const length of [20, 32, 48, 64]) {
    const purpose = describeSignRequest(userauth({ blob: SIGNING_KEY, sessionIdLength: length }), SIGNING_KEY);
    assert.equal(purpose.kind, 'ssh-login', `a ${length}-byte session id is a login`);
  }
  for (const length of [0, 16, 19, 21, 33, 65, 4096]) {
    const data = userauth({ blob: SIGNING_KEY, sessionIdLength: length });
    assert.deepEqual(describeSignRequest(data, SIGNING_KEY), { kind: 'unknown' }, `a ${length}-byte session id`);
  }
});

test('a userauth that names an OpenSSH certificate is unrecognised when the agent signs with the plain key', () => {
  // A certificate login signs the SAME userauth bytes but names the certificate blob. The agent
  // holds only the plain key, so what it is asked to sign is not a login this build can name.
  const certType = ['ssh-ed25519-cert-v01', '@openssh.com'].join('');
  const certificate = blob(certType, 'nonce and the rest of the certificate');
  const data = userauth({ blob: certificate, algorithm: certType });

  assert.deepEqual(describeSignRequest(data, SIGNING_KEY), { kind: 'unknown' });
  // Positive control: the same request for the plain key is a login, so the refusal is about the certificate.
  assert.equal(describeSignRequest(userauth({ blob: SIGNING_KEY }), SIGNING_KEY).kind, 'ssh-login');
});

test('a certificate BODY handed over as data to sign is unrecognised', () => {
  // string cert-type || string nonce(32) || …: the cert type is 32 bytes, so it reads as a session id of
  // a KEX-hash length — and the byte after it is the top byte of the nonce's length, 0, not 50.
  const certType = ['ssh-ed25519-cert-v01', '@openssh.com'].join('');
  const body = Buffer.concat([encodeString(certType), encodeString(Buffer.alloc(32, 9)), encodeString(SIGNING_KEY)]);

  assert.equal(certType.length, 32, 'the fixture is the case that reads as a session id');
  assert.deepEqual(describeSignRequest(body, SIGNING_KEY), { kind: 'unknown' });
});

test('a host-bound userauth with an EMPTY host key is unrecognised', () => {
  const data = userauth({ blob: SIGNING_KEY, method: HOSTBOUND_METHOD, hostKey: Buffer.alloc(0) });
  assert.deepEqual(describeSignRequest(data, SIGNING_KEY), { kind: 'unknown' });
});

/** The offset of the length of every string field of a host-bound userauth request, in order. */
function lengthOffsets(data: Buffer): number[] {
  const offsets: number[] = [];
  let at = 0;
  const skipString = (): void => {
    offsets.push(at);
    at += 4 + data.readUInt32BE(at);
  };
  skipString(); // session id
  at += 1; // 50
  [skipString, skipString, skipString].forEach((skip) => skip()); // user, service, method
  at += 1; // has_signature
  [skipString, skipString, skipString].forEach((skip) => skip()); // algorithm, key, host key
  return offsets;
}

test('every truncation of a valid login, and a valid login plus a byte, is unrecognised and never throws', () => {
  const logins = [
    userauth({ blob: SIGNING_KEY, user: 'deploy' }),
    userauth({ blob: SIGNING_KEY, method: HOSTBOUND_METHOD, hostKey: HOST_KEY }),
  ];
  for (const login of logins) {
    assert.equal(describeSignRequest(login, SIGNING_KEY).kind, 'ssh-login', 'the fixture is a login');
    for (let cut = 0; cut < login.length; cut += 1) {
      assert.deepEqual(describeSignRequest(login.subarray(0, cut), SIGNING_KEY), { kind: 'unknown' }, `cut at ${cut}`);
    }
    const plusOne = Buffer.concat([login, Buffer.from([0])]);
    assert.deepEqual(describeSignRequest(plusOne, SIGNING_KEY), { kind: 'unknown' }, 'one trailing byte');
  }
});

test('a field announcing 4 GB is unrecognised, never an allocation or a throw', () => {
  const hostBound = userauth({ blob: SIGNING_KEY, method: HOSTBOUND_METHOD, hostKey: HOST_KEY });
  const offsets = lengthOffsets(hostBound);
  assert.equal(offsets.length, 7, 'session id, user, service, method, algorithm, key, host key');
  for (const offset of offsets) {
    const forged = Buffer.from(hostBound);
    forged.writeUInt32BE(0xffffffff, offset);
    assert.deepEqual(describeSignRequest(forged, SIGNING_KEY), { kind: 'unknown' }, `length at ${offset}`);
  }
});

test('the userauth builder treats an explicit undefined as "not given"', () => {
  // `{ ...DEFAULTS, ...parts }` let `user: undefined` replace the default and encodeString threw.
  const data = userauth({ blob: SIGNING_KEY, user: undefined, service: undefined, method: undefined });
  assert.deepEqual(describeSignRequest(data, SIGNING_KEY), { kind: 'ssh-login', user: 'git', service: 'ssh-connection' });
});

// --- what an unrecognised request leaves behind (0.77.0) ------------------------------------
//
// The dialog says "a signature whose purpose this build does not recognise" — deliberately, since
// a guessed description would be worse. But nothing recorded WHAT was unrecognised, so the one
// situation where a person most wants to look it up afterwards was the one that left no trace.
// Seen on a real host: a forwarded agent was asked to sign something that was neither an SSH
// login nor SSHSIG, and the log said only "SIGNED".

test('an unrecognised request is recorded by its shape, not by a guess', () => {
  const data = Buffer.concat([Buffer.from([0xde, 0xad, 0xbe, 0xef]), Buffer.alloc(300, 1)]);

  const said = describeUnknownShape(data);

  assert.match(said, /^304 bytes, starts de ad be ef /);
});

test('the record is a fingerprint, never a copy', () => {
  // It exists to identify a framing, not to keep the bytes about to be signed.
  const said = describeUnknownShape(Buffer.alloc(4096, 0xab));

  assert.equal(said.split('starts ')[1].split(' ').length, 16);
});
