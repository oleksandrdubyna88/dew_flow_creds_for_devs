# PLAN — S5 scenarios and brief: the re-review's fix forward

> Status: **IMPLEMENTED, 2026-11-06.** Parent: [PLAN_terminal_folder_run.md](PLAN_terminal_folder_run.md).
> Story S5 of the parent's `## Stories` (parent §2 and §3 as revised for epoch 2, which override the S1 spec and the S3 brief where they
> differ). Written by an Opus judge; Sonnet codes from it and rediscovers nothing; Opus reviews. Scope: `src_vs_code` and two research
> documents. Nothing here is a new requirement: a defect you find is reported in your summary, never fixed here, because the epoch's change budget is one.
>
> **Line numbers** are from commit `4f567b5`, the branch as this brief starts from it, and were read there.
>
> **How this was checked.** Every `diff` block below was extracted from THIS file by the command in §C and applied in order to a clean copy of
> `4f567b5`, and the result compared with the prototype, byte for byte. There: `tsc` clean, `eslint src` clean, and the whole suite 6,225 tests, 6,219 passing, 6 skipped, 0 failing. The
> tree the blocks apply to held 6,133 tests, 6,127 passing, 6 skipped, 0 failing. Every expected red and every mutation in this file was measured on that copy, on Linux. No real VS Code ran, and neither Windows nor macOS.
> The blocks are the design: a docblock may be reworded, a string the tests match may not.

## A. Scenarios

Each row is a `test()`, its title the name in the column; what it holds is the code in §B. **RED** is what the row prints at step P0 of §C, all tests in and no production fix, against today's code. **Green at** is the step of §C that turns it. **Passes today** means the behaviour is already right or already follows from the world change: for those the mutation is the only proof that the test can fail. **Mutation** names the rows of §C's table that turn the test red again.

Fixtures, all existing unless §B says otherwise: `A`, `L`, `entry` in `busyTerminalGuard.test.ts`; `S` in `launcherBusyTerminal.test.ts`; `session`, `L(name)`, `T(name)`, `step`, `FOLDER` in `folderWorld.ts`; `term` in `folderRun.test.ts`. New: `ARMED`, `REACH`, `COLUMNS`, `TABLE`, `READS` in `terminalActivity.test.ts`; `noteOurSend` in `vpnWorld.ts`; `armed(aw)` in `busyTerminalGuard.test.ts`; `w.arrow(id)` and `failTrust` in `folderWorld.ts`; `aw.runRevision` in `arrowWorld.ts`.

### A.1 `armed`, and evidence only after our own send: pure (item 1)

| # | Test | File | What it holds | RED at P0 | Green at | Mutation |
|---|---|---|---|---|---|---|
| 1 | `the_table_<state>_on_<event>_is_<state>` | `terminalActivity` | 25 generated tests, one per cell of §2's table, the expected states written out as a literal in the test, reached through the reducer alone; columns `start(e)`, `end(c), numeric`, `end(c), undefined`, `any other end`, `our own send` | 7 red, the rest pass today: `the_table_unknown_on_start(e)_is_unknown` `'running' !== 'unknown'`; `the_table_unknown_on_our own send_is_armed`, `the_table_armed_on_end(c), numeric_is_armed`, `..._end(c), undefined_...`, `..._any other end_...`, `the_table_armed_on_our own send_is_armed`, `the_table_finished_on_our own send_is_armed`, each `'unknown' !== 'armed'` | P1 | M1, M2, M3, M4, M5, M37 |
| 2 | `the_table_<state>_reads_<reading>` | `terminalActivity` | 5 generated tests: `unknown`, `armed`, `poisoned` read `unknown`; `running` reads `running`; `finished` reads `finished` | passes today | - | M2, M3, M37 |
| 3 | `a_start_and_end_with_no_send_of_ours_never_read_finished` | `terminalActivity` | `fold(UNKNOWN, start(c), end(c, code))` for 0, 1, undefined: state and reading are `unknown`; two starts and two ends say no more | `end(c, 0)`: `'finished' !== 'unknown'` | P1 | M1 |
| 4 | `a_start_with_no_send_of_ours_says_nothing_it_does_not_read_running` | `terminalActivity` | `fold(UNKNOWN, start({}))` reads `unknown` | `'running' !== 'unknown'` | P1 | M1 |
| 5 | `a_start_before_our_send_and_its_end_after_it_stay_armed` | `terminalActivity` | `start(c), SENT, end(c, 0)`: `armed`, reads `unknown` | `'poisoned' !== 'armed'` | P1 | M1, M2, M3 |
| 6 | `our_own_send_then_a_seen_start_and_end_read_finished` | `terminalActivity` | `SENT` reads `unknown`; `SENT, start(c)` reads `running`; `SENT, start(c), end(c, 0)` reads `finished` | passes today | - | M2, M3 |
| 7 | `a_double_send_stays_armed` | `terminalActivity` | `SENT, SENT` is `armed`, and a start and end after it read `finished` | `'unknown' !== 'armed'` | P1 | M2 |
| 8 | `end_undefined_then_a_second_execution_stays_poisoned` | `terminalActivity` | §Test plan's case by name | passes today | - | M2, M37 |
| 9 | `our_own_send_clears_the_evidence_and_a_late_end_cannot_restore_it` | `terminalActivity` | from `finished` and from `unknown`: the send gives `armed`, and a late end keeps it unknown. From `running` the send poisons instead: `our_own_send_over_a_running_command_poisons_it_so_the_inner_pair_never_reads_finished`, unchanged | `'unknown' !== 'armed'` | P1 | M2, M3 |
| 10 | `our_own_send_arms_unknown_and_finished_and_leaves_a_poisoned_terminal_poisoned` | `terminalActivity` | was `..._leaves_unknown_and_finished_at_unknown_...` | `'unknown' !== 'armed'` | P1 | M2, M37 |

### A.2 The same in the stub world (item 1)

