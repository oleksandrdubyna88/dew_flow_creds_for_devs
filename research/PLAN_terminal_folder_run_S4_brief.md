# PLAN — S4 scenarios and brief: the arrow on the folder, and the words

> Status: **IMPLEMENTED, 2026-11-06.** Parent: [PLAN_terminal_folder_run.md](PLAN_terminal_folder_run.md).
> Story S4 of the parent's `## Stories` (parent §Design 3 *The menu*, §Not in this plan, §Hand checks). Written by an Opus judge;
> Sonnet codes from it and rediscovers nothing; Opus reviews. Scope: `src_vs_code` (one token, eight menu clauses, tests, help in five
> languages, the listing, the changelog), the root `README.md`, two research documents, one new todo plan.
>
> **Line numbers** are from commit `090f459`, with S1, S2, S3 and S5 in the tree and the plan at epoch 2. The plan's own clause numbers
> (`package.json:1339`, …) predate S3, so each manifest clause is **+13** against them: `:1339` is `:1352`. The address of a clause is its
> `command` and `group`, and the number a hint.
>
> **How this was checked.** Every code and text block below was extracted from THIS file by a script and applied to a scratch copy
> holding `090f459`: see §C for what ran and what it answered. No real VS Code ran. A string the tests match may not be reworded; a docblock may be.

## A. Scenarios

Each row is one `test()`, its title the name in the column. `menu(row)` is what the REAL manifest's `view/item/context` offers a
row, as sorted `command group` strings. `LIVE` is the four untrashed combinations of `asksForPin` and `locked`.

### A.1 `src/test/folderMenu.test.ts` (new, full text in §B.3)

| # | Test | Then |
|---|---|---|
| 1 | `the_row_value_is_the_tokens_in_their_fixed_order_and_runall_is_last` | `folderContextValue(false)` is `folder`, `(true)` is `folder:trashed`, `(false, true)` is `folder:asksforpin`: the older calls are byte-identical. With type `terminal`: `folder:runall`, `folder:asksforpin:runall`, `folder:locked:runall`, `folder:asksforpin:locked:runall`; `(true, false, false, 'terminal')` is `folder:trashed`, `(true, true, true, 'terminal')` is `folder:trashed:asksforpin:locked`; `(false, false, false, 'any')` is `folder` |
| 2 | `only_an_untrashed_terminal_folder_wears_runall` | over all 8 flag combinations and every `FolderType` plus none (`undefined`, `any`, `project`, `ENTITY_KINDS`): `:runall` present exactly when the type is `terminal` and not trashed |
| 3 | `the_evaluator_reads_every_form_the_manifest_uses_and_throws_on_another` | `==` is exact; `=~` is a regex; `!(…)` negates; `(a \|\| b)` is either; `config.something` and `view == anotherView` THROW; every `when` of the menu reads without throwing |
| 4 | `the_scan_is_looking_at_the_real_menus` | the companion: `menu('folder')` holds `credSshManager.addEntity inline@1`, `menu('account')` holds `addEntity 1_create@2` and `addFolder 1_create@1`, `menu('entity:cmd')` holds `runCommand inline@0`, and an unknown row is offered nothing |
| 5 | `a_terminal_folder_keeps_every_item_and_gains_only_the_arrow` | for each of `LIVE`: `value(f, 'terminal')` is `value(f, 'any') + ':runall'`, and its `menu` is exactly the plain row's plus `runFolder 2_actions@0` and `runFolder inline@0` |
| 6 | `a_plain_terminal_folder_shows_the_arrow_and_the_plus_side_by_side` | `runFolder` has exactly the groups `2_actions@0`, `inline@0`, both with the whole clause `view == credSshManagerView && viewItem =~ /^folder(:.*)?:runall$/`; `menu('folder:runall')` holds `runFolder inline@0` and `addEntity inline@1` |
| 7 | `a_trashed_terminal_folder_is_any_trashed_folder` | for each trashed combination: the value with type `terminal` equals the value with type `any`, and its menu has no `runFolder` |
| 8 | `no_other_row_gets_the_arrow` | no `runFolder` for a Terminal entry's real `entityContextValue` (live and trashed, each holding `:cmd`), `account`, `trashFolder`, `folder`, `folder:trashed`, `folder:asksforpin`, `folder:locked`, `dependentsFolder`, `revision:cmd`, `entity:cmd:runall`, `account:runall`, `folderish:runall` |
| 9 | `runall_opens_no_clause_written_for_a_token` | the clauses reading `/:cmd/` or `/:vpnrun/` are found (the scan holds `runCommand` and `startVpn`), and none of them is in the menu of any `LIVE` terminal value |

### A.2 `src/test/treeProviderTrash.test.ts` (one test added, §B.2)

| # | Test | Then |
|---|---|---|
| 10 | `the row hands the folder its type: a live Terminal folder wears :runall, one in the Trash does not` | through the real `getTreeItem`: a live terminal folder `folder:runall`; one under the Trash `folder:trashed`; the Trash itself, even with `folderType: 'terminal'`, `trashFolder`. The file's existing test stays as it is: its `LIVE` has no `folderType`, so it stays `folder` |

### A.3 `src/test/folderRunHelp.test.ts` (new, full text in §B.5)

| # | Test | Then |
|---|---|---|
| 11 | `every_language_holds_the_labels_and_the_commands_byte_for_byte` | in `basics`, per language and not a fallback: `Run All in Folder`, `Close Open Terminals and Run`, `Type It Anyway`, `Depends on`, `Execute what is executable first`, `Started by`, `Runs on`, `{name}`, `{na''me}`, `tmux new -A -s {name}`, `tmux attach -t '={name}'`, `-t foo`, `foobar`, `a.b:c`, `a_b_c`, `tmux 3.6`, `CredsForDevs: before <folder>`, `32`, `4000` |
| 12 | `every_language_says_it_in_its_own_words` | per language, its own phrases for: subfolders are not run, a control character in a name, the lines do not wait, the extension typed a line there and saw it finish, without shell integration every time, a dependency that never exits, a tmux client only detaches. The table is keyed by `HelpLanguage`, so a sixth language does not compile without it |
| 13 | `every_language_renders_the_two_headings_as_emphasis` | `articleHtml('basics', language)` holds `<strong>Run All in Folder.</strong>` and `<strong>tmux.</strong>`: `helpPage.ts` `inline` turns `**…**` into emphasis only when no `*` sits inside |
| 14 | `the_title_is_covered_by_the_article_and_no_excuse_is_left` | the English `basics` holds `run all in folder` lowercased, and `src/test/helpCoverage.test.ts` no longer contains `credSshManager.runFolder`. Nothing else forces the removal: `SELF_EVIDENT` wins over the corpus in `isCovered` |

### A.4 Renamed

| # | Where | What |
|---|---|---|
| 15 | `src/test/folderRunCommand.test.ts`, S3's row 67 | `the_manifest_hides_the_command_from_the_palette_until_the_menus_come` becomes `the_manifest_hides_the_command_from_the_palette`. Its assertions stay: `when: 'false'` stays (parent §3 *hidden from the palette*). The menus have come |

## B. The brief

### B.1 What is settled, and why

1. **How the fact reaches `folderContextValue`.** As the node's `folderType`, a fourth parameter, optional with **no default**. The decision "which folders run" then sits beside the other tokens in a pure module that test 2 reaches for every type; a boolean computed at the call site would leave `=== 'terminal'` to a line only test 10 sees.
2. **Why no default, measured.** The eslint limit is `complexity: 4` (`eslint.config.mjs`). ESLint counts a default parameter value: today's function is 1 + 2 defaults = 3. `flag('runall', folderType === 'terminal' && !trashed)` adds 1, which is 4 and clean. Writing `folderType: FolderType | undefined = undefined` was tried: `Function 'folderContextValue' has a complexity of 5. Maximum allowed is 4`.
3. **No options object.** Lint does not force one: `eslint.config.mjs` has no `max-params` (its rules are `max-lines`, `max-lines-per-function`, `complexity`, `no-console`, `no-restricted-syntax`), and the function has one caller (`treeDataProvider.ts:592`). Converting would also rewrite the three older parameters and their docblock for no reader.
4. **`trashFolder` stays.** `treeDataProvider.ts:592` keeps its `trash ? 'trashFolder' : …`. Only the last argument is added. `===` is not a branch, so `getTreeItem`'s complexity does not move. `treeDataProvider.ts` and `treeRowText.ts` are not in `.size-baseline.json`.
5. **The six clauses are the whole list. Proof, run on the manifest at `090f459`:** every `when` of `view/item/context` (104 items, all reading `viewItem`; the other menus, `commandPalette`, `credSshManager.install` and `view/title`, have none) was evaluated for each of the 8 folder values, with and without `:runall`. Items lost by adding the token: for `folder`, exactly six; for `folder:locked`, `folder:asksforpin`, `folder:asksforpin:locked` and all four trashed values, **none**; items gained, none. Those six are the plan's lines:

   | `command` | `group` | the plan | `090f459` | now reads | becomes |
   |---|---|---|---|---|---|
   | `addEntity` | `inline@1` | `:1339` | `:1352` | `viewItem =~ /^folder$/` | `viewItem =~ /^folder(:runall)?$/` |
   | `addFolder` | `1_create@1` | `:1344` | `:1357` | `viewItem =~ /^(account\|folder)$/` | `viewItem =~ /^(account\|folder(:runall)?)$/` |
   | `addEntity` | `1_create@2` | `:1349` | `:1362` | `viewItem =~ /^(account\|folder)$/` | `viewItem =~ /^(account\|folder(:runall)?)$/` |
   | `changeFolderType` | `1_create@3` | `:1534` | `:1547` | `viewItem == folder` | `viewItem =~ /^folder(:runall)?$/` |
   | `folderUp` | `0_order@1` | `:1539` | `:1552` | `viewItem == folder` | `viewItem =~ /^folder(:runall)?$/` |
   | `folderDown` | `0_order@2` | `:1544` | `:1557` | `viewItem == folder` | `viewItem =~ /^folder(:runall)?$/` |

   Test 5 keeps this proof running. A prefix clause (`/^folder/`, `/^(folder|entity)/`, `/^(entity|folder):trashed/`) needs nothing.
