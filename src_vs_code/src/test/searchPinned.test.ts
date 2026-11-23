import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import type { ThemeIcon, Uri } from 'vscode';
import {
  pinnedSearchState,
  pinSearch,
  SEARCH_ACTIVE_CONTEXT,
  SEARCH_ACTIVE_ROW_CONTEXT,
  SearchRowLike,
  SetContext,
} from '../searchPin';
import { loadEachWithVscode, StubEventEmitter } from './vscodeStub';

/**
 * The search stays reachable while the tree scrolls, and it is green (owner, 2026-11-18).
 *
 * <p>A tree cannot pin a row, so "pinned" is the view's title bar — a green magnifier, and a
 * Clear Filter beside it while a filter is on — plus `TreeView.message`, the line above the
 * tree that does not scroll, which repeats what the filter row says. The row itself stays, with
 * a green icon and a green label. Every assertion here reads the row from `searchRowItem`, the
 * one builder, rather than from a hand-written fixture: the banner exists to say what the row
 * says, and a fixture would let the two drift. The one exception is the hand-built rows test,
 * which covers what the builder never produces.</p>
 */

class FakeThemeColor {
  constructor(readonly id: string) {}
}
class FakeThemeIcon {
  constructor(
    readonly id: string,
    readonly color?: FakeThemeColor,
  ) {}
}
class FakeTreeItem {
  id?: string;
  description?: string;
  contextValue?: string;
  iconPath?: FakeThemeIcon;
  tooltip?: string;
  command?: unknown;
  resourceUri?: FakeUri;
  constructor(
    readonly label: string,
    readonly collapsibleState?: number,
  ) {}
}
class FakeFileDecoration {
  constructor(
    readonly badge?: string,
    readonly tooltip?: string,
    readonly color?: FakeThemeColor,
  ) {}
}
/** A whole `vscode.Uri`, so a foreign address can be handed to the provider without a cast. */
class FakeUri implements Uri {
  readonly authority = '';
  readonly query = '';
  readonly fragment = '';
  constructor(
    readonly scheme: string,
    readonly path: string,
  ) {}
  get fsPath(): string {
    return this.path;
  }
  with(): Uri {
    return this;
  }
  toString(): string {
    return `${this.scheme}:${this.path}`;
  }
  toJSON(): unknown {
    return { scheme: this.scheme, path: this.path };
  }
}

const stub = {
  ThemeColor: FakeThemeColor,
  ThemeIcon: FakeThemeIcon,
  TreeItem: FakeTreeItem,
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  FileDecoration: FakeFileDecoration,
  EventEmitter: StubEventEmitter,
  Uri: { from: (parts: { scheme: string; path: string }): FakeUri => new FakeUri(parts.scheme, parts.path) },
};

const [rowModule, accentModule, decorationsModule] = loadEachWithVscode(
  ['../searchRowItem', '../searchAccent', '../depDecorations'],
  stub,
) as [typeof import('../searchRowItem'), typeof import('../searchAccent'), typeof import('../depDecorations')];

const { searchRowItem } = rowModule;
const { SEARCH_ACCENT_COLOR_ID, searchRowUri, searchRowDecoration } = accentModule;
const { DepDecorationProvider, depUri } = decorationsModule;

type Row = ReturnType<typeof searchRowItem>;

const idleRow = (): Row => searchRowItem('', [], () => 0);
const filteringRow = (query: string, found: number): Row => searchRowItem(query, [query], () => found);

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
  contributes: {
    colors: { id: string; defaults: Record<string, string> }[];
    commands: { command: string; icon?: string | { light: string; dark: string } }[];
    menus: Record<string, { command?: string; when?: string; group?: string }[]>;
  };
};

// Read through helpers: the lint cap on complexity counts every `?.` in a test body.
const themeIcon = (row: Row): ThemeIcon | undefined => {
  const icon = row.iconPath;
  return typeof icon === 'object' && 'id' in icon ? icon : undefined;
};
/** `ThemeColor` declares no `id` in its typings, though the stub (and VS Code) carry one. */
const colorId = (color: object | undefined): unknown => (color !== undefined && 'id' in color ? color.id : undefined);
const iconColorId = (row: Row): unknown => colorId(themeIcon(row)?.color);
const iconGlyph = (row: Row): string | undefined => themeIcon(row)?.id;
const rowStates = (): [string, Row][] => [
  ['idle', idleRow()],
  ['filtering', filteringRow('prod', 4)],
];

test('the magnifier is painted the search green, idle and while filtering', () => {
  for (const [state, row] of rowStates()) {
    assert.equal(iconColorId(row), SEARCH_ACCENT_COLOR_ID, `${state}: the icon is not green`);
  }
  // The two states keep their own glyphs — only the colour is new.
  assert.equal(iconGlyph(idleRow()), 'search');
  assert.equal(iconGlyph(filteringRow('prod', 4)), 'filter-filled');
});