| # | Test | File | What it holds | RED at P0 | Green at | Mutation |
|---|---|---|---|---|---|---|
| 11 | `a_start_and_end_with_no_send_of_ours_never_read_finished` | `busyTerminalGuard` | the key test: `preopened: [A]`, start, end(0), click, modal dismissed: `sent` is `[]`, one question `/cannot tell/` | `typed on a start and end the extension had no part in`, actual `['tmux attach -t alert']`, expected `[]` | P1 | M1 |
| 12 | `a_start_with_no_send_of_ours_asks_as_unknown_not_as_running` | `busyTerminalGuard` | `preopened`, start, click: `/cannot tell/`, not `/is still running/` | the warnings hold `is still running a command`; `0 !== 1` | P1 | M1 |
| 13 | `type_it_anyway_then_a_seen_start_and_end_reads_finished` | `busyTerminalGuard` | `preopened`, click, `Type It Anyway`, start, end(0), click: `sent` `[L, L]`, one question in all | passes today | - | M2, M34 |
| 14 | `type_it_anyway_with_no_start_seen_still_asks` | `busyTerminalGuard` | `preopened`, click, `Type It Anyway`, click: a second question `/cannot tell/`, `sent` `[L]` | passes today | - | M3 |
| 15 | `a_terminal_the_arrow_opened_asks_while_its_command_runs_and_repeats_silently_once_it_ended` | `busyTerminalGuard` | no `preopened`: a click opens and types; start: the next click asks `/is still running/`; end(0): the next click types silently into the same terminal (the accepted regression's good half) | passes today | - | M2, M33, M34 |
| 16 | `a_start_and_end_with_no_send_of_ours_make_the_launcher_ask` | `launcherBusyTerminal` | `preopened: [S]`, start, end(0), a VPN start: asks `/cannot tell/`, cancel, `sent` `[]` | `typed on a start and end the extension had no part in`, actual `["openvpn --config '...ops_relay_stage.ovpn'"]`, expected `[]` | P1 | M1 |
| 17 | `a_start_and_end_with_no_send_of_ours_make_an_agent_served_start_refuse` | `launcherBusyTerminal` | the same with a `startGate`: refused with `a request from an agent does not type over it`, no question | `true !== false` (`started`) | P1 | M1 |

### A.3 The escaper (items 2 and 3)

| # | Test | File | What it holds | RED at P0 | Green at | Mutation |
|---|---|---|---|---|---|---|
| 18 | `escapeControl_writes_u<xxxx>_as_a_visible_escape` | `transitSecretReport` | 12 generated tests: `0000 001f 007f 0080 0085 009f 2028 2029 202a 202e 2066 2069`, through `escapeControl` and through `logSafe` | 7 red, those already escaped pass: `u0080 u0085 u009f u202a u202e u2066 u2069`, e.g. `'a\x80b' !== 'a\\u0080b'` | P2 | M6, M7, M8 |
| 19 | `escapeControl_leaves_what_is_not_a_control_character_alone` | `transitSecretReport` | U+0020, 007E, 00A0, 00B7, 2027, 202F, 2065, 206A, 0416, 4E2D, 1F600 unchanged | `U+b7`: `'a\\u00b7b' !== 'a·b'` | P2 | M9 |
| 20 | `the_field_separator_is_the_log_lines_alone_and_a_modal_keeps_it_readable` | `transitSecretReport` | `escapeControl` keeps `·`, `logSafe` writes `\u00b7`; a forged `x · blob=deadbeef\n` stays one field on one line in a log | `'a \\u00b7 b' !== 'a · b'` | P2 | M9, M10 |
| 21 | `logSafe_measures_its_bound_on_the_escaped_field` | `transitSecretReport` | 100 `·`: 20 escapes, then `...(+480)`. The order of the two steps in `logSafe` | passes today | - | M10 |
| 22 | `the_chain_modal_text_is_unchanged_for_clean_inputs` | `dependencyRun` | the whole text, byte for byte, with a missing row | passes today | - | M38 |
| 23 | `the_chain_modal_writes_the_owner_each_step_and_each_line_through_the_escaper` | `dependencyRun` | owner `Stage\n9. fake`, step `a\n2. (new) evil`, line `x\r\ny\u202e`, a missing row: one numbered row; both owner sites escaped; `steps[0].line` untouched | the name drew rows: `'9. fake", these run in bash...'`, `'1. a'`, `'2. (new) evil: x\r'` against one row | P3 | M7, M11, M12, M13, M14 |
| 24 | `a_middle_dot_in_a_step_or_an_owner_stays_readable_in_the_chain_modal` | `dependencyRun` | `·` shown as `·` in owner, step and line | passes today | - | M9 |
| 25 | `a_step_name_with_a_newline_cannot_draw_a_row_in_the_chain_modal` | `folderRunEdges` | the road of a folder: step `dep\n2. evil`, line `do\r\nit` | `'1. dep'`, `'2. evil: do\r'` against `'1. dep\\u000a2. evil: do\\u000d\\u000ait'` | P3 | M11, M12 |
| 26 | `the_chain_modal_of_the_arrow_escapes_too` | `folderRunEdges` | the road of a single entry, through `w.arrow` | `'1. dep'`, `'2. evil: do-dep'` against one row | P3 | M11 |

### A.4 The rows and the bound (item 4)

| # | Test | File | What it holds | RED at P0 | Green at | Mutation |
|---|---|---|---|---|---|---|
| 27 | `every_reason_in_order_first_match_wins` | `folderRun` | corrected: `c\nd` joins, after `a b` and before `cfg` | the row reads `run`, not `notRun c\nd: its name holds a control character: rename it to run it here` | P4 | M15 |
| 28 | `every_control_character_class_in_a_name_is_not_run_and_a_clean_name_runs` | `folderRun` | `\n \t \u007f \u0085 \u009f \u2028 \u202e \u2066` are `notRun`; `alert`, `a b`, `a·b`, NBSP, `Ж` are `run` | `"a\nb"`: `'run a\nb: ls'` against the `notRun` row | P4 | M6, M7, M8, M9, M15 |
| 29 | `a_refused_name_comes_before_the_control_character_reason` | `folderRun` | a name with a newline and `{name}`: `NAME_REFUSAL`, §3's order | passes today | - | M39 |
| 30 | `the_control_character_reason_comes_before_config_the_shell_open_and_a_duplicate` | `folderRun` | each of those present too: the control reason four times | `uses {config}...`, `not this window` three times, against the control reason | P4 | M15, M16 |
| 31 | `a_name_with_a_control_character_is_no_duplicate_of_the_name_without_it` | `folderRun` | `ab` and `a\nb` and two `dup`: `run`, `notRun`, `notRun`, `notRun`. This is why `sharedNames` needs no change: such a name never reaches it | `['run', 'run', 'notRun', 'notRun']` against `['run', 'notRun', 'notRun', 'notRun']` | P4 | M15 |
| 32 | `a_question_of_exactly_the_bound_is_asked_and_one_more_character_is_refused_naming_the_count` | `folderRun` | text of exactly 4,000: `undefined`; 4,001: the exact refusal | `undefined` against `{ text: 'The question for "F" would run to 4001 characters...', warning: true }` | P4 | M17, M18, M21 |
| 33 | `the_bound_counts_the_text_as_shown` | `folderRun` | `(new)` and its note count; a newline counts as the six characters it shows (`4005`) | `(new) and its note count` | P4 | M17, M18, M21, M42 |
| 34 | `the_row_cap_is_judged_before_the_character_bound` | `folderRun` | 33 rows of 200 characters: the row refusal | passes today | - | M19 |
| 35 | `rows_with_no_line_ask_nothing_so_the_bound_does_not_reach_them` | `folderRun` | 40 long not-run rows: the report, not a refusal | passes today | - | M36 |
| 36 | `a_question_over_the_bound_refuses_with_no_modal_and_types_nothing` | `folderRunEdges` | stub world: no terminal, no modal, one warning naming the count | `1 !== 0` (a terminal opened) | P4 | M18, M21 |
| 37 | `the_bound_is_judged_on_the_question_as_it_will_be_shown_new_marks_included` | `folderRunEdges` | one line at the bound: trusted, asked at exactly 4,000; new, refused | `the same line with (new) and its note is over it`, `1 !== 0` | P4 | M17, M18, M20, M21 |

### A.5 The report, sentence by sentence (item 4)

| # | Test | File | What it holds | RED at P0 | Green at | Mutation |
|---|---|---|---|---|---|---|
| 38 | `the_report_is_the_exact_sentence` | `folderRun` | §3 step 8 byte for byte: `Typed 3 of 5 in "claude sessions". Not run: e — reason. Left alone, terminal already open: d. Typed: a, b, c.` | `'Typed 3 of 5 in "claude sessions": a, b, c. Left alone, terminal already open: d. Not run: e — reason.'` against it | P4 | M22 |
| 39 | `the_report_says_what_must_not_be_lost_first` | `folderRun` | positions: the count, `Not run`, `Left alone`, `Typed:` | sorted `[-1, -1, 24, 62]` against `[-1, 62, 24, -1]` | P4 | M22 |
| 40 | `the_report_drops_what_did_not_happen` | `folderRun` | `Typed 1 of 1 in "F". Typed: a.`; `Typed 0 of 1 in "F". Left alone, terminal already open: a.` | `'Typed 1 of 1 in "F": a.' !== 'Typed 1 of 1 in "F". Typed: a.'` | P4 | M40 |
| 41 | `settle_follows_the_button_and_what_is_live_now` | `folderRun` | was `settle_leaves_alone_what_appeared_and_what_run_does_not_type`: the four combinations of button and `appeared` | `Run: an open row with nothing live any more types nothing`, `'open'` against `'notRun'` | P4 | M23 |
| 42 | `an_open_row_closed_under_run_says_so_and_never_says_already_open` | `folderRun` | the pure sentence: `Not run: b — its terminal closed while the question was open, and Run approved no line for it.` | `'open' !== 'notRun'` | P4 | M23, M40 |
| 43 | `an_open_row_whose_terminal_closed_under_run_is_not_run_saying_so` | `folderRunCommand` | was `an_open_row_whose_terminal_exited_under_run_is_still_left_alone`: `w.exit`, then `Run`: no new terminal, not trusted, the info says so, and no `already open` | the info still says `Left alone, terminal already open: o.` | P4 | M23 |
| 44 | `a_failure_after_closing_says_what_was_closed` | `folderRun` | 0, 1 and 2 closed: the plain reason; `its terminal was closed, and its line was not typed: ...`; `its 2 terminals were closed, ...` | `failedAfterClosing is not a function` | P4 | M41 |
| 45 | `a_closed_terminal_with_no_replacement_says_it_was_closed` | `folderRunEdges` | `failCreate`, closing button: `disposed` 1, and the exact warning | `Not run: o — no terminal for CredsForDevs: o.` with no word of the close | P4 | M25 |
| 46 | `a_closed_terminal_whose_replacement_took_no_line_says_it_was_closed` | `folderRunEdges` | `failSend`: the old terminal disposed, the new one holds nothing, the exact warning | `Not run: o — no line for CredsForDevs: o.` | P4 | M25, M40 |
| 47 | `a_closed_terminal_whose_replacement_was_refused_says_it_was_closed` | `folderRunEdges` | the plan passes the row in a remote window, and the window refuses it when it is typed: `typeIntoNew` answers `refused` and throws nothing; `disposed` 1, and the sentence names the close | `Not run: o — "o" is written for ...`, no word of the close | P4 | M24 |
| 48 | `a_failure_with_nothing_closed_claims_no_close` | `folderRunEdges` | the snapshot terminal exited while the modal sat, then `failCreate`: `disposed` 0, the plain reason | passes today | - | M26, M40 |
| 49 | `a_stopped_chain_says_nothing_was_typed_and_no_entrys_terminal_was_closed` | `folderRun` | the sentence, escaped folder name | `...and no terminal was closed: ...` against `...and no entry's terminal was closed: ...` | P4 | M27 |
| 50 | `a_chain_refusal_types_nothing_and_closes_nothing` | `folderRunCommand` | corrected: the same sentence through the handler | the warnings do not hold the new sentence | P4 | M27, M29, M31 |
| 51 | `a_name_or_a_line_with_a_control_character_is_escaped_in_the_question_the_report_and_the_notices` | `folderRun` | corrected: a clean `ok` holds the bad line, the forged name is `notRun` | a second numbered row `'2. a\\u000a2. (new) b: ls'` | P4 | M15, M39, M42 |
| 52 | `a_name_with_a_newline_is_not_run_and_cannot_draw_a_row_in_the_folder_modal` | `folderRunEdges` | was `a_name_with_a_newline_cannot_draw_a_row_in_the_folder_modal`: one row, a not-run section, no terminal, no trust | `one row, and the name drew none` | P4 | M15 |
| 53 | `a_line_with_a_control_character_is_shown_escaped_and_typed_unchanged` | `folderRunEdges` | the half of the old test that stays: shown escaped, typed and trusted as approved | passes today | - | M42 |
| 54 | `a_middle_dot_in_a_name_stays_readable_in_the_question_and_the_report` | `folderRun` | `a·b` in the question, the folder name and the report | `folderQuestion(...).includes('1. a·b: ls ·')` is false | P4 | M9 |
| 55 | `a_name_with_a_middle_dot_runs_and_stays_readable` | `folderRunEdges` | stub world: `a·b` is `run`, typed, and reported readable | the modal shows `1. (new) a\\u00b7b: ls` | P4 | M9 |
| 56 | the eight corrected sentences | `folderRunCommand` | `a_run_types_each_line_...` (:75), `run_leaves_an_open_terminal_alone_...` (:181), `a_run_row_whose_terminal_appeared_...` (:204), `a_terminal_opened_while_the_chain_ran_...` (:217), `close_closes_every_live_terminal_...` (:265), `a_terminal_opened_while_the_modal_sat_...` (:299), `one_failure_at_opening_...` (:447), `one_failure_at_typing_...` (:457): the old order against §3 step 8 | each prints the old sentence against the new one, e.g. `'Typed 2 of 2 in "claude sessions": a, b.'` | P4 | M29, M30 |

### A.6 The closing button types the open rows (item 5)

| # | Test | File | What it holds | RED at P0 | Green at | Mutation |
|---|---|---|---|---|---|---|
| 57 | `under_the_closing_button_the_open_rows_are_typed_in_row_order_trusted_and_roots` | `folderRunEdges` | `a`, `o` open with a dependency, `z`, closing button: sent in row order `a, o, z`; `o` trusted before the first send; `o`'s dependency ran; the old `o` disposed, the new one typed. The code already does this (§B.5); the only red is the report's sentence | `'Typed 3 of 3 in "claude sessions": a, o, z.'` against `... . Typed: a, o, z.` | P4 | M29, M30, M31 |

### A.7 One name for the title (item 6)

| # | Test | File | What it holds | RED at P0 | Green at | Mutation |
|---|---|---|---|---|---|---|
| 58 | `the_name_and_the_terminal_title_are_both_details_name` | `commandNameRoads` | was `the_name_is_details_name_and_the_terminal_keeps_the_node_name` (S2's row 22): node `other`, details `alert`: `CredsForDevs: alert` holds `x alert` | `no terminal "CredsForDevs: alert" — opened: CredsForDevs: other` | P6 | M28 |
| 59 | `a_history_row_titles_its_terminal_from_that_versions_details_name` | `commandNameRoads` | live `alert`, version `row-name` / `details.name` `older`: terminal `CredsForDevs: older`, line `x older` | `'CredsForDevs: row-name'` against `'CredsForDevs: older'` | P6 | M28 |
| 60 | `after_a_split_name_the_folder_run_and_the_arrow_find_the_same_terminal` | `folderRunEdges` | node `other`, details `alert`: folder run, then the arrow finds that terminal and asks about it | `the arrow found it, and opened none under the node name`: an extra `'CredsForDevs: other'` | P6 | M3, M28, M33 |
| 61 | `after_a_split_name_the_folder_run_reads_the_terminal_the_arrow_opened_as_open` | `folderRunEdges` | the arrow first, then the folder modal lists it under `Terminal already open:` | `'CredsForDevs: other'` against `'CredsForDevs: alert'` | P6 | M28, M33 |

### A.8 What a flow creates is listed at once, and the mark (item 7)

| # | Test | File | What it holds | RED at P0 | Green at | Mutation |
|---|---|---|---|---|---|---|
| 62 | `a_second_folder_click_reads_what_the_first_typed_into_as_open` | `folderRunEdges` | first click, `Run`; second click: `Terminal already open:`, the only button closes, dismissed, nothing more typed | passes today | - | M33 |
| 63 | `the_arrow_reads_the_object_the_folder_run_typed_into_and_types_silently_once_its_command_is_seen_finished` | `folderRunEdges` | folder run; arrow asks `/cannot tell/` (armed); start: asks `/is still running/`; end(0): types silently into the same record, `[L, L]` | passes today | - | M2, M3, M33, M34 |
| 64 | `the_in_flight_mark_is_released_on_a_throw` | `folderRunEdges` | `failTrust`: the click rejects `the store is down`, a second click reaches the modal and rejects the same way; two modals, no terminal, no `already waiting` | passes today | - | M32 |

### A.9 Every existing test that starts from `preopened`, and how it is corrected

Under the new table a start on a terminal the extension has not typed into stays `unknown`, so `running` and `finished` both need our send first. The correction is one line, first after the world is made: `armed(aw)` (`noteOurSend(aw.live[A])`), the real `noteSent` of the graph the world loaded. **A test that only passes without it has lost its meaning**, so it gets the line too; the last column was measured with `armed` emptied (mutation M35). A test the table does not touch stays as it is.

| Test, `busyTerminalGuard.test.ts` at `4f567b5` | Starts from | Correction | With `armed` emptied |
|---|---|---|---|
| `the_arrow_never_types_into_a_terminal_whose_command_is_running` (`:45`) | `preopened`, start, click | `armed(aw)` | red |
| `the_arrow_types_as_today_when_the_last_command_finished` (`:56`) | `preopened`, start, end(0), click | `armed(aw)` | red |
| `a_nonzero_exit_still_counts_as_finished` (`:67`) | `preopened`, start, end(1), click | `armed(aw)` | red |
| `a_live_terminal_with_no_evidence_asks_and_cancel_types_nothing` (`:84`) | `preopened`, click: `unknown` is what it tests | none | unchanged |
| `type_it_anyway_types_once_into_the_same_terminal_object` (`:97`) | `preopened`, start, click | `armed(aw)` | passes, with its meaning gone |
| `a_double_click_asks_once_and_types_at_most_once` (`:114`) | `preopened`, start, two clicks | `armed(aw)` | passes, with its meaning gone |
| `a_double_click_on_a_finished_terminal_types_once_then_asks` (`:127`) | `preopened`, start, end(0), two clicks | `armed(aw)` | red |
| `type_it_anyway_on_a_terminal_that_closed_meanwhile_types_nothing` (`:138`) | `preopened`, start, click | `armed(aw)` | passes, with its meaning gone |
| `after_our_send_a_start_and_a_numeric_end_make_the_next_click_silent` (`:151`) | `preopened`, start, end(0), click, start, end(0), click | `armed(aw)` | red |
| `after_our_send_with_no_new_evidence_the_next_click_asks` (`:161`) | `preopened`, start, end(0), click, a replayed end, click | `armed(aw)` | red |
| `a_sub_shell_signature_keeps_asking_for_the_terminals_life` (`:174`) | `preopened`, start, end(undefined) | `armed(aw)` | passes, with its meaning gone |
| `the_tracker_is_registered_through_registerRunCommands_and_disposes` (`:190`) | `preopened`, dispose, start, end(0), click: `armed` goes BEFORE the dispose, or the event not being heard proves nothing | `armed(aw)` | passes, with its meaning gone |
| `an_open_question_stops_a_second_send_even_when_the_command_ends_meanwhile` (`:205`) | `preopened`, start, click, end(0), click | `armed(aw)` | passes, with its meaning gone |
| `a_command_started_after_a_finished_one_makes_the_next_click_ask` (`:219`) | `preopened`, start, end(0), start, click | `armed(aw)` | red |

`launcherBusyTerminal.test.ts`: `busyWorld`'s `shellEvents` (`:20`) gets `noteOurSend(w.live[S]);` as its first line, which corrects all four of its tests (`:29`, `:45`, `:61`, `:74`); they read `running` or `finished` through it. Nothing else starts from `preopened` and expects either: `folderRunCommand.test.ts` uses `preopened` only for `open` rows, and never reads the tracker; `commandNameRoads`, `dependencyChain` and `vpnGoneRequest` do not use it.

## B. The brief

### B.1 Item 1: `src/terminalActivity.ts` to §2's table

The table is §2's, cell for cell. What changes in the code: a new state `armed`; `onStart` (`:52-54`) leaves `unknown` alone; `onSent` (`:61-63`) answers `armed` instead of `unknown`; `READING` (`:72-77`) reads `armed` as `unknown`, and being a `Record` over the kinds it does not compile without that row. `Activity` keeps its three values, so `terminalGuard.ts` and its `verdictOf` do not change: `armed` asks exactly as `unknown` asks. `nextActivity`'s early return for `poisoned` (`:38`) and `onEnd` (`:65-70`) already give their rows, since an end counts only for a `running` state. `UNKNOWN` stays exported. `busyQuestion`'s words do not change (§D).

```diff p-activity
diff --git a/src_vs_code/src/terminalActivity.ts b/src_vs_code/src/terminalActivity.ts
--- a/src_vs_code/src/terminalActivity.ts
+++ b/src_vs_code/src/terminalActivity.ts
@@ -2,17 +2,20 @@
  * What is known about one terminal's last command — the pure half of the busy-terminal guard (parent
  * `PLAN_terminal_folder_run.md` §2, `todo/PLAN_terminal_folder_run_S1_spec.md`). Imports nothing from `vscode`.
  *
- * <p>`finished` is the ONLY verdict that types without asking, and it is reached by exactly one path: a start,
- * then the end of THAT execution carrying a numeric exit code. Everything else — nothing recorded, a reload, no
- * shell integration, a sub-shell, our own send — is `unknown`, and a false `unknown` costs one question while a
- * false `finished` types into whatever is running.</p>
+ * <p>`finished` is the ONLY verdict that types without asking, and it is reached by exactly one path: OUR OWN send,
+ * then a start, then the end of THAT execution carrying a numeric exit code. A start and an end on a terminal the
+ * extension has not typed into this activation say nothing: after a reload they could be a replay, or a shell inside a tmux
+ * client that still runs. Everything else — nothing recorded, a reload, no shell integration, a sub-shell, a send with
+ * no start seen yet — reads `unknown`, and a false `unknown` costs one question while a false `finished` types into
+ * whatever is running.</p>
  *
  * <p>Values are immutable: the tracker replaces a terminal's state, it never mutates one.</p>
  */
 
 /** What the tracker knows about one terminal. */
 export type ActivityState =
-  | { readonly kind: 'unknown' } // nothing recorded, or cleared by our own send
+  | { readonly kind: 'unknown' } // nothing recorded: no send of ours this activation
+  | { readonly kind: 'armed' } // we typed, and no start has been seen since
   | { readonly kind: 'running'; readonly current: object } // a start seen, its end not yet
   | { readonly kind: 'finished' } // the matching end carried a numeric exit code
   | { readonly kind: 'poisoned' }; // a sub-shell signature: unknown for the terminal's life
@@ -25,14 +28,16 @@ export type ActivityEvent =
 export type Activity = 'finished' | 'running' | 'unknown';
 
 export const UNKNOWN: ActivityState = Object.freeze({ kind: 'unknown' });
+const ARMED: ActivityState = Object.freeze({ kind: 'armed' });
 const FINISHED: ActivityState = Object.freeze({ kind: 'finished' });
 const POISONED: ActivityState = Object.freeze({ kind: 'poisoned' });
 
 /**
- * The transition table. A start while one is running is the sub-shell signature (VS Code documents that a start
- * before the previous command finished is what makes the previous end's code `undefined`): poisoned, whichever
- * order the pair arrives in. An end counts only for the execution OBJECT that is running — a late end and a replayed
- * end are ignored. Our own send voids the evidence, so a late end cannot restore `finished`; over a running command it poisons.
+ * The transition table (parent §2). A start with no send of ours says nothing. A start while one is running is the sub-shell
+ * signature (VS Code documents that a start before the previous command finished is what makes the previous end's code
+ * `undefined`): poisoned, whichever order the pair arrives in. An end counts only for the execution OBJECT that is running — a
+ * late end and a replayed end are ignored. Our own send arms the terminal, so a late end cannot restore `finished`; over a
+ * running command it poisons.
  */
 export function nextActivity(state: ActivityState, event: ActivityEvent): ActivityState {
   return state.kind === 'poisoned' ? state : step(state, event);
@@ -50,16 +55,19 @@ function step(state: ActivityState, event: ActivityEvent): ActivityState {
 }
 
 function onStart(state: ActivityState, execution: object): ActivityState {
+  if (state.kind === 'unknown') {
+    return state; // no send of ours: a replay, or a shell inside what is attached here
+  }
   return state.kind === 'running' ? POISONED : Object.freeze({ kind: 'running', current: execution });
 }
 
 /**
- * Our own send voids the evidence — except over a RUNNING command: typing into it (`Type It Anyway`) must not erase that
- * something runs there, or a start and end of a program inside it (tmux's inner shell) would read as the terminal
- * finishing. Poisoned for life, like any other sub-shell signature.
+ * Our own send arms the terminal: what starts after it can be believed — except over a RUNNING command: typing into it
+ * (`Type It Anyway`) must not erase that something runs there, or a start and end of a program inside it (tmux's inner
+ * shell) would read as the terminal finishing. Poisoned for life, like any other sub-shell signature.
  */
 function onSent(state: ActivityState): ActivityState {
-  return state.kind === 'running' ? POISONED : UNKNOWN;
+  return state.kind === 'running' ? POISONED : ARMED;
 }
 
 function onEnd(state: ActivityState, event: { readonly execution: object; readonly exitCode: number | undefined }): ActivityState {
@@ -71,6 +79,7 @@ function onEnd(state: ActivityState, event: { readonly execution: object; readon
 
 const READING: Record<ActivityState['kind'], Activity> = {
   unknown: 'unknown',
+  armed: 'unknown',
   running: 'running',
   finished: 'finished',
   poisoned: 'unknown',
diff --git a/src_vs_code/src/terminalActivityTracker.ts b/src_vs_code/src/terminalActivityTracker.ts
--- a/src_vs_code/src/terminalActivityTracker.ts
+++ b/src_vs_code/src/terminalActivityTracker.ts
@@ -41,7 +41,7 @@ export function activityOf(terminal: vscode.Terminal): Activity {
   return readActivity(states.get(terminal));
 }
 
-/** Called immediately BEFORE our own `sendText`: the evidence is void from this moment, synchronously. */
+/** Called immediately BEFORE our own `sendText`: what was known is void, and a start from here on counts, synchronously. */
 export function noteSent(terminal: vscode.Terminal): void {
   apply(terminal, { kind: 'sent' });
 }
```

### B.2 Item 2: `isControlCharacter`, `src/transitSecretReport.ts:207-209`

Widened to C1 (U+0080-U+009F) and the bidi controls U+202A-E and U+2066-9. Its one caller is `escapeControl` (`:232`), and that one's are `logSafe` (`:249`) and `folderRun.ts:19`, so every existing input that holds none of the new characters is unchanged. A range table, because the expression is already at the complexity limit of 4 and the new ranges would pass it. Swept by shape for a second copy: `brokerCaller.ts:106` (`UNPRINTABLE_OR_SEPARATOR`, replaces and bounds a caller's name), `sshKeyParse.ts:242` (`sanitizeKeyComment`), `sshAgentManager.ts:736` (control characters become `?` in a prompt). Each has its own contract, none escapes for a modal, and none is touched.

### B.3 Item 3: `·`, and `describeRunPlan`

**The decision on `·`.** `escapeControl` stops rewriting it, and `logSafe` starts: one escaper, the control characters only, and the log line's own rule added where the log line is. The separator exists only in a diagnostic line, so that is the one place with fields to forge; `·` is legal in a name with no `{name}` and readable in a modal. `logSafe`'s output for every input is byte-identical to today's except for the new control characters of item 2, the forging test in `shareDiagnostics.test.ts:116` stays green, and its bound is measured on the escaped field as before. Rejected: an option on `escapeControl`, since every caller would then have to choose, and a second function, which `reuse-first.md` forbids. `visibleEscape` is the one place that writes `\uXXXX`.

```diff p-escaper
diff --git a/src_vs_code/src/transitSecretReport.ts b/src_vs_code/src/transitSecretReport.ts
--- a/src_vs_code/src/transitSecretReport.ts
+++ b/src_vs_code/src/transitSecretReport.ts
@@ -204,8 +204,17 @@ export function describeTransitSecret(value: string): string {
 /** How much of a caller-supplied field one log line may carry. */
 const MAX_FIELD = 120;
 
+/** What may not reach a log line or a modal as itself, each range inclusive. */
+const CONTROL_RANGES: readonly (readonly [number, number])[] = [
+  [0x0000, 0x001f], // C0
+  [0x007f, 0x009f], // DEL and C1
+  [0x2028, 0x2029], // the line and paragraph separators
+  [0x202a, 0x202e], // bidi embeddings and overrides
+  [0x2066, 0x2069], // bidi isolates
+];
+
 function isControlCharacter(codePoint: number): boolean {
-  return codePoint < 0x20 || codePoint === 0x7f || codePoint === 0x2028 || codePoint === 0x2029;
+  return CONTROL_RANGES.some(([low, high]) => codePoint >= low && codePoint <= high);
 }
 
 /**
@@ -220,18 +229,21 @@ function isControlCharacter(codePoint: number): boolean {
  */
 const FIELD_SEPARATOR = 0x00b7;
 
+function visibleEscape(codePoint: number): string {
+  return `\\u${codePoint.toString(16).padStart(4, '0')}`;
+}
+
 /**
- * `value` with every control character, line separator and the field separator written as a visible `\uXXXX`, so a
- * name or a line cannot end the row it sits in and draw another. Pure, and the repository's one such escaper: a
- * diagnostic line uses it through {@link logSafe}, a modal that shows names and lines through the same function.
+ * `value` with every control character, line separator and bidi control written as a visible `\uXXXX`, so a name or a
+ * line cannot end the row it sits in and draw another, nor turn its text around. Pure, and the repository's one such escaper: a
+ * diagnostic line uses it through {@link logSafe}, a modal that shows names and lines through the same function. It leaves `·`
+ * alone, which is legal and readable in a modal; only a log line has fields to forge, so {@link logSafe} adds that one.
  */
 export function escapeControl(value: string): string {
   let escaped = '';
   for (const character of value) {
     const codePoint = codePointOf(character);
-    escaped += isControlCharacter(codePoint) || codePoint === FIELD_SEPARATOR
-      ? `\\u${codePoint.toString(16).padStart(4, '0')}`
-      : character;
+    escaped += isControlCharacter(codePoint) ? visibleEscape(codePoint) : character;
   }
   return escaped;
 }
@@ -246,6 +258,6 @@ export function escapeControl(value: string): string {
  * is bounded so one enormous name cannot push the rest of the line out of view.</p>
  */
 export function logSafe(value: string): string {
-  const escaped = escapeControl(value);
+  const escaped = escapeControl(value).replaceAll(String.fromCodePoint(FIELD_SEPARATOR), visibleEscape(FIELD_SEPARATOR));
   return escaped.length <= MAX_FIELD ? escaped : `${escaped.slice(0, MAX_FIELD)}...(+${escaped.length - MAX_FIELD})`;
 }
```

**`describeRunPlan`, `src/dependencyRun.ts:183-196` and `missingNote` `:205`.** Three sites: each step's name and line, the owner in the first sentence, the owner in the fix sentence. There is one function, so every road that asks here (arrow, script, launcher, folder) takes it; §A.3 pins the arrow's and the folder's. `shellName` is not a name that arrives by sync (`chainShellName`, `dependencyRunHost.ts:153`), and `missing` is only counted. `transitSecretReport.ts` imports nothing, so the import keeps this module pure. Clean text is byte-identical: `dependencyRun.test.ts:127-141` and `:169-178` stay as they are.

```diff p-chain
diff --git a/src_vs_code/src/dependencyRun.ts b/src_vs_code/src/dependencyRun.ts
--- a/src_vs_code/src/dependencyRun.ts
+++ b/src_vs_code/src/dependencyRun.ts
@@ -1,5 +1,6 @@
 import { EntityMetadata } from './types';
 import { commandRefusal, shownCommandLine } from './commandLine';
+import { escapeControl } from './transitSecretReport';
 import { CONFIG_TOKEN } from './vpnLauncher';
 
 /**
@@ -179,6 +180,9 @@ export const READ_EACH_LINE =
  * gives, because one click here trusts every line in it.
  *
  * <p>`ownerIsFolder`: a folder has no Depends on of its own, so a missing row is cleared in the entry that lists it.</p>
+ *
+ * <p>A name or a line arrives by sync or share and this one click vouches for all of them, so what is SHOWN goes through
+ * `escapeControl`: a name cannot draw a row of its own. What is typed is `step.line`, untouched, on every road that asks here.</p>
  */
 export function describeRunPlan(
   ownerName: string,
@@ -187,9 +191,9 @@ export function describeRunPlan(
   shellName: string,
   ownerIsFolder = false,
 ): string {
-  const lines = steps.map((step, i) => `${i + 1}. ${step.name}: ${step.line}`);
+  const lines = steps.map((step, i) => `${i + 1}. ${escapeControl(step.name)}: ${escapeControl(step.line)}`);
   return (
-    `Before "${ownerName}", these run in ${shellName}, in order, each waiting for the one before:\n\n${lines.join('\n')}` +
+    `Before "${escapeControl(ownerName)}", these run in ${shellName}, in order, each waiting for the one before:\n\n${lines.join('\n')}` +
     missingNote(ownerName, missing, ownerIsFolder) +
     `\n\n${READ_EACH_LINE}`
   );
@@ -202,7 +206,7 @@ function missingNote(ownerName: string, missing: readonly string[], ownerIsFolde
   const what = missing.length === 1 ? 'A dependency no longer exists' : `${missing.length} dependencies no longer exist`;
   const fix = ownerIsFolder
     ? 'edit the entry that lists the missing row under Depends on, and remove that row.'
-    : `edit "${ownerName}" and remove the missing row under Depends on.`;
+    : `edit "${escapeControl(ownerName)}" and remove the missing row under Depends on.`;
   return `\n\n${what} and cannot run. To stop being asked, ${fix}`;
 }
 
```

### B.4 Item 4: `src/folderRun.ts`

- **The row.** `lineRefusal`, called from `judgedLine` (`:117-120`), so it sits after `resolveCommand`'s refusal and before `{config}` and the shell, §3's order. The test is `shown(name) !== name`: the one escaper is the one definition of a control character, and since item 3 leaves `·` alone, `a·b` runs. The reason does not claim that its terminal would be lost: VS Code 1.93.0's source strips only `\n \r \t`, and only from the drawn label (parent §3 says more; the caller holds that report).
- **`sharedNames` (`:123-126`) still fits, unchanged.** It reads only candidates, and a name with a control character is no longer one. `a_name_with_a_control_character_is_no_duplicate_of_the_name_without_it` pins it.
- **The bound.** `beforeAsking` takes `isNew`, because the text it must measure depends on it, and measures `folderQuestion`, the very text that is shown, so an escape counts as the six characters it shows and `(new)` as what it adds. Pure, next to the row cap, which is judged first. The early return for a plan with no line moved up, so a folder with nothing to ask is reported and never measured. `folderQuestion` runs twice per click, for at most 4,000 characters; a `const` carried across would save nothing that matters. The constant is added at P0, so the bound's tests are red for the right reason.
- **The report**, §3 step 8, in `folderReport`. Reasons and the channel (`reportNotice`) do not change. Failures stay under `Not run`, as they are today.
- **A closed `open` row.** `settleRow` needs no new parameter: under `Run` nothing is authorised, so `appeared` already means "any live terminal", and an `open` row that answers no has lost it. Under the closing button the same row is typed, as `an_authorised_terminal_that_exits_while_the_modal_sat_is_not_disposed_and_its_line_is_typed` holds.
- **`chainStopped`** says `no entry's terminal`, because `chainTerminal` (`dependencyRunHost.ts:192`) disposes the chain's own earlier terminal.
- **`failedAfterClosing`** is pure and counted from what was really closed. `live` is read before the `try`: VS Code 1.93.0's `dispose` sets a flag and posts a message and cannot throw on this road, so the one `catch` may rely on it.

```diff p-folder
diff --git a/src_vs_code/src/folderRun.ts b/src_vs_code/src/folderRun.ts
--- a/src_vs_code/src/folderRun.ts
+++ b/src_vs_code/src/folderRun.ts
@@ -29,8 +29,10 @@ export const CLOSE_AND_RUN = 'Close Open Terminals and Run';
 
 const NOT_TERMINAL = 'not a Terminal entry';
 const NO_COMMAND = 'no command';
+const CONTROL_NAME = 'its name holds a control character: rename it to run it here';
 const USES_CONFIG = 'uses {config}, which only a VPN\'s "Started by" fills in';
 const SHARED_NAME = 'another direct entry has the same name, and they would share one terminal';
+const CLOSED_MEANWHILE = 'its terminal closed while the question was open, and Run approved no line for it';
 
 /** A row that has a line: `run` found no live terminal of its name, `open` found at least one. */
 export interface LineRow {
@@ -118,10 +120,21 @@ function lineOrReason(details: EntityMetadata, facts: FolderFacts): { line: stri
 }
 
 function judgedLine(details: EntityMetadata, line: string, facts: FolderFacts): { line: string } | { reason: string } {
-  const reason = usesConfig(line) ? USES_CONFIG : facts.shellRefusal(details.name, details.terminalOs);
+  const reason = lineRefusal(details.name, line) ?? facts.shellRefusal(details.name, details.terminalOs);
   return reason === undefined ? { line } : { reason };
 }
 
+/**
+ * A control character in a name: VS Code draws a terminal's title without `\n`, `\r` and `\t` (its label computer, read in 1.93.0),
+ * and whether `Terminal.name` keeps any of them through a reload is not measured, so the open test is not trusted for such a name.
+ */
+function lineRefusal(name: string, line: string): string | undefined {
+  if (shown(name) !== name) {
+    return CONTROL_NAME;
+  }
+  return usesConfig(line) ? USES_CONFIG : undefined;
+}
+
 /** Names two rows that passed every other test hold: only those would share a terminal. */
 function sharedNames(judged: readonly (NotRunRow | Candidate)[]): ReadonlySet<string> {
   const names = judged.filter((row) => row.kind === 'candidate').map((row) => row.name);
@@ -154,13 +167,13 @@ export interface FolderNotice {
   readonly warning: boolean;
 }
 
-/** What stops the run before the modal: the cap, an empty folder, or nothing with a line. `undefined` means ask. */
-export function beforeAsking(folderName: string, plan: FolderPlan): FolderNotice | undefined {
-  const refusal = capRefusal(folderName, plan);
-  if (refusal !== undefined) {
-    return { text: refusal, warning: true };
+/** What stops the run before the modal: an empty folder, nothing with a line, or a question too long to show. `undefined` means ask. */
+export function beforeAsking(folderName: string, plan: FolderPlan, isNew: (row: LineRow) => boolean): FolderNotice | undefined {
+  if (lineRows(plan).length === 0) {
+    return nothingToType(folderName, plan);
   }
-  return lineRows(plan).length > 0 ? undefined : nothingToType(folderName, plan);
+  const refusal = capRefusal(folderName, plan) ?? sizeRefusal(folderName, plan, isNew);
+  return refusal === undefined ? undefined : { text: refusal, warning: true };
 }
 
 function nothingToType(folderName: string, plan: FolderPlan): FolderNotice {
@@ -175,6 +188,14 @@ function capRefusal(folderName: string, plan: FolderPlan): string | undefined {
     : undefined;
 }
 
+/** Refused when the question, as it would be shown, is over `MAX_QUESTION_CHARACTERS`: an escape counts as what it shows. */
+function sizeRefusal(folderName: string, plan: FolderPlan, isNew: (row: LineRow) => boolean): string | undefined {
+  const count = folderQuestion(folderName, plan, isNew).length;
+  return count > MAX_QUESTION_CHARACTERS
+    ? `The question for "${shown(folderName)}" would run to ${count} characters, and a folder run shows at most ${MAX_QUESTION_CHARACTERS}, because the question has to show every line. Nothing was typed. Shorten a line, or move some entries into a subfolder: a subfolder is not run.`
+    : undefined;
+}
+
 /** `Run` when a line has no terminal open, the closing button when any has; with only open rows, the closing button alone. */
 export function folderButtons(plan: FolderPlan): readonly string[] {
   const rows = lineRows(plan);
@@ -252,28 +273,44 @@ export type SettledRow = FolderOutcome | { readonly kind: 'type'; readonly row:
 
 /**
  * The re-check, after the last await. `appeared` says that a live terminal of the row's name exists that the person did not
- * authorise closing: that row is left alone, whichever button was pressed.
+ * authorise closing (under `Run`, any live terminal): that row is left alone, whichever button was pressed. An `open` row with
+ * none under `Run` has lost its terminal while the modal sat: it is not run, and it is not "already open".
  */
 export function settleRow(row: FolderRow, closing: boolean, appeared: (row: LineRow) => boolean): SettledRow {
   if (row.kind === 'notRun') {
     return row;
   }
-  return leftAlone(row, closing, appeared) ? { kind: 'open', name: row.name } : { kind: 'type', row };
+  return appeared(row) ? { kind: 'open', name: row.name } : settleFree(row, closing);
 }
 
-function leftAlone(row: LineRow, closing: boolean, appeared: (row: LineRow) => boolean): boolean {
-  return (row.kind === 'open' && !closing) || appeared(row);
+function settleFree(row: LineRow, closing: boolean): SettledRow {
+  return row.kind === 'open' && !closing ? notRun(row.id, row.name, CLOSED_MEANWHILE) : { kind: 'type', row };
 }
 
-/** `Typed 3 of 5 in "claude sessions": a, b, c. Left alone, terminal already open: d. Not run: e — reason.` "Typed", never "started": exits are not observed. */
+/**
+ * Why a row's line was not typed, after `closed` of its terminals were closed for it: the person must be told what is gone, or a
+ * tmux client that detached for nothing looks like one that was never touched.
+ */
+export function failedAfterClosing(reason: string, closed: number): string {
+  if (closed === 0) {
+    return reason;
+  }
+  return `${closed === 1 ? 'its terminal was' : `its ${closed} terminals were`} closed, and its line was not typed: ${reason}`;
+}
+
+/**
+ * `Typed 3 of 5 in "claude sessions". Not run: e — reason. Left alone, terminal already open: d. Typed: a, b, c.` What must not be
+ * lost comes first, since a notification is cut at about 1,000 characters. "Typed", never "started": exits are not observed.
+ */
 export function folderReport(folderName: string, outcomes: readonly FolderOutcome[]): string {
   const typed = namesOf(outcomes, 'typed');
   const left = namesOf(outcomes, 'open');
   const notRunGroups = reasonGroups(outcomes.filter(hasReason));
   return [
-    `Typed ${typed.length} of ${outcomes.length} in "${shown(folderName)}"${typed.length > 0 ? `: ${typed.join(', ')}` : ''}.`,
-    left.length > 0 ? `Left alone, terminal already open: ${left.join(', ')}.` : '',
+    `Typed ${typed.length} of ${outcomes.length} in "${shown(folderName)}".`,
     notRunGroups.length > 0 ? `Not run: ${notRunGroups.join('; ')}.` : '',
+    left.length > 0 ? `Left alone, terminal already open: ${left.join(', ')}.` : '',
+    typed.length > 0 ? `Typed: ${typed.join(', ')}.` : '',
   ]
     .filter((clause) => clause.length > 0)
     .join(' ');
@@ -328,5 +365,5 @@ export function alreadyRunning(folderName: string): string {
 }
 
 export function chainStopped(folderName: string): string {
-  return `Nothing was typed in "${shown(folderName)}" and no terminal was closed: the dependencies did not finish.`;
+  return `Nothing was typed in "${shown(folderName)}" and no entry's terminal was closed: the dependencies did not finish.`;
 }
