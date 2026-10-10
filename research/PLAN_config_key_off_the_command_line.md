# PLAN — a config key never travels on a command line

> Status: **IMPLEMENTED, 2026-10-10** (creds side; `coai`'s half is its own plan, § 7). The argument form is refused at
> once instead of deprecated — owner's decision, agreed with the consultant; deviations and the open tail are § 9. Scope: `src_cli/src` (`CommandLine.cs`,
> `Program.cs` `ReadConfigAsync`, a new `ConfigKeyInput.cs` and `ConfigRelay.cs`), `src_broker_client/src/WslInterop.cs`
> (one new launch helper on `WindowsBridge`), `src_vs_code/src` (`configSnippetBodies.ts`, `configCodePanel.ts`,
> `configAccess.ts`, the five `help*.ts`), `src_vs_code/README.md`, `src_cli/README.md`.
>
> **Crosses a repository boundary.** `dew_flow_connect_other_ais` reads its vendor keys through `creds config`
> (`src_mcp/src/Server/KeyVault.cs`, the `RunFirstInstalledAsync` launch, line 103 on 2026-10-09) and passes the
> key as an argument today. Its half is `dew_flow_connect_other_ais · todo/PLAN_creds_config_key_on_stdin.md`; the
> order between the two is § 7.
>
> Found by [RESULTS_wsl_bridge_orphans.md](RESULTS_wsl_bridge_orphans.md) (§ Side findings) while tracing
> leaked processes; split out of [PLAN_wsl_bridge_outlives_its_client.md](../todo/PLAN_wsl_bridge_outlives_its_client.md) by the
> owner's decision of 2026-10-09.
>
> Related docs: [PLAN_config_entities.md](PLAN_config_entities.md), [module_extension.md](module_extension.md).

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
  `Request.ReadConfig(argv[1])`), consumed by `Program.cs:81-82` → `ReadConfigAsync` (`Program.cs:282`). The CLI
  performs **no** `cfgk_` shape check of its own; the shape check is the window's (`configKey.ts:53`
  `isConfigKeyShape`), applied when the bearer arrives.
- The product already names an environment variable for the key, `CREDSFORDEVS_KEY` (`configKey.ts:44`), and tells
  people to keep the key there (`configAccess.ts:77`, `README.md:569`) — but every generated snippet then reads that
  variable and passes the key **as an argument** (`configSnippetBodies.ts:21-541`, all twenty-two bodies; C++ and C#
  for .NET Framework even concatenate it into one command string). The safe place exists; the last hop undoes it.
- Inside WSL **every** verb, `config` included, is handed to the Windows `creds.exe` with inherited streams before any
  argument is parsed (`Program.cs:46-60` → `WindowsBridge.Relay`, `WslInterop.cs:152-158`). So inside WSL the key sits
  in two command lines: the Linux `creds` and the Windows `creds.exe`. An environment variable does not cross into the
  Windows half without `WSLENV`; stdin does.
- A bounded, hermetic `--help` probe of the Windows binary already exists: `WindowsBridge.CaptureAsync`
  (`WslInterop.cs:193`), used by `creds-mcp`'s `CallerForwarding` (`src_mcp/src/CallerForwarding.cs:46-84`) for the same
  question this plan has — does the Windows half on disk know the new shape?

## 3. Design

1. **Three forms of `creds config`, and only two of them work.**
   - `creds config -` reads **one line** from stdin (UTF-8, a leading BOM and surrounding whitespace/CR stripped, at
     most 4 KiB before the newline). An explicit `-` selects stdin and nothing else: an empty line or EOF is the "no
     key" error **even when `CREDSFORDEVS_KEY` is set** — a caller who chose stdin and sent nothing has a bug, and
     quietly reading another source would hide it.
   - `creds config` with no argument reads `CREDSFORDEVS_KEY`. Unset or blank is the "no key" error.
   - `creds config <anything other than ->`, and any extra argument after `-`, is **refused at once**: exit `usage`,
     one fixed sentence on stderr naming both safe forms. The sentence is a constant — it never interpolates what was
     passed, so a refused key is not echoed into a log that captures stderr. No deprecation window: the owner's
     decision of 2026-10-09 is that a form which leaks the key is not kept "for one release", because every release
     that accepts it is a release in which a snippet or a script keeps using it.
   - **What refusing does NOT do** (plan round 1): a caller that still runs `creds config <key>` has put the key in
     the new process's command line before any of our code runs, so the refusal cannot un-expose it — it only makes
     the exposure short and loud instead of silent and successful. The guarantee is therefore about the product's own
     paths: no snippet, no relay hop and no shipped caller (`coai` § 7) passes a key as an argument. The release notes
     say plainly that a key which was ever passed as an argument — by an old snippet, a script, or a refused call —
     should be rotated.
