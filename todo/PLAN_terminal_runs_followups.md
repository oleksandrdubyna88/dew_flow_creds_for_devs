# PLAN — Terminal runs: what the folder run left open

> Status: **plan only, nothing implemented yet, 2026-11-05.** Scope: the VS Code extension's terminal roads, and one repository-level
> item. Recorded by S4 of [PLAN_terminal_folder_run.md](../research/PLAN_terminal_folder_run.md), which built none of it. No item is scheduled.

## Goal

The folder run closed one hazard on the road its owner asked about: a line typed into a live `tmux attach`. Reading that road found
others beside it, and they were left out on purpose, so that plan stayed the size it was approved at. Each item below is a symptom
with its place in the code, decided by nobody yet. An item is built when someone asks for it, as its own change.

## The boundary with the folder run

| Item | Who builds it | The folder run's part |
|---|---|---|
| Items 1 to 16 below | this plan, item by item | none: `PLAN_terminal_folder_run.md` §Not in this plan points here |
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

### 11. The display escape is not one-to-one

**Symptom.** `escapeControl` (`src/transitSecretReport.ts`), which the folder run's modal, its report and the chain's modal use, turns a control
character into a visible escape but does not escape a backslash. A real newline in a line and the literal text `\u000a` therefore render alike in a modal.
The dangerous text stays visible, and trust is on the exact string, so nothing is typed that was not shown; but a reader cannot tell the two apart.
**Fix to consider:** a mark on a line that holds a line break, so that the reader sees it was one.

### 12. The older help text in `helpDe.ts` and `helpEs.ts`, and a stale count

**Symptom.** Three things in text that predates the folder run, found while writing its help. (a) `basics` in `helpDe.ts` and `helpEs.ts` translates UI
labels (*Abhängig von*, *Gestartet von*, *Läuft auf*, *Depende de*, *Iniciado por*, *Se ejecuta en* and the like), against `CLAUDE.md` rule 7, which keeps them in
English in every language. (b) `basics` says *Move Up* / *Move Down* order an entry, though they are folder-only. (c) `research/module_extension.md` still says
35 help articles where the catalog has 38. **Fix to consider:** one change per language file for (a), the sentence for (b), and the number for (c), each with
`folderRunHelp.test.ts`-style byte checks where a label is involved.

### 13. One `entryShell` check, written three times

**Symptom.** `windowRefusal` (`src/commands/runCommands.ts:103`), `refusedHere` (`src/vpnLauncherRun.ts:80`) and `refusalIn`
(`src/dependencyRunHost.ts:114`) are one `entryShell` check, written three times; it was already so on `main`. **Fix to consider:** one helper that the three call, with the
three callers' tests unchanged as the proof.

### 14. Dependencies run before the busy question, so a Cancel leaves them done

**Symptom.** On the arrow and on the launcher, the dependencies (and the launcher's config write) run BEFORE the busy question, so a person's
`Cancel` on that question leaves them done: the steps ran, and the line they were for was not typed. **Where.** `runDependenciesFirst`
(`src/dependencyRunHost.ts`) is called ahead of `sendGuarded` (`src/terminalGuard.ts`) in `src/commands/runCommands.ts` and in `src/vpnLauncherRun.ts`.
**To decide:** whether the question moves ahead of the chain, which would have to read the terminal before the chain has run, or whether the
question names what already ran.

### 15. `commandNameShell.test.ts` and PR #294

**Symptom.** `src/test/commandNameShell.test.ts` makes its folder inline (`testsToDelete-shell-`), as the existing tests do, until PR #294's helper
lands. When #294 lands, that test moves to its `ownedDir`. The test and this branch must be reconciled in whichever lands second.

### 16. The rest of the owner's hand checks

**Symptom.** The owner ran most of §Hand checks of [PLAN_terminal_folder_run.md](../research/PLAN_terminal_folder_run.md) on 2026-11-06; the
results are recorded there. Neither result that would change code came up. Still unmeasured: what a revived terminal holds after an overnight
disconnect (1), a detach in a terminal that survived a reload over Remote-SSH (the second half of 3), a nested `ssh` (4), bash with `LC_ALL=C` and a Cyrillic name (6), `{name}` on an old extension in zsh and fish (7), and the double
click and the folder modal in a Remote-SSH window rather than a WSL one (5, 8). **Fix to consider:** run them when convenient. A line typed without
a question under a nested `ssh` would change code.

## Budget

None of these creates anything that grows. Item 6's early refusal writes less than today.

## Build order

None between items. Each is its own branch and pull request, and item 2 before item 6 only if both are wanted, since both change the guard's
callers. An item this document's reader finds already done is removed in the commit that did it.

## Test plan

Items 2, 3, 4 and 6 go in the stub world of `src/test/vpnWorld.ts`, watched failing first against today's code. Item 5 needs a real `pwsh`,
explicitly skipped where absent, as `commandNameShell.test.ts` does. Item 7 is a pure table in `terminalActivity.test.ts` and `dependencyRun.test.ts`,
with a name holding a newline, U+2028 and a tab. Item 8 is one pure assertion on the new wording. Item 9 is a hand check, not a test. Item 1 starts
with its decision, not a test. Item 10 is proved by the command above answering clean. Item 11 is a pure table of strings that must render apart. Item 12 is the byte checks of
`folderRunHelp.test.ts`, extended to the labels in question. Item 13 changes no behaviour, so the three callers' existing tests are the proof. Item 14 goes in
the stub world, a `Cancel` on the busy question asserted against the steps that already ran. Item 15 is a reconciliation, not a test.

## Definition of Done

- [ ] Each item is built, or removed with the reason, and this file then promoted or deleted per `planning-docs.md`.
- [ ] A built item has a test watched failing first, and a line in `research/module_extension.md` and `research/module_tests.md`.
- [ ] `node .claude/rules/shared/tools/plan-lifecycle.mjs` clean.
