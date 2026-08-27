# PLAN — close the gap to the family logging convention

> Status: **plan only for the code; item 2 is void.** Re-read against the shared rule 2026-08-27
> ([PLAN_tails.md](PLAN_tails.md), T8) and the rule had moved underneath it. Scope:
> `src_minimalapi_server/src/Logging.cs`. Serilog with a file per run **has** shipped; the coloured
> console sink, the midnight segment and retention have not.
>
> **Item 2 no longer exists to be done.** It asked for a row in the shared rule's *Mirrors* table.
> That table is gone: the rule moved into `.claude/rules/shared`, a submodule of
> `dew_flow_conventions`, and now says *"A new repository **mounts the submodule** — it never copies
> this file"* — which this repository already does (`.gitmodules`, and `pin-check.mjs` is green).
> The mechanism the item named was replaced by the one it would have registered against. Kept below,
> struck through, because deleting it outright would leave the next reader wondering whether the
> registration was skipped or was never needed.
>
> **And the rule grew three DoD lines this plan predates**, all three of them open here: a run
> crossing midnight must segment into the next day's folder with the same pid; every code path that
> builds a container wires the same sinks; and the repository must **name its `logs/` retention
> owner**. Item 3 below is that last one, written before the rule required it.
>
> Worth recording, because it decides the retention answer: **the extension already solved this.**
> `diagnosticLog.ts` sweeps its own run files at `retainDays: 14`. The half of this product nobody
> wrote a logging plan for is the half that meets the rule, so the server should adopt that number
> rather than choose a second one.
>
> Source rule: `.claude/rules/shared/common/logging-serilog.md`.

## Where things stand

The 2026-08-23 consolidation implemented most of the rule: Serilog configured before `Build()`,
console plus **a new file per run** at `logs/{UTC date}/{app}-{HH-mm-ss}-{pid}.log`, UTC throughout,
levels from configuration, `Log.CloseAndFlush()` in a `finally`, and `logs/` git-ignored.

Two items are open, and one of them is a recorded deviation rather than an oversight.

## 1. The coloured console sink

**What the rule requires.** Not `WriteTo.Console(theme: …)` — the rule records a measurement showing
Serilog's console themes emit **zero** escape bytes once stdout is redirected, with a control in the
same process proving the pipeline preserved escapes. `applyThemeToRedirectedOutput` changes nothing.
So the family writes its own ~40-line `AnsiConsoleSink` that emits escapes unconditionally, and the
rule says to use it.

**What shipped here.** A plain, themeless console sink, with the deviation documented in
`Logging.cs`. The reasoning: this service has no Aspire host. It runs under Docker, where
`docker compose logs` colours by stream and the file sink is what anyone actually reads during an
incident. Colour with no dashboard to render it is cost without benefit.

**Why it is still worth closing.** The rule's real point is that *one* logging shape serves the whole
family, and a repository that renders differently is a repository someone has to think about
separately. If this service ever runs under an orchestrator — or if anyone tails it in a terminal,
which the standalone `dotnet run` command in `CLAUDE.md` invites — the colour is missing exactly
where the rule predicted.

**Work.** Port `AnsiConsoleSink` from a sibling's `ServiceDefaults` (`dew_flow_mcp` is the reference
implementation). Reuse it, do not rewrite it: the rule's own history is that a second copy drifts.
Two details it already encodes and a fresh implementation would get wrong:

- render through Serilog's `MessageTemplateTextFormatter` with `{Message:lj}`, **never**
  `LogEvent.RenderMessage()` — the latter quotes every string property, so a connection failure
  reads ``database '"qln"'``;
- colour the level strongly and little else. A line where everything is coloured is a line where
  nothing stands out.

The file sink must stay uncoloured — escape codes in a file are noise to every reader, `grep`
included.

**Where it lives.** There is no `ServiceDefaults` project here and one server does not justify
creating one. Put it beside `Logging.cs` and note in the file that it is a port, with the source
repository named as a path.

**Test.** The measurement the rule was built on: write one event through the sink to a **redirected**
stream and assert the byte stream contains ESC (`0x1B`). That is the assertion that catches a future
switch back to a theme.

## 2. ~~Register this repository in the mirror list~~ — **VOID: the list was replaced**

> The item as written, struck through. The *Mirrors* table it targets no longer exists in
> `.claude/rules/shared/common/logging-serilog.md`; the rule is consumed through the submodule this
> repository already mounts, and its Definition of Done now reads *"A new repository **mounts the
> submodule** — it never copies this file"*. There is nothing to register and no pin to bump for it.
>
> ~~`.claude/rules/shared/common/logging-serilog.md` ends with a *Mirrors* table naming every
> consuming repository. `dew_flow_creds_for_devs` is not in it. Add a row, then plain `mirrored`
> once item 1 closes. This is a change to the shared conventions repository, so it is its own commit
> there plus a submodule pin bump here.~~

## 2b. The midnight segment (new — the rule grew this after the plan was written)

A run that crosses UTC midnight must continue into the next day's folder as `00-00-00-<pid>.log`,
so that "a file per run" and "a folder per day" stop contradicting each other for a service that
never restarts. `dew_flow_mcp/src/ServiceDefaults/DailyRunFileSink.cs` is the family's answer and is
written to be ported: the segment is named for the **boundary**, not for the first event after it,
so consecutive days line up instead of drifting.

**Test.** A clock pushed past midnight produces the second file, in tomorrow's folder, with the same
pid — asserted on the paths, not by waiting.

## 3. Log retention on disk

The reliability rule requires every directory a host writes to name a retention owner. A file per run
means an unbounded count over a long-lived deployment: a service restarted daily for a year leaves
365 files.

Small in bytes, but it is exactly the "everything that grows has an owner" clause. `dew_flow_mcp`
already settled this shape — a startup sweep deleting run files older than N days — so **reuse that
decision rather than inventing a second answer**; the rule records that inventing a second answer is
how this diverged before.

Default 14 days, `Logging:RetentionDays`, swept once at startup. Never sweep the file the current run
is writing.

**Test.** Given a directory of dated files, the sweep removes those past the cutoff and keeps the
rest — a pure function over a listing, not a filesystem test.

## Build order

1. Retention sweep — independent, smallest, closes the reliability clause the rule now names.
2. The `AnsiConsoleSink` port and its escape-byte test.
3. The `DailyRunFileSink` port and its boundary test.
4. Remove the deviation note in `Logging.cs` once 2 lands, and confirm every host path — the server
   and any CLI entry point that builds a container — calls the one extension.

## Definition of Done

- [ ] `AnsiConsoleSink` ported (not rewritten), with a test asserting escapes on a redirected stream.
- [ ] The file sink is still uncoloured.
- [ ] Run files past `Logging:RetentionDays` are swept at startup; the current run's file is never touched.
- [ ] A run crossing midnight segments into the next day's folder, same pid.
- [ ] `logs/` has a named retention owner, and it is the same answer the extension gave (14 days).
- [ ] Every code path that builds a container calls `AddDewFlowLogging` — CLI entry points included.
- [ ] Item 2 is recorded as void with its reason, not silently dropped (`pin-check.mjs` green).
- [ ] The deviation note in `Logging.cs` is removed once it is no longer true.
