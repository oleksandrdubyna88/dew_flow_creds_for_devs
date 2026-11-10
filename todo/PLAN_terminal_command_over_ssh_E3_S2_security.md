# PLAN — Terminal command over SSH, E3.S2: the authorisation of the agent's run (security spec)

> Status: **spec, 2026-11-10. The first two amendments are built on `feat/terminal-command-over-ssh-e3` (757bf3a3..7c6e4ffb,
> pushed, unmerged). The third amendment (the re-review for epoch 4) is written and is not built.** Parent: [PLAN_terminal_command_over_ssh.md](PLAN_terminal_command_over_ssh.md)
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
> Amended a third time 2026-11-10 (Fable), in the full stop of epoch 3 (parent entry 3.2), for the re-review that epoch 4
> is approved on. Every `file:line` of this amendment was opened on 5b221602 (its code is 7c6e4ffb's). Six decisions, in
> the table under §0: (A1) a one-use SSH entry is spent by a linked run as by its own `creds_exec` — the broker takes its
> one-use turn and burns it (§2.5); (A2) the ssh of Run with Secrets says `-T` (§18.1); (A3) `-A` reaches an ssh
> that E3 spawns only together with the extension's own agent (§18.2); (A4) a linked run with no shown summary, or over
> another SSH entry than the one the broker holds, is refused (§2.3 step 3); (A5) a waiting rotated value of the SSH entry
> goes in before the mask table is read (§7); (A6) a password SSH entry with a jump host is not refused, and the limit is
> recorded (§18.3). None of the six makes scope, the Definition of Done, the merge conditions or the release smaller (§19).
> Corrected 2026-11-10 by the lead's decision on A2: `-T` goes on the argv of Run with Secrets only
> (`SshExecOptions.noTty`, set by `secretsArgv` and by no other caller). The first text of this amendment put it into
> `buildSshExecArgv` for all five callers; that changed shipped roads, which is outside this plan. `ssh:exec`, the agent's
> linked run and the three clicks of `commands/agentCommands.ts` keep today's argv (§18.1, §18.4 T1 and T2, §19).

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

**The third amendment** (2026-11-10, the re-review for epoch 4). Rows 2, 3 and 7 above stay true and are completed by A1,
A4 and A5.

| # | Question | Decision |
|---|---|---|
| A1 | A one-use SSH entry (`burnPolicy: 'oneUse'`) behind a linked Terminal entry (parent entry 3.2) | **Burn it too (B), in the broker.** A linked run is an agent's use of S. The action names S to the broker (`UseAction.uses`, the gate first). The broker gives S the measures it gives the grant's entry: S's one-use turn in the same `OneUseLane` that `creds_exec` on S queues in, S's spent marker asked first, and S burned and marked after a call that answered 200. The turns of T and S are taken in ONE fixed order (ascending lane key), so no two calls can wait for each other. T's own one-use turn and burn are unchanged. Refusing a one-use S in the gate (A) is NOT chosen: it makes D2's road smaller and leaves the cause in place (§2.5). |
| A2 | A remote pty for a spawned ssh (`RequestTTY force` in the person's ssh config) | **Run with Secrets only** (the lead's decision, 2026-11-10): `secretsArgv` passes `noTty: true`, a new `SshExecOptions.noTty?: boolean`, and `buildSshExecArgv` then puts `-T` first. No other caller sets it, so `ssh:exec`, the agent's linked run and the three person clicks keep today's argv. The danger is where a script goes on stdin, and only this road has one. No `-o EscapeChar=none`: with no pty ssh reads no escape, so the option would be inert, and an inert measure is deleted, not kept (§18.1). |
| A3 | The spawned ssh inherits the extension host's `SSH_AUTH_SOCK` | Two facts, two answers. (a) Identities of the person's own agent can be offered: this is the person's own ssh setup, a recorded limit, and the false doc text is corrected. (b) `-A` with the extension's agent not up forwards the person's own agent while the banner says that nothing is forwarded: on E3's two roads (Run with Secrets, the agent's linked run) the argv then has NO `-A` and has `-o ForwardAgent=no`. `ssh:exec` keeps today's argv in this plan, by a REQUIRED per-call word (`ownAgentOnly: false`), and gets its own plan (§18.2). |
| A4 | The summary compare is skipped when `ctx.summary` is absent | For a LINKED gate a missing summary refuses with `changedWhileAsking`, and so does a `ctx.uses` that is absent or names another SSH entry than the gate's (the id, so a relink to an entry that looks the same refuses too). The skip stays for a `local` gate only. The test worlds hand the run what the broker hands it, through one fixture function (§2.3 step 3, §12). |
| A5 | The mask table holds S's STORED password while a rotated value of S waits | The broker releases a waiting value of the used entry (`releaseWaiting(call.uses)`) after the grant's own and before the table is read, so the table holds the value ssh will use (§7). |
| A6 | askpass answers a jump host's prompt with S's password ([PLAN_askpass_answers_the_hop.md](PLAN_askpass_answers_the_hop.md)) | E3 does not refuse a password S with a jump on the agent road: the same agent reaches the same defect by `creds_exec` on the same S, which the gate requires to be usable, so a refusal here would be a measure at one of its many sites and would make the road smaller for no gain. The limit is recorded; that plan gains E3's roads in its table and moves up to the next plan on the SSH roads (§18.3). |

## 1. Words

- **T** — the Terminal entry the agent's grant names (`ctx.entityId`). **S** — the SSH entry T links to (`T.sshEntityId`).
- **The gate** — the decision "may THIS agent call run T's line over S": T is the grant's (the door's business), S must be
  usable by agents in T's account, the call is not on a bridge.
- **The one sentence** — `linkedRunRefused(entryName)` (§4): what the agent reads whenever the gate refuses.
- **The shown summary** — the string `summarize(body, target)` answered for this call before consent; the dialog shows it
  (`brokerConsent.ts:322`), the audit line carries it, and `run` receives it as `ctx.summary`.
- **Door** — the token route (`/v1/use/run`), the alias route (`/v1/alias/run`, the CLI's `run`), the MCP route
  (`/v1/mcp/use/run`, `creds_run`). All three reach `perform` (`credsAgentServer.ts:508-545`), so one gate serves all.
- **The used entry** (third amendment) — the entry a call uses beside the one its grant names. Here it is S, and only
  when the gate answers `linked`. The action names it (`UseAction.uses`), the broker carries it (`CallSubject.uses`) and
  hands it to `run` (`ctx.uses`).
- **A turn** — one place in the `OneUseLane` of one entry (`oneUseLane.ts`): one call at a time, and a call that finds
  the entry spent is refused before anything runs.

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

`linkedCall` is evaluated at each moment of §2.2, so up to six times in one call (five before the third amendment, which
adds `uses`). Each evaluation is these two reads, from memory, and it writes nothing. The journal note is its caller's:
`validate` and `run` write it; `summarize`, `uses` and `forwardsAgentNow` do not. So one refused call writes one note
(G6, G22, G23).

### 2.2 Where the gate runs, relative to the dialog

The rows are in the order a call on the MCP door reaches them.

| Moment | Who calls | What runs | Result when refused |
|---|---|---|---|
| **asksAfterConsent** — first at `brokerMcpDoor.ts:223`, BEFORE the door's admission and so before `validate` (it decides whether a quiet call takes the dialog place, §6); again at `brokerConsent.ts:156`, when the dialog closes on Allow | the broker, with the target | `linkedCall(deps, target, undefined)` FIRST. Only on `linked`: `link.ssh.agentForward === true` and `deps.agentSocket?.() !== undefined`. No note | `false` for every answer that is not `linked`, the same bit as for an entry with no link. The refusal itself is `validate`'s |
| **validate** — `credsAgentServer.ts:561`, inside `usable()`, BEFORE `summarize` and the dialog, AFTER the door's admission (§3.3) | the broker, with the grant | `linkedCall(deps, target, undefined)` | `{ ok: false, code, message }`; the broker answers it and writes the audit line (`:566`); `deps.note(why)` from the action. No dialog is shown and no modal stamp is written; the call was counted at admission (§3.3); the grant is dropped (`:565`). |
| **summarize** — `:530` | the broker, with the grant | `linkedCall` again; `linked` → the linked summary (§5); anything else → today's words | — (a refused gate was answered in validate; the local words are returned and never shown) |
| **uses** (third amendment) — the line after `:530`, in the SAME synchronous step as `summarize` (no `await` between them) | the broker, with the grant | `linkedCall(deps, target, undefined)` FIRST. Only on `linked`: `{ accountId: target.accountId, entityId: link.ssh.id, entityName: link.sshName }`. No note | `undefined` for every answer that is not `linked`: the broker then takes no turn, releases nothing and burns nothing for S (§2.5) |
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
it can show. The third amendment adds a SIXTH place, `uses` (the row above): it calls `linkedCall` first too, and the
same grep must then show six.

### 2.3 The order inside `run`, for a linked entry

Steps 1–2 are the only ones before the gate's answer, and neither reads the link's target, S, or `planLaunch`: until step 2
answers `linked`, the agent reads `not_found`, `BRIDGE_NOT_SERVED` or `linkedRunRefused(T)` and nothing else (§4,
*Before the gate*).

1. `entityFor` → gone → `not_found`, today's words (`agentUseActions.ts:200-202`).
2. **The gate** (§2.1, with `ctx.bridge`). Refused → its result, after `deps.note(journalLine(ctx.entityName, why))`.
3. **The compare** (rewritten by the third amendment, A4). Two parts, and either one refuses with
   `fail('denied', changedWhileAsking(ctx.entityName))`:
   - **The shown text.** For a `linked` gate: `ctx.summary !== linkedSummary(linked, entity)`. An ABSENT summary is not
     equal, so it refuses. For a `local` gate: `ctx.summary !== undefined && ctx.summary !== LOCAL_SUMMARY` (the skip
     stays here only: a local run uses no second entry, and its line is held by the trust check of `runHere`).
   - **The used entry.** For a `linked` gate: `ctx.uses?.entityId !== linked.link.ssh.id`. An absent `ctx.uses` is not
     equal, so it refuses. For a `local` gate: `ctx.uses !== undefined` refuses (the broker holds the turn of an SSH
     entry that this run does not use any more).

   Why the first version was not enough: it skipped the whole compare when the summary was absent
   (`agentUseActions.ts:313-315` on 7c6e4ffb), so the check held only while every caller remembered to pass the
   summary. Now a linked run cannot start without both fields. The broker always sets both (G17); a test world sets
   them through `asBroker` (§12). Why the id: the shown text holds S's name, target and trust line and not its id, so a
   link moved to another SSH entry with the same name and address gave an equal text. `ctx.uses` is what `uses`
   answered in the same synchronous step as the shown summary (§2.2), so "the entry the person was shown", "the entry
   whose turn the broker holds" and "the entry the run reads now" are one entry, or nothing runs (§2.5).
4. `const plan = planLaunch(entity, linked.link, { stayOpen: false })`. `empty` → `"<T>" has no command.` (today's words).
   `refused` → `fail('not_supported', refusalSaid(entity, plan.reason))` (§S2.3): only `{name}`, D9 Windows and the line
   break can reach here, because a link refusal was answered at step 2 and the same `link` object is passed.
5. `const chain = resolveJumpChain(plan.ssh, (id) => deps.storage.getNode(ctx.accountId, id)?.details)`; not ok →
   `fail('no_credential', chain.reason)` — the words `ssh:exec` uses (`sshUseActions.ts:266-269`).
6. `isCommandTrusted(deps.trustStore, ctx.entityId, trustLineFor(plan.ssh, chain.value, plan.line))` false →
   `untrusted(ctx.entityName, 'the line')` (`agentUseActions.ts:108-113`).
7. The slot; `too_many_requests` as today.
8. `deps.overSsh(ctx, { ssh: plan.ssh, jump: () => chain, remoteCommand: plan.remoteCommand, timeoutMs: clampExecTimeout(undefined), ownAgentOnly: true })`
   in `try … finally release()` (§S2.2). Everything from `resolveExecAuth` on is `execOverSsh`'s and is `ssh:exec`'s body.
   `ownAgentOnly: true` is the third amendment's (A3, §18.2): the linked run never sends `-A` without the extension's
   own agent.

For an UNLINKED entry (`local`) step 3 still runs — `linkedSummary` answers today's words for it, so it passes for an
entry that was unlinked when the dialog stood, and refuses one whose link was removed while it stood (§2.4 row 4,
G10 (c)) — and then the road is today's `runHere` (§S2.2), byte for byte in behaviour. (Corrected 2026-11-10 while
applying round 1: this line said steps 2–3 are skipped, which contradicted §2.4 and G10 (c).) A local run that carries
no summary and no `uses` (a test world of the local road) is not compared, as before.

### 2.4 A switch or a link flipped while the dialog is open

| What changed while the dialog stood | What the person saw | What `run` does | What the agent reads |
|---|---|---|---|
| S's `Usable by agents` turned off (a sync, another window) | the dialog named S and its target | step 2 refuses | the one sentence, `denied` |
| T's link moved to S2 (open to agents) | the dialog named S | step 3: the rebuilt summary names S2 → refused | `changedWhileAsking(T)`, `denied` |
| S's host, user, port, jump or a forward changed | the dialog named the old target and trust line | step 3 refuses (the trust line differs) | `changedWhileAsking(T)` |
| T's link removed | the dialog named S | step 2 answers `local`; step 3 compares the local words with the shown linked words → refused | `changedWhileAsking(T)` |
| T's command changed | the dialog's trust line quoted the old line | step 3 refuses; and step 6 would refuse too (a new line is untrusted until a person runs it) | `changedWhileAsking(T)` |
| nothing | — | the compare is equal; the run goes on | the outcome |
| T's link moved to S2, which has the same name, host, user, port, jump and forwards as S (third amendment, A4) | the dialog named S | step 3, the used entry: `ctx.uses.entityId` is S's id and the gate's link is S2 → refused | `changedWhileAsking(T)` |
| T's link moved to S2 and back to S | the dialog named S | the compare is equal, and the turn the broker holds is S's: `ctx.uses` was read in the same step as the shown summary; the run goes on | the outcome |
| a call that reaches `run` with no summary or no `ctx.uses` for a linked entry (no door of the broker does this; a new caller could) | — | step 3 refuses | `changedWhileAsking(T)` |

The compare is the agent road's "one snapshot" (parent §4.4): the person's roads build the typed line from the prepared
snapshot the trust modal named; the agent's run has no snapshot across the broker's dialog, so it refuses when the two reads
differ, as the folder run does for a row that changed while its modal was open (parent §4.4 "Folder run"). The second call
shows the new state in its own dialog.

### 2.5 The SSH entry's one-use promise (third amendment, A1; parent entry 3.2)

**The defect.** The gate asks S's `use` rung (`usableGate`, `agentUseActions.ts:231-234`). The broker's one-use turn
(`queuedIfOneUse`, `brokerCall.ts:108-114`) and its burn (`burnAndMark(…, grant, …)`, `credsAgentServer.ts:687`,
`oneUseLane.ts:126-139`) are keyed on the GRANT's entry, and the grant is T's. So an S that is set to live *until an agent
uses it once* is deleted after one `creds_exec` on S, and is used without limit by `creds_run` on a T linked to it. An SSH
entry can be one-use: `canBurnOnAgentUse` refuses only `sshkey`, `config` and `payment` (`entityKind.ts:178-180`). The form
makes the promise (`oneUseLane.ts:4-9`: *a promise the interface makes*), and the linked run breaks it.

**The class, swept** (security.md, *Security response protocol*). The defect is a measure that the broker gives to the
grant's entry and not to the entry the call also uses. Method: `grep -n 'this\.hooks\.' credsAgentServer.ts` on 5b221602
(23 lines), each read in its function. Five sites take the grant's `accountId` and `entityId`:

| The broker's measure | Site | For S today | For S after this amendment |
|---|---|---|---|
| the mask table, before the run and the refresh after it | `:588`, `:686` | S's values are in it (`maskEntriesWithLink`, §7) | unchanged |
| a waiting rotated value goes in before the table is read | `:583`, `:620-626` | NOT released (A5) | released (§7) |
| the one-use turn | `:679-680`, `brokerCall.ts:108-123` | NOT taken | taken (below) |
| the one-use burn and the spent marker | `:687` | NOT burned, NOT marked | burned and marked (below) |
| the remembered consent | `:670` | T's stamp only | unchanged, by decision: T's policy governs (§3.2) |

The other hooks take no entry of a grant: `storageDir`, `resolveMcpUse`, `moveToTrash`, `mcpCreate`, `configRoute`,
`resolveAlias`, `listAliases`, `listMcpEntries`, `visibleConfig`; `bridgeWall` is asked for a bridged call, and `run` is
refused on a bridge (§8). U10 leaves this list behind as a test.

**Decision: B — a linked run is an agent's use of S, and the broker spends S as `creds_exec` on S does.**

- Why not A (refuse a one-use S in the gate, with the one sentence). A is small and fails closed. But D2 allows the run
  when S *is open to the agent for exec*, and a one-use S is open for one exec: A makes the road smaller than the owner
  decided (a narrowing, the owner's to approve). A also leaves the cause in place: the next measure the broker keys on
  the grant would miss S again. B puts S on the one road where these measures are (`performCall`), so the promise holds
  for both roads from one marker.
- Why the broker and not the action. The turn, the spent marker and the burn are one `OneUseLane` inside the server
  (`credsAgentServer.ts:69`). A second lane in the action could not see a `creds_exec` on S. A test of `overSsh.calls`
  at the action cannot prove the promise, because `terminalRunAction.run` does not pass through the lane (the
  consultant's point, coai consultation 5b2cc40c). So the tests of this section drive the real broker (§13, U1–U7).

**The used entry.** `UseAction` (`useActions.ts`) gains one OPTIONAL method, and `UseActionContext` one optional field:

```ts
/** Another entry whose credential a call uses, beside the one its grant names: the SSH entry of a linked Terminal entry. */
export interface UsedEntry { readonly accountId: string; readonly entityId: string; readonly entityName: string }

// UseAction
/**
 * The entry this call ALSO uses, or nothing. The broker asks once per call, in the same synchronous step as `summarize`, and then
 * gives that entry what it gives the grant's entry: a waiting rotated value goes in before the mask table is read, its one-use
 * turn is taken, and a one-use entry is burned after a call that answered 200. An action that answers must ask its gate first.
 */
uses?(target: CallTarget): UsedEntry | undefined;

// UseActionContext
/** What `uses` answered for this call; the broker holds this entry's one-use turn. Set by the broker (`brokerCall.ts`); read by the linked run (§2.3 step 3). */
readonly uses?: UsedEntry;
```

`terminalRunAction` declares `uses: (target) => usedEntryOf(deps, target)`; `usedEntryOf` is the row of §2.2. No other
action declares it. The method is optional, NOT required as `mutatesSecrets` is, and this is a decision with a named
cost: a required method would make `ssh:exec`, the VPN start and the database query each state today whether they use a
second entry, and those are shipped roads outside this plan (§16 item 9 names what was and was not checked there).

`CallSubject` (`brokerCall.ts:60-80`) gains `readonly uses: UsedEntry | undefined` — the key is REQUIRED, as `caller`
is, so the one place that builds a call (`credsAgentServer.ts:544`) cannot leave it out. `perform` reads it on the line
after `:530`: `const uses = useAction.uses?.(grant);`. `startNow` (`brokerCall.ts:200-205`) adds `uses: call.uses` to the
context.

**The turns** — `brokerCall.ts`, in place of `queuedIfOneUse` and `takesItsTurn` (`:108-123`):

1. `turns` = the grant's entry, then `call.uses` when it is defined and its lane key differs from the grant's
   (`laneKeyFor(accountId, entityId)`, `oneUseLane.ts:29-31`). The keys always differ, because `sshLinkOf` refuses a
   link to itself; the test stays, so one key is never queued twice (a job of `KeyedQueue` must not wait for a run on
   its own key, `keyedQueue.ts:25-27`).
2. **Spent first**, for each turn, the grant's entry first: `deps.lane.isSpent(turn.key)` → refuse for that turn and
   stop. This stands before the one-use question, as today, and for the reason `brokerCall.ts:101-104` gives: a burned
   entry is not in storage any more, so it does not look one-use. It also holds an S whose delete FAILED: the marker is
   set whether or not the delete worked (`oneUseLane.ts:116-118`).
3. `queued` = the turns with `deps.isOneUse?.(accountId, entityId) === true`, sorted by `key` ascending with a plain
   compare (`a.key < b.key ? -1 : 1`; no locale). An ordinary entry is never queued: two linked runs over an ordinary S
   keep running at the same time (U4).
4. `queued` empty → `answer(deps, call)`, unqueued, as today.
5. Else the turns are nested in that order: `deps.lane.run(queued[0].key, () => deps.lane.run(queued[1].key, () =>
   answer(deps, call)))`, one level when one entry is queued. A lane that answers `spent: true` → refuse for that turn;
   `answer` did not run, so nothing was reserved and nothing started.

**No two calls can wait for each other.** Every call takes its turns (at most two) in ONE order, ascending key, and
holds a turn only while it waits for a turn with a greater key or while its action runs. An action takes no turn. So
every wait goes from a smaller key to a greater key, and a circle of waits cannot form. A queue moves on when its job
settles, on failure as on success (`keyedQueue.ts:4-6`), so a held turn always ends. This does not depend on T being a
Terminal entry and S an SSH entry; U7 proves it with two scripted actions that use each other's entry.

**The burn.** `deliver` (`brokerCall.ts:211-229`) passes `burn: (status) => burnInTurn(deps, call, status)`:
`await deps.burn(status)`, then `await deps.burn(status, call.uses)` when `call.uses` is defined. `CallDeps.burn` becomes
`burn(status: number, of?: UsedEntry): Promise<void>`, and the server's closure (`credsAgentServer.ts:687`) becomes
`(status, of = grant) => burnAndMark(this.oneUse, this.hooks.burnAfterUse, this.hooks.isOneUse, of, status, this.note)`.
So S gets exactly what the grant's entry gets, from the same function: the one-use question asked BEFORE the delete,
the delete only after a 200 and only for a one-use entry of a kind that can burn (`burnOnUse.ts:37-39`), the note
(`"<S>" was one-use and has been deleted from the vault.`, or `… could NOT be deleted: …`), and the spent marker set
after a 200 whether or not the delete worked. The grant's entry is burned first, so T's own burn is what it is today.
Both burns are awaited inside `answer` (`brokerResponse.ts:244`, `:253`), so they end before either turn is released:
the next call in S's lane meets the marker.

**What counts as the one use.** The same as for `creds_exec` on S: a call that answered 200. `execOverSsh` answers 200
when ssh was started and ended, whatever its exit code (`sshUseActions.ts:240-242`). A gate refusal, `changedWhileAsking`,
an untrusted line, a full slot, a missing credential and `Could not run ssh` are not 200 and spend nothing (U6).

**Three calls at once** — `creds_exec(S)`, `creds_run(T1→S)`, `creds_run(T2→S)`, S one-use, T1 and T2 ordinary. Each
queues on S's key only. The first in the lane runs, answers 200, burns S and marks it; the other two get `spent: true`
from the lane and are refused before `answer`. Exactly ONE ssh was started (U2). If the first one did not answer 200,
S is not spent and the next one runs: the promise is one SUCCESSFUL use, as it is today.

**What the agent reads, and the journal.**

| Case | Who answers | Code | Message to the agent | Journal |
|---|---|---|---|---|
| the grant's own entry is spent (T one-use; or `creds_exec` on a spent S) | `refuseSpent`, unchanged | `not_found` | `"<name>" was one-use and has already been used.` | the refusal line, as today |
| the used entry is spent: the marker is set (its delete failed), or the call lost S's turn to a call that spent it | the broker, new | `denied` | `usedEntrySpent(<T>)`: `"<T>" uses another entry that was one-use, and an agent has already used it, so nothing ran.` | the refusal line's detail is `<summary> · the entry it also uses, "<S>", was one-use and has already been used` |
| S was one-use, was used and is deleted, and the agent calls again | `validate`'s gate (§2.1 step 4: S is missing) | `denied` | the one sentence | `journalLine(T, <sshLinkOf's reason>)` |
| after a linked run that answered 200 over a one-use S | — | 200 | the outcome | the note of `burnIfSpent` for S (and for T when T is one-use) |

`usedEntrySpent(name)` is exported from `brokerCall.ts`, has ONE parameter and names ONE entry, the grant's: the broker
does not know what kind the used entry is, and S's name stays out of the agent's answer. The code is `denied` (403) and
not `not_found` (404), for the reason of §4: the CLI reads a 404 as *this window does not have the entry* and asks the
next window. `CallDeps.refuse` gains an optional third parameter, `why`; the server's closure (`:683`) appends it to the
line's detail (`why === undefined ? summary : `${summary} · ${why}``), as `failed` does on `:684-685`.

This refusal comes after `validate`'s gate has passed in the same call and before `run`'s gate. It is a fourth answer
beside the three of §4 *Before the gate*, and it says only "another entry, one-use, used". In one narrow case the agent
reads it about an S that was closed to agents while the dialog stood. It names nothing of S, and the agent could have
read the same fact a moment before the switch was turned. Recorded, not changed.

**What a one-use T does.** Exactly what it does today: T's own turn is taken, T is burned after a 200 and its key is
marked. With an ordinary S nothing else happens (U5). With a one-use S both are spent by the one run (U5).

**What this section does not do.**

- `validate` does not read the spent marker. So for an S whose delete failed, a person can be asked to Allow a run that
  the broker then refuses as spent. This is what `creds_exec` on such an S does today (the marker is read in
  `performCall`, after consent). The action has no road to the lane, and adding one (a hook wired through
  `extension.ts`, which is under a line ratchet) is not worth this case.
- A person's own run of T (the arrow, Run with Secrets, a folder run) never burns S: *only the broker spends an entry*
  (`burnOnUse.ts:13-16`), the owner's decision.
- The marker is per window (`oneUseLane.ts:42-48`). A second window whose storage still holds S (a failed delete, a sync
  that has not arrived) does not know it. This is today's limit of the lane for every one-use entry.
- After the burn, T's link points at nothing. A person's run says *runs over an SSH connection that is no longer in this
  vault* (`remoteLaunch.ts:96`); the agent reads the one sentence. Nothing unlinks T.

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
- **S's one-use promise is kept** (third amendment, A1). The first version asked only S's switch, and S's
  *until an agent uses it once* did not hold for a linked run (parent entry 3.2). S's ask policy answers *how often is a
  person asked*, and T's answer is enough for a fixed line. S's one-use answers *how many times may an agent use this
  credential*, and no setting of T can answer that. So this one is S's own, and the broker keeps it (§2.5).

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
| `usedEntrySpent(name)` (third amendment; in `brokerCall.ts`, because the broker says it) | `denied` | `"<name>" uses another entry that was one-use, and an agent has already used it, so nothing ran.` |

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
`call.summary` (already in `CallSubject`). Only the linked run reads it (§2.3 step 3). Since the third amendment (A4) a
LINKED run REQUIRES it: an absent summary refuses. The doc of the field then says *a linked run refuses without it*
in place of *Absent for a start that serves no request*, which stays true only of a local run.

**The third internal field** (third amendment, A1 and A4). `UseAction.uses?` and `UseActionContext.uses?` of §2.5, with
the type `UsedEntry`. Internal as the other two are: `contract/broker-v1.json` names routes and bodies, so no contract
changes. `uses` is read by the broker (the turn, the burn, the release of §7) and by the linked run's compare.

**The launch never carries more than the trust line** (third amendment, A3). The summary shows the trust line, with `-A`
when S forwards the agent. When the extension's own agent is not up, the launch carries LESS than the person approved:
no `-A`, and `-o ForwardAgent=no` (§18.2). The summary is not changed for this: it shows what the person approved from
the tree, and a launch that does less than the approval needs no new approval.

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

**A rotated value of S that waits** (third amendment, A5). A rotation whose new value could not be stored keeps it
beside the entry (`heldRotations`), and the next automatic use stores it first (`automaticRead.ts:23-34`). The broker
does this for the grant's entry BEFORE it reads the table (`releaseWaiting(grant)`, `credsAgentServer.ts:583`, `:620-626`;
`brokerHooks.ts:60-67` says why: a run that is not a rotation is delivered with the table read before it). For S it did
not. So the table held S's STORED password, `execOverSsh` → `resolveExecAuth` → `automaticOpenerFor` then stored the
waiting one and ssh used the NEW password, which the table did not hold. This section said that the table masks *as a
`creds_exec` on that entry would*; with a waiting value it did not.

The fix is on the broker's road, with the measure it mirrors: `prepared` (`credsAgentServer.ts:577-595`) releases the
grant's entry and then the used entry, `await this.releaseWaiting(grant)` and `await this.releaseWaiting(call.uses)`,
both before `tableOrFail` (`:588`). `releaseWaiting` takes `{ accountId, entityId } | undefined` and does nothing for
`undefined`; it never throws into the call, as today. The hook is the one `extension.ts:517` already gives
(`releaseBeforeAutomaticUse`), so `extension.ts` does not change. `call.uses` is S only when the gate answered `linked`
(§2.2). In the narrow case above (a link added while the dialog stood) `uses` is `undefined`, nothing of S is released,
and the run is refused by the compare (§2.3 step 3). A release writes the vault's own waiting value into S; it shows
the agent nothing. U8 holds the order and U9 the value.

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

**The third amendment's brief** — on top of the table above, which is built. Line numbers are 5b221602's. The parts that
are S1's or the shared ssh builder's are §18's, and the stories document carries them; they are listed here so that one
table names every file the amendment touches.

| File | Change |
|---|---|
| `useActions.ts` (210 lines) | `export interface UsedEntry`; `UseAction.uses?(target: CallTarget): UsedEntry \| undefined`; `UseActionContext.uses?: UsedEntry`; the doc of `UseActionContext.summary` (§5). `OverSshCall` gains the REQUIRED `readonly ownAgentOnly: boolean` (§18.2). |
| `brokerCall.ts` (249 lines) | `CallSubject.uses: UsedEntry \| undefined` (the key required); `CallDeps.burn(status, of?: UsedEntry)`; `CallDeps.refuse(code, message, why?: string)`; `export function usedEntrySpent(name: string): string`; the turns of §2.5 in place of `queuedIfOneUse` and `takesItsTurn` (`:108-123`); `burnInTurn`; `startNow` (`:203`) adds `uses: call.uses`. The doc block `:93-107` gains the fixed order and why. About 300 lines after; each function ≤ 50 lines, complexity ≤ 4, no new lint directive. |
| `credsAgentServer.ts` (793 of 800) | After `:530`: `const uses = useAction.uses?.(grant);`, and `uses` joins the object of `:544`. `:583`: `await this.releaseWaiting(grant);` then `await this.releaseWaiting(call.uses);`, and the method (`:620-626`) takes `{ accountId: string; entityId: string } \| undefined`. `:683`: the `refuse` closure takes `why` (§2.5). `:687`: the `burn` closure takes `of = grant`. At most 797 lines after. If it would be more, `releaseWaiting` moves to `brokerCall.ts` as a function of the hook; the ceiling is not raised. |
| `agentUseActions.ts` (644 lines) | `usedEntryOf(deps, target)` (the row of §2.2); `terminalRunAction` declares `uses`; `changedSince` (`:313-315`) becomes the two-part compare of §2.3 step 3; `overSshWithSlot` (`:382-391`) passes `ownAgentOnly: true`. |
| `sshUseActions.ts` | `execOverSsh` (`:226-248`) passes `ownAgent: call.ownAgentOnly ? deps.agentSocket() !== undefined : undefined` in the options of `buildSshExecArgv`; `sshExecAction` passes `ownAgentOnly: false` with a comment that names the plan of §18.2. |
| `sshExecCommand.ts` | `SshExecOptions.noTty?: boolean`: when it is `true`, `-T` is the first element of the argv; absent or `false`, the argv is today's, element for element (§18.1). `SshExecOptions.ownAgent?: boolean` and its rule (§18.2). This file leaves the "Not changed" list above. |
| `remoteLaunch.ts`, `sshRoad.ts`, `commands/runCommands.ts`, `maskedTerminal.ts` (doc) | S1's part of §18.1: `secretsArgv` (`remoteLaunch.ts:433-436`) passes `noTty: true`. S1's part of §18.2: `SpawnLaunch.ownAgent`, `secretsLaunch(plan, prepared, ownAgent)`, `launchesOf` asks `spawnLaunch` first; the doc texts of §18.2 (a). |
| `test/agentSshWorld.ts` | `asBroker`, `oneUseStorage` (§12). |
| `test/agentSshGate.test.ts` | G11 rewritten, G17 extended, G23, G24; the `run` helper (`:172`) hands the run what the broker hands it (§13). |
| `test/agentSshRun.test.ts` | the `run` helper (`:19`) the same; no expected value changes. |
| `test/agentSshOneUse.test.ts` (new) | U1–U10 (§13). |
| `test/brokerWorld.ts` | one option, `vault?: { isOneUse; burnAfterUse }`, read by `hooksFor` (`:331-345`) in place of the two stubs when it is given. Today `options.hooks` cannot carry them: the shaped collaborators overwrite it (`:336-337`). |
| `test/brokerCallLaunch.test.ts` | `callFor` (`:63`) gains `uses: undefined`. |
| `test/sshExecCommand.test.ts`, `test/secretsLaunch.test.ts`, `test/sshRoad.test.ts`, `test/sshRoadSecrets.test.ts`, `test/sshExecOver.test.ts` | the rows of §18 (T1, T2, F1–F5). |

Not changed by the third amendment: `oneUseLane.ts`, `keyedQueue.ts`, `burnOnUse.ts`, `brokerResponse.ts`,
`brokerHooks.ts`, `extension.ts`, `maskEntries.ts`, `mcpEntries.ts`, `sshProgram.ts`, the stamp, the bridge.

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

**The third amendment adds two functions.**

```ts
/** The context of a run as the BROKER hands it: the shown summary and the used entry, read in one step (spec §2.2, §2.3 step 3). */
export function asBroker(action: UseAction, ctx: UseActionContext): UseActionContext {
  return { ...ctx, summary: action.summarize({}, ctx), uses: action.uses?.(ctx) };
}
/** `agentStorage` that can also DELETE: `deleteNodeRecursive` removes the node, or throws while `failDelete` is set. */
export function oneUseStorage(byAccount: Record<string, readonly TreeNode[]>): AgentStorage & BurnStorage & { failDelete: boolean };
/** Load-time proofs: the real predicates see the fixture as the product does. */
const once = usableSsh('s1', { burnPolicy: 'oneUse' });
assert.equal(oneUseIn(oneUseStorage({ 'acct-1': [once] }))('acct-1', 's1'), true);
assert.equal(burnedByAgentUse(once), true);
assert.equal(findUsableEntry(agentStorage({ 'acct-1': [once] }), 's1', 'exec')?.kind, 'usable');   // a one-use S passes the gate: B, not A
```

How the tests stay valid after A4. A linked run now refuses without the summary and the used entry, and the tests of
the linked road called `run(ctx)` with neither. The two helpers that every such test goes through
(`test/agentSshGate.test.ts:172`, `test/agentSshRun.test.ts:19`) call `action.run(asBroker(action, { ...w.ctx, ...over }), {})`.
So each test runs with what the broker gives a real call, read from the REAL `summarize` and `uses`, and a test that
changes the world between the two reads (G9, G10) builds its context before the change, as it does today for the
summary. No expected value of an existing test changes for this. A test world of the LOCAL road passes neither field
and is not compared (§2.3). The hooks of the broker tests are the product's own over this storage:
`vault: { isOneUse: oneUseIn(storage), burnAfterUse: burnOneUseIn(storage, () => undefined) }`.

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
| G11 | `a_linked_run_with_no_shown_summary_is_refused_and_a_local_one_is_not_compared` (rewritten by the third amendment, A4; it was `a_run_with_no_shown_summary_does_not_compare`) | Usable, trusted, linked world: `action.run(w.ctx, {})` (no `summary`, no `uses`) → `denied`, message `=== changedWhileAsking('deploy')`; `overSsh` 0; `slots.taken` 0. `action.run({ ...asBroker(action, w.ctx), summary: undefined }, {})` → the same. `action.run(asBroker(action, w.ctx), {})` → one `overSsh` call (the positive control). An UNLINKED world, `action.run(w.ctx, {})` → the local run starts as today (not compared) | the first two RUN today: `overSsh.calls.length === 1` (the skip of `agentUseActions.ts:313-315`) |
| G12 | `asks_after_consent_is_true_only_for_a_linked_entry_that_forwards_the_agent_while_the_socket_is_up` | Every S here is USABLE (`usableSsh`), so the gate answers `linked`. `typeof terminalRunAction(deps).asksAfterConsent === 'function'`; unlinked → false; linked, no `-A` → false; `-A`, `agentSocket: () => undefined` → false; `-A`, socket `'/tmp/a.sock'` → true; `deps` without `agentSocket` → false. The states of S that the gate refuses are G22's | `undefined` |
| G13 | `a_bridged_call_on_a_linked_entry_is_refused_fail_closed_with_the_allow_lists_words` | usable S, trusted, `run({ ...ctx, bridge: { … } as BridgeContext })` → `not_supported`, message `=== BRIDGE_NOT_SERVED`; `overSsh` 0; and `bridgeRouteRefusal('POST', p)` is not `undefined` for each of `/v1/use/run`, `/v1/alias/run`, `/v1/mcp/use/run` (the first wall still stands). Then the same bridged call with S MISSING and with S CLOSED: the same code and message, byte-equal (round 1, item 6: the bridge answer stands before the link is resolved, so it cannot tell S's states apart), and `storage.calls` holds no read of `s1`. And the texts of the table (§8): the `why` of each of the three `run` rows of `BRIDGE_ROUTES` holds `E3 decided`; the `why` of the `terminal`, `up` and `down` rows does not hold `run` | runs; the `why` clause: no `run` row says `E3 decided`, and the other three say `run waits for E3` |
| G14 | `the_mask_table_of_a_linked_entry_holds_the_ssh_entrys_password` | `maskEntriesWithLink(source, 'acct-1', 'e1')` with T holding nothing and S's password `'correct-horse-battery-staple'`: the table deep-includes `{ value: 'correct-horse-battery-staple', label: 'PASSWORD' }`; unlinked T → T's table only; S missing → T's table, no throw; T missing → throws `MaskSourceUnavailable` (as before) | no export |
| G15 | `the_agent_reads_no_name_host_or_reason_of_the_ssh_entry` | over G2–G5's refusals: no message includes `prod box`, `prod.example`, `Trash`, `PIN`, `acct-2`; every note does include the real reason | (RED with G2–G5) |
| G16 | `an_agents_vpn_start_with_a_linked_launcher_stays_refused` | the existing agent-start test of `test/sshLinkRoads.test.ts` (the VPN block, `startVpn` with `SENTENCE('start-openvpn')`) stays green unchanged; here: `vpnAction(vpnDeps(false, []), 'up')` is untouched by this spec — assert `launcherRefusal`-path sentence `=== sshLinkRefusal(launcher)` through `vpnWorld` as that test does | (green; a guard — say so) |
| G17 | `the_broker_hands_run_the_summary_it_showed` | over `brokerWorld` (the real broker, a stubbed action that records `ctx.summary`): `/v1/use/<action>` with Allow → the recorded `ctx.summary === action.summarize(body, grant)`'s text; a quiet MCP call (`every12h` stamped) records it too. Third amendment: the stub also declares `uses: () => USED` (`{ accountId: 'a1', entityId: 'e2', entityName: 'other' }`) and records `ctx.uses`: it deep-equals `USED` on both doors; a stub with no `uses` records `undefined`; and the stub's `uses` was called exactly once per call | `undefined`; for `uses`: the recorded `ctx.uses` is `undefined` and `uses` was never called |
| G18 | `the_one_sentence_has_one_name_and_one_parameter` | `linkedRunRefused.length === 1`; `linkedRunRefused('Q').match(/"[^"]*"/g)` deep-equals `['"Q"', '"Q"']`; `changedWhileAsking.length === 1` | no export |
| G19 | `exec_and_run_sit_on_the_same_rung` | `switchForAction('exec') === switchForAction('run')` and both `=== 'use'`; and the gate's call passes `'exec'` (a recording `findUsableEntry` is not possible without a seam, so: `usableSsh('s1', { mcp: { view: true, use: true, edit: false } })` is usable and `{ view: true, edit: true }` (no use) is refused — the rung read is `use`) | (green for the table; RED for the gate) |
| G20 | `before_the_gate_passes_every_outcome_is_the_one_sentence` (round 1, item 6) | One case per world, each with S CLOSED (`sshNode('s1', { mcp: { view: true } })`) unless the case is S itself: (a) S missing; (b) S only in `acct-2`; (c) S with `host: '-oProxyCommand=x'`; (d) T's command `'echo a\necho b'` (a line break); (e) T `terminalOs: 'windows'`; (f) T named `'a b'` with command `'echo {name}'` — the `{name}` refusal of `test/remoteLaunch.test.ts:208-213` (R10: inside `planLaunch` that refusal wins over a link refusal, which is exactly why `planLaunch` must not run before the gate); its `ctx.entityName` is `'a b'`, so its ONE is `linkedRunRefused('a b')`; (g) T with no command. For each, BOTH `validate({}, ctx)` → `{ ok: false, code: 'denied', message: ONE }` AND `run(ctx)` → `denied`, message `=== ONE`; no message holds `Windows`, `line break`, `will not run`, `has no command`, `prod box` or `prod.example`; `overSsh` 0; slot 0; `trustStore.get` never called; each world's note holds its real reason | (a)–(c) E1's sentence, `not_supported`; (d)–(g) `planLaunch`'s or today's own sentence, said first |
| G21 | `after_the_gate_passes_plan_refusals_name_only_the_terminal_entry` (round 1, item 6) | The same (d), (e), (f) with S USABLE and the line trusted: `run(ctx)` → `not_supported`, message `=== refusalSaid(T, planLaunch(T, sshLinkOf(T, lookup), { stayOpen: false }).reason)`; it holds T's quoted name (`"deploy"`, or `"a b"` for (f)) and not `prod box` or `prod.example`; (g) → `no_credential`, `"deploy" has no command.`; `overSsh` 0; slot 0. The positive half of G20: the gate decides WHEN these are said, not whether | E1's sentence |
| G22 | `before_the_gate_passes_the_follow_up_flag_says_nothing_about_the_ssh_entry` (the second amendment) | Every world has `agentSocket: () => '/tmp/a.sock'`. Six states of S that the gate refuses, each built TWICE, with `agentForward: true` and without it: (a) closed (`sshNode('s1', { mcp: { view: true } })`); (b) no `mcp`; (c) PIN-hidden (`usableSsh('s1', { pinProtected: true })`); (d) under a Trash folder; (e) usable but only in `acct-2`; (f) missing. For all twelve, `asksAfter(action, ctx) === false`, which is also the answer for an unlinked T: the forwarding world and the non-forwarding world of each state give the same bit. Then the door's admission with that bit, through the REAL throttle, as `test/consentContract.test.ts:99-113` does: `const ceilings = new TokenlessCeilings(); ceilings.admit(true, 0)` (another call holds the place); `ceilings.admit(false, 1, LOCAL_DOOR, asksAfter(action, ctx)).refusal === undefined` for all twelve (a quiet call is admitted, never *busy*), and then `validate({}, ctx)` answers `{ ok: false, code: 'denied', message: ONE }`, byte-equal across the twelve. `notes` is empty after `asksAfter` alone (the flag writes no note). POSITIVE CONTROL, so the test can see what it guards: `usableSsh('s1', { agentForward: true })` → `asksAfter(action, ctx) === true`, and the same `admit` call answers `BUSY_PLACE` | With the stub that reads the link alone (`sshLinkOf(…).kind === 'linked' && link.ssh.agentForward === true` and the socket): the forwarding worlds of (a), (b) and (c) answer `true`, and their quiet call is told `BUSY_PLACE`. That is the leak. (With no stub the control is RED: `undefined` today) |

| G23 | `uses_names_the_ssh_entry_only_after_the_gate` (third amendment, A1) | `terminalRunAction(deps).uses(ctx)`: usable S → deep-equals `{ accountId: 'acct-1', entityId: 's1', entityName: 'prod box' }`; a one-use usable S → the same (the gate does not refuse one-use: B); unlinked T → `undefined`; the six refused states of G22 (a)–(f) → `undefined` for each; `notes` is empty after `uses` alone; `storage.calls` after `uses` on the closed world equals `storage.calls` after `validate` on a fresh copy of it (no read of S beyond the gate's two). `typeof sshExecAction(deps).uses === 'undefined'` (no other action declares it) | `uses` is `undefined`: `TypeError` on the call. With the stub that reads the link alone (`sshLinkOf(…).kind === 'linked'`): the closed, PIN-hidden and other-account worlds answer S |
| G24 | `a_linked_run_over_another_ssh_entry_than_the_one_the_broker_holds_is_refused` (third amendment, A4) | World: `usableSsh('s1')` and `usableSsh('s2')` with the SAME `name`, `host`, `user` and `port`; both trust lines trusted. `shown = asBroker(action, w.ctx)` (it names `s1`); then `T.sshEntityId = 's2'`. `summarize({}, ctx) === shown.summary` (the setup: the texts ARE equal). `action.run(shown, {})` → `denied`, `=== changedWhileAsking('deploy')`; `overSsh` 0; `slots.taken` 0. Then: `action.run({ ...shown, uses: undefined }, {})` on the unchanged world → the same refusal; an UNLINKED world with `uses: { accountId: 'acct-1', entityId: 's1', entityName: 'prod box' }` → the same refusal, and nothing ran locally (`runBounded` not reached: `slots.taken` 0) | the relinked world RUNS over `s2` today: `overSsh.calls[0].ssh === s2.details` |

**`test/agentSshOneUse.test.ts`** (new; third amendment, A1 and A5). Through the REAL broker (`brokerWorld`, with the
`vault` option of §11) unless a row says `performCall`. Entries, all in `acct-1`: `s1` = `usableSsh('s1', { burnPolicy:
'oneUse' })` named `prod box`; `t1` `deploy` and `t2` `deploy2`, two Terminal entries linked to `s1`, both trust lines
trusted. Actions: `run` is the REAL `terminalRunAction` over `oneUseStorage` with a recording `overSsh`; `exec` is the
world's scripted stub (it records in `w.ran`). `STARTED` = `overSsh.calls.length + w.ran.filter((r) => r.entityId ===
's1').length`: how many times ssh was started on S. Three token grants from `w.server.share('acct-1', id, name, kind)`
(the local token door is not throttled, `credsAgentServer.ts:497`), each dialog answered `Allow`.

| # | Test | Assertion | RED today |
|---|---|---|---|
| U1 | `two_linked_runs_in_a_row_use_a_one_use_ssh_entry_once` | `run(t1)` → 200; `storage.getNode('acct-1', 's1') === undefined`; the journal holds `"prod box" was one-use and has been deleted from the vault.`; `t1` is still there. `run(t1)` again → `denied`, message `=== linkedRunRefused('deploy')` (S is missing: `validate`'s gate); `STARTED === 1`; the second call raised no dialog | the second call answers 200, `STARTED === 2`, and `s1` is still in storage. This is entry 3.2 |
| U2 | `a_direct_exec_and_two_linked_runs_at_once_start_ssh_once` | `exec(s1)`, `run(t1)` and `run(t2)` sent together, each held inside its stub until the others had 300 ms to arrive (`overlapping`, `test/brokerWorld.ts:631-648`, also wrapped around `overSsh`). `STARTED === 1`; the peak of calls inside a stub at one time is 1; exactly one answer is 200; an `exec` that lost reads `not_found` and `"prod box" was one-use and has already been used.`; a `run` that lost reads `denied` and `usedEntrySpent('deploy')` or `usedEntrySpent('deploy2')`; no answer to a loser holds `prod box` unless it is the `exec` on S itself; `s1` is gone; the journal line of a `run` that lost holds `was one-use and has already been used`. Run three times, each with a different call sent first, so that each road wins once | `STARTED === 3` and the peak is 3: only `exec` queues on S, and the two runs queue on nothing |
| U3 | `a_one_use_ssh_entry_that_could_not_be_deleted_stays_spent_on_both_roads` | `storage.failDelete = true`. `run(t1)` → 200; the journal holds `"prod box" was one-use but could NOT be deleted`; `s1` is still in storage, still one-use and still usable (`validate` of a second call answers `{ ok: true }`: asserted, so the test cannot pass by the gate). `run(t1)` again, Allow → `denied`, `usedEntrySpent('deploy')`; `run(t2)` → `denied`, `usedEntrySpent('deploy2')`; `exec(s1)` → `not_found`, `"prod box" was one-use and has already been used.`; `STARTED === 1` | the second `run(t1)` answers 200 and `STARTED` grows with every call |
| U4 | `linked_runs_over_an_ordinary_ssh_entry_are_not_queued_and_burn_nothing` | `s1` with no `burnPolicy`. `run(t1)` and `run(t2)` together under `overlapping`: both 200; the peak inside `overSsh` is 2; `s1`, `t1`, `t2` are all still in storage; the journal holds no `was one-use` line; `lane.isSpent` is false for all three keys (read through a third call: `run(t1)` again → 200) | (green today: a guard for *an ordinary entry keeps running in parallel*. Watch it RED once, with the `isOneUse` filter of §2.5 step 3 removed: the peak is 1) |
| U5 | `a_one_use_terminal_entry_burns_as_before_and_both_burn_when_both_are_one_use` | (a) `t1` one-use, `s1` ordinary: `run(t1)` → 200; `t1` is gone, `s1` is there; the journal holds the deleted note for `deploy` and none for `prod box`; `run(t1)` again → the door's answer for an entry that is gone, `STARTED === 1`. (b) both one-use: `run(t1)` → 200; both are gone; the two deleted notes stand in the order `deploy`, `prod box`; `exec(s1)` → `not_found`. (c) `t1` one-use, two `run(t1)` together: `STARTED === 1`, the loser reads `not_found` and `"deploy" was one-use and has already been used.` (today's sentence, for the grant's own entry) | (a) and (c) are green today (the guard for *T's own burn is unchanged*); (b): `s1` is still in storage |
| U6 | `a_linked_run_that_did_not_answer_200_spends_nothing` | S one-use. (a) the trust line NOT trusted: `run(t1)` → the untrusted refusal; `s1` is there; then trust it: `run(t1)` → 200 and `s1` is gone. (b) `overSsh` answers `{ status: 500, … }` (`Could not run ssh`): `s1` is there and a later `run(t1)` → 200. (c) the summary differs at run time (S's host changed while the dialog stood, `holdDialogs`): `changedWhileAsking`; `s1` is there and is not marked (a later `exec(s1)` runs) | the first half of each is green today (nothing is ever spent); the second half is RED: after the later 200, `s1` is still in storage |
| U7 | `the_turns_are_taken_in_key_order_so_two_calls_that_use_each_others_entry_both_end` (`performCall` with the real `OneUseLane` and `burnAndMark`, scripted actions, as `test/brokerCallLaunch.test.ts` builds its calls) | Entries `a` and `b`, both one-use. Call X: the grant names `b`, `uses` is `a`. Call Y: the grant names `a`, `uses` is `b`. Both started in one tick; each action waits 50 ms. Within 2 s (`Promise.race` with a timer that fails the test): both calls have ended; exactly one action ran; both entries are burned and marked; the other call was refused before its action ran, with `usedEntrySpent` or today's own-entry sentence, whichever turn it met first. The same with X and Y started in the other order | With the turns taken in the order *the grant's entry, then the used entry* (not sorted): X holds `b` and waits for `a`, Y holds `a` and waits for `b`; the 2 s timer fails the test. This is the proof of the fixed order |
| U8 | `a_waiting_value_of_the_ssh_entry_goes_in_before_the_table_is_read` (A5) | `hooks: { releaseWaiting: record }` and a recording `masker`: for `run(t1)` the recorded order is `['release acct-1/t1', 'release acct-1/s1', 'mask acct-1/t1']`; for `exec(s1)` it is `['release acct-1/s1', 'mask acct-1/s1']` (unchanged); for an unlinked T there is no second release | no `release acct-1/s1` in the first list |
| U9 | `the_agents_output_masks_the_ssh_password_that_the_run_used` (A5; the pattern of `test/waitingRotationVisible.test.ts:574-604`) | Real `memoryStorage`, the real `maskEntriesWithLink`, the real `releaseBeforeAutomaticUse` as the hook. `s1` stores the password `OLD` and holds a rotated `NEW` waiting (`holdRotated`). The recording `overSsh` opens S's password the automatic way (`automaticOpenerFor`) and answers it in `stdout`. `run(t1)` → 200; `storage.getPassword('acct-1', 's1')` carries `NEW` (the setup: the release happened); `JSON.stringify(answer.body)` does NOT include `NEW` | the answer holds `NEW` in the clear: the table was read with `OLD` in it, and the run stored and used `NEW` |
| U10 | `every_per_entry_hook_of_the_broker_has_a_decision_for_the_used_entry` (the sweep of §2.5, left behind as a test) | A table in the test: `maskEntriesFor: 'the link (maskEntriesWithLink)'`, `releaseWaiting: 'uses'`, `isOneUse: 'uses'`, `burnAfterUse: 'uses'`, `rememberMcpConsent: "the grant's only (spec §3.2)"`, and each other name of `BROKER_HOOK_NAMES` (`brokerHooks.ts:196-215`) with `'takes no entry of a grant'`. The test reads that list and fails, naming the hook, when a name has no row. Companion: the list is not empty and holds `burnAfterUse` (a scan that matches nothing passes forever) | a new hook with no row; today: the table does not exist |
| U11 | `the_sentence_for_a_spent_used_entry_names_one_entry` | `usedEntrySpent.length === 1`; `usedEntrySpent('Q').match(/"[^"]*"/g)` deep-equals `['"Q"']`; the text holds no `prod box` for any input | no export |

**Existing tests whose expected values change**

- `test/agentSshGate.test.ts` G9 and G10 (`:311-361`) build `shown = asBroker(action, w.ctx)` BEFORE they change the
  world and call `action.run(shown, {})`, in place of `{ ...w.ctx, summary }` (`:319`, `:348`, `:359`). No expected value
  changes: each case still reads the sentence it read (third amendment, A4).
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
| A password S with a jump host | runs (parity with `ssh:exec`); risk 7 of the parent is inherited, not fixed here. Decided again in the third amendment (A6, §18.3): not refused, the limit recorded | — |
| A bridged `run` | the allow-list refuses before the body is read; a call that somehow reached `run` with `ctx.bridge` is refused with the same words | G13 |
| A `creds_vpn_up` whose launcher or chain step is linked | E1's shared sentence, nothing typed | G16 |
| A Terminal entry whose link was added by a sync after a 12-hour Allow | quiet at the door, refused at step 6 as untrusted until a person runs the trust line here | §S2.5 AG2 covers the key; G1/G2 the gate |
| A linked T whose `command` holds a `{name}` the composer refuses | `not_supported`, `refusalSaid` — after the gate, so a closed S still gives the one sentence first | G20 (f), G21 (f) |
| A T written for Windows, or with a line break, linked to an S the agent may not use — probing whether S is usable by watching for the D9 or line-break sentence | the one sentence: the gate answers before `planLaunch` runs; the D9 / line-break sentence only when S is usable | G20 (d) (e), G21, §S2.5 AG6 |
| A bridged call, probing S's state through the bridge | `BRIDGE_NOT_SERVED` for a missing, a closed and a usable S alike; S is never read | G13 |
| A quiet grant on T (T's policy asks once in 12 hours, or never) linked to an S the agent may not use: the agent holds the dialog place with a second call and watches whether the quiet `run` is told *busy*, to learn whether S forwards the agent | Never *busy* for this reason: the flag asks the gate first and is `false` for a closed, PIN-hidden, trashed, missing or other-account S, forwarding or not; the call is admitted and reads the one sentence | G22 |
| An agent on the alias door (the CLI's `run`) | the same `perform`, the same `validate`: the one sentence; the alias route's modal is never raised for it | G6 (the funnel is one) |
| **Third amendment.** An S set to live *until an agent uses it once*, opened to agents, behind a linked T: the agent calls `creds_run` on T again and again | the first call that answers 200 deletes S; the next call reads the one sentence (S is missing) | U1 |
| The same, with `creds_exec` on S and `creds_run` on two Terminal entries linked to S, all at the same moment | ssh is started once; the two that lost are refused before anything ran | U2 |
| The same, on a machine where S could not be deleted | S's spent marker refuses both roads for the life of the window | U3 |
| Two calls built so that each holds the other's entry (to make the broker hang) | both end: the turns are taken in one order | U7 |
| An agent that first lets a rotation of S fail to store (the value waits), and then prints S's password through a linked run | the waiting value went in before the table was read, so the output is masked | U8, U9 |
| A link moved to a second SSH entry that looks the same (name, host, user, port), while the dialog stands | `changedWhileAsking`: the id is compared, and the broker holds the first entry's turn | G24 |
| A caller that reaches `run` on a linked entry with no summary (a new door, a wrapper that forgets it) | `changedWhileAsking`; nothing ran | G11 |
| The person's ssh config says `RequestTTY force`, and the person runs Run with Secrets over SSH | the argv says `-T`: ssh asks for no pty, the script on stdin is not echoed, and a value with a control byte or a `~` at a line start is only data | T1; the effect is hand check 3's (§18.1) |
| The same config, and an agent's `creds_run` on a linked entry (or `creds_exec`) | today's argv, no `-T`: ssh asks for a pty; no script is on stdin, so nothing is echoed; `stdout` and `stderr` are joined and a value of more than one line is not masked. A recorded limit, shared with the shipped `ssh:exec` (§18.1, §16 item 11) | T2 (a guard that the argv is not changed) |
| S forwards the agent, the extension's agent has no key, and the extension host has an `SSH_AUTH_SOCK` of the person's own | E3's two roads: no `-A`, and `-o ForwardAgent=no`; nothing is forwarded, as the banner says. `ssh:exec` on S: today's argv, its own plan (§18.2) | F1–F5 |

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
      the broker always sets it (G17). (Third amendment: a LINKED run with no summary or no `ctx.uses` IS refused; only a
      local run is not compared, G11.)
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

**The third amendment.**

- [ ] `uses` calls `linkedCall` FIRST and answers S only on `linked`; `terminalRunAction` is the only action that
      declares it (grep `uses:` in `*UseActions.ts` and `rotateAction.ts`); G23 was watched RED with the stub that reads
      the link alone.
- [ ] `perform` reads `uses` on the line after `summarize`, with no `await` between them (read `credsAgentServer.ts`
      around `:530`); the broker calls it once per call (G17).
- [ ] The turns: spent is asked before one-use, for both entries; only one-use entries are queued; the order is by lane
      key with a plain compare, not *the grant first* (U7 was watched RED with the unsorted order); `answer` is the only
      thing inside the innermost turn.
- [ ] The burn: the grant's entry first, then the used entry, through the SAME `burnAndMark`; both are awaited before
      `answer`'s promise settles. `oneUseLane.ts`, `burnOnUse.ts` and `brokerResponse.ts` are not in the diff.
- [ ] `usedEntrySpent` has one parameter, names the grant's entry only, code `denied`; S's name is in the journal line
      and not in any answer to a `run` (U2 asserts it).
- [ ] The existing one-use suite (`test/oneUseAndCap.test.ts`) is green and is not in the diff.
- [ ] `changedSince` has the two parts of §2.3 step 3; the only skip left is a `local` gate with no summary and no `uses`.
- [ ] `releaseWaiting(call.uses)` stands after the grant's release and before `tableOrFail`; U9 was watched RED with the
      value in the answer.
- [ ] `credsAgentServer.ts` is at most 797 lines; no ceiling and no lint rule was changed.
- [ ] `-T` is the first word of the argv of Run with Secrets and of no other argv: `noTty: true` stands at exactly one
      production site, `secretsArgv` (grep `noTty`); `sshExecCommand.ts` writes the word, not the composer. The argv of
      `ssh:exec`, of the linked run and of the three clicks of `commands/agentCommands.ts` is today's (T2). No
      `-o EscapeChar=none` was added; no test says that `-T` PREVENTS a pty — the tests say it is sent, and hand check 3
      holds the effect.
- [ ] `ownAgentOnly` is a REQUIRED field of `OverSshCall`: the linked run says `true`, `ssh:exec` says `false` with the
      plan named beside it, and F5 finds exactly that one `false`. `secretsLaunch` has a required third parameter.
- [ ] The doc of `sshRoad.ts` (`:29-33`, `:37-41`) and of E3-D4, E3-D5 and E3-D8 says what the child's environment
      really is (§18.2 (a)); no text says that the person's own agent is never used.

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

**Flags of the third amendment.**

9. **Other calls that use a second entry — the same class as entry 3.2, on shipped roads, outside this plan.** `uses` is
   optional and only the linked run declares it (§2.5). Method of the search: `grep -n 'EntityId?:\|dependsOn' types.ts`
   gives five reference fields (`sshKeyEntityId` `:76`, `jumpHostEntityId` `:84`, `vpnLauncherEntityId` `:115`,
   `sshEntityId` `:172`, `dependsOn` `:282`). CHECKED: `sshEntityId` (this plan); `sshKeyEntityId` — the referenced
   entry is an `sshkey`, which cannot be one-use (`entityKind.ts:178-180`); `jumpHostEntityId` — `-J` takes the hop's
   address only, no stored credential of the hop is used (which is why §18.3 exists); an agent's `run` starts no
   dependency (`agentUseActions.ts` has no reader of `dependsOn`). NOT CHECKED: an agent's VPN start
   (`creds_vpn_up`), which runs a launcher entry (`vpnLauncherEntityId`) and the chain (`dependsOn`) — whether those
   Terminal entries' own *Usable by agents* switch, their one-use policy and their values in the mask table are honoured
   there. Parent §9 already says that road needs its own security judgement. For the lead to route.
10. **`ssh:exec` can forward the person's own agent with no question** (§18.2). Read in the code on 5b221602, NOT
    observed on a host: an SSH entry with agent forwarding on, opened to agents, on a machine where the extension's own
    agent has no key (`sshAgentManager.ts:206-208`: no socket) and the extension host has an `SSH_AUTH_SOCK` (a desktop
    session's agent). `buildSshExecArgv` sends `-A` (`sshOptions.ts:197`), the child inherits the host's socket
    (`sshExecAuth.ts:95`, `:139`, `:155`; `sshUseActions.ts:107`), and the journal says *nothing will be forwarded*
    (`sshProgram.ts:252-254`). The agent's FREE command then runs on the server with the person's own agent, which signs
    with no prompt, where the extension's agent would ask for each signature. Shipped since `-A` was wired for a
    spawned ssh. This is not E3's road, and E3 does not change it. My judgement: it is more than minor, it needs its own
    plan with the fix on the one road (the one word `ownAgentOnly: false` → `true` after E3, or the same rule in
    `execOverSsh` before it), an observation on a real host first, and the owner's word, because it takes away something
    a person may use today. The three person clicks of `commands/agentCommands.ts` (`:197`, `:222`, `:351`) build the
    same argv and belong to the same plan. NOT the plan `PLAN_ssh_exec_absolute_program.md`: that one waits for E3 and
    is not exploitable today; this one should not wait.
11. **A forced pty on the agent's roads is a recorded limit, not fixed here** (§18.1; the lead's decision, 2026-11-10).
    With `RequestTTY force` in the person's ssh config, `ssh:exec` and the agent's linked run get a pty: `stdout` and
    `stderr` are joined, line ends become CR LF, and a value of more than one line is then not masked in the agent's
    answer. For the linked run this is a limit of D15's *masked with the SSH entry's values too*. `-T` is not sent
    there, because it would change the shipped `ssh:exec` (a person may rely on a forced pty, for `sudo` for example).
    It belongs to the plan of item 10, which already decides what a spawned ssh of the agent takes from the person's
    ssh setup. For the lead to route; text for that plan, not for E3's CHANGELOG.
12. **Parent §4.4 says of Run with Secrets: *the agent socket as the agent's `ssh:exec` chooses it*.** After A3 the two
    differ in one case (the entry forwards, the extension's agent is not up). The parent's words change.
13. **`PLAN_askpass_answers_the_hop.md` names two paths; E1, E2 and E3 add roads to both** (§18.3). Its table and its
    place in the order change; the both-sides rule asks for the rows there and in parent §7 and §7a.
14. **The help does not say that a linked run spends a one-use SSH entry** (§17). An entry is deleted by it, so a person
    must be able to read it before it happens.

## 16a. The both-sides rule

The first version of this file said that `plan-lifecycle.mjs` reported `todo/README.md omits
PLAN_terminal_command_over_ssh_E3_S2_security.md`, and that the lead adds the row. That is done: `todo/README.md` has this
file's row, the stories document links this file from its status block, and
`node .agents/conventions/tools/plan-lifecycle.mjs` answers `clean` (run on e57eb80f, 2026-11-10, before and after the
second amendment). The README row is another file and is the lead's: it names the scenarios `G1–G19`; this file now
holds G1–G24 and U1–U11, and §18 names T1, T2 and F1–F5 for the stories document. `plan-lifecycle.mjs` answers `clean`
after the third amendment (run on this file's commit).

## 17. Help ×5

Unchanged from §S2.3: the bullet's sentence *… and so does an agent's run, but only when the SSH entry itself is
*Usable by agents*; otherwise the agent is refused and nothing runs.* is true of this gate. The agent-access article
(`helpEn.ts:116`: *They also require that you have run the entry yourself once on this machine*) stays true: the trust line
is the key (§2.3 step 6). No further help text is owed by this spec.

**Third amendment: one sentence is owed** (A1). A linked run deletes a one-use SSH entry, and a person must be able to
read that before it happens. After the sentence above, in the five languages, English first: *If that SSH entry is set
to last until an agent uses it once, the agent's run is that use, and the SSH entry is deleted after it.* It is true of
§2.5: only an agent's run, only after a run that started ssh, and a person's own run never deletes the entry.

## 18. The ssh that E3 spawns (third amendment; decisions for S1 and for the shared builder)

These three decisions are about the ssh child, not about the gate. They are in this file because they are security
judgements of the same re-review. The stories document carries the brief and the scenarios (T1, T2, F1–F5), as it
carries `execOverSsh`.

### 18.1 `-T` (A2)

**The gap.** The parent promises a run with no tty (§4.4: *no `-t`*, *The run is NON-INTERACTIVE: no tty*). The argv
says nothing about a tty (`secretsArgv`, `remoteLaunch.ts:433-436`; `buildSshExecArgv`, `sshExecCommand.ts:94-136`), so
the promise holds only while the person's ssh config is silent. With `RequestTTY force` there, ssh asks the server for
a pty. For Run with Secrets the script on stdin is then typed into a terminal: the server echoes it (the values come
back in the output, and a value of more than one line comes back with CR LF, which the masker's needle does not have),
a control byte in a value acts on the terminal, and a line that starts with `~` is read by ssh as an escape. For
`ssh:exec` and the agent's linked run stdin is not used (`sshExecRunner.ts:134`), so nothing is echoed and nothing is
read as an escape; there `stdout` and `stderr` are joined and line ends become CR LF, so a value of more than one line
is not masked in the agent's answer.

**Decision (the lead's, 2026-11-10; it replaces this section's first text).** `-T` goes on the argv of Run with Secrets
over SSH, and on no other argv. The first text put `-T` into `buildSshExecArgv` for all five callers
(`sshUseActions.ts:238`, `remoteLaunch.ts:435`, `commands/agentCommands.ts:197`, `:222`, `:351`). The lead refused that:
it changes the shipped `ssh:exec` and three shipped clicks, none of which puts a script on stdin; a person may rely on
`RequestTTY force` there (for `sudo`, for example); and a change of shipped roads is outside this plan. The danger of
the echo, of a control byte and of `~` exists only where a script goes on stdin, and that is this one road.

**How: an option of the builder, not a word that the composer adds.** `SshExecOptions` (`sshExecCommand.ts`) gains
`noTty?: boolean`. With `noTty: true`, `buildSshExecArgv` returns `-T` as its FIRST element:
`['-T', '-o', 'BatchMode=yes' | 'NumberOfPasswordPrompts=1', …]`. Absent or `false`, the argv is today's, element for
element. `secretsArgv` (`remoteLaunch.ts:433-436`) passes `{ jump, knownHostsFile, ownAgent, noTty: true }`, and no
other caller names the option. Why the option and not `['-T', ...argv]` in `secretsArgv`: every ssh option word is
written in ONE file today, and that file knows where a word may stand (before `--`, before the destination). A second
place that adds a word to a finished argv is a second composer. With the option, K1 keeps its form (a deep-equal with
`buildSshExecArgv`), and one grep for `noTty` shows who asks.

**What is left open, on purpose.** With `RequestTTY force`, `ssh:exec` and the agent's linked run still get a pty.
This is a measure at one of its sites, by decision and in the open: §16 item 11 records the limit and sends it to the
plan that owns the shipped road, and T2 holds that this plan did not change those argvs.

**No `-o EscapeChar=none`.** ssh reads an escape only in a session with a pty (ssh(1): *`-e` … Sets the escape
character for sessions with a pty*; *When a pseudo-terminal has been requested, ssh supports a number of functions
through the use of an escape character*). With `-T` there is no pty. So on the road that gets `-T` the option would
change nothing that can be seen, and security.md says to delete such a measure: it is where the next reader stops
looking. On the roads that do not get `-T` no script is on stdin (`stdio: ['ignore', …]`), so there is no line for ssh
to read as an escape.

**What was measured, and what was not.** On OpenSSH_10.2p1 (this machine, 2026-11-10), with `ssh -G` and a config file
that says `RequestTTY force`: the config alone → `requesttty force`; with `-T` → `requesttty false`; with
`-o BatchMode=yes` and no `-T` → still `requesttty force` (BatchMode does not help). ssh_config(5): *for each parameter,
the first obtained value will be used*, and the command line is read first. `ssh -G` shows what the client resolved,
not what a server did. NOT observed: a real session (no sshd on this machine). So the code and the tests say that `-T`
is SENT, and hand check 3 gains one line that holds the effect: with `RequestTTY force` in `~/.ssh/config`, Run with
Secrets of a line `tty; printf '%s\n' done` prints `not a tty`, the script is not echoed, and a value that holds `~.`
at a line start does not end the session. If that line fails, stop and report: the measure is then a comment.

### 18.2 The agent socket (A3)

**(a) What the child's environment is.** `maskedTerminal.ts:284` spawns with `{ ...process.env, ...options.env }`, and
`execOverSsh` with `{ ...process.env, … }` from `sshExecAuth.ts` (`:95`, `:139`, `:155`) under `agentAwareLaunch`
(`sshUseActions.ts:107`). So the child has the extension host's whole environment. `SSH_AUTH_SOCK` in it is the
extension's own agent only when the SSH entry forwards the agent and that agent is up (`sshProgram.ts:268-280`).
In every other case it is whatever the extension host has: the person's own agent, or nothing. Two texts say
otherwise and are corrected: `sshRoad.ts:31-33` (*never "whatever `SSH_AUTH_SOCK` the host process has"*) and
`sshRoad.ts:39-41` (*the environment holds `SSH_AUTH_SOCK` (when the entry forwards the agent) and the askpass variables*),
with E3-D4, E3-D5 and E3-D8 of the stories document, which say the same. True words: *the run ADDS only the askpass
variables and, for a forwarding entry with the extension's agent up, `SSH_AUTH_SOCK`; the child also has the extension
host's own environment. A stored key is written to its own file and `-i` names it, but ssh can still offer the keys of
the person's own agent first: that is the person's own ssh setup, as `~/.ssh/config` is.*

This is a recorded limit, not changed here. `-o IdentitiesOnly=yes` or `-o IdentityAgent=none` would stop it, and
would also stop an SSH entry that holds no key and no password and signs in with the person's own agent, which works
today on every road. Whether the person's own ssh setup applies to a spawned ssh is one question for all its parts
(`SendEnv`, `ForwardAgent`, the agent's keys, `ProxyCommand`), and `PLAN_askpass_answers_the_hop.md` already owns it
(its Definition of Done, third row).

**(b) `-A` with the extension's agent not up.** `sshOptionArgv` sends `-A` whenever the entry asks (`sshOptions.ts:197`).
With no socket of the extension, `agentForwardEnv` adds nothing and answers the warning *agent forwarding is on for this
connection, but no key is loaded — nothing will be forwarded until one is loaded into the agent* (`sshProgram.ts:252-254`,
`:276-278`). The child still has the host's `SSH_AUTH_SOCK`, so ssh forwards THAT agent. The banner of Run with Secrets
and the journal of the agent's run say that nothing is forwarded, and the person's own agent is. The extension's agent
asks before each signature; the person's own does not.

**Decision for the two roads E3 adds.** When the SSH entry asks for forwarding and the extension's agent is not up, the
argv has NO `-A` and has `-o ForwardAgent=no`. Then the sentence is true whatever the environment and whatever the
person's config says.

- `SshExecOptions` (`sshExecCommand.ts`) gains `ownAgent?: boolean`. `ownAgent === false` and `entity.agentForward ===
  true`: the composer gets the entry with `agentForward: false`, and the argv gains `-o`, `ForwardAgent=no` — the way the
  bridged branch takes the flag away (`:117-124`), because `-A` wins over the option in either order. `true`, or absent:
  today's argv. An entry that does not ask for forwarding gets neither word: there the person's config is the person's.
- Run with Secrets: `SpawnLaunch` (its `spawn` shape, `sshRoad.ts:52-54`) gains `readonly ownAgent: boolean`, true only
  when `ssh.agentForward === true` and the socket is up. `secretsLaunch(plan, prepared, ownAgent: boolean)` — a REQUIRED
  third parameter, passed on to `buildSshExecArgv`. `launchesOf` (`commands/runCommands.ts:558-565`) asks `spawnLaunch`
  first and hands its `ownAgent` to `secretsLaunch`.
- The agent's linked run: `OverSshCall` (`useActions.ts:102-107`) gains the REQUIRED `readonly ownAgentOnly: boolean`.
  `execOverSsh` passes `ownAgent: call.ownAgentOnly ? deps.agentSocket() !== undefined : undefined`. The linked run says
  `true` (§2.3 step 8).
- `ssh:exec` says `ownAgentOnly: false`, with a comment that names its plan (§16 item 10). This is a measure at some of
  its sites, on purpose and in the open: the field is required, so each caller decides where it is written; F5 finds
  exactly one `false`; and the plan that turns it to `true` changes one word. It is not done here because it takes away
  something a person may use today on a shipped road, and that needs the owner.

The trust line and the consent text still show `-A`: the person approved it, and the launch does less (§5).

**Measured** (OpenSSH_10.2p1, `ssh -G`, 2026-11-10): a config with `ForwardAgent yes` and `-o ForwardAgent=no` on the
command line → `forwardagent no`; `-A` with `-o ForwardAgent=no`, in both orders → `forwardagent yes` (so the flag must be
taken away, not out-voted; the same result as S3.14 item 3 of the bridge plan). NOT observed: a real session. Hand
check 3 gains a second line: with `ForwardAgent yes` in `~/.ssh/config`, a forwarding SSH entry and no key in the
extension's agent, Run with Secrets of `echo "${SSH_AUTH_SOCK:-none}"` prints `none`.

### 18.3 A password SSH entry with a jump host (A6)

[PLAN_askpass_answers_the_hop.md](PLAN_askpass_answers_the_hop.md): the hop's nested ssh inherits the askpass
environment, so a hop that asks for a password is answered with S's. That plan names two paths: the agent's local
`exec`, and the person's Connect.

- **Does E3.S2 make it new for an agent?** No. The linked run goes through `execOverSsh`, the body of the first path.
  The gate lets it through only when S is *Usable by agents*, and then the same agent reaches the same hop with
  `creds_exec` on S. The one who gains from the defect is the hop, not the agent, and the hop gains on the first
  connection of any road.
- **Must E3 refuse a password S with a jump on the agent road?** No. It would be a measure at one of its sites: the
  arrow, the launcher and the folder run (E2, released in 1.20.0), Run with Secrets (E3.S1) and `ssh:exec` would still
  do it. (The dependency chain refuses a password SSH entry at plan time, parent §4.4, so it is not one of them.) It
  would make D2's road smaller (a narrowing) and would protect nothing. The fix belongs on the two shared roads that
  plan names, and then every road has it.
- **Its priority.** It goes up, and the reason is the whole plan, not S2: E1, E2 and E3 make a password SSH entry with
  a jump host a thing people link commands to, so more connections pass the defect, and Run with Secrets sends vault
  values through a connection whose hop was answered that way. It is the next plan on the SSH roads after E3. It is not
  a condition of E3's merge or release: no road of E3 adds a new way to reach it.
- **Both sides.** That plan's table gains the roads that now share each path. Path 1 (`execOverSsh` →
  `buildSshExecArgv` with `auth: 'askpass'` and `jump`): the agent's linked run (E3.S2). The same builder, from
  `secretsArgv`: Run with Secrets over SSH (E3.S1). Path 2 (SSH Connect's preparation and `-J`): the arrow, a VPN's
  launcher and the folder run (E2). Parent §7 risk 7 and §7a say the same.

### 18.4 Scenarios for the stories document — RED first

Each says what is SENT. None says that an option protects: the two effects are hand check 3's lines (§18.1, §18.2).

| # | File | Test | Assertion | RED today |
|---|---|---|---|---|
| T1 | `test/sshExecCommand.test.ts`; `test/secretsLaunch.test.ts` (K1 and K2 gain it) | `no_tty_is_said_first_and_only_when_the_caller_asks` | The builder: with `{ noTty: true }`, for `'key'` and for `'askpass'`: `argv[0] === '-T'`; exactly one element is `-T`; no element is `-t` or `-tt`; no element is `EscapeChar=none`; `argv.slice(1)` deep-equals the argv of the same call without `noTty` (the option adds one word and moves nothing). With no `noTty`, and with `noTty: false`: no element is `-T`, and `argv[0] === '-o'`. K1 and K2: `launch.argv[0] === '-T'`, said by name, and the expected argv of the deep-equal is `buildSshExecArgv(…, { jump, knownHostsFile, ownAgent, noTty: true })` | `argv[0] === '-o'` for `{ noTty: true }` (the option is not read); K1: `launch.argv[0] === '-o'` |
| T2 | `test/sshExecOver.test.ts`; `test/launchRoadScan.test.ts` (with F5) | `the_agents_ssh_keeps_its_argv_no_tty_word_is_added` (a GUARD) | `execOverSsh` as the linked run calls it and as `ssh:exec` calls it: no element of `runs[0].argv` is `-T`, and `runs[0].argv[0] === '-o'`; the deep-equal of `:134` keeps its expected value but for `ownAgent`. The scan: `noTty` stands at exactly one production site outside `sshExecCommand.ts`, in `secretsArgv` of `remoteLaunch.ts`; a failure names file and line; companion: the scan finds that one | (green today, a guard: say so. Watch it RED once, with `noTty: true` passed in `execOverSsh`: `runs[0].argv[0] === '-T'`.) The scan half is RED before the build: the companion finds no site |
| F1 | `test/sshExecCommand.test.ts` | `a_forwarding_entry_with_no_agent_of_ours_gets_no_dash_a_and_forward_agent_no` | entity with `agentForward: true` and one `-L` forward. `{ ownAgent: false }`: no element is `-A`; the pair `-o`, `ForwardAgent=no` stands once; the `-L` is still there. `{ ownAgent: true }`: `-A`, and no `ForwardAgent=no`. No `ownAgent`: `-A` (today's argv). An entity that does not forward, `{ ownAgent: false }`: neither word. `{ bridged: true }`: the six options as before (`:125`), unchanged | `ownAgent` is not read: `-A` is in the argv of the first case |
| F2 | `test/sshRoad.test.ts` (H7 gains it) | `spawn_launch_says_whether_the_agent_is_ours` | forwarding and a socket: `ownAgent === true`, `env.SSH_AUTH_SOCK` is the socket. Forwarding and no socket: `ownAgent === false`, `warning === NO_AGENT_TO_FORWARD`, `'SSH_AUTH_SOCK' in env` is false. Not forwarding, a socket: `ownAgent === false`, no warning | no such field |
| F3 | `test/sshRoadSecrets.test.ts` | `a_run_with_secrets_that_forwards_with_no_agent_up_sends_no_dash_a` | the world of the warning test (`:233`): `masked[0].argv` holds no `-A` and holds the pair `-o`, `ForwardAgent=no`; the banner holds `Note: ${NO_AGENT_TO_FORWARD}.`; the trust line that was asked still holds ` -A ` (the approval is not changed). With the socket up: `-A` in the argv and `masked[0].env.SSH_AUTH_SOCK` is the socket | `-A` is in the argv while the banner says that nothing is forwarded |
| F4 | `test/sshExecOver.test.ts` | `the_linked_run_never_sends_dash_a_without_our_agent_and_ssh_exec_is_not_changed` | `execOverSsh` with `ownAgentOnly: true`, a forwarding entry, `agentSocket: () => undefined`: `runs[0].argv` holds no `-A` and holds `ForwardAgent=no`; the note holds `NO_AGENT_TO_FORWARD`. With a socket: `-A`, and `runs[0].env.SSH_AUTH_SOCK` is the socket. With `ownAgentOnly: false` (as `ssh:exec` calls it) and no socket: `-A` is in the argv — the guard that this plan did not change the shipped road | the first case holds `-A` |
| F5 | `test/launchRoadScan.test.ts` (or a scan file of its own) | `only_ssh_exec_still_sends_dash_a_without_our_agent` | over the production `*.ts` files, comments removed, matched across lines: `ownAgentOnly: false` stands at exactly one site, in `sshExecAction` of `sshUseActions.ts`; `ownAgentOnly: true` stands in `agentUseActions.ts`; the calls of `buildSshExecArgv(` whose options name no `ownAgent` are exactly the three of `commands/agentCommands.ts` (a list that may only get shorter). A failure names file and line. Companion: the scan finds the one `false` and the three calls (a scan that matches nothing passes forever) | the companion fails: no site |

Two existing rows of the stories document change their NAME, because the name said more than the test sees: S9
(`the_child_env_is_the_askpass_and_agent_variables_only_and_holds_no_value`) reads `masked[0].env`, which is what the
run ADDS, not the child's whole environment; it becomes `the_run_adds_only_the_askpass_and_agent_variables_and_no_value`.
Its assertions do not change. No test that pins an argv of `ssh:exec`, of the linked run or of a click of
`commands/agentCommands.ts` changes for `-T`: those argvs are today's.

## 19. What the third amendment does to scope, the Definition of Done, the merge conditions and the release

| # | Decision | Smaller? | Why |
|---|---|---|---|
| A1 | a linked run spends a one-use S (B) | no | D2's road is as wide as before: a one-use S that is open to agents still runs, once, which is what its form says. The Definition of Done and the merge conditions GAIN rows (U1–U11, G23, G24). A — the refusal — would have been a narrowing, and is not chosen |
| A2 | `-T` on the argv of Run with Secrets only | no | it makes *no tty* true as the parent wrote it for that road; nothing of E3 is released, so nobody loses a thing they have; no shipped road changes (the lead's decision). The forced pty on the agent's roads is a recorded limit, not a smaller plan: the parent promised *no tty* for Run with Secrets only |
| A3 | no `-A` without the extension's agent, on E3's two roads | no | nothing of E3 is released, so nobody loses a thing they have; the parent never promised that the person's own agent is forwarded, and the banner says the opposite. `ssh:exec` is not changed |
| A4 | a linked run needs the shown summary and the used entry | no | the broker always gives both; only a call that no door makes is refused |
| A5 | the waiting value of S goes in first | no | it makes §7 true as written |
| A6 | no refusal of a password S with a jump | no | nothing is refused; the limit is recorded |

So, for the part this file owns, the record of the re-review can say `Narrowed: no`. What the amendment ADDS to the plan
(a contract of the broker: `uses`, the turns, the burn; one word in the shared ssh builder; the per-call `ownAgentOnly`)
is part of the baseline that epoch 4 is approved on, not an entry of it.
