# PLAN — S2 scenarios and brief: `{name}`, one road, refused rather than quoted

> Status: **IMPLEMENTED, 2026-11-06.** Parent: [PLAN_terminal_folder_run.md](PLAN_terminal_folder_run.md).
> Story S2 of the parent's `## Stories` (parent §Design 1 and its road table). Written by an Opus judge; Sonnet codes
> from it and rediscovers nothing; Opus reviews. Scope: `src_vs_code` plus two research documents. No help, README or
> CHANGELOG (S4), no folder run (S3). `commandTrust.ts` is not edited.
>
> **Line numbers** are from commit `6754881` (S1 as committed). S1 may still take review fixes in `runCommands.ts`,
> `pinnedTerminal.ts`, `vpnLauncherRun.ts` `launch`, `vpnWorld.ts` and `arrowWorld.ts`: there the **function name** is the
> address and the number a hint. S2 does not edit `pinnedTerminal.ts`, `terminalGuard.ts` or `launch`.
>
> **How the code below was checked.** It was prototyped in a scratch copy of `f8bae4a`, with all production edits of §B
> except the docblocks and the two text changes: `tsc` clean except the five test sites of §B.14, `eslint` clean on every
> changed file, 241 tests of the 15 nearest suites green. By throwaway scripts on that copy, rows 19, 20, 22, 24, 25, 26,
> 28-32, 33-35, 39-42, 44, 45, 51, 55, 56 and 65-68 behaved as written (the arrow without S1's guard, which those rows do not
> exercise; 32 and 33 without the trust assertion, 41 for the template only, 55 on nine of its token rows). The test files named here were not written. Code blocks are the design; a docblock may be reworded, a string
> the tests match may not.

## A. Scenarios

Each row is one `test()`, its title the name in the second column. Fixtures: `E(name, command, args?)` is
`{ id: 'e1', name, isSshEnabled: false, isTerminal: true, command, commandArgs: args }`. `L` is the line a row expects.

`ACCEPTED` and `REFUSED` live in new `src/test/commandNameTable.ts` (not `*.test.ts`), so the pure table and the real-shell
test read one list:

- `ACCEPTED` (10): `billing-api-design`, `orders-mockups`, `admin-panel-mockups`, `a.b`, `_x`, `x1`, `1x`, `Пётр`, `日本語`, `a..b`.
- `REFUSED` (18): `-x`, `.x`, `..`, `a b`, `a;b`, `$(x)`, `` a`b ``, `a\nb`, `a’b`, `a–b`, `aㅤb`, `a͏b`, `a️b`,
  `a‮b`, `~`, `a/b`, `a:b`, `éx` (NFD).
- `REFUSED_MORE`: `''`, `{name}`, `{config}`, `a'b`, `a\tb`, `a%b`, `a$b`. Every entry above was run through the regexes on 2026-11-05.

### A.1 Pure: `src/test/commandName.test.ts`

| # | Test | Given | When | Then |
|---|---|---|---|---|
| 1 | `the_token_is_only_the_bare_name_in_braces` | the table: `{name}`, `user@{name}`, `{name}.{name}`, `{name}{name}`, `x{name}y`, `'={name}'`, `"{name}"`, `{config} {name}`, `creds://me/{name}/password` substitute; `${name}`, `$${name}`, `{{name}}`, `#{name}`, `%{name}`, `{name}}`, `{ name }`, `{na''me}`, `{NAME}` do not | `usesNameToken(t)`, `substituteName(t, 'N')` | as listed; a row that does not substitute comes back identical and `usesNameToken` is `false` |
| 2 | `dollar_patterns_in_a_name_mean_nothing` | — | `substituteName('a {name} b', '$&')`; also `` $` `` and `$'` | `'a $& b'`, and the same literal for the other two |
| 3 | `a_name_is_never_scanned_again` | — | `substituteName('{name} {name}', '{name}')` | `'{name} {name}'`, once through, no loop |
| 4 | `usesNameToken_keeps_no_state` | the `g` regex | `usesNameToken('{name}')` twice, then on `'x'`, then `'{name}'` | `true, true, false, true`. A `.test` on the `g` regex would answer `true, false` (measured) |
| 5 | `every_accepted_name_passes` | `ACCEPTED` | `nameRefusal(n)` | `undefined` for each, and `ACCEPTED.length + REFUSED.length === 28` |
| 6 | `every_other_name_is_refused` | `REFUSED`, `REFUSED_MORE` | `nameRefusal(n)` | `NAME_REFUSAL` for each |
| 7 | `marks_only_after_a_letter` | — | `x́`, `x̀́` pass; `́x`, `1́`, `_́`, `x̣́` (not NFC) | as listed |
| 8 | `the_refusal_says_why_and_how_to_keep_a_literal` | — | read `NAME_REFUSAL` | contains `letters, digits`, `shell syntax`, `{na''me}`; does not contain `{ name }` |

### A.2 Pure: `src/test/resolveCommand.test.ts`

| # | Test | Given | When | Then |
|---|---|---|---|---|
| 9 | `no_command_is_empty_whatever_the_name` | `E('a b', '  ', [{ value: '{name}' }])` | `resolveCommand` | `{ kind: 'empty' }`; `shownCommandLine` is `''` |
| 10 | `no_token_runs_any_name_as_today` | `E('a;b', 'ls -la')` | `resolveCommand` | `ready`, `line === 'ls -la'`: a name that the line does not use is not judged |
| 11 | `an_accepted_name_fills_command_and_rows` | `E('alert', 'tmux {name}', [{ value: '-t {name}', note: 'n' }])` | `resolveCommand` | `line === 'tmux alert -t alert'`, `parts.command === 'tmux alert'`, `parts.args[0]` is `{ value: '-t alert', note: 'n' }`, and `buildCommandLine(parts.command, parts.args) === line` |
| 12 | `a_refused_name_gives_the_template_and_the_reason` | `E('a b', 'tmux attach', [{ value: '-t {name}' }])` | `resolveCommand` | `refused`, `template === 'tmux attach -t {name}'`, `reason === NAME_REFUSAL`, and no `line` key |
| 13 | `a_disabled_row_cannot_refuse_and_is_not_filled` | `E('a b', 'ls', [{ value: '-t {name}', disabled: true }])`; separately `E('alert', 'ls', [{ value: '-t {name}', disabled: true }, { value: 'x{name}' }])` | `resolveCommand` | first: `ready`, `line === 'ls'`, `parts.args[0].value === '-t {name}'`. Second: `line === 'ls xalert'`, the disabled row still `-t {name}` |
| 14 | `shown_is_the_resolved_line_else_the_template` | the fixtures of 9, 11, 12 | `shownCommandLine`, `commandRefusal`, `willNotRunLines` | `''` / line / template; `undefined` / `undefined` / reason; `[]` / `[]` / `['will not run: ' + reason]` |
| 15 | `config_stays_literal_and_name_is_filled` | `E('alert', 'openvpn --config {config} --remote {name}')` | `shownCommandLine` | `'openvpn --config {config} --remote alert'`; with the name `{config}` it is refused, so a name cannot smuggle the token |
| 16 | `a_rename_changes_the_fingerprint` | `E('a', 'x {name}')`, `E('b', 'x {name}')` | `commandFingerprint('e1', shownCommandLine(·))` | the two differ; the same name twice gives the same one |
| 17 | `describe_shows_the_resolved_line_and_the_stored_rows` | `{ ...E('alert', 'x', [{ value: '-t {name}', note: 'why' }]), commandNote: 'for' }` | `describeCommand` | starts `x -t alert`, contains `for`, and the row line is `-t {name}  — why` (stored text). With the name `a b`: starts `x -t {name}`, second line `will not run: …` |
| 18 | `resolving_changes_nothing_it_was_given` | a deep-frozen entry | `resolveCommand` | no throw, and the frozen rows are unchanged |

Fixture `src/test/fixtures/typed/resolved_line_needs_narrowing.ts`, compiled by the existing `typedFixtures.test.ts`
(TS2339 at that line was measured):

```ts
// expect TS2339 at line 5
// The line exists only after narrowing: skipping a refusal does not compile.
import { resolveCommand } from '../../../commandLine';

export const skipped: string = resolveCommand({ name: 'a b', command: 'x {name}' }).line;
```

### A.3 Stub world, the run roads: `src/test/commandNameRoads.test.ts`

Worlds: `arrowWorld` with the additions of §B.13, `startVpn` of `vpnWorld.ts`. Modals answer their first button unless a row says otherwise.

