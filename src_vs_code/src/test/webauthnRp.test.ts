import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { CURRENT_RP_ID, LEGACY_RP_ID, isLegacyKeyWrap, migrationOfferText, wrapRpId } from '../webauthnRp';

test('the current RP ID is a .localhost name of our own; the legacy one is the bare localhost', () => {
  assert.ok(CURRENT_RP_ID.endsWith('.localhost'), 'loopback per RFC 6761, no DNS');
  assert.notEqual(CURRENT_RP_ID, LEGACY_RP_ID);
  assert.equal(LEGACY_RP_ID, 'localhost');
});

test('only a webauthn wrap without an rpId is legacy — a PIN wrap never is, nor a wrap under the current RP', () => {
  assert.equal(isLegacyKeyWrap({ kind: 'webauthn' }), true);
  assert.equal(isLegacyKeyWrap({ kind: 'webauthn', rpId: CURRENT_RP_ID }), false);
  assert.equal(isLegacyKeyWrap({ kind: 'pin' }), false);
  assert.equal(wrapRpId({}), LEGACY_RP_ID);
});

test('the offer names the key, the account and the new RP — and says nothing stops working meanwhile', () => {
  const text = migrationOfferText('me@corp.com', 'YubiKey 5C');
  assert.ok(text.includes('YubiKey 5C') && text.includes('me@corp.com') && text.includes(CURRENT_RP_ID));
  assert.ok(text.includes('keep working'));
  assert.ok(migrationOfferText('me@corp.com', undefined).includes('this security key'));
});
