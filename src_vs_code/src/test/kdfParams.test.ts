import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { SealedBlob, encryptJson, openBlob, openBlobAsync, sealBlob } from '../cryptoUtils';
import { ACCEPTED_SCRYPT } from '../scryptParams';

/**
 * The KDF parameters a blob may name (audit 2026-09-09, finding #6).
 *
 * <p>`kdfN`/`kdfR`/`kdfP` travel in the file so a later cost raise never orphans an older blob —
 * and, read without a bound, they were equally an instruction from whoever could write the file.
 * `maxmem` caps `N·r`; nothing capped `p`, which multiplies time at constant memory. Measured
 * while writing this file: `kdfP: 128` on a blob sealed at N=2^17 held a thread for <b>40
 * seconds</b> before answering "wrong password", and the PIN wrap of a synced vault reaches this
 * through background sync with a stored PIN, so nobody had to click anything.</p>
 *
 * <p><b>What these tests pin is the ORDER, not the error.</b> An implementation that derived the
 * key and then called the parameters wrong would satisfy an assertion about the error kind and
 * leave the cost exactly where it was. So every refused shape asserts that scrypt was never
 * called, through both open paths.</p>
 */

const PIN = 'a-pin-nobody-guesses';

/**
 * A blob whose recorded KDF fields are whatever the case under test needs.
 *
 * <p>The fields are `unknown` rather than `number | undefined` because that is what they are on
 * disk: this file models what a hand-edited or hostile file carries, which is the whole subject.
 * One cast, at the boundary between "arbitrary JSON" and the function's declared parameter, and
 * it is the shape the production code is being asked to survive.</p>
 */
interface EditedBlob {
  salt: string;
  iv: string;
  tag: string;
  data: string;
  kdfN?: unknown;
  kdfR?: unknown;
  kdfP?: unknown;
}

function withParams(kdfN?: unknown, kdfR?: unknown, kdfP?: unknown): SealedBlob {
  const { salt, iv, tag, data } = sealBlob({ v: 'the secret' }, PIN);
  const edited: EditedBlob = { salt, iv, tag, data };
  if (kdfN !== undefined) edited.kdfN = kdfN;
  if (kdfR !== undefined) edited.kdfR = kdfR;
  if (kdfP !== undefined) edited.kdfP = kdfP;
  return edited as SealedBlob;
}

/**
 * Run `body` with scrypt watched; answers how many times either form was called.
 *
 * <p>`require` rather than `import * as`: TypeScript's `__importStar` hands back a COPY whose
 * properties are getters, so assigning a spy onto it throws and — worse — would not be the object
 * `cryptoUtils` calls through. The module object is the only thing both files share.</p>
 */

const nodeCrypto = require('node:crypto') as Record<string, unknown>;

async function derivations(body: () => Promise<void> | void): Promise<number> {
  const real = { scryptSync: nodeCrypto.scryptSync, scrypt: nodeCrypto.scrypt };
  let calls = 0;
  for (const name of ['scryptSync', 'scrypt'] as const) {
    const original = real[name] as (...a: unknown[]) => unknown;
    nodeCrypto[name] = (...args: unknown[]): unknown => {
      calls += 1;
      return original(...args);
    };
  }
  try {
    await body();
  } finally {
    nodeCrypto.scryptSync = real.scryptSync;
    nodeCrypto.scrypt = real.scrypt;
  }
  return calls;
}

const kind = (e: unknown): string | undefined => (e as { kind?: string }).kind;

const REFUSED: [string, unknown?, unknown?, unknown?][] = [
  ["p=128 — the audit's measured multiplier", 1 << 17, 8, 128],
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
  // JSON has null and TypeScript's `?` does not: a field serialised as null is present, and must
  // not read as absent. All three null is the shape that would otherwise look like a legacy blob.
  ['every field null', null, null, null],
  ['N null, the rest right', null, 8, 1],
  ['partial: only N', 1 << 15, undefined, undefined],
  ['partial: only p', undefined, undefined, 128],
  ['partial: N and r, no p', 1 << 17, 8, undefined],
];