**The invariant.** Rows 19, 27, 32 and 33 each read the same string from the modal, the trust store and the terminal or
child, and compare all three with `resolveCommand(entry).line`. The Run with Secrets child gets that string with its references rewritten to shell reads, as today. The agent road has no modal: 40 and 41 hold its fingerprint and its child.

| # | Road (parent table) | Test | Given | When | Then |
|---|---|---|---|---|---|
| 19 | Green arrow | `the_arrow_displays_approves_fingerprints_and_types_one_string` | `E('alert', 'tmux attach', [{ value: '-t {name}' }])`, `L = 'tmux attach -t alert'` | `run` | the modal text contains `\n\nL\n\n`; `isCommandTrusted(aw.trust, 'e1', L)`; the terminal's `sent` is `[L]` |
| 20 | Green arrow | `the_arrow_refuses_a_name_with_no_modal_and_types_nothing` | `E('a b', 'tmux attach', [{ value: '-t {name}' }])` | `run` | no text matches `/Run this command/`; one warning `"a b" will not run: ` + reason; `aw.terminals` empty; the store is empty |
| 21 | Green arrow | `a_rename_asks_again_and_types_the_new_line` | as 19, then `{ ...entry, name: 'bravo' }` | `run`, `run` | two modals; `CredsForDevs: alert` got `-t alert`, `CredsForDevs: bravo` got `-t bravo` |
| 22 | Green arrow | `the_name_is_details_name_and_the_terminal_keeps_the_node_name` | `E('alert', 'x {name}')`, node name `other` | `run(entry, 'other')` | `CredsForDevs: other` got `x alert` |
| 23 | Green arrow | `an_empty_command_still_says_so_as_before` | `E('alert', '')` | `run` | warning `"alert" has no command yet — edit it and fill in the command.`; no terminal |
| 24 | Green arrow | `a_literal_in_an_old_entry_is_asked_about_once` | `E('alert', 'jq {name}')`, trusted `[['e1', 'jq {name}']]` (the old literal) | `run` | one modal showing `jq alert`: the upgrade changed the line. No `Type It Anyway` involved: a new terminal |
| 25 | Run with Secrets | `a_reference_holding_the_token_resolves` | `E('alert', 'tool', [{ value: 'creds://me/{name}/password' }])`; `refSource`: account `me`, entity `alert` at path `['alert']`, `fieldReading` → `{ kind: 'value', value: 'correct-horse-battery' }` | `runWithSecrets` | `masked[0].commandLine === 'tool ' + shellRead('CREDS_REF_1', process.platform, undefined)` (read back, not guessed); `env.CREDS_REF_1` is the value; the modal shows `tool creds://me/alert/password` |
| 26 | Run with Secrets | `a_refused_name_runs_nothing_and_reads_no_secret` | as 25, name `a b`, a `fieldReading` that counts calls | `runWithSecrets` | `masked` empty; 0 calls; no modal; warning `"a b" will not run: …` |
| 27 | Run with Secrets | `secrets_approve_and_fingerprint_the_resolved_line` | as 25 | `runWithSecrets` | `isCommandTrusted(aw.trust, 'e1', 'tool creds://me/alert/password')`, and not for the template |
| 28 | Run with Secrets | `a_disabled_row_holding_the_token_is_no_reference` | `E('alert', 'tool', [{ value: 'creds://me/other/password' }, { value: 'creds://me/{name}/password', disabled: true }])`, the source knows only `other` | `runWithSecrets` | it runs; `Object.keys(masked[0].env)` holds only `CREDS_REF_1`, the value of `other`: a disabled row refused nothing |
| 29 | Run with Secrets | `a_refused_name_used_only_by_a_disabled_row_still_runs` | as 28, name `a b` | `runWithSecrets` | it runs, as 28 |
| 30 | Run with Secrets | `a_disabled_literal_reference_is_scanned_as_today` | `E('alert', 'tool', [{ value: 'creds://me/other/password', disabled: true }, { value: 'creds://me/other2/notes' }])`, the source knows both | `runWithSecrets` | both are in `env`, in row order, and the line holds only `CREDS_REF_2` |
| 31 | Run with Secrets | `the_token_alone_is_no_reference` | `E('alert', 'tool {name}')` | `runWithSecrets` | warning matches `/holds no creds:\/\/ reference/` (after the modal, as today's order); `masked` empty |
| 32 | `executableLine` | `a_chain_step_runs_its_resolved_line` | `ownerChain()`, `install` → name `install-openvpn`, command `installer {name}` | `startVpn` with `trust` | the chain modal lists `install-openvpn: installer install-openvpn`; the terminal `CredsForDevs: before ops relay stage` `executed` it; `isCommandTrusted(trust, 'install', …)` holds |
| 33 | VPN launcher | `the_launcher_fingerprint_keeps_config_and_fills_name` | `start` → name `start-openvpn`, command `openvpn --config {config} --remote {name}`, `dependsOn: []`; `vpn` → `dependsOn: []`, `runDependencies: false` | `startVpn` with `trust` | the modal shows `openvpn --config {config} --remote start-openvpn`; `isCommandTrusted(trust, 'start', …)` holds for exactly that string; `sent[0]` matches `/^openvpn --config '.*' --remote start-openvpn$/` |
| 34 | `executableLine` | `a_refused_step_refuses_the_whole_chain` | `ownerChain()`, `install` keeps the name `install openvpn` (a space), command `installer {name}` | `startVpn` | `started === false`; nothing executed or sent; a warning `"install openvpn" cannot run as a dependency: …`; no text matches `/^Before /`. The launcher's own trust modal comes first, as today |
| 35 | VPN launcher | `a_refused_launcher_warns_and_starts_nothing` | `start` keeps `start openvpn`, command `openvpn --config {config} --remote {name}`, `dependsOn: []`; `vpn` as 33 | `startVpn` | `started === false`; no terminal; warning `The launcher "start openvpn" will not start: …`; no trust modal |

### A.4 Pure, `executableLine`: `src/test/dependencyRun.test.ts` (added)

| # | Test | Given | When | Then |
|---|---|---|---|---|
| 36 | `executableLine_answers_the_template_for_a_refused_name_never_undefined` | `terminal('t', 'x {name}', { name: 'a b' })`; `name: 'alert'`; no command; `{ isVpn: true }` | `executableLine` | `'x {name}'`; `'x alert'`; `undefined`; `undefined` |
| 37 | `a_refused_step_stops_the_plan_with_its_reason` | a root with `runDependencies`, depending on the first fixture | `planDependencyRun` | `ok: false`; the reason matches `/"a b" cannot run as a dependency/` and contains `NAME_REFUSAL` |
| 38 | `an_excluded_entry_is_not_judged_as_a_step` | the same, the step's id in `exclude` | `planDependencyRun` | `ok: true`, `steps` empty: a launcher (and S3's direct entries) refuses on its own road |
| 39 | `a_refused_entry_stays_pickable_as_a_launcher` | a storage whose `getNodes` holds `{ id: 't', type: 'entity', name: 'a b', details: terminal('t', 'x {name}', { name: 'a b' }) }`, in `src/test/commandTargetsLauncher.test.ts` | `collectLauncherCandidates(storage, 'a1', 'other')` | it is listed: `undefined` would have read as "not pickable" (`commandTargets.ts:120`) |

### A.5 The agent and the consent

| # | Road | Test (file) | Given | When | Then |
|---|---|---|---|---|---|
| 40 | Agent run | `the_agent_runs_the_resolved_line` (`agentUseActions.test.ts`) | details `{ id: 'e1', name: 'alert', isTerminal: true, command: C }`, `C` being `Write-Output {name}` on Windows and `echo {name}` elsewhere; trust holds the resolved line | `terminalRunAction(deps).run(ctx, {})` | `status 200`; stdout contains `alert`. A real child, as the neighbouring test |
| 41 | Agent run | `the_agent_is_not_trusted_by_a_vouched_template_or_an_old_name` | trust holds only the template, then only the line of another name | `run` | `no_credential` both times: a rename keeps an agent out until a person has run it |
| 42 | Agent run | `a_refused_name_fails_not_supported_before_the_trust_check` | name `a b`, trust holds the template; `acquireExecSlot` counts | `run` | `not_supported`; the message contains `NAME_REFUSAL`; 0 slots acquired |
| 43 | Agent run | `the_summary_and_the_snippet_stop_saying_exactly_as_saved` | — | `terminalRunAction(deps).summarize({})`; `buildKindSnippet` for `terminal` (`agentShareSnippet.test.ts`) | neither matches `/exactly as saved/`; the snippet names `{name}`; the `script` action and snippet still say `exactly as saved` |
| 44 | Consent | `the_prompt_shows_the_line_with_the_requested_name` (`mcpCreate.test.ts`) | request `{ name: 'alert', kind: 'terminal', fields: { command: 'tmux attach', args: [{ value: '-t {name}' }] } }`, values from the real `planCreate` | `summarizeCreate` | contains `Command: tmux attach -t alert`; no `will not run` |
| 45 | Consent | `the_prompt_shows_the_template_and_why_for_a_refused_name` | the same, `name: 'a b'` | `summarizeCreate` | contains `Command: tmux attach -t {name}` and a line `will not run: …`; does not contain `-t a b` |

