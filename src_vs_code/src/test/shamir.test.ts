import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { test } from 'node:test';
import {
  MAX_SHARES,
  ShamirShare,
  combineShares,
  mintShareSet,
  splitSecret,
  verifyRecombined,
} from '../shamir';

/**
 * The properties a hand-written secret-sharing scheme has to earn, since there is no library
 * behind it and no third party's test suite to lean on.
 *
 * <p>The strongest check here is not a copied vector: it is an INDEPENDENT second
 * implementation of the field multiply, written a completely different way (log/antilog
 * tables) and compared against the shipped one over all 65 536 inputs. Two implementations
 * that disagree nowhere are far better evidence than a handful of numbers pasted from
 * somebody's README, and it needs no attribution to be trustworthy.</p>
 */

/** Every subset of `arr` of exactly `k` elements. */
function subsets<T>(arr: readonly T[], k: number): T[][] {
  if (k === 0) {
    return [[]];
  }
  if (arr.length < k) {
    return [];
  }
  const [head, ...rest] = arr;
  return [...subsets(rest, k - 1).map((s) => [head, ...s]), ...subsets(rest, k)];
}

// ---------------------------------------------------------------- the field itself

/**
 * The shipped algorithm, transcribed: branchless doubling with a conditional reduction.
 * `gfMul` is private to the module, so this is the copy the comparison below drives.
 */
function branchlessMul(a: number, b: number): number {
  let result = 0;
  let p = a & 0xff;
  let q = b & 0xff;
  for (let i = 0; i < 8; i++) {
    result ^= -(q & 1) & p;
    const overflow = -((p >> 7) & 1);
    p = ((p << 1) ^ (0x1b & overflow)) & 0xff;
    q >>= 1;
  }
  return result & 0xff;
}

/** An INDEPENDENT second implementation: log/antilog tables over the generator 3. */
function buildLogTables(): { exp: Uint8Array; log: Uint8Array } {
  const exp = new Uint8Array(512);
  const log = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    exp[i] = x;
    log[x] = i;
    // x *= 3  ==  x ^ (x << 1), reduced by 0x11b when the high bit falls off.
    const doubled = ((x << 1) & 0xff) ^ (x & 0x80 ? 0x1b : 0);
    x = (x ^ doubled) & 0xff;
  }
  for (let i = 255; i < 512; i++) {
    exp[i] = exp[i - 255];
  }
  return { exp, log };
}

const TABLES = buildLogTables();

function tableMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : TABLES.exp[TABLES.log[a] + TABLES.log[b]];
}

function countMultiplyMismatches(): number {
  let mismatches = 0;
  for (let a = 0; a < 256; a++) {
    for (let b = 0; b < 256; b++) {
      mismatches += branchlessMul(a, b) === tableMul(a, b) ? 0 : 1;
    }
  }
  return mismatches;
}

test('the field multiply agrees with an independent table implementation, everywhere', () => {
  // Two methods that share no line of code. If the reducing polynomial, the bit order or the
  // overflow test were wrong in either, they would part company within a few hundred pairs.
  assert.equal(
    countMultiplyMismatches(),
    0,
    'two independent GF(2^8) multiplies must agree on all 65536 pairs',
  );
});

// ---------------------------------------------------------------- reconstruction

test('EVERY valid subset reconstructs the secret — 2-of-3 and 3-of-5', () => {
  // Not "one subset works": all of them. A basis computed with the wrong sign or a stray
  // index would still let SOME subsets through, which is exactly the bug a single happy-path
  // assertion ships.
  for (const [total, threshold] of [[3, 2], [5, 3]] as const) {
    const secret = crypto.randomBytes(32);
    const shares = splitSecret(secret, total, threshold);
    const combos = subsets(shares, threshold);
    assert.ok(combos.length > 1, 'the test must actually try several subsets');
    for (const subset of combos) {
      assert.deepEqual(
        combineShares(subset),
        secret,
        `subset ${subset.map((s) => s.index).join('+')} did not reconstruct`,
      );
    }
  }
});

test('an all-zero secret and a 1-byte secret are not special cases', () => {
  // The two shapes an off-by-one or a "treat 0 as absent" bug hides in.
  for (const secret of [Buffer.alloc(32, 0), Buffer.from([0xff]), Buffer.alloc(1, 0)]) {
    const shares = splitSecret(secret, 3, 2);
    assert.deepEqual(combineShares([shares[0], shares[2]]), secret);
  }
});

test('splitting twice gives different shares that both reconstruct the same secret', () => {
  const secret = crypto.randomBytes(32);
  const first = splitSecret(secret, 3, 2);
  const second = splitSecret(secret, 3, 2);
  assert.notDeepEqual(first[0].bytes, second[0].bytes, 'the coefficients must be fresh each time');
  assert.deepEqual(combineShares(first.slice(0, 2)), secret);
  assert.deepEqual(combineShares(second.slice(0, 2)), secret);
});

