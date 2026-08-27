# PLAN — the tails a re-read of every open plan found

> Status: **plan only, nothing implemented yet.** Scope: the findings of the 2026-08-27 audit that
> re-read all eleven open plans against the code they describe. Three of them were describing a
> world that no longer exists. Plus the defects and asks the owner
> raised in the same session: T9, T11, T12 (viewer and tree), T13, T14 (arrival feedback and the
> generators), T15 (the filter cancels itself when you click a result), and T10 (the MCP surface
> does not know configs exist).
>
> Related docs: [../research/module_extension.md](../research/module_extension.md),
> [../research/module_server.md](../research/module_server.md),
> [../research/architecture.md](../research/architecture.md).
>
> Plans this one corrects rather than duplicates: [PLAN_audit_roadmap_2026_08_25.md](PLAN_audit_roadmap_2026_08_25.md),
> [PLAN_extension_security_tail.md](PLAN_extension_security_tail.md),
> [PLAN_logging_convention.md](../research/PLAN_logging_convention.md) (now promoted),
> [PLAN_marketplace_listing.md](PLAN_marketplace_listing.md),
> [PLAN_ephemeral_secrets_tail.md](PLAN_ephemeral_secrets_tail.md).

---

## 1. Why this plan exists

Eleven plans were open on 2026-08-27. Reading each one against the code found that a status line is
not evidence, and that it fails in **both** directions:

- Work was **done and never recorded** — a whole audit item (A6) shipped complete, with the test it
  asked for, and appears in no status line anywhere.
- Work was **recorded and never done** — an advisory function ships, is documented as "shown live in
  the input box", and is called by nothing but its own test.
- A plan's **premise expired** — the logging plan asks this repository to be added to a mirror list
  that no longer exists, because the rule moved into a submodule this repository already mounts.
- A closed item **re-opened under nobody's name** — the listing was brought in line on 2026-08-24 by
  a plan that recorded incompleteness as the real defect; three release lines later it is incomplete
  again, by the same mechanism, and no plan owns that.

This plan holds the items that no other plan owns, and the corrections the others need. It
deliberately does **not** restate work that an existing plan already covers correctly — §2 is the
pointer table for those.

## 2. Already owned elsewhere — verified still open, nothing to do here

Re-checked against the code on 2026-08-27; each of these is genuinely outstanding and stays with its
plan. Listed so that a reader of *this* plan does not conclude the audit missed them.

| item | owner | verified how |
|---|---|---|
| `/api/health` writes `.health-probe` on every request | [PLAN_server_ops.md](PLAN_server_ops.md) item 6 | `src_minimalapi_server/src/Program.cs:472-489` — still write-then-delete per call, no cache |
| No `/metrics` surface, no .NET LTS cadence | [PLAN_server_ops.md](PLAN_server_ops.md) item 5 | no route matches `metrics` in `Program.cs` |
| `DataDir` atomic-rename requirement undocumented | [PLAN_server_ops.md](PLAN_server_ops.md) item 2 | no `atomic`/`SMB`/`NFS` mention in `src_minimalapi_server/**` or `deploy/**.md` |
| WebAuthn RP ID is bare `localhost` | [PLAN_extension_security_tail.md](PLAN_extension_security_tail.md) item 1 | `src_vs_code/src/webauthnPrf.ts:23` — see T2 below, which settles a contradiction the item created |
| Share metadata unauthenticated (no AAD) | [PLAN_extension_security_tail.md](PLAN_extension_security_tail.md) item 2 | no `setAAD` in `src_vs_code/src/shareFormat.ts` |
| `Burn Now…`, viewer lifetime, cross-machine burn test | [PLAN_ephemeral_secrets_tail.md](PLAN_ephemeral_secrets_tail.md) 2.1–2.4 | no `burn` command among the 94 in `package.json`; `entityViewPanel.ts` names no expiry |
| MCP from inside WSL | [PLAN_mcp_wsl_bridge.md](PLAN_mcp_wsl_bridge.md) | `WindowsBridge.Creds` is the only instance (`src_broker_client/src/WslInterop.cs:41`); no `CREDS_MCP_WINDOWS_BINARY` anywhere |
| Live three-machine recovery rehearsal, roster rotation | [PLAN_org_recovery_tail.md](PLAN_org_recovery_tail.md) | no re-split path in `src_vs_code/src` or `OrgRecovery*.cs` |
| Marketplace screenshots | [ЗАДАЧА_скриншоты_для_маркетплейса.md](ЗАДАЧА_скриншоты_для_маркетплейса.md) | `src_vs_code/media/docs/` does not exist |
| `extension.ts` split (A1), `EntityMetadata` union (A4), envelope AAD (A5), 2SKD (D9), byte-weighted rate limit (E1) | [PLAN_audit_roadmap_2026_08_25.md](PLAN_audit_roadmap_2026_08_25.md) | see T3, which measures how far A1 moved — the wrong way |

---

## 3. The items

### T9. The viewer's columns are half the width they should be (DEFECT, found by the owner 2026-08-27)

**Symptom.** The entity viewer wraps mid-word. A config body renders `"W arning"` and a comment
reads `cann ot be read back`, because each of the two columns is about 308 px wide. Before the
second column existed, the single column was 640 px — so every column in the viewer is now
**half** the width it used to be. The editor form, which has the same two-column layout, is fine.

**Root cause — one number, and the two pages disagree about it.**

| | body `max-width` | breakpoint | width per column |
|---|---|---|---|
| form, `entityFormPage.ts:353,380-381` | **1280px** | `min-width: 1000px` | ~628 px — correct |
| viewer, `entityViewPanel.ts:571,588-589` | **640px** | `min-width: 1000px` | **~308 px** |

The second column was added to the viewer for the "Read this from code" panel
(`entityViewPanel.ts:140-142`, shipped in 0.77.0) and copied the form's grid rule verbatim — the
comment at `entityViewPanel.ts:586-587` says so, and states the intent: *"the two pages then narrow
the same way instead of nearly the same way."* What it did not copy is the body cap, which stayed
at the 640 px chosen when the page was one column.

The two rules then actively contradict each other: the media query switches to two columns when the
**window** reaches 1000 px, while the **container** can never exceed 640 px. The layout therefore
splits at precisely the point it has no room to.

**Fix.** Raise the viewer's body `max-width` to `1280px`, matching the form. That is the number the
comment already claims parity with, and it restores the single-column case to its old width while
giving each of the two columns what the form's columns get.

**Test (RED first).** `entityViewPanel`'s HTML is built by a function; assert that the viewer's body
cap is not narrower than the form's, and that a page which can show two columns reserves at least
the form's per-column width. The test must fail against today's 640 px, naming both numbers — a
CSS defect nobody can see in a unit test is one that comes back on the next layout change.

---

### T1. The PIN strength advisory reaches nobody

**Symptom.** `pinPolicy.ts:146` exports `describePinStrength`, and its own doc comment says
*"Advisory: shown live in the input box, never a refusal"*. It is shown in no input box. A grep over
the whole repository finds three references: the definition, and two lines of
`src/test/pinPolicy.test.ts`. The function is dead in production.

This is the half of audit item **3** in [PLAN_extension_security_tail.md](PLAN_extension_security_tail.md)
that the plan called *"the decision needed first"* — make the estimate **visible and advisory** above
the hard floor. The hard floor shipped (digit-only under 12, one repeated character, a 39-word
blocklist with leetspeak normalisation). The visible half did not, and the doc comment asserting it
did is how it stayed unnoticed.

**Where.** Six input boxes pass `validateInput: validatePin`:

| site | the PIN is | advisory? |
|---|---|---|
| `src_vs_code/src/extension.ts:2837` | chosen — the password for an export | **yes** |
| `src_vs_code/src/extension.ts:3951` | chosen — a temporary PIN for someone else's re-keyed vault | **yes** |
| `src_vs_code/src/backupManager.ts:45` | chosen when `confirm`, entered otherwise | **yes, when `confirm`** |
| `src_vs_code/src/shareInbox.ts:56` | chosen when `confirm`, entered otherwise | **yes, when `confirm`** |
| `src_vs_code/src/syncManager.ts:203` | chosen — this account's sync PIN | **yes** |
| `src_vs_code/src/vaultKeys.ts:180` | **entered** — an existing PIN | **no** |

The last row is the point of the table. Telling someone their PIN would take two days to crack while
they are typing one they cannot change from that box is not advice; it is nagging, and it trains
people to stop reading the box that also carries the refusals.

**Fix.** One validator, two modes, and the vscode-free line stays where repo rule 3 puts it:

- `pinPolicy.ts` (pure, no `vscode`) gains `pinFeedback(value, mode)` returning
  `{ message, kind: 'error' | 'advice' } | undefined` — `validatePin` first, then
  `describePinStrength` only when choosing. `validatePin` stays exported and unchanged; it is what
  `pinFeedback` calls, so there is one refusal rule, not two.
