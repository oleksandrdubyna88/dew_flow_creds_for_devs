# PLAN — Terminal command over SSH, E1: the field, the refusal on every road, the composer, the seam

> Status: **IMPLEMENTED, 2026-11-11.** Merged as #335 (f3b024b7) and released in extension 1.20.0 (#341), with the parent. Deviations: §S4 (F1-F7) and the parent's §12. Parent: [PLAN_terminal_command_over_ssh.md](PLAN_terminal_command_over_ssh.md) › E1.
> Scope: `src_vs_code` only. S1 is specified in full here (scenarios and brief, by Opus). S2 and S3 are cornerstones:
> their specs are Fable's, in their own files. Branch `feat/terminal-command-over-ssh-e1`; E1 was built as one commit and then the §S4 fixes.

Every path below is relative to `src_vs_code/src/` unless it says otherwise. Every `file:line` was opened on commit
`e468285` of this branch.

## The three stories

| Story | What | Spec and scenarios | Code and tests | Review |
|---|---|---|---|---|
| S1 | The field, and the refusal on every road | Opus, this document | Sonnet | Opus |
| **S2 — cornerstone, `model: fable`** | The composer `remoteLaunch.ts`, `buildSshCommand`'s `remote` option, the delivery test, the road scan | **Fable**: [PLAN_terminal_command_over_ssh_E1_S2_spec.md](PLAN_terminal_command_over_ssh_E1_S2_spec.md) | Sonnet | Opus |
| **S3 — cornerstone, `model: fable`** | The seam `prepareSshSession` in `sshSession.ts` | **Fable**: [PLAN_terminal_command_over_ssh_E1_S3_spec.md](PLAN_terminal_command_over_ssh_E1_S3_spec.md) | Sonnet | Opus |

The parent names two cornerstone areas, and Q = ⌈2·3/5⌉ = 2. S2 holds area (1) (the one composer, the trust line, the
two-shell quoting, the fail-closed scan). S3 holds area (2) (the seam cut from `connectEntity`, the lifetime of the key
and the askpass env). So both marks go to E1, and the parent's ledger line becomes
`Cornerstones: 2 of 2 — E1.S2, E1.S3`. The lead writes that line and this document's `todo/README.md` row in the same
commit as this file. S1 is not a cornerstone: it adds a field by a pattern the code already has three times, and its
refusal is a single sentence from a single function; its tests are the proof.

### S1 — The field, and the refusal on every road

- **Goal.** A Terminal entry can store `sshEntityId`. The form shows it, every save, sync, backup and rename keeps it,
  a share and an export remove it. While it is set, every road that runs the entry refuses with one sentence from one
  pure function, before any question, dependency, secret read or spawn. Copy Command does not copy the line.
- **Scope.** Parent §4.1 whole; build step 1; D4, D8, D13. Files: see the brief below.
- **Depends on.** The coai plan round at `proceed`. Nothing else. S1 lands first in E1 (D8).
- **Done when.** The scenarios S1-G, S1-F, S1-C, S1-V, S1-W and S1-H below are green, each watched RED first;
  `commandRoadScan.test.ts` is still green with no edit; typecheck and lint are green; no file passes its line ceiling.

### S2 — The composer (cornerstone, `model: fable`)

- **Goal.** One pure module, `remoteLaunch.ts`, is the only road from "entry + link" to a launch: `sshLinkOf`,
  `planLaunch`, `trustLineFor`, `typedLine`, `secretsStdin`; `buildSshCommand` gets a `remote` option and stays
  byte-identical without it; the delivery test runs through real local shells; `test/launchRoadScan.test.ts` pins the
  roads.
- **Scope.** Parent §4.2, §4.5, §4.6; build step 2. The spec's decisions S2-D1..S2-D7 change parent text (the lead owns
  those edits).
- **Depends on.** S1 merged into the branch: S2 moves S1's refusal into `remoteLaunch.ts` (S2-D7) and its scan R8 reads
  S1's `collectSshCandidates`.
- **Done when.** The S2 spec's §S2.9 scenarios and its §S2.11 checklist pass.

### S3 — The seam (cornerstone, `model: fable`)

- **Goal.** `prepareSshSession` does everything `connectEntity` does before it opens a terminal, in the same order, and
  returns `ready | refused | stopped` with `cleanup()`. `connectEntity` becomes prepare + its open branches; its two
  suites stay green unchanged. No road calls the seam in E1.
- **Scope.** Parent §4.3, the contract of §4.4 ("one owner", "one snapshot"); build step 3; risk 7 inherited on purpose.
- **Depends on.** Nothing in S1 or S2; it can be built beside them.
- **Done when.** The S3 spec's scenarios and its review checklist pass.

## S1 — scenarios and brief (Opus; a Sonnet coder builds from this and re-discovers nothing)

### S1.0 Decisions taken here

