import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  OrgRecoveryFacts,
  forgetOrgRecovery,
  judgeOrgRecovery,
  orgRecoveryNotice,
  pinOrgRecovery,
  verdictBlocksEnrolment,
} from '../orgRecoveryPinning';
import { PinStore } from '../senderPinning';

/**
 * Trust-on-first-use for the organisation's recovery key. A server saying "these three people
 * can open your vault" proves nothing on its own, and sealing to a key the server chose would
 * hand whoever controls it every vault on the server.
 */

function store(): PinStore & { data: Map<string, Record<string, string>> } {
  const data = new Map<string, Record<string, string>>();
  return {
    data,
    get: (key) => data.get(key),
    update: (key, value) => {
      data.set(key, value);
      return Promise.resolve();
    },
  };
}

const FACTS: OrgRecoveryFacts = {
  enabled: true,
  setupComplete: true,
  orgPublicKeyFingerprint: 'AAAA BBBB CCCC DDDD',
  rosterFingerprint: 'ros-1',
  location: 'https://vault.company.com',
};

test('a server with no roster is off, and there is nothing to pin', () => {
  const s = store();
  assert.equal(judgeOrgRecovery(s, 'acc', { ...FACTS, enabled: false }), 'off');
  assert.equal(orgRecoveryNotice('off', FACTS), '');
});

test('a roster without a finished ceremony is notReady, not firstContact', () => {
  // Two different states: the operator has asked for this, and the officers have actually
  // done it. Pinning the first would pin nothing, and enrolling against it would seal a
  // master key to an empty string.
  const s = store();
  assert.equal(judgeOrgRecovery(s, 'acc', { ...FACTS, setupComplete: false }), 'notReady');
  assert.equal(
    judgeOrgRecovery(s, 'acc', { ...FACTS, orgPublicKeyFingerprint: '' }),
    'notReady',
    'a complete flag with no key is still not ready',
  );
});

test('the first usable answer is firstContact — and it does NOT block enrolment', () => {
  // Refusing here would mean corporate recovery could never start anywhere. What must happen
  // is that the person is SHOWN the fingerprint, once, in words.
  const s = store();
  const verdict = judgeOrgRecovery(s, 'acc', FACTS);
  assert.equal(verdict, 'firstContact');
  assert.equal(verdictBlocksEnrolment(verdict), false);
  const notice = orgRecoveryNotice(verdict, FACTS);
  assert.match(notice, /AAAA BBBB CCCC DDDD/, 'the fingerprint is the whole point of the notice');
  assert.match(notice, /without you/, 'and it must say plainly what is being granted');
});

test('once pinned, the same answer verifies', async () => {
  const s = store();
  await pinOrgRecovery(s, 'acc', FACTS);
  assert.equal(judgeOrgRecovery(s, 'acc', FACTS), 'verified');
  assert.equal(orgRecoveryNotice('verified', FACTS), '');
});

test('a changed KEY and a changed ROSTER are different verdicts, and both block', () => {
  // Telling somebody "the recovery key changed" when what happened is "your CTO left and was
  // replaced" sends them looking in the wrong place, and this is the one moment they will look.
  const s = store();
  void pinOrgRecovery(s, 'acc', FACTS);

  const keyChanged = judgeOrgRecovery(s, 'acc', { ...FACTS, orgPublicKeyFingerprint: 'EEEE' });
  const rosterChanged = judgeOrgRecovery(s, 'acc', { ...FACTS, rosterFingerprint: 'ros-2' });

  assert.equal(keyChanged, 'keyChanged');
  assert.equal(rosterChanged, 'rosterChanged');
  assert.equal(verdictBlocksEnrolment(keyChanged), true);
  assert.equal(verdictBlocksEnrolment(rosterChanged), true);
  assert.match(orgRecoveryNotice(keyChanged, FACTS), /substituting a key/);
  assert.match(orgRecoveryNotice(rosterChanged, FACTS), /different set of officers/);
});

test('a pin from another server does not judge this one', () => {
  // An account that moved is meeting this roster for the first time, not meeting a changed
  // version of the old one — reporting `keyChanged` there would cry wolf on every migration.
  const s = store();
  void pinOrgRecovery(s, 'acc', FACTS);

  const elsewhere = judgeOrgRecovery(s, 'acc', {
    ...FACTS,
    location: 'https://vault.other.com',
    orgPublicKeyFingerprint: 'FFFF',
  });

  assert.equal(elsewhere, 'firstContact');
});

test('pins are per account, and forgetting one leaves the others', async () => {
  const s = store();
  await pinOrgRecovery(s, 'acc-a', FACTS);
  await pinOrgRecovery(s, 'acc-b', FACTS);

  await forgetOrgRecovery(s, 'acc-a');

  assert.equal(judgeOrgRecovery(s, 'acc-a', FACTS), 'firstContact');
  assert.equal(judgeOrgRecovery(s, 'acc-b', FACTS), 'verified');
});
