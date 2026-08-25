/**
 * Locking a written secret file down to its owner.
 *
 * <p>On Windows `fs.chmodSync(path, 0o600)` is very nearly a no-op: it toggles the
 * read-only attribute and says nothing about WHO may read the file. The real access list
 * is the NTFS ACL, and by default it is inherited — SYSTEM and the local Administrators
 * group both hold full control of everything under the user profile. On a machine where
 * the operator is not the administrator (a corporate laptop, a shared build box) that is
 * exactly the audience a credential manager exists to keep out, and the extension's own
 * comments claiming "0600" were describing a protection that was not there.</p>
 *
 * <p>Pure: the argv is a decision, running it is not. POSIX returns `undefined` because
 * `chmod` there is real and already applied at every write site.</p>
 */
export function restrictToOwnerArgv(
  filePath: string,
  platform: NodeJS.Platform,
  owner: string | undefined,
): string[] | undefined {
  if (platform !== 'win32') {
    return undefined;
  }
  const principal = (owner ?? '').trim();
  if (principal.length === 0) {
    // Never a wildcard: an ACL granting nobody in particular is worse than the inherited
    // one, because it would silently open or lock the file in ways nobody chose.
    return undefined;
  }
  // /inheritance:r drops the inherited SYSTEM + Administrators entries; /grant:r replaces
  // any existing entry for this principal rather than adding a second one.
  return ['icacls', filePath, '/inheritance:r', '/grant:r', `${principal}:F`];
}

/** The principal to grant — the logged-on user, as Windows itself names them. */
// eslint-disable-next-line complexity
export function currentOwner(env: Readonly<Record<string, string | undefined>>): string | undefined {
  const domain = (env.USERDOMAIN ?? '').trim();
  const user = (env.USERNAME ?? '').trim();
  if (user.length === 0) {
    return undefined;
  }
  return domain.length > 0 ? `${domain}\\${user}` : user;
}
