import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { ENTITY_KINDS, StoredAccount, TreeNode } from '../types';

/**
 * The QuickPicks and input boxes the tree's commands put in front of a person (audit A3).
 *
 * <p>Three of these carry a real decision rather than a prompt. The folder-type list is
 * DERIVED from `ENTITY_KINDS` because it used to be a hand-written copy, and adding a kind
 * left the picker offering the old five — so a folder of the new kind could not be created at
 * all. The move-target list excludes the moving node AND its descendants, which is the only
 * thing preventing a folder being made its own grandchild. And the account picker must not
 * ask a question with one possible answer.</p>
 */

type Dialogs = typeof import('../dialogs');

interface Picked {
  label: string;
  description?: string;
  value?: unknown;
  parentId?: string | null;
  account?: StoredAccount;
}

interface World {
  mod: Dialogs;
  /** Every QuickPick's items, in the order they were offered. */
  offered: Picked[][];
  inputs: Record<string, unknown>[];
  infos: string[];
}

function world(answer: (items: Picked[]) => Picked | undefined, inputAnswer?: string): World {
  const w: World = { mod: undefined as never, offered: [], inputs: [], infos: [] };
  w.mod = loadWithVscode<Dialogs>('../dialogs', {
    window: {
      showQuickPick: (items: Picked[]): Promise<Picked | undefined> => {
        w.offered.push(items);
        return Promise.resolve(answer(items));
      },
      showInputBox: (o: Record<string, unknown>): Promise<string | undefined> => {
        w.inputs.push(o);
        return Promise.resolve(inputAnswer);
      },
      showInformationMessage: (m: string): Promise<undefined> => {
        w.infos.push(m);
        return Promise.resolve(undefined);
      },
    },
  });
  return w;
}

const first = (items: Picked[]): Picked | undefined => items[0];
const none = (): undefined => undefined;
const byLabel = (needle: string) => (items: Picked[]): Picked | undefined =>
  items.find((i) => i.label.includes(needle));

test('a folder name is trimmed, so a trailing space never becomes part of it', async () => {
  const w = world(none, '  Production  ');

  assert.equal(await w.mod.promptFolderName(), 'Production');
});

test('cancelling the name box yields undefined, not an empty folder name', async () => {
  const w = world(none, undefined);

  assert.equal(await w.mod.promptFolderName(), undefined);
});

test('an all-whitespace name is REFUSED while typing, not accepted and trimmed to nothing', async () => {
  // The validator is the gate: without it the trim above would happily return ''.
  const w = world(none, 'x');
  await w.mod.promptFolderName();

  const validate = w.inputs[0].validateInput as (v: string) => string | undefined;
  assert.equal(typeof validate('   '), 'string', 'whitespace is rejected');
  assert.equal(validate('Production'), undefined, 'and a real name is not');
});

test('the box says Rename when it was given a current name, and New when it was not', async () => {
  const fresh = world(none, 'x');
  await fresh.mod.promptFolderName();
  assert.equal(fresh.inputs[0].title, 'New folder');

  const renaming = world(none, 'x');
  await renaming.mod.promptFolderName('Old');
  assert.equal(renaming.inputs[0].title, 'Rename folder');
  assert.equal(renaming.inputs[0].value, 'Old', 'and it starts from the name being changed');
});

test('EVERY entity kind can be picked as a folder type — the list is derived, not retyped', async () => {
  // The recorded defect: this was a hand-written copy of the kinds, so a newly added kind was
  // missing here and a folder of that kind simply could not be created.
  const w = world(first);
  await w.mod.pickFolderType();

  const values = w.offered[0].map((i) => i.value);
  for (const kind of ENTITY_KINDS) {
    assert.ok(values.includes(kind), `${kind} is offered`);
  }
  assert.ok(values.includes('project'), 'plus the project set');
  assert.ok(values.includes('any'), 'plus no restriction');
});

test('the type a folder already has is marked as current', async () => {
  const w = world(first);
  await w.mod.pickFolderType('ssh');

  const ssh = w.offered[0].find((i) => i.value === 'ssh');
  assert.match(String(ssh?.description), /\(current\)/);
});

test('with no type set, Credential is the one marked current', async () => {
  // The default has to be visible; an unmarked list makes "no type yet" look like a bug.
  const w = world(first);
  await w.mod.pickFolderType();

  const marked = w.offered[0].filter((i) => /\(current\)/.test(String(i.description)));
  assert.deepEqual(marked.map((i) => i.value), ['credential']);
});