### A.6 Displays and copies

| # | Road | Test (file) | Given | When | Then |
|---|---|---|---|---|---|
| 46 | Viewer | `the_full_command_row_shows_the_resolved_line` (`entityViewPage.test.ts`) | `options({ details: metadata({ name: 'alert', isTerminal: true, command: 'tmux attach', commandArgs: [{ value: '-t {name}' }] }) })` | `renderEntityViewHtml` | the Full command input holds `tmux attach -t alert`; no `Will not run` row |
| 47 | Viewer | `a_refused_name_shows_the_template_and_a_will_not_run_row` | the same, `name: 'a b'` | render | holds `tmux attach -t {name}` and a `Will not run` row with the reason, HTML-escaped |
| 48 | Copy | `the_viewer_copies_the_line_or_the_template_and_the_reason` (`entityViewPage.test.ts`) | both fixtures | `copyValueFor(options, 'fullCommand')`, `'commandRefusal'` | the line / the template; `undefined` / the reason |
| 49 | Raw rows | `stored_rows_stay_as_stored` (`entityViewPage.test.ts`) | the first fixture | render; `copyValueFor(options, 'command')`, `'arg0'`; `mcpEntryFor` in `mcpEntries.test.ts` beside `:271`; `nodeHaystack` | the row reads `-t {name}`; the copies are `tmux attach` and `-t {name}`; the entry's `command` and the haystack are raw |
| 50 | Copy All | `copy_all_shows_the_resolved_line_or_the_template_and_why` (`entityText.test.ts`) | `{ ...base, name: 'alert', isTerminal: true, command: 'x {name}' }`, then `name: 'a b'` | `formatEntityBlock(d, undefined)` | contains `x alert`; then contains `x {name}` and `will not run:` |
| 51 | Revision page | `a_kept_version_fills_the_name_it_had_on_the_page_and_in_copy_all` (`revisionViewer.test.ts`) | a live terminal entry; a version `{ at, name: 'old-name', details: { …terminal, command: 'x {name}', name: 'bad;name' }, secrets: {} }`, asserted recorded by `getHistory` as `:48` does; `clickVscode`, `memoryStorage`, `seedEntry` of `pinWorld` and `./entityViewPanel` mocked, as that file's `world` does | `openRevisionViewer`; `renderEntityViewHtml(page)`; `await page.copyAllText()` | the page holds `x old-name`; Copy All contains `Name: old-name` and `x old-name`, and no `will not run`. Today's `:367` would read `bad;name` |
| 52 | Copy, Show | `copy_command_copies_the_line_and_says_copied` (`commandLineHandlers.test.ts`) | handlers per §B.13, `E('alert', 'x {name}')` | invoke `credSshManager.copyCommand`, `showCommand` | clipboard `x alert`; info `Copied: x alert`; no warning; the document opened starts `x alert` |
| 53 | Copy, Show | `copy_of_a_refused_name_copies_the_template_and_warns` | `E('a b', 'x {name}')` | the same | clipboard `x {name}`; a warning `Copied the template: "a b" will not run: …`; no info; the document holds `x {name}` and `will not run:` |
| 54 | Copy, Show | `no_details_still_says_no_command` | a node with no `details` | the same | warning `"n" has no command yet.`; document `This entry has no command yet.` |

### A.7 The form: `src/test/commandPreviewScript.test.ts`, running the real fragment under `miniDom.ts`

`prelude` = `var argRows = […]; function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }`.
`runFragment(prelude + commandPreviewScript(), doc, ['updatePreview', 'wirePreviewName', 'resolvedPreview'])`, with
`doc.place` for `command`, `name`, `commandPreview`, `commandPreviewRefusal`. Values leaving the `vm` context go through a JSON round trip before `deepEqual`.

| # | Test | Given | When | Then |
|---|---|---|---|---|
| 55 | `the_preview_agrees_with_resolveCommand_for_every_name_and_token` | every name of `ACCEPTED`, `REFUSED`, `REFUSED_MORE` × every token row of test 1 | `resolvedPreview(t, n)` against `resolveCommand(E(n, t))` | a `ready` equals `{ line, refusal: '' }`; a `refused` equals `{ line: template, refusal: reason }` |
| 56 | `the_preview_reads_the_live_name_field_and_listens_to_it` | `command = 'tmux attach'`, row `-t {name}`, a disabled row `{name}`, `name = ' alert '` | `updatePreview()`; then `wirePreviewName()`, `name.value = 'a b'`, `name.fire('input')` | `tmux attach -t alert`, the note `hidden` (the name is trimmed, as `entityFormPanel.ts:596` saves it); then `tmux attach -t {name}`, the note visible, starting `Will not run: ` |
| 57 | `the_patterns_survive_the_escaper_as_u_flag_sources` | `NAME_PATTERNS` | the fragment's text | it holds `jsonForScript(p)` for each; evaluating that JSON answers `p` exactly; `new RegExp(p, 'u')` compiles; the token's `<` travels as `<` |
| 58 | `the_fragment_can_sit_in_a_template_literal` | — | `commandPreviewScript()` | no backtick, no `${`, no `</script`, in the shape of `secondModeMarkup.test.ts:80-90` |
| 59 | `the_form_hints_at_the_token_and_calls_the_wiring` (in `entityFormPage.test.ts`, for its `options()` factory) | `renderHtml(options())`; `formPageScript` as `entityFormScript.test.ts` calls it | read | the page holds `<code>{name}</code>` and `id="commandPreviewRefusal"`; the script holds `wirePreviewName();` and one `function updatePreview` |

`webviewHtml.test.ts` and `entityFormScript.test.ts:146` already parse the whole script for every kind; both stay green.

### A.8 The scan: `src/test/commandRoadScan.test.ts`

In the shape of `commandsRegistered.test.ts` and `scriptInterpolation.test.ts`: `sourceFiles(SRC)` skipping `test`, whole
text matched (never line by line), each match reported as `file:line` with the line's trimmed text.

