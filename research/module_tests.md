# module_tests — the scenario harnesses, what each drives, and what none of them covers

> The document `.claude/rules/shared/common/scenario-tests.md` asks every repository for: one
> harness that drives the product the way its users drive it, written in the product's own language,
> kept in git, and **described here — including the flows it does not cover.**
>
> This repository had nine harnesses and no document. The rule's second half is the one that bites:
> *owning a harness is not enough — it has to be named, catalogued and run.* Four of these were run
> by whoever remembered them, and the day this file was written one of them had been broken for long
> enough that nobody could say when.
>
> Unit tests are governed by [testing.md](../.claude/rules/shared/common/testing.md) and are not
> catalogued here. What is here is the tier that starts a real process.

## The tiers

| Tier | Where | Count | What it proves |
|---|---|---|---|
| Unit, extension | `src_vs_code/src/test/*.test.ts`, node:test | 3,702 (4 skipped) | logic, in-process, `vscode` stubbed |
| Unit, .NET | `src_minimalapi_server/tests`, `src_cli/tests`, `src_mcp/tests`, `src_broker_client/tests` — xUnit | 447 | server 300, cli 78, mcp 40, broker 29 |
| HTTP contract | `http/http-run.mjs` over `http/*.http` | 82 requests, 9 files | the real server over HTTP, with a coverage report that refuses an unlisted route |
| Scenario | `src_vs_code/scripts/*-itest.cjs` | 9 harnesses | a real process, a real socket, a real binary |

## The ten harnesses

Every one is a plain `.cjs` file run by node — no framework — because each starts a real process and
what it needs is control over teardown, not a runner. Nine live in `src_vs_code/scripts/`; the tenth
drives the SERVER binary and lives in the server's tree, so that a server-only change is what re-runs
it. Two of the nine already drive .NET products this way (`creds`, `creds-mcp`) — the harness language
is node throughout because what these need is process control, not a test runner. `npm run itest:<name>` compiles first.

| Harness | Drives | In CI | Verified 2026-09-06 |
|---|---|---|---|
| `src_vs_code/scripts/agent-broker-itest.cjs` | the broker over its own loopback HTTP surface, `vscode` stubbed | **yes** — *Integration test (agent broker)* | pass |
| `src_vs_code/scripts/git-transport-itest.cjs` | the encrypted vault in a real git repository: commit, clone, delete | **yes** — *Integration test (git transport)* | pass |
| `src_vs_code/scripts/creds-cli-itest.cjs` | the real `creds` binary against a live broker | **yes** — *Integration test (creds CLI against the broker)* | pass |
| `src_vs_code/scripts/creds-mcp-itest.cjs` | `creds-mcp` over stdio, the full tool surface and both switch ladders | **yes, added 2026-09-06** | pass |
| `src_vs_code/scripts/masked-run-itest.cjs` | a masked run through a real pty, asserting no whole secret appears | **yes, added 2026-09-06** | pass |
| `src_minimalapi_server/scripts/backup-archive-itest.cjs` | the REAL server binary sealing, verifying and opening a backup archive | **yes, added 2026-09-07** — in `ci · server`, on the server's own path filter | pass |
| `src_vs_code/scripts/creds-mcp-wsl-itest.cjs` | the same MCP surface, bridged from inside a WSL distribution | no — see below | pass |
| `src_vs_code/scripts/ssh-agent-itest.cjs` | the SSH agent on a named pipe, and which ssh client can reach it | **yes, added 2026-09-11** — the POSIX branch only, see below | pass |
| `src_vs_code/scripts/wsl-agent-relay-itest.cjs` | `ssh-keygen -Y sign` inside Linux reaching an agent in a Windows process | no — see below | pass **after repair — see below** |
| `src_vs_code/scripts/server-transport-itest.cjs` | `ServerTransport` against a RUNNING Cred Vault Server | no — see below | **not run** — needs a server on `127.0.0.1:5113` |

**Why each of the remaining three is not in CI.** *"Not in CI" with a reason is a decision; "not in CI" alone is
a harness rotting* — so each carries one.

- **`creds-mcp-wsl-itest.cjs` and `wsl-agent-relay-itest.cjs`** need a WSL distribution with the .NET
  SDK inside it. The extension job runs on `ubuntu-latest`, where WSL does not exist and the thing
  under test — the Windows↔Linux bridge — has no meaning.
- **`ssh-agent-itest.cjs`** was left out for a real reason, and the reason turned out to argue for
  reading its result narrowly rather than for running nothing. The argument was: on Ubuntu it
  exercises the POSIX branch, while its subject is the Windows named-pipe path and which of the
  several `ssh-add` binaries on a Windows PATH can reach it — so a green there is a pass about the
  branch it does not exist to protect. All true. What it misses is that the script also drives the
  agent PROTOCOL against a REAL `ssh-add` — a key parsed, loaded, listed and signed for — and
  nothing else in CI does that on any platform. **Added 2026-09-11**, with the step's comment saying
  in as many words that the Windows half stays uncovered by it.
