import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DepColorKey } from '../depColors';
import {
  ROOT_GROUP_NAME,
  buildDependencyCandidates,
  buildDependencyColorMap,
  buildDependencyIndex,
  colorKeyOf,
  dependentFoldersOf,
  describeDanglingDependencies,
  describeRelation,
  initialDependencyRows,
  normalizeDependsOn,
  pickDepColor,
  resolveTintColorKey,
} from '../depGraph';
import { TreeNode } from '../types';

/**
 * "Depends on", as arithmetic.
 *
 * <p>Every case below is one the tree cannot be trusted to show correctly on its own: a target
 * that was deleted, a folder that was deleted under a dependent, two entities pointing at one
 * thing, a pair pointing at each other, and a palette with no free colour left. They are here
 * rather than in the provider's tests because none of them needs an editor to be true.</p>
 */

function folder(id: string, name: string): TreeNode {
  return { id, name, type: 'folder', parentId: null };
}

function entity(
  id: string,
  name: string,
  parentId: string | null,
  extra: { dependsOn?: string[]; depColor?: string } = {},
): TreeNode {
  return {
    id,
    name,
    type: 'entity',
    parentId,
    details: { id, name, isSshEnabled: false, ...extra },
  };
}

test('two entities depending on one target are both listed under it', () => {
  const nodes = [
    entity('vpn1', 'org meter', null, { depColor: 'depColor7' }),
    entity('ssh1', 'access-server', null, { dependsOn: ['vpn1'] }),
    entity('pw1', 'db password', null, { dependsOn: ['vpn1'] }),
    entity('loose', 'unrelated', null),
  ];
  const index = buildDependencyIndex(nodes);

  assert.deepEqual(
    index.dependentsOf('vpn1').map((n) => n.name),
    ['access-server', 'db password'],
  );
  assert.equal(index.hasDependents('vpn1'), true);
  assert.equal(index.hasDependents('loose'), false);
  assert.deepEqual(index.dependentsOf('loose'), []);
});

test('a duplicate id in one entity does not list it twice under the target', () => {
  const nodes = [entity('t', 'target', null), entity('a', 'a', null, { dependsOn: ['t', 't'] })];
  assert.equal(buildDependencyIndex(nodes).dependentsOf('t').length, 1);
});

test('a colour answers only while something actually depends on the target', () => {
  // The record keeps `depColor` after the last dependent goes away — deliberately, so
  // re-pointing at it later restores the colour it used to have. What it must not do is paint
  // a row, or occupy a slot the auto-pick could otherwise hand out.
  const orphaned = [entity('t', 'target', null, { depColor: 'depColor3' })];
  assert.equal(buildDependencyIndex(orphaned).colorOf('t'), undefined);
  assert.equal(buildDependencyIndex(orphaned).usedColors().size, 0);

  const live = [...orphaned, entity('a', 'a', null, { dependsOn: ['t'] })];
  assert.equal(buildDependencyIndex(live).colorOf('t'), 'depColor3');
  assert.deepEqual([...buildDependencyIndex(live).usedColors()], [['depColor3', 1]]);
});

test('a colour key this build does not know reads as absent, and does not reject the entity', () => {
  const nodes = [
    entity('t', 'target', null, { depColor: 'depColor99-from-the-future' }),
    entity('a', 'a', null, { dependsOn: ['t'] }),
  ];
  assert.equal(colorKeyOf(nodes[0]), undefined);
  assert.equal(buildDependencyIndex(nodes).colorOf('t'), undefined);
  // The relationship itself survives — only the paint is missing.
  assert.equal(buildDependencyIndex(nodes).hasDependents('t'), true);
});

test('a dependent borrows its target colour', () => {
  const nodes = [
    entity('vpn1', 'org meter', null, { depColor: 'depColor7' }),
    entity('ssh1', 'access-server', null, { dependsOn: ['vpn1'] }),
  ];
  assert.equal(resolveTintColorKey(nodes[1], buildDependencyIndex(nodes)), 'depColor7');
});

test('being a target wins over borrowing, and borrowing never runs the chain', () => {
  // `ssh1` is both: it depends on the VPN and the password depends on IT.
  const nodes = [
    entity('vpn1', 'org meter', null, { depColor: 'depColor7' }),
    entity('ssh1', 'access-server', null, { dependsOn: ['vpn1'], depColor: 'depColor2' }),
    entity('pw1', 'db password', null, { dependsOn: ['ssh1'] }),
  ];
  const index = buildDependencyIndex(nodes);

  // It shows the colour other rows match AGAINST it, not the one it matches against the VPN.
  assert.equal(resolveTintColorKey(nodes[1], index), 'depColor2');
  // And the password shows ssh1's colour, NOT the VPN's — the walk is one hop, deliberately.
  // Following the chain would paint an entity in the colour of something it never named, and
  // in a vault where everything eventually reaches one VPN it would paint everything alike.
  assert.equal(resolveTintColorKey(nodes[2], index), 'depColor2');
});

