import assert from 'node:assert/strict';
import { test } from 'node:test';
import { restrictToOwnerArgv } from '../fileAcl';

/**
 * Locking a written secret file down to its owner.
 *
 * On Windows `fs.chmod(path, 0o600)` is very nearly a no-op — it toggles the read-only
 * attribute and says nothing about WHO may read the file. The real access list is the
 * NTFS ACL, and by default it is inherited: SYSTEM and the local Administrators group
 * both have full control of everything under the user profile. On a machine where the
 * operator is not the administrator — a corporate laptop, a shared build box — that is
 * exactly the audience a credential manager exists to keep out.
 */

test('windows gets an icacls argv that breaks inheritance and grants only the owner', () => {
  const argv = restrictToOwnerArgv('C:\keys\id.key', 'win32', 'JINX\strug');

  assert.equal(argv?.[0], 'icacls');
  assert.equal(argv?.includes('C:\keys\id.key'), true);
  // Without /inheritance:r the inherited Administrators and SYSTEM entries survive and
  // the grant adds nothing.
  assert.equal(argv?.includes('/inheritance:r'), true);
  assert.equal(argv?.some((a) => a.startsWith('/grant:r') || a === '/grant:r'), true);
  assert.equal(argv?.some((a) => a.includes('JINX\strug')), true);
});

test('the owner is taken from the environment, never guessed', () => {
  const argv = restrictToOwnerArgv('C:\k.key', 'win32', 'CORP\alice');
  assert.equal(argv?.some((a) => a.includes('CORP\alice')), true);
});

test('no owner known on windows means no argv — never a wildcard grant', () => {
  // A malformed or absent user name must not become `/grant:r :F` or an everyone grant;
  // leaving the inherited ACL alone is worse than a grant that opens the file wider.
  assert.equal(restrictToOwnerArgv('C:\k.key', 'win32', undefined), undefined);
  assert.equal(restrictToOwnerArgv('C:\k.key', 'win32', '   '), undefined);
});

test('posix needs nothing — chmod there is real', () => {
  assert.equal(restrictToOwnerArgv('/home/u/.ssh/id', 'linux', 'u'), undefined);
  assert.equal(restrictToOwnerArgv('/home/u/.ssh/id', 'darwin', 'u'), undefined);
});