test('cancelling the type picker changes nothing', async () => {
  const w = world(none);

  assert.equal(await w.mod.pickFolderType('ssh'), undefined);
});

function folder(id: string, name: string): TreeNode {
  return { id, name, type: 'folder' } as TreeNode;
}

/** A storage whose folder tree is a straight line: root → a → b. */
function storageOf(nodes: TreeNode[], descendants: Record<string, string[]> = {}): unknown {
  return {
    getNodes: (): TreeNode[] => nodes,
    isSelfOrDescendant: (_account: string, ancestor: string, candidate: string): boolean =>
      ancestor === candidate || (descendants[ancestor] ?? []).includes(candidate),
  };
}

test('a folder cannot be moved INTO itself or into its own descendant', async () => {
  // Without this the tree becomes a cycle: a folder that is its own grandparent, and every
  // walk over it never terminates.
  const moving = folder('a', 'Team');
  const storage = storageOf([moving, folder('b', 'Child'), folder('c', 'Elsewhere')], { a: ['b'] });
  const w = world(first);

  await w.mod.pickTargetFolder(storage as never, 'acct', moving);

  const labels = w.offered[0].map((i) => i.label);
  assert.ok(!labels.some((l) => l.includes('Team')), 'not itself');
  assert.ok(!labels.some((l) => l.includes('Child')), 'and not its own child');
  assert.ok(labels.some((l) => l.includes('Elsewhere')), 'an unrelated folder is still offered');
});

test('the profile root is always a target — otherwise a nested folder cannot be brought out', async () => {
  const w = world(byLabel('profile root'));
  const storage = storageOf([folder('b', 'Child')]);

  const picked = await w.mod.pickTargetFolder(storage as never, 'acct', folder('a', 'Team'));

  assert.deepEqual(picked, { parentId: null }, 'null is the root, and it is not "cancelled"');
});

test('cancelling a move is distinguishable from moving to the root', async () => {
  // Both would be falsy if this returned the parentId directly, and the entity would silently
  // jump to the root when the person pressed Escape.
  const w = world(none);
  const storage = storageOf([folder('b', 'Child')]);

  assert.equal(await w.mod.pickTargetFolder(storage as never, 'acct', folder('a', 'Team')), undefined);
});

test('an ENTITY is never offered as a move target — only a folder can contain things', async () => {
  // An entity cannot contain another entity; offering one would produce a move that has no
  // meaning and no way back.
  const w = world(first);
  const nodes = [folder('b', 'Child'), { id: 'e1', name: 'prod-db', type: 'entity' } as TreeNode];

  await w.mod.pickTargetFolder(storageOf(nodes) as never, 'acct', folder('a', 'Team'));

  assert.ok(!w.offered[0].some((i) => i.label.includes('prod-db')));
});

const account = (id: string, email: string): StoredAccount =>
  ({ accountId: id, email, provider: 'google' }) as StoredAccount;

test('with ONE account there is no question to ask', async () => {
  // A picker with a single option is a click the person did not need to make.
  const w = world(first);
  const storage = { getAccounts: (): StoredAccount[] => [account('a1', 'me@corp.com')] };

  const picked = await w.mod.pickAccount(storage as never, 'Choose');

  assert.equal(picked?.accountId, 'a1');
  assert.deepEqual(w.offered, [], 'nothing was shown');
});

test('with NO accounts it says what to do instead of showing an empty list', async () => {
  const w = world(first);

  const picked = await w.mod.pickAccount({ getAccounts: (): StoredAccount[] => [] } as never, 'Choose');

  assert.equal(picked, undefined);
  assert.match(w.infos[0], /Add Account/, 'and it names the command that fixes it');
  assert.deepEqual(w.offered, []);
});

test('with several accounts each is offered by email, and the provider is shown', async () => {
  const w = world(byLabel('work@corp.com'));
  const storage = {
    getAccounts: (): StoredAccount[] => [account('a1', 'me@corp.com'), account('a2', 'work@corp.com')],
  };

  const picked = await w.mod.pickAccount(storage as never, 'Choose');

  assert.equal(picked?.accountId, 'a2');
  assert.equal(w.offered[0][0].description, 'google', 'two accounts of one provider are told apart');
});
