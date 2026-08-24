import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveSshCredential } from '../sshCredential';
import { StorageManager } from '../storageManager';
import { EntityMetadata, TreeNode } from '../types';

/**
 * Which secret an SSH connection authenticates with. Extracted from
 * `connectEntity` so the human Connect path and the agent broker answer this
 * identically — two resolutions of the same question is how the two surfaces
 * would quietly start connecting as different users.
 *
 * The order is the original's, and it is asserted here rather than re-derived:
 * a referenced key entity beats the entity's own settings, a stored key beats a
 * key path, a key path beats a password, and an EMPTY stored path is still a
 * key path — historic data relies on that meaning "no -i flag" rather than
 * "fall through to the password".
 */

interface Fake {
  nodes?: Record<string, EntityMetadata>;
  keys?: Record<string, string>;
  passwords?: Record<string, string>;
}

/** Only the four members `resolveSshCredential` touches. */
function fakeStorage(fake: Fake): StorageManager {
  return {
    getNode: (_a: string, id: string): TreeNode | undefined => {
      const details = fake.nodes?.[id];
      return details === undefined
        ? undefined
        : { id, name: details.name, type: 'entity', details };
    },
    getPrivateKey: (_a: string, id: string) => Promise.resolve(fake.keys?.[id]),
    getPassword: (_a: string, id: string) => Promise.resolve(fake.passwords?.[id]),
  } as unknown as StorageManager;
}

const entity = (over: Partial<EntityMetadata> = {}): EntityMetadata => ({
  id: 'own',
  name: 'prod',
  host: 'example.com',
  user: 'deploy',
  isSshEnabled: true,
  ...over,
});

test('a stored key wins over a key path and over a password', async () => {
  const source = await resolveSshCredential(
    fakeStorage({ keys: { own: 'KEY' }, passwords: { own: 'pw' } }),
    'a',
    entity({ sshKeyPath: '/home/me/.ssh/id_ed25519' }),
  );

  assert.deepEqual(source, { kind: 'storedKey', keyEntityId: 'own', content: 'KEY', warning: undefined });
});

test('a key path wins over a password', async () => {
  const source = await resolveSshCredential(
    fakeStorage({ passwords: { own: 'pw' } }),
    'a',
    entity({ sshKeyPath: '/k' }),
  );

  assert.equal(source.kind, 'keyPath');
});

test('an EMPTY key path is still a key path, never a fall-through to the password', async () => {
  // Historic entities carry `sshKeyPath: ''` meaning "no -i flag". Reading it
  // as falsy would silently start sending the stored password to hosts that
  // have only ever been reached with a key.
  const source = await resolveSshCredential(
    fakeStorage({ passwords: { own: 'pw' } }),
    'a',
    entity({ sshKeyPath: '' }),
  );

  assert.deepEqual(source, { kind: 'keyPath', path: '', warning: undefined });
});

test('a password is used only when no key is configured anywhere', async () => {
  const source = await resolveSshCredential(fakeStorage({ passwords: { own: 'pw' } }), 'a', entity());

  assert.deepEqual(source, { kind: 'password', password: 'pw', warning: undefined });
});

test('nothing configured resolves to none, not to an empty password', async () => {
  assert.equal((await resolveSshCredential(fakeStorage({}), 'a', entity())).kind, 'none');
});

test('a referenced key entity supplies the key instead of the entity itself', async () => {
  const source = await resolveSshCredential(
    fakeStorage({
      nodes: { keyent: entity({ id: 'keyent', name: 'shared key' }) },
      keys: { keyent: 'SHARED', own: 'OWN' },
    }),
    'a',
    entity({ sshKeyEntityId: 'keyent' }),
  );

  assert.deepEqual(source, {
    kind: 'storedKey',
    keyEntityId: 'keyent',
    content: 'SHARED',
    warning: undefined,
  });
});

test('a reference to a deleted key entity warns and falls back to own settings', async () => {
  const source = await resolveSshCredential(
    fakeStorage({ keys: { own: 'OWN' } }),
    'a',
    entity({ sshKeyEntityId: 'gone' }),
  );

  assert.equal(source.kind, 'storedKey');
  assert.match(String(source.warning), /no longer exists/);
});

test('the key entity’s password is preferred, with the entity’s own as fallback', async () => {
  // Both halves of the original expression, kept because a shared key entity
  // may carry the passphrase-less account password for several hosts.
  const viaKeyEntity = await resolveSshCredential(
    fakeStorage({
      nodes: { keyent: entity({ id: 'keyent', name: 'shared' }) },
      passwords: { keyent: 'shared-pw', own: 'own-pw' },
    }),
    'a',
    entity({ sshKeyEntityId: 'keyent' }),
  );
  assert.deepEqual(viaKeyEntity, { kind: 'password', password: 'shared-pw', warning: undefined });

  const fallback = await resolveSshCredential(
    fakeStorage({
      nodes: { keyent: entity({ id: 'keyent', name: 'shared' }) },
      passwords: { own: 'own-pw' },
    }),
    'a',
    entity({ sshKeyEntityId: 'keyent' }),
  );
  assert.deepEqual(fallback, { kind: 'password', password: 'own-pw', warning: undefined });
});
