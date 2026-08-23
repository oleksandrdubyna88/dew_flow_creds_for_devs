import * as assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { test } from 'node:test';
import {
  GOOGLE_AUTH_ENDPOINT,
  buildGoogleAuthUrl,
  createPkcePair,
  decodeIdToken,
} from '../googleOauth';

test('PKCE challenge is the base64url sha256 of the verifier (S256)', () => {
  const { verifier, challenge } = createPkcePair();
  const expected = crypto.createHash('sha256').update(verifier).digest('base64url');
  assert.equal(challenge, expected);
  // base64url alphabet only — safe to embed in a URL without encoding.
  assert.match(verifier, /^[A-Za-z0-9_-]+$/);
  assert.ok(verifier.length >= 43, 'RFC 7636 requires a verifier of at least 43 chars');
});

test('every PKCE pair is fresh', () => {
  assert.notEqual(createPkcePair().verifier, createPkcePair().verifier);
});

test('builds the Google auth URL with all required parameters', () => {
  const url = new URL(
    buildGoogleAuthUrl({
      clientId: 'client-1',
      redirectUri: 'http://127.0.0.1:38471/',
      state: 'st@te value',
      codeChallenge: 'chall',
    }),
  );
  assert.equal(`${url.origin}${url.pathname}`, GOOGLE_AUTH_ENDPOINT);
  assert.equal(url.searchParams.get('client_id'), 'client-1');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:38471/');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('state'), 'st@te value');
  assert.equal(url.searchParams.get('code_challenge'), 'chall');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('scope'), 'openid email profile');
  assert.equal(url.searchParams.get('access_type'), 'offline');
});

function fakeIdToken(payload: unknown): string {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  return `${b64({ alg: 'RS256' })}.${b64(payload)}.signature`;
}

test('decodes sub and email from an id_token payload', () => {
  const identity = decodeIdToken(fakeIdToken({ sub: 'g-123', email: 'user@gmail.com' }));
  assert.deepEqual(identity, { sub: 'g-123', email: 'user@gmail.com' });
});

test('rejects a malformed id_token', () => {
  assert.throws(() => decodeIdToken('only-one-part'), /Malformed id_token/);
  assert.throws(() => decodeIdToken('a.####.c'), /Unreadable id_token/);
});

test('rejects an id_token without sub or email', () => {
  assert.throws(() => decodeIdToken(fakeIdToken({ email: 'x@y.z' })), /sub.*email/);
  assert.throws(() => decodeIdToken(fakeIdToken({ sub: 'g-1' })), /sub.*email/);
});
