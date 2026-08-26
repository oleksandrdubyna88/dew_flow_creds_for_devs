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
  keyTypeOf,
} from '../sshAgentProtocol';

const blob = (type: string, body = 'body') => Buffer.concat([encodeString(type), encodeString(body)]);

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

test('an SSH userauth blob is recognised, with the user and the service', () => {
  const data = Buffer.concat([
    encodeString(Buffer.alloc(32, 7)), // session id
    Buffer.from([50]), // SSH_MSG_USERAUTH_REQUEST
    encodeString('deploy'),
    encodeString('ssh-connection'),
    encodeString('publickey'),
  ]);

  const purpose = describeSignRequest(data);
  assert.deepEqual(purpose, { kind: 'ssh-login', user: 'deploy', service: 'ssh-connection' });
  assert.match(describePurpose(purpose), /SSH login as "deploy"/);
});

test('a git commit signature is recognised by its SSHSIG namespace', () => {
  const data = Buffer.concat([Buffer.from('SSHSIG'), encodeString('git'), encodeString('')]);

  const purpose = describeSignRequest(data);
  assert.deepEqual(purpose, { kind: 'sshsig', namespace: 'git' });
  assert.match(describePurpose(purpose), /Git signature/);
});

test('another SSHSIG namespace is named rather than mislabelled as git', () => {
  const data = Buffer.concat([Buffer.from('SSHSIG'), encodeString('file')]);
  assert.match(describePurpose(describeSignRequest(data)), /"file" namespace/);
});

test('an unrecognised blob says so instead of guessing', () => {
  // A wrong description is worse than a vague one — it is what the decision rests on.
  const purpose = describeSignRequest(Buffer.from('some other protocol entirely'));
  assert.deepEqual(purpose, { kind: 'unknown' });
  assert.match(describePurpose(purpose), /does not recognise/);
});

test('a userauth blob for a method other than publickey is not reported as a login', () => {
  const data = Buffer.concat([
    encodeString(Buffer.alloc(32, 7)),
    Buffer.from([50]),
    encodeString('u'),
    encodeString('ssh-connection'),
    encodeString('password'),
  ]);
  assert.deepEqual(describeSignRequest(data), { kind: 'unknown' });
});
