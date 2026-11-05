# PLAN — Run a whole terminal folder, and `{name}` in a terminal command

> Status: **epoch 2 approved 2026-11-05 after a re-review, document round `proceed` (2 of 4 reviewers answered, both codex); all stories built, in review.** Scope: the VS Code
> extension (`src_vs_code`): the terminal-entry run roads, the folder row's menu, the viewer and form, help in five
> languages. No server, no contract, no change to stored data.

## Plan changes

> Epoch 1 · approved 2026-11-05 · by reviewers · state: closed

- 1.1 · 2026-11-05 · owner · stories, build-order — the gate's operator commands: split into stories by Fable, one gate run over one commit
- 1.2 · 2026-11-05 · reviewer · approach — the reducer table of §2 changed: a start while running poisons, and our own send over a running command poisons
  (Spec decision D1, then S1 review finding 3; both accepted. This second change stopped the plan.)
- 1.3 · 2026-11-05 · agent · approach, stories — names and lines in the folder modal and report are escaped for display, against the S3 brief's out-of-scope line
  (Includes the chain modal's folder wording, which needed a change to a file the same brief kept out of scope.)

### Re-review for epoch 2

Narrowed: no — nothing left the scope or the Definition of Done; story S5 and tighter claims came in

| Work | Where | Verdict | Action |
|---|---|---|---|
| Plan draft, 74f5b26 | pushed, unmerged | fits | kept; its "safe under every answer" corrected in this revision |
| Approval, stories, S1 spec, f8bae4a | pushed, unmerged | fits | kept; the spec's overclaim and its `running + sent` cell overridden by §2 here |
| S1 guard, tracker, find/open split, 6754881 | pushed, unmerged | cut | fix forward in S5: `finished` only after our own send; a start and end alone read `finished` after a reload, against decision B |
| S1 review fixes, 8d4a10e | pushed, unmerged | fits | kept |
| S2 brief and literal form, 8c0c522 | pushed, unmerged | fits | kept; its plan edit (`{ name }` to `{na''me}`) had no entry, named here |
| S2 `{name}` roads, e766507 | pushed, unmerged | fits | kept |
| S2 review fixes, d80bbd3 | pushed, unmerged | fits | kept |
| S3 brief, c11e236 | pushed, unmerged | fits | kept; its out-of-scope line was overridden by bf366fb, entry 1.3 |
| S3 folder run, bf366fb | pushed, unmerged | fits | kept with the additions of entry 1.3; S5 fixes the report and the rows |
| S4 brief, 7837b27 | pushed, unmerged | fits | kept; nothing built, halted until re-approval |
| Stop record, e828538 | pushed, unmerged | fits | kept |

  (The stop came late, and this record says so. Entry 1.2 was accepted in 8d4a10e and its first half in f8bae4a, while the
  stop was written in e828538, so e766507, d80bbd3 and bf366fb were built past it. An Opus judge found their content fits.
  The consultant, codex-2 gpt-6-astra, advised deferring the closing button; rejected on the quoted documentation. Its
  points on the narrower guarantee and on modal visibility were taken: see §2 and §3.)

> Epoch 2 · approved 2026-11-05 · by reviewers · state: open

- 2.1 · 2026-11-05 · agent · approach — the real-shell test's folder uses the inline testsToDelete- form, since the helper §Test plan named does not exist on this branch
  (PR 294 brings the helper; the follow-ups file holds the reconciliation.)

## Goal

The owner keeps Claude running for days inside `tmux` on a Linux VM, reached through a VS Code Remote-SSH
window. Each session is a Terminal entry: name `billing-api-design`, command `tmux attach`, argument
`-t billing-api-design`. Entries sit in terminal-typed folders (`claude sessions` holds `orders-mockups` and
`admin-panel-mockups`). Every morning, after the session restarts, the owner clicks each green arrow.

Two costs, in their words:

1. A folder has no Run arrow, so a morning takes one click per session.
2. The commands differ only by the name, and the name is typed twice: in the entry's Name and in its argument.

Done means: one arrow on the folder brings its sessions back, `tmux attach -t {name}` needs the name once, and a
line is typed into an existing terminal only when the extension itself saw the last command there finish, or a
person said so. §2 states how far that evidence reaches and what is not measured.

## The owner's decisions, 2026-11-05

| # | Question | Decision |
|---|---|---|
| A | Subfolders | A folder run covers only the folder's DIRECT entries. |
| B | An entry's terminal is already open | The folder run does not type into it and names it. The single arrow is fixed too: it types only when the previous command there is known to have finished; otherwise it shows the terminal and asks. |
| C | Confirmation | The folder run ALWAYS shows a modal listing its lines. |
| D | Breadth | `{name}` only. A folder-level command template is a later todo, not this plan. |

## What the code does today (verified)

- The green arrow is `credSshManager.runCommand` (`src/commands/runCommands.ts:104-117`). Its line is
  `buildCommandLine` (`src/commandLine.ts:46-55`): the base and enabled arguments joined by spaces, no
  quoting. `typeIntoEntryTerminal` (`runCommands.ts:124-131`) sends it with `sendText(line, true)`.
- **The hazard.** `defaultProfileTerminal` (`src/pinnedTerminal.ts:127-131`) finds a terminal by name and
  reuses it; `sendText` then types into whatever runs there. With a tmux client attached, the line
  `tmux attach -t x` reaches Claude as a message. The VPN launcher is a second road to the same typing
  (`src/vpnLauncherRun.ts:103-110`, through `entryTerminal`).
- **The only ordered runner does not fit.** The dependency chain (`src/dependencyRunHost.ts:162-174`) uses
  one terminal and waits for each exit. `tmux attach` does not exit, so the chain would stop at its first
  step and type the second line into tmux.
- Entries in a folder sort alphabetically (`siblingOrder`, `src/stateKeys.ts:34-46`); there is no manual order.
- A folder's row carries `folder[:trashed][:asksforpin][:locked]` (`src/treeRowText.ts:93-110`) and no folder
  type. Six menu clauses match the plain row exactly: `package.json:1339, 1344, 1349, 1534, 1539, 1544`.
- The only terminal placeholder is `{config}` (`src/vpnLauncher.ts:16-30`), filled by a VPN's launcher, refused
  as a plain dependency (`src/dependencyRun.ts:147-150`).
- Entry names are not validated on any road: form, share (`src/shareImport.ts:250`), sync, import. Agents have a
  200-character cap only (`src/mcpCreate.ts:161-170`). `node.name` and `details.name` are written equal by
  edit, clone and restore, but a share carries both as sent.
- The trust record is entity id plus exact line (`src/commandTrust.ts`).

Measured here, 2026-11-05, on tmux in this WSL distro:

- `tmux attach -t '{name}'` answers `can't find session: {name}` and exits 1. That is what an old extension's
  literal does in bash; PowerShell and other shells were not measured.
- `tmux has-session -t foo` succeeds when only `foobar` exists: tmux matches by prefix. `-t =foo` refuses it.
- `tmux new -d -s a.b:c` creates `a_b_c`: tmux rewrites `.` and `:`.
- tmux 3.6 does not pass a shell's OSC 633 outward. VS Code's own `shellIntegration-bash.sh` under a pty: 10 sequences
  with no tmux, 0 through tmux, and 0 with `allow-passthrough on`. So a shell inside tmux cannot produce the events this
  plan counts. Measured on this distro, not through Remote-SSH.

Read from `@types/vscode` 1.93.0, the version the extension targets (`engines.vscode ^1.93.0`):

- `TerminalShellIntegration` offers only `cwd` and `executeCommand`; there is no query for a running command.
- `onDidStartTerminalShellExecution` and `onDidEndTerminalShellExecution` are the only signals, and only with
  integration.
- An end with `exitCode === undefined` can mean a sub-shell started first (`index.d.ts:7723-7725`). It is not
  "finished".

VS Code's documentation (`docs/terminal/advanced`, read 2026-11-05): on a window reload terminals *reconnect to the
previous process and restore its content*; on restarting VS Code *a terminal's content is restored and the process is
relaunched using its original environment*. So both cases are real: after a reload a tmux client is still attached and
nothing may be typed; after a restart the terminal sits at a fresh shell with no tmux, and a run that only skips open
terminals would skip every session. The page does not cover a dropped remote connection.

**Not determined, and not testable here:** a revived terminal's name and integration in `window.terminals`, whether
old sequences replay as events, whether events reach this `ui`-side extension from a remote pty, how a native dialog
shows a long text. A real VS Code could not be started here: no `libnss3`, no Xvfb. §2 and §3 say what each unknown
could cost; §Hand checks measures them.

## Design

### 1. `{name}`: one road, refused rather than quoted

**Syntax `{name}`**, the sibling of `{config}`. Not `${name}`: that is live shell syntax today and is
interpolated by the template literals the form is built from. There is no new metadata field, so nothing changes
in guards, sync or share, and an old device's edit cannot drop a flag. An old extension types the literal.

**Matching.** `{name}` is a substring of `${name}`, `{{name}}`, `#{name}` and `%{name}`, so the token is
`/(?<![$#%{])\{name\}(?!\})/gu`, never `split().join()`. A replacement function is used, so `$&` means nothing.

**Which names may be substituted.** An allow-list, and every other name is REFUSED, never quoted:

```
^(?:\p{L}\p{M}*|\p{Nd}|_)(?:\p{L}\p{M}*|\p{Nd}|[._-])*$   flag u
and no \p{Default_Ignorable_Code_Point}, and name === name.normalize('NFC')
```

A name arrives unvalidated by share and sync, so `x; curl …|sh` must not become syntax. Quoting was rejected
because `quoteFor` (`src/hostShell.ts:117-125`) has no literal form for cmd.exe and depends on the reader shell,
which displays do not have. Refusal gives one string on every road, the precedent being `isValidAlias`
(`src/cliAliases.ts:43-45`). Checked with node on 28 names: all six session names from the owner's tree pass,
and `-x`, `.x`, `..`, `a b`, `a;b`, `$(x)`, a backtick, a newline, U+2019, U+2013, U+3164, U+034F, U+FE0F, U+202E,
`~`, `a/b`, `a:b` and an NFD name are refused. A name with a space is refused too; this is a stated limit. The
refusal says why, and how to keep a literal in bash: `{na''me}` (measured: bash prints `{name}`, and the token does not
match; `{ name }` prints three words).

**The name is `details.name`.** It is the only name every road holds: `executableLine` and `entityText` have no
node. A revision's page overlays it, so it shows that version's name. Divergence from `node.name` comes only by a hostile share or
sync; the value is still allow-listed and the resolved line is what the modal shows.

**The road.** New pure `src/commandName.ts` (`usesNameToken`, `nameRefusal`, `substituteName`), and in
`src/commandLine.ts`:

```ts
type ResolvedCommand =
  | { kind: 'empty' }
  | { kind: 'ready'; line: string; parts: { command: string; args: CommandArg[] } }
  | { kind: 'refused'; template: string; reason: string };
resolveCommand(entry: Pick<EntityMetadata, 'name' | 'command' | 'commandArgs'>): ResolvedCommand
shownCommandLine(entry): string   // the resolved line, else the template; never a refused name
```

`line` exists only after narrowing, so skipping a refusal does not compile. `buildCommandLine` stays as the raw
join, and a scan test allows it only in `commandLine.ts` (with a companion assertion that the scan matches
something). Only enabled parts are judged: a disabled row cannot refuse a run.

| Road | With a refused name |
|---|---|
| Green arrow `commandLineOf` (`runCommands.ts:62-64`) | warns, no trust modal, nothing typed |
| Run with Secrets (`runCommands.ts:326-328, 364-367`, `runPlan.ts:86`) | warns, nothing runs. Resolve BEFORE scanning references; `buildCommandLineWithRefs` takes `parts` |
| `executableLine` (`dependencyRun.ts:155-161`) | returns the template, NOT `undefined`: `undefined` means "an annotation" (`:118-121`), "no command" (`vpnLauncherRun.ts:61`) and "not pickable" (`commandTargets.ts:120`). `stepRefusal` (`:147`) then refuses the whole chain |
| VPN launcher `launcherLine` (`vpnLauncherRun.ts:59`) | warns, no start. `{config}` stays literal in its fingerprint, as today |
| Agent run (`agentUseActions.ts:201`) | `fail('not_supported', reason)` before the trust check. The docblock at `:181-184` and the summary at `:194` stop saying "exactly as saved" |
| Viewer Full command (`entityViewPage.ts:510-514`), Show Command (`entityCommands.ts:250`), Copy All (`entityText.ts:37`), consent (`mcpCreate.ts:351`, with the requested name) | show the template plus "will not run: <reason>" |
| Copy (`entityViewCopy.ts:151`, `entityCommands.ts:232`) | copies the template; `:232` also warns |
| Form preview (`entityFormScript.ts:219-229`) | substitutes the live Name field, else the template plus the reason; the patterns come from `commandName.ts` through the repository's script escaper, never retyped |
| Raw stored text: command and argument rows (`entityViewPage.ts:507-509`, `entityViewCopy.ts:149, 201`), `mcpEntries.ts:180`, `treeSearch.ts:44` | unchanged: they show what is stored |

**Trust covers the resolved line**, so a rename arriving by sync asks again; `commandTrust.ts` does not change.
An existing entry holding a literal `{name}` changes meaning on upgrade and is asked about once, because its
line changed. The same fingerprint keeps an agent from running a renamed entry until a person has.

The paste splitter already handles it: `tmux attach -t {name}` splits into command `tmux attach` and row
`-t {name}` (`commandParse.ts:97-102`). The `--help` probe never reads argument rows (`entityFormPanel.ts:140-147`).

### 2. A terminal that may be busy

New pure `src/terminalActivity.ts`, reducer `nextActivity(state, event)` and reader
`readActivity(state): 'finished' | 'running' | 'unknown'`. **`finished` needs our own send first:** a start and end seen
on a terminal the extension has not typed into this activation say nothing, because after a reload they could be a
replay or a shell inside tmux while the attached client still runs.

| State | start(e) | end(c), numeric | end(c), undefined | any other end | our own send | reads |
|---|---|---|---|---|---|---|
| `unknown` (nothing recorded) | stays | stays | stays | stays | `armed` | unknown |
| `armed` (we typed; no start yet) | `running(e)` | stays | stays | stays | `armed` | unknown |
| `running(c)` | `poisoned` | `finished` | `poisoned` | stays | `poisoned` | running |
| `finished` | `running(e)` | stays | stays | stays | `armed` | finished |
| `poisoned` | stays | stays | stays | stays | stays | unknown |

`poisoned` is for that terminal's life. A start while running is the sub-shell signature; our own send over a running
command cannot erase what ran.

New host `src/terminalActivityTracker.ts`: a `WeakMap<Terminal, state>` (no close listener, cannot grow),
registered through `registerRunCommands` so `extension.ts` does not grow against its ratchet.
`executeCommand` may send Ctrl-C (`index.d.ts:7457`), so reuse keeps `sendText`.

**The guard.** `entryTerminal` splits into a find and a create. Green arrow, after the gates:

- no live terminal → open one and type;
- `finished`, and no question open for that terminal → `show()` and type, as today;
- anything else → `show()` and a MODAL, `Type It Anyway` / Cancel; on `Type It Anyway` re-read `exitStatus` and send to
  that same terminal object, or nothing if it closed.

Read and `sendText` are synchronous after the last await; a `WeakSet` of terminals with a question open stops a second
invocation, even if the command ends behind the modal. The VPN launcher takes the same guard; an agent-served start
(`startGate` set) refuses instead of asking.

Accepted regression, and the reason the tracker exists at all: without it every re-run asks. With shell integration, a
terminal the extension typed into repeats `aws sso login` silently as today. After a reload the first click asks, and
silence returns once a person's `Type It Anyway` has been followed by a seen start and end. Without integration (cmd,
the setting off) every click asks. If events do not reach this extension over Remote-SSH, every click asks: safe, and
the tracker then buys nothing.

