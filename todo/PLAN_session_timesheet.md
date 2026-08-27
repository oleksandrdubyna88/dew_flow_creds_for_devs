# PLAN — Timesheet drafts from Claude Code session transcripts

> Status: **plan only, nothing implemented yet.** Scope: a new product in this monorepo
> (recommended `src_timesheet/` — a private VS Code extension; no server changes, nothing added to
> the published CredsForDevs extension — see Open question 1). Consumer: the future **rsdPayroll**
> system (spec: ClaudeRag repo, `TZ_payroll_en.md` §10.1 — cross-repository citation as a path, per
> [../research/architecture.md](../research/architecture.md)).
>
> Related: [../research/PLAN_ai_context_masking.md](../research/PLAN_ai_context_masking.md)
> (masking before anything reaches an AI context),
> [../research/PLAN_mcp_server.md](../research/PLAN_mcp_server.md) (the off-by-default switch
> ladder + consent), [../research/module_extension.md](../research/module_extension.md).

## Symptom / goal

Daily time reporting is the most hated ritual in the company and the least accurate: hours and
descriptions are reconstructed from memory at the end of the day, per project. The rsdPayroll spec
(ClaudeRag repo, `TZ_payroll_en.md` §10.1) requires exactly that entry — hours + a description per
project per day — so the pain is about to become mandatory.

Meanwhile Claude Code already writes a complete, timestamped record of most engineering work to
disk, for free, on every machine. The goal: **a timesheet draft that writes itself** — collect,
filter, summarize — where the developer only confirms or edits. The governing principle, stated
once and enforced by the tests: **everything that produces a number is deterministic code**; an
LLM appears at exactly one step (wording the one-line description), is optional, and has a
deterministic fallback. The model can never produce or alter an hour figure.

## The data source (verified on a real machine, 2026-08-27)

`~/.claude/projects/<cwd-slug>/<sessionId>.jsonl` — one file per session, one JSON record per
line. Observed fields on records: `timestamp` (UTC ISO-8601), `cwd`, `gitBranch`, `sessionId`,
`version`, `type`, `message.role`, `message.content`. Subagent transcripts sit beside the parent
as `<sessionId>/subagents/agent-*.jsonl`. Terminal sessions and VS Code-extension sessions write
to the same directory, so one scanner covers both surfaces.

Measured scale on the machine this was verified on: **957 transcripts for a single repository**;
one file alone was ~145k tokens. Consequences baked into the design:

- **streaming line reader, never whole-file reads**;
- the format is Claude Code's internal one (records carry `"version"`): the parser is
  **tolerant** — unknown record types are skipped, never thrown on — and a fixture pins the
  shapes we depend on so an upstream format change fails a test instead of a nightly run.

## Design — the determinism boundary

| # | stage | module (pure unless noted) | deterministic |
|---|---|---|---|
| 1 | **Scan** | `sessionScan.ts` | yes |
| 2 | **Attribute** cwd → project | `projectMap.ts` | yes |
| 3 | **Intervals → hours** | `activityIntervals.ts` | yes |
| 4 | **Git evidence** | `gitEvidence.ts` (spawns `git log`, read-only) | yes |
| 5 | **Digest + mask** | `sessionDigest.ts`, `digestMask.ts` | yes — same inputs, byte-identical digest |
| 6 | **Summary** | `summaryProvider.ts` | **no** (LLM) — with a deterministic fallback `fallbackSummary.ts` |

Hours are computed only in stage 3. Stage 6 receives the stage-5 digest and returns one line of
text; it cannot reach the numbers.

### 1. Scan

Incremental: a watermark per file (`path → byte offset + mtime + size`) persisted in the
extension's `globalState`, so a daily run reads only appended bytes. Per record keep
`{timestamp, cwd, gitBranch, sessionId, role, text}` and only for user/assistant **text** blocks;
`tool_use`, `tool_result`, attachments and queue-operation records are dropped at the door — that
is ~90 % of the bytes and where most incidental secrets live. Subagent files contribute
**timestamps** (activity) to the parent session's project but **no text**.

