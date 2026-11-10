# PLAN — Terminal command over SSH, E3.S2: the authorisation of the agent's run (security spec)

> Status: **spec, nothing implemented yet, 2026-11-10.** Parent: [PLAN_terminal_command_over_ssh.md](PLAN_terminal_command_over_ssh.md)
> §2 D2, §4.4 "Agent", §9. Stories: [PLAN_terminal_command_over_ssh_E3.md](PLAN_terminal_command_over_ssh_E3.md) §S2, whose §S2.1
> lists the ten questions this file answers. A Fable security judgement (`subagent-models.md` "Security judgement", outside
> the cornerstone quota). It owns the gate, the refusal texts, the consent text, `asksAfterConsent`, the mask table, the
> bridge, the audit line and the agent's VPN start. Everything else of S2 (`execOverSsh`, the road scan, the help ×5, the
> line budget) is §S2.2–§S2.6 of the stories document and is not repeated here.
> Every path is relative to `src_vs_code/src/`; every `file:line` was opened on `de15db8` (branch `feat/terminal-command-over-ssh-e3`)
> and checked again on 454e990 (`origin/main` with E1 #335, E2 #337 and #336), where no file this spec cites moved.
> Checked a third time on e57eb80f (this branch with `main` merged, #338 the CHANGELOG): `git diff 454e990 e57eb80f --
> src_vs_code/src` is empty, so no cited source line moved, and every `file:line` of the second amendment was opened there.
> Amended 2026-11-10 by E3's plan round 1, item 6 (an Opus judge, inside this spec's own decisions): the gate is answered
> before ANY refusal that reads the link or the SSH entry, the bridge test moved before the link is read, and every
> outcome before the gate passes is the one sentence (§2.1, §2.3, §4, G13, G20, G21).
> Amended a second time 2026-11-10 (Fable) after the lead's Opus review. Each fix only makes the plan true as written; no
> decision of the owner or of the parent changes. `asksAfterConsent` asks the gate first, because the door reads it
> before `validate` (§2.2, §6, G22). Admission comes before `validate`, so a refused call is counted but raises no dialog
> (§3.3). Two rows of the prompt ledger gain `run` (§13). The target of `validate` and `summarize` stays REQUIRED and the
> fifteen test calls are listed (§5, §13). The mask builder gets its own source type (§7). The bridge table gets a `run`
> branch (§8). The wiring type is named (§6). Two lint directives are removed (§11).

## 0. The decisions, in one table

| # | Question (§S2.1) | Decision |
|---|---|---|
| 1 | The gate | `findUsableEntry(accountOnly(storage, ctx.accountId), ssh.id, 'exec')` must answer `usable`. The lookup is kept to the Terminal entry's account, so the answer's account is the Terminal entry's by construction. `'exec'` is right: it maps to the `use` rung, as `run` does (`mcpEntries.ts:404-420`); a test pins both. A PIN-protected SSH entry answers `undefined`, as a made-up id does (`:376-391`); the agent hears the one sentence of §4, the same as for a closed one. |
| 2 | No confused deputy | The SSH entry's own `Usable by agents` switch is required at EVERY call (validate and run). Its ask policy is NOT consulted: the Terminal entry's grant and policy decide how often the person is asked (§3.2 says why). A remembered Allow is not keyed on the link: the per-machine trust store is what notices a link a sync added (§3.2); keying the stamp on the link is recorded as a follow-up, not built. |
| 3 | Order and TOCTOU | The gate runs in `validate(body, target)` — before the dialog, so nobody is asked to Allow a run that will be refused and no dialog is raised for it (the call is still counted at admission, which comes before `validate`, §3.3) — and again in `run`. The summary the person saw is handed to `run` (`ctx.summary`, internal) and compared with the summary rebuilt at run time: a switch flipped while the dialog was open refuses with the one sentence; a link or target changed refuses with the "changed while the question was open" sentence. Nothing runs in either case. |
| 4 | The refusal texts | ONE sentence for every reason the gate refuses (closed, PIN-hidden, missing, in the Trash, not an SSH entry, unsafe host, self, another account): it names the Terminal entry only. The real reason goes to the agent journal (`deps.note`). `sshLinkOf`'s sentences, which name the SSH entry, never reach an agent. **The gate is answered first** (round 1, item 6): for a linked entry nothing that reads the link or the SSH entry — and no `planLaunch` — runs before it, so until the gate passes the agent reads only `not_found` (the Terminal entry is gone), `BRIDGE_NOT_SERVED` (on a bridge, for every linked entry alike) or the one sentence; a malformed line or a Windows remote on an entry whose SSH entry is not usable is the one sentence too. After the gate has passed, the SSH entry is open to the agent (`use`), and the road says what `ssh:exec` says: the jump chain's reason, `pinRefusalFor`, the woven refusal, `Could not run ssh`. `planLaunch`'s own refusals (`{name}`, D9 Windows, the line break) name only the Terminal entry and come AFTER the gate. |
| 5 | The consent text | `UseAction.summarize(body, target)` — `target: CallTarget`, REQUIRED (§5 says why it is not optional), an internal widening of `useActions.ts:139` (the `Grant` passed at `credsAgentServer.ts:530` already satisfies `CallTarget`). The linked summary is `the stored command, on the SSH connection "<ssh>" (<target>), as: <trust line>` (§5). A changed link between the dialog and the run is refused (question 3). |
| 6 | `asksAfterConsent` | Declared as a function, as `sshExecAction` does (`sshUseActions.ts:228`), but it asks the GATE first: true only when `linkedCall(deps, target, undefined)` answers `linked` and that link's SSH entry forwards the agent while the agent socket is up. For every other answer it is false, as it is for an entry with no link. The MCP door reads this flag BEFORE `validate` (`brokerMcpDoor.ts:223`), so a flag read from the link alone would tell an agent whether a closed or PIN-hidden SSH entry forwards the agent (§6, G22). Forwards (`-L`/`-R`) raise no prompt and are in the trust line the person approved: no refusal, no flag. `test/agentUseActions.test.ts:347` C.3 changes, and two rows of the prompt ledger gain `run` (§13). |
| 7 | Masking | Yes: the mask table of a call on a linked Terminal entry holds the SSH entry's values too (`maskEntriesWithLink`, §7). The SSH password can reach the remote only through the person's own `SendEnv`; the table is widened in the safe direction and at one place (the table builder), never in an action. |
| 8 | The bridge | `useRoute` (`bridgeAllowList.ts:57-66`) refuses `run` on a bridge before the body is read. Today `run` falls to its default-deny line (`:65`); it gets a branch of its own (§8). `terminalRunAction` refuses a linked entry with `ctx.bridge` set as well, fail closed, with the allow-list's own code and sentence so the two walls read the same. |
| 9 | The audit line | The finished line's `detail` is the summary (`brokerCall.ts:225`), which names the SSH entry and the target. One `note` on every gate refusal with the real reason. No extra note on success. |
| 10 | The agent's VPN start | Stays refused with E1's shared sentence (parent §9, E2-D2): `vpnLauncherRun.ts:84-86` gives an agent's start no road, and `launcherRefusal` (`:156-158`) and `stepRefusal` (`dependencyRun.ts:201-211`) still say `sshLinkRefusal`. Not changed by S2; a guard test says so. |

## 1. Words

- **T** — the Terminal entry the agent's grant names (`ctx.entityId`). **S** — the SSH entry T links to (`T.sshEntityId`).
- **The gate** — the decision "may THIS agent call run T's line over S": T is the grant's (the door's business), S must be
  usable by agents in T's account, the call is not on a bridge.
- **The one sentence** — `linkedRunRefused(entryName)` (§4): what the agent reads whenever the gate refuses.
- **The shown summary** — the string `summarize(body, target)` answered for this call before consent; the dialog shows it
  (`brokerConsent.ts:322`), the audit line carries it, and `run` receives it as `ctx.summary`.
- **Door** — the token route (`/v1/use/run`), the alias route (`/v1/alias/run`, the CLI's `run`), the MCP route
  (`/v1/mcp/use/run`, `creds_run`). All three reach `perform` (`credsAgentServer.ts:508-545`), so one gate serves all.

## 2. The check sequence

### 2.1 The gate function — `linkedCall(deps, target, bridge)` in `agentUseActions.ts` (imports no `vscode`)

```ts
type LinkedCall =
  | { kind: 'local' }                                   // no link; or the entity is gone (run answers not_found as today)
  | { kind: 'linked'; link: Extract<SshLink, { kind: 'linked' }>; found: UsableFound }
  | { kind: 'refused'; code: ErrorCode; message: string; why: string };   // `message` to the agent, `why` to the journal
```

In this order, and nothing else is read. **Nothing that reads the link's target or the SSH entry — and no `planLaunch` —
runs before `linkedCall` has answered** (round 1, item 6): `validate`, `summarize`, `run` and `forwardsAgentNow` (§6) call it first, and only its
`linked` answer lets anything else read the link.

1. `const entity = entityFor(deps, target)`; `undefined` → `local`.
2. `sshLinkOf(entity, () => undefined).kind === 'none'` → `local`. A lookup that finds nothing reads NO node: this asks
   only T's own field, "is T linked at all", the way `sshLinkRefusal` does (`remoteLaunch.ts:125-129`), through the one
   reader of the link.
3. `bridge !== undefined` → `refused` with `not_supported` and `BRIDGE_NOT_SERVED` (`bridgeAllowList.ts:22`),
   `why: 'a Remote Bridge does not serve run'`. Read only in `run` (§2.2). It stands BEFORE the link is resolved, so a
   bridged call gets the same answer whether S is missing, closed or usable: a bridge cannot probe S either.
4. `const link = sshLinkOf(entity, (id) => deps.storage.getNode(target.accountId, id))` (`remoteLaunch.ts:100-106`).
   `refused` → `refused` with `denied`, the one sentence, `why: link.reason`. This covers rows L2–L6: self,
   missing, in the Trash, not an SSH entry, unsafe address — and an S that lives in ANOTHER account, because the lookup is bound
   to T's account and answers `undefined` for it (row L3). (`none` cannot happen here: step 2 answered it.)
5. `const found = findUsableEntry(accountOnly(deps.storage, target.accountId), link.ssh.id, 'exec')`
   (`mcpEntries.ts:344-356`, `:363-371`). `found?.kind !== 'usable'` → `refused` with `denied`, the one sentence,
   `why`: `undefined` → `the SSH entry is hidden from agents (PIN) or is not in this account`; `closed` →
   `the SSH entry's "Usable by agents" switch is off`.
6. `linked` with `link` and `found`. `found.accountId === target.accountId` holds by construction (step 5's `accountOnly`);
   a test asserts it anyway.

T's own command is not looked at by the gate: an empty command, a `{name}` the composer refuses, a line break or *Runs on*
Windows on a T whose S is refused at steps 4–5 answers the one sentence (G20). They are said, naming T only, after the gate
has passed (§2.3 step 4, G21).

What is checked, said once: the Terminal entry's own grant is the door's (the MCP door's `findUsableEntry(T, 'run')` at
`mcpHooks.ts:157`; a token the person minted; an alias the person enabled). The gate adds S's own `use` switch, resolved by
`resolveMcpInTree` (folder inheritance, nothing in the Trash, `mcpAccess.ts:299-328`). A Terminal grant on T never confers
anything on S that S's own switches did not give: step 4 reads S's switches and only S's.

Reads of S per evaluation: exactly two `getNode(account, S.id)` — `linkTo` (`remoteLaunch.ts:90`) and `lookedUp`
(`mcpEntries.ts:386`). `isInTrash` and `resolveMcpInTree` read S's PARENTS, not S. Nothing after the gate reads S again:
`planLaunch(entity, link, …)` takes the gate's `link`, so `plan.ssh === link.ssh` (the same object the storage returned).

`linkedCall` is evaluated at each moment of §2.2, so up to five times in one call. Each evaluation is these two reads, from
memory, and it writes nothing. The journal note is its caller's: `validate` and `run` write it, `summarize` and
`forwardsAgentNow` do not. So one refused call writes one note (G6, G22).

### 2.2 Where the gate runs, relative to the dialog

The rows are in the order a call on the MCP door reaches them.

| Moment | Who calls | What runs | Result when refused |
|---|---|---|---|
| **asksAfterConsent** — first at `brokerMcpDoor.ts:223`, BEFORE the door's admission and so before `validate` (it decides whether a quiet call takes the dialog place, §6); again at `brokerConsent.ts:156`, when the dialog closes on Allow | the broker, with the target | `linkedCall(deps, target, undefined)` FIRST. Only on `linked`: `link.ssh.agentForward === true` and `deps.agentSocket?.() !== undefined`. No note | `false` for every answer that is not `linked`, the same bit as for an entry with no link. The refusal itself is `validate`'s |
| **validate** — `credsAgentServer.ts:561`, inside `usable()`, BEFORE `summarize` and the dialog, AFTER the door's admission (§3.3) | the broker, with the grant | `linkedCall(deps, target, undefined)` | `{ ok: false, code, message }`; the broker answers it and writes the audit line (`:566`); `deps.note(why)` from the action. No dialog is shown and no modal stamp is written; the call was counted at admission (§3.3); the grant is dropped (`:565`). |
| **summarize** — `:530` | the broker, with the grant | `linkedCall` again; `linked` → the linked summary (§5); anything else → today's words | — (a refused gate was answered in validate; the local words are returned and never shown) |
| **run** — `brokerCall.ts:203` | the broker, after consent, the launch gate and the mask table | `linkedCall(deps, ctx, ctx.bridge)` again, then the compare of §2.3 | the `refused` result; `deps.note(why)` |

The bridge test of step 3 is read in `run` only: `CallTarget` carries no bridge, and a bridged `run` never reaches the
door's flag or `validate` (`refusedOnBridge`, `credsAgentServer.ts:443`, answers before the body is read). The `run` test
is the second wall.

**The order at the door, and the sweep for the class** (the second amendment). On the MCP door the order is: the lookup
of T (`readMcpUse`, which resolves T only) → `door.asksAfter` and `door.admit` (`brokerMcpDoor.ts:223`) → `door.perform`
(`:232`) → `usable` → `validate` (`credsAgentServer.ts:561`). So `asksAfterConsent` is the FIRST code of this action that
a call reaches. The alias door admits with no flag (`credsAgentServer.ts:334`), and the local token door does not admit
(`:497` calls `perform`). The first version of this spec read the flag from the link alone ("the LINK only (no gate)").
That was a read of S before the gate, with an effect an agent can see (§6), against parent §4.4.

One instance was found, so the class was swept (security.md, *Security response protocol*). Method: `grep -n
'useAction\.\|asksAfter(\|actions\.resolve(\|actionsFor('` over `src_vs_code/src/*.ts` and `commands/*.ts`, then each
hit read in its function. The broker runs an action's own code at five places and no more: `asksAfterConsent`
(`credsAgentServer.ts:273` for the door, `:535` for the dialog's close), `validate` (`:561`), `summarize` (`:530`), `run`
(`brokerCall.ts:203`) and `describeOutcome` (`brokerCall.ts:228`, which reads the result only). `verb` and
`mutatesSecrets` are constants (`brokerConsent.ts:358-363`, `brokerCall.ts:222`). The first four call `linkedCall` before
they read anything of S. The one other reader of the link is the mask table builder (§7); §7 says when it runs and what
it can show.

### 2.3 The order inside `run`, for a linked entry

Steps 1–2 are the only ones before the gate's answer, and neither reads the link's target, S, or `planLaunch`: until step 2
answers `linked`, the agent reads `not_found`, `BRIDGE_NOT_SERVED` or `linkedRunRefused(T)` and nothing else (§4,
*Before the gate*).

1. `entityFor` → gone → `not_found`, today's words (`agentUseActions.ts:200-202`).
2. **The gate** (§2.1, with `ctx.bridge`). Refused → its result, after `deps.note(journalLine(ctx.entityName, why))`.
3. **The compare.** `const shown = ctx.summary; const now = linkedSummary(linked, entity)`. `shown !== undefined && shown !== now`
   → `fail('denied', changedWhileAsking(ctx.entityName))`. A test world that passes no `summary` skips the compare.
4. `const plan = planLaunch(entity, linked.link, { stayOpen: false })`. `empty` → `"<T>" has no command.` (today's words).
   `refused` → `fail('not_supported', refusalSaid(entity, plan.reason))` (§S2.3): only `{name}`, D9 Windows and the line
   break can reach here, because a link refusal was answered at step 2 and the same `link` object is passed.
5. `const chain = resolveJumpChain(plan.ssh, (id) => deps.storage.getNode(ctx.accountId, id)?.details)`; not ok →
   `fail('no_credential', chain.reason)` — the words `ssh:exec` uses (`sshUseActions.ts:266-269`).
6. `isCommandTrusted(deps.trustStore, ctx.entityId, trustLineFor(plan.ssh, chain.value, plan.line))` false →
   `untrusted(ctx.entityName, 'the line')` (`agentUseActions.ts:108-113`).
7. The slot; `too_many_requests` as today.
8. `deps.overSsh(ctx, { ssh: plan.ssh, jump: () => chain, remoteCommand: plan.remoteCommand, timeoutMs: clampExecTimeout(undefined) })`
   in `try … finally release()` (§S2.2). Everything from `resolveExecAuth` on is `execOverSsh`'s and is `ssh:exec`'s body.

For an UNLINKED entry (`local`) step 3 still runs — `linkedSummary` answers today's words for it, so it passes for an
entry that was unlinked when the dialog stood, and refuses one whose link was removed while it stood (§2.4 row 4,
G10 (c)) — and then the road is today's `runHere` (§S2.2), byte for byte in behaviour. (Corrected 2026-11-10 while
applying round 1: this line said steps 2–3 are skipped, which contradicted §2.4 and G10 (c).)

### 2.4 A switch or a link flipped while the dialog is open

| What changed while the dialog stood | What the person saw | What `run` does | What the agent reads |
|---|---|---|---|
| S's `Usable by agents` turned off (a sync, another window) | the dialog named S and its target | step 2 refuses | the one sentence, `denied` |
| T's link moved to S2 (open to agents) | the dialog named S | step 3: the rebuilt summary names S2 → refused | `changedWhileAsking(T)`, `denied` |
| S's host, user, port, jump or a forward changed | the dialog named the old target and trust line | step 3 refuses (the trust line differs) | `changedWhileAsking(T)` |
| T's link removed | the dialog named S | step 2 answers `local`; step 3 compares the local words with the shown linked words → refused | `changedWhileAsking(T)` |
| T's command changed | the dialog's trust line quoted the old line | step 3 refuses; and step 6 would refuse too (a new line is untrusted until a person runs it) | `changedWhileAsking(T)` |
| nothing | — | the compare is equal; the run goes on | the outcome |

The compare is the agent road's "one snapshot" (parent §4.4): the person's roads build the typed line from the prepared
snapshot the trust modal named; the agent's run has no snapshot across the broker's dialog, so it refuses when the two reads
differ, as the folder run does for a row that changed while its modal was open (parent §4.4 "Folder run"). The second call
shows the new state in its own dialog.

## 3. The ten questions — decision and reason

### 3.1 The gate (question 1)

- **`accountOnly`.** `findUsableEntry` searches every account (`mcpEntries.ts:349-354`) because an agent names an id with no
  account. Here the account is known: T's. An S in another account is NOT T's SSH connection, whatever its switches say, and
  a vault with two accounts could hold two nodes with one id only by a sync fault — the search must not find the other one.
  So the lookup is narrowed, as a Remote Bridge's is (`mcpHooks.ts:157`). `sshLinkOf` already refuses such an S as missing
  (row L3), so step 4 cannot see one; `accountOnly` is the second wall and costs nothing.
- **The rung.** `switchForAction('exec') === 'use'` and `switchForAction('run') === 'use'` (`mcpEntries.ts:404-420`). `'exec'`
  is passed because D2 says *open to the agent for exec*: the question asked of S is "may an agent exec on you", which is
  exactly the verb S answers for itself. The `UsableEntry` carries the action it was decided for (`:327-330`); here it is
  carried into nothing (no stamp is written for S), so the choice has no second effect. A test pins the two rungs equal, so a
  future table change that splits them turns red here.
- **A PIN-protected S** answers `undefined` (`:376-391`: *"Closed" would tell an agent the entry exists*). The agent hears the
  one sentence, which is what a closed S gives too. The agent cannot tell PIN from closed from missing from Trash (§4).
- **The Trash** is refused twice: `sshLinkOf` row L4 (`remoteLaunch.ts:54-56`) and `resolveMcpInTree` (`mcpAccess.ts:305-315`).
  Both are kept; one sentence covers both.

### 3.2 No confused deputy (question 2)

- **S's switch is required, at every call.** The Terminal grant says "run T's line"; running it over S uses S's credential.
  D2 makes S's own `Usable by agents` the condition, and the gate re-reads it in `run`, so an Allow given while S was open
  cannot carry a run after S was closed.
- **S's ask policy is not consulted; T's governs.** Reasons: (a) what runs is T's FIXED line, approved by a person on this
  machine (step 6); S's `always` protects S against FREE commands (`ssh:exec`), which this road cannot issue — an agent that
  wants a free command on S must call `creds_exec` on S and meets S's policy there; (b) the dialog, its coverage and
  `preConsented` are decided per grant by the door BEFORE the action exists (`brokerMcpDoor.ts:219`, `mcpHooks.ts:157-186`),
  from the entry the grant names; a cross-entry policy would make the MCP lookup read Terminal links — a second reader of the
  link outside `remoteLaunch.ts`, which the road scan exists to resist — and would have to invent an answer for the token
  and alias doors, which have no policy at all; (c) every element is the person's: they opened S to agents, they linked T to
  S, they set T's policy, they ran the trust line once. The alternative ("the stricter of the two") is recorded in §16 as a
  possible later plan, not built. The help sentence of §S2.3 already says only *Usable by agents*, which is true.
- **The remembered Allow is not keyed on the link.** The stamp is per entry and per ladder (`stampKey`, `ladderKey`,
  `mcpConsentPolicy.ts:92-`, `mcpAccess.ts:591-593`). Scenario: a person Allows `run` on T (unlinked, `every12h`); a sync
  links T to an open S; within twelve hours the agent's `run` is quiet. The run reaches step 6: the trust line
  `ssh … -- user@host '<line>'` is NOT in this machine's trust store — a sync cannot write trust — so the run is refused as
  untrusted until a person runs T over S from the tree on this machine. That person's run is the moment a person sees the
  target. So the quiet window alone cannot run a line on a host nobody here approved. Putting the link into the stamp's
  fingerprint is the same class as *A change of the entry's type keeps the window*
  ([PLAN_consent_coverage_per_door.md](PLAN_consent_coverage_per_door.md) §5.1): a stamp behaviour change with its own plan.

### 3.3 The order and TOCTOU (question 3) — §2.2 to §2.4

Why `validate` and not only `run`: `credentialExportEnvAction` refuses in `validate` for the stated reason *a person is never
asked to allow something that will be refused* (`agentUseActions.ts:251-254`, `test/agentUseActions.test.ts:298-299`). Why
`run` again: the switch is live data, and `run` is the only place that reads it at the moment of use. Why not the door: the
door resolves T only (`readMcpUse`), knows nothing of links, and the token and alias doors have no lookup to extend.

**What a refused call costs** (corrected by the second amendment: the first version said *a refused call costs no prompt of
the throttle*, which is not what the code does). Admission comes BEFORE `validate` on the two throttled doors: the MCP
door admits at `brokerMcpDoor.ts:223` and calls `perform` at `:232`; the alias door admits at `credsAgentServer.ts:334` and
calls `perform` at `:350`; `validate` is inside `perform` (`:526` → `usable` → `:561`). So a call that the gate refuses is
admitted first, as every refused call is:

- An asking call is counted in its door's asking window (`aliasThrottle.ts:395-399`) and holds the one dialog place until
  its refusal is answered (the door's `finally`, `brokerMcpDoor.ts:233-235`).
- A quiet call is counted in its door's silent window (`aliasThrottle.ts:377-379`).
- The local token door is not throttled (`credsAgentServer.ts:497`).

What the refused call does NOT cost: no dialog is raised, so the person is not asked, and no modal stamp is written. The
modal window is stamped only by `prompted`, when a dialog is shown (`aliasThrottle.ts:411-421`). The count at admission
does not depend on S: it is taken from T's own policy (`brokerMcpDoor.ts:219`) and from the flag of §6, which is `false`
for every S the gate refuses.

### 3.4 The refusal texts (question 4) — §4

Naming `"<ssh>"` would leak: S's name is visible to agents only when S has `view` (`mcpEntries.ts:139-142`), and the gate
refuses exactly when S is closed, hidden or gone. So no sentence before the gate names S, S's folder, S's host, the Trash, the
PIN, or the account. One sentence for all eight reasons: an agent probing ids learns nothing beyond "T is linked, and I may
not run it" — which it may know, since T is open to it. The fact *T runs over SSH* is a property of T, as `command` is.

### 3.5 The consent text (question 5) — §5

### 3.6 `asksAfterConsent` (question 6) — §6

### 3.7 Masking (question 7) — §7

### 3.8 The bridge (question 8) — §8

### 3.9 The audit line (question 9) — §9

### 3.10 The agent's VPN start (question 10) — §10

## 4. The exact sentences

Each lives once, as an exported function in `agentUseActions.ts`; tests compare with the function, never with retyped text.

| Name | Code | Text |
|---|---|---|
| `linkedRunRefused(name)` | `denied` | `"<name>" is set to run over an SSH connection that is not open to agents, so nothing ran. A person can run "<name>" from the CredsForDevs tree to see why, and can open that SSH connection to agents in its Agent access section.` |
| `changedWhileAsking(name)` | `denied` | `"<name>" or its SSH connection changed while the question was open, so nothing ran. Ask again: the next question shows the new target.` |
| `journalLine(name, why)` | — (a `note`) | `creds_run — "<name>": <why> (the agent was told only that the SSH connection is not open to it)` |

Rules the texts obey:

- **Before the gate** (round 1, item 6). For a linked T, every outcome decided before `linkedCall` answers `linked` is
  one of exactly three, whatever else is wrong with T or S:

  | Outcome before the gate passes | Code | Message | Test |
  |---|---|---|---|
  | T is gone | `not_found` | today's `"<T>" no longer exists in the vault.` | (today) |
  | the call is bridged (`run` only) | `not_supported` | `BRIDGE_NOT_SERVED` | G13 |
  | anything else: S missing, in another account, in the Trash, not an SSH entry, an unsafe host, self, closed, PIN-hidden — and, on such an S, T's empty command, its `{name}` refusal, a line break or *Runs on* Windows | `denied` | `linkedRunRefused(T)` | G2–G5, G20 |

  No `sshLinkOf` sentence, no `planLaunch` sentence and no `chain.reason` is reachable before the gate passes. In
  `validate` (no bridge) only the first and the third exist.
- `linkedRunRefused` has ONE parameter and names ONE entry. A structural test asserts `linkedRunRefused.length === 1` and
  that the text holds exactly two quoted names, both `<name>`.
- The code is `denied` (403), not E1's `not_supported` (404): the CLI reads a 404 as *this window does not have the entry*
  and walks on to the next window (`useActions.ts:132-136`), which is wrong for a refusal every window gives the same.
  `test/sshLinkRoads.test.ts:163-184` (W8) changes its expected code and message (§13).
- After the gate has passed, the sentences are `ssh:exec`'s: `chain.reason` (`sshOptions.ts:130-154`, may name a hop),
  `pinRefusalFor(S.name)`, the woven refusal, `"<S>" has no stored password or key any more.`, `Could not write the stored
  key to disk: …`, `Could not run ssh: …` (`sshExecAuth.ts:55-159`, `sshUseActions.ts:287`). S is `usable`, so its name is
  the agent's to read; a hop's name is what `ssh:exec` already says to an agent holding a grant on S. Parity, recorded.
- `planLaunch`'s sentences (`{name}`: `"<T>" will not run: <reason>`; D9: `"<T>" is written for Windows and is set to run
  over SSH. …`; the line break: `"<T>" has a line break in its command, …`, `remoteLaunch.ts:174-184`) name T only and come
  after the gate (§2.3 step 4). Code `not_supported`, as today for `{name}`. Each is said ONLY when S is usable (G21);
  on an S the gate refuses, the same T reads the one sentence (G20).
- `sshLinkRefusal`'s sentence (`remoteLaunch.ts:125-129`) is no longer said by this road; `launchRoadScan.test.ts:189-195`
  loses `agentUseActions.ts:terminalRunAction` (§S2.3).

## 5. The consent text and the interface change (internal)

**The change.** `useActions.ts:139` becomes `summarize(body: unknown, target: CallTarget): string`, and `:137`
`validate(body: unknown, target: CallTarget): …`. Both call sites are in `credsAgentServer.ts`: `:530`
`useAction.summarize(body, grant)` and `:561` `useAction.validate(body, grant)`. `Grant` (`grantRegistry.ts:21-27`) has
`accountId`, `entityId`, `entityName`, so it is a `CallTarget` (`useActions.ts:17`) — `asksAfter(useAction, grant)` at `:535`
already relies on that. Every other action keeps its one-parameter IMPLEMENTATION (TypeScript accepts an implementation
with fewer parameters). A CALL with one argument does not compile any more; §13 lists the fifteen test calls that gain the
second argument. `UseAction` is an internal interface: `contract/broker-v1.json` names routes and bodies, not this method,
so no contract changes. This is the shape E3.L flag 2 asked this spec to choose.

**The target is REQUIRED, not `target?: CallTarget`** (decided in the second amendment). Reasons:

1. The target is what the gate is asked about. With an optional target, "the gate runs before the dialog" is a thing each
   call site must remember: a measure applied at some of its sites (security.md). A required parameter puts it on the one
   road in: a call that forgets the target does not compile. This file and its funnel already do the same for every input
   that a caller must not forget: `signal` (`useActions.ts:33-40`), `mutatesSecrets` (`:102-119`) and `caller`
   (`credsAgentServer.ts:513-517`, `brokerMcpDoor.ts:94-98`).
2. An optional target needs a meaning for "absent", and no meaning is good. If an absent target passes `validate`, the
   person is asked to allow a run that `run` then refuses, and the dialog shows the local words for a linked entry, which
   D2 forbids (*the consent dialog names the SSH entry*). If an absent target refuses, the compiler could have said so
   first. An absent target must never give an agent more, and the sure way to hold that is that it cannot exist.
3. The cost is small and is not a behaviour change: fifteen calls in four test files gain one argument, and no expected
   value changes. The broker's two call sites already hold the grant.

`run`'s gate does not depend on this choice: `ctx` is required today, and `run` asks the gate again whatever `validate` did.

**The second internal field.** `UseActionContext` (`useActions.ts:29-64`) gains
`readonly summary?: string` — *the summary `summarize` answered for this call before consent; the dialog showed it, or it
was computed for a call a policy settled. Absent for a start that serves no request.* `brokerCall.ts:203` sets it from
`call.summary` (already in `CallSubject`). Only the linked run reads it (§2.3 step 3).

**The text.** `linkedSummary(linked, entity)`:

| Case | Summary |
|---|---|
| unlinked, or the entity is gone, or the gate refused (validate has already answered) | `the stored command, as its Run button would type it` (today, `agentUseActions.ts:196`) |
| linked, `planLaunch` is `remote`, the chain resolves | `the stored command, on the SSH connection "<S.name>" (<target>), as: <trustLineFor(plan.ssh, chain.value, plan.line)>` |
| linked, but the plan is `empty`/`refused` or the chain does not resolve (run will refuse at step 4 or 5) | `the stored command, on the SSH connection "<S.name>" (<target>)` |

`<target>` is `describeSshTarget(plan.ssh)` (`sshCommand.ts:194-202`: `user@host`, `:port` when not 22); it is defined because
`sshLinkOf` row L6 refused an unsafe address. The jump is in the trust line's `-J`, agent forwarding in `-A`, each enabled
forward in `-L`/`-R`, exactly as `sshOptionArgv` composes the launch (`remoteLaunch.ts:231-240`). So the dialog shows the
person the very text they approved from the tree, on the host it names, and D2's *names the SSH entry and says the line runs
there* is true as written. The summary never holds a key path, a known_hosts path, a program word or an environment value
(none is in the trust line).

## 6. `asksAfterConsent`, `-A` and forwards

- `terminalRunAction` declares `asksAfterConsent: (target) => forwardsAgentNow(deps, target)`. `forwardsAgentNow` asks
  the gate FIRST: `const call = linkedCall(deps, target, undefined)`; it answers `true` only when `call.kind === 'linked'`
  and `call.link.ssh.agentForward === true` and `deps.agentSocket?.() !== undefined`. For `local` and for `refused` it
  answers `false` and reads nothing more. It writes no note (the refusal and its note are `validate`'s). The two facts
  after the gate are the ones `sshExecAction` reads (`sshUseActions.ts:228`), because the signing prompt of a forwarded
  agent arrives through the socket after the Allow and the broker must keep the one dialog place for it
  (`useActions.ts:120-128`). It reads `agentForward` from the gate's own `link`, so it adds no read of S.
- **Why the gate first** (the second amendment). The flag is read at two moments: when the dialog closes on an Allow
  (`brokerConsent.ts:155-157`), and once BEFORE `validate`, at the MCP door's admission (`brokerMcpDoor.ts:223`,
  `credsAgentServer.ts:273`). At the door the bit decides how a QUIET call is admitted (`aliasThrottle.ts:346-349`,
  `:360-379`): with `true` the call must take the one dialog place, so it is answered *busy* when another call holds the
  place; with `false` it takes nothing and goes on to `validate`. A call is quiet by T's own policy alone
  (`brokerMcpDoor.ts:219`). So an agent with a quiet grant on T could hold the place with a second call and read the bit
  of S from *busy* against the one sentence. A flag read from the link alone answers `true` for an S that is closed, or
  PIN-hidden, and forwards the agent: that tells the agent a fact about an S it may not use, before the gate, against
  parent §4.4 and D15. With the gate first, the bit is `false` for every S the gate refuses, the same as for a T with no
  link, and it is `true` only for an S that is usable by this agent. G22 holds this, with a positive control.
- `AgentUseDeps` gains `agentSocket?: () => string | undefined` (optional). `agentDeps` spreads `sshDeps`
  (`extension.ts:623`, `:629-630`, §E3-D9), which carries it (`sshUseActions.ts:398`); the test worlds leave it out and
  read `false`.
- **The wiring type is named.** `sshDepsFor` returns `SshUseDeps` today (`sshUseActions.ts:383-389`). E3-D9 adds `overSsh`
  to the record it returns, and `terminalRunAction` requires `overSsh`. With today's return type the typecheck fails at
  two places (measured with the repository's TypeScript 5.9.3 on a reduced copy): the extra field in the returned literal is
  an excess property (TS2353), and the spread `agentDeps` (`extension.ts:629-637`) has no `overSsh` in its type, so
  `terminalRunAction(agentDeps)` (`:639`) is refused (TS2345). So `sshUseActions.ts` exports
  `export type SshWiredDeps = SshUseDeps & { readonly overSsh: OverSsh }`, and `sshDepsFor` returns `SshWiredDeps`.
  `sshExecAction(sshDeps)` and `sshTerminalAction(sshDeps)` take it unchanged (it is an `SshUseDeps`). `extension.ts` does
  not change for this: it names no type there.
- Port forwards: no refusal and no flag. A forward is part of the launch `buildSshExecArgv` composes for `ssh:exec` today
  (`sshExecCommand.ts:121`), it raises no prompt, and it is in the trust line the person approved (parent §4.2, epoch 2:
  *a forward or `-A` applies to the launch, so a synced change that adds one must ask again*). A forward added after the
  approval changes the trust line → step 6 refuses as untrusted.
- `-A` itself: allowed as on `ssh:exec` (the socket is the extension's own agent, `agentAwareLaunch`, `sshUseActions.ts:95-109`);
  on a bridge the whole call is refused (§8), so `AGENT_FORWARD_REFUSED` is never needed here.

## 7. The mask table

`credsAgentServer.respond` masks every response with the GRANT's table (`credsAgentServer.ts:588-595`,
`maskEntriesFor(storage, grant.accountId, grant.entityId)` at `extension.ts:516`). The grant is T's; S's password and key are
not in it.

**Decision: the table of a call on a linked T holds S's values too.** Why: (a) parity — a `creds_exec` on S masks S's
password; T-over-S uses the same credential and must not mask less; (b) the SSH password rides the LOCAL ssh child's
environment through askpass (`sshExecAuth.ts:88-97`), which ssh sends nowhere by default, but a person's own `~/.ssh/config`
with `SendEnv` can forward it (E3 "What E3 does NOT do": no `SendEnv` control; `-o SendEnv=-NAME` was measured not to
remove a wildcard, `research/PLAN_windows_shell_quoting_injection.md` §8, the owner's accepted limit, E3-D8), and a stored line could then print it; (c) it
is widened at ONE place, the table builder, never in an action (`agentUseActions.ts:90-97` says why an action must not mask).

**How.** `maskEntries.ts` gets `export async function maskEntriesWithLink(source, accountId, entityId)`: T's table from
`maskEntriesFor` (which still throws `MaskSourceUnavailable` when T is gone, `:72-76`), then — when
`sshLinkOf(details, (id) => source.getNode(accountId, id))` is `linked` — S's table from `maskEntriesFor(source, accountId,
link.ssh.id)` appended. `sshLinkOf` is the one reader of the link, so `launchRoadScan.test.ts`'s `ALLOWED_LINK_READS` (`:113`)
does not change.

**The source type** (corrected by the second amendment). `sshLinkOf` needs a lookup that answers a `TreeNode`
(`NodeLookup`, `remoteLaunch.ts:34`), and `SecretSource.getNode` answers only `{ details? }` (`maskEntries.ts:29`). The
first version widened `SecretSource.getNode` to `TreeNode | undefined`. That breaks `test/maskEntries.test.ts`: its stub
is a `SecretSource` whose `getNode` answers `{ details }` with no `id`, `name` or `type` (`:32-34`). So `SecretSource`
is NOT changed, and `maskEntriesWithLink` has its own source type:

```ts
/** What the linked table reads: a `SecretSource` whose node is a whole tree node, because `sshLinkOf` walks it. */
export interface LinkedSecretSource extends SecretSource {
  getNode(accountId: string, id: string): TreeNode | undefined;
}
export async function maskEntriesWithLink(source: LinkedSecretSource, accountId: string, entityId: string): Promise<readonly MaskEntry[]>;
```

An interface that narrows the method, not the intersection `SecretSource & { getNode(…): TreeNode | undefined }`. Measured
with the repository's TypeScript 5.9.3 on a reduced copy: on that intersection a call of `getNode` takes the FIRST
signature and still answers `{ details? } | undefined`, so the lookup for `sshLinkOf` does not compile (TS2322). The
interface compiles, a `LinkedSecretSource` is accepted where `maskEntriesFor` wants a `SecretSource`, and
`StorageManager` is one (`storageManager.ts:409` answers `TreeNode | undefined`). `test/maskEntries.test.ts` is not
edited.

`extension.ts:516` changes in place to `maskEntriesWithLink(storage, accountId, entityId)`. The import on `:69` names
BOTH functions: `maskEntriesFor` stays for the clipboard scan (`:710`). No line is added; the ratchet holds. An S that is
missing or refused by `sshLinkOf` adds nothing and throws nothing: the run is refused by the gate anyway. A value under
`MIN_MASKABLE_LENGTH` (8, `secretMasker.ts:28`) is not masked, as today.

**When the builder runs, and what it can show.** The broker reads the table after `validate` (`credsAgentServer.ts:561`
comes before `:588`) and before `run`. So in a call that reaches it, `validate`'s gate has answered `linked` or `local`.
The builder is not a gate and gives the agent no answer: it only replaces values in the response. It reads the link
again, without the gate, so there is one narrow case: a link added, or an S closed, while the dialog stood. Then the
table can hold values of an S that `run`'s gate refuses. The builder adds nothing to the answer. It could change the
refusal text only if that text already held a value of S, and the text holds only fixed words and T's name. So the agent
reads the one sentence as in every other case. This is recorded, not changed (§16 item 8).

What the table does NOT need: the key file's path (not a secret; the remote never sees it), the known_hosts file.

## 8. The bridge

- The first wall: `bridgeAllowList.ts:57-66` refuses `POST …/run` on every prefix with `not_supported` and
  `BRIDGE_NOT_SERVED` before the body is read (`refusedOnBridge`, `:120-134`, called at `credsAgentServer.ts:443`). The table
  says *run waits for E3*; E3 decides: **`run` stays refused on a bridge.** A stored line that runs over SSH from the laptop
  is a laptop-side action a server's agent has no business starting, and the stored line's `creds://` references would need
  the scope wall; neither is in this plan (parent §7a, §9).
- The second wall: step 3 of §2.1, read in `run`: `ctx.bridge !== undefined` → `fail('not_supported', BRIDGE_NOT_SERVED)`.
  The same code and sentence as the table, so an agent cannot tell which wall answered, and the journal says which (`why`).
- **`run` gets a branch of its own in `useRoute`** (corrected by the second amendment). The first version changed the
  `why` text of `bridgeAllowList.ts:65`. That line is the default-deny answer for EVERY action of `USE_ACTIONS` (`:44`)
  that is not served and is not `exportEnv`: `terminal`, `run`, `up` and `down`. A text about `run` there would be false
  for the other three. So `useRoute` (`:57-66`) gets one more branch before the default line:
  `if (action === RUN_ACTION) { return refused(path, 'a stored line runs from the person\'s machine only; E3 decided
  (PLAN_terminal_command_over_ssh_E3_S2_security.md §8)'); }`, with `const RUN_ACTION = 'run';` beside `EXPORT_ACTION`
  (`:47`). The code and the message stay `not_supported` and `BRIDGE_NOT_SERVED` (the defaults of `refused`, `:53-54`).
  The default line (`:65`) loses its last words and reads `'not named by the parent plan; default deny decides'`. The
  header comment (`:16`) says *`run` stays refused: E3 decided that a stored command runs from the person's machine
  only* in place of *`run` waits for E3, which decides where a stored command runs*. `useRoute` then has a complexity of
  4 (3 today, measured), which is the limit. `bridgeAllowList.test.ts` reads the table, not the words (`:115` asks only
  that every `why` is longer than ten characters); G13 holds the two texts.

## 9. The audit line

- The finished call's line: `where.detail` is the summary (`brokerCall.ts:225`), outcome `exit N` / `timed out`
  (`describeOutcome`). With §5 the line of a linked run reads `… · run · exit 0 · the stored command, on the SSH connection
  "prod box" (deploy@prod.example), as: ssh -- deploy@prod.example 'echo linked'`. Nothing more is needed on success.
- Every gate refusal: `deps.note(journalLine(ctx.entityName, why))` — the real reason, once. The broker's own refusal line
  (`respondError`, `credsAgentServer.ts:734-744`) carries the one sentence the agent read; the two lines together say what
  the agent asked, what it was told, and why.
- `resolveExecAuth`'s warning and the key-file note stay `execOverSsh`'s (`sshUseActions.ts:169-175`, `:207-219`).

## 10. The agent's VPN start (parent §9) — stays refused

`creds_vpn_up` → `vpnAction` → `deps.open` (`agentUseActions.ts:400-423`) → the VPN start with NO `sshRoad`
(`vpnLauncherRun.ts:83-86`: *No road (an agent's start) is no link*). The local launcher road says `launcherRefusal` =
`sshLinkRefusal(launcher) ?? …` (`:156-158`); a linked chain step on a road with no vault says `stepRefusal`'s first line
(`dependencyRun.ts:201-211`). Both keep E1's shared sentence. Why it stays: D2 opens `creds_run` only; a VPN start types into
a terminal the person owns (the elevation prompt is theirs), its launcher may hold `{config}` (a local file), and the chain
runs steps the agent never named — opening it is its own authorisation decision (parent §9). This spec changes nothing
there, and §13 G16 is the guard that stays green.

## 11. The brief — the authorisation part (the rest is §S2.3)

| File | Change |
|---|---|
| `useActions.ts` | `validate(body, target: CallTarget)`, `summarize(body, target: CallTarget)` (`:137`, `:139`), both parameters REQUIRED (§5); `UseActionContext.summary?: string` (`:29-64`) with the doc of §5. Doc of `validate`: *Reject a malformed body — or a target this window refuses on purpose (`credentialExportEnvAction`; the linked run's gate) — before any dialog or side effect.* Doc of `asksAfterConsent` (`:120-128`): its last sentence says today that `run` keeps nothing; it then says *`run` on some entries only: a Terminal entry whose linked SSH entry is usable by the agent and forwards the agent while the agent socket is up*, and *`query`, a stored script, a `run` with no such link and a non-forwarding `exec` keep nothing once the dialog closes*. |
| `credsAgentServer.ts` | `:530` `useAction.summarize(body, grant)`; `:561` `useAction.validate(body, grant)`. Two in-place edits; the file is at 793 of 800. |
| `brokerCall.ts` | `:203` adds `summary: call.summary` to the context object. |
| `agentUseActions.ts` | `AgentUseDeps` gains `agentSocket?`; `linkedCall`, `linkedSummary`, `forwardsAgentNow`, `linkedRunRefused`, `changedWhileAsking`, `journalLine` (exported); `terminalRunAction`'s `validate`, `summarize`, `asksAfterConsent` and the `run` dispatcher of §2.3 (each function ≤ 50 lines, complexity ≤ 4). REMOVE the directive `// eslint-disable-next-line complexity` at `:197`: today's `run` has a complexity of 10 (measured), the dispatcher has at most 4, and a directive that suppresses nothing fails lint (`eslint.config.mjs:20`, `reportUnusedDisableDirectives: 'error'`). Imports `findUsableEntry`, `accountOnly`, `UsableFound` from `./mcpEntries`; `BRIDGE_NOT_SERVED` from `./bridgeAllowList`; `describeSshTarget` from `./sshCommand`; `BridgeContext` type. After §S2.3's ~490 lines, about 560; ceiling 800. |
| `sshUseActions.ts` | `export type SshWiredDeps = SshUseDeps & { readonly overSsh: OverSsh }`; `sshDepsFor` (`:383-389`) returns `SshWiredDeps` (§6). REMOVE the directive `// eslint-disable-next-line max-lines-per-function` at `:221` when lint names it: `sshExecAction` has 71 code lines today (measured, limit 50) and about 47 after §S2.2 moves `:260-291` into `execOverSsh`. The directive at `:245` (`complexity`, on `run`: 8 today) stays only if lint still needs it. The rule for all three: run `npm run lint`, remove every directive it reports as unused, and add no new one. |
| `maskEntries.ts` | `LinkedSecretSource` and `maskEntriesWithLink` (§7). `SecretSource` is not changed. Imports `TreeNode` (type) from `./types` and `sshLinkOf` from `./remoteLaunch` (pure, no `vscode`). |
| `extension.ts` | `:516` and `:69` in place (§7). Not one line longer. |
| `bridgeAllowList.ts` | The `run` branch in `useRoute`, `RUN_ACTION`, the default line's `why` and the header comment (§8). |
| `test/agentSshWorld.ts` (new, not a suite) | the fixture of §12. |
| `test/agentSshGate.test.ts` (new) | §13. |
| `test/promptSiteLedger.ts` | `:186` and `:187`: the two signing rows gain `run` (§13). No row is added, removed or renamed. |
| `test/agentUseActions.test.ts`, `test/sshLinkRoads.test.ts`, `test/promptSites.test.ts`, `test/launchRoadScan.test.ts` | §13 "existing tests". |
| `test/useActions.test.ts`, `test/sshUseActions.test.ts`, `test/agentUseActions.test.ts`, `test/rotateAction.test.ts` | §13 "existing tests whose calls change": fifteen calls gain the target. |

Not changed: `mcpEntries.ts` (the parent's scope names it for `findUsableEntry` on S; the function is used, not changed),
`brokerMcpDoor.ts`, `aliasThrottle.ts`, `brokerRequests.ts`, `mcpHooks.ts`, the stamp, `brokerConsent.ts`, `sshExecAuth.ts`,
`sshExecCommand.ts`, `test/maskEntries.test.ts`.

The numbers above were measured on e57eb80f with the repository's ESLint 10.13.0 and its own rules (`max-lines-per-function`
with blank lines and comments skipped; `--no-inline-config` to see the functions a directive hides). The outer
`terminalRunAction` (`agentUseActions.ts:188-238`) has 48 code lines of its 50; its `run` (`:198-236`) has 37.

## 12. The fixture — `test/agentSshWorld.ts`

Built against the REAL validators, once, at load (testing.md: a fixture the code rejects proves nothing):

```ts
/** An SSH entry open to agents for use: `sshNode` (the real link target) with the one switch the gate reads. */
export function usableSsh(id: string, extra: Partial<EntityMetadata> = {}): TreeNode {
  return sshNode(id, { mcp: { view: true, use: true }, ...extra });   // test/sshRoadWorld.ts:18-21
}
/** The storage the gate reads: one or more accounts, nodes by account; records every `getNode` call. */
export function agentStorage(byAccount: Record<string, readonly TreeNode[]>): AgentStorage;  // getAccounts, getNode, getDbConnection, calls: [account, id][]
/** Load-time proofs. */
assert.equal(findUsableEntry(agentStorage({ 'acct-1': [usableSsh('s1')] }), 's1', 'exec')?.kind, 'usable');
assert.equal(isLinkTarget(usableSsh('s1'), () => undefined), true);
assert.equal(switchForAction('exec'), 'use'); assert.equal(switchForAction('run'), 'use');
```

`LINKED` = `{ id: 'e1', name: 'deploy', isSshEnabled: false, isTerminal: true, command: 'echo linked', sshEntityId: 's1' }` as
a node `{ id: 'e1', name: 'deploy', type: 'entity', details: LINKED, parentId: null }`. `TRUST` =
`trustLineFor(s1.details, undefined, 'echo linked')`. `ctx` = `{ accountId: 'acct-1', entityId: 'e1', entityName: 'deploy',
signal }`. `deps` = `fakeDeps` of `test/agentUseActions.test.ts:38-53` plus `storage: agentStorage(…)`, a recording `overSsh`
(answers `{ status: 200, body: { exitCode: 0, stdout: 'ok', stderr: '', stdoutTruncated: false, stderrTruncated: false,
timedOut: false, durationMs: 1 } }`), `trustStore` with `commandFingerprint('e1', TRUST)`, a recording `note`, and
`agentSocket` where a test says so. §S2.5 uses `usableSsh` and `agentStorage` too.

## 13. Scenarios — RED first

Write each test, run it, watch it fail for the reason in "RED today", then build. For a new export, first add a stub that
answers the wrong thing (`return ''`, `return { kind: 'local' }`) so the test fails on its assertion, not on a missing name.
`ONE` = `linkedRunRefused('deploy')`, read from the function.

**`test/agentSshGate.test.ts`** (new)

| # | Test | Assertion | RED today |
|---|---|---|---|
| G1 | `a_usable_ssh_entry_lets_a_trusted_linked_run_through_the_gate` | `usableSsh('s1')`, trusted on `TRUST`: `run` answers `overSsh`'s result; `overSsh.calls.length === 1`; `calls[0].ssh === storage's s1.details` (`===`); `notes` holds no `creds_run —` line. The positive control of this file. | E1's sentence |
| G2 | `a_terminal_grant_never_opens_an_ssh_entry_that_is_closed_to_agents` | S = `sshNode('s1', { mcp: { view: true } })` and S = `sshNode('s1')` (no `mcp`): both `denied` with message `=== ONE`; `overSsh` 0; `slots.taken` 0; `trustStore.get` never called; `notes` holds `journalLine('deploy', …)` with `Usable by agents` | E1's sentence, code `not_supported` |
| G3 | `a_pin_protected_ssh_entry_is_refused_with_the_same_sentence_as_a_closed_one` | S = `usableSsh('s1', { pinProtected: true })`: `denied`, message `=== ONE` (byte-equal to G2's); the note says `hidden from agents (PIN)` | E1's sentence |
| G4 | `an_ssh_entry_in_another_account_is_refused_with_the_same_sentence_and_is_never_read_there` | `agentStorage({ 'acct-1': [T], 'acct-2': [usableSsh('s1')] })`: `denied`, `=== ONE`; `storage.calls` holds no `['acct-2', 's1']` | E1's sentence |
| G5 | `trashed_missing_not_ssh_and_unsafe_target_all_give_the_same_sentence` | four worlds: S under a Trash folder; no S; S with `isSshEnabled: false` and a `dbType`; S with `host: '-oProxyCommand=x'`: every message `=== ONE`; the four notes differ and each equals `sshLinkOf(LINKED, lookup).reason` of its world | E1's sentence |
| G6 | `the_gate_runs_in_validate_so_nobody_is_asked_to_allow_a_refused_run` | `validate({}, ctx)`: closed S → `{ ok: false, code: 'denied', message: ONE }`; usable S → `{ ok: true }`; unlinked T → `{ ok: true }`; a closed S writes one note from `validate` alone | `validate` answers `{ ok: true }` always |
| G7 | `the_summary_names_the_ssh_entry_its_target_and_the_trust_line` | `summarize({}, ctx)` `===` `` `the stored command, on the SSH connection "prod box" (deploy@prod.example), as: ${TRUST}` ``; with `port: 2222` the target is `deploy@prod.example:2222`; with a jump host node the summary holds `-J`; with `agentForward: true` it holds ` -A `; it holds no `/` path, no `known_hosts`, no `CREDS_ASKPASS` | today's words |
| G8 | `the_summary_of_an_unlinked_entry_and_of_a_refused_gate_is_todays_words` | unlinked T, and T linked to a closed S: both `summarize({}, ctx) === 'the stored command, as its Run button would type it'` | (green for unlinked; the closed case is RED once G7's text exists if the gate is not consulted — say which) |
| G9 | `a_switch_turned_off_while_the_dialog_was_open_is_refused_at_run` | `validate` ok with usable S; set `s1.details.mcp = { view: true }`; `run({ ...ctx, summary })` → `denied`, `=== ONE`; `overSsh` 0 | runs |
| G10 | `a_link_or_target_changed_while_the_dialog_was_open_is_refused_at_run` | `summary = summarize({}, ctx)`; then (a) `s1.details.host = 'evil.example'` (trust the NEW line too, so trust alone would pass), (b) `T.sshEntityId = 's2'` with `usableSsh('s2')` trusted, (c) `T.sshEntityId` removed: each `run({ ...ctx, summary })` → `denied`, message `=== changedWhileAsking('deploy')`; `overSsh` 0; `slots.taken` 0. Then the unchanged world with the same `summary` → one `overSsh` call (the compare passes) | runs on the new target |
| G11 | `a_run_with_no_shown_summary_does_not_compare` | `run(ctx)` without `summary` on a usable trusted world → one `overSsh` call — the test worlds of §S2.5 keep working; the broker always sets it (G17) | (green; a guard — say so) |
| G12 | `asks_after_consent_is_true_only_for_a_linked_entry_that_forwards_the_agent_while_the_socket_is_up` | Every S here is USABLE (`usableSsh`), so the gate answers `linked`. `typeof terminalRunAction(deps).asksAfterConsent === 'function'`; unlinked → false; linked, no `-A` → false; `-A`, `agentSocket: () => undefined` → false; `-A`, socket `'/tmp/a.sock'` → true; `deps` without `agentSocket` → false. The states of S that the gate refuses are G22's | `undefined` |
| G13 | `a_bridged_call_on_a_linked_entry_is_refused_fail_closed_with_the_allow_lists_words` | usable S, trusted, `run({ ...ctx, bridge: { … } as BridgeContext })` → `not_supported`, message `=== BRIDGE_NOT_SERVED`; `overSsh` 0; and `bridgeRouteRefusal('POST', p)` is not `undefined` for each of `/v1/use/run`, `/v1/alias/run`, `/v1/mcp/use/run` (the first wall still stands). Then the same bridged call with S MISSING and with S CLOSED: the same code and message, byte-equal (round 1, item 6: the bridge answer stands before the link is resolved, so it cannot tell S's states apart), and `storage.calls` holds no read of `s1`. And the texts of the table (§8): the `why` of each of the three `run` rows of `BRIDGE_ROUTES` holds `E3 decided`; the `why` of the `terminal`, `up` and `down` rows does not hold `run` | runs; the `why` clause: no `run` row says `E3 decided`, and the other three say `run waits for E3` |
| G14 | `the_mask_table_of_a_linked_entry_holds_the_ssh_entrys_password` | `maskEntriesWithLink(source, 'acct-1', 'e1')` with T holding nothing and S's password `'correct-horse-battery-staple'`: the table deep-includes `{ value: 'correct-horse-battery-staple', label: 'PASSWORD' }`; unlinked T → T's table only; S missing → T's table, no throw; T missing → throws `MaskSourceUnavailable` (as before) | no export |
| G15 | `the_agent_reads_no_name_host_or_reason_of_the_ssh_entry` | over G2–G5's refusals: no message includes `prod box`, `prod.example`, `Trash`, `PIN`, `acct-2`; every note does include the real reason | (RED with G2–G5) |
| G16 | `an_agents_vpn_start_with_a_linked_launcher_stays_refused` | the existing agent-start test of `test/sshLinkRoads.test.ts` (the VPN block, `startVpn` with `SENTENCE('start-openvpn')`) stays green unchanged; here: `vpnAction(vpnDeps(false, []), 'up')` is untouched by this spec — assert `launcherRefusal`-path sentence `=== sshLinkRefusal(launcher)` through `vpnWorld` as that test does | (green; a guard — say so) |
| G17 | `the_broker_hands_run_the_summary_it_showed` | over `brokerWorld` (the real broker, a stubbed action that records `ctx.summary`): `/v1/use/<action>` with Allow → the recorded `ctx.summary === action.summarize(body, grant)`'s text; a quiet MCP call (`every12h` stamped) records it too | `undefined` |
| G18 | `the_one_sentence_has_one_name_and_one_parameter` | `linkedRunRefused.length === 1`; `linkedRunRefused('Q').match(/"[^"]*"/g)` deep-equals `['"Q"', '"Q"']`; `changedWhileAsking.length === 1` | no export |
| G19 | `exec_and_run_sit_on_the_same_rung` | `switchForAction('exec') === switchForAction('run')` and both `=== 'use'`; and the gate's call passes `'exec'` (a recording `findUsableEntry` is not possible without a seam, so: `usableSsh('s1', { mcp: { view: true, use: true, edit: false } })` is usable and `{ view: true, edit: true }` (no use) is refused — the rung read is `use`) | (green for the table; RED for the gate) |
| G20 | `before_the_gate_passes_every_outcome_is_the_one_sentence` (round 1, item 6) | One case per world, each with S CLOSED (`sshNode('s1', { mcp: { view: true } })`) unless the case is S itself: (a) S missing; (b) S only in `acct-2`; (c) S with `host: '-oProxyCommand=x'`; (d) T's command `'echo a\necho b'` (a line break); (e) T `terminalOs: 'windows'`; (f) T named `'a b'` with command `'echo {name}'` — the `{name}` refusal of `test/remoteLaunch.test.ts:208-213` (R10: inside `planLaunch` that refusal wins over a link refusal, which is exactly why `planLaunch` must not run before the gate); its `ctx.entityName` is `'a b'`, so its ONE is `linkedRunRefused('a b')`; (g) T with no command. For each, BOTH `validate({}, ctx)` → `{ ok: false, code: 'denied', message: ONE }` AND `run(ctx)` → `denied`, message `=== ONE`; no message holds `Windows`, `line break`, `will not run`, `has no command`, `prod box` or `prod.example`; `overSsh` 0; slot 0; `trustStore.get` never called; each world's note holds its real reason | (a)–(c) E1's sentence, `not_supported`; (d)–(g) `planLaunch`'s or today's own sentence, said first |
| G21 | `after_the_gate_passes_plan_refusals_name_only_the_terminal_entry` (round 1, item 6) | The same (d), (e), (f) with S USABLE and the line trusted: `run(ctx)` → `not_supported`, message `=== refusalSaid(T, planLaunch(T, sshLinkOf(T, lookup), { stayOpen: false }).reason)`; it holds T's quoted name (`"deploy"`, or `"a b"` for (f)) and not `prod box` or `prod.example`; (g) → `no_credential`, `"deploy" has no command.`; `overSsh` 0; slot 0. The positive half of G20: the gate decides WHEN these are said, not whether | E1's sentence |
| G22 | `before_the_gate_passes_the_follow_up_flag_says_nothing_about_the_ssh_entry` (the second amendment) | Every world has `agentSocket: () => '/tmp/a.sock'`. Six states of S that the gate refuses, each built TWICE, with `agentForward: true` and without it: (a) closed (`sshNode('s1', { mcp: { view: true } })`); (b) no `mcp`; (c) PIN-hidden (`usableSsh('s1', { pinProtected: true })`); (d) under a Trash folder; (e) usable but only in `acct-2`; (f) missing. For all twelve, `asksAfter(action, ctx) === false`, which is also the answer for an unlinked T: the forwarding world and the non-forwarding world of each state give the same bit. Then the door's admission with that bit, through the REAL throttle, as `test/consentContract.test.ts:99-113` does: `const ceilings = new TokenlessCeilings(); ceilings.admit(true, 0)` (another call holds the place); `ceilings.admit(false, 1, LOCAL_DOOR, asksAfter(action, ctx)).refusal === undefined` for all twelve (a quiet call is admitted, never *busy*), and then `validate({}, ctx)` answers `{ ok: false, code: 'denied', message: ONE }`, byte-equal across the twelve. `notes` is empty after `asksAfter` alone (the flag writes no note). POSITIVE CONTROL, so the test can see what it guards: `usableSsh('s1', { agentForward: true })` → `asksAfter(action, ctx) === true`, and the same `admit` call answers `BUSY_PLACE` | With the stub that reads the link alone (`sshLinkOf(…).kind === 'linked' && link.ssh.agentForward === true` and the socket): the forwarding worlds of (a), (b) and (c) answer `true`, and their quiet call is told `BUSY_PLACE`. That is the leak. (With no stub the control is RED: `undefined` today) |

**Existing tests whose expected values change**

- `test/sshLinkRoads.test.ts:163-184` (W8): `error?.code === 'denied'`; `error?.message === linkedRunRefused('deploy')` (the
  world has no `s1`, so `sshLinkOf` refuses as missing → the one sentence); `slotCalls === 0` stays. Its `storage` gains
  `getAccounts: () => [{ accountId: 'acct-1' }]`. Rename to `the_agent_run_refuses_a_linked_entry_whose_ssh_entry_is_missing_with_the_one_sentence_before_the_trust_check_and_the_slot`.
- `test/agentUseActions.test.ts:347-357` (C.3): `terminalRun` is now a function; the deep-equal becomes
  `typeof flags.terminalRun === 'function'` plus `flags.terminalRun(ctx) === false` for the unlinked `fakeDeps` entry, the other
  five unchanged. Its title ends *and on no other action of this module*; it then ends *and `run` declares it per
  entry; no other action of this module declares it*. `fakeDeps` (`:38-53`) gains `getAccounts` and `overSsh` (§S2.3).
- `test/promptSites.test.ts:214` and `test/sshLinkRoads.test.ts:166-177`: deps gain `getAccounts` and `overSsh` (§S2.3).
- `test/promptSites.test.ts:223-235` (*every action an `after-allow` row names carries the follow-up flag on its real
  factory, and no other action does*) goes RED when `terminalRunAction.asksAfterConsent` becomes a function (§6):
  `flagged(factories.run)` is then true, `:233` compares the flagged factories with the actions the ledger names, and
  `:234` says that `run` keeps nothing. Two edits make the test true again:
  1. `test/promptSiteLedger.ts:186` and `:187`, the two rows of the signing prompt (`sshSignPrompt.ts#askSigning#showWarningMessage#1`
     and `sshSignPrompt.ts#pickLength#showQuickPick#1`): `actions` becomes `['exec', 'terminal', 'rotate', 'run']` in
     both, and the `reason` of `:186` gains `; run of a Terminal entry linked to such an entry`.
  2. `test/promptSites.test.ts:234`: the list becomes `['query', 'script', 'exportEnv']` and its message
     `query, script and exportEnv keep nothing`.

  **This is a ledger row, not a new prompt, so E3-D10 holds** (*no new two-argument prompt and no renamed prompt
  function*). No prompt site is added and no prompt function is renamed: the ledger gains, loses and renames NO key
  (its keys are `file#function#call#n`). The signing prompt exists today. After S2 one more action can reach it after
  its Allow: a linked run over an SSH entry that forwards the agent starts `ssh -A` with the extension's agent socket,
  as `exec` on that SSH entry does (`sshUseActions.ts:95-109`), and the far side can ask the agent to sign. The ledger
  must name every action whose Allow can come before a prompt, and `:233` holds the flag and the ledger equal in both
  directions. E3-D10 also says *if `test/promptSites.test.ts` goes red, stop and report*: these two edits are named
  here, in advance, so they are not that case. Any OTHER red in that file is.
- `test/launchRoadScan.test.ts:189-195`: `REFUSAL_SITES` loses `agentUseActions.ts:terminalRunAction` (§S2.3).
- Any other test that goes red: stop and report; do not edit an expected value.

**Existing tests whose calls change (no expected value changes)** — `validate` and `summarize` take a REQUIRED target
(§5), so a call with one argument does not compile. Each of these fifteen calls gains the second argument and nothing
else:

| File | Calls | The second argument |
|---|---|---|
| `test/useActions.test.ts` | `:29`, `:30`, `:32` (`summarize({})`) | a new constant `const TARGET: CallTarget = { accountId: 'a1', entityId: 'e1', entityName: 'x' }`; `CallTarget` joins the import on `:3` as a type |
| `test/sshUseActions.test.ts` | `:392`, `:393` (`validate`) | `CTX` (`:183`) |
| `test/agentUseActions.test.ts` | `:134`, `:136`, `:137`, `:319`, `:326`, `:336`, `:340` (`validate`); `:402`, `:405` (`summarize`) | `ctx` (`:27`) |
| `test/rotateAction.test.ts` | `:111` (`summarize`), `:156` (`validate`) | `CTX` (`:93`) |

The list is complete for e57eb80f. Method: `grep -rn '\.validate(\|\.summarize('` over `src_vs_code/src` (the typed
fixtures included) and `src_vs_code/scripts`; the only other calls are the broker's two (`credsAgentServer.ts:530`,
`:561`). `test/agentUseActions.test.ts:402` keeps its expected value: `fakeDeps`' entry has no link, so the gate answers
`local` and the summary is today's words. Test stubs that IMPLEMENT `validate` or `summarize` with fewer parameters
compile unchanged. `test/maskEntries.test.ts` is not edited (§7).

## 14. Break-it cases — what an attacker-agent would try

| Input | Expected | Test |
|---|---|---|
| A Terminal entry open to the agent, linked to an SSH entry closed to it (`mcp` absent, or `view` only) | `denied`, the one sentence; no slot, no trust read, nothing spawned; the journal names the switch | G2, G15 |
| The same, and the agent retries with the SSH entry's id as a `creds_exec` target | `refusalFor` (`brokerRequests.ts:209-217`): `"<S>" is not open to agents for that…` — that door's own sentence, as today; S's NAME is revealed there only when S has `view` (a `closed` verdict needs a found node; a node without `view` is not listed, but `findUsableEntry` still answers `closed` for it — this is today's behaviour of `creds_exec`, outside this spec, and is noted in §16) | — |
| Switching the link from a closed S to an open S2 between `validate` and `run` | `validate` refused already: no dialog, nothing to switch under | G6 |
| Switching the link from an open S to an open S2 while the dialog stands | `changedWhileAsking`; nothing ran; the next call's dialog names S2 | G10 (b) |
| Changing S's host while the dialog stands, with the new trust line already trusted | `changedWhileAsking`: the compare beats trust | G10 (a) |
| Turning S's `use` off while the dialog stands | the one sentence at `run` | G9 |
| An SSH entry in the Trash (switches still on in its record) | the one sentence (`sshLinkOf` L4 and `resolveMcpInTree` both say no) | G5 |
| A PIN-protected S with `use` on | the one sentence (hidden: `lookedUp` answers `undefined`) | G3 |
| A `hiddenFromAgents` S whose mark was lost while the password stayed sealed | the gate passes (S is usable); `resolveExecAuth` refuses `pinRefusalFor(S.name)`, nothing spawned (`sshExecAuth.ts:84-87`); S's name is the agent's to read since S is usable | §S2.5 X4 |
| An S in another account with the same id | the one sentence; `acct-2` never read | G4 |
| A password S with a woven password | after the gate: `wovenRefusal` (`sshExecAuth.ts:55-64`), nothing spawned | §S2.5 X3/X4 class |
| A password S with a jump host | runs (parity with `ssh:exec`); risk 7 of the parent is inherited, not fixed here | — |
| A bridged `run` | the allow-list refuses before the body is read; a call that somehow reached `run` with `ctx.bridge` is refused with the same words | G13 |
| A `creds_vpn_up` whose launcher or chain step is linked | E1's shared sentence, nothing typed | G16 |
| A Terminal entry whose link was added by a sync after a 12-hour Allow | quiet at the door, refused at step 6 as untrusted until a person runs the trust line here | §S2.5 AG2 covers the key; G1/G2 the gate |
| A linked T whose `command` holds a `{name}` the composer refuses | `not_supported`, `refusalSaid` — after the gate, so a closed S still gives the one sentence first | G20 (f), G21 (f) |
| A T written for Windows, or with a line break, linked to an S the agent may not use — probing whether S is usable by watching for the D9 or line-break sentence | the one sentence: the gate answers before `planLaunch` runs; the D9 / line-break sentence only when S is usable | G20 (d) (e), G21, §S2.5 AG6 |
| A bridged call, probing S's state through the bridge | `BRIDGE_NOT_SERVED` for a missing, a closed and a usable S alike; S is never read | G13 |
| A quiet grant on T (T's policy asks once in 12 hours, or never) linked to an S the agent may not use: the agent holds the dialog place with a second call and watches whether the quiet `run` is told *busy*, to learn whether S forwards the agent | Never *busy* for this reason: the flag asks the gate first and is `false` for a closed, PIN-hidden, trashed, missing or other-account S, forwarding or not; the call is admitted and reads the one sentence | G22 |
| An agent on the alias door (the CLI's `run`) | the same `perform`, the same `validate`: the one sentence; the alias route's modal is never raised for it | G6 (the funnel is one) |

## 15. Opus review checklist

- [ ] `linkedCall` is the ONLY place that decides the gate, and `validate`, `summarize`, `run` and `forwardsAgentNow` all call it (grep
      `findUsableEntry(` in `agentUseActions.ts`: one site).
- [ ] The lookup is `accountOnly(…, target.accountId)`, and `found.accountId === target.accountId` is asserted.
- [ ] `linkedCall` is called BEFORE any `planLaunch`, any `sshLinkOf` with a real lookup and any `resolveJumpChain` in
      `validate`, `summarize`, `run` and `forwardsAgentNow` (read each function top-down); the bridge test (§2.1 step 3) stands before step 4;
      G20 and G21 were each watched RED.
- [ ] No sentence reachable BEFORE the gate passes names S, its host, its folder, the Trash, the PIN or an account
      (read every `fail(` in the linked branch; `sshLinkOf`'s reasons go to `note`, never to `fail`).
- [ ] `linkedRunRefused` and `changedWhileAsking` have one parameter each, and tests read them from the module.
- [ ] The refusal code is `denied`, and W8 was changed for that reason (not to make it green).
- [ ] `run` compares `ctx.summary` with the rebuilt summary BEFORE `planLaunch`, the chain, the trust check and the slot;
      a test world without `summary` is not refused (G11), and the broker always sets it (G17).
- [ ] `plan.ssh === link.ssh`: the gate's `link` is the object passed to `planLaunch`; no second `sshLinkOf` in `run`.
- [ ] Reads of S in `run`: exactly two `getNode` calls, both inside `linkedCall` (AG5 of §S2.5 lists them).
- [ ] `asksAfterConsent` is a function, and C.3 asserts the shape. `forwardsAgentNow` calls `linkedCall` FIRST and reads
      `agentForward` and the socket only on `linked`; it has no `sshLinkOf` call of its own and writes no note. G22 was
      watched RED with the stub that reads the link alone.
- [ ] The prompt ledger: the two signing rows name `run`; no key was added, removed or renamed; `promptSites.test.ts:234`
      lost `run`; no other line of that test changed.
- [ ] `validate` and `summarize` have a REQUIRED `target`; the diff of the four test files of §13 adds one argument to
      fifteen calls and changes no expected value.
- [ ] `maskEntriesWithLink` reads the link through `sshLinkOf`; `ALLOWED_LINK_READS` did not grow; `extension.ts` is not one
      line longer; G14 covers T gone (throws), S gone (does not throw). `SecretSource` is unchanged, `LinkedSecretSource`
      is an interface that extends it, and `test/maskEntries.test.ts` is not in the diff.
- [ ] The bridge: `BRIDGE_NOT_SERVED` and `not_supported` on both walls; `useRoute` has a `run` branch whose `why` says E3
      decided, and the default-deny line no longer names `run`.
- [ ] `sshDepsFor` returns `SshWiredDeps`; typecheck is green with no cast at `extension.ts:639`.
- [ ] Lint is green and no unused directive is left: `agentUseActions.ts:197` is gone; `sshUseActions.ts:221` is gone if
      lint named it; no new `eslint-disable` was added.
- [ ] `vpnLauncherRun.ts`, `dependencyRun.ts`, `sshLinkRefusal` untouched; G16 green before and after.
- [ ] The stamp, `brokerMcpDoor.ts`, `mcpHooks.ts`, `brokerConsent.ts` untouched (grep the diff).
- [ ] No test asserts a delegated option (`-A`, a forward) PROTECTS anything; they assert what is sent and what is refused.
- [ ] Every new test was watched RED with the message in the summary; the file has positives (G1, G10's last step, G14).
- [ ] The help sentence of §S2.3 is true of the build: *only when the SSH entry itself is Usable by agents*; nothing in the
      help claims the SSH entry's ask policy is consulted.

## 16. Flags for the lead (possible plan changes — flagged, not decided here)

1. **Parent §4.4 "Agent" quotes a sentence that names `"<ssh>"`**: `"<entry>" runs over the SSH connection "<ssh>", which
   is not open to agents. Nothing ran.` This spec's sentence names the Terminal entry only (§4), because the SSH entry's name
   is not the agent's to read when the gate refuses. The parent's words change; D2 ("refused with a sentence") does not.
   Possible plan change (text); in doubt it counts.
2. **The refusal code** changes from E1's `not_supported` (404) to `denied` (403) for the linked run (§4). The `ErrorCode`
   set is unchanged, so no contract change; W8's expected value changes. Text for the CHANGELOG.
3. **Two internal interface widenings**, both the class E3.L flag 2 accepted: `validate`/`summarize` take a `CallTarget`;
   `UseActionContext.summary`. Not a plan change by my reading; the lead confirms.
4. **The SSH entry's ask policy is not consulted** (§3.2). D2 is silent on it; the help says *Usable by agents* only. If the
   owner wants "the stricter of the two", it is a change to the MCP lookup and its own decision; recorded, not built.
5. **The stamp is not keyed on the link** (§3.2). A follow-up of the consent-coverage plan's §5.1 class; recorded, not built.
6. **The mask table widens** to the linked SSH entry's values (§7). Parent §4.4 says *output masked as today*; this is
   wider in the safe direction, at one place. Text for the CHANGELOG; in doubt it counts.
7. **Outside this spec, noted while reading**: `refusalFor` (`brokerRequests.ts:209-217`) names an entry in its `closed`
   sentence whenever `findUsableEntry` answers `closed`, which it does for a node that has no `view` (`verdictFor` reads
   `use`, not `view`, `mcpEntries.ts:422-436`). So `creds_exec` on an unlisted id can confirm the entry's NAME today. Not this
   plan's road; a finding for the lead to route (the security response protocol says sweep the class, and this is the class).
8. **The mask table builder reads the link between the two gates** (§7, found by the sweep of §2.2). In the usual call
   `validate`'s gate has passed before it runs. If a link is added, or S is closed, while the dialog stands, the table can
   hold values of an S that `run` then refuses. The agent reads nothing from it (§7 says why). To close it fully, the
   builder would have to ask the gate, which puts an authorisation decision into `maskEntries.ts`; that is a design
   change and is not made here. Recorded for the lead.

## 16a. The both-sides rule

The first version of this file said that `plan-lifecycle.mjs` reported `todo/README.md omits
PLAN_terminal_command_over_ssh_E3_S2_security.md`, and that the lead adds the row. That is done: `todo/README.md` has this
file's row, the stories document links this file from its status block, and
`node .agents/conventions/tools/plan-lifecycle.mjs` answers `clean` (run on e57eb80f, 2026-11-10, before and after the
second amendment). The README row is another file and is the lead's: it names the scenarios `G1–G19`; this file now
holds G1–G22.

## 17. Help ×5

Unchanged from §S2.3: the bullet's sentence *… and so does an agent's run, but only when the SSH entry itself is
*Usable by agents*; otherwise the agent is refused and nothing runs.* is true of this gate. The agent-access article
(`helpEn.ts:116`: *They also require that you have run the entry yourself once on this machine*) stays true: the trust line
is the key (§2.3 step 6). No further help text is owed by this spec.
