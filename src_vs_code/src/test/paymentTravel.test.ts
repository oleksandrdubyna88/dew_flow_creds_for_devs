import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exportSecretsFor } from '../exportSecrets';
import { parsePaymentFields, serializePaymentFields } from '../paymentFields';
import { pushRevision, type Revision } from '../revisionHistory';
import { snapshotForRevision } from '../revisionSnapshot';
import type { EntityMetadata } from '../types';

/**
 * S1.3 — the payment record through the four remaining directions, one test each.
 *
 * <p>Sync moved into S1.2 because deferring it DELETED records (see the plan's deviation 1), and the
 * backup direction is covered by `storagePayment.test.ts`. What is left is where the record travels
 * OUT of the vault: a share to a person (stripped), an external export (whole), the version history
 * (whole), and an agent (not at all).</p>
 *
 * <p>The export test is the one that earns its keep in a year: it protects a decision, not a
 * mechanism. Somebody reading "the CVV must not leave" out of context will eventually add a scrub
 * here, and every restored card after that comes back unusable.</p>
 */

const CARD = { number: '4111111111111111', cvv: '123', pin: '4321', holder: 'A Person' };
const RAW = serializePaymentFields(CARD) as string;

/** Only what these two functions actually read — a hand-rolled reader, no vscode, no keychain. */
function vault(payment: string | undefined): Record<string, unknown> {
  const nothing = (): Promise<undefined> => Promise.resolve(undefined);
  return {
    getPassword: nothing,
    getPrivateKey: nothing,
    getVpnConfig: nothing,
    getDbConnection: nothing,
    getNotes: nothing,
    getAttachment: nothing,
    getImage: nothing,
    getTotp: nothing,
    getConfigBody: nothing,
    getFieldsRaw: nothing,
    getPaymentRaw: (): Promise<string | undefined> => Promise.resolve(payment),
  };
}

test('an external export CARRIES the CVV and the PIN — the decision, protected', () => {
  // Owner's decision, 2026-09-01: an export is a full copy. externalBundle.ts already exports
  // passwords, private SSH keys and VPN configs; a CVV is not more sensitive than a private key, and
  // a special case for payment fields would be inconsistency rather than defence.
  return exportSecretsFor(vault(RAW) as never, 'acc-1', ['p1']).then((out) => {
    const exported = parsePaymentFields(out.p1?.payment);
    assert.equal(exported.cvv, '123', 'scrubbing this would silently make every restored card useless');
    assert.equal(exported.pin, '4321');
    assert.equal(exported.number, CARD.number);
  });
});

test('an export of an entry with no payment record carries no payment key at all', () => {
  return exportSecretsFor(vault(undefined) as never, 'acc-1', ['p1']).then((out) => {
    assert.equal('payment' in (out.p1 ?? {}), false, 'absent is absent, not an empty string');
  });
});

test('the version history CARRIES the whole record, so a rollback restores a whole card', () => {
  const entity = { id: 'p1', name: 'visa', details: { id: 'p1', name: 'visa', isSshEnabled: false } as EntityMetadata };
  return snapshotForRevision(vault(RAW) as never, 'acc-1', entity).then((revision) => {
    assert.equal(revision.secrets.payment, RAW, 'a rollback that returned the card without its CVV would be a worse bug than no rollback');
  });
});

test('a revision keeps the payment record through the cap, like every other small secret', () => {
  // pushRevision copies only the fields it knows: one missing from SMALL_FIELDS is dropped on the way
  // into history, silently, and only noticed by somebody rolling back a year later.
  const revision: Revision = {
    at: 1,
    name: 'visa',
    details: { id: 'p1', name: 'visa', isSshEnabled: false },
    secrets: { payment: RAW },
  };
  const [kept] = pushRevision([], revision);
  assert.equal(kept?.secrets.payment, RAW, 'payment must be in SMALL_FIELDS or history loses it');
});

test('an empty payment record is not written into history as an empty string', () => {
  const revision: Revision = {
    at: 1,
    name: 'visa',
    details: { id: 'p1', name: 'visa', isSshEnabled: false },
    secrets: { payment: '' },
  };
  const [kept] = pushRevision([], revision);
  assert.equal(kept?.secrets.payment, undefined);
});