6. **The regex form.** The file already writes `viewItem =~ /…/` with `^`, `$`, `(`, `|` and `.*` (`/^entity.*:burnable/`, `package.json:1642`). `?` is new to this file. Read in VS Code's own parser (`vs/platform/contextkey/common/scanner.js` `_regex`, and the `new RegExp` in `contextkey.js`, from the `monaco-editor@0.52.2` package, read and not run): a regex lexeme runs to the next unescaped `/` outside a character class, then goes to `new RegExp(...)`, so a `?` is not special. No backslash is needed, so JSON escaping does not arise: the clause in `package.json` is byte-identical to the clause in the test.
7. **Slots.** `inline@0` and `2_actions@0` are free on a folder row: every other `inline@0` and `2_actions@0` item reads a token or a row no folder has (`/:cmd/`, `/:vpnrun/`, `/:script/`, `/:db/`, `/:ssh/`, `sharedItem`, …). `manifest.test.ts`'s slot test keys on `when::group`, so the two new items cannot clash.
8. **The evaluator reads five forms, not three.** Besides `==`, `=~` and `!(…)`, the real manifest has `view == credSshManagerView` on all 104 items and `(viewItem == account-corpAdmin || viewItem == account-corpOfficer)` on two (`serverMetrics`, `orgBackup`). It THROWS on anything else: a first version that let an unread clause through offered `serverMetrics` on a plain folder.
9. **Tests pinning a clause, read one by one.** `notForExportMenu.test.ts:40` pins `/^(folder|entity)/ && !(viewItem =~ /:noexport/)`, not one of the six: **nothing changes there**. `treeProviderTrash.test.ts:92-94`: stays, `LIVE` has no type. `revisionRestore.test.ts:260`, `backupMenuGate.test.ts`, `orgRecoveryAccess.test.ts`, `orgMembersWiring.test.ts`, `treeRowText.test.ts:205` read other rows or other commands: nothing changes. `manifest.test.ts` reads no folder clause. All were run with the edits in place (§C).
10. **The help goes in `basics`, not a new article.** A terminal entry and *Depends on* already live in `basics.usage`, and `helpCatalog.test.ts:45` pins 38 articles. The behaviour goes in `usage`, what stops a run in `whatCanGoWrong`. `whatItIs`, `why` and `setup` do not change.
11. **`helpPage.ts` renders only `**…**` and `- ` lists** (`inline` `:109`, `blocks` `:90`): backticks and single asterisks reach the reader as they are, as in the rest of this catalog. `<folder>` and `'` are escaped by `escapeHtml`. Every paragraph in §B.5 is its own block, so no line starts with `- `.
12. **`Checked on tmux 3.6.`** The catalog states versions plainly when they bound a claim, and this is one sentence, so it is in. Measured here 2026-11-05 on tmux 3.6, private socket, under a pty: `attach -t foo` with only `foobar` attaches it; `attach -t '=foo'` answers `can't find session: foo`; `new -A -s foobar` attaches and adds no session; `new -A -s fresh1` creates it; `new -A -s a.b` creates `a_b`; `new -d -s a.b:c` creates `a_b_c`. `parseCommandLine` splits a pasted `tmux new -A -s {name}` into `tmux new`, `-A`, `-s {name}`, and `tmux attach -t '={name}'` into `tmux attach`, `-t '={name}'`. The token's look-behind is `[$#%{]`, so `={name}` is filled.
13. **`*Depends on*` gives waiting only from OUTSIDE the folder.** `plan.directIds` is the chain's `exclude`, so a sibling is neither a step nor awaited (S3 rows 60, 61). The help says so, as the modal does. Writing "use Depends on" without that would send a reader to name a sibling and be surprised.
14. **Closing the chain's terminal ends the run**: `stepVerdict(…, 'closed')` stops the chain, `chain.ready` is false, nothing is typed (`dependencyRun.ts` `stepVerdict`, `dependencyRunHost.ts` `runAll`). A second click meanwhile says `A run of … is already waiting` (S3 row 49).
15. **`README.md` and the listing.** The listing says *every click asks*, not *asks every time*: `sshAgentHelp.test.ts` (`no shipped text says every signature asks`) bans that phrase in the README, as this brief's first draft of the bullet found. `listingCoverage.test.ts:31` needs the exact title in `src_vs_code/README.md`: S3's phrase at `:1194` already satisfies it and stays. `readmeClaims.test.ts`'s `BANNED` patterns were run against the text below. The folder type's label is `Terminal command` (`types.ts:346`), which is what the listing says; the help's `basics` calls the kind **terminal**, and says that.
16. **`src_vs_code/CHANGELOG.md`, hand-written.** `release-please-config.json:112` sends generated notes to `RELEASES.md` (`$note`, `:9-11`), which S4 does not touch. Entries go under `## [Unreleased]`; a later `docs(changelog): the Unreleased section is x.y.z` commit renames the heading at release (`git log -- src_vs_code/CHANGELOG.md`, `d5633de`).
17. **The walkthrough: nothing.** `media/walkthrough/use.md` is the first-credential path, four items about using one secret without retyping it. A folder run is for someone who already has a folder of sessions. No file under `media/walkthrough/` changes, nor the `walkthroughs` block of `package.json`.
18. **The todos go in one new plan,** `todo/PLAN_terminal_runs_followups.md`, with a row in `todo/README.md` in the same commit (`planning-docs.md` *Definition of Done*), and the parent's §Not in this plan points at it (`planning-docs.md` *A boundary between two plans is named on BOTH sides*; a pointer satisfying the parent's own sentence, not a plan change). `module_extension.md:2072-2075` of the plan's list was fixed in S1 and is not carried. S5 fixed `describeRunPlan`'s forged rows (`dependencyRun.ts:194`), so that is not carried either.
19. **The busy guard's words follow §2 as approved for epoch 2, and not the first draft.** `finished` needs OUR send first (`terminalActivity.ts` `onStart`: a start on `unknown` stays `unknown`). So "the last command is known to have finished" is too broad, and so is "after a reload it asks until it has seen a command finish": a person's own command there is seen and proves nothing, and silence returns once a line let through with `Type It Anyway` has been seen to start and end (`unknown` to `armed` to `running` to `finished`). `Type It Anyway` over a RUNNING command poisons the terminal for its life (`onSent`), and the text says that too. No text below says "never": §2 *What this does not close* names what the guard cannot catch.
20. **`4000`, written so in all five languages.** `MAX_QUESTION_CHARACTERS` prints as `4000` in the refusal the reader gets (`folderRun.ts` `sizeRefusal`), and a locale's `4,000`, `4.000` or `4 000` would not match it or test 11.
21. **The report's words.** The help quotes only *Typed*, and `folderReport` still opens `Typed 3 of 5 in "…".` and ends `Typed: a, b, c.`, so it holds after S5 reordered the report. `chainStopped` is not quoted. The control-character reason is said in words, not quoted (`CONTROL_NAME`, `folderRun.ts:32`).

### B.2 Production and the provider test

`src/treeRowText.ts`, the import (`:6`):

```ts
import { EntityMetadata, FolderType, TreeNode } from './types';
```

`src/treeRowText.ts:92-109`, whole:

```ts
/**
 * A folder row's context value: `folder`, or `folder:trashed` inside the Trash (Restore leads), and `:runall` last on a
 * Terminal folder that is not in the Trash (the green arrow, `credSshManager.runFolder`).
 */
export function folderContextValue(
  trashed: boolean,
  asksForPin: boolean = false,
  /**
   * A corporate project folder this person may not rename, move or delete (epic 3).
   *
   * <p>The menu is DISCOVERABILITY: hiding the entries is what stops somebody reaching for one, and
   * it is not what stops the operation — F2, the Delete key and the command palette all reach the
   * handler without a menu, so the refusal lives there too (`moveGate.refuseProjectFolderChange`).</p>
   */
  locked: boolean = false,
  /**
   * The folder's type, which decides `:runall`. The type rather than a boolean, so that which folders run is decided
   * here, beside the other tokens. Optional with no default: a default value counts towards the complexity limit, and
   * this function is at it.
   *
   * <p>Discoverability too: F2 and the palette reach the handler with no menu, so `folderTarget` refuses there as well.</p>
   */
  folderType?: FolderType,
): string {
  // One token per fact, in a fixed order, so `folder`, `folder:trashed` and `folder:asksforpin`
  // stay byte-identical to what every `viewItem` clause in package.json already matches. `:runall`
  // is last, and the clauses that read a plain row exactly take `(:runall)?`, so a Terminal folder keeps every item of a plain one.
  return ['folder', flag('trashed', trashed), flag('asksforpin', asksForPin), flag('locked', locked), flag('runall', folderType === 'terminal' && !trashed)]
    .filter((token) => token !== '')
    .join(':');
}
```