- **`server-transport-itest.cjs`** needs a Cred Vault Server running with the Local auth scheme. CI
  states this reason in the workflow itself: adding it would mean building and running the server
  inside the extension's job.

Two were added on the day this file was written, because neither had a reason — only an absence.

**And the leak that made two of them unrunnable by hand is fixed** (`scripts/wslStrays.cjs`, new).
Both WSL harnesses asserted *"nothing outlives the client"* as a GLOBAL question — `ps -eo args |
grep '[c]reds-mcp'` over the whole machine. Measured 2026-09-11: both failed that one check
identically on `main` and on a feature branch.

**And then the processes were looked at, which is the part worth keeping.** They were not debris.
Thirteen of them: six `creds-mcp` servers, each the child of a LIVE Claude Code session running
inside WSL, plus a `creds relay` holding `/run/user/1000/creds-agent.sock` — the runtime path the
extension publishes, not the `/tmp/creds-relay-itest-<pid>.sock` the harness uses. Every one was
somebody's working tool. So the global question was not merely fragile after a bad run: it is red on
a working machine **always**, and the harness was unrunnable by hand for anyone who actually uses
this product. A harness that cannot be run is a harness that rots.

Its own leftovers are a real second failure, and the sweep is for those: a run that failed partway
stopped without taking its processes down, so the next run inherited them.

The question is a DIFFERENCE now — what was alive before this run, against what is alive after —
and a sweep in a `finally` takes down whatever this run started and left, whichever way it ended. A
stray from somebody else's session is neither asserted on nor killed: this run did not start it. The
first check in the relay harness got stronger by the same change, since *"a real relay is running"*
now means ours rather than any.

**`masked-run-itest.cjs` on Linux was verified, not assumed.** A reviewer called adding it to an
`ubuntu-latest` runner blocking, on the grounds that a pty harness written and run only on Windows
usually breaks on Linux. Fair, and checkable: it was run inside a real WSL Ubuntu with node 20 and
every check passed. There is no native pty module here — `node-pty` is not a dependency of this
extension at all; what the harness stubs is VS Code's pseudoterminal *interface*, and the shell it
spawns is the platform's own.

**`server-transport-itest.cjs` is documented from its source, not from a run** — it is the one
harness on this page nobody has executed while writing about it, and that is stated rather than
implied. Its assertions and CI status are read off the file; whether they still hold is unverified
until someone starts a server and runs it. That is the honest state, and it is why it sits last in
`itest:all` with its prerequisite spelled out.

## Prerequisites, timeouts and cleanup

A harness that leaves a socket, a port or a temp directory behind makes the NEXT run lie. Each of
these cleans up after itself on a normal exit; what follows is what to remove after one is killed.

| Harness | Needs | Leaves behind if killed |
|---|---|---|
| `src_vs_code/scripts/agent-broker-itest.cjs` | nothing | a loopback listener and an endpoint file under the temp dir it names |
| `src_vs_code/scripts/git-transport-itest.cjs` | `git` | a temp directory holding a bare repository |
| `src_vs_code/scripts/creds-cli-itest.cjs` | `dotnet build src_cli/src/CredsCli.csproj` | a broker listener, an endpoint file |
| `src_vs_code/scripts/creds-mcp-itest.cjs` | `dotnet build src_mcp/src/CredsMcp.csproj` | a `creds-mcp` child on stdio |
| `src_vs_code/scripts/masked-run-itest.cjs` | nothing | nothing — the child dies with the pty |
| `src_vs_code/scripts/ssh-agent-itest.cjs` | Windows, OpenSSH on PATH | a named pipe, freed when the process exits |
| `src_vs_code/scripts/creds-mcp-wsl-itest.cjs` | WSL + the .NET SDK inside it | a build tree at `/tmp/creds-relay-itest-build` |
| `src_vs_code/scripts/wsl-agent-relay-itest.cjs` | the same | a `creds relay` process inside the distribution and `/tmp/creds-itest.*` — `wsl -e pkill -f 'creds relay'` |
| `src_vs_code/scripts/server-transport-itest.cjs` | a Cred Vault Server on `127.0.0.1:5113`, Local auth | nothing of its own |

Every harness carries its own timeout on the child processes it spawns; none of them waits for ever,
and each prints the command that would fix a missing prerequisite instead of hanging on it. Re-running
after a kill is safe for all of them except the two WSL ones, where a leftover relay holds the socket
the next run wants — that is the one case worth the `pkill` above.

## Running them all at once

```bash
cd src_vs_code && npm run itest:all             # every harness this platform can run
npm run itest:all -- agent git masked-run       # or a named subset
npm run itest:all -- --with-server              # plus the one needing a server you started
```

`src_vs_code/scripts/run-itests.mjs` compiles once — the nine `itest:*` aliases each begin with their
own `npm run compile` — then runs each harness, streaming its output as it arrives rather than
holding it until the child exits, because a harness waiting on a socket looks identical to a hung one
when its output is held back. It prints a summary separating **pass**, **skipped** (a prerequisite is
missing and the harness said so) and **not runnable here** (Windows-only, on a non-Windows machine).