| # | Decision | Why |
|---|---|---|
| S1-D1 | **One refusal function, `sshLinkRefusal(entry)`, in a new pure module `sshLinkGate.ts`.** Every road and every copy calls it. No road reads `.sshEntityId` itself. | One measure on one road. S2 moves this function, name and signature unchanged, into `remoteLaunch.ts`, and its body then answers through `sshLinkOf`'s row L1 (S2-D7, S2 spec §S2.6). After that move `sshLinkGate.ts` is deleted. |
| S1-D2 | **"Not linked" is `sshEntityId` undefined OR `''`.** | The same rule as S2's L1, and as `vpnLauncher.ts:52` for the launcher id. The form never writes `''`; a sync can. |
| S1-D3 | **The check is presence only.** A link to a missing, trashed or non-SSH entry also refuses, with the same sentence. | Fail-closed. S2's `sshLinkOf` gives the finer sentences when the roads are built (E2, E3). |
| S1-D4 | **One sentence on every road, the folder report included.** It says nothing about what else ran, so it is true in the folder report, the chain, the agent and Copy Command. | The lead asked for one sentence. |
| S1-D5 | **Candidates agree with S2's `sshLinkOf`:** kind `ssh` (`resolveKind`), `isSafeSshTarget(details)`, not itself, not in the Trash. | S2's scenario R8 checks that every offered candidate is `linked`. A "host is not empty" test would offer a host that L6 refuses. |
| S1-D6 | **The viewer hides "Full command" for a linked entry** and shows the sentence in its "Will not run" row; its copy of `fullCommand` answers nothing for a linked entry. | The viewer's copy button is a second Copy Command road (`entityViewCopy.ts:151`). The trust line replaces it in E2.S1. |
| S1-D7 | **Export strips the link on the way out (`exportSecrets.ts:128`), and import strips it on the way in (`externalBundle.ts:76`).** | D4. Today export strips no reference at all; the import strip also covers a file written by hand or by a later build. |
| S1-D8 | **A link set by a sync while a modal is open does not stop that one approved run.** | Every road checks the snapshot it read first, like the OS check and the name check today. The parent's "one snapshot" rule (§4.4) is the same choice. Recorded, not a test. |

### S1.1 The exact sentence

```
"<entry>" is set to run over SSH, which this version cannot do yet. To run it on this machine, edit it and set "Runs over SSH" to "Do not use".
```