- A thin `pinInput.ts` maps `kind` to `vscode.InputBoxValidationSeverity` and is the only new file
  that imports `vscode`. A handful of lines, so the enum is the only thing not covered by a pure test.
- The six sites pass the validator built for their mode.

**Tests** (`pinPolicy.test.ts`, extended): a weak-but-legal PIN in `choosing` mode returns
`kind: 'advice'` naming a duration; the same PIN in `entering` mode returns `undefined`; a refused
PIN returns `kind: 'error'` in **both** modes — a mode must never soften a refusal; and the error
text is byte-identical to `validatePin`'s, so the two paths cannot drift.

---

### T2. Two documents disagree about whether the RP ID can be fixed, and neither is checked

**Symptom.** [PLAN_extension_security_tail.md](PLAN_extension_security_tail.md) item 1 proposes
binding the loopback listener to `creds-for-devs.localhost` and using that as the WebAuthn RP ID,
citing RFC 6761. `src_vs_code/src/webauthnHint.ts:17-20` says the opposite as settled fact:

> *"The RP ID here is the bare `localhost` — **it has to be**, since WebAuthn scopes a credential by
> the origin's domain and the flow runs on a loopback page."*

Both are in the repository, both read as authoritative, and they cannot both be true. The code
comment also concedes *"only a real TLS domain would"* close the hole — which, if the `.localhost`
route works, is also wrong.

**Why this is its own item and not just "do security-tail item 1".** Item 1's cost is the
re-registration migration, and nobody should pay it — or decline to — on the strength of two
paragraphs that contradict each other. What is missing is a **measurement**: does Chrome/Edge
resolve `creds-for-devs.localhost` to loopback, treat it as a secure context, and accept it as an RP
ID with the PRF extension? That is a throwaway probe, not a feature, and the family rule for exactly
this shape is *measure the risky assumption before the design depends on it*
(`.claude/rules/shared/common/development-workflow.md`).

**Fix.** Run the probe against a real browser and a real key. Then, whichever way it goes:

- **It works** → item 1's fix is viable; record the measurement in the plan, and the migration
  becomes a scoped decision rather than a guess. Correct `webauthnHint.ts`'s "it has to be".
- **It does not** → record *why*, with the browser and version, in `webauthnHint.ts` beside the
  claim, and mark item 1 **refuted** rather than deferred. A refuted item is closed work; a deferred
  one is a debt that accrues re-reading forever.

The `userVerification: 'required'` half of item 1 has already shipped
(`webauthnPrf.ts:286,320`) and its status line does not say so.

**Deliverable either way:** one recorded measurement, and two documents that agree.

---

### T3. The 800-line ceiling exists, is enforced, and is losing

**Symptom.** Audit item A1 was written against a 3,078-line `extension.ts`. Measured today:

| | at the audit (2026-08-25) | now (2026-08-27) |
|---|---|---|
| `src_vs_code/src/extension.ts` | 3,078 lines | **5,684** |
| files over the 800-line ceiling | — | `extension.ts`, `storageManager.ts` (1,203) |
| explicit `eslint-disable` in `src/` outside tests | 178 | **230** |

The ceiling is real and enforced — `eslint.config.mjs:28` sets `max-lines: 800` as an error, and
`reportUnusedDisableDirectives: 'error'` deliberately prevents a stale exemption from lingering. It
is simply switched off at the top of the file it was written for (`extension.ts:1`), by a disable
whose own comment says the file *"is being dismantled into modules"*. It is not being dismantled; it
grew by 85 % in two days while every new feature landed correctly-sized modules beside it.

**What this item is NOT.** It is not A1. Splitting a 5,684-line file is A1's work and stays A1's.

**What it is: stop the growth, so that A1 is a shrinking target rather than a receding one.** A
ratchet — the disable is permitted, but the number it exempts may not go up:

- A checked-in baseline (`src_vs_code/.size-baseline.json`) recording, per exempted file, the line
  count at the moment of the check.
- `npm run ratchet`, run in CI beside `lint`, failing when an exempted file is **larger** than its
  baseline, and passing — after rewriting the baseline downward — when it is smaller.
- A file that drops under 800 must lose its disable; `reportUnusedDisableDirectives` already fails
  that case, so the ratchet does not need to.

**Why a ratchet rather than a refactor.** The 800-line rule already failed once at its actual job:
it was written to stop the next 3,000-line file, and the file it was written about is now 5,684
lines with the rule's blessing. A limit that can be disabled and then grown behind the disable is
advice. This makes the disable a **freeze** instead of an exemption, which is the property the rule
was reaching for.

**Tests.** `src/test/sizeRatchet.test.ts` against the pure comparison function: a file at its
baseline passes; one line larger fails and the message names the file and both numbers; smaller
passes and reports the new baseline.

---

### T4. The listing has drifted again, and further than the drift a plan already fixed once

**Symptom.** [PLAN_marketplace_listing.md](PLAN_marketplace_listing.md) closed its items 2 and 3 on
2026-08-24 and recorded that the real defect was not the *order* of the listing but its
*incompleteness* — 6 of 13 settings, 29 of 47 commands, seven shipped features never mentioned.
Measured today, three release lines later (0.58.0 → 0.78.1):

| | in `package.json` | in `README.md` |
|---|---|---|
| settings | 23 | 13 |
| commands | 94 | a section written when there were 47 |

And by feature, counting occurrences in the whole README:

- **MCP** — the entire 0.65.0–0.76.0 line of work, `creds-mcp`, the six-switch consent ladder: **0**
- **config entities** — 0.77.0, `POST /v1/config/read`, `creds config <key>`: **0**
- the headless `creds` CLI: 1 passing mention
- corporate recovery: 3, the printed recovery code: 1, the QR seed paste: 2

The plan's own verdict on this failure mode — *"the listing was not merely badly ordered, it was
incomplete"* — applies again, unchanged, to a listing that plan declared done.

**Why it recurs, and what to fix so it stops.** Because nothing connects a shipped feature to the
document that advertises it. The listing is prose, the manifest is data, and prose does not fail a
build. So the fix has two halves and the second is the one that matters:

1. **Bring the README back in line.** Add the missing sections — MCP, config entities, the CLI —
   fold the new settings into the settings table, and re-count the commands.
2. **Make the counting mechanical.** A test that reads `package.json` and asserts every
   `contributes.commands` id and every `contributes.configuration` key appears in `README.md`.
   Adding a command without documenting it then fails `npm test` on the commit that adds it, which
   is three release lines earlier than a human noticing.

**Tests.** `src/test/listingCoverage.test.ts` — every command id and every setting key present in
the README; the failure message lists exactly the undocumented ids, because a bare "not covered" is
a test people disable.

---

### T5. Nothing is tagged, so "released" and "on main" have quietly become the same word

**Symptom.** The last extension tag is `extension-v0.57.1`. `src_vs_code/package.json` says
**0.78.1** — twenty-one releases with no tag. `mcp-v*` does not exist at all, so the `creds-mcp`
binaries have never been built by the release workflow.

CLAUDE.md states the rule this violates in its own words — *"A push to `main` publishes nothing
deployable"*, four artefacts, four tags — and `release.yml:19,267` is ready for `mcp-v*` and carries
a `workflow_dispatch` with an `mcp` target. So nothing is broken; nothing has been asked.

**What this blocks.** Item 11 of [ЗАДАЧА_проверка_mcp_вручную.md](ЗАДАЧА_проверка_mcp_вручную.md)
is written as waiting for a release that has not been cut, so the install button it checks cannot be
checked. It is not blocked on work.

**Fix — and the boundary.** Pushing a release tag publishes artefacts under the owner's name; it is
not a change an autonomous run makes on its own judgement. This item therefore delivers everything
up to the push and **stops**: the exact commands, what each one will publish, and the version each
tag would carry, written into this plan. The push itself is the owner's, and the item closes when
the decision — cut them, or record why not — is recorded here.

---

### T6. The promoted-plans index and the manual check both describe an older repository

Two small drifts, one edit each, grouped because neither deserves its own section.

**T6a.** `research/PLAN_qr_seed_paste.md` was promoted on 2026-08-27 and is listed in
`research/README.md:40`. It is **absent** from the *Promoted* table in
[README.md](README.md) — this folder's own index. `plan-lifecycle.mjs` reports clean, because it
checks the *Currently open* table (which does match, 11 for 11) and not the promoted one. Worth
naming: the check that exists is not the check people assume exists.

**T6c.** `src_vs_code/CHANGELOG.md` stopped getting release sections: `[Unreleased]` is followed
directly by `[0.76.0]`, so everything shipped in 0.77.0, 0.78.0, 0.78.1 and 0.79.0 sits under
*Unreleased* while four release commits and four installed builds say otherwise. The fix is
mechanical — cut the accumulated block into dated sections matching the release commits — and the
lesson is T4's again: a record nothing checks is a record that drifts.