**What this does not close.** The reducer believes the first start after our send, so it can be a command that is not
ours: a person's Enter just before the click, or a line typed ahead; that reads `finished` between its end and our line's
start, and a second click in that gap would type. After `Type It Anyway` on a terminal in `unknown`, the state is `armed`; a start and end
reaching the extension from a shell inside tmux would read `finished`. tmux 3.6 passes none outward (measured, not
through Remote-SSH, not on an older tmux). And a person pressing Enter on `tmux attach` and clicking before the start
event arrives is typed over: no code can close that.

### 3. The folder run

Pure `src/folderRun.ts`, host `src/commands/folderRunCommand.ts` registered from `registerRunCommands`.

**Plan.** `planFolderRun` walks `storage.getChildren` in display order, direct children only, and sorts each entry
into one row, first match wins:

| Row | When |
|---|---|
| not run | not a Terminal entry; no command; a refused name; a name holding a control character (it cannot be shown or matched reliably; VS Code strips `\n\r\t` from the drawn label, 1.93.0 source); uses `{config}`; `entryShell` refuses its OS; two direct entries share a name (all of them: they would share one terminal, and which is "first" is a sort tie) |
| open | a live terminal of its name exists, any shell (`some`, not the pinned road's same-shell test: `pinnedTerminal.ts:104`) |
| run | otherwise |

More than 32 `run` plus `open` rows, or a modal text over 4,000 characters, refuses the run, naming the count: the modal
must show every line. Both numbers are chosen, not measured; from memory a native dialog does not scroll (hand check 8).
Every name, line and reason in the modal and the report goes through one display escaper (`escapeControl`, widened to C1
and bidi controls), so a name holding a newline cannot draw a row; what is typed stays the approved string. The chain's
modal (`describeRunPlan`) takes the same escaper on every road.

**Flow.**

1. Re-read the target in the handler: a folder, `folderType === 'terminal'`, not in the Trash; otherwise warn.
   F2 and the palette reach handlers without a menu, and a palette call arrives with no target.
2. Plan. No run and no open rows: report, no modal.
3. **The modal, always.** Every line in order with `(new)` on untrusted ones, the open and not-run rows with
   reasons, what happens to subfolders, and that the lines do not wait for each other. Buttons: `Run` (leaves open
   terminals alone) and, when any are open, `Close Open Terminals and Run`; with only open rows, only the second. Its
   text says that closing ends what runs there, and that a tmux client only detaches. It authorises closing the
   terminal OBJECTS seen when the modal was built, never names; a same-named one opened while it sat stays open. Under
   this button the `open` rows' lines are typed too: steps 4, 5 and 7 treat them as `run` rows, in the same order, so
   each closed terminal is replaced by a new one running its line.
4. Trust each typed line.
5. Dependencies: `runDependenciesFirst(dependencyRequest(storage, accountId, runDetails, folderName, trust, allDirectIds))`.
   Roots are only the lines to be typed, or a skipped entry would re-run its dependencies every morning; `exclude`
   is every direct entry. Not `ready` means nothing is typed. Its own modal appears only for untrusted steps. The
   folder modal states that a sibling named in *Depends on* is not awaited. A dependency that never exits holds
   the run with no terminal opened; that exists today and is named in the help.
6. Re-check open terminals, because a modal can sit for hours. One opened meanwhile becomes `open` and is left alone,
   and that row's authorised terminals are not closed either, since no line would replace them. Closing happens here,
   after the chain is ready, so a declined or refused chain closes nothing.
7. For each line, inside its own `try/catch`: open a NEW terminal, never by `find` (a disposed terminal may still be
   listed; `dispose` is not synchronous with the list), `sendText` the approved string, note `sent` to the tracker.
   A failure is recorded and the rest go on. No rollback.
8. Report, with what must not be lost first, since a notification is cut at about 1,000 characters (VS Code source, not
   measured here): `Typed 3 of 5 in "claude sessions". Not run: e — reason. Left alone, terminal already open: d. Typed:
   a, b, c.` **"Typed", not "started"**: exits are not observed. An `open` row whose terminal closed while the modal sat
   is `not run`, saying so, never "already open". A terminal closed for a line that then failed to open says that it
   was closed. A chain that did not end ready says nothing was typed and no entry's terminal was closed (the chain
   disposes its own earlier terminal).

