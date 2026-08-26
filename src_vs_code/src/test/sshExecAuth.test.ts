import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { EntityMetadata } from '../types';
import type { ExecAuth } from '../sshExecAuth';

/**
 * Turning a saved credential into what a non-interactive `ssh` needs.
 *
 * <p><b>This module exists because the mapping was written twice, and the second copy handled
 * one case in four.</b> The agent exec path resolved a stored key, a key file, a password and
 * no-credential-at-all; the `ssh -R` bridge, added later, resolved `storedKey` and passed
 * `undefined` for the rest. On a live password-authenticated host that produced a bridge with
 * no credential — and because the bridge argv also set no `BatchMode`, `ssh` did not refuse it.
 * It waited at a password prompt on a pipe with an established TCP connection and an alive
 * process, which is the most convincing way a thing can look healthy while doing nothing.</p>
 *
 * <p>So every kind is asserted here, by name. A resolver that silently returns "no key" for a
 * kind it does not know is the exact defect, and only an enumeration catches it.</p>
 */

const ENTITY: EntityMetadata = {
  id: 'e1',
  name: 'build box',
  host: 'build.example.com',
  user: 'dev',
  isSshEnabled: true,
} as EntityMetadata;

/** Load with `resolveSshCredential` standing in for the vault, and the disk writes observed. */
function withCredential(
  source: Record<string, unknown>,
  writes: string[] = [],
): (storageDir: string) => Promise<ExecAuth> {
  const mod = loadWithVscode<typeof import('../sshExecAuth')>(
    '../sshExecAuth',
    {},
    {
      './sshCredential': { resolveSshCredential: async (): Promise<unknown> => source },
      './keyInstaller': {
        materializePrivateKey: (dir: string, name: string): string => {
          writes.push(`key:${name}`);
          return `${dir}/${name}`;
        },
        writeAskpassScriptFile: (dir: string): string => {
          writes.push('askpass');
          return `${dir}/askpass.sh`;
        },
      },
    },
  );
  return (storageDir: string) =>
    mod.resolveExecAuth({} as never, 'acct', ENTITY, storageDir);
}

/** Narrow to the success case once, so no assertion has to re-check `ok` inline. */
function ok(result: ExecAuth): Extract<ExecAuth, { ok: true }> {
  assert.equal(result.ok, true, result.ok ? '' : result.message);
  return result as Extract<ExecAuth, { ok: true }>;
}

/** The same for a refusal, which must carry a reason a caller can branch on. */
function refused(result: ExecAuth): Extract<ExecAuth, { ok: false }> {
  assert.equal(result.ok, false);
  return result as Extract<ExecAuth, { ok: false }>;
}

test('a stored key is written out, and the argv is told it is a KEY', async () => {
  const writes: string[] = [];
  const result = await withCredential(
    { kind: 'storedKey', keyEntityId: 'k7', content: 'PRIVATE' },
    writes,
  )('/store');

  const auth = ok(result);
  assert.equal(auth.auth, 'key');
  assert.ok(auth.keyPath?.startsWith('/store/k7-'), auth.keyPath);
  assert.notEqual(auth.materialized, undefined, 'the caller must know to delete it');
  assert.equal(writes.length, 1);
});

test('the written key is named per CALL, so one finishing cannot delete another’s', async () => {
  const resolve = withCredential({ kind: 'storedKey', keyEntityId: 'k7', content: 'PRIVATE' });

  const first = await resolve('/store');
  const second = await resolve('/store');

  assert.notEqual(ok(first).keyPath, ok(second).keyPath);
});

test('a key FILE is used where it lies — nothing is written for it', async () => {
  const writes: string[] = [];
  const result = await withCredential({ kind: 'keyPath', path: '/home/dev/.ssh/id_ed25519' }, writes)('/store');

  const auth = ok(result);
  assert.equal(auth.keyPath, '/home/dev/.ssh/id_ed25519');
  assert.equal(auth.auth, 'key');
  assert.equal(auth.materialized, undefined, 'we did not write it, we must not delete it');
  assert.deepEqual(writes, []);
});

test('a PASSWORD rides the environment, and switches the argv to askpass', async () => {
  // The kind the bridge dropped. Neither the password nor a path to it may be on the command
  // line, so what comes back is an env and an `auth` the argv builder reads.
  const writes: string[] = [];
  const result = await withCredential({ kind: 'password', password: 'hunter2' }, writes)('/store');

  const auth = ok(result);
  assert.equal(auth.auth, 'askpass');
  assert.equal(auth.keyPath, undefined);
  assert.equal(auth.env.SSH_ASKPASS, '/store/askpass.sh');
  assert.equal(auth.env.SSH_ASKPASS_REQUIRE, 'force');
  assert.deepEqual(writes, ['askpass']);
});

test('the password env CARRIES the parent’s, because spawn replaces rather than merges', async () => {
  // Without PATH and HOME `ssh` is unresolvable and known_hosts is not found — a failure that
  // looks like a network problem.
  const result = await withCredential({ kind: 'password', password: 'hunter2' })('/store');

  assert.notEqual(ok(result).env.PATH, undefined, 'PATH must survive');
});

test('no credential at all is a REFUSAL that says so, never a silent "no key"', async () => {
  // This is the shape of the original defect: an unhandled kind that returned `undefined` and
  // let the caller spawn an ssh with nothing to authenticate with.
  const result = await withCredential({ kind: 'none' })('/store');

  const refusal = refused(result);
  assert.equal(refusal.reason, 'no_credential');
  assert.match(refusal.message, /build box/);
});

test('a warning is RETURNED, not shown — the two callers present it differently', async () => {
  // An entity authenticating with different key material than its configuration names is the
  // one case nobody may be left uninformed about; but a function that pops a dialog cannot be
  // unit-tested, and the bridge has no `note` channel to write to.
  const result = await withCredential({
    kind: 'keyPath',
    path: '/k',
    warning: 'this entry names a key it no longer has',
  })('/store');

  assert.match(result.warning ?? '', /no longer has/);
});

test('a key that cannot be written is an internal failure, not a passwordless attempt', async () => {
  const mod = loadWithVscode<typeof import('../sshExecAuth')>(
    '../sshExecAuth',
    {},
    {
      './sshCredential': {
        resolveSshCredential: async (): Promise<unknown> => ({
          kind: 'storedKey',
          keyEntityId: 'k7',
          content: 'PRIVATE',
        }),
      },
      './keyInstaller': {
        materializePrivateKey: (): string => {
          throw new Error('EACCES: read-only file system');
        },
        writeAskpassScriptFile: (): string => '/x',
      },
    },
  );

  const result = await mod.resolveExecAuth({} as never, 'acct', ENTITY, '/store');

  const refusal = refused(result);
  assert.equal(refusal.reason, 'internal');
  assert.match(refusal.message, /EACCES/);
});
