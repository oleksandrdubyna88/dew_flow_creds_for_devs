# PLAN — the ssh-agent inside WSL, without the key ever going there

> Status: **IMPLEMENTED, 2026-08-26.** Scope: `src_cli/` (two new verbs),
> `src_vs_code/src/cliEndpoint.ts` + `extension.ts` (publish the agent's address), and one new
> integration script.
>
> Related: [PLAN_cli_bridge_tail.md](PLAN_cli_bridge_tail.md) §2 (this is its **4b**),
> [module_extension.md](module_extension.md),
> [PLAN_ssh_agent.md](PLAN_ssh_agent.md) (D1 — the agent this reaches),
> [PLAN_headless_cli.md](PLAN_headless_cli.md) (the interop trick this extends).

## The goal

The owner works inside WSL constantly. Today, inside WSL:

| | today |
|---|---|
| `creds get`, `creds exec`, aliases | works — the Linux binary re-executes the Windows one |
| `git commit -S` with a vault key | **no** |
| `ssh` to a host with a vault key | **no** |
| `ssh -A` onward from there | **no** |

The extension is `extensionKind: ["ui"]`, so even in a WSL window the extension host and the agent
are on **Windows**. The agent listens on a named pipe — a Windows kernel object that the Linux
kernel in WSL2 cannot open. That is the whole gap.

## Why the CLI's trick does not carry over

[WslInterop.cs](../src_cli/src/WslInterop.cs) works because a CLI call is **one short exchange
whose arguments are names**: re-execute the Windows binary, relay the streams, done. `ssh` does not
call our binary — it opens `$SSH_AUTH_SOCK` and speaks a binary protocol over a **held** connection.
A socket cannot be re-executed.

So the shape is the same trick moved down one level: **per connection instead of per call**.

## Measured before it was designed (2026-08-26)

A throwaway relay was built out of three Node scripts and driven by the real OpenSSH tools, against
the **real** `SshAgentServer` on a real named pipe. Everything below was observed, not reasoned:

- 64 KB of `/dev/urandom` piped from WSL through a Windows child and back came out with an
  identical SHA-256 — **WSL interop pipes do not corrupt binary**, which is the assumption the
  whole design rests on;
- `ssh-add -l` inside WSL, pointed at a unix socket served by the relay, listed the key with the
  exact fingerprint the agent had generated;
- `ssh-keygen -Y sign` inside WSL produced a 294-byte signature and `ssh-keygen -Y verify`
  accepted it — **that is the mechanism `git commit -S` uses** with `gpg.format ssh`;
- the private key never existed inside WSL at any point;
- a relay started with `setsid` survived across separate `wsl.exe` invocations, and one started
  from a transient shell did **not** — which is the evidence that **lifecycle, not plumbing, is
  the work**.

## Design

```
ssh / git in WSL
      │  $SSH_AUTH_SOCK
      ▼
/run/user/<uid>/creds-agent.sock        `creds relay`      (Linux, stays alive)
      │  one child per connection, via WSL interop
      ▼
creds.exe relay-pipe                    (Windows, one per connection)
      │  \.\pipe\creds-for-devs-agent-<pid>
      ▼
SshAgentServer  →  consent dialog on Windows  →  signature
```

Two new verbs, both ours, so no third-party utility is involved:

- **`creds relay [--socket <path>]`** — Linux only. Listens on a unix socket, mode 0600. Per
  accepted connection it spawns the Windows binary in pipe mode with piped stdio and copies bytes
  both ways until either end closes. Exempt from the WSL re-execution in `Program.Main`, which
  currently relays *everything* before parsing — this is the one verb that must stay.
- **`creds relay-pipe`** — Windows only, no arguments. Resolves the running window's agent address
  itself, connects, and pumps stdin↔pipe. **Resolving per connection rather than once at startup**
  is deliberate: the agent starts when a key is loaded and stops when it is unloaded, so a name
  captured at relay startup is wrong for the rest of the session.

**Discovery reuses the endpoint files.** `cliEndpoint.ts` already writes one file per window
carrying a pid, a port and a pipe — and already documents that it holds **no secret**, because all
of it is enumerable anyway. It gains `agentSocket?: string`, rewritten when the agent starts and
when it stops. `Endpoints.cs` already reads and pid-checks these files on the Windows side.

## Security — this widens the surface, and it must be said plainly

The named pipe is reachable by this Windows user. A unix socket inside WSL is reachable by **any
process in that distribution running as that user**. That is a real widening, and the mitigation is
not the socket's mode:

- every signature still raises the **consent dialog on Windows**, per key and per use (D1), so the
  worst a process inside WSL can do is *ask*, visibly;
- the socket is 0600 and lives in `/run/user/<uid>` when it exists, `/tmp` otherwise;
- the relay is **opt-in and explicit** — it does not start itself.

`ssh -A` from inside WSL onward to a remote host is a further hop and keeps D1's existing warning.

## Build order

1. `cliEndpoint.ts`: `agentSocket?: string` on the record and its validator; `extension.ts`
   rewrites the endpoint when the agent starts/stops. Tests for the round trip and for a stale file.
2. `Endpoints.cs`: read the new field. Contract test both sides, per the two-implementations rule.
3. `relay-pipe` (Windows): resolve → connect → pump. Refuse with a named exit code when no window
   is running or no key is loaded.
4. `relay` (Linux): socket lifecycle (stale-socket unlink, refuse a live one, remove on exit),
   accept loop, one child per connection, `--socket` override.
5. `Program.Main`: exempt `relay` from the WSL re-execution; keep the loop guard for `relay-pipe`.
6. Help text, README, CHANGELOG, `module_cli.md`.

## Test plan

- Unit: verb parsing for both, the socket-path decision (`XDG_RUNTIME_DIR` vs `/tmp`), the
  stale-vs-live socket decision, the endpoint round trip with and without `agentSocket`.
- **The one with teeth** — a new `scripts/wsl-agent-relay-itest.cjs`, modelled on
  `ssh-agent-itest.cjs`: start the real agent, run the real relay, and drive **the real
  `ssh-add -l` and `ssh-keygen -Y sign`/`-Y verify` inside WSL**. Asserting that the relay
  *forwarded bytes* is not a test that the agent answered — the same distinction that made phase 4a
  a defect. Skipped with a printed reason when WSL is absent, never silently.

## What shipped differently, and what the build taught

**Discovery went through the broker, not a new route.** The plan said `cliEndpoint.ts` would gain
`agentSocket`; it did, but the field is set by `CredsAgentServer.setAgentAddress`, which the agent
manager calls on both edges of its life. The broker already owned the announcement file, and giving
the agent a second writer for one file would have been the worse half of that trade.

**One thing was measured that the plan had assumed away.** Environment variables do **not** cross
from WSL into a Windows child — not from a shell, and not from .NET's own
`ProcessStartInfo.Environment` (proven with a six-line probe, because it was about to be asserted
in a comment). Consequence: `CREDS_ENDPOINT_DIR` set inside WSL never reaches the Windows half, so
a non-standard VS Code install needs `WSLENV=CREDS_ENDPOINT_DIR/p`. Documented in the CLI README
rather than engineered around, since `WSLENV` is the mechanism Windows provides for exactly this.

The same measurement raised a question about `WslInterop`'s loop guard, which sets
`CREDS_RELAYED_FROM_WSL` on the child and therefore cannot reach a Windows one. It is **not** a
defect: the case the guard exists for is a Windows binary that is secretly a Linux one, and
Linux→Linux `exec` passes the environment normally. Recorded because the reasoning is not obvious
from the code.

**The bug worth remembering was one character.** `PipePrefix` was written `\.\pipe\`
instead of `\\.\pipe\`. It compiles, it is a valid verbatim string, and it matches
nothing — so every connection silently took the unix-socket branch and the relay reported *"an SSH
agent was announced but none answered"*, which reads exactly like a window that has gone. It is now
both a unit test and the sabotage used to prove the integration test has teeth: reintroducing it
turns four checks red.

**A build succeeded and proved nothing.** `dotnet build` run from the repository root reported
success while building a different project; the CLI binary was stale by an hour and the relay kept
answering *unknown verb "relay-pipe"*. Name the project.

**Also not in the plan:** `creds relay` refuses to run on Windows with an explanation, rather than
failing at a unix socket that cannot exist there.
## The follow-on that shipped the same day: it raises itself

The plan ended at a relay a person starts by hand. That is one command per machine per reboot,
which is the kind of step people stop taking. `WslRelayManager` now starts it when the agent
starts and kills it when the agent stops or the window closes — the same shape and the same rule
as `SshBridgeManager`, with the spawner injected so the lifetime is a unit test.

**Measured first, again.** Killing the `wsl.exe` from Windows *does* kill the relay inside the
distribution — so nothing outlives the window and there is no leak to clean up. The socket file
is left behind, because a killed process runs no exit handler; that costs nothing, since
`ClaimAsync` already reclaims a stale socket on the next start.

**Restarts are bounded.** The ordinary failure is `creds` not being installed in the
distribution, and an unbounded respawn would be a login shell started every few milliseconds for
the rest of the session. Three failures inside five seconds and it stops, saying why; a run that
lasted resets the count.

**Off unless asked for** (`credSshManager.wslAgentRelay`), for the reason the security section
above gives. The command that turns it on is palette-only: there is no tree row for "this
computer's WSL", and a menu entry would advertise a bridge most people do not want.

**What the extension deliberately does NOT do is set `SSH_AUTH_SOCK` for you.** VS Code's
environment collection is one namespace for every terminal of a window, and a Windows terminal
needs the agent's named pipe where a WSL one needs the relay's unix path — the API has no
per-shell scope. A Windows variable does not reach the distribution at all unless it is named in
`WSLENV`. So the export belongs in the shell's own rc, and the setup command offers to write it
there once — idempotent by a marker comment rather than by the path, so someone who moved the
socket with `CREDS_RELAY_SOCKET` does not end up with two exports fighting.

**The socket path is read, never re-derived.** `AgentRelay.DefaultSocketPath` decides it in the
CLI; the manager parses the relay's own first line of stdout. A second implementation of that
rule on the TypeScript side would be two places that must agree about a path — the shape of
defect the two-implementations rule exists for.

**Both settings reach a login shell, so they are refused rather than escaped.** Settings are
workspace-writable — a repository can ship a `.vscode/settings.json` — and the command and
distribution names are spliced into `bash -lc`. The accepted character set is what those names
actually need; nothing quotable is accepted, so there is nothing to quote correctly.

## Found in review, 2026-08-26 — the socket was briefly world-connectable

A unix socket takes its mode from the **umask at `bind`**, and the code set the mode a line
afterwards. Measured under the ordinary umask of 0022: the socket comes out `rwxr-xr-x` at bind
and is narrowed to `rw-------` a moment later. In between, any process on the machine can connect
— and `SSH2_AGENTC_REQUEST_IDENTITIES` raises no dialog by design, so the window silently leaks
the list of loaded public keys.

`$XDG_RUNTIME_DIR` is itself 0700, so the default path was protected by its directory. The `/tmp`
fallback was not, and neither is a path given through `CREDS_RELAY_SOCKET`.

Fixed by setting `umask(077)` **before** the bind, which removes the window rather than shortening
it and covers every path including an overridden one. Verified by removing the `chmod` and
measuring again: the socket then comes out `700` instead of `755`. The `chmod` stays as belt and
braces — a mode that disagreed with the mask would mean the mask did not take.

It is a `DllImport` rather than the newer `LibraryImport` because the source-generated form
requires `AllowUnsafeBlocks` for the whole project, which is a large guarantee to give up for one
call into libc.

**Also found:** the integration test stopped building the day the broker client became its own
library — it copies the sources into `/tmp` and copied only `src_cli`. It did not fail; it
**skipped**, which is a test quietly not running. It now copies both projects.

**Checked and NOT a defect** (measured, because the reasoning went the other way first): the
Windows child per connection does not leak. Closing the WSL side closes the child's stdin, it
reads end-of-stream and exits — five real connections left zero processes behind and no log noise
from the abandoned copy task.

## Definition of Done

- [x] `creds relay` serves a unix socket in WSL that a real `ssh-add -l` lists the key through.
- [x] `ssh-keygen -Y sign` inside WSL produces a signature `-Y verify` accepts, key never in WSL.
- [x] The agent starting and stopping mid-session is picked up without restarting the relay.
- [x] A stale socket is reclaimed; a live one is refused rather than hijacked.
- [x] The integration test drives the real tools inside WSL and is skipped loudly, never silently.
- [x] The widened surface is documented where a reader will meet it, not only here.
