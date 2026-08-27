import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { test } from 'node:test';
import { rekeyUnderPin } from '../vaultRekey';
import { decryptJsonWithMasterKey, BackupError } from '../cryptoUtils';
import {
  newMasterKey,
  newPrfSalt,
  recoveryWrap,
  unwrapWithPinAsync,
  unwrapWithPrf,
  unwrapWithRecoveryCode,
  webauthnWraps,
  wrapWithPin,
  wrapWithPrf,
  wrapWithRecoveryCode,
} from '../keyWrap';
import { generateRecoveryCode } from '../recoveryCode';
import { StoredAccount } from '../types';

/**
 * The one operation that actually REVOKES an opener: a fresh master, the payload re-encrypted,
 * a new wrap set. Everything else edits the wrap array around a master that stays put, which
 * is why a removed security key keeps opening every copy already on disk.
 */

const ACCOUNT: StoredAccount = { accountId: 'acc-1', email: 'me@corp.com', provider: 'google' };
const PIN = 'a-vault-pin-123';
const NOW = 1_756_000_000_000;
const PAYLOAD = { nodes: [], marker: 'the-vault-payload' };

test('a rotation mints a fresh master the old one cannot open', async () => {
  const old = newMasterKey();

  const rotated = await rekeyUnderPin({
    payload: PAYLOAD,
    account: ACCOUNT,
    pin: PIN,
    now: NOW,
    pendingShares: undefined,
    previousWraps: [],
  });

  assert.notDeepEqual(rotated.masterKey, old);
  assert.deepEqual(decryptJsonWithMasterKey(rotated.content, rotated.masterKey), PAYLOAD);
  assert.throws(
    () => decryptJsonWithMasterKey(rotated.content, old.toString('base64')),
    BackupError,
    'the point of a rotation is that the previous master is worthless',
  );
  // The PIN is the anchor, and it opens the new master.
  assert.equal(rotated.wraps.length, 1);
  assert.deepEqual(await unwrapWithPinAsync(rotated.wraps[0], ACCOUNT.accountId, PIN), rotated.masterKey);
});

test('extraWraps are built against the FRESH master, not the old one', async () => {
  // The trap this signature exists to make impossible: a caller that captured a master before
  // the rotation would wrap the wrong key, and the resulting slot would open nothing — a
  // failure that only shows up on the machine that next tries that factor.
  const prfSecret = crypto.randomBytes(32);

  const rotated = await rekeyUnderPin({
    payload: PAYLOAD,
    account: ACCOUNT,
    pin: PIN,
    now: NOW,
    pendingShares: undefined,
    previousWraps: [],
    extraWraps: (master, at) => [wrapWithPrf(master, 'cred-a', newPrfSalt(), prfSecret, 'K', at)],
  });

  const key = webauthnWraps(rotated.wraps)[0];
  assert.deepEqual(unwrapWithPrf(key, prfSecret), rotated.masterKey);
  assert.deepEqual(decryptJsonWithMasterKey(rotated.content, unwrapWithPrf(key, prfSecret)), PAYLOAD);
});

test('a rotation reports a recovery code it could not carry, and stays quiet when there was none', async () => {
  const old = newMasterKey();
  const code = generateRecoveryCode();

  const withCode = await rekeyUnderPin({
    payload: PAYLOAD,
    account: ACCOUNT,
    pin: PIN,
    now: NOW,
    pendingShares: undefined,
    previousWraps: [
      wrapWithPin(old, ACCOUNT.accountId, PIN, NOW),
      wrapWithRecoveryCode(old, code.secret, NOW),
    ],
  });
  assert.equal(withCode.recoveryCodeRetired, true);
  assert.equal(recoveryWrap(withCode.wraps), undefined, 'and it really is gone, not merely reported');
  // Why the report matters: the printed code still unwraps its own slot perfectly well — it
  // just yields the OLD master, and that master no longer opens anything. Nothing about using
  // the code looks broken until the decrypt at the end fails.
  const stillOpensItsOwnWrap = unwrapWithRecoveryCode(
    wrapWithRecoveryCode(old, code.secret, NOW),
    code.secret,
  );
  assert.deepEqual(stillOpensItsOwnWrap, old);
  assert.throws(
    () => decryptJsonWithMasterKey(withCode.content, old.toString('base64')),
    BackupError,
    'the master the printed code leads to must not open the rotated vault',
  );

  const without = await rekeyUnderPin({
    payload: PAYLOAD,
    account: ACCOUNT,
    pin: PIN,
    now: NOW,
    pendingShares: undefined,
    previousWraps: [wrapWithPin(old, ACCOUNT.accountId, PIN, NOW)],
  });
  assert.equal(without.recoveryCodeRetired, false);
});

test('shares riding the envelope survive a rotation', async () => {
  // The folder transport carries other people's pending shares in the envelope's plaintext
  // array. A rotation rewrites the whole file, so dropping them here would lose mail that
  // was addressed to this vault and never delivered.
  const share = { id: 's1', fromEmail: 'her@corp.com', entityName: 'prod db', entityKind: 'db' };

  const rotated = await rekeyUnderPin({
    payload: PAYLOAD,
    account: ACCOUNT,
    pin: PIN,
    now: NOW,
    pendingShares: [share],
    previousWraps: [],
  });

  const envelope = JSON.parse(rotated.content) as { shares?: unknown[] };
  assert.deepEqual(envelope.shares, [share]);
});
