# PLAN — the consent modal shows the Claude Code tab's title, so a person can tell WHICH tab is asking

> Status: **IMPLEMENTED, 2026-09-24.** Scope: `src_broker_client/src`
> (`CallerIdentity`, a new `SessionTitle`), `src_mcp/src` (`CallerSource`, `Program`), `src_cli/src`
> (`Program`), `contract/broker-v1.json` and its generator, `src_vs_code/src/brokerCaller.ts`,
> `src_vs_code/scripts/creds-mcp-itest.cjs`. GitHub issue **#136**, the open tail of **#61**. The plan
> round ran once (`good_enough`, 3 of 3 reviewers, 9 findings: 3 accepted, 6 rejected with reasons).
>
> **Deviations.**
> - **The live check (T-I1) was added by the plan round** (findings 7 and 8) and is the one test that
>   exercises the C# sender against the TypeScript window: the real `creds-mcp` binary, a fixture home,
>   the real broker, the modal text read back. It is **skipped on Windows** — measured:
>   `Environment.GetFolderPath(UserProfile)` ignores both `HOME` and `USERPROFILE` there — and it was
>   run on Linux inside WSL from a copy of the tree (95 checks, 0 failures), and red with the title
>   provider removed. CI runs it on ubuntu.
> - **`SessionTitle` was written before its tests**, so its tests could not be watched red first; each
>   guarantee was instead proven by a break-it on the production line it rests on (the first-line drop,
>   the `Seek`, the line-prefix gate, the foreign-agent gate) — all four went red with the real symptom.
>   The record, MCP and window tests were written first and went red (the MCP ones as a compile error:
>   the constructor did not exist; a warnings-as-errors build refuses an unread parameter, so no
>   runtime red was possible there without writing the feature).
> - **No CLI test (T-L1).** The CLI change is one line composing two library calls that are tested;
>   stated as thin wiring rather than tested.
> - **The MCP body tests stopped retyping the field list** and now read it from the contract — two of
>   them had four field names hard-coded and would have stayed green had the contract grown silently.
> - **Measured against the live session this was written in**: the production provider returned
>   `creds old issues`, the text on its tab, in 75 ms including JIT.
> - `sessionSegment` gained a helper (`shownName`) to stay within the complexity limit of 4.
>
> **The open tail** — Codex threads (their id arrives only in `tools/call._meta`), the title under the
> WSL bridge, a title only in a transcript's first 64 KB, and the pre-existing Codex-in-Claude-terminal
> attribution — is extracted into
> [PLAN_consent_names_codex_and_wsl_sessions.md](../todo/PLAN_consent_names_codex_and_wsl_sessions.md).
>
> Related docs: [PLAN_caller_identity_in_consent.md](PLAN_caller_identity_in_consent.md)
> (the founding plan — §12 item 1 is the tail this closes), [module_extension.md](module_extension.md)
> §The agent broker, [module_tests.md](module_tests.md), [architecture.md](architecture.md).

---

## 1. The symptom

Since 2026-09-12 the consent modal opens with *`Claude Code 2.1.281 · session clauderag-d4 (52d1b29a)
· in ClaudeRag` wants to run a command on "prod"…*. Nothing in that sentence is what the person SEES.
A VS Code window with nine Claude Code tabs shows nine titles — *"creds old issues"*, *"Fix the
consent modal to…"* — and not one of them reads `clauderag-d4` or `52d1b29a`: the registry's `name` is
`"nameSource":"derived"`, and the id is on no tab at all. So the modal names the session in a
vocabulary the person cannot match against the screen, and Allow covers every later call on the
grant. That is the whole of #61's request ("в табах вс код есть айди и можно брать название. его
нужно в сообщении показывать"), and the founding plan shipped without it because where the tab's
text lives had not been found (`research/PLAN_caller_identity_in_consent.md:27-29`, §12 item 1).