**Finding that shapes this: decision B can empty the morning.** Terminals persist by default (`isTransient` is the
opt-out, `index.d.ts:12137-12140`). If VS Code revives each terminal after a restart at an idle shell, with its old
name and no tmux attached, a skip-if-open run skips every entry and the owner is worse off than today.

The documentation quoted above says a restart relaunches the process, which is that case; what `window.terminals` then
shows is hand check 1. The second button brings all of them back with one more click in the same modal, and a consultant's
advice to defer it until measured was rejected on that quote. `isTransient` on folder-run terminals was rejected: it would
end any process in them on every reload, for every user.

**One name for the title.** The arrow titles its terminal from `details.name`, as the folder run does (it used
`node.name`), so the two roads find each other's terminals after a share that split the names.

**The menu.** Token `:runall`, last in `folderContextValue`, set when `folderType === 'terminal'` and not trashed.
It contains no `:cmd`, so no entry clause matches. Clauses `:1339, 1534, 1539, 1544` become `/^folder(:runall)?$/`;
`:1344, 1349` become `/^(account|folder(:runall)?)$/`. The new command `credSshManager.runFolder`, title
`Run All in Folder`, uses the existing green icon on `inline@0` (free; `+` is `inline@1`), clause
`/^folder(:.*)?:runall$/` so a folder with a PIN preference or a project lock keeps it, plus `2_actions@0` in the
context menu, and is hidden from the palette. A test evaluates every `folderContextValue` combination against the
real manifest and asserts menu(`x:runall`) = menu(`x`) + `runFolder`, with a companion assertion that the scan
found `addEntity`.

