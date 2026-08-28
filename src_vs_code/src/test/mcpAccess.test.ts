import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  accessMask,
  anyAgentAccess,
  describeAccess,
  entriesUnder,
  grantsAnything,
  maskKey,
  mayDelete,
  normalizeMcpAccess,
  resolveMcpAccess,
  resolveMcpInTree,
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

/** A tree as a lookup, so the resolver can walk it the way the real one does. */
function tree(...nodes: TreeNode[]): (id: string) => TreeNode | undefined {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (id: string) => byId.get(id);
}

function child(id: string, parentId: string, mcp?: TreeNode['mcp']): TreeNode {
  return { id, name: id, type: 'folder', parentId, mcp };
}

test('a grant on a folder reaches entries in the folders NESTED inside it', () => {
  // What the owner expects and says out loud: "I opened the root folder, so everything inside is
  // open; I can close a part of it afterwards." Resolving only against the immediate parent means
  // a project folder with sub-folders grants nothing at all, which is the opposite.
  const root = folder('root', { view: true, use: true });
  const mid = child('mid', 'root');
  const leaf = entity('e1', 'mid');

  const resolved = resolveMcpInTree(leaf, tree(root, mid, leaf));

  assert.equal(resolved.access.use, true, 'the grandparent grant did not reach a nested entry');
  assert.equal(resolved.source, 'folder');
});

test('a nested FOLDER answers with what it inherits, so its form can say so', () => {
  const root = folder('root', { view: true, use: true });
  const mid = child('mid', 'root');

  const resolved = resolveMcpInTree(mid, tree(root, mid));

  assert.equal(resolved.access.use, true, 'a sub-folder showed "not set" under an open parent');
  assert.equal(resolved.source, 'folder');
});

test('a folder closed on purpose blocks what its parent opened', () => {
  // The other half, and the reason presence is what carries the answer: an explicit empty object
  // means "decided, and the answer is nothing", and it must beat an ancestor that says yes.
  const root = folder('root', { view: true, use: true });
  const mid = child('mid', 'root', {});
  const leaf = entity('e1', 'mid');

  const resolved = resolveMcpInTree(leaf, tree(root, mid, leaf));

  assert.equal(
    grantsAnything(resolved.access),
    false,
    'a deliberately closed sub-folder still let the grant through',
  );
});

test('an entry still beats every folder above it', () => {
  const root = folder('root', { view: true, use: true, edit: true });
  const mid = child('mid', 'root');
  const leaf = entity('e1', 'mid', {});
  const resolved = resolveMcpInTree(leaf, tree(root, mid, leaf));

  assert.equal(resolved.source, 'entity');
  assert.equal(grantsAnything(resolved.access), false);
});

test('the blast radius counts the whole subtree, not the direct children', () => {
  // The form says this number out loud. Counting one level made a project folder whose entries
  // all live in sub-folders read "0 entries" — the most reassuring possible wording for the most
  // far-reaching possible click.
  const nodes: TreeNode[] = [
    folder('root'),
    child('db', 'root'),
    child('ssh', 'root'),
    entity('e1', 'db'),
    entity('e2', 'db'),
    entity('e3', 'ssh'),
    entity('elsewhere', null),
  ];

  assert.equal(entriesUnder('root', nodes), 3);
  assert.equal(entriesUnder('db', nodes), 2);
  assert.equal(entriesUnder('ssh', nodes), 1);
});

test('a cycle in the parent chain cannot hang the form', () => {
  // parentId comes off a synced record; a bad merge can make two folders each other's parent.
  const a = child('a', 'b');
  const b = child('b', 'a');

  assert.equal(entriesUnder('a', [a, b, entity('e1', 'b')]), 1);
});

test('the agent door opens only when somebody actually opened something', () => {
  // The trigger for binding a loopback listener at all, so it must key on an answer a person
  // GAVE. A folder set to nothing is an opt-OUT and must leave the door shut.
  assert.equal(anyAgentAccess([folder('root'), entity('e1', 'root')]), false, 'nothing set');
  assert.equal(anyAgentAccess([folder('root', {}), entity('e1', 'root')]), false, 'closed on purpose');
  assert.equal(anyAgentAccess([folder('root', { view: true })]), true, 'a folder was opened');
  assert.equal(anyAgentAccess([entity('e1', null, { use: true })]), true, 'an entry was opened');
});

test('a folder that only INHERITS does not itself open the door', () => {
  // It is already covered by the folder that answered; counting it would make the door depend on
  // where in the tree you look rather than on what anybody decided.
  assert.equal(anyAgentAccess([child('mid', 'root')]), false);
});
