import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  accessMask,
  describeAccess,
  grantsAnything,
  maskKey,
  mayDelete,
  normalizeMcpAccess,
  resolveMcpAccess,
} from '../mcpAccess';
import { TreeNode } from '../types';

/**
 * What an agent is allowed to do, and where the answer came from.
 *
 * <p>Two properties carry the whole design and both are here: everything is off until somebody
 * turns it on, and the ladder makes "may change it but may not see it" unrepresentable rather
 * than merely discouraged.</p>
 */

function folder(id: string, mcp?: TreeNode['mcp']): TreeNode {
  return { id, name: id, type: 'folder', parentId: null, mcp };
}

function entity(id: string, parentId: string | null, mcp?: TreeNode['mcp']): TreeNode {
  return {
    id,
    name: id,
    type: 'entity',
    parentId,
    details: { id, name: id, isSshEnabled: false, mcp },
  };
}

test('nothing is allowed until somebody says so', () => {
  const resolved = resolveMcpAccess(entity('e1', 'f1'), folder('f1'), false);
  assert.deepEqual(resolved.access, {});
  assert.equal(resolved.source, 'none');
  assert.equal(grantsAnything(resolved.access), false);
});

test('the ladder fills in everything a switch implies', () => {
  // "May delete but may not see" is not a configuration anybody meant.
  assert.deepEqual(normalizeMcpAccess({ delete: 'any' }), {
    view: true,
    use: true,
    edit: true,
    create: true,
    delete: 'any',
  });
  assert.deepEqual(normalizeMcpAccess({ edit: true }), {
    view: true,
    use: true,
    edit: true,
    create: false,
    delete: undefined,
  });
});

test('a lone view stays a lone view — the ladder only ever fills DOWNWARDS', () => {
  assert.deepEqual(normalizeMcpAccess({ view: true }), {
    view: true,
    use: false,
    edit: false,
    create: false,
    delete: undefined,
  });
});

test('an unknown delete scope reads as no deleting rather than as permission', () => {
  // A record from a newer build could carry a scope this one has never heard of. Refusing is the
  // only safe reading; accepting the record and ignoring the word would be worse than both.
  assert.equal(normalizeMcpAccess({ delete: 'everything' as never }).delete, undefined);
});

test("the entry's own setting wins, and the folder is inherited when it has none", () => {
  const parent = folder('f1', { use: true });

  const own = resolveMcpAccess(entity('e1', 'f1', { view: true }), parent, false);
  assert.equal(own.source, 'entity');
  assert.equal(own.access.use, false);

  const inherited = resolveMcpAccess(entity('e2', 'f1'), parent, false);
  assert.equal(inherited.source, 'folder');
  assert.equal(inherited.access.use, true);
});

test('an entry closed ON PURPOSE stays closed when its folder is opened up', () => {
  // This is why absence and emptiness are different things. An empty object means "decided here,
  // and the answer is nothing"; removing the field would mean "ask the folder" and quietly
  // re-open the entry the next time somebody widened the folder.
  const resolved = resolveMcpAccess(entity('e1', 'f1', {}), folder('f1', { delete: 'any' }), false);
  assert.equal(resolved.source, 'entity');
  assert.equal(grantsAnything(resolved.access), false);
});

test('nothing in the trash is reachable, whatever either setting says', () => {
  const resolved = resolveMcpAccess(
    entity('e1', 'trash', { delete: 'any' }),
    folder('trash', { delete: 'any' }),
    true,
  );
  assert.deepEqual(resolved.access, {});
  assert.equal(resolved.source, 'none');
});

test('own-scoped deletion reaches only what the agent made', () => {
  const own = normalizeMcpAccess({ delete: 'own' });
  assert.equal(mayDelete(own, true), true);
  assert.equal(mayDelete(own, false), false);

  const any = normalizeMcpAccess({ delete: 'any' });
  assert.equal(mayDelete(any, false), true);

  assert.equal(mayDelete(normalizeMcpAccess({ create: true }), true), false);
});

test('the icon mask is five bits, and both delete scopes light the same one', () => {
  // Five stripes for six switches: the tree answers "can an agent delete here", and the scope is
  // a question for the form.
  assert.deepEqual(accessMask(normalizeMcpAccess({ view: true })), [true, false, false, false, false]);
  assert.equal(maskKey(normalizeMcpAccess({ delete: 'own' })), '11111');
  assert.equal(maskKey(normalizeMcpAccess({ delete: 'any' })), '11111');
  assert.equal(maskKey(normalizeMcpAccess(undefined)), '00000');
});

test('the words the viewer says distinguish the two delete scopes', () => {
  assert.equal(describeAccess({}), 'not available to agents');
  assert.match(describeAccess(normalizeMcpAccess({ delete: 'own' })), /created/);
  assert.match(describeAccess(normalizeMcpAccess({ delete: 'any' })), /to Trash/);
  assert.equal(describeAccess(normalizeMcpAccess({ view: true })), 'visible');
});
