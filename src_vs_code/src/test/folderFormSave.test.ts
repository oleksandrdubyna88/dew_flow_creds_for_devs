import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEP_COLOR_KEYS, DepColorKey } from '../depColors';
import { ensureFolderColor, pickFolderColor } from '../folderColors';
import type { FolderFormOptions, FolderFormValues } from '../folderFormPanel';
import { TreeNode, isTreeNode } from '../types';
import { FolderColorFake, folderColorStorage } from './folderColorStorage';
import { loadWithVscode } from './vscodeStub';

/**
 * The folder form's SAVE, driven through the real `editNode` with a folder node (E2.S1, D1-D2).
 *
 * <p>The form is a promise the test holds: `showFolderForm` is replaced by a fake that records the
 * options it was opened with and waits for the test to answer. Between the open and the answer the test
 * changes the stored folder, as another window or the first terminal's auto-pick would, and the save must
 * decide from the folder AS IT IS THEN. The storage is the E1 fake, which evaluates a function patch
 * against the list at the moment the turn runs; "the save's change" is its entry in `fake.written`.</p>
 */

const A = 'acc-a';
const K = DEP_COLOR_KEYS;

/** A fixture that is a real node: it passes the same guard storage reads through. */
function node(fields: Partial<TreeNode> & Pick<TreeNode, 'id' | 'type'>): TreeNode {
  const built: TreeNode = { name: fields.id, parentId: null, ...fields };
  assert.ok(isTreeNode(built), `the fixture ${fields.id} is not a valid node`);
  return built;
}
const folder = (folderColor?: string): TreeNode => node({ id: 'f', type: 'folder', folderColor });
const entry = (): TreeNode =>
  node({ id: 'e', type: 'entity', parentId: 'f', details: { id: 'e', name: 'e', isSshEnabled: false } });

const NO_OP = (): undefined => undefined;
const STUB = {
  window: { createOutputChannel: () => ({ appendLine: NO_OP, show: NO_OP, dispose: NO_OP }) },
  workspace: {
    workspaceFolders: undefined,
    getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
    onDidChangeConfiguration: () => ({ dispose: NO_OP }),
  },
  Uri: { file: (path: string): object => ({ fsPath: path }), joinPath: (): object => ({}) },
  ViewColumn: { Active: 1 },
  EventEmitter: class {
    event = NO_OP;
    fire(): void {}
  },
  ThemeIcon: class {},
  ThemeColor: class {},
  TreeItem: class {},
  commands: { registerCommand: () => ({ dispose: NO_OP }) },
  env: { clipboard: {}, remoteName: undefined },
};

interface World {
  readonly fake: FolderColorFake;
  /** The options the fake form was opened with. */
  readonly opened: FolderFormOptions[];
  /** Opens the form on folder `f` of the current list; `answer` closes it with a save. */
  open(): Promise<void>;
  answer(values: FolderFormValues): void;
}

function world(...seed: TreeNode[]): World {
  const fake = folderColorStorage({ [A]: seed });
  const opened: FolderFormOptions[] = [];
  const answers: ((values: FolderFormValues | undefined) => void)[] = [];
  const mod = loadWithVscode<typeof import('../entityEditCommands')>('../entityEditCommands', STUB, {
    './folderFormPanel': {
      showFolderForm: (options: FolderFormOptions): Promise<FolderFormValues | undefined> =>
        new Promise((resolve) => {
          opened.push(options);
          answers.push(resolve);
        }),
    },
  });
  return {
    fake,
    opened,
    open: () => {
      const now = fake.getNode(A, 'f');
      assert.ok(now !== undefined, 'the folder is not in the list');
      return mod.editNode(A, now, fake as never, NO_OP);
    },
    answer: (values) => answers[answers.length - 1](values),
  };
}

const wears = (w: World, id = 'f'): string | undefined => w.fake.getNode(A, id)?.folderColor;
/** The save's change: the entry of the last write, which must be the one function patch on the folder. */
function lastChange(w: World): { byFunction: boolean; change: Partial<TreeNode> } {
  const last = w.fake.written[w.fake.written.length - 1];
  assert.ok(last !== undefined && last.change !== undefined, 'nothing was written');
  return { byFunction: last.byFunction, change: last.change };
}
const hasColour = (change: Partial<TreeNode>): boolean => Object.hasOwn(change, 'folderColor');

