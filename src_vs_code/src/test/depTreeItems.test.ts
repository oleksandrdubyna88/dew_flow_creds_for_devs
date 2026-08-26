import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { buildDependencyIndex } from '../depGraph';
import { TreeElement, TreeNode } from '../types';

/**
 * The rows of the "Depended on by" sub-tree (audit A3).
 *
 * <p>`depGraph.ts` decides what is under the twisty; these three functions decide what the rows
 * LOOK like, and each carries a distinction that is invisible until someone uses the tree.</p>
 *
 * <ul>
 *   <li>The root row's icon is <b>references</b>, not <b>history</b>. Both twisties sit side by
 *       side under the same entity, and one icon for two different things is a row people open
 *       expecting the other.</li>
 *   <li>The account-root group deliberately does NOT carry the folder `contextValue`, because
 *       "go to the original folder" has nowhere to go — a button that does nothing is worse than
 *       an absent one.</li>
 *   <li>A folder group keeps the GENERIC folder icon rather than the real folder's type icon, so
 *       a grouping inside the sub-tree never reads as the folder itself.</li>
 * </ul>
 *
 * <p>The index is the real `buildDependencyIndex`; only `vscode` is substituted, so the tint and
 * the counts come from the same code the tree runs.</p>
 */

type Items = typeof import('../depTreeItems');

interface Item {
  label: string;
  collapsibleState: number;
  id?: string;
  contextValue?: string;
  iconPath?: { id: string; color?: { id: string } };
  description?: string;
}

function world(): Items {
  return loadWithVscode<Items>('../depTreeItems', {
    TreeItem: class {
      id?: string;
      contextValue?: string;
      iconPath?: unknown;
      description?: string;
      constructor(
        readonly label: string,
        readonly collapsibleState: number,
      ) {}
    },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ThemeColor: class {
      constructor(readonly id: string) {}
    },
    ThemeIcon: class {
      constructor(
        readonly id: string,
        readonly color?: { id: string },
      ) {}
    },
  });
}

function entity(id: string, name: string, details: Record<string, unknown> = {}): TreeNode {
  return {
    id,
    name,
    type: 'entity',
    parentId: null,
    details: { id, name, kind: 'credential', isSshEnabled: false, ...details },
  } as unknown as TreeNode;
}

/** A target wearing a colour, plus two entities pointing at it. */
function vault(): TreeNode[] {
  return [
    entity('t1', 'prod-db', { depColor: 'depColor3' }),
    entity('d1', 'api', { dependsOn: ['t1'] }),
    entity('d2', 'worker', { dependsOn: ['t1'] }),
  ];
}

const indexOf = (nodes: TreeNode[]): ReturnType<typeof buildDependencyIndex> =>
  buildDependencyIndex(nodes);

test('the root row is collapsible, and says HOW MANY depend on this', () => {
  // The count is what makes the twisty worth opening — or worth leaving shut.
  const mod = world();

  const item = mod.dependentsItem('a1', vault()[0], indexOf(vault())) as unknown as Item;

  assert.equal(item.label, 'Depended on by');
  assert.equal(item.collapsibleState, 1);
  assert.equal(item.description, '2');
});

test('its icon is `references`, NOT `history` — the two twisties sit side by side', () => {
  // Under one entity there is a history twisty and this one. One icon for both is a row people
  // open expecting the other.
  const mod = world();

  const item = mod.dependentsItem('a1', vault()[0], indexOf(vault())) as unknown as Item;

  assert.equal(item.iconPath?.id, 'references');
  assert.notEqual(item.iconPath?.id, 'history');
});

test('the root row wears the relationship’s colour, so it leads to what is under it', () => {
  const mod = world();

  const item = mod.dependentsItem('a1', vault()[0], indexOf(vault())) as unknown as Item;

  assert.equal(item.iconPath?.color?.id, 'credSshManager.depColor3');
});

test('a target with no colour set gets an untinted row rather than a wrong one', () => {
  const mod = world();
  const nodes = [entity('t1', 'prod-db'), entity('d1', 'api', { dependsOn: ['t1'] })];

  const item = mod.dependentsItem('a1', nodes[0], indexOf(nodes)) as unknown as Item;

  assert.equal(item.iconPath?.color, undefined);
});

test('the row id names the account AND the entity — two accounts can hold the same id', () => {
  // A restore can legitimately put one entity id into two profiles; a shared row id would
  // collapse one when the other is expanded.
  const mod = world();

  const a = mod.dependentsItem('a1', vault()[0], indexOf(vault())) as unknown as Item;
  const b = mod.dependentsItem('a2', vault()[0], indexOf(vault())) as unknown as Item;

  assert.notEqual(a.id, b.id);
  assert.match(String(a.id), /a1/);
});

const folderElement = (folderId: string | null, name: string, count = 2): TreeElement =>
  ({
    kind: 'dependentsFolder',
    accountId: 'a1',
    targetId: 't1',
    folderId,
    name,
    entities: Array.from({ length: count }, (_, i) => entity(`e${i}`, `e${i}`)),
  }) as unknown as TreeElement;

test('a folder group carries the contextValue the "go to folder" button binds to', () => {
  const mod = world();

  const item = mod.dependentsFolderItem(folderElement('f1', 'Team') as never) as unknown as Item;

  assert.equal(item.contextValue, 'dependentsFolder');
  assert.equal(item.description, '2', 'and how many are inside');
});

test('the ACCOUNT ROOT group carries a different one — there is no folder to go to', () => {
  // A button that does nothing is worse than an absent button: it teaches people the feature
  // is broken rather than that it does not apply.
  const mod = world();

  const item = mod.dependentsFolderItem(folderElement(null, '(profile root)') as never) as unknown as Item;

  assert.equal(item.contextValue, 'dependentsRoot');
  assert.notEqual(item.contextValue, 'dependentsFolder');
});

test('a group keeps the GENERIC folder icon, so it never reads as the folder itself', () => {
  // These are groupings inside a sub-tree, not the folders they are named after. Wearing the
  // real folder's type icon would invite people to act on them as if they were.
  const mod = world();

  const item = mod.dependentsFolderItem(folderElement('f1', 'Databases') as never) as unknown as Item;

  assert.equal(item.iconPath?.id, 'folder');
});

test('the group id distinguishes the account, the target AND the folder', () => {
  // One target's groups must not collide with another's — the same folder can hold dependents
  // of several different targets.
  const mod = world();

  const first = mod.dependentsFolderItem(folderElement('f1', 'Team') as never) as unknown as Item;
  const root = mod.dependentsFolderItem(folderElement(null, 'root') as never) as unknown as Item;

  assert.notEqual(first.id, root.id);
  assert.match(String(root.id), /root/, 'the account root has a name of its own, not an empty slot');
});

test('the groups under a target carry the entities already chosen, not a promise to look later', () => {
  // The rows are built from data the caller already holds; a second lookup at expand time is
  // where a deleted entity turns into an empty folder nobody can explain.
  const mod = world();
  const nodes = vault();

  const groups = mod.dependentGroups(nodes, indexOf(nodes), 'a1', 't1');

  assert.equal(groups.length, 1, 'both dependents live at the account root');
  const group = groups[0] as Extract<TreeElement, { kind: 'dependentsFolder' }>;
  assert.deepEqual(group.entities.map((e) => e.name), ['api', 'worker']);
  assert.equal(group.targetId, 't1');
});

test('a target nothing depends on produces no groups at all', () => {
  const mod = world();
  const nodes = [entity('t1', 'lonely')];

  assert.deepEqual(mod.dependentGroups(nodes, indexOf(nodes), 'a1', 't1'), []);
});