## Not in this plan (todos)

Recorded in [PLAN_terminal_runs_followups.md](PLAN_terminal_runs_followups.md) by this plan's last commit, not built:

- The folder-level command template (decision D).
- `sendPinned` (`pinnedTerminal.ts`, used by `vpnRun.ts` and `toolEnsure.ts`) can type into a reused
  pinned terminal: the same hazard, on a line the extension composes.
- The green arrow types a literal `{config}` (`arrowLine` in `runCommands.ts`).
- `fresh` disposes by name, so a script kills a same-named entry's terminal (`runCommands.ts`), and a chain kills an entry
  named `before <folder>` (`chainTerminal` in `dependencyRunHost.ts`), which also goes against `Run` leaving open
  terminals alone.
- An agent-served launcher refused for a busy terminal comes after the chain and the config write, and is reported as
  `no_credential` (`vpnLauncherRun.ts`, `agentUseActions.ts`).
- `quoteFor('powershell', …)` does not handle typographic quotes. From memory PowerShell reads them as quotes; not
  measured here, no `pwsh` on this machine.
- `research/module_extension.md:2072-2075` says these commands are "not arriving from elsewhere", which
  `commandTrust.ts` contradicts. This one IS fixed here, in the doc update.

No manual entry order, no waiting between lines (*Depends on* already gives that), no `creds run <folder>` for
agents, no remote host on an entry: nobody asked.