**T6b.** [ЗАДАЧА_проверка_mcp_вручную.md](ЗАДАЧА_проверка_mcp_вручную.md) tells the tester to
confirm version **0.76.0** in three places. The current version is 0.78.1, and two of the releases
in between (0.77.0 config entities, 0.78.0 QR paste) touch surfaces the pass walks through. A manual
script whose first step is already wrong is a script people stop trusting at step one.

---

### T7. The roadmap's status line is false in both directions

**Symptom.** [PLAN_audit_roadmap_2026_08_25.md](PLAN_audit_roadmap_2026_08_25.md) carries a
fourteen-line status block. Against the code:

| the status says | the code says |
|---|---|
| *"Решения владельца 2026-08-25: D1 и D8 — пропустить"* | **both shipped.** D1 is `research/PLAN_ssh_agent.md`; D8 is the whole MCP server, `research/PLAN_mcp_server.md` |
| A6 — not mentioned at all | **shipped complete**: `src_vs_code/src/diagnosticLog.ts` + `logFormat.ts`, one `CredsForDevs` channel, a file per run under `globalStorageUri`, a 14-day sweep, and the "no secret in the log" grep test A6 specified |
| A3 — *"ждёт исполнителя"* | **effectively done**: 16 of the 18 named modules have their own test file; `vaultKeys`/`backupPaths`/`nasPaths` are covered by `securityKeyOps.test.ts`, `backupPlan.test.ts`, `vaultPaths.test.ts`; 229 test files in `src/test/`. Its CI half is closed too — `itest:agent`, `itest:git` and `itest:cli` all run in `ci-extension.yml`, with `itest:server` excluded for a written reason. What remains is "handlers in `extension.ts`", which is A1's dependency, not A3's |
| D9 — open | **mostly shipped**: the printed recovery code (`research/PLAN_recovery_code_wrap.md`) and emergency access through the server (`research/PLAN_org_recovery.md`). Only 2SKD — a second device secret — is unbuilt |
| D10 — open | **shipped** as `research/PLAN_ephemeral_secrets.md`. [PLAN_ephemeral_secrets_tail.md](PLAN_ephemeral_secrets_tail.md) §2.5 exists solely to record this and is itself unticked |
| E2 — open | **shipped**: `deploy/README.md:32-54` makes `MS_AUDIENCES` an explicit, named setup step |
| E3 — open | **shipped** as `X-Creds-Contract` (see [PLAN_server_ops.md](PLAN_server_ops.md) item 7) |

**Fix.** Rewrite the status block to what is true, closing A3, A6, D8, D9-bar-2SKD, D10, E2, E3, and
deleting the "skip D1 and D8" sentence that two shipped plans have already overruled. Record T3's
measurement against A1 in the same edit — a roadmap whose central item moved 85 % in the wrong
direction should say so where the item is, not only here.

---

### T8. ~~The logging plan asks for something that no longer exists~~ — **DONE 2026-08-27, plan promoted**

**Symptom.** [PLAN_logging_convention.md](../research/PLAN_logging_convention.md) has three items. Item 2 is
*"Register this repository in the mirror list"* — and the shared rule has no mirror list any more.
It moved into `.claude/rules/shared` (a submodule of `dew_flow_conventions`) and now ends with
*"A new repository **mounts the submodule** — it never copies this file"*, which this repository
already does. The item cannot be completed because its object is gone.

Meanwhile the rule grew three Definition-of-Done lines the plan predates:

- a run crossing midnight must produce a `00-00-00` segment in the next day's folder, same pid;
- every code path that builds a container wires the same sinks — CLI hosts included;
- the repository must **name its `logs/` retention owner**, either a startup prune or a named
  operator job.

**What is actually true of the server today.** `src_minimalapi_server/src/Logging.cs` (148 lines) has
Serilog before `Build()`, a file per run under `logs/{UTC date}/`, UTC everywhere, levels from
configuration, `CloseAndFlush()` in a `finally`, `logs/` git-ignored. It has **no** coloured console
sink (`Logging.cs:123` is a plain `WriteTo.Console`, with the deviation honestly recorded in the
class doc at `Logging.cs:26-32`), **no** midnight segment, and **no** retention.

The irony worth recording: the extension already solved retention. `diagnosticLog.ts` sweeps its own
run files at `retainDays: 14`. The half of this product that nobody wrote a logging plan for is the
half that meets the rule.

**Fix.** Rewrite the plan against the rule as it now is, then close it:

1. **Port `AnsiConsoleSink`** from the family — `../dew_flow_mcp/src/ServiceDefaults/AnsiConsoleSink.cs`,
   130 lines, already written to take a `TextWriter` so it is testable without touching process
   globals. The rule states the code is per-repo by deliberate trade, so this is a port, not a
   reference.
2. **Port `DailyRunFileSink`** for the midnight segment from the same place.
3. **Name the retention owner** and implement it: a startup prune, matching the extension's, so the
   answer is the same on both halves of one product.
4. **Delete item 2** and record *why* — the mechanism it named was replaced by the submodule this
   repository already mounts.

**Tests.** The sink's escapes counted on a redirected `StringWriter` — the family's own measurement
shape, where the control is what makes the result mean anything; the segment file named
`00-00-00-<pid>.log` under the next day's folder for a clock pushed past midnight; the prune keeping
today and deleting a folder older than the retention.

---

### T10. An agent cannot learn that config entities exist, let alone wire one up

**Symptom.** Config entities shipped in 0.77.0: a `config` entity's body is a secret, an application
reads it with a long-lived per-entity key through `POST /v1/config/read` or `creds config <key>`, and
the viewer answers *"how do I read this from code?"* in twenty languages with a snippet and the file
to paste it into. **None of that reaches an agent.** The MCP server's own instructions
(`src_mcp/src/Program.cs:181-197`) never use the word, and its eleven tools — `creds_list`,
`creds_exec`, `creds_query`, `creds_run`, `creds_open_terminal`, `creds_vpn_up`, `creds_vpn_down`,
`creds_export_env`, `creds_rotate`, `creds_create`, `creds_delete` — contain nothing that names a
config. The only mention of the kind anywhere in `src_mcp/` is one word in a list of kinds
`creds_create` accepts (`src_mcp/src/UseTools.cs:167`).

So Claude Code, sitting in the repository whose `appsettings.Development.json` now lives in the
vault, cannot find out that it does, what reads it, or what to write.

**Why this is not just a missing doc line.** The feature's whole shape is *an agent-adjacent one* —
its purpose is that a developer stops passing `appsettings.Development.json` around by hand, and the
person best placed to wire the reading code is the agent already editing `Program.cs`. The one
surface built for agents is the one surface that does not mention it.

**What the agent needs, in the order it needs it.** Four questions, and today the server answers
none:

1. **What is this?** That a `config` entry is a whole file kept out of git, read at startup, and that
   its body is a secret the agent will never receive — the same boundary every other kind has.
2. **How is it connected?** That reading needs a per-entity key, minted once by the person
   (*Enable Code Access…*, shown once, only its hash kept), and delivered to the app as
   `CREDSFORDEVS_KEY`. **The agent must ask for it, never mint it** — that is the boundary, and
   stating it is what stops a model from hunting for a way around.
3. **Which language, and what is the code?** The catalog already exists and is pure:
   `SNIPPET_LANGUAGES`, `snippetLanguage(id)` and `snippetFor(languageId, variantId, context)` in
   `src_vs_code/src/configSnippet.ts`, bodies in `configSnippetBodies.ts`. Reuse it; a second copy
   of twenty languages' worth of snippets would drift from the viewer's within a release.
4. **Where does it go?** Each snippet already carries its target — *"Program.cs, before
   builder.Build()"* — which is the field an agent needs most and the one a bare code block loses.

**Fix.**

- **`creds_list` names the kind and the state.** A `config` entry says it is a config, and whether
  code access is already enabled — "not open to code yet" is exactly the actionable half.
- **One new tool, `creds_config_snippet`**, taking the entry and an optional language/variant.
  With no language it returns the catalog — ids and human names — so the agent picks rather than
  guesses; with one it returns the snippet, its target file and position, and the environment
  variable the key arrives in. It reads no secret and needs no consent modal, because a snippet is
  public text: the *key* is what is gated, and the person mints that themselves.
- **The server instructions gain a short paragraph** naming config entries and pointing at the tool.
  Short, in the register of the existing block: two facts and a next call.

**Tests.** `src_mcp/tests`: the catalog listing is returned when no language is given; a known
language returns a body, a target and the env-var name; an unknown language is an error naming the
valid ids, not a silent default. Extension side: the tool's snippet for a language is
**byte-identical** to what the viewer renders for the same entry — one assertion, and it is the one
that keeps the two surfaces from drifting.