`src/treeDataProvider.ts:592`:

```ts
      item.contextValue = trash ? 'trashFolder' : folderContextValue(inTrash, node.folderAsksForPin === true, managed, node.folderType);
```

`src_vs_code/package.json`, `contributes.menus["view/item/context"]`, as the first two items of the array (before `addEntity` `inline@1`). This adds 10 lines above the six:

```json
        {
          "command": "credSshManager.runFolder",
          "when": "view == credSshManagerView && viewItem =~ /^folder(:.*)?:runall$/",
          "group": "inline@0"
        },
        {
          "command": "credSshManager.runFolder",
          "when": "view == credSshManagerView && viewItem =~ /^folder(:.*)?:runall$/",
          "group": "2_actions@0"
        },
```

Then the six `when` values of §B.1.5, each `view == credSshManagerView && ` plus the *becomes* column. S3's `contributes.commands` entry and its `commandPalette` entry stay as they are. `PALETTE_ONLY` gets nothing.

`src/test/treeProviderTrash.test.ts`, replacing `const NODES = [TRASH, LIVE, GONE_FOLDER, GONE_ENTRY];`:

```ts
const LIVE_TERMINAL: TreeNode = { id: 'lt', name: 'claude sessions', type: 'folder', folderType: 'terminal', parentId: null };
const GONE_TERMINAL: TreeNode = { id: 'gt', name: 'old sessions', type: 'folder', folderType: 'terminal', parentId: 't', trashedFrom: null };
const NODES = [TRASH, LIVE, GONE_FOLDER, GONE_ENTRY, LIVE_TERMINAL, GONE_TERMINAL];
```

and, after the test `a folder in the Trash is folder:trashed; …`:

```ts
test('the row hands the folder its type: a live Terminal folder wears :runall, one in the Trash does not', () => {
  const tree = build();
  assert.equal(tree.getTreeItem(element(LIVE_TERMINAL)).contextValue, 'folder:runall');
  assert.equal(tree.getTreeItem(element(GONE_TERMINAL)).contextValue, 'folder:trashed');
  assert.equal(tree.getTreeItem(element({ ...TRASH, folderType: 'terminal' })).contextValue, 'trashFolder', 'the Trash itself stays what it was');
});
```

### B.3 `src/test/folderMenu.test.ts` (new, beside `treeRowText.test.ts`)

Not inside `treeRowText.test.ts`: that file is about text and tokens, and its `viewItemPattern` (`:205`) reads one regex per clause, which a `!(…)` or an `||` defeats. No `vscode`: `treeRowText.ts` imports none.

```ts
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
```

### B.4 `src/test/helpCoverage.test.ts`

Delete S3's temporary entry, its comment line included, from `SELF_EVIDENT`:

```ts
  // S4 of PLAN_terminal_folder_run.md removes this entry in the commit that writes the article.
  'credSshManager.runFolder':
    'No menu reaches this command yet, so no reader can meet it; the article arrives with the arrow on the folder row.',
```

No `ALIAS`: `isCovered` then falls to the corpus, and `run all in folder` is in the English `basics.usage`, the title being `Run All in Folder`.

### B.5 Help, in `helpEn.ts`, then `helpDe.ts`, `helpEs.ts`, `helpRu.ts`, `helpUk.ts`

English is the source; UI labels stay English in every language (`CLAUDE.md` rule 7). All five edit only the article `'basics'` (`:79-86` in each file), on the existing `usage` and `whatCanGoWrong` lines. No line is added to any file: the text goes inside the existing string literal.

**Each line of a block below is one paragraph.** In the file it is written as source text of a double-quoted string, with the two-character escape `\n\n` before each paragraph. The blocks hold no `"` and no backslash, so nothing else needs escaping.

- A `-usage` block goes immediately before the paragraph the *anchor* column names, in `usage`, so the string reads `…\n\n<paragraph 1>\n\n…\n\n<paragraph 5>\n\n<anchor>…`.
- A `-wrong` block goes at the very end of `whatCanGoWrong`, before its closing `"`, after the *ending* column's text.

| File | `usage` anchor | `whatCanGoWrong` ending |
|---|---|---|
| `helpEn.ts` | `Any entry can also carry notes` | `which is what **Install SSH Key** is for.` |
| `helpDe.ts` | `Jeder Eintrag kann außerdem Notizen` | `genau dafür ist **Install SSH Key** da.` |
| `helpEs.ts` | `Cualquier entrada puede además llevar notas` | `para eso está **Install SSH Key**.` |
| `helpRu.ts` | `Любая запись может нести заметки` | `для чего и есть **Install SSH Key**.` |
| `helpUk.ts` | `Будь-який запис може ще нести нотатки` | `саме для цього є **Install SSH Key**.` |

The lines are long, and four of the languages are not ASCII: use a short Node script reading the exact text out of this document, or the Edit tool with the anchor as `old_string`, and check with test 11.

