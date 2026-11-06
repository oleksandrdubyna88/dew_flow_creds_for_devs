import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { entityContextValue, folderContextValue } from '../treeRowText';
import { ENTITY_KINDS, FolderType } from '../types';

/**
 * The arrow on a folder row, against the REAL manifest (S4 of `PLAN_terminal_folder_run.md`).
 *
 * <p>A menu `when` clause is data nothing compiles, and a clause that stops matching takes its item away with no error:
 * `:runall` on a row is exactly what would have hidden `+` and Move Up from every Terminal folder. So this evaluates every
 * clause the way VS Code does, over every value `folderContextValue` can produce. The evaluator THROWS on a form it cannot
 * read, because one that answered `true` would pass everything.</p>
 */

interface MenuItem {
  readonly command?: string;
  readonly submenu?: string;
  readonly when?: string;
  readonly group?: string;
}

const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf8')) as {
  contributes: { menus: Record<string, readonly MenuItem[]> };
};
const ITEMS = manifest.contributes.menus['view/item/context'];
const RUN_FOLDER = 'credSshManager.runFolder';
const ARROW_CLAUSE = 'view == credSshManagerView && viewItem =~ /^folder(:.*)?:runall$/';

type Reader = (match: RegExpExecArray, row: string) => boolean;

/** Every form a `when` in this menu is written in. The last two read their inside with `holds`. */
const FORMS: readonly (readonly [RegExp, Reader])[] = [
  [/^view == credSshManagerView$/, () => true],
  [/^viewItem == ([\w:-]+)$/, (m, row) => row === m[1]],
  [/^viewItem =~ \/(.+)\/$/, (m, row) => new RegExp(m[1]).test(row)],
  [/^!\((.+)\)$/, (m, row) => !holds(m[1], row)],
  [/^\((.+)\)$/, (m, row) => m[1].split(' || ').some((part) => holds(part, row))],
];

function holds(clause: string, row: string): boolean {
  for (const [form, read] of FORMS) {
    const match = form.exec(clause);
    if (match !== null) {
      return read(match, row);
    }
  }
  throw new Error(`the evaluator cannot read: ${clause}`);
}

function offered(item: MenuItem, row: string): boolean {
  return (item.when ?? '').split(' && ').every((clause) => holds(clause, row));
}

const label = (item: MenuItem): string => `${item.command ?? item.submenu ?? '?'} ${item.group ?? ''}`;

/** What a row is offered, sorted: `command group`, so an item moved to another group is a difference too. */
function menu(row: string): readonly string[] {
  return ITEMS.filter((item) => offered(item, row)).map(label).sort();
}

const BOTH = [false, true] as const;
const TYPES: readonly (FolderType | undefined)[] = [undefined, 'any', 'project', ...ENTITY_KINDS];

interface Flags {
  readonly trashed: boolean;
  readonly asksForPin: boolean;
  readonly locked: boolean;
}

const FLAGS: readonly Flags[] = BOTH.flatMap((trashed) => BOTH.flatMap((asksForPin) => BOTH.map((locked) => ({ trashed, asksForPin, locked }))));
const LIVE = FLAGS.filter((f) => !f.trashed);
const value = (f: Flags, type?: FolderType): string => folderContextValue(f.trashed, f.asksForPin, f.locked, type);

test('the_row_value_is_the_tokens_in_their_fixed_order_and_runall_is_last', () => {
  assert.equal(folderContextValue(false), 'folder', 'the older calls are byte-identical');
  assert.equal(folderContextValue(true), 'folder:trashed');
  assert.equal(folderContextValue(false, true), 'folder:asksforpin');
  assert.equal(folderContextValue(false, false, false, 'any'), 'folder');
  assert.equal(folderContextValue(false, false, false, 'terminal'), 'folder:runall');
  assert.equal(folderContextValue(false, true, false, 'terminal'), 'folder:asksforpin:runall');
  assert.equal(folderContextValue(false, false, true, 'terminal'), 'folder:locked:runall');
  assert.equal(folderContextValue(false, true, true, 'terminal'), 'folder:asksforpin:locked:runall');
  assert.equal(folderContextValue(true, false, false, 'terminal'), 'folder:trashed');
  assert.equal(folderContextValue(true, true, true, 'terminal'), 'folder:trashed:asksforpin:locked');
});

test('only_an_untrashed_terminal_folder_wears_runall', () => {
  assert.ok(TYPES.includes('terminal'), 'the type list holds the one type that matters');
  for (const f of FLAGS) {
    for (const type of TYPES) {
      const row = value(f, type);
      assert.equal(row.includes(':runall'), type === 'terminal' && !f.trashed, `${row} for type ${String(type)}`);
    }
  }
});

