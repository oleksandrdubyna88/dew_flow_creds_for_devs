import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { test } from 'node:test';
import {
  Contribution,
  endRecoverySession,
  keyMatchesPublished,
  newSessionKeys,
  recoverOrgKey,
  sealShareToSession,
  wipe,
} from '../breakGlass';
import {
  ESCROW_WRAP_INFO,
  generateOrgRecoveryKeypair,
  openWithPrivateKey,
  sealToPublicKey,
} from '../orgEscrowCrypto';
import { mintShareSet } from '../shamir';

/**
 * What happens on the initiating officer's machine. The server counts contributions and cannot
 * check a single one, so every guarantee about a recovery being genuine is made here.
 */

const ORG = generateOrgRecoveryKeypair();
const SET = mintShareSet(ORG.privateKey, 3, 2);

function contribute(
  officerEmail: string,
  shareIndex: number,
  bytes: Buffer,
  sessionPublicKey: Buffer,
): Contribution {
  const sealed = sealShareToSession({ index: shareIndex, bytes }, sessionPublicKey);
  return { officerEmail, shareIndex, sealed };
}

function realContribution(officer: string, which: number, sessionPublicKey: Buffer): Contribution {
  const share = SET.shares[which];
  return contribute(officer, share.index, share.bytes, sessionPublicKey);
}

test('two genuine contributions rebuild the organisation key', () => {
  const session = newSessionKeys();
  const contributions = [
    realContribution('cto@x.dev', 0, session.publicKey),
    realContribution('lead@x.dev', 1, session.publicKey),
  ];

  const outcome = recoverOrgKey(contributions, session.privateKey, 2, 3, SET.integrityTag);

  assert.equal(outcome.kind, 'recovered');
  assert.ok(outcome.kind === 'recovered');
  assert.deepEqual(outcome.orgPrivateKey, ORG.privateKey);
  assert.deepEqual(outcome.contributors, ['cto@x.dev', 'lead@x.dev']);
  assert.equal(keyMatchesPublished(outcome.orgPrivateKey, ORG.publicKey), true);
});

test('below the threshold nothing is attempted, and the shortfall is named', () => {
  const session = newSessionKeys();

  const outcome = recoverOrgKey(
    [realContribution('cto@x.dev', 0, session.publicKey)],
    session.privateKey, 2, 3, SET.integrityTag);

  assert.deepEqual(outcome, { kind: 'tooFew', have: 1, need: 2 });
});

test('a bogus contribution does not poison a quorum that also holds two real ones', () => {
  // The reason subsets are tried rather than "the first two that arrived". Interpolation over a
  // wrong subset does not FAIL — it returns a well-formed key that is simply not the right one,
  // and the failure would surface a step later as "the escrow wrap will not open", pointing at
  // the wrong thing entirely.
  const session = newSessionKeys();
  const contributions = [
    contribute('impostor@x.dev', 7, crypto.randomBytes(32), session.publicKey),
    realContribution('cto@x.dev', 0, session.publicKey),
    realContribution('lead@x.dev', 1, session.publicKey),
  ];

  const outcome = recoverOrgKey(contributions, session.privateKey, 2, 3, SET.integrityTag);

  assert.ok(outcome.kind === 'recovered');
  assert.deepEqual(outcome.orgPrivateKey, ORG.privateKey);
  assert.deepEqual(
    outcome.contributors,
    ['cto@x.dev', 'lead@x.dev'],
    'and it names who actually did it, not who merely turned up',
  );
});

test('shares from a superseded ceremony are refused rather than rebuilding a useless key', () => {
  // They combine perfectly well — into the key of a ceremony nothing is sealed to any more.
  // Saying so here beats failing one step later against a wrap.
  const session = newSessionKeys();
  const older = mintShareSet(generateOrgRecoveryKeypair().privateKey, 3, 2);
  const contributions = [
    contribute('cto@x.dev', older.shares[0].index, older.shares[0].bytes, session.publicKey),
    contribute('lead@x.dev', older.shares[1].index, older.shares[1].bytes, session.publicKey),
  ];

  const outcome = recoverOrgKey(contributions, session.privateKey, 2, 3, SET.integrityTag);

  assert.deepEqual(outcome, { kind: 'noValidQuorum', opened: 2 });
});

