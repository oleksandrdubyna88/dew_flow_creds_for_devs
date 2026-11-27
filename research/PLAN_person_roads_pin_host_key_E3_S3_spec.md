# PLAN — E3.S3 brief: the feasibility of the instruments that are not known to work (decision 18)

> Status: **IMPLEMENTED, 2026-11-27.** Story E3.S3 (brief) of G1: merged (#393, squash `fe9aee47`, and #394, `b152bf06`) and released in extension 1.24.0 on 2026-11-27 (release PR #395, squash `a63dee35`, tag `extension-v1.24.0` at `a63dee35`, published to the Marketplace the same day). The parent [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md) records the release and the run on the release commit (§10.5).
>
> The status as it stood before the promotion, kept as it was written: **brief, 2026-11-23, by Opus; no probe built, no probe run.** Story E3.S3 of
> [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md) (its decision 18; `## Epics`, E3: *The feasibility comes first*,
> *The setup of every measurement* and the rows M1-M3, M5 (f) and (h), M6, M7, M9-M11, M13) and of its stories document
> [PLAN_person_roads_pin_host_key_E3.md](PLAN_person_roads_pin_host_key_E3.md) (`## E3.S3`, its settled item 9, the lead's answers Q1 and
> Q4). The parent, the stories document and `todo/README.md` do not name this file yet: the lead adds the links and the row (*Notes for the
> lead*). This file is promoted together with the parent.
>
> Scope: `src_vs_code/scripts` (new probe files; one line of exports and one optional parameter in `scripts/itestPinnedRoads.cjs`), one
> `Containerfile` for probe 2, and `research/module_tests.md`. No file of `src_vs_code/src`, no workflow, no product behaviour, no
> `package.json`. **Every `file:line` below was read on `fix/g1-e3-release-gate` at `e1f6c891`, on 2026-11-23.** Opus writes this brief, a
> Sonnet coder builds and runs the probes, an Opus judge reads each result.

"The parent" is the plan linked above; §3.7, M1 and so on are the parent's. "The stories document" is the E3 document linked above. This
document's own names: the facts F1 to F20, the probes P1 to P7 (the numbers of the stories document's list), their checks (P1.1 and so on),
the questions QA and QB. "The instrument of E3.S2" is `scripts/lib/sshdRun.cjs`, `scripts/itestServing.cjs` and
`scripts/itestIdentities.cjs` with the two run parameters `CREDS_ITEST_SSHD` and `CREDS_ITEST_SSHD_CONFIG`. A "counterpart" is an `sshd`
that a probe starts with `startServingSshd`. This document keeps no change ledger: a change of it is an entry in the parent
(`plan-change-control.md`). The parent's epoch 3 has ONE entry (3.1), so the next entry is the SECOND, and it stops the whole plan.

## What E3.S3 does, in one paragraph

Seven instruments of E3 are not known to work. Before any row is built, each one is probed through the committed instrument of E3.S2, from a
tree with no modified tracked file, and each probe records the identities of what it ran, as a row does. A probe answers one question: can
this instrument show what its rows need? It is NOT a row: it measures no pass criterion of §10, and its numbers go into the commit body and
`research/module_tests.md` as "seen when it was probed". Five probes need nothing that is not on this machine (P1, P4, P5, P6, P7) and run
first. Two need a download that the owner must allow (P3: an `ssh` older than 8.5; P2: a container image with OpenSSH and Node). A probe
that cannot be made to work goes to the lead, and it is a plan change (decision 18).

| Probe | Instrument | Rows it serves | Needs a download | Runs |
|---|---|---|---|---|
| P1 | the install's stand-in: the `PATH` of the counterpart's login, set by the serving launcher's extra lines | M1, M2 *the switch*, M3 *the switch*, M6, M7, M9, M11 (b) | no | now (batch A) |
| P2 | a resolver that the run owns, whose answer the client takes as secure, in a container | M10 | yes: an image and two packages | after QA and the owner's word (batch B) |
| P3 | a client older than 8.5, unpacked into the owned folder; with the lead's `ssh -G` check of a quoted `=` (Q1) | M11 | yes: two packages | after the owner's word (batch B) |
| P4 | a handed config that the nested client of a jump host reads too | M5 (f) | no | now (batch A) |
| P5 | `ssh.exe -G` of the owner's Windows, from this machine, argv as separate arguments | M13 | no | now (batch A) |
| P6 | a forced command that writes the verification line and then runs the command it was asked for, to 0 | M5 (h) | no | now (batch A) |
| P7 | a program that never answers `-V`, ended by the runner's limit | M11 (d) | no | now (batch A) |

## Binding constraints

- **No plan change.** Build and run what the parent, the stories document and this brief say. If a probe cannot be built as written, or it
  fails after the repairs that *What a failed probe means* allows, STOP and tell the lead. Do not repair the parent, the stories document or
  this brief, and never write a ledger entry: the lead records the plan change.