Patterns: calls `/\bbuildCommandLine\s*\(/g`, imports `/import\s*\{[^}]*\bbuildCommandLine\b[^}]*\}/g`; reads
`/\.\s*commandArgs\b/g`, destructuring `/\{[^{}]*\bcommandArgs\b[^{}]*\}\s*=[^=>]/g`, index `/\[\s*['"`]commandArgs['"`]\s*\]/g`;
callers `/\bexecutableLine\s*\(/g`.

| # | Test | Then |
|---|---|---|
| 60 | `buildCommandLine_is_called_and_imported_only_in_commandLine` | every call site's file is `commandLine.ts`; no import site at all |
| 61 | `commandArgs_is_read_only_where_a_reason_is_written` | every read, destructure or index site is in `ALLOWED_READS` (§B.12), or in `commandLine.ts`, which is the road. Listing the offenders, not a count |
| 62 | `the_allow_list_has_no_stale_entry` | each `ALLOWED_READS` line is still found, so a moved line cannot widen the exemption |
| 63 | `executableLine_has_only_its_three_readers` | sites are the declaration and `visitNode` in `dependencyRun.ts`, `launcherLine` in `vpnLauncherRun.ts`, `hasCommand` in `commandTargets.ts`: a fourth reader could type a template |
| 64 | `the_scan_still_finds_what_it_is_about` | the companion (`testing.md`, *A structural test that matches nothing*): the call scan finds at least 2 sites in `commandLine.ts`; the read scan finds the `typeGuards.ts` line; and the patterns, applied to the literal `'const x = buildCommandLine(\n  a,\n  b?.\n    commandArgs,\n);'`, report one call and one read |

### A.9 The real shell: `src/test/commandNameShell.test.ts`

No stub. Each test takes `shellDir(t)` (§B.12). Line `P = 'printf %s {name}'`. `spawnSync('bash', ['-c', line], { cwd: dir })`, stdout as a Buffer.
Presence is asked as `has` at `hostShell.test.ts:56`. The bash rows carry `skip: process.platform === 'win32' && !has('bash', ['-c', 'true']) ? 'no bash on this Windows machine' : false`, so a Linux or macOS machine without bash fails rather than skips.

| # | Test | Given | When | Then |
|---|---|---|---|---|
| 65 | `bash_receives_every_accepted_name_byte_exact` | `ACCEPTED`, plus `x́` | run `resolveCommand(E(n, P)).line` | `stdout.equals(Buffer.from(n, 'utf8'))` for each; the folder stays empty |
| 66 | `the_control_an_unguarded_hostile_name_really_creates_a_file` | `substituteName(P, 'x;touch pwned')`, skipping the guard | run it | `fs.existsSync(path.join(dir, 'pwned'))`: the test can fail |
| 67 | `no_refused_name_reaches_bash` | `REFUSED`, `REFUSED_MORE` | `kind === 'refused'`; run `shownCommandLine(E(n, P))` | stdout is `{name}`; the folder stays empty |
| 68 | `the_literal_form_prints_the_token_and_is_not_substituted` | `E('alert', "printf %s {na''me}")` | run its line | the line is unchanged; stdout is `{name}` (measured) |
| 69 | `the_exact_match_form_stays_one_word` | `E('alert', "printf %s '={name}'")` | run its line | stdout is `=alert` |
| 70 | `pwsh_receives_the_accepted_names` | skip with reason `'no pwsh on this machine'` | `pwsh -NoProfile -NonInteractive -Command`, line `Write-Output {name}` | trimmed stdout equals the name. On Windows only the ASCII names: the console code page is not what this proves |
| 71 | `cmd_receives_the_accepted_names` | skip with reason `'cmd.exe runs only on Windows here'` unless `win32` | `cmd.exe /d /s /c`, line `echo {name}` | the ASCII names, trimmed stdout equal |

Rows 70 and 71 have never been run: no `pwsh` on the machine this was written on, and the WSL interop `cmd.exe` is excluded by
the `win32` test because it starts in a UNC folder and warns. `ci-extension.yml:28` is `ubuntu-latest`, so CI is where `pwsh`
first runs (from memory, the image has it; not checked). If row 70 goes red on the shell's own parsing of a name and not on
the substitution, narrow its list with a comment saying which name and why, and report it.

## B. The brief

### B.1 `src/commandName.ts` (new, pure, imports nothing)

```ts
const NAME_TOKEN = /(?<![$#%{])\{name\}(?!\})/gu;
const NAME_SHAPE = /^(?:\p{L}\p{M}*|\p{Nd}|_)(?:\p{L}\p{M}*|\p{Nd}|[._-])*$/u;
const NAME_IGNORABLE = /\p{Default_Ignorable_Code_Point}/u;

/** The patterns' sources, for the page script. */
export const NAME_PATTERNS = Object.freeze({
  token: NAME_TOKEN.source,
  shape: NAME_SHAPE.source,
  ignorable: NAME_IGNORABLE.source,
});

/** The one sentence every road says. It names no entry: the caller does. */
export const NAME_REFUSAL =
  "this entry's name cannot stand in for {name}, because only letters, digits and . _ - are allowed, starting with a letter, a digit or _, so that no name can become shell syntax. Rename the entry; to keep a literal {name} in bash, write {na''me}.";

/** `search` ignores and restores `lastIndex`, so the `g` flag keeps no state here. Never `.test` this regex. */
export function usesNameToken(text: string): boolean {
  return text.search(NAME_TOKEN) !== -1;
}

function acceptedName(name: string): boolean {
  return NAME_SHAPE.test(name) && !NAME_IGNORABLE.test(name) && name === name.normalize('NFC');
}

/** Why `name` may not be substituted, or `undefined` when it may. */
export function nameRefusal(name: string): string | undefined {
  return acceptedName(name) ? undefined : NAME_REFUSAL;
}

/** Single pass; a replacement FUNCTION, so `$&` means nothing. It does not judge: `resolveCommand` does, before calling it. */
export function substituteName(text: string, name: string): string {
  return text.replace(NAME_TOKEN, () => name);
}
```

The module docblock states why refusal and not quoting (parent §1, `quoteFor` at `hostShell.ts:117-125`, the precedent `isValidAlias` at
`cliAliases.ts:43-45`). Measured on 2026-11-05: `.source` of each regex round-trips through `jsonForScript` and `new RegExp(…, 'u')`.

**The literal form, measured in bash 5.3.9:** `echo {na''me}` prints `{name}`, and the token regex does not match `{na''me}`. `echo { name }`
prints `{ name }`, three words, so the parent's `{ name }` (:106) does not keep a literal; the text says `{na''me}` and names bash because
that is what was measured. `cmd.exe` (measured through interop) prints `{na''me}` for that form and `{name}` for `{na^me}`. PowerShell was not measured.

`details.name` is a string at every door: `typeGuards.ts:288` and `:425` require it, `types.ts:58` declares it, and consent passes
`request.name`, already read as a string at `mcpCreate.ts:164`. No `typeof` guard is added.

### B.2 `src/commandLine.ts`

Imports: `CommandArg, EntityMetadata` from `./types`, plus `nameRefusal, substituteName, usesNameToken` from `./commandName`.
`buildCommandLine` keeps its signature and body; its docblock's first line becomes *"The raw join: the template, before `{name}`. Everything outside this file asks `resolveCommand` (`commandRoadScan.test.ts`)."*

```ts
/** What every road reads of an entry to know its line: `name` fills `{name}`. */
export type CommandEntry = Pick<EntityMetadata, 'name' | 'command' | 'commandArgs'>;

/** A line's parts with `{name}` filled in. Enabled rows only; a disabled row stays as stored. */
export interface CommandParts {
  readonly command: string;
  readonly args: readonly CommandArg[];
}

export type ResolvedCommand =
  | { readonly kind: 'empty' }
  | { readonly kind: 'ready'; readonly line: string; readonly parts: CommandParts }
  | { readonly kind: 'refused'; readonly template: string; readonly reason: string };

/**
 * The ONE line of an entry. What is displayed, approved, fingerprinted and typed is this string, so `line` exists only
 * after narrowing: skipping a refusal does not compile. Only enabled parts are judged, so a disabled row cannot refuse.
 */
export function resolveCommand(entry: CommandEntry): ResolvedCommand {
  const template = templateOf(entry);
  if (template.length === 0) {
    return { kind: 'empty' };
  }
  const reason = usesNameToken(template) ? nameRefusal(entry.name) : undefined;
  return reason === undefined ? readyCommand(entry) : { kind: 'refused', template, reason };
}

function templateOf(entry: CommandEntry): string {
  return buildCommandLine(entry.command ?? '', entry.commandArgs);
}

function readyCommand(entry: CommandEntry): ResolvedCommand {
  const command = substituteName((entry.command ?? '').trim(), entry.name);
  const args = normalizeArgs(entry.commandArgs).map((arg) => (arg.disabled === true ? arg : { ...arg, value: substituteName(arg.value, entry.name) }));
  return { kind: 'ready', line: buildCommandLine(command, args), parts: { command, args } };
}

/** The line to SHOW: the resolved one, else the template, so a refused name is never shown as resolved. */
export function shownCommandLine(entry: CommandEntry): string {
  const resolved = resolveCommand(entry);
  switch (resolved.kind) {
    case 'ready':
      return resolved.line;
    case 'refused':
      return resolved.template;
    default:
      return '';
  }
}

/** Why this entry's line will not run, or `undefined` when nothing about its name stops it. */
export function commandRefusal(entry: CommandEntry): string | undefined {
  const resolved = resolveCommand(entry);
  return resolved.kind === 'refused' ? resolved.reason : undefined;
}

/** The line every display adds under a refused template: one row, or none. */
export function willNotRunLines(entry: CommandEntry): string[] {
  const reason = commandRefusal(entry);
  return reason === undefined ? [] : [`will not run: ${reason}`];
}
```

Why substituting per part equals substituting the joined line: the separator is a space, so no token crosses a part, and a lookaround at a part's
edge sees the same non-excluded character (test 55 checks the joined form against this one).

`describeCommand` takes the entry: `describeCommand(entry: CommandEntry & Pick<EntityMetadata, 'commandNote'>): string`. It starts
`const line = shownCommandLine(entry); const lines = [...(line.length > 0 ? [line] : []), ...willNotRunLines(entry)];`, reads the note from
`entry.commandNote`, and takes `annotated` from `normalizeArgs(entry.commandArgs)`. Its `eslint-disable-next-line complexity` stays (lint measured it still needed).
The annotated rows stay raw: they are stored text with a person's note, the parent's last table row.

### B.3 `src/commands/runCommands.ts`

- Import: `CommandParts, ResolvedCommand, resolveCommand` from `../commandLine` replace `buildCommandLine` (`:9`).
- **Remove** `commandLineOf` (`:64-67`).
- Add after `warn`:

```ts
/** Said, and nothing runs: the road's own words for no command, or the name's refusal. */
function sayNotReady(entry: Entry, resolved: Exclude<ResolvedCommand, { kind: 'ready' }>, whenEmpty: string): undefined {
  warn(resolved.kind === 'refused' ? `"${entry.name}" will not run: ${resolved.reason}` : whenEmpty);
  return undefined;
}
```

- `runCommand` (`:107`) becomes two functions plus one, S1's `await` kept:

```ts
async function runCommand(host: RunCommandsHost, target: unknown): Promise<void> {
  const entry = await entryAt(host, target);
  if (entry !== undefined) {
    await runEntryLine(host, entry);
  }
}

async function runEntryLine(host: RunCommandsHost, entry: Entry): Promise<void> {
  const line = arrowLine(entry);
  if (line !== undefined && (await passGates(host, entry, line, windowRefusal(entry)))) {
    await typeIntoEntryTerminal(entry, line);
  }
}

/** The entry's resolved line, or `undefined` having said why, before anyone is asked anything. */
function arrowLine(entry: Entry): string | undefined {
  const resolved = resolveCommand(entry.details);
  return resolved.kind === 'ready' ? resolved.line : sayNotReady(entry, resolved, `"${entry.name}" has no command yet — edit it and fill in the command.`);
}
```

- `SecretsJob` (`:256`) becomes a union, so a command job cannot lack its parts:

```ts
interface SecretsJobBase {
  readonly entry: Entry;
  /** The exact text the trust record covers — the script body, or the resolved command line. */
  readonly body: string;
  /** The shell that reads the line — and that the reference rewrite spells its reads for. */
  readonly shell: string | undefined;
}

/** A script (its interpreter, file extension and language), or a command (its parts with `{name}` filled in). */
type SecretsJob =
  | (SecretsJobBase & { readonly script: { plan: Extract<ScriptRunPlan, { kind: 'run' }>; language: string }; readonly parts?: undefined })
  | (SecretsJobBase & { readonly script?: undefined; readonly parts: CommandParts });
```

- `commandJob` (`:287`):

```ts
function commandJob(entry: Entry): SecretsJob | undefined {
  const resolved = resolveCommand(entry.details);
  if (resolved.kind !== 'ready') {
    return sayNotReady(entry, resolved, `"${entry.name}" has nothing to run yet — open Edit and fill in the command.`);
  }
  return { entry, body: resolved.line, parts: resolved.parts, shell: hasOs(entry.details.terminalOs) ? pinnedShell().shellPath : vscode.env.shell };
}
```

- `searchedTexts` (`:322`) and `commandTexts` (`:327`):

```ts
return job.script === undefined ? commandTexts(job.parts) : [scriptEnv.body, ...(job.entry.details.scriptVars ?? []).map((v) => v.value)];

/** The parts after `{name}`, so `creds://me/{name}/password` is a reference; disabled rows are scanned, as stored. */
function commandTexts(parts: CommandParts): string[] {
  return [parts.command, ...parts.args.map((a) => a.value)];
}
```

- `maskedCommandLine` (`:365`): `if (job.script === undefined) { return buildCommandLineWithRefs(job.parts, refs.plan, process.platform, job.shell); }`, and `const d = job.entry.details;` moves below that `if`.

**The scan of references, checked against today's code.** Today `commandTexts` scans the command and every row, disabled included, and a
disabled row's reference IS resolved and put in the child's environment. That stays. `REF_PATTERN` (`secretRef.ts:48`) stops at `}`, so
`creds://me/{name}/password` yields `creds://me/{name`, which `wellFormed` refuses (`:59`): **today a row holding the token holds no reference
at all** (measured). Three consequences, each a test: an enabled row's token is filled first, so the reference resolves (25); a disabled row is not
filled, so it is still no reference and cannot refuse the run through a failed lookup (28, 29); a disabled row with a plain reference is resolved as today (30).
The only other difference is that `parts.args` are normalized (blank rows dropped, values trimmed): `REF_PATTERN` stops at whitespace and order is kept, so it finds the same references with the same numbers.

