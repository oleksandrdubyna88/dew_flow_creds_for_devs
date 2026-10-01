import assert from 'node:assert/strict';
import { test } from 'node:test';
import { automaticOpener, fieldReadingOf, plainText, unsealedText } from '../secretOpener';
import { lockSecret, plainSecret, readSecret } from '../secretEnvelope';

/**
 * The three reads `secretOpener.ts` gained for the typed-secrets plan (§2.3): the one adapter from an
 * opener's answer to an automatic consumer's, and the two owner-less reads the scans use. Each is
 * asked about the five things a slot can hold — absent, plain, woven, sealed, damaged — because a
 * wrong default for any one of them is the defect class the plan exists for (D7).
 */

const ACCOUNT = 'a1';
const OWNER = { id: 'e1', name: 'prod db' };

/** The five stored forms, each checked against the real parser so a fixture cannot be silently misread. */
async function forms(): Promise<Record<'plain' | 'woven' | 'sealed' | 'damaged', string>> {
  const all = {
    plain: 'hunter2',
    woven: plainSecret('hhuunntteerr22', true),
    sealed: await lockSecret('hunter2', ACCOUNT, '2468'),
    damaged: '{"v":1,"lock":{"wrap":',
  };
  assert.equal(readSecret(all.plain).kind, 'value');
  const woven = readSecret(all.woven);
  assert.equal(woven.kind === 'value' && woven.woven, true);
  assert.equal(readSecret(all.sealed).kind, 'locked');
  assert.equal(readSecret(all.damaged).kind, 'corrupt');
  return all;
}

test('fieldReadingOf: an automatic opener\'s five answers become the three a consumer must tell apart', async () => {
  const f = await forms();
  const read = async (stored: string | undefined, owner: { id: string; name: string; pinProtected?: boolean } = OWNER) =>
    fieldReadingOf(await automaticOpener(owner, stored));

  assert.deepEqual(await read(undefined), { kind: 'absent' }, 'absent is not a refusal');
  assert.deepEqual(await read(''), { kind: 'absent' }, 'an empty string is nothing, as every consumer already read it');
  assert.deepEqual(await read(f.plain), { kind: 'value', value: 'hunter2' });
  assert.deepEqual(await read(f.woven), { kind: 'value', value: 'hhuunntteerr22' }, 'a woven envelope is read as its value, as the opener always has');
  const sealed = await read(f.sealed);
  assert.equal(sealed.kind, 'withheld', 'a sealed value reached an automatic consumer');
  assert.match(sealed.kind === 'withheld' ? sealed.reason : '', /protected with its own PIN/);
  const marked = await read(f.plain, { ...OWNER, pinProtected: true });
  assert.equal(marked.kind, 'withheld', 'a marked entry\'s value in the clear reached an automatic consumer');
  const damaged = await read(f.damaged);
  assert.equal(damaged.kind, 'withheld', 'a damaged wrap reached an automatic consumer as text');
  assert.match(damaged.kind === 'withheld' ? damaged.reason : '', /cannot be read/);
});

test('plainText: only a value in the clear that is not woven can be judged as a password', async () => {
  const f = await forms();

  assert.equal(plainText(f.plain), 'hunter2', 'the companion: an ordinary password is still read');
  assert.equal(plainText(undefined), undefined);
  assert.equal(plainText(f.woven), undefined, 'a woven pair would be graded as a strong, unique password');
  assert.equal(plainText(f.sealed), undefined, 'ciphertext would be graded as a strong, unique password');
  assert.equal(plainText(f.damaged), undefined, 'a damaged wrap would be graded as a strong, unique password');
});

test('unsealedText: everything stored is seen as it is, except a sealed value', async () => {
  const f = await forms();

  assert.equal(unsealedText(f.plain), f.plain);
  assert.equal(unsealedText(f.woven), f.woven, 'the masker masks what it can see — the envelope as stored');
  assert.equal(unsealedText(f.damaged), f.damaged, 'a damaged wrap is still text a hint judges and a masker masks');
  assert.equal(unsealedText(f.sealed), undefined, 'a wrap is nothing to judge or mask');
  assert.equal(unsealedText(undefined), undefined);
});