```

### B.5 Items 4 and 5: `src/commands/folderRunCommand.ts`

**Item 5 was verified, and needs no change.** `linesToType(plan, closing)` (`folderRun.ts:144-146`) keeps `open` rows under the closing button; `runChosen` (`folderRunCommand.ts:133-135`) then trusts exactly those (`trustEach`) and hands exactly those to the chain as roots (`lines.map((row) => row.details)`); `settleRow` answers `type` for them; `typeAll` (`:152-155`) closes each row's snapshot and types into a new terminal, in row order. Existing rows pin parts of it (`close_makes_an_open_row_a_root`, `close_closes_every_live_terminal_...`); `under_the_closing_button_...` holds all of it in one run, and M29, M30, M31 prove it can fail.

The change here is `isNew` moving up to `planAndAsk` for the bound, and `typeLine` naming what it closed.

```diff p-folder-command
diff --git a/src_vs_code/src/commands/folderRunCommand.ts b/src_vs_code/src/commands/folderRunCommand.ts
--- a/src_vs_code/src/commands/folderRunCommand.ts
+++ b/src_vs_code/src/commands/folderRunCommand.ts
@@ -14,6 +14,7 @@ import {
   alreadyRunning,
   beforeAsking,
   chainStopped,
+  failedAfterClosing,
   folderButtons,
   folderQuestion,
   folderTarget,
@@ -99,20 +100,20 @@ async function oneAtATime(folder: Folder, run: () => Promise<void>): Promise<voi
 
 async function planAndAsk(host: RunCommandsHost, folder: Folder): Promise<void> {
   const plan = planFolderRun(host.storage.getChildren(folder.accountId, folder.id), FACTS);
-  const stop = beforeAsking(folder.name, plan);
+  const isNew = (row: LineRow): boolean => !isCommandTrusted(host.context.globalState, row.id, row.line);
+  const stop = beforeAsking(folder.name, plan, isNew);
   if (stop === undefined) {
-    await ask(host, folder, plan);
+    await ask(host, folder, plan, isNew);
   } else {
     say(stop);
   }
 }
 
 /** The modal, ALWAYS (decision C). The snapshot is read in the same tick as its text. */
-async function ask(host: RunCommandsHost, folder: Folder, plan: FolderPlan): Promise<void> {
-  const trust = host.context.globalState;
+async function ask(host: RunCommandsHost, folder: Folder, plan: FolderPlan, isNew: (row: LineRow) => boolean): Promise<void> {
   const snapshot = openTerminals(plan);
   const choice = await vscode.window.showWarningMessage(
-    folderQuestion(folder.name, plan, (row) => !isCommandTrusted(trust, row.id, row.line)),
+    folderQuestion(folder.name, plan, isNew),
     { modal: true },
     ...folderButtons(plan),
   );
@@ -162,15 +163,20 @@ function appeared(row: LineRow, authorised: Authorised): boolean {
 
 /** Close what was authorised for this row, by object; then a NEW terminal, never found. A failure is this row's alone. No rollback. */
 function typeLine(row: LineRow, toClose: readonly vscode.Terminal[]): FolderOutcome {
+  const live = toClose.filter((terminal) => terminal.exitStatus === undefined);
   try {
-    toClose.filter((terminal) => terminal.exitStatus === undefined).forEach((terminal) => terminal.dispose());
+    live.forEach((terminal) => terminal.dispose());
     const sent = typeIntoNew(row.name, row.details.terminalOs, () => row.line);
-    return sent.kind === 'typed' ? { kind: 'typed', name: row.name } : { kind: 'failed', name: row.name, reason: sent.reason };
+    return sent.kind === 'typed' ? { kind: 'typed', name: row.name } : failed(row, failedAfterClosing(sent.reason, live.length));
   } catch (error) {
-    return { kind: 'failed', name: row.name, reason: describeError(error) };
+    return failed(row, failedAfterClosing(describeError(error), live.length));
   }
 }
 
+function failed(row: LineRow, reason: string): FolderOutcome {
+  return { kind: 'failed', name: row.name, reason };
+}
+
 function say(notice: FolderNotice): void {
   void (notice.warning ? vscode.window.showWarningMessage(notice.text) : vscode.window.showInformationMessage(notice.text));
 }
```

### B.6 Item 6: `src/commands/runCommands.ts:136`

One argument, `entry.name` to `entry.details.name`. The launcher already passes its `EntityMetadata`'s name (`vpnLauncherRun.ts:116`) and the folder run `details.name` (`folderRun.ts:98`). `entryAt` at `:63` stays: `Entry.name` goes on naming the row in the trust modal, the warnings and the chain's owner, and `launchScript` and `runWithSecrets` are other roads.

**On a revision row.** `nodeAt` (`entityViewerCommands.ts:461-482`) builds the node from the version: `name: revision.name, details: revision.details`. So a history row's terminal is titled from `revision.details.name`, where it was `revision.name`. Unsplit, those are one value and nothing changes. Split by a share or a sync, the title now agrees with what `{name}` filled in the line, while `revision.name` still names the row in the modal. A version under an older name finds or opens the terminal of that older name, as it did.

```diff p-run
diff --git a/src_vs_code/src/commands/runCommands.ts b/src_vs_code/src/commands/runCommands.ts
--- a/src_vs_code/src/commands/runCommands.ts
+++ b/src_vs_code/src/commands/runCommands.ts
@@ -130,10 +130,11 @@ function arrowLine(entry: Entry): string | undefined {
 /**
  * A dedicated terminal per entry, reused only when its last command is known to have finished — otherwise the person
  * is shown the terminal and asked (`terminalGuard.ts`; parent decision B). The line runs with Enter: the operator asked
- * for the button to do the whole job, and `Copy Command` remains for the times you want to edit before running.
+ * for the button to do the whole job, and `Copy Command` remains for the times you want to edit before running. The title is
+ * `details.name`, as the folder run's and the launcher's are, so a share that split the names cannot part their terminals.
  */
 async function typeIntoEntryTerminal(entry: Entry, line: string): Promise<void> {
-  const sent = await sendGuarded(entry.name, entry.details.terminalOs, () => line);
+  const sent = await sendGuarded(entry.details.name, entry.details.terminalOs, () => line);
   if (sent.kind === 'refused') {
     warn(sent.reason);
   }
```

### B.7 Item 7: the test world

`createTerminal` lists what it makes, as the new default with no option: every suite on this world stayed green on it (the whole suite, §C). VS Code does the same: `createTerminalFromOptions` pushes before it returns (`src/vs/workbench/api/node/extHostTerminalService.ts`, tag 1.93.0, read), and a disposed terminal stays listed until `$acceptTerminalClosed` splices it, which is the world's existing worst case. Within `vpnWorld.ts:118-163`: the fabric becomes `makeTerminal`, which `open` and `preopened` still use, so `open` stays unlisted; `failCreate` moves to the listed road, so a `preopened` terminal can exist in a test that fails its replacement; `live` also holds what a flow created, newest of each name.

`folderWorld.ts`: `failTrust`, and `arrow(id)` on the same world and tracker. `store.update` for the seed loses its `void` for a `catch`, or the failing store would reject unhandled. `arrowWorld.ts`: `runRevision`, over a `getHistory` a test can fill.

`folderRunCommand.test.ts` would pass the 800-line limit, so the new stub tests are a new file, `folderRunEdges.test.ts`, and the helpers both need (`needing`, `named`, `held`, `folderModals`, `modalNumber`, `choose`, `clickAndWait`, `everyText`, `FOLDER_MODAL`) move to `folderWorld.ts`, never copied. `pin` and `listedLive` stay where they are used.

```diff worlds
diff --git a/src_vs_code/src/test/arrowWorld.ts b/src_vs_code/src/test/arrowWorld.ts
--- a/src_vs_code/src/test/arrowWorld.ts
+++ b/src_vs_code/src/test/arrowWorld.ts
@@ -22,6 +22,8 @@ export interface ArrowWorld extends World {
   masked: { commandLine: string; env: Record<string, string> }[];
   /** What `registerRunCommands` pushed into `context.subscriptions`. */
   subscriptions: unknown[];
+  /** Invoke the green arrow's handler on version `index` of `entry`, as a click on a history row does. */
+  runRevision(entry: EntityMetadata, revision: { name: string; details: EntityMetadata }, index?: number): Promise<void>;
 }
 
 type Handler = (target: unknown) => Promise<void>;
@@ -40,6 +42,7 @@ export function arrowWorld(opts: WorldOptions = {}, trusted: readonly (readonly
   const store = memoryTrust();
   void store.update('trusted', trusted.map(([id, line]) => commandFingerprint(id, line)));
   const nodes: Record<string, unknown> = {};
+  const history: { name: string; details: EntityMetadata }[] = [];
   const handlers: Record<string, Handler> = {};
   const subscriptions: unknown[] = [];
   mod.registerRunCommands({
@@ -48,7 +51,7 @@ export function arrowWorld(opts: WorldOptions = {}, trusted: readonly (readonly
     register: (command: string, handler: Handler) => {
       handlers[command] = handler;
     },
-    storage: { getNode: (_account: string, id: string) => nodes[id], getHistory: () => Promise.resolve([]) },
+    storage: { getNode: (_account: string, id: string) => nodes[id], getHistory: () => Promise.resolve(history) },
     storageDir: os.tmpdir(),
     vaultKeys: { noteUserActivity: () => undefined },
   });
@@ -56,5 +59,9 @@ export function arrowWorld(opts: WorldOptions = {}, trusted: readonly (readonly
     nodes[entry.id] = { id: entry.id, type: 'entity', name: nodeName, details: entry };
     return handlers[command]({ kind: 'node', accountId: 'a1', node: { id: entry.id, name: nodeName, details: entry } });
   };
-  return { ...w, run: invoke('credSshManager.runCommand'), runWithSecrets: invoke('credSshManager.runWithSecrets'), trust: store, masked, subscriptions };
+  const runRevision: ArrowWorld['runRevision'] = (entry, revision, index = 0) => {
+    history[index] = revision;
+    return handlers['credSshManager.runCommand']({ kind: 'revision', accountId: 'a1', index, node: { id: entry.id, name: entry.name, details: entry } });
+  };
+  return { ...w, run: invoke('credSshManager.runCommand'), runWithSecrets: invoke('credSshManager.runWithSecrets'), trust: store, masked, subscriptions, runRevision };
 }
diff --git a/src_vs_code/src/test/folderWorld.ts b/src_vs_code/src/test/folderWorld.ts
--- a/src_vs_code/src/test/folderWorld.ts
+++ b/src_vs_code/src/test/folderWorld.ts
@@ -2,7 +2,7 @@ import * as os from 'node:os';
 import { commandFingerprint } from '../commandTrust';
 import { siblingOrder } from '../stateKeys';
 import { EntityMetadata, TreeNode } from '../types';
-import { World, WorldOptions, hostOs, memoryTrust, world } from './vpnWorld';
+import { FakeTerminal, HeldDialog, World, WorldOptions, hostOs, memoryTrust, until, world } from './vpnWorld';
 import { loadWithVscode } from './vscodeStub';
 
 /**
@@ -22,6 +22,8 @@ export function session(name: string, extra: Partial<EntityMetadata> = {}): Enti
 
 export const L = (name: string): string => `tmux attach -t ${name}`;
 
+export const FOLDER_MODAL = /^Run the entries of /;
+
 /** A Terminal entry outside the folder, a chain step: exits with code 0 unless `exitCodes` says otherwise. */
 export function step(name: string, command = `do-${name}`): EntityMetadata {
   return { id: name, name, isSshEnabled: false, isTerminal: true, command, terminalOs: hostOs };
@@ -41,6 +43,8 @@ export interface FolderWorldOptions extends WorldOptions {
   trash?: boolean;
   /** The store's write lands a tick later, as a real Memento's does: a second write started meanwhile would lose the first. */
   slowTrust?: boolean;
+  /** Every write to the store rejects. */
+  failTrust?: boolean;
   /** Modules to stand in for, by the request string their importer writes. */
   mocks?: Record<string, unknown>;
 }
@@ -48,6 +52,8 @@ export interface FolderWorldOptions extends WorldOptions {
 export interface FolderWorld extends World {
   /** Invoke the handler, as a click on the folder's arrow does; `target` overrides what the click hands over. */
   click(target?: unknown): Promise<void>;
+  /** Invoke the green arrow's handler on the direct entry `id`, as a click on its row does: the same world, the same tracker. */
+  arrow(id: string): Promise<void>;
   /** What a click on the folder's row hands over. */
   folderTarget: unknown;
   trust: ReturnType<typeof memoryTrust>;
@@ -60,6 +66,9 @@ type Handler = (target: unknown) => Promise<void>;
 
 function trustStore(o: FolderWorldOptions): ReturnType<typeof memoryTrust> {
   const store = memoryTrust();
+  if (o.failTrust === true) {
+    return { get: store.get, update: () => Promise.reject(new Error('the store is down')) };
+  }
   return o.slowTrust === true
     ? { get: store.get, update: (k, v) => new Promise<void>((resolve) => setImmediate(() => void store.update(k, v).then(resolve))) }
     : store;
@@ -89,7 +98,7 @@ export function folderWorld(entries: readonly EntityMetadata[], o: FolderWorldOp
     ...o.mocks,
   });
   const store = trustStore(o);
-  void store.update('trusted', [...(o.trusted ?? [])].map(([id, line]) => commandFingerprint(id, line)));
+  store.update('trusted', [...(o.trusted ?? [])].map(([id, line]) => commandFingerprint(id, line))).catch(() => undefined);
   const nodes = treeOf(entries, o);
   const folder = nodes[0];
   const handlers: Record<string, Handler> = {};
@@ -116,9 +125,47 @@ export function folderWorld(entries: readonly EntityMetadata[], o: FolderWorldOp
   return {
     ...w,
     click: (...args: unknown[]) => handlers['credSshManager.runFolder'](args.length === 0 ? folderTarget : args[0]),
+    arrow: (id: string) => handlers['credSshManager.runCommand']({ kind: 'node', accountId: 'a1', node: nodes.find((n) => n.id === id) }),
     folderTarget,
     trust: store,
     activity: () => activity.count,
     nodes,
   };
 }
+
+/** An entry that asks for its dependencies to run first. */
+export function needing(name: string, ...dependsOn: string[]): EntityMetadata {
+  return session(name, { dependsOn, runDependencies: true });
+}
+
+export function named(w: FolderWorld, name: string): FakeTerminal[] {
+  return w.terminals.filter((t) => t.name === T(name));
+}
+
+/** A folder world whose folder modal waits for the test (and any other dialog `holdDialogs` matches). */
+export function held(entries: readonly EntityMetadata[], o: FolderWorldOptions = {}): FolderWorld {
+  return folderWorld(entries, { holdDialogs: o.holdDialogs ?? FOLDER_MODAL, ...o });
+}
+
+export function folderModals(w: FolderWorld): string[] {
+  return w.warnings.filter((text) => FOLDER_MODAL.test(text));
+}
+
+export async function modalNumber(w: FolderWorld, n: number): Promise<HeldDialog> {
+  await until(() => w.held.length >= n, `dialog ${n}`);
+  return w.held[n - 1];
+}
+
+export function choose(dialog: HeldDialog, which: 'first' | 'last'): void {
+  dialog.answer(dialog.buttons[which === 'first' ? 0 : dialog.buttons.length - 1]);
+}
+
+/** Click, wait for the folder modal, and hand back the click's promise. */
+export async function clickAndWait(w: FolderWorld): Promise<{ done: Promise<void>; modal: HeldDialog }> {
+  const done = w.click();
+  return { done, modal: await modalNumber(w, 1) };
+}
+
+export function everyText(w: FolderWorld): string {
+  return [...w.warnings, ...w.infos].join('\n');
+}
diff --git a/src_vs_code/src/test/vpnWorld.ts b/src_vs_code/src/test/vpnWorld.ts
--- a/src_vs_code/src/test/vpnWorld.ts
+++ b/src_vs_code/src/test/vpnWorld.ts
@@ -64,7 +64,7 @@ export interface World {
   infos: string[];
   /** Dialogs matched by `holdDialogs`, oldest first — each waits for the test's answer. */
   held: HeldDialog[];
-  /** A terminal made through the same fabric as `createTerminal`, NOT listed in `window.terminals`. */
+  /** A terminal made through the same fabric as `createTerminal`, NOT listed in `window.terminals`: one a test lists by hand with `list`. */
   open(name: string, shellPath?: string): LiveTerminal;
   /** Add a terminal to `window.terminals`, as VS Code does for one the person opened; answers it. */
   list(terminal: LiveTerminal): LiveTerminal;
@@ -72,7 +72,7 @@ export interface World {
   exit(terminal: LiveTerminal, code?: number): void;
   /** How many times `window.terminals` was read after the first `dispose` of the world's terminals. */
   listReadsAfterDispose(): number;
-  /** The `preopened` terminals, by name. */
+  /** The `preopened` terminals and the ones a flow created, by name: the newest of each. */
   live: Record<string, LiveTerminal>;
   shell: ShellEvents;
 }
@@ -89,7 +89,7 @@ export interface WorldOptions {
   closeAfterFirst?: boolean;
   /** Dialogs whose text matches stay open until the test answers them through `w.held`. */
   holdDialogs?: RegExp;
-  /** Names of terminals that are LIVE before the flow starts: `window.terminals` lists exactly these. */
+  /** Names of terminals that are LIVE before the flow starts. A terminal a flow creates joins them in `window.terminals` at once. */
   preopened?: readonly string[];
   /** Called as each chain step is handed to the shell — before its end is reported. */
   onExecute?: (line: string) => void;
@@ -115,10 +115,7 @@ export function world(exitCodes: Record<string, number>, opts: WorldOptions = {}
   };
   let listed: LiveTerminal[] = [];
   const reads = { disposals: 0, afterDispose: 0 };
-  const createTerminal = (o: { name: string; shellPath?: string }): LiveTerminal => {
-    if (opts.failCreate?.test(o.name) === true) {
-      throw new Error(`no terminal for ${o.name}`);
-    }
+  const makeTerminal = (o: { name: string; shellPath?: string }): LiveTerminal => {
     const record: FakeTerminal = { name: o.name, shellPath: o.shellPath, executed: [], sent: [], shown: 0, disposed: 0 };
     terminals.push(record);
     const terminal: LiveTerminal & { creationOptions: unknown } = {
@@ -173,7 +170,7 @@ export function world(exitCodes: Record<string, number>, opts: WorldOptions = {}
   };
   const live: Record<string, LiveTerminal> = {};
   for (const name of opts.preopened ?? []) {
-    live[name] = createTerminal({ name });
+    live[name] = makeTerminal({ name });
     listed = [...listed, live[name]];
   }
   const vscode = {
@@ -186,7 +183,14 @@ export function world(exitCodes: Record<string, number>, opts: WorldOptions = {}
       set terminals(list: LiveTerminal[]) {
         listed = list;
       },
-      createTerminal,
+      createTerminal: (o: { name: string; shellPath?: string }): LiveTerminal => {
+        if (opts.failCreate?.test(o.name) === true) {
+          throw new Error(`no terminal for ${o.name}`);
+        }
+        live[o.name] = makeTerminal(o);
+        listed = [...listed, live[o.name]];
+        return live[o.name];
+      },
       showWarningMessage: answer(warnings),
       showInformationMessage: answer(infos),
       showErrorMessage: answer(warnings),
@@ -214,7 +218,7 @@ export function world(exitCodes: Record<string, number>, opts: WorldOptions = {}
     listed = listed.filter((t) => t !== terminal);
     [...closed].forEach((l) => l(terminal));
   };
-  const open = (name: string, shellPath?: string): LiveTerminal => createTerminal({ name, shellPath });
+  const open = (name: string, shellPath?: string): LiveTerminal => makeTerminal({ name, shellPath });
   return { vscode, terminals, warnings, infos, held, open, list, exit, listReadsAfterDispose: () => reads.afterDispose, live, shell };
 }
 
@@ -369,6 +373,15 @@ function listenForShellEvents(earlier: (() => void) | undefined): void {
   earlier?.();
 }
 
+/**
+ * The extension's own send, as `typed` in `terminalGuard.ts` notes it: what `running` and `finished` both need (parent §2). The
+ * tracker is the one `loadWithVscode` last built, reached as `listenForShellEvents` reaches it, so a world made after this
+ * terminal's has replaced it.
+ */
+export function noteOurSend(terminal: LiveTerminal): void {
+  (require('../terminalActivityTracker') as { noteSent(t: unknown): void }).noteSent(terminal);
+}
+
 /** The test's own trust store, or a fresh one. */
 function trustOf(o: StartOptions): ReturnType<typeof memoryTrust> {
   return o.trust ?? memoryTrust();
```

### B.8 The tests

```diff seam
diff --git a/src_vs_code/src/folderRun.ts b/src_vs_code/src/folderRun.ts
--- a/src_vs_code/src/folderRun.ts
+++ b/src_vs_code/src/folderRun.ts
@@ -21,6 +21,9 @@ const shown = escapeControl;
 /** The modal must show every line, and from memory a native dialog does not scroll (the parent's hand check 8). */
 export const MAX_FOLDER_LINES = 32;
 
+/** The longest question the folder run asks: chosen, not measured, for the same reason as {@link MAX_FOLDER_LINES}. */
+export const MAX_QUESTION_CHARACTERS = 4000;
+
 export const RUN = 'Run';
 export const CLOSE_AND_RUN = 'Close Open Terminals and Run';
 
```

```diff t-activity
diff --git a/src_vs_code/src/test/terminalActivity.test.ts b/src_vs_code/src/test/terminalActivity.test.ts
--- a/src_vs_code/src/test/terminalActivity.test.ts
+++ b/src_vs_code/src/test/terminalActivity.test.ts
@@ -3,8 +3,8 @@ import { test } from 'node:test';
 import { ActivityEvent, ActivityState, TYPE_ANYWAY, UNKNOWN, agentRefusal, busyQuestion, closedMeanwhile, nextActivity as n, readActivity as r } from '../terminalActivity';
 
 /**
- * The pure half of the busy-terminal guard: every cell of the transition table is a test here
- * (`todo/PLAN_terminal_folder_run_S1_spec.md` §S1.2, §S1.7.2). Executions are plain objects, compared by identity.
+ * The pure half of the busy-terminal guard: every cell of the transition table is a test here (parent
+ * `PLAN_terminal_folder_run.md` §2, as revised for epoch 2). Executions are plain objects, compared by identity.
  */
 
 const start = (execution: object): ActivityEvent => ({ kind: 'start', execution });
@@ -16,27 +16,120 @@ function fold(from: ActivityState, ...events: ActivityEvent[]): ActivityState {
   return events.reduce(n, from);
 }
 
-const finishedVia = (c: object): ActivityState => fold(UNKNOWN, start(c), end(c, 0));
+/** We typed, and no start has been seen since. */
+const ARMED = n(UNKNOWN, SENT);
+
+const finishedVia = (c: object): ActivityState => fold(ARMED, start(c), end(c, 0));
+
+type Kind = ActivityState['kind'];
+
+/** Each state of the table, reached through the reducer alone; `c` is what `running(c)` runs. */
+const REACH: Record<Kind, (c: object) => ActivityState> = {
+  unknown: () => UNKNOWN,
+  armed: () => ARMED,
+  running: (c) => fold(ARMED, start(c)),
+  finished: finishedVia,
+  poisoned: (c) => fold(ARMED, start(c), end(c, undefined)),
+};
+
+/** The columns of §2's table, in its order. `c` is the running execution, `e` a new one. */
+const COLUMNS: Record<string, (c: object, e: object) => ActivityEvent> = {
+  'start(e)': (_c, e) => start(e),
+  'end(c), numeric': (c) => end(c, 0),
+  'end(c), undefined': (c) => end(c, undefined),
+  'any other end': (_c, e) => end(e, 0),
+  'our own send': () => SENT,
+};
+
+/** §2's table, cell for cell, written out here and not computed. */
+const TABLE: Record<Kind, readonly [Kind, Kind, Kind, Kind, Kind]> = {
+  unknown: ['unknown', 'unknown', 'unknown', 'unknown', 'armed'],
+  armed: ['running', 'armed', 'armed', 'armed', 'armed'],
+  running: ['poisoned', 'finished', 'poisoned', 'running', 'poisoned'],
+  finished: ['running', 'finished', 'finished', 'finished', 'armed'],
+  poisoned: ['poisoned', 'poisoned', 'poisoned', 'poisoned', 'poisoned'],
+};
+
+const READS: Record<Kind, 'finished' | 'running' | 'unknown'> = {
+  unknown: 'unknown',
+  armed: 'unknown',
+  running: 'running',
+  finished: 'finished',
+  poisoned: 'unknown',
+};
+
+for (const [kind, row] of Object.entries(TABLE) as [Kind, readonly Kind[]][]) {
+  Object.keys(COLUMNS).forEach((column, i) => {
+    test(`the_table_${kind}_on_${column}_is_${row[i]}`, () => {
+      const [c, e] = [{}, {}];
+      const after = n(REACH[kind](c), COLUMNS[column](c, e));
+      assert.equal(after.kind, row[i]);
+      assert.equal(r(after), READS[row[i]]);
+    });
+  });
+  test(`the_table_${kind}_reads_${READS[kind]}`, () => {
+    assert.equal(r(REACH[kind]({})), READS[kind]);
+  });
+}
+
+test('a_start_and_end_with_no_send_of_ours_never_read_finished', () => {
+  const [c, e] = [{}, {}];
+  for (const code of [0, 1, undefined]) {
+    const state = fold(UNKNOWN, start(c), end(c, code));
+    assert.equal(state.kind, 'unknown', `end(c, ${String(code)})`);
+    assert.equal(r(state), 'unknown', `end(c, ${String(code)})`);
+  }
+  assert.equal(r(fold(UNKNOWN, start(c), start(e), end(e, 0), end(c, 0))), 'unknown', 'two starts and two ends say no more');
+});
+
+test('a_start_with_no_send_of_ours_says_nothing_it_does_not_read_running', () => {
+  assert.equal(r(fold(UNKNOWN, start({}))), 'unknown');
+});
+
+test('a_start_before_our_send_and_its_end_after_it_stay_armed', () => {
+  const c = {};
+  const state = fold(UNKNOWN, start(c), SENT, end(c, 0));
+  assert.equal(state.kind, 'armed');
+  assert.equal(r(state), 'unknown');
+});
+
+test('our_own_send_then_a_seen_start_and_end_read_finished', () => {
+  const c = {};
+  assert.equal(r(n(UNKNOWN, SENT)), 'unknown', 'armed reads unknown: nothing has been seen yet');
+  assert.equal(r(fold(UNKNOWN, SENT, start(c))), 'running');
+  assert.equal(r(fold(UNKNOWN, SENT, start(c), end(c, 0))), 'finished');
+});
+
+test('a_double_send_stays_armed', () => {
+  const c = {};
+  assert.equal(n(ARMED, SENT).kind, 'armed');
+  assert.equal(r(fold(ARMED, SENT, start(c), end(c, 0))), 'finished');
+});
+
+test('end_undefined_then_a_second_execution_stays_poisoned', () => {
+  const [c, e] = [{}, {}];
+  assert.equal(fold(ARMED, start(c), end(c, undefined), start(e), end(e, 0)).kind, 'poisoned');
+});
 
 test('nothing_recorded_reads_unknown', () => {
   assert.equal(r(undefined), 'unknown');
   assert.equal(r(UNKNOWN), 'unknown');
 });
 
-test('a_start_then_its_end_with_a_numeric_code_reads_finished_nonzero_included', () => {
+test('after_our_send_a_start_then_its_end_with_a_numeric_code_reads_finished_nonzero_included', () => {
   for (const code of [0, 1, -1978335189]) {
     const c = {};
-    assert.equal(r(fold(UNKNOWN, start(c), end(c, code))), 'finished', `exit code ${code}`);
+    assert.equal(r(fold(ARMED, start(c), end(c, code))), 'finished', `exit code ${code}`);
   }
 });
 
-test('a_start_with_no_end_reads_running', () => {
-  assert.equal(r(fold(UNKNOWN, start({}))), 'running');
+test('after_our_send_a_start_with_no_end_reads_running', () => {
+  assert.equal(r(fold(ARMED, start({}))), 'running');
 });
 
 test('an_end_with_undefined_code_on_the_current_execution_poisons_for_life', () => {
   const [c, e, f] = [{}, {}, {}];
-  let state = fold(UNKNOWN, start(c));
+  let state = fold(ARMED, start(c));
   for (const event of [end(c, undefined), start(e), end(e, 0), SENT, start(f), end(f, 0)]) {
     state = n(state, event);
     assert.equal(r(state), 'unknown', JSON.stringify(event));
@@ -46,7 +139,7 @@ test('an_end_with_undefined_code_on_the_current_execution_poisons_for_life', ()
 
 test('a_start_while_running_poisons_in_either_delivery_order', () => {
   const [c, e] = [{}, {}];
-  const running = fold(UNKNOWN, start(c));
+  const running = fold(ARMED, start(c));
   const orders: Record<string, ActivityEvent[]> = {
     'start then the undefined end': [start(e), end(c, undefined)],
     'the undefined end then start': [end(c, undefined), start(e)],
@@ -62,7 +155,7 @@ test('a_start_while_running_poisons_in_either_delivery_order', () => {
 
 test('an_end_for_another_execution_is_ignored', () => {
   const [c, e] = [{}, {}];
-  const state = fold(UNKNOWN, start(c), end(e, 0));
+  const state = fold(ARMED, start(c), end(e, 0));
   assert.equal(r(state), 'running');
   assert.equal(state.kind === 'running' && state.current, c);
 });
@@ -77,8 +170,9 @@ test('an_end_with_no_start_is_ignored', () => {
 
 test('our_own_send_clears_the_evidence_and_a_late_end_cannot_restore_it', () => {
   const [c, e] = [{}, {}];
-  for (const before of [finishedVia(c), fold(UNKNOWN, start(c))]) {
+  for (const before of [finishedVia(c), UNKNOWN]) {
     const sent = n(before, SENT);
+    assert.equal(sent.kind, 'armed');
     assert.equal(r(sent), 'unknown');
     assert.equal(r(n(sent, end(c, 0))), 'unknown', 'a late end for the execution before our send');
   }
@@ -95,22 +189,22 @@ test('a_start_after_a_finished_command_reads_running_with_the_new_execution', ()
 
 test('our_own_send_over_a_running_command_poisons_it_so_the_inner_pair_never_reads_finished', () => {
   const [tmux, inner] = [{}, {}];
-  const state = fold(UNKNOWN, start(tmux), SENT, start(inner), end(inner, 0));
+  const state = fold(ARMED, start(tmux), SENT, start(inner), end(inner, 0));
   assert.equal(r(state), 'unknown');
   assert.equal(state.kind, 'poisoned');
-  assert.equal(fold(UNKNOWN, start(tmux), SENT).kind, 'poisoned', 'the send itself already poisons');
+  assert.equal(fold(ARMED, start(tmux), SENT).kind, 'poisoned', 'the send itself already poisons');
 });
 
-test('our_own_send_leaves_unknown_and_finished_at_unknown_and_a_poisoned_terminal_poisoned', () => {
+test('our_own_send_arms_unknown_and_finished_and_leaves_a_poisoned_terminal_poisoned', () => {
   const c = {};
-  assert.equal(n(UNKNOWN, SENT).kind, 'unknown');
-  assert.equal(n(finishedVia(c), SENT).kind, 'unknown');
-  assert.equal(n(fold(UNKNOWN, start(c), end(c, undefined)), SENT).kind, 'poisoned');
+  assert.equal(n(UNKNOWN, SENT).kind, 'armed');
+  assert.equal(n(finishedVia(c), SENT).kind, 'armed');
+  assert.equal(n(fold(ARMED, start(c), end(c, undefined)), SENT).kind, 'poisoned');
 });
 
 test('an_undefined_end_for_another_execution_is_ignored_while_running', () => {
   const [c, e] = [{}, {}];
-  const state = fold(UNKNOWN, start(c), end(e, undefined));
+  const state = fold(ARMED, start(c), end(e, undefined));
   assert.equal(r(state), 'running');
   assert.equal(state.kind === 'running' && state.current, c);
 });
@@ -118,9 +212,9 @@ test('an_undefined_end_for_another_execution_is_ignored_while_running', () => {
 test('states_are_values_not_mutated', () => {
   const [c, e, f] = [{}, {}, {}];
   const sequences: ActivityEvent[][] = [
-    [start(c), end(c, 0)],
-    [start(c), end(c, undefined), start(e), end(e, 0), SENT, start(f), end(f, 0)],
-    [start(c), end(c, 0), SENT, end(c, 0), start(e), end(e, 0)],
+    [SENT, start(c), end(c, 0)],
+    [SENT, start(c), end(c, undefined), start(e), end(e, 0), SENT, start(f), end(f, 0)],
+    [SENT, start(c), end(c, 0), SENT, end(c, 0), start(e), end(e, 0)],
   ];
   for (const events of sequences) {
     let state: ActivityState = UNKNOWN;
```

```diff t-busy
diff --git a/src_vs_code/src/test/busyTerminalGuard.test.ts b/src_vs_code/src/test/busyTerminalGuard.test.ts
--- a/src_vs_code/src/test/busyTerminalGuard.test.ts
+++ b/src_vs_code/src/test/busyTerminalGuard.test.ts
@@ -2,7 +2,7 @@ import assert from 'node:assert/strict';
 import { test } from 'node:test';
 import { EntityMetadata } from '../types';
 import { ArrowWorld, arrowWorld } from './arrowWorld';
-import { WorldOptions, terminalNamed, until } from './vpnWorld';
+import { WorldOptions, noteOurSend, terminalNamed, until } from './vpnWorld';
 
 /**
  * The green arrow never types into a terminal whose command may still be running (parent
@@ -35,6 +35,11 @@ async function asked(aw: ArrowWorld, count = 1): Promise<void> {
   await until(() => aw.held.length === count, `question number ${count}`);
 }
 
+/** The extension has typed into A this activation: `running` and `finished` both need it (parent §2). */
+function armed(aw: ArrowWorld): void {
+  noteOurSend(aw.live[A]);
+}
+
 /** The terminal A has run a command to its end with `exitCode`. */
 function finish(aw: ArrowWorld, exitCode: number | undefined): object {
   const execution = aw.shell.start(aw.live[A]);
@@ -44,6 +49,7 @@ function finish(aw: ArrowWorld, exitCode: number | undefined): object {
 
 test('the_arrow_never_types_into_a_terminal_whose_command_is_running', async () => {
   const aw = arrow({ preopened: [A], modal: 'dismiss', holdDialogs: undefined });
+  armed(aw);
   aw.shell.start(aw.live[A]);
   await aw.run(entry);
   assert.deepEqual(terminalNamed(aw, A).sent, [], 'the arrow typed into a terminal whose command is running');
@@ -55,6 +61,7 @@ test('the_arrow_never_types_into_a_terminal_whose_command_is_running', async ()
 
 test('the_arrow_types_as_today_when_the_last_command_finished', async () => {
   const aw = arrow({ preopened: [A] });
+  armed(aw);
   finish(aw, 0);
   await aw.run(entry);
   assert.deepEqual(terminalNamed(aw, A).sent, [L]);
@@ -66,6 +73,7 @@ test('the_arrow_types_as_today_when_the_last_command_finished', async () => {
 
 test('a_nonzero_exit_still_counts_as_finished', async () => {
   const aw = arrow({ preopened: [A] });
+  armed(aw);
   finish(aw, 1);
   await aw.run(entry);
   assert.deepEqual(terminalNamed(aw, A).sent, [L]);
@@ -96,6 +104,7 @@ test('a_live_terminal_with_no_evidence_asks_and_cancel_types_nothing', async ()
 
 test('type_it_anyway_types_once_into_the_same_terminal_object', async () => {
   const aw = arrow({ preopened: [A] });
+  armed(aw);
   const t = aw.live[A];
   const c = aw.shell.start(t);
   const p = aw.run(entry);
@@ -113,6 +122,7 @@ test('type_it_anyway_types_once_into_the_same_terminal_object', async () => {
 
 test('a_double_click_asks_once_and_types_at_most_once', async () => {
   const aw = arrow({ preopened: [A] });
+  armed(aw);
   aw.shell.start(aw.live[A]);
   const p1 = aw.run(entry);
   const p2 = aw.run(entry);
@@ -126,6 +136,7 @@ test('a_double_click_asks_once_and_types_at_most_once', async () => {
 
 test('a_double_click_on_a_finished_terminal_types_once_then_asks', async () => {
   const aw = arrow({ preopened: [A] });
+  armed(aw);
   finish(aw, 0);
   const p1 = aw.run(entry);
   const p2 = aw.run(entry);
@@ -137,6 +148,7 @@ test('a_double_click_on_a_finished_terminal_types_once_then_asks', async () => {
 
 test('type_it_anyway_on_a_terminal_that_closed_meanwhile_types_nothing', async () => {
   const aw = arrow({ preopened: [A] });
+  armed(aw);
   aw.shell.start(aw.live[A]);
   const p = aw.run(entry);
   await asked(aw);
@@ -150,6 +162,7 @@ test('type_it_anyway_on_a_terminal_that_closed_meanwhile_types_nothing', async (
 
 test('after_our_send_a_start_and_a_numeric_end_make_the_next_click_silent', async () => {
   const aw = arrow({ preopened: [A] });
+  armed(aw);
   finish(aw, 0);
   await aw.run(entry);
   finish(aw, 0);
@@ -160,6 +173,7 @@ test('after_our_send_a_start_and_a_numeric_end_make_the_next_click_silent', asyn
 
 test('after_our_send_with_no_new_evidence_the_next_click_asks', async () => {
   const aw = arrow({ preopened: [A] });
+  armed(aw);
   const c = finish(aw, 0);
   await aw.run(entry);
   aw.shell.end(aw.live[A], c, 0); // a replay
@@ -173,6 +187,7 @@ test('after_our_send_with_no_new_evidence_the_next_click_asks', async () => {
 
 test('a_sub_shell_signature_keeps_asking_for_the_terminals_life', async () => {
   const aw = arrow({ preopened: [A] });
+  armed(aw);
   finish(aw, undefined);
   const first = aw.run(entry);
   await asked(aw);
@@ -189,6 +204,7 @@ test('a_sub_shell_signature_keeps_asking_for_the_terminals_life', async () => {
 
 test('the_tracker_is_registered_through_registerRunCommands_and_disposes', async () => {
   const aw = arrow({ preopened: [A] });
+  armed(aw);
   assert.equal(aw.subscriptions.length, 1);
   const tracker = aw.subscriptions[0] as { dispose?: unknown };
   assert.equal(typeof tracker.dispose, 'function');
@@ -204,6 +220,7 @@ test('the_tracker_is_registered_through_registerRunCommands_and_disposes', async
 
 test('an_open_question_stops_a_second_send_even_when_the_command_ends_meanwhile', async () => {
   const aw = arrow({ preopened: [A] });
+  armed(aw);
   const t = aw.live[A];
   const c = aw.shell.start(t);
   const p = aw.run(entry);
@@ -218,6 +235,7 @@ test('an_open_question_stops_a_second_send_even_when_the_command_ends_meanwhile'
 
 test('a_command_started_after_a_finished_one_makes_the_next_click_ask', async () => {
   const aw = arrow({ preopened: [A] });
+  armed(aw);
   finish(aw, 0);
   aw.shell.start(aw.live[A]);
   const p = aw.run(entry);
@@ -227,3 +245,62 @@ test('a_command_started_after_a_finished_one_makes_the_next_click_ask', async ()
   await p;
   assert.deepEqual(terminalNamed(aw, A).sent, []);
 });
+
+test('a_start_and_end_with_no_send_of_ours_never_read_finished', async () => {
+  const aw = arrow({ preopened: [A], modal: 'dismiss', holdDialogs: undefined });
+  finish(aw, 0);
+  await aw.run(entry);
+  assert.deepEqual(terminalNamed(aw, A).sent, [], 'typed on a start and end the extension had no part in');
+  assert.equal(aw.warnings.filter((w) => /cannot tell/.test(w)).length, 1, aw.warnings.join('\n'));
+});
+
+test('a_start_with_no_send_of_ours_asks_as_unknown_not_as_running', async () => {
+  const aw = arrow({ preopened: [A], modal: 'dismiss', holdDialogs: undefined });
+  aw.shell.start(aw.live[A]);
+  await aw.run(entry);
+  assert.deepEqual(terminalNamed(aw, A).sent, []);
+  assert.equal(aw.warnings.filter((w) => /cannot tell/.test(w)).length, 1, aw.warnings.join('\n'));
+});
+
+test('type_it_anyway_then_a_seen_start_and_end_reads_finished', async () => {
+  const aw = arrow({ preopened: [A] });
+  const first = aw.run(entry);
+  await asked(aw);
+  aw.held[0].answer('Type It Anyway');
+  await first;
+  finish(aw, 0);
+  await aw.run(entry);
+  assert.deepEqual(terminalNamed(aw, A).sent, [L, L]);
+  assert.equal(aw.held.length, 1, 'silent again after the person had said so and the command was seen to end');
+});
+
+test('type_it_anyway_with_no_start_seen_still_asks', async () => {
+  const aw = arrow({ preopened: [A] });
+  const first = aw.run(entry);
+  await asked(aw);
+  aw.held[0].answer('Type It Anyway');
+  await first;
+  const second = aw.run(entry);
+  await asked(aw, 2);
+  assert.match(aw.held[1].text, /cannot tell/);
+  aw.held[1].answer(undefined);
+  await second;
+  assert.deepEqual(terminalNamed(aw, A).sent, [L]);
+});
+
+test('a_terminal_the_arrow_opened_asks_while_its_command_runs_and_repeats_silently_once_it_ended', async () => {
+  const aw = arrow();
+  await aw.run(entry);
+  const t = aw.live[A];
+  const c = aw.shell.start(t);
+  const running = aw.run(entry);
+  await asked(aw);
+  assert.match(aw.held[0].text, /is still running a command/);
+  aw.held[0].answer(undefined);
+  await running;
+  aw.shell.end(t, c, 0);
+  await aw.run(entry);
+  assert.equal(aw.terminals.length, 1, 'the same terminal, listed at once');
+  assert.deepEqual(terminalNamed(aw, A).sent, [L, L]);
+  assert.equal(aw.held.length, 1);
+});
```

```diff t-launcher
diff --git a/src_vs_code/src/test/launcherBusyTerminal.test.ts b/src_vs_code/src/test/launcherBusyTerminal.test.ts
--- a/src_vs_code/src/test/launcherBusyTerminal.test.ts
+++ b/src_vs_code/src/test/launcherBusyTerminal.test.ts
@@ -1,7 +1,7 @@
 import assert from 'node:assert/strict';
 import * as fs from 'node:fs';
 import { test } from 'node:test';
-import { World, ownerChain, startVpn, terminalNamed, until, world } from './vpnWorld';
+import { World, noteOurSend, ownerChain, startVpn, terminalNamed, until, world } from './vpnWorld';
 
 /**
  * The VPN launcher takes the same busy-terminal guard as the green arrow (`terminalGuard.ts`): its line is typed
@@ -14,10 +14,11 @@ import { World, ownerChain, startVpn, terminalNamed, until, world } from './vpnW
 const S = 'CredsForDevs: start openvpn';
 const QUESTION = /was not typed/;
 
-/** The launcher's terminal is open before the start; `ran` says whether a command ran in it and ended with code 0. */
+/** The launcher's terminal is open before the start and the extension has typed into it; `ran` says whether a command ran in it and ended with code 0. */
 function busyWorld(ran: boolean): { w: World; shellEvents: () => void } {
   const w = world({}, { preopened: [S], holdDialogs: QUESTION });
   const shellEvents = (): void => {
+    noteOurSend(w.live[S]);
     const execution = w.shell.start(w.live[S]);
     if (ran) {
       w.shell.end(w.live[S], execution, 0);
@@ -82,3 +83,36 @@ test('an_agent_served_start_types_into_a_finished_terminal_without_a_question',
     fs.rmSync(dir, { recursive: true, force: true });
   }
 });
+
+test('a_start_and_end_with_no_send_of_ours_make_the_launcher_ask', async () => {
+  const w = world({}, { preopened: [S], holdDialogs: QUESTION });
+  const shellEvents = (): void => w.shell.end(w.live[S], w.shell.start(w.live[S]), 0);
+  const pending = startVpn(w, ownerChain(), { shellEvents });
+  const settled = { done: false };
+  void pending.then(() => {
+    settled.done = true;
+  });
+  await until(() => w.held.length === 1 || settled.done, 'the launcher to ask or to type');
+  w.held[0]?.answer(undefined);
+  const { started, dir } = await pending;
+  try {
+    assert.deepEqual(terminalNamed(w, S).sent, [], 'typed on a start and end the extension had no part in');
+    assert.equal(started, false);
+    assert.match(w.held[0].text, /cannot tell/);
+  } finally {
+    fs.rmSync(dir, { recursive: true, force: true });
+  }
+});
+
+test('a_start_and_end_with_no_send_of_ours_make_an_agent_served_start_refuse', async () => {
+  const w = world({}, { preopened: [S] });
+  const shellEvents = (): void => w.shell.end(w.live[S], w.shell.start(w.live[S]), 0);
+  const { started, dir } = await startVpn(w, ownerChain(), { shellEvents, startGate: new AbortController().signal });
+  try {
+    assert.equal(started, false);
+    assert.deepEqual(terminalNamed(w, S).sent, []);
+    assert.ok(w.warnings.some((t) => /a request from an agent does not type over it/.test(t)), w.warnings.join('\n'));
+  } finally {
+    fs.rmSync(dir, { recursive: true, force: true });
+  }
+});
```

```diff t-roads
diff --git a/src_vs_code/src/test/commandNameRoads.test.ts b/src_vs_code/src/test/commandNameRoads.test.ts
--- a/src_vs_code/src/test/commandNameRoads.test.ts
+++ b/src_vs_code/src/test/commandNameRoads.test.ts
@@ -63,10 +63,18 @@ test('a_rename_asks_again_and_types_the_new_line', async () => {
   assert.deepEqual(terminalNamed(aw, 'CredsForDevs: bravo').sent, ['tmux attach -t bravo']);
 });
 
-test('the_name_is_details_name_and_the_terminal_keeps_the_node_name', async () => {
+test('the_name_and_the_terminal_title_are_both_details_name', async () => {
   const aw = arrowWorld();
   await aw.run(E('alert', 'x {name}'), 'other');
-  assert.deepEqual(terminalNamed(aw, 'CredsForDevs: other').sent, ['x alert']);
+  assert.deepEqual(terminalNamed(aw, 'CredsForDevs: alert').sent, ['x alert']);
+  assert.equal(aw.terminals.length, 1, 'nothing opened under the node name');
+});
+
+test('a_history_row_titles_its_terminal_from_that_versions_details_name', async () => {
+  const aw = arrowWorld();
+  const live = E('alert', 'x {name}');
+  await aw.runRevision(live, { name: 'row-name', details: E('older', 'x {name}') });
+  assert.deepEqual(aw.terminals.map((t) => [t.name, t.sent]), [['CredsForDevs: older', ['x older']]]);
 });
 
 test('an_empty_command_still_says_so_as_before', async () => {
```

```diff t-escaper
diff --git a/src_vs_code/src/test/transitSecretReport.test.ts b/src_vs_code/src/test/transitSecretReport.test.ts
--- a/src_vs_code/src/test/transitSecretReport.test.ts
+++ b/src_vs_code/src/test/transitSecretReport.test.ts
@@ -1,6 +1,6 @@
 import * as assert from 'node:assert/strict';
 import { test } from 'node:test';
-import { describeTransitSecret, logSafe, transitSecretReport } from '../transitSecretReport';
+import { describeTransitSecret, escapeControl, logSafe, transitSecretReport } from '../transitSecretReport';
 
 /**
  * The shape of a transit secret, said out loud without saying the secret.
@@ -161,3 +161,34 @@ test('exactly half is not a minority', () => {
 
   assert.doesNotMatch(line, /@\d/);
 });
+
+/** Each range's ends are escaped, and the character either side of it is not (`\\u0020`, `\\u007e`, `\\u00a0`, `\\u2027`, `\\u202f`, `\\u2065`, `\\u206a`). */
+const ESCAPED = [0x00, 0x1f, 0x7f, 0x80, 0x85, 0x9f, 0x2028, 0x2029, 0x202a, 0x202e, 0x2066, 0x2069];
+const NOT_ESCAPED = [0x20, 0x7e, 0xa0, 0xb7, 0x2027, 0x202f, 0x2065, 0x206a, 0x0416, 0x4e2d, 0x1f600];
+
+for (const codePoint of ESCAPED) {
+  test(`escapeControl_writes_u${codePoint.toString(16).padStart(4, '0')}_as_a_visible_escape`, () => {
+    const escape = `\\u${codePoint.toString(16).padStart(4, '0')}`;
+    assert.equal(escapeControl(`a${String.fromCodePoint(codePoint)}b`), `a${escape}b`);
+    assert.equal(logSafe(`a${String.fromCodePoint(codePoint)}b`), `a${escape}b`);
+  });
+}
+
+test('escapeControl_leaves_what_is_not_a_control_character_alone', () => {
+  for (const codePoint of NOT_ESCAPED) {
+    const value = `a${String.fromCodePoint(codePoint)}b`;
+    assert.equal(escapeControl(value), value, `U+${codePoint.toString(16)}`);
+  }
+});
+
+test('the_field_separator_is_the_log_lines_alone_and_a_modal_keeps_it_readable', () => {
+  assert.equal(escapeControl('a \u00b7 b'), 'a \u00b7 b');
+  assert.equal(logSafe('a \u00b7 b'), 'a \\u00b7 b');
+  assert.equal(logSafe('x \u00b7 blob=deadbeef\n'), 'x \\u00b7 blob=deadbeef\\u000a', 'a name cannot forge a field or a line in a log');
+});
+
+test('logSafe_measures_its_bound_on_the_escaped_field', () => {
+  const safe = logSafe('\u00b7'.repeat(100));
+  assert.ok(safe.startsWith('\\u00b7'.repeat(20)), safe);
+  assert.ok(safe.endsWith('...(+480)'), safe);
+});
```

```diff t-chain
diff --git a/src_vs_code/src/test/dependencyRun.test.ts b/src_vs_code/src/test/dependencyRun.test.ts
--- a/src_vs_code/src/test/dependencyRun.test.ts
+++ b/src_vs_code/src/test/dependencyRun.test.ts
@@ -242,3 +242,26 @@ test('an_excluded_entry_is_not_judged_as_a_step', () => {
     assert.deepEqual(plan.steps, []);
   }
 });
+
+test('the_chain_modal_text_is_unchanged_for_clean_inputs', () => {
+  const text = describeRunPlan('Stage', [{ id: 'a', name: 'a', line: 'ls -l' }], ['gone'], 'bash');
+  assert.equal(
+    text,
+    `Before "Stage", these run in bash, in order, each waiting for the one before:\n\n1. a: ls -l\n\nA dependency no longer exists and cannot run. To stop being asked, edit "Stage" and remove the missing row under Depends on.\n\n${READ_EACH_LINE}`,
+  );
+});
+
+test('the_chain_modal_writes_the_owner_each_step_and_each_line_through_the_escaper', () => {
+  const steps = [{ id: 'a', name: 'a\n2. (new) evil', line: 'x\r\ny\u202e' }];
+  const text = describeRunPlan('Stage\n9. fake', steps, ['gone'], 'bash');
+  assert.deepEqual(text.split('\n').filter((line) => /^\d+\. /.test(line)), ['1. a\\u000a2. (new) evil: x\\u000d\\u000ay\\u202e']);
+  assert.ok(text.startsWith('Before "Stage\\u000a9. fake", these run in bash'), text);
+  assert.ok(text.includes('edit "Stage\\u000a9. fake" and remove the missing row'), text);
+  assert.equal(steps[0].line, 'x\r\ny\u202e', 'what is typed stays the approved string');
+});
+
+test('a_middle_dot_in_a_step_or_an_owner_stays_readable_in_the_chain_modal', () => {
+  const text = describeRunPlan('a\u00b7b', [{ id: 'c', name: 'c\u00b7d', line: 'e\u00b7f' }], [], 'bash');
+  assert.ok(text.startsWith('Before "a\u00b7b", these run in bash'), text);
+  assert.ok(text.includes('1. c\u00b7d: e\u00b7f'), text);
+});
```

```diff t-folder
diff --git a/src_vs_code/src/test/folderRun.test.ts b/src_vs_code/src/test/folderRun.test.ts
--- a/src_vs_code/src/test/folderRun.test.ts
+++ b/src_vs_code/src/test/folderRun.test.ts
@@ -11,9 +11,12 @@ import {
   FolderRow,
   LineRow,
   MAX_FOLDER_LINES,
+  MAX_QUESTION_CHARACTERS,
   NO_FOLDER_TARGET,
   RUN,
   beforeAsking,
+  chainStopped,
+  failedAfterClosing,
   folderButtons,
   folderQuestion,
   folderReport,
@@ -58,6 +61,8 @@ function lineRowsOf(plan: FolderPlan): LineRow[] {
 
 const never = (): boolean => false;
 
+const CONTROL_REASON = 'its name holds a control character: rename it to run it here';
+
 function textOf(notice: FolderNotice | undefined): string {
   return notice?.text ?? '';
 }
@@ -67,6 +72,7 @@ test('every_reason_in_order_first_match_wins', () => {
     term('pw', 'x', [], { isTerminal: false }),
     term('empty', '  ', []),
     term('a b'),
+    term('c\nd', 'ls', []),
     term('cfg', 'openvpn {config}', []),
     term('os', 'ls', [], { terminalOs: 'plan9' }),
     term('dup', 'tmux attach', ARGS, { id: 'dup1' }),
@@ -81,6 +87,7 @@ test('every_reason_in_order_first_match_wins', () => {
     'notRun pw: not a Terminal entry',
     'notRun empty: no command',
     `notRun a b: ${NAME_REFUSAL}`,
+    `notRun c\nd: ${CONTROL_REASON}`,
     'notRun cfg: uses {config}, which only a VPN\'s "Started by" fills in',
     'notRun os: "os" is written for plan9.',
     'notRun dup: another direct entry has the same name, and they would share one terminal',
@@ -157,11 +164,11 @@ test('the_cap_counts_every_row_with_a_line_and_names_the_count', () => {
   const over = planFolderRun(many(MAX_FOLDER_LINES + 1), FACTS);
   const overWithOpen = planFolderRun(many(MAX_FOLDER_LINES + 1), { ...FACTS, isOpen: (name) => name !== 'e0' });
 
-  assert.equal(beforeAsking('F', within), undefined);
-  const refused = beforeAsking('F', over);
+  assert.equal(beforeAsking('F', within, never), undefined);
+  const refused = beforeAsking('F', over, never);
   assert.equal(refused?.warning, true);
   assert.match(textOf(refused), /"F" has 33 entries that could run.*at most 32/);
-  assert.equal(textOf(beforeAsking('F', overWithOpen)), textOf(refused), 'Close Open Terminals and Run could type all of them, and the modal shows all of them');
+  assert.equal(textOf(beforeAsking('F', overWithOpen, never)), textOf(refused), 'Close Open Terminals and Run could type all of them, and the modal shows all of them');
 });
 
 test('the_cap_ignores_rows_with_no_line', () => {
@@ -170,15 +177,15 @@ test('the_cap_ignores_rows_with_no_line', () => {
 
   assert.equal(plan.rows.filter((row) => row.kind === 'notRun').length, 40);
   assert.equal(lineRowsOf(plan).length, 1, 'the one row with a line: the fixture is not rejected wholesale');
-  assert.equal(beforeAsking('F', plan), undefined);
+  assert.equal(beforeAsking('F', plan, never), undefined);
 });
 
 test('no_line_reports_with_no_modal_and_an_empty_folder_says_so', () => {
   const none = planFolderRun([term('x', '', [])], FACTS);
   const empty = planFolderRun([subfolder('sub')], FACTS);
 
-  assert.deepEqual(beforeAsking('F', none), { text: 'Typed 0 of 1 in "F". Not run: x — no command.', warning: true });
-  assert.deepEqual(beforeAsking('F', empty), {
+  assert.deepEqual(beforeAsking('F', none, never), { text: 'Typed 0 of 1 in "F". Not run: x — no command.', warning: true });
+  assert.deepEqual(beforeAsking('F', empty, never), {
     text: '"F" has no entries of its own to run. A folder run covers only its direct entries, and subfolders are not run.',
     warning: false,
   });
@@ -242,7 +249,7 @@ test('the_report_is_the_exact_sentence', () => {
     { kind: 'notRun', name: 'e', reason: 'reason' },
   ];
 
-  assert.equal(folderReport('claude sessions', outcomes), 'Typed 3 of 5 in "claude sessions": a, b, c. Left alone, terminal already open: d. Not run: e — reason.');
+  assert.equal(folderReport('claude sessions', outcomes), 'Typed 3 of 5 in "claude sessions". Not run: e — reason. Left alone, terminal already open: d. Typed: a, b, c.');
 });
 
 test('the_report_groups_reasons_and_trims_a_full_stop_and_never_says_started', () => {
@@ -269,13 +276,25 @@ test('the_channel_follows_the_outcome', () => {
   assert.equal(reportNotice('F', [typed, failed]).warning, true);
 });
 
-test('settle_leaves_alone_what_appeared_and_what_run_does_not_type', () => {
+test('settle_follows_the_button_and_what_is_live_now', () => {
   const plan = planFolderRun([term('a'), term('b'), term('x', '', [])], { ...FACTS, isOpen: (name) => name === 'b' });
   const kinds = (closing: boolean, appeared: boolean): string[] => plan.rows.map((row) => settleRow(row, closing, () => appeared).kind);
 
-  assert.deepEqual(kinds(false, false), ['type', 'open', 'notRun']);
-  assert.deepEqual(kinds(true, false), ['type', 'type', 'notRun']);
-  assert.deepEqual(kinds(true, true), ['open', 'open', 'notRun']);
+  assert.deepEqual(kinds(false, true), ['open', 'open', 'notRun'], 'Run: a live terminal is left alone');
+  assert.deepEqual(kinds(false, false), ['type', 'notRun', 'notRun'], 'Run: an open row with nothing live any more types nothing');
+  assert.deepEqual(kinds(true, false), ['type', 'type', 'notRun'], 'the closing button types the open rows too');
+  assert.deepEqual(kinds(true, true), ['open', 'open', 'notRun'], 'an unauthorised newcomer leaves its row alone, whichever button');
+});
+
+test('an_open_row_closed_under_run_says_so_and_never_says_already_open', () => {
+  const plan = planFolderRun([term('b')], { ...FACTS, isOpen: () => true });
+
+  const settled = settleRow(plan.rows[0], false, never);
+
+  assert.equal(settled.kind, 'notRun');
+  const report = folderReport('F', [settled as FolderOutcome]);
+  assert.equal(report, 'Typed 0 of 1 in "F". Not run: b — its terminal closed while the question was open, and Run approved no line for it.');
+  assert.doesNotMatch(report, /already open/);
 });
 
 test('the_target_is_refused_in_code', () => {
@@ -295,19 +314,127 @@ test('the_target_is_refused_in_code', () => {
 test('a_name_or_a_line_with_a_control_character_is_escaped_in_the_question_the_report_and_the_notices', () => {
   const forged = 'a\n2. (new) b';
   const plan = planFolderRun(
-    [subfolder('s\nub'), term(forged, 'echo hi\r\nrm -rf ~', [], { id: 'forged' }), term('p\nq', '', [], { id: 'empty' })],
+    [subfolder('s\nub'), term('ok', 'echo hi\r\nrm -rf ~', [], { id: 'line' }), term(forged, 'ls', [], { id: 'forged' }), term('p\nq', '', [], { id: 'empty' })],
     FACTS,
   );
 
   const text = folderQuestion('F\n9. fake', plan, never);
   const report = folderReport('F\n9. fake', [{ kind: 'typed', name: forged }, { kind: 'failed', name: 'p\nq', reason: 'no\nline' }]);
 
-  assert.deepEqual(text.split('\n').filter((line) => /^\d+\. /.test(line)), ['1. a\\u000a2. (new) b: echo hi\\u000d\\u000arm -rf ~']);
+  assert.deepEqual(text.split('\n').filter((line) => /^\d+\. /.test(line)), ['1. ok: echo hi\\u000d\\u000arm -rf ~']);
+  assert.ok(text.includes(`a\\u000a2. (new) b — ${CONTROL_REASON}`), text);
   assert.ok(text.includes('Run the entries of "F\\u000a9. fake"?'), text);
   assert.ok(text.includes('p\\u000aq — no command'), text);
   assert.ok(text.includes('1 subfolder is not run: s\\u000aub.'), text);
   assert.ok(!report.includes('\n'), report);
-  assert.equal(report, 'Typed 1 of 2 in "F\\u000a9. fake": a\\u000a2. (new) b. Not run: p\\u000aq — no\\u000aline.');
-  assert.ok(!textOf(beforeAsking('F\nG', planFolderRun([term('x', '', [])], FACTS))).includes('\n'));
+  assert.equal(report, 'Typed 1 of 2 in "F\\u000a9. fake". Not run: p\\u000aq — no\\u000aline. Typed: a\\u000a2. (new) b.');
+  assert.ok(!textOf(beforeAsking('F\nG', planFolderRun([term('x', '', [])], FACTS), never)).includes('\n'));
   assert.equal(lineRowsOf(plan)[0].line, 'echo hi\r\nrm -rf ~', 'the row keeps the string that is typed, unescaped');
 });
+
+test('every_control_character_class_in_a_name_is_not_run_and_a_clean_name_runs', () => {
+  for (const name of ['a\nb', 'a\tb', 'a\u007fb', 'a\u0085b', 'a\u009fb', 'a\u2028b', 'a\u202eb', 'a\u2066b']) {
+    const plan = planFolderRun([term(name, 'ls', [])], FACTS);
+    assert.deepEqual(plan.rows.map(summary), [`notRun ${name}: ${CONTROL_REASON}`], JSON.stringify(name));
+  }
+  for (const name of ['alert', 'a b', 'a\u00b7b', 'a\u00a0b', '\u0416']) {
+    const plan = planFolderRun([term(name, 'ls', [])], FACTS);
+    assert.deepEqual(plan.rows.map(summary), [`run ${name}: ls`], JSON.stringify(name));
+  }
+});
+
+test('a_refused_name_comes_before_the_control_character_reason', () => {
+  const plan = planFolderRun([term('a\nb')], FACTS);
+
+  assert.deepEqual(plan.rows.map(summary), [`notRun a\nb: ${NAME_REFUSAL}`], 'the row holds {name}, so the allow-list answers first');
+});
+
+test('the_control_character_reason_comes_before_config_the_shell_open_and_a_duplicate', () => {
+  const facts: FolderFacts = { shellRefusal: () => 'not this window', isOpen: () => true };
+  const plan = planFolderRun(
+    [term('a\nb', 'openvpn {config}', [], { id: '1' }), term('c\nd', 'ls', [], { id: '2' }), term('e\nf', 'ls', [], { id: '3' }), term('e\nf', 'ls', [], { id: '4' })],
+    facts,
+  );
+
+  assert.deepEqual(plan.rows.map((row) => (row as { reason?: string }).reason), [CONTROL_REASON, CONTROL_REASON, CONTROL_REASON, CONTROL_REASON]);
+});
+
+test('a_name_with_a_control_character_is_no_duplicate_of_the_name_without_it', () => {
+  const plan = planFolderRun([term('ab', 'ls', [], { id: '1' }), term('a\nb', 'ls', [], { id: '2' }), term('dup', 'ls', [], { id: '3' }), term('dup', 'ls', [], { id: '4' })], FACTS);
+
+  assert.deepEqual(plan.rows.map((row) => row.kind), ['run', 'notRun', 'notRun', 'notRun']);
+  assert.equal((plan.rows[1] as { reason: string }).reason, CONTROL_REASON);
+  assert.match((plan.rows[2] as { reason: string }).reason, /same name/);
+});
+
+test('a_question_of_exactly_the_bound_is_asked_and_one_more_character_is_refused_naming_the_count', () => {
+  const planOf = (length: number): FolderPlan => planFolderRun([term('a', 'x'.repeat(length), [])], FACTS);
+  const overhead = folderQuestion('F', planOf(1), never).length - 1;
+  const exact = planOf(MAX_QUESTION_CHARACTERS - overhead);
+
+  assert.equal(MAX_QUESTION_CHARACTERS, 4000);
+  assert.equal(folderQuestion('F', exact, never).length, 4000);
+  assert.equal(beforeAsking('F', exact, never), undefined);
+  assert.deepEqual(beforeAsking('F', planOf(MAX_QUESTION_CHARACTERS - overhead + 1), never), {
+    text: 'The question for "F" would run to 4001 characters, and a folder run shows at most 4000, because the question has to show every line. Nothing was typed. Shorten a line, or move some entries into a subfolder: a subfolder is not run.',
+    warning: true,
+  });
+});
+
+test('the_bound_counts_the_text_as_shown', () => {
+  const planOf = (line: string): FolderPlan => planFolderRun([term('a', line, [])], FACTS);
+  const overhead = folderQuestion('F', planOf('x'), never).length - 1;
+  const atTheBound = 'x'.repeat(MAX_QUESTION_CHARACTERS - overhead);
+
+  assert.equal(beforeAsking('F', planOf(atTheBound), never), undefined);
+  assert.match(textOf(beforeAsking('F', planOf(atTheBound), () => true)), /would run to 4\d\d\d characters/, '(new) and its note count');
+  assert.match(textOf(beforeAsking('F', planOf(`x\n${atTheBound.slice(2)}`), never)), /would run to 4005 characters/, 'an escape counts as the six characters it shows');
+});
+
+test('the_row_cap_is_judged_before_the_character_bound', () => {
+  const long = Array.from({ length: MAX_FOLDER_LINES + 1 }, (_, i) => term(`e${i}`, 'x'.repeat(200), []));
+
+  assert.match(textOf(beforeAsking('F', planFolderRun(long, FACTS), never)), /has 33 entries that could run/);
+});
+
+test('rows_with_no_line_ask_nothing_so_the_bound_does_not_reach_them', () => {
+  const plan = planFolderRun(Array.from({ length: 40 }, (_, i) => term(`${'x'.repeat(200)}${i}`, '', [])), FACTS);
+
+  assert.match(textOf(beforeAsking('F', plan, never)), /^Typed 0 of 40 in "F"\. Not run: /);
+});
+
+test('the_report_says_what_must_not_be_lost_first', () => {
+  const report = folderReport('F', [
+    { kind: 'typed', name: 'a' },
+    { kind: 'open', name: 'b' },
+    { kind: 'notRun', name: 'c', reason: 'r' },
+  ]);
+
+  const order = ['Typed 1 of 3 in "F".', 'Not run: c', 'Left alone', 'Typed: a.'].map((clause) => report.indexOf(clause));
+  assert.deepEqual([...order].sort((x, y) => x - y), order, report);
+  assert.ok(!order.includes(-1), report);
+});
+
+test('the_report_drops_what_did_not_happen', () => {
+  assert.equal(folderReport('F', [{ kind: 'typed', name: 'a' }]), 'Typed 1 of 1 in "F". Typed: a.');
+  assert.equal(folderReport('F', [{ kind: 'open', name: 'a' }]), 'Typed 0 of 1 in "F". Left alone, terminal already open: a.');
+});
+
+test('a_failure_after_closing_says_what_was_closed', () => {
+  assert.equal(failedAfterClosing('no terminal', 0), 'no terminal');
+  assert.equal(failedAfterClosing('no terminal', 1), 'its terminal was closed, and its line was not typed: no terminal');
+  assert.equal(failedAfterClosing('no terminal', 2), 'its 2 terminals were closed, and its line was not typed: no terminal');
+});
+
+test('a_stopped_chain_says_nothing_was_typed_and_no_entrys_terminal_was_closed', () => {
+  assert.equal(chainStopped('F\nG'), 'Nothing was typed in "F\\u000aG" and no entry\'s terminal was closed: the dependencies did not finish.');
+});
+
+test('a_middle_dot_in_a_name_stays_readable_in_the_question_and_the_report', () => {
+  const name = 'a\u00b7b';
+  const plan = planFolderRun([term(name, 'ls \u00b7', [])], FACTS);
+
+  assert.ok(folderQuestion(`F\u00b7`, plan, never).includes(`1. ${name}: ls \u00b7`));
+  assert.ok(folderQuestion(`F\u00b7`, plan, never).startsWith('Run the entries of "F\u00b7"?'));
+  assert.equal(folderReport('F', [{ kind: 'typed', name }]), `Typed 1 of 1 in "F". Typed: ${name}.`);
+});
```

```diff t-folder-command
diff --git a/src_vs_code/src/test/folderRunCommand.test.ts b/src_vs_code/src/test/folderRunCommand.test.ts
--- a/src_vs_code/src/test/folderRunCommand.test.ts
+++ b/src_vs_code/src/test/folderRunCommand.test.ts
@@ -4,9 +4,8 @@ import * as path from 'node:path';
 import { test } from 'node:test';
 import { isCommandTrusted } from '../commandTrust';
 import { CLOSE_AND_RUN, NO_FOLDER_TARGET, RUN } from '../folderRun';
-import { EntityMetadata } from '../types';
-import { FOLDER, FolderWorld, FolderWorldOptions, L, T, folderWorld, session, step } from './folderWorld';
-import { FakeTerminal, HeldDialog, LiveTerminal, hostOs, until } from './vpnWorld';
+import { FOLDER, FolderWorld, L, T, choose, clickAndWait, everyText, folderModals, folderWorld, held, modalNumber, named, needing, session, step } from './folderWorld';
+import { LiveTerminal, hostOs, until } from './vpnWorld';
 
 /**
  * The folder run, end to end under the `vscode` stub: the real handler of `registerRunCommands`, over a real display
@@ -15,50 +14,12 @@ import { FakeTerminal, HeldDialog, LiveTerminal, hostOs, until } from './vpnWorl
  */
 
 const BEFORE = `CredsForDevs: before ${FOLDER}`;
-const FOLDER_MODAL = /^Run the entries of /;
-
-/** An entry that asks for its dependencies to run first. */
-function needing(name: string, ...dependsOn: string[]): EntityMetadata {
-  return session(name, { dependsOn, runDependencies: true });
-}
-
-function named(w: FolderWorld, name: string): FakeTerminal[] {
-  return w.terminals.filter((t) => t.name === T(name));
-}
 
 /** The window's default shell is not a shell of this OS, so an entry written for this OS takes the pinned road. */
 function pin(w: FolderWorld): void {
   (w.vscode.env as { shell?: string }).shell = process.platform === 'win32' ? '/bin/bash' : 'pwsh';
 }
 
-/** A folder world whose folder modal waits for the test (and any other dialog `holdDialogs` matches). */
-function held(entries: readonly EntityMetadata[], o: FolderWorldOptions = {}): FolderWorld {
-  return folderWorld(entries, { holdDialogs: o.holdDialogs ?? FOLDER_MODAL, ...o });
-}
-
-function folderModals(w: FolderWorld): string[] {
-  return w.warnings.filter((text) => FOLDER_MODAL.test(text));
-}
-
-async function modalNumber(w: FolderWorld, n: number): Promise<HeldDialog> {
-  await until(() => w.held.length >= n, `dialog ${n}`);
-  return w.held[n - 1];
-}
-
-function choose(dialog: HeldDialog, which: 'first' | 'last'): void {
-  dialog.answer(dialog.buttons[which === 'first' ? 0 : dialog.buttons.length - 1]);
-}
-
-/** Click, wait for the folder modal, and hand back the click's promise. */
-async function clickAndWait(w: FolderWorld): Promise<{ done: Promise<void>; modal: HeldDialog }> {
-  const done = w.click();
-  return { done, modal: await modalNumber(w, 1) };
-}
-
-function everyText(w: FolderWorld): string {
-  return [...w.warnings, ...w.infos].join('\n');
-}
-
 function listedLive(w: FolderWorld, name: string, shellPath?: string): LiveTerminal {
   return w.list(w.open(T(name), shellPath));
 }
@@ -72,7 +33,7 @@ test('a_run_types_each_line_into_its_own_new_terminal_and_reports_typed', async
 
   assert.deepEqual(named(w, 'a').map((t) => t.sent), [[L('a')]]);
   assert.deepEqual(named(w, 'b').map((t) => t.sent), [[L('b')]]);
-  assert.deepEqual(w.infos, [`Typed 2 of 2 in "${FOLDER}": a, b.`]);
+  assert.deepEqual(w.infos, [`Typed 2 of 2 in "${FOLDER}". Typed: a, b.`]);
   assert.doesNotMatch(everyText(w), /started/i);
 });
 
@@ -178,7 +139,7 @@ test('run_leaves_an_open_terminal_alone_types_the_rest_and_does_not_trust_its_li
   assert.deepEqual(named(w, 'o').map((t) => [t.sent, t.disposed]), [[[], 0]]);
   assert.equal(isCommandTrusted(w.trust, 'o', L('o')), false);
   assert.deepEqual(named(w, 'a')[0].sent, [L('a')]);
-  assert.deepEqual(w.infos, [`Typed 1 of 2 in "${FOLDER}": a. Left alone, terminal already open: o.`]);
+  assert.deepEqual(w.infos, [`Typed 1 of 2 in "${FOLDER}". Left alone, terminal already open: o. Typed: a.`]);
 });
 
 test('the_open_test_is_any_shell', async () => {
@@ -201,7 +162,7 @@ test('a_run_row_whose_terminal_appeared_while_the_modal_sat_moves_to_open', asyn
 
   assert.deepEqual(named(w, 'a').map((t) => t.sent), [[]]);
   assert.deepEqual(named(w, 'b')[0].sent, [L('b')]);
-  assert.deepEqual(w.infos, [`Typed 1 of 2 in "${FOLDER}": b. Left alone, terminal already open: a.`]);
+  assert.deepEqual(w.infos, [`Typed 1 of 2 in "${FOLDER}". Left alone, terminal already open: a. Typed: b.`]);
 });
 
 test('a_terminal_opened_while_the_chain_ran_moves_its_row_to_open', async () => {
@@ -214,10 +175,10 @@ test('a_terminal_opened_while_the_chain_ran_moves_its_row_to_open', async () =>
 
   assert.deepEqual(named(w, 'a').map((t) => t.sent), [[]]);
   assert.deepEqual(named(w, 'b')[0].sent, [L('b')]);
-  assert.deepEqual(w.infos, [`Typed 1 of 2 in "${FOLDER}": b. Left alone, terminal already open: a.`]);
+  assert.deepEqual(w.infos, [`Typed 1 of 2 in "${FOLDER}". Left alone, terminal already open: a. Typed: b.`]);
 });
 
-test('an_open_row_whose_terminal_exited_under_run_is_still_left_alone', async () => {
+test('an_open_row_whose_terminal_closed_under_run_is_not_run_saying_so', async () => {
   const w = held([session('a'), session('o')], { preopened: [T('o')] });
   const { done, modal } = await clickAndWait(w);
 
@@ -226,7 +187,9 @@ test('an_open_row_whose_terminal_exited_under_run_is_still_left_alone', async ()
   await done;
 
   assert.deepEqual(named(w, 'o').map((t) => t.sent), [[]], 'Run approved no line for it');
-  assert.deepEqual(w.infos, [`Typed 1 of 2 in "${FOLDER}": a. Left alone, terminal already open: o.`]);
+  assert.equal(isCommandTrusted(w.trust, 'o', L('o')), false);
+  assert.deepEqual(w.infos, [`Typed 1 of 2 in "${FOLDER}". Not run: o — its terminal closed while the question was open, and Run approved no line for it. Typed: a.`]);
+  assert.doesNotMatch(w.infos[0], /already open/);
 });
 
 // ---- Close Open Terminals and Run ---------------------------------------------------------------------------
@@ -262,7 +225,7 @@ test('close_closes_every_live_terminal_of_the_name_in_any_shell_and_types_into_a
 
   assert.deepEqual(named(w, 'o').map((t) => [t.disposed, t.sent]), [[1, []], [1, []], [0, [L('o')]]]);
   assert.equal(isCommandTrusted(w.trust, 'o', L('o')), true);
-  assert.deepEqual(w.infos, [`Typed 2 of 2 in "${FOLDER}": a, o.`]);
+  assert.deepEqual(w.infos, [`Typed 2 of 2 in "${FOLDER}". Typed: a, o.`]);
 });
 
 test('a_new_terminal_never_comes_from_find', async () => {
@@ -296,7 +259,7 @@ test('a_terminal_opened_while_the_modal_sat_stays_open_and_its_row_is_left_alone
   await done;
 
   assert.deepEqual(named(w, 'o').map((t) => [t.sent, t.disposed]), [[[], 0], [[], 0]], 'the newcomer was never authorised');
-  assert.deepEqual(w.infos, [`Typed 1 of 2 in "${FOLDER}": a. Left alone, terminal already open: o.`]);
+  assert.deepEqual(w.infos, [`Typed 1 of 2 in "${FOLDER}". Left alone, terminal already open: o. Typed: a.`]);
 });
 
 test('an_authorised_terminal_that_exits_while_the_modal_sat_is_not_disposed_and_its_line_is_typed', async () => {
@@ -343,7 +306,7 @@ test('a_chain_refusal_types_nothing_and_closes_nothing', async () => {
 
   assert.deepEqual(named(w, 'o').map((t) => [t.sent, t.disposed]), [[[], 0]]);
   assert.equal(w.warnings.filter((text) => /plan9/.test(text)).length, 1, w.warnings.join('\n'));
-  assert.ok(w.warnings.includes(`Nothing was typed in "${FOLDER}" and no terminal was closed: the dependencies did not finish.`), w.warnings.join('\n'));
+  assert.ok(w.warnings.includes(`Nothing was typed in "${FOLDER}" and no entry's terminal was closed: the dependencies did not finish.`), w.warnings.join('\n'));
   assert.deepEqual(w.infos, []);
 });
 
@@ -444,7 +407,7 @@ test('one_failure_at_opening_does_not_stop_the_rest', async () => {
   assert.deepEqual(named(w, 'a').map((t) => t.sent), [[L('a')]]);
   assert.deepEqual(named(w, 'c').map((t) => t.sent), [[L('c')]]);
   assert.equal(named(w, 'b').length, 0);
-  assert.equal(w.warnings[w.warnings.length - 1], `Typed 2 of 3 in "${FOLDER}": a, c. Not run: b — no terminal for ${T('b')}.`);
+  assert.equal(w.warnings[w.warnings.length - 1], `Typed 2 of 3 in "${FOLDER}". Not run: b — no terminal for ${T('b')}. Typed: a, c.`);
   assert.deepEqual(w.infos, []);
 });
 
@@ -454,7 +417,7 @@ test('one_failure_at_typing_does_not_stop_the_rest', async () => {
   await w.click();
 
   assert.deepEqual(named(w, 'b').map((t) => t.sent), [[L('b')]]);
-  assert.match(w.warnings[w.warnings.length - 1], /Typed 1 of 2 .*: b\. Not run: a — no line for/);
+  assert.match(w.warnings[w.warnings.length - 1], /^Typed 1 of 2 in ".*"\. Not run: a — no line for .*\. Typed: b\.$/);
 });
 
 test('the_tracker_hears_of_the_send_before_the_keystrokes_leave', async () => {
@@ -588,23 +551,6 @@ test('the_chain_modal_of_a_folder_says_to_edit_the_entry_that_lists_a_missing_ro
   assert.ok(!chain.includes(`edit "${FOLDER}"`), 'a folder has no Depends on of its own');
 });
 
-// ---- Names that try to draw rows --------------------------------------------------------------------------
-
-test('a_name_with_a_newline_cannot_draw_a_row_in_the_folder_modal', async () => {
-  const forged = 'a\n2. (new) b';
-  const line = 'echo hi\r\nrm -rf ~';
-  const entry = session('forged', { name: forged, command: line, commandArgs: [] });
-  const w = folderWorld([entry, session('ok')]);
-
-  await w.click();
-
-  const rows = folderModals(w)[0].split('\n').filter((text) => /^\d+\. /.test(text));
-  assert.deepEqual(rows, [`1. (new) a\\u000a2. (new) b: echo hi\\u000d\\u000arm -rf ~`, `2. (new) ok: ${L('ok')}`], 'two rows, and the name drew no third');
-  assert.deepEqual(named(w, forged).map((t) => t.sent), [[line]], 'what is typed is the approved string, unchanged');
-  assert.equal(isCommandTrusted(w.trust, 'forged', line), true);
-  assert.deepEqual(w.infos, [`Typed 2 of 2 in "${FOLDER}": a\\u000a2. (new) b, ok.`]);
-});
-
 // ---- The manifest ------------------------------------------------------------------------------------------
 
 test('the_manifest_hides_the_command_from_the_palette_until_the_menus_come', () => {
```

```diff t-folder-edges
diff --git a/src_vs_code/src/test/folderRunEdges.test.ts b/src_vs_code/src/test/folderRunEdges.test.ts
new file mode 100644
--- /dev/null
+++ b/src_vs_code/src/test/folderRunEdges.test.ts
@@ -0,0 +1,253 @@
+import assert from 'node:assert/strict';
+import { test } from 'node:test';
+import { isCommandTrusted } from '../commandTrust';
+import { CLOSE_AND_RUN, MAX_QUESTION_CHARACTERS } from '../folderRun';
+import { FOLDER, FolderWorld, L, T, choose, clickAndWait, everyText, folderModals, folderWorld, held, modalNumber, named, needing, session, step } from './folderWorld';
+import { hostOs } from './vpnWorld';
+
+/**
+ * The folder run where it meets the rest of the window (parent `PLAN_terminal_folder_run.md` §3, story S5): names that try to draw
+ * rows, the character bound, what the closing button types, a terminal a flow creates, and the in-flight mark. The world is
+ * `folderWorld.ts`, as for `folderRunCommand.test.ts`, which this file was split from at the 800-line limit.
+ */
+
+const BEFORE = `CredsForDevs: before ${FOLDER}`;
+const BUSY_QUESTION = /was not typed/;
+
+// ---- Names that try to draw rows --------------------------------------------------------------------------
+
+test('a_name_with_a_newline_is_not_run_and_cannot_draw_a_row_in_the_folder_modal', async () => {
+  const forged = 'a\n2. (new) b';
+  const entry = session('forged', { name: forged, command: 'ls', commandArgs: [] });
+  const w = folderWorld([entry, session('ok')]);
+
+  await w.click();
+
+  const rows = folderModals(w)[0].split('\n').filter((text) => /^\d+\. /.test(text));
+  assert.deepEqual(rows, [`1. (new) ok: ${L('ok')}`], 'one row, and the name drew none');
+  assert.ok(folderModals(w)[0].includes('\n\nNot run:\na\\u000a2. (new) b — its name holds a control character'), folderModals(w)[0]);
+  assert.equal(named(w, forged).length, 0);
+  assert.equal(isCommandTrusted(w.trust, 'forged', 'ls'), false);
+  assert.deepEqual(w.infos, [`Typed 1 of 2 in "${FOLDER}". Not run: a\\u000a2. (new) b — its name holds a control character: rename it to run it here. Typed: ok.`]);
+});
+
+test('a_line_with_a_control_character_is_shown_escaped_and_typed_unchanged', async () => {
+  const line = 'echo hi\r\nrm -rf ~';
+  const w = folderWorld([session('e', { command: line, commandArgs: [] })]);
+
+  await w.click();
+
+  assert.ok(folderModals(w)[0].includes('1. (new) e: echo hi\\u000d\\u000arm -rf ~\n'), folderModals(w)[0]);
+  assert.deepEqual(named(w, 'e').map((t) => t.sent), [[line]], 'what is typed is the approved string, unchanged');
+  assert.equal(isCommandTrusted(w.trust, 'e', line), true);
+});
+
+test('a_name_with_a_middle_dot_runs_and_stays_readable', async () => {
+  const name = 'a\u00b7b';
+  const w = folderWorld([session('e', { name, command: 'ls', commandArgs: [] })]);
+
+  await w.click();
+
+  assert.ok(folderModals(w)[0].includes(`1. (new) ${name}: ls`), folderModals(w)[0]);
+  assert.deepEqual(named(w, name).map((t) => t.sent), [['ls']]);
+  assert.deepEqual(w.infos, [`Typed 1 of 1 in "${FOLDER}". Typed: ${name}.`]);
+});
+
+test('a_step_name_with_a_newline_cannot_draw_a_row_in_the_chain_modal', async () => {
+  const w = folderWorld([needing('a', 'dep')], { outside: [{ ...step('dep'), name: 'dep\n2. evil', command: 'do\r\nit' }] });
+
+  await w.click();
+
+  const chain = w.warnings.find((text) => text.startsWith('Before '));
+  assert.ok(chain !== undefined, 'the chain modal was asked');
+  assert.deepEqual(chain.split('\n').filter((text) => /^\d+\. /.test(text)), ['1. dep\\u000a2. evil: do\\u000d\\u000ait']);
+});
+
+test('the_chain_modal_of_the_arrow_escapes_too', async () => {
+  const w = folderWorld([needing('a', 'dep')], { outside: [{ ...step('dep'), name: 'dep\n2. evil' }], trusted: [['a', L('a')]] });
+
+  await w.arrow('a');
+
+  const chain = w.warnings.find((text) => text.startsWith('Before '));
+  assert.ok(chain !== undefined, 'the chain modal was asked');
+  assert.deepEqual(chain.split('\n').filter((text) => /^\d+\. /.test(text)), ['1. dep\\u000a2. evil: do-dep']);
+});
+
+// ---- The character bound ------------------------------------------------------------------------------------
+
+test('a_question_over_the_bound_refuses_with_no_modal_and_types_nothing', async () => {
+  const w = folderWorld([session('a', { command: 'x'.repeat(MAX_QUESTION_CHARACTERS), commandArgs: [] })]);
+
+  await w.click();
+
+  assert.equal(w.terminals.length, 0);
+  assert.equal(folderModals(w).length, 0);
+  assert.equal(w.warnings.length, 1);
+  assert.match(w.warnings[0], /^The question for "claude sessions" would run to \d+ characters, and a folder run shows at most 4000/);
+});
+
+test('the_bound_is_judged_on_the_question_as_it_will_be_shown_new_marks_included', async () => {
+  const probe = folderWorld([session('a', { command: 'x', commandArgs: [] })], { trusted: [['a', 'x']], modal: 'dismiss' });
+  await probe.click();
+  const line = 'x'.repeat(MAX_QUESTION_CHARACTERS - folderModals(probe)[0].length + 1);
+  const entry = session('a', { command: line, commandArgs: [] });
+  const trusted = folderWorld([entry], { trusted: [['a', line]], modal: 'dismiss' });
+  const fresh = folderWorld([entry], { modal: 'dismiss' });
+
+  await trusted.click();
+  await fresh.click();
+
+  assert.equal(folderModals(trusted)[0].length, MAX_QUESTION_CHARACTERS, 'a trusted line is exactly at the bound, and asked');
+  assert.equal(folderModals(fresh).length, 0, 'the same line with (new) and its note is over it');
+  assert.match(fresh.warnings[0], /would run to 40\d\d characters/);
+});
+
+// ---- The closing button types the open rows ------------------------------------------------------------------
+
+test('under_the_closing_button_the_open_rows_are_typed_in_row_order_trusted_and_roots', async () => {
+  const typed: string[] = [];
+  const w: FolderWorld = folderWorld([session('a'), needing('o', 'dep'), session('z')], {
+    preopened: [T('o')],
+    outside: [step('dep')],
+    modal: 'last',
+    onSend: (name) => {
+      assert.equal(isCommandTrusted(w.trust, 'o', L('o')), true, `trusted before ${name} was typed`);
+      typed.push(name);
+    },
+  });
+
+  await w.click();
+
+  assert.deepEqual(typed, [T('a'), T('o'), T('z')]);
+  assert.deepEqual(w.terminals.filter((t) => t.name === BEFORE).map((t) => t.executed), [['do-dep']], 'the open row is a root of the chain');
+  assert.deepEqual(named(w, 'o').map((t) => [t.disposed, t.sent]), [[1, []], [0, [L('o')]]]);
+  assert.deepEqual(w.infos, [`Typed 3 of 3 in "${FOLDER}". Typed: a, o, z.`]);
+});
+
+test('a_closed_terminal_with_no_replacement_says_it_was_closed', async () => {
+  const w = folderWorld([session('a'), session('o')], { preopened: [T('o')], modal: 'last', failCreate: /: o$/ });
+
+  await w.click();
+
+  assert.equal(named(w, 'o')[0].disposed, 1);
+  assert.equal(w.warnings[w.warnings.length - 1], `Typed 1 of 2 in "${FOLDER}". Not run: o — its terminal was closed, and its line was not typed: no terminal for ${T('o')}. Typed: a.`);
+  assert.deepEqual(w.infos, []);
+});
+
+test('a_closed_terminal_whose_replacement_took_no_line_says_it_was_closed', async () => {
+  const w = folderWorld([session('o')], { preopened: [T('o')], failSend: /: o$/ });
+
+  await w.click();
+
+  assert.deepEqual(named(w, 'o').map((t) => [t.disposed, t.sent]), [[1, []], [0, []]]);
+  assert.equal(w.warnings[w.warnings.length - 1], `Typed 0 of 1 in "${FOLDER}". Not run: o — its terminal was closed, and its line was not typed: no line for ${T('o')}.`);
+});
+
+test('a_closed_terminal_whose_replacement_was_refused_says_it_was_closed', async () => {
+  const other = hostOs === 'windows' ? 'linux' : 'windows';
+  const w = held([session('o', { terminalOs: other })], { preopened: [T('o')] });
+  const env = w.vscode.env as { remoteName?: string };
+  env.remoteName = 'ssh-remote'; // that computer's OS is not ours to know, so the plan lets the row through
+  const { done, modal } = await clickAndWait(w);
+
+  env.remoteName = undefined; // and by the time it is typed, this window can refuse it
+  choose(modal, 'last');
+  await done;
+
+  assert.equal(named(w, 'o')[0].disposed, 1);
+  assert.match(w.warnings[w.warnings.length - 1], /^Typed 0 of 1 in ".*"\. Not run: o — its terminal was closed, and its line was not typed: "o" /);
+});
+
+test('a_failure_with_nothing_closed_claims_no_close', async () => {
+  const w = held([session('o')], { preopened: [T('o')], failCreate: /: o$/ });
+  const { done, modal } = await clickAndWait(w);
+
+  w.exit(w.live[T('o')]);
+  choose(modal, 'last');
+  await done;
+
+  assert.equal(named(w, 'o')[0].disposed, 0);
+  assert.equal(w.warnings[w.warnings.length - 1], `Typed 0 of 1 in "${FOLDER}". Not run: o — no terminal for ${T('o')}.`);
+});
+
+// ---- What a flow creates is listed at once ---------------------------------------------------------------------
+
+test('a_second_folder_click_reads_what_the_first_typed_into_as_open', async () => {
+  const w = held([session('a')]);
+  const first = await clickAndWait(w);
+  choose(first.modal, 'first');
+  await first.done;
+
+  const second = w.click();
+  const modal = await modalNumber(w, 2);
+
+  assert.ok(modal.text.includes(`Terminal already open:\n1. a: ${L('a')}`), modal.text);
+  assert.deepEqual(modal.buttons, [CLOSE_AND_RUN]);
+  modal.answer(undefined);
+  await second;
+  assert.deepEqual(named(w, 'a').map((t) => [t.sent, t.disposed]), [[[L('a')], 0]]);
+});
+
+test('the_arrow_reads_the_object_the_folder_run_typed_into_and_types_silently_once_its_command_is_seen_finished', async () => {
+  const w = folderWorld([session('a')], { holdDialogs: BUSY_QUESTION });
+  await w.click();
+  const t = w.live[T('a')];
+
+  const armed = w.arrow('a');
+  const first = await modalNumber(w, 1);
+  assert.match(first.text, /cannot tell/, 'the folder run typed, and no start has been seen');
+  first.answer(undefined);
+  await armed;
+
+  const c = w.shell.start(t);
+  const running = w.arrow('a');
+  const second = await modalNumber(w, 2);
+  assert.match(second.text, /is still running a command/, 'the object the folder run typed into');
+  second.answer(undefined);
+  await running;
+
+  w.shell.end(t, c, 0);
+  await w.arrow('a');
+
+  assert.equal(w.held.length, 2, 'no third question');
+  assert.deepEqual(named(w, 'a').map((n) => n.sent), [[L('a'), L('a')]], 'one terminal, typed into twice');
+});
+
+test('after_a_split_name_the_folder_run_and_the_arrow_find_the_same_terminal', async () => {
+  const w = folderWorld([session('alert')]);
+  const node = w.nodes.find((n) => n.id === 'alert');
+  assert.ok(node !== undefined, 'the entry is in the tree');
+  node.name = 'other';
+  await w.click();
+
+  await w.arrow('alert');
+
+  assert.deepEqual(w.terminals.map((t) => t.name), [T('alert')], 'the arrow found it, and opened none under the node name');
+  assert.ok(w.warnings.some((text) => text.includes(`cannot tell whether "${T('alert')}"`)), w.warnings.join('\n'));
+});
+
+test('after_a_split_name_the_folder_run_reads_the_terminal_the_arrow_opened_as_open', async () => {
+  const w = folderWorld([session('alert')], { trusted: [['alert', L('alert')]], modal: 'dismiss' });
+  const node = w.nodes.find((n) => n.id === 'alert');
+  assert.ok(node !== undefined, 'the entry is in the tree');
+  node.name = 'other';
+  await w.arrow('alert');
+
+  await w.click();
+
+  assert.deepEqual(w.terminals.map((t) => t.name), [T('alert')]);
+  assert.ok(folderModals(w)[0].includes(`Terminal already open:\n1. alert: ${L('alert')}`), folderModals(w)[0]);
+});
+
+// ---- The in-flight mark --------------------------------------------------------------------------------------
+
+test('the_in_flight_mark_is_released_on_a_throw', async () => {
+  const w = folderWorld([session('a')], { failTrust: true });
+
+  await assert.rejects(w.click(), /the store is down/);
+  await assert.rejects(w.click(), /the store is down/, 'the second click reached the modal, and went on to the same store');
+
+  assert.equal(folderModals(w).length, 2);
+  assert.equal(w.terminals.length, 0);
+  assert.doesNotMatch(everyText(w), /already waiting/);
+});
```

### B.9 Item 8: the documents

`research/module_extension.md`, corrected where S1 and S3 wrote what §2 and §3 now contradict: the arrow's paragraph (`:2080-2096`: "KNOWN to have finished", "asks until a start and a numeric end have been seen", "voids the evidence"), the old table (`:2098-2103`), the paragraph after the `{name}` section (`:2151-2155`: "deviations from the parent plan's five-row table"), **What this does not close** (`:2157-2161`: it blamed a reload, where §2 now blames `Type It Anyway`, and it lacked the person pressing Enter), the title (`:2119-2121`), the row order (`:2168`), "a native dialog does not scroll" stated as fact (`:2174`), `·` (`:2181-2183`, which also said an escape was shown), the closing button (`:2205`), a failure after closing (`:2212`) and the report (`:2216-2218`). The S3 sentence `The command is not yet on any menu (S4 puts ...` is left alone: the S4 brief replaces it by that text. `:6070`, `logSafe` and the field separator, stays true.

`research/module_tests.md`: `:1111-1114` and `:1183-1187` (the world, "stay unlisted", kept as the history it is), the rows `:1118-1120`, `:1192-1194`, and a new section before `## A gone request reaches no SSH prompt`. Earlier counts and earlier teeth are records, and stay. When your own mutation run differs from the table in that section, correct the table to what you measured, and say so.

Grep after: `grep -n "stay unlisted\|five-row\|voids the evidence\|does not scroll)\|as \`·\`" research/module_extension.md research/module_tests.md` answers nothing. The S1 spec and the S3 brief stay as written: the parent overrides them.

```diff d-extension
diff --git a/research/module_extension.md b/research/module_extension.md
--- a/research/module_extension.md
+++ b/research/module_extension.md
@@ -2080,14 +2080,18 @@ is why the line passes the trust modal once per exact body before anything is ty
 **A terminal that may be busy (`terminalGuard.ts`, `terminalActivity.ts`, `terminalActivityTracker.ts`).**
 `sendText` types keystrokes into whatever runs in the terminal — a `tmux attach` left open would receive the
 next entry's line as input to the program inside it. So the line is typed into an existing terminal of the
-entry's name only when its last command is KNOWN to have finished: shell integration's matched start and end,
-with an exit code (a non-zero one included — a failed `aws sso login` has still finished). No live terminal:
+entry's name only when the extension itself saw its last command finish: OUR OWN send, then shell integration's matched
+start and end, with an exit code (a non-zero one included — a failed `aws sso login` has still finished). A start and an end
+on a terminal the extension has not typed into this activation say nothing, because after a reload they could be a replay, or
+a shell inside a tmux client that still runs. No live terminal:
 one is opened and typed into. Anything else — the command is running, or nothing is known — and the terminal is
 shown and the person asked, `Type It Anyway`; the question shows the line verbatim, and a cancel types nothing.
 An end with no exit code (the sub-shell signature, e.g. tmux with an inner shell) leaves THAT terminal asking for
-its life. A terminal without shell integration never delivers an event, so it asks on EVERY click. After a window
-reload a terminal WITH integration asks until a start and a numeric end have been seen, then types silently. Our own
-send voids the evidence (`noteSent` runs before `sendText`, so a late end cannot restore it) — except over a RUNNING
+its life. A terminal without shell integration never delivers an event, so it asks on EVERY click; if events do not reach this
+extension over Remote-SSH, every click asks too. After a window reload the first click asks, and silence returns once a person's
+`Type It Anyway` has been followed by a seen start and numeric end. A terminal the extension typed into repeats a finished
+command silently, as before the guard. Our own
+send arms the terminal (`noteSent` runs before `sendText`, so a late end cannot restore `finished`) — except over a RUNNING
 command: `Type It Anyway` into it poisons the terminal for life, so what ran there is not forgotten and an inner
 start and end can never read as the terminal finishing. A question open for a terminal also stops a second send
 to it, even one that reads `finished` meanwhile. A reused terminal is shown, as before. An agent-served VPN start (`startGate`) refuses instead of asking, with no await before the send.
@@ -2095,12 +2099,13 @@ The verdict is about the terminal OBJECT, never its name, and an override types
 about — if it closed meanwhile, nothing is typed. The VPN launcher takes the same guard. Between finding the
 terminal and sending, on the paths that type without asking, nothing is awaited.
 
-| state \ event | `start(e)` | `end(c, number)` | `end(c, undefined)` | `end(e ≠ c)` or an end with no start | our own send |
-|---|---|---|---|---|---|
-| `unknown` | `running(e)` | ignored | ignored | ignored | `unknown` |
-| `running(c)` | **`poisoned`** (a start before `c` ended: a sub-shell) | `finished` | `poisoned` | ignored | **`poisoned`** (typed over a running command) |
-| `finished` | `running(e)` | ignored | ignored | ignored | `unknown` |
-| `poisoned` | `poisoned` | `poisoned` | `poisoned` | `poisoned` | `poisoned` |
+| state \ event | `start(e)` | `end(c, number)` | `end(c, undefined)` | `end(e ≠ c)` or an end with no start | our own send | reads |
+|---|---|---|---|---|---|---|
+| `unknown` (nothing recorded) | stays | stays | stays | stays | `armed` | `unknown` |
+| `armed` (we typed; no start yet) | `running(e)` | stays | stays | stays | `armed` | `unknown` |
+| `running(c)` | **`poisoned`** (a start before `c` ended: a sub-shell) | `finished` | `poisoned` | stays | **`poisoned`** (typed over a running command) | `running` |
+| `finished` | `running(e)` | stays | stays | stays | `armed` | `finished` |
+| `poisoned` | stays | stays | stays | stays | stays | `unknown` |
 
 **`{name}`: one road, refused rather than quoted (`commandName.ts`, `commandLine.ts`).** `{name}` in a terminal
 entry's command or in an enabled argument row is the entry's own name, so `tmux attach -t {name}` follows a rename.
@@ -2119,6 +2124,7 @@ refuses nor is filled (but is still scanned for `creds://` references, as stored
 The name is `details.name`, the only one every road holds (`executableLine` and `entityText` have no node). A revision's
 page and its Copy All both overlay that version's own name (`revisionViewOptions`, once), because a share or a sync can
 leave `details.name` and the revision's name apart. Run, Copy and Show on a history row read `revision.details.name` (`nodeAt`, `entityViewerCommands.ts`), while the revision page and its Copy All overlay `revision.name`; the two differ only after a share or a sync has split the names, and what runs is still one allow-listed string or nothing runs.
+The arrow titles its terminal from `details.name` too (`typeIntoEntryTerminal`, S5), as the folder run and the launcher do, so the roads find each other's terminals after a split. On a history row that is `revision.details.name`: a version finds or opens the terminal of its own name, while `revision.name` still names it in the trust modal and the warnings.
 
 `resolveCommand(entry)` answers `empty`, `ready` (`line` plus `parts`, the pieces with `{name}` filled) or `refused`
 (`template` plus `reason`). `line` exists only after narrowing, so skipping a refusal does not compile (a typed fixture
@@ -2148,39 +2154,44 @@ retyped. A scan test allows `buildCommandLine(` only in `commandLine.ts`.
 does not match it; `{ name }` prints three words and does not keep it. `cmd.exe` (measured through WSL interop) prints
 `{na''me}` for that form and `{name}` for `{na^me}`. PowerShell was not measured.
 
-Only `finished` types without asking; `poisoned` reads as `unknown`. The tracker is subscribed once, from
+Only `finished` types without asking; `armed` and `poisoned` read as `unknown`. The tracker is subscribed once, from
 `registerRunCommands`; its records live in a `WeakMap` keyed by the terminal object, so there is no close
-listener and nothing to cap. `running + start → poisoned` and `running + sent → poisoned` are deviations from the
-parent plan's five-row table (its hand check 4: tmux with an inner integrated shell must never read as finished
-while tmux runs).
+listener and nothing to cap. `running + start → poisoned` and `running + sent → poisoned` are there for the
+parent plan's hand check 4: tmux with an inner integrated shell must never read as finished while tmux runs.
 
-**What this does not close.** After a window reload there is no record of what runs in a terminal. If tmux is
-attached there and a shell INSIDE it emitted shell-integration sequences, a start and a numeric end pair could read
-`finished` while tmux still runs. Measured on tmux 3.6, its OSC 633 does not pass outward (0 of 10 sequences, also
-with `allow-passthrough on`; the plan records it), so such a pair does not arrive. Not measured: through Remote-SSH,
-or on an older tmux.
+**What this does not close.** After `Type It Anyway` on a terminal in `unknown`, the state is `armed`, so a start and a
+numeric end reaching the extension from a shell inside tmux would read `finished` while tmux still runs. Measured on tmux 3.6,
+its OSC 633 does not pass outward (0 of 10 sequences, also with `allow-passthrough on`; the plan records it), so such a pair does
+not arrive. Not measured: through Remote-SSH, or on an older tmux. And a person pressing Enter on `tmux attach` and clicking
+before the start event arrives is typed over: no code can close that.
 
 **The folder run (`folderRun.ts`, `commands/folderRunCommand.ts`, S3 of `PLAN_terminal_folder_run.md`).** `credSshManager.runFolder`
 brings a Terminal folder's DIRECT entries back, each into a NEW terminal, after one modal; subfolders are named in the modal
 and never run. The command is not yet on any menu (S4 puts the arrow on the folder row and writes the help); until then the
 manifest hides it from the palette (`when: "false"`). `folderRun.ts` is pure (no `vscode`, CLAUDE.md rule 3): it judges
 `storage.getChildren(account, folder)` in display order, one row per direct entry, first match wins in this order: not a
-Terminal entry; no command; `{name}` refused (`NAME_REFUSAL`); `{config}` (only a VPN's *Started by* fills it); the shell's
+Terminal entry; no command; `{name}` refused (`NAME_REFUSAL`); a name holding a control character (`escapeControl` would change it:
+VS Code draws a title without `\n`, `\r` and `\t`, read in its 1.93.0 source, and what `Terminal.name` keeps through a reload is not
+measured, so the open test is not trusted for it); `{config}` (only a VPN's *Started by* fills it); the shell's
 refusal (the entry's OS, or a pinned shell this window cannot reach, `entryOpenRefusal`); a duplicate name (counted only among
 rows that passed everything before it, since only those would share a terminal); then `open` when a live terminal of the name
 exists in ANY shell (`liveTerminalsOfEntry`, because the pinned road's same-shell find would call another shell's terminal
 free), else `run`. Names and lines come from `details.name` and `resolveCommand`, never `executableLine` or `.commandArgs`.
 The cap is 32 rows WITH a line, `run` plus `open`, because `Close Open Terminals and Run` can type all of them and the modal
-shows all of them (a native dialog does not scroll); rows with no line do not count, and a folder with nothing to type says so
+shows all of them; a question over 4,000 characters, counted as it would be shown (escapes and `(new)` included), is refused the
+same way, naming the count (`beforeAsking`). Both numbers are chosen, not measured: from memory a native dialog does not scroll,
+which is the parent's hand check 8. Rows with no line do not count, and a folder with nothing to type says so
 with no modal. **The modal is always shown** (decision C), however trusted every line is: it lists each line whole, `(new)`
 before the name for a line not yet run on this machine, the rows that will not run and why, the subfolders, and what each
 button does. Approving trusts each typed line, one at a time (`trustCommand` reads and rewrites the whole list, so a
 `Promise.all` loses all but one), BEFORE the chain; `confirmTrusted` is not called, which would be a second modal. What is
 typed is the string that was approved (`row.line`, resolved once at the plan), so an entry edited while the modal sits changes
 nothing. Every name, line, reason and folder name that is SHOWN, in the modal and in the report, goes through
-`escapeControl` (`transitSecretReport.ts`, now exported: a vault that sync and Accept Share fill can hold a newline in a name,
-and one click vouches for up to 32 lines, so a name must not draw a row of its own); what is typed is never escaped. The
-escaper also writes the field separator `·` as `·`, so a name holding one is shown with the escape.
+`escapeControl` (`transitSecretReport.ts`: a vault that sync and Accept Share fill can hold a newline in a name,
+and one click vouches for up to 32 lines, so a name must not draw a row of its own); what is typed is never escaped. It covers
+C0, DEL, C1, the line and paragraph separators and the bidi controls U+202A-E and U+2066-9. It leaves `·` alone, which is legal and
+readable in a name with no `{name}`: the field separator is `logSafe`'s own addition, because only a log line has fields to forge.
+The chain's modal (`describeRunPlan`) takes the same escaper on every road, for the owner, each step and each line.
 
 *The chain.* `runDependenciesFirst(dependencyRequest(…, roots, folder.name, trust, plan.directIds))` with the details of the
 lines the chosen button types as roots and every direct entry as `exclude`. `planDependencyRun` keeps only roots with
@@ -2202,7 +2213,10 @@ looked up by name in order to close it. Four cases: a snapshot terminal that exi
 (`exitStatus` is read before `dispose`) and its line is still typed; one that starts or ends a command while it sits is closed
 anyway (the modal said closing ends whatever runs there, and the tracker cannot say more after a reload); a terminal of the
 same name that is NOT in the snapshot stays open, its row becomes `open`, and the snapshot terminals of that row are then not
-closed either, since no line would replace them; and with only `open` rows the closing button is the only one offered. Closing
+closed either, since no line would replace them; and with only `open` rows the closing button is the only one offered. Under this
+button the `open` rows' lines are typed too, in row order, trusted first and roots of the chain, so each closed terminal is replaced
+by a new one running its line. Under `Run`, an `open` row whose terminal closed while the modal sat is `not run`, saying so, and
+never "already open" (`settleRow`). Closing
 happens per row, immediately before that row's new terminal, and only after the chain is ready, so a refused, declined or
 failed chain closes and types nothing.
 
@@ -2210,12 +2224,14 @@ failed chain closes and types nothing.
 (`settleRow`: a row with a live terminal that was not authorised moves to `open`, whichever button was pressed) and only then
 closed and typed; one pass is as fresh as one per line, and nothing reads `window.terminals` after a `dispose`, because a
 disposed terminal may still be listed. A failure to open or to type is that row's alone; there is no rollback once typing has
-begun. An in-flight mark per `account/folder` (a `Set`, checked and added before the first await, deleted in a `finally`)
+begun, and a terminal closed for a line that then failed says that it was closed (`failedAfterClosing`). An in-flight mark per `account/folder` (a `Set`, checked and added before the first await, deleted in a `finally`)
 makes a second click while a modal or a chain is open say so and do nothing; another folder is not held up.
 
-*The report* says "Typed", never "started", because exits are not observed: `Typed 3 of 5 in "<folder>": a, b, c. Left alone,
-terminal already open: d. Not run: e — reason.`, information when at least one line was typed and none failed, a warning
-otherwise. `isTransient` on these terminals was rejected (parent §3).
+*The report* says "Typed", never "started", because exits are not observed, and it says first what must not be lost, since a
+notification is cut at about 1,000 characters (VS Code source, not measured here): `Typed 3 of 5 in "<folder>". Not run: e — reason.
+Left alone, terminal already open: d. Typed: a, b, c.`, information when at least one line was typed and none failed, a warning
+otherwise. A chain that did not end ready says `Nothing was typed in "<folder>" and no entry's terminal was closed: the dependencies
+did not finish.`, because the chain disposes its own earlier terminal. `isTransient` on these terminals was rejected (parent §3).
 
 **Runs on — the OS a command is written for (issue #103).** `terminalOs` (`windows` / `macos` /
 `linux`, a LOOSE string in the guard so a newer build's value never drops the entity) is set by the
```

```diff d-tests
diff --git a/research/module_tests.md b/research/module_tests.md
--- a/research/module_tests.md
+++ b/research/module_tests.md
@@ -1111,12 +1111,15 @@ The real `credSshManager.runCommand` handler, registered by the real `registerRu
 the world of `vpnWorld.ts`. The world gained `preopened` (terminals that are LIVE before the flow starts, listed in
 `window.terminals`), `open`, `live` and `shell.start/end` (shell integration's two events, fired as VS Code delivers
-them) and `StartOptions.shellEvents` (events the terminals had already produced, delivered once the tracker listens);
-terminals the flow creates stay unlisted, so no older test changed meaning.
+them) and `StartOptions.shellEvents` (events the terminals had already produced, delivered once the tracker listens).
+Until S5 terminals the flow creates stayed unlisted. Since S5 one is listed at once, as VS Code does (`createTerminalFromOptions` in
+`node/extHostTerminalService.ts`, read in 1.93.0), and every suite on this world stayed green with no option; `open` still makes an
+unlisted one for a test to `list` by hand. `noteOurSend` is the extension's own send, through the real tracker: `running` and `finished`
+both need it, so a test that starts from `preopened` calls it first.
 
 | Flow | Test | What it holds down |
 |---|---|---|
-| The transition table | `terminalActivity.test.ts` | every cell of the table: a numeric end finishes (non-zero included), a start after a finished command reads running with the new execution, an undefined end and a start-while-running poison for the terminal's life in either delivery order, a late or replayed end (a numeric or an undefined one) is ignored, our own send voids the evidence but over a running command poisons it (an inner start and end then never read finished), states are frozen values; the question texts |
-| The arrow | `busyTerminalGuard.test.ts` | a running command is never typed into (`the_arrow_never_types_into_a_terminal_whose_command_is_running`); finished (non-zero too) and no-terminal type as before, and a reused terminal is shown; a command started after a finished one asks; a question open for a terminal stops a second send to it even when the command ends meanwhile; no evidence asks and cancel types nothing; `Type It Anyway` types once into the SAME object even when another terminal now carries the name; a double click asks once and types at most once; a terminal closed meanwhile gets nothing; our own send makes the next click ask until a new start and numeric end; a sub-shell signature asks for the terminal's life; the tracker is subscribed through `registerRunCommands` and disposes |
-| The launcher | `launcherBusyTerminal.test.ts` | a busy launcher terminal asks and a cancel types nothing (the installer still ran before it); a finished one is typed into; an agent-served start refuses a busy terminal without a question and types into a finished one |
+| The transition table | `terminalActivity.test.ts` | every cell of the table, each its own test (`the_table_<state>_on_<event>_is_<state>`, `the_table_<state>_reads_<reading>`): a start and an end with no send of ours never read finished (`a_start_and_end_with_no_send_of_ours_never_read_finished`), after our send a numeric end finishes (non-zero included), a start after a finished command reads running with the new execution, an undefined end and a start-while-running poison for the terminal's life in either delivery order, a late or replayed end (a numeric or an undefined one) is ignored, our own send arms the terminal but over a running command poisons it (an inner start and end then never read finished), states are frozen values; the question texts |
+| The arrow | `busyTerminalGuard.test.ts` | a start and an end with no send of ours ask (`a_start_and_end_with_no_send_of_ours_never_read_finished`), and `Type It Anyway` then a seen start and end reads finished; a running command is never typed into (`the_arrow_never_types_into_a_terminal_whose_command_is_running`); finished (non-zero too) and no-terminal type as before, and a reused terminal is shown; a command started after a finished one asks; a question open for a terminal stops a second send to it even when the command ends meanwhile; no evidence asks and cancel types nothing; `Type It Anyway` types once into the SAME object even when another terminal now carries the name; a double click asks once and types at most once; a terminal closed meanwhile gets nothing; our own send makes the next click ask until a new start and numeric end; a sub-shell signature asks for the terminal's life; the tracker is subscribed through `registerRunCommands` and disposes |
+| The launcher | `launcherBusyTerminal.test.ts` | a busy launcher terminal asks and a cancel types nothing (the installer still ran before it); a finished one is typed into; an agent-served start refuses a busy terminal without a question and types into a finished one; a start and an end with no send of ours make it ask, and make an agent-served start refuse |
 
 **Teeth.** Test `the_arrow_never_types_into_a_terminal_whose_command_is_running` was written first and run against
@@ -1181,16 +1184,17 @@ guard, pinned-shell decision and dependency chain, in the world of `vpnWorld.ts`
 record (a `dispose` COUNTS and closes nothing, so a terminal stays listed and live, the worst case VS Code allows), a settable
 `window.terminals` that counts the reads made after the first dispose (`listReadsAfterDispose`), `list` and `exit` (a terminal the
-person opened, and one that really ends), `open(name, shellPath)`, `modal: 'last'`, and `failCreate`, `failSend`, `onSend`; terminals
-a flow creates stay unlisted, so no older test changed meaning (`busyTerminalGuard`, `launcherBusyTerminal`, `dependencyChain`,
-`vpnGoneRequest` and `commandNameRoads` were run on it first and were unchanged). Run from `src_vs_code`: `npm run compile`, then
-`node --import ./scripts/lower-priority.mjs --test out/test/folderRun.test.js out/test/folderRunCommand.test.js`
-(22 + 49 tests).
+person opened, and one that really ends), `open(name, shellPath)`, `modal: 'last'`, and `failCreate`, `failSend`, `onSend`; at S3
+terminals a flow creates stayed unlisted, so no older test changed meaning (`busyTerminalGuard`, `launcherBusyTerminal`, `dependencyChain`,
+`vpnGoneRequest` and `commandNameRoads` were run on it first and were unchanged), and since S5 one is listed at once, as VS Code does.
+Run from `src_vs_code`: `npm run compile`, then
+`node --import ./scripts/lower-priority.mjs --test out/test/folderRun.test.js out/test/folderRunCommand.test.js out/test/folderRunEdges.test.js`
+(22 + 49 tests at S3; 36 + 48 + 16 since S5, which split `folderRunEdges.test.ts` off at the 800-line limit).
 
 | Flow | Test | What it holds down |
 |---|---|---|
 | The plan | `folderRun.test.ts` | every reason in order, first match wins; an earlier reason beats `open`; a duplicate counts only among rows that could run; `open` comes from the fact only; `details.name` names the row and fills `{name}`; display order is kept and subfolders are named, not rows; a disabled row cannot refuse; the cap counts every row with a line (open ones too) and ignores the rest; no line reports with no modal, and an empty folder says so |
-| The modal | `folderRun.test.ts`, `folderRunCommand.test.ts` | the question holds every line whole (a 400-character line too), `(new)` before the name, the open rows, the rows not run, the subfolders and what each button does, and ends with the chain modal's own sentence; it drops what does not apply; it is shown even when every line is trusted; a dismissal runs nothing and trusts nothing, a trusted line included; approving trusts each typed line though the store rewrites its whole list; the typed line is the approved string even if the entry changed while the modal sat; a name or a line with a control character is shown escaped and typed unchanged (`a_name_with_a_newline_cannot_draw_a_row_in_the_folder_modal`) |
-| The report | `folderRun.test.ts`, `folderRunCommand.test.ts` | the exact sentence, reasons grouped with a closing full stop trimmed, "Typed" and never "started"; information when something was typed and nothing failed, a warning otherwise |
-| Left alone, and the re-check | `folderRunCommand.test.ts` | `Run` leaves an open terminal alone and does not trust its line; the open test is ANY shell; a terminal that appeared while the modal sat or while the chain ran moves its row to open; an open row whose terminal exited under `Run` is still left alone |
+| The modal | `folderRun.test.ts`, `folderRunCommand.test.ts` | the question holds every line whole (a 400-character line too), `(new)` before the name, the open rows, the rows not run, the subfolders and what each button does, and ends with the chain modal's own sentence; it drops what does not apply; it is shown even when every line is trusted; a dismissal runs nothing and trusts nothing, a trusted line included; approving trusts each typed line though the store rewrites its whole list; the typed line is the approved string even if the entry changed while the modal sat; a name with a control character is not run and draws no row (`a_name_with_a_newline_is_not_run_and_cannot_draw_a_row_in_the_folder_modal`), a line with one is shown escaped and typed unchanged, a `·` stays readable; a question over 4,000 characters, as it would be shown, is refused naming the count |
+| The report | `folderRun.test.ts`, `folderRunCommand.test.ts` | the exact sentence, what must not be lost first (`Not run`, then `Left alone`, then `Typed:`), reasons grouped with a closing full stop trimmed, "Typed" and never "started"; information when something was typed and nothing failed, a warning otherwise; a terminal closed for a line that failed says so; a stopped chain says no entry's terminal was closed |
+| Left alone, and the re-check | `folderRunCommand.test.ts` | `Run` leaves an open terminal alone and does not trust its line; the open test is ANY shell; a terminal that appeared while the modal sat or while the chain ran moves its row to open; an open row whose terminal closed under `Run` is not run, saying so, and never "already open"; a second click reads what the first typed into as open, and the arrow reads the object the folder run typed into (`folderRunEdges.test.ts`) |
 | `Close Open Terminals and Run` | `folderRunCommand.test.ts` | the only button when only open rows exist, both when both kinds do; it closes every live terminal of the name in any shell and types into a NEW one, never a find (`a_new_terminal_never_comes_from_find`); nothing reads the terminal list after a close; a terminal opened while the modal sat is not closed and its row is left alone; one that exited is not disposed and its line is typed; one that started a command is still closed; closing comes after the chain is ready; a refused or declined chain closes nothing |
 | The chain | `folderRunCommand.test.ts` | roots are only the lines to be typed; `Close` makes an open row a root; `runDependencies: false` opens no chain; a sibling named under Depends on is neither a step nor awaited, and a refused one refuses nothing; a sibling passes on its own dependencies when a typed line names it; a circle refuses and types nothing; a missing dependency with no step asks nothing more; a failed step the person stops types nothing; the chain modal names the folder, and its missing-row note says to edit the entry that lists the row (`dependencyRun.test.ts` holds the owner's wording unchanged) |
@@ -1236,4 +1240,68 @@ case, a terminal that stays listed and live); how a native dialog shows 32 lines
 nothing here reaches the command from a menu, which arrives with S4.
 
+## The re-review's fix forward (2026-11-05, S5 of PLAN_terminal_folder_run.md)
+
+The built code brought to §2 and §3 as revised for epoch 2. Run from `src_vs_code`: `npm run compile`, then
+`node --import ./scripts/lower-priority.mjs --test out/test/terminalActivity.test.js out/test/busyTerminalGuard.test.js out/test/launcherBusyTerminal.test.js out/test/commandNameRoads.test.js out/test/folderRun.test.js out/test/folderRunCommand.test.js out/test/folderRunEdges.test.js out/test/transitSecretReport.test.js out/test/dependencyRun.test.js out/test/shareDiagnostics.test.js out/test/dependencyChain.test.js`.
+
+| Flow | Test | What it holds down |
+|---|---|---|
+| `armed`, and evidence only after our own send | `terminalActivity.test.ts`, `busyTerminalGuard.test.ts`, `launcherBusyTerminal.test.ts` | every cell of §2's table; a start and an end with no send of ours never read finished, pure and in the stub world, on the arrow and the launcher; `Type It Anyway` then a seen start and end reads finished; `armed` reads unknown; a terminal the arrow opened asks while its command runs and repeats silently once it ended |
+| The escaper | `transitSecretReport.test.ts`, `dependencyRun.test.ts` | C0, DEL, C1, the separators and the bidi controls escaped at both ends of each range, and their neighbours not; `·` readable through `escapeControl` and escaped through `logSafe`, which measures its bound on the escaped field; the chain modal unchanged for clean inputs, and escaped for the owner, each step and each line |
+| What a flow creates is listed | `folderRunEdges.test.ts` | a second folder click reads what the first typed into as open; the arrow reads the object the folder run typed into, and types silently once its command is seen finished; after a split name the folder run and the arrow find the same terminal, in either order |
+| The closing button | `folderRunEdges.test.ts` | the `open` rows' lines are typed in row order, trusted first and roots of the chain; a closed terminal with no replacement says it was closed; a failure with nothing closed claims no close |
+| The title | `commandNameRoads.test.ts` | the arrow's title is `details.name`, not the node's; a history row titles its terminal from that version's `details.name` |
+| The in-flight mark | `folderRunEdges.test.ts` | a rejecting trust store: the click rejects, and a second click reaches the modal |
+
+**Teeth.** Every test was written first and run against the code of `4f567b5` (with only the new constant `MAX_QUESTION_CHARACTERS` added): 66 of the 271 tests of these eleven suites red for the right reason. The cornerstone, `a_start_and_end_with_no_send_of_ours_never_read_finished`, printed `end(c, 0)`, `'finished' !== 'unknown'` in the pure suite, and in the stub world `typed on a start and end the extension had no part in`, actual `['tmux attach -t alert']`, expected `[]`. Tests that pass on that code hold what was already right, and the mutations are their proof. Each mutation was then applied alone, watched red, and restored:
+
+| # | Mutation | Red |
+|---|---|---|
+| M1 | `terminalActivity.ts` `onStart`: delete the `if (state.kind === 'unknown')` block (the fix undone) | `a_start_and_end_with_no_send_of_ours_make_an_agent_served_start_refuse`, `a_start_and_end_with_no_send_of_ours_make_the_launcher_ask`, `a_start_and_end_with_no_send_of_ours_never_read_finished`, and 4 more |
+| M2 | `onSent`: `POISONED : UNKNOWN` for `POISONED : ARMED` | `a_command_started_after_a_finished_one_makes_the_next_click_ask`, `a_double_click_on_a_finished_terminal_types_once_then_asks`, `a_double_send_stays_armed`, and 48 more |
+| M3 | `READING`: `armed: 'finished'` | `a_double_click_on_a_finished_terminal_types_once_then_asks`, `a_start_before_our_send_and_its_end_after_it_stay_armed`, `after_a_split_name_the_folder_run_and_the_arrow_find_the_same_terminal`, and 13 more |
+| M4 | `onSent`: `return ARMED;` (typing over a running command no longer poisons) | `our_own_send_over_a_running_command_poisons_it_so_the_inner_pair_never_reads_finished`, `the_table_running_on_our own send_is_poisoned` |
+| M5 | `onStart`: `state.kind === 'finished' ? state : state.kind === 'running' ? POISONED : ...` (a start after a finished command is not seen) | `a_command_started_after_a_finished_one_makes_the_next_click_ask`, `a_start_after_a_finished_command_reads_running_with_the_new_execution`, `the_table_finished_on_start(e)_is_running` |
+| M6 | `CONTROL_RANGES`: `[0x007f, 0x007f]` for `[0x007f, 0x009f]` | `escapeControl_writes_u0080_as_a_visible_escape`, `escapeControl_writes_u0085_as_a_visible_escape`, `escapeControl_writes_u009f_as_a_visible_escape`, and 1 more |
+| M7 | `CONTROL_RANGES`: no `[0x202a, 0x202e]` | `escapeControl_writes_u202a_as_a_visible_escape`, `escapeControl_writes_u202e_as_a_visible_escape`, `every_control_character_class_in_a_name_is_not_run_and_a_clean_name_runs`, and 1 more |
+| M8 | `CONTROL_RANGES`: no `[0x2066, 0x2069]` | `escapeControl_writes_u2066_as_a_visible_escape`, `escapeControl_writes_u2069_as_a_visible_escape`, `every_control_character_class_in_a_name_is_not_run_and_a_clean_name_runs` |
+| M9 | `escapeControl`: `isControlCharacter(codePoint) \|\| codePoint === FIELD_SEPARATOR` | `a_middle_dot_in_a_name_stays_readable_in_the_question_and_the_report`, `a_middle_dot_in_a_step_or_an_owner_stays_readable_in_the_chain_modal`, `a_name_with_a_middle_dot_runs_and_stays_readable`, and 3 more |
+| M10 | `logSafe`: no `.replaceAll(...)` | `a forged entity name cannot become a second log line, or a second FIELD`, `logSafe_measures_its_bound_on_the_escaped_field`, `the_field_separator_is_the_log_lines_alone_and_a_modal_keeps_it_readable` |
+| M11 | `describeRunPlan`: `${step.name}` raw | `a_step_name_with_a_newline_cannot_draw_a_row_in_the_chain_modal`, `the_chain_modal_of_the_arrow_escapes_too`, `the_chain_modal_writes_the_owner_each_step_and_each_line_through_the_escaper` |
+| M12 | `describeRunPlan`: `${step.line}` raw | `a_step_name_with_a_newline_cannot_draw_a_row_in_the_chain_modal`, `the_chain_modal_writes_the_owner_each_step_and_each_line_through_the_escaper` |
+| M13 | `describeRunPlan`: `Before "${ownerName}"` raw | `the_chain_modal_writes_the_owner_each_step_and_each_line_through_the_escaper` |
+| M14 | `missingNote`: `edit "${ownerName}"` raw | `the_chain_modal_writes_the_owner_each_step_and_each_line_through_the_escaper` |
+| M15 | `lineRefusal`: no control-character test | `a_name_or_a_line_with_a_control_character_is_escaped_in_the_question_the_report_and_the_notices`, `a_name_with_a_control_character_is_no_duplicate_of_the_name_without_it`, `a_name_with_a_newline_is_not_run_and_cannot_draw_a_row_in_the_folder_modal`, and 3 more |
+| M16 | `judgedLine`: `facts.shellRefusal(...) ?? lineRefusal(...)` | `the_control_character_reason_comes_before_config_the_shell_open_and_a_duplicate` |
+| M17 | `sizeRefusal`: `count >= MAX_QUESTION_CHARACTERS` | `a_question_of_exactly_the_bound_is_asked_and_one_more_character_is_refused_naming_the_count`, `the_bound_counts_the_text_as_shown`, `the_bound_is_judged_on_the_question_as_it_will_be_shown_new_marks_included` |
+| M18 | `beforeAsking`: `const refusal = capRefusal(folderName, plan);` | `a_question_of_exactly_the_bound_is_asked_and_one_more_character_is_refused_naming_the_count`, `a_question_over_the_bound_refuses_with_no_modal_and_types_nothing`, `the_bound_counts_the_text_as_shown`, and 1 more |
+| M19 | `beforeAsking`: `sizeRefusal(...) ?? capRefusal(...)` | `the_row_cap_is_judged_before_the_character_bound` |
+| M20 | `planAndAsk`: `beforeAsking(folder.name, plan, () => false)` | `the_bound_is_judged_on_the_question_as_it_will_be_shown_new_marks_included` |
+| M21 | `sizeRefusal`: `count` is the sum of `row.line.length` | `a_question_of_exactly_the_bound_is_asked_and_one_more_character_is_refused_naming_the_count`, `a_question_over_the_bound_refuses_with_no_modal_and_types_nothing`, `the_bound_counts_the_text_as_shown`, and 1 more |
+| M22 | `folderReport`: `Left alone` before `Not run` | `the_report_is_the_exact_sentence`, `the_report_says_what_must_not_be_lost_first` |
+| M23 | `settleFree`: `{ kind: 'open', name: row.name }` for the `notRun(...)` | `an_open_row_closed_under_run_says_so_and_never_says_already_open`, `an_open_row_whose_terminal_closed_under_run_is_not_run_saying_so`, `settle_follows_the_button_and_what_is_live_now` |
+| M24 | `typeLine`: `failed(row, sent.reason)` | `a_closed_terminal_whose_replacement_was_refused_says_it_was_closed` |
+| M25 | `typeLine`'s `catch`: `failed(row, describeError(error))` | `a_closed_terminal_whose_replacement_took_no_line_says_it_was_closed`, `a_closed_terminal_with_no_replacement_says_it_was_closed` |
+| M26 | `typeLine`: `const live = toClose;`, filtering only for the `dispose` | `a_failure_with_nothing_closed_claims_no_close` |
+| M27 | `chainStopped`: `and no terminal was closed:` | `a_chain_refusal_types_nothing_and_closes_nothing`, `a_stopped_chain_says_nothing_was_typed_and_no_entrys_terminal_was_closed` |
+| M28 | `typeIntoEntryTerminal`: `sendGuarded(entry.name, ...)` | `a_history_row_titles_its_terminal_from_that_versions_details_name`, `after_a_split_name_the_folder_run_and_the_arrow_find_the_same_terminal`, `after_a_split_name_the_folder_run_reads_the_terminal_the_arrow_opened_as_open`, and 1 more |
+| M29 | `linesToType`: `row.kind === 'run' \|\| (closing && row.id === '')` | `a_chain_refusal_types_nothing_and_closes_nothing`, `a_declined_chain_types_nothing_and_closes_nothing`, `close_closes_every_live_terminal_of_the_name_in_any_shell_and_types_into_a_new_one`, and 4 more |
+| M30 | `runChosen`: `trustEach(trust, linesToType(plan, false))` | `close_closes_every_live_terminal_of_the_name_in_any_shell_and_types_into_a_new_one`, `under_the_closing_button_the_open_rows_are_typed_in_row_order_trusted_and_roots` |
+| M31 | `runChosen`: roots from `linesToType(plan, false)` | `a_chain_refusal_types_nothing_and_closes_nothing`, `a_declined_chain_types_nothing_and_closes_nothing`, `close_makes_an_open_row_a_root`, and 2 more |
+| M32 | `oneAtATime`: `await run(); inFlight.delete(key);` with no `try`/`finally` | `the_in_flight_mark_is_released_on_a_throw` |
+| M33 | `vpnWorld.ts` `createTerminal`: no `listed = [...listed, live[o.name]];` | `a_second_folder_click_reads_what_the_first_typed_into_as_open`, `a_terminal_the_arrow_opened_asks_while_its_command_runs_and_repeats_silently_once_it_ended`, `after_a_split_name_the_folder_run_and_the_arrow_find_the_same_terminal`, and 2 more |
+| M34 | `terminalGuard.ts` `typed`: no `noteSent(terminal);` | `a_double_click_on_a_finished_terminal_types_once_then_asks`, `a_terminal_the_arrow_opened_asks_while_its_command_runs_and_repeats_silently_once_it_ended`, `after_our_send_with_no_new_evidence_the_next_click_asks`, and 3 more |
+| M36 | `beforeAsking`: no early return for a plan with no line | `another_folder_is_not_held_up`, `no_line_reports_with_no_modal_and_an_empty_folder_says_so`, `nothing_with_a_line_reports_with_no_modal`, and 1 more |
+| M37 | `onEnd`: `return FINISHED;` (an undefined code no longer poisons) | `a_start_while_running_poisons_in_either_delivery_order`, `a_sub_shell_signature_keeps_asking_for_the_terminals_life`, `an_end_with_undefined_code_on_the_current_execution_poisons_for_life`, and 9 more |
+| M38 | `describeRunPlan`: `, in order,` dropped from the first sentence | `the owner's chain: the installer runs and is AWAITED, then the launcher is typed with {config} filled in`, `the pre-run sentence lists every step in order with its line`, `the_chain_modal_text_is_unchanged_for_clean_inputs` |
+| M39 | `lineOrReason`: the control-character test before `resolveCommand` | `a_name_or_a_line_with_a_control_character_is_escaped_in_the_question_the_report_and_the_notices`, `a_refused_name_comes_before_the_control_character_reason` |
+| M40 | `folderReport`: the `Typed:` clause always | `a_closed_terminal_whose_replacement_took_no_line_says_it_was_closed`, `a_failure_with_nothing_closed_claims_no_close`, `an_open_row_closed_under_run_says_so_and_never_says_already_open`, and 3 more |
+| M41 | `failedAfterClosing`: `its terminal was closed` whatever the count | `a_failure_after_closing_says_what_was_closed` |
+| M42 | `lineSection`: `${row.line}` raw | `a_line_with_a_control_character_is_shown_escaped_and_typed_unchanged`, `a_name_or_a_line_with_a_control_character_is_escaped_in_the_question_the_report_and_the_notices`, `the_bound_counts_the_text_as_shown` |
+
+**Not covered, and why.** As above: nothing here drives VS Code. That a created terminal is listed at once, and that `dispose` leaves
+it listed until the close arrives, were read in VS Code 1.93.0's source and not observed. Whether `Terminal.name` keeps a control character
+through a reload is not observed, which is why such a name is not run.
+
 ## A gone request reaches no SSH prompt (2026-10-10, E4.S4)
 
```

## C. Commands

Run from the repository root unless a line says otherwise. A block is applied from this file, so nothing is retyped, and `git apply` refuses rather than guesses:

```bash
b() { node -e "const s=require('fs').readFileSync('todo/PLAN_terminal_folder_run_S5_brief.md','utf8');const f=String.fromCharCode(96).repeat(3);const m=s.split(f+'diff '+process.argv[1]+'\n')[1].split('\n'+f+'\n')[0];process.stdout.write(m+'\n')" "$1" | git apply; }
```

**The order. Each step is one run, and its result goes in your summary.**

| Step | Apply | Then, of the 271 tests below |
|---|---|---|
| P0 | `b worlds; b seam; b t-activity; b t-busy; b t-launcher; b t-roads; b t-escaper; b t-chain; b t-folder; b t-folder-command; b t-folder-edges` | 205 pass, 66 fail, each as §A says. `tsc` prints 19 lines of errors and still emits, since `tsconfig.json` has no `noEmitOnError`: 15 `TS2554` and `TS2305` in `folderRun.test.ts`, 4 for `armed` in `terminalActivity.test.ts` |
| P1 | `b p-activity` | 222 pass, 49 fail; `tsc` 15 lines |
| P2 | `b p-escaper` | 231 pass, 40 fail |
| P3 | `b p-chain` | 234 pass, 37 fail |
| P4 | `b p-folder; b p-folder-command` | 267 pass, 4 fail; `tsc` clean. The 4: `the_name_and_the_terminal_title_are_both_details_name`, `a_history_row_...`, both `after_a_split_name_...` |
| P6 | `b p-run` | 271 pass |
| P8 | `b d-extension; b d-tests` | no code |

There is no P5 or P7: item 5 changes no code, and item 7 is in P0. Between steps, from `src_vs_code`, at lowered priority:

```bash
npx tsc -p ./; node --import ./scripts/lower-priority.mjs --test --test-timeout=8000 --test-concurrency=8 out/test/terminalActivity.test.js out/test/busyTerminalGuard.test.js out/test/launcherBusyTerminal.test.js out/test/commandNameRoads.test.js out/test/folderRun.test.js out/test/folderRunCommand.test.js out/test/folderRunEdges.test.js out/test/transitSecretReport.test.js out/test/dependencyRun.test.js out/test/shareDiagnostics.test.js out/test/dependencyChain.test.js
```

Finally, from `src_vs_code`, then the root:

```bash
npm run typecheck && npm run lint
npm test
cd .. && node .claude/rules/shared/tools/plan-lifecycle.mjs && node .claude/rules/shared/tools/pin-check.mjs
```

Read the exit of a clean `tsc` before any suite number. Do not commit or push: the caller does. Copy the P0 failure of the two `a_start_and_end_with_no_send_of_ours_never_read_finished` tests and their pass into your summary: they are this story's **Done when**.

**Red again, each applied alone by the exact replacement, compiled, watched and restored; the result goes in the summary.** A row whose `tsc` complains still emits. Run the same eleven suites; M2 and M35 are slow, since a test left waiting for a question ends at `--test-timeout`. A test named in two suites counts twice. Expected reds were measured:

| # | Mutation | Expected red |
|---|---|---|
| M1 | `terminalActivity.ts` `onStart`: delete the `if (state.kind === 'unknown')` block (the fix undone) | 8: rows 1, 3, 4, 5, 11, 12, 16, 17 |
| M2 | `onSent`: `POISONED : UNKNOWN` for `POISONED : ARMED` | 51: rows 1, 2, 5, 6, 7, 8, 9, 10, 13, 15, 63; 19 older tests, among them `a_command_started_after_a_finished_one_makes_the_next_click_ask`, `a_double_click_on_a_finished_terminal_types_once_then_asks`, `a_finished_launcher_terminal_is_typed_into_as_today` |
| M3 | `READING`: `armed: 'finished'` | 16: rows 1, 2, 5, 6, 9, 14, 60, 63; `a_double_click_on_a_finished_terminal_types_once_then_asks`, `after_our_send_with_no_new_evidence_the_next_click_asks`, `the_tracker_is_registered_through_registerRunCommands_and_disposes` |
| M4 | `onSent`: `return ARMED;` (typing over a running command no longer poisons) | 2: row 1; `our_own_send_over_a_running_command_poisons_it_so_the_inner_pair_never_reads_finished` |
| M5 | `onStart`: `state.kind === 'finished' ? state : state.kind === 'running' ? POISONED : ...` (a start after a finished command is not seen) | 3: row 1; `a_command_started_after_a_finished_one_makes_the_next_click_ask`, `a_start_after_a_finished_command_reads_running_with_the_new_execution` |
| M6 | `CONTROL_RANGES`: `[0x007f, 0x007f]` for `[0x007f, 0x009f]` | 4: rows 18, 28 |
| M7 | `CONTROL_RANGES`: no `[0x202a, 0x202e]` | 4: rows 18, 23, 28 |
| M8 | `CONTROL_RANGES`: no `[0x2066, 0x2069]` | 3: rows 18, 28 |
| M9 | `escapeControl`: `isControlCharacter(codePoint) \|\| codePoint === FIELD_SEPARATOR` | 6: rows 19, 20, 24, 28, 54, 55 |
| M10 | `logSafe`: no `.replaceAll(...)` | 3: rows 20, 21; `a forged entity name cannot become a second log line, or a second FIELD` |
| M11 | `describeRunPlan`: `${step.name}` raw | 3: rows 23, 25, 26 |
| M12 | `describeRunPlan`: `${step.line}` raw | 2: rows 23, 25 |
| M13 | `describeRunPlan`: `Before "${ownerName}"` raw | 1: row 23 |
| M14 | `missingNote`: `edit "${ownerName}"` raw | 1: row 23 |
| M15 | `lineRefusal`: no control-character test | 6: rows 27, 28, 30, 31, 51, 52 |
| M16 | `judgedLine`: `facts.shellRefusal(...) ?? lineRefusal(...)` | 1: row 30 |
| M17 | `sizeRefusal`: `count >= MAX_QUESTION_CHARACTERS` | 3: rows 32, 33, 37 |
| M18 | `beforeAsking`: `const refusal = capRefusal(folderName, plan);` | 4: rows 32, 33, 36, 37 |
| M19 | `beforeAsking`: `sizeRefusal(...) ?? capRefusal(...)` | 1: row 34 |
| M20 | `planAndAsk`: `beforeAsking(folder.name, plan, () => false)` | 1: row 37 |
| M21 | `sizeRefusal`: `count` is the sum of `row.line.length` | 4: rows 32, 33, 36, 37 |
| M22 | `folderReport`: `Left alone` before `Not run` | 2: rows 38, 39 |
| M23 | `settleFree`: `{ kind: 'open', name: row.name }` for the `notRun(...)` | 3: rows 41, 42, 43 |
| M24 | `typeLine`: `failed(row, sent.reason)` | 1: row 47 |
| M25 | `typeLine`'s `catch`: `failed(row, describeError(error))` | 2: rows 45, 46 |
| M26 | `typeLine`: `const live = toClose;`, filtering only for the `dispose` | 1: row 48 |
| M27 | `chainStopped`: `and no terminal was closed:` | 2: rows 49, 50 |
| M28 | `typeIntoEntryTerminal`: `sendGuarded(entry.name, ...)` | 4: rows 58, 59, 60, 61 |
| M29 | `linesToType`: `row.kind === 'run' \|\| (closing && row.id === '')` | 7: rows 50, 56, 57; `a_declined_chain_types_nothing_and_closes_nothing`, `close_makes_an_open_row_a_root`, `closing_comes_after_the_chain_is_ready`, `run_types_run_rows_and_close_types_open_rows_too` |
| M30 | `runChosen`: `trustEach(trust, linesToType(plan, false))` | 2: rows 56, 57 |
| M31 | `runChosen`: roots from `linesToType(plan, false)` | 5: rows 50, 57; `a_declined_chain_types_nothing_and_closes_nothing`, `close_makes_an_open_row_a_root`, `closing_comes_after_the_chain_is_ready` |
| M32 | `oneAtATime`: `await run(); inFlight.delete(key);` with no `try`/`finally` | 1: row 64 |
| M33 | `vpnWorld.ts` `createTerminal`: no `listed = [...listed, live[o.name]];` | 5: rows 15, 60, 61, 62, 63 |
| M34 | `terminalGuard.ts` `typed`: no `noteSent(terminal);` | 6: rows 13, 15, 63; `a_double_click_on_a_finished_terminal_types_once_then_asks`, `after_our_send_with_no_new_evidence_the_next_click_asks`, `the_tracker_hears_of_the_send_before_the_keystrokes_leave` |
| M35 | `busyTerminalGuard.test.ts` `armed`: an empty body | 7: the seven marked red in §A.9 |
| M36 | `beforeAsking`: no early return for a plan with no line | 4: row 35; `another_folder_is_not_held_up`, `no_line_reports_with_no_modal_and_an_empty_folder_says_so`, `nothing_with_a_line_reports_with_no_modal` |
| M37 | `onEnd`: `return FINISHED;` (an undefined code no longer poisons) | 12: rows 1, 2, 8, 10; `a_start_while_running_poisons_in_either_delivery_order`, `a_sub_shell_signature_keeps_asking_for_the_terminals_life`, `an_end_with_undefined_code_on_the_current_execution_poisons_for_life` |
| M38 | `describeRunPlan`: `, in order,` dropped from the first sentence | 3: row 22; `the owner's chain: the installer runs and is AWAITED, then the launcher is typed with {config} filled in`, `the pre-run sentence lists every step in order with its line` |
| M39 | `lineOrReason`: the control-character test before `resolveCommand` | 2: rows 29, 51 |
| M40 | `folderReport`: the `Typed:` clause always | 6: rows 40, 42, 46, 48; `no_line_reports_with_no_modal_and_an_empty_folder_says_so`, `the_report_groups_reasons_and_trims_a_full_stop_and_never_says_started` |
| M41 | `failedAfterClosing`: `its terminal was closed` whatever the count | 1: row 44 |
| M42 | `lineSection`: `${row.line}` raw | 3: rows 33, 51, 53 |

**Done when** (parent's S5): a start and an end with no send of ours never read `finished`, watched red first; every row of the revised §3 has a test; the whole suite, lint and typecheck are green; every mutation above went red; `git diff --stat` shows no `extension.ts`, no `terminalGuard.ts`, no `pinnedTerminal.ts`, no `dependencyRunHost.ts`, no `commandTrust.ts`, no help file, no `README.md`, no `CHANGELOG.md`, and no change to the parent plan or to any other brief.

## D. Out of scope: do not touch

- `busyQuestion`'s words, `terminalGuard.ts`, `pinnedTerminal.ts`, `dependencyRunHost.ts`, `trustPrompt.ts`, `commandTrust.ts`, `extension.ts`.
- `:runall`, every `package.json` clause, the help in five languages, `README.md`, `CHANGELOG.md`, `todo/README.md`, the followups file: S4's, or the caller's.
- `entryAt` at `runCommands.ts:63`, and what `launchScript` and `runWithSecrets` title their terminals.
- The busy and trust modals' raw line, and the warnings that name a step (`stepVerdict`, `stepRefusal`): the plan's escaper sentence is about the folder's modal and report and the chain's modal.
- U+200E, U+200F and U+061C, and any other format character: the item names its ranges.
- The S1 spec, the S3 brief, the S4 brief, the parent plan: the caller corrects those.
- New requirements. A defect you find is reported in your summary: the epoch's change budget is one.
