/**
 * Pure naming helpers for NAS backup files — kept free of `vscode` imports
 * so they are unit-testable under plain node:test.
 */

interface NamedAccount {
  accountId: string;
  email: string;
  provider: string;
}

/** `user1@outlook.com` → `user1_at_outlook_com` */
export function sanitizeEmailForFilename(email: string): string {
  return email
    .trim()
    .toLowerCase()
    .replace(/@/g, '_at_')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** `user1@outlook.com` → `vault_user1_at_outlook_com.enc` */
export function backupFileName(email: string, discriminator?: string): string {
  const sanitized = sanitizeEmailForFilename(email);
  const base = sanitized.length > 0 ? sanitized : 'account';
  const suffix = discriminator !== undefined ? `_${sanitizeEmailForFilename(discriminator) || 'x'}` : '';
  return `vault_${base}${suffix}.enc`;
}

/**
 * Assign one UNIQUE filename per account (keyed by accountId). The plain
 * email-based name is used whenever it is unambiguous; on a collision
 * (same email under two providers) the provider is appended, and as a last
 * resort a slice of the account id — so one profile's backup can never
 * silently overwrite another's.
 */
// eslint-disable-next-line complexity
export function planBackupFileNames(accounts: readonly NamedAccount[]): Map<string, string> {
  const names = new Map<string, string>();
  const used = new Set<string>();
  const emailCounts = new Map<string, number>();
  for (const a of accounts) {
    const base = backupFileName(a.email);
    emailCounts.set(base, (emailCounts.get(base) ?? 0) + 1);
  }

  for (const a of accounts) {
    const candidates = [
      (emailCounts.get(backupFileName(a.email)) ?? 0) > 1
        ? backupFileName(a.email, a.provider)
        : backupFileName(a.email),
      backupFileName(a.email, `${a.provider}_${a.accountId.slice(0, 8)}`),
      backupFileName(a.email, `${a.provider}_${a.accountId}`),
    ];
    const name = candidates.find((c) => !used.has(c)) ?? candidates[candidates.length - 1];
    used.add(name);
    names.set(a.accountId, name);
  }
  return names;
}