### B.4 `src/runPlan.ts`

`:86` becomes `buildCommandLineWithRefs(parts: CommandParts, plan: RefPlan, platform: NodeJS.Platform, shellPath?: string)`. Import
`CommandParts` from `./commandLine` in place of `CommandArg` from `./types` (no other use). The body reads `parts.command.trim()`; the local
`parts` becomes `rest`, from `parts.args`, its filter unchanged. Disabled rows stay out of the line. `commandLine.ts` does not import `runPlan.ts`, so there is no cycle.

### B.5 `src/dependencyRun.ts`: how a template and a resolved line share `executableLine`

`executableLine` keeps its type and returns `shownCommandLine(node)`: the **resolved** line for a step that can run, the **template** for a refused
name, `undefined` only for "not a terminal" or "no command", exactly the two meanings its three readers have. A template therefore never reaches a
terminal, because each reader that could type one judges it first:

| Reader | What it does with a template |
|---|---|
| `visitNode` → `addStep` → `stepRefusal` (`:117`, `:147`) | refuses the whole chain; the pushed step is discarded with `ok: false` |
| an entry in `exclude` (`addStep`, `:135`) | not a step and not judged; its own road decides (launcher: §B.6; S3: a `not run` row) |
| `launcherLine` (`vpnLauncherRun.ts:62`) | §B.6 |
| `hasCommand` (`commandTargets.ts:120`) | a boolean only; the entry stays pickable (39) |

```ts
import { commandRefusal, shownCommandLine } from './commandLine';   // replaces buildCommandLine

// stepRefusal, last line (the {config} check stays first):
return nameStepRefusal(node) ?? walk.refusalOf(node.name, node.terminalOs);

/** A step whose `{name}` cannot be filled refuses the whole chain, with the reason. */
function nameStepRefusal(node: EntityMetadata): string | undefined {
  const reason = commandRefusal(node);
  return reason === undefined ? undefined : `"${node.name}" cannot run as a dependency: ${reason}`;
}

/**
 * The line a dependency runs, or `undefined` when it is not something that runs. `{name}` is resolved; a refused
 * name answers the TEMPLATE, never `undefined`, which means "an annotation", "no command" and "not pickable".
 */
export function executableLine(node: EntityMetadata): string | undefined {
  if (node.isTerminal !== true) {
    return undefined;
  }
  const line = shownCommandLine(node);
  return line.length > 0 ? line : undefined;
}
```

The module docblock's refusal bullet (`:20-22`) gains *"a step whose `{name}` cannot be filled"*.

### B.6 `src/vpnLauncherRun.ts`: `{config}` plus `{name}`

Only `launcherLine` (`:62`) and one new function; `launch` is S1's and stays. Composition needs nothing more: `executableLine` fills `{name}` and leaves
`{config}` literal, `confirmTrusted` fingerprints that string (one fingerprint across sessions, as the docblock at `:15-23` says), `usesConfig` reads it,
and `withConfig` fills `{config}` at the send. An accepted name holds no brace, so it cannot produce a `{config}`, and `{name}` runs first, so a config path holding `{name}` is never scanned.

```ts
import { commandRefusal } from './commandLine';

// launcherLine: the no-command branch stays; the other branch calls launcherRefusal instead of refusedHere
const why = line === undefined ? `The launcher "${launcher.name}" has no command — edit it and fill one in.` : launcherRefusal(launcher);

/** Its `{name}` first, then its OS: neither gets as far as the trust modal. */
function launcherRefusal(launcher: EntityMetadata): string | undefined {
  const reason = commandRefusal(launcher);
  return reason === undefined ? refusedHere(launcher) : `The launcher "${launcher.name}" will not start: ${reason}`;
}
```

The docblock's *"confirmed once per exact TEMPLATE"* gains *"with `{name}` already filled"*.

### B.7 The agent: `src/agentUseActions.ts` (`terminalRunAction`, `:186`), `src/agentShareSnippet.ts`

