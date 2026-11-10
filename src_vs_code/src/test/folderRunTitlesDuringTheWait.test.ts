import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TreeNode } from '../types';
import { FOLDER, FolderWorld, L, T, choose, clickAndWait, held, modalNumber, needing, session, step } from './folderWorld';
import { FakeTerminal, titleIn } from './vpnWorld';

/**
 * The folder run reads each row's key AFTER its last await (`PLAN_terminal_titles_folder.md`, story S5, §Design "The folder
 * run's timing contract"): what the tree says when the run types, not what it said when the modal was built. Every change
 * here happens while the modal (or, in the first test, the chain's own dialog) is held, and every rename or move REPLACES
 * the node object in `w.nodes`, as storage does: the run captured the old object, so an edit in place would pass on a run
 * that never re-reads anything. Titles come from the real functions through `titleIn`.
 */

const RENAMED = 'renamed sessions';
const BOTH = (typed: string, left: string): string => `Typed 1 of 2 in "${FOLDER}". Left alone, terminal already open: ${left}. Typed: ${typed}.`;

function replace(w: FolderWorld, id: string, patch: Partial<TreeNode>): TreeNode {
  const at = w.nodes.findIndex((n) => n.id === id);
  w.nodes[at] = { ...w.nodes[at], ...patch };
  return w.nodes[at];
}

function nodeOf(w: FolderWorld, id: string): TreeNode {
  const node = w.nodes.find((n) => n.id === id);
  assert.ok(node, `the tree holds ${id}`);
  return node;
}

function under(w: FolderWorld, title: string): FakeTerminal[] {
  return w.terminals.filter((t) => t.name === title);
}

/** Click, hold the modal, run `change` while it sits, then answer with `button`. */
async function duringTheModal(w: FolderWorld, button: 'first' | 'last', change: () => void | Promise<void>): Promise<void> {
  const { done, modal } = await clickAndWait(w);
  await change();
  choose(modal, button);
  await done;
}

// ---------- a rename during the wait ----------

test('a_folder_renamed_during_the_wait_is_typed_under_its_new_name', async () => {
  const w = held([needing('a', 'dep')], { outside: [step('dep')], holdDialogs: /^(Run the entries|Before )/ });
  const done = w.click();
  choose(await modalNumber(w, 1), 'first');
  const chain = await modalNumber(w, 2);

  const renamed = replace(w, 'f', { name: RENAMED });
  choose(chain, 'first');
  await done;

  assert.deepEqual(under(w, titleIn(renamed, 'a')).map((t) => t.sent), [[L('a')]], w.terminals.map((t) => t.name).join(', '));
  assert.deepEqual(under(w, T('a')), [], 'nothing under the old title');
});

for (const button of ['first', 'last'] as const) {
  test(`a_terminal_the_arrow_opened_under_the_new_name_during_the_wait_is_left_alone_${button === 'first' ? 'under_run' : 'under_close'}`, async () => {
    const preopened = button === 'last' ? [T('b')] : [];
    const w = held([session('a'), session('b')], { trusted: [['a', L('a')]], preopened });
    let renamed: TreeNode | undefined;

    await duringTheModal(w, button, async () => {
      renamed = replace(w, 'f', { name: RENAMED });
      await w.arrow('a');
    });

    const ofA = w.terminals.filter((t) => t.name.endsWith(' / a'));
    assert.deepEqual(ofA.map((t) => [t.name, t.sent, t.disposed]), [[titleIn(renamed, 'a'), [L('a')], 0]], 'one terminal for a: the arrow\'s');
    assert.deepEqual(under(w, titleIn(renamed, 'b')).map((t) => t.sent), [[L('b')]]);
    assert.deepEqual(under(w, T('b')).map((t) => t.disposed), button === 'last' ? [1] : []);
    assert.deepEqual(w.infos, [BOTH('b', 'a')]);
  });
}