Three details are there because a review round asked for them, and one because Windows refused the
obvious answer:

- **A mistyped name is refused**, by name, with the legal values and a non-zero exit — a typo that
  quietly runs nothing must not report success.
- **Each harness is bounded at fifteen minutes** and killed with the reason named, so a deadlock
  inside one does not deadlock the runner.
- **`server-transport-itest.cjs` is opt-in.** It probes `127.0.0.1:5113` first and reports *skipped*
  when nothing is listening, because an "all tests" command that always exits 1 on a freshly built
  checkout cannot be the routine health check it advertises.
- **It spawns `node` on each script rather than `npm run`, with no shell.** A reviewer asked for
  `shell: false` and was right about the smell — but dropping the shell while still calling `npm`
  fails on Windows with `EINVAL`, measured here: since the CVE-2024-27980 mitigation Node refuses to
  spawn a `.cmd` without a shell, and `npm` on Windows *is* `npm.cmd`. Naming the script directly
  avoids the shell and the alias together.

Verified 2026-09-06 on this machine: `npm run itest:all` — **8 passed, 0 skipped, 0 not runnable
here**.

## What running them found

**`wsl-agent-relay-itest.cjs` could not start.** It crashed with
`TypeError: distros.find is not a function` before its first manager check. Two API drifts, neither
of which anything could have caught:

- `WslRelayManager.start(command, distros)` takes an ARRAY of distribution names. The harness passed
  the bare string `''`, from back when it took one. `['']` is the correct translation — an empty
  name means the default distribution, and `refuse` skips empty entries deliberately.
- `manager.socketPath` became `socketPathFor(distro)` when the manager gained multi-distribution
  support. The harness kept calling the old getter, got `undefined`, and crashed on `.length`.

**The repair was checked for vacuousness, because a reviewer asked whether `['']` exercises
anything.** It does: `refuse` skips empty entries rather than rejecting them, and `start` then calls
`launch('')`, which is the default distribution. The proof is downstream in the same run — *"a real
relay is running in the distribution"* asserts `ps -eo args | grep creds relay` finds one, and
*"disposing the manager takes it down"* asserts it is gone afterwards. A vacuous start would fail
both.

**The lesson is structural, not incidental.** These harnesses are untyped `.cjs` requiring compiled
`out/*.js`, so they can drift away from the API they drive with nothing to notice — no compiler, no
test, and for six of the nine, no CI. A harness that cannot start proves nothing, and it had been
proving nothing silently. The repair is in `wsl-agent-relay-itest.cjs` with the reason written above
each change.

## The corporate event log's reader (2026-09-07, epic 4 story 1)

`GET /api/org/events` is served by the vault server and driven from two tiers, named here because the
flow is new and neither tier alone is evidence about it:

| Tier | What it drives | Where |
|---|---|---|
| In-process, over real HTTP | the route: who is scoped to what, the query grammar's refusals, the cursor over the wire | `src_minimalapi_server/tests/OrgEventsEndpointTests.cs` |
| Store-level, on real files | the reader: ordering, day-file selection, the cursor's stability under an append, a torn line, both budgets, an unopenable file | `src_minimalapi_server/tests/OrgEventLogQueryTests.cs` |
| The wire, against a started stack | the same route as a client sends it — including a member reading their own rows and a member asking for a colleague BY NAME | `http/org/events.http` |

The scenario the endpoint tests exist for, and which no unit test can state, is the scoping one: a
member's page must never carry a row that names only somebody else, whatever they filter by. It is
asserted twice — once in-process, once over the wire — because it is the only rule here whose failure
is silent, and it was watched failing before it passed.

**Driven through the EXTENSION since story 3**: `scripts/server-transport-itest.cjs` accepts a share
through the compiled `ServerTransport` saying `accepted`, then reads the row back through the
extension's own `OrgEventsClient` and asserts the server recorded `share.accepted` naming both
people. That is the live check the contract rule asks for — the client's word and the server's kind
are two implementations of one agreement, and two suites each reading their own copy of the names
prove nothing about it. It skips loudly on a server with no roster, because the log exists only in
corp mode. What is still not driven end to end is the VIEWER: `eventTab.test.ts` and `orgEventsPage.test.ts`
cover what it asks for, what it does with a late answer and what it draws for each of its four
states, and no harness opens an editor to look at it. Named rather than implied — nothing here drives
VS Code itself, as this file's own gap list says.

### What a share writes to it (story 2)

`ShareEventRowTests` drives every share flow over real HTTP against the in-process server and asserts
each row by reading it back OUT of the log, never off a status code:

| Flow | What is asserted |
|---|---|
| a send | one `share.sent` naming both people, the entity and the id |
| accept and decline | two different kinds, the RECIPIENT as actor, and both shares gone from the inbox |
| a delete that says nothing, and one saying a word this build does not know | `share.unknown`, and still `204` |
| a delete that finds nothing | `404` and no row at all |
| a withdrawal, and one of something already taken | one row; and none, because the accept already wrote its own |
| a block | one `share.withdrawn_blocked` per share, beside the `member.blocked` row that keeps the counts |
| an expiry | one row per pruned inbox item, the sender as actor — and a sweep whose caller has already cancelled still records every share it deleted |
| a project's share, withdrawn | the row cites the project, which the receipt now carries |
| a login key | a row on the first call and none on the second |
| a personal deployment | no rows and no `org/` folder |