```ts
import { resolveCommand } from './commandLine';   // replaces buildCommandLine

// in run(), replacing :201-204. The OS check and the trust check stay after it, in that order:
const resolved = resolveCommand(entity);
if (resolved.kind === 'empty') {
  return fail('no_credential', `"${ctx.entityName}" has no command.`);
}
if (resolved.kind === 'refused') {
  return fail('not_supported', `"${ctx.entityName}" will not run: ${resolved.reason}`);
}
const { line } = resolved;
```

`run` carries `eslint-disable-next-line complexity` already; it stays. `isCommandTrusted(deps.trustStore, ctx.entityId, line)` now covers the resolved line, so a rename keeps an agent out until a person has run it (41).

- Summary (`:194`): `summarize: () => 'the stored command, as its Run button would type it',`.
- Docblock (`:181-184`): *"the stored line is human-authored shell syntax — pipes, chained commands — with `{name}` filled from an allow-listed name by `resolveCommand`, and is byte-for-byte what the human Run button hands to a shell. Nothing the agent sends contributes to it."*
- `agentShareSnippet.ts:151` (case `terminal`) becomes two lines, in the snippet's width:
  `'It runs as saved, {name} filled in from the entry\'s name — you cannot change',` and `'the line or pass arguments.',`.
- `:141` and `agentUseActions.ts:128` are the **script** roads and do not change: a script is run exactly as saved.

No test matches the old strings (`grep "as saved" src/test` has no such hit).

### B.8 Consent: `src/mcpCreate.ts`

`detailsFor` (`:286`) writes `name` and then spreads `values.details`, and `agentKindFields.ts` has no field `name`, so the requested name IS the stored
name (`mcpHooks.ts:71` and `:129` both use `request.name`, untrimmed). `values.details` holds no name, which is why the consent must be handed it.

```ts
import { commandRowLabel, shownCommandLine, willNotRunLines } from './commandLine';

// summarizeCreate:
const shown = WHAT_RUNS[kind as EntityKind]?.(values.details, request.name) ?? [];

// WHAT_RUNS: type (details: Partial<EntityMetadata>, name: string) => string[]
terminal: (details, name) => [
  `${commandRowLabel(details.terminalOs)}: ${shownCommandLine({ ...details, name })}`,
  ...willNotRunLines({ ...details, name }),
  ...(details.commandNote === undefined ? [] : [details.commandNote]),
],
```

### B.9 Viewer, Copy All, Show, Copy

`src/entityViewPage.ts` (794 lines, limit 800; this edit shrinks it to 791):

```ts
import { commandRefusal, commandRowLabel, normalizeArgs, shownCommandLine } from './commandLine';
// replacing the five lines of `row('Full command', …)` at :510-514:
row('Full command', 'fullCommand', d.isTerminal ? shownCommandLine(d) : undefined),
row('Will not run', 'commandRefusal', d.isTerminal ? commandRefusal(d) : undefined),
```

`row` prints nothing for `undefined`, and it escapes its value. Rows `:507` and `:509` stay raw.

`src/entityViewCopy.ts`: import `commandRefusal, normalizeArgs, shownCommandLine`; `:151` becomes
`case 'fullCommand': value = shownCommandLine(d); break;` plus `case 'commandRefusal': value = commandRefusal(d); break;`, because every viewer row has a Copy button that asks for its field. `:149` and `:201` stay raw.

`src/entityText.ts:37`: `describeCommand(details)`.

`src/entityViewerCommands.ts`, `revisionViewOptions` (`:346`). **Verified:** `:351` overlays `name: revision.name` for the page, while `:367`
hands the uncorrected `revision.details` to `formatEntityBlock`, so Copy All would read another name than the page. A share or a sync can make the two
differ (`revisionHistory.ts:64-66` keeps both). One overlay, once:

```ts
// The version's own name, once, so its page and its Copy All fill `{name}` alike.
const details = { ...revision.details, name: revision.name };
// …and :351 becomes `details,`
```

`sshLineFor`, `dbDisplay` and `mcpAsOfVersion` read other fields of `details`, so nothing else moves; Copy All's `Name:` line now agrees with the page. The live viewer's `details` (`:144`, used at `:147` and `:170`) is one object from its `ctx`: nothing to correct.

`src/commands/entityCommands.ts`, `registerCommandLines` (`:221`). Both handlers carry *"moved verbatim; split when next touched"*, and they are touched: split them and **delete both disables**, since `reportUnusedDisableDirectives` makes a stale one an error.

```ts
import { commandRefusal, shownCommandLine } from '../commandLine';   // replaces buildCommandLine at :8

register('credSshManager.copyCommand', async (target) => {
  vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
  const element = await nodeAt(asElement(target), storage);
  if (element?.kind === 'node') {
    await copyCommandLine(element.node);
  }
});

register('credSshManager.showCommand', async (target) => {
  vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
  const element = await nodeAt(asElement(target), storage);
  if (element?.kind === 'node') {
    await showCommandText(element.node);
  }
});

/** Copy Command: the resolved line; for a refused name the template, and it says so. */
async function copyCommandLine(node: TreeNode): Promise<void> {
  const entry = node.details ?? { name: node.name };
  const line = shownCommandLine(entry);
  if (line.length === 0) {
    void vscode.window.showWarningMessage(`"${node.name}" has no command yet.`);
    return;
  }
  const reason = commandRefusal(entry);
  // Not a secret, so it does not expire the way a password copy does.
  await vscode.env.clipboard.writeText(line);
  void (reason === undefined
    ? vscode.window.showInformationMessage(`Copied: ${line}`)
    : vscode.window.showWarningMessage(`Copied the template: "${node.name}" will not run: ${reason}`));
}

async function showCommandText(node: TreeNode): Promise<void> {
  const text = describeCommand(node.details ?? { name: node.name });
  const document = await vscode.workspace.openTextDocument({
    content: text.length > 0 ? text : 'This entry has no command yet.',
    language: 'shellscript',
  });
  await vscode.window.showTextDocument(document, { preview: true });
}
```

`TreeNode` is already imported (`:1`). The two functions sit above `registerCommandLines`.

### B.10 The form

`src/entityFormScript.ts` is **799 lines against the limit of 800**, so the preview moves out. `updatePreview` (`:219-229`) becomes one line, `${commandPreviewScript()}`,
in the same place and scope, plus an import under `jsonForScript`; in `wireArgs`, `wirePreviewName();` goes above `var command = document.getElementById('command');`. Net result 791 lines.

`src/commandPreviewScript.ts` (new, pure). **Function declarations only**: `renderArgs()` runs at `:297` during the page's first pass, and a `var` here would not have its value yet in other orders.

```ts
import { NAME_PATTERNS, NAME_REFUSAL } from './commandName';
import { jsonForScript } from './webviewHtml';

export function commandPreviewScript(): string {
  return `function previewNameAccepted(name) {
    return new RegExp(${jsonForScript(NAME_PATTERNS.shape)}, 'u').test(name)
      && !new RegExp(${jsonForScript(NAME_PATTERNS.ignorable)}, 'u').test(name)
      && name === name.normalize('NFC');
  }

  function resolvedPreview(template, name) {
    var token = new RegExp(${jsonForScript(NAME_PATTERNS.token)}, 'gu');
    if (template.search(token) === -1) { return { line: template, refusal: '' }; }
    if (!previewNameAccepted(name)) { return { line: template, refusal: ${jsonForScript(NAME_REFUSAL)} }; }
    return { line: template.replace(token, function () { return name; }), refusal: '' };
  }

  function updatePreview() {
    var base = (val('command') || '').trim();
    var parts = argRows
      .filter(function (r) { return r.disabled !== true; })
      .map(function (r) { return (r.value || '').trim(); })
      .filter(function (r) { return r.length > 0; });
    var template = base.length > 0 ? [base].concat(parts).join(' ') : '';
    var resolved = resolvedPreview(template, (val('name') || '').trim());
    var preview = document.getElementById('commandPreview');
    if (preview) { preview.value = resolved.line; }
    var note = document.getElementById('commandPreviewRefusal');
    if (note) {
      note.textContent = resolved.refusal === '' ? '' : 'Will not run: ' + resolved.refusal;
      note.hidden = resolved.refusal === '';
    }
  }

  function wirePreviewName() {
    var name = document.getElementById('name');
    if (name) { name.addEventListener('input', updatePreview); }
  }
`;
}
```

