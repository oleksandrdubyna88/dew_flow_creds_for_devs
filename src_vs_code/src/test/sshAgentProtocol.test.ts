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
  });
  assert.ok(
    describePurpose(purpose).includes(`to the server with host key ${fingerprint}`),
    describePurpose(purpose),
  );
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
