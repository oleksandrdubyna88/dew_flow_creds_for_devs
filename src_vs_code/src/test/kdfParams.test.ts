import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { SealedBlob, openBlob, openBlobAsync, sealBlob } from '../cryptoUtils';

// The MODULE object, not a namespace import: `import * as` compiles to a frozen view with getters,
// and a spy has to be assigned onto the object `cryptoUtils` reads through.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeCrypto = require('node:crypto') as typeof import('node:crypto');

/**
 * The KDF parameters a blob may name (audit 2026-09-09, finding #6).
 *
 * <p>`kdfN`/`kdfR`/`kdfP` travel in the file so a later cost raise never orphans an older blob —
 * and, read without a bound, they let whoever can write the file choose how long every reader
 * spends deriving. `maxmem` caps `N·r`; nothing capped `p`, which multiplies time at constant
 * memory. The open therefore accepts exactly the tuples this build has ever written and refuses
 * everything else <b>before</b> the derivation — which is the property these tests pin: not that
 * the open fails, but that scrypt was never called.</p>
 *
 * <p>The spies replace `scryptSync`/`scrypt` on the `node:crypto` module object for the length of
 * one test. `cryptoUtils` reads them through a live binding, so the replacement is what it calls.</p>
 */

const PIN = 'a-pin-nobody-guesses';

type Field = number | string | undefined;

/** A blob sealed with today's defaults, with its recorded parameters rewritten. */
function withParams(kdfN: Field, kdfR: Field, kdfP: Field) {
  const blob = sealBlob({ v: 'the secret' }, PIN);
  const edited: Record<string, unknown> = { salt: blob.salt, iv: blob.iv, tag: blob.tag, data: blob.data };
  if (kdfN !== undefined) edited.kdfN = kdfN;
  if (kdfR !== undefined) edited.kdfR = kdfR;
  if (kdfP !== undefined) edited.kdfP = kdfP;
  return edited as unknown as SealedBlob;
}

/** Run `body` with scrypt watched; answers how many times either form was called. */
async function derivations(body: () => Promise<void> | void): Promise<number> {
  const real = { sync: nodeCrypto.scryptSync, async: nodeCrypto.scrypt };
  let calls = 0;
  const mutable = nodeCrypto as unknown as { scryptSync: unknown; scrypt: unknown };
  mutable.scryptSync = (...args: unknown[]) => {
    calls += 1;
    return (real.sync as (...a: unknown[]) => unknown)(...args);
  };
  mutable.scrypt = (...args: unknown[]) => {
    calls += 1;
    return (real.async as (...a: unknown[]) => unknown)(...args);
  };
  try {
    await body();
  } finally {
    mutable.scryptSync = real.sync;
    mutable.scrypt = real.async;
  }
  return calls;
}

const kind = (e: unknown): string | undefined => (e as { kind?: string }).kind;

const REFUSED: [string, Field, Field, Field][] = [
  ['p=128 — the audit\'s measured multiplier', 1 << 17, 8, 128],
  ['r=16', 1 << 17, 16, 1],
  ['N=2^14 — in range, never written', 1 << 14, 8, 1],
  ['N=2^18 — in range, never written', 1 << 18, 8, 1],
  ['N=2^20', 1 << 20, 8, 1],
  ['N=3·2^15 — not a power of two', 3 * (1 << 15), 8, 1],
  ['N=2^13', 1 << 13, 8, 1],
  ['N=0.5', 0.5, 8, 1],
  ['N=NaN', Number.NaN, 8, 1],
  ['N negative', -(1 << 15), 8, 1],
  ['N as a string', '32768', 8, 1],
  ['partial: only N', 1 << 15, undefined, undefined],
  ['partial: only p', undefined, undefined, 128],
  ['partial: N and r, no p', 1 << 17, 8, undefined],
];

for (const [label, n, r, p] of REFUSED) {
  test(`a blob naming ${label} is refused by openBlob before any key is derived`, async () => {
    const blob = withParams(n, r, p);
    const calls = await derivations(() => {
      assert.throws(() => openBlob(blob, PIN), (e) => kind(e) === 'corrupted', 'refused as corrupted, not as a wrong password');
    });
    assert.equal(calls, 0, 'scrypt must not run for parameters this build never wrote');
  });

  test(`a blob naming ${label} is refused by openBlobAsync before any key is derived`, async () => {
    const blob = withParams(n, r, p);
    const calls = await derivations(async () => {
      await assert.rejects(openBlobAsync(blob, PIN), (e) => kind(e) === 'corrupted', 'refused as corrupted, not as a wrong password');
    });
    assert.equal(calls, 0, 'scrypt must not run for parameters this build never wrote');
  });
}

test('the two tuples this build has written still open, through both paths', async () => {
  // 2^17 is what sealBlob writes today; 2^15 is what every blob written before the raise was
  // sealed at. A blob sealed at 2^17 and relabelled 2^15 derives a different key and fails the
  // tag — that is the existing kdfMigration test — so the legacy tuple is proved on its own
  // seal rather than by relabelling.
  const fresh = sealBlob({ v: 'today' }, PIN);
  assert.equal(fresh.kdfN, 1 << 17);
  assert.deepEqual(openBlob(fresh, PIN), { v: 'today' });
  assert.deepEqual(await openBlobAsync(fresh, PIN), { v: 'today' });

  const legacyShaped = withParams(1 << 15, 8, 1);
  // The bytes were sealed at 2^17, so the open must reach the tag check and fail THERE — proof
  // that {2^15, 8, 1} passed the parameter bound and was derived with.
  const calls = await derivations(() => {
    assert.throws(() => openBlob(legacyShaped, PIN), (e) => kind(e) === 'wrong-password');
  });
  assert.equal(calls, 1, 'an accepted tuple is derived with');
});

test('a blob with no parameters at all is legacy and is derived at N=2^15', async () => {
  const legacy = withParams(undefined, undefined, undefined);
  const calls = await derivations(() => {
    assert.throws(() => openBlob(legacy, PIN), (e) => kind(e) === 'wrong-password');
  });
  assert.equal(calls, 1, 'all three absent is the one shape that means legacy');
});