for (const [label, n, r, p] of REFUSED) {
  test(`a blob naming ${label} is refused by openBlob before any key is derived`, async () => {
    const blob = withParams(n, r, p);
    const calls = await derivations(() => {
      assert.throws(
        () => openBlob(blob, PIN),
        (e) => kind(e) === 'corrupted',
        'refused as corrupted, not as a wrong password',
      );
    });
    assert.equal(calls, 0, 'scrypt must not run for parameters this build never wrote');
  });

  test(`a blob naming ${label} is refused by openBlobAsync before any key is derived`, async () => {
    const blob = withParams(n, r, p);
    const calls = await derivations(async () => {
      await assert.rejects(
        openBlobAsync(blob, PIN),
        (e) => kind(e) === 'corrupted',
        'refused as corrupted, not as a wrong password',
      );
    });
    assert.equal(calls, 0, 'scrypt must not run for parameters this build never wrote');
  });
}

test('the refusal names the parameters it refused, so a person can tell newer from edited', () => {
  assert.throws(
    () => openBlob(withParams(1 << 19, 8, 1), PIN),
    (e: unknown) => /N=524288/.test((e as Error).message) && /r=8/.test((e as Error).message),
  );
});

/**
 * Every accepted tuple, taken from the production list rather than retyped.
 *
 * <p>A test that names 2^15 and 2^17 is a second copy of `ACCEPTED_SCRYPT`, and the day somebody
 * adds a third tuple it silently stops covering the set it claims to. Iterating the export means a
 * future tuple is tested the moment it exists.</p>
 */
for (const tuple of ACCEPTED_SCRYPT) {
  test(`N=${tuple.N}, r=${tuple.r}, p=${tuple.p} is accepted and IS derived with, both paths`, async () => {
    // The bytes were sealed at whatever `sealBlob` writes today. Relabelled with the SAME tuple the
    // open succeeds; relabelled with the other one it derives a different key and fails the GCM tag.
    // Either way the derivation HAPPENED, and that — not the outcome — is what says the bound let
    // this tuple past. Asserting the outcome would make this test depend on which tuple is current.
    const blob = withParams(tuple.N, tuple.r, tuple.p);
    const refused = (e: unknown): boolean => kind(e) === 'corrupted';

    const sync = await derivations(() => {
      try {
        openBlob(blob, PIN);
      } catch (e) {
        assert.ok(!refused(e), 'an accepted tuple is never refused by the parameter bound');
      }
    });
    assert.equal(sync, 1, 'openBlob derived with an accepted tuple');

    const async_ = await derivations(async () => {
      await openBlobAsync(blob, PIN).catch((e: unknown) => {
        assert.ok(!refused(e), 'an accepted tuple is never refused by the parameter bound');
      });
    });
    assert.equal(async_, 1, 'openBlobAsync derived with an accepted tuple');
  });
}

test("today's own seal round-trips through both paths", async () => {
  const fresh = sealBlob({ v: 'today' }, PIN);
  assert.equal(fresh.kdfN, 1 << 17);
  assert.deepEqual(openBlob(fresh, PIN), { v: 'today' });
  assert.deepEqual(await openBlobAsync(fresh, PIN), { v: 'today' });
});

test('a blob with no parameters at all is legacy and is derived at N=2^15, both paths', async () => {
  const legacy = withParams(undefined, undefined, undefined);
  const sync = await derivations(() => {
    assert.throws(() => openBlob(legacy, PIN), (e) => kind(e) === 'wrong-password');
  });
  assert.equal(sync, 1, 'all three absent is the one shape that means legacy');

  const async_ = await derivations(async () => {
    await assert.rejects(openBlobAsync(legacy, PIN), (e) => kind(e) === 'wrong-password');
  });
  assert.equal(async_, 1, 'and the async path agrees');
});

/**
 * The ordering five reviewers asked about, pinned rather than argued.
 *
 * <p>The worry: a future release raises the cost and bumps the envelope version, and an older build
 * meets that file — does the KDF bound call it CORRUPTED before the version gate can call it NEWER?
 * It cannot, because every envelope path parses the envelope first. This test would fail the day
 * somebody opened a payload without going through that gate.</p>
 */
test('an envelope from a newer format is reported as newer, not as bad KDF parameters', () => {
  const file = encryptJson({ v: 1 }, PIN);
  const future = JSON.parse(file) as Record<string, unknown>;
  future.version = 99;
  future.kdfN = 1 << 19; // a cost this build does not accept, as a raise would bring
  future.kdfP = 64;


  const { decryptJson } = require('../cryptoUtils') as typeof import('../cryptoUtils');
  assert.throws(
    () => decryptJson(JSON.stringify(future), PIN),
    (e) => kind(e) === 'unsupported-version',
    'the version gate answers first, so a newer file is never called corrupt',
  );
});
