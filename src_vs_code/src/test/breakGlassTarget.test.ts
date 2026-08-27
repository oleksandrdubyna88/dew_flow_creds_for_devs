import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { test } from 'node:test';
import { recoveredVaultIsTheTarget } from '../breakGlass';
import { encryptJsonWrapped } from '../cryptoUtils';
import { newMasterKey, wrapWithPin } from '../keyWrap';
import { StoredAccount } from '../types';

/**
 * The check that binds a recovery's AUTHORIZATION to the object it acts on.
 *
 * <p>Every vault on a server is sealed to the same organisation key, so the reconstructed key
 * opens all of them. A quorum convened to recover one person is therefore, cryptographically,
 * a quorum able to open anybody — and the only thing that keeps the two apart is checking that
 * the ciphertext the server handed back is the one that was asked for.</p>
 */

const NOW = 1_756_000_000_000;

function vaultOf(email: string): string {
  const account: StoredAccount = { accountId: 'acc-1', email, provider: 'google' };
  const master = newMasterKey();
  return encryptJsonWrapped(
    { nodes: [] },
    master.toString('base64'),
    [wrapWithPin(master, account.accountId, 'a-pin-1234', NOW)],
    account,
    undefined,
  );
}

test('a vault belonging to the target is accepted', () => {
  assert.equal(recoveredVaultIsTheTarget(vaultOf('departed@corp.com'), 'departed@corp.com'), true);
});

test('a vault belonging to SOMEBODY ELSE is refused', () => {
  // The attack: a quorum legitimately convened to recover A is served B's blob. Without this
  // the officers decrypt B's secrets under an authorization for A, the audit line names A, and
  // the re-keyed result is written back to A's path — so A is later handed, under a temporary
  // PIN, a vault full of B's plaintext. The server could not do either half of that alone.
  assert.equal(
    recoveredVaultIsTheTarget(vaultOf('someone-else@corp.com'), 'departed@corp.com'),
    false,
  );
});

test('the comparison ignores case and surrounding space', () => {
  // The target email is typed by a person; the header is written by whichever client last
  // synced. Neither normalises for the other.
  assert.equal(recoveredVaultIsTheTarget(vaultOf('Departed@Corp.com'), '  departed@corp.com '), true);
});

test('a vault with no account header is refused rather than assumed', () => {
  // The header is plaintext precisely so a restore knows whose vault it holds. Its absence is
  // not a reason to proceed on trust.
  const headerless = JSON.stringify({
    format: 'cred-ssh-manager-backup',
    version: 4,
    kdf: 'hkdf',
    salt: 's', iv: 'i', tag: 't', data: 'd',
  });
  assert.equal(recoveredVaultIsTheTarget(headerless, 'departed@corp.com'), false);
});

test('unparseable content is refused, never treated as a match', () => {
  assert.equal(recoveredVaultIsTheTarget('{ not json', 'departed@corp.com'), false);
  assert.equal(recoveredVaultIsTheTarget('', 'departed@corp.com'), false);
  assert.equal(recoveredVaultIsTheTarget(crypto.randomBytes(64).toString('hex'), 'x@y.z'), false);
});

// ---------------------------------------------------------------- the session key

import { newSessionKeys, sessionKeyFingerprint } from '../breakGlass';

/**
 * The session public key is the one piece of key-agreement material an officer takes from the
 * server on trust. If it can be substituted, a compromised relay harvests a quorum's shares and
 * reconstructs the organisation's key permanently — which opens every vault on that server.
 * Nothing else in the design defends this: the org key is pinned, the session key was not.
 */

test('a session key has a fingerprint short enough to read aloud and long enough to matter', () => {
  const keys = newSessionKeys();
  const printed = sessionKeyFingerprint(keys.publicKey.toString('base64'));

  assert.match(printed, /^[0-9A-F]{4}( [0-9A-F]{4}){3}$/, 'four groups of four hex');
});

test('two different session keys print differently, and the same key prints the same', () => {
  const a = newSessionKeys();
  const b = newSessionKeys();

  assert.notEqual(
    sessionKeyFingerprint(a.publicKey.toString('base64')),
    sessionKeyFingerprint(b.publicKey.toString('base64')),
  );
  assert.equal(
    sessionKeyFingerprint(a.publicKey.toString('base64')),
    sessionKeyFingerprint(a.publicKey.toString('base64')),
    'the initiator and the contributor must compute the same string',
  );
});

test('the fingerprint is of the KEY, so a substituted one cannot keep the same print', () => {
  // The whole point: the initiator reads their fingerprint aloud with the session id, and a
  // contributing officer compares it against what the server served them. A relay that swapped
  // the key would have to find a second X25519 public key with the same SHA-256 prefix.
  const honest = newSessionKeys();
  const attacker = newSessionKeys();

  assert.notEqual(
    sessionKeyFingerprint(honest.publicKey.toString('base64')),
    sessionKeyFingerprint(attacker.publicKey.toString('base64')),
  );
});