test('a dangling target is skipped when borrowing a colour, never thrown on', () => {
  const nodes = [
    entity('vpn1', 'org meter', null, { depColor: 'depColor5' }),
    entity('ssh1', 'access-server', null, { dependsOn: ['deleted-long-ago', 'vpn1'] }),
  ];
  assert.equal(resolveTintColorKey(nodes[1], buildDependencyIndex(nodes)), 'depColor5');
});

test('an entity in no relationship at all gets no tint', () => {
  const nodes = [entity('a', 'a', null)];
  assert.equal(resolveTintColorKey(nodes[0], buildDependencyIndex(nodes)), undefined);
});

test('a mutual pair resolves rather than looping', () => {
  const nodes = [
    entity('a', 'a', null, { dependsOn: ['b'], depColor: 'depColor1' }),
    entity('b', 'b', null, { dependsOn: ['a'], depColor: 'depColor4' }),
  ];
  const index = buildDependencyIndex(nodes);
  assert.equal(resolveTintColorKey(nodes[0], index), 'depColor1');
  assert.equal(resolveTintColorKey(nodes[1], index), 'depColor4');
});

test('a folder in the sub-tree lists ONLY the dependents, never its other contents', () => {
  const nodes = [
    folder('f-ssh', 'ssh connections'),
    entity('vpn1', 'org meter', null),
    entity('ssh1', 'access-server', 'f-ssh', { dependsOn: ['vpn1'] }),
    entity('ssh2', 'project-tools', 'f-ssh'),
    entity('ssh3', 'alert-center', 'f-ssh'),
  ];
  const groups = dependentFoldersOf(nodes, buildDependencyIndex(nodes), 'vpn1');

  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, 'ssh connections');
  assert.equal(groups[0].folderId, 'f-ssh');
  assert.deepEqual(
    groups[0].entities.map((n) => n.name),
    ['access-server'],
  );
});

test('the account root comes first, and named folders follow in name order', () => {
  const nodes = [
    folder('f-z', 'z folder'),
    folder('f-a', 'a folder'),
    entity('vpn1', 'org meter', null),
    entity('e1', 'in z', 'f-z', { dependsOn: ['vpn1'] }),
    entity('e2', 'in a', 'f-a', { dependsOn: ['vpn1'] }),
    entity('e3', 'at root', null, { dependsOn: ['vpn1'] }),
  ];
  const groups = dependentFoldersOf(nodes, buildDependencyIndex(nodes), 'vpn1');

  assert.deepEqual(
    groups.map((g) => g.name),
    [ROOT_GROUP_NAME, 'a folder', 'z folder'],
  );
  assert.equal(groups[0].folderId, null);
});

test('a dependent whose folder is gone is grouped at the root, not dropped', () => {
  // `parentId` is data, exactly as `dependsOn` is — it arrives by sync and by import. Losing
  // the row would hide the very entry somebody opened the sub-tree to find.
  const nodes = [
    entity('vpn1', 'org meter', null),
    entity('e1', 'orphan', 'folder-that-vanished', { dependsOn: ['vpn1'] }),
  ];
  const groups = dependentFoldersOf(nodes, buildDependencyIndex(nodes), 'vpn1');

  assert.equal(groups.length, 1);
  assert.equal(groups[0].folderId, null);
  assert.deepEqual(
    groups[0].entities.map((n) => n.name),
    ['orphan'],
  );
});

test('what the form posts is deduped, blank-free, and never this entity itself', () => {
  assert.deepEqual(normalizeDependsOn(['a', 'a', '', 'self', 'b'], 'self'), ['a', 'b']);
  assert.deepEqual(normalizeDependsOn([], 'self'), []);
});

test('a missing target is named rather than swept away', () => {
  const present = entity('t', 'target', null);
  const byId = (id: string): TreeNode | undefined => (id === 't' ? present : undefined);

  assert.equal(describeDanglingDependencies(entity('a', 'a', null, { dependsOn: ['t'] }), byId), '');
  assert.match(
    describeDanglingDependencies(entity('a', 'ssh box', null, { dependsOn: ['gone'] }), byId),
    /^1 dependency of "ssh box" no longer exists/,
  );
  assert.match(
    describeDanglingDependencies(entity('a', 'ssh box', null, { dependsOn: ['x', 'y'] }), byId),
    /^2 dependencies of "ssh box" no longer exist/,
  );
});

