import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeSender, senderIsVerified } from '../shareSender';

/**
 * On the server transport the sender is stamped from a verified token and cannot
 * be forged. On a shared folder it is a string the writer chose — so anyone with
 * write access can label an item as coming from a colleague, seal it under a PIN
 * of their own, and pass that PIN along while impersonating them.
 *
 * The dialog used to present both the same way. When trust cannot be guaranteed,
 * the interface must not simulate it.
 */

test('a server share names its sender plainly — the server stamped it', () => {
  assert.equal(senderIsVerified('https://vault.company.com'), true);
  assert.equal(describeSender('vasya@company.com', 'https://vault.company.com'), 'vasya@company.com');
});

test('a folder share says the name is only a claim, and why', () => {
  // "unverified" on its own reads as "probably fine". The reason is the point.
  const shown = describeSender('vasya@company.com', '/mnt/nas/vault');

  assert.match(shown, /vasya@company\.com/);
  assert.match(shown, /unverified/);
  assert.match(shown, /shared folder lets anyone write this name/);
});

test('a UNC path and a drive letter are folders too, not servers', () => {
  assert.equal(senderIsVerified('\\\\NAS\\Vault'), false);
  assert.equal(senderIsVerified('Z:\\Backups'), false);
});

test('no configured location proves nothing either, so it is treated as unverified', () => {
  assert.equal(senderIsVerified(undefined), false);
  assert.equal(senderIsVerified(''), false);
  assert.match(describeSender('someone@example.com', undefined), /unverified/);
});

test('http and https both count as the server transport', () => {
  // isServerLocation is what the transport factory itself routes on; the warning
  // must agree with it exactly, or it will contradict the code that picked the
  // transport.
  assert.equal(senderIsVerified('http://localhost:5113'), true);
  assert.equal(senderIsVerified('https://vault.company.com'), true);
});