test('the word Search is green: the row carries the address the decoration answers for', () => {
  for (const [state, row] of rowStates()) {
    assert.ok(row.resourceUri !== undefined, `${state}: no address, so nothing can colour the label`);
    assert.equal(colorId(searchRowDecoration(row.resourceUri)?.color), SEARCH_ACCENT_COLOR_ID);
  }
});

test('the one decoration provider paints the search row and still refuses everything not ours', () => {
  const asked: string[] = [];
  const provider = new DepDecorationProvider({
    tintColorKey: () => {
      asked.push('tint');
      return undefined;
    },
    relationLabel: () => {
      asked.push('label');
      return undefined;
    },
  });

  assert.equal(colorId(provider.provideFileDecoration(searchRowUri())?.color), SEARCH_ACCENT_COLOR_ID);
  assert.deepEqual(asked, [], 'the search row is not an entity — the dependency graph must not be asked about it');
  assert.equal(provider.provideFileDecoration(new FakeUri('file', '/src/index.ts')), undefined);
  assert.equal(provider.provideFileDecoration(depUri('a1', 'e1')), undefined, 'an entity row without a relation stays uncoloured');
  assert.equal(searchRowDecoration(depUri('a1', 'e1')), undefined, 'the search green must not spill onto entity rows');
});

test('an idle row says nothing and is not active', () => {
  assert.deepEqual(pinnedSearchState(idleRow()), { message: '', active: false });
});

test('a filtering row is repeated as it reads, with its count', () => {
  assert.deepEqual(pinnedSearchState(filteringRow('prod', 4)), { message: 'Search: prod — 4 found', active: true });
  assert.deepEqual(pinnedSearchState(filteringRow('nope', 0)), {
    message: 'Search: nope — nothing matches',
    active: true,
  });
});

test('the unknown-filter note arrives in the banner exactly as the row carries it', () => {
  const state = pinnedSearchState(searchRowItem('has:ttop', [], () => 0, ['has:ttop']));
  assert.deepEqual(state, {
    message: 'Search: has:ttop — nothing matches  ·  unknown filter: has:ttop',
    active: true,
  });
});

test('hand-built rows: an object label, a description that is not text, a contextValue that is not exactly ours', () => {
  const objectLabel: SearchRowLike = { label: { label: 'Search: x' }, contextValue: SEARCH_ACTIVE_ROW_CONTEXT, description: '1 found' };
  assert.deepEqual(pinnedSearchState(objectLabel), { message: 'Search: x — 1 found', active: true });

  for (const description of [true, undefined, ''] as const) {
    const row: SearchRowLike = { label: 'Search: x', contextValue: SEARCH_ACTIVE_ROW_CONTEXT, description };
    assert.deepEqual(pinnedSearchState(row), { message: 'Search: x', active: true }, `description ${String(description)}`);
  }

  for (const contextValue of ['credSearch', undefined, `${SEARCH_ACTIVE_ROW_CONTEXT}X`] as const) {
    const row: SearchRowLike = { label: 'Search: x', description: '1 found', contextValue };
    assert.deepEqual(pinnedSearchState(row), { message: '', active: false }, `contextValue ${String(contextValue)}`);
  }
});

/** One pin over a real emitter: the row the tree answers, a view that counts its writes, a recorder for setContext. */
function harness(first: SearchRowLike | (() => SearchRowLike)): {
  changes: StubEventEmitter<void>;
  view: { message?: string };
  writes: string[];
  calls: [string, boolean][];
  setRow: (next: SearchRowLike | (() => SearchRowLike)) => void;
  pin: { dispose(): void };
} {
  let answer = first;
  const changes = new StubEventEmitter<void>();
  const writes: string[] = [];
  const calls: [string, boolean][] = [];
  const view: { message?: string } = {};
  Object.defineProperty(view, 'message', {
    get: () => writes.at(-1),
    set: (value: string) => void writes.push(value),
    enumerable: true,
  });
  const record: SetContext = (key, value) => void calls.push([key, value]);
  const pin = pinSearch(
    view,
    { onDidChangeTreeData: changes.event, getTreeItem: () => (typeof answer === 'function' ? answer() : answer) },
    record,
  );
  return { changes, view, writes, calls, setRow: (next) => void (answer = next), pin };
}

test('wired on an idle tree, it says so once — empty banner, context false — and listens once', () => {
  const { view, writes, calls, changes } = harness(idleRow());
  assert.deepEqual(writes, ['']);
  assert.equal(view.message, '');
  assert.deepEqual(calls, [[SEARCH_ACTIVE_CONTEXT, false]]);
  assert.equal(changes.listenerCount, 1);
});

test('wired on a tree that is ALREADY filtering, the banner and the Clear key are right before any event', () => {
  const { view, calls } = harness(filteringRow('prod', 4));
  assert.equal(view.message, 'Search: prod — 4 found');
  assert.deepEqual(calls, [[SEARCH_ACTIVE_CONTEXT, true]]);
});

