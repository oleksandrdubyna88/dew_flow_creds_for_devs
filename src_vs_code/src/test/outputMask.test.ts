import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MASK, MIN_MASKABLE_LENGTH, SecretMasker, maskingBanner, shortValuesCaveat } from '../outputMask';

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

// ---- the local banner (E3.S1, K9): the words moved from `extension.ts`, not changed ----------------------------------

/** Today's banner text, written once here from `extension.ts` as it stood before the move (`:970-977`). */
const MASKED_WORDS = "Values are in this process's environment only, and are replaced with <CREDS_MASKED:NAME> in its output.";
const NO_PTY = ' No PTY: a program that needs a real terminal should use Run in Terminal instead.';

test('the_local_banner_is_unchanged_and_names_its_short_values', () => {
  const long = [{ value: 'x'.repeat(12), label: 'CREDS_REF_1' }];
  assert.ok(long[0].value.length >= MIN_MASKABLE_LENGTH, 'the fixture is long enough to be masked');
  assert.equal(shortValuesCaveat(long), '');
  assert.equal(maskingBanner(long), `${MASKED_WORDS}${NO_PTY}`);

  const short = [{ value: '123456', label: 'CREDS_REF_1' }];
  assert.ok(short[0].value.length < MIN_MASKABLE_LENGTH);
  const caveat = shortValuesCaveat(short);
  assert.ok(caveat.includes('CREDS_REF_1'), caveat);
  assert.ok(caveat.startsWith(' NOT masked, because they are too short'), caveat);
  assert.equal(maskingBanner(short), `${MASKED_WORDS}${caveat}${NO_PTY}`);
});
