# PLAN — "Share with Claude Code": an agent broker that uses SSH credentials without revealing them

> Status: **IMPLEMENTED, 2026-08-24.** *Share with Claude Code…* ships on every `:ssh` entity: a
> loopback broker inside the extension host, a plain-`node` CLI an agent drives, exec and terminal
> capabilities, first-use consent and an audit channel. 298 unit tests and a 24-check integration
> script pass. The tail is one thing no test here can reach — a real password prompt over askpass,
> which needs a live SSH server; first real use is its proof.
>
> Deviations are in *What shipped differently* below. The largest: `BatchMode=yes` is conditional,
> because the claim that forced askpass overrides it did not survive checking; and two defects — a
> decrypted key left on disk, a key deleted under a concurrent exec — were found in review and fixed
> after being watched failing.
>
> Related docs: [module_extension.md](module_extension.md),
> [architecture.md](architecture.md),
> [SECURITY_REVIEW_2026-08-23.md](SECURITY_REVIEW_2026-08-23.md).

## The symptom

A developer working with an AI coding agent (Claude Code) has an SSH host whose password lives in
this vault. Today the only ways to let the agent reach that host are typing the password into the
agent's chat or exporting it to a file — both hand the plaintext to the agent, its transcript, and
whatever logs the session. The vault already knows how to use a password without showing it
(`SSH_ASKPASS` in a dedicated terminal, `src/extension.ts:1719-1795`); nothing lets an *agent*
trigger that use.

## The feature (decisions fixed with the operator, 2026-08-24)

A context-menu action **Share with Claude Code…** on an SSH entity:

1. Mints a **grant token** — random, one entity per token, **in-memory only**: it dies with the
   VS Code window. Token shape `<port>.<secret>`: the broker's loopback port rides inside the
   token, so no discovery file and no wrong-window ambiguity exist at all.
2. Copies a **paste-ready snippet** (instructions + token + exact CLI command shapes) to the
   clipboard. The user pastes it into the agent chat; the agent uses it through its Bash tool —
   zero agent-side configuration.
3. The agent can **exec** (non-interactive remote command; stdout/stderr/exit code come back) and
   **terminal** (opens the interactive SSH terminal in VS Code for the human).
4. **The agent never receives the plaintext.** The broker has no endpoint that returns a secret —
   structurally: no response type carries one. `ssh` is spawned by the *extension host*, password
   in that child's env via the existing askpass machinery.
5. **First use of a token → modal Allow/Deny** (showing the exact command); afterwards silent, but
   every call is logged to a visible OutputChannel. Consent timeout reverts the grant so a missed
   notification is not a permanent lock-out. Agent calls do NOT count as user activity for
   auto-lock; the human's Allow click does.

Chosen architecture: the "clean" blueprint — a per-kind **use-action registry** is the seam that
lets `db`/`vpn`/env kinds and an MCP wrapper plug in later without touching the broker.

## Design

### Pure modules (no `vscode` import; node:test suites)

| File | Responsibility |
|---|---|
| `src/grantToken.ts` | secret minting, `<port>.<secret>` format/parse, log-safe prefix |
| `src/grantRegistry.ts` | grant state machine: minted → pending → allowed/denied, timeout revert |
| `src/useActions.ts` | `(kind, action) → {validate, describe, run}` registry; duplicate registration throws |
| `src/sshExecCommand.ts` | argv-array builder (`-o BatchMode=yes` etc.) + remote-command validation |
| `src/brokerProtocol.ts` | request parsing, error-code→HTTP-status table, response shapes, route parsing |
| `src/agentAuditLog.ts` | one audit line per call; never more of the secret than the prefix |
| `src/agentShareSnippet.ts` | the clipboard text |
| `src/agentCliArgs.ts` | CLI argv parsing (`ssh <token> -- …` / `terminal <token>`) |

### Adapters

| File | Responsibility |
|---|---|
| `src/loopbackServer.ts` | `listen(0, '127.0.0.1')` extracted from `googleAuthProvider.ts:337-346`; `webauthnPrf.ts` `listen()` folds in too (third call site) |
| `src/sshCredential.ts` | credential resolution (key-entity ref → stored key → key path → password) extracted from `connectEntity` — shared by the human and agent paths |
| `src/sshConnect.ts` | `connectEntity` moved out of `extension.ts`, rewired onto `sshCredential.ts` |
| `src/sshExecRunner.ts` | `spawn('ssh', argv)` with streaming byte caps, wall-clock timeout, SIGTERM→SIGKILL, AbortSignal for dispose |
| `src/sshUseActions.ts` | registers `(ssh, exec)` + `(ssh, terminal)`; askpass env (`{...process.env, ...askpassEnv(...)}` — spawn replaces env wholesale), lazy key materialization cached per grant |
| `src/credsAgentServer.ts` | the broker: lazy loopback server, Bearer auth, consent gate + de-dup, dispatch, OutputChannel, dispose kills in-flight children |
| `src/agentCli.ts` | compiles to `out/agentCli.js`, plain `node`, no `vscode` in its import graph; health-probe before sending the token |

### HTTP contract (documented in `research/module_extension.md` on promotion)

`127.0.0.1` only, random port. `Authorization: Bearer <secret>`. Body cap 64 KB.
`GET /v1/health` → `{ ok, service: "creds-for-devs-agent" }` (no auth; the CLI probes it before
ever sending the token, so a recycled port never sees the secret).
`POST /v1/use/exec` `{command, timeoutMs?}` → `{exitCode, stdout, stderr, stdoutTruncated,
stderrTruncated, timedOut, durationMs}`; `POST /v1/use/terminal` `{}` → `{opened}`.
Errors: `{error:{code,message}}` with `invalid_request` 400, `unauthorized` 401, `denied` 403,
`not_found`/`not_supported` 404, `no_credential` 409, `payload_too_large` 413,
`too_many_requests` 429, `internal` 500, `consent_timeout` 504.

