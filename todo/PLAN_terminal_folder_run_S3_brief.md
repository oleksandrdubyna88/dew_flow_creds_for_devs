# PLAN — S3 scenarios and brief: the folder run

> Status: **built, in review, 2026-11-05.** Parent: [PLAN_terminal_folder_run.md](PLAN_terminal_folder_run.md).
> Story S3 of the parent's `## Stories` (parent §Design 3, decisions A, B, C). Written by an Opus judge; Sonnet codes from
> it and rediscovers nothing; Opus reviews. Scope: `src_vs_code` plus two research documents. No menu clause, no `:runall`,
> no help article, no CHANGELOG (S4). `README.md` gets exactly one phrase and `helpCoverage.test.ts` one temporary entry (§B.8).
>
> **Line numbers** are from commit `8c0c522` with S2 in progress. S2 does not edit `pinnedTerminal.ts`, `terminalGuard.ts`
> or `dependencyRunHost.ts`, so those numbers hold. In `dependencyRun.ts`, `commandLine.ts`, `runCommands.ts` and the test
> worlds the **function name** is the address and the number a hint.
>
> **How the code below was checked.** It was prototyped in a scratch copy of the tree as S2 stood during the writing of this brief, with every production edit of §B and all 68 rows written as tests: `tsc` clean, `eslint` clean on every file of this story (the one report, `startVpn`, is S2's, §B.9), rows 1-68 green, and the whole suite 6,089 passing with 4 skipped. Its 2 failures, `localCpuBudget` and `readmeClaims`, came from root files missing in that copy, and both suites passed once they were linked. Every expected red in §C was measured there. Windows and macOS were not run, and no real VS Code ran. Code blocks are the design; a docblock may be
> reworded, a string the tests match may not.

## A. Scenarios

Each row is one `test()`, its title the name in the column. Fixtures of `src/test/folderWorld.ts` (§B.9): `session(name, extra?)` is a
Terminal entry with id `name`, command `tmux attach`, row `-t {name}`; `L(name)` is `tmux attach -t <name>`; `T(name)` is
`CredsForDevs: <name>`; `step(name)` is an entry outside the folder whose line is `do-<name>`; `FOLDER` is `claude sessions`. `named(w, n)` is
`w.terminals.filter((t) => t.name === T(n))`, oldest first. `pin(w)` sets `w.vscode.env.shell` to `/bin/bash` on Windows and `pwsh` elsewhere, so an entry with
`terminalOs: hostOs` takes the pinned road. Modals answer their first button unless a row says `last`, `dismiss` or `held`.

### A.1 Pure: `src/test/folderRun.test.ts`

No stub: importing `../folderRun` directly is the proof that it holds no `vscode`. `FACTS` is `{ shellRefusal: () => undefined, isOpen: () => false }`; `term(name, command?, args?, extra?)` is a `TreeNode` of a Terminal entry.

| # | Test | Given | When | Then |
|---|---|---|---|---|
| 1 | `every_reason_in_order_first_match_wins` | direct entries: a password `pw`; `empty` (command `  `); `a b` (uses the token); `cfg` (`openvpn {config}`); `os` with `terminalOs: 'plan9'`, `shellRefusal` answering `"os" is written for plan9.` for it; `dup` twice; `ok` | `planFolderRun` | rows in that order: `not a Terminal entry`; `no command`; `NAME_REFUSAL`; `uses {config}, which only a VPN's "Started by" fills in`; the shell's sentence; `another direct entry has the same name, and they would share one terminal` twice; `run` with `tmux attach -t ok` |
| 2 | `an_earlier_reason_beats_open` | `a b`, `isOpen` always true | plan | `notRun` |
| 3 | `a_duplicate_is_only_among_rows_that_could_run` | a password `x`, a Terminal `x` with no command, a Terminal `x` with a line (three ids) | plan | `notRun`, `notRun`, `run`: the first two would have no terminal to share |
| 4 | `both_duplicates_open_stay_not_run` | `dup` twice, `isOpen` true | plan | both `notRun` |
| 5 | `open_comes_from_the_fact_and_only_there` | `a`, `b`, `isOpen` true for `a` | plan | `open`, `run` |
| 6 | `names_and_lines_come_from_details_name` | node name `other`, `details.name` `alert`, command `x {name}` | plan | row name `alert`, line `x alert` |
| 7 | `no_details_is_named_by_the_node` | an entity node `bare` with no `details` | plan | `notRun`, name `bare`, `not a Terminal entry` |
| 8 | `display_order_is_kept_and_subfolders_are_named_not_rows` | `[folder sub, b, a]`, in the order given | plan | rows `b, a`; `subfolders` `['sub']`; `directIds` `b, a`, and no subfolder |
| 9 | `a_disabled_row_cannot_refuse` | name `a b`, command `ls`, a disabled row `-t {name}` | plan | `run`, line `ls` |
| 10 | `run_types_run_rows_and_close_types_open_rows_too` | `a`; `b` open; `a b` | `linesToType(plan, false)`, `(plan, true)` | `[a]`; `[a, b]` |
| 11 | `the_cap_counts_every_row_with_a_line_and_names_the_count` | 32 rows; 33 rows; 33 rows, 32 of them open | `beforeAsking('F', plan)` | `undefined`; a warning matching `/"F" has 33 entries that could run.*at most 32/`; the same text: `Close Open Terminals and Run` could type all of them, and the modal shows all of them |
| 12 | `the_cap_ignores_rows_with_no_line` | 40 refused names and `ok` | `beforeAsking` | `undefined` |
| 13 | `no_line_reports_with_no_modal_and_an_empty_folder_says_so` | `x` with no command; a folder holding only a subfolder | `beforeAsking` | `{ text: 'Typed 0 of 1 in "F". Not run: x — no command.', warning: true }`; `{ text: '"F" has no entries of its own to run. A folder run covers only its direct entries, and subfolders are not run.', warning: false }` |
| 14 | `the_buttons_follow_the_rows` | only `run`; both; only `open` | `folderButtons` | `[Run]`; `[Run, Close Open Terminals and Run]`; `[Close Open Terminals and Run]` |
| 15 | `the_question_says_everything_the_plan_requires` | subfolder `sub`; `a` new; a name of 400 `x`; `o` open and new; `p` with no command | `folderQuestion('F', plan, isNew)` | starts `Run the entries of "F"?\n\nTyped, each into a new terminal:\n1. (new) a: tmux attach -t a\n2. `; holds the 400-character line whole; `\n\nTerminal already open:\n1. (new) o: tmux attach -t o\n\n`; `\n\nNot run:\np — no command\n\n`; `1 subfolder is not run: sub.`; `do not wait for each other`; `sibling named under Depends on is not awaited`; `Run leaves the open terminals alone. Close Open Terminals and Run closes`; `Closing ends whatever runs there; a tmux client only detaches`; `(new) marks a line`; ends with `READ_EACH_LINE` |
| 16 | `the_question_drops_what_does_not_apply` | only a trusted `run` row; then only an `open` row | `folderQuestion` | first: none of `(new)`, `Terminal already open`, `Not run:`, `subfolder`, `Close Open`. Second: no `Run leaves`, no `Typed, each`, but `Close Open Terminals and Run closes` |
| 17 | `the_report_is_the_exact_sentence` | typed `a, b, c`, open `d`, notRun `e` with `reason` | `folderReport('claude sessions', …)` | exactly `Typed 3 of 5 in "claude sessions": a, b, c. Left alone, terminal already open: d. Not run: e — reason.` |
| 18 | `the_report_groups_reasons_and_trims_a_full_stop_and_never_says_started` | notRun `e` `same.`, failed `f` `other`, notRun `g` `same.` | `folderReport('F', …)` | exactly `Typed 0 of 3 in "F". Not run: e, g — same; f — other.`, and `/started/i` does not match |
| 19 | `the_channel_follows_the_outcome` | typed + open + notRun; only open; typed + failed | `reportNotice(…).warning` | `false`; `true`; `true` |
| 20 | `settle_leaves_alone_what_appeared_and_what_run_does_not_type` | `a` run, `b` open, `x` no command | `settleRow` per row: not closing and nothing appeared; closing and nothing appeared; closing and everything appeared | `type, open, notRun`; `type, type, notRun`; `open, open, notRun` |
| 21 | `the_target_is_refused_in_code` | a terminal folder; `undefined`; `type: 'entity'`; `folderType: 'any'`; a terminal folder under a Trash | `folderTarget(node, byId)` | `ok`; the four refusals of §B.2 |

### A.2 Stub world: `src/test/folderRunCommand.test.ts`

The real handler, reached through the real `registerRunCommands`.

**The run**

| # | Test | Given | When | Then |
|---|---|---|---|---|
| 22 | `a_run_types_each_line_into_its_own_new_terminal_and_reports_typed` | `a`, `b` | click | each terminal's `sent` is its own line; `infos` is exactly `Typed 2 of 2 in "claude sessions": a, b.`; nothing matches `/started/i` |
| 23 | `the_modal_is_always_shown_even_when_every_line_is_trusted` | `a`, trusted | click | one text matches `/^Run the entries of /`, without `(new)` |
| 24 | `a_dismissed_modal_runs_nothing_and_trusts_nothing` | `a`, `dismiss`; then a second world where `a` is already trusted | click | first: no terminal, `a` not trusted, no info. Second: no terminal: a trusted line is not typed past a dismissal either |
| 25 | `approving_trusts_each_typed_line_and_new_marks_the_untrusted` | `a` new, `b` trusted | click | the modal holds `1. (new) a: tmux attach -t a\n2. b: tmux attach -t b`; `isCommandTrusted(w.trust, 'a', L('a'))` |
| 26 | `all_lines_are_trusted_though_the_store_rewrites_its_whole_list` | four entries, `slowTrust` | click | all four trusted. `trustCommand` reads, then writes the whole list, so a `Promise.all` loses all but one |
| 27 | `the_line_typed_is_the_approved_string_even_if_the_entry_changed_meanwhile` | `a`, modal held | while it sits, the test changes that entry's `commandArgs` to `-t evil` | `sent` is `[L('a')]`, the string in the modal |
| 28 | `thirty_three_lines_refuse_with_no_modal` | 33 entries | click | no terminal; one warning, matching `/has 33 entries that could run/` |
| 29 | `thirty_two_lines_all_run` | 32 entries | click | 32 terminals |
| 30 | `nothing_with_a_line_reports_with_no_modal` | `a b` | click | one warning, starting `Typed 0 of 1 in "claude sessions". Not run: a b — ` |
| 31 | `the_activity_is_noted_first` | `a` | click | `w.activity()` is 1; also on a refused target (row 47) |

**Left alone, and the re-check**

| # | Test | Given | When | Then |
|---|---|---|---|---|
| 32 | `run_leaves_an_open_terminal_alone_types_the_rest_and_does_not_trust_its_line` | `a`, `o`, `preopened: [T('o')]` | click, `Run` | `o`: `sent` empty, `disposed` 0, not trusted; `a` typed; info `Typed 1 of 2 in "claude sessions": a. Left alone, terminal already open: o.` |
| 33 | `the_open_test_is_any_shell` | `a`, `o` with `terminalOs: hostOs`, `pin(w)`; live terminal `T('o')` on `/some/other/shell` | click, `Run` | `o`'s one terminal has `sent` empty. The pinned road's same-shell test would call this free |
| 34 | `a_run_row_whose_terminal_appeared_while_the_modal_sat_moves_to_open` | `a`, `b`, held | `w.list(w.open(T('a')))`, then `Run` | `a`'s one terminal has `sent` empty; `b` typed; `Typed 1 of 2 … : b. Left alone, terminal already open: a.` |
| 35 | `a_terminal_opened_while_the_chain_ran_moves_its_row_to_open` | `a` depends on `dep`, `b`; `onExecute` lists a new `T('a')` | click | as 34 |
| 36 | `an_open_row_whose_terminal_exited_under_run_is_still_left_alone` | `a`, `o` open, held | `w.exit(live)`, then `Run` | `o` has no new terminal; the report says `Left alone, terminal already open: o.`: `Run` approved no line for it |

**`Close Open Terminals and Run`**

| # | Test | Given | When | Then |
|---|---|---|---|---|
| 37 | `with_only_open_rows_the_only_button_closes` | `o` open, held | read the buttons; dismiss | `[Close Open Terminals and Run]`; after the dismissal `disposed` 0, no info |
| 38 | `both_buttons_when_both_kinds_of_row_exist` | `a`, `o` open, held | read | `[Run, Close Open Terminals and Run]` |
| 39 | `close_closes_every_live_terminal_of_the_name_in_any_shell_and_types_into_a_new_one` | `a`, `o` with `terminalOs: hostOs`, `pin(w)`, live `T('o')` twice (default; `/some/other/shell`), `last` | click | `named(w,'o')` has 3 records: `disposed` `[1, 1, 0]`, `sent` `[[], [], [L('o')]]`; `o` trusted; `Typed 2 of 2 … : a, o.` |
| 68 | `a_new_terminal_never_comes_from_find` | `o` with no OS, one live terminal; the only button | click | records `[[], 1]` and `[[L('o')], 0]` as `[sent, disposed]`. The world's `dispose` leaves it listed and live and the default road's find answers `live[0]`, so a find would type into the disposed terminal. Row 39 cannot prove this: its pinned find answers none |
| 40 | `nothing_reads_the_terminal_list_after_a_close` | `a`, `o` open, `z`, `last` | click | `w.listReadsAfterDispose() === 0` |
| 41 | `a_terminal_opened_while_the_modal_sat_stays_open_and_its_row_is_left_alone` | `a`, `o` open, held | list a new `T('o')`, then the closing button | both `o` terminals `sent` empty, `disposed` 0: the newcomer was never authorised, and the authorised one is not closed for a line that will not be typed. `Typed 1 of 2 … : a. Left alone, terminal already open: o.` |
| 42 | `an_authorised_terminal_that_exits_while_the_modal_sat_is_not_disposed_and_its_line_is_typed` | `o` open, held | `w.exit(live)`, then the closing button | the old `disposed` 0, `sent` empty; a new one got `L('o')` |
| 43 | `an_authorised_terminal_that_started_a_command_while_the_modal_sat_is_still_closed` | `o` open, held | `w.shell.start(live)`, then the closing button | `disposed` 1: the modal said it ends whatever runs there |
| 44 | `closing_comes_after_the_chain_is_ready` | `o` open, depends on `dep`, `last`; `onExecute` records `disposed` | click | recorded `[0]`; afterwards 1 |
| 45 | `a_chain_refusal_types_nothing_and_closes_nothing` | `o` open, depends on a step with `terminalOs: 'plan9'`, `last` | click | `o`: `sent` empty, `disposed` 0; one warning names `plan9`; another is exactly `Nothing was typed in "claude sessions" and no terminal was closed: the dependencies did not finish.`; no info |
| 46 | `a_declined_chain_types_nothing_and_closes_nothing` | as 44, both modals held | closing button; the second modal matches `^Before "claude sessions", these run in`; dismiss it | `o`: `sent` empty, `disposed` 0 |

**Refusals, overlap, failures**

| # | Test | Given | When | Then |
|---|---|---|---|---|
| 47 | `the_handler_refuses_in_code` | `folderType: 'any'`; a folder under a Trash; no target; a target that is an entry | click | no terminal in any case; warnings match `is not a Terminal folder`, `is in the Trash`, exactly `NO_FOLDER_TARGET`, `"a" is not a folder` |
| 48 | `a_second_click_while_the_modal_is_open_does_nothing` | `a`, held | a second click, NOT awaited: `until` an info or a second held modal (without the mark it would sit in a second modal and hang the suite); then `Run`, then await both | one modal; info exactly `A run of "claude sessions" is already waiting for you or for its dependencies, so this click did nothing.`; `a` typed once |
| 49 | `a_second_click_while_the_chain_runs_does_nothing` | `a` depends on `dep`; `onExecute` clicks again, once only | click, then await that click too | one modal; one `a` terminal |
| 50 | `the_next_click_asks_again_after_a_dismissal` | `a`, `dismiss` | click twice | two modals: the in-flight mark left in its `finally` |
| 51 | `another_folder_is_not_held_up` | `a`, held, subfolder `s` | click on `sub-s` | info `"s" has no entries of its own to run. …`, and not the overlap sentence |
| 52 | `one_failure_at_opening_does_not_stop_the_rest` | `a, b, c`, `failCreate: /: b$/` | click | `a` and `c` typed, no `b`; the last warning is exactly `Typed 2 of 3 in "claude sessions": a, c. Not run: b — no terminal for CredsForDevs: b.`; no info |
| 53 | `one_failure_at_typing_does_not_stop_the_rest` | `a, b`, `failSend: /: a$/` | click | `b` typed; warning matches `/Typed 1 of 2 .*: b\. Not run: a — no line for/` |
| 54 | `the_tracker_hears_of_the_send_before_the_keystrokes_leave` | `a`; mock `'./terminalActivityTracker'` with a `noteSent` logging, `onSend` logging | click | log is `['noted', 'sent ' + L('a')]` |
| 55 | `a_pinned_entry_opens_with_the_pinned_shell_and_a_default_one_without` | `p` with `terminalOs: hostOs`, `d`; `pin(w)` | click | `p`'s `shellPath` is set; `d`'s is `undefined` |
| 56 | `opening_disposes_nothing_on_the_run_button` | `a`; a listed terminal `CredsForDevs: a-other` | click | every `disposed` is 0 |

**The chain**

| # | Test | Given | When | Then |
|---|---|---|---|---|
| 57 | `roots_are_only_the_lines_to_be_typed_a_skipped_entry_does_not_rerun_its_dependencies` | `a`; `o` open, depends on `dep` with `runDependencies` | click, `Run` | no terminal named `CredsForDevs: before …`; `a` typed |
| 58 | `close_makes_an_open_row_a_root` | the same `o`, `last` | click | `CredsForDevs: before claude sessions` executed `['do-dep']` |
| 59 | `run_dependencies_false_on_every_root_opens_no_chain_and_asks_nothing_more` | `a` depends on `dep`, `runDependencies: false` | click | one terminal, one modal |
| 60 | `a_sibling_named_in_depends_on_is_not_a_step_and_not_awaited` | `a` depends on `b` and `dep`; `b` | click | the chain executed only `do-dep`; `b` typed in its own terminal |
| 61 | `a_refused_sibling_named_in_depends_on_does_not_refuse_the_chain` | `a` depends on `c d`; `c d` uses the token | click | `a` typed; the info holds `Not run: c d — ` |
| 62 | `a_sibling_passes_on_its_own_dependencies_when_a_typed_line_names_it` | `a` depends on open `o`, which depends on `dep`, both `runDependencies` | click, `Run` | the chain executed `do-dep`; `o` still not typed. `visitNode` follows an excluded entry's edges, as for a launcher: this pins it |
| 63 | `siblings_in_a_circle_refuse_the_chain_and_type_nothing` | `a` and `b` depend on each other | click | no terminal; a warning holds `depend on each other in a circle` |
| 64 | `a_missing_dependency_with_no_step_asks_nothing_more` | `a` depends on `gone` | click | one modal; `a` typed |
| 65 | `a_failed_step_stopped_by_the_person_types_nothing` | `a` depends on `dep`, exit code 1, `notification: 'Stop'` | click | no `a` terminal |
| 66 | `the_chain_modal_names_the_folder` | `a` depends on a new `dep` | click | a text starts `Before "claude sessions", these run in ` |

**The manifest**

| # | Test | Then |
|---|---|---|
| 67 | `the_manifest_hides_the_command_from_the_palette_until_the_menus_come` | `package.json`: `credSshManager.runFolder` has title `Run All in Folder`, category `CredsForDevs`; `menus.commandPalette` holds it with `when: 'false'` |

## B. The brief

### B.1 What is settled, and why

1. **Rows.** Read `storage.getChildren(accountId, folderId)` (`storageManager.ts:440`, sorted by `siblingOrder`, `stateKeys.ts:34`). Direct children only. Each entity gets one row, first match wins, in the order of parent §3. Names are `details.name`, and the terminal is `CredsForDevs: <details.name>`; a node with no `details` is named by `node.name`. Lines come from `resolveCommand`, never `executableLine` (`commandRoadScan.test.ts` allows it three readers) and never `.commandArgs`. Subfolders are named in the modal and are not rows.
2. **Duplicates** count only among rows that passed every earlier reason: they alone would share a terminal.
3. **The cap** counts rows with a line, `run` plus `open`, because the closing button can type all of them and the modal shows all of them (parent §Budget: at most 32 terminals per click). Not-run rows do not count.
4. **What closing authorises.** When the modal is built, in the same tick as its text, the host takes a snapshot: for each `open` row, every live terminal of that name in any shell (`liveTerminalsOfEntry`), as OBJECTS. `Run` authorises nothing. After the choice nothing is looked up by name in order to close it.
   - A snapshot terminal that exits while the modal sits: skipped (`exitStatus` checked before `dispose`), its line still typed.
   - One that starts or ends a command while it sits: closed anyway. The modal said closing ends whatever runs there, and the tracker cannot say more than that after a reload.
   - A terminal of the same name that is not in the snapshot: stays open, and the row becomes `open`. Its snapshot terminals are then not closed either, because no line would replace them.
   - Closing happens per row, immediately before that row's new terminal, after the chain is `ready`. A refused or declined chain closes nothing.
   - With only `open` rows, the closing button is the only one offered.
5. **The chain.** `runDependenciesFirst(dependencyRequest(host.storage, accountId, roots, folder.name, trust, plan.directIds))`, roots being the details of the lines the chosen button types. Verified by reading: `planDependencyRun` keeps only roots with `runDependencies === true` (`dependencyRun.ts:74`); with none, `needsApproval` is false (`dependencyRunHost.ts:147`), `runSteps` answers `NO_CHAIN` (`:162-165`), `ready: true`, with no modal and no terminal. An excluded entry is neither a step nor judged (`addStep`, `dependencyRun.ts:134`), so a refused sibling refuses nothing. `describeRunPlan` reads `Before "claude sessions", these run in your default terminal, in order, each waiting for the one before:`, and the terminal is `CredsForDevs: before claude sessions` (`dependencyRunHost.ts:166`). Measured by rows 59, 60, 61, 64, 66.
6. **Trust.** The folder modal always shows (decision C). Approving trusts, one at a time, each line the button types (`trustCommand(trust, row.id, row.line)`, `row.id` being `node.id`, as the arrow's `entryAt`), BEFORE the chain, per parent §3. `(new)` is `!isCommandTrusted(trust, row.id, row.line)`, shown on `open` rows too, since the closing button would type them. `confirmTrusted` is not called: that would be a second modal.
7. **Opening.** Export `typeIntoNew` from `terminalGuard.ts` (`:47`). It is exactly this road: `openEntryTerminal`, which applies `entryShell`'s pinned-or-default choice and creates, never finds, and disposes nothing (`pinnedTerminal.ts:134-145`); then `typed`, which calls `noteSent` before `sendText` (`:64-68`). `pinnedTerminal(name, { fresh: true })` is not used anywhere here: it disposes by name (`pinnedTerminal.ts:101-103`).
8. **Two helpers in `pinnedTerminal.ts` are needed**, neither of which opens anything: `liveTerminalsOfEntry` (every live terminal of the name, any shell; `findEntryTerminal` answers one, and on the pinned road only the same shell, `:159-162`) and `entryOpenRefusal` (`entryRefusal`, `:152`, which adds the pinned shell's refusal to `entryShell`'s, so a line that could not open is a `not run` row and not a line the person approves and then sees fail).
9. **The re-check.** From the chain's end to the last send nothing is awaited. So the rows are settled in one synchronous pass first, and only then closed and typed: one pass is as fresh as one per line, and nothing reads `window.terminals` after a `dispose` (row 40), since a disposed terminal may still be listed.
10. **Overlap.** A `Set` of `accountId/folderId` in `folderRunCommand.ts`, as the guard's `asking` (`terminalGuard.ts:21`): checked and added before the first await, deleted in a `finally`. A second click says so and does nothing. Another folder is not held up; if both name one entry, the later one's re-check finds the first one's terminal.
11. **Report channel.** Information when at least one line was typed and none failed: not-run rows were already in the modal. A warning when nothing was typed or a line failed. Both `void`: a notification's promise lasts until it is dismissed, and awaiting it would hold the in-flight mark.
12. **The target.** `host.vaultKeys.noteUserActivity()` first, as `entryAt` (`runCommands.ts:56`). `asElement(target)` (`commandTargets.ts:133`) must be `kind: 'node'` (`nodeAt` is not used: it is async and resolves revisions); the node is re-read with `host.storage.getNode`; `isInTrash` (`trash.ts`) walks the parents.
13. **A line is shown in full,** never shortened, as `confirmCommandMessage` and `describeRunPlan` show it: a summary is what an attacker would want. `(new)` goes BEFORE the name, so the text after the colon is the line and nothing else.
14. **What is typed is the approved string.** `row.line` is resolved once, at the plan. An entry edited or deleted while the modal sits does not change it (row 27). No rollback once typing has begun (parent §3 step 7).

The modal for the owner's folder, with one session open and one subfolder:

```text
Run the entries of "claude sessions"?

Typed, each into a new terminal:
1. (new) orders-mockups: tmux attach -t orders-mockups
2. admin-panel-mockups: tmux attach -t admin-panel-mockups

Terminal already open:
1. billing-api-design: tmux attach -t billing-api-design

Not run:
scratch — no command

1 subfolder is not run: archive.

The lines do not wait for each other, and a sibling named under Depends on is not awaited. Any other dependency an entry asks to run first runs before any line, each waited for.

Run leaves the open terminals alone. Close Open Terminals and Run closes every terminal open under these names, once the dependencies are ready, and types their lines too. Closing ends whatever runs there; a tmux client only detaches, and its session goes on. A terminal of one of these names opened after this question appeared stays open, and its line is not typed.

(new) marks a line that has not been run on this machine.

A command can arrive by sync or an accepted share. Read each line — once you run them, these exact lines are not asked about again on this machine.
```

### B.2 `src/folderRun.ts` (new, pure: no `vscode`)

```ts
import { resolveCommand } from './commandLine';
import { READ_EACH_LINE } from './dependencyRun';
import { isInTrash } from './trash';
import { EntityMetadata, TreeNode } from './types';
import { usesConfig } from './vpnLauncher';

/**
 * Running a terminal folder's direct entries: the pure half (parent `PLAN_terminal_folder_run.md` §3). WHAT runs, why a
 * row does not, what the modal says and what the report says are here; `commands/folderRunCommand.ts` opens the terminals.
 *
 * <p>A row's `line` is resolved once, here, and it is the string that is shown, trusted and typed. Values are immutable.</p>
 */

/** The modal must show every line, and from memory a native dialog does not scroll (the parent's hand check 8). */
export const MAX_FOLDER_LINES = 32;

export const RUN = 'Run';
export const CLOSE_AND_RUN = 'Close Open Terminals and Run';

const NOT_TERMINAL = 'not a Terminal entry';
const NO_COMMAND = 'no command';
const USES_CONFIG = 'uses {config}, which only a VPN\'s "Started by" fills in';
const SHARED_NAME = 'another direct entry has the same name, and they would share one terminal';

/** A row that has a line: `run` found no live terminal of its name, `open` found at least one. */
export interface LineRow {
  readonly kind: 'run' | 'open';
  readonly id: string;
  readonly name: string;
  readonly line: string;
  readonly details: EntityMetadata;
}

export interface NotRunRow {
  readonly kind: 'notRun';
  readonly id: string;
  readonly name: string;
  readonly reason: string;
}

export type FolderRow = LineRow | NotRunRow;

export interface FolderPlan {
  /** One row per direct entry, in display order. */
  readonly rows: readonly FolderRow[];
  /** The direct subfolders' names, in display order. */
  readonly subfolders: readonly string[];
  /** Every direct entry's id: the chain's `exclude`. */
  readonly directIds: ReadonlySet<string>;
}

/** What the plan asks of the window. */
export interface FolderFacts {
  /** Why this entry's terminal cannot be opened in this window (its OS, or a pinned shell), or `undefined`. */
  readonly shellRefusal: (name: string, terminalOs: string | undefined) => string | undefined;
  /** Whether a live terminal of the entry's name exists, in any shell. */
  readonly isOpen: (name: string) => boolean;
}

interface Candidate {
  readonly kind: 'candidate';
  readonly id: string;
  readonly name: string;
  readonly line: string;
  readonly details: EntityMetadata;
}

/** The rows of `children` (`storage.getChildren`, display order). First match wins, in the parent's order of reasons. */
export function planFolderRun(children: readonly TreeNode[], facts: FolderFacts): FolderPlan {
  const entries = children.filter((child) => child.type !== 'folder');
  const judged = entries.map((node) => judge(node, facts));
  const shared = sharedNames(judged);
  return {
    rows: judged.map((row) => finalRow(row, shared, facts)),
    subfolders: children.filter((child) => child.type === 'folder').map((child) => child.name),
    directIds: new Set(entries.map((child) => child.id)),
  };
}

function judge(node: TreeNode, facts: FolderFacts): NotRunRow | Candidate {
  const details = node.details;
  return details?.isTerminal === true ? judgeTerminal(node.id, details, facts) : notRun(node.id, rowName(node), NOT_TERMINAL);
}

function rowName(node: TreeNode): string {
  return node.details?.name ?? node.name;
}

function judgeTerminal(id: string, details: EntityMetadata, facts: FolderFacts): NotRunRow | Candidate {
  const verdict = lineOrReason(details, facts);
  return 'reason' in verdict ? notRun(id, details.name, verdict.reason) : { kind: 'candidate', id, name: details.name, line: verdict.line, details };
}

function notRun(id: string, name: string, reason: string): NotRunRow {
  return { kind: 'notRun', id, name, reason };
}

function lineOrReason(details: EntityMetadata, facts: FolderFacts): { line: string } | { reason: string } {
  const resolved = resolveCommand(details);
  switch (resolved.kind) {
    case 'empty':
      return { reason: NO_COMMAND };
    case 'refused':
      return { reason: resolved.reason };
    default:
      return judgedLine(details, resolved.line, facts);
  }
}

function judgedLine(details: EntityMetadata, line: string, facts: FolderFacts): { line: string } | { reason: string } {
  const reason = usesConfig(line) ? USES_CONFIG : facts.shellRefusal(details.name, details.terminalOs);
  return reason === undefined ? { line } : { reason };
}

/** Names two rows that passed every other test hold: only those would share a terminal. */
function sharedNames(judged: readonly (NotRunRow | Candidate)[]): ReadonlySet<string> {
  const names = judged.filter((row) => row.kind === 'candidate').map((row) => row.name);
  return new Set(names.filter((name, i) => names.indexOf(name) !== i));
}

function finalRow(row: NotRunRow | Candidate, shared: ReadonlySet<string>, facts: FolderFacts): FolderRow {
  if (row.kind === 'notRun') {
    return row;
  }
  if (shared.has(row.name)) {
    return notRun(row.id, row.name, SHARED_NAME);
  }
  return { ...row, kind: facts.isOpen(row.name) ? 'open' : 'run' };
}

/** The rows that have a line, in display order. */
export function lineRows(plan: FolderPlan): readonly LineRow[] {
  return plan.rows.filter((row): row is LineRow => row.kind !== 'notRun');
}

/** The rows a choice types: `Run` the `run` rows, `Close Open Terminals and Run` the `open` ones too. */
export function linesToType(plan: FolderPlan, closing: boolean): readonly LineRow[] {
  return lineRows(plan).filter((row) => closing || row.kind === 'run');
}

/** A sentence for the person, and whether it is a warning. */
export interface FolderNotice {
  readonly text: string;
  readonly warning: boolean;
}

/** What stops the run before the modal: the cap, an empty folder, or nothing with a line. `undefined` means ask. */
export function beforeAsking(folderName: string, plan: FolderPlan): FolderNotice | undefined {
  const refusal = capRefusal(folderName, plan);
  if (refusal !== undefined) {
    return { text: refusal, warning: true };
  }
  return lineRows(plan).length > 0 ? undefined : nothingToType(folderName, plan);
}

function nothingToType(folderName: string, plan: FolderPlan): FolderNotice {
  return plan.rows.length === 0 ? { text: emptyFolderNote(folderName), warning: false } : reportNotice(folderName, notRunRows(plan));
}

/** Refused when more than `MAX_FOLDER_LINES` rows have a line: the closing button can type every one, and the modal shows every one. */
function capRefusal(folderName: string, plan: FolderPlan): string | undefined {
  const count = lineRows(plan).length;
  return count > MAX_FOLDER_LINES
    ? `"${folderName}" has ${count} entries that could run, and a folder run takes at most ${MAX_FOLDER_LINES}, because its question has to show every line. Nothing was typed. Move some into a subfolder: a subfolder is not run.`
    : undefined;
}

/** `Run` when a line has no terminal open, the closing button when any has; with only open rows, the closing button alone. */
export function folderButtons(plan: FolderPlan): readonly string[] {
  const rows = lineRows(plan);
  return [...(rows.some((r) => r.kind === 'run') ? [RUN] : []), ...(rows.some((r) => r.kind === 'open') ? [CLOSE_AND_RUN] : [])];
}

const NOT_AWAITED =
  'The lines do not wait for each other, and a sibling named under Depends on is not awaited. Any other dependency an entry asks to run first runs before any line, each waited for.';

const CLOSING =
  'Close Open Terminals and Run closes every terminal open under these names, once the dependencies are ready, and types their lines too. Closing ends whatever runs there; a tmux client only detaches, and its session goes on. A terminal of one of these names opened after this question appeared stays open, and its line is not typed.';

/** The modal: every line in full and in order, every row that will not run, and what each button does. */
export function folderQuestion(folderName: string, plan: FolderPlan, isNew: (row: LineRow) => boolean): string {
  const rows = lineRows(plan);
  const run = rows.filter((row) => row.kind === 'run');
  const open = rows.filter((row) => row.kind === 'open');
  return [
    `Run the entries of "${folderName}"?`,
    lineSection('Typed, each into a new terminal:', run, isNew),
    lineSection('Terminal already open:', open, isNew),
    notRunSection(plan),
    subfolderSentence(plan.subfolders),
    NOT_AWAITED,
    closingParagraph(run, open),
    rows.some(isNew) ? '(new) marks a line that has not been run on this machine.' : '',
    READ_EACH_LINE,
  ]
    .filter((section) => section.length > 0)
    .join('\n\n');
}

function lineSection(title: string, rows: readonly LineRow[], isNew: (row: LineRow) => boolean): string {
  const lines = rows.map((row, i) => `${i + 1}. ${isNew(row) ? '(new) ' : ''}${row.name}: ${row.line}`);
  return rows.length === 0 ? '' : [title, ...lines].join('\n');
}

function notRunRows(plan: FolderPlan): readonly NotRunRow[] {
  return plan.rows.filter((row): row is NotRunRow => row.kind === 'notRun');
}

function notRunSection(plan: FolderPlan): string {
  const groups = reasonGroups(notRunRows(plan));
  return groups.length === 0 ? '' : ['Not run:', ...groups].join('\n');
}

function subfolderSentence(names: readonly string[]): string {
  if (names.length === 0) {
    return '';
  }
  return names.length === 1 ? `1 subfolder is not run: ${names[0]}.` : `${names.length} subfolders are not run: ${names.join(', ')}.`;
}

function closingParagraph(run: readonly LineRow[], open: readonly LineRow[]): string {
  if (open.length === 0) {
    return '';
  }
  return run.length === 0 ? CLOSING : `Run leaves the open terminals alone. ${CLOSING}`;
}

/** `a, b — reason` per distinct reason, first seen first. A reason's own closing full stop is left to the sentence around it. */
function reasonGroups(rows: readonly { name: string; reason: string }[]): readonly string[] {
  const reasons = [...new Set(rows.map((row) => row.reason))];
  return reasons.map((reason) => `${rows.filter((row) => row.reason === reason).map((row) => row.name).join(', ')} — ${reason.replace(/\.$/u, '')}`);
}

export type FolderOutcome =
  | { readonly kind: 'typed'; readonly name: string }
  | { readonly kind: 'open'; readonly name: string }
  | { readonly kind: 'notRun'; readonly name: string; readonly reason: string } // the plan said so
  | { readonly kind: 'failed'; readonly name: string; readonly reason: string }; // opening or typing failed

/** What the re-check makes of a row: its outcome, or the line still to type. */
export type SettledRow = FolderOutcome | { readonly kind: 'type'; readonly row: LineRow };

/**
 * The re-check, after the last await. `appeared` says that a live terminal of the row's name exists that the person did not
 * authorise closing: that row is left alone, whichever button was pressed.
 */
export function settleRow(row: FolderRow, closing: boolean, appeared: (row: LineRow) => boolean): SettledRow {
  if (row.kind === 'notRun') {
    return row;
  }
  return leftAlone(row, closing, appeared) ? { kind: 'open', name: row.name } : { kind: 'type', row };
}

function leftAlone(row: LineRow, closing: boolean, appeared: (row: LineRow) => boolean): boolean {
  return (row.kind === 'open' && !closing) || appeared(row);
}

/** `Typed 3 of 5 in "claude sessions": a, b, c. Left alone, terminal already open: d. Not run: e — reason.` "Typed", never "started": exits are not observed. */
export function folderReport(folderName: string, outcomes: readonly FolderOutcome[]): string {
  const typed = namesOf(outcomes, 'typed');
  const left = namesOf(outcomes, 'open');
  const notRunGroups = reasonGroups(outcomes.filter(hasReason));
  return [
    `Typed ${typed.length} of ${outcomes.length} in "${folderName}"${typed.length > 0 ? `: ${typed.join(', ')}` : ''}.`,
    left.length > 0 ? `Left alone, terminal already open: ${left.join(', ')}.` : '',
    notRunGroups.length > 0 ? `Not run: ${notRunGroups.join('; ')}.` : '',
  ]
    .filter((clause) => clause.length > 0)
    .join(' ');
}

function namesOf(outcomes: readonly FolderOutcome[], kind: 'typed' | 'open'): readonly string[] {
  return outcomes.filter((outcome) => outcome.kind === kind).map((outcome) => outcome.name);
}

function hasReason(outcome: FolderOutcome): outcome is Extract<FolderOutcome, { reason: string }> {
  return outcome.kind === 'notRun' || outcome.kind === 'failed';
}

/** The report, as a warning when nothing was typed or a line failed; otherwise information, the not-run rows having been in the modal. */
export function reportNotice(folderName: string, outcomes: readonly FolderOutcome[]): FolderNotice {
  return { text: folderReport(folderName, outcomes), warning: reportIsWarning(outcomes) };
}

function reportIsWarning(outcomes: readonly FolderOutcome[]): boolean {
  return !outcomes.some((outcome) => outcome.kind === 'typed') || outcomes.some((outcome) => outcome.kind === 'failed');
}

export type FolderTarget = { readonly ok: true; readonly node: TreeNode } | { readonly ok: false; readonly reason: string };

export const NO_FOLDER_TARGET = 'Run All in Folder needs a folder. Use the green arrow on a Terminal folder in the tree.';

/** Whether the re-read `node` may be run: a folder, of type terminal, not in the Trash. F2 and the palette reach a handler with no menu. */
export function folderTarget(node: TreeNode | undefined, byId: (id: string) => TreeNode | undefined): FolderTarget {
  if (node === undefined) {
    return { ok: false, reason: 'That folder no longer exists, so nothing was run.' };
  }
  const reason = refusalOf(node, byId);
  return reason === undefined ? { ok: true, node } : { ok: false, reason };
}

function refusalOf(node: TreeNode, byId: (id: string) => TreeNode | undefined): string | undefined {
  if (node.type !== 'folder') {
    return `"${node.name}" is not a folder, so Run All in Folder has nothing to run.`;
  }
  if (node.folderType !== 'terminal') {
    return `"${node.name}" is not a Terminal folder, so Run All in Folder does not run it.`;
  }
  return isInTrash(node, byId) ? `"${node.name}" is in the Trash, so nothing in it runs. Restore it first.` : undefined;
}

function emptyFolderNote(folderName: string): string {
  return `"${folderName}" has no entries of its own to run. A folder run covers only its direct entries, and subfolders are not run.`;
}

export function alreadyRunning(folderName: string): string {
  return `A run of "${folderName}" is already waiting for you or for its dependencies, so this click did nothing.`;
}

export function chainStopped(folderName: string): string {
  return `Nothing was typed in "${folderName}" and no terminal was closed: the dependencies did not finish.`;
}
```

### B.3 `src/commands/folderRunCommand.ts` (new)

```ts
import * as vscode from 'vscode';
import { asElement } from '../commandTargets';
import { TrustStore, isCommandTrusted, trustCommand } from '../commandTrust';
import { dependencyRequest, runDependenciesFirst } from '../dependencyRunHost';
import { describeError } from '../describeError';
import {
  CLOSE_AND_RUN,
  FolderFacts,
  FolderNotice,
  FolderOutcome,
  FolderPlan,
  LineRow,
  NO_FOLDER_TARGET,
  alreadyRunning,
  beforeAsking,
  chainStopped,
  folderButtons,
  folderQuestion,
  folderTarget,
  lineRows,
  linesToType,
  planFolderRun,
  reportNotice,
  settleRow,
} from '../folderRun';
import { entryOpenRefusal, liveTerminalsOfEntry } from '../pinnedTerminal';
import { typeIntoNew } from '../terminalGuard';
import type { RunCommandsHost } from './runCommands';

/**
 * `credSshManager.runFolder`: the `vscode` half of the folder run (parent `PLAN_terminal_folder_run.md` §3); every decision
 * and every sentence is `folderRun.ts`.
 *
 * <p>Closing is authorised per terminal OBJECT, in a snapshot taken when the modal is built, and never by name afterwards.
 * From the chain's end to the last send nothing is awaited, so the one re-check is as fresh as one per line, and nothing
 * reads the terminal list after a `dispose` (a disposed terminal may still be listed).</p>
 */

interface Folder {
  readonly accountId: string;
  readonly id: string;
  readonly name: string;
}

/** The terminals the modal listed, by row id: what `Close Open Terminals and Run` authorises, and nothing else. */
type Authorised = ReadonlyMap<string, readonly vscode.Terminal[]>;

const NOTHING_AUTHORISED: Authorised = new Map();

const FACTS: FolderFacts = {
  shellRefusal: entryOpenRefusal,
  isOpen: (name) => liveTerminalsOfEntry(name).length > 0,
};

/** Folders with a run pending, in a modal or a chain, as the guard's `asking`. Each key leaves in a `finally`, so it cannot grow. */
const inFlight = new Set<string>();

export function registerFolderRun(host: RunCommandsHost): void {
  host.register('credSshManager.runFolder', (target) => runFolder(host, target));
}

async function runFolder(host: RunCommandsHost, target: unknown): Promise<void> {
  host.vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
  const folder = folderAt(host, target);
  if (folder !== undefined) {
    await oneAtATime(folder, () => planAndAsk(host, folder));
  }
}

/** The target re-read from storage: what a menu handed over may be old, and a palette call hands over nothing. */
function folderAt(host: RunCommandsHost, target: unknown): Folder | undefined {
  const element = asElement(target);
  if (element?.kind !== 'node') {
    return warned(NO_FOLDER_TARGET);
  }
  const byId = (id: string) => host.storage.getNode(element.accountId, id);
  const found = folderTarget(byId(element.node.id), byId);
  return found.ok ? { accountId: element.accountId, id: found.node.id, name: found.node.name } : warned(found.reason);
}

function warned(message: string): undefined {
  void vscode.window.showWarningMessage(message);
  return undefined;
}

async function oneAtATime(folder: Folder, run: () => Promise<void>): Promise<void> {
  const key = `${folder.accountId}/${folder.id}`;
  if (inFlight.has(key)) {
    void vscode.window.showInformationMessage(alreadyRunning(folder.name));
    return;
  }
  inFlight.add(key);
  try {
    await run();
  } finally {
    inFlight.delete(key);
  }
}

async function planAndAsk(host: RunCommandsHost, folder: Folder): Promise<void> {
  const plan = planFolderRun(host.storage.getChildren(folder.accountId, folder.id), FACTS);
  const stop = beforeAsking(folder.name, plan);
  if (stop === undefined) {
    await ask(host, folder, plan);
  } else {
    say(stop);
  }
}

/** The modal, ALWAYS (decision C). The snapshot is read in the same tick as its text. */
async function ask(host: RunCommandsHost, folder: Folder, plan: FolderPlan): Promise<void> {
  const trust = host.context.globalState;
  const snapshot = openTerminals(plan);
  const choice = await vscode.window.showWarningMessage(
    folderQuestion(folder.name, plan, (row) => !isCommandTrusted(trust, row.id, row.line)),
    { modal: true },
    ...folderButtons(plan),
  );
  if (choice !== undefined) {
    await runChosen(host, folder, plan, choice === CLOSE_AND_RUN ? snapshot : undefined);
  }
}

/** Every live terminal of each open row's name, any shell. */
function openTerminals(plan: FolderPlan): Authorised {
  return new Map(lineRows(plan).filter((row) => row.kind === 'open').map((row) => [row.id, liveTerminalsOfEntry(row.name)]));
}

/** `authorised` is present only for the closing button. */
async function runChosen(host: RunCommandsHost, folder: Folder, plan: FolderPlan, authorised: Authorised | undefined): Promise<void> {
  const trust = host.context.globalState;
  const closing = authorised !== undefined;
  const lines = linesToType(plan, closing);
  await trustEach(trust, lines);
  const chain = await runDependenciesFirst(dependencyRequest(host.storage, folder.accountId, lines.map((row) => row.details), folder.name, trust, plan.directIds));
  if (chain.ready) {
    say(reportNotice(folder.name, typeAll(plan, closing, authorised ?? NOTHING_AUTHORISED)));
  } else {
    warned(chainStopped(folder.name));
  }
}

/** One at a time: `trustCommand` reads, then writes the whole list. */
async function trustEach(trust: TrustStore, rows: readonly LineRow[]): Promise<void> {
  for (const row of rows) {
    await trustCommand(trust, row.id, row.line);
  }
}

/** The re-check over every row first, then the closes and the sends: synchronous from here to the last send. */
function typeAll(plan: FolderPlan, closing: boolean, authorised: Authorised): readonly FolderOutcome[] {
  const settled = plan.rows.map((row) => settleRow(row, closing, (r) => appeared(r, authorised)));
  return settled.map((step) => (step.kind === 'type' ? typeLine(step.row, authorised.get(step.row.id) ?? []) : step));
}

/** A live terminal of the row's name that the person did not authorise closing. */
function appeared(row: LineRow, authorised: Authorised): boolean {
  const known = authorised.get(row.id) ?? [];
  return liveTerminalsOfEntry(row.name).some((terminal) => !known.includes(terminal));
}

/** Close what was authorised for this row, by object; then a NEW terminal, never found. A failure is this row's alone. No rollback. */
function typeLine(row: LineRow, toClose: readonly vscode.Terminal[]): FolderOutcome {
  try {
    toClose.filter((terminal) => terminal.exitStatus === undefined).forEach((terminal) => terminal.dispose());
    const sent = typeIntoNew(row.name, row.details.terminalOs, () => row.line);
    return sent.kind === 'typed' ? { kind: 'typed', name: row.name } : { kind: 'failed', name: row.name, reason: sent.reason };
  } catch (error) {
    return { kind: 'failed', name: row.name, reason: describeError(error) };
  }
}

function say(notice: FolderNotice): void {
  void (notice.warning ? vscode.window.showWarningMessage(notice.text) : vscode.window.showInformationMessage(notice.text));
}
```

`import type` on `RunCommandsHost`: `runCommands.ts` imports this file, and the type import is erased, so no cycle exists at load.

### B.4 `src/pinnedTerminal.ts`

Add immediately before `entryTerminalName` (`:147`):

```ts
/**
 * Every LIVE terminal of the entry's name, ANY shell, in list order: found, never created, never shown. The folder run's
 * reading. The pinned road's same-shell test (`liveEntryTerminal`) would miss one running another shell, and that
 * terminal would then sit beside a second `tmux attach`, or survive a close the person asked for.
 */
export function liveTerminalsOfEntry(entryName: string): readonly vscode.Terminal[] {
  const name = entryTerminalName(entryName);
  return vscode.window.terminals.filter((t) => t.name === name && t.exitStatus === undefined);
}

/** Why `openEntryTerminal` would refuse this entry in this window, or `undefined`. Opens nothing. */
export function entryOpenRefusal(entryName: string, terminalOs: string | undefined): string | undefined {
  return entryRefusal(entryShell(entryName, terminalOs, shellContext()));
}
```

Nothing else in this file changes. `openEntryTerminal` needs no change.

### B.5 `src/terminalGuard.ts`

```ts
// after the GuardedSend type (:15-18):
/** What opening a new terminal can answer: there is no question on this road. */
export type NewTerminalSend = Extract<GuardedSend, { kind: 'typed' | 'refused' }>;

// :47, gains a docblock, `export` and the narrower return type; the body is unchanged:
/**
 * A NEW terminal for the entry, and the line typed into it: never a find, and nothing is disposed. The no-terminal path
 * of `sendGuarded`, and each line of a folder run.
 */
export function typeIntoNew(entryName: string, terminalOs: string | undefined, lineFor: (family: ShellFamily) => string): NewTerminalSend {

// :64, the return type only; the body is unchanged:
function typed(terminal: vscode.Terminal, line: string): Extract<GuardedSend, { kind: 'typed' }> {
```

### B.6 `src/dependencyRun.ts`

The sentence is lifted so both modals say one thing. Above `describeRunPlan`:

```ts
/** What every modal that vouches for several lines at once says last. */
export const READ_EACH_LINE =
  'A command can arrive by sync or an accepted share. Read each line — once you run them, these exact lines are not asked about again on this machine.';
```

In `describeRunPlan`, the last two string pieces become `` `\n\n${READ_EACH_LINE}` ``. The chain modal's text does not change by a character.

### B.7 `src/commands/runCommands.ts`

`import { registerFolderRun } from './folderRunCommand';` and, as the last line of `registerRunCommands`, `registerFolderRun(host);`. Nothing else. `extension.ts` is not touched.

### B.8 What the guards demand of a command with no menu yet

Measured by running each guard.

| Guard | Demands | S3 does |
|---|---|---|
| `commandsRegistered.test.ts` | a `register('<id>'` in `src/` | `host.register('credSshManager.runFolder', …)` in §B.3 |
| `manifest.test.ts:99` reachable | the id in any menu or `PALETTE_ONLY`; `Object.values(menus)` includes `commandPalette` | the `commandPalette` entry is enough; **no `PALETTE_ONLY` entry**, and S4 has none to remove |
| `listingCoverage.test.ts:31` | the exact title in `src_vs_code/README.md`; it has **no allow-list** | the one phrase below. S4 writes the prose |
| `helpCoverage.test.ts:89` | the title in the English help, or `ALIAS`, or `SELF_EVIDENT` | the temporary `SELF_EVIDENT` entry below. An `ALIAS` would have to borrow a phrase about something else. **S4 deletes it** in the commit that writes the article; no test forces that, so S4's brief must name it |

`src_vs_code/package.json`, `contributes.commands`, immediately before `credSshManager.runCommand` (`:972`):

```json
      {
        "command": "credSshManager.runFolder",
        "title": "Run All in Folder",
        "category": "CredsForDevs",
        "icon": {
          "light": "media/play-green-light.svg",
          "dark": "media/play-green.svg"
        }
      },
```

First in `menus.commandPalette` (`:1235`), and S4 keeps it:

```json
        {
          "command": "credSshManager.runFolder",
          "when": "false"
        },
```

`src_vs_code/README.md:1194` becomes `- **Terminal commands** — Run in Terminal · Run All in Folder · Copy Command · Show Command and Notes`.

`src/test/helpCoverage.test.ts`, first in `SELF_EVIDENT` (`:72`):

```ts
  // S4 of PLAN_terminal_folder_run.md removes this entry in the commit that writes the article.
  'credSshManager.runFolder':
    'No menu reaches this command yet, so no reader can meet it; the article arrives with the arrow on the folder row.',
```

### B.9 Test worlds

**`src/test/vpnWorld.ts`, additive.** Every older test keeps its meaning (measured: `busyTerminalGuard`, `launcherBusyTerminal`, `dependencyChain`, `vpnGoneRequest`, `commandNameRoads` unchanged).

- `FakeTerminal` gains `disposed: number`, `0` at creation. `dispose` counts and closes NOTHING: the terminal stays listed and live, the worst case VS Code allows.
- `window.terminals` becomes a getter and a **setter** over `let listed`. `busyTerminalGuard.test.ts:105` assigns it, so a getter alone fails that test with a `TypeError`. The getter counts reads made after the first `dispose`.
- `World` gains:

```ts
  /** A terminal made through the same fabric as `createTerminal`, NOT listed in `window.terminals`. */
  open(name: string, shellPath?: string): LiveTerminal;
  /** Add a terminal to `window.terminals`, as VS Code does for one the person opened; answers it. */
  list(terminal: LiveTerminal): LiveTerminal;
  /** The terminal really ends: `exitStatus` set, gone from `window.terminals`, the close event fired. */
  exit(terminal: LiveTerminal, code?: number): void;
  /** How many times `window.terminals` was read after the first `dispose` of the world's terminals. */
  listReadsAfterDispose(): number;
```

- `WorldOptions` gains `modal: 'first' | 'last' | 'dismiss'` (`last` answers the last button, through a new `modalAnswer` helper so `reply` stays under the limit), and:

```ts
  /** `createTerminal` throws for a terminal whose name matches. */
  failCreate?: RegExp;
  /** `sendText` throws for a terminal whose name matches: the terminal exists, the line did not reach it. */
  failSend?: RegExp;
  /** Called inside `sendText`, before the line is recorded. */
  onSend?: (name: string, line: string) => void;
```

- `createTerminal` tests `failCreate` first, and `sendText` calls `onSend`, then tests `failSend`, then records. A flow's new terminals stay unlisted, as today.

The inside of `world()`, as checked:

```ts
  let listed: LiveTerminal[] = [];                      // above createTerminal
  const reads = { disposals: 0, afterDispose: 0 };

  // first in createTerminal:
  if (opts.failCreate?.test(o.name) === true) {
    throw new Error(`no terminal for ${o.name}`);
  }
  // on the terminal object:
  dispose: () => {
    record.disposed += 1;
    reads.disposals += 1;
  },
  sendText: (text: string) => {
    opts.onSend?.(o.name, text);
    if (opts.failSend?.test(o.name) === true) {
      throw new Error(`no line for ${o.name}`);
    }
    record.sent.push(text);
  },

  // in the preopened loop, after live[name] = createTerminal({ name }):
  listed = [...listed, live[name]];

  // on window, replacing `terminals: Object.values(live)`:
  get terminals(): LiveTerminal[] {
    reads.afterDispose += reads.disposals > 0 ? 1 : 0;
    return listed;
  },
  set terminals(list: LiveTerminal[]) {
    listed = list;
  },

  // before the return, and all of them in the returned object with listReadsAfterDispose: () => reads.afterDispose:
  const list = (terminal: LiveTerminal): LiveTerminal => {
    listed = [...listed, terminal];
    return terminal;
  };
  const exit = (terminal: LiveTerminal, code = 0): void => {
    terminal.exitStatus = { code };
    listed = listed.filter((t) => t !== terminal);
    [...closed].forEach((l) => l(terminal));
  };
  const open = (name: string, shellPath?: string): LiveTerminal => createTerminal({ name, shellPath });

// reply() calls this for a modal:
function modalAnswer(modal: WorldOptions['modal'], buttons: string[]): string | undefined {
  if (modal === 'dismiss') {
    return undefined;
  }
  return modal === 'last' ? buttons[buttons.length - 1] : buttons[0];
}
```

If `eslint` still reports `startVpn` at complexity 5 when you arrive (S2's `o.trust ?? memoryTrust()` in that function), move that `??` into a one-line helper; it was seen on the S2 snapshot this brief was checked on.

**`src/test/folderWorld.ts`, new, not `*.test.ts`:**

```ts
import * as os from 'node:os';
import { commandFingerprint } from '../commandTrust';
import { siblingOrder } from '../stateKeys';
import { EntityMetadata, TreeNode } from '../types';
import { World, WorldOptions, hostOs, memoryTrust, world } from './vpnWorld';
import { loadWithVscode } from './vscodeStub';

/**
 * The folder run under the `vscode` stub: the REAL `credSshManager.runFolder` handler of `registerRunCommands`, registered
 * against a fake host, in the world of `vpnWorld.ts`, over a real display order (`siblingOrder`).
 * Not named `*.test.ts`, so the runner never treats it as a suite.
 */
export const FOLDER = 'claude sessions';

/** The terminal an entry named `name` runs in. */
export const T = (name: string): string => `CredsForDevs: ${name}`;

/** A Terminal entry whose line is `tmux attach -t <name>`, its id being its name. */
export function session(name: string, extra: Partial<EntityMetadata> = {}): EntityMetadata {
  return { id: name, name, isSshEnabled: false, isTerminal: true, command: 'tmux attach', commandArgs: [{ value: '-t {name}' }], ...extra };
}

export const L = (name: string): string => `tmux attach -t ${name}`;

/** A Terminal entry outside the folder, a chain step: exits with code 0 unless `exitCodes` says otherwise. */
export function step(name: string, command = `do-${name}`): EntityMetadata {
  return { id: name, name, isSshEnabled: false, isTerminal: true, command, terminalOs: hostOs };
}

export interface FolderWorldOptions extends WorldOptions {
  /** [entityId, line] pairs already vouched for. */
  trusted?: readonly (readonly [string, string])[];
  /** Overrides on the folder node. */
  folder?: Partial<TreeNode>;
  /** Direct subfolders' names. */
  subfolders?: readonly string[];
  /** Entries outside the folder, for `dependsOn`. */
  outside?: readonly EntityMetadata[];
  exitCodes?: Record<string, number>;
  /** A Trash folder exists, id `trash`. */
  trash?: boolean;
  /** The store's write lands a tick later, as a real Memento's does: a second write started meanwhile would lose the first. */
  slowTrust?: boolean;
  /** Modules to stand in for, by the request string their importer writes. */
  mocks?: Record<string, unknown>;
}

export interface FolderWorld extends World {
  /** Invoke the handler, as a click on the folder's arrow does; `target` overrides what the click hands over. */
  click(target?: unknown): Promise<void>;
  /** What a click on the folder's row hands over. */
  folderTarget: unknown;
  trust: ReturnType<typeof memoryTrust>;
  activity(): number;
}

type Handler = (target: unknown) => Promise<void>;

function trustStore(o: FolderWorldOptions): ReturnType<typeof memoryTrust> {
  const store = memoryTrust();
  return o.slowTrust === true
    ? { get: store.get, update: (k, v) => new Promise<void>((resolve) => setImmediate(() => void store.update(k, v).then(resolve))) }
    : store;
}

function exitCodesOf(o: FolderWorldOptions): Record<string, number> {
  return o.exitCodes ?? {};
}

/** The folder first; then its subfolders and entries; then what lies outside it. */
function treeOf(entries: readonly EntityMetadata[], o: FolderWorldOptions): TreeNode[] {
  const entity = (parentId: string | null) => (details: EntityMetadata): TreeNode => ({ id: details.id, name: details.name, type: 'entity', parentId, details });
  const subfolder = (name: string): TreeNode => ({ id: `sub-${name}`, name, type: 'folder', folderType: 'terminal', parentId: 'f' });
  return [
    { id: 'f', name: FOLDER, type: 'folder', folderType: 'terminal', parentId: null, ...o.folder },
    ...(o.subfolders ?? []).map(subfolder),
    ...entries.map(entity('f')),
    ...(o.outside ?? []).map(entity(null)),
    ...(o.trash === true ? [{ id: 'trash', name: 'Trash', type: 'folder', parentId: null, isTrash: true } as TreeNode] : []),
  ];
}

export function folderWorld(entries: readonly EntityMetadata[], o: FolderWorldOptions = {}): FolderWorld {
  const w = world(exitCodesOf(o), o);
  const mod = loadWithVscode<{ registerRunCommands(host: unknown): void }>('../commands/runCommands', w.vscode, {
    '../extension': { maskingBanner: () => '' },
    ...o.mocks,
  });
  const store = trustStore(o);
  void store.update('trusted', [...(o.trusted ?? [])].map(([id, line]) => commandFingerprint(id, line)));
  const nodes = treeOf(entries, o);
  const folder = nodes[0];
  const handlers: Record<string, Handler> = {};
  const activity = { count: 0 };
  mod.registerRunCommands({
    context: { globalState: store, subscriptions: [] },
    refSource: {},
    register: (command: string, handler: Handler) => {
      handlers[command] = handler;
    },
    storage: {
      getNode: (_account: string, id: string) => nodes.find((n) => n.id === id),
      getChildren: (_account: string, parent: string | null) => nodes.filter((n) => (n.parentId ?? null) === parent).sort(siblingOrder),
      getHistory: () => Promise.resolve([]),
    },
    storageDir: os.tmpdir(),
    vaultKeys: {
      noteUserActivity: () => {
        activity.count += 1;
      },
    },
  });
  const folderTarget = { kind: 'node', accountId: 'a1', node: { ...folder } };
  return {
    ...w,
    click: (...args: unknown[]) => handlers['credSshManager.runFolder'](args.length === 0 ? folderTarget : args[0]),
    folderTarget,
    trust: store,
    activity: () => activity.count,
  };
}
```

`arrowWorld.ts` is not changed: it serves one entry, and a folder needs `getChildren`, a Trash and a tree.

### B.10 Documents this story carries

`research/module_extension.md`, section *Terminal commands*, after S2's `{name}` paragraph (S1's is at `:2079`), a new paragraph **`The folder run (folderRun.ts, commands/folderRunCommand.ts).`**: direct entries only; the rows and the order of reasons; `details.name`; the cap and why it counts open rows; the modal is always shown, and each typed line is trusted on approval; roots against exclude and why; a dependency that never exits holds the run with no terminal opened; a new terminal per line through `typeIntoNew`, never a find; `Close Open Terminals and Run`: the snapshot of objects taken when the modal is built, the four cases of §B.1.4, closing only after the chain is ready; the one synchronous re-check and why nothing reads the list after a `dispose`; the in-flight mark; "Typed", never "started", because exits are not observed; that `isTransient` was rejected and why (parent §3). The menu and the help belong to S4: say the command is not yet on a menu.

`research/module_tests.md`, a new section after S2's (S1's is at `:1107`), in that shape: **`## The folder run (2026-11-05, S3 of PLAN_terminal_folder_run.md)`**: a sentence on `folderWorld.ts` and what `vpnWorld.ts` gained; the command; a `| Flow | Test | What it holds down |` table with a row each for the plan, the modal, the report, left alone and the re-check, the closing button, the chain, refusals and overlap, and failures; **Teeth**, with the mutations of §C and what went red; **Not covered, and why**: driving a real terminal stays not covered, for the reason that file gives; what a real `dispose` does to the list and how long, and how a native dialog shows 32 lines (the parent's hand check 8), are not observed here.

Do not touch the help, `CHANGELOG.md`, or more of `README.md` than §B.8 says (S4).

## C. Commands

```bash
cd src_vs_code
npm ci                                   # only if node_modules is missing
npm run typecheck && npm run lint
npm test                                 # compiles, then node:test over out/test/*.test.js, lowered, at most 8 workers
# the two suites, after npm run compile:
node --import ./scripts/lower-priority.mjs --test out/test/folderRun.test.js out/test/folderRunCommand.test.js
# the guards this story can break:
node --import ./scripts/lower-priority.mjs --test out/test/manifest.test.js out/test/commandsRegistered.test.js out/test/helpCoverage.test.js out/test/listingCoverage.test.js out/test/sizeRatchet.test.js out/test/commandRoadScan.test.js
cd .. && node .claude/rules/shared/tools/plan-lifecycle.mjs
```

Read the exit of a clean `tsc` before any suite number. Do not commit or push: the caller does.

**Order.** The worlds first (§B.9), and see every older suite green on them. Then A.1 against empty stubs, red, then `folderRun.ts`. Then row 39 and row 44 against a handler that closes by name and at once, and copy both failures into your summary. Then §B.3 to §B.8 and the rest of A.2.

**Red again, each applied alone, watched and restored, the result in the summary.** The expected reds were measured on the prototype:

| # | Mutation | Expected red |
|---|---|---|
| M1 | `typeLine` first asks `findEntryTerminal` and types into what it finds | 68, 40 |
| M2 | `appeared` always false | 34, 35, 41 |
| M3 | every authorised terminal disposed before the chain, in `runChosen` | 39, 40, 41, 42, 43, 44, 45, 46, 68 |
| M4 | the snapshot taken after the modal (`openTerminals(plan)` in the `choice` line). `tsc` also reports the unused `snapshot`, and still emits | 41 |
| M5 | the `catch` in `typeLine` rethrows | 52, 53 |
| M6 | roots are `linesToType(plan, true)` whichever button | 57 |
| M7 | `oneAtATime` ignores the mark | 48, 49 |
| M8 | `FACTS.isOpen` always false | 32, 36, 37, 38, 39, 40, 43, 44, 57, 68 |
| M9 | `noteSent` after `sendText` in `typed` | 54 |
| M10 | no `plan.directIds` passed | 60, 61, 62 |
| M11 | `trustEach` is a `Promise.all` | 26 |
| M12 | `typeLine` closes `liveTerminalsOfEntry(row.name)` instead of `toClose`. `tsc` also reports the unused `toClose`, and still emits | 40 |
| M13 | `liveTerminalsOfEntry` keeps only terminals with no `shellPath` | 33, 39 |
| M14 | a dismissal runs when every line is trusted | 24 |
| M15 | `typeLine` disposes without reading `exitStatus` | 42 |

**Done when** (parent's S3): a run of the folder types nothing into a live terminal in the stub world; the report says "Typed", never "started"; every row above passes; `git diff --stat` shows no `extension.ts`, no `commandTrust.ts`, no `dependencyRunHost.ts`, and in `package.json` no `viewItem` clause; `commandsRegistered`, `manifest`, `helpCoverage`, `listingCoverage`, `sizeRatchet`, typecheck, lint and the whole suite green; both documents updated.

## D. Out of scope: do not touch

- `:runall`, `folderContextValue`, every `view/item/context` clause, the menu evaluator test (S4).
- The help in five languages, the prose of `README.md`, `CHANGELOG.md`, the tmux suggestions, the todos of the parent's §Not in this plan (S4).
- `src/commandTrust.ts`, `src/trustPrompt.ts`, `src/dependencyRunHost.ts`, `src/hostShell.ts`, `src/terminalActivity*.ts`, and `sendGuarded`'s behaviour. `dependencyRun.ts` changes only as §B.6 says.
- `fresh` disposing by name, and the chain disposing a terminal named `CredsForDevs: before <folder>` (`dependencyRunHost.ts:190`): a recorded todo of the parent. `sendPinned`. The literal `{config}` on the arrow.
- The wording of `missingNote` in `dependencyRun.ts`.
- Subfolders run recursively (decision A), a folder-level template (decision D), waiting between lines, a manual entry order, `creds run <folder>` for agents, `isTransient` on these terminals (rejected in parent §3).
- Sanitising names in a modal, and validating a name at save, share or sync.
- New requirements. A defect you find in the plan is reported in your summary, not fixed here: the plan's change budget is spent.
