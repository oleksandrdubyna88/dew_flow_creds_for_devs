# PLAN — the consent modal names WHO is asking, instead of always saying "Claude Code"

> Status: **IMPLEMENTED, 2026-09-12.** One commit across four projects; the plan round ran
> (good_enough, 3 of 3 reviewers, 13 findings resolved, 7 accepted).
>
> **Deviations.** Two of this plan's own premises did not survive contact with the SDK, and §5.3 was
> rewritten from the metadata dump that refuted them: the pinned ModelContextProtocol has **no
> `IMcpServer` type at all** and its `RequestContext` carries no reference to the server, so the agent
> label comes from `McpServer.ClientInfo` through a holder the tool delegates close over — which is
> better than what was planned, because no delegate signature changes and therefore no tool schema
> moves. The CLI's label is `creds CLI` without a version: neither binary is version-stamped at
> publish, so a version there would have read `1.0.0` for ever (stamping them is named as a separable
> prerequisite). `Grant` deliberately gained no `caller` field — the share mint happens when a human
> clicks a menu item, with no caller in existence, and that grant is reused by every later token call
> — so the record travels per CALL. Step 1's measurement chose the wire shape and is recorded in §5.2:
> the nested object publishes clean under AOT, so the flat fields remain a parser-side fallback only.
>
> **What the integration test found, which no unit test could.** Driving the real binary over real
> stdio, three checks failed at level 4 with *"Too many requests: a caller without a token may prompt
> at most 5 times a minute"* — and the same script passed on a branch without this change. T14 as
> first written added a SIXTH consent prompt inside the window's own budget and starved the level
> below it. The check now rides the call level 2 already makes and spends no extra prompt, asserting
> the same thing end to end: the name the client sent in its handshake and the short session id the
> binary read from its environment both reach the window's audit line, and the label names the folder
> without a path.
>
> **The open tail**, from §12 and unchanged: where the VS Code TAB title lives was not found — the
> process environment has no such variable and the session registry's `name` is `"derived"` — so the
> label promises the registry's name and the short session id, never the tab's summary. Adding it
> later is an additive field, not a redesign.
>
> Scope: `src_vs_code/src` (the broker:
> consent modal, request parsing, audit line), `src_mcp/src` (`creds-mcp`: caller record, WSL
> forwarding), `src_broker_client/src` (the shared `CallerIdentity`), `src_cli/src` (`creds`),
> `contract/broker-v1.json` and its generator. GitHub issue **#61**; owner's decision taken.
>
> Related docs: [architecture.md](architecture.md) §The trust boundary and §The MCP
> server inside WSL, [module_extension.md](module_extension.md) §The agent broker and
> §The MCP surface, [PLAN_mcp_server.md](PLAN_mcp_server.md),
> [PLAN_mcp_wsl_bridge.md](PLAN_mcp_wsl_bridge.md).

---

## 1. The symptom

`src_vs_code/src/credsAgentServer.ts:586-590` builds the consent modal with a **hardcoded product
name**:

```ts
`Claude Code wants to ${verb} ` +
`"${grant.entityName}" using its stored credential.\n\n${summary}\n\n` +
```

Two consequences, both visible on this machine today.

**Every caller is called Claude Code.** Four doors reach that sentence — a bearer token a human
copied (`credsAgentServer.ts:449`), a CLI alias (`:308`), an MCP client naming an entry by id
(`:259`, dispatched at `:263`), and the folder verbs (`brokerFolderDoor.ts:171`). Codex, Gemini, the
`creds` CLI in a plain terminal and any other MCP client all produce the identical sentence. The
person is told a fact that is false for three of the four, and the one thing a consent modal must be
is accurate about what it is authorising.

**Nothing says WHICH session.** The owner runs many Claude Code sessions side by side — nine were
live while this plan was written, four of them in the same checkout — and ten `creds-mcp.exe`
processes were running at once. A modal reading *"Claude Code wants to run a command on "prod""*
cannot be matched to the tab that raised it. The person either denies blind or allows blind, and
**Allow covers every later call on that grant** (`credsAgentServer.ts:588`), so allowing blind is
the expensive half.

The audit line has the same hole: `formatAuditLine` (`agentAuditLog.ts:68-73`) carries the action,
the entity, the grant label, the door and the outcome, and no field for who called. The MCP journal
that renders those lines (`mcpLogRows.ts:32`) therefore cannot show it either.

**What is wanted** — in the modal and on the audit line:

```
Claude Code 2.1.268 · session clauderag-d6 (98bf9f23) · in ClaudeRag
```

marked as **reported by the caller**. It is a label. It is never an authorisation input.

---

## 2. Measured facts (2026-09-12, this machine — every one re-checked for this plan)

**M1 — Claude Code exports its identity to every child it spawns**, an MCP server on stdio included.
Read out of this very process's environment: `CLAUDE_CODE_SESSION_ID=98bf9f23-81ff-4bba-beaf-…`,
`CLAUDE_PID=29960`, `CLAUDE_CODE_ENTRYPOINT=claude-vscode`, `AI_AGENT=claude-code_2-1-268_agent`,
`CLAUDECODE=1`, plus `CLAUDE_CODE_EXECPATH`.

**M2 — a per-pid session registry exists at `~/.claude/sessions/<CLAUDE_PID>.json`.**
`C:\Users\strug\.claude\sessions\29960.json` holds, in one object:
`{"pid":29960,"sessionId":"98bf9f23-…","cwd":"d:\\rsd\\ClaudeRag","name":"clauderag-d6",
"nameSource":"derived","kind":"interactive","entrypoint":"claude-vscode","version":"2.1.268", …}`.
**A `.key` file sits beside it** — `29960.4c14…beca.key`, 108 bytes; eighteen files in that
directory, roughly half of them `.key`. **The plan reads ONLY `<pid>.json` and never enumerates the
directory** (§5.1).

**M3 — the join works for a real `creds-mcp` child.** Process ancestry, taken live:

```
creds-mcp.exe (3940) → claude.exe (43532) → Code.exe (47052) → Code.exe (34564)
```

and `~/.claude/sessions/43532.json` exists, naming that session `strug-3c`. **There is no terminal
anywhere in that chain**, so pid→terminal-name resolution is not a route on Windows for a Claude
Code VS Code-extension session.

**M4 — under the WSL relay, identity captured on the Windows side would be wrong.** The Windows
half's parent is `wsl.exe`, its `CLAUDE_PID` (if it even crossed) would be a *Linux* pid, and
`~/.claude/sessions/<that pid>.json` on Windows would either be missing or — worse — belong to an
unrelated Windows session that happens to hold the number. So the record must be captured on the
**Linux** side and forwarded, and the Windows half must **not** recompute it.

**M5 — environment variables do NOT cross from WSL into a Windows child unless named in `WSLENV`.**
Measured by this repository on 2026-08-26 and written down in `src_vs_code/src/wslRelay.ts:17` and
`src_cli/README.md:121-122`. (Incidental finding: `WslInterop.cs:138` sets
`start.Environment[RelayedVariable] = "1"` on the Windows child, which by this measurement probably
does not arrive. It is harmless — `ShouldRelay` returns `false` on `isWindows` first
(`WslInterop.cs:75-78`) — but it is *not* the loop guard the comment claims it is.)