2. **`--help` advertises the new form with a stable marker**, `config-key-stdin`, on its own line. It is the string a
   caller probes for before it sends a key on stdin — the WSL relay below, and `coai`'s `KeyVault`. The constant lives
   in `CommandLine.ConfigStdinMarker`, a test pins its exact value, and changing it is a breaking change for those
   callers.
3. **Across the WSL bridge the key crosses on stdin.** `config` is taken out of the general relay and handled first
   (`ConfigRelay`): the Linux half parses the arguments itself (a refused form is refused here and never reaches
   Windows), resolves the key from its own stdin or environment, probes the Windows binary's `--help` through
   `CaptureAsync` (10 s bound) for the marker, and then starts `creds.exe config -` with **only stdin redirected**:
   the key and one newline are written, stdin is closed, and stdout/stderr stay inherited — byte-for-byte untouched,
   as `Relay` leaves them today. The helper is `WindowsBridge.RelayWithInput(args, input)`. A Windows binary without
   the marker, or one that does not answer the probe, is refused with "update creds.exe" (exit `toolMissing`) —
   **never** a fall-back to the argument form, which would put the key back on the Windows command line. A binary
   that cannot be started keeps today's sentence and exit.
4. **Every snippet reads the variable whose name the person gave it and writes the key to the child's stdin** —
   `creds config -`, the key plus a newline, stdin closed, no shell, no key in any argument. Two languages cannot do
   that in their standard library and say so in place:
   - **C++** — `popen` is one-directional and the standard library has no other process API, so the snippet puts the
     key into the child's environment as `CREDSFORDEVS_KEY` and runs the constant `creds config`. The command string
     carries nothing variable, so the shell `popen` uses has nothing to reinterpret, and the old alphabet check goes.
   - **Elixir** — `System.cmd` cannot write to the child's stdin and a `Port` cannot close stdin alone, so it passes
     `env: [{"CREDSFORDEVS_KEY", key}]` to `System.cmd("creds", ["config"])`.
   The environment of a process is readable only by its owner (`/proc/<pid>/environ` is `0400`), unlike its command
   line, and the application holding the key already carries it in its own environment, so this adds no new reader.
5. **Copy says the same thing everywhere**: `--help`, `src_cli/README.md`, the code panel's "Open to code" line, the
   mint dialog (`configAccess.ts:77`, which also stops naming `AddCredsForDevs()` — a package that was never built,
   [PLAN_config_entities.md](PLAN_config_entities.md) deviation 1), the config topic of the five help
   languages, and `src_vs_code/README.md:569`.
6. **The key never appears in any diagnostic.** No `Note`, refusal, exception message or test failure text carries it;
   a test drives every refusal path with a marker value and greps everything written to stderr for it, with a positive
   control proving the grep can see a planted copy.

## 4. Build order

- **S1 RED → green** `CommandLine` tests: no argument → `ReadConfig(Environment)`; `-` → `ReadConfig(Stdin)`; `<key>`,
  `- extra`, `--` → `Failed` with the fixed sentence, which does not contain the argument. `ConfigKeyInput` tests: stdin
  line read, BOM/CRLF stripped, empty line and EOF with the variable SET → error, over-long line → error, env blank →
  error. Help carries `config-key-stdin`, pinned by value.
- **S2 RED → green** `ConfigRelay` through injected seams (key source, probe, launcher): the launched argv is exactly
  `["config", "-"]` and stdin is exactly key + `\n`; a refused form never launches anything; a help without the marker,
  and a probe that answers null, refuse with "update creds.exe" and launch nothing; a launch failure keeps
  `toolMissing`. `WindowsBridge.RelayWithInput` against a real process: stdin is delivered and closed (a child that
  reads to EOF exits), its exit code comes back, and only stdin is redirected.
- **S3 RED → green** the snippets: per language, the launch names `config` and `-` and nothing else, the key is written
  to stdin and stdin is closed (C++/Elixir: the environment form, and the reason in place); no body contains any of the
  argument shapes it used to; the variable name is still substituted. Copy updated.
- **S4** the no-echo sweep over every refusal path (§ 3.6), `CHANGELOG.md` `[Unreleased]` (extension) and the CLI
  README: the breaking change, the two safe forms, and that a key which sat in a long-running process's command line
  should be rotated.

## 5. Test plan

`src_cli/tests` and `src_broker_client/tests` (MTP executables, never `dotnet test`): S1, S2, S4. `src_vs_code`
`npm run typecheck && npm test`: S3. Before release, every .NET test executable in the repository and the extension
suite.