---

### T11. A double click both opens the viewer and toggles the twisty (DEFECT, found by the owner 2026-08-27)

**Symptom.** Double-clicking an entity that has kept versions, or that something depends on, opens
the read-only viewer **and** expands or collapses its History / *Depended on by* sub-tree — so the
sub-tree flips open and shut as a side effect of opening the entry. Expansion should be the
chevron's job and nothing else's: a double click means *open this*, and the twisty means *show me
what is under it*.

**Mechanism.** `treeDataProvider.ts:657-661` gives every entity row a `command`
(`credSshManager.itemClicked` → the viewer, handled at `extension.ts:2353`). Rows with history or
dependants are **also** collapsible — `treeItemCollapsibleState` is set for exactly those two cases,
which is what the twisty is. VS Code then does both things on the same gesture: it runs the item's
`command` and it toggles the row. The comment at `treeDataProvider.ts:652-653` states the intended
contract — *"Single click only selects (the handler ignores it); a DOUBLE click opens the read-only
viewer"* — and it is accurate about the handler while being silent about the toggle, which is not
the handler's doing. The two rows that have a twisty are the two that misbehave, which is why this
looks like a defect in history rather than in click routing.

**Measure before choosing.** The toggle is the tree widget's, not ours, and how it binds depends on
the user's `workbench.tree.expandMode` (`singleClick` by default, `doubleClick` available). So the
first step is to establish what actually fires at each setting — one window, one entry with history,
both settings — because three of the candidate fixes below are only correct under one of them.

**Candidates, in the order they should be tried:**

1. **Do not make the row itself collapsible.** Keep history and dependants reachable, but stop the
   entity row from carrying both meanings — the twisty moves to a child group row. Cleanest, and it
   removes the conflict rather than fighting it; the cost is one extra row per entry that has
   versions.
2. **Drop the item `command` and open from an explicit gesture** — the context menu's *Open* and a
   keybinding — so the double click has nothing to race with. Cheapest, and it takes away something
   people already use.
3. **Counteract the toggle** in `onDidExpandElement` / `onDidCollapseElement` when the change came
   from an activation rather than the chevron. Rejected unless the first two fail: it is a fight
   against the widget, and it will flicker.

**Test.** The routing decision is what to make pure and assert — given a row that is collapsible and
carries a command, the provider's decision about which of the two it grants. Whichever candidate
wins, the test names the guarantee: *opening an entry does not change what is expanded.*


---

### T12. *Copy All* sits at the bottom of the viewer, where the page is longest

**Symptom.** The viewer's *Copy All* button is the last thing on the page
(`entityViewPanel.ts:630-632` — a `.footer` div after the two-column grid, `.footer { margin-top: 16px }`
at `:621`). The owner wants it in the **top-left corner**.

**Why the placement got worse without anyone moving it.** A footer button is at the bottom of the
*content*, and the content grew a second column in 0.77.0 whose code panel is up to 320 px of
scrolling snippet (`.code { max-height: 320px }`). So the button drifted below a fold it never used
to be below: on a config entry the reader is at the top, looking at the name and the body, and the
one control on the page is off-screen underneath a code sample they did not ask to scroll past.
Nothing about the button changed; what changed is how far it is from the thing it acts on.

**Fix.** Move it into a header row beside the `<h2>` title, which is already the top-left of the
page — the entry's name and the one action that takes the whole entry belong on the same line. Drop
the now-empty `.footer` rule rather than leaving a selector nothing uses.

**Test.** Assert on the built HTML that the *Copy All* control appears **before** the `viewGroups`
grid, not after it — an ordering assertion rather than a pixel one, because it is the ordering that
carries the guarantee and it survives restyling. RED first against today's markup, where it is last.


---

### T13. An entry that just arrived says nothing about where it landed

**Symptom.** Accept a share, or run an import, and the entry appears somewhere in a tree that is
already several accounts and a dozen folders deep. Nothing points at it. The owner's ask: **tint the
row with a green border for about five seconds and put it in focus**, so "it worked" and "here it
is" are the same event.

**Why it matters more for these two paths than for a normal add.** When you create an entry yourself
you already know its name and its folder — you chose both. An accepted share and an import place
rows you did not name, in folders you did not pick (a share carries the sender's shape; an import
invents folders from `~/.ssh/config` or a vendor export). Those are exactly the two cases where the
result is invisible, and they are the two the owner named.

**Both halves already exist in this codebase — this is wiring, not invention.**

- **Focus.** `extension.ts:4431` already does `treeView.reveal(found, { select: true, focus: true,
  expand: true })` for go-to-entity. Same call, new caller.
- **The tint.** `DepDecorationProvider` (`depDecorations.ts:62`) is a registered
  `vscode.FileDecorationProvider` answering for synthetic uris — that is how dependency colours
  already reach tree rows (`extension.ts:401`). A transient "just arrived" decoration is another
  answer from the same mechanism plus a timer that fires `onDidChangeFileDecorations` when it
  lapses. **Do not add a second provider**: two providers racing over one row is how the dependency
  colour would start flickering.

**The honest limit to record.** VS Code gives an extension a row **colour** and a badge, not a
border. So "green border" will be a green row tint for five seconds; if that reads as too weak
beside the dependency colours already in use, the fallback is the badge slot. Worth stating in the
plan rather than discovering at review, and worth showing the owner before it is called done.

**Where to fire it.** One helper, called wherever a row APPEARS for the first time — the owner
asked for creation too, and he is right that it is the same event from the reader's side:
share acceptance (`shareInbox.ts`), import, and creating an entity or a folder. **Not on edit**,
and that is the line: create places a row that was not there, edit changes one you are already
looking at. A highlight that fires on everything highlights nothing.

**Tests.** The timing and the set of highlighted ids are the pure part: a decoration is offered for
an id after it is announced, and is gone once the window has elapsed; a second arrival during the
first one window does not cut the first one short. Clock injected, not waited on.

---

### T14. The generators decide for you, and their buttons do not look like buttons

Three complaints from the owner, one root: the generator shipped with its choices baked in.

**T14a. The password generator offers no choices.** `DEFAULT_PASSWORD` (`secretGenerator.ts:52`) is
length **20**, all four classes on, ambiguous characters allowed — and the form has a single
*Generate password* button (`entityFormPage.ts:664`) that takes the default and nothing else. The
options type is already there and already right (`PasswordOptions` at `:34` carries `length`,
`lower`, `upper`, `digits`, `symbols`, `avoidAmbiguous`); nothing in the UI reaches it.

Wanted: **length 6 / 8 / 12 / 16 / 32 / 64, default 32**, and the four character classes as
checkboxes, **all four on by default**. Note the default moves 20 to 32, which is a deliberate
change to what an unattended click produces, not a side effect.

**T14b. SSH key generation offers one algorithm, and says so on purpose.** `entityFormPage.ts:548`
is one *Generate Ed25519 key pair* button over `generateEd25519()`. The owner wants the key type and
the size to be selectable.

**This contradicts a recorded decision, and the contradiction should be resolved deliberately.**
`secretGenerator.ts:225-228` argues the opposite in as many words: *"Ed25519 rather than a choice of
algorithm: it is the modern default, the keys are short, and offering RSA-2048 here would only let
somebody pick the weaker option. A key that must be RSA is one that already exists somewhere and is
pasted in."* That reasoning is sound and the ask is still legitimate — some hosts genuinely refuse
Ed25519. So: **offer the choice, keep Ed25519 the default and first in the list, and label the
weaker options as weaker** rather than presenting them as equals. Then update that comment, because
leaving it asserting a design the UI no longer follows is how the next reader is misled. Candidate
list: Ed25519 (default), ECDSA P-256/384/521, RSA 3072/4096 — and **not** RSA-2048, which is the one
the old comment was actually protecting people from.

**T14c. Secondary buttons do not read as buttons — anywhere.** Extended by the owner beyond the
generators: *+ Add argument*, *Split pasted command into rows*, *Show/Hide*, and every other
`<button class="secondary">` across the entity forms have the same problem. `button.secondary`
(`entityFormPage.ts:475-476`) paints `--vscode-button-secondaryBackground`, which in the dark
themes the owner uses sits within a few percent of the panel background — so they all render as
plain text, and "хер поймёшь что это кнопка". The ask: **make them blue like Save** — the plain
`button` rule at `:473-474` (`--vscode-button-background`). The fix is therefore ONE rule, not a
sweep of call sites: restyle `button.secondary` itself to the primary palette (or delete the class
and its rule if nothing then distinguishes them). Keep exactly one visual hierarchy decision,
made once in CSS — going button-by-button is how half of them would end up missed, which is this
defect's own origin story.