### 2. Attribute

`cwd` prefix → project name, a mapping table in settings. An unmapped `cwd` lands in a visible
**"unassigned"** bucket — never silently dropped, because a silent drop reads as "no work
happened". Known coarseness, recorded: a session working across additional directories keeps its
own `cwd` per record; attribution follows the record's `cwd`.

### 3. Intervals → hours

Per (day, project): sort event timestamps, merge gaps below a threshold (default 15 min,
configurable), an isolated event counts as a minimum grain (default 5 min), total rounded to
0.25 h. Day bucketing uses the **configured company timezone** (rsdPayroll assumption 8); all
arithmetic and storage stay UTC per the family rule
([../.claude/rules/shared/common/utc-timestamps.md](../.claude/rules/shared/common/utc-timestamps.md)).

Overlap policy, v1: two projects active in the same wall-clock minutes are **not netted** —
each is counted, and the day is **flagged** when Σ project hours exceeds the wall-clock span, so
the human corrects it in the confirm step. Netting without an editor-focus signal would be
guessing; the flag is honest. (Editor-focus as a disambiguator is a v2 candidate and only works
while an extension host runs.)

Claude-derived time is a **lower bound** of real work — meetings, reading, non-Claude coding are
invisible here. This is why the output is a *draft* that a human confirms, not a truth source.

### 4. Git evidence

`git log --since <day-start> --until <day-end> --author <git user.email>` in each mapped
repository: commit subjects join the digest and power the fallback summary. Read-only; a missing
repo or a git error degrades to "no commits", never fails the run.

### 5. Digest + mask

Per day × project, capped (default 16 KB): first user prompt of each session (truncated),
commit subjects, counters (sessions, prompts, active hours). Before anything can reach a model
the digest passes masking: generic secret-shaped regexes plus an operator-maintained deny-list.
Limitation recorded honestly: **vault-aware masking** (replacing actual vault values, the way
[../research/PLAN_ai_context_masking.md](../research/PLAN_ai_context_masking.md) does at the Exec
Broker) is only possible inside CredsForDevs, which holds the vault — a standalone product cannot
see it. That is one reason the digest carries first-prompts and subjects rather than full
transcript text, and a reason Open question 1 exists.

### 6. Summary

`SummaryProvider` interface, three implementations, selected in settings:

1. **`fallbackSummary.ts` — deterministic, always available, the default**: a template over the
   digest ("6.5h — 3 commits: fix X, feat Y; 4 sessions"). Ships first; the feature is complete
   without any LLM.
2. `claude -p --model claude-haiku-4-5` — spawn, digest on stdin, a strict one-line instruction.
3. Local Ollama over loopback HTTP — zero cost, nothing leaves the machine.

LLM output is untrusted text: collapsed to a single line, control characters stripped, capped at
200 chars, and displayed as a *draft* the human edits.

### Store + UI

Drafts under the extension's `globalStorage` as `timesheet/YYYY-MM-DD.json`, written atomically;
each entry `{date, project, hours, intervals, summary, evidence: {sessionIds, commits}, status:
draft | confirmed}`. A command ("Timesheet: today's draft") plus an end-of-day reminder — the
scheduling pattern of `src_vs_code/src/backupScheduler.ts`. Confirm/edit via QuickPick first
(a webview is polish, not core). Export: JSON / clipboard.

**Nothing leaves the machine in this plan.** Submitting the confirmed `{hours, one line}` to the
payroll server is a future plan in the payroll repository, and only ever after human
confirmation.

## Privacy rules (hard)

- **Off by default; per-repository opt-in allowlist** — the switch-ladder philosophy of
  [../research/PLAN_mcp_server.md](../research/PLAN_mcp_server.md). A repo not on the list is
  never scanned.
- Raw transcripts never leave the machine, never enter the digest whole, never reach a model.
- The LLM (if any) sees the masked, capped digest only.
- Cloud summarization (`claude -p`) is opt-in per repo; the local fallback and Ollama paths keep
  everything on the machine.

## What this reuses (reuse-first)