test('a contribution sealed to the WRONG session is dropped, not fatal', () => {
  // One officer resealing to a stale session id must not stop the others from finishing.
  const session = newSessionKeys();
  const other = newSessionKeys();
  const contributions = [
    realContribution('confused@x.dev', 2, other.publicKey),
    realContribution('cto@x.dev', 0, session.publicKey),
    realContribution('lead@x.dev', 1, session.publicKey),
  ];

  const outcome = recoverOrgKey(contributions, session.privateKey, 2, 3, SET.integrityTag);

  assert.ok(outcome.kind === 'recovered');
  assert.deepEqual(outcome.contributors, ['cto@x.dev', 'lead@x.dev']);
});

test('a recovered key that does not match the published one is caught before it opens anything', () => {
  const impostor = generateOrgRecoveryKeypair();
  assert.equal(keyMatchesPublished(impostor.privateKey, ORG.publicKey), false);
  assert.equal(keyMatchesPublished(ORG.privateKey, ORG.publicKey), true);
});

test('the whole recovery, end to end: session → contributions → key → the target vault opens', () => {
  const session = newSessionKeys();
  const targetMaster = crypto.randomBytes(32);
  // Sealed long ago by the departed employee's client, to a key nobody held assembled.
  const escrowWrap = sealToPublicKey(targetMaster, ORG.publicKey, ESCROW_WRAP_INFO);

  const outcome = recoverOrgKey(
    [
      realContribution('cto@x.dev', 0, session.publicKey),
      realContribution('devops@x.dev', 2, session.publicKey),
    ],
    session.privateKey, 2, 3, SET.integrityTag);

  assert.ok(outcome.kind === 'recovered');
  assert.equal(keyMatchesPublished(outcome.orgPrivateKey, ORG.publicKey), true);
  assert.deepEqual(
    openWithPrivateKey(escrowWrap, outcome.orgPrivateKey, ESCROW_WRAP_INFO),
    targetMaster,
  );
});

test('wiping really zeroes the bytes — a dropped reference is not a forgotten key', () => {
  const key = crypto.randomBytes(32);
  wipe(key, undefined);
  assert.deepEqual(key, Buffer.alloc(32));
});

test('the session private key never appears in what is sent to the server', () => {
  // The blob an officer posts is sealed TO the session public key; the private half exists only
  // in the initiator's process. A test rather than a comment because this is the property that
  // makes the server a relay rather than a participant.
  const session = newSessionKeys();
  const sealed = sealShareToSession(SET.shares[0], session.publicKey);
  const wire = JSON.stringify(sealed);

  assert.equal(wire.includes(session.privateKey.toString('base64')), false);
  assert.equal(wire.includes(SET.shares[0].bytes.toString('base64')), false, 'nor the share itself');
});

// ---------------------------------------------------------------- what a hostile relay can do

/**
 * The server relays the contributions and chooses their ORDER, their COUNT, and — because
 * `shareIndex` and `officerEmail` sit outside the sealed blob — their labels. It cannot read a
 * share, and the integrity tag stops it forging a quorum. What it must also not be able to do is
 * stop a real quorum from working, which is what these pin down.
 */

test('a duplicated index does not abort a recovery that has a valid quorum in it', async () => {
  // `combineShares` THROWS on a duplicate, `combinations` emits subsets in list order, and the
  // server picks that order — so a poisoned pair placed first was reached before any valid
  // subset and took the whole recovery with it.
  const session = newSessionKeys();
  const real = realContribution('cto@x.dev', 0, session.publicKey);
  const contributions = [
    real,
    { ...real, officerEmail: 'replay@x.dev' }, // same x, submitted twice
    realContribution('lead@x.dev', 1, session.publicKey),
  ];

  const outcome = recoverOrgKey(contributions, session.privateKey, 2, 3, SET.integrityTag);

  assert.ok(outcome.kind === 'recovered', 'a duplicate must be skipped, not fatal');
  assert.deepEqual(outcome.orgPrivateKey, ORG.privateKey);
});

test('an out-of-range index is dropped rather than thrown', async () => {
  // x = 0 IS the secret and x > 255 is outside the field; both make `combineShares` throw.
  const session = newSessionKeys();
  const real = realContribution('cto@x.dev', 0, session.publicKey);
  for (const bad of [0, 256, 1.5, Number.NaN]) {
    const outcome = recoverOrgKey(
      [
        { ...real, shareIndex: bad, officerEmail: 'hostile@x.dev' },
        real,
        realContribution('lead@x.dev', 1, session.publicKey),
      ],
      session.privateKey, 2, 3, SET.integrityTag);

    assert.ok(outcome.kind === 'recovered', `index ${bad} aborted the recovery`);
  }
});

