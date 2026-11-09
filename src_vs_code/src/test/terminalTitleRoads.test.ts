import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { EntityMetadata, TreeNode } from '../types';
import { arrowWorld } from './arrowWorld';
import { FOLDER_NODE, L, named, session, folderWorld, folderModals } from './folderWorld';
import { noteOurSend, ownerChain, rootTitle, startVpn, storageOf, terminalNamed, titleIn, world } from './vpnWorld';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';

/** Every folder this file makes is owned and claimed, and removed when the file's tests end. */
const scope = cleanupScope();
after(() => scope.close());

/**
 * One key for every entry terminal (`PLAN_terminal_titles_folder.md`, story S2): the green arrow, a VPN launcher, a folder run
 * row and the script run find and create their terminal under `entryTerminalTitle(key)`, and the key is read from the tree as
 * storage holds it NOW. Every expected title here is built by the real functions; the one old literal is C3's, on purpose.
 */

function folder(id: string, name: string, parentId: string | null = null): TreeNode {
  return { id, name, type: 'folder', folderType: 'terminal', parentId };
}

const OPS = folder('ops-id', 'ops');
const LINE = 'tmux attach -t alert';

function alert(): EntityMetadata {
  return { id: 'alert', name: 'alert', isSshEnabled: false, isTerminal: true, command: 'tmux attach', commandArgs: [{ value: '-t alert' }] };
}

// ---------- A: the green arrow ----------

test('the_arrow_titles_its_terminal_with_the_stored_parent_folder', async () => {
  const aw = arrowWorld({ parent: OPS }, [['alert', LINE]]);

  await aw.run(alert());

  assert.deepEqual(terminalNamed(aw, titleIn(OPS, 'alert')).sent, [LINE]);
  assert.equal(aw.terminals.length, 1);
});

test('an_element_with_an_old_parent_id_still_gives_the_current_folder', async () => {
  const aw = arrowWorld({ parent: OPS, elementParentId: 'moved-from' }, [['alert', LINE]]);

  await aw.run(alert());

  assert.deepEqual(aw.terminals.map((t) => t.name), [titleIn(OPS, 'alert')]);
});

test('a_root_entry_keeps_the_bare_title', async () => {
  const aw = arrowWorld({}, [['alert', LINE]]);

  await aw.run(alert());

  assert.deepEqual(aw.terminals.map((t) => t.name), [rootTitle('alert')]);
  assert.equal(aw.terminals.filter((t) => t.name.includes(' / ')).length, 0);
});

test('a_history_row_takes_the_live_entrys_folder', async () => {
  const aw = arrowWorld({ parent: OPS });
  const older: EntityMetadata = { ...alert(), name: 'older', command: 'x {name}', commandArgs: undefined };

  await aw.runRevision(alert(), { name: 'row-name', details: older });

  assert.deepEqual(aw.terminals.map((t) => t.name), [titleIn(OPS, 'older')]);
});

test('the_arrow_finds_a_terminal_titled_with_the_folder', async () => {
  const title = titleIn(OPS, 'alert');
  const aw = arrowWorld({ parent: OPS, preopened: [title] }, [['alert', LINE]]);

  await aw.run(alert());

  assert.equal(aw.terminals.length, 1, aw.terminals.map((t) => t.name).join(', '));
  assert.deepEqual(aw.terminals[0].sent, [LINE]);
  assert.ok(aw.warnings.some((text) => text.includes(`"${title}"`)), aw.warnings.join('\n'));
});

// ---------- B: the VPN launcher ----------

test('the_launcher_uses_its_own_folder_not_the_vpns', async () => {
  const w = world({});
  const X = folder('x', 'X');
  const Y = folder('y', 'Y');
  const nodes = ownerChain();

  const { started } = await startVpn(scope, w, nodes, { storage: storageOf(nodes, undefined, { start: X, vpn: Y }) });

  assert.equal(started, true, w.warnings.join('\n'));
  assert.equal(terminalNamed(w, titleIn(X, 'start openvpn')).sent.length, 1);
  assert.equal(w.terminals.filter((t) => t.name.includes('Y /')).length, 0, w.terminals.map((t) => t.name).join(', '));
});

