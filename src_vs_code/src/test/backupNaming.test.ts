import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  backupFileName,
  planBackupFileNames,
  sanitizeEmailForFilename,
} from '../backupNaming';

test('sanitizes a plain email into the vault filename form', () => {
  assert.equal(sanitizeEmailForFilename('user1@outlook.com'), 'user1_at_outlook_com');
  assert.equal(backupFileName('user1@outlook.com'), 'vault_user1_at_outlook_com.enc');
});

test('sanitizes mixed case, plus-addressing, and stray characters', () => {
  assert.equal(backupFileName('User.Two+dev@G-Mail.com'), 'vault_user_two_dev_at_g_mail_com.enc');
});

test('plans plain email-based names when emails are unique', () => {
  const plan = planBackupFileNames([
    { accountId: 'a1', email: 'user1@outlook.com', provider: 'microsoft' },
    { accountId: 'a2', email: 'user2@gmail.com', provider: 'google' },
  ]);
  assert.equal(plan.get('a1'), 'vault_user1_at_outlook_com.enc');
  assert.equal(plan.get('a2'), 'vault_user2_at_gmail_com.enc');
});

test('same email under two providers gets distinct filenames (no overwrite)', () => {
  const plan = planBackupFileNames([
    { accountId: 'ms-1', email: 'user@example.com', provider: 'microsoft' },
    { accountId: 'gg-1', email: 'user@example.com', provider: 'google' },
  ]);
  assert.equal(plan.get('ms-1'), 'vault_user_at_example_com_microsoft.enc');
  assert.equal(plan.get('gg-1'), 'vault_user_at_example_com_google.enc');
  assert.notEqual(plan.get('ms-1'), plan.get('gg-1'));
});

test('same email AND provider still yields unique names via the account id', () => {
  const plan = planBackupFileNames([
    { accountId: 'id-aaaa1111', email: 'user@example.com', provider: 'microsoft' },
    { accountId: 'id-bbbb2222', email: 'user@example.com', provider: 'microsoft' },
  ]);
  const names = [...plan.values()];
  assert.equal(new Set(names).size, 2);
});

test('never produces path separators or empty names', () => {
  const name = backupFileName('../..\\evil@corp/../x');
  assert.ok(!name.includes('/') && !name.includes('\\'));
  assert.equal(backupFileName('@@@'), 'vault_at_at_at.enc');
  assert.equal(backupFileName('///'), 'vault_account.enc');
});