## Budget

- `terminalActivityTracker`: a `WeakMap`, retired with its terminal, at most one small record per open terminal.
- `trustedCommands`: one fingerprint per resolved line, as today; a rename adds one. Unbounded as before, about 44
  bytes each; not changed here.
- Terminals: at most 32 per click, each the person's to close. Interrupted mid-run: lines typed stay typed, and the
  next click sees them as open.

## Test plan

The extension's suite is `node:test` over compiled output with no VS Code; `src/test/vpnWorld.ts` and
`dependencyChain.test.ts` are the stub-world pattern. Local runs stay at lowered priority with at most 8 workers.

**Watched failing first, against today's code**, the summary reporting both results:
`the_arrow_never_types_into_a_terminal_whose_command_is_running` (a live `CredsForDevs: alert` with a running
execution; today `sendText` is called once with the line).

**Pure tables.**

- Token: `${name}`, `{{name}}`, `#{name}`, `%{name}`, `user@{name}`, several occurrences, a disabled row.
- Names: the 28 above, plus marks only after a letter.
- `resolveCommand` per road, and a rename changing the fingerprint.
- Activity: every cell of §2's table; a start and end with no send of ours never read `finished`; late end, replayed
  end, end(undefined) then a second execution, double send.
- Plan: every row reason, roots against exclude, the cap, duplicates, order.