**The escaper path, checked.** `jsonForScript` (`webviewHtml.ts:162`) is `JSON.stringify` plus `<` → `<`. The token source therefore reaches the page as
`"(?<![$#%{])\\{name\\}(?!\\})"`, and evaluating that literal gives the source back exactly; the same holds for the `\p{…}` sources under the `u` flag (node, 2026-11-05).
The patterns are never retyped. A value written `{name}` in these template files does not interpolate; `${name}` would, so it appears nowhere. `scriptInterpolation.test.ts`
guards the `${JSON.stringify(` shape and `secondModeMarkup.test.ts` only its own module's strings, so test 58 copies that shape here, and 57 proves the round trip.
The refusal goes to `textContent`, never `innerHTML`. Trimming mirrors `str(data, 'name').trim()` (`entityFormPanel.ts:596`).

`src/entityFormPage.ts:613` (784 lines → 785):

```html
<p class="hint">This is exactly what runs. <code>{name}</code> in the command or an argument is this entry's Name, so a rename follows it.</p>
<p class="hint" id="commandPreviewRefusal" hidden></p>
```

The paste splitter and the `--help` probe need nothing: `parseCommandLine('tmux attach -t {name}')` gives command `tmux attach`, row `-t {name}`, and `{na''me}` stays one row (run on 2026-11-05).

### B.11 Limits, and how the code stays inside them

| Limit | Status |
|---|---|
| eslint `complexity` 4 (`eslint.config.mjs`; counts `if`, `?:`, `&&`, `\|\|`, `??`, `?.`, each `case`) | Every new function ≤ 4, measured by eslint on the prototype. `resolveCommand` is exactly 4, which is why `templateOf` exists: inlining its `??` makes 5. `launcherLine` stays 3 through `launcherRefusal`; `copyCommandLine` is 4. |
| `max-lines-per-function` 50 (120 in `src/test`) | The longest new production function is `commandPreviewScript`, one template of about 35 lines |
| `max-lines` 800 | `entityFormScript.ts` 799 → 791, `entityViewPage.ts` 794 → 791, `entityFormPage.ts` 784 → 785. `commandLine.ts` about 155, `commandName.ts` about 60 |
| Size ratchet (`.size-baseline.json`, `scripts/size-ratchet.mjs`) | The baseline names only `src/extension.ts` and `src/storageManager.ts`, and S2 touches neither |
| CLAUDE.md rule 3 | `commandName.ts`, `commandLine.ts`, `commandPreviewScript.ts` import no `vscode`. So do `dependencyRun.ts`, `runPlan.ts`, `mcpCreate.ts`, `entityText.ts`, `entityViewCopy.ts`, `commandTargets.ts` (checked), and they stay so |
| Immutability | `readonly` fields, `Object.freeze` on `NAME_PATTERNS`; `readyCommand` builds new objects and returns a disabled row as it is; no argument is mutated (18). `commandTrust.ts` is not edited |
| Typescript doctrine | §1: `jsonForScript`, never `JSON.stringify`, in the fragment. §2: no backtick inside the fragment, comments included. §3: no new `as` fixture where a factory exists; the two `as never` below carry their reason. §4: read a clean `tsc` before any suite number |

`src/commandTrust.ts` has one NUL byte, at `:39`, in the separator `.update('\0')` written as a raw byte, which is why `file` calls it `data` and why grep needs `-a`. Verified, and a further reason to leave it alone.

### B.12 The scan's two lists, and the test-leftovers decision

Enumerated across lines at `6754881`, from `src_vs_code`, with:

```bash
perl -0777 -ne 'while(/\bbuildCommandLine\s*\(/g){$p=$`;$l=($p=~tr/\n//)+1;print "$ARGV:$l\n"}' $(git ls-files 'src/*.ts' | grep -v '^src/test/')
perl -0777 -ne 'while(/\.\s*commandArgs\b/g){$p=$`;$l=($p=~tr/\n//)+1;print "$ARGV:$l\n"}' $(git ls-files 'src/*.ts' | grep -v '^src/test/')
```

`buildCommandLine(`: `agentUseActions.ts:201`, `commandLine.ts:46, 72`, `commands/entityCommands.ts:232`, `commands/runCommands.ts:66`, `dependencyRun.ts:159`,
`entityViewCopy.ts:151`, `entityViewPage.ts:513`, `mcpCreate.ts:351`. After S2, on the prototype: only `commandLine.ts` (three sites), no import elsewhere. `commandParse.ts:11` and
`runPlan.ts:83` name it in comments without `(`, and `buildCommandLineWithRefs(` does not match `\b…\s*\(`.

`.commandArgs`, 17 matches:

| Site | After S2 |
|---|---|
| `agentUseActions.ts:201`, `commands/entityCommands.ts:232, 250`, `commands/runCommands.ts:66, 328, 368`, `dependencyRun.ts:159`, `entityText.ts:37`, `entityViewCopy.ts:151`, `entityViewPage.ts:513`, `mcpCreate.ts:351` | gone, each through `resolveCommand` or a function over it |
| `entityFormPanel.ts:79` | allowed |
| `entityFormScript.ts:72` | allowed |
| `entityViewCopy.ts:201` | allowed |
| `entityViewPage.ts:509` | allowed |
| `typeGuards.ts:333` (two on one line) | allowed |

Other spellings: destructuring finds nothing; the index form finds `entityShape.ts:51`, a type. `agentFieldValidation.ts:245` writes through `field.key`; it reads nothing.
Local `commandArgs` variables at `entityFormPanel.ts:571, 673` and the object key at `entityFormScript.ts:698` are not reads of a stored row, and no pattern matches them.

```ts
/** Keyed by file, valued by the exact trimmed line: moving a line cannot widen the exemption. */
const ALLOWED_READS: Record<string, { line: string; because: string }[]> = {
  'entityFormPanel.ts': [{ line: 'const raw = data.commandArgs;', because: "the webview's POST, not a stored line" }],
  'entityFormScript.ts': [{ line: 'args: rowsJson(d?.commandArgs),', because: 'the rows the form edits: stored text' }],
  'entityShape.ts': [{ line: "export type TerminalShape = EntityBase & { kind: 'terminal'; command?: string; commandArgs?: EntityMetadata['commandArgs']; commandNote?: string };", because: 'a type, not a read' }],
  'entityViewCopy.ts': [{ line: 'value = normalizeArgs(d.commandArgs)[Number(arg[1])]?.value;', because: 'Copy of one stored row, the parent table\'s raw row' }],
  'entityViewPage.ts': [{ line: '...(d.isTerminal ? normalizeArgs(d.commandArgs).map((a, i) => argRow(a, i)) : []),', because: 'the stored rows, the parent table\'s raw row' }],
  'typeGuards.ts': [{ line: '(v.commandArgs === undefined || isCommandArgArray(v.commandArgs)) &&', because: 'the validator at the door' }],
};
```

**Test leftovers: what to use now.** `common/test-leftovers.md` wants one helper; none exists on this branch. PR #294 adds one (`scripts/lib/leftovers.cjs`, `ownedDir(scope, what)`), draft and not merged, with conditions only the owner's machines can close; the
rule's barrier also forbids emitting the owner form while an owner-blind sweeper may be enabled. So S2 follows the only form on this branch (`sshAgentServer.test.ts:71`, `sshAgentWorld.ts:419`), one function in the one test file that makes a folder:

```ts
/** Until the leftovers wrapper lands (PR #294): the prefix its sweep knows, removed by this test on every exit path. */
function shellDir(t: TestContext): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'testsToDelete-shell-'));
  t.after(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      // Left under its prefix for the sweep; a teardown never fails a test.
    }
  });
  return dir;
}
```

At the start of the story run `test -f src_vs_code/scripts/lib/leftovers.cjs`. If #294 has reached this branch, use `ownedDir(t, 'shell')` from `'../../scripts/lib/leftovers.cjs'` instead and drop this function.

### B.13 Test worlds (additive; every S1 test keeps its meaning)

`src/test/arrowWorld.ts`:

- `run(entry, nodeName = entry.name)`: `nodeName` goes on the node and the target; `details` stays `entry`.
- `runWithSecrets(entry)`: the same, invoking `credSshManager.runWithSecrets`.
- `trust`: the `memoryTrust()` store, so a test can call `isCommandTrusted`.
- `masked: { commandLine: string; env: Record<string, string> }[]`, filled by a new mock in the `loadWithVscode` call: `'../maskedTerminal': { runInMaskedTerminal: (o) => void masked.push(o) }` (the request string `runCommands.ts:14` writes).
- A third parameter `refSource: unknown = {}`, passed to the host.

`src/test/vpnWorld.ts`: `StartOptions.trust?: ReturnType<typeof memoryTrust>`, and `startVpn` passes `o.trust ?? memoryTrust()` where it passes `memoryTrust()` today (`:303`).

`maskingBanner` is mocked already. `env.shell` in the world is `undefined`, so the shell read comes from the platform; test 25 reads it back through `shellRead`.

`src/test/commandLineHandlers.test.ts` (new), as the probe of 2026-11-05 ran against the compiled main checkout. It loaded and drove both handlers:

```ts
const stub = {
  window: { showWarningMessage: (m: string) => (warnings.push(m), Promise.resolve(undefined)), showInformationMessage: (m: string) => (infos.push(m), Promise.resolve(undefined)), showTextDocument: () => Promise.resolve(undefined) },
  env: { clipboard: { writeText: (t: string) => (copied.push(t), Promise.resolve()) } },
  workspace: { openTextDocument: (o: { content: string }) => (documents.push(o.content), Promise.resolve({})) },
};
const mod = loadWithVscode<typeof import('../commands/entityCommands')>('../commands/entityCommands', stub, { '../extension': { maskingBanner: () => '' } });
// `registerEntityCommands` reads a dozen host keys; only `register`, `storage` and `vaultKeys` matter to these two
// handlers, so the rest answer a no-op through a Proxy.
mod.registerEntityCommands(new Proxy({ register, storage, vaultKeys: { noteUserActivity: () => undefined } }, { get: (t, k) => (k in t ? t[k as keyof typeof t] : () => undefined) }) as never);
```

`storage.getNode` returns the node; the target is `{ kind: 'node', accountId: 'a1', node }`.

`src/test/commandTargetsLauncher.test.ts` (new, or beside any existing suite you find): `commandTargets.ts` imports no `vscode`; the storage is `{ getNodes: () => [node] } as never`, with that reason, because `collectLauncherCandidates` reads only `getNodes`.

### B.14 Existing tests that a signature breaks: exactly five sites, measured by `tsc`

- `src/test/commandLine.test.ts:88-95`: `describeCommand({ name: 'x', command: 'aws sso login', commandArgs: [ … ], commandNote: 'Refresh the AWS session before running terraform.' })`.
- `src/test/commandLine.test.ts:105`: `describeCommand({ name: 'x', command: 'ls -la', commandArgs: [] })`.
- `src/test/runPlan.test.ts:36`: `buildCommandLineWithRefs({ command: 'psql', args: [{ value: REF }] }, plan, 'linux', '/bin/bash')`.
- `src/test/runPlan.test.ts:43-49`: `{ command: 'aws', args: [{ value: '--debug', disabled: true }, { value: REF }] }`, then `plan, 'linux', '/bin/bash'`.
- `src/test/runPlan.test.ts:54`: `{ command: '   ', args: [{ value: REF }] }`, then `planRefs([REF]), 'linux'`.

Their assertions do not change. `buildCommandLine`'s own tests are untouched, which is why it stays.

On the prototype, with these sites still unedited, `entityFormScript`, `webviewHtml`, `entityViewPage`, `mcpCreate`, `dependencyRun`, `dependencyChain`, `agentUseActions`, `scriptInterpolation`, `entityText`, `sshRowsByKind`, `vpnLauncher`, `vpnGoneRequest`, `revisionViewer`, `agentShareSnippet` and `entityFormPage` were all green, unchanged. No fixture in `src/test` writes a terminal entry with a literal `{name}`.

### B.15 Documents this story carries

`research/module_extension.md`, section *Terminal commands* (`:2061`):

- First paragraph: `commandLine.ts` "holds the whole of the logic" gains `resolveCommand` and `shownCommandLine`; name pure `commandName.ts`.
- After S1's `**A terminal that may be busy …**` paragraph, a new paragraph `**`{name}`: one road, refused rather than quoted.**`: the syntax and why not `${name}`; the token regex and the allow-list with the reason (a name arrives unvalidated by share and sync); why refused and not quoted; the name is `details.name` and a revision's page and Copy All overlay that version's; the road table of parent §1 with `resolveCommand` at the top, as it now stands; `executableLine` returns the template and why; disabled rows are neither judged nor filled, and still scanned for references; `{config}` stays literal in a launcher's fingerprint; a rename asks again, for a person and for an agent; the literal form, with what was measured in bash and `cmd.exe`, and that PowerShell was not measured. The tmux suggestions belong to S4's help, not here.
- Do not repeat S1's paragraph.

`research/module_tests.md`, a new section after `## The green arrow never types into a busy terminal` (`:1107`), in its shape: a sentence on the worlds, the command, a `| Flow | Test | What it holds down |` table with one row per road of parent §1, the scan (with its companion), the real-shell test (with its control) and the typed fixture. Then **Not covered by a scenario harness, and why**: driving a real terminal stays not covered, for the reason the file gives; the real-shell test exercises bash directly, not through a terminal; `pwsh` and `cmd` skip where absent; `zsh`, `fish` and `LC_ALL=C` are the parent's hand checks 6 and 7.

Do not touch `README.md`, `CHANGELOG.md` or the help (S4).

## C. Commands

```bash
cd src_vs_code
npm ci                                   # only if node_modules is missing
npm run typecheck && npm run lint
npm test                                 # compiles, then node:test over out/test/*.test.js, lowered, at most 8 workers
# one suite, after npm run compile:
node --import ./scripts/lower-priority.mjs --test out/test/commandName.test.js out/test/resolveCommand.test.js
node --import ./scripts/lower-priority.mjs --test out/test/commandNameRoads.test.js out/test/commandNameShell.test.js out/test/commandRoadScan.test.js
cd .. && node .claude/rules/shared/tools/plan-lifecycle.mjs
```

Read the exit of a clean `tsc` before any suite number (doctrine §4). Do not commit or push: the caller does, one commit per story.

**Order.** Write A.1 and A.2 against empty stubs and see them red; add `commandName.ts` and `commandLine.ts`. Then write rows 19, 20 and 60 **against today's roads** and copy the failures into your summary: row 19 fails because `tmux attach -t {name}` is typed literally, row 20 because the modal appears and the literal is typed, row 60 by listing the seven call sites outside `commandLine.ts`. Then the roads, one at a time, each with its tests.

**Red again, each applied alone, watched and restored, the result in the summary:**

- M1: `executableLine` returns `undefined` when `commandRefusal(node)` is set. Expected red: 36, 37, 39; 34, where the step silently stops being a step and the VPN starts; 35, where the launcher is told it has no command.
- M2: `usesNameToken` uses `NAME_TOKEN.test(text)`. Expected red: at least 4.
- M3: `readyCommand` fills disabled rows too. Expected red: 13 and 28. Expected still green: 29, because a name with a space breaks the reference at the space (`REF_PATTERN`), so say so.
- M4: `revisionViewOptions` keeps `revision.details` for Copy All. Expected red: 51.

**Done when** (parent's S2): every row of §1's road table has a test above; a refused name is typed nowhere and never shown as resolved; `git diff --stat` shows no `commandTrust.ts`; row 66 created its file in a run you report; row 64 passed; typecheck, lint and the whole suite green; both documents updated.

## D. Out of scope: do not touch

- `src/commandTrust.ts`, `src/terminalGuard.ts`, `src/terminalActivity*.ts`, `src/pinnedTerminal.ts`, `launch` in `vpnLauncherRun.ts`, `src/dependencyRunHost.ts`.
- `{name}` in a script body or a script variable: the plan covers a command and its arguments only (`runScript`, `scriptJob` unchanged).
- Any other token, a folder-level template (decision D), quoting a name (rejected), validating a name at save, share or sync: a name is judged where it would be substituted, nowhere else.
- `folderRun.ts`, `runFolder`, `:runall`, the menus (S3, S4); help in five languages, README, CHANGELOG, the tmux suggestions, the todos of §Not in this plan (S4).
- The agent's field help in `agentKindFields.ts`, and `mcpEntries.ts:180` and `treeSearch.ts:44`, which show stored text by the plan's table.
- The literal `{config}` the green arrow types (`runCommands.ts`, a recorded todo); `sendPinned`; `fresh` disposing by name; `quoteFor` and typographic quotes.
- A helper of your own for test leftovers, or any part of PR #294.
- New requirements. A defect you find in the plan is reported in your summary, not fixed here: the plan's change budget is spent.