test('the_arrow_and_the_launcher_share_one_terminal', async () => {
  const X = folder('x', 'X');
  const Y = folder('y', 'Y');
  const title = titleIn(X, 'start openvpn');
  const w = world({}, { preopened: [title] });
  const nodes = ownerChain();
  const shellEvents = (): void => {
    noteOurSend(w.live[title]);
    w.shell.end(w.live[title], w.shell.start(w.live[title]), 0);
  };

  const { started } = await startVpn(scope, w, nodes, { storage: storageOf(nodes, undefined, { start: X, vpn: Y }), shellEvents });

  assert.equal(started, true, w.warnings.join('\n'));
  assert.equal(w.terminals.filter((t) => t.name === title).length, 1);
  assert.equal(terminalNamed(w, title).sent.length, 1);
});

// ---------- C: the folder run ----------

test('rows_run_under_the_folders_title', async () => {
  const w = folderWorld([session('a'), session('b')]);

  await w.click();

  assert.deepEqual(named(w, 'a').map((t) => t.sent), [[L('a')]]);
  assert.deepEqual(named(w, 'b').map((t) => t.sent), [[L('b')]]);
  assert.match(w.infos[0], /^Typed 2 of 2 /);
});

test('the_arrows_terminal_is_closed_by_close_open_terminals_and_run', async () => {
  const w = folderWorld([session('a')], { trusted: [['a', L('a')]], modal: 'last' });
  await w.arrow('a');

  await w.click();

  assert.ok(folderModals(w)[0].includes(`Terminal already open:\n1. a: ${L('a')}`), folderModals(w)[0]);
  const both = named(w, 'a');
  assert.equal(both.length, 2);
  assert.equal(both[0].disposed, 1, 'the arrow\'s terminal was closed');
  assert.deepEqual(both[1].sent, [L('a')]);
  assert.deepEqual(w.infos, ['Typed 1 of 1 in "claude sessions". Typed: a.']);
});

test('an_old_title_is_not_counted_as_open', async () => {
  const w = folderWorld([session('a')], { preopened: ['CredsForDevs: a'] });

  await w.click();

  assert.ok(!folderModals(w)[0].includes('Terminal already open'), folderModals(w)[0]);
  const old = w.terminals.find((t) => t.name === 'CredsForDevs: a');
  assert.deepEqual([old?.sent, old?.disposed], [[], 0]);
  assert.deepEqual(named(w, 'a').map((t) => t.sent), [[L('a')]]);
  assert.match(w.infos[0], /^Typed 1 of 1 /);
});

test('a_folder_name_with_a_tab_is_escaped_in_the_title', async () => {
  const w = folderWorld([session('a')], { folder: { name: 'a\tb' } });

  await w.click();

  assert.deepEqual(w.terminals.map((t) => t.name), [titleIn({ ...FOLDER_NODE, name: 'a\tb' }, 'a')]);
  assert.match(w.infos[0], /^Typed 1 of 1 /);
});

// ---------- D: the script run ----------

function filesUnder(dir: string): string[] {
  return fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name));
}

test('the_script_terminal_carries_the_folder', async () => {
  const dir = ownedDir(scope, 'script');
  const title = titleIn(OPS, 'sc');
  const aw = arrowWorld({ parent: OPS, storageDir: dir, preopened: [title] });
  const script: EntityMetadata = { id: 's1', name: 'sc', isSshEnabled: false, isScript: true, script: 'echo hi', scriptLanguage: 'bash' };

  await aw.runScript(script);

  const both = aw.terminals.filter((t) => t.name === title);
  assert.equal(both.length, 2, aw.terminals.map((t) => t.name).join(', '));
  assert.equal(both[0].disposed, 1, 'fresh disposes the one of the same title');
  assert.equal(both[1].sent.length, 1);
  assert.match(both[1].sent[0], /^bash /);
  assert.deepEqual(filesUnder(dir).map((f) => path.basename(f)), ['script-s1.sh']);
  assert.ok(both[1].sent[0].includes(dir), both[1].sent[0]);
});