- Scheduling pattern: `src_vs_code/src/backupScheduler.ts`.
- Atomic writes: `src_vs_code/src/atomicFileWrite.ts`.
- Masking regex sets and philosophy: `src_vs_code/src/maskEntries.ts`,
  `src_vs_code/src/outputMask.ts` (philosophy transfers; code transfer is limited by the
  vault-awareness note above).
- Child-process hygiene: `src_vs_code/src/childKill.ts`.
- Extension discipline as-is: zero runtime dependencies (the JSONL reader is `readline` +
  `JSON.parse`), `node:test`, the lint line ceiling.

If `src_timesheet/` is chosen (Open question 1), small pure utilities it needs from
`src_vs_code` follow the repository's own precedent — the broker client became a shared library
when a second consumer appeared: extract a shared TS module rather than copy, in the same change.

## Build order

0. **Decision gate** — Open questions 1–2 answered by the owner.
1. Fixtures (synthetic JSONL + one anonymized real-shape transcript) + `sessionScan.ts`:
   streaming, watermarks, tolerant parsing. Tests first.
2. `activityIntervals.ts` + golden tests: gap merge, grain, rounding, midnight in company TZ,
   DST transitions, overlap flag, subagent-only activity, empty day.
3. `projectMap.ts` + settings + unassigned bucket.
4. `gitEvidence.ts` (spawn mocked in tests; one integration test against a throwaway repo).
5. `sessionDigest.ts` + `digestMask.ts` + size caps; planted-secret tests.
6. `fallbackSummary.ts` — the feature is usable here, end to end, with no LLM.
7. `summaryProvider.ts` (claude -p / Ollama) + sanitization.
8. Scheduler, command, confirm UI, store, export.
9. Docs: a module section under `research/`, and the promotion of this plan.

## Test plan

`node:test`, pure modules, golden fixtures. The named cases:

- **Scanner never throws** on arbitrary JSON lines (fuzz-style: random valid JSON, truncated
  lines, unknown `type` values) — it skips and counts.
- **Golden intervals**: fixed fixture → exact hours, including the 0.25 rounding, the 15-min gap
  boundary (14:59 merges, 15:01 splits), midnight crossing in a non-UTC company TZ.
- **Determinism**: same fixture tree scanned twice → byte-identical digest.
- **Masking**: a planted fake token/password in a first-prompt never survives into the digest.
- **Watermark**: appending to a fixture file re-reads only the appended lines.
- Summary providers behind a mocked spawn/HTTP; the fallback tested as a pure function.

## Definition of Done

- [ ] Off by default; scanning happens only for allow-listed repositories.
- [ ] Stages 1–5 are pure/deterministic and golden-tested; same inputs → byte-identical digest.
- [ ] Hours are produced only by `activityIntervals.ts`; no code path lets a model output touch a
      number.
- [ ] Planted secrets do not survive masking into the digest (test).
- [ ] The feature works end to end with **no** LLM configured (fallback summary).
- [ ] Streaming scanner handles a 100 MB transcript and unknown record types without failing.
- [ ] Drafts persist atomically under `globalStorage`; nothing is transmitted anywhere.
- [ ] Overlap days are flagged, unmapped work is visible as "unassigned".
- [ ] Docs updated (`research/` module section) and the `todo/README.md` index row kept true.

## Open questions (owner decisions)

1. **Placement.** Recommended: a separate private extension `src_timesheet/` in this monorepo —
   it is the seed of the rsdPayroll developer surface and keeps the Marketplace-published
   CredsForDevs free of unrelated scope. Alternative: inside CredsForDevs behind an experimental
   flag, which buys vault-aware masking for free and costs product focus. The plan is written for
   the first; the pipeline modules are identical either way.
2. **Default summary provider** where one is configured at all: local Ollama (recommended — zero
   cost, zero egress) vs `claude -p`.
3. Should subagent activity ever contribute **text** (not just timestamps)? v1 says no.
4. Codex CLI / Gemini CLI transcripts (different paths and formats): wanted at all? The scanner
   keeps a source-adapter seam either way; no adapter is built in v1.
