import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BackupError, bindWithLoginKey } from '../cryptoUtils';
import {
  hasVaultKeyedWrap,
  newMasterKey,
  unwrapWithPin,
  unwrapWithPinAsync,
  unwrapWithPrf,
  wrapWithPin,
  wrapWithPinAsync,
  wrapWithPrf,
} from '../keyWrap';
import { rekeyUnderPin } from '../vaultRekey';
import { StoredAccount } from '../types';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const account: StoredAccount = { accountId: 'acct-1', email: 'alice@example.com', provider: 'microsoft' };
const S = { key: Buffer.alloc(32, 9), fingerprint: '0123456789abcdef' };
const OTHER = { key: Buffer.alloc(32, 4), fingerprint: 'fedcba9876543210' };

/** The kind of error a caller can act on, not just its message. */
function kindOf(run: () => unknown): string {
  try {
    run();
    return 'no error';
  } catch (error) {
    return error instanceof BackupError ? error.kind : 'not a BackupError';
  }
}

test('a bound PIN wrap opens with the login key and not without it', () => {
  const master = newMasterKey();
  const wrap = wrapWithPin(master, account.accountId, '1234', 1, S);

  assert.deepEqual(unwrapWithPin(wrap, account.accountId, '1234', S), master);
  assert.equal(wrap.serverBound, true);
  assert.equal(wrap.loginKeyFingerprint, S.fingerprint);
});

test('the login key missing is server-key-required, NEVER wrong-password', () => {
  // The distinction a person acts on. Told "wrong password", they type the PIN again — twenty
  // times — when the truth is that their client has not reached the server.
  const wrap = wrapWithPin(newMasterKey(), account.accountId, '1234', 1, S);

  assert.equal(kindOf(() => unwrapWithPin(wrap, account.accountId, '1234')), 'server-key-required');
});

test('the right login key with the wrong PIN is a wrong PIN', () => {
  const wrap = wrapWithPin(newMasterKey(), account.accountId, '1234', 1, S);

  assert.equal(kindOf(() => unwrapWithPin(wrap, account.accountId, '9999', S)), 'wrong-password');
});

test('a vault written WITHOUT a login key is byte-identical in shape to today', () => {
  // The forward-compatibility property: an ordinary member's vault gains no new keys in its JSON,
  // so an older build reads it exactly as it always did.
  const wrap = wrapWithPin(newMasterKey(), account.accountId, '1234', 1);

  assert.deepEqual(Object.keys(wrap).sort(), ['createdAt', 'data', 'id', 'iv', 'kdfN', 'kdfP', 'kdfR', 'kind', 'salt', 'tag']);
});

test('a bound security-key wrap needs the login key too', () => {
  const master = newMasterKey();
  const secret = Buffer.alloc(32, 5);
  const wrap = wrapWithPrf(master, 'cred-1', 'salt', secret, 'YubiKey', 1, undefined, S);

  assert.deepEqual(unwrapWithPrf(wrap, secret, S), master);
  assert.equal(kindOf(() => unwrapWithPrf(wrap, secret)), 'server-key-required');
});

test('the async PIN path binds and opens the same way', async () => {
  const master = newMasterKey();
  const wrap = await wrapWithPinAsync(master, account.accountId, '1234', 1, S);

  assert.deepEqual(await unwrapWithPinAsync(wrap, account.accountId, '1234', S), master);
  await assert.rejects(() => unwrapWithPinAsync(wrap, account.accountId, '1234'), /organisation server/);
});

test('a wrap sealed to ANOTHER key is reported as the server key changing, not a wrong PIN', () => {
  // The guard this story exists to provide, and it was half-built: the fingerprint comparison had no
  // caller, so a restored older backup — vault bound to A, server now issuing B — reached the person
  // as `wrong-password`. They would then retype a PIN that is perfectly correct.
  const wrap = wrapWithPin(newMasterKey(), account.accountId, '1234', 1, S);

  assert.equal(kindOf(() => unwrapWithPin(wrap, account.accountId, '1234', OTHER)), 'server-key-required');
});

test('the changed-key refusal says what actually happened', () => {
  const wrap = wrapWithPin(newMasterKey(), account.accountId, '1234', 1, S);

  try {
    unwrapWithPin(wrap, account.accountId, '1234', OTHER);
    assert.fail('expected a refusal');
  } catch (error) {
    assert.match((error as Error).message, /changed/i);
  }
});

