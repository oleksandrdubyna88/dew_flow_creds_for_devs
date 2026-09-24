# PLAN — the consent modal names Codex threads and WSL-bridged Claude Code tabs too

> Status: **plan only, nothing implemented yet, 2026-09-24.** Scope: `src_mcp/src` (tool delegates,
> `CallerSource`, the WSL relay), `src_broker_client/src` (`CallerIdentity`, `SessionTitle`). The tail
> extracted from [PLAN_consent_shows_the_tab_title.md](../research/PLAN_consent_shows_the_tab_title.md)
> (§9), which closed issue #136 for Claude Code on Windows and Linux.

## 1. The goal

After #136 a Claude Code session is named in the consent modal by the title on its tab. Four callers
still are not, and each gap was measured or reasoned, not assumed:

| # | caller | what the modal says today | what is known |
|---|---|---|---|
| 1 | `creds-mcp` under **Codex** | `codex-mcp-client 0.156.1` and no session at all | measured 2026-09-24 (`codex-cli` 0.156.1): the MCP server's environment is a 20-variable allowlist with no `CODEX_*`; the thread id arrives per call in `tools/call` params `_meta` (`threadId`, `sessionId`, `x-codex-turn-metadata.thread_id`); a named thread's name is `thread_name` in `~/.codex/session_index.jsonl` (`{id, thread_name, updated_at}`), and `exec` threads have no entry |
| 2 | Claude Code through the **WSL bridge** | no title (the Linux half computes the record once at start) | by design in #136, D6 — a stale title is worse than none |
| 3 | a transcript whose only title lies in its **first** 64 KB | no title | the tab's reader also reads the head; #136 read only the tail. Not measured how often this happens (over 150 sessions the last title line was always within the last 33 KB) |
| 4 | `creds` run by **Codex inside a Claude Code terminal** | Claude Code's session id and registry name (pre-existing) | measured 2026-09-24: that shell carries both agents' variables and the ladder answers Claude Code's. #136 kept the title out of it; the id and name are an owner's question |

Gemini is out of scope until a Gemini CLI that authenticates is available to measure against: 0.57.0
refused (`IneligibleTierError`), and a live Gemini session has no name on disk per its source.

## 2. What must be measured first

1. **The SDK's binding of `RequestContext<CallToolRequestParams>`** in the pinned
   ModelContextProtocol 2.2.0 — whether a tool delegate can take it without the parameter appearing
   in the tool's input schema. The founding plan (its §12 item 6) avoided exactly this question.
2. **`_meta` under Claude Code** — does it carry anything session-shaped too? If so, the per-call
   route could replace `CLAUDE_CODE_SESSION_ID` for the MCP server.
3. **The folder-name hash** Claude Code appends past 200 characters — its prefix length and hash — if
   item 3 of §1 is to include long paths.

## 3. Sketch

- Codex: a per-call caller source that reads `_meta.threadId` (validated like a session id), shows
  its first eight characters, and a `thread_name` from the LAST matching line of
  `session_index.jsonl`, read from the end with a byte cap.
- WSL: the Linux half answers a per-call title request over the relay, or the Windows half reads the
  title through `\\wsl$` — both need a design round; the second crosses a filesystem boundary.
- Item 4: apply #136's "another agent's marker" rule to the registry read as well, if the owner
  agrees.

## 4. Build order, test plan, DoD

To be written after §2's measurements, which decide whether this is one story or three. DoD at
minimum: every new source is read per call, validated as a path segment where it becomes one, never
reaches the audit line if it summarises a conversation, and has a break-it test; the Codex route has
an end-to-end check against a real `codex exec` recorded beside the code.