- **Through the committed instrument only.** Every counterpart is started by `startServingSshd(rig, name, hostKey, port, extra)`
  (`itestServing.cjs:65`), every extra `sshd` line goes in through its `extra` (the lead's answer Q4), and every leg ends with `endServer`
  (`:172`). The local `sshd` is handed by the two variables of E3.S2, never by an edit of a tracked file. No scratch copy of a tracked file,
  and no probe from a copy with edits (decision 16).
- **A run of the commit.** Each probe runs after its code is COMMITTED, from a tree where `git status --porcelain --untracked-files=no` is
  empty, and the record says so (R1 of E3.S2: `itestIdentities.cjs:119`).
- **The four kinds of evidence stay apart** (decision 15): a start of the client (the shim's record), a connection start (a start whose argv
  names a destination), an authentication attempt and an accepted login (the counterpart's log, `AUTH_ATTEMPT`, `itestPinnedRoads.cjs:34`).
  A probe never puts one for another.
- **No home path of a real user in a committed text.** The commit bodies and `research/module_tests.md` write a home folder as `~/…` and a
  Windows user folder as `C:\Users\<user>\…`. The record of identities prints real paths (`CREDS_ITEST_SSHD` is in a home folder): replace
  the home part by `~` when you quote it (the public-hygiene check refuses a real home path).
- **Test 33 and the guards stay green.** No probe quotes a path that ends with `/sshd`, starts an `sshd` itself or writes a line that opens
  with `ListenAddress `, `HostKey `, `AuthorizedKeysFile ` or `PidFile ` (`src/test/itestInstrument.test.ts:32-40`). No raw temp call: every
  folder is `ownedDir` of `scripts/lib/leftovers.cjs` under `shortSocketRoot()` (`harnessSites.test.ts:33`; the stories document, settled
  item 9). A probe that calls `buildSshExecArgv` or `buildBridgeArgv` hands `await checkedPinOf(...)` (`itestCallers.test.ts`).
- **Every launch is exe + argv with a time limit** (`security.md`, *External processes*): `execFile` with a timeout, or `launch` and
  `settledAfter`, as section 9 and 10 do. Every process is ended by its pid and start time, never by name and never by a process group.
- **Node only.** No Python, also not for a helper. Write files with the Edit or Write tool, not with a shell heredoc.
- **Limits.** Every script file at most 800 lines. Stage by path; read `git diff --staged --stat` before each commit. Do not push; the lead
  pushes. No revert, no amend, no rewrite of history, never a bare `git stash`, never commit `.claude/settings.json`.
- **One real-`sshd` run at a time is not required, but CPU is.** Run every probe at lowered priority (`--import ./scripts/lower-priority.mjs`).
- **Downloads.** Nothing is downloaded or installed before the owner's word on the list in *Every download the owner must allow*. A probe
  of batch B does not start before that word.

## Facts read or measured on 2026-11-23 that this brief uses

| # | Fact | How |
|---|---|---|
| F1 | **The local `sshd`.** `~/.cache/creds-itest-sshd/` holds `sshd-wrap.sh` (`LD_LIBRARY_PATH=<…>/root/usr/lib/x86_64-linux-gnu exec <…>/root/usr/sbin/sshd "$@"`), `extra.conf` (the two lines `SshdSessionPath …/sshd-session`, `SshdAuthPath …/sshd-auth`), `root/` (the unpacked files) and `deb/` with `openssh-server_1%3a10.2p1-2ubuntu3.8_amd64.deb`, `libwrap0_7.6.q-36build2_amd64.deb` and `SHA256SUMS`. It is handed as `CREDS_ITEST_SSHD=$HOME/.cache/creds-itest-sshd/sshd-wrap.sh` and `CREDS_ITEST_SSHD_CONFIG=$HOME/.cache/creds-itest-sshd/extra.conf` | read (`ls`, `cat`) |
| F2 | **The client.** `/usr/bin/ssh -V`: `OpenSSH_10.2p1 Ubuntu-2ubuntu3.8, OpenSSL 3.5.5 27 Jan 2026`. `ldd /usr/bin/ssh` lists `libresolv.so.2` and no `libldns`: an SSHFP question goes through glibc's stub resolver. glibc passes the AD bit of an answer on only with `options trust-ad` in `resolv.conf` (glibc 2.31 and later; read in `resolv.conf(5)`, not run), and OpenSSH marks an SSHFP answer as secure by that bit (`openbsd-compat/getrrsetbyname.c`; read, not run) | measured; read |
| F3 | **The resolver of this machine.** `/etc/resolv.conf`: `nameserver <WSL's own address>`, `search localdomain` (WSL's own). glibc takes the name server from that file only; no environment variable names one | read |
| F4 | **The Windows client.** `/mnt/c/Windows/System32/OpenSSH/ssh.exe` exists (1 256 448 bytes). `ssh.exe -V`, started from WSL through interop: `OpenSSH_for_Windows_9.5p2, LibreSSL 3.8.2` (the version of K7 of the E1.S1 spec) | measured |
| F5 | **wslc.** `wslc.exe` is on `PATH` (`/mnt/c/Program Files/WSL/wslc.exe`). `wslc run` takes `--rm`, `--name`, `--label`, `-v`/`--mount`, `--dns`, `--dns-option`, `--pull`, `-u`, `--cap-add`, `-e` (`wslc run --help`). Local images: `python:3.12-slim` (Debian, Python 3.12.16), `python:3.14-slim`, `koalaman/shellcheck-alpine`, and large ROCm/ComfyUI images. None holds Node or OpenSSH (`wslc images`, `wslc image inspect python:3.12-slim`). A port that `wslc` publishes is on the Windows loopback only and the distro cannot reach it (measured 2026-11-04, an earlier task on this machine) | read; earlier measurement |
| F6 | **The janitor does not read `wslc`.** `janitor.sh:317`: `if command -v docker …; else … "janitor: no docker binary — containers, volumes and networks not swept"`. This machine has no `docker` | read |
| F7 | **An older client's libraries.** Present: `libedit.so.2`, `libgssapi_krb5.so.2`, `libselinux.so.1`, `libz.so.1`. Absent: `libcrypto.so.1.1` (an OpenSSH 8.x of Debian 11 or Ubuntu 20.04 links OpenSSL 1.1). `apt-cache policy openssh-client`: `1:10.2p1-2ubuntu3.8` and `1:10.2p1-2ubuntu3` only; `libssl1.1`: no candidate; `debian-archive-keyring`: candidate `2025.1ubuntu1` (universe), not installed; `/usr/share/keyrings` holds Ubuntu keyrings only | read (`ls`, `apt-cache`) |
| F8 | **Namespaces.** `/proc/sys/user/max_user_namespaces` is 63939; `unshare`, `nsenter`, `setpriv`, `ip`, `bwrap` are on `PATH`. Not run here | read |
| F9 | **Node.** This machine: `node` v26.12.1 (nvm). CI: `node-version: 22.x` (`ci-extension.yml:48`). The login shell of this user is `/bin/bash` (`getent passwd`) | read |
| F10 | **Section 10 exports one name.** `module.exports = { livePinnedRoads }` (`itestPinnedRoads.cjs:545`). The helpers a probe needs are private: `productOf` `:53`, `realSsh` `:115`, `installShim` `:128`, `writeClientConfig` `:150`, `recordedStarts` `:155`, `openLeg` `:183`, `startsOf` `:205`, `finishes` `:230`, `makeKeys` `:462`, `knownHostsDigest` `:473`, `rigOf` `:479`. `openLeg` gives the world no `answer`, so the install's question is dismissed (`test/personRoadsWorld.ts:101-102`, "Default: dismissed") | read |
| F11 | **The instrument of E3.S2.** `startServingSshd(rig, name, hostKey, port, extra = [])` (`itestServing.cjs:65`) writes `servingConfig(RUN, …)`: the starter's lines, the run's lines, then `extra` (`lib/sshdRun.cjs:108-126`); `stopListener` `:158`; `endServer` `:172`; exports `:188`. `identitiesOf(rig, real)` (`itestIdentities.cjs:97`) and `recordIdentities(check, rig, real)` (`:115`), whose R3 and R6 need at least one listener (`:123`, `:127`) | read |
| F12 | **The install.** `installCommand()` (`remoteCliInstall.ts:120-127`) is `curl -fsSL <INSTALLER_URL> -o /tmp/creds-install.$$.sh && sh /tmp/creds-install.$$.sh < /dev/null; rm -f /tmp/creds-install.$$.sh`. The road runs it after its question with a limit of 180 s (`agentCommands.ts:318`) and reads the outcome with `interpretInstall`, which looks for the line `creds-install: installed <path>`. The question's button is `confirmationFor(…).action` (`remoteCliInstall.ts:159-180`; `Install it` or `Replace it`) | read |
| F13 | **The asker.** `pinClientAsker` (`pinClient.ts:84`) runs `-V` with `CLIENT_CHECK_TIMEOUT_MS` = 10 s (`bridgedSshClient.ts:81`); the runner sends SIGTERM at its limit and SIGKILL 2 s later (`KILL_GRACE_MS`, `sshExecRunner.ts:23`). A run with no version is `{ kind: 'unreadable', exitCode }` (`pinClient.ts:47-53`) | read |
| F14 | **The words.** `checkedPin(file, client)` (`hostKeyPin.ts:221`) writes a path with white space, an apostrophe or `=` in double quotes; `hostKeyWords(pin)` (`:268`) writes the six words, five for an older client (no `KnownHostsCommand`); `pinPathRefusal` (`:185`). `checkedPinOf(out, file)` (`itestSshd.cjs:218`) asks the `ssh` of `process.env.PATH` with the product's asker, then `checkedPin` | read |
| F15 | **The shim finds the real client on `process.env.PATH`.** `realSsh(shimDir)` (`itestPinnedRoads.cjs:115`) takes the first `ssh` on `process.env.PATH` whose real path is outside the shim's folder; `rigOf` (`:479`) puts the shim's folder first on the rig's `PATH`. So a program that a probe puts first on `process.env.PATH` before `rigOf` and `installShim` becomes "the real client" | read |
| F16 | **The guards that read every script.** Test 33 (`itestInstrument.test.ts:32-40`: a quoted path that ends with `/sshd`, a start of an `sshd`, a config line that opens with one of four keywords); `harnessSites.test.ts:33` (no raw temp call); `itestCallers.test.ts` (the builders get a checked pin); the leftovers guard (`leftovers-check.mjs --profile node --token creds`) | read |
| F17 | **Containers** (`test-leftovers.md` § 5): `--rm`, the prefixed `--name` and the owner label on every container; `ownedName` of `scripts/lib/leftovers.cjs` makes the name | read |
| F18 | **The margin of M11 (d)** is fixed at **5 s** by the stories document (`## E3.S3`). It does not change after a run | read |
| F19 | **The lead's answer Q1.** On the older client: `ssh -G -F /dev/null` with both known-hosts options set to a quoted path that holds `=` prints that path, whole, as the sole value of each option. If it splits the path, the lead stops and records a plan change | read |
| F20 | **K7 of the E1.S1 spec.** `ssh.exe -G` was started from WSL with the argv as separate arguments and `-F none`; `-G` joins the files of a list with a space, so one file and two look the same; the control that tells them apart is a path with ` ~` after a space: quoted, exit 0 and the path whole; bare, exit 255 and `tilde_expand` | read |

## 1. The decisions of this brief

### 1.1 Where the probes live

New files in `src_vs_code/scripts`, kept after the story: the rows of E3.S4 and later reuse what worked (the stories document: "the install's
stand-in as E3.S3 proved it").

| File | Holds |
|---|---|
| `itestFeasibility.cjs` | the entry: `node --import ./scripts/lower-priority.mjs scripts/itestFeasibility.cjs <probe>…`; its own `check(name, ok, detail)` as `ssh-agent-itest.cjs:78`; `harnessScope.run(main)`; one `sectionScope` and one `ownedDir(section, 'probe', { parent: shortSocketRoot() })` per probe; the record of each probe; the last line. An unknown probe name ends at once with exit 2 and names the legal names |
| `itestProbeInstall.cjs` | P1, and the stand-in as functions that E3.S4 can call (`installStandIn(rig, nonce)` answering `{ extra, bin, records, marker }`, and the before/after listing) |
| `itestProbeResolver.cjs` | P2: the host driver (the container's start, stop and removal) and the part that runs inside the container; the resolver |
| `containers/e3-resolver.Containerfile` | P2's image (batch B only). It names no path that ends with `/sshd` |
| `itestProbeOlderClient.cjs` | P3: the unpacking into the owned folder, the wrapper, the checks, the `-G` check of Q1 |
| `itestProbeJump.cjs` | P4 |
| `itestProbeWindows.cjs` | P5 |
| `itestProbeForced.cjs` | P6 |
| `itestProbeNeverAnswers.cjs` | P7 |

The probe names on the command line: `install-stand-in` (P1), `resolver` (P2), `older-client` (P3), `jump-config` (P4), `windows-client`
(P5), `forced-zero` (P6), `never-answers` (P7). No `package.json` script: the probes are run by hand, and `package.json` ships in the vsix.

### 1.2 Section 10's helpers are exported, not copied (`reuse-first.md`: widen the existing thing)

- `itestPinnedRoads.cjs:545` becomes `module.exports = { livePinnedRoads, productOf, realSsh, installShim, writeClientConfig, recordedStarts,
  openLeg, startsOf, finishes, makeKeys, knownHostsDigest, rigOf };`. No other line of those functions changes.
- `openLeg(rig, port)` (`:183`) gets ONE optional last parameter, `parts = {}`, spread into the object that it hands to
  `product.world.world(...)` AFTER its own keys, so that a probe can give `answer` (P1). With no `parts`, the object is what it was: section
  10 runs as before (the shared done-when of the stories document).
- No copy of `realSsh`, of the shim or of the rig in a probe file.

### 1.3 The record of a probe

- A probe that started a counterpart ends with `recordIdentities(check, rig, real)` (`itestIdentities.cjs:115`): R1 to R6 as section 10.
- A probe with no counterpart (P5, P7; the `-G` part of P3 is in a probe that has one) calls `identitiesOf(rig, real)` (`:97`), writes it as
  `identities.json` into its owned folder, prints it as `identities <json>`, and checks R1 (`trackedChanges === ''`) and R2 (the commit and
  the pin of the shared rules are 40 hex digits) itself. It does NOT run R3 to R6: they need a listener.
- Every probe adds a field `probe` to its record: `{ name, executables: [{ role, path, version, sha256 }], configs: [{ file, sha256 }] }` for
  what E3.S2's record does not see (the stand-ins of P1, the forced command of P6, the unpacked older client and its libraries of P3,
  `ssh.exe` of P5, the program of P7, the image of P2). A value that could not be read is `null`, never `0` or `''`.

### 1.4 The last line of a probe

After its checks, each probe prints ONE line: `probe <name>: worked` when every check of it passed, or
`probe <name>: FAILED — <the name of its first failed check>`. The entry exits 0 when every probe that it ran printed `worked`, and 1
otherwise. The judge reads the whole output, not only that line. A check that is "recorded" below is printed as `info  …`, never as `ok`,
and decides nothing.

## 2. The probes

For each probe: what it must show; the checks and the line that says it worked; the command; what it needs; what a failure means. The
common start of every probe that has a counterpart: `makeKeys`, `writeClientConfig` (or the probe's own handed config, written to
`rig.clientConfig`), `installShim`, K1 started by `startServingSshd(rig, 'k1', rig.k1, undefined, extra)`.

The command of batch A, in `src_vs_code`, after `node ../.agents/conventions/tools/low-priority.mjs npm run compile` (read its exit first):

```
CREDS_ITEST_SSHD="$HOME/.cache/creds-itest-sshd/sshd-wrap.sh" CREDS_ITEST_SSHD_CONFIG="$HOME/.cache/creds-itest-sshd/extra.conf" \
  node --import ./scripts/lower-priority.mjs scripts/itestFeasibility.cjs <probe>
```

Run each probe alone first, then the five of batch A in one run (`windows-client never-answers forced-zero jump-config install-stand-in`).
Keep the whole output of each run.

### P1 · The install's stand-in (M1, M2 *the switch*, M3 *the switch*, M6, M7, M9, M11 (b))

**What it must show** (the parent's four conditions, each by its own evidence): (1) the install run passes the real authentication of the
real `sshd`, and a command of it runs there to its end; (2) what runs writes only inside the owned folder; (3) the published installer is
not fetched; (4) the run proves (2) and (3) itself: `/usr/local/bin/creds` and every `/tmp/creds-install.*` are listed with size, time and
SHA-256 before and after and are the same (an absent file is listed as absent), and the recorded starts show that the real download program
did not start.

**The stand-in** (the parent's first candidate), in the probe's owned folder `<dir>/standin/`:
- `bin/curl`: records its start (pid, start time, argc, each argument ended by a NUL byte, as the shim does, `itestPinnedRoads.cjs:128-141`)
  into `records/`, writes no file, fetches nothing, exits 0.
- `bin/sh`: records its start the same way, then `exec`s the real `/bin/sh` with `<dir>/standin/installer.sh` (by its absolute path; never
  `sh` by `PATH`, which would be itself).
- `installer.sh`: writes `marker` with the run's nonce (a random UUID of this run), writes `env` with `PATH` and the answers of
  `command -v curl` and `command -v sh`, and prints `creds-install: installed <dir>/standin/bin/creds`.
- The login's `PATH`: the `extra` line `SetEnv PATH=<dir>/standin/bin:/usr/local/bin:/usr/bin:/bin` of the serving launcher (the lead's
  answer Q4). `sshd_config(5)` says that `SetEnv` overrides the default environment (read, not measured here).
- **The second candidate**, only if the first one fails P1.2 (the login's `PATH` is not the stand-in's): the `extra` line
  `ForceCommand <dir>/standin/path.sh`, where `path.sh` sets `PATH` as above and `exec`s `"$SHELL" -c "$SSH_ORIGINAL_COMMAND"`. It keeps the
  four conditions (the stories document lets this brief choose another instrument that keeps them). Record which candidate worked.

**The legs.** (a) *The client alone:* `installCommand()` (read from the compiled product, never typed) through the shim, with the words of a
pin of K1 (`hostKeyWords(await checkedPinOf(out, pinFile))`, the pin file holding K1's line), `-p <port>`, `<me>@127.0.0.1`. It finds the
fault fast when the road would hide it. (b) *The road:* `openLeg(rig, port, { answer })` with `answer` returning the button that
`confirmationFor(interpretProbe(<the probe's stdout>), ROW.node.name).action` names (read from the product), then
`world.click(w, 'installRemoteCli')` within 200 s (`finishes`). The listing of (4) is taken before (a) and after (b).

**The checks.**
- P1.1 K1 logs one `Accepted publickey for <me>` for (a), and two for (b) (the probe and the install run): the install run passed the real
  authentication.
- P1.2 `<dir>/standin/env` says `PATH=<dir>/standin/bin:…` and `command -v curl` and `command -v sh` both answer the stand-ins.
- P1.3 The stand-in `curl`'s record holds exactly ONE start per install run, whose argv is `-fsSL`, `INSTALLER_URL` (read from the product),
  `-o`, `/tmp/creds-install.<n>.sh`.
- P1.4 The stand-in `sh`'s record holds exactly ONE start per install run, whose argv is that same `/tmp/creds-install.<n>.sh`.
- P1.5 `marker` holds the run's nonce; in (a) the stdout holds `creds-install: installed <dir>/standin/bin/creds`; in (b)
  `interpretInstall` answered `installed` with that path, the world shows the product's message for an installed `creds`, and the shim's
  record holds one question `ssh -V` and two connection starts (the probe, the install run).
- P1.6 The listing of `/usr/local/bin/creds` and `/tmp/creds-install.*` is the same before and after: the same names, sizes, times and
  SHA-256.
- P1.7 No file is new outside `<dir>`: the probe lists `/tmp` (depth 1, names only) before and after; a new name is allowed only when it is
  the owned folder's or another process's that the probe did not start (record each new name; the judge reads them).
- P1.8 The record of identities (R1-R6), with `probe.executables` = the three stand-ins by SHA-256, and `probe.configs` = the `extra` text.

**Worked when** P1.1 to P1.8 pass for one candidate, and the last line is `probe install-stand-in: worked`.

**Needs.** Nothing new. The counterpart logs in as the user of this run, with its real login shell and home (as section 10 does); the
probe does not read or write the person's `~/.ssh`.

**If it fails.** A fault of the probe's own code: repair it and run again; both runs go into the commit body. Candidate 1 fails P1.2:
candidate 2. Both candidates fail, or a condition of (1)-(4) cannot be shown: STOP, to the lead. The stand-in is the instrument of M1, M2
*the switch*, M3 *the switch*, M6, M7, M9 and M11 (b): without it those rows cannot run the install to its end, the gate gets smaller, and
the lead records a plan change (the second of epoch 3: the plan stops) and asks the owner after the question consultants (decision 18).

### P2 · A resolver that the run owns, whose answer the client takes as secure (M10)

**Batch B. Starts only after the lead's answer to QA and the owner's word on D3 and D4.**

**The way** (the stories document's choice): a container that the run starts, with the counterpart, the client, the resolver and the
harness of the roads INSIDE it, because a port that `wslc` publishes cannot be reached from the distro (F5). The second way (an unpacked
package) is probed only if the container cannot be had, and only with the lead's answer to QB.

**The resolver** is the probe's own Node code inside the container (`node:dgram` on `127.0.0.1:53`, as root): it answers an `A` question
for the counterpart's name with `127.0.0.1`, an `SSHFP` question for that name with K2's two SSHFP records (SHA-1 and SHA-256 of K2's
ed25519 key, as `ssh-keygen -r <name> -f k2_key.pub` prints them), with the AD bit set, and records every question (name, type, time). The
container's `/etc/resolv.conf` says `nameserver 127.0.0.1` and `options trust-ad edns0` (`wslc run --dns 127.0.0.1 --dns-option trust-ad
--dns-option edns0`, or written by root at the container's start). Why own code and not a package: the parent asks for "a resolver that the
run owns ... and records each question"; a responder of 60 lines records every question in the run's folder and needs no download. The
client takes the answer as secure because of the AD bit (F2). Inside the container the harness and the counterpart run as one non-root user
that the container's start makes (`useradd`), as on the rig; the resolver alone runs as root.

**Step 2.0 (no download; after QA).** With the local image `python:3.12-slim` and `--pull never --rm`, the prefixed name and the owner label
(F17): (a) `cat /etc/os-release`; (b) can `wslc run -v` mount this worktree read-only (a path that `wslc.exe` can read, such as
`\\wsl.localhost\<distro>\…`)? Record the form that worked, or that none did; (c) do `--dns` and `--dns-option` write `/etc/resolv.conf` as
asked? (d) whether a root process can bind `127.0.0.1:53` is NOT tried in this step: the local image has no Node, and Python is
not used. It is P2.2, on the image of D3. Record (a)-(c) in the commit body. If (b) fails, the tree goes in with `wslc cp` of a `git archive` of HEAD plus the compiled `out/` and
`node_modules` (record the SHA-256 of each archive).

**Step 2.1 (after D3 and D4).** Build the image once: `wslc build -f scripts/containers/e3-resolver.Containerfile -t
creds-itest-e3-resolver:<YYYYMMDD> <context>`; `FROM node:22-bookworm-slim`, `apt-get install --no-install-recommends openssh-client
openssh-server procps` (`ps` is needed by `endServer`). Record the image id and the versions that `dpkg-query -W openssh-client
openssh-server` prints. Then run the probe: the host part starts the container (`--rm`, name, label, the mount, `--dns`, `-u` as
needed), runs `node --import ./scripts/lower-priority.mjs scripts/itestFeasibility.cjs resolver --inside` in it with no `CREDS_ITEST_SSHD`
(the image's `sshd` is the default of `lib/sshdRun.cjs`), and removes the container by its exact name on every path (a `finally`, and the
scope's `after`).

**The checks** (inside, unless named).
- P2.1 (host) The container started from the image named by its id, with `--rm`, the prefixed name and the label; after the probe,
  `wslc list` shows no container of that name.
- P2.2 The resolver answers: `getent hosts <name>` answers `127.0.0.1`, and the resolver's record holds that `A` question.
- P2.3 *The control of M10:* the control client with E1's words (`StrictHostKeyChecking=yes`, `UserKnownHostsFile=<pin>`,
  `GlobalKnownHostsFile=<pin>`, the pin holding K1's line for `[<name>]:<port>`), `-v`, a handed config with `VerifyHostKeyDNS yes`, to
  `<name>` where K2 answers: exit code 0; K2 logs one `Accepted publickey`; its stderr holds `found 2 secure fingerprints in DNS` (or the
  count it found) and `matching host key fingerprint found in DNS`; the resolver's record holds the SSHFP question for `<name>`.
- P2.4 The control's opposite, the same client with `VerifyHostKeyDNS no`: exit code 255 with `Host key verification failed.`, K2 logs
  no authentication attempt. Without it P2.3 could not have failed.
- P2.5 *The harness of the roads runs inside:* `openLeg(rig, port)` and one click of *Install creds on host*, pinned to K1, K1 answering:
  the install reaches its question (the check of `installAsks`, `itestPinnedRoads.cjs:307-320`, by its own words), and the shim recorded
  the question `ssh -V` and the probe.
- P2.6 The record of identities inside (R3-R6; R1 and R2 are answered on the host from the same commit, because the image has no `git`)
  plus `probe.executables` = the image id, `/usr/bin/ssh` and the `sshd` inside with their `-V` and SHA-256, the resolver's file.

**Worked when** P2.1 to P2.6 pass and the last line is `probe resolver: worked`.

**If it fails.** Step 2.0 or 2.1 shows that the container cannot be had (no mount and no copy works, or the image cannot be built): the
lead's answer to QB decides whether the second way is probed. P2.3 cannot be made to pass (the client does not take the answer as secure):
STOP, to the lead. M10 then cannot be measured: a plan change that makes the gate smaller (decision 18: the owner, after the question
consultants).

### P3 · A client older than 8.5 that runs here (M11); with the `ssh -G` check of a quoted `=` (the lead's answer Q1)

**Batch B. Starts only after the owner's word on D1 and D2.**

**The way** (the stories document's choice): an unpacked package. The two `.deb` files of D1 and D2 are kept with their `SHA256SUMS` in a
folder of their own (`~/.cache/creds-itest-oldssh/deb/`, like F1's `deb/`), named by a NEW run parameter `CREDS_ITEST_OLD_SSH_DEBS` (an
absolute path; refused, naming the variable, when it is not one, as `lib/sshdRun.cjs` refuses). At EACH run the probe checks each file's
SHA-256 against `SHA256SUMS`, unpacks both with `dpkg-deb -x` into `<dir>/oldssh/root/`, and writes `<dir>/oldssh/bin/ssh`:
`#!/bin/sh` and `LD_LIBRARY_PATH=<dir>/oldssh/root/usr/lib/x86_64-linux-gnu exec <dir>/oldssh/root/usr/bin/ssh "$@"`. So the unpacked program
lives in the owned folder (the stories document, settled item 9), and it goes with that folder. Then the probe puts `<dir>/oldssh/bin`
FIRST on `process.env.PATH`, and only then calls `rigOf` and `installShim` (F15). The container is the second way, only if this way fails.

**The checks.**
- P3.1 The wrapper `-V` ends with 0 and prints `OpenSSH_8.4p1 …, OpenSSL 1.1.1…` (the version of D1).
- P3.2 `installShim` resolved the wrapper as the real client (`realSsh` answered `<dir>/oldssh/bin/ssh`), and the product's asker
  (`pinClientAsker()({ program: 'ssh', env: rig.env })`, through the shim) answered `{ kind: 'older', token: 'OpenSSH_8.4' }`; the shim
  recorded that start as `-V`.
- P3.3 A login through the shim with the words that the product writes for this client (`hostKeyWords(await checkedPinOf(out, pinFile))`:
  five pairs, no `KnownHostsCommand`), `-p <port>`, `<me>@127.0.0.1 true`, K1 answering: exit code 0, K1 logs one `Accepted publickey`.
- P3.4 *The lead's check (Q1):* `ssh -G -F /dev/null` through the wrapper, with the words of `hostKeyWords(checkedPin(<dir>/data=prod/keys/
  known_hosts-e1, older))` and `127.0.0.1`: exit code 0, and the output holds the line `userknownhostsfile <dir>/data=prod/keys/known_hosts-e1`
  and the line `globalknownhostsfile <dir>/data=prod/keys/known_hosts-e1`, each exactly so: the path whole, as the sole value.
- P3.5 (recorded) The same `-G` with the BARE word `UserKnownHostsFile=<path>` and `GlobalKnownHostsFile=<path>`: what the two lines say
  (the docblock of `checkedPin` reads that 8.4 splits it at `=`; this is the first time it is run).
- P3.6 The record of identities (R1-R6; the client entry is the wrapper), with `probe.executables` = the unpacked `usr/bin/ssh`, each
  `.so` file under `usr/lib/x86_64-linux-gnu`, and the two `.deb` files, each by SHA-256, and `probe.configs` = the wrapper's text.

**Worked when** P3.1 to P3.4 and P3.6 pass and the last line is `probe older-client: worked`.

**If it fails.** P3.1 to P3.3 cannot pass with the unpacked package: the container way (the image `debian:bullseye-slim` and the same two
packages: a new download, a new owner question). Both fail: STOP, to the lead; M11 cannot be measured, a plan change that makes the gate
smaller. **P3.4 prints a split path: STOP at once, to the lead.** That is not a failed instrument: it is the finding of Q1 (the product's
words are not one file on an older client), and the lead records the plan change (the lead's answer Q1).

### P4 · A handed config that the nested client of a jump host reads too (M5 f)

**What it must show:** the nested `ssh` that a `ProxyJump` starts reads the config that the harness handed (the shim's `-F`), not the
person's files: it refuses the jump host by the known-hosts file that only that config names, and passes when that file holds the right key.

**Set-up.** Two counterparts: D (the destination, K1) and J (the jump host, a third host key `kj_key` made by the probe with `ssh-keygen` as
`makeKeys` does). The probe writes its own handed config to `rig.clientConfig` (the shim hands it with `-F`), the specific blocks first:
`Host jump` (`HostName 127.0.0.1`, `Port <J's port>`, `User <me>`, `IdentityFile <user key>`, `IdentitiesOnly yes`, `BatchMode yes`,
`StrictHostKeyChecking yes`, `UserKnownHostsFile <dir>/jump_known_hosts`, `GlobalKnownHostsFile /dev/null`); `Host 127.0.0.1`
(`ProxyJump jump`); then `Host *` with the two `/dev/null` lines of `writeClientConfig`. The outer client is started through the shim with
the pinned words of a pin of K1 for `[127.0.0.1]:<D's port>` (`hostKeyWords(await checkedPinOf(out, pinFile))`), `-p <D's port>`,
`<me>@127.0.0.1 true`.

**The checks.**
- P4.1 *Refused:* `jump_known_hosts` holds K2's line for `[127.0.0.1]:<J's port>`. The outer ends with 255; its stderr holds
  `Host key verification failed.` and a line that names `<dir>/jump_known_hosts` (the nested client's `Offending … key in <file>:<n>`); J logs a
  connection and no authentication attempt; D logs no connection.
- P4.2 *The control, accepted:* `jump_known_hosts` holds J's own line. The outer ends with 0; J logs one `Accepted publickey`; D logs one
  `Accepted publickey`. Without it P4.1 could not tell a refusal by the handed file from a jump that never worked.
- P4.3 (recorded) Whether the shim recorded the nested start (an argv with `-W`) and what its argv holds (`-F <rig.clientConfig>`). OpenSSH
  starts the nested client as `ssh` through the shell; if it is started by another path, the record has no such start. Not a condition.
- P4.4 The record of identities (R1-R6: two listeners, one program), with `probe.configs` = the handed config and `jump_known_hosts` of each leg.

**Worked when** P4.1, P4.2 and P4.4 pass and the last line is `probe jump-config: worked`.

**If it fails.** P4.2 fails: the jump set-up is wrong; repair it in the probe. P4.1 fails while P4.2 passes (the nested client did not read
the handed file): STOP, to the lead; M5 (f) as written cannot be measured (a plan change).

### P5 · The Windows client from this machine (M13)

**What it must show:** the harness starts `ssh.exe` of the owner's Windows from WSL, with the argv as separate arguments (Node's `execFile`,
no shell), reads its `-G` output, and tells one file from two by K7's control (F20). The client alone; no login.

**The words.** The client is asked as the product asks it: `pinClientAsker()({ program: <ssh.exe's path>, env: process.env })` must answer
`knows` (OpenSSH_for_Windows_9.5). The pin path is written as the product writes it on Windows: `path.win32.join(<storage>, 'keys', <pid>,
'known_hosts-e1-<uuid>')` with the storage folder `C:\Users\<you> probe\AppData\Roaming\Code\User\globalStorage\probe` (a made-up user
name: never the owner's), then `checkedPin(path, client)` and `hostKeyWords(pin)`. The argv: `-G`, `-F`, `none`, the words, `-p`, `22`,
`probe-host`.

**The checks.**
- P5.1 `ssh.exe -V` (through `execFile`, 10 s) prints `OpenSSH_for_Windows_9.5p2, LibreSSL 3.8.2`; the asker answered `knows`.
- P5.2 The `-G` run ends with 0; its lines (CR removed) hold `stricthostkeychecking true`, `userknownhostsfile <path>` and
  `globalknownhostsfile <path>` (the path whole), `verifyhostkeydns false`, `loglevel ERROR`, and no line that starts with
  `knownhostscommand`.
- P5.3 K7's control: a storage folder with ` ~` after a space (`C:\Users\<you> probe\x ~y\…`): with the product's word (quoted) exit 0 and
  the path whole; with the bare word exit 255 and a line with `tilde_expand`. So the probe can tell one file from two.
- P5.4 The record (`identitiesOf`, R1, R2), with `probe.executables` = `ssh.exe` by its path, `-V` line and SHA-256 (read through `/mnt/c`).

**Worked when** P5.1 to P5.4 pass and the last line is `probe windows-client: worked`.

**If it fails.** Interop does not start `ssh.exe` from the harness, or the output cannot be read: STOP, to the lead; M13 then needs another
place to run (the owner's Windows directly), and that is a plan change. The rows' cases (a)-(c) and the UNC folder are M13's, not this probe's.

### P6 · A forced command that writes the line and then runs the command it was asked for, to 0 (M5 h)

**What it must show:** a counterpart whose login is accepted, whose remote side writes `Host key verification failed.` to its stderr and
then runs the command that the client asked for, so that the run ends with that command's exit code, 0.

**Set-up.** K1 with the `extra` line `ForceCommand <dir>/forced/zero.sh`. `zero.sh`: `printf '%s\n' 'Host key verification failed.' >&2`,
then `exec "$SHELL" -c "$SSH_ORIGINAL_COMMAND"` (the login shell, which would have run the command without the forced command). Its
control `<dir>/forced/fail.sh` on a second counterpart K1b (the same host key, its own port): the same line, then `exit 255` (the shape of
M5 g, which is the control of (h) in M5).

**The checks.**
- P6.1 `probeCommand()` (read from the product) through the shim, with the pin words of K1: exit code 0; the stderr holds a line that is
  exactly `Host key verification failed.`; K1 logs one `Accepted publickey`.
- P6.2 Its stdout, read by `interpretProbe`, equals that of the same command against K1 with no `extra` (a third counterpart, same key):
  the command that was asked for ran, whole.
- P6.3 The control on K1b: exit code 255, the same stderr line, one `Accepted publickey`.
- P6.4 (recorded) What the product answers: `hostKeyTold(pin, stderr, name, 0)` and with 255. This is C19's unit-tested rule, recorded as a
  cross-check, not a condition of the instrument.
- P6.5 The record of identities (R1-R6), with `probe.executables` = `zero.sh` and `fail.sh` by SHA-256 and `probe.configs` = the `extra`
  texts.

**Worked when** P6.1 to P6.3 and P6.5 pass and the last line is `probe forced-zero: worked`.

**If it fails.** `sshd` does not run the forced command so (P6.1) or the original command does not run whole (P6.2): repair the script in the
probe (the shell, the quoting). Still failing: STOP, to the lead; M5 (h) cannot be measured, a plan change.

### P7 · A program that never answers `-V`, ended by the runner's limit (M11 d)

**What it must show:** a program that records its start, answers nothing and does not end by itself is asked `-V` by the product's own
asker, the runner's limit ends it, and the probe can time it and see it gone by its pid and start time.

**Set-up.** `<dir>/never/ssh`: records its start (pid, start time, argc, argv, NUL-ended, as the shim) into `<dir>/never/records/`, then
`exec sleep infinity`. The probe puts `<dir>/never` first on `process.env.PATH`, then `rigOf` and `installShim` (F15). Then, cold (a new
asker), `t0`, `pinClientAsker()({ program: 'ssh', env: rig.env })`; `t1` when it answers; the program's pid and start time are read from
its own record; `t2` when that pid no longer runs as that process (`alive` of `itestServing.cjs:97`, every 50 ms, at most 30 s).

**The checks.**
- P7.1 The shim recorded exactly ONE start, whose argv is `-V`, and the program recorded one start with the same pid.
- P7.2 The asker answered `{ kind: 'unreadable', exitCode: null }`.
- P7.3 The program is gone by its recorded pid and start time (never by name) within 30 s.
- P7.4 (recorded, compared with the margin of F18) `t1 - t0` and `t2 - t0`, each against 10 s to 15 s.
- P7.5 The record (`identitiesOf`, R1, R2), with `probe.executables` = the program by SHA-256.

**Worked when** P7.1 to P7.3 and P7.5 pass and the last line is `probe never-answers: worked`. A time of P7.4 outside 10 s to 15 s does not
make the probe fail: the instrument worked, and the time is a finding for the lead (M11 (d) would not pass as written). Do not change the
margin, and do not change the limit of the product.

**If it fails.** The program does not get the question, or it is not ended (P7.3): STOP, to the lead; M11 (d) cannot be measured, a plan
change.

## 3. What a failed probe means (decision 18)

1. **A fault of the probe's own code** (a wrong path, a wrong quote, a wrong order of set-up): repair it in a new commit, run the probe
   again, and put both runs in the commit body. This is no plan change.
2. **The way that the stories document names first fails, and it names a second way** (P1: the second candidate; P2: the second way after
   QB; P3: the container): try the second way. This is no plan change: the stories document chose both.
3. **Every named way fails, or a probe shows that its instrument cannot show what its rows need:** STOP. Do not try a third way, do not
   make a row weaker, do not mark a row "not measured". Report to the lead: the probe, the checks that failed with their output, what was
   tried. The lead records the plan change in the parent's ledger. It is the SECOND entry of epoch 3, so the whole plan stops for a re-review
   (`plan-change-control.md`). If it makes the release gate smaller (a row that cannot be measured), the owner decides, after the question
   consultants (decision 18). A probe that fails is not a skipped row.
4. **A probe that worked and found something about the product** (P3.4 splits the path; P7.4 a time outside the margin): the probe is
   "worked"; report the finding to the lead at once. P3.4 stops the plan by the lead's answer Q1.

## 4. The order

1. **Before any probe:** the exports and `openLeg`'s optional parameter (§1.2), the entry and the five probe files of batch A, in ONE
   commit (C1). Then `npm run itest:ssh-agent` with F1's two variables, from that clean tree: section 10 passes as before (the same count of
   `ok` lines as E3.S2's run, 62; a different count is reported, not hidden).
2. **Batch A, no download, in this order:** P5 (no counterpart, interop only), P7 (no counterpart), P6 (one counterpart and its control),
   P4 (two counterparts), P1 (the road to the end of the install). The order goes from the fewest moving parts to the most, so that a fault of
   the common parts (the entry, the record) shows in the simplest probe first.
3. **The questions and the downloads**, at once after C1, while batch A runs: QA and QB to the lead; the list of *Every download the owner
   must allow* through the lead to the owner.
4. **Batch B, after the owner's word:** P3 (two small packages), then P2 (step 2.0 after QA; step 2.1 after the image).

## 5. The commits

Each commit stages by path, and its body says what was OBSERVED (`git-workflow.md`). Do not push.

- **C1** `test(ssh): G1 E3.S3 — the probes of batch A (the install's stand-in, the jump config, Windows -G, the forced command to 0, the
  program that never answers), and section 10's helpers exported`. Before it: `node --check` of each new and changed script; `npm run
  compile` (read its exit first); the suites `itestInstrument`, `harnessSites`, `itestCallers`, `harnessScope`; `npm test` whole; the
  leftovers guard from the repository root (`node .agents/conventions/tools/leftovers-check.mjs --repo . --profile node --token creds
  --identity "the developer-credentials server and extension"`). The body lists the counts.
- **C2** `docs(tests): G1 E3.S3 — what batch A showed` — `research/module_tests.md` (§6 below) and, in the body, per probe: the command, the
  last line, the `ok`/`FAIL`/`info` lines, the times of P7.4, which candidate of P1 worked, and the `identities` line with home paths as `~`.
  A failed probe is in the body too, with what was tried; then STOP (§3).
- **C3** (batch B, after the owner's word) `test(ssh): G1 E3.S3 — the probes of the older client and of the owned resolver` — the files of
  P3 and P2 and the `Containerfile`, with the same checks as C1.
- **C4** `docs(tests): G1 E3.S3 — what batch B showed` — as C2, with the versions of the packages and the image id.

## 6. What goes into `research/module_tests.md`

Below *The counterpart of the real runs (E3.S2)*, a paragraph **The instruments of E3's rows, probed (E3.S3)**: for each probe that worked,
the instrument, where it lives (the file and the function a row calls), the exact command, what it showed (by check name) and its identities
(the SHA-256 of what it ran, the versions); and for each probe not yet run or failed, that it is so and why. Write it as "seen when it was
probed, <date>, commit <sha>". It is NOT §10 of the parent and passes no row. Home paths as `~/…`.

## 7. What is NOT measured by E3.S3

- **No row.** M1-M14 are not run; no pass criterion is read or changed; nothing goes into §10.
- **No road to its end except the install of P1.** The bridge and its socket check run in no probe; P2.5 runs the install to its question only.
- **CI runs no probe.** The probes run on this machine only (the `sshd` 10.2p1 of F1; P2's `sshd` of Debian 12), never on CI's 9.6p1.
- **No login on Windows** (P5 is the client alone, as M13).
- **The older client on the roads** (M11 (b)-(d)) and the resolver on the roads (M10) are rows of E3.S9. P3 shows a login and `-G`; P2 shows
  the control and one road to its question.
- **That `SetEnv` and `ForceCommand` behave the same on CI's `sshd`.** P1 and P6 run on 10.2p1 only; the rows that use them in CI show it.
- **DNSSEC validation.** P2's resolver SETS the AD bit; nothing validates a signature. What M10 asks is what the client takes as secure.
- **The times of P7 on another machine,** and any time under load other than the lowered priority of this run.

## What grows

| What | Size (projected) | Who retires it |
|---|---|---|
| each probe's owned folder (`/tmp/…probe…`) | a few MB (keys, configs, logs, records; P3's unpacked packages about 6 MB) | the probe's section scope, at its end; the janitor (token `creds`) after a killed run |
| `~/.cache/creds-itest-oldssh/deb/` (D1, D2) | about 2.5 MB | kept until the parent is promoted; then removed by the lead, as F1's folder |
| the image `creds-itest-e3-resolver:<date>` (D3, D4) | about 250-300 MB (not measured) | kept for E3.S9 and E3.S10; `wslc rmi` by the lead after E3's merge. Not swept by the janitor (F6) |
| a P2 container | none after the run (`--rm`, removal by name on every path) | the probe; NOT the janitor (F6, QA) |

## Every download the owner must allow

Nothing below is on this machine. Each needs the owner's word before it is fetched. Exact versions that cannot be read without a download
are read from the signed index first and go into the owner question with their SHA-256.

| # | What | Version | Source | Size | For |
|---|---|---|---|---|---|
| D1 | `openssh-client` (amd64) | `1:8.4p1-5+deb11u3`, or the later `deb11uN` that the Debian 11 (bullseye) index lists | `deb.debian.org/debian` pool or `security.debian.org/debian-security` (bullseye) | about 0.9 MB | P3: the client older than 8.5. 8.4 is the version that the lead's Q1 and the docblock of `checkedPin` read, not run |
| D2 | `libssl1.1` (amd64) | `1.1.1w-0+deb11u1`, or the later `deb11uN` that the index lists | the same | about 1.5 MB | P3: `libcrypto.so.1.1`, absent here (F7) |
| D1-D2 check | the bullseye `InRelease` (and the `Packages` index of the suite that holds each file), and `debian-archive-keyring` `2025.1ubuntu1` from the Ubuntu archive (`apt-get download`, unpacked, never installed) to check its signature | — | Debian and Ubuntu archives | `InRelease` about 0.1 MB; a `Packages.xz` up to about 8 MB; the keyring well under 1 MB | to check D1 and D2 against a signed index, not against a web page |
| D3 | the image `docker.io/library/node:22-bookworm-slim` | the digest that the registry serves at the pull (recorded) | Docker Hub | not known here (read at the pull) | P2: Node 22 (CI's major) and Debian 12 in the container |
| D4 | `openssh-client`, `openssh-server`, `procps` and their dependencies, `--no-install-recommends` | Debian 12 (bookworm) versions at the build, recorded with `dpkg-query -W` | `deb.debian.org`, inside the image build | not known here (a few MB) | P2: the counterpart, the client and `ps` inside the container |

The alternative to D1 and D2, if the owner prefers the keyring that is already here: Ubuntu 20.04 (focal) `openssh-client` 1:8.2p1-4ubuntu0.N
and `libssl1.1` 1.1.1f-1ubuntu2.N from `archive.ubuntu.com` (`focal-updates`/`focal-security`), checked with the Ubuntu keyring of F7. It is
OpenSSH 8.2, not the 8.4 that Q1 read.

## Done when (each item can be counted)

- [ ] C1 is committed; section 10 passes as before on it, from a clean tree; the guards of C1 are green.
- [ ] Each of P1, P4, P5, P6, P7 ran from a commit with an empty `git status --porcelain --untracked-files=no`, printed its last line and
      its `identities` line, and the run is in C2's body; P7.4's two times are recorded.
- [ ] P3 and P2 ran after the owner's word (or the owner's no is recorded, and the lead has it as a plan change by decision 18).
- [ ] An Opus judge read each result: worked, with its evidence and identities; or failed, with what was tried, sent to the lead (§3).
- [ ] `research/module_tests.md` says, per probe, what worked, where it lives, the exact command and its identities, as "seen when it was
      probed".
- [ ] Nothing of the runs is left outside the owned folders (the leftovers guard, and `wslc list` for P2).
- [ ] No row was built.

## Opus review checklist (the judge of each result)

1. Did the probe run from its commit (R1 empty) through the instrument of E3.S2 (every counterpart by `startServingSshd`, every `sshd` line
   by `extra`)?
2. Does each "worked" rest on its checks' own evidence (a log line, a record, a hash), and not on an exit code alone?
3. Is every control there and did it show what it is for (P2.4, P4.2, P5.3, P6.3)?
4. Are the four counts kept apart (decision 15)?
5. Is every identity whole (path, version, SHA-256), and are home paths written as `~` in committed text?
6. For a failure: was it a fault of the probe (repaired), a first way that has a second (tried), or an instrument that cannot work (sent to
   the lead, nothing made weaker)?

## Questions for the lead

**The lead's answers (2026-11-23):** QA, accepted, not a plan change: P2's container has `--rm`, the prefixed name and the label; the probe removes it by its exact name in a `finally` and in the scope's `after`, and each commit body records `wslc list` after the run. QB is decided only if P2's container cannot be had (step 2.0 or 2.1); no namespace is probed before that. The meaning of "secure" in P2: the AD bit of the answer, taken by the client under `options trust-ad`, is the signal that `ssh` itself reads for an SSHFP answer, so P2 uses it; a DNSSEC validation of the resolver's own is not asked. The downloads D1-D4 are asked of the owner; batch A (P5, P7, P6, P4, P1) needs none and runs first.

**QA · The container runtime of this machine is not swept by the janitor (settled item 9 asks for this question).**
- The stories document, settled item 9: "A container runtime that the janitor does not read would leave a container that nobody sweeps:
  E3.S3 says so if it chooses one, and it is then a question for the lead."
- What is so: containers here run with `wslc` (the owner's rule: never Docker); the janitor sweeps through `docker` alone and says
  "janitor: no docker binary — containers, volumes and networks not swept" (`janitor.sh:317`; F6). So a P2 container that a killed run
  leaves is swept by nobody. `--rm`, the prefixed name and the label (F17) still mark it, and the probe removes it by its exact name on every
  path it controls.
- My reading: not a plan change if you accept that: P2's container has `--rm`, the name and the label, the probe removes it in a `finally`
  and in the scope's `after`, and the commit body records `wslc list` after each run. If you do not accept it, the container way cannot be
  used here, and P2 goes to QB. Which one?

**QB · M10's second way needs a namespace on this machine: is it still "an unpacked package"?**
- The parent, *Where the rows run*: "M10 where the run owns the resolver, and M11 where a client older than 8.5 runs: a container that the
  run starts, or an unpacked package; the stories document says which." The stories document: "The second way, an unpacked package, is
  probed only if the container cannot be had, and only with evidence that the client of the run asks that resolver."
- What is so: the client asks the name server of `/etc/resolv.conf` (F2, F3), which is WSL's (an address of its own); no variable names another.
  An unpacked resolver alone is therefore never asked. The client asks it only inside a mount namespace whose `/etc/resolv.conf` names it,
  and the resolver needs port 53 there: a user, mount and network namespace (`unshare`; F8), with the counterpart, the client and the
  harness inside it. The resolver could then be the same Node code as in P2, with no package at all.
- My reading: in doubt this is another instrument than the two that the parent names, so it would be a plan change, and the second of
  epoch 3. It matters only if P2's container cannot be had (step 2.0 or 2.1). Do you want it probed then, as a plan change, or does M10
  then go to the owner as a row that cannot be measured (decision 18)?

## Notes for the lead

- Add the links to this file in the stories document (`## E3.S3`, and its status line) and in the parent (`## Epics`, E3), and the row of
  this file in `todo/README.md`, in one commit with it (`planning-docs.md`: a reference and its target are one commit).
- §1.2 changes section 10's file by one line of exports and one optional parameter, before E3.S4 builds the common rig. It changes no
  behaviour; C1 shows section 10 unchanged.
- P2's resolver is the probe's own Node code that SETS the AD bit (§P2, F2). That is this brief's choice: the parent names no resolver
  program, and it asks for one "whose answer the client takes as secure". If you read "secure" as "validated by DNSSEC", say so before C3.
- P3 uses a new run parameter, `CREDS_ITEST_OLD_SSH_DEBS`, in the way of E3.S2's two (a variable, no tracked file edited).
- The local `sshd` (F1) is handed from `~/.cache`, outside an owned folder, as E3.S2's run handed it; only P3's unpacked client is unpacked
  into the owned folder at each run.

## Notes for the row stories (the Opus review of E3.S3, 2026-11-24)

The review approved E3.S3 (`6b38d5e1..9e417465`): every probe's pass line proves its instrument for its rows, and none of the
deviations is a plan change (D1/D2 at `deb11u3`/`deb11u1`, because the newer files of the signed index answer 404; P2.5's repair
`e6cb6532`, a fault of the probe's own set-up; the split of C3; the kept image's tag, which the rule's "never prefix what must
survive the run" allows; the `--inside` flag). P4.3 is not decision 18: no row counts the nested client's start. These notes are
for the specs of the row stories; none of them changes a pass criterion.

- **L2 (M10, E3.S9).** P2.3's control left out only the `VerifyHostKeyDNS` and `LogLevel` pairs and kept `KnownHostsCommand=none`
  (`itestProbeResolver.cjs:182-191`). M10's control sends E1's words: exactly the three pairs of the setup.
- **L3 (M10, E3.S9, optional).** No run had the AD bit off. A zone flag that clears AD would show "insecure fingerprints" and
  exit 255; M10 does not ask for it.
- **L4 (M10, E3.S9).** The image was built a few minutes before its `Containerfile` was committed (`d9629402`), and its tag holds
  the date (`itestProbeResolver.cjs:26`). Before E3.S9 measures, the image is built again from the committed file, or the build
  records the `Containerfile`'s SHA-256 beside the image id. Its removal (`wslc rmi`) after E3's merge stays in *What grows*.
- **L5 (M11, E3.S9).** No line of the counterpart names the client's version. M11's legs add the extra line `LogLevel DEBUG1` on
  the counterpart and check `remote software version OpenSSH_8.4p1` in its log.
- **P4.3's cause.** OpenSSH starts the nested client of a `ProxyJump` by its own absolute path (argv[0]), not through `PATH`;
  a handed `ProxyCommand <shim>/ssh -W [%h]:%p <jump>` would count it, if a row ever needs that.
