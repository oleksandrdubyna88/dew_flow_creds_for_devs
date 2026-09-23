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
| Unit, extension | `src_vs_code/src/test/*.test.ts`, node:test | 4,205 (4 skipped) | logic, in-process, `vscode` stubbed |
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
| `src_vs_code/scripts/creds-mcp-itest.cjs` | `creds-mcp` over stdio, the full tool surface, both switch ladders and the quiet path (#95) | **yes, added 2026-09-06** | pass |
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

## The lock file's own version, which no tool was checking (2026-09-14)

`lockfileVersion.test.ts` asserts that `src_vs_code/package-lock.json` agrees with
`package.json` about this project's name and version — in **both** places the lock states it, its top
level and its `packages[""]` entry.

It exists because the drift was real and long. The lock said `0.98.0` while the extension shipped as
`1.7.0`: fourteen releases, every one of them touching `package.json` and `CHANGELOG.md` and nothing
else. Nothing complained, and that is the point — `npm ci` validates the lock's DEPENDENCIES against
the manifest and has no opinion at all about the project's own version field, so the file installs
perfectly while telling every reader, auditor and supply-chain scanner the wrong version.

The test was watched failing against the drifted file before the fix, and its message names the
cause rather than the mismatch: *"a release bumped one and not the other, which npm never complains
about and every reader of the lock believes"*. The second assertion exists separately because a
`lockfileVersion: 3` file carries the version twice, and fixing only the top one leaves half the
drift in place.

**The same drift is present in the family's other two extensions** — `connect_other_ais/src_vs_code`
(0.31.17 against a lock saying 0.30.0) and `rag_qln/tools/vscode-extension` (0.19.0 against 0.9.0).
Neither is fixed here; this is a note so the next person does not rediscover it.

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

## The second value a person types (#52)

Named here because the code round asked where these flows are covered, and the honest answer has a
shape worth writing down: there is no harness that can drive this feature end to end, for the reason
the section below gives, so each half is covered where it can actually be executed.

| what | where | what it can and cannot see |
|---|---|---|
| The pair rule | `secondPair.test.ts` | Pure. Code points, identical halves, character classes — including the Cyrillic pair the code round found refused |
| What the save STORES | `secondSave.test.ts` | Pure, one test per row of the plan's state table. Reads back what the save decided, never whether a decoy was generated |
| The page's message, read | `secondFormInput.test.ts` | Pure. Both mode controls answering for their own fields, and a crafted payload's unknown keys refused |
| The payment gate | `secondPaymentGate.test.ts` | The REAL `paymentRecordFor` behind a `vscode` stub: a good pair woven, a mismatched one refused, and the typed half absent from the record |
| The page's half | `secondModeScript.test.ts` | RUN through `miniDom`, not matched as source: a box shown, hidden, emptied when hidden, and each control governing only its own scope |
| The markup | `secondModeMarkup.test.ts` | Derived from the catalogue, no value in the page, and no backtick that would end the template literal it is pasted into |
| The viewer's rows | `secondViewerRows.test.ts` | The rows drawn, the gate a second CVV inherits, and `allowCopy` — the surface the panel calls, so the copy path is covered rather than the private predicate |
| Out of the vault | `secondShareBoundary.test.ts` | A REAL share payload built and asserted, plus the export counts. Not an allowlist unit test, because that passes for a payload a serializer picked the slot up into |
| Sync, backup, revision | `secondSurvival.test.ts`, `storageSecond.test.ts`, `secondTravel.test.ts` | The five lists agreeing, an empty record deleting its key, and the agent surface driven with a vault that HOLDS one of every kind |
| The five help languages | `secondHelpCoverage.test.ts` | That each language mentions the control — the one stale-translation failure that is checkable without a content-version scheme |

**What none of this reaches** is the same gap the section below names: nothing opens the real form,
ticks the real box and reads the real keychain. A control rendered but never wired to a listener, or
a webview that throws on open, is caught by the page-script tests over `miniDom` and by nothing else.

## The consent policy's two inheritance axes (2026-09-16, issue #95, story S1.2)

`resolveMcpInTree` now walks the ladder and the ask policy separately. The unit tier covers it
thoroughly — the regression itself (*a folder that only sets a policy does not close the branch its
parent opened*) was **watched failing first** against the single-axis predicate, with the real
symptom: `a consent setting closed a branch it has no business closing — false !== true`, the
inherited `use` rung reading false.

| flow | covered | note |
|---|---|---|
| a policy-only folder leaves the rights beneath it alone | **unit** | `mcpAccess.test.ts`; red-first observed |
| an explicit empty object still closes a branch | **unit** | the mirror-image bug; both predicates pinned by name |
| the two axes resolved from two different folders | **unit** | both folder names asserted |
| a word from a newer build stops the climb instead of inheriting a `never` | **unit** | fixture is JSON, so the type system cannot sanitise the case away |
| a stored `null` hands the answer back to the folder | **unit** | what the form sends for *Inherit* |
| nothing in the Trash answers on either axis | **unit** | a never-ask policy surviving a delete would be the sharpest form of this bug |
| the same, end to end through the real `creds-mcp` binary | **binary** | **closed by S4.2** — see *The quiet path through the REAL binary* below, which drives six quiet calls, one forced prompt and a delete through the real executable. It was written here as `NOT COVERED YET` while it was true, because nothing could WRITE a policy until the form landed in S3.1, and a gap nobody writes down is a gap nobody closes; leaving that marker standing once S4.2 had closed it would have been the same failure in the other direction, and it stood for one story too long |

**The door's half (S2.2)**, driven through the real broker over loopback by
`test/brokerMcpRoutes.test.ts`:

| flow | covered | note |
|---|---|---|
| six quiet calls in a row all succeed and none raises a dialog | **broker** | red-first: today the sixth answered `too_many_requests` and the four before it timed out at a dialog nobody was answering |
| a quiet call leaves nobody present, and says so in the journal | **broker** | `presence === 0`, and one line reading `allowed without a prompt` |
| deleting and creating still ask on a pre-consented entry | **broker** | the consumer half of the guarantee; the producer half is in `mcpEntries.test.ts` |
| an answered dialog is remembered under the ladder shown; a quiet call is not | **broker** | the window does not slide |
| a token call never writes the MCP stamp | **broker** | the two dialogs say different things |
| quiet calls spend no modal slot, so a prompting call still gets its five | **broker** | releasing a slot never taken would free another call's |
| an entry INHERITING never-ask from its folder runs quiet through the REAL lookup | **broker** | the only test here that builds the answer the way production does — `mcpUseLookup` over a real tree and a real stamp store — with an ask-every-time control beside it, so it cannot pass by resolving nothing |
| a remembered write that FAILS does not fail the call somebody allowed | **broker** | it costs one more dialog next time and says so in the journal |
| a runaway loop leaves ONE journal line a window, not one a call | **unit** | the ceiling bounds actions, not refusals; a line each would be a journal nobody can read |
| the ceiling is one per WINDOW, shared by every tokenless caller | **unit** | deliberate: the only caller identity this route has is a LABEL the body supplies, so keying on it would hand an attacker as many quotas as it invented |
| a refused PROMPT is still never written down | **unit** | unchanged and pinned, so the gap stays visible — widening it is a decision, not a side effect of this story |
| a call gives back the slot the ceiling that admitted it took, and a refused one gives back nothing | **unit** | the code round's finding: naming the ceiling twice lets the two namings disagree. Red first, with the naive refusal-release in place — `the call in flight still holds its slot` |
| a clock that moves backward does not strand the ceiling | **unit** | red first: half an hour back and the sixty-first was still refused. Both the counts and the journal mark are measured with both bounds |

**The wiring (S2.4)** — `test/mcpHooks.test.ts`, the story that makes all of the above true in a real
window rather than only in a test. Five behavioural rows through the factory, and one scan.

| flow | covered | note |
|---|---|---|
| a consent remembered through one hook is what the other reads | **unit** | the round trip, which is the whole point of one store; split across two it passes nothing |
| two hook sets over one state read the same store, and a different state reads its own | **unit** | asserted through behaviour, not object identity, and with a DIFFERENT vault object each time — the key is the `Memento` |
| two hook sets over one state write through ONE queue, so a concurrent remember is not lost | **unit** | the test the memo actually needs, and the row above cannot give: `ConsentStamps` caches nothing, so two instances still read each other's LANDED writes — what a queue each costs is a write still in flight. With the memo deleted this is the only test in the file that fails, watched: *the first consent was overwritten by the second* |
| a remembered consent lands under the real key, `credSshManager.mcpConsentStamps` | **unit** | the key is every installed machine's record; a rename is a silent forget for everybody |
| the clock the factory was given is the one BOTH halves answer to | **unit** | the write carries it and the read is measured from it, at a millisecond either side of twelve hours |
| an entry whose folder sets no policy still asks, and no stamp is written | **unit** | every entry in every vault today, since no control can write `ask` until S3.1 — the wiring must change nothing for them |
| a consent answered on one real call is what the next one reads | **broker** | the flow rather than the shape: two calls over loopback through the real door, the real modal, the real `recordConsent` and the real store — the first asks, the second does not, and both run. Watched red by dropping the write half: `2 !== 1`, the second call asked again |
| the scan still finds the line it is about | **scan** | a prohibition that matches nothing passes forever, so the sanctioned instance gets its own test |
| the write bound answers when NOTHING else holds the event loop (S4.3) | **spawn** | the never-answers test above passes for the wrong reason whenever the suite around it happens to hold the loop, and that is what hid a real defect for six stories: `recordConsent` passed `{ unref: true }` to `withTimeout`, an unrefd timer does not hold the loop, and a caller awaiting it in an otherwise idle process gets **no answer at all** rather than a late `undefined`. Under the broker a listening socket always holds the process, so nothing local ever showed it. **CI did**: three tests `cancelled` with *Promise resolution is still pending but the event loop has already resolved*, beside `fail 0` — so the run exited 1 with nothing to point at, in the extension job and in SonarCloud's coverage job both. This row is that observation rather than a re-run: `recordConsent` runs in a spawned process holding nothing open and must answer. Watched red by restoring the `unref` |
| the window wires BOTH hooks into the live broker, from the one factory | **scan** | there is no VS Code to activate here, and the defect is a call site: a broker left on the store-less resolver keeps every unit test green. Both branches watched red — the old line restored, and a later `resolveMcpUse:` key shadowing the spread, which is the same trap `brokerWorld` sprang earlier in this feature. Failures name `extension.ts:<line>` |

**The control (S3.1)** — `test/mcpAskChoices.test.ts` for the words and the markup,
`test/mcpSwitchScript.test.ts` for the page script RUN under `miniDom`, and the round trip in
`test/folderFormPanel.test.ts`. The fixture both script tests build on is `test/mcpFormFixture.ts`:
one builder, because two copies of a fixture that must mirror one piece of markup are two copies
that drift, and its controls and their state come from the same lists and the same predicate the
real markup uses.

| flow | covered | note |
|---|---|---|
| four choices, each with a why, and never-ask says the switches become the whole gate | **unit** | the one control that can remove a confirmation; the sentence beside it is part of it |
| exactly one radio is checked, and it is the local answer | **unit** | over all four values, including absent — Inherit is what absence checks |
| an inheriting folder names the folder above and its answer; with nothing above, the option does not use the word | **unit** | and is still offered either way: taking back a local answer is what it is for |
| a folder name in the Inherit label is escaped | **unit** | names arrive by sync and by import, and this extension has shipped one such interpolation before |
| `MCP_SWITCHES` still has ten entries and five bar colours, and no ask id is among them | **unit** | the separation as a number — `searchPredicates.ts` throws at module load for an id it does not know, so a cadence in that list breaks every search at startup |
| each choice posts its OWN value, and Inherit posts null | **executed** | table-driven, one row per control: a test asserting only "a policy was posted" passes for a page that serializes `always` whichever radio was picked |
| touching only a radio posts a policy and NO ladder · touching only a switch posts a ladder and NO policy | **executed** | the §2 regression from both sides. Watched red with the flags merged: *a ladder was written because a cadence was chosen* |
| a form opened on a decided ladder keeps posting it when only the policy is touched | **executed** | opening a form must not silently narrow what is stored |
| nothing touched and nothing decided posts `undefined` | **executed** | the oldest guarantee in this script, and the two flags did not cost it |
| a page with NO radios keeps the policy the record already had, and never marks it touched | **executed** | the entity form until S3.2. Watched red: *a form with no control for it silently cleared the policy* — the sharpest finding of the plan round, and a real defect in the first design |
| a stored cadence that is not one of the three words cannot close the script tag | **executed** | `jsonForScript`, not `JSON.stringify`, which escapes quotes and leaves `</script>` alone. Found by the repository's own interpolation scan going red |
| a save that only chose a cadence leaves the ladder ABSENT · Inherit clears a stored cadence · a ladder survives its cadence being taken back | **round trip** | page script → JSON → `readValues`, which is the shape written to the vault and the only place the regression is visible |
| the group renders under the switches, with its hint; the Trash has neither | **page** | same rule as the switches: in the Trash they would be controls that decide nothing |
| a folder that answered only the CADENCE still shows the ladder it inherits | **page** | the code round's find, and a real defect: `{ ask: 'never' }` was read as "this folder decided", so the form drew an all-off ladder under a sentence claiming so. Watched red — *the inherited ladder was shown as all off* |
| a stored cadence that is not one of the three words shows the one actually in force | **page** | records arrive by sync and by import; the form runs the stored value through `askPolicy`, the reader the resolver uses, so an unknown word shows `always` and a `null` shows Inherit. Watched red |
| what a node would inherit is what the ANCESTRY says, whatever the node says itself | **unit** | `inheritedAskFor`, moved into `mcpAccess.ts` so S3.2 shares it rather than copying a tree walk: two levels up, nothing above, and a node in the Trash inheriting nothing |
| a fourth policy with no control does not compile | **observed, not a test** | `ASK_CONTROLS` is a `Record<McpAskPolicy, …>`; adding `every24h` to `ASK_POLICIES` fails with *Property 'every24h' is missing*, which is why `askWords` needs no fallback |

**The entity form (S3.2)** — the same group on the other form, over a value the resolver already
computes. `test/entityFormPage.test.ts` for the markup, `test/entityFormPanel.test.ts` for the round
trip through `toValues`.

| flow | covered | note |
|---|---|---|
| an inheriting entry under a never-ask folder shows Inherit — never *Ask every time* | **page** | the guard the story exists for: the default belongs to the end of the walk, and showing it as a choice tells somebody the opposite of what the door will do. Watched red by rendering the resolved value as the local one — *the default was shown where a folder had answered* |
| an entry with its own answer shows it checked, and Inherit still names what it would inherit | **page** | which is why the label comes from `inheritedAskFor` (the parent) and the tick from the record |
| with nothing above, the Inherit option names no folder | **page** | the same two labels the folder form has, from one builder |
| the group sits after the tenth switch and before the doors footer | **page** | with a door actually live, so the footer is rendered — with none, the only `agentDoors` in the page is a CSS class above it, and the assertion would pass for the wrong reason |
| the sentence is per HALF | **page** | four states in one line. Watched red with both halves driven by `mcp !== undefined` — *The input did not match /Switches set on this entry/* |
| saving with only the cadence touched leaves the entry's ladder absent; taking a cadence back keeps the switches | **round trip** | the §2 regression on the entity side, through the real page script, JSON, and `toValues` |

**The doors footer (S3.3)** — `test/agentDoors.test.ts`. A never-ask entry is a door like the other
four, and the footer's promise is that what it lists is LIVE.

| flow | covered | note |
|---|---|---|
| a never-ask entry renders a standing-consent row FIRST, naming the command | **unit** | position asserted, not presence: implemented at the end of the table it would still exist and still be wrong |
| an entry that still asks renders no such row | **unit** | both `always` and `every12h` |
| a never-ask entry agents may NOT use is not a door | **unit** | the row says an agent may USE this entry without asking; with `use` off nothing can walk through it. Watched red with the `use` half dropped |
| an entry that INHERITS never from its folder has the door too | **unit** | the row is about what the door will do, not where the answer was written |
| the CLI row no longer claims there is no consent modal, and the code-access row still does | **unit** | one of the two was false — `handleAlias` → `perform` → `consent` — in the module whose job is saying which doors have no modal |
| the CLI row does not hand the alias door to a cadence that cannot reach it (S4.3) | **unit + scan** | the replacement was false the OTHER way: *whether a dialog appears follows this entry's consent setting*, while `preConsent` is wired into `mcpDoor` alone and `handleAlias` mints a fresh grant per call, so a never-ask entry is still asked in a terminal. Watched red against that sentence, quoted verbatim by the assertion. The scan half slices `handleAlias` out of `credsAgentServer.ts` and requires no `preConsent` inside it — wiring the door turns the row red rather than making it false a third time. **Two things the code round made it do properly.** The slice runs to the NEXT member rather than to a named neighbour, because a method moved between the two would have widened the window in silence. And the prohibition has a companion that requires the same pattern AT the sanctioned site, the `door` getter — which caught this file's own dead assertion: renaming the hook to `preConsentX` left a bare `/preConsent/` green on both halves, so the pattern is the whole property, `\bpreConsent\s*:`. Both halves watched red, one by renaming the wiring and one by pre-consenting inside `handleAlias` |
| the rendered FORM carries the row | **page** | the builder can be right while the form never shows it |
| the standing-consent row offers no manage link, while the doors that ARE elsewhere keep theirs | **page** | `editNode` from inside the entity form re-opens it and discards unsaved edits; `command` is optional on `AgentDoorRow` now, and an empty `data-command` is asserted absent too |
| the window COMPUTES the door rather than the tests supplying it | **scan** | every other row here hands `standingConsent` in, so deleting the computation from `extension.ts` would leave them all green. Watched red by replacing it with `false` |

**The way out (S4.1)** — `test/forgetAgentConsents.test.ts`. The handler is CAPTURED from a
`commands.registerCommand` stub rather than imported, so what runs is what the extension registered:
a title in the help and a handler under another id is a palette entry that throws when pressed.

| flow | covered | note |
|---|---|---|
| the registered command empties the real `credSshManager.mcpConsentStamps` key | **command** | with a stamp written first, so the clear is not passing against an empty store |
| after forgetting, a call inside the OLD twelve-hour window asks again | **command** | the emptiness is not the guarantee — this is, asked through `consentDue` the way the door asks it |
| forgetting writes the two machine-local keys and nothing else | **command** | the map and the tombstone; a third key would be a record this feature never said it kept |
| dismissing the confirmation forgets nothing | **command** | it is not recoverable. This test caught a real trap in ITSELF first: a helper parameter defaulted to the confirm answer and called with an explicit `undefined` takes the DEFAULT, so the dismiss case was silently testing the confirm case |
| the person is told only after both writes land, and the truth when one fails | **command** | `forgetAll` is awaited; a message shown while a tombstone is in flight says the windows are gone when they are not |
| the command the manifest contributes is the command that is registered | **command** | the two halves of a palette entry, pinned together |
| each of the five languages names the command, drops the obsolete *every action raises the modal*, and says never-ask leaves the journal | **help ×5** | `helpCoverage.test.ts` checks the ENGLISH corpus only, and a STALE translation is invisible to a coverage test that can only spot a missing one. Watched red by reinstating the Russian sentence |
| the stale-claim scan still finds a known obsolete sentence | **companion** | the other half of a prohibition: a scan that matches nothing passes forever, so the predicate is fed each obsolete sentence and asserted to recognise it |
| a store that refuses the write says so, through the REGISTERED handler | **command** | driven through the command rather than through `forgetAll`, because the handler's catch branch is the subject and calling the store directly never reaches it. Watched red by removing the error message |

**The ceiling (S2.3)** — the quiet path's own limiter, since the prompt was the old one. The unit half
is `test/aliasThrottle.test.ts` with the clock injected, so sixty calls cost under a millisecond; the
broker half drives the ceiling for real over loopback, and the two sixty-call tests cost 863 ms and
810 ms of a 43 s suite — measured, and judged cheap enough to keep the boundary honest at the route
rather than only in the unit. Both halves were **watched failing first**: with the silent path admitted
unconditionally (S2.2's shape) the sixty-first answered `actual: 200, expected: 429`; with the in-flight
rule applied to every construction the second quiet call answered `busy` — `call 2, with 1 in flight
and none released` — while the thirteen modal-budget tests stayed green. The code round added two
more, both watched red before their fix: a refused caller releasing in a `finally` freed the
in-flight slot of the call it had been refused *behind* (`the call in flight still holds its slot`),
and a clock corrected half an hour backward left the window full, so every silent call was refused
until the clock caught up.

| flow | covered | note |
|---|---|---|
| the default construction is today's modal budget to the byte — five, serialized, that wording | **unit** | the literal sentence asserted, so a rewording around the number cannot pass |
| an unserialized throttle never answers `busy`, however many calls are in flight | **unit** | the in-flight rule protects a human; this path has none |
| it refuses the (max+1)th inside the window, admits again once the window has passed, and `release` is a no-op | **unit** | sixty admitted and sixty released is still sixty inside the minute |
| its refusal names silent calls and sixty, not prompts and five — and the window it measured over | **unit** | `describe` became an instance method for this; a true number in a false sentence is still a false sentence |
| `TokenlessCeilings` hands a prompting call to the modal budget and a quiet one to the ceiling, and neither sees the other | **unit** | the modal budget spent, sixty quiet calls still pass; sixty quiet calls spent, the modal budget is back a minute later |
| the sixty-first silent call in a minute is refused as `too_many_requests`, and the refusal is audited | **broker** | 61 real calls: `429`, the silent wording, zero dialogs, sixty runs, and one journal line `via mcp` — `respondError` logs nothing without a grant, so the line is written at the ceiling itself |
| sixty quiet calls spend no modal slot, so a prompting call afterwards still gets its five | **broker** | S2.2's four-call row, extended to the whole ceiling: five alias prompts pass, and the sixth is refused with the MODAL's wording |
| an entry that prompts is still refused at the sixth | **broker** | the modal defence on the MCP door, intact beside the new ceiling |
| the wire contract is unchanged | **contract** | `too_many_requests` already existed; `npm run contract` leaves `contract/broker-v1.json` with an empty diff |

**What this does not prove** *(rewritten twice — once when S2.2 made the door read the policy, and
again when S4.2 drove it through the binary; each time the obsolete half of this section was the
sentence that had stopped being true)*. Everything above stops at the extension's own loopback
surface. The leg below is what crosses it.

### The quiet path through the REAL binary (S4.2)

`src_vs_code/scripts/creds-mcp-itest.cjs`, level 6 — ten checks of a run that is **93** (82 before
this story). The lookup is the real `mcpUseHooks` over a real `StorageManager` and a real stamp
store, not a stub answering `preConsented: true`: a stub would prove the door forwards a flag, which
is already a unit test, and what had never been shown is that the POLICY, resolved through a tree,
survives the trip through the binary. Its own window, because the levels above have spent the
five-prompt budget and a fresh window has a fresh ceiling.

| flow | covered | note |
|---|---|---|
| six calls on a never-ask entry succeed end to end, and the human is asked ZERO times | **binary** | six distinct queries, each asserted by its own text, so a leg answering the same thing six times cannot pass |
| an entry answered inside its twelve hours is quiet too | **binary** | the other way to be quiet, from a stamp the real store holds |
| twelve hours and a millisecond later it asks again, and runs once allowed | **binary** | the boundary as a value, not a wait — the clock is an argument to the factory |
| deleting a never-ask entry still asks, exactly once for that call | **binary** | owner decision D2 through the binary. The count is taken immediately around the delete, so a prompt elsewhere cannot stand in for it |
| a bare local process — no token, no approval, no session, **not even an MCP client** — reaches a never-ask entry, and nobody is asked | **broker, deliberately** | the boundary this feature buys, demonstrated rather than assumed — the parent plan's finding 12 asked to SEE it. It POSTs at the loopback port rather than going through the binary, because that IS the scenario: a local process that never speaks MCP. The binary's own unattended path is what the six calls above exercise |
| the binary under test is NEWER than the C# it embodies | **binary** | `npm run itest:mcp` compiles the TypeScript and NOT the .NET server, so a stale `creds-mcp.exe` would pass every check above while proving nothing about today's code. It compares the executable against the newest `.cs`/`.csproj` under `src_mcp/src` (skipping `bin`/`obj`, which are its own output) and FAILS with the build command. Watched red by touching `Program.cs`: *built 111.4h BEFORE Program.cs* |
| the delete really moved the entry IN THE TREE | **binary** | asserted against the real `StorageManager` through the real `moveEntryToTrash`, not against a spy array agreeing with itself |
| the quiet leg contributed every check it owns | **binary** | a green run and a run that happened are different claims: an early return leaves the rest unexecuted and the script still reports success |

**Watched red**, by returning `preConsented: false` from the real lookup — and the failure is the
feature's own argument. Each of the six calls then raised a dialog, the fifth spent the
five-a-minute modal budget, and the SIXTH was refused outright with `too_many_requests`. Without the
quiet path, six agent calls in a minute are not merely noisy; they are impossible.

**What this leg still does not prove.** Three things, named because a reader will look here.

- **The caller is the script**, not a real MCP client: the handshake is hand-written, and the client
  the binary believes it is talking to is this file.
- **The sixty-a-minute silent ceiling is not exercised here.** It is unit-covered in S2.3, and sixty
  calls through a spawned binary would take the leg well past the script's timeouts. That is a cost
  accepted deliberately, not an oversight.
- **The idle auto-lock is unchanged**, and this leg shows what that means: a never-ask entry on an
  idle machine is usable by anything that can reach the loopback port. The check above demonstrates
  exactly that and calls it the boundary rather than a bug, because it is what the setting says.

And nothing here is reachable by a PERSON until Epic 3's controls, which landed in S3.1–S3.3.

### The claims, the compatibility promise, and the contract (S4.3)

The last story of #95 carries no door change. What it has instead is the text — and three of its own
guards turned out to be the interesting part, each found by the code round and each watched red.

| flow | covered | note |
|---|---|---|
| no README claims a prompt on every call | **unit** | three BANNED patterns in `readmeClaims.test.ts`, with `RETIRED_CLAIMS` feeding each one the real sentence it was written to catch. Watched red: *README.md: an entry can be set to ask every 12h or never — #95* |
| nor does the text an AGENT is handed | **unit** | the same bans over `src_mcp/src/Program.cs` and `contract/mcp-tools-v1.json`. The claim had TWO owners and only the READMEs were watched, so `Program.cs` could have drifted back to *Every action asks the person first* with the suite green — three roles of the code round said so independently. Watched red by restoring that exact sentence and reverting it. Each file is also asserted to contain the word *consent* first, so a wrong path cannot pass by scanning nothing |
| an older build that drops the policy can make an entry QUIETER, not only louder | **unit** | the CHANGELOG promised the opposite. Losing the field is losing an ANSWER, and absence means *ask the folder*: an entry deliberately set to *ask every time* inside a never-ask folder comes back silent after an older build saves it. The test PINS the hazard rather than closing it — the reader cannot tell a dropped answer from one nobody gave, so failing closed here would be "an entry can no longer inherit never", which is the feature. It did not go red, and that is the honest report: the code was right and the sentence was wrong |
| a shared token survives sustained SILENT mcp use | **unit** | `grantRegistry.test.ts`. The cap's existing test overflows with PENDING grants, which is what eviction prefers, so it passed while the real path — allowed grants at sixty a minute — evicted the oldest allowed TOKEN in about four minutes. Watched red, `undefined !== 'allowed'`; two companions beside it require that the window still bounds itself (the oldest CALL grant is what went) and that the scope defaults to the protected kind. Teeth re-proved by flipping the tiers |
| the contract is regenerated from a FRESH binary | **script guard** | `emit-mcp-tools.mjs` refuses a `creds-mcp` older than its newest `.cs`. The solution file used not to list `src_mcp` at all, so a `Program.cs` edit plus `dotnet build …slnx` reported success and regenerated the contract from the previous binary — observed exactly that way, mid-story. The solution carries both MCP projects now, which is the repair; this guard stays because it holds whatever anybody built. Watched red by `touch`ing `Program.cs`: *built 0.0h BEFORE Program.cs*. The check is the harness's own, moved to `scripts/mcpBinary.cjs` so both drivers share one copy |
| `--check` answers about the CONTRACT, not the platform | **script guard** | with `core.autocrlf=true` every checkout rewrites the generated file as CRLF while the generator writes LF, so a byte comparison reported *the MCP surface has changed* after a rebase that changed nothing. Observed on this branch. Both sides are normalised now, and `.gitattributes` pins the two `contract/*.json` files to LF |
## Connecting from a remote window (2026-09-17)

Four pure modules and one wiring, and the split between them is what makes the WSL case testable at
all on a Linux CI runner that has no `wsl.exe`.

| what | where | what it proves |
|---|---|---|
| which machine the terminal is on | `remoteWindow.test.ts` (16) | the four-rung distribution ladder, and that a relay serving `Ubuntu` is found from a `wsl+ubuntu` authority — the exact-key `Map.get` trap, measured |
| what a click may do | `remoteRoute.test.ts` (23) | a cartesian `EVERY_CASE` over (side × credential × agent × readiness × **Windows client**) lands on exactly one route, no refusal is empty, no reason repeats; plus the named cases as whole values — and one clause that pins the rest: with no Windows client installed every answer is byte-for-byte the four-argument one, so the new route can only ADD answers |
| what it says | `remoteWindowMessage.test.ts` (15) | one assertion per reason that its sentence exists and leaks no `undefined`; that the heading names both machines; that the button follows the FIRST reason, drops its "and Connect" promise when fixing the relay is not the whole fix, and is ABSENT for the one reason no command here can fix |
| asking the distribution | `wslProcess.test.ts` (10) | an answer, a non-zero exit, empty output, junk output, and a HUNG child that is bounded and observed killed — through an injected spawner, which is the only reason the hang case runs on CI |
| the connect path itself | `sshConnect.test.ts` (32), fixture in `sshConnectWorld.ts` | the report, both halves: nothing written and no terminal for a WSL window; the `env SSH_AUTH_SOCK=…` line with no `-i` when the relay serves it; a refused translation deleting the `known_hosts` file it wrote — and NOT deleting one outside the directory we write into; and the Windows-client route: the key materialised and passed UNtranslated, the pin left Windows-spelled, the program word on the line, the shell still `linux`, the agent not trusted, and a port forward connected WITH its note |
| both call sites agreeing | `remoteConnectParity.test.ts` (4) | the call sites are FOUND rather than listed; each must use the shared builder, and none may read `remoteName`, the relay setting, the configured distributions or a socket path itself — with every forbidden pattern asserted to MATCH in the builder, so a typo cannot make the guard pass forever |
| the article | `remoteWindowHelp.test.ts` (5) | all five translations are real (`fallback === false`), quote the error people arrive with, carry the 0777 measurement, and name the command by its exported label |

**What none of this proves, and the DoD says so out loud.** No unit test opens a real WSL shell.
`scripts/wsl-agent-relay-itest.cjs` is the only thing that drives the real relay with the real
OpenSSH tools, and it prints its reason and passes when WSL is absent — which is every CI run, since
CI is Linux. **A green CI run is therefore not evidence for the relay route.**

It was RUN on 2026-09-17 on a Windows machine with WSL: twenty checks, all `ok`. Three of them are
this change's, and they end with a CONTROL rather than a claim — the composed line is built by the
real `envPrefix`, it is run in a shell that does not export `SSH_AUTH_SOCK`, it reaches the agent,
and the same shell without it reaches nothing. That is what makes the first two a measurement.

**The last centimetre is still unobserved**: nobody has clicked *Connect* in a real VS Code window
attached to WSL, so VS Code creating the terminal and posting the line into it has only ever been
exercised by a stub. Closing that means building the `.vsix` and clicking once.

## What none of them covers

Named rather than implied, because the rule asks for exactly this.

- **The editor's own UI.** Nothing drives VS Code itself — no extension-host test, no click on a
  tree row, no form filled in. Every harness stubs `vscode` or talks to the broker underneath it.
  So a command registered but never wired to a menu, a context value that stops matching, or a
  webview that throws on open, is caught by unit tests over the pure halves and by nothing else.

  **What the viewer's woven-row flow has instead**, named here because the gap above is why it needs
  naming. The Show → reading → Copy path spans a panel that imports `vscode`, two hosts that do not,
  and a page script, and no harness can drive it end to end. It is covered in three places, and the
  split is deliberate: the arithmetic and the row order in `rowFlip.test.ts` and
  `wovenPicture.test.ts`; what each host answers, and that a Copy follows the order the rows were
  shown in — including when a render lands mid-await — in `paymentViewHost.test.ts` and
  `wovenPasswordForm.test.ts`; and the WIRING in `entityViewPanelWiring.test.ts`, which asserts over
  the panel's own source that one store is constructed, handed to both hosts, and cleared at both
  sites. **The limit is exact**: that wiring is read, not executed, so a panel that constructs
  everything correctly and still threw on open would pass it. That is the same limit as the rest of
  this bullet. It exists because this feature once shipped ten modules reachable from nothing but
  their own tests — a test that asserts the CALL is the answer to that — and every scan in it
  carries a companion proving the pattern still matches a known instance.
- **Open Site in Browser (issue #104).** No harness clicks the menu item or the viewer's button, and
  none lets a real VS Code hand the address to a real browser. What stands in: the judge
  (`siteUrl.test.ts`), the PIN-gated command path and the one-door scan (`openSite.test.ts`), the
  REAL viewer panel's message loop under the stub (`viewerOpenSite.test.ts`, which goes red if the
  open branch falls below the copy-only return), and the flag walk (`siteUrlFlag.test.ts`). **The
  limit is exact**: what `vscode.Uri.parse` and `openExternal` finally give the OS is not observed —
  VS Code re-serializes a `Uri`, so a percent-encoded `%26`, `%2F` or `%2B` inside a query value may
  not reach the browser as stored. The judge keeps the query as stored; the editor's last step is
  unverified.
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