test('the form is offered every entity except the one being edited, grouped by folder', () => {
  const nodes = [
    folder('f-vpn', 'vpn'),
    folder('f-ssh', 'ssh connections'),
    folder('f-empty', 'scripts'),
    entity('v1', 'org meter', 'f-vpn'),
    entity('v2', 'org meter stage', 'f-vpn'),
    entity('s1', 'access-server', 'f-ssh'),
    entity('root1', 'loose entry', null),
  ];
  const groups = buildDependencyCandidates(nodes, 's1');

  // Root first, then folders by name. `scripts` is absent because it holds nothing, and
  // `ssh connections` is absent because the one thing it held is the entity being edited —
  // a folder is offered only when picking it would lead somewhere.
  assert.deepEqual(
    groups.map((g) => g.name),
    [ROOT_GROUP_NAME, 'vpn'],
  );
  assert.deepEqual(
    groups.find((g) => g.id === 'f-vpn')?.entities.map((e) => e.name),
    ['org meter', 'org meter stage'],
  );
  assert.deepEqual(
    groups.find((g) => g.id === '')?.entities.map((e) => e.name),
    ['loose entry'],
  );
});

test('the colour map covers live targets only, so a stale preference never pre-selects', () => {
  const nodes = [
    entity('v1', 'org meter', null, { depColor: 'depColor7' }),
    entity('v2', 'nobody needs me', null, { depColor: 'depColor3' }),
    entity('s1', 'access-server', null, { dependsOn: ['v1'] }),
  ];
  assert.deepEqual(buildDependencyColorMap(nodes), { v1: 'depColor7' });
});

test('a stored id whose target is gone opens as a MISSING row, never as a dropped one', () => {
  // Dropping it would be invisible and permanent: the next Save on any unrelated field would
  // write a `dependsOn` without it, deleting a relationship whose target may be one sync away.
  const folders = [{ id: 'f1', name: 'vpn', entities: [{ id: 'v1', name: 'org meter' }] }];
  const rows = initialDependencyRows(['v1', 'deleted'], folders, { v1: 'depColor7' });

  assert.deepEqual(rows, [
    { folderId: 'f1', targetId: 'v1', color: 'depColor7', missing: false },
    { folderId: '', targetId: 'deleted', color: '', missing: true },
  ]);
});

test('the badge counts what needs this entry, and names what this entry needs', () => {
  const nodes = [
    entity('v1', 'org meter', null, { depColor: 'depColor7' }),
    entity('s1', 'access-server', null, { dependsOn: ['v1'] }),
    entity('p1', 'db password', null, { dependsOn: ['v1'] }),
  ];
  const index = buildDependencyIndex(nodes);

  assert.deepEqual(describeRelation(nodes[0], index), {
    badge: '2',
    tooltip: 'Depended on by 2: access-server, db password',
  });
  assert.deepEqual(describeRelation(nodes[1], index), {
    badge: '●',
    tooltip: 'Depends on org meter',
  });
});

test('a badge never exceeds the two characters VS Code will render', () => {
  const target = entity('t', 'target', null);
  const many = Array.from({ length: 12 }, (_, i) => entity(`e${i}`, `e${i}`, null, { dependsOn: ['t'] }));
  const label = describeRelation(target, buildDependencyIndex([target, ...many]));
  assert.equal(label?.badge, '9+');
});

test('an entry whose every target is gone still says so, rather than going quiet', () => {
  const node = entity('a', 'ssh box', null, { dependsOn: ['gone1', 'gone2'] });
  const label = describeRelation(node, buildDependencyIndex([node]));
  assert.equal(label?.badge, '!');
  assert.match(label?.tooltip ?? '', /2 dependencies no longer exist/);
});

test('an entity in no relationship gets no decoration at all', () => {
  const node = entity('a', 'a', null);
  assert.equal(describeRelation(node, buildDependencyIndex([node])), undefined);
});

test('auto-pick hands out the first unused colour', () => {
  assert.equal(pickDepColor(new Map()), 'depColor1');
  assert.equal(pickDepColor(new Map<DepColorKey, number>([['depColor1', 1]])), 'depColor2');
  assert.equal(
    pickDepColor(
      new Map<DepColorKey, number>([
        ['depColor1', 1],
        ['depColor2', 1],
        ['depColor3', 1],
      ]),
    ),
    'depColor4',
  );
});

test('with all ten taken it hands out the least-used, and a tie goes to palette order', () => {
  const allOnce = new Map<DepColorKey, number>([
    ['depColor1', 1],
    ['depColor2', 1],
    ['depColor3', 1],
    ['depColor4', 1],
    ['depColor5', 1],
    ['depColor6', 1],
    ['depColor7', 1],
    ['depColor8', 1],
    ['depColor9', 1],
    ['depColor10', 1],
  ]);
  assert.equal(pickDepColor(allOnce), 'depColor1');

  const crowded = new Map(allOnce);
  crowded.set('depColor1', 4);
  crowded.set('depColor2', 3);
  assert.equal(pickDepColor(crowded), 'depColor3');
});
