import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TreeNode } from '../types';
import { quickOpenItems } from '../quickOpen';

function folder(id: string, name: string, parentId?: string): TreeNode {
  return { id, name, type: 'folder', parentId: parentId ?? null };
}

function entity(id: string, name: string, parentId: string | null, details: Partial<TreeNode['details']> = {}): TreeNode {
  return {
    id,
    name,
    type: 'entity',
    parentId,
    details: { id, name, isSshEnabled: false, ...details } as TreeNode['details'],
  };
}

const ACCOUNT = { accountId: 'a1', email: 'me@corp.com' };

test('every entity is listed, and folders are not — a folder is not somewhere to go', () => {
  const items = quickOpenItems([
    { ...ACCOUNT, nodes: [folder('f1', 'Servers'), entity('e1', 'gateway', 'f1'), entity('e2', 'db', null)] },
  ]);

  assert.deepEqual(items.map((i) => i.label), ['db', 'gateway']);
});

test('the description carries the account and the folder path, so two same-named rows differ', () => {
  const items = quickOpenItems([
    {
      ...ACCOUNT,
      nodes: [
        folder('f1', 'Servers'),
        folder('f2', 'EU', 'f1'),
        entity('e1', 'gateway', 'f2'),
        entity('e2', 'gateway', null),
      ],
    },
  ]);

  const descriptions = items.map((i) => i.description).sort();
  assert.deepEqual(descriptions, ['me@corp.com', 'me@corp.com · Servers / EU']);
});

test('several accounts are one list, sorted by name', () => {
  const items = quickOpenItems([
    { accountId: 'a1', email: 'work@corp.com', nodes: [entity('e1', 'zeta', null)] },
    { accountId: 'a2', email: 'me@home.io', nodes: [entity('e2', 'alpha', null)] },
  ]);

  assert.deepEqual(items.map((i) => i.label), ['alpha', 'zeta']);
  assert.deepEqual(items.map((i) => i.accountId), ['a2', 'a1']);
});

test('the kind travels under `entityKind` — `kind` belongs to VS Code on a QuickPickItem', () => {
  // Named `kind`, the property silently became a QuickPickItemKind and the picker rendered
  // separators instead of rows.
  // `isSshEnabled`, not `host`: that is what `kindOf` reads. (The tree's own `:ssh` token is
  // built from `host` instead — the divergence the audit records as S5, not this module's to
  // fix, but a reason to key off the shared function rather than guess.)
  const items = quickOpenItems([
    { ...ACCOUNT, nodes: [entity('e1', 'host', null, { host: 'h', isSshEnabled: true })] },
  ]);
  assert.equal(items[0].entityKind, 'ssh');
  assert.equal(Object.prototype.hasOwnProperty.call(items[0], 'kind'), false);
});

test('the searchable detail is the tree filter\'s haystack — so a secret can never be typed into it', () => {
  // The whole reason nodeHaystack is reused rather than re-derived here: a picker that matched
  // secrets would answer "does any password contain this?" one keystroke at a time.
  const items = quickOpenItems([
    {
      ...ACCOUNT,
      nodes: [
        entity('e1', 'prod', null, {
          host: 'db.internal',
          user: 'deploy',
          notes: 'memorable-secret-note',
        }),
      ],
    },
  ]);

  assert.match(items[0].detail, /db\.internal/);
  assert.match(items[0].detail, /deploy/);
  assert.equal(items[0].detail.includes('memorable'), false, 'notes must not be searchable');
});

test('a cycle in parentId cannot hang the picker', () => {
  // parentId arrives by sync and by import, so it is data rather than an invariant.
  const a = folder('f1', 'A', 'f2');
  const b = folder('f2', 'B', 'f1');
  const items = quickOpenItems([{ ...ACCOUNT, nodes: [a, b, entity('e1', 'stuck', 'f1')] }]);

  assert.equal(items.length, 1);
  assert.ok(items[0].description.startsWith('me@corp.com'));
});

test('an account with nothing in it contributes nothing', () => {
  assert.deepEqual(quickOpenItems([{ ...ACCOUNT, nodes: [] }]), []);
  assert.deepEqual(quickOpenItems([]), []);
});