test('a_rename_keeps_a_colour_another_window_wrote_while_the_form_was_open', async () => {
  const w = world(folder(K[0]));
  const editing = w.open();
  w.fake.put(A, folder(K[1]));

  w.answer({ name: 'Renamed' });
  await editing;

  assert.equal(w.fake.getNode(A, 'f')?.name, 'Renamed');
  assert.equal(wears(w), K[1], 'the colour the other window wrote was overwritten');
  const { byFunction, change } = lastChange(w);
  assert.equal(byFunction, true, 'the save is not a function patch');
  assert.equal(hasColour(change), false, 'a save with no choice carried a folderColor');
});

test('a_save_without_a_choice_keeps_the_colour_the_auto_pick_wrote_meanwhile', async () => {
  const w = world(folder(), entry());
  const editing = w.open();
  assert.ok(w.opened[0].suggestedColor !== undefined, 'the form was not offered a suggestion');
  const picked = await ensureFolderColor(w.fake, A, 'e');
  assert.ok(picked !== undefined, 'Given: the auto-pick wrote a colour');

  w.answer({ name: 'Renamed' });
  await editing;

  assert.equal(wears(w), picked);
  assert.equal(w.fake.getNode(A, 'f')?.name, 'Renamed', 'positive tail: the rename itself landed');
});

test('an_explicit_choice_wins_over_the_auto_pick_in_both_orders', async () => {
  const picked = pickFolderColor([folder()]);
  const chosen: DepColorKey = K.find((key) => key !== picked) ?? K[1];

  // Order 1: the auto-pick wrote while the form was open; the save then chooses.
  const one = world(folder(), entry());
  const editing = one.open();
  assert.equal(await ensureFolderColor(one.fake, A, 'e'), picked, 'Given: the auto-pick wrote the pick');
  one.answer({ name: 'f', folderColor: chosen });
  await editing;
  assert.equal(wears(one), chosen, 'order 1: the choice lost to the auto-pick');

  // Order 2: the auto-pick starts inside the save's turn and queues behind it.
  const two = world(folder(), entry());
  let racing: Promise<DepColorKey | undefined> | undefined;
  const editing2 = two.open();
  two.fake.beforePatch(() => {
    racing = ensureFolderColor(two.fake, A, 'e');
  });
  two.answer({ name: 'f', folderColor: chosen });
  await editing2;
  assert.ok(racing !== undefined, 'Given: the auto-pick started');
  assert.equal(await racing, chosen, 'order 2: the auto-pick did not report the chosen key');
  assert.equal(wears(two), chosen, 'order 2: the choice lost to the auto-pick');
  assert.deepEqual(lastChange(two).change, {}, "the auto-pick's change is not empty");
});

test('a_choice_equal_to_the_stored_key_adds_nothing_to_the_write', async () => {
  const same = world(folder(K[2]));
  const first = same.open();
  same.answer({ name: 'x', folderColor: K[2] });
  await first;
  assert.equal(same.fake.written.length, 1, 'the save made more than one updateNodeFields call');
  assert.equal(hasColour(lastChange(same).change), false, 'a choice equal to the stored key was written');

  // The stored key changed while the form was open; the choice equals the NEW one.
  const moved = world(folder(K[2]));
  const second = moved.open();
  moved.fake.put(A, folder(K[4]));
  moved.answer({ name: 'x', folderColor: K[4] });
  await second;
  assert.equal(hasColour(lastChange(moved).change), false, 'a choice equal to the key as it is then was written');
  assert.equal(wears(moved), K[4]);

  // Positive tail: a different choice is written, in the change and in storage.
  const other = world(folder(K[2]));
  const third = other.open();
  other.answer({ name: 'x', folderColor: K[5] });
  await third;
  assert.equal(lastChange(other).change.folderColor, K[5]);
  assert.equal(wears(other), K[5]);
});

test('the_form_is_given_the_marked_key_and_the_suggestion', async () => {
  const coloured = world(folder(K[3]));
  void coloured.open();
  assert.equal(coloured.opened[0].folderColor, K[3]);
  assert.equal(coloured.opened[0].suggestedColor, undefined, 'a coloured folder was offered a suggestion');

  const plain = world(folder(), entry());
  void plain.open();
  assert.equal(plain.opened[0].folderColor, undefined);
  assert.equal(plain.opened[0].suggestedColor, pickFolderColor(plain.fake.getNodes(A)));
  assert.ok(plain.opened[0].suggestedColor !== undefined, 'the suggestion is missing');
});