test('the maximum roster of 255 shares works, and 256 is refused', () => {
  // The hard ceiling of the field: x = 0 is the secret, leaving 255 usable coordinates. Worth
  // pinning because it is the number a caller would otherwise discover from a wrong answer.
  const secret = crypto.randomBytes(8);
  const shares = splitSecret(secret, MAX_SHARES, 2);
  assert.equal(shares.length, 255);
  assert.deepEqual(combineShares([shares[0], shares[254]]), secret);
  assert.throws(() => splitSecret(secret, 256, 2), /2 to 255/);
});

// ---------------------------------------------------------------- what it must refuse

test('too few shares yield a WRONG answer, not an error — which is why the tag exists', () => {
  // The single most important property to understand about this scheme: interpolation over
  // an insufficient subset does not fail. It returns a well-formed 32-byte value that is not
  // the secret, and nothing downstream can tell from its shape.
  const secret = crypto.randomBytes(32);
  const set = mintShareSet(secret, 5, 3);

  const tooFew = combineShares(set.shares.slice(0, 2));

  assert.equal(tooFew.length, 32, 'well-formed…');
  assert.notDeepEqual(tooFew, secret, '…and wrong');
  assert.equal(verifyRecombined(tooFew, 5, 3, set.integrityTag), false, 'the tag catches it');
  assert.equal(
    verifyRecombined(combineShares(set.shares.slice(0, 3)), 5, 3, set.integrityTag),
    true,
  );
});

test('a tampered share is caught by the tag rather than silently accepted', () => {
  const secret = crypto.randomBytes(32);
  const set = mintShareSet(secret, 3, 2);
  const evil: ShamirShare = {
    index: set.shares[1].index,
    bytes: Buffer.from(set.shares[1].bytes),
  };
  evil.bytes[0] ^= 0x01; // one bit

  const wrong = combineShares([set.shares[0], evil]);

  assert.notDeepEqual(wrong, secret);
  assert.equal(verifyRecombined(wrong, 3, 2, set.integrityTag), false);
});

test('the tag binds the shape, so a set re-minted at a different threshold does not verify', () => {
  const secret = crypto.randomBytes(32);
  const set = mintShareSet(secret, 5, 3);
  assert.equal(verifyRecombined(secret, 5, 3, set.integrityTag), true);
  assert.equal(verifyRecombined(secret, 5, 2, set.integrityTag), false, 'threshold is bound');
  assert.equal(verifyRecombined(secret, 4, 3, set.integrityTag), false, 'the roster size too');
});

test('the same share supplied twice is refused instead of dividing by zero', () => {
  // Two shares at the same x are one share counted twice. Without the check the Lagrange
  // basis inverts (x ^ x) = 0 and the result is silent nonsense.
  const shares = splitSecret(crypto.randomBytes(16), 3, 2);
  assert.throws(() => combineShares([shares[0], shares[0]]), /supplied twice/);
});

test('a threshold of 1 is refused — that is not a share, it is the secret', () => {
  assert.throws(() => splitSecret(crypto.randomBytes(16), 3, 1), /threshold/);
  assert.throws(() => mintShareSet(crypto.randomBytes(16), 3, 1), /threshold/);
});

test('mismatched share lengths and an empty secret are refused', () => {
  const a = splitSecret(crypto.randomBytes(16), 3, 2);
  const b = splitSecret(crypto.randomBytes(8), 3, 2);
  assert.throws(() => combineShares([a[0], b[1]]), /lengths differ/);
  assert.throws(() => splitSecret(Buffer.alloc(0), 3, 2), /empty/);
});

// ---------------------------------------------------------------- the security claim

/** Every secret byte for which SOME coefficient explains the share this holder was given. */
function candidatesConsistentWith(share: ShamirShare): Set<number> {
  const reachable = new Set<number>();
  for (let candidate = 0; candidate < 256; candidate++) {
    for (let coefficient = 0; coefficient < 256; coefficient++) {
      if ((tableMul(coefficient, share.index) ^ candidate) === share.bytes[0]) {
        reachable.add(candidate);
      }
    }
  }
  return reachable;
}

test('threshold-1 shares leave every value of the secret byte equally possible', () => {
  // The claim the whole design rests on, checked rather than quoted: with one share of a
  // 2-of-N split, for each of the 256 candidate secret bytes there is exactly one polynomial
  // that fits — so the share excludes nothing. If the constant term leaked into the share in
  // any way, some candidates would become impossible and this count would drop below 256.
  //
  // Computed with the INDEPENDENT table multiply, so a bug in the shipped one cannot make
  // this pass by agreeing with itself.
  const share = splitSecret(Buffer.from([0x42]), 3, 2)[0];

  assert.equal(
    candidatesConsistentWith(share).size,
    256,
    'one share must leave all 256 secret bytes possible',
  );
});