**M6 — the MCP SDK pinned here is `ModelContextProtocol 2.2.0`** (`Directory.Packages.props`), and
its published surface was read out of the built assembly
(`src_mcp/src/bin/Release/net10.0/ModelContextProtocol.Core.dll`, `AssemblyVersion 2.2.0.0`) with a
`System.Reflection.Metadata` dump:

| what the task asked about | what 2.2.0 actually has |
|---|---|
| `IMcpServer.ClientInfo` | **there is no `IMcpServer` type in 2.2.0** (0 TypeDefs). |
| the class | `ModelContextProtocol.Server.McpServer`, with public `ClientInfo` of type `ModelContextProtocol.Protocol.Implementation`. |
| `Implementation`'s fields | `Name`, `Title`, `Version`, `Description`, `Icons`, `WebsiteUrl`. |
| `RequestContext<T>` injected into a tool delegate | `RequestContext\`1` has **only** `Params`, `MatchedPrimitive`, `JsonRpcRequest` — and only two backing fields. **It carries no reference to the server at all.** |

So of the two candidate routes named in the task, one does not exist in 2.2.0 and the other cannot
reach the server. The workable route is §5.3.

**M7 — neither binary is version-stamped.** `dotnet publish` for `creds-mcp`
(`release.yml:461`) and for `creds` (`release.yml:310`) passes no `-p:Version`, and nothing in
`Directory.Build.props` sets one — the built `creds-mcp.dll` reports `AssemblyVersion 1.0.0.0`. Two
consequences: `ServerInfo.Version` at `Program.cs:145` has been reporting `"1.0.0"` in every
release, and **`creds CLI <version>` has no version to report** (§5.4).

---

## 3. What exists today (verified for this plan; cite these, not memory)

### 3.1 No caller identity anywhere

