import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { EntityMetadata } from '../types';
import type { ExecAuth } from '../sshExecAuth';
import { pinRefusalFor } from '../pinGate';
import { callKeyName } from '../materializedKeys';

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
  entity: EntityMetadata = ENTITY,
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
        materializeCallKey: (dir: string): string => {
          const name = callKeyName();
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
    mod.resolveExecAuth({} as never, 'acct', entity, storageDir);
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

test('K5: a stored key is written out under a call name that holds nothing of the id of the key entry, and the argv is told it is a KEY', async () => {
  const writes: string[] = [];
  const result = await withCredential(
    { kind: 'storedKey', keyEntityId: 'deploy-key', content: 'PRIVATE' },
    writes,
  )('/store');

  const auth = ok(result);
  assert.equal(auth.auth, 'key');
  const last = (auth.keyPath ?? '').split('/').at(-1) ?? '';
  assert.ok(!last.includes('deploy-key'), `the last part of the key path holds the id of the key entry: ${last}`);
  assert.match(last, /^call-[0-9a-f-]{36}$/);
  assert.ok(auth.keyPath?.startsWith('/store/'));
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

  // The parent's own spelling of the name: Windows calls it `Path`, and only `process.env` itself is
  // case-insensitive there — a spread copy keeps the spelling, which `spawn` then reads correctly.
  const pathName = Object.keys(process.env).find((name) => name.toUpperCase() === 'PATH') ?? 'PATH';
  assert.notEqual(process.env[pathName], undefined, 'the positive control: this process has a PATH');
  assert.equal(ok(result).env[pathName], process.env[pathName], 'PATH must survive');
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
        materializeCallKey: (): string => {
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

/**
 * A woven password cannot be handed to `ssh`, and a reviewer was right that only `automaticRefusal`
 * had been tested for it — the resolver's own answer, which is what the broker and the bridge both
 * branch on, was asserted nowhere.
 */
test('a WOVEN password is refused rather than authenticated with a guess', async () => {
  const woven = { ...ENTITY, name: 'prod box', passwordWoven: true } as EntityMetadata;
  const writes: string[] = [];

  const result = await withCredential({ kind: 'password', password: 'w0v3n-pair' }, writes, woven)('/store');

  const refusal = refused(result);
  assert.equal(refusal.reason, 'no_credential', 'the shape every caller already handles');
  assert.match(refusal.message, /prod box/, 'it names the entry');
  assert.match(refusal.message, /cannot be used automatically/);
  assert.match(refusal.message, /which of the two halves is yours/, 'and says why, rather than going silent');
  assert.deepEqual(writes, [], 'no askpass script is written for a value that will not be used');
});

test('an ordinary password on the SAME entity is still handed over', async () => {
  // The other side of the line: the refusal is about the mark, not about the entity or the kind.
  const plain = { ...ENTITY, name: 'prod box' } as EntityMetadata;

  const result = await withCredential({ kind: 'password', password: 'w0v3n-pair' }, [], plain)('/store');

  assert.equal(ok(result).auth, 'askpass');
});

/**
 * Rule B (`research/PLAN_agent_refusal_names_unlisted_entry_E2.md`, B6): a value that another entry owns stopped the call, and the failure says which
 * entry, so that the one chooser of `agentNaming.ts` can decide whether an agent may read its name. The sentence itself does not change.
 */
const BORROWED = { kind: 'stopped', reason: pinRefusalFor('deploy key'), ownerName: 'deploy key', ownerId: 'k7' };

test('B6: a stopped value of ANOTHER entry says which entry, whatever the sentence says; the sentence is as it was', async () => {
  const sealed = refused(await withCredential(BORROWED)('/store'));
  assert.deepEqual(sealed.second, { id: 'k7', relation: 'linked key' });
  assert.equal(sealed.message, pinRefusalFor('deploy key'));
  const clicked = refused(await withCredential({ ...BORROWED, reason: '' })('/store'));
  assert.deepEqual(clicked.second, { id: 'k7', relation: 'linked key' }, 'a click that said nothing is still about the other entry');
  assert.equal(clicked.message, '"deploy key" is protected with its own PIN, and it was not opened.');
});

test('B6: a stopped value of the entry that was asked for says no second entry', async () => {
  const own = refused(await withCredential({ ...BORROWED, ownerName: ENTITY.name, ownerId: ENTITY.id })('/store'));
  assert.equal(own.second, undefined);
  assert.equal(own.message, pinRefusalFor('deploy key'), 'the message does not change');
});
