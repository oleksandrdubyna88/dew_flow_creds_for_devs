import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { isBackupBundle, isEntityMetadata } from '../types';

const entity = {
  id: 'e1',
  name: 'prod key',
  isSshEnabled: false,
  isSshKey: true,
  publicKey: 'ssh-ed25519 AAAA... user@host',
  sshKeyEntityId: 'e2',
};

test('accepts entity metadata with key fields and the SSH-key flag', () => {
  assert.ok(isEntityMetadata(entity));
  assert.ok(isEntityMetadata({ id: 'e', name: 'n', isSshEnabled: false }));
});

test('rejects entity metadata with wrongly typed key fields', () => {
  assert.equal(isEntityMetadata({ ...entity, isSshKey: 'yes' }), false);
  assert.equal(isEntityMetadata({ ...entity, publicKey: 42 }), false);
  assert.equal(isEntityMetadata({ ...entity, sshKeyEntityId: 7 }), false);
});

test('accepts backup bundles with and without privateKeys (pre-0.5 compat)', () => {
  const nodes = [{ id: 'e1', name: 'prod key', type: 'entity', details: entity }];
  assert.ok(isBackupBundle({ nodes, passwords: { e1: 'pw' } }));
  assert.ok(isBackupBundle({ nodes, passwords: {}, privateKeys: { e1: '-----BEGIN...' } }));
  assert.equal(isBackupBundle({ nodes, passwords: {}, privateKeys: { e1: 5 } }), false);
});