test('an_old_title_terminal_the_modal_listed_is_closed_by_object_after_a_rename', async () => {
  const w = held([session('o')], { preopened: [T('o')] });
  let renamed: TreeNode | undefined;

  await duringTheModal(w, 'first', () => {
    renamed = replace(w, 'f', { name: RENAMED });
  });

  assert.deepEqual(under(w, T('o')).map((t) => [t.sent, t.disposed]), [[[], 1]]);
  assert.deepEqual(under(w, titleIn(renamed, 'o')).map((t) => [t.sent, t.disposed]), [[[L('o')], 0]]);
  assert.deepEqual(w.infos, [`Typed 1 of 1 in "${FOLDER}". Typed: o.`]);
});

test('under_run_an_old_title_terminal_still_live_is_left_alone_after_a_rename', async () => {
  const w = held([session('a'), session('b')], { preopened: [T('a')] });
  let renamed: TreeNode | undefined;

  await duringTheModal(w, 'first', () => {
    renamed = replace(w, 'f', { name: RENAMED });
  });

  assert.deepEqual(under(w, T('a')).map((t) => [t.sent, t.disposed]), [[[], 0]]);
  assert.deepEqual(under(w, titleIn(renamed, 'a')), [], 'a is left alone, nothing is typed for it');
  assert.deepEqual(under(w, titleIn(renamed, 'b')).map((t) => t.sent), [[L('b')]]);
  assert.deepEqual(w.infos, [BOTH('b', 'a')]);
  assert.doesNotMatch(w.infos.join('\n'), /closed while the question was open/);
});

// ---------- a move or a deletion during the wait ----------

test('an_entry_moved_out_during_the_wait_is_typed_under_its_new_parent', async () => {
  const w = held([session('a')]);
  const g: TreeNode = { id: 'g', name: 'g', type: 'folder', folderType: 'terminal', parentId: null };

  await duringTheModal(w, 'first', () => {
    w.nodes.push(g);
    replace(w, 'a', { parentId: 'g' });
  });

  assert.deepEqual(w.terminals.map((t) => [t.name, t.sent]), [[titleIn(g, 'a'), [L('a')]]]);
});

test('an_entry_trashed_during_the_wait_is_typed_under_the_trash', async () => {
  const w = held([session('a')], { trash: true });

  await duringTheModal(w, 'first', () => void replace(w, 'a', { parentId: 'trash' }));

  assert.deepEqual(w.terminals.map((t) => [t.name, t.sent]), [[titleIn(nodeOf(w, 'trash'), 'a'), [L('a')]]]);
  assert.match(w.infos[0], /^Typed 1 of 1 /);
});

test('a_folder_trashed_during_the_wait_keeps_its_title_and_runs', async () => {
  const w = held([session('a')], { trash: true });

  await duringTheModal(w, 'first', () => void replace(w, 'f', { parentId: 'trash' }));

  assert.deepEqual(w.terminals.map((t) => [t.name, t.sent]), [[T('a'), [L('a')]]]);
  assert.match(w.infos[0], /^Typed 1 of 1 /);
});

test('a_folder_removed_for_good_during_the_wait_types_under_the_bare_title', async () => {
  const w = held([session('a')]);

  await duringTheModal(w, 'first', () => void w.nodes.splice(0, 1));

  assert.deepEqual(w.terminals.map((t) => [t.name, t.sent]), [[titleIn(undefined, 'a'), [L('a')]]]);
  assert.match(w.infos[0], /^Typed 1 of 1 /);
});

test('an_entry_removed_for_good_during_the_wait_is_still_typed_under_the_bare_title', async () => {
  const w = held([session('a')]);

  await duringTheModal(w, 'first', () => void w.nodes.splice(w.nodes.findIndex((n) => n.id === 'a'), 1));

  assert.deepEqual(w.terminals.map((t) => [t.name, t.sent]), [[titleIn(undefined, 'a'), [L('a')]]]);
  assert.match(w.infos[0], /^Typed 1 of 1 /);
});