The one that is not about a row: **no byte of a share's sealed payload reaches the log**. The test
posts a share whose ciphertext is a distinctive marker, reads every byte of every day file, and
asserts the marker is absent — with a control asserting the search would have found the row.

`http/shares/shares.http` covers the same parameter from the wire (accepted, an unknown value, and
none at all); the ROWS are declared `@uncovered` there, because a row is not a response.

## The backup archive (2026-09-07, epic 5 story 1)

The format is driven from two tiers, and the second one is the reason the first is not enough.

| Tier | What it drives | Where |
|---|---|---|
| In-process | the format itself: the round trip byte for byte, the exclusion rule, every refusal — a wrong key, a flipped byte at its own chunk, a dropped final chunk read as truncation, two chunks swapped, an edited created-at stamp, a newer version, an oversized declared chunk size, `../escaped.txt`, `/etc/cron.d/evil`, a Windows data stream, a symlink entry, a failure that must leave no staging directory | `src_minimalapi_server/tests/BackupArchiveTests.cs` |
| In-process, the command | the three verbs, their arguments, and the sentence each refusal answers with | `src_minimalapi_server/tests/BackupArchiveCommandTests.cs` |
| **The real binary** | `--create-archive`, `--verify-archive`, `--decrypt-archive` run as a program: seal a tree, verify it, open it elsewhere, compare every file byte for byte, and refuse a wrong key, a flipped byte, a truncation, a missing key file, a key that is not 32 bytes, an occupied destination, and the wrong number of arguments | `src_minimalapi_server/scripts/backup-archive-itest.cjs` |

**Why the third tier exists.** The unit suites drive `BackupArchive` and `BackupArchiveCommand` in
process, which answers "is the format right" and says nothing at all about whether the SHIPPED thing
can be run. These verbs are the recovery kit: the moment anyone needs them the server is gone, and
there is no second chance to discover that the entry point never wired them up. That is the exact
shape of failure this family has already had once, with `/v1/use/exportEnv` unreachable in every
released build while both sides' contract tests were green.

It earned its keep on its first run, and not in the way intended: it picked a **published binary from
an earlier build** and every check about the new verb failed for a reason that had nothing to do with
the code. The harness now takes the newest candidate and prints which one it took — a stale artefact
quietly under test is worse than no artefact.