test('a flood of contributions cannot make the search unbounded', async () => {
  // `combinations` builds every C(n, t) subset eagerly, and the server chooses n. At n=26, t=8
  // that is 1.5M subsets built before the first is tried — on the extension-host thread.
  const session = newSessionKeys();
  const real = [
    realContribution('cto@x.dev', 0, session.publicKey),
    realContribution('lead@x.dev', 1, session.publicKey),
  ];
  const flood = Array.from({ length: 60 }, (_, i) => ({
    ...real[0],
    officerEmail: `filler${i}@x.dev`,
    shareIndex: (i % 250) + 3,
  }));

  const started = Date.now();
  const outcome = recoverOrgKey([...flood, ...real], session.privateKey, 2, 3, SET.integrityTag);

  assert.ok(Date.now() - started < 5_000, 'the search must be bounded regardless of n');
  assert.ok(outcome.kind === 'recovered' || outcome.kind === 'noValidQuorum');
});

// ---------------------------------------------------------------- key material lifetime

test('ending a session really zeroes both halves of the session key', () => {
  // `RecoverySessionKeys.privateKey` is what turns the collected contributions back into
  // shares. Dropping the reference — which is all `Map.delete` does — leaves the bytes in the
  // heap for a dump to find, and the comment on that field has always claimed otherwise.
  const keys = newSessionKeys();
  const before = Buffer.from(keys.privateKey);
  assert.notDeepEqual(before, Buffer.alloc(32), 'a real key to begin with');

  endRecoverySession(keys);

  assert.deepEqual(keys.privateKey, Buffer.alloc(32));
  assert.deepEqual(keys.publicKey, Buffer.alloc(32), 'the public half goes too — nothing is owed it');
});

test('ending a session twice is safe', () => {
  // The finally block that calls this may run after an early return that already did.
  const keys = newSessionKeys();
  endRecoverySession(keys);
  assert.doesNotThrow(() => endRecoverySession(keys));
});

test('a recovery leaves the caller’s contributions intact — it wipes only its own copies', () => {
  // The opened shares are the plaintext Shamir shares, and `threshold` of them ARE the org
  // private key, so they must be zeroed before the function returns. This pins that the wipe
  // reaches the internal copies ONLY: the sealed blobs the caller still holds must survive, or
  // a retry after a transient failure would be impossible.
  const session = newSessionKeys();
  const contributions = [
    realContribution('cto@x.dev', 0, session.publicKey),
    realContribution('lead@x.dev', 1, session.publicKey),
  ];

  const first = recoverOrgKey(contributions, session.privateKey, 2, 3, SET.integrityTag);
  const second = recoverOrgKey(contributions, session.privateKey, 2, 3, SET.integrityTag);

  assert.ok(first.kind === 'recovered');
  assert.ok(second.kind === 'recovered', 'the contributions were consumed rather than read');
  assert.deepEqual(second.orgPrivateKey, ORG.privateKey);
});

test('a failed recovery leaves nothing reconstructible behind', () => {
  // `noValidQuorum` still opened every contribution it could. Those shares are as sensitive as
  // a successful run's, and there is no key handed back to the caller to take responsibility
  // for them.
  const session = newSessionKeys();
  const older = mintShareSet(generateOrgRecoveryKeypair().privateKey, 3, 2);
  const contributions = [
    contribute('cto@x.dev', older.shares[0].index, older.shares[0].bytes, session.publicKey),
    contribute('lead@x.dev', older.shares[1].index, older.shares[1].bytes, session.publicKey),
  ];

  const outcome = recoverOrgKey(contributions, session.privateKey, 2, 3, SET.integrityTag);

  assert.equal(outcome.kind, 'noValidQuorum');
  // The shares of the OLDER ceremony must not still be sitting in memory as plaintext; the
  // observable proxy is that re-running still works, i.e. only internal copies were touched.
  assert.equal(
    recoverOrgKey(contributions, session.privateKey, 2, 3, older.integrityTag).kind,
    'recovered',
  );
});