**T14d. Find the other generators.** The owner asked to look for the rest and give them options too.
Known so far: *Generate passphrase* (`entityFormPage.ts:665`, `DEFAULT_PASSPHRASE` at
`secretGenerator.ts:184` — word count is the knob, and the separator is the other one), and the
one-time share PIN, which is typed rather than generated and arguably should be offerable. Sweep
`secretGenerator.ts`'s callers (`entityFormPanel.ts:20`, `extension.ts:238`, `secretKinds.ts:1`)
before building, and list what was found and what was deliberately left alone.

**Tests.** `secretGenerator.test.ts` is where the guarantees live and the generator is already pure:
a requested length is the produced length at every offered size; a class switched off never appears
in a thousand draws; **all four off is refused rather than producing an empty alphabet** — that is
the failure mode a checkbox row introduces and the one test that must exist; the entropy line
matches the alphabet actually used; and each offered key type parses back through `sshKeyParse`,
which is the only implementation of the wire format here.


---

### T15. The filter reverts itself the moment you touch what it found (DEFECT)

**Symptom.** Search finds the right rows — the tree even says *"Search: aws  1 found"*. Click one,
and the filter disappears and takes the result with it, so there is nothing left to act on. The
owner: *"ищет хорошо, но если я нажимаю — поиск исчезает, и всё, я не могу ничего сделать."*

**Root cause, and it is one flag.** `credSshManager.search` (`extension.ts:1590-1610`) drives a
`vscode.window.createInputBox()`. A quick-input widget hides as soon as it loses focus unless
`ignoreFocusOut` is set, and this one does not set it. So clicking the tree hides the box, which
fires `onDidHide`, which finds `accepted === false` and runs `provider.setSearchQuery(before)` —
restoring the filter that was there before the search, normally empty.

The handler is not wrong about what it wants: *"Escape puts back whatever was filtered before, so a
cancelled search is not a lost one"* (`extension.ts:1586-1588`) is a good rule. The defect is that
`onDidHide` cannot tell **Escape** from **focus moved to the thing you were searching for**, and it
files both as cancelled. Every click on a result is read as *"never mind"*.

**Fix, in two parts, matching the two things the owner asked for.**

1. **Interacting with a result must not cancel the search.** Set `ignoreFocusOut = true` so hiding
   means Escape or Accept, and only those two — then the existing accept/cancel logic becomes
   correct instead of merely well-intentioned. The filter term survives, the tree stays filtered,
   and the row is there to click, right-click and open. The existing *Search: … N found* row with
   its `×` (`credSshManager.clearSearch`) is then the way out, which is what it was always for.
2. **Clearing the search keeps your place.** With a row selected, closing the filter should reveal
   that row in the now-unfiltered tree and briefly tint it — the owner asked for this explicitly and
   named it as the same behaviour as an accepted share or an import. So it is **T13's helper, called
   from a third site**, not a second mechanism.

**The ordering trap, already documented in this file.** `extension.ts:1680-1682` records it: *"a
filtered-out row cannot be revealed, so a reveal into an active filter silently does nothing."* The
reveal in part 2 must therefore run **after** the filter is cleared and the tree has refreshed, or
it will do nothing and look like the highlight failed. Whatever this ends up looking like, that
ordering is the thing the test must pin.

**Tests.** The cancel/keep decision is the pure part and it is the whole defect: given
(accepted | escaped | focus-lost) and a previous term, which term does the tree end up with —
focus-lost keeps the new one, Escape restores the old, Accept keeps the new. Plus an ordering
assertion for part 2: the reveal is requested after the clear, never before.


---

### T16. The default folder set never learned about configs (DEFECT)

**Symptom.** Create a project folder and it comes with db, vpn, ssh keys, ssh connections,
passwords, terminal and scripts — and no **config**. The owner suspected the same hole for a
brand-new user, and it is there: **one list feeds both**.

`DEFAULT_FOLDERS` (`defaultFolders.ts:17-25`) has seven entries and no `config`, while `config` has
been a first-class `FolderType`/`EntityKind` since 0.77.0. Both callers take that list verbatim:

- `storageManager.ts:408` — the one-time seed for a brand-new, empty account;
- `extension.ts:2263` — the sub-folders scaffolded inside a new `project` folder.

So every account created since configs shipped, and every project folder ever made, is missing the
folder for the feature the last release was about. The one-line addition fixes both at once, which
is the payoff of the list having stayed single.

**The half that a one-line fix does NOT cover, and it is the owner's own case.** Seeding is
deliberately once-only and never re-runs — `shouldSeedDefaults` requires `nodeCount === 0 && !alreadySeeded`,
and the comment says why in as many words: *"renaming or deleting the defaults is respected — they
don't come back."* That rule is right and must not be weakened. It also means an existing account —
the owner's — will still have no config folder after this fix, because it was seeded before configs
existed.

So there is a decision here, not just an edit:

1. **New accounts and new project folders only** (the one-line change). Honest, cheap, and leaves
   every existing account to make the folder by hand.
2. **Back-fill, narrowly**: add a `config` folder to an account that has been seeded, has no folder
   of type `config`, and has not deleted one. The third condition is the hard one — nothing records
   a deleted default, so "never had it" and "did not want it" are indistinguishable today, and
   guessing wrong re-creates a folder somebody removed. That is exactly the failure the once-only
   rule exists to prevent.
3. **Offer it instead of doing it**: when an account has config entries but no config folder, say
   so once and let the person add it.

Recommended: **1 now**, and 3 as a separate, small follow-up if the owner wants existing accounts
served. 2 is the tempting one and the one that breaks a rule the code deliberately holds.

**Also check while in there:** the `sortOrder` is the array index, so where `config` is inserted is
where it appears. Next to `scripts` is the natural home — both are file-shaped entries.

**Tests.** `defaultFolders.test.ts`: every `FolderType` that can hold entities has a default folder,
written as a check over the type list rather than a literal count — a test asserting "seven folders"
would have passed happily through this whole defect, and would fail for the wrong reason on the next
kind. Plus: the project scaffold and the account seed produce the same set, since they share a list
and a future change might not.


---

### T17. One highlighter, four surfaces, and none of them colours like an editor

**Symptom, in the owner's four points.** (1) Everything that colours code must use **one**
highlighter. (2) Different languages must actually look different — today a JSON script body
renders essentially one colour, because the shared highlighter only marks comments, strings and
a keyword list, and a JSON document is nearly all strings. (3) The bar is **how VS Code itself
colours the same JSON** — keys distinct from values, numbers and booleans distinct from strings,
punctuation quiet. (4) The *Read this from code* snippet panel has the same problem as the
bodies.

The four surfaces: the config *Contents* box in the form (`entityFormPage.ts:709` — a plain
`<textarea>`, no colour at all), the script body in the form (`:684`, same), the viewer's code
rows, and the snippet panel (`configCodePanel.ts` → `highlightSnippet`). The last two DO go
through the one highlighter (`highlightScript`, `scriptRender.ts:80`) — point 1 is already the
architecture — but that highlighter knows three token classes, so its output reads as one
colour on exactly the format the owner is looking at.

**Where.** The form's bodies are plain `<textarea>`s: `entityFormPage.ts:709-710` (`configBody`) and
`:684-685` (`scriptBody`). The viewer's are `<pre class="code">` run through
`highlightScript(text, language)` (`scriptRender.ts:80`). So the highlighter exists, is pure, and
already knows the languages — the form simply never calls it, because a `<textarea>` cannot render
markup at all.

**This is the one item here that is not a small fix, and the plan should say so before anyone
starts.** A textarea's content is text by definition. Colouring an editable box means one of:

1. **The overlay technique** — a highlighted `<pre>` underneath and a transparent-text
   `<textarea>` on top, with their scroll, font metrics, padding and wrapping kept in lockstep.
   Standard, dependency-free, and reuses `highlightScript` as-is. It fails visibly when the two
   layers disagree by a pixel, and it has to re-highlight on input (cheap: these bodies are small).
2. **A `contenteditable` div** — real markup, but it takes over undo, paste, IME and selection,
   and would need every one of those rebuilt. For a box people paste `appsettings.json` into,
   losing paste fidelity is worse than losing colour.
3. **An editor library** — CodeMirror or Monaco. Correct in every detail and out of the question:
   this extension has **zero runtime dependencies** and the owner has twice chosen to keep it that
   way (`jsqr` refused for the QR reader, `zxcvbn` refused for the PIN estimator).

**Recommended: 1**, deliberately, with the trade written down. And a caveat worth agreeing before
building: with the overlay, the *caret* is the textarea's own, so it stays correct — but any
mismatch in `white-space`, `tab-size`, `word-break` or font between the two layers shows up as text
drifting away from its colours as you type. Those four properties are the whole risk, and pinning
them is most of the work.