**Before the release, on a real WSL machine** (plan round 1 — the seams in S2 prove the wiring, not the bridge): the
Linux `creds` built from this branch, `CREDS_WINDOWS_BINARY` pointed at the Windows `creds.exe` built from this branch,
a marker value as the key (never a real one). While `creds config -` runs, sample every process's command line on both
sides — `ps -eo args` in the distribution, `Win32_Process.CommandLine` on Windows — and assert the marker appears in
none of them; and assert the Windows half answered for the marker (it reaches the window as a bearer and is refused as
unknown, which is the expected outcome for a value no window minted). Repeated with an OLD Windows binary: refused
with "update creds.exe", and no `creds.exe config` process is started at all.

## 6. Definition of Done

- [ ] No product path puts a config key in argv; the argument form is refused without echoing what it was given (a
      legacy caller's own argv is exposed before the refusal runs — the release notes say to rotate such a key).
- [ ] Every snippet passes the key on stdin (C++ and Elixir: environment, with the reason in place); tests pin it.
- [ ] Across WSL the key crosses on stdin, and an old Windows binary is refused rather than fed an argument.
- [ ] Docs, help and copy updated; release notes say the argument form is gone and when to rotate.
- [ ] Plan and code rounds of the review gate passed; the plan is promoted on completion.
- [ ] `coai`'s half (§ 7) shipped after this one's release.

## 7. Release order — and why it is an order

`coai`'s review gate reads vendor keys from the vault through `creds config`. A `coai` that sends `config -` to a CLI
that predates it gets a usage error and every vendor that needs a vault key drops out of every round; a new CLI with
an old `coai` refuses `coai`'s argument form the same way. So: this repository's `cli` (and `extension`, for the
snippets) release ships first; `coai` then probes the CLI's `--help` for `config-key-stdin` before sending anything,
and refuses — naming "update the creds CLI" — when it is absent. Between the two releases a machine that has updated
`creds` but not `coai` loses its vault keys until `coai` is updated; that window is the cost of not keeping the leaking
form alive, and the owner accepted it.

**Within this repository the CLI goes before the extension** (plan round 1). The two halves ship independently, and a
new snippet run against an old CLI sends `-` as if it were the key and fails. So the `cli` release is merged and its
release workflow is green before the `extension` release pull request is merged; neither falls back to the argument
form.

## 8. What grows

Nothing. One extra `creds.exe --help` launch per `creds config` call inside WSL (an AOT start-up, milliseconds), no
state, no file, no table.

## 9. What shipped, and how it differs from this plan

Built as planned (S1–S4), with these deviations — recorded because they are what the next reader needs:

1. **Code round, two additions.** `ConfigKey.Found` overrides `ToString`: a positional record prints every member, so
   one interpolated log line or a failed assertion would have written the key (found by our own reviewer). The C++
   snippet takes `CREDSFORDEVS_KEY` back out of the APPLICATION's environment right after `popen` (restoring a previous
   value), because `setenv` changes the parent, not only the child (found by the gate). The Scala snippet stopped
   discarding creds' stderr.
2. **The real WSL check ran before release, with counts only** (2026-10-10, Ubuntu on WSL2, this branch's Linux
   `creds` and Windows `creds.exe`, a fake key). New Windows binary: 1032 process-table samples taken while both
   halves were running, the fake key in **0** command lines on the WSL side and 0 of 576 Windows `Win32_Process`
   samples; the Windows half reached the window and was refused as an unknown key (exit 92), for both `config -` and
   `config`. A Windows binary built from `main` before this change: refused with "update creds.exe" (exit 99), the
   fake key in no command line. The argument form: refused, exit 96. **The sampler stores counts, never command
   lines** — the first attempt stored lines and caught a REAL key in the command line of a running `creds config`
   started by an older installed CLI on the same machine, which is this plan's symptom observed live; that sample
   file was deleted at once and the value written nowhere.
3. **Not a hang, a slow refusal (pre-existing, not changed here).** An unknown key is tried against every endpoint
   file — 34 on the test machine, a health probe of up to 2 s each — so a refusal took ~67 s there. A key a window
   holds returns at the first match. Why so many endpoint files survive is not this plan's subject; it is noted
   here so the next reader does not mistake the wait for a bridge hang, as the first run of the check did.

**Open tail:** `dew_flow_connect_other_ais` still passes the key as an argument until its own half ships
(`dew_flow_connect_other_ais · todo/PLAN_creds_config_key_on_stdin.md`), after this repository's `cli` release. The
copyable CLI row for a config entry with a CLI alias reads `creds config <alias>`, which never worked (there is no
alias route for configs) and is now refused like any argument — reported, not changed here.
