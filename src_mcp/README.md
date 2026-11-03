# `creds-mcp` — the MCP half of CredsForDevs

A single native binary that an MCP client (Claude Code and others) starts as its own child process
and talks to over stdio. It lets an agent ask which credentials a person opened to it and use them,
without the agent ever receiving the secret. It holds no credential and can obtain none: everything it
knows it asks a running VS Code window for, and the window answers only what a person turned on.

```
creds-mcp --help       what the tools are
creds-mcp --version    the version of THIS executable
```

By hand it takes only these two arguments. An MCP client speaks to it over stdin and stdout.

## How it is installed

In VS Code run **CredsForDevs: Install the MCP Server…** (command `credSshManager.installMcpServer`).
The extension downloads the right build for the machine from the `mcp-v*` GitHub release and checks
it against the `.sha256` that sits beside it. The extension itself has no runtime dependencies; this
is a separate binary.

## The Windows binary is signed

The `creds-mcp.exe` in the `win-x64` and `win-arm64` releases is Authenticode-signed by the owner's
organization through Azure Artifact Signing, so Windows Smart App Control lets it run. Smart App
Control was checked on `win-x64`. The `win-arm64` build carries the same signature from the same
certificate profile; it was not run under Smart App Control. Check a signature in PowerShell with
`Get-AuthenticodeSignature .\creds-mcp.exe`.

## Building and testing

```bash
# from the repository root; local runs follow .claude/rules/shared/common/local-cpu-budget.md
LP=.claude/rules/shared/tools/low-priority.mjs
node $LP dotnet build   src_mcp/src/CredsMcp.csproj -m:4 --disable-build-servers
node $LP dotnet build   src_mcp/tests/CredsMcp.Tests.csproj -m:4 --disable-build-servers
node $LP ./src_mcp/tests/bin/Debug/net10.0/CredsMcp.Tests.exe      # run the executable, never `dotnet test`
```

Release binaries are built for all six RIDs by the `mcp-binaries` job in `.github/workflows/release.yml`
on an `mcp-v*` tag, and the Windows ones are signed by `mcp-sign`. The changelog is
[RELEASES.md](RELEASES.md), written by release-please; never edit it by hand. More about the server:
[research/PLAN_mcp_server.md](../research/PLAN_mcp_server.md) and the root [README.md](../README.md).