- `Grant` is `secret / accountId / entityId / entityName / kind / status / mintedAt / lastUsedAt /
  uses` — `grantRegistry.ts:20-33`; `mint` takes four arguments (`grantRegistry.ts:108`). Minted at
  `credsAgentServer.ts:163` (share), `:259` (the MCP door's hook), `:308` (alias).
- Request bodies carry `entry` (or `alias`) plus at most one action field — `brokerRequests.ts:31-52`
  (`readNamedBody` + `names`), `:100-121` (`readMcpUse`), `:132-140` (`aliasTarget`).
- `creds-mcp` builds bodies **one named field at a time** so a model cannot add fields:
  `UseTools.cs:368-376` (`Body`), `:320-327` (`RotateAsync`), `:358-365` (`Put`);
  `FolderTools.cs:140-152`. Every one serialises a `Dictionary<string, string>` through
  `McpJsonContext.Default.DictionaryStringString` (`McpJsonContext.cs:29`).
- `creds` builds bodies from **typed records**: `AliasBody` at `Program.cs:215-221`, records at
  `CredsJsonContext.cs:60,62,64,67,69,73`.
- Headers the window reads: only `Authorization` / `Host` / `Origin` / `Sec-Fetch-Site`
  (`brokerOrigin.ts:161-187`). The client sends `Authorization` + `Content-Type`
  (`BrokerClient.cs:90-102`; the alias post deliberately sends no `Authorization`, `:112-119`).
- `src_mcp` reads no identity environment variable. `src_broker_client` reads
  `CREDS_BROKER_SOCKET` (`BrokerClient.cs:39-42`), `CREDS_WINDOWS_BINARY` /
  `CREDS_MCP_WINDOWS_BINARY` / `CREDS_RELAYED_FROM_WSL` (`WslInterop.cs:38,49,58`), and the endpoint
  directory override (`Endpoints.cs`).

### 3.2 The consent path — four call sites, one funnel

```
token   credsAgentServer.ts:449 ─┐
alias   credsAgentServer.ts:317 ─┼─► perform() :461-496 ─► consent() :536-566 ─► ask() :569-599
mcp use credsAgentServer.ts:262 ─┘                                                    │ :586-590
mcp delete  brokerMcpDoor.ts:156 ───────────► door.consent (hook at :263) ────────────┘
mcp create  brokerMcpDoor.ts:291 ───────────►
folder verb brokerFolderDoor.ts:171 ────────►
```

`consent(grant, action, verb, summary)` is called from exactly **four** places:
`credsAgentServer.ts:480`, `brokerMcpDoor.ts:156`, `brokerMcpDoor.ts:291`,
`brokerFolderDoor.ts:171`. That number is load-bearing — see §6.

The verb completing the sentence lives on the action (`useActions.ts:26-36`, whose doc-comment
literally spells *"a verb phrase completing 'Claude Code wants to …'"*) — so the sentence and that
comment change together.

### 3.3 The audit line

`AuditEntry` (`agentAuditLog.ts:7-31`), `AuditDoor` (`:42`), `oneLine` (`:62-66`), `formatAuditLine`
(`:68-73`), `parseAuditLine` (`:87-103`) and the `LINE` regex (`:106-107`):

```
/^\[(\d\d:\d\d:\d\dZ)\] (?:#(\d+) )?(\S+) (.*?) \(([^)]*)\)(?: via (token|alias|mcp))? → ([^ ]+(?: [^ ]+)*?)(?:  (.*))?$/
```

The **round trip is the contract** (`agentAuditLog.ts:75-85`), and a line it cannot read yields
`undefined` rather than a half-filled row. Every line in the product goes through one funnel,
`CredsAgentServer.log` (`credsAgentServer.ts:670-678`), which appends to the output channel and the
per-run file. Audit files are retained `AUDIT_RETAIN_DAYS = 14` (`agentAuditFile.ts:84`).

*(Incidental, pre-existing, out of scope: the `via` alternation at `agentAuditLog.ts:107` lists
`token|alias|mcp` but `AuditDoor` also has `config` (`:42`), which `credsAgentServer.ts:272` writes.
A `via config` line therefore does not parse and is dropped by `mcpLogRows.ts:32`. Named here
because this plan touches that regex; fixing it is a separate one-line change with its own test.)*

### 3.4 The wire contract

`contract/broker-v1.json` is **generated** by `src_vs_code/scripts/emit-contract.mjs` (the object is
assembled at `:137-171`, written at `:173-176`) from `brokerProtocol.ts` + `agentCliOutcome.ts`, and
embedded into the C# binaries as a resource (`BrokerContract.cs:40-49`). Both sides assert their
tables match it: `src_vs_code/src/test/brokerContract.test.ts:42-45ff` and
`src_broker_client/tests/BrokerContractTests.cs:36-49` (byte-for-byte against the repository copy).
Every accessor on `BrokerContract` degrades to a hard-coded fallback when a field is absent
(`BrokerContract.cs:63-131`) — the pattern a new `caller` section must follow.

### 3.5 The WSL relay

`Program.cs:88-93` (`ServeAsync` branches on `WslInterop.ShouldRelayHere()`), `:117-136`
(`RelayAsync`), `WslPump.cs:46-63` (`RunAsync`, which starts the Windows half at `:48` with
**`WslInterop.CredsMcp.StartPiped([])` — an empty argument list**), `WslInterop.cs:122-140` +
`:170-177` (`WindowsBridge.StartInfo` / `StartPiped`).

`Program.Classify` (`Program.cs:54-57`) returns `Startup.Usage` for **any** argument other than
`--help`/`-h`/`help`, and `Main` (`:71-73`) then exits with the contract's `usage` code. So an
**old** `creds-mcp.exe` handed a new argument dies immediately — see §5.5.

The stale-half trap is already known and already has a mechanism:
`PLAN_mcp_wsl_bridge.md:146-154` records that the installer asks the binary for its `--help` and
warns that the **release** is stale (`knowsTheBridge` / `staleBinaryWarning`) when it does not know
a variable the config is about to write.

### 3.6 Tests that exist, and the one that does not

- `brokerWorld.ts:118-144` starts the real broker under the `vscode` stub and **records every modal
  text** into `w.dialogs` (`:131`). `credsAgentServer.test.ts` and `brokerMcpRoutes.test.ts` both
  drive it.
- Existing assertions on the modal are on its **tail** only: `credsAgentServer.test.ts:95-96`
  (`/Allowing covers every later call/`, `/"prod"/`), `brokerMcpRoutes.test.ts:251` and `:353-354`.
  **No test asserts the head of the broker's sentence**, which is why the hardcoded product name
  survived four doors. `agentConsent.test.ts` (65 lines) covers the **SSH agent's** modal, not this
  one.
- `agentAuditLog.test.ts` (95 lines) tests `formatAuditLine` only; the round trip lives in
  `mcpLogRows.test.ts` (`:78` legacy `via`-less line, `:85-86` unparseable lines).
- `scripts/creds-mcp-itest.cjs` drives the **real** binary over real stdio; `speak(env, requests)`
  at `:159-196` already takes an `env` and spawns with `{ ...process.env, CREDS_RELAYED_FROM_WSL:
  '1', ...env }` at `:161`. The broker it drives is a real `CredsAgentServer` (`:279-280`); its
  output channel stub is a no-op (`:43`), so the audit assertion needs a channel that records.
- The `vscode`-stub helper and its trap: `src/test/vscodeStub.ts` (159 lines), documented at
  `module_extension.md:3776-3812` — it evicts the **whole** compiled graph from the require cache,
  and that is the point.

---

## 4. Constraints this design must satisfy

| # | constraint | source |
|---|---|---|
| C1 | The window must treat the caller record as **untrusted input rendered into a security dialog**. | `security.md`; `architecture.md:49-84` |
| C2 | A protective measure must not be "applied at some of its sites" — make omission a **compile error**. | `security.md` §*A measure applied at SOME of its sites* |
| C3 | Old audit lines must still parse; the round trip stays the contract. | `agentAuditLog.ts:75-85` |
| C4 | `creds-mcp` and `creds` are Native AOT with `JsonSerializerIsReflectionEnabledByDefault=false`. | `CredsMcp.csproj`, `CredsCli.csproj` |
| C5 | Bodies are composed field by field; **no model-supplied blob**. | `UseTools.cs:214-222`, `module_extension.md:3459-3464` |
| C6 | The extension's testable half imports no `vscode`. | `CLAUDE.md` rule 3 |
| C7 | ESLint: ≤800 lines/file, ≤50 code lines/function, cyclomatic ≤4, no new `eslint-disable`. `credsAgentServer.ts` is at **721** lines. | `eslint.config.mjs:29-31` |
| C8 | Contract changes go through the generator, and both contract tests. | `architecture.md:404-425` |
| C9 | Anything that grows names its budget and its owner. | `planning-docs.md` |

---

## 5. Design

### 5.0 The one-sentence rule

> **The caller record is a LABEL. It never reaches a decision.** No switch, no route, no throttle,
> no grant lookup and no permission may read it. It is rendered, capped, stripped, and written to
> the audit line — and that is the whole of its power.

This is why it may be accepted from an unauthenticated body at all. It is stated in the modal to the
person as well, in its own sentence (§5.6), because a label a person mistakes for a check is worse
than no label.

### 5.1 `src_broker_client/src/CallerIdentity.cs` — the shared record (new file, ~120 lines)

Shared by `creds-mcp` and `creds`, in the library both already reference. Shape and ladder follow
the precedent in the sibling repository — `dew_flow_connect_other_ais/src_mcp/src/Server/
CallerSessions.cs:20-46`, `CallerIdentity.From(read)` over
`COAI_CALLER_SESSION → CLAUDE_CODE_SESSION_ID → CODEX_SESSION_ID → GEMINI_CLI_SESSION_ID`,
first non-blank wins, documented at that repo's `research/module_server.md:849-851`. Reuse the
**shape**, not the file (the two repositories share no code).

```csharp
public sealed record CallerRecord(
    [property: JsonPropertyName("agent")]       string Agent,        // "Claude Code 2.1.268"
    [property: JsonPropertyName("session")]     string Session,      // short id, "98bf9f23"
    [property: JsonPropertyName("sessionName")] string SessionName,  // "clauderag-d6"
    [property: JsonPropertyName("cwd")]         string Cwd);         // basename, "ClaudeRag"
```

Ladder (creds): `CREDS_CALLER_SESSION → CLAUDE_CODE_SESSION_ID → CODEX_SESSION_ID →
GEMINI_CLI_SESSION_ID`; first non-blank wins. **All blank empties ONLY `Session` and `SessionName`**
(plan round, gemini — the first draft said "every field", which would have turned a person's own
`creds` call in a plain terminal into *"An agent"*): `Agent` keeps its constant or `clientInfo` value
and `Cwd` keeps the folder, so the human's own CLI reads *"creds CLI · in ClaudeRag"*. The modal says
*"An agent"* only when the record carries nothing at all — no agent label, no session, no folder.

Built **once at start-up**, from:

1. the ladder, for `Session` (short form: the first 8 characters of the value, or the whole value
   when shorter — the id is a label, and the full uuid crowds the sentence);
2. `CLAUDE_PID` → `<home>/.claude/sessions/<pid>.json` → `name` for `SessionName`, and the
   **basename** of its `cwd` for `Cwd` (M2) — the file holds the full path (`d:\rsd\ClaudeRag`), and a
   full local path in a modal and an audit line is a leak the label must not carry (plan round, codex);
   both sources are reduced to their last segment by the same function before anything is composed;
3. `Directory.GetCurrentDirectory()`'s basename for `Cwd` when the session file gave none;
4. `Agent`: the MCP `clientInfo` for `creds-mcp` (§5.3), a constant for `creds` (§5.4).

**Why the session file's `cwd` is preferred over the process cwd** — inverting the order in the
task's sketch: M2 shows the registry carries the real working folder of the *session*
(`d:\rsd\ClaudeRag`), while what an MCP client sets as its child's cwd is chosen by the client and
was **not** measured (§9). The process cwd is the fallback, not the source.

**The session-file read is a bounded, failure-tolerant, single-file read.** Every one of these is a
rule, not a nicety:

- **only** `Path.Combine(home, ".claude", "sessions", $"{pid}.json")`. The directory is never
  enumerated and no other extension is ever opened — `.key` files live there (M2).
- `pid` must match `^[0-9]{1,10}$` before it is interpolated; anything else ⇒ no read. (It comes
  from the environment, and a path segment built from environment data is exactly the shape
  `security.md` names as repeatedly mis-sanitised.)
- size cap **64 KB**, checked on the `FileInfo` before opening; larger ⇒ no read.
- parsed with the **AOT source-generated context** (C4), into a record with only the four fields
  wanted. Unknown JSON properties are ignored, matching `McpEntry`'s stated rule
  (`McpJsonContext.cs:39-43`).
- **any** failure — missing file, unreadable, malformed, wrong shape — leaves the fields empty and
  throws nothing. `catch (Exception e) when (e is IOException or UnauthorizedAccessException or
  JsonException)`, in the style the codebase already uses (`WslInterop.cs:98-105`).
- **a stale file is possible and is accepted**: pids are recycled, and M2 shows files older than the
  session that wrote them. A wrong session *name* is a wrong label, not a wrong permission (§5.0);
  the short session id beside it comes from the environment of the live process and is the half that
  cannot be stale.

Every field is then **trimmed, stripped and capped** by one shared function (§5.6's sanitiser is the
real guard; this one is courtesy, so a well-behaved client sends a well-formed label).

### 5.2 The wire: an optional `caller` object

Added to every `creds-mcp` body, the alias bodies and the token-door bodies:

```json
{ "entry": "e-1", "command": "uname -a",
  "caller": { "agent": "Claude Code 2.1.268", "session": "98bf9f23",
              "sessionName": "clauderag-d6", "cwd": "ClaudeRag" } }
```

**`creds` needs no mechanism** — its bodies are already typed records (`CredsJsonContext.cs:60-73`),
so each gains `[property: JsonPropertyName("caller")] CallerRecord? Caller` and the context gains
`[JsonSerializable(typeof(CallerRecord))]`.

**`creds-mcp` needs one**, and this is the one place the task's sketch meets something the code
contradicts: its bodies are `Dictionary<string, string>` (`UseTools.cs:370`, `FolderTools.cs:140`)
serialised through a source-generated context with reflection disabled (C4) — a `Dictionary` of
strings cannot hold a nested object.

- **Chosen:** change those builders to `Dictionary<string, JsonNode>`, with each named field a
  `JsonValue.Create(string)` and the caller a `JsonObject` built from the serialised `CallerRecord`.
  One new `[JsonSerializable(typeof(Dictionary<string, JsonNode>))]` line in `McpJsonContext.cs`;
  `JsonNode` has a built-in, non-reflective converter, and the SDK itself already exposes `JsonNode`
  on its public surface (M6: `OutgoingRequestInterceptor`). **Field-by-field composition is
  untouched** (C5) — no call site gains the ability to add a field a model chose.
- **Fallback, if the AOT publish probe in §8 step 1 shows any trim warning or run-time failure:**
  four flat fields `callerAgent` / `callerSession` / `callerSessionName` / `callerCwd`, still
  `Dictionary<string, string>`. **The window parses BOTH shapes from day one** (plan round, gemini
  and codex independently: a fallback the parser does not know is a fallback that silently turns
  every label into *"An agent"*): `callerFrom(body)` reads `body.caller` when it is an object and
  otherwise the four `caller*` string fields, and the contract's `caller` block declares both — the
  object's field names and the flat prefix — so either sender is served by every window that ships
  this. The sanitiser, the label composer and every test below run on the parsed `CallerLabel` and
  do not care which shape carried it; T5/T6 gain one case per shape. **Step 1 decides which shape
  the senders use, before anything else is written.**

**Measured, step 1 (2026-09-12, this machine):** `[JsonSerializable(typeof(Dictionary<string, JsonNode>))]`
added to `McpJsonContext`, one body with a nested `JsonObject` serialised through it on the `--help`
path for the duration of the probe, then `dotnet publish src_mcp/src/CredsMcp.csproj -c Release -r win-x64`.
Result: **0 IL warnings, 0 warning lines of any kind**, publish exit 0; the published `creds-mcp.exe --help`
exited 0, printed the help, and printed `{"entry":"e-1","caller":{"agent":"probe","session":"98bf9f23"}}` —
the nested object round-tripped through the source-generated context under AOT at run time. **Verdict:
the nested `caller` object is the wire shape**; the flat fields stay a parser-side fallback only. One
incidental finding: the first publish attempt died at the native *link* step because the ILCompiler
targets shell out to `vswhere.exe`, which is not on a Git Bash PATH — adding
`C:\Program Files (x86)\Microsoft Visual Studio\Installer` to `PATH` fixed it (environment, not a
verdict; the managed compile and ILC had already run clean).

**The contract** (`emit-contract.mjs`, object at `:137-171`) gains:

```js
caller: { fields: ['agent', 'session', 'sessionName', 'cwd'], maxFieldChars: 80 },
```

and `BrokerContract.cs` gains a nullable `Caller` with an accessor that degrades to the same
defaults when absent, exactly as `ReadRoute`/`ReadMethod`/`McpUseRoute` do (`BrokerContract.cs:63-93`).
`version` stays **1**: no route moves, no status changes, no verb changes — the same rationale
written at `emit-contract.mjs:142-146` for the 0.91.0 addition.

### 5.3 Where `creds-mcp` gets its agent label

M6 refutes both routes the task named. What 2.2.0 offers is `McpServer.ClientInfo`
(`ModelContextProtocol.Protocol.Implementation`, with `Name`, `Version`, `Title`), populated after
the `initialize` handshake, on the object `Program.cs:163` already holds:

```csharp
await using var server = McpServer.Create(transport, options);
```

The tools are built **before** that object exists (`Program.cs:149-160`), so the route is a tiny
mutable holder the tool delegates close over, filled after `Create` and read **lazily on each call**:

```csharp
var caller = new CallerSource(CallerIdentity.Current());     // env + session file, once
options.ToolCollection.Add(UseTool(contract, tool, caller)); // delegates capture the holder
await using var server = McpServer.Create(transport, options);
caller.Bind(server);                     // Agent := $"{ClientInfo.Name} {ClientInfo.Version}"
await server.RunAsync();
```

Lazily, because `ClientInfo` is null until `initialize` has been answered. `Name` and `Version` are
trimmed/capped like every other field; a client that sends neither ⇒ empty `Agent` ⇒ the window says
*"An agent"*. **No delegate signature changes**, so no tool's JSON schema changes and
`contract/mcp-tools-v1.json` (`module_extension.md:3497-3504`) does not move — which the
`npm run contract:mcp -- --check` step will confirm.

### 5.4 Where `creds` gets its agent label

A constant: **`creds CLI`**. Not `creds CLI <version>` — M7 shows the binary is not version-stamped
at publish and the CLI has no `--version` at all, so any version it printed would read `1.0.0` on
every release, which is worse than none. Stamping the two binaries (`-p:Version="${GITHUB_REF_NAME#cli-v}"`
in `release.yml:310` and `:461`, as the server already does at `:159`) is a small, separable change
**listed in §10 as a prerequisite if the owner wants the version in the label**; this plan does not
depend on it.

`creds` reaches the window only through `/v1/alias/*` with no token (`BrokerClient.cs:112-119`,
`Program.cs:169-179`), and a shell Claude Code spawned inherits `CLAUDE_CODE_SESSION_ID` (M1) — so a
`creds` call from an agent's terminal gets a session label for free, and one from a human's terminal
gets *"creds CLI · in ClaudeRag"*.

### 5.5 WSL: the record is computed on the Linux side and forwarded as an **argument**

M4 fixes *where*: the Linux half. M5 fixes *how not*: not an environment variable — this repository
has measured that they do not cross, and the one line that assumes they do (`WslInterop.cs:138`) is
probably already a no-op.

So `ServeAsync` (`Program.cs:88-93`) computes `CallerIdentity.Current()` **before** it branches, and
`RelayAsync` → `WslPump.RunAsync(record)` passes it to `StartPiped` (today `StartPiped([])`,
`WslPump.cs:48`) as:

```
creds-mcp.exe --caller <base64url of the CallerRecord JSON>
```

base64url because it crosses a Windows command line: no quoting question, no encoding question, no
character an argument parser can reinterpret. The Windows half decodes it, caps every field again
(§5.6 applies on the window side regardless), and **does not recompute the session, its name or the
folder** — recomputation there would attach *a different person's* session name (M4).
`Program.Classify` (`Program.cs:54-57`) learns `--caller <value>` and keeps refusing everything else;
the shared decode lives in `CallerIdentity`.

**One field IS filled on the Windows side, and only that one: `Agent`** (plan round, gemini — the
first draft forgot that under the relay the Linux half never instantiates `McpServer`, so it has no
`clientInfo` and would forward an empty agent label). The `initialize` handshake is answered by the
Windows half — that is the process whose `McpServer.ClientInfo` (§5.3) knows the client — so the
holder's `Bind(server)` there sets `Agent` from `ClientInfo` exactly as it does without the relay,
while `Session`, `SessionName` and `Cwd` stay what the Linux half forwarded. The rule, stated for
the code comment: *the side that spoke to the client names the client; the side that spoke to the
environment names the session.* T12 asserts the merge: a forwarded record with an empty `Agent`
plus a bound `ClientInfo` yields the client's name and the forwarded session, and a forwarded
non-empty `Agent` is NOT overwritten.

**The compatibility problem, named rather than hoped away.** An *old* `creds-mcp.exe` given
`--caller` returns `Startup.Usage` and exits 96 immediately (`Program.cs:71-73`) — the bridge would
be dead, not degraded, and the person would see the MCP server fail to start. The halves ship from
one tag, and `PLAN_mcp_wsl_bridge.md:146-154` records that the installer already warns about a stale
*release* — but that is an install-time check on a binary the button put there, and this is a
run-time launch of whatever is actually on disk.

**So the Linux half probes once per session**, reusing that same precedent: run
`creds-mcp.exe --help` (AOT start-up is single-digit milliseconds, `WslInterop.cs:22-23`), and pass
`--caller` only if the help text names it. One extra process launch per MCP session, never per call,
no race with the pump, and the degradation when the Windows half is old is *"An agent"* rather than a
dead server. The help text therefore gains a line naming `--caller` — which is both the
documentation and the probe's signal, exactly as `knowsTheBridge` chose its signal.

**The probe is a hermetic child** (plan round, gemini and codex independently): the relay's OWN stdio
is the live JSON-RPC channel, so the probe's `StandardOutput` and `StandardError` are redirected into
private buffers and never touch the pipe; it runs under a bounded timeout (3 s — two orders of
magnitude above the measured AOT start-up), is killed and disposed on expiry; and every failure —
a missing binary, a non-zero exit, a timeout, an exception, help text without the flag — is read as
*unsupported* and starts the Windows half WITHOUT `--caller`. The probe can therefore delay the
server by at most three seconds once per session and can never stop it from starting. T12 covers the
timeout and the launch-failure branches with a fake launcher.

### 5.6 The window: parse, sanitise, render, record

**One parse site, and the compiler enforces it.** `brokerRequests.ts` (`vscode`-free, C6) gains:

```ts
export interface CallerLabel { agent: string; session: string; sessionName: string; cwd: string; }
export function callerFrom(body: Record<string, unknown>): CallerLabel | undefined
```

`callerFrom` is called in exactly one place per door — and rather than trusting a sweep (C2), the
signature of `consent` becomes **required**:

```ts
consent(grant: Grant, action: string, verb: string, summary: string, caller: CallerLabel | undefined)
```

TypeScript then turns all four sites (`credsAgentServer.ts:480`, `brokerMcpDoor.ts:156`, `:291`,
`brokerFolderDoor.ts:171`) plus the `BrokerDoor.consent` hook (`brokerMcpDoor.ts:44`, wired at
`credsAgentServer.ts:263`) into compile errors until each supplies one. A fifth door added next year
cannot forget it. `perform()` (`credsAgentServer.ts:461`) gains the same required parameter and
passes it to `consent` and to the audit entries it builds; the token door computes it at
`credsAgentServer.ts:443-449`, where the body is already parsed.

**The sanitiser is the security boundary, and it lives on the window side.** The client-side cap in
§5.1 is courtesy; this one is the guard, because any local process can POST an alias or MCP body
with any `caller` it likes:

| rule | why |
|---|---|
| each field must be a `string`, else dropped | `parseJsonObject` yields `unknown`; an object or array must not reach a template literal |
| strip all Unicode control/format characters, `\n`, `\r`, `\t` | a newline lets a caller **forge the modal**: the sentence is built with `\n\n` separators at `credsAgentServer.ts:587-590`, so an unstripped label could append its own *"Allowing covers…"* paragraph, or a fake *"(verified)"* line |
| strip `→` (U+2192) | it is the audit line's field separator (`agentAuditLog.ts:71`) |
| collapse whitespace runs to one space, then trim | one call is one line (`agentAuditLog.ts:62-66` already does this for `detail`) |
| cap each field at **80** characters (the contract's `maxFieldChars`), and the composed label at 160 | a 64 KB body (`MAX_REQUEST_BODY_BYTES`) must not become a 64 KB modal or a 64 KB audit line |
| all four fields empty ⇒ `undefined` | so the modal falls back deliberately rather than rendering `" ·  · "` |

**The modal** (`credsAgentServer.ts:586-590`) becomes:

```
<callerLine> wants to <verb> "<entityName>" using its stored credential.

<summary>

Identity as reported by the caller — a label, not a check.

Allowing covers every later call on this token, not just this one: … 
Each call is logged in the "CredsForDevs: Agent Access" output panel.
```

where `callerLine` is `Claude Code 2.1.268 · session clauderag-d6 (98bf9f23) · in ClaudeRag`, each
segment omitted when its field is empty, and **`An agent` when there is no caller at all — never
"Claude Code" by default**. That last clause is the whole fix: the default must not name a product.

Composing `callerLine` is a pure function in a `vscode`-free module (C6) — put it beside
`callerFrom` in `brokerRequests.ts` — so the sentence is unit-testable without the stub, and the
`ask()` function does not grow past its 50-line ceiling (C7; `credsAgentServer.ts:568` already
carries a `max-lines-per-function` disable, and **no new disable may be added**). The
`useActions.ts:29-36` doc-comment is updated in the same commit: the verb now completes
*"`<caller>` wants to …"*.

**The audit line.** `AuditEntry` gains an **optional** `caller?: string` (optional, not required,
because the share mint at `credsAgentServer.ts:163-170` is a human clicking a menu item and has no
caller — an asymmetry with `consent` that is deliberate and worth the comment). `formatAuditLine`
inserts ` by <label>` after the `via` segment and before ` → `:

```
[09:05:03Z] #3 exec prod-db (A1b2C3…) via mcp by Claude Code 2.1.268 · session clauderag-d6 (98bf9f23) · in ClaudeRag → exit 0  uname -a
```

and `LINE` gains one optional group `(?: by ([^→]*?))?` in the same position. Old lines parse
unchanged because the group is optional (C3). The label's own parentheses are safe: the
`(.*?) \(([^)]*)\)` pair earlier in the pattern backtracks, which the existing
`mcpLogRows.test.ts:62` case (`prod (eu-west) db`) already proves — and the new round-trip test
pins it for the caller too.

### 5.7 What is deliberately NOT done

- **`Grant` does not gain a `caller`.** Two of the three mint sites could carry one, but the share
  mint (`credsAgentServer.ts:163`) happens when a human clicks *Share with Claude Code…*, with no
  caller in existence — and its grant is the long-lived one, reused by every later token call, each
  of which has its own caller. A field that is permanently empty for one door and stale for another
  is worse than no field. The caller travels **per call**.
- **No header.** `brokerOrigin.ts:161-187` is the door's guard and reads four headers; adding a
  fifth would put caller data on a path whose job is admission. The body is where per-call data
  already lives.
- **The caller never keys anything** — no per-caller throttle, no per-caller memory (the sibling
  repository's `CallerSessions` keys a *decision* by caller; this one must not, §5.0).

---

## 6. Security review of this change (`security.md`)

| question | answer |
|---|---|
| Does the trust boundary move? | **No.** `architecture.md:68-73` row 4 is unchanged: the agent still holds a capability, still sees no plaintext, still needs a human's click. |
| Can a caller gain anything by lying? | It can make the modal say a false name. It cannot change which entity, which action, which switch, which throttle or which grant — §5.0, enforced by the fact that no reader of `CallerLabel` exists outside the modal string and the audit entry. |
| Can a caller **forge** the modal? | This is the real risk and the reason for the sanitiser: newlines, control characters and an uncapped length would let a label append a paragraph to a security dialog. Stripped and capped on the window side (§5.6), asserted by a RED test (§8, T5). |
| Can a caller break the audit? | Only by putting `→` or a newline in the label; both stripped, and the round trip is asserted for a hostile label (§8, T8). |
| Does it read anything secret? | It reads `~/.claude/sessions/<pid>.json` only. **`.key` files live in that directory** (M2) — the path is composed from a digits-only pid, the directory is never enumerated, and no other extension is ever opened (§5.1). |
| New attack surface on the wire? | One optional object on bodies the window already accepts; unknown fields are already ignored (`brokerRequests.ts:50-52`, and the action validators read only what they need, e.g. `sshUseActions.ts:152-159`), so the *addition* is not a behaviour change for old windows. |
| Secrets in logs? | The label carries a session **name** and short id, a product name and a folder basename. No token, no path, no secret. `agentAuditLog.test.ts:61-69`'s guarantee is untouched. |
| Does the label ever reach a shell or a file path? | **No.** It is rendered into a modal string and an audit line only. |

## 7. Growth budget (`planning-docs.md`, C9)

Nothing new is created, stored, spawned or accumulated. The only growth is on an existing surface:

- **Audit lines grow by at most ~170 bytes** (4 fields × 80 chars capped, plus the composed cap of
  160 and the literal `" by "`). At the observed volume — one line per agent call — a busy day of a
  few thousand calls adds well under a megabyte.
- **Owner/retirement: unchanged.** The existing sweep retires audit files after
  `AUDIT_RETAIN_DAYS = 14` (`agentAuditFile.ts:84`).
- **No new file, table, directory, cache or process** — except the one extra `creds-mcp.exe --help`
  launch per WSL MCP **session** (§5.5), which exits immediately and is not retained.

## 8. Build order

Each step is buildable and testable on its own; the tests named in §9 are written **before** the step
they cover.

0. **Read the room.** `research/architecture.md` §The trust boundary, `module_extension.md` §The
   agent broker and §Testing a `vscode`-bound module; run the suites once to get a green baseline
   (`cd src_vs_code && npm ci && npm run typecheck && npm test`; the C# test executables per
   `CLAUDE.md`).
1. **Decide the wire shape by measurement (§5.2).** In a scratch branch, add
   `Dictionary<string, JsonNode>` to `McpJsonContext`, serialise one body with a nested object,
   `dotnet publish src_mcp/src/CredsMcp.csproj -c Release -r win-x64` and run the published binary
   through the `--help` smoke (`release.yml:466-469`). **Zero trim warnings + a working binary ⇒
   nested object. Anything else ⇒ the four flat fields.** Record the result in this plan before
   step 2. *(Precedent: the SDK's own AOT affordability was measured, not assumed —
   `Directory.Packages.props`, 2026-08-27.)*
2. **`src_broker_client`: `CallerIdentity.cs` + `CallerRecord`** (§5.1), with the session-file
   reader taking an **injected** `Func<string, string?>` for the environment and an injected file
   reader, so every branch is a unit test with no filesystem. `BrokerJsonContext` gains
   `CallerRecord`. → `CallerIdentityTests`.
3. **Contract**: `emit-contract.mjs` gains the `caller` block; `npm run contract`;
   `BrokerContract.cs` gains `Caller` + a degrading accessor. → both contract tests updated.
4. **`creds-mcp` sends it**: the holder + `Bind(server)` in `Program.cs:138-165`, the body builders
   in `UseTools.cs:368-376`, `:320-327` and `FolderTools.cs:140-152`. → `UseToolsTests` (exists),
   `FolderToolsTests` (**new file** — `src_mcp/tests/` today holds only `AnswerTests`,
   `StartupTests`, `ToolsTests`, `UseToolsTests`, `WindowsTests`, `WslPumpTests`, so the folder
   bodies have no unit test at all and this change backfills one, per `testing.md` §*Editing a file
   with no tests → backfill*). Run `npm run contract:mcp -- --check` to prove no tool schema moved.
5. **`creds` sends it**: the request records (`CredsJsonContext.cs:60-73`) + `AliasBody`
   (`Program.cs:215-221`). → `CliContractTests` extended.
6. **The window parses and renders it**: `callerFrom` + the label composer in `brokerRequests.ts`;
   the **required** `caller` parameter on `consent`/`perform` and the `BrokerDoor.consent` hook; the
   new modal sentence at `credsAgentServer.ts:586-590`; `useActions.ts:29-36`'s comment. →
   `brokerRequests.test.ts`, the new `brokerConsentText.test.ts`.
7. **The audit line**: `AuditEntry.caller?`, `formatAuditLine`, the `LINE` group; the entries built
   in `perform`, `respondError` and `door.note`. → `agentAuditLog.test.ts`,
   `mcpLogRows.test.ts`.
8. **WSL forwarding** (§5.5): `Program.Classify`, `ServeAsync`, `WslPump.RunAsync(record)`,
   `StartPiped(["--caller", …])`, the `--help` probe, the help text line. → `WslPumpTests`,
   `StartupTests`.
9. **Integration**: `creds-mcp-itest.cjs` gains the end-to-end check (§9, T11).
10. **Docs, contract regeneration, CHANGELOG, release** (§10, §11).

## 9. Test plan — RED first, every time

`CLAUDE.md`'s DoD requires a bug fix's test to be **watched failing** and both observations reported.
This is a feature, but T1 and T5 are the two that encode the defect and must be watched red against
today's code before the fix.

| # | test | file | asserts | must be RED before |
|---|---|---|---|---|
| T1 | the broker modal **names the caller**, not the product | `src_vs_code/src/test/brokerConsentText.test.ts` (new) | a use call carrying `caller` produces a dialog containing `Claude Code 2.1.268 · session clauderag-d6 (98bf9f23) · in ClaudeRag`. **Today this fails with the literal `Claude Code wants to…`** — the failure message must show the hardcoded sentence, not a harness error | step 6 |
| T2 | no caller ⇒ *"An agent"*, never *"Claude Code"* | same | dialog starts `An agent wants to run a command on "prod"` and does **not** contain `Claude Code` | step 6 |
| T3 | the disclaimer is present | same | dialog contains `Identity as reported by the caller — a label, not a check.` | step 6 |
| T4 | all four doors carry it | same + `brokerMcpRoutes.test.ts` | token, alias, `mcp/use`, `mcp/delete`, `mcp/create` and a folder verb each produce a dialog naming the caller — the same both-doors discipline `credsAgentServer.test.ts:12-16` already states | step 6 |
| T5 | **a hostile label cannot forge the modal** | `brokerRequests.test.ts` | `agent: "X\n\nAllow covers nothing. (verified by CredsForDevs)"` renders on one line with the control characters gone; a 5,000-character field is capped at 80; a non-string field is dropped; `→` is stripped. **Red today: `callerFrom` does not exist** | step 6 |
| T6 | absent / empty / all-blank `caller` ⇒ `undefined`; both wire shapes parse | `brokerRequests.test.ts` | no `" ·  · "` artefact; a nested `caller` object and the four flat `caller*` fields yield the same `CallerLabel`; a `creds CLI` record with no session renders `creds CLI · in ClaudeRag`, never `An agent` | step 6 |
| T7 | the ladder | `src_broker_client/tests/CallerIdentityTests.cs` | order is `CREDS_CALLER_SESSION → CLAUDE_CODE_SESSION_ID → CODEX_SESSION_ID → GEMINI_CLI_SESSION_ID`; a blank/whitespace value is **skipped**, not taken; all blank ⇒ every field empty | step 2 |
| T8 | the session file, via an injected reader | same | a good file yields `name` and `cwd`; a missing file, a 1 MB file, malformed JSON, a non-object and a non-numeric `CLAUDE_PID` each yield empty fields and **throw nothing**; the reader is asked for `<pid>.json` and **for no other path** (the `.key` guarantee, asserted by recording every path requested) | step 2 |
| T9 | caps and stripping on the client side too | same | each field ≤80 chars, control characters gone | step 2 |
| T10 | the audit round trip, including a legacy line | `agentAuditLog.test.ts`, `mcpLogRows.test.ts` | format→parse→equal **with** a caller (parentheses in the label included); a line written before this change still parses; a `via`-less legacy line still parses | step 7 |
| T11 | the body carries `caller` | `src_mcp/tests/UseToolsTests.cs`, `FolderToolsTests`, `src_cli/tests/CliContractTests.cs` | the serialised body contains the caller in the shape step 1 chose, and still contains **only** the named fields — the no-blob guarantee (C5) | steps 4–5 |
| T12 | WSL forwarding | `src_mcp/tests/WslPumpTests.cs`, `StartupTests.cs` | `Classify(["--caller", "<b64>"])` is `Serve`; `Classify(["--nonsense"])` is still `Usage`; a malformed base64 payload yields an empty record rather than a throw; the argument list handed to `StartPiped` carries the encoded record | step 8 |
| T13 | contract parity, both sides | `brokerContract.test.ts`, `BrokerContractTests.cs` | the `caller` block matches the code on each side, and the embedded copy is byte-for-byte the repository file | step 3 |
| T14 | **integration, the real binary** | `src_vs_code/scripts/creds-mcp-itest.cjs` | `speak({ CLAUDE_CODE_SESSION_ID: '<uuid>' }, …)` (the helper at `:159-196` already takes an env) drives a real `creds_run` through a real `initialize` whose `clientInfo` the script sends as `{ name: 'creds-itest', version: '9.9' }`; the recording output channel — the stub at `:43` must be changed to capture lines — shows the audit line carrying **`creds-itest 9.9`** AND the short session id, so the `clientInfo` route is proven end to end, not assumed from M6 (plan round, codex). Separately, once, by hand: capture what the real Claude Code sends as `clientInfo.name`/`version` (the audit line of one real call) and record it in `module_extension.md`; if it is not a readable product name, add the explicit mapping there and a test for it | step 9 |
| T15 | the Windows half merges its own client name into a forwarded record | `src_mcp/tests/WslPumpTests.cs` / `StartupTests.cs` | a decoded `--caller` record with empty `Agent` + `Bind(server)` with `ClientInfo { Name: 'Claude Code', Version: '2.1.268' }` yields `Agent = 'Claude Code 2.1.268'` and the forwarded `Session`/`SessionName`/`Cwd` unchanged; a forwarded non-empty `Agent` is not overwritten | step 8 |
| T16 | the probe cannot break the server | same | with a fake launcher: a probe that times out, throws, exits non-zero, or prints help without `--caller` ⇒ `StartPiped` is called WITHOUT `--caller` and the server still starts; a probe that names the flag ⇒ `--caller` is passed; the probe's stdout is never the relay's stdout | step 8 |

Commands (`CLAUDE.md`, `testing.md` — **never `dotnet test`**):

```bash
cd src_vs_code && npm run typecheck && npm test
dotnet build dew_flow_creds_for_devs.slnx -c Debug      # 0 warnings; warnings are errors
./src_broker_client/tests/bin/Debug/net10.0/CredsBroker.Tests.exe
./src_mcp/tests/bin/Debug/net10.0/CredsMcp.Tests.exe
./src_cli/tests/bin/Debug/net10.0/CredsCli.Tests.exe
cd src_vs_code && node scripts/creds-mcp-itest.cjs      # needs the Debug binary built
```

## 10. Documentation (Knowledge Base Sync DoD)

- `research/module_extension.md` §The agent broker (from `:2501`) — the consent paragraph at
  `:2565-2569` names the caller line, the disclaimer, and the *"An agent"* default; the HTTP-contract
  table at `:2549-2553` gains the optional `caller`.
- `research/module_extension.md` §The MCP surface (from `:3448`) — where the record comes from, why
  `clientInfo` and not a delegate parameter (M6), and why the Windows half does not recompute (M4).
- `research/architecture.md` §The MCP server inside WSL (`:376-402`) — one line on the `--caller`
  argument and the `--help` probe; §Where the contract lives (`:404-425`) — the new block.
- `README.md` — the consent paragraph, so the published description matches the dialog.
- `src_vs_code/CHANGELOG.md` — the extension entry. **There is no CHANGELOG for `creds` or
  `creds-mcp`** (only `src_vs_code/CHANGELOG.md` exists; `src_cli/README.md` documents the CLI and
  `src_mcp` has no README): their release notes are produced by `.github/workflows/release.yml`, so
  the binaries' change is recorded in the release body and in `src_cli/README.md`.
- `contract/broker-v1.json` regenerated by `npm run contract` (never hand-edited —
  `emit-contract.mjs:1-13`).
- **Promotion**: when this ships, `/promote-plan` moves it to `research/` with
  `Status: IMPLEMENTED <date>`, its deviations, and the §12 tail as a fresh `todo/` plan if anything
  is left. `node .claude/rules/shared/tools/plan-lifecycle.mjs` is CI's check.

## 11. Release — three artefacts, independent clocks

`mcp-v0.6.0`, `cli-v0.1.6`, `extension-v1.7.0` (latest tags today: `mcp-v0.5.1`, `cli-v0.1.5`,
`extension-v1.6.0`). Per `CLAUDE.md`, each ships by pushing its own tag; nothing ships on merge.

**The halves are independent, and both directions degrade cleanly:**

| combination | behaviour | why it is safe |
|---|---|---|
| **old `creds`/`creds-mcp` → new window** | no `caller` in the body ⇒ modal says *"An agent"* | T2 is exactly this case |
| **new `creds`/`creds-mcp` → old window** | `caller` ignored | **verified**: `readNamedBody` requires one named field and ignores the rest (`brokerRequests.ts:44-52`), and the action validators read only their own field (`sshUseActions.ts:152-159`). An unknown body field has never been refused |
| **new Linux half → old Windows half (WSL)** | the `--help` probe does not see `--caller`, so it is not passed ⇒ *"An agent"* | §5.5. **Without the probe this combination is a dead server, not a degradation** — that is why the probe is in scope, not a hardening extra |

## 12. What could not be verified

Stated as *what was checked*, per `planning-docs.md`'s rule on negative results.

1. **Where the VS Code TAB title lives** (the AI-written summary such as *"PR triage reviewer…"*).
   **Checked:** the process environment of a live session (M1 — no such variable), and
   `~/.claude/sessions/<pid>.json`, whose `name` is `clauderag-d6` with `"nameSource":"derived"`.
   **NOT checked:** VS Code's own workspace storage, the extension host's state, and any Claude Code
   IPC surface (`messagingSocketPath` is in the session file and was not opened). The plan therefore
   promises the registry's `name`, and the short session id when there is none. If the tab title is
   wanted later it is an additive field, not a redesign.
2. **`Directory.GetCurrentDirectory()` inside a `creds-mcp` started by an MCP client.** Not
   measured. This is why §5.1 prefers the session file's `cwd` and treats the process cwd as the
   fallback.
3. **`~/.claude/sessions/` on Linux.** M2 was measured on Windows only. The Linux half of the WSL
   bridge is where the record is computed (§5.5), so the layout there matters and should be checked
   in step 2 before the reader is written. Same for Codex and Gemini: only the *environment
   variable* half of their ladder is designed for; neither has a session-registry equivalent
   verified here, so both will produce agent + short session id and no session name.
4. **Whether `ProcessStartInfo.Environment` + `WSLENV` would carry the record across the bridge.**
   Not measured. M5 says plain environment variables do not cross, and `WslInterop.cs:138` assumes
   they do; whether naming a variable in `WSLENV` *within the child's own environment block* works
   was not tested. The argument route (§5.5) was chosen so this question need not be answered.
5. **Whether `Dictionary<string, JsonNode>` publishes clean under `PublishAot` +
   `JsonSerializerIsReflectionEnabledByDefault=false`.** Reasoned, not measured — the ModelContextProtocol
   SDK exposes `JsonNode` publicly (M6) and `JsonNode` has a non-reflective converter, but this
   repository's own standard is to measure it. **Build-order step 1 is that measurement**, and the
   flat-field fallback is fully specified so a negative result costs no redesign.
6. **The SDK's parameter-binding rules for tool delegates in 2.2.0.** The assembly metadata was
   read (M6) but the binder's IL was not, and the SDK's source and docs were not reachable offline.
   The design (§5.3) avoids the question entirely by changing no delegate signature.
7. **The eight-character short session id is an assumption about collision risk**, not a
   measurement. Nine live sessions were observed; `98bf9f23` was unique among them. It is a label
   (§5.0), so a collision misleads rather than authorises.

## 13. Definition of Done

- [ ] The modal names the caller, and says *"An agent"* — never *"Claude Code"* — when none is
      reported. T1 was **watched failing** against today's `credsAgentServer.ts:586` and the failure
      message showed the hardcoded sentence; both observations are in the summary.
- [ ] The disclaimer sentence is in the modal, and the caller is read by nothing but the modal
      string and the audit entry (§5.0) — grep-verified.
- [ ] `consent` takes the caller as a **required** parameter, so all four call sites (and any fifth)
      are a compile error until they supply one.
- [ ] The sanitiser is on the **window** side, in a `vscode`-free module, with the hostile-label test
      (T5) watched red first.
- [ ] The audit line carries the caller; the round trip holds; a pre-change line still parses.
- [ ] Only `<pid>.json` is ever opened under `~/.claude/sessions/`, asserted by a test that records
      every path requested.
- [ ] `contract/broker-v1.json` regenerated by the generator; both contract tests green; wire
      `version` still 1.
- [ ] `npm run contract:mcp -- --check` shows no tool-schema drift.
- [ ] WSL: the record is computed on the Linux side, forwarded as `--caller`, not recomputed on
      Windows; the `--help` probe makes an old Windows half degrade instead of dying.
- [ ] `dotnet build dew_flow_creds_for_devs.slnx` — **0 warnings**; `npm test` and every test
      executable green; `node scripts/creds-mcp-itest.cjs` green.
- [ ] No new `eslint-disable`; `credsAgentServer.ts` still under 800 lines
      (721 today — the label composer goes into `brokerRequests.ts`, not here).
- [ ] `research/module_extension.md`, `research/architecture.md`, `README.md` and the extension
      CHANGELOG updated; Mermaid diagrams re-checked.
- [ ] `node .claude/rules/shared/tools/plan-lifecycle.mjs` and
      `node .claude/rules/shared/tools/pin-check.mjs` pass.
- [ ] The `coai` gate: a `review_plan` round reached `proceed` **before** implementation, a
      `review_code` round ran on the finished branch, every finding resolved with `accept` or a
      reasoned `reject`, and the summary reports the verdicts **and** how many reviewers answered.
- [ ] `mcp-v0.6.0`, `cli-v0.1.6` and `extension-v1.7.0` tagged; the release bodies say which half
      does what when the other is old (§11).
