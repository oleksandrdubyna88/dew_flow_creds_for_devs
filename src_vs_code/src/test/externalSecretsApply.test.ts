import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXTERNAL_SECRET_KEYS, applyExternalSecrets } from '../externalSecretsApply';
import type { ExternalSecrets } from '../externalBundle';

/**
 * Everything an external bundle CARRIES, it must also RESTORE.
 *
 * <p>Found by the code review, independently by both vendors, and it was a real data-loss bug of
 * mine: S1.3 added `payment` to the external EXPORT and never to the import, so exporting a card to a
 * file and importing it back created the entry and silently discarded the card — number, CVV, PIN and
 * all. A round trip that loses data, with every other test green.</p>
 *
 * <p>Auditing that found the SAME bug already present for `config`: a config body exported to an
 * external file has never been restored on import either. So the defect is not a missing line, it is
 * a hand-written loop that must agree with `ExternalSecrets` and had no way to be checked. The loop
 * moved into `externalSecretsApply.ts` for exactly that reason, and the test below is the check: it
 * is driven from the KEY LIST, so a field added to `ExternalSecrets` and forgotten in the applier
 * fails here rather than in somebody's vault.</p>
 */

interface Written {
  password: [string, string, string | undefined][];
  calls: Record<string, unknown[]>;
}

function fakeStorage(): { storage: Record<string, unknown>; written: Written } {
  const written: Written = { password: [], calls: {} };
  const record = (name: string) => (...args: unknown[]): Promise<void> => {
    written.calls[name] = args;
    return Promise.resolve();
  };
  return {
    storage: {
      setPassword: record('setPassword'),
      setPrivateKey: record('setPrivateKey'),
      setVpnConfig: record('setVpnConfig'),
      setDbConnection: record('setDbConnection'),
      setNotes: record('setNotes'),
      setFields: record('setFields'),
      setAttachment: record('setAttachment'),
      setImage: record('setImage'),
      setTotp: record('setTotp'),
      setConfigBody: record('setConfigBody'),
      setPaymentRaw: record('setPaymentRaw'),
    },
    written,
  };
}

/** One value per key `ExternalSecrets` can hold, so the exhaustiveness test has something to find. */
const EVERY_SECRET: ExternalSecrets = {
  password: 'pw',
  privateKey: 'key',
  vpnConfig: 'vpn',
  dbConnection: 'conn',
  notes: 'note',
  attachment: 'att',
  image: 'img',
  totp: 'otpauth://totp/x?secret=JBSWY3DPEHPK3PXP',
  config: '{"a":1}',
  payment: '{"number":"4111111111111111","cvv":"123"}',
  login: 'ada',
  url: 'https://example.internal',
};

test('every key an external bundle can carry is restored on import', async () => {
  // The test that would have caught both bugs. Driven from the key list rather than a hand-written
  // set of assertions, so the NEXT field added to ExternalSecrets and forgotten in the applier fails
  // here instead of silently vanishing on somebody's import.
  const { storage, written } = fakeStorage();
  await applyExternalSecrets(storage as never, 'acc-1', { e1: EVERY_SECRET });

  for (const key of EXTERNAL_SECRET_KEYS) {
    assert.ok(
      written.calls[key.setter] !== undefined,
      `${key.field} is carried by an export and never restored — an import silently discards it`,
    );
  }
});

test('the payment record survives an export and an import', async () => {
  // Mine, and the one the review found: the card arrived as an entry with no card.
  const { storage, written } = fakeStorage();
  await applyExternalSecrets(storage as never, 'acc-1', { e1: { payment: EVERY_SECRET.payment } });

  assert.deepEqual(written.calls.setPaymentRaw, ['acc-1', 'e1', EVERY_SECRET.payment]);
});

test('the config document survives an export and an import', async () => {
  // Pre-existing, and older than the payment kind: found while fixing mine, because the loop had the
  // same hole for it. Its own test, so it cannot be read as a payment detail.
  const { storage, written } = fakeStorage();
  await applyExternalSecrets(storage as never, 'acc-1', { e1: { config: '{"a":1}' } });

  assert.deepEqual(written.calls.setConfigBody, ['acc-1', 'e1', '{"a":1}']);
});

test('an absent field writes nothing, rather than writing an empty value over one', async () => {
  const { storage, written } = fakeStorage();
  await applyExternalSecrets(storage as never, 'acc-1', { e1: { password: 'pw' } });

  assert.equal(written.calls.setPaymentRaw, undefined, 'no payment in the bundle, no payment write');
  assert.equal(written.calls.setConfigBody, undefined);
  assert.equal(written.calls.setTotp, undefined);
});

test('login and url are restored together, as the one record they are stored as', async () => {
  // They share a keychain key, so they are one write and not two — the shape `entityFields.ts` exists
  // to keep. Asserted because a per-field loop would be the obvious wrong simplification here.
  const { storage, written } = fakeStorage();
  await applyExternalSecrets(storage as never, 'acc-1', { e1: { login: 'ada', url: 'https://x' } });

  assert.deepEqual(written.calls.setFields, ['acc-1', 'e1', { login: 'ada', url: 'https://x' }]);
});