**The highlighter itself is the other half of the work.** Keeping ONE implementation
(`highlightScript`) and teaching it enough token classes that languages differ: JSON keys versus
string values, numbers, booleans/null, punctuation left quiet; comments and keywords as today for
the shell-shaped languages. Map classes to VS Code's own theme tokens
(`--vscode-symbolIcon-*` / the `editor` palette is not exposed to webviews — the honest route is
a small set of CSS variables with sensible dark/light values, named after token kinds, so themes
degrade gracefully). The format select's language key already rides along
(`CONFIG_FORMATS` in `configFormat.ts`); a format without a rule set falls back to plain text
**visibly the same as today**, never a half-coloured guess. And it stays dependency-free —
`highlight.js` is the third library this repo would have refused.

**Tests.** The pure half is the only testable half and it is worth having: for each offered format,
the highlighted output re-escapes to the original text — colouring must never alter what would be
saved. That is the guarantee that matters here, because the failure this design can actually cause
is a body that looks right and saves wrong. The pixel alignment is a person's judgement and should
be shown to the owner rather than asserted.


---

### T18. The snippet panel's copy button is a decoy (DEFECT, found by the owner 2026-08-27)

**Symptom, in the owner's three points.** The copy button beside the *Read this from code* snippet
(1) looks different from every other copy button on the page, (2) shows nothing on hover, and
(3) **copies nothing when clicked.**

**Root causes — three small ones, and the third is the real defect.**

1. **A second icon.** `configCodePanel.ts:47-50` declares its own `COPY` SVG — a single-path
   document glyph — under a comment that says *"Reuses the viewer's own icon so the two copy
   buttons are the same button"*. It does not reuse it; it re-draws it, differently (the viewer's
   `COPY_ICON` is the two-rect duplicate glyph). The comment describes the intent, the constant
   contradicts it. Import the icon instead of copying it — reuse-first exists for exactly this.
2. **The hover.** The markup does carry `title="Copy snippet"` (`configCodePanel.ts:40`), so the
   silent hover the owner saw is worth a minute of checking rather than assuming — likely the
   button's hit area versus its 14px icon, or the panel re-render replacing the hovered node.
   Verify while fixing 1; if the title genuinely never shows, that is its own finding.
3. **The click does nothing, by omission.** The button posts `{ type: 'copy', field: 'snippet' }`
   like every other copy button — and the host's copy switch (`entityViewPanel.ts:85-140`) has no
   `case 'snippet'`. The fall-through leaves `value` undefined, and the panel answers *"Nothing to
   copy — the field is empty."* A button wired to a handler that never learned its name.

**The fix for 3 has one subtlety worth stating.** What must land on the clipboard is the snippet
**as currently shown** — the language and variant the person picked in the selects, which live in
the webview. The host renders snippets through `snippetFor(language, variant, context)` already
(`snippetAnswer`, `entityViewPage.ts:125`), so the copy message must carry the same
`language|variant` payload the snippet-request message already carries, and the host re-derives the
text. Copying the DEFAULT snippet while the user looks at Rust would be a worse bug than the dead
button, because it would look fixed.

**Tests.** RED first: the copy switch, given `field: 'snippet'` with a language and variant,
resolves the same text `snippetFor` produces for them — fails today because the case does not
exist. And the panel markup uses the shared `COPY_ICON`, asserted by identity (one constant, two
call sites), not by comparing SVG strings.


---

### T19. The viewer shows a flat list where the form shows framed groups

**Symptom.** The edit form wraps its fields in coloured, labelled frames — *General*, *Secret*,
*Lifetime* — one colour per section, the same colour for that section on every kind. The viewer of
the same entity is one flat run of rows: Agent access, Name, Config file, Created, Last changed,
History, all visually equal. The owner wants the viewer grouped the same way, three frames:

