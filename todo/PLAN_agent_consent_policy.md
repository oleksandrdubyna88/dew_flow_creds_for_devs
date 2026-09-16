# PLAN — how often a person is asked before an agent uses an entry

> Status: **plan only, nothing implemented yet, 2026-09-16.** Scope: the extension's MCP use door —
> `mcpAccess.ts`, `mcpEntries.ts`, `mcpHooks.ts`, `brokerRequests.ts`, `brokerMcpDoor.ts`,
> `credsAgentServer.ts`, the two forms, and one new pure module. The server, the C# relay's logic and
> the HTTP contract are untouched (`src_mcp` changes prose only).
>
> Issue: [#95](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/95).
> Related docs: [module_extension.md](../research/module_extension.md),
> [PLAN_agent_folder_ops.md](../research/PLAN_agent_folder_ops.md) (the last time this section grew),
> [PLAN_caller_identity_in_consent.md](../research/PLAN_caller_identity_in_consent.md) (the last change
> to this modal).

## The symptom

Every MCP call raises a modal. Not the first per session, not the first per entry — every single one.
The cause is structural rather than a setting: consent is recorded on a **grant**
(`grantRegistry.ts:18-33`, in memory), and the MCP door **mints a fresh grant per call**
(`brokerMcpDoor.ts:119`, `:179`, `:199-210`), so `consent()`'s "already allowed" short-circuit at
`credsAgentServer.ts:551` can never fire for it. The token door does not behave this way: one Allow
covers every later call on that token, bounded by `agentGrantIdleMinutes` (default 60) and
`agentGrantMaxCalls` (`grantLimits.ts:15-20`).

So the person using an agent against a database they opened to it on purpose answers the same dialog
forty times an hour. That is consent fatigue, and `aliasThrottle.ts:9-13` already names it as the
documented way a gate like this is defeated — *"the twentieth identical dialog is the one somebody
clicks through to make it stop."* An unconfigurable prompt is not a stronger gate than a configurable
one; it is the same gate with the person trained to click past it.

## The goal

One three-way answer per entry, in the Agent access section beside the switches that already decide
what an agent may do:

| answer | meaning |
|---|---|
| **Ask every time** | today's behaviour, and what everything unset does |
| **Ask once every 12 hours** | the first call asks; the rest of the window goes through |
| **Never ask** | calls run with no dialog; the switches become the whole gate |

## Decisions the owner took before this plan was written (2026-09-16)

| # | Decision |
|---|---|
| **D1** | The policy governs the **MCP use door only** — `/v1/mcp/use/*`. Not the SSH signature dialog (`sshAgentManager.ts:231-257`), not the Share-with-Claude-Code token door, not the alias route. |
| **D2** | **Deleting always asks**, whatever the policy says. Creating likewise — it has no entry to carry a policy. |
| **D3** | The policy VALUE lives on `McpAccess` (`mcpAccess.ts:19-39`): inside the vault, inherited from folders, and already stripped from shares by `shareFormat.ts:535-536`. |
| **D4** | The "last consented at" STAMP is **machine-local** — `globalState`, never synced, exactly like `commandTrust.ts:30-35`. Consenting on the laptop does not silence the desktop. |
| **D5** | A call that raises **no** prompt must **not** spend an `AliasThrottle` slot. |

D5 is a defect being fixed, not a concession. `brokerMcpDoor.ts:115` takes the slot *before* anything
knows whether a modal is due, while `aliasThrottle.ts:27-37` is a budget of **five modals a minute**.
Left alone, five silent calls would refuse the sixth for a dialog nobody was ever going to see.

---

## 1. The model

### 1.1 The field

`mcpAccess.ts`, on `McpAccess` beside `delete?: McpDeleteScope` (`:24-25`):

```ts
export type McpAskPolicy = 'never' | 'every12h';
/** How often the window asks before an agent USES this entry. Absent = every time. */
ask?: McpAskPolicy;
```

**"Always" is deliberately not representable.** It would be a second spelling of absence, and both
closed-world builders would then have to decide what a stale record meant. `delete?: McpDeleteScope`
already set the rule (`mcpAccess.ts:24`): a value is present only when it grants something the default
does not. Here the default is the *safest* answer, so silence is always the strict one.

### 1.2 The reader — a clone of `deleteScope` (`mcpAccess.ts:76-78`)

```ts
function askPolicy(raw: unknown): McpAskPolicy | undefined {
  return raw === 'never' || raw === 'every12h' ? raw : undefined;
}
```

Takes `unknown` for `deleteScope`'s stated reason: both callers get their word from outside this
program — a synced record, or a webview message. A word a newer build invented reads as *ask*.

### 1.3 Both closed-world builders, or it vanishes silently

`ask: askPolicy(...)` is added to the returned literal of **`readMcpAccess` (`:97-106`)** and of
**`climb` (`:132-141`)**. Missing the first loses the policy on every Save; missing the second loses
it on every resolve. TypeScript reports neither, because the field is optional — §5 has the test that
does.

**`isMcpAccess` (`typeGuards.ts:123`) is deliberately NOT changed.** A `false` there rejects the whole
node (`typeGuards.ts:272`, `:410`) — the entry disappears from the vault. Its own doc says a record from
a newer build is accepted rather than rejected, and the four folder rungs are unchecked there for that
reason. `askPolicy()` supplies the safety.

### 1.4 Compatibility

| situation | result | direction |
|---|---|---|
| older build **reads** `ask: 'never'` | ignores it, prompts every call | safe |
| older build **saves** the entry | `readMcpAccess` rebuilds without `ask` → policy lost, back to asking | safe; goes in the CHANGELOG |
| older build **syncs** the node | `isMcpAccess` accepts; the field rides through | lossless |
| this build reads a word from a later one | `undefined` → asks | fail-closed |
| share / accept share | whole `mcp` object dropped (`shareFormat.ts:535`) | already correct |

---

## 2. Inheritance becomes per-axis — and this is not gold-plating

`nearestAnswer` (`mcpAccess.ts:233-245`) climbs until a node has `mcp !== undefined`, and **an answer
stops the walk** — that is how a sub-folder closes a branch its parent opened (`:224-227`).

Setting a policy on a folder writes an `mcp` object. Under the obvious implementation that object stops
the walk, so **a folder given only "never ask" silently closes to agents every entry beneath it that
used to inherit its rights from higher up.** A fatigue setting would cause a permission regression, and
it would look like the feature simply broke the switches.

The same root cause has a milder twin on the entry side: an entry that ticks only *Visible* takes its own
object whole (`:190-193`, no per-field merge) and so discards the folder's policy. That one fails safe —
the fallback is asking — but is unexplainable at the UI.

**One presence bit cannot serve two axes.** A permission ladder is monotone and safe-by-absence; a
consent policy grants nothing, climbs nothing, and its absence means "ask". So:

- `answersLadder(mcp)` — does this object carry a ladder answer at all? True when any of the eight
  ladder keys is present. Representable because the page script emits the two halves independently
  (§4.3), so `{ ask: 'never' }` with no rung keys is a real stored value.
- `nearestAnswer` widens into `nearestWhere(from, byId, answers)` — one function, two predicates
  (reuse-first widening move 1, not a copy). Same `MAX_TREE_DEPTH` cap and the same cycle guard, which
  exist because `parentId` comes off a synced record (`:229-231`).
- `resolveMcpInTree` (`:182-202`) runs it twice and **merges once, in the resolver**, so every one of
  its callers still makes one call and gets one coherent `McpAccess`. The two axes may legitimately be
  inherited from two different folders.

`grantsAnything` (`:145-147`) and `anyAgentAccess` stay **ladder-only**, so a policy-only folder does not
start a broker listener (`commands/agentCommands.ts:674-688`). That claim gets its own test.

---

## 3. The decision, and where the stamp lives

### 3.1 New file — `src_vs_code/src/mcpConsentPolicy.ts`

The only new source file. No `vscode` import (CLAUDE.md repo rule 3), clock injected, and it **reuses**
`withinAllowWindow` (`agentConsent.ts:63-65`) rather than restating the comparison:

```ts
export const ASK_WINDOW_MS = 12 * 60 * 60_000;

export function consentDue(policy, lastConsented, now): boolean;   // complexity 3
function windowEnd(at: number | undefined, now: number): number | undefined;
```

- absent policy, and anything unrecognised → **asks**;
- `'never'` → never asks;
- `'every12h'` → asks unless `now` is inside `lastConsented + ASK_WINDOW_MS`.

**A stamp from the future opens no window** (`at <= now` or it is discarded). `globalState` is a plain
file on disk and the machine clock moves; a value ahead of `now` would otherwise keep a credential
unattended indefinitely. A value that is not a number fails the same way — `NaN` is not `<=` anything.
This is the single most security-relevant line in the module and it gets its own test.

### 3.2 The stamp store — same file, shaped on `commandTrust.ts:29-54`

```ts
export interface ConsentStampStore {                     // the Memento subset, as TrustStore
  get(key: string): Record<string, ConsentStamp> | undefined;
  update(key: string, value: Record<string, ConsentStamp>): Thenable<void>;
}
const KEY = 'credSshManager.mcpConsentStamps';
interface ConsentStamp { at: number; rungs: string; }
```

Keyed `accountId:entityId` — an id is unique to a vault and a window holds several (`mcpEntries.ts:310`).

**Why the stamp also carries the ladder, not only the time.** The modal grants every verb of the entry's
kind (`credsAgentServer.ts:587-601`), so a window keyed on the entry alone would let a `rotate` rung
turned on an hour later ride in on a consent given for `use`. `rungs` is the resolved ladder written out;
a differing value asks again. This is `commandTrust.ts:20-25`'s argument — *"keying the record to the
exact line means a changed command asks again"* — and a permission is not a weaker case than a command.

`ConsentStamp` is a record and not a positional tuple so a third field later is not a migration.

---

## 4. The call order

### 4.1 The answer is produced where both halves are held

`verdictFor` (`mcpEntries.ts:387-396`) already resolves the access and throws it away. Its `usable` arm
(`:312-315`) gains `access: McpAccess` — no second tree walk.

`mcpUseLookup` (`mcpHooks.ts:108-125`) gains the store and the clock and answers a **sibling** of the
target:

```ts
function preConsentedFor(found, action, stamps, now): boolean {
  if (switchForAction(action) === 'delete') { return false; }   // D2, and unknown verbs too
  return !consentDue(found.access.ask, stampFor(...), now);
}
```

`switchForAction` (`mcpEntries.ts:369-373`) answers `'delete'` for `delete` **and for every verb it does
not know** — so a verb added to the broker and forgotten there fails closed here as well.

### 4.2 Why the flag rides beside the target and not on it

`McpUseTarget` (`brokerRequests.ts:85-90`) flows through the shared `minted()` helper
(`brokerMcpDoor.ts:199-210`) into `handleMcpDelete` and `handleMcpCreate`. A pre-consent field on it
would be one refactor away from a silent deletion. As a sibling on `McpUseLookup` (`:62-65`) and on
`readMcpUse`'s result (`:100-121`) only the handler that asks for it can read it — and
`handleMcpDelete:147` calls the same `readMcpUse` and simply never reads it. **D2 then holds in two
independent places**, producer and consumer, which is the belt-and-braces `mcpEntries.ts:101-106`
already applies to `hiddenFromAgents`.

### 4.3 `handleMcpUse` — before and after

```
BEFORE (brokerMcpDoor.ts:107-124)          AFTER
  read = readMcpUse(...)                     read = readMcpUse(...)
  if (!read.ok) refuse                       if (!read.ok) refuse
  if (!door.admit(res)) return;   ← always   prompts = !read.preConsented
  grant = minted(...)                        if (!door.admit(res, prompts)) return;
  door.perform(...)                          grant = minted(...)
  finally door.release()                     preConsented(door, grant, ..., prompts)  ← notes + pre-allows
                                             door.perform(...)
                                             finally door.release(prompts)
```

`admit(res, prompts)` and `release(prompts)` become **required** parameters on `BrokerDoor`
(`brokerMcpDoor.ts:34-36`), so a door added next year is a compile error until it states whether it
prompts — the doctrine `caller` already established at `:55-59`. The three other call sites
(`:156`, `:241`, `brokerFolderDoor.ts:142`) pass `true`, which there is a statement of fact.

### 4.4 `credsAgentServer.ts` — four small edits, and `consent()`/`ask()` are not touched

`consent()` already returns `'allowed'` when the grant is allowed (`:551-553`). `door.preConsent(grant)`
sets exactly that, so the modal is skipped by machinery that already exists.

- `admitAliasCall(res, prompts = true)` (`:216`) — returns `true` without taking a slot when
  `prompts` is false; the default keeps the alias route at `:306` byte-identical.
- a `releaseAliasCall(prompts)` twin — releasing a slot that was never taken would free **another**
  call's in-flight slot and stack two modals.
- three arrows in the door object (`:254-267`), including `preConsent`.
- in `perform` (`:464-503`), `const asked = <grant not already allowed>` read **before** the await, and
  `this.remember(via, grant, asked)` after it.

`remember` writes the stamp only when `via === 'mcp' && asked`:

- **`via === 'mcp'` means a use call**, because `perform` is reached from exactly one door
  (`brokerMcpDoor.ts:121`) — delete and create call `door.consent` directly and never come through
  here. So a person who allowed a *token* call cannot silence the *MCP* door on the same entry; the two
  dialogs say different things.
- **`asked` closes the sliding window.** Refreshing the stamp on a call that raised no modal turns
  "once every twelve hours" into "once, ever". This gets a test with a fake clock, not a comment.
- `onUserPresent()` (`:618`) is **not** called on the silent path. It means "a person is provably
  present" and postpones the idle auto-lock; a call nobody saw proves the opposite.

### 4.5 Every call still writes its audit line

The silent path writes `outcome: 'allowed without a prompt'` with `via: 'mcp'` through the one funnel
(`credsAgentServer.ts:692`). `door.note` gains `via?: AuditDoor` so the line reaches the MCP-logs page,
which filters on it. Without that line a reviewer cannot answer *"which calls ran with nobody
watching"*, which is the first question anyone will ask of this feature.

---

## 5. The UI

### 5.1 Not a switch

`MCP_SWITCHES` entries are `on(access): boolean` (`mcpSwitches.ts:21-22`) and the list is consumed by
both forms, `searchPredicates.ts:63-71` (throws at module load for an unknown id), `brokerRequests.ts`'s
refusal wording, `mcpBar.test.ts` and `readmeClaims.test.ts` (`length === 10`, README says *"Ten
switches on two ladders"*). A tri-state cannot be an `on()`, and three mutually exclusive checkboxes is
exactly the unrepresentable state the ladder doc exists to prevent (`mcpAccess.ts:11-14`).

So: a **second builder in the same module**, `MCP_ASK_CHOICES` + `mcpAskHtml(access)`, rendered as a
radio group. `MCP_SWITCHES.length` stays 10, `MCP_BAR_COLORS` stays 5, `accessMask` stays 5, the glyph
set stays 32, and every one of those guards stays green **because it still counts what it claims to
count** — the policy genuinely is not a switch.

Each option carries its own `why`, per the section's own convention (`mcpSwitches.ts:12-13`). *Never
ask* says in those words that the switches become the whole gate and that the call is still recorded.
The group's hint names the verbs it covers **and** says *creating and deleting always ask*.

Placed after the ten switches and before `agentDoorsHtml(...)` (`entityFormPage.ts:428`), because the
doors footer is the "nothing agent-reachable is invisible" sentence and a never-ask entry is a new door
in it.

### 5.2 The footer learns about it

`agentDoors.ts` gains `standingConsent` and a row: *"No consent prompt — an agent may use this entry
without asking."* with the command that changes it. `agentDoors.ts:7-8` currently claims the CLI alias
route has *"no consent modal"*, which is false — `handleAlias` mints and calls `perform` → `consent`
(`credsAgentServer.ts:296-320`), and `test/brokerConsentText.test.ts` asserts the dialog. The sentence is
corrected in the same task, since the change edits that footer anyway.

### 5.3 The page script

`mcpSwitchScript.ts` gains `MCP_ASK_IDS`, `mcpAskValue()` and `ask:` in `collectMcp` (`:80-89`).

**Two touched flags, not one.** `mcpTouched` (`:79`) decides whether the ladder half is emitted at all;
without a second flag, changing only the policy on an inheriting entry would post a full all-false
ladder and close it. `collectMcp` emits the ladder half when the ladder was touched, the policy key when
the policy was touched, and `undefined` when neither — which is what makes §2's `answersLadder` a real
question rather than a formality. The two host booleans replace the single `decidedHere` (`:19`).

Radio ids join the listener loop at `:91`, so touching a radio also decides the entry — the rule at
`:77-81`.

### 5.4 Wording

- `entityFormPage.ts:419` — *"…Touching any switch **or the consent setting below** decides it here."*
- `describeAccess` (`mcpAccess.ts:307-315`) appends a clause, returning `''` for an absent policy so
  existing viewer tests stay green. A card that hid "never ask" would be the display-that-lies this
  repo condemns elsewhere.

### 5.5 Known gap, left open deliberately

`entityFormPage.ts:412` renders `normalizeMcpAccess(d?.mcp)`, so an entry that *inherits* shows every
control clear — including *Ask every time* — even when its folder says otherwise. The folder form solves
this with an `inherited` option; the entity form has no equivalent, and giving it one is a larger change
that touches every control in the section. The hint at `:419` covers it in words. Filed as a follow-up
rather than smuggled in.

---

## 6. What this plan deliberately does NOT do

| not done | why, and where it belongs |
|---|---|
| Unify with `agentConsent.ts` | Two instances, and the shapes differ where it matters: the SSH dialog stores an absolute deadline fixed at the click; a policy must store a **start**, because the current policy is read fresh at every call. Unifying would make the one path the owner excluded hostage to this module. Both files get a one-line cross-reference instead. |
| Tell the agent which entries are quiet | `McpEntry.can` (`mcpEntries.ts:112-115`, `:159-169`) must not grow the policy. The listing route is unauthenticated; a "you will not be prompted here" field is a free map of the unattended credentials, and that hand-written allow-list exists for exactly this kind of decision. |
| A sixth icon bit or a new badge stripe | Every bit doubles the generated glyph set (`mcpAccess.ts:283-287`), and a stripe is a ladder position. The disclosure goes to the form, the viewer card, the doors footer and the log. |
| A grants / consents revocation **screen** | [PLAN_product_improvements.md](PLAN_product_improvements.md) — see §9. |
| A policy on the create and folder doors | D2. The seam is in place; it is a one-line change when asked for. |
| A confirmation when a person *chooses* "never ask" | Proposed and **not** built: the option's `why` says what it gives up, and a modal to confirm a setting that exists to remove modals needs the owner's word. Raised at the gate. |

---

## 7. Growth budget

| surface | size | who retires it | interrupted? |
|---|---|---|---|
| `credSshManager.mcpConsentStamps` in `globalState` | one record per entry consented under `every12h`: a short key plus `{at, rungs}` ≈ **120 B**. Ten open entries ≈ 1.2 KB. | **The reader prunes**: every read drops records older than `ASK_WINDOW_MS`, which alone bounds the store to "entries consented in the last 12 hours". A hard cap of **256, oldest first**, mirroring `MAX_GRANTS` (`grantRegistry.ts:105`), makes the worst case ≈ **30 KB, always**. | Nothing is in flight. The stamp is written after an Allow; a crash mid-call leaves no half state and needs no startup sweep. |
| `ask` on the vault record | one short string per entry that sets one; rides the existing sync and the existing share strip | the entry's own deletion | n/a |

A deleted entry's stamp is unreachable (the Trash short-circuits resolution, `mcpAccess.ts:186-189`), a
changed ladder changes `rungs`, and a changed policy is read fresh — so nothing needs an eager sweep,
which would be a second road that can only get out of step.

**Revocation:** one command, `CredsForDevs: Forget agent consents on this machine`, clearing the key.
Machine-local, instant, no sync. There is no per-entry Forget: flipping the entry to *Ask every time* is
already that, because the policy is read at every call and the stamp then means nothing.

---

## 8. Build order

| # | file | change |
|---|---|---|
| 1 | `src/mcpAccess.ts` | `McpAskPolicy`, `ask?`, `askPolicy()`, both closed-world builders, `answersLadder`, `nearestWhere`, per-axis `resolveMcpInTree`, `ladderKey`, `describeAccess` clause |
| 2 | `src/mcpConsentPolicy.ts` | **NEW** — `consentDue`, `ASK_WINDOW_MS`, `ConsentStampStore`, read/write/prune. No `vscode`. |
| 3 | `src/mcpEntries.ts` | `UsableEntry.usable` gains `access`; `verdictFor:395` fills it |
| 4 | `src/mcpHooks.ts` | `mcpUseLookup(..., stamps, now)` → `preConsented`, never for a delete; `rememberMcpConsent` writing only for `every12h` |
| 5 | `src/brokerRequests.ts` | `preConsented` on the usable arm and on `readMcpUse`'s result |
| 6 | `src/brokerMcpDoor.ts` | `admit(res, prompts)`, `release(prompts)`, `preConsent(grant)`, `note` gains `via`; `handleMcpUse` reordered |
| 7 | `src/brokerFolderDoor.ts` | two call sites pass `true` |
| 8 | `src/brokerHooks.ts` | `noteMcpConsent?` + its `HOOK_KINDS` entry (the name-match guard makes forgetting the second half a build error) |
| 9 | `src/credsAgentServer.ts` | `admitAliasCall(res, prompts)`, `releaseAliasCall`, three door arrows, `asked` + `remember()` |
| 10 | `src/extension.ts` | the store and the clock into `mcpUseLookup` (`:548`); the `noteMcpConsent` hook |
| 11 | `src/mcpSwitches.ts` | `MCP_ASK_CHOICES`, `mcpAskHtml`, two rules in `mcpSwitchStyles` (both forms already call it) |
| 12 | `src/mcpSwitchScript.ts` | ids, `mcpAskValue()`, two touched flags, `ask:` in `collectMcp` |
| 13 | `src/entityFormPage.ts`, `src/folderFormPage.ts` | the group, and the two-axis "inherited from" wording |
| 14 | `src/agentDoors.ts` | `standingConsent` row; the false alias sentence corrected |
| 15 | `src/commands/` + `package.json` | the Forget command |
| 16 | tests | §9 |
| 17 | `README.md`, `src_mcp/src/Program.cs`, `contract/mcp-tools-v1.json` | the claims that stop being true; regenerate with `npm run contract:mcp` |
| 18 | `CHANGELOG.md`, `research/module_extension.md`, the `agent-surface` help article in **all five** languages | the record |

`credsAgentServer.ts` is **744** lines against an 800 ceiling (`eslint.config.mjs:28`); this adds ≈24, so
nothing needs extracting. `.size-baseline.json` ratchets `src/extension.ts` at 1052 and only ratchets
down — the two added lines raise the baseline in the same commit, with the reason in the message.

## 9. Test plan

Every claim is **observed**, never asserted about configuration. The harness already exposes what is
needed: `dialogs`, `ran`, `audit`, `presence` (`test/brokerWorld.ts:130-176`).

**Pure — `test/mcpConsentPolicy.test.ts`**
absent asks · `'never'` never asks · an unrecognised word asks · `'every12h'` with no stamp asks, inside
the window does not, **at exactly `+12h` asks** (the boundary is `>`, inherited from `withinAllowWindow`)
· **a stamp from the future asks** · a non-numeric stamp asks · the reader prunes, verified by reading
the store back · the 256 cap evicts oldest first · a changed `rungs` asks.

**Pure — `test/mcpAccess.test.ts`**
round-trip **key-set** completeness: an access with every field at a non-default value survives
`readMcpAccess` → `normalizeMcpAccess` with an equal key set. This is the only protection against the
silent-vanish of §1.3, since TypeScript will not flag a forgotten optional. Plus both axes of
inheritance: a policy-only folder **does not close the branch below it**; an entry with its own ladder
still inherits the folder's policy; a policy-only folder gives `anyAgentAccess === false`.

**Through the real broker — `test/brokerMcpRoutes.test.ts`**
1. a pre-consented use call runs with `dialogs.length === 0`, writes its audit line, and leaves
   `presence === 0`;
2. **D5**: twenty pre-consented calls in a row all return 200 — none is `too_many_requests`. This is red
   today at the sixth call;
3. its mirror: an entry that does prompt is still refused at the sixth, so the defence is intact where a
   prompt exists;
4. **D2**: `/v1/mcp/delete` on that same entry still raises a dialog, and so does `/v1/mcp/create`;
5. the escalation: consent under `{view,use}`, turn on `edit`, call `rotate` inside the window — **a
   dialog appears**, observed at the modal rather than at the hash;
6. a denied grant plus a never-ask entry is still denied — a tombstone outranks a policy;
7. the window does not slide: a silent call inside it does not move the stamp (fake clock).

**Forms** — exactly one radio checked, the checked one matches the stored value, the radios are absent
inside the Trash, `collectMcp` carries `ask:`, and a policy-only save posts no ladder half.

**`readmeClaims.test.ts`** — `MCP_SWITCHES.length === 10` and the "Ten switches" sentence stay green
untouched. Deliberately made red: the README's *"a prompt on every single call"* claims join `BANNED`,
so they cannot quietly come back.

**`scripts/creds-mcp-itest.cjs`** — one leg, and it is the safe kind: a pre-consent leg raises **zero**
prompts, so it spends none of the five-per-minute budget and cannot starve a later level. That trap is
recorded at `:452-457` and cost three unrelated failures once. Six quiet calls succeeding end to end is
D5 through the real binary; one delete on the same entry is D2.
`scripts/agent-broker-itest.cjs` needs no leg — it drives the token and alias doors, which D1 excludes.

## 10. Security notes for the review

1. **"Never ask" makes the switches the whole gate.** Per entry, never global, never a VS Code setting;
   the `why` says it in those words. The remaining controls are the ladder and the log.
2. **On a folder it reaches entries that do not exist yet** — a folder set to `never` pre-consents every
   credential created in it afterwards. The folder form already says its blast radius out loud; that
   sentence must now cover this too.
3. **The prompt is also the rate limiter** (`aliasThrottle.ts:1-25`). A never-ask entry is no longer
   rate-limited, deliberately: throttling a call that raises no dialog is a refusal with no remedy.
   What remains is `MAX_CONCURRENT_EXECS` and the audit. Stated, not discovered.
4. **`globalState` is writable by anything running as this user**, so a window could be extended by
   writing a future timestamp — which is what §3.1's `at <= now` guard refuses.
5. **The idle auto-lock is unchanged**, and that is itself the finding: agent traffic already does not
   postpone it, and a never-ask entry on an idle machine is usable by anything that reaches the loopback
   port, with the modal that no longer appears having been the last thing in the way.

## 11. Boundaries with other open plans

**[PLAN_product_improvements.md](PLAN_product_improvements.md)** (line 71, *"общий экран активных grants
и code-access ключей… отзыв"*):

| owned here | owned there |
|---|---|
| the stored policy, the machine-local stamp store and its retirement, the form control, the doors-footer row, the Forget command | the cross-cutting screen. When built it lists live consent windows as a **third row type** beside grants and code-access keys, reading them from this module rather than re-deriving them, and it does not own the policy control |

This plan adds no list view and touches nothing about code-access keys. *(The same paragraph is added to
that plan, per the both-sides rule.)*

**[PLAN_tails_2.md](PLAN_tails_2.md)** §1.1 proposes an **eleventh** switch, reasoning that the form is
built from `MCP_SWITCHES` so the cost is one catalog entry. The two collide only at the guards: this plan
leaves `MCP_SWITCHES` at ten and adds a second, separately-guarded builder, so that plan still only adds
a row — and must not reuse the ask-choices catalog for a permission.

## Definition of Done

- [ ] `npm run typecheck`, `npm run lint`, `npm run ratchet` clean; `npm test` green with the new suites.
- [ ] `npm run itest:mcp` green **including** the new quiet leg; `npm run itest:agent` unchanged and green.
- [ ] The D5 test was watched **failing first** against unmodified code (the sixth call refused), and the
      failure message is reported beside the pass.
- [ ] `dotnet build dew_flow_creds_for_devs.slnx` — 0 warnings.
- [ ] No claim anywhere says every call asks: README, `src_mcp/src/Program.cs`, the regenerated
      `contract/mcp-tools-v1.json`, and the help article in all five languages.
- [ ] `research/module_extension.md` updated: the consent paragraph, the Agent-access section, the
      "where each piece lives" table.
- [ ] `node .claude/rules/shared/tools/plan-lifecycle.mjs` and `pin-check.mjs` pass; this plan promoted
      with its deviations recorded.
- [ ] The `coai` gate: a `review_plan` round reached `proceed` before implementation and a `review_code`
      round ran on the finished branch, every finding resolved with `accept` or a reasoned `reject`, and
      the summary reports the verdicts **and** how many reviewers answered.
