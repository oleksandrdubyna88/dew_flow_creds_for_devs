# `creds` — the terminal half of CredsForDevs

A single native binary that lets anything in a terminal *use* a credential from your vault
without ever receiving it. It holds no secret and can obtain none: all it has is a grant token
naming a loopback port in the VS Code window that minted it, authorizing exactly one entry there.
The window performs the action; this process relays the request and prints what comes back.

```
creds ssh <token> -- uname -a          run a command on the remote host
creds terminal <token>                 open an interactive terminal in VS Code
creds run <token>                      run the saved command
creds script <token>                   run the saved script
creds db <token> -- "select 1"         run a query
creds env <token>                      export the secret into new VS Code terminals
creds vpn-up <token> / vpn-down        control the tunnel
```

The token comes from **Share with Claude Code…** in VS Code. It stops working when that window
closes, and the first call asks the human to allow it.

## Why a separate binary rather than a script

The point is to work when the editor is not the thing you are looking at — iTerm, Alacritty,
Ghostty, tmux — and to start fast enough that wrapping a command in it is not a decision. It is
.NET **Native AOT**, the same technology and the same four RIDs as the vault server
(`win-x64`, `win-arm64`, `linux-x64`, `linux-arm64`), so the repository keeps one toolchain and
one release matrix rather than gaining a language for one binary.

Two consequences of AOT that are requirements here, not details:

- **No reflection-based JSON.** `JsonSerializerIsReflectionEnabledByDefault=false` is set, so
  every payload goes through the source-generated `CredsJsonContext` and an accidental
  reflective call is a compile error rather than a crash on someone's machine.
- **The AOT analyzers run on every ordinary build**, so an incompatible pattern fails locally
  instead of on a release runner.

## The contract, and why it is a file

The protocol used to be a TypeScript module shared by its only two callers. With a second
implementation in another language it becomes a specification, so `contract/broker-v1.json` is
generated from `brokerProtocol.ts` (`npm run contract` in `src_vs_code`) and embedded here at
build time. A test on each side asserts its own tables match the file.

That check is not ceremony. A client posting `vpn-up` to a route the broker renamed, or
reporting exit 95 where the other reports 0, raises no error anywhere — it shows up as an agent
drawing a wrong conclusion in somebody's terminal, with nothing in any log to explain it. The
same class of bug was found and fixed on the Node side while this was being written.

## Exit codes

A remote command's own exit code passes through untouched, so `&&`, `||` and `$?` behave around
`creds` exactly as they would around a real `ssh`. Failures of the mechanism use a reserved band
(89–99) and always print a `[creds-for-devs]` line to stderr, so a collision with a remote code
stays legible. The band is in the contract file; nothing here defines its own.

## Building and testing

```bash
dotnet build   src_cli/src/CredsCli.csproj
dotnet build   src_cli/tests/CredsCli.Tests.csproj
./src_cli/tests/bin/Debug/net10.0/CredsCli.Tests.exe      # run the executable, never `dotnet test`
dotnet publish src_cli/src/CredsCli.csproj -c Release -r linux-x64 -o out
```

Publishing needs the host linker — `clang` and `zlib1g-dev` on Linux, the MSVC build tools on
Windows. CI installs them; a workstation without them builds and tests fine but cannot produce
the native binary. Release binaries are built for all four RIDs by the `cli-binaries` job in
`.github/workflows/release.yml`, on a `cli-v*` tag.

## Names, and where it runs

`creds ssh prod-db` works: *Enable CLI Access…* on an entry gives it a name, and the registry
holds only which entry that name points at — no token, no secret. An alias says WHICH; the
consent modal still says WHETHER, and it is rate-limited precisely because a name is not a
secret and the modal is the whole gate.

Inside **WSL** the Linux binary hands the call to the Windows one through interop: no networking
to configure and nothing new listening anywhere. On a **Remote-SSH** host, *Open Remote Bridge*
holds an `ssh -R` open and `CREDS_BROKER_SOCKET` points this binary at the forwarded socket —
the credential stays on your laptop, the consent prompt appears there, and only output comes back.

## The SSH agent inside WSL — `creds relay`

The rest of this binary crosses into Windows by re-executing itself, because a call is one short
exchange whose arguments are names. `ssh` is not that: it opens `$SSH_AUTH_SOCK` and speaks a
binary protocol over a connection it holds. A socket cannot be re-executed, and the agent is a
**named pipe** — a Windows kernel object the Linux side cannot open at all.

So `creds relay` serves a unix socket inside the distribution and gives each accepted connection
its own Windows child to carry it:

```bash
creds relay &                       # prints the export line; leave it running
export SSH_AUTH_SOCK=/run/user/1000/creds-agent.sock

ssh-add -l                          # the key, served from the VS Code window on Windows
git commit -S                       # signed by a key that is not in this filesystem
```

The private key never enters WSL. Every signature raises the consent dialog **on Windows**, per
key and per use. The address is resolved on every connection, so unloading a key and loading
another is picked up without restarting the relay.

`CREDS_RELAY_SOCKET` overrides the path; without `XDG_RUNTIME_DIR` it falls back to
`/tmp/creds-agent-<user>.sock`. A socket left by a crash is reclaimed; one a live relay is
serving is refused rather than hijacked.

**It widens the reach of the agent, and that is the point to weigh.** A named pipe is reachable
by one Windows user; a unix socket is reachable by every process in that distribution running as
you. The mitigation is not the socket mode — it is that a signature still has to be allowed on
Windows, so the worst a process in WSL can do is ask, visibly. The relay is opt-in and never
starts itself.

If you set `CREDS_ENDPOINT_DIR` for a non-standard VS Code install, name it in `WSLENV`
(`export WSLENV=CREDS_ENDPOINT_DIR/p`): environment variables do **not** cross from WSL into a
Windows child on their own — measured, including from .NET's own process API.
Design records: [`research/PLAN_headless_cli.md`](../research/PLAN_headless_cli.md) and
[`research/PLAN_remote_broker_bridge.md`](../research/PLAN_remote_broker_bridge.md) and
[`research/PLAN_wsl_agent_relay.md`](../research/PLAN_wsl_agent_relay.md), including
what was deliberately NOT built and why.