test('the banner and the Clear key follow the row on and off', () => {
  const { view, calls, changes, setRow } = harness(idleRow());
  setRow(filteringRow('prod', 4));
  changes.fire();
  assert.equal(view.message, 'Search: prod — 4 found');
  assert.deepEqual(calls.at(-1), [SEARCH_ACTIVE_CONTEXT, true]);

  setRow(idleRow());
  changes.fire();
  assert.equal(view.message, '');
  assert.deepEqual(calls.at(-1), [SEARCH_ACTIVE_CONTEXT, false]);
  assert.equal(calls.length, 3, 'idle at wiring, on, off');
});

test('a repaint that changes nothing sends nothing', () => {
  const { writes, calls, changes } = harness(filteringRow('prod', 4));
  changes.fire();
  changes.fire();
  assert.deepEqual(writes, ['Search: prod — 4 found']);
  assert.equal(calls.length, 1);
});

test('a new count rewrites the banner and leaves the context key alone', () => {
  const { view, writes, calls, changes, setRow } = harness(filteringRow('prod', 4));
  setRow(filteringRow('prod', 3));
  changes.fire();
  assert.equal(view.message, 'Search: prod — 3 found');
  assert.equal(writes.length, 2);
  assert.equal(calls.length, 1);
});

test('disposing ends the subscription, resets nothing, and may be done twice', () => {
  const { writes, calls, changes, setRow, pin } = harness(filteringRow('prod', 4));
  const before = [writes.length, calls.length];
  pin.dispose();
  assert.equal(changes.listenerCount, 0);
  assert.deepEqual([writes.length, calls.length], before, 'dispose reset nothing');
  setRow(idleRow());
  changes.fire();
  assert.deepEqual([writes.length, calls.length], before, 'nothing is sent after dispose');
  assert.doesNotThrow(() => pin.dispose());
});

test('a row that cannot be read sends nothing, is reported, and the next event repairs the banner', () => {
  const { view, writes, calls, changes, setRow } = harness(idleRow());
  setRow(() => {
    throw new Error('row unavailable');
  });
  const reported = StubEventEmitter.reported.length;
  const sent = [writes.length, calls.length];
  changes.fire();
  assert.deepEqual([writes.length, calls.length], sent, 'a failed read left something half-sent');
  assert.equal(StubEventEmitter.reported.length, reported + 1);

  setRow(filteringRow('prod', 4));
  changes.fire();
  assert.equal(view.message, 'Search: prod — 4 found');
  assert.deepEqual(calls.at(-1), [SEARCH_ACTIVE_CONTEXT, true]);
});

test('the pin is wired once, in viewCommands.ts, and the context key is spelled in searchPin.ts only', () => {
  const src = path.join(__dirname, '..', '..', 'src');
  const files = fs
    .readdirSync(src, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts') && !file.startsWith(`test${path.sep}`))
    .map((file) => ({ file: file.split(path.sep).join('/'), text: fs.readFileSync(path.join(src, file), 'utf8') }));
  const calling = files.filter(({ file, text }) => file !== 'searchPin.ts' && text.includes('pinSearch('));
  assert.deepEqual(calling.map(({ file }) => file), ['commands/viewCommands.ts'], 'extension.ts is under the size ratchet and must not grow');
  assert.equal(calling[0].text.split('pinSearch(').length - 1, 1);
  assert.deepEqual(
    files.filter(({ text }) => text.includes(SEARCH_ACTIVE_CONTEXT)).map(({ file }) => file),
    ['searchPin.ts'],
  );
});

test('the manifest contributes the search green, the green title-bar magnifier, and a gated Clear', () => {
  assert.ok(
    manifest.contributes.colors.some((color) => color.id === SEARCH_ACCENT_COLOR_ID),
    `${SEARCH_ACCENT_COLOR_ID} is not contributed, so the ThemeColor resolves to nothing`,
  );

  const search = manifest.contributes.commands.find((c) => c.command === 'credSshManager.search');
  assert.ok(typeof search?.icon === 'object', 'a codicon cannot be green in a title bar — the search icon must be an SVG pair');

  const title = manifest.contributes.menus['view/title'];
  const order = (command: string): number => {
    const item = title.find((entry) => entry.command === command && entry.when?.includes('credSshManagerView'));
    const group = item?.group ?? '';
    assert.ok(group.startsWith('navigation@'), `${command} is not a title-bar button`);
    return Number(group.slice(group.indexOf('@') + 1));
  };
  assert.ok(order('credSshManager.search') < order('credSshManager.help'), 'the magnifier comes first, before the help');
  assert.ok(order('credSshManager.clearSearch') < order('credSshManager.help'), 'Clear sits beside the magnifier');
  const whenOf = (command: string): string => title.find((entry) => entry.command === command)?.when ?? '';
  assert.match(whenOf('credSshManager.clearSearch'), new RegExp(`\\b${SEARCH_ACTIVE_CONTEXT.replace('.', '\\.')}\\b`), 'Clear shows only while a filter is on');
});