```text help-en-usage
**`{name}` in a terminal command.** In the command or in an enabled argument row, `{name}` is the entry's own name: `tmux attach -t {name}` needs the name once and follows a rename. The line with the name filled in is the one you see, approve and run, so a rename asks again. Only a name of letters, digits and `. _ -`, starting with a letter, a digit or `_`, can stand in for it, so that no name can become shell syntax. Any other name, one with a space included, is refused with the reason and the line does not run. To keep a literal `{name}` in bash, write `{na''me}`. `${name}`, `{{name}}`, `#{name}` and `%{name}` stay as they are.
**Run All in Folder.** A folder of type **terminal** has a green arrow beside its +, and the same item in its menu: one click brings back every entry directly inside it. Subfolders are not run. It always asks first: the question lists every line in order, marks with (new) a line not yet run on this machine, and names each entry that will not run and why: not a terminal entry, no command, a refused name, a name holding a control character, `{config}` (only a VPN's *Started by* fills that in), a *Runs on* this window cannot serve, or two entries sharing one name and so one terminal. More than 32 lines, or a question over 4000 characters, is refused, because the question has to show every line; shorten a line or move some into a subfolder.
**Run** types each line into a new terminal of its own and leaves alone an entry whose terminal is already open. **Close Open Terminals and Run**, offered when any is open, closes those terminals once the dependencies are ready and types their lines too. Closing ends whatever runs there; a tmux client only detaches, and its session goes on. The report says *Typed*, never started, because what a line does next is not observed.
**The lines of a folder run do not wait for each other.** When something has to finish first, keep it outside the folder, name it under *Depends on* and tick *Execute what is executable first*: it runs before any line of the folder, and each step is waited for. A sibling in the same folder named there is not waited for.
**tmux.** `tmux new -A -s {name}` attaches to the session or creates it, so the entry still works after the machine has rebooted. `tmux attach -t '={name}'` matches the name exactly, because a bare `-t foo` also attaches `foobar`. Keep `.` and `:` out of a session's name: tmux rewrites them, and `a.b:c` becomes `a_b_c`. Checked on tmux 3.6.
```

```text help-en-wrong
**The green arrow asks instead of typing.** A line typed into a running `tmux attach` reaches the program inside as input, so the arrow types into an entry's open terminal only when the extension itself typed a line there and saw that command finish. Otherwise it shows the terminal and asks: **Type It Anyway** or cancel. After a window reload it asks until a line let through with **Type It Anyway** has been seen to start and end; without shell integration it asks every time; and after **Type It Anyway** over a command still running, that terminal asks for the rest of its life. A VPN's *Started by* line takes the same guard; when an agent asked for the start, it is refused rather than asked.
**A dependency that never exits holds the whole folder run.** It waits in the terminal `CredsForDevs: before <folder>`, no line of the folder is typed, no other terminal opens, and another click on the arrow does nothing. Closing that terminal ends the run with nothing typed.
```

```text help-de-usage
**`{name}` in einem Terminal-Befehl.** Im Befehl oder in einer aktiven Argumentzeile ist `{name}` der Name des Eintrags selbst: `tmux attach -t {name}` braucht den Namen nur einmal und folgt einer Umbenennung. Die Zeile mit dem eingesetzten Namen ist genau die, die Sie sehen, bestätigen und ausführen, also fragt eine Umbenennung erneut. Nur ein Name aus Buchstaben, Ziffern und `. _ -`, der mit einem Buchstaben, einer Ziffer oder `_` beginnt, kann eingesetzt werden, damit kein Name zu Shell-Syntax werden kann. Jeder andere Name, auch einer mit Leerzeichen, wird mit Begründung abgelehnt, und die Zeile läuft nicht. Um in bash ein wörtliches `{name}` zu behalten, schreiben Sie `{na''me}`. `${name}`, `{{name}}`, `#{name}` und `%{name}` bleiben, wie sie sind.
**Run All in Folder.** Ein Ordner vom Typ **terminal** hat neben seinem + einen grünen Pfeil und denselben Punkt in seinem Menü: ein Klick holt jeden Eintrag zurück, der direkt darin liegt. Unterordner laufen nicht mit. Zuerst kommt immer eine Frage: Sie listet jede Zeile der Reihe nach auf, markiert mit (new) eine Zeile, die auf diesem Rechner noch nicht lief, und nennt jeden Eintrag, der nicht laufen wird, mit Grund: kein terminal-Eintrag, kein Befehl, ein abgelehnter Name, ein Name mit einem Steuerzeichen, `{config}` (das füllt nur *Started by* eines VPN aus), ein *Runs on*, das dieses Fenster nicht bedienen kann, oder zwei Einträge mit einem Namen und damit einem Terminal. Mehr als 32 Zeilen oder eine Frage über 4000 Zeichen werden abgelehnt, weil die Frage jede Zeile zeigen muss; kürzen Sie eine Zeile oder verschieben Sie einige in einen Unterordner.
**Run** tippt jede Zeile in ein eigenes neues Terminal und lässt einen Eintrag in Ruhe, dessen Terminal schon offen ist. **Close Open Terminals and Run**, angeboten, sobald eines offen ist, schließt diese Terminals, sobald die Abhängigkeiten bereit sind, und tippt auch ihre Zeilen. Schließen beendet, was dort läuft; ein tmux-Client trennt sich nur, und seine Sitzung läuft weiter. Der Bericht sagt *Typed*, nie „gestartet“, denn was eine Zeile danach tut, wird nicht beobachtet.
**Die Zeilen eines Ordnerlaufs warten nicht aufeinander.** Wenn etwas zuerst fertig sein muss, halten Sie es außerhalb des Ordners, nennen es unter *Depends on* und haken *Execute what is executable first* an: es läuft vor jeder Zeile des Ordners, und auf jeden Schritt wird gewartet. Auf einen dort genannten Nachbareintrag im selben Ordner wird nicht gewartet.
**tmux.** `tmux new -A -s {name}` verbindet sich mit der Sitzung oder legt sie an, der Eintrag funktioniert also auch nach einem Neustart des Rechners. `tmux attach -t '={name}'` trifft den Namen exakt, denn ein bloßes `-t foo` verbindet sich auch mit `foobar`. Halten Sie `.` und `:` aus dem Namen einer Sitzung heraus: tmux schreibt sie um, und aus `a.b:c` wird `a_b_c`. Geprüft mit tmux 3.6.
```

```text help-de-wrong
**Der grüne Pfeil fragt, statt zu tippen.** Eine Zeile, die in ein laufendes `tmux attach` getippt wird, erreicht das Programm darin als Eingabe. Darum tippt der Pfeil in das offene Terminal eines Eintrags nur, wenn die Erweiterung selbst dort eine Zeile getippt und diesen Befehl hat enden sehen. Sonst zeigt er das Terminal und fragt: **Type It Anyway** oder Abbrechen. Nach dem Neuladen des Fensters fragt er, bis eine mit **Type It Anyway** durchgelassene Zeile sichtbar begonnen und geendet hat; ohne Shell-Integration jedes Mal; und nach **Type It Anyway** über einem noch laufenden Befehl fragt dieses Terminal für den Rest seines Lebens. Die Zeile von *Started by* eines VPN durchläuft dieselbe Prüfung; hat ein Agent den Start angefordert, wird er abgelehnt, statt zu fragen.
**Eine Abhängigkeit, die nie endet, hält den ganzen Ordnerlauf auf.** Sie wartet im Terminal `CredsForDevs: before <folder>`, keine Zeile des Ordners wird getippt, kein anderes Terminal öffnet sich, und ein weiterer Klick auf den Pfeil tut nichts. Wenn Sie dieses Terminal schließen, endet der Lauf, und nichts wird getippt.
```

```text help-es-usage
**`{name}` en un comando de terminal.** En el comando o en una fila de argumento activa, `{name}` es el nombre de la propia entrada: `tmux attach -t {name}` necesita el nombre una sola vez y sigue a un cambio de nombre. La línea con el nombre ya puesto es la que usted ve, aprueba y ejecuta, así que un cambio de nombre vuelve a preguntar. Solo puede sustituirlo un nombre de letras, dígitos y `. _ -`, que empiece por una letra, un dígito o `_`, para que ningún nombre pueda convertirse en sintaxis de la shell. Cualquier otro nombre, también uno con un espacio, se rechaza indicando el motivo, y la línea no se ejecuta. Para conservar un `{name}` literal en bash, escriba `{na''me}`. `${name}`, `{{name}}`, `#{name}` y `%{name}` se quedan como están.
**Run All in Folder.** Una carpeta de tipo **terminal** tiene una flecha verde junto a su + y el mismo elemento en su menú: un clic recupera todas las entradas que están directamente en ella. Las subcarpetas no se ejecutan. Siempre pregunta antes: la pregunta enumera cada línea en orden, marca con (new) una línea que aún no se ha ejecutado en esta máquina y nombra cada entrada que no se ejecutará, con el motivo: no es una entrada terminal, no tiene comando, un nombre rechazado, un nombre con un carácter de control, `{config}` (solo lo rellena el *Started by* de una VPN), un *Runs on* que esta ventana no puede atender, o dos entradas con un mismo nombre y, por tanto, un mismo terminal. Más de 32 líneas, o una pregunta de más de 4000 caracteres, se rechazan, porque la pregunta tiene que mostrar cada línea; acorte una línea o mueva algunas a una subcarpeta.
**Run** escribe cada línea en un terminal nuevo propio y deja en paz una entrada cuyo terminal ya está abierto. **Close Open Terminals and Run**, que se ofrece cuando alguno está abierto, cierra esos terminales en cuanto las dependencias están listas y escribe también sus líneas. Cerrar termina lo que se esté ejecutando allí; un cliente de tmux solo se desconecta, y su sesión sigue. El informe dice *Typed*, nunca «iniciado», porque lo que hace una línea después no se observa.
**Las líneas de una ejecución de carpeta no se esperan entre sí.** Cuando algo tiene que terminar antes, manténgalo fuera de la carpeta, nómbrelo en *Depends on* y marque *Execute what is executable first*: se ejecuta antes que cualquier línea de la carpeta, y se espera a cada paso. A una entrada vecina de la misma carpeta nombrada allí no se la espera.
**tmux.** `tmux new -A -s {name}` se conecta a la sesión o la crea, así que la entrada sigue funcionando después de reiniciar la máquina. `tmux attach -t '={name}'` coincide exactamente con el nombre, porque un simple `-t foo` también se conecta a `foobar`. No ponga `.` ni `:` en el nombre de una sesión: tmux los reescribe, y `a.b:c` pasa a ser `a_b_c`. Comprobado con tmux 3.6.
```

```text help-es-wrong
**La flecha verde pregunta en lugar de escribir.** Una línea escrita en un `tmux attach` en marcha llega como entrada al programa que corre dentro, así que la flecha solo escribe en el terminal abierto de una entrada cuando la propia extensión escribió allí una línea y vio terminar ese comando. Si no, muestra el terminal y pregunta: **Type It Anyway** o cancelar. Tras recargar la ventana pregunta hasta que una línea dejada pasar con **Type It Anyway** se haya visto empezar y terminar; sin integración de shell, cada vez; y tras **Type It Anyway** sobre un comando aún en marcha, ese terminal pregunta el resto de su vida. La línea del *Started by* de una VPN pasa la misma comprobación; si un agente pidió el inicio, se rechaza en lugar de preguntar.
**Una dependencia que nunca termina retiene toda la ejecución de la carpeta.** Espera en el terminal `CredsForDevs: before <folder>`, no se escribe ninguna línea de la carpeta, no se abre ningún otro terminal y otro clic en la flecha no hace nada. Cerrar ese terminal termina la ejecución sin escribir nada.
```

```text help-ru-usage
**`{name}` в команде терминала.** В команде или во включённой строке аргумента `{name}` — это имя самой записи: в `tmux attach -t {name}` имя пишется один раз и следует за переименованием. Строка с подставленным именем — именно та, которую вы видите, подтверждаете и запускаете, поэтому после переименования вопрос появится снова. Подставить можно только имя из букв, цифр и `. _ -`, начинающееся с буквы, цифры или `_`, чтобы никакое имя не могло стать синтаксисом оболочки. Любое другое имя, в том числе с пробелом, отклоняется с указанием причины, и строка не выполняется. Чтобы оставить буквальный `{name}` в bash, напишите `{na''me}`. `${name}`, `{{name}}`, `#{name}` и `%{name}` остаются как есть.
**Run All in Folder.** У папки типа **terminal** есть зелёная стрелка рядом с +, и тот же пункт есть в её меню: один клик возвращает все записи, лежащие прямо в ней. Подпапки не запускаются. Сначала всегда появляется вопрос: в нём по порядку перечислены все строки, пометкой (new) отмечена строка, которая ещё не запускалась на этой машине, и названа каждая запись, которая не запустится, с причиной: не запись terminal, нет команды, отклонённое имя, имя с управляющим символом, `{config}` (его подставляет только *Started by* у VPN), *Runs on*, который это окно не может выполнить, или две записи с одним именем, а значит, с одним терминалом. Больше 32 строк или вопрос длиннее 4000 символов отклоняются, потому что вопрос должен показать каждую строку; сократите строку или перенесите часть в подпапку.
**Run** вводит каждую строку в собственный новый терминал и не трогает запись, у которой терминал уже открыт. **Close Open Terminals and Run** предлагается, когда какой-то из них открыт: закрывает эти терминалы, как только зависимости готовы, и вводит также их строки. Закрытие завершает всё, что там выполняется; клиент tmux только отсоединяется, а его сессия продолжает работать. В отчёте написано *Typed*, а не «запущено», потому что что делает строка дальше, не отслеживается.
**Строки запуска папки не ждут друг друга.** Если что-то должно завершиться раньше, держите это вне папки, укажите в *Depends on* и отметьте *Execute what is executable first*: оно выполнится до любой строки папки, и завершения каждого шага дождутся. Соседнюю запись из той же папки, указанную там, не ждут.
**tmux.** `tmux new -A -s {name}` подключается к сессии или создаёт её, поэтому запись работает и после перезагрузки машины. `tmux attach -t '={name}'` сопоставляет имя точно, потому что простой `-t foo` подключится и к `foobar`. Не используйте `.` и `:` в имени сессии: tmux их заменяет, и `a.b:c` становится `a_b_c`. Проверено на tmux 3.6.
```

```text help-ru-wrong
**Зелёная стрелка спрашивает вместо того, чтобы вводить.** Строка, введённая в работающий `tmux attach`, попадает на вход программе внутри него, поэтому в открытый терминал записи стрелка вводит строку, только когда само расширение ввело там строку и увидело завершение этой команды. Иначе она показывает терминал и спрашивает: **Type It Anyway** или отмена. После перезагрузки окна она спрашивает, пока не увидит запуск и завершение строки, пропущенной через **Type It Anyway**; без интеграции с оболочкой — каждый раз; а после **Type It Anyway** поверх ещё работающей команды этот терминал будет спрашивать до конца своей жизни. Строка *Started by* у VPN проходит ту же проверку; если запуск запросил агент, он отклоняется вместо вопроса.
**Зависимость, которая никогда не завершается, держит весь запуск папки.** Она ждёт в терминале `CredsForDevs: before <folder>`, ни одна строка папки не вводится, другие терминалы не открываются, а повторный клик по стрелке ничего не делает. Закрытие этого терминала завершает запуск, и ничего не вводится.
```

```text help-uk-usage
**`{name}` у команді термінала.** У команді або в увімкненому рядку аргументу `{name}` — це ім'я самого запису: у `tmux attach -t {name}` ім'я пишеться один раз і слідує за перейменуванням. Рядок із підставленим іменем — саме той, який ви бачите, підтверджуєте й запускаєте, тож після перейменування запитання з'явиться знову. Підставити можна лише ім'я з літер, цифр і `. _ -`, що починається з літери, цифри або `_`, щоб жодне ім'я не могло стати синтаксисом оболонки. Будь-яке інше ім'я, зокрема з пробілом, відхиляється із зазначенням причини, і рядок не виконується. Щоб залишити буквальний `{name}` у bash, напишіть `{na''me}`. `${name}`, `{{name}}`, `#{name}` і `%{name}` лишаються як є.
**Run All in Folder.** Папка типу **terminal** має зелену стрілку поруч із +, і той самий пункт є в її меню: один клік повертає всі записи, що лежать безпосередньо в ній. Підпапки не запускаються. Спершу завжди з'являється запитання: у ньому по черзі перелічено всі рядки, позначкою (new) виділено рядок, який ще не запускався на цій машині, і названо кожен запис, що не запуститься, із причиною: не запис terminal, немає команди, відхилене ім'я, ім'я з керуючим символом, `{config}` (його підставляє лише *Started by* у VPN), *Runs on*, якого це вікно не може виконати, або два записи з одним іменем, а отже, з одним терміналом. Понад 32 рядки або запитання, довше за 4000 символів, відхиляються, бо запитання має показати кожен рядок; скоротіть рядок або перенесіть частину в підпапку.
**Run** вводить кожен рядок у власний новий термінал і не чіпає запис, термінал якого вже відкритий. **Close Open Terminals and Run**, що пропонується, коли якийсь із них відкритий, закриває ці термінали, щойно залежності готові, і вводить також їхні рядки. Закриття завершує все, що там виконується; клієнт tmux лише від'єднується, а його сесія триває. У звіті написано *Typed*, а не «запущено», бо що рядок робить далі, не відстежується.
**Рядки запуску папки не чекають один на одного.** Якщо щось має завершитися раніше, тримайте це поза папкою, вкажіть у *Depends on* і позначте *Execute what is executable first*: воно виконається перед будь-яким рядком папки, і кожен крок чекатимуть до кінця. На сусідній запис із тієї самої папки, вказаний там, не чекають.
**tmux.** `tmux new -A -s {name}` під'єднується до сесії або створює її, тож запис працює й після перезавантаження машини. `tmux attach -t '={name}'` зіставляє ім'я точно, бо простий `-t foo` під'єднається й до `foobar`. Не використовуйте `.` і `:` в імені сесії: tmux їх замінює, і `a.b:c` стає `a_b_c`. Перевірено на tmux 3.6.
```

```text help-uk-wrong
**Зелена стрілка питає замість того, щоб вводити.** Рядок, введений у працюючий `tmux attach`, потрапляє на вхід програмі всередині нього, тож у відкритий термінал запису стрілка вводить рядок, лише коли саме розширення ввело там рядок і побачило завершення цієї команди. Інакше вона показує термінал і питає: **Type It Anyway** або скасування. Після перезавантаження вікна вона питає, доки не побачить запуск і завершення рядка, пропущеного через **Type It Anyway**; без інтеграції з оболонкою — щоразу; а після **Type It Anyway** поверх ще працюючої команди цей термінал питатиме до кінця свого життя. Рядок *Started by* у VPN проходить ту саму перевірку; якщо запуск запросив агент, він відхиляється замість запитання.
**Залежність, яка ніколи не завершується, тримає весь запуск папки.** Вона чекає в терміналі `CredsForDevs: before <folder>`, жоден рядок папки не вводиться, інші термінали не відкриваються, а повторний клік по стрілці нічого не робить. Закриття цього термінала завершує запуск, і нічого не вводиться.
```

`src/test/folderRunHelp.test.ts` (new):

```ts
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { HELP_LANGUAGES, HelpLanguage, bodyFor, helpArticle } from '../helpContent';
import { articleHtml } from '../helpPage';

/**
 * The folder run in the help, in every language it claims (S4 of `PLAN_terminal_folder_run.md`).
 *
 * <p>`bodyFor` marks a MISSING translation and never a stale one, so a language still silent about the folder run is a
 * complete, non-fallback body that every other test rewards. UI labels and commands stay English and byte-exact in all
 * five (`CLAUDE.md` rule 7): somebody reading German still has to find the button, and to paste the command.</p>
 */

const ID = 'basics';

function whole(language: HelpLanguage): string {
  const article = helpArticle(ID);
  assert.ok(article !== undefined, `no article ${ID}`);
  const shown = bodyFor(article, language);
  assert.equal(shown.fallback, false, `${language} falls back to English`);
  return Object.values(shown.body).join('\n\n');
}

const VERBATIM: readonly string[] = [
  'Run All in Folder',
  'Close Open Terminals and Run',
  'Type It Anyway',
  'Depends on',
  'Execute what is executable first',
  'Started by',
  'Runs on',
  '{name}',
  "{na''me}",
  'tmux new -A -s {name}',
  "tmux attach -t '={name}'",
  '-t foo',
  'foobar',
  'a.b:c',
  'a_b_c',
  'tmux 3.6',
  'CredsForDevs: before <folder>',
  '32',
  '4000',
];

/** Subfolders · a control character · the lines do not wait · our own line seen to finish · without integration every time · a dependency never exits · tmux only detaches. */
const OWN_WORDS: Readonly<Record<HelpLanguage, readonly RegExp[]>> = {
  en: [/Subfolders are not run/, /control character/, /do not wait for each other/, /typed a line there and saw that command finish/, /without shell integration it asks every time/, /never exits/, /only detaches/],
  de: [/Unterordner laufen nicht mit/, /Steuerzeichen/, /warten nicht aufeinander/, /Zeile getippt und diesen Befehl hat enden sehen/, /ohne Shell-Integration jedes Mal/, /nie endet/, /trennt sich nur/],
  es: [/subcarpetas no se ejecutan/, /carácter de control/, /no se esperan entre sí/, /escribió allí una línea y vio terminar ese comando/, /sin integración de shell, cada vez/, /nunca termina/, /solo se desconecta/],
  ru: [/Подпапки не запускаются/, /управляющим символом/, /не ждут друг друга/, /ввело там строку и увидело завершение этой команды/, /без интеграции с оболочкой — каждый раз/, /никогда не завершается/, /только отсоединяется/],
  uk: [/Підпапки не запускаються/, /керуючим символом/, /не чекають один на одного/, /ввело там рядок і побачило завершення цієї команди/, /без інтеграції з оболонкою — щоразу/, /ніколи не завершується/, /лише від'єднується/],
};

test('every_language_holds_the_labels_and_the_commands_byte_for_byte', () => {
  assert.ok(HELP_LANGUAGES.length >= 5, 'the catalog lost a language');
  for (const language of HELP_LANGUAGES) {
    const text = whole(language);
    assert.deepEqual(VERBATIM.filter((label) => !text.includes(label)), [], language);
  }
});

test('every_language_says_it_in_its_own_words', () => {
  for (const language of HELP_LANGUAGES) {
    const text = whole(language);
    assert.deepEqual(OWN_WORDS[language].filter((words) => !words.test(text)).map(String), [], language);
  }
});

test('every_language_renders_the_two_headings_as_emphasis', () => {
  for (const language of HELP_LANGUAGES) {
    const html = articleHtml(ID, language);
    assert.ok(html.includes('<strong>Run All in Folder.</strong>'), language);
    assert.ok(html.includes('<strong>tmux.</strong>'), language);
  }
});

test('the_title_is_covered_by_the_article_and_no_excuse_is_left', () => {
  assert.ok(whole('en').toLowerCase().includes('run all in folder'), 'the words helpCoverage looks for');
  const coverage = fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', 'test', 'helpCoverage.test.ts'), 'utf8');
  assert.equal(coverage.includes('credSshManager.runFolder'), false, 'SELF_EVIDENT wins over the corpus, so S3 left an excuse to delete');
});
```

### B.6 The listing and the root README

**`src_vs_code/README.md`.** Replace the bullet at `:240`, whole:

```markdown listing-run-bullet
- **Run in Terminal** (the same green ▶ as *Connect SSH*) runs the assembled line. Into an entry's
  open terminal it types only when the extension itself typed a line there and saw that command
  finish; otherwise it shows that terminal and asks, *Type It Anyway*, rather than type into a
  `tmux attach` that may be running. After a window reload it asks until a line let through with
  *Type It Anyway* has been seen to start and end, and without shell integration every click asks.
```

Immediately after the paragraph that ends `Waiting for a step needs VS Code **1.93** or newer.` (`:257`), before `## Environment variables in the terminal`, with a blank line each side:

```markdown listing-prose
**`{name}` in the command or an enabled argument row is the entry's own name**, so
`tmux attach -t {name}` needs the name once and follows a rename. The line with the name filled in
is the one you see, approve and run, so a rename asks again. Only a name of letters, digits and
`. _ -`, starting with a letter, a digit or `_`, can stand in for it, so that no name arriving by
sync or share can become shell syntax; any other name, one with a space included, is refused with
the reason and the line does not run. To keep a literal `{name}` in bash, write `{na''me}`.

**Run All in Folder** is the same green ▶ on a folder of type *Terminal command*, beside its `+` and
in its menu: one click types the line of each entry directly in the folder, each into a new terminal
of its own. Subfolders are not run. It always asks first, listing every line in order, with `(new)`
on one not yet run on this machine and the reason beside each entry that will not run. **Run** leaves
alone an entry whose terminal is already open; **Close Open Terminals and Run**, offered when any is
open, closes those terminals and types their lines too. Closing ends whatever runs there; a tmux
client only detaches, and its session goes on. The lines do not wait for each other: something that
has to finish first goes outside the folder, under *Depends on*, and a dependency that never exits
holds the whole run. At most 32 lines and a 4000-character question, because it has to show every
line; an entry whose name holds a control character is not run.

For tmux sessions: `tmux new -A -s {name}` attaches to the session or creates it, so the entry still
works after the machine has rebooted; `tmux attach -t '={name}'` matches the name exactly, because a
bare `-t foo` also attaches `foobar`; and keep `.` and `:` out of a session's name, because tmux
rewrites them (`a.b:c` becomes `a_b_c`). Checked on tmux 3.6.
```

In the table row `| **Terminal commands** |` (`:51`), the last clause `*Run in Terminal*, *Copy Command*, *Show Command and Notes* |` becomes `*Run in Terminal*, *Run All in Folder* for a whole Terminal folder, *Copy Command*, *Show Command and Notes* |`.

S3's phrase at `:1194` stays.

**`README.md` (repo root), `:125`.** The line

`**terminal commands** (arguments as rows, each with its own note), **scripts** (a highlighted editor,`

becomes two:

```markdown root-readme
**terminal commands** (arguments as rows, each with its own note; one click runs one, or a whole
folder of them), **scripts** (a highlighted editor,
```

Nothing else in the root README changes: `readmeClaims.test.ts` pins `**Nine kinds of entry**` a few words above, and it is untouched.

### B.7 `src_vs_code/CHANGELOG.md`

Immediately under `## [Unreleased]`, with a blank line each side. S1 and S2 ship in the same release, so their user-visible changes are here too. `RELEASES.md` is not touched.

```markdown changelog
### Added — one arrow brings back a whole Terminal folder, and `{name}` in a command

- **A folder of type *Terminal command* has a green arrow, *Run All in Folder*, beside its `+` and in its menu.** One
  click types the line of each entry directly in the folder, each into a new terminal of its own; subfolders are not run.
  It always asks first, in a question that lists every line in order, marks with `(new)` a line not yet run on this
  machine, and names each entry that will not run and why. **Run** leaves alone an entry whose terminal is already open;
  **Close Open Terminals and Run**, offered when any is open, closes those terminals and types their lines too. The lines
  do not wait for each other: something that has to finish first goes outside the folder, under *Depends on*. At most 32
  lines and a 4000-character question, because it has to show every line; an entry whose name holds a control character
  is not run.
- **`{name}` in a terminal command is the entry's own name,** so `tmux attach -t {name}` needs the name once and follows
  a rename. The line with the name filled in is the one shown, approved, remembered and typed, so a rename asks again,
  and an entry that already held a literal `{name}` is asked about once. Only a name of letters, digits and `. _ -`,
  starting with a letter, a digit or `_`, can stand in for it; any other name, one with a space included, is refused on
  every road rather than quoted, so that no name arriving by sync or share can become shell syntax. To keep a literal
  `{name}` in bash, write `{na''me}`. An older extension types `{name}` as it stands.

### Changed — the green arrow no longer types into a terminal that may be busy

- **The green arrow and a VPN's *Started by* line type into an entry's open terminal only when the extension itself typed
  a line there and saw that command finish.** A line typed into a running `tmux attach` reached the program inside as a
  message. Otherwise the terminal is shown and you are asked, *Type It Anyway*; a start an agent asked for is refused
  instead. **This asks more often than before, deliberately:** without shell integration (cmd, or the setting off) every
  click on an open terminal asks, and after a window reload it asks until a line let through with *Type It Anyway* has been
  seen to start and end. With shell integration, repeating a command in a terminal the extension typed into, once that
  command has been seen to finish, types silently as it always did.
```

### B.8 The todos: `todo/PLAN_terminal_runs_followups.md` (new)

Whole file, as below. Line numbers in it are from `090f459`; the function name is the address.

```markdown followups
# PLAN — Terminal runs: what the folder run left open

> Status: **plan only, nothing implemented yet, 2026-11-05.** Scope: the VS Code extension's terminal roads, and one repository-level
> item. Recorded by S4 of [PLAN_terminal_folder_run.md](PLAN_terminal_folder_run.md), which built none of it. No item is scheduled.

## Goal

The folder run closed one hazard on the road its owner asked about: a line typed into a live `tmux attach`. Reading that road found
others beside it, and they were left out on purpose, so that plan stayed the size it was approved at. Each item below is a symptom
with its place in the code, decided by nobody yet. An item is built when someone asks for it, as its own change.

## The boundary with the folder run

| Item | Who builds it | The folder run's part |
|---|---|---|
| Items 1 to 10 below | this plan, item by item | none: `PLAN_terminal_folder_run.md` §Not in this plan points here |
| The stale "not arriving from elsewhere" claim in `research/module_extension.md` | done, in its S1 | fixed there, not carried |
| Forged rows in the chain's modal (`describeRunPlan`) | done, in its S5 | fixed there, not carried |

Disjoint: nothing here changes the folder run's decisions A to D. No order is implied between items; item 1 is the one with an owner's
decision behind it, and item 10 is the conventions rollout's rather than this repository's alone.

## The items

### 1. A folder-level command template

**Symptom.** Sessions in one Terminal folder differ only by name, and each entry still stores its own `tmux attach -t {name}`.
**Where.** Decision D of the parent: `{name}` only for now, a template on the folder is a later todo. `TreeNode` holds a folder's
fields (`src/types.ts:388`); `resolveCommand` (`src/commandLine.ts`) is the one road a template would have to join. **To decide:**
whether an empty entry inherits or a copy is stored, and what an older device's edit does to a field it does not know.

### 2. `sendPinned` can type into a busy pinned terminal

**Symptom.** The hazard the green arrow had, on a line the extension composes. `sendPinned` (`src/pinnedTerminal.ts:81`) reuses a live
terminal of the name and shell through `pinnedTerminal`, then calls `sendText`. A tunnel's start or stop (`src/vpnRun.ts:233`,
`sendToVpnTerminal`) and an installer (`src/toolEnsure.ts:24`) both go through it. **Fix to consider:** the same guard,
`src/terminalGuard.ts` `sendGuarded`.

### 3. The green arrow types `{config}` literally

**Symptom.** `arrowLine` (`src/commands/runCommands.ts`) resolves `{name}` and lets `{config}` through, so clicking a VPN launcher's own
arrow types `openvpn {config}` into a shell. A chain step refuses this (`src/dependencyRun.ts`, `stepRefusal`), and so does a folder
run (`uses {config}`, `src/folderRun.ts`). **Fix to consider:** the arrow refuses with the same sentence.

### 4. `fresh` disposes by name

**Symptom.** `pinnedTerminal(name, { fresh: true })` closes every live terminal of the name (`src/pinnedTerminal.ts:101-103`), so a
script run (`launchScript`, `src/commands/runCommands.ts:221`) kills the terminal of a same-named Terminal entry, whatever runs there. The
chain does the same by hand (`chainTerminal`, `src/dependencyRunHost.ts:192`), so a chain for a folder or entry `x` kills the terminal
of an entry named `before x`, which also goes against a folder run's `Run` leaving open terminals alone. **Fix to consider:** remember the terminal objects the road itself opened, as the folder run's closing button does.

### 5. `quoteFor('powershell', …)` and typographic quotes

**Symptom, from memory and not measured:** PowerShell reads `‘` and `’` as quotes, and `quoteFor` (`src/hostShell.ts:117-125`) doubles only
the ASCII `'`, so a value holding a typographic quote could end the string. No `pwsh` on the machine this was written on. **First step:**
measure it where `pwsh` exists. It reaches `{config}` paths (`substituteConfig`, `src/vpnLauncher.ts`); `{name}` is not exposed, because
the allow-list refuses those characters.

### 6. An agent-served launcher refusal comes late and is reported as `no_credential`

**Symptom.** With a `startGate`, the busy guard's refusal is reached in `launch` (`src/vpnLauncherRun.ts`, `sendGuarded`), after
`dependenciesThenLaunch` has run the chain and `configFor` has written the VPN's config to disk. `launch` answers `false`, and
`vpnOutcome` (`src/agentUseActions.ts:428`) turns any `false` for a live client into `fail('no_credential', …)`: the agent is told a
credential is missing when a terminal was busy, and the person has a config file and a chain they did not need. **Fix to consider:** ask
the guard before the chain, and give the refusal its own failure code, with the same check repeated at the send.

### 7. Other modals still show a raw name or line

**Symptom.** §3's escaper sentence of the parent covers the folder run's modal and report and the chain's modal. Outside it, the arrow's
busy question (`busyQuestion`, `src/terminalActivity.ts`) and its trust modal (`confirmCommandMessage`, `src/commandTrust.ts`) show the
terminal's name, the entry's name and the line as stored, and the warnings naming a step (`stepVerdict`, `stepRefusal`, `nameStepRefusal`,
`src/dependencyRun.ts`) show the name. A name arrives unvalidated by sync and share, so a newline there can still draw text that looks like
the question's own. **Fix to consider:** `escapeControl` (`src/transitSecretReport.ts`) at each, keeping what is typed unchanged.

### 8. The `unknown` question no longer says every reason

**Symptom.** `busyQuestion` (`src/terminalActivity.ts`) says `no shell integration reported it, or the window was reloaded since`. Since S5
a terminal also reads `unknown` when the extension has not typed there this activation, when it typed and has seen no start yet (`armed`), and
for life after a sub-shell signature (`poisoned`). The sentence names none of those. **Fix to consider:** a reason that does not
claim to be the whole list. `terminalActivity.test.ts` pins only `/cannot tell/`, so the rest may change.

### 9. The report's cut at about 1,000 characters was read, not measured

**Symptom.** `folderReport` (`src/folderRun.ts`) puts what must not be lost first, because a notification is cut at about 1,000 characters.
That number comes from reading VS Code's source (parent §3 step 8), not from a window. **First step:** a long report in a real window, beside the
parent's hand check 8. If the cut is elsewhere, only the comment and the parent's sentence change, since the order is right at any length.

### 10. `rules.mjs check` reports this repository incomplete

**Symptom, measured 2026-11-05.** `node .claude/rules/shared/tools/rules.mjs check --repo .` answers
`rules check: INCOMPLETE — Missing instruction source: <root>/AGENTS.md`. This repository is an un-migrated consumer: `CLAUDE.md` and the
`.claude/rules/shared` submodule, with no `AGENTS.md`, no `.agents/PROJECT.md` and no `.agents/conventions`, so the shared entry's
rule selection cannot run here and an agent reads the rules by hand. **Where it belongs:** `dew_flow_conventions · todo/PLAN_shared_rules_claude_codex.md`,
the rollout. Named here so that the next session does not read the answer as a new fault.

## Budget

None of these creates anything that grows. Item 6's early refusal writes less than today.

## Build order

None between items. Each is its own branch and pull request, and item 2 before item 6 only if both are wanted, since both change the guard's
callers. An item this document's reader finds already done is removed in the commit that did it.

## Test plan

Items 2, 3, 4 and 6 go in the stub world of `src/test/vpnWorld.ts`, watched failing first against today's code. Item 5 needs a real `pwsh`,
explicitly skipped where absent, as `commandNameShell.test.ts` does. Item 7 is a pure table in `terminalActivity.test.ts` and `dependencyRun.test.ts`,
with a name holding a newline, U+2028 and a tab. Item 8 is one pure assertion on the new wording. Item 9 is a hand check, not a test. Item 1 starts
with its decision, not a test. Item 10 is proved by the command above answering clean.

## Definition of Done

- [ ] Each item is built, or removed with the reason, and this file then promoted or deleted per `planning-docs.md`.
- [ ] A built item has a test watched failing first, and a line in `research/module_extension.md` and `research/module_tests.md`.
- [ ] `node .claude/rules/shared/tools/plan-lifecycle.mjs` clean.
```

In the next two blocks `(FOLLOWUPS)` stands for the link target `(PLAN_terminal_runs_followups.md)`: write the real target. It is spelled so here because `plan-lifecycle.mjs` reads links inside code fences too, and that file does not exist until S4's commit.

`todo/README.md`, a new row at the top of the table under `## Currently open`, in the same commit:

```markdown readme-row
| [PLAN_terminal_runs_followups.md](FOLLOWUPS) | plan only, 2026-11-05 | What the terminal folder run left open, by decision: a folder-level template, `sendPinned`, the arrow's `{config}`, `fresh` disposing by name, PowerShell's typographic quotes, the launcher refusal reported as `no_credential`, raw names in the other modals, the `unknown` question's wording, the report's unmeasured cut, and this repository's un-migrated rules check. Nothing scheduled. |
```

`todo/PLAN_terminal_folder_run.md`, §Not in this plan, the line `Recorded in `todo/` by this plan's last commit, not built:` becomes:

```markdown parent-pointer
Recorded in [PLAN_terminal_runs_followups.md](FOLLOWUPS) by this plan's last commit, not built:
```

### B.9 `research/module_extension.md`

In section *Terminal commands*, S3's paragraph **The folder run** holds the sentence ``The command is not yet on any menu (S4 puts the arrow on the folder row and writes the help); until then the manifest hides it from the palette (`when: "false"`).`` (`research/module_extension.md:2170-2171`, wrapped over the two lines.) Replace it with ``The manifest hides it from the palette (`when: "false"`), and the arrow is told below.`` Then, immediately before **Runs on — the OS a command is written for** (`:2236`), after the folder run's last paragraph (*The report*):

```markdown extension-menu
**The arrow on the folder row (`treeRowText.ts`, `package.json`).** `folderContextValue` adds `:runall`, last, to a folder whose
`folderType` is `terminal` and which is not in the Trash; `treeDataProvider.ts` hands it the node's type, and the Trash itself stays
`trashFolder`. `credSshManager.runFolder` sits on `inline@0`, beside `+` on `inline@1`, and on `2_actions@0`, both under
`/^folder(:.*)?:runall$/`, so a folder with a PIN preference or a project lock keeps it. It stays hidden from the palette (`when: false`):
it acts on a row, and a palette call arrives with no target. The token holds no `:cmd` and no `:vpnrun`, so no entry clause reads it.
Six clauses read the plain row exactly (`addEntity` on `inline@1` and `1_create@2`, `addFolder` `1_create@1`, `changeFolderType` `1_create@3`,
`folderUp` `0_order@1`, `folderDown` `0_order@2`) and take `(:runall)?`. They were found by evaluating every clause of the menu against
every folder value with and without the token, and `folderMenu.test.ts` keeps doing that: a clause that stops matching takes its item
away with no error. Prefix clauses needed nothing, and a `folder:asksforpin` or `folder:locked` row had no exact clause to lose. The token
is discoverability: F2 and the palette reach the handler with no menu, so `folderTarget` re-reads and refuses there too.
The fourth parameter is optional with no default, because a default value counts towards the complexity limit of 4 and the function is at it;
`max-params` is not a rule here, so no options object was needed.

**The words.** The folder run, `{name}`, the busy guard and the tmux suggestions are in the `basics` article (`usage` and
`whatCanGoWrong`), in all five languages with UI labels in English (`CLAUDE.md` rule 7): that article is where a terminal entry and *Depends on*
already live. `folderRunHelp.test.ts` holds the labels and commands byte for byte in every language, because `bodyFor` marks a missing
translation and never a stale one. `helpCoverage` covers the title through the English text, and S3's temporary `SELF_EVIDENT` entry is gone.
The walkthrough did not change: it shows one credential used without retyping, and a folder run is for someone who already has a folder of sessions.
```

### B.10 `research/module_tests.md`

A new section immediately after S5's (`## The re-review's fix forward (2026-11-05, S5 of PLAN_terminal_folder_run.md)`, `:1242`), before `## A gone request reaches no SSH prompt` (`:1308`):

```markdown tests-section
## The arrow on the folder row, and the words (2026-11-05, S4 of PLAN_terminal_folder_run.md)

A menu `when` clause is data nothing compiles, so the arrow is proved by evaluating every clause of the REAL `view/item/context` over every
value `folderContextValue` produces. The evaluator reads the five forms the manifest uses, and throws on any other. Run from `src_vs_code`:
`npm run compile`, then `node --import ./scripts/lower-priority.mjs --test out/test/folderMenu.test.js out/test/folderRunHelp.test.js out/test/treeProviderTrash.test.js`.

| Flow | Test | What it holds down |
|---|---|---|
| The token | `folderMenu.test.ts` | the older values byte-identical, `:runall` last, present exactly for an untrashed `terminal` over every flag and every type |
| The menu | `folderMenu.test.ts` | menu(`x:runall`) is menu(`x`) plus `runFolder` on `inline@0` and `2_actions@0`, for all four untrashed values; a companion that the scan found `addEntity`; the whole arrow clause pinned |
| Nothing else | `folderMenu.test.ts` | no `runFolder` on a Terminal entry, `account`, `trashFolder`, `folder:trashed`, or a trashed Terminal folder; no `/:cmd/` or `/:vpnrun/` clause reads `:runall` |
| The call site | `treeProviderTrash.test.ts` | the real `getTreeItem` hands the node's type over, and the Trash stays `trashFolder` |
| The words | `folderRunHelp.test.ts` | every language holds the labels and the commands byte for byte, says the seven facts in its own words, and renders the headings; `helpCoverage` holds no excuse for the title |

**Teeth.** Each mutation was applied alone, watched red, and restored: see the table below as measured on this code.

**Not covered, and why.** Driving a real tree stays not covered, for the reason this file gives: nothing here drives VS Code. The clauses were
read against VS Code's parser and evaluated by this suite's own, not VS Code's, so the arrow's place beside `+` is the parent plan's hand
check 8. Translations are checked for facts, not for quality.
```

Under **Teeth**, add the coder's own table of §C's mutations with what actually went red.

## C. Commands

```bash
cd src_vs_code
npm ci                                   # only if node_modules is missing
npm run typecheck && npm run lint
npm test                                 # compiles, then node:test over out/test/*.test.js, lowered, at most 8 workers
npm run itest:masked-run
# the suites of this story, after npm run compile:
node --import ./scripts/lower-priority.mjs --test out/test/folderMenu.test.js out/test/folderRunHelp.test.js out/test/treeProviderTrash.test.js
# the guards this story can break:
node --import ./scripts/lower-priority.mjs --test out/test/manifest.test.js out/test/commandsRegistered.test.js out/test/helpCoverage.test.js out/test/helpCatalog.test.js out/test/helpContent.test.js out/test/listingCoverage.test.js out/test/readmeClaims.test.js out/test/sizeRatchet.test.js out/test/notForExportMenu.test.js out/test/treeRowText.test.js
cd ..
node .claude/rules/shared/tools/plan-lifecycle.mjs
node .claude/rules/shared/tools/pin-check.mjs
```

**The artefact** (`.claude/rules/shared/common/development-workflow.md` *Verify the ARTEFACT, not the source*). `vscode:prepublish` rebuilds `dist/`; the `.vsix` is git-ignored (`.gitignore:83`) and is removed here, with the folder it was unzipped to. `unzip` is not installed on this machine, so Python's `zipfile` does the unzipping:

```bash
cd src_vs_code
node ../.claude/rules/shared/tools/low-priority.mjs npm run package
VSIX="$(ls -t ./*.vsix | head -1)"
OUT="$(mktemp -d)"
python3 -m zipfile -e "$VSIX" "$OUT"
grep -c 'credSshManager.runFolder' "$OUT/extension/package.json"           # expect 4: the command, the palette, two menu items
grep -c 'folder(:.\*)?:runall'     "$OUT/extension/package.json"           # expect 2
grep -c 'credSshManager.runFolder' "$OUT/extension/dist/extension.js"      # expect 1: the registration
grep -c 'Close Open Terminals and Run' "$OUT/extension/dist/extension.js"  # measured 7: S3's constants and five languages' usage
grep -c 'tmux new -A -s {name}' "$OUT/extension/dist/extension.js"         # expect 5: one line per language
rm -rf "$OUT" "$VSIX"
```

**What the prototype answered,** with every block of this brief applied by a script to a clean export of `090f459`: `tsc` clean, `eslint src` clean, `plan-lifecycle.mjs` clean, `npm test` 6,242 tests, 6,236 passing, 6 skipped, 0 failed, `npm run itest:masked-run` passed. Every mutation below went red as listed, and the baseline was green. The artefact counts above are its own: 4, 2, 1, 7, 5. There it was packaged with `npx vsce package --no-dependencies`, not `npm run package`, because `npm list --parseable` masks a UUID in a path as `***` and the scratch path holds one, so vsce found no files. The worktree's path holds none, so `npm run package` is the command here, and it is yours to run first. If it answers `Extension entrypoint(s) missing`, say so in your summary; do not change `.vscodeignore`.

Report every count in your summary. Read the exit of a clean `tsc` before any suite number. Do not commit or push: the caller does.

**Order.** §B.3 first, against today's `treeRowText.ts` and manifest: `npm run compile` will fail on the fourth argument, so add the parameter with no token first, and see tests 1, 2, 5, 6 and 10 red. Copy those failures into your summary. Then the token and the arrow items without the six clauses, and see tests 5 and 6 fail, 5 naming all six items: this is the failure the clauses exist for. Then the six clauses. Then §B.4 and §B.5 (test 14 red before §B.4), then §B.6 to §B.10.

**Red again, each applied alone, watched and restored, the result in the summary.** The expected reds were measured on the prototype:

| # | Mutation | Expected red |
|---|---|---|
| M1 | `flag('runall', folderType === 'terminal')`, no `!trashed` | 1, 2, 7, 10 |
| M2 | `:runall` first after `folder`, not last | 1, 5 |
| M3 | `addEntity` `inline@1` back to `/^folder$/` | 5, 6 |
| M4 | `folderUp` back to `viewItem == folder` | 5 |
| M5 | `addFolder` back to `/^(account\|folder)$/` | 5 |
| M6 | the arrow's clause `/^folder:runall$/` on both items | 5, 6 |
| M7 | the arrow's clause `/:runall/` on both items | 6, 8 |
| M8 | `treeDataProvider.ts` stops passing `node.folderType` | 10 |
| M9 | `holds` answers `true` where it throws | 3 |
| M10 | S3's `SELF_EVIDENT` entry back | 14 |
| M11 | `Run All in Folder` translated in `helpDe.ts` | 11, 13 |
| M12 | one paragraph of `helpUk.ts` deleted (the tmux one) | 11, 13 |
| M13 | `Run All in Folder` gone from `helpEn.ts`'s heading | 11, 13, 14, and `helpCoverage`'s `every command in the manifest is described in the help` |

**Done when** (parent's S4): the arrow shows on an untrashed terminal folder including one with `:asksforpin` or `:locked`, and on nothing else; every row above passes; `manifest`, `commandsRegistered`, `helpCoverage`, `listingCoverage`, `helpContent`, `sizeRatchet`, eslint, typecheck and the whole suite green; `git diff --stat` shows no `RELEASES.md`, no `media/walkthrough/`, no `src/commandTrust.ts`, no `extension.ts`; the `.vsix` counts above reported; `todo/PLAN_terminal_runs_followups.md` and its README row exist; `plan-lifecycle.mjs` and `pin-check.mjs` clean.

## D. Out of scope: do not touch

- The folder run's behaviour: `folderRun.ts`, `folderRunCommand.ts`, `terminalGuard.ts`, `commandName.ts`, `dependencyRun*.ts`. The texts of S2, S3 and S5 stay as committed at `090f459` (S5 changed S3's report and chain sentence); the help describes them.
- A new help article, a change to `helpOrder.ts` or `helpCatalog.test.ts`'s count.
- The ten items of §B.8: recorded, not built. Validating a name at save, share or sync.
- `*Abhängig von*`, `*Gestartet von*`, `*Läuft auf*`, `*Depende de*`, `*Iniciado por*`, `*Se ejecuta en*` and the like in the older text of `helpDe.ts` and `helpEs.ts`: they predate this story. Its new text uses the English labels, as rule 7 says.
- `*Move Up* / *Move Down* order it by hand` in `basics.usage`: older text, not about this story.
- `RELEASES.md`, the version in `package.json`, `package-lock.json`: release-please's.
- `media/walkthrough/`, the `walkthroughs` block. Hand checks: they are the owner's, and do not gate this story.
- Promoting the parent plan, ticking its Definition of Done, the coai round: the caller's.
- New requirements. A defect you find in the plan is reported in your summary, not fixed here: epoch 2 allows one change before the plan stops again, and spending it is the caller's decision.
