import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BackupError,
  CURRENT_WRAPPED_VERSION,
  decryptJsonWithMasterKey,
  encryptJsonWrapped,
  envelopeWithWraps,
  readVaultVersion,
  verifyEnvelopeMac,
} from '../cryptoUtils';
import { newMasterKey } from '../keyWrap';
import { StoredAccount } from '../types';

/**
 * The envelope header is bound to the payload as AEAD associated data (audit 2026-08-25, A5).
 *
 * <p>The header is plaintext, and used to be protected only by a separate HMAC — a check
 * somebody has to remember to call. The MAC-healing defect of 2026-08-25 is what forgetting
 * it looks like: decrypt, merge and re-sign a tampered file, and the fresh valid signature
 * makes the tamper legitimate. Binding the header as AAD turns that from a branch into a
 * property: a forged owner cannot be decrypted AT ALL, whoever forgot which check to run.</p>
 */

const OWNER: StoredAccount = { accountId: 'acc-owner', email: 'owner@corp.com', provider: 'google' };
const ATTACKER: StoredAccount = { accountId: 'acc-evil', email: 'evil@corp.com', provider: 'google' };
const PAYLOAD = { nodes: [{ id: 'n1' }], marker: 'the-vault' };

/** Master key of the frozen v3 fixture below, as its base64 text. */
const V3_MASTER = Buffer.from(
  '4c5f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f',
  'hex',
).toString('base64');

const V3_FIXTURE = `{
  "format": "cred-ssh-manager-backup",
  "version": 3,
  "kdf": "hkdf",
  "account": {
    "accountId": "acc-owner",
    "email": "owner@corp.com",
    "provider": "google"
  },
  "wraps": [
    {
      "kind": "pin",
      "id": "p1"
    }
  ],
  "salt": "yV/NeznFqyFJ+0uBH9Thww==",
  "iv": "ygd+Rzac39SWrGNt",
  "tag": "Rr/yRdEMf4fGhIht5GDPZA==",
  "data": "xAQSw7AHz+NSMs2YnzqWbLSCZj8/lhVMLK+S/fv0rGAWt52Y44ezX41xj4Q=",
  "mac": "WVL1DjNUtKdwsj+HJRFAotwP9gZu+igSzT1U6hvMXcU="
}`;

function vault(master: Buffer, account = OWNER, shares?: unknown[]): string {
  return encryptJsonWrapped(PAYLOAD, master.toString('base64'), [{ kind: 'pin', id: 'p1' }], account, shares);
}

/** Rewrite one header field, exactly as somebody with write access to the folder would. */
function tamper(file: string, change: Record<string, unknown>): string {
  return JSON.stringify({ ...(JSON.parse(file) as object), ...change }, null, 2);
}

test('a fresh vault is written at the current wrapped version', () => {
  assert.equal(readVaultVersion(vault(newMasterKey())), CURRENT_WRAPPED_VERSION);
});

test('a forged OWNER cannot be decrypted at all — not merely detected', () => {
  // The attack the envelope MAC was added for: on a shared folder, rewrite `account` so the
  // file claims to belong to someone else. It now fails inside decipher.final(), so no code
  // path exists that reads this payload without first noticing.
  const master = newMasterKey();
  const forged = tamper(vault(master), { account: ATTACKER });

  assert.throws(
    () => decryptJsonWithMasterKey(forged, master.toString('base64')),
    (e: unknown) => e instanceof BackupError && e.kind === 'wrong-password',
    'a forged owner must not decrypt',
  );
});

test('a downgraded VERSION cannot be decrypted either', () => {
  // Rewriting `version` to 3 would ask the reader to open the payload the pre-AAD way, which
  // is how a format downgrade turns a hardening step back off.
  const master = newMasterKey();

  assert.throws(
    () => decryptJsonWithMasterKey(tamper(vault(master), { version: 3 }), master.toString('base64')),
    BackupError,
  );
});

test('the untouched file still opens, and its MAC still verifies', () => {
  const master = newMasterKey();
  const file = vault(master);

  assert.deepEqual(decryptJsonWithMasterKey(file, master.toString('base64')), PAYLOAD);
  assert.equal(verifyEnvelopeMac(file, master.toString('base64')), 'ok');
});

test('WRAPS are deliberately NOT bound — a key may be added or removed without re-encrypting', () => {
  // The wrap layer exists so add/remove Security Key never rewrites the payload. Binding the
  // wraps as AAD would make every key change corrupt the vault; they stay the MAC's job,
  // because a MAC can be re-signed when the change is legitimate and AAD cannot.
  const master = newMasterKey();
  const file = vault(master);

  const rewrapped = envelopeWithWraps(file, [
    { kind: 'pin', id: 'p1' },
    { kind: 'webauthn', id: 'yubikey-2' },
  ]);

  assert.deepEqual(
    decryptJsonWithMasterKey(rewrapped, master.toString('base64')),
    PAYLOAD,
    'the payload still opens after a legitimate wrap change',
  );
});

test('SHARES are deliberately NOT bound — a colleague may append one', () => {
  // On the folder transport other people append shares to the envelope. Binding them would
  // make every incoming share indistinguishable from tampering.
  const master = newMasterKey();
  const withShare = tamper(vault(master), { shares: [{ id: 's1', fromEmail: 'peer@corp.com' }] });

  assert.deepEqual(decryptJsonWithMasterKey(withShare, master.toString('base64')), PAYLOAD);
});

test('a v3 vault written by an older build still opens — read support is permanent', () => {
  // A REAL v3 envelope, produced by the v3 writer before v4 replaced it and frozen here.
  // Nothing in this tree can write one any more, so without the fixture the promise "reading
  // v3 keeps working forever" would have no test at all: every other v3 case in the suite
  // silently became a v4 case the day the writer changed.
  assert.equal(readVaultVersion(V3_FIXTURE), 3);
  assert.deepEqual(decryptJsonWithMasterKey(V3_FIXTURE, V3_MASTER), {
    nodes: [{ id: 'n1' }],
    marker: 'the-vault',
  });
  assert.equal(verifyEnvelopeMac(V3_FIXTURE, V3_MASTER), 'ok', 'its own MAC still verifies');
});

test('a v3 vault is rewritten as v4 on the next full write, without asking anyone', () => {
  const master = newMasterKey();
  const rewritten = encryptJsonWrapped(PAYLOAD, master.toString('base64'), [], OWNER);

  assert.equal(readVaultVersion(rewritten), CURRENT_WRAPPED_VERSION);
  assert.deepEqual(decryptJsonWithMasterKey(rewritten, master.toString('base64')), PAYLOAD);
});
