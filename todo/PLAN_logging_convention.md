# PLAN — close the gap to the family logging convention

> Status: **plan only, nothing implemented yet.** Scope: `src_minimalapi_server/src/Logging.cs` and
> the shared rule's mirror list. Serilog with a file per run **has** shipped; what remains is the
> coloured console sink and the mirror registration.
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

## 2. Register this repository in the mirror list

`.claude/rules/shared/common/logging-serilog.md` ends with a *Mirrors* table naming every consuming
repository, and says in as many words that adding a new repository to that list *"is the whole reason
this is a rule and not a comment in one `Program.cs`"*.

`dew_flow_creds_for_devs` is not in it. Add a row — `.NET, mirrored (console sink deviation recorded
in Logging.cs)` while item 1 is open, then plain `mirrored` once it closes.

This is a change to the **shared conventions repository**, so it is its own commit there plus a
submodule pin bump here, in one task — `pin-check.mjs` fails CI if the pin trails the remote.

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

1. Retention sweep — independent, smallest, closes a reliability clause.
2. The `AnsiConsoleSink` port and its escape-byte test.
3. The mirror-list row plus the pin bump, once 2 lands.

## Definition of Done

- [ ] `AnsiConsoleSink` ported (not rewritten), with a test asserting escapes on a redirected stream.
- [ ] The file sink is still uncoloured.
- [ ] Run files past `Logging:RetentionDays` are swept at startup; the current run's file is never touched.
- [ ] The shared rule's *Mirrors* table names this repository, and the submodule pin is bumped in the
      same task (`pin-check.mjs` green).
- [ ] The deviation note in `Logging.cs` is removed once it is no longer true.