**What it does not cover.** The archive it takes is a synthetic tree, not a live server's data
directory, so nothing here exercises a file vanishing mid-walk (the unit suite's `Skipped` path);
and the binary it drives in CI is the framework-dependent one, not the Native AOT build that ships.
The published AOT binary was driven through the SAME harness locally — all 24 checks pass against
`win-x64/publish/CredVaultServer.exe` — and `CVBK_SERVER` names a binary explicitly, so CI can point at
a published one as soon as story 5 builds one in the same job.

## The backup key and its store (2026-09-07, epic 5 story 2)

Three tiers again, and the third one is a **cross-language** contract rather than a process.

| Tier | What it drives | Where |
|---|---|---|
| In-process | the construction: every vector, the derived 32 bytes, a 500-core round trip, a key typed with confusables, `BadChecksum` against `BadFormat`, the exact entropy | `src_minimalapi_server/tests/PrintableKeyTests.cs` |
| In-process | the key FILE's two forms and every refusal between them, including a base64 key that happens to begin `BK1` | `src_minimalapi_server/tests/BackupKeyFileTests.cs` |
| In-process, on real files | the store: mint-once, the acknowledgement handshake and its four holes, the run-history guard, the unreadable branches, and the key never entering an archive of its own deployment | `src_minimalapi_server/tests/BackupStoreTests.cs` |
| In-process, over the source | the configuration list, both directions, plus the scan's own known-match companion | `src_minimalapi_server/tests/ConfigKeysTests.cs` |
| **The real binary** | a printable key with one character wrong, and a key in neither form, refused by the shipped verbs with the right sentence and exit code | `src_minimalapi_server/scripts/backup-archive-itest.cjs` |
| **Both languages, live** | the vectors regenerated, compared byte for byte against the committed file, and every `RC1` case fed back through the COMPILED `recoveryCode.ts` parser | `contract/emit-printable-key-vectors.mjs --check`, in `ci · extension` |

**Why the last row is not optional.** `contract/printable-key-v1.json` pins one construction that is
implemented twice — `RC1-` in the extension, `BK1-` in the server — and two suites each asserting
their own copy of a file prove nothing about each other. The generator is the live check the
scenario rule asks for: it derives the file from the construction, refuses a hand-edited copy, and
runs every case through the shipped parser rather than through its own idea of it. The backup cases
additionally carry the derived 32 bytes, so `HKDF`'s salt — the one parameter whose ambiguity would
produce an archive nobody can open — is pinned across both languages.

**What none of this covers.** Nothing drives the key through a UI, because there is no UI for it yet
(story 5). The concurrency guard — two processes minting at once — is reasoned from the
create-if-absent write and the run-history check rather than raced in a test; the same is true of
`LoginKeyStore`, whose discipline it copies. And the acknowledgement is exercised by calling the
store, not by an admin pressing a button, which story 3's endpoints will add.

## The cloud destinations (2026-09-07, epic 5 story 4)

| Tier | What it drives | Where |
|---|---|---|
| Published vectors | AWS's own `aws-sig-v4-test-suite` cases and the documented worked example, at the canonical request, the string to sign AND the signature | `src_minimalapi_server/tests/AwsSigV4Tests.cs` |
| An independent implementation | Azure's SharedKey algorithm, with expectations computed OUTSIDE this codebase | `src_minimalapi_server/tests/AzureSharedKeyTests.cs` |
| A stubbed transport | what each client SENDS and what it makes of the answer: the path style, the two mandatory Azure headers, the post-upload verification, both pagination shapes, the write probe | `src_minimalapi_server/tests/BackupTargetTests.cs` |
| In-process, over real HTTP | a target refused at SAVE time — plain http, an unknown kind, missing credentials, an unreachable host — and a status that carries no credential in any shape | `src_minimalapi_server/tests/BackupEndpointTests.cs` |
| The wire | the same refusals as a client sends them, and the status's per-target list | `http/org/backup.http` |

**The review round's own regressions, each watched failing first.** Six of the round's findings were
behaviours no existing test could have caught, so each is now pinned by one named after the guarantee
rather than the defect: a settings save that OMITS `targets` leaves them alone
(`ASettingsSaveThatOMITSTargetsLeavesThemAlone` — sabotaged to write an empty list, and it failed with
*"Expected after.Targets to contain a single item … but the collection is empty"*); half a credential
is refused by the field that is missing rather than reaching a base64 decoder; a listing that failed is
not an empty one, on both clients; a 200 carrying something that is not a listing is a failure too;
an upload the service stored SHORT is a failure and not a success; and a settings file written before
targets existed reads back with an empty list.

**The second round added two more, and one shared fixture.** A kind this server does not implement is
skipped rather than built as Azure (`AKindThisServerDoesNotImplementIsSKIPPEDAndNeverBuiltAsAnother` —
sabotaged back to the ternary, and it failed with *"Expected built.Client to be null … but found
CredVaultServer.AzureBlobTarget"*), paired with one asserting the two kinds it DOES implement so it
cannot pass by refusing everything; and an upload that landed where retention could not run is
`partial` rather than `ok` (`AnUploadThatLANDEDWhereRetentionCannotRunIsNotACleanRun` — sabotaged back
to a verdict over uploads alone, and it failed with *"Expected status.LastResult to be "partial" …
but "ok""*), again paired with the clean-run case. The stubbed transport moved into its own
`StubTransport.cs` when the second suite needed it — a copy would have drifted, and the copy that
drifts is the one nobody is looking at.

**What none of it covers, said plainly.** Nothing here proves that AWS or Azure ACCEPT what these
clients send — only that they send what the specifications say, and that the signatures match values
those specifications publish. A live check against a real bucket needs credentials nobody should
commit and a network CI does not have; the honest substitute is the save-time probe, which every
operator's first configuration runs against their own account and which fails loudly on their screen
rather than at 03:00. When somebody does point this at a real bucket, that run IS the missing tier and
it belongs in this file.

## The extension's half of the backup (2026-09-07, epic 5 story 5)

| Tier | What it drives | Where |
|---|---|---|
| A stubbed `fetch` | what the client SENDS and what it makes of each answer: the admin routes, the bearer and contract headers, a `404` read as "no backup here", a shape this build cannot read, and the two settings requests that look alike and are not | `src_vs_code/src/test/orgBackupClient.test.ts` |
| Pure, in process | the tab's state machine and the page: the order the key is shown in, the mint button's gating, a failure that must end the busy state, escaping, and a target row that carries both outcomes | `src_vs_code/src/test/backupTab.test.ts` |
| Pure, in process | the nag's cadence and its silence — the whole point of the module | `src_vs_code/src/test/backupNotice.test.ts` |
| Pure, in process | the watch: who is polled, what a failed read may change, and one message for several accounts | `src_vs_code/src/test/backupWatch.test.ts` |
| Real files | a download that fails halfway leaves nothing at the chosen path, and does not destroy the archive already there | `src_vs_code/src/test/archiveDownload.test.ts` |
| The manifest, enforced | the new command has a help article in five languages and a README entry — `helpCoverage` and `listingCoverage` failed on the commit that added it, which is the moment it is cheap to fix | `src_vs_code/src/test/helpCoverage.test.ts`, `listingCoverage.test.ts` |

**The two tests that exist because their absence would be invisible.** A settings save that names no
destinations must send NO `targets` member — a client that defaulted the field to `[]` would wipe every
configured destination each time somebody edited the schedule, and nothing on either side would say so
until an archive failed to arrive weeks later. And the key must be SHOWN before the status is read
back: a refresh redrawing the page underneath a dialog somebody is copying from is how a key nobody can
reproduce is lost. Both are assertions about ORDER and absence, which no amount of clicking would
reveal.

**One real defect, found by its own test rather than by review.** The watch cleared an account's nag
window whenever no notice came back — including when the notice was merely suppressed by the dedupe, so
the window would be cleared on the very next cycle and the nag would return every other tick. The test
that caught it asserts the second cycle is silent; health and dedupe now answer separately.

**The review round added four more, and one whole tier.** The gate found a status validator that
checked five fields while the page read ten (a truncated answer became a broken tab instead of the
documented sentence); a `Content-Disposition` filename taken as-is and handed to the save dialog as
its `defaultUri`, so a hostile server could open it at `/home/dev/.ssh/config`; account checks run
one after another inside the cycle that repaints the tree; and a notice map persisted once per
healthy account per cycle. Each is now pinned — the filename by a table of six hostile shapes paired
with an ordinary one, the concurrency by counting reads in flight, the write by counting writes.

**The automated reviewer's round added six more**, each red first: a run cancelled mid-build still
reaches a terminal status (the catch-all was handing the CANCELLED token to the status write, so
"in progress" would have survived for ever — the spinner the catch-all exists to prevent, produced by
the catch-all); a rename that fails leaves no `.part` file behind; an instant no `Date` can render is
refused rather than crashing the page on `toISOString`; words the person DISCARDED are not reported
as a key in place; and two more restore scenarios — the rollback stops the stack before it touches
the data, and a rollback that cannot stop it moves nothing and says so. That last pair is a data-loss
path: `docker compose up -d` has already handed the containers the data directory by the time a
health check fails, and swapping directories underneath a running server damages the restored copy
and the original at once.

**And a tier that did not exist: `deploy/restore-archive-itest.sh`.** It runs the restore script as a
PROGRAM with `docker` replaced by a recording shim — seven scenarios, 23 assertions — because the
script's design is its order and reading cannot check an order. It is what says *"the stack was never
stopped"* as a fact about what reached `docker`. The round found the unfinished-restore check sitting
after `docker compose down`; scenario 4 is what catches that class now, and it was watched failing
against the old ordering.

**What none of it covers.** Nothing drives VS Code itself: the modal that shows the key once, the save
dialog, the webview's own script and the tree menu are exercised only through their pure halves. So a
command registered but never wired to a menu, or a `when` clause that stops matching, is caught by the
manifest tests above and by nothing else — which is exactly why the `account-corpOfficer` case was
found by reading `orgRecoveryAccess.ts` rather than by a test. And the harness above is not the
live-stack rehearsal: no image is pulled and no server runs, so nothing yet proves that an archive
from a live deployment restores onto a real host. That is a tracked exception rather than a silent
gap — named in the plan, in `module_deployment.md`, and in the epic's summary.

## Account deletion, and what the gate has to make indivisible (2026-09-11, audit finding #4)

`VaultTests` in the server suite. Four scenarios, three of them new, and they exist because the order
`DELETE /api/vault` had always described was enforced by sequence alone.

| Test | What it holds down |
|---|---|
| `AVaultTheOsWillNotReleaseIsReportedAndKeepsItsLoginKey` | A vault the OS will not unlink answers **503**, and the login key, the owner sidecar and the member record are all still there. Before the fix: `204`, with the key gone — and on a corporate server every developer wrap is sealed to that key |
| `ASecondDeleteAfterTheLockClearsFinishesTheJob` | A refusal costs a retry and nothing else: the state it leaves is the state it started from |
| `AWriteCannotSlipBetweenTheVaultDeleteAndTheKeyRemoval` | The per-person gate is held from the vault delete through the key and the registry record. Asserted on the **vault file**, not on the request: the first version of this test asserted only that the request had not finished and passed against the unfixed code, because the endpoint already blocked further down on the member record's own gate |
| `AClientHangingUpDuringTheDeleteDoesNotAbandonTheRegistryRemoval` | Unchanged guarantee, **changed arrangement**: it used to hold the gate and wait for the vault to disappear while holding it, which only worked while the vault delete took no gate. It times the hang-up off the vault file now |

Client half, `serverTransport.test.ts`: `a refused DELETE quotes what the server said, not just the
number` — the 503 sentence says *nothing else was removed, including the login key*, and `HTTP 503`
alone sends a person looking for a bug in the extension.

**Run in both configurations.** This change is about ordering under concurrency, so the server suite
was run as Debug and as the shipping Release build — 766 of 766 in each.

## A one-use entry, a call cap, and a conditional create (2026-09-11, audit findings #3 and #5)

`oneUseAndCap.test.ts` (new), `grantTtl.test.ts`, `serverTransport.test.ts`. Harness:
`src/test/brokerWorld.ts` — the real broker over real HTTP. Command: `npm test`, or
`node --test out/test/oneUseAndCap.test.js`.

| Flow | Status | What it holds down |
|---|---|---|
| Two concurrent calls on a one-use entry | covered | The action runs ONCE, the entry burns once, and the loser is told `not_found` |
| The same, across **both doors** | covered | The token door and the MCP door are different grants for one entry; the lane is keyed by account+entity, never by token, so "one token, one use" is not what is being promised |
| A call **after** the first has finished | covered | The distinct path, and the one the gate found: one-use is answered from STORAGE, a burned entry is not in storage, so a later call saw an entry that no longer looked one-use and skipped the queue. The lane decides before storage does |
| An ordinary entry runs two calls **at once** | covered | Asserted as OVERLAP, not as a call count — a queue that ran both in turn leaves the identical record, and the first version of this test passed against a lane keyed by token |
| A call cap of one, two concurrent calls | covered | One run, one shared dialog, and the loser told it ran out of CALLS rather than out of time |
| A refused consent under a cap | covered | Spends nothing |
| `reserve` is one step | covered | `grantTtl.test.ts`: the check and the count cannot be interleaved, and a refused reservation leaves no trace |
| The create after a 404 | covered | `If-None-Match: *` on the wire, and the second machine refused rather than winning |
| A 412, and what the next write may claim | covered | The retry never reaches the wire; a re-read restores the precondition; an ETag-less re-read does **not** turn the conflict back into a blind write |
| A read or write with no ETag | covered | Forgets the version rather than holding one it cannot confirm — except a conflict, which survives |

**What these do not prove.** The harness stubs the action, so nothing here exercises a real `ssh`
exec behind a one-use entry, and nothing exercises two VS Code WINDOWS: a grant lives in one
window's memory by design, so the lane is per window and two windows racing one entry is a
different question (it is `PLAN_cross_window_write_coordination.md`'s). The `serverTransport` tests
stub `fetch`; the server half of the precondition is the .NET suite's `ConcurrencyTests`.

**A fixture that lied, recorded because it is the lesson.** `brokerWorld`'s one-use stub answered
`true` unconditionally, including after the entry had burned. The product reads a node out of
storage, so it answers `false` then — and `burnAndMark` asked the question *after* the burn, so the
lane was never marked spent and a queued second call ran the action again. Every test passed. The
stub answers from `w.burned` now, which is what made the defect visible.
## What the unit suite is asserted ON (2026-09-11, audit finding #8)

`npm test` is `node --test out/test/*.test.js`, and CI runs it in exactly one configuration:
**`ubuntu-latest`, Node 22** (`.github/workflows/ci-extension.yml`). There is no OS matrix and no
Node matrix. That is a choice, not an oversight — but it has to be written down, because two tests
were passing there **for the wrong reason**.

`defaultProbe` split `PATH` on a hard-coded `;`. On Linux the whole colon-joined value became ONE
bogus entry, `hasTool` was never true, and `pathSshIsBuiltIn` always answered false — so the two
tests that assert Windows PATH precedence never exercised the branch they were named for, and failed
on any Windows machine whose `PATH` puts `C:\Windows\System32\OpenSSH` ahead of Git's MSYS `ssh`.
Reproduced here, and the product was right in both cases:

```
on Windows a forwarding line names the client that can reach the agent
  actual:   'ssh -A deploy@example.com'
  expected: 'C:/Windows/System32/OpenSSH/ssh.exe -A deploy@example.com'
```

What that leaves, and how it is covered now:

| Branch | How it is asserted |
|---|---|
| Windows PATH precedence — Git first, built-in first, neither | Injected `PathProbe`, in `sshProgram.test.ts` and `sshCommand.test.ts`, through **both** entry points |
| The REAL `defaultProbe` wiring | `sshDefaultProbe.test.ts` — the probe is asked what it SAW (the directories it parsed, whether it found the file), not merely whether the answer came out false. Real temp directories, a real `ssh.exe`, `PATH` set and restored, the tree removed after. The built-in-first case is SKIPPED where that directory does not exist, i.e. off Windows |
| The `PATH` split itself | `pathDirsOf` with `;` and `:`, and the wrong delimiter asserted to produce one bogus entry — the bug, pinned. The delimiter follows the TARGET platform rather than the host, so naming `win32` from a Linux runner does not reintroduce it from the other side |
| V8's JSON error text | `jsonErrorLine.test.ts` on both message shapes as fixtures. The two engine-driven tests ask the engine whether it offered a position at all, and stay strict where it did — relaxing them to "the right line or none" would have passed a regression that stopped extracting lines entirely |

Two fixtures are shared rather than copied — `sshPath.ts` (the PATH states) and `engineJson.ts`
(whether this engine names a position) — because a second copy of either is a thing to update that
nothing would notice was missed.

**A Windows CI job is the thing deliberately not added.** It would be minutes per run to exercise one
`if` whose seam now exists, is used by both entry points, and has a real-probe test beside it. The
day that seam proves insufficient, the job is the answer.

## The folder form's text size (2026-09-12, #53 and #2)

The flow: somebody presses **±** in the folder form, the press reaches the host, the host writes the
shared `credSshManager.uiScale` setting, and every open page — the other form, the viewer, the help
page — repaints from that one value. It is the T28 contract, and the folder form was the page that
did none of it. It is catalogued here because `scenario-tests.md` asks for every flow a task adds,
**including the ones no harness reaches.**

Covered by `src_vs_code/src/test/folderFormPanel.test.ts` — the real `folderFormPanel` loaded
through the `vscode` stub (`src/test/vscodeStub.ts`: `loadWithVscode`, with `configStub` recording
every setting write and `settingsVscode` serving them back), with a fake panel standing in for the
editor's webview. Command: `npm test`, or `node --test out/test/folderFormPanel.test.js`.

| Flow | Status | What it holds down |
|---|---|---|
| The form opens at the stored size | covered | The rendered HTML carries `zoomStyle(offset)`, not the base size — the page used to be rendered with no scale at all |
| An open form follows a change | covered | `pushUiScaleTo` is hooked on mount: exactly one `{type:'uiScale', px, label}` is posted, and the hook is disposed with the panel |
| A press writes the shared setting | covered | `{type:'zoom', delta: 1}` from the page leaves one write of `uiScale`, one step up, at global scope — the press is reported, the host clamps |
| A press is not a save | covered | The panel is not disposed and the promise does not settle. Falling through to the save or cancel branch would close a form somebody was filling in |
| A press with no `delta`, or one that is not a finite number | covered | Writes **nothing**. The call sites passed `message.delta ?? 0`, so a malformed `{type:'zoom'}` wrote the size already stored and pushed `uiScale` to every open page for nothing |
| The page script's own ± button and `uiScale` listener | **not covered** | No harness drives a real webview — see below |

**What this does not prove.** The page half is asserted as TEXT, not executed: `folderFormPage.test.ts`
checks that the rendered page contains the `data-zoom` buttons and the `zoomApplyScript()` fragment
verbatim, and nothing anywhere runs that script in a browser, clicks the button, or observes
`document.body.style.fontSize` change. A listener that is present and throws on its first message
would pass every test named above. That is not a gap with a fix in this task — it is this document's
own standing finding, *The editor's own UI* below: nothing here drives VS Code, every harness stubs
`vscode` or talks to the broker underneath it, and inventing a tenth harness for one webview would be
the wrong answer to it. The flow's one real look is by hand, on the packaged `.vsix`.

## What none of them covers

Named rather than implied, because the rule asks for exactly this.

- **The editor's own UI.** Nothing drives VS Code itself — no extension-host test, no click on a
  tree row, no form filled in. Every harness stubs `vscode` or talks to the broker underneath it.
  So a command registered but never wired to a menu, a context value that stops matching, or a
  webview that throws on open, is caught by unit tests over the pure halves and by nothing else.
- **The Marketplace artefact.** `npm run package` runs in CI, and nothing installs the resulting
  `.vsix` into a real editor and opens it. The publish step is verified by reading the release run.
- **The server and the extension end to end.** `server-transport-itest.cjs` would do it, and it is
  the one harness CI does not run. Today the two halves are verified separately: the extension
  against a stubbed transport, the server against `http/`'s requests — 181 of them, 390 checks, over
  46 of 46 registered routes, as of 2026-09-07.
- **The sync merge under real concurrency.** Version-vector merging has thorough unit tests; no
  harness runs two windows against one vault at the same time. That gap has a plan of its own —
  [PLAN_node_writes_are_last_write_wins.md](PLAN_node_writes_are_last_write_wins.md) — and
  it is where the last-write-wins defect lives.
- **Corporate recovery with three people.** Shamir splitting and the escrow wrap are unit-tested;
  the ceremony across three machines has never been run. It is a human task by nature:
  [ЗАДАЧА_проверка_корп_восстановления.md](../todo/ЗАДАЧА_проверка_корп_восстановления.md).
- **macOS and Linux.** Every harness here runs on Windows, and four of them are Windows-only by
  construction (named pipes, WSL). The Linux keychain fallback the README warns about is asserted by
  unit tests and has no scenario coverage at all.

## How to run everything

```bash
# .NET — 447 tests when this was written; the vault server alone is 530 as of 2026-09-07
dotnet build dew_flow_creds_for_devs.slnx
./src_minimalapi_server/tests/bin/Debug/net10.0/CredVaultServer.Tests.exe
./src_cli/tests/bin/Debug/net10.0/CredsCli.Tests.exe
./src_mcp/tests/bin/Debug/net10.0/CredsMcp.Tests.exe
./src_broker_client/tests/bin/Debug/net10.0/BrokerClient.Tests.exe

# the extension's unit suite — 3,302
cd src_vs_code && npm test

# every scenario harness except the one needing a live server
for t in agent git cli mcp ssh-agent masked-run mcp-wsl wsl-relay; do npm run itest:$t; done

# the HTTP contract suite (see http/README.md for the environment it needs)
cd http && npm ci && node http-run.mjs
```

The WSL harnesses skip loudly rather than silently when the distribution, the .NET SDK inside it, or
the Windows binary is missing — each prints the command that would fix it. That is the convention
every harness here follows: a skip says why, and a missing prerequisite is never mistaken for a pass.