test('the_evaluator_reads_every_form_the_manifest_uses_and_throws_on_another', () => {
  assert.equal(holds('viewItem == folder', 'folder'), true);
  assert.equal(holds('viewItem == folder', 'folder:runall'), false, 'an exact match is exact');
  assert.equal(holds('viewItem =~ /^folder(:runall)?$/', 'folder:runall'), true);
  assert.equal(holds('!(viewItem =~ /:locked/)', 'folder:locked'), false);
  assert.equal(holds('(viewItem == a || viewItem == b)', 'b'), true);
  assert.equal(holds('(viewItem == a || viewItem == b)', 'c'), false);
  assert.throws(() => holds('config.something', 'folder'), /cannot read/);
  assert.throws(() => holds('view == anotherView', 'folder'), /cannot read/);
  for (const item of ITEMS) {
    assert.doesNotThrow(() => offered(item, 'folder'), `${label(item)}: ${item.when ?? '(no when)'}`);
  }
});

test('the_scan_is_looking_at_the_real_menus', () => {
  assert.ok(menu('folder').includes('credSshManager.addEntity inline@1'), 'a plain folder offers +, or the scan read nothing');
  assert.ok(menu('account').includes('credSshManager.addEntity 1_create@2'));
  assert.ok(menu('account').includes('credSshManager.addFolder 1_create@1'));
  assert.ok(menu('entity:cmd').includes('credSshManager.runCommand inline@0'));
  assert.deepEqual(menu('nothing-wears-this'), []);
});

test('a_terminal_folder_keeps_every_item_and_gains_only_the_arrow', () => {
  assert.equal(LIVE.length, 4);
  for (const f of LIVE) {
    const plain = value(f, 'any');
    const terminal = value(f, 'terminal');
    assert.equal(terminal, `${plain}:runall`);
    assert.deepEqual(menu(terminal), [...menu(plain), `${RUN_FOLDER} 2_actions@0`, `${RUN_FOLDER} inline@0`].sort(), terminal);
  }
});

test('a_plain_terminal_folder_shows_the_arrow_and_the_plus_side_by_side', () => {
  const items = ITEMS.filter((item) => item.command === RUN_FOLDER);
  assert.deepEqual(items.map((item) => item.group).sort(), ['2_actions@0', 'inline@0']);
  assert.ok(items.every((item) => item.when === ARROW_CLAUSE), 'the whole clause, both items');
  const row = menu('folder:runall');
  assert.ok(row.includes(`${RUN_FOLDER} inline@0`));
  assert.ok(row.includes('credSshManager.addEntity inline@1'));
});

test('a_trashed_terminal_folder_is_any_trashed_folder', () => {
  for (const f of FLAGS.filter((flags) => flags.trashed)) {
    assert.equal(value(f, 'terminal'), value(f, 'any'));
    assert.ok(!menu(value(f, 'terminal')).some((item) => item.startsWith(RUN_FOLDER)), value(f, 'terminal'));
  }
});

test('no_other_row_gets_the_arrow', () => {
  const terminalEntry = { id: 'e', name: 'e', isSshEnabled: false, isTerminal: true, command: 'x' };
  const entries = [entityContextValue(terminalEntry, false), entityContextValue(terminalEntry, false, false, true)];
  assert.ok(entries.every((row) => row.includes(':cmd')), 'a Terminal entry, live and trashed');
  const rows = [...entries, 'account', 'trashFolder', 'folder', 'folder:trashed', 'folder:asksforpin', 'folder:locked', 'dependentsFolder', 'revision:cmd', 'entity:cmd:runall', 'account:runall', 'folderish:runall'];
  for (const row of rows) {
    assert.ok(!menu(row).some((item) => item.startsWith(RUN_FOLDER)), row);
  }
});

test('runall_opens_no_clause_written_for_a_token', () => {
  const forTokens = ITEMS.filter((item) => /\/:(cmd|vpnrun)\//.test(item.when ?? ''));
  assert.ok(forTokens.some((item) => item.command === 'credSshManager.runCommand'), 'the scan found the arrow on an entry');
  assert.ok(forTokens.some((item) => item.command === 'credSshManager.startVpn'), 'and the VPN start');
  for (const f of LIVE) {
    const row = menu(value(f, 'terminal'));
    assert.deepEqual(forTokens.map(label).filter((item) => row.includes(item)), [], value(f, 'terminal'));
  }
});