1. **the main fields** (name, the secret-shaped content, host/user/etc.),
2. **dates and history** (Created, Last changed, History),
3. **the right-hand extras** where they exist (the config code panel's column).

Three frames, three different colours — and **consistent across kinds**: the main frame wears one
colour on every entity, the dates frame another, everywhere.

**The catalog already exists; the viewer just never took it.** The form gets its frames from
`FORM_SECTIONS` (`formSections.ts:60` — id, legend and border colour in one place, rendered by the
`fieldset` helper at `entityFormPage.ts:12-25`, with the comment explaining why one catalog:
*"a section cannot be told apart from its colour"*). The viewer (`entityViewPage.ts`) renders bare
`.row` divs and knows nothing of it. So this is the viewer adopting the existing section machinery,
not a second framing system — the same reuse shape as T13's decoration provider.

**The mapping is the design decision, and it is smaller than the form's.** The viewer does not need
the form's eight-plus sections; the owner asked for three. Map them onto the catalog rather than
inventing colours: the *main* frame borrows the form's General colour, *dates/history* gets its own
catalog entry, and the code panel keeps a third. Where the viewer's rows fall into "main" versus
"dates" is a static assignment per row kind — the row builders already know which field they are
rendering.

**Tests.** On the built HTML (`entityViewPage.test.ts`, beside the T9/T12 assertions): the three
frames are present in order for a config entry, two for a kind with no code panel; the Created,
Last changed and History rows sit inside the dates frame and not the main one; and the frame
colour classes come from the shared catalog — asserted by class identity, so a colour renamed in
`formSections.ts` fails here instead of silently unframing the viewer.


---

### T20. The SSH command shows a Windows path to the world, and nothing checks the tools exist

Owner's report, five asks in one: the viewer's *SSH command* row shows
`C:/Windows/System32/OpenSSH/ssh.exe …` — (1) show a Linux line too, at minimum; (2) show the
normal `ssh …` a person types even on Windows; (3) check the PATH first, and if the ssh there
works, never show the C: path at all; (4) the extension can be installed ON Linux and everything
must work there; (5) when no ssh client is installed at all, say so at *Connect* and offer to
install it — opening a terminal that runs the install, with `sudo apt update && apt upgrade` first
on Linux. And beyond ssh: every launch that depends on an external tool (DB CLIs, VPN clients)
should make the same offer.

**What the code actually does today — the symptom is narrower than it looks, and the fix must not
break the reason the path exists.** `buildSshCommand` (`sshCommand.ts:105`) emits the bare word
`ssh` on every platform, Linux included — asks 1, 2 and 4 are already the default behaviour. The
C: path appears only via `openSshProgram` (`sshProgram.ts:68`): **agent forwarding is on** and the
platform is Windows, because our SSH agent is a named pipe and the MSYS `ssh` that Git-for-Windows
puts first on PATH cannot open one (`mustUseBuiltIn`, `sshProgram.ts:64-66`). The screenshot's
entity has `-A` on — that is why it got the long path. So:

- **Ask 3 is the real fix**: instead of "needsAgent && win32 → hardcode System32", *probe which
  ssh PATH resolves to*. If `where ssh` yields the built-in OpenSSH (System32 on PATH is the
  modern-Windows default), the bare `ssh` can open the pipe and the viewer shows `ssh …` — path
  gone. Only when PATH's first ssh is the MSYS one AND the connection needs the agent does the
  full path earn its place, and then a hint should say why it is there.
- **Ask 1 (a second, Linux-flavoured line)** matters for the copy-to-another-machine case: the
  command someone copies out of the viewer is often pasted on a different box. Cheap once the
  Windows line is bare `ssh` — they are then usually identical, and the second line is shown only
  when they differ (i.e. when the full path had to be used).

**Ask 5 — the missing-client check — is new machinery, and it should be ONE mechanism, not one
per tool.** The launches that depend on an external binary today:

| tool | launched by | install (win) | install (debian-ish) |
|---|---|---|---|
| `ssh` / `ssh-keygen` | connect, key gen, git signing (`gitSigningConfig.ts:17` hardcodes the same System32 path — same probe applies) | `Add-WindowsCapability … OpenSSH.Client` | `sudo apt install openssh-client` |
| `psql` / `mysql` / `sqlcmd` / `mongosh` | *Open in DB CLI* (`dbCliLauncher.ts:24-29`) | winget per tool | `sudo apt install postgresql-client` etc. |
| `wg-quick` / `openvpn` | VPN up/down (`vpnCommand.ts:29`) | winget / installer | `sudo apt install wireguard` / `openvpn` |

Shape: a small `toolCheck.ts` — `whichAsync(tool)` plus a per-tool install recipe table — called at
the launch sites. When the binary is missing: a modal naming what is missing (*"psql is not
installed. Install it?"*), and on Yes a terminal running the recipe. On Linux the recipe opens with
`sudo apt update && sudo apt upgrade -y &&` per the owner's explicit instruction — recorded here as
an owner decision, since an upgrade is more than an install strictly needs. Distro detection can be
minimal (apt present → apt recipe; otherwise show the command for the person to adapt) — guessing
five package managers wrong is worse than naming one and saying so.

**Also swept, per "what did I forget":** `git` (used by the git-sync transport and the repo check
in config materialisation) — worth the same check; the terminal-command entities run arbitrary
user commands and are out of scope by design (the command is the user's own); `creds`/`creds-mcp`
install flows already exist and stay as they are.

**Tests.** The probe and the recipe table are pure: PATH resolution decides bare-vs-full command
(the four combinations of needsAgent x what-PATH-holds); each tool has a recipe for both
platforms; the Linux recipe starts with the update-upgrade preamble; and `buildSshCommand` on
Linux never emits a Windows path (pin the regression the owner hit). The modal-and-terminal half
is thin wiring over these.


---

### T21. A Help surface — because the features nobody can decode are the ones nobody uses

**The ask, in the owner's shape.** An unobtrusive entry point at the bottom of the tree — a status
bar item with a yellow question mark — opening a **Help page**: search at the top centre; every
feature documented; the articles ordered so that **the least self-explanatory things come first**
(the owner's own examples: what are *MCP logs* and why do they exist; what does *Install…* do, why,
how, what it gives you). Each topic on the index links into a full article on the same page — with
a Back button and breadcrumbs at the top. Every article in one fixed style: **what it is → why →
how to set it up → how to use it** (plus *what can go wrong*, per the owner's "в каком порядке, что
может пойти не так"). A language setting at the top of the page — English, Russian, Ukrainian,
German, Spanish — remembered **for the help pages only**. Pictures and GIFs come later; build it
text-only now, with the slots ready.

**What this is architecturally: a webview with a content catalog, and the catalog is the work.**

- **Entry point.** A `vscode.StatusBarItem` (the lock/sync item is precedent) with `$(question)`
  and a yellow tint via `ThemeColor` — anchored to this view's window, low priority so it sits at
  the end. Plus a `CredsForDevs: Help` command for the palette, because a status bar can be hidden.
- **The page.** One webview panel in the repo's established pure-page shape: `helpPage.ts`
  (markup, no `vscode`, testable), `helpPanel.ts` (the panel + message loop), following
  `entityViewPage`/`entityViewPanel`. Client-side routing inside the page — index → article —
  with breadcrumbs and Back as page state, not panel re-creation.
- **Search.** Over the catalog's titles and bodies, client-side; the catalog is small enough that
  anything cleverer than substring-with-ranking is over-engineering.
- **The catalog** — `helpContent.ts` — is a typed list of articles, each REQUIRED to fill the
  same fields: `id`, `title`, `whatItIs`, `why`, `setup`, `usage`, `whatCanGoWrong`,
  `mediaSlots` (empty for now, so the picture pass later is content-only). The type enforces the
  owner's "вся документация в одном стиле" — an article that skips *why* does not compile.
- **Ordering.** The index order is explicit in the catalog, not alphabetical, and the plan's rule
  is written next to it: **the less guessable a feature is from its menu entry, the earlier it
  goes.** MCP logs, Install…, corporate recovery, the broker/agent story, config code access,
  ephemeral entries, the WSL relay — before passwords and folders.
- **Languages.** `package.json` setting `credSshManager.helpLanguage` (`en` default, `ru`, `uk`,
  `de`, `es`) — a real setting so it syncs and persists, read by the panel, switchable from the
  page header; changing it on the page writes the setting back. Scoped to help only by NAME and
  by use: nothing else reads it. Translation strategy is the honest part: the catalog type
  carries per-language bodies, `en` required, the others optional with a visible "not translated
  yet, showing English" fallback — a missing translation must never hide an article.
- **Content source.** The README already documents everything in near-article shape (T4 keeps it
  complete); the catalog articles are written fresh in the four-field style, not pasted from the
  README — but T4's coverage test gives the checklist of what must exist: **every command and
  setting shown in a menu should be reachable from some article**, which is the mechanical form
  of the owner's "должно быть описано всё".

**Tests.** The catalog is data, so the guarantees are cheap and real: every article has every
required field non-empty in English; ids are unique; the explicit index order contains every
article exactly once; every `contributes.commands` id referenced from articles exists in the
manifest (no dead links); search over the catalog finds an article by a word in its body; the
language fallback returns English rather than nothing. The page half: breadcrumbs render for a
nested article, and the index renders in catalog order.

**Size warning, stated now.** Five languages times ~20 articles is the largest content object in
the repository. The first build ships `en` complete and the other four as fallback-to-English —
translations are content passes the owner can order separately, not a gate on the surface
existing.


---

### T22. The view title says the product name twice, and the help mark moves into it

**The ask.** The tree's title renders as *CREDSFORDEVS: CREDENTIALS* — the container is already
named CredsForDevs, so the view's own `"name": "Credentials"` (`package.json:403`) makes the bar
say the same thing twice in two words. Drop it: the view keeps only the product name. That frees
the title row, and T21's help entry — the yellow question mark — moves **into the title bar right
after the name** instead of (or in addition to) the status bar: a `view/title` menu contribution
with the `$(question)` icon. The owner also asked for **a space between the help mark and the
sign-in item** that lives on that row — check what VS Code allows about title-bar item spacing
(menu groups control order; raw pixel gaps may not be expressible, and if not, that limit is
recorded rather than faked with a spacer no-op command).

**Where.** `package.json:403` (`views` → `name`), the `view/title` menu block, and T21's entry
point moves here as its primary home — the status-bar item stays or goes per what the title bar
turns out to allow; decide while building T21, record the choice.

**Tests.** Manifest assertions beside T4's: the view's name does not repeat the container's; a
`view/title` command with the question icon exists and points at the T21 help command.


---

### T23. "Enable CLI Access" leads nowhere you can see, and search cannot ask capability questions

**The ask, in the owner's words:** *"я сделал enable in CLI — и что теперь? я даже скопировать это
не могу."* Two surfaces, one root — a capability that exists on an entry is invisible on the entry.

**T23a. The viewer says nothing about CLI access.** The Agent-access line is precedent: the viewer
opens with what agents may do. CLI grants get no equivalent — *Enable CLI Access…*
(`package.json:931`) mints an alias into `globalState`'s `ALIAS_KEY` map (`extension.ts:308-313`),
and after that no surface shows that this entry HAS an alias or what it is called. Add, beside the
Agent-access block: which CLI aliases point at this entry, and — the owner's concrete ask — **a
copyable command row**, `creds ssh <alias>` (verb by kind: `ssh`, `db`, `run`, `env`, `config`…),
with the standard copy button. The alias map is keyed by name → entry; the viewer needs the reverse
lookup, which is a five-line scan of a small map.

**T23b. Search filters by capability.** Today `nodeHaystack` (`treeSearch.ts:34`) matches free text
over name/host/user/command. The owner wants to FILTER: all entries with TOTP; all CLI-enabled; all
with env-variable bindings; all by each MCP switch or a combination — *"что у нас ещё есть? изучи и
добавь"*. The study, from `EntityMetadata` and the stores:

| filterable capability | where it lives |
|---|---|
| has a one-time code | `totpEnabled` / TOTP secret present |
| CLI-enabled (has an alias) | the alias map, reverse-scanned |
| binds env variables | `envBindings` non-empty |
| each MCP switch (visible / usable / rotate / create / delete-own / delete-any) | `mcpAccess`, plus folder inheritance via `resolveMcpAccess` |
| open to code (config key minted) | `configKeyHash` present |
| ephemeral (has a lifetime) | `expiresAt` / `burnPolicy` |
| depends on / depended on by | `dependsOn`, the dependency index |
| has attachments / an image | the has-attachment flags |
| agent-forwarding SSH entries | `agentForward` |
| shared to me / by me | share origin metadata |
| in the Trash | ancestry under the trash folder |

**Syntax over UI**: the existing filter box learns typed predicates — `has:totp`, `has:cli`,
`has:env`, `mcp:usable`, `has:code-access`, `is:ephemeral`, `has:deps` — combinable with each other
and with free text (`aws has:totp mcp:usable`). A QuickPick "insert a filter" helper can list them
so nobody memorises the grammar; the grammar is the feature, because combinations were asked for
explicitly. `nodeHaystack` stays what it is (free text); predicates are a separate match layer in
`treeSearch.ts`, pure and testable.

**The boundary that must hold:** filters read METADATA only — `nodeHaystack`'s own guarantee
("Secrets are never searched") extends to predicates. `has:totp` reads the flag, never the seed.

**Tests.** Each predicate against a fixture tree (positive and negative); combinations AND
together; free text still works beside them; an unknown predicate is reported, not silently
treated as text; the folder-inheritance case for `mcp:*` matches what the tree's own badge shows
(same resolver, asserted by identity). For T23a: the reverse alias lookup, and the command row's
verb per entity kind.


---

## 4. Build order

Ordered so that each step is verifiable on its own, and the two that need a person come last.

1. **T16, T9, T12, T18, T19, then T11** — the defects and viewer asks the owner is looking at.
   T16 goes first: it is one line and a test, and it is the only one that changes what a NEW
   user sees. T18 and T19 ride with T9/T12 — same page module, same test file. First, because a live regression
   outranks bookkeeping. T9 is one number and T12 is one move, both in `entityViewPanel.ts`; T11 needs its measurement
   before its fix.
2. **T6a, T6b, T7, and the ephemeral tail's §2.5** — documentation only, no build, no risk. Early
   because every later step is read against them.
3. **T1** — one pure function, one thin adapter, six call sites. Smallest real change.
4. **T8** — two ported sinks and a prune, all server-side, no client contract touched.
5. **T20** — the ssh-command probe first (it deletes the C: path from the viewer), then the
   shared tool-check with its install offers.
6. **T14** — the generator options and the button styling: the pure half already exists, so this
   is mostly UI plus the recorded-decision reversal in T14b.
7. **T23** — the CLI-access row in the viewer, then the filter predicates over the capability
   table above.
8. **T13, then T15** — the arrival highlight over the decoration provider that is already
   registered, then the filter fix that calls the same helper from its third site. T15's part 1
   (the flag) is independent and can go first if the highlight slips.
9. **T10** — the MCP config surface: one tool over an existing pure catalog, plus the
   instructions paragraph.
10. **T17** — the form highlighter. Late deliberately: it is the only item here whose approach is
   a real design choice rather than a fix, and the overlay should be shown to the owner.
11. **T4** — the README, then the test that keeps it honest. The test is written **first** and
   watched failing against today's README, because a coverage test authored after the document it
   covers is a test shaped to pass.
12. **T3** — the ratchet, last of the code items: it takes a baseline of the tree, so it should be
   taken after the rest have stopped moving it.
13. **T2** — needs a browser and a physical security key.
14. **T21 + T22** — the Help surface and its title-bar home; the view rename rides along: catalog type and entry point first, articles in English, the
    language switch, pictures deliberately later.
15. **T5** — needs the owner. Prepared by then, decided here.

## 5. Test plan

Per the repo rule: every fix opens with a RED test whose failure message describes the real symptom,
and both the failure and the pass are reported.

- **T9** — the viewer's width assertion must fail against today's 640 px, naming both numbers.
- **T12** — the *Copy All* control is emitted before the grid, asserted on the built HTML; RED
  against today's footer.
- **T11** — the measurement at both `workbench.tree.expandMode` settings is recorded first; then a
  test on the routing decision, named for the guarantee *opening an entry does not change what is
  expanded*.
- **T1** — `pinPolicy.test.ts`: advice in `choosing`, silence in `entering`, refusal in both, and
  the refusal text identical to `validatePin`'s. RED first: `pinFeedback` does not exist.
- **T3** — `sizeRatchet.test.ts` on the pure comparison; a deliberate over-baseline file turns
  `npm run ratchet` red.
- **T10** — the snippet a tool returns is byte-identical to the viewer's for the same entry; an
  unknown language names the valid ids.
- **T20** — PATH resolution decides bare-vs-full ssh; recipes exist per tool per platform; the
  Linux recipe opens with update-upgrade; Linux never sees a Windows path.
- **T14** — every offered length and class combination honoured; **all classes off is refused**;
  each key type round-trips through `sshKeyParse`.
- **T16** — every entity-holding folder type has a default folder, checked against the type list.
- **T18** — copying the snippet field resolves exactly what `snippetFor` renders for the shown
  language and variant; the panel uses the shared copy icon by identity.
- **T19** — three frames in order on a config entry, two without a code panel; dates and history
  inside the dates frame; colours by catalog class identity.
- **T17** — for every offered format, highlighting round-trips: the coloured output re-escapes to
  exactly the text that would be saved.
- **T13** — the highlight lapses on an injected clock, and a second arrival does not cut the
  first one short.
- **T15** — the keep/restore decision for accepted, escaped and focus-lost; and the reveal is
  requested after the filter is cleared, never before.
- **T4** — `listingCoverage.test.ts` **must fail on today's README**, naming the MCP and config
  command ids among the missing. That failure is the evidence the test has teeth; anything that
  passes immediately here is measuring nothing.
- **T8** — `AnsiConsoleSinkTests`: escapes counted on a redirected writer, with the by-hand control;
  `DailyRunFileSinkTests`: the midnight segment's name and folder; retention: today kept, an old day
  gone. Server suite via the executable, never `dotnet test`.
- **Whole-suite proof**: `npm test` in `src_vs_code` and the server test executable both green, with
  their own numbers quoted in the commit body.

## 6. Definition of Done

- [ ] T9: the viewer's columns are as wide as the form's, proven by a test watched failing at 640 px.
- [ ] T22: the tree no longer says the product name twice; the help mark sits in the title bar
      after the name, with the spacing question answered rather than assumed.
- [ ] T23: the viewer shows this entry's CLI aliases with a copyable `creds <verb> <alias>` row;
      the filter understands the capability predicates, combinable, metadata-only.
- [ ] T21: the help entry point exists with a yellow question mark (title bar per T22, status bar
      as fallback); every article
      carries what/why/setup/usage/what-can-go-wrong; the hard-to-guess features lead the index;
      search, breadcrumbs and Back work; the language choice persists and falls back to English
      visibly; media slots exist and are empty.
- [ ] T20: the viewer shows bare `ssh` wherever PATH's client can serve the connection, a
      second line only when the two differ, and every external-tool launch checks the binary
      and offers its install recipe — Linux recipes opening with update-upgrade.
- [ ] T14: password length and character classes are choosable (default 32, all four on); SSH key
      type and size are choosable with Ed25519 first and the weaker options labelled; the
      recorded "no algorithm choice" comment is updated rather than left contradicting the UI;
      the generate buttons read as buttons; the other generators are swept and findings listed.
- [ ] T15: clicking a filtered result no longer cancels the filter; Escape still restores the
      previous term; closing the search reveals and tints the selected row, after the clear.
- [ ] T19: the viewer groups its rows into the owner's three frames, coloured from the form's
      section catalog, consistent across kinds.
- [ ] T18: the snippet copy button copies the snippet as shown, uses the shared icon, and its
      hover names it; the "reuses the viewer's icon" comment is finally true.
- [ ] T17: the form's config and script bodies are highlighted for every format the select
      offers, with unsupported formats falling back to plain text; the round-trip test proves
      colouring cannot change what is saved; the overlay's four alignment properties are pinned.
- [ ] T16: a config folder is seeded for new accounts and new project folders, asserted over the
      folder-type list rather than a count; the once-only seeding rule is left intact and the
      existing-account question is answered in writing.
- [ ] T13: an accepted share, an import, and a newly created entity or folder reveal and briefly
      tint their new row, through the
      decoration provider that already exists — not a second one; the tint's real capability
      (row colour, not a border) is stated.
- [ ] T12: *Copy All* is at the top-left, beside the title, and the dead `.footer` rule is gone.
- [ ] T11: a double click opens the viewer and leaves expansion alone; the chosen candidate and the
      measurement that ruled out the others are recorded.
- [ ] T1: no exported function in `pinPolicy.ts` is unreachable from production code, and the
      advisory appears only where a PIN is being chosen.
- [ ] T2: the probe was run against a named browser version, the result is recorded, and
      `webauthnHint.ts` and the security tail agree with each other.
- [ ] T3: `npm run ratchet` runs in CI; `extension.ts` and `storageManager.ts` cannot grow.
- [ ] T10: `creds_list` names a config entry and its code-access state; `creds_config_snippet`
      returns the catalog, and a snippet identical to the viewer's, with its target file.
- [ ] T4: every `contributes.commands` id and `contributes.configuration` key appears in
      `README.md`, enforced by a test that was watched failing first.
- [ ] T5: the four tag commands are written down with what each publishes, and the owner's decision
      is recorded here.
- [ ] T6: `todo/README.md`'s *Promoted* table matches `research/`; the manual MCP pass names the
      current version; the CHANGELOG's `[Unreleased]` block is cut into the dated sections the
      release commits claim.
- [ ] T7: the roadmap's status line states only what the code supports, and A1 carries its
      measurement.
- [ ] T8: the server's console output is coloured under redirection (counted, not observed), a run
      crossing midnight segments, `logs/` has a named retention owner, and the obsolete mirror-list
      item is deleted with its reason.
- [ ] `research/module_extension.md` and `research/module_server.md` updated for T1, T3, T4, T8, T9, T10, T11, T12, T13, T14, T15, T16, T17, T18, T19, T20, T21, T22, T23;
      `research/module_mcp.md` (or `module_extension.md`'s MCP section) for T10.
- [ ] `node .claude/rules/shared/tools/plan-lifecycle.mjs` and `pin-check.mjs` pass.
- [ ] This plan promoted to `research/` with its deviations recorded, and anything left extracted
      into a fresh `todo/` plan rather than left behind in it.
