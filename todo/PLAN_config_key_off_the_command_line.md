# PLAN — a config key never travels on a command line

> Status: **plan only, nothing implemented yet, 2026-10-09.** Scope: `src_cli/src` (`CommandLine.cs`, `Program.cs`
> `ReadConfigAsync`, the WSL relay of the `config` verb), `src_vs_code/src` (`configSnippetBodies.ts`, the code-access
> page copy, help), `src_broker_client/src/WslInterop.cs` (only if the relay needs a stdin path).
>
> Found by [RESULTS_wsl_bridge_orphans.md](../research/RESULTS_wsl_bridge_orphans.md) (§ Side findings) while tracing
> leaked processes; split out of [PLAN_wsl_bridge_outlives_its_client.md](PLAN_wsl_bridge_outlives_its_client.md) by the
> owner's decision of 2026-10-09.
>
> Related docs: [PLAN_config_entities.md](../research/PLAN_config_entities.md), [module_extension.md](../research/module_extension.md).

## 1. The symptom

On a developer machine a `creds.exe config <key>` process sat stopped for over six hours with its config access key in
its command line. A command line is not private. On Linux and inside WSL, `/proc/<pid>/cmdline` is readable by every
user unless procfs is mounted with `hidepid` — measured on the same distribution 2026-10-09: `/proc` mounted
`rw,nosuid,nodev,noexec,noatime` (no `hidepid`, the default), `cmdline` mode `0444`, and an unprivileged user read the
command line of root's PID 1 — so `ps` prints the key to anyone there. The product cannot assume a hardened mount. On
Windows any process of the same user reads it through WMI
(`Win32_Process.CommandLine`), and process-monitoring and crash-reporting tools record it. The key is long-lived by
design (`src_vs_code/src/configKey.ts:1-20` — it survives a year of restarts and has its own revoke), so a key that
leaks this way stays useful.

## 2. What exists today — verified 2026-10-09

- `creds config` accepts the key **only as an argument**: `CommandLine.cs:83-88` (`argv.Count == 2` →
  `Request.ReadConfig(argv[1])`), consumed by `Program.cs:81-82` → `ReadConfigAsync` (`Program.cs:282`).
- The product already names an environment variable for the key, `CREDSFORDEVS_KEY` (`configKey.ts:44`), and tells
  people to keep the key there (`configAccess.ts:77`, `README.md:569`) — but every generated snippet then reads that
  variable and passes the key **as an argument** (`configSnippetBodies.ts:21-48` for C#, and the F#, VB, Java and other
  bodies after it). The safe place exists; the last hop undoes it.
- Inside WSL the `config` verb is relayed to the Windows `creds.exe` with inherited streams (`WindowsBridge.Relay`); an
  environment variable does not cross into the Windows half without `WSLENV`, but stdin does.

## 3. Design

1. **`creds config` with no argument reads the key from `CREDSFORDEVS_KEY`; `creds config -` reads one line from stdin.**
   The argument form keeps working for one minor release and prints a one-line deprecation to stderr naming the two
   safe forms; it is removed in the next minor. (The deprecation sentence never echoes the key.)
2. **Across the WSL bridge** the Linux half resolves the key (env or stdin) and hands it to the Windows half on **stdin**
   (`creds.exe config -`), never in argv — so the Windows command line is clean too.
3. **Every snippet** sets nothing on the command line: it starts `creds config` with the environment it already has
   (the variable is inherited) — or, for a key held in memory, writes it to the child's stdin and closes it. One shape
   per language, kept as `ArgumentList` code with no shell in between, as today.
4. **Validation unchanged**: the `cfgk_` prefix check and the error texts stay; an empty variable and an empty stdin
   line are the same "no key" error.
5. Help text, the code-access page copy and `README.md` describe the variable/stdin forms only.

## 4. Build order

- **S1 RED → green** `CommandLine` tests: no argument + variable set → `ReadConfig`; `-` → reads stdin; argument form →
  `ReadConfig` plus the deprecation flag; none of the three puts the key in any produced string other than the request.
- **S2** the WSL relay over stdin; a process test that the Windows-side command line carries no key (inspect the started
  child's arguments through the `WindowsBridge` seam with a fake binary).
- **S3** the snippets and copy; snippet tests assert no body contains `ArgumentList.Add(key)` (or the language's
  equivalent) and each passes the key by environment or stdin.
- **S4** release notes: the deprecation, the two safe forms, and that existing keys need no rotation unless they were
  exposed — but a key that sat in a long-running process's command line should be rotated.

## 5. Test plan

`src_cli/tests` (MTP executable, never `dotnet test`): S1, S2. `src_vs_code` `npm test`: S3 snippet bodies. Manual on a
WSL machine: an app using the new snippet → `/proc/<pid>/cmdline` of every `creds` process during the read holds no key.

## 6. Definition of Done

- [ ] No product path puts a config key in argv; the argument form warns and is scheduled for removal.
- [ ] Every snippet passes the key by environment or stdin; tests pin it.
- [ ] Across WSL the key crosses on stdin.
- [ ] Docs, help and copy updated; release notes say whether to rotate.
- [ ] Plan, code rounds of the review gate passed; promoted on completion.