`<entry>` is `entry.name`, raw (as the arrow's own sentences are; the folder report escapes it through `shown`). The
words "Runs over SSH" and "Do not use" are the form's label and its first option without the dashes, the same
spelling the S2 spec's sentences use (§S2.3).

### S1.2 The new module — `sshLinkGate.ts` (pure, imports only `./types`)

```ts
import { EntityMetadata } from './types';

/**
 * E1.S1 of PLAN_terminal_command_over_ssh.md (D8): a Terminal entry may name an SSH entry it runs over, and until a
 * road is built to do that, the road refuses such an entry with this ONE sentence. Pure: no `vscode`.
 *
 * <p>S2 moves this function, name and signature unchanged, into `remoteLaunch.ts`, where it answers through
 * `sshLinkOf` (S2-D7); this file is then deleted. E2 and E3 replace each call by the composer, road by road.</p>
 */

/** What the refusal reads. `id` is not read here; it is in the signature so S2's body can pass the entry to `sshLinkOf`. */
export type LinkedEntry = Pick<EntityMetadata, 'id' | 'name' | 'sshEntityId'>;

/** The sentence every road says instead of running a linked entry, or `undefined` when the entry has no link. */
export function sshLinkRefusal(entry: LinkedEntry): string | undefined {
  const id = entry.sshEntityId;
  return id === undefined || id === ''
    ? undefined
    : `"${entry.name}" is set to run over SSH, which this version cannot do yet. To run it on this machine, edit it and set "Runs over SSH" to "Do not use".`;
}
```

This is the ONLY `.sshEntityId` read outside the plumbing lines of S1.3 (the list S2's scan 2 allow-lists).

### S1.3 The brief — every file, the place, the change

Line ceilings: ESLint `max-lines` 800 per file (`eslint.config.mjs:30`), 50 code lines per function (120 in
tests), complexity at most 4. Where a change sits near a limit, the brief says how to stay under it.

**The field**

| # | File:line | Change |
|---|---|---|
| 1 | `types.ts:166` (after `terminalOs?: string;`) | Add `sshEntityId?: string;` with a doc comment: a same-account SSH entry this Terminal entry runs over (`PLAN_terminal_command_over_ssh.md`); a typed reference like `vpnLauncherEntityId` (`types.ts:115`): it can dangle; stripped from a share and an export; remapped on a backup import. Not the place of `types.ts:115`: the field belongs with the other Terminal fields. |
| 2 | `typeGuards.ts:337` | After the `vpnLauncherEntityId` clause, add `(v.sshEntityId === undefined \|\| typeof v.sshEntityId === 'string') &&`. The function already carries `eslint-disable-next-line complexity`. |
| 3 | `execFormFields.ts:42-58` | Add `export function sshLinkField(d: EntityMetadata \| undefined, candidates: readonly KeyCandidate[]): string`, the shape of `vpnLauncherField`: `selected = d?.sshEntityId ?? ''`; options `option('', '— Do not use —', selected)`, then each candidate `option(c.id, c.name, selected)`, then `option(selected, '(missing entry)', selected)` when `isDangling`. Label `<label for="sshEntityId">Runs over SSH</label>`, `<select id="sshEntityId">`. Hint: `<p class="hint">One of your SSH entries. This version saves the choice but cannot run a command over SSH yet: while one is chosen, every way of running this entry refuses and says why.</p>`. Change `isDangling`'s parameter to `readonly KeyCandidate[]` (a `LauncherCandidate` is one). Import `KeyCandidate` with `LauncherCandidate` from `./entityFormShape`. |
| 4 | `execFormFields.ts:20-28` (`terminalOsField` hint) | Append to the hint text: ` With an SSH connection chosen below, this is the remote system.` (parent §4.1, D14). |
| 5 | `execFormFields.ts:70` and `:80-91` | `ExecDetails` gains `'sshEntityId'`. In `execDetails` add `sshEntityId: kind === 'terminal' ? launcherId(text(data.sshEntityId), selfId) : undefined,` (`launcherId` already means "not empty, never itself"). Complexity goes from 3 to 4: allowed. Update the two doc comments ("three fields" → "four"). |
| 6 | `entityFormPage.ts:12` and `:596` | Import `sshLinkField` on the existing import line 12. Add ONE line after line 596: `${sshLinkField(d, options.sshCandidates ?? [])}`. The file goes from 785 to 786. |
| 7 | `entityFormScript.ts:690` | On the EXISTING line, after `terminalOs: val('terminalOs'),` add ` sshEntityId: val('sshEntityId'),`. No new line: the file stays at 791. |
| 8 | `entityFormShape.ts:144` | After `launcherCandidates?: LauncherCandidate[];` add `sshCandidates?: KeyCandidate[];` with a doc comment: the SSH entries a Terminal entry can run over (D13); OPTIONAL, like `launcherCandidates`, so cast fixtures keep compiling; absent means none. |
| 9 | `entityFormPanel.ts:645` | Comment only: `// issue #103: OS, launcher, execute` → `// issue #103 and the SSH link: OS, SSH link, launcher, execute`. The spread already writes the new key. |
| 10 | `commandTargets.ts:74-121` | Add `export function collectSshCandidates(storage: StorageManager, accountId: string, excludeEntityId: string): KeyCandidate[]` after `collectLauncherCandidates`: `const byId = (id: string): TreeNode \| undefined => storage.getNode(accountId, id);` then `getNodes(accountId).filter((node) => canRunOver(node, excludeEntityId) && !isInTrash(node, byId)).map((node) => ({ id: node.id, name: node.name }))`. `canRunOver(node, exclude)`: `node.type === 'entity' && node.id !== exclude && node.details !== undefined && isSshLinkTarget(node.details)`; `isSshLinkTarget(details)`: `resolveKind(details) === 'ssh' && isSafeSshTarget(details)`. Keep each helper at complexity 4 or less. Imports: `isInTrash` from `./trash`, `resolveKind` from `./entityKind`, `isSafeSshTarget` from `./sshCommand`. Do NOT reuse `collectJumpCandidates`: it includes the Trash and tests `isSshEnabled`, not the kind. |
| 11 | `entityEditCommands.ts:198` | After the `launcherCandidates` line add `sshCandidates: collectSshCandidates(storage, accountId, node.id),` and import it on line 15. |
| 12 | `commands/treeMutationCommands.ts:275` | After the `launcherCandidates` line add `sshCandidates: collectSshCandidates(storage, location.accountId, id),` and import it on line 28. (The file is 746 lines.) |
| 13 | `commands/shareCommands.ts:96` | After `jumpCandidates: [],` add `sshCandidates: [],` (authoring for somebody else: an id of THIS vault means nothing in theirs — the comment above line 95 already says so for the jump host). |

**The round trips**

| # | File:line | Change |
|---|---|---|
| 14 | `shareFormat.ts:537` | After `vpnLauncherEntityId: undefined,` add `sshEntityId: undefined,` and extend the comment above it: the SSH entry is an id in the SENDER's vault; the recipient's copy runs locally (D4). |
| 15 | `exportSecrets.ts:128` (`exportedNode`) — this is where export builds its nodes (`commands/exportCommand.ts:135` maps `picked` through it) | Replace the body: `return node.details === undefined ? node : { ...node, details: exportedDetails(node.details) };` and add `function exportedDetails(details: EntityMetadata): EntityMetadata { return { ...details, pinProtected: details.pinProtected === true ? undefined : details.pinProtected, sshEntityId: undefined }; }` with a comment naming D4. Import `EntityMetadata` with `TreeNode` (line 6). The existing `test/exportProtected.test.ts:108` must stay green. |
| 16 | `externalBundle.ts:91` (inside `remapExternalIds`, `externalBundle.ts:76`) | `details: node.details !== undefined ? { ...node.details, id, sshEntityId: undefined } : undefined,` and one comment line: an imported entry never arrives linked (D4) — the id would name an entity of the sender's vault. |
| 17 | `idQuarantine.ts:82` | After the `vpnLauncherEntityId` line add `...remappedRef('sshEntityId', details.sshEntityId, to),`; extend the doc comment of `remapDetails` (line 72-73) with "an SSH link". |

**The viewer**

| # | File:line | Change |
|---|---|---|
| 18 | `entityViewPage.ts:98` | After `jumpHostName?: string;` add `/** The NAME of the SSH entry a Terminal entry runs over, resolved by the caller. */` and `sshLinkName?: string;` (+2 lines). |
| 19 | `entityViewPage.ts:507-511` | After the `row(commandRowLabel(…))` line (507) add ONE line: `row('Runs over SSH', 'sshLink', d.isTerminal ? options.sshLinkName : undefined),`. Line 510 becomes `row('Full command', 'fullCommand', d.isTerminal && sshLinkRefusal(d) === undefined ? shownCommandLine(d) : undefined),`. Line 511 becomes `row('Will not run', 'commandRefusal', d.isTerminal ? (sshLinkRefusal(d) ?? commandRefusal(d)) : undefined),`. Import `sshLinkRefusal`. The file goes from 791 to 794 (ceiling 800): no other line may be added. |
| 20 | `entityViewCopy.ts:151-152` | `case 'fullCommand': value = sshLinkRefusal(d) === undefined ? shownCommandLine(d) : undefined; break;` and `case 'commandRefusal': value = sshLinkRefusal(d) ?? commandRefusal(d); break;`, and one new `case 'sshLink': value = options.sshLinkName; break;`. The function carries its `eslint-disable` already. |
| 21 | `entityViewerCommands.ts:156` | After `jumpHostName: …` add `sshLinkName: nameOf(storage, accountId, details.sshEntityId \|\| undefined),` (`\|\| undefined`: an empty id is no link, S1-D2). `nameOf` already answers `(missing entity)` for a gone id. |

**The refusal on every road** (all calls go to `sshLinkRefusal`; every one sits BEFORE any trust modal, dependency
chain, secret read, config write, slot or spawn)

| # | Road | File:line | Change |
|---|---|---|---|
| 22 | Arrow (Run in Terminal) | `commands/runCommands.ts:124` | In `runEntryLine`, pass `arrowRefusal(entry)` instead of `windowRefusal(entry)`. Add after `windowRefusal` (line 108-111): `/** The link first (E1.S1), then the window. */ function arrowRefusal(entry: Entry): string \| undefined { return sshLinkRefusal(entry.details) ?? windowRefusal(entry); }`. `passGates` (line 96-105) warns a refusal before `confirmTrusted` and before `runDependenciesFirst`, so nothing is asked and no chain starts. |
| 23 | Run with Secrets | `commands/runCommands.ts:262` | Replace the `osMismatch(…)` argument by `secretsRefusal(job.entry)`, and add `function secretsRefusal(entry: Entry): string \| undefined { return sshLinkRefusal(entry.details) ?? osMismatch(entry.name, entry.details.terminalOs, process.platform); }`. A helper, not an inline `??`: `runWithSecrets` must stay at complexity 4 or less. Checked before trust, before `resolvedRefs` (no secret is read). The file goes from 392 to about 400. |
| 24 | Folder run | `folderRun.ts:116` (`judgedLine`) | `const reason = sshLinkRefusal(details) ?? lineRefusal(details.name, line) ?? facts.shellRefusal(details.name, details.terminalOs);` (complexity 4). The row becomes `notRun` with the sentence as its reason: it is never trusted, never typed, and its dependencies are not run (`linesToType` holds only line rows). The report shows `<name> — <sentence without its last full stop>` (`reasonGroups`, `folderRun.ts:253-256`). `commands/folderRunCommand.ts` does NOT change. |
| 25 | Dependency chain | `dependencyRun.ts:148-153` (`stepRefusal`) | Change the last line to `return sshLinkRefusal(node) ?? nameStepRefusal(node) ?? walk.refusalOf(node.name, node.terminalOs);` (complexity 4). A linked step refuses the WHOLE chain before anything starts, like a refused name today. The `usesConfig` check stays first. Do NOT add an `executableLine(` call: `commandRoadScan.test.ts:109-116` pins its readers. |
| 26 | VPN launcher (person's Start VPN and an agent's `creds_vpn_up`) | `vpnLauncherRun.ts:75-78` (`launcherRefusal`) | `return sshLinkRefusal(launcher) ?? (reason === undefined ? refusedHere(launcher) : …unchanged…);`. `launcherLine` shows it as a warning before `confirmTrusted` (line 57), before the chain and before the config file is written. |
| 27 | Agent `creds_run` / CLI `run` | `agentUseActions.ts:209-211` | Change line 211 to `const mismatch = sshLinkRefusal(entity) ?? osMismatch(ctx.entityName, entity.terminalOs, process.platform);` and the comment on line 210 to `// Issue #103 and the SSH link (E1.S1): refused here exactly as on the human path.`. **Zero new lines**: `terminalRunAction` has 48 of its 50 code lines. The answer is `fail('not_supported', <sentence>)`, before the trust check and before `acquireExecSlot`. |
| 28 | Copy Command | `commands/entityCommands.ts:221-233` | `copyCommandLine` is at complexity 4, so split it: `copyCommandLine(node)` = `const entry = node.details ?? { id: node.id, name: node.name }; const linked = sshLinkRefusal(entry); if (linked !== undefined) { void vscode.window.showWarningMessage(linked); return; } await copyLocalLine(node.name, entry);` and move the old body (from `const line = shownCommandLine(entry);`) into `async function copyLocalLine(name: string, entry: CommandEntry): Promise<void>` unchanged. (`CommandEntry` from `../commandLine`; use `node.name` where the old code used it.) Nothing reaches the clipboard. *Show Command and Notes* (`showCommandText`) is a display and does not change. |

**The agent deny-list, the help, the README**

| # | File:line | Change |
|---|---|---|
| 29 | `test/agentKindFields.test.ts:168` | Add `'sshEntityId',` after `'vpnLauncherEntityId',` in `WINDOW_OWNED`. There is no production deny-list: agent create is an allow-list (`AGENT_KIND_FIELDS`, held equal to the form's scrub by the test at line 107), and `sshEntityId` is not in `UNIVERSE`, so an agent can never set it. This line is the guard that it is never offered. |
| 30 | `helpEn.ts:84` (article `basics`, the `- **terminal**` bullet) | After `*not set* keeps your default terminal, as before.` add: ` *Runs over SSH* can name one of your **ssh** entries; it starts on *— Do not use —*. This version saves the choice but cannot run a command over SSH yet: while one is chosen, every way of running the entry refuses and says why, and *Copy Command* copies nothing. A share and an export leave the choice out.` |
| 31 | `helpDe.ts:84` | After `*nicht gesetzt* behält Ihr Standardterminal wie bisher.` add: ` *Runs over SSH* kann einen Ihrer **ssh**-Einträge nennen; voreingestellt ist *— Do not use —*. Diese Version speichert die Wahl, kann einen Befehl aber noch nicht über SSH ausführen: Solange einer gewählt ist, lehnt jeder Weg, den Eintrag auszuführen, ab und sagt warum, und *Copy Command* kopiert nichts. Eine Freigabe und ein Export lassen die Wahl weg.` |
| 32 | `helpEs.ts:84` | After `*sin definir* conserva su terminal predeterminado, como antes.` add: ` *Runs over SSH* puede nombrar una de sus entradas **ssh**; empieza en *— Do not use —*. Esta versión guarda la elección, pero todavía no puede ejecutar un comando por SSH: mientras haya una elegida, cada forma de ejecutar la entrada se niega y dice por qué, y *Copy Command* no copia nada. Al compartir y al exportar, la elección no se incluye.` |
| 33 | `helpRu.ts:84` | After `*not set* оставляет терминал по умолчанию, как раньше.` add: ` *Runs over SSH* может указать одну из ваших записей **ssh**; по умолчанию стоит *— Do not use —*. Эта версия сохраняет выбор, но пока не умеет выполнять команду через SSH: пока запись выбрана, каждый способ запуска отказывает и объясняет почему, а *Copy Command* ничего не копирует. Отправка записи другому человеку и экспорт этот выбор не переносят.` |
| 34 | `helpUk.ts:84` | After `*not set* залишає термінал за замовчуванням, як раніше.` add: ` *Runs over SSH* може вказати один із ваших записів **ssh**; за замовчуванням стоїть *— Do not use —*. Ця версія зберігає вибір, але ще не вміє виконувати команду через SSH: поки запис вибрано, кожен спосіб запуску відмовляє й пояснює чому, а *Copy Command* нічого не копіює. Надсилання запису іншій людині та експорт цей вибір не переносять.` |
| 35 | `../README.md` → `src_vs_code/README.md:252-255` (section "Terminal command entities") | After the **Runs on** bullet add: `- **Runs over SSH** can name one of your SSH entries; it starts on *— Do not use —*. This version saves the choice, keeps it through sync and backup, and leaves it out of a share and an export, but it cannot run a command over SSH yet: while one is chosen, *Run in Terminal*, *Run All in Folder*, a dependency chain, a VPN's *Started by*, *Run with Secrets* and an agent's run all refuse and say why, and *Copy Command* copies nothing. Nothing runs on this machine instead.` (wrapped at about 100 columns like its neighbours). |

The help strings are double-quoted JavaScript; none of the added texts holds a `"`. UI labels stay English in all
five (`CLAUDE.md` rule 7). `research/` is not changed by S1 (S2 and S3 own those lines).

**The `.sshEntityId` readers after S1** (for S2's scan 2 allow-list): `typeGuards.ts` (the guard clause),
`execFormFields.ts` (`d?.sshEntityId` in `sshLinkField`, `data.sshEntityId` in `execDetails`), `idQuarantine.ts`
(`details.sshEntityId`), `entityViewerCommands.ts` (`details.sshEntityId || undefined`), `sshLinkGate.ts` (one read).
**The `sshLinkRefusal(` call sites after S1** (for S2's scan 4): `commands/runCommands.ts` ×2 (`arrowRefusal`,
`secretsRefusal`), `folderRun.ts` (`judgedLine`), `dependencyRun.ts` (`stepRefusal`), `vpnLauncherRun.ts`
(`launcherRefusal`), `agentUseActions.ts` (`run`), `commands/entityCommands.ts` (`copyCommandLine`),
`entityViewPage.ts` ×2, `entityViewCopy.ts` ×2 — eleven calls in eight files, not six.

### S1.4 Scenarios — RED first

The order for each scenario: write the test, run it, watch it FAIL for the reason in the "RED today" column, then
build, watch it pass. For a new export (`sshLinkRefusal`, `sshLinkField`, `collectSshCandidates`), first add the export
as a stub (`return undefined`, `return ''`, `return []`) so the test compiles and fails on its assertion, not on a
missing name. The coder reports each RED message and each pass. `SENTENCE(name)` below is
`sshLinkRefusal({ id: 'x', name, sshEntityId: 's1' })`; one test (G1) pins its text literally, every other test
compares with the function so the text lives once.

**`test/sshLinkGate.test.ts`** (new)

| # | Test | Assertion | RED today |
|---|---|---|---|
| G1 | `the_refusal_sentence_is_exact` | `sshLinkRefusal({ id: 't1', name: 'deploy', sshEntityId: 's1' })` equals the S1.1 text with `deploy`, as a literal string | the stub answers `undefined` |
| G2 | `no_link_and_an_empty_link_are_no_refusal` | `undefined` for `sshEntityId` absent and for `''` | (green with the stub; it guards S1-D2 — say so in the report) |
| G3 | `the_gate_imports_no_vscode` | the source of `sshLinkGate.ts` (read from `src/`) has no `from 'vscode'` and no `require('vscode')` | green once the file exists — a guard, named as such |

**`test/sshLinkField.test.ts`** (new) — the form, the guard, the candidates, the wiring

| # | Test | Assertion | RED today |
|---|---|---|---|
| F1 | `the_guard_accepts_a_string_link_and_refuses_a_number` | `isEntityMetadata({ id: 'e', name: 'x', isSshEnabled: false, sshEntityId: 's1' })` is `true`; with `sshEntityId: 7` is `false` | `7` is accepted |
| F2 | `the_picker_starts_on_do_not_use_then_lists_the_candidates` | `sshLinkField(undefined, [{id:'s1',name:'prod'},{id:'s2',name:'stage'}])` matches `<option value="" selected>— Do not use —</option>`, then `<option value="s1">prod</option>`, then `<option value="s2">stage</option>`, in that order; it holds `<label for="sshEntityId">Runs over SSH</label>` and `<select id="sshEntityId">` | stub `''` |
| F3 | `a_stored_link_is_selected` | `d.sshEntityId: 's2'` → `<option value="s2" selected>stage</option>` and the empty option is not selected | stub |
| F4 | `a_link_that_is_no_longer_offered_shows_missing_and_stays_selected` | `d.sshEntityId: 'gone'`, no candidates → `<option value="gone" selected>(missing entry)</option>` | stub |
| F5 | `a_candidate_name_is_escaped` | a candidate named `<b>x</b>` appears as `&lt;b&gt;x&lt;/b&gt;` and never as `<b>` | stub |
| F6 | `the_save_keeps_a_link_only_on_a_terminal_entry_never_itself_never_empty` | `execDetails({ sshEntityId: 's1' }, 'terminal', 0, 't1').sshEntityId === 's1'`; `'ssh'` kind → `undefined`; `'vpn'` → `undefined`; id `'t1'` on self `'t1'` → `undefined`; `''` → `undefined` | the key is not written |
| F7 | `the_page_shows_the_picker_in_the_terminal_section_after_runs_on` | `renderHtml(…formOptions(), sshCandidates: [{id:'s1',name:'prod'}])` (from `../entityFormPage`, options built like `test/entityFormPanel.test.ts:227`) holds `id="sshEntityId"` exactly once, and `indexOf('id="terminalOs"') < indexOf('id="sshEntityId"') < indexOf('id="commandNote"')` | absent |
| F8 | `the_page_posts_the_link_on_save_on_the_terminalOs_line` | file-text pin as `test/terminalOs.test.ts:101-109`: `entityFormScript.ts` holds `"sshEntityId: val('sshEntityId')"`, and the line that holds it also holds `"terminalOs: val('terminalOs')"` | absent |
| F9 | `both_forms_fill_the_ssh_candidates` | file-text pins: `entityEditCommands.ts` holds `sshCandidates: collectSshCandidates(storage, accountId, node.id),`; `commands/treeMutationCommands.ts` holds `sshCandidates: collectSshCandidates(storage, location.accountId, id),`; `commands/shareCommands.ts` holds `sshCandidates: [],` | absent |
| C1 | `only_live_ssh_entries_with_a_safe_host_are_offered_never_itself` | a fake storage `{ getNodes, getNode }` with: `ok` (kind ssh, host `prod.corp.com`), `flags` (no `kind`, `isSshEnabled: true`, host `a.corp.com` — `resolveKind` gives ssh), `nohost` (ssh, no host), `badhost` (ssh, host `-oProxyCommand=x`), `cred` (credential with host), `term` (terminal), `me` (ssh, the excluded id), `gone` (ssh, inside folder `trash` with `isTrash: true`), and a folder. `collectSshCandidates(storage, 'a1', 'me').map((c) => c.id)` deep-equals `['ok', 'flags']`, each `{ id, name }` only | stub `[]` |
| C2 | `the_trash_is_read_at_any_depth` | an ssh entry in a subfolder of the Trash is not offered | stub |

**`test/entityFormPanel.test.ts`** (append one test, using its `world()` and `posted()`, lines 27 and 42)

| # | Test | Assertion | RED today |
|---|---|---|---|
| F10 | `the_ssh_link_survives_a_save_whole` | `panel.toValues(posted('terminal', { command: 'ls', sshEntityId: 's1' }), { entityId: 't1' } as never).details.sshEntityId === 's1'`; the same post with kind `'ssh'` gives `undefined` | not written |

**`test/sshLinkCopies.test.ts`** (new) — share, export, import, backup, viewer

| # | Test | Assertion | RED today |
|---|---|---|---|
| R1 | `a_share_carries_no_ssh_link` | `shareableDetails({ …terminal, sshEntityId: 's1', terminalOs: 'linux' }, false)` has `sshEntityId === undefined` and still `terminalOs === 'linux'` | the link travels |
| R2 | `an_export_carries_no_ssh_link_and_keeps_its_other_fields` | `exportedNode(node)` for a terminal node with `sshEntityId: 's1'`, `command: 'ls'`: `details.sshEntityId === undefined`, `details.command === 'ls'`; `JSON.stringify(exportedNode(node))` does not include `sshEntityId`; a node with `pinProtected: true` still comes out with `pinProtected` undefined | the link travels |
| R3 | `an_import_never_arrives_linked` | `remapExternalIds(buildExternalBundle([nodeWithLink], {}), () => 'n1', null).nodes[0].details?.sshEntityId === undefined` | the link is kept |
| R4 | `a_backup_import_that_renames_the_ssh_entry_renames_the_link` | as `test/vpnLauncher.test.ts:66-75`: nodes `bad:id` (ssh) and `t1` (terminal, `sshEntityId: 'bad:id'`); after `quarantineUnsafeIds(input, {}, () => 'fresh-1')` the terminal's `sshEntityId === 'fresh-1'` | not remapped |
| R5 | `an_entry_without_a_link_gets_no_link_key_after_a_remap` | as `test/vpnLauncher.test.ts:78-87`: `'sshEntityId' in details === false` | (green; guards `remappedRef`'s absent-stays-absent) |
| V1 | `the_viewer_names_the_ssh_entry_and_shows_the_sentence_not_the_line` | `renderEntityViewHtml(options({ details: linkedTerminal, sshLinkName: 'prod box' }))` (options built like `test/entityViewPage.test.ts:32-56`) matches `/Runs over SSH[\s\S]*?<input readonly value="prod box">/`, does NOT match `/Full command/`, and includes `escapeHtml(SENTENCE(name))` | no row; Full command shown |
| V2 | `the_viewer_copies_no_line_for_a_linked_entry` | `copyValueFor(linked, 'fullCommand')` is `undefined`; `copyValueFor(linked, 'commandRefusal')` equals `SENTENCE(name)`; `copyValueFor(linked, 'sshLink')` equals `'prod box'` | the line is copied |
| V3 | `the_viewer_wires_the_name_of_the_link` | file-text pin: `entityViewerCommands.ts` holds `sshLinkName: nameOf(storage, accountId, details.sshEntityId \|\| undefined),` | absent |

The existing viewer tests (`test/entityViewPage.test.ts:548-571`) cover the unlinked entry and must stay green unchanged.

**`test/sshLinkRoads.test.ts`** (new) — every road refuses (the shape of `test/commandNameRoads.test.ts`; use
`cleanupScope` and `after(() => scope.close())` as it does for `startVpn`). The linked entry is
`{ id: 'e1', name: 'deploy', isSshEnabled: false, isTerminal: true, command: 'echo linked', sshEntityId: 's1' }`.

| # | Test | Assertion | RED today |
|---|---|---|---|
| W1 | `the_arrow_refuses_a_linked_entry_before_any_question_even_when_trusted` | `arrowWorld({}, [['e1', 'echo linked']])`, entry also with `runDependencies: true, dependsOn: ['dep']`; after `aw.run(entry)`: `aw.warnings` deep-equals `[SENTENCE('deploy')]` (so no trust modal and no chain modal), `aw.terminals` is `[]` | the line is typed |
| W2 | `run_with_secrets_refuses_a_linked_entry_and_reads_no_secret` | `arrowWorld({}, [['e1', …]], vault.source)` with `vaultOf(['alert'])` and `commandArgs: [{ value: 'creds://me/alert/password' }]` (helpers of `commandNameRoads.test.ts:96-110`, copied); after `aw.runWithSecrets(entry)`: `aw.masked` `[]`, `vault.calls` `[]`, `aw.warnings` deep-equals `[SENTENCE('deploy')]` | a trust modal, then a child |
| W3 | `the_folder_plan_does_not_run_a_linked_row` | pure: `planFolderRun([term('a'), term('b', 'tmux attach', ARGS, { sshEntityId: 's1' })], FACTS)` (helpers of `test/folderRun.test.ts:31-45`): row `a` is `run`, row `b` is `notRun` with `reason === SENTENCE('b')` | `b` is a line row |
| W4 | `a_folder_run_types_the_other_rows_and_reports_the_linked_one` | `folderWorld([session('a'), { ...session('b'), sshEntityId: 's1' }])`, `await w.click()` (as `test/folderRunCommand.test.ts:31-40`): `named(w, 'a')` sent `[[L('a')]]`; `named(w, 'b')` is `[]`; `w.infos.concat(w.warnings).join('\n')` includes `SENTENCE('b').replace(/\.$/u, '')` | `b` is typed |
| W5 | `a_linked_step_refuses_the_whole_chain_in_the_planner` | pure: `planDependencyRun([root], graph(step, root), here)` with `step = terminal('step', 'x', { sshEntityId: 's1' })`, `root = terminal('root', 'y', { dependsOn: ['step'], runDependencies: true })` (helpers of `test/dependencyRun.test.ts:14-24`): `{ ok: false, reason: SENTENCE('step') }` | `ok: true` with a step |
| W6 | `a_linked_step_types_nothing_anywhere` | `ownerChain()` with `install.sshEntityId = 's1'`, `startVpn(scope, w, nodes)`: `started === false`; every terminal's `executed` and `sent` empty; `w.warnings` includes `SENTENCE('install openvpn')`; no warning starts with `Before ` | the chain runs `install` |
| W7 | `a_linked_launcher_starts_nothing_and_asks_nothing` | `launcherWorld('start-openvpn')` of `commandNameRoads.test.ts:200-207` (copied) with `start.sshEntityId = 's1'`: `started === false`, `w.terminals` `[]`, `w.warnings` includes `SENTENCE('start-openvpn')`, no `Run this command` modal | the launcher is typed |
| W8 | `the_agent_run_refuses_a_linked_entry_before_the_trust_check_and_the_slot` | `terminalRunAction(deps).run(ctx, {})` with a local `fakeDeps` (copy of `test/agentUseActions.test.ts:38-53`): `getNode` returns the linked entry, `trustStore.get` returns `[commandFingerprint('e1', 'echo linked')]`, `acquireExecSlot` counts calls and returns `undefined`. Body error code `not_supported`, message `SENTENCE('deploy')`, slot calls `0` | code `too_many_requests` (the slot was asked: the run would have spawned) — no process starts in the RED run |
| W9 | `copy_command_copies_nothing_for_a_linked_entry` | the `handlers()` world of `test/commandLineHandlers.test.ts:20-46` (copied): `h.copy(linkedNode)` → `h.copied` `[]`, `h.infos` `[]`, `h.warnings` deep-equals `[SENTENCE('deploy')]` | the line is copied |
| W10 | `an_unlinked_entry_runs_as_before` | the W1 entry without `sshEntityId`, trusted: `terminalNamed(aw, rootTitle('deploy')).sent` deep-equals `['echo linked']` | (green; proves the gate is not a blanket refusal) |

**`test/sshLinkHelp.test.ts`** (new; shape of `test/folderRunHelp.test.ts:14-24`)

| # | Test | Assertion | RED today |
|---|---|---|---|
| H1 | `every_language_names_the_ssh_link_with_its_english_labels` | for each of `HELP_LANGUAGES`: the `basics` body (`bodyFor`, `fallback === false`) includes `Runs over SSH` and `— Do not use —` | absent in all five |

**`test/agentKindFields.test.ts`** — item 29: `'sshEntityId'` in `WINDOW_OWNED`. It is green before and after (nothing
names the field); it is a guard for the future, and the report says so.

**Tests whose expected text changes:** none. If an existing test goes red, stop and report it to the judge; do not
edit an expected value.

### S1.5 Line budget (checked before the first edit)

| File | Now | After S1 | Ceiling |
|---|---|---|---|
| `entityFormPage.ts` | 785 | 786 | 800 |
| `entityFormScript.ts` | 791 | 791 (edit on line 690) | 800 |
| `entityViewPage.ts` | 791 | 794 | 800 |
| `commands/treeMutationCommands.ts` | 746 | 747 | 800 |
| `agentUseActions.ts` `terminalRunAction` | 48 code lines | 48 | 50 per function |
| every other file | under 700 | small additions | 800 |

### S1.6 Commands

From the repository root (`CLAUDE.md` §Commands; `common/local-cpu-budget.md`):

```bash
LP=$PWD/.agents/conventions/tools/low-priority.mjs
cd src_vs_code
node $LP npm run typecheck
node $LP npm run lint
node $LP npm run compile && node $LP node --test out/test/sshLinkGate.test.js
node $LP npm run compile && node $LP node --test out/test/sshLinkField.test.js
node $LP npm run compile && node $LP node --test out/test/sshLinkCopies.test.js
node $LP npm run compile && node $LP node --test out/test/sshLinkRoads.test.js
node $LP npm run compile && node $LP node --test out/test/sshLinkHelp.test.js
node $LP node --test out/test/entityFormPanel.test.js out/test/agentKindFields.test.js
node $LP node --test out/test/commandRoadScan.test.js out/test/commandNameRoads.test.js out/test/entityViewPage.test.js out/test/exportProtected.test.js out/test/externalBundle.test.js out/test/vpnLauncher.test.js out/test/terminalOs.test.js out/test/folderRun.test.js out/test/folderRunCommand.test.js out/test/dependencyRun.test.js out/test/agentUseActions.test.js out/test/commandLineHandlers.test.js out/test/folderRunHelp.test.js
```

The full `npm test` is run by the lead.

### S1.7 What S1 does NOT do

- It runs nothing over SSH: no ssh line, no `-t`, no remote command, no trust line, no `prepareSshSession` call. A
  linked entry only refuses.
- It does not tell apart a missing, trashed or non-SSH link: one sentence for all (S2's `sshLinkOf` does that).
- It does not change the trust store, `commandFingerprint`, `sendGuarded`, `pinnedTerminal.ts`, `maskedTerminal.ts`,
  `dependencyRunHost.ts` or `commands/folderRunCommand.ts`.
- It does not refuse *Run Script*: the scrub keeps the field on Terminal entries only (`execDetails`), so a script never
  carries a link written by this build.
- It does not stop a run already approved when a sync sets the link while a modal is open (S1-D8).
- It does not replace the hand-written `ssh -t <host> …` advice in the help and the README (E2.S1 does).
- It does not touch `research/`, `CHANGELOG.md`, the parent plan or `todo/README.md`.
- It does not translate or fix the *Runs on* label in `helpDe.ts` and `helpEs.ts` (see the note below).
- Recorded after the Opus review (four items, plain text):
  - (a) The agent's consent dialog (`credsAgentServer.ts:535`) comes before the refusal in `agentUseActions.ts`.
    E3.S2 reworks that road.
  - (b) A linked dependency STEP is refused after the root's own trust modal. This is the existing order of every
    step refusal.
  - (c) The viewer's "Command" field copy (`entityViewCopy.ts:150`) copies the raw field, like any other field.
  - (d) Running an old revision from the history (`entityViewerCommands.ts:465-481`) runs that revision as it was.
    An unlinked old revision is not linked.

### S1.8 Notes for the lead (found while writing this)

1. The parent says export strips the link "as `vpnLauncherEntityId`": export strips no reference today, and the place
   is `exportSecrets.ts:128` (`exportedNode`), not `externalBundle.ts`. S1-D7 strips on export and on import.
2. The parent's E1 file list names `entityFormPanel.ts`: only a comment changes there (the spread already writes the key).
3. The "agent-create deny-list" of §4.1 is the test list `WINDOW_OWNED`; production uses an allow-list.
4. The viewer's copy of `fullCommand` (`entityViewCopy.ts:151`) is a second Copy Command road the parent did not name.
5. The S2 spec (§S2.6, §S2.7 scan 4) expects six road call sites of the S1 refusal; S1 has eleven calls in eight files
   (S1.3, last paragraph). S2's coder must take the list from here.
6. `helpDe.ts:84` and `helpEs.ts:84` translate the *Runs on* label (*Läuft auf*, *Se ejecuta en*) against `CLAUDE.md`
   rule 7. Older than this plan; S1 does not fix it.
7. The parent's §4.1 candidates rule ("host") is narrowed to `isSafeSshTarget` so S2's scenario R8 can hold.

## S4 — Fixes owed before E1 merges (from the E1 code round and the own review, re-review of epoch 2)

E1 was built as one local commit, 782444a. Its coai code round answered `proceed` (8 of 8 reviewers). The lead's own
three reviewers (Opus: simplicity, bugs, conventions) and the round's accepted findings leave these fixes. Each is
RED-GREEN-RED. They are built on E1's branch AFTER it is rebased onto the security plan
([PLAN_windows_shell_quoting_injection.md](PLAN_windows_shell_quoting_injection.md)), which takes the security sweep
out of 782444a.

| # | Fix | Source | Proof |
|---|---|---|---|
| F1 | `trustLineFor` also carries `-A` and every enabled forward, exactly as `sshOptionArgv` composes them | coai (codex), accepted | a test changes ONLY a forward, then ONLY agent forwarding, and gets a new trust text each time |
| F2 | *Update it* on a received share keeps the RECIPIENT's own `sshEntityId` (`shareUpdateSeal.ts` `rebuilt`), and still never takes the sender's | own review (bugs) | an existing linked node + an update payload keeps its link; a payload carrying a link does not set one |
| F3 | The secrets script is read by the remote login shell: the remote command is `"${SHELL:-sh}" -s`, a named constant in `remoteLaunch.ts` | re-review consultation, measured | a bash-only line through the emulated remote with `SHELL=/bin/bash` succeeds; under `sh -s` it failed with 127 |
| F4 | Export uses `withoutSshLink` (`exportSecrets.ts`); the candidate list filters with the link decision (`sshLinkOf`, or an exported `isLinkTarget`) instead of its own copy of the checks | coai (antigravity) + own review | R2 and C1/R8 stay green; a mutation in `sshLinkOf` now changes the candidates too |
| F5 | ONE `withAcceptNew` in the pure `sshCommand.ts`, used by `sshSession.ts` and `remoteLaunch.ts`, one regex chosen and recorded | own review (simplicity) | a test with a non-bare program word |
| F6 | Small duplicates: delete `test/sshLinkGate.test.ts` (a copy of R24); `isWindowsPowerShell51` next to `shellFamily` in `hostShell.ts`; `sshDestination`/`portArgv` shared from `sshCommand.ts`; `noHostSentence` shared; `launcherId` → `otherEntityId`; the `UNLINK` constant reused; one `entityPicker` for the two pickers; `vaultOf` exported from `test/arrowWorld.ts` | own review (simplicity) | existing tests stay green |
| F7 | Text that no longer matches: comments naming `sshConnect.ts` for the password branch; "three controls" in `execFormFields.ts`; "eleven calls in eight files" → the real count; "fifteen hostile commands" → the real count; the dangling commit references; the status lines of this document, the specs and `todo/README.md`; `research/` sections for S1 (the field, its round trips, the refusal on every road) and the askpass row | own review (conventions) | `plan-lifecycle.mjs` clean; a reader can find each flow in `research/module_tests.md` |
