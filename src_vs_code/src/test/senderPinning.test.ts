import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PinStore,
  judgeSender,
  pinSenderKey,
  pinnedKey,
  verdictBlocksAccept,
} from '../senderPinning';
import { ShareTranscript, generateSigningKeypair, signShare } from '../shareSignature';

/**
 * Trust-on-first-use, and what each later share means. These are verdicts about
 * an attacker's options, so each test is named for the move it denies.
 */

const alice = generateSigningKeypair();
const mallory = generateSigningKeypair();

function store(initial: Record<string, Record<string, string>> = {}): PinStore {
  const state: Record<string, Record<string, string>> = { ...initial };
  return {
    get: (key) => state[key],
    update: (key, value) => {
      state[key] = value;
      return Promise.resolve();
    },
  };
}

const transcript = (over: Partial<ShareTranscript> = {}): ShareTranscript => ({
  shareId: 's1',
  fromEmail: 'alice@corp.com',
  toEmail: 'bob@corp.com',
  createdAt: 1_756_000_000_000,
  senderPublicKey: alice.publicKey,
  data: 'ZGF0YQ==',
  tag: 'dGFn',
  ...over,
});

test('the first signed share is first contact, not "verified"', () => {
  // Nobody has checked that this key belongs to Alice. Announcing trust here is
  // exactly the lie the fingerprint comparison exists to prevent.
  const t = transcript();
  const verdict = judgeSender(store(), 'acct', { transcript: t, signature: signShare(alice.privateKey, t) });

  assert.equal(verdict, 'firstContact');
});

test('once pinned, a share from the same key is verified', async () => {
  const s = store();
  await pinSenderKey(s, 'acct', 'alice@corp.com', alice.publicKey);
  const t = transcript();

  assert.equal(judgeSender(s, 'acct', { transcript: t, signature: signShare(alice.privateKey, t) }), 'verified');
});

test('a different key for a pinned sender is a mismatch, never a silent accept', async () => {
  // Mallory publishes her own key and signs with it. Everything is internally
  // consistent — which is why continuity, not internal consistency, is the check.
  const s = store();
  await pinSenderKey(s, 'acct', 'alice@corp.com', alice.publicKey);
  const t = transcript({ senderPublicKey: mallory.publicKey });

  assert.equal(judgeSender(s, 'acct', { transcript: t, signature: signShare(mallory.privateKey, t) }), 'mismatch');
});

test('stripping the signature from a sender who signs is a downgrade, not "unsigned"', async () => {
  // The move this denies: strip the signature and land back in the lower-trust
  // path the sender had already been lifted out of.
  const s = store();
  await pinSenderKey(s, 'acct', 'alice@corp.com', alice.publicKey);

  assert.equal(judgeSender(s, 'acct', { transcript: transcript() }), 'downgraded');
});

test('a share from someone who has never signed is unsigned — legacy, not an attack', () => {
  assert.equal(judgeSender(store(), 'acct', { transcript: transcript() }), 'unsigned');
});

test('a signature that does not verify is its own verdict', () => {
  const t = transcript();
  const wrong = signShare(mallory.privateKey, t); // signed by Mallory, claims Alice's key

  assert.equal(judgeSender(store(), 'acct', { transcript: t, signature: wrong }), 'badSignature');
});

test('only the verdicts that mean something is wrong block an import', () => {
  // Legacy shares must keep working, or the feature breaks every existing vault
  // rather than protecting it.
  assert.equal(verdictBlocksAccept('unsigned'), false);
  assert.equal(verdictBlocksAccept('firstContact'), false);
  assert.equal(verdictBlocksAccept('verified'), false);

  assert.equal(verdictBlocksAccept('badSignature'), true);
  assert.equal(verdictBlocksAccept('mismatch'), true);
  assert.equal(verdictBlocksAccept('downgraded'), true);
});

test('pins are per account and case-insensitive on the address', async () => {
  const s = store();
  await pinSenderKey(s, 'acct-work', 'Alice@Corp.com', alice.publicKey);

  assert.equal(pinnedKey(s, 'acct-work', 'alice@corp.com'), alice.publicKey);
  assert.equal(pinnedKey(s, 'acct-personal', 'alice@corp.com'), undefined,
    'a key trusted in one vault is not trusted in another');
});