Ceilings: exec timeout default 30 s, caller-raisable to 120 s hard cap; 256 KB per stream,
capped while streaming (drain, stop retaining); 8 concurrent execs.

### Deviations from the chosen blueprint (deliberate, small)

- **`GET /v1/health` added** so the CLI never posts the bearer token to a port the OS recycled to
  some other process after the window closed.
- **CLI exit codes**: the blueprint left them mostly open; filled with a documented band
  (90–98 mechanism failures with a `[creds-for-devs]` stderr line; remote exit code passthrough).
- **Key materialization self-heals**: the cached per-grant key path is re-checked for existence
  (the human terminal path deletes the same file on terminal close).
- No `detached`/`taskkill` tree-kill: local `ssh` spawns no local children; `child.kill` suffices.

## Build order (each step compiles; `npm test` green)

1. Extract `loopbackServer.ts`; rewire `googleAuthProvider.ts` + `webauthnPrf.ts`. No behavior change.
2. Extract `sshCredential.ts` + move `connectEntity` to `sshConnect.ts`; add
   `writeAskpassScriptFile` to `keyInstaller.ts`; rewire `extension.ts`. No behavior change.
3. Pure core with tests: `grantToken`, `grantRegistry`, `useActions`, `sshExecCommand`,
   `brokerProtocol`, `agentAuditLog`, `agentShareSnippet`, `agentCliArgs`.
4. Adapters: `sshExecRunner`, `sshUseActions`, `credsAgentServer`, `agentCli`.
5. Wiring: `extension.ts` command + `package.json` command/menu; CHANGELOG.
6. Manual smoke: password entity + key entity; Allow/Deny/timeout; truncation; timeout kill;
   two windows; CLI against a closed window.

## Test plan

node:test suites for every pure module: token round-trip/uniqueness/malformed; full state-machine
transitions incl. timeout revert; duplicate action registration throws; argv shape (BatchMode
always, `-i`/`-p` conditional, command verbatim last); body validation ceilings and the exhaustive
code→status table; audit line never contains the full secret; snippet contains both command shapes
and quotes the CLI path; CLI args `--` handling. Adapters are covered by the manual smoke pass —
the same split the repo already uses (`helpText` tested / `helpLookup` not).

## Definition of Done

- [x] `npm run typecheck` and `npm test` green in `src_vs_code` — 298 tests, 0 failures.
- [x] `node out/agentCli.js` runs under plain node (no `vscode` in its import graph).
- [x] Behavior-preserving refactors verified: `sshCredential.test.ts` asserts the resolution order
      the extracted `connectEntity` used, empty-string `sshKeyPath` included.
- [x] The agent never receives plaintext: no response type in `brokerProtocol.ts` carries a secret
      field, and there is no endpoint that returns one.
- [x] `research/module_extension.md` documents the broker + HTTP contract;
      `research/architecture.md` gains the agent row in the trust-boundary table.
- [ ] This plan promoted to `research/` (the move itself, once the tree is quiet — see below).

## What shipped differently

1. **`BatchMode=yes` is conditional, not universal.** Both architecture proposals asserted that
   `SSH_ASKPASS_REQUIRE=force` overrides BatchMode so password auth still works; one flagged it as
   needing empirical proof. It could not be proven here — `ssh -G -o BatchMode=yes` on OpenSSH 10.3
   reports `numberofpasswordprompts 3`, but that dump is not the authentication code, and settling it
   needs a live SSH server. The password branch therefore takes the options the human path already
   proves in production plus `NumberOfPasswordPrompts=1`; only the key branch sets BatchMode.
2. **`GET /v1/health` was added.** A closed window frees its port and the OS reissues the number, so
   the CLI confirms the port answers as `creds-for-devs-agent` before sending the bearer token.
3. **Two defects found in review, each fixed after being watched failing** in
   `scripts/agent-broker-itest.cjs`: a decrypted key was left on disk when an entity's host had been
   cleared after the grant was minted (`left e-1.key`), and a finished exec deleted the key file a
   concurrent one was still using. The second is fixed by giving each call its own file name rather
   than by reference counting — which also ends the same collision with a human terminal.
4. **The consent wording moved onto the action** (`UseAction.verb`, `describeOutcome`). The broker
   chose it with `action === 'exec' ? … : …`, which would have offered to "open a terminal to" a
   database the day the registry's own purpose was exercised.
5. **The CLI talks HTTP with `fetch`**, matching `serverTransport.ts`, instead of the hand-rolled
   `node:http` client the first draft carried.
6. **A credential-resolution warning now reaches the agent path** (audit line + a VS Code warning),
   where it was silently dropped; the human path always showed it.

## The open tail

- **Password-over-askpass is unproven for the exec path specifically.** The mechanism is the human
  path's, unchanged, and the itest exercises spawn/env/capture — but no test here reaches a real
  password prompt, because that needs an SSH server. First real use is the proof.
- **Two human terminals on one entity still share `keys/<entityId>.key`** and the first to close
  deletes it. Pre-existing (0.42.0), untouched here, now the only remaining instance of the collision
  the agent path just left. Worth the same one-line fix.
- **`vsce package` was not run** — `out/agentCli.js` ships by the existing `out/*.js` rule in
  `.vscodeignore`, verified by reading it, not by building a `.vsix`.
- The feature is filed under `[Unreleased]` in the CHANGELOG rather than given a version, because a
  concurrent session held 0.42.1 open while this landed.