**Real shell, observed.** In a test-owned folder (the inline `testsToDelete-` form of `sshAgentServer.test.ts:71`, until PR #294's helper), a bash
child receives every accepted name byte-exact, and a control using an unguarded hostile name really does create a
file, so the test can fail. `pwsh`/`cmd` where present, with an explicit skip otherwise.

**Stub world.**

- Folder: modal dismissed runs nothing; open left alone; `Close Open Terminals and Run`; chain refusal types
  nothing; one failure does not stop the rest; a palette call on a trashed or non-terminal folder is refused;
  a new terminal never comes from `find`.
- Arrow: finished types and shows the terminal, running and unknown ask, a launcher with `startGate` refuses. A created
  terminal is listed at once, so a second folder click reads it as open and the arrow reads the object the folder run typed into.
- The folder's in-flight mark is released on a throw.

**Structural.** The `buildCommandLine` and `.commandArgs` scan with its non-empty companion; the menu evaluator.
`manifest`, `commandsRegistered`, `helpCoverage`, `listingCoverage`, `helpContent`, `sizeRatchet` and eslint stay green.

**Not worth having:** tests that stub VS Code's event order and call that integration; tmux fixtures in CI.

`research/module_tests.md` names these flows. Driving a real terminal stays `not covered`, for the reason that file
already gives (nothing there drives VS Code), with §Hand checks as what covers it.

## Hand checks (owner, in a real Remote-SSH window)

These measure what could not be determined here. They do not gate the release: today's arrow always types, so shipping
the guard cannot be worse than holding it. Until they run, the claim is the one §2 makes and no wider, and the summary
to the owner says which are unmeasured.

1. Overnight disconnect, then a window reload: what do `terminals` hold, under what names, at what prompt?
2. Reload with tmux attached, then the single arrow: it must ask, never type.
3. On a terminal the extension typed into since the last reload, detach tmux (`Ctrl-b d`), then the arrow: with integration it types. Straight after check 2 it still asks.
4. Nested `ssh`, and a shell inside tmux with integration sourced by hand: it must never read `finished` while tmux runs.
5. Double click on the arrow.
6. bash with `LC_ALL=C` and a Cyrillic name.
7. `{name}` on an old extension in zsh and fish.
8. The folder modal with 20 lines, and with one very long command ending in a marker: is the marker visible? The arrow's
   place beside `+`.

Suggestions for the owner's own entries, in the help: `tmux new -A -s {name}` attaches or creates, so it survives a
reboot of the VM; `tmux attach -t '={name}'` matches exactly, since a bare `-t foo` also attaches `foobar`
(measured); avoid `.` and `:` in a session's name, since tmux rewrites them (measured).

## Build order

One branch, one pull request, one gate run over one commit, in the order of §Stories: S1 → S2 → S3 → S5 → S4. S1 went
first because its RED test had to run against today's `runCommands.ts`, and S2 edits the same function. S5 is the re-review's
fix forward. They ship in one extension release.

**Who writes it:** per `common/subagent-models.md`, an Opus judge writes each commit's scenarios and brief, a Sonnet coder
writes code and tests, an Opus reviewer reviews, alongside `coai review_code`; §Stories says who writes each.

**Shipping:** release-please opens the release PR from the `feat(extension)` commit; its merge tags
`extension-v*`. Verify the new tag started a new run from `release.yml` on event `push`, unzip the `.vsix` and grep a
symbol only this version has. Then promote this plan to `research/` with its deviations.

## Definition of Done

- [ ] `npm run typecheck` and `npm test` green in `src_vs_code`, at lowered priority.
- [ ] The busy-terminal test watched failing first; failure message and pass both in the summary.
- [ ] A run of the folder types nothing into a live terminal, in the stub world; every road in the table of §1 has a test.
- [ ] The real-shell test ran, and its control created the file.
- [ ] Help in all five languages, `README.md`, `CHANGELOG.md`, `research/module_extension.md`, `research/module_tests.md` updated; the stale claim at `module_extension.md:2072-2075` corrected.
- [ ] The todos above recorded in `todo/`.
- [ ] `coai`: a `review_plan` round reached `proceed`, `review_code` ran on the finished branch, every finding resolved, verdicts and reviewer counts in the summary.
- [ ] `node .claude/rules/shared/tools/pin-check.mjs` and `plan-lifecycle.mjs` clean.
- [ ] The pull request merged with every check present and green and every thread resolved; the worktree and branch removed.
- [ ] Released: a new `release.yml` run observed for the tag, the `.vsix` inspected. The owner told which hand checks are theirs.
- [ ] This plan promoted to `research/`, deviations recorded.

## Stories

Split straight into stories, no epics (the review gate's operator, 2026-11-05). One branch `feat/terminal-folder-run`,
one gate run over one commit. Every story: scenarios and brief first, then code and tests, then review; the coder
rediscovers nothing. Each story carries its own `research/module_extension.md` and `research/module_tests.md` update;
help, README and CHANGELOG move in S4.

### S1 — The busy-terminal guard (CORNERSTONE)

- **Goal.** Neither road that types a Terminal entry's line (`credSshManager.runCommand`, the VPN launcher) types into a
  live terminal unless its last command is known to have finished; otherwise it shows the terminal and asks
  `Type It Anyway`, and an agent-served start refuses instead of asking (§2, decision B).
- **Scope.** New `src/terminalActivity.ts` (pure reducer `nextActivity`, reader `readActivity`, the texts), new
  `src/terminalActivityTracker.ts` (WeakMap over start/end events, subscribed from `registerRunCommands`), new
  `src/terminalGuard.ts` (`sendGuarded`, shared by both roads), `src/pinnedTerminal.ts` (`entryTerminal` split into
  `findEntryTerminal` / `openEntryTerminal`), `src/commands/runCommands.ts` (`typeIntoEntryTerminal`, registration),
  `src/vpnLauncherRun.ts` (`launch`). Tests: `terminalActivity.test.ts`, `busyTerminalGuard.test.ts`,
  `launcherBusyTerminal.test.ts`, `vpnWorld.ts` (`preopened`, `open`, `shell.start/end`), new `arrowWorld.ts`.
  Docs: the arrow paragraph of `module_extension.md` (:2072-2075, the stale "not arriving from elsewhere" claim corrected
  here), `module_tests.md`.
- **Depends on.** Nothing.
- **Done when.** `the_arrow_never_types_into_a_terminal_whose_command_is_running` was watched failing against today's
  code (`['tmux attach -t alert'] deepEqual []`) and passes; the two RED-again mutations of the spec's §S1.8 went red
  and green; the reducer table is proven cell by cell; a double click types at most once; the launcher under a
  `startGate` refuses a busy terminal with no await before the send; `extension.ts` unchanged (ratchet); lint,
  typecheck, suite green.
- **model:** fable writes the spec ([PLAN_terminal_folder_run_S1_spec.md](PLAN_terminal_folder_run_S1_spec.md), written
  2026-11-05); sonnet codes; opus reviews.

### S2 — `{name}`: one road, refused rather than quoted

- **Goal.** `{name}` in a Terminal entry's command or argument is `details.name`, allow-listed, resolved into ONE string
  that is displayed, approved, fingerprinted and typed; every other name is refused on every road (§1, decision D).
- **Scope.** New `src/commandName.ts` (`usesNameToken`, `nameRefusal`, `substituteName`); `src/commandLine.ts`
  (`ResolvedCommand`, `resolveCommand`, `shownCommandLine`; `buildCommandLine` stays the raw join); the road table of
  §1: `commands/runCommands.ts` (`commandLineOf`, `commandJob`, `maskedCommandLine`), `runPlan.ts:86`
  (`buildCommandLineWithRefs` takes `parts`), `dependencyRun.ts:155-161` (`executableLine` returns the template, then
  `stepRefusal`), `vpnLauncherRun.ts:59` (`launcherLine`), `agentUseActions.ts:181-201`, the viewer, Show Command,
  Copy All, consent, Copy, the form hint and preview (`entityFormScript.ts:219-229`, patterns through the script
  escaper). Tests: token table, the 28 names plus marks after a letter, `resolveCommand` per road, the fingerprint
  changing on rename, the `buildCommandLine` / `.commandArgs` scan with its non-empty companion, the real-shell test
  (bash byte-exact for every accepted name; the control with an unguarded hostile name creates the file; `pwsh`/`cmd`
  where present, explicit skip otherwise). Docs: `module_extension.md`, `module_tests.md`.
- **Depends on.** S1 landed (both change `runCommand` in `runCommands.ts`; S2 rebases on the guard).
- **Done when.** Every row of §1's road table has a test; a refused name is typed nowhere and never shown as a resolved
  line; `commandTrust.ts` unchanged; the real-shell control created the file; the scan test matches something.
- **model:** opus writes the scenarios and brief; sonnet codes; opus reviews.

### S3 — The folder run: plan, modal, execution

- **Goal.** One command, `credSshManager.runFolder`, brings a terminal folder's direct entries back: the plan rows
  (`run` / `open` / `not run` with reasons, the 32 cap, duplicate names), the modal that always shows every line,
  trust per line, the dependency chain with roots = the typed lines and exclude = every direct entry, the re-check of
  open terminals, a NEW terminal per line never found by name, `noteSent`, one failure not stopping the rest, the
  report of §3 step 8, and `Close Open Terminals and Run` (§3, decisions A, B, C).
- **Scope.** New pure `src/folderRun.ts`, new host `src/commands/folderRunCommand.ts` registered from
  `registerRunCommands`; the command's `contributes.commands` entry (hidden from the palette; the menus are S4).
  Tests: pure tables (every row reason, roots against exclude, cap, duplicates, display order) and the stub world
  (modal dismissed runs nothing; open left alone; Close Open Terminals and Run closes only the terminal objects the
  modal listed, after the chain is ready, and never one opened while the modal sat; chain refusal types nothing; one
  failure does not stop the rest; a palette call on a trashed or non-terminal folder is refused; a new terminal never
  comes from `find`). Docs: `module_extension.md`, `module_tests.md`.
- **Depends on.** S1 (`noteSent`), S2 (`resolveCommand`, a refused name is a `not run` row).
- **Done when.** A run of the folder types nothing into a live terminal in the stub world; the report says "Typed",
  never "started"; `commandsRegistered` green.
- **model:** opus writes the scenarios and brief; sonnet codes; opus reviews.

### S5 — The re-review's fix forward

- **Goal.** The built code matches §2 and §3 as revised for epoch 2.
- **Scope.** `src/terminalActivity.ts` to §2's table, with `armed`; `src/transitSecretReport.ts` escaper to C1 and bidi;
  `src/dependencyRun.ts` `describeRunPlan` escapes on every road; `src/folderRun.ts` the control-character row, the 4,000
  character bound, the report's order and sentences; `src/commands/folderRunCommand.ts` a closed `open` row, a closed
  terminal with no replacement; `src/commands/runCommands.ts` the arrow's title from `details.name`. Tests per §Test plan, including
  the stub world listing a created terminal, and the mark's release on a throw. `research/module_extension.md` and
  `research/module_tests.md` corrected, including the claims the S1 spec overstated; the spec itself stays as written
  and this plan overrides it.
- **Depends on.** S1, S2, S3.
- **Done when.** A start and end with no send of ours never read `finished`, watched red first; every row of the revised §3
  has a test; the suite, lint and typecheck green.
- **model:** opus writes the brief; sonnet codes; opus reviews.

### S4 — The arrow on the folder, and the words

- **Goal.** The folder row carries the green arrow and the context-menu item exactly where §3 puts them, and the
  feature is documented: help in five languages, README, CHANGELOG, the todos recorded.
- **Scope.** `src/treeRowText.ts:93-110` (token `:runall`, last, for an untrashed `folderType === 'terminal'`);
  `package.json` clauses `:1339, 1344, 1349, 1534, 1539, 1544` → `(:runall)?` forms, the new `inline@0` and
  `2_actions@0` clauses with `/^folder(:.*)?:runall$/`; the menu-evaluator test (every `folderContextValue`
  combination against the real manifest, menu(`x:runall`) = menu(`x`) + `runFolder`, with the `addEntity`
  companion assertion); `helpEn/De/Es/Ru/Uk.ts` (English the source: the folder run, `{name}`, the busy guard, the
  tmux suggestions `tmux new -A -s {name}`, `-t '={name}'`, no `.` or `:` in a session name, a dependency that never
  exits holds the run); `README.md`; `src_vs_code/CHANGELOG.md` (hand-written; release-please writes `RELEASES.md`);
  the five todos of §Not in this plan recorded in `todo/`; `module_extension.md` menu and help parts, `module_tests.md`.
- **Depends on.** S5. Its brief's help text is re-read against §2: without integration every click asks.
- **Done when.** The arrow shows on an untrashed terminal folder including one with `:asksforpin` or `:locked`, and on
  nothing else; `manifest`, `commandsRegistered`, `helpCoverage`, `listingCoverage`, `helpContent`, `sizeRatchet`,
  eslint green; the todos exist.
- **model:** opus writes the scenarios and brief; sonnet codes; opus reviews.

Cornerstones: 1 of 1 — S1