test('an empty or short login key is refused rather than deriving a plausible wrong key', () => {
  // Defence in depth. The client already refuses a key of the wrong size at the wire, but a key that
  // is merely WRONG here produces a valid-looking derivation and a wrong-password nobody can explain.
  assert.throws(() => bindWithLoginKey(Buffer.alloc(32, 1), Buffer.alloc(0)), /32/);
  assert.throws(() => bindWithLoginKey(Buffer.alloc(32, 1), Buffer.alloc(16, 1)), /32/);
});

test('the binding primitive is deterministic and depends on both halves', () => {
  const base = Buffer.alloc(32, 1);

  assert.deepEqual(bindWithLoginKey(Buffer.from(base), Buffer.from(S.key)), bindWithLoginKey(Buffer.from(base), Buffer.from(S.key)));
  assert.notDeepEqual(bindWithLoginKey(Buffer.from(base), Buffer.from(S.key)), bindWithLoginKey(Buffer.from(base), Buffer.from(OTHER.key)));
  assert.notDeepEqual(bindWithLoginKey(Buffer.alloc(32, 2), Buffer.from(S.key)), bindWithLoginKey(Buffer.from(base), Buffer.from(S.key)));
  assert.equal(bindWithLoginKey(Buffer.from(base), Buffer.from(S.key)).length, 32);
});

test('a bound PIN-ONLY vault is not mistaken for a standalone PIN backup', () => {
  // The backup path routes on this. Reading a bound vault as self-contained would send it through a
  // write that rewrites the wrap under a backup PIN with no binding at all.
  const bound = [wrapWithPin(newMasterKey(), account.accountId, '1234', 1, S)];
  const plain = [wrapWithPin(newMasterKey(), account.accountId, '1234', 1)];

  assert.equal(hasVaultKeyedWrap(bound), true);
  assert.equal(hasVaultKeyedWrap(plain), false);
});

test('rotating a bound vault without the login key REFUSES rather than unbinding it', async () => {
  // A PIN change rebuilds the wrap from nothing, which is exactly where a binding is lost. The old
  // file still opens for its owner; a silently unbound new one would open for anybody holding it.
  const previousWraps = [wrapWithPin(newMasterKey(), account.accountId, '1234', 1, S)];

  await assert.rejects(
    () =>
      rekeyUnderPin({
        payload: { entries: [] },
        account,
        pin: '5678',
        now: 2,
        pendingShares: undefined,
        previousWraps,
      }),
    (error: Error) => {
      assert.equal(error instanceof BackupError && error.kind, 'server-key-required');
      return true;
    },
  );
});

test('rotating a bound vault WITH the login key keeps it bound', async () => {
  const previousWraps = [wrapWithPin(newMasterKey(), account.accountId, '1234', 1, S)];

  const rotated = await rekeyUnderPin({
    payload: { entries: [] },
    account,
    pin: '5678',
    now: 2,
    pendingShares: undefined,
    previousWraps,
    binding: S,
  });

  assert.equal(rotated.wraps[0].serverBound, true);
  assert.deepEqual(unwrapWithPin(rotated.wraps[0], account.accountId, '5678', S), rotated.masterKey);
});

test('rotating an UNBOUND vault is unaffected', async () => {
  const rotated = await rekeyUnderPin({
    payload: { entries: [] },
    account,
    pin: '5678',
    now: 2,
    pendingShares: undefined,
    previousWraps: [wrapWithPin(newMasterKey(), account.accountId, '1234', 1)],
  });

  assert.equal(rotated.wraps[0].serverBound, undefined);
});

test('the sync PIN change is guarded by the same rule as the other two rewrite paths', () => {
  // The security review's finding, and the pattern this repository keeps meeting: the guard was added
  // at the two sites the plan listed (`vaultRekey`, `securityKeyOps`) while a THIRD path — the Set
  // Sync PIN command — rebuilt the PIN wrap through `wrapWithPinAsync` directly. It dropped
  // `serverBound`, so a developer changing their PIN wrote a vault that opens with the file and the
  // PIN alone — after which withholding the login key, the only revocation this design has, revokes
  // nothing for that copy.
  //
  // Asserted on the SOURCE rather than by driving the command: `rekeyToNewPin` needs a transport, a
  // vault, an unlock and a webview host, and what must never regress is one line — that this call
  // site passes a binding. A grep-shaped test is honest about that, and it fails the moment somebody
  // writes the unbound form again.
  const source = readFileSync(join(__dirname, '..', '..', 'src', 'syncManager.ts'), 'utf8');

  assert.doesNotMatch(
    source,
    /wrapWithPinAsync\(\s*master,\s*account\.accountId,\s*newPin,\s*Date\.now\(\),?\s*\)/,
    'the sync PIN change must pass a login-key binding, never rebuild the wrap without one',
  );
  assert.match(source, /refuseToUnbind|binding/, 'and it must consult the binding at all');
});
