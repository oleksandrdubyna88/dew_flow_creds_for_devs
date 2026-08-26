import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MASK, MIN_MASKABLE_LENGTH, SecretMasker } from '../outputMask';

function feed(masker: SecretMasker, chunks: string[]): string {
  return chunks.map((chunk) => masker.push(chunk)).join('') + masker.flush();
}

test('a secret in one chunk is replaced', () => {
  const masker = new SecretMasker(['hunter2000']);
  assert.equal(feed(masker, ['password is hunter2000, use it\n']), `password is ${MASK}, use it\n`);
});

test('a secret SPLIT across two chunks is still caught — the reason this class exists', () => {
  const masker = new SecretMasker(['hunter2000']);
  assert.equal(feed(masker, ['token: hunt', 'er2000 done']), `token: ${MASK} done`);
});

test('a secret split across many chunks, one character at a time', () => {
  const masker = new SecretMasker(['abcdefghij']);
  assert.equal(feed(masker, [...'xx abcdefghij yy']), `xx ${MASK} yy`);
});

test('several occurrences and several secrets are all replaced', () => {
  const masker = new SecretMasker(['alpha1-value', 'beta22-value']);
  assert.equal(
    feed(masker, ['alpha1-value beta22-value alpha1-value']),
    `${MASK} ${MASK} ${MASK}`,
  );
});

test('output that contains no secret passes through byte for byte', () => {
  const masker = new SecretMasker(['sekrit99']);
  const text = 'ordinary output\nwith lines\n';
  assert.equal(feed(masker, [text]), text);
});

test('flush releases the held tail, so nothing is swallowed at the end', () => {
  const masker = new SecretMasker(['longsecretvalue']);
  const pushed = masker.push('ends with a partial: longsecretval');
  const flushed = masker.flush();
  assert.equal(pushed + flushed, 'ends with a partial: longsecretval');
});

test('a very short secret is NOT masked — the limit is stated rather than discovered', () => {
  // Masking "a" or "42" would shred ordinary output into [masked] soup and hide nothing
  // worth hiding; a value that short is not a credential.
  const short = 'x'.repeat(MIN_MASKABLE_LENGTH - 1);
  const masker = new SecretMasker([short]);
  assert.equal(feed(masker, [`value ${short} here`]), `value ${short} here`);
});

test('a masker with nothing to hide is a pass-through, and holds nothing back', () => {
  const masker = new SecretMasker([]);
  assert.equal(masker.push('immediately visible'), 'immediately visible');
  assert.equal(masker.flush(), '');
});

test('empty and whitespace-only secrets are ignored', () => {
  const masker = new SecretMasker(['', '   ', undefined as unknown as string]);
  assert.equal(feed(masker, ['nothing   is hidden']), 'nothing   is hidden');
});

test('masking is applied to the longest secret first, so one is not shredded by another', () => {
  // 'tokenvalue' contains 'token'; replacing the short one first would leave 'value'
  // dangling and the long secret partly visible.
  const masker = new SecretMasker(['tokens', 'tokensvalue']);
  assert.equal(feed(masker, ['x tokensvalue y']), `x ${MASK} y`);
});