A second, smaller symptom (#136 item 2): Codex and Gemini sessions get no name at all — agent, a
short id and a folder.

**Goal.** When the caller is a Claude Code session, the modal names it by the text on its tab:
*`Claude Code 2.1.281 · session "creds old issues" (52d1b29a) · in ClaudeRag`*. The title is read
fresh on every call, because a tab is renamed while its MCP server keeps running. Codex and Gemini
are measured, not assumed, and the result is written down whichever way it falls.

## 2. What was measured (and what was not)

Stated as what was checked, per `planning-docs.md`.

### 2.1 Where the tab's text comes from — Claude Code (reconnaissance, re-verified 2026-09-24)

Read in the shipped extension `anthropic.claude-code` 2.1.281 on a live tab:

- The tab's text is the session's **summary**, cut by the webview: more than 25 UTF-16 units → the
  first 24 + `…`.
- The summary is found by a "lite" reader that reads the FIRST and LAST 64 KB of the transcript, in
  this priority: the last `customTitle` in the tail → `<projectDir>/<sessionId>/custom-title.json`
  (`{"customTitle":"…"}`) → a `customTitle` in the head → the last `aiTitle` in the tail, then the
  head → the last prompt / the first prompt / a summary line. **The last three are the text of the
  conversation, and this plan never reads them** (§4.5).
- The transcript is `~/.claude/projects/<cwd with every character outside [a-zA-Z0-9] replaced by
  '-'>/<sessionId>.jsonl`. A folder name longer than 200 characters gets a hash suffix this code
  cannot reproduce, so there is then no title.
- Title lines are `{"type":"custom-title","customTitle":"…","sessionId":"…"}` and
  `{"type":"ai-title","aiTitle":"…"}`; both are re-appended every turn. Over 150 sessions the last
  title line was always within the last 33 KB, and transcripts reach 104 MB — so only the tail is
  read, through `Seek`. A custom title outranks an AI title whatever their order, and where two
  writers disagree the LAST line wins, which is what the tab does too.

Re-verified here on this machine (2026-09-24), reading only title lines and the one `<pid>.json`:
`~/.claude/sessions/26116.json` holds `sessionId` `52d1b29a-…` and `cwd` `d:\rsd\ClaudeRag`; the
project folder is `d--rsd-ClaudeRag` (the rule above, character for character); its transcript's last
64 KB carries `{"type":"custom-title","customTitle":"creds old issues",…}`, and
`52d1b29a-…/custom-title.json` is 34 bytes. Over the tails of the 40 most recent transcripts, **every**
line containing `"type":"custom-title"` or `"type":"ai-title"` STARTS with `{"type":"…-title"` — which
is what lets §4.4 refuse to parse any other line.

**NOT checked:** the head-of-file rungs (a title only in the first 64 KB of a file larger than 64 KB);
whether `/clear` rewrites `sessions/<pid>.json` with the new `sessionId` while `CLAUDE_CODE_SESSION_ID`
in an already-running MCP server stays stale; `CLAUDE_CONFIG_DIR` (the existing registry read ignores
it too — `CallerIdentity.cs:194-197`).

### 2.2 Codex — measured 2026-09-24, `codex-cli 0.156.1`, Windows

A stub MCP server (Node, in the scratchpad, never in the repo) wrote its environment to a file and
answered `initialize` / `tools/list` / `tools/call`; `codex exec` was started with it configured by
`-c mcp_servers.envdump.*`.

| what | observed |
|---|---|
| environment of a **stdio MCP server** under Codex | an ALLOWLIST of 20 variables — `APPDATA COMSPEC HOMEDRIVE HOMEPATH LOCALAPPDATA PATH PATHEXT PROGRAMDATA PROGRAMFILES PROGRAMFILES(X86) PROGRAMW6432 SHELL SYSTEMDRIVE SYSTEMROOT TEMP TMP USERDOMAIN USERNAME USERPROFILE WINDIR`. **No `CODEX_*` at all** — and none of the parent's `CLAUDE_*` either |
| `initialize.clientInfo` | `{"name":"codex-mcp-client","title":"Codex","version":"0.156.1"}` |
| `tools/call` params `_meta` | **carries the thread**: `threadId`, `sessionId`, `x-codex-turn-metadata.thread_id` (all `01a0d266-81d1-…`), plus `turn_id`, `model`, `sandbox_mode`… |
| environment of a **shell command** Codex runs | `CODEX_SESSION_ID` and `CODEX_THREAD_ID` (equal), `CODEX_VERSION`… — **and `CLAUDE_CODE_SESSION_ID` of the Claude Code session Codex was started from** |
| `~/.codex/session_index.jsonl` | 7 lines `{id, thread_name, updated_at}`; the three `exec` threads of this probe are NOT in it — an unnamed thread has no entry |

Consequences:

1. **`creds-mcp` under Codex:** the `CODEX_SESSION_ID` rung is dead for it (the variable never
   arrives), so no env rung can be added. The thread id DOES arrive — per call, in `_meta`. Reading it
   needs the tool delegate to see its request's `_meta`, which the founding plan deliberately avoided
   (its §12 item 6: the SDK binder was not read). That is a separable story with its own SDK
   measurement, and it is extracted as a tail (§9), not built here.
2. **`creds` (the CLI) run by Codex:** `CODEX_SESSION_ID` arrives, so the rung is live and stays.
3. **A defect this measurement exposed.** A Codex (or any) agent started inside a Claude Code
   terminal carries Claude Code's `CLAUDE_CODE_SESSION_ID` — and, inherited the same way,
   `CLAUDE_PID`. The ladder puts `CLAUDE_CODE_SESSION_ID` above `CODEX_SESSION_ID`, so `creds` run by
   that Codex would read Claude Code's registry AND, after this plan, Claude Code's tab title — a
   convincing, wrong label on another agent's call. §4.3 closes it for the title; the pre-existing
   session id/name half is a question for the owner (§10), because changing it changes what the modal
   says today.

### 2.3 Gemini — NOT measurable here, 2026-09-24

`gemini` 0.57.0 is installed and refuses to authenticate (`IneligibleTierError: This client is no
longer supported for Gemini Code Assist for individuals`), so neither the stub MCP server nor a shell
command could be run under it. What stands is the reconnaissance, which read Gemini CLI's source:
`GEMINI_CLI_SESSION_ID` is a telemetry attribute KEY, never exported to the environment;
`GEMINI_SESSION_ID` is set only for hooks; a stdio MCP server receives `GEMINI_CLI=1`; a live session
has no name (summary) anywhere on disk. **Checked:** the installed CLI (cannot run). **Not checked:**
Gemini's behaviour at run time on any machine.

## 3. What is decided before any code

| # | decision | why |
|---|---|---|
| D1 | A fifth, additive caller field **`tabTitle`** (flat: `callerTabTitle`). Wire `version` stays 1 | the founding plan predicted exactly this (§12 item 1: "an additive field, not a redesign"). An old window ignores an unknown field (`brokerCaller.ts:74-84` reads four named keys); an old sender omits it and the new window reads `''` |
| D2 | The modal shows the title INSTEAD of the derived registry name: `session "<tabTitle>" (<id8>)`. With no title, today's `session <name> (<id8>)` is unchanged | two names for one session in a security dialog read as two sessions; the derived name is on no screen the person is looking at. Quoted, because a title is free text and can contain ` · ` |
| D3 | The title is shown **in full, up to the 80-code-point field cap**, not cut to the tab's 24 + `…` | whatever cut the tab applies, its text is a PREFIX of ours — so the modal stays matchable if Claude Code changes its cut, and a title that differs only after the 24th character is still told apart. The composed line keeps its 160 cap (`brokerCaller.ts:129-143`): agent (≈19) + separators and the id (≈24) + 80 leaves ≈30 for `in <folder>`, and a longer folder is cut at the end exactly as today |
| D4 | **The audit line does NOT carry the title** — `callerForAudit` renders the label without it. **Owner's decision, reversible** | an AI title is a summary of the conversation's content; the audit channel is a durable log of who used which credential, and it should not accumulate one-line summaries of private conversations. The modal is ephemeral. Reversing it is one line in `callerForAudit` and one test |
| D5 | The title is read **per call**, never cached at start-up. MCP: a provider in `CallerSource`, like the agent; CLI: once per run, which is per call | a tab is renamed while the server runs; the first `aiTitle` appears only after the first turn, i.e. after the MCP server started |
| D6 | **Under the WSL bridge there is no title.** The Linux half forwards a record computed once at start; the Windows half's environment belongs to `wsl.exe` | making it per-call would need a per-call channel back from the Linux half, which is a relay pump that never parses MCP. A stale title is worse than none. Recorded as a tail. Concretely: the Linux half computes `CallerIdentity.Current`, which never reads a title, so the `--caller` record it forwards always carries `tabTitle: ""`; the Windows half gets no title provider for a forwarded record (§4.6). The field crosses the bridge — it is simply always empty there (plan round, finding 6) |
| D7 | The `GEMINI_CLI_SESSION_ID` rung is removed. `CREDS_CALLER_SESSION` stays first and is the documented way to name a Gemini (or any) session: set it in the MCP server's `env` in the client's config | §2.3: the variable is never exported. `CREDS_CALLER_SESSION` is an independent rung — removing the last rung cannot change what it does, and T-G1 proves the ladder still answers from it |
| D8 | `CODEX_SESSION_ID` stays | §2.2 item 2: it is live for the CLI |

## 4. Design

### 4.1 The record — `src_broker_client/src/CallerIdentity.cs`

`CallerRecord` (`:24-28`) gains a fifth positional property,
`[property: JsonPropertyName("tabTitle")] string TabTitle = ""` — LAST, with a default, so every
existing `new CallerRecord(a, s, n, c)` still compiles and a JSON object without the key (an old Linux
half's `--caller`) deserialises to `""` rather than `null`. `IsEmpty` (`:35`) and `Cleaned()` (`:50`)
include it. `ToJson` / `Encode` / `Decode` need no change beyond the record: they serialise the
record through the source-generated context.

`SessionFile` (`:64`) gains `sessionId`, so the transcript is keyed by what the LIVE session wrote
into its registry entry rather than by an environment variable inherited at spawn (§2.1: `/clear` is
not verified; the registry is the fresher of the two sources either way). Falls back to the
`CLAUDE_CODE_SESSION_ID` value when the entry has none.

`SessionLadder` (`:94-100`) loses `GEMINI_CLI_SESSION_ID` (D7).

### 4.2 The reader — a new `src_broker_client/src/SessionTitle.cs`

Its own file because `CallerIdentity.cs` is already 370 lines and the title is its own concern (a
transcript, not a registry). Pure where it can be, injected where it cannot:

```csharp
public static class SessionTitle
{
    public const int MaxTailBytes = 64 * 1024;       // the tab's own window, and 2x the measured 33 KB
    public const int MaxTitleFileBytes = 1024;       // custom-title.json is 34 bytes measured
    public const int MaxProjectFolderChars = 200;    // past it Claude Code appends a hash we cannot compute

    public static string? ProjectFolder(string cwd);                     // [^a-zA-Z0-9] → '-', or null past 200
    public static string? TranscriptPath(string home, string cwd, string sessionId);
    public static string? TitleFilePath(string home, string cwd, string sessionId);
    public static (string Custom, string Ai) FromTail(ReadOnlySpan<byte> tail, bool isWholeFile);
    public static string CustomFromFile(string? json);
    public static string Read(string home, string cwd, string sessionId, TranscriptSources sources);
}

public sealed record TranscriptSources(
    Func<string, int, TranscriptTail?> ReadTail,     // last N bytes, and whether that is the whole file
    Func<string, int, string?> ReadSmall);           // a whole file of at most N bytes, or null

public sealed record TranscriptTail(byte[] Bytes, bool IsWholeFile);
```

`Read`'s priority, exactly the tab's minus the rungs it must not touch: the last non-blank
`customTitle` in the tail → `custom-title.json` → the last non-blank `aiTitle` in the tail → `""`.
Result through `CallerIdentity.Clean` (one line, no Cc/Cf/`→`, ≤80 code points).

The session id is a path segment built from file/environment data, so it is validated the way the pid
is (`CallerIdentity.cs:194-197`): 1–64 characters of `[A-Za-z0-9-]`, or no read.

### 4.3 When it is read — `CallerIdentity.TabTitle(...)`

```csharp
public static string TabTitle(Func<string, string?> env, Func<string, string?> readFile, TranscriptSources sources, string home);
public static Func<string> TabTitleSource();   // the production provider: real env, real files, real home
```

It returns `""` without opening anything unless ALL hold:

1. the ladder's answering rung is `CLAUDE_CODE_SESSION_ID` (the same gate as the registry, `:129-156`);
2. **no other agent's session marker is present** — `CODEX_SESSION_ID`, `CODEX_THREAD_ID`,
   `GEMINI_CLI`. §2.2 item 3: an agent started in a Claude Code terminal inherits Claude Code's
   variables, and the environment cannot say which agent is innermost. A missing title is a missing
   label; a wrong one misleads. (A Claude Code started inside Codex loses its title too — accepted.)
3. `sessions/<CLAUDE_PID>.json` was read (the existing bounded reader) and has a `cwd`;
4. the project folder is computable (≤200) and the session id valid.

Any exception on the way → `""`. A title never fails a call.

### 4.4 Reading the tail — nothing of the conversation survives the parse

- `ReadTail` opens the transcript with `FileShare.ReadWrite | FileShare.Delete`, takes `Length`,
  `Seek`s to `max(0, Length - 64 KB)` and reads AT MOST 64 KB — a bound on the read itself, so a file
  that grows between `Length` and `Read` cannot enlarge it. The 104 MB file costs 64 KB.
- The bytes are split on `0x0A` (never part of a multi-byte UTF-8 sequence, so a cut mid-character
  is always inside the first, discarded line). When the read did not start at offset 0 the first
  line is dropped: it may be the end of a longer one.
- A line is looked at only if it **starts with** `{"type":"custom-title"` or `{"type":"ai-title"`
  (UTF-8 prefix compare on the span). Only those lines are parsed (`JsonDocument`), the ROOT `type` is
  re-checked, and one string property is read. Every other line — the conversation — is never decoded
  to a string and never parsed; the byte buffer goes out of scope when `Read` returns.
- Title text reaches no log, no exception message and no `Note`: the only output is the record field.

### 4.5 What is never read

The `lastPrompt`, `summary` and first-prompt rungs of the tab's own ladder (§2.1) — they are the text
of the conversation. A session whose only "title" would come from them shows no title, which is
today's behaviour.

### 4.6 The MCP server — `src_mcp/src/CallerSource.cs`, `Program.cs:109,179`

`CallerSource(CallerRecord known, Func<string>? tabTitle = null)`. `Current` becomes
`known.NamedBy(agent)` plus `TabTitle = title` when the provider answers non-blank; otherwise the known
record unchanged. `RunAsync` passes `CallerIdentity.TabTitleSource()` when the record was computed
here and **no provider** when it was forwarded (D6). The Linux half of the relay computes
`CallerIdentity.Current`, which never reads a title, so a forwarded record carries none.

### 4.7 The CLI — `src_cli/src/Program.cs:65`

`CallerIdentity.Current(CliAgent) with { TabTitle = CallerIdentity.TabTitleSource()() }` — one read per
run, and a run is a call.

### 4.8 The contract — `contract/broker-v1.json:75-86`

`fields` gains `"tabTitle"`, regenerated by `src_vs_code/scripts/emit-contract.mjs` from
`CALLER_FIELDS`. `maxFieldChars` 80 and `maxLabelChars` 160 unchanged. The C# test
`BrokerContractTests.The_caller_block_is_in_the_contract_and_names_exactly_the_fields_this_side_sends`
already enumerates the record's JSON against the contract, so the two sides cannot disagree silently.

### 4.9 The window — `src_vs_code/src/brokerCaller.ts`

`CallerLabel.tabTitle: string`; `CALLER_FIELDS` gains `'tabTitle'` (last); `callerFrom` reads it
through `cleanCallerField` like the rest (both shapes); `sessionSegment` renders D2; `callerForAudit`
renders the label with `tabTitle: ''` (D4). The modal (`credsAgentServer.ts:647`) and the audit call
(`:746`) do not change.

## 5. Growth and interruption

Nothing grows: every change is a bounded READ (≤64 KB registry, ≤64 KB tail, ≤1 KB title file per
call) and one more ≤80-character field on a body that is already capped at 64 KB. No state, no cache,
no in-flight status, so nothing to sweep.

## 6. Compatibility

| combination | behaviour |
|---|---|
| new binaries → old window (≤ current release) | `tabTitle` is an unknown key and ignored (`brokerCaller.ts:74-84`, `readNamedBody`) — today's sentence |
| old binaries → new window | no `tabTitle` → `''` → today's sentence |
| new Linux half → old Windows half (WSL) | `--caller` carries a record with `tabTitle: ""`; an old half's `CallerRecord` ignores the unknown property (STJ default) |
| old Linux half → new Windows half | `tabTitle` absent → the default `""` |

## 7. Build order

1. Plan → coai `review_plan` until `proceed`.
2. **C# record + contract, test first:** T-C1..T-C3 red → `CallerRecord.TabTitle`, `IsEmpty`,
   `Cleaned` → green.
3. **`SessionTitle`, test first:** T-S1..T-S10 red → implement → green → break-it.
4. **`CallerIdentity.TabTitle` gate, test first:** T-G1..T-G5.
5. **MCP per-call provider, test first:** T-M1..T-M3. **CLI** wiring (T-L1).
6. **Window, test first:** T-W1..T-W5; `CALLER_FIELDS`, `callerLine`, `callerForAudit`.
7. Regenerate the contract (`npm run compile && node scripts/emit-contract.mjs`), run both contract
   suites.
8. Whole suites (§8), docs (§11), promotion.
9. Rebase, `review_code`, resolve, PR.

## 8. Test plan

C# in `src_broker_client/tests` (xUnit v3, run by `CredsBroker.Tests.exe`); the transcript fixtures
live in a per-test temp directory under `Path.GetTempPath()` and are deleted in `Dispose` — never a
real file of the user's.

| id | guarantee | where |
|---|---|---|
| T-C1 | the record's JSON has the five contract fields in order, `tabTitle` last | `CallerIdentityTests` (updated) |
| T-C2 | a `--caller` JSON without `tabTitle` decodes to `""`, not `null`; a record with only a title is not empty | `CallerIdentityTests` |
| T-C3 | a hostile `tabTitle` in a forwarded record is cleaned on decode | `CallerIdentityTests` |
| T-S1 | **a tail whose first line is cut is read from the second line** — a fixture whose first 64 KB boundary falls inside a fake `{"type":"custom-title"…` line yields the real later title, never the fragment | `SessionTitleTests` |
| T-S2 | **custom beats ai in either order** — `custom, ai` and `ai, custom` both give the custom | `SessionTitleTests` |
| T-S3 | the LAST of several custom titles wins (a rename) | `SessionTitleTests` |
| T-S4 | **`custom-title.json` is the fallback** when the tail has no custom title, and beats an ai title in the tail | `SessionTitleTests` |
| T-S5 | **a large file is read only at its tail** — a >64 KB file with a title only in its head yields `""`, and the same title moved into the tail is found (the positive twin, so the fixture is proven readable) | `SessionTitleTests`, real temp file through the production `ReadTail` |
| T-S6 | **no line of the conversation reaches the result** — a user line whose text contains `{"type":"custom-title","customTitle":"PWNED"}` escaped, and an assistant line with a nested `{"type":"custom-title",…}` object, both yield `""` | `SessionTitleTests` |
| T-S7 | a title with `\n`, a zero-width space, `→` and 200 characters comes out one line, cleaned, 80 code points | `SessionTitleTests` |
| T-S8 | malformed JSON on a title line, a non-string title, a blank title, an oversized `custom-title.json` — each yields `""` and throws nothing | `SessionTitleTests` |
| T-S9 | the project folder: `d:\rsd\ClaudeRag` → `d--rsd-ClaudeRag`; `/home/u/a.b_c` → `-home-u-a-b-c`; a 201-character result → no path | `SessionTitleTests` |
| T-S10 | a session id that is not 1–64 of `[A-Za-z0-9-]` (`../x`, `a/b`, empty, 65 chars) opens nothing | `SessionTitleTests` |
| T-G1 | the ladder is `CREDS → CLAUDE → CODEX`; `CREDS_CALLER_SESSION` still answers first; `GEMINI_CLI_SESSION_ID` no longer answers | `CallerIdentityTests` (updated) |
| T-G2 | **a rung that is not Claude Code's opens no transcript** — Codex rung, override rung: the recording sources were never called | `SessionTitleTests` |
| T-G3 | **Claude Code's variables inherited by another agent open no transcript** — `CLAUDE_CODE_SESSION_ID` + `CLAUDE_PID` + `CODEX_THREAD_ID` (and + `GEMINI_CLI=1`) → `""`, nothing opened | `SessionTitleTests` |
| T-G4 | the transcript is keyed by the registry's `sessionId` and `cwd`, not by the env id or the process folder; the positive path returns the title | `SessionTitleTests` |
| T-G5 | no registry `cwd` → no transcript opened | `SessionTitleTests` |
| T-M1 | **per call: a second `Current` sees a title that changed after the first** | `src_mcp/tests/CallerForwardingTests` |
| T-M2 | a blank provider answer keeps the known record (and a forwarded record gets no provider) | `CallerForwardingTests` |
| T-M3 | the body a use tool posts carries `caller.tabTitle` | `UseToolsTests` (field list derived from the contract, not retyped) |
| T-W1 | `callerFrom` reads `tabTitle` from both shapes and cleans it | `brokerCaller.test.ts` |
| T-W2 | `callerLine` renders `session "<title>" (<id>)`, and title-only / title-and-name / no-title forms | `brokerCaller.test.ts` |
| T-W3 | **the audit form carries no title** — and still carries the name | `brokerCaller.test.ts` |
| T-W4 | a hostile title (newline, `→`, 5 000 chars) cannot forge the modal and the line stays ≤160 | `brokerCaller.test.ts` |
| T-W5 | the contract's `fields` equal `CALLER_FIELDS`, and a body built from the contract round-trips (existing tests, the fixture gains the fifth field) | `brokerContract.test.ts` |

**The live check — C# sender against the TypeScript window (plan round, findings 7 and 8).** Unit
suites on each side agree with the contract file and can both be green while the two implementations
disagree. `src_vs_code/scripts/creds-mcp-itest.cjs` already drives the REAL `creds-mcp` binary over
stdio into the REAL broker with a stubbed modal (T14 of the founding plan). **T-I1** extends the
call T14 already makes — no extra prompt, because a sixth prompt starves level 4 of the window's
5-a-minute budget (founding plan, deviations): the child gets `HOME` pointed at a temp directory
holding a fake `.claude/sessions/<pid>.json` and a transcript with a custom title, and the stub
RECORDS the modal's text. Asserted: the modal contains `session "<title>" (98bf9f23)`, and the audit
line for the same call does NOT contain the title. **Windows skips T-I1 with its reason printed**:
`Environment.GetFolderPath(UserProfile)` there comes from the profile registry, not from an
environment variable (measured 2026-09-24: `USERPROFILE=C:\fakehome` still answers `C:\Users\strug`),
so the fixture cannot be substituted without a production knob; CI runs this harness on Linux, where
`HOME` governs. `research/module_tests.md` names the new check.

Every new test is watched red for the real reason first; the break-it for T-S1, T-S5, T-G3, T-M1 and
T-W3 deletes the production line the guarantee rests on and watches it go red.

**Manual check (owner):** open two Claude Code tabs with different titles, have each ask for the same
credential through `creds-mcp`, and read the modal: the quoted text starts with the tab's text.

## 9. Tail — extracted, not built here

- **Codex's thread through `tools/call._meta`** (§2.2 item 1) — needs the SDK's binding of a
  `RequestContext<CallToolRequestParams>` parameter measured in the pinned 2.2.0, a per-call caller
  source that reads `_meta.threadId`, and `thread_name` from the LAST matching line of
  `~/.codex/session_index.jsonl` (read from the end, bounded). Unnamed (`exec`) threads have no entry.
- **The title under WSL** (D6).
- **The head-of-file rungs** of §2.1 (a title only in the first 64 KB of a large file), and
  `CLAUDE_CONFIG_DIR`.
- **Codex-in-Claude session id and name** (§2.2 item 3) — owner's question first (§10).

Extracted at promotion into [PLAN_consent_names_codex_and_wsl_sessions.md](../todo/PLAN_consent_names_codex_and_wsl_sessions.md).

## 10. Questions for the owner (asked in the summary, not answered here)

1. D4 — keep the title out of the audit line? (Chosen: yes.)
2. The pre-existing mis-attribution: `creds` run by Codex inside a Claude Code terminal reports Claude
   Code's session id and registry name today. Apply §4.3's "another agent's marker present" rule to
   the registry read too?

## 11. Documentation

`research/module_extension.md` §The agent broker (the `caller?` paragraph and the Consent paragraph),
`src_vs_code/CHANGELOG.md` `## [Unreleased]`, `README.md` §who is asking (line ~198),
`src_cli/README.md:79` (the ladder), `research/PLAN_caller_identity_in_consent.md` (the open tail is
closed for Claude Code, with a pointer here), `research/architecture.md` only if a cross-module
interaction changed (it does not: same field, same route).

## 12. Definition of Done

- [ ] A Claude Code caller's modal reads `session "<tab title>" (<id8>)`; the title is re-read per call.
- [ ] No line of a transcript other than a `custom-title`/`ai-title` line is ever parsed; T-S6 proves it.
- [ ] Only the tail (≤64 KB) of a transcript is read; T-S5 proves it on a real file.
- [ ] A non-Claude rung, or another agent's marker, opens no transcript; T-G2/T-G3 prove it.
- [ ] The audit line carries no title; T-W3 proves it.
- [ ] Contract regenerated; both contract suites green; T-I1 (the live C#→window check) added to
      `creds-mcp-itest.cjs` and named in `research/module_tests.md`.
- [ ] `dotnet build dew_flow_creds_for_devs.slnx` 0 warnings; all four .NET test executables green;
      `npm run typecheck` (exit 0), `npm test`, `npx eslint src` green.
- [ ] Family checks: plan-lifecycle, pin-check, gate-snippet-check, build-flags-check, branch-protection selftest.
- [ ] The Codex measurement and the Gemini non-measurement are recorded with what was checked.
- [ ] Docs per §11; this plan promoted with its deviations; the tail plan created.
- [ ] coai: a plan round reached `proceed`; a code round ran; every finding resolved.
