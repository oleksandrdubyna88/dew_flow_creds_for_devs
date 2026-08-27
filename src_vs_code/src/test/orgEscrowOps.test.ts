import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EscrowEnrolment,
  applyEscrowAction,
  describeEscrowAction,
  escrowAction,
} from '../orgEscrowOps';
import { generateOrgRecoveryKeypair } from '../orgEscrowCrypto';
import {
  KeyWrap,
  newMasterKey,
  orgEscrowWrap,
  unwrapWithOrgEscrow,
  wrapWithOrgEscrow,
  wrapWithPin,
} from '../keyWrap';

/**
 * The decision behind automatic enrolment: whether this vault's escrow wrap is current, and
 * what a write should do about it. One pure place, so the sync cycle only applies an answer.
 */

const ACCOUNT = 'acc-1';
const NOW = 1_756_000_000_000;
const ORG = generateOrgRecoveryKeypair();
const FINGERPRINT = 'AAAA BBBB';

function enrolment(overrides: Partial<EscrowEnrolment> = {}): EscrowEnrolment {
  return {
    orgPublicKey: ORG.publicKey,
    orgPublicKeyFingerprint: FINGERPRINT,
    verdict: 'verified',
    ...overrides,
  };
}

function pinOnly(master: Buffer): KeyWrap[] {
  return [wrapWithPin(master, ACCOUNT, 'a-pin-1234', NOW)];
}

function enrolled(master: Buffer, fingerprint = FINGERPRINT): KeyWrap[] {
  return [...pinOnly(master), wrapWithOrgEscrow(master, ORG.publicKey, fingerprint, NOW)];
}

test('a vault with no escrow wrap on a trusted server enrols', () => {
  assert.deepEqual(escrowAction(pinOnly(newMasterKey()), enrolment()), {
    kind: 'enrol',
    reason: 'absent',
  });
});

test('first contact enrols too — refusing there would mean this could never start', () => {
  assert.deepEqual(escrowAction(pinOnly(newMasterKey()), enrolment({ verdict: 'firstContact' })), {
    kind: 'enrol',
    reason: 'absent',
  });
});

test('an already-current wrap is left alone', () => {
  assert.deepEqual(escrowAction(enrolled(newMasterKey()), enrolment()), { kind: 'unchanged' });
});

test('a wrap sealed to an older generation of the key is re-sealed', () => {
  assert.deepEqual(escrowAction(enrolled(newMasterKey(), 'OLD FINGERPRINT'), enrolment()), {
    kind: 'enrol',
    reason: 'stale',
  });
});

test('NOT KNOWING changes nothing — an unreachable server must not strip the wrap', () => {
  // The failure this exists to prevent: a timeout, an older server or an offline laptop is
  // "we could not ask", and treating that as "corporate recovery is off" would quietly
  // remove a wrap the company relies on, once per flaky network.
  const master = newMasterKey();
  assert.deepEqual(escrowAction(enrolled(master), undefined), { kind: 'unchanged' });
  assert.deepEqual(escrowAction(pinOnly(master), undefined), { kind: 'unchanged' });
});

test('corporate recovery switched off removes the wrap, and does nothing when there is none', () => {
  const master = newMasterKey();
  assert.deepEqual(escrowAction(enrolled(master), enrolment({ verdict: 'off' })), {
    kind: 'remove',
    reason: 'disabled',
  });
  assert.deepEqual(escrowAction(pinOnly(master), enrolment({ verdict: 'off' })), {
    kind: 'unchanged',
  });
});

test('an untrusted key REMOVES an existing wrap rather than merely declining to add one', () => {
  // Refusing to add is not enough. A wrap already sealed to a key somebody may have
  // substituted keeps paying out on every version written before the swap was noticed.
  const master = newMasterKey();
  for (const verdict of ['keyChanged', 'rosterChanged'] as const) {
    assert.deepEqual(escrowAction(enrolled(master), enrolment({ verdict })), {
      kind: 'remove',
      reason: 'untrusted',
    });
    assert.deepEqual(escrowAction(pinOnly(master), enrolment({ verdict })), { kind: 'unchanged' });
  }
});

test('a roster with no published key yet changes nothing', () => {
  assert.deepEqual(escrowAction(pinOnly(newMasterKey()), enrolment({ verdict: 'notReady' })), {
    kind: 'unchanged',
  });
});

// ---------------------------------------------------------------- applying it

test('enrolling produces a wrap the org private key really opens', () => {
  const master = newMasterKey();
  const wraps = pinOnly(master);

  const next = applyEscrowAction(
    wraps, { kind: 'enrol', reason: 'absent' }, master, enrolment(), NOW);

  const wrap = orgEscrowWrap(next);
  assert.ok(wrap);
  assert.equal(wrap.orgPublicKeyFingerprint, FINGERPRINT);
  assert.deepEqual(unwrapWithOrgEscrow(wrap, ORG.privateKey), master);
  assert.equal(next.length, 2, 'the PIN wrap is untouched');
});

test('re-sealing replaces the one slot rather than accumulating generations', () => {
  const master = newMasterKey();
  const stale = enrolled(master, 'OLD');

  const next = applyEscrowAction(
    stale, { kind: 'enrol', reason: 'stale' }, master, enrolment(), NOW);

  assert.equal(next.filter((w) => w.kind === 'org-escrow').length, 1);
  assert.equal(orgEscrowWrap(next)?.orgPublicKeyFingerprint, FINGERPRINT);
});

test('removing takes the escrow wrap and nothing else', () => {
  const master = newMasterKey();

  const next = applyEscrowAction(
    enrolled(master), { kind: 'remove', reason: 'disabled' }, master, undefined, NOW);

  assert.equal(orgEscrowWrap(next), undefined);
  assert.equal(next.length, 1, 'the PIN still opens the vault');
});

test('an unchanged action rewrites nothing', () => {
  const master = newMasterKey();
  const wraps = enrolled(master);
  assert.deepEqual(applyEscrowAction(wraps, { kind: 'unchanged' }, master, enrolment(), NOW), wraps);
});

test('every action that changes something says so, and unchanged says nothing', () => {
  const officers = ['cto@x.dev', 'lead@x.dev'];
  assert.match(
    describeEscrowAction({ kind: 'enrol', reason: 'absent' }, officers),
    /recoverable by your organisation's officers \(cto@x\.dev, lead@x\.dev\)/,
  );
  assert.match(describeEscrowAction({ kind: 'enrol', reason: 'stale' }, officers), /re-sealed/);
  assert.match(describeEscrowAction({ kind: 'remove', reason: 'disabled' }, officers), /switched off/);
  assert.match(describeEscrowAction({ kind: 'remove', reason: 'untrusted' }, officers), /not the one this machine trusts/);
  assert.equal(describeEscrowAction({ kind: 'unchanged' }, officers), '');
});

test('the enrolled wrap does not disturb the ordinary ways in', () => {
  // The escrow wrap sits beside the PIN; nothing about adding it may change how a person
  // opens their own vault.
  const master = newMasterKey();
  const next = applyEscrowAction(
    pinOnly(master), { kind: 'enrol', reason: 'absent' }, master, enrolment(), NOW);
  const pin = next.find((w) => w.kind === 'pin');
  assert.ok(pin, 'the PIN wrap survives enrolment');
  assert.equal(next.filter((w) => w.kind === 'org-escrow').length, 1);
});
