# PLAN — E1 of #197: a window can never outlive what it was given for (fix release)

> Status: **plan only, nothing implemented yet, 2026-10-20.** Scope: `src_vs_code` — `sshAgentProtocol.ts`,
> `sshAgentServer.ts`, `sshAgentManager.ts`, `agentConsent.ts`, a new pure `allowWindows.ts`, `sshKeyParse.ts` (one
> function moves out), the five `help*.ts`, `package.json`, `agentDoors.ts`, `extension.ts` (one sentence),
> `README.md`, the walkthrough, `CHANGELOG.md`, `scripts/ssh-agent-itest.cjs`, `.github/workflows/ci-extension.yml`;
> the root `README.md` (one phrase); research docs. Release: `extension-v1.14.2` (`fix:`), only with the owner's approval.
>
> Parent: [PLAN_ssh_allow_longer_windows.md](PLAN_ssh_allow_longer_windows.md) § Epics → E1. The parent is the
> authority on the design (§6) and the invariants (§5); this document is the build order of E1 and decides nothing
> the parent did not, except the deviations named in §2.

## 1. The four stories, in order

One branch, `feat/197-e1-a-window-never-outlives-its-key`. Each story is one commit with its own RED tests and its
own docs. Per story: this brief (Opus; Fable for the cornerstone) → Sonnet codes → Opus reviews → Sonnet fixes.

| # | Story — the guarantee | Model | Defects / invariants | RED tests |
|---|---|---|---|---|
| E1.1 | A login to a current OpenSSH server is named as a login, with its host key — and only a complete userauth for this key is a login | `sonnet` codes; Fable security judgement at review (outside the quota) | D6; I5 (the classifier half) | 7 (6 unit + 1 live scenario) |
| E1.2 | A removed or replaced key never signs, whatever the answer | `sonnet` codes; Fable security judgement at review (outside the quota) | D2 (the material half); I1 | 5 |
| E1.3 | A window belongs to one generation of one key, and the book's rules keep it there | **cornerstone — spec: fable**; `sonnet` codes | D1; D2 (the window half); I2, I3 (E1 part), I4, I5 (pure), I8 (rule), I10 | 4 (+14 new-module tests) |
| E1.4 | Every text of this release says what the prompt really does | `sonnet` codes | D5 (today's truth) | 2 (+2 guards) |

**The cornerstone decision: E1 takes one of the two, E1.3.** The quota is ⌈2·3/5⌉ = 2 for the whole plan, one
story per area. The window book's area exists only in E1: E2 and E3 call `endAllWindows`, `endWindows` and
`scopesFor`, they do not write them. So if the book is to have its Fable spec, it must be here. The material
boundary spans E1 and E2. E1's half (E1.2) is one membership check after an `await` and one `revoked` flag, and every
one of its tests is RED on `main` against a real socket — a mistake there is loud. E2's half (`ConsentTurns` late
continuations, `fenced-key` / `fenced-lock` answering "once, no window") is concurrency, where a mistake is silent.
That half gets the second mark when E2's document is written. E1.1 and E1.2 still get Fable's security judgement at
review, which the role table puts outside the quota.

## 2. Verified on `main` 8d93997e — and where the parent differs

All parent anchors used below were re-read on 8d93997e and match, except these:

- **D5 misses two places.** `helpEn.ts:187` says *"Add to SSH Agent (confirm every use)"* (and `:187` in the four
  translations). The root `README.md:123` says *"serve from an agent with a prompt per signature"*. Both are in E1.4.
- `research/PLAN_wsl_agent_relay.md` — the bullet is `:90-91`, not `:91`.
- `test/sshAgentProtocol.test.ts` — the positive userauth fixture is `:90-102`, not `:89-99`.
- **An import cycle the parent did not see.** The host-key fingerprint needs `keyFingerprintOf`
  (`sshKeyParse.ts:166`), and `sshKeyParse.ts:3` already imports `sshAgentProtocol.ts`. E1.1 moves the function.
- **`describePurpose` is at the complexity limit** (`sshAgentProtocol.ts:251-262`: two cases and a ternary = 4). The
  host-key branch needs a helper.
- **`research/architecture.md:460`** (*"every signature still raises the consent dialog there"*) is false today. The
  parent puts it in E2; E1.4 fixes it, and E2 only adds the lock sentence. Deviation.
- **S0's stub additions** (`showQuickPick`, `CancellationTokenSource`, `showInformationMessage`) have no user before E2/E3.
  E1 adds only a recorder of the modal's buttons. Deviation.
- **The pin `MAX_WINDOW_MS.login === ASK_WINDOW_MS`** (parent S7) moves to E1.3, where the constant is born. Deviation.
- `MAX_WINDOW_MS.all` reuses `ALLOW_WINDOW_MS` (`agentConsent.ts:38`) instead of the literal `10 * 60_000`.

## 3. E1.1 — a login to a current OpenSSH server is named as a login, with its host key

**RED tests** (each written first and watched failing on unfixed code for the reason stated):

| Test (the guarantee) | File | RED on `main` says |
|---|---|---|
| a host-bound OpenSSH login is described as a login to that host key | `test/sshAgentProtocol.test.ts` | `deepEqual`: actual `{ kind: 'unknown' }`, expected `ssh-login` with `hostKey: 'SHA256:…'` |
| a userauth with bytes after its last field is unrecognised | same | actual `ssh-login` (prefix parse), expected `unknown` |
| a userauth for a different public key is unrecognised | same | actual `ssh-login` |
| a userauth without the signature flag is unrecognised | same | actual `ssh-login` |
| a userauth cut short after the method is unrecognised (the old fixture, moved) | same | actual `ssh-login` |
| the server checks the purpose against the key it was asked for | `test/sshAgentServer.test.ts` | the purpose `confirm` receives for a host-bound login of the served key is `unknown` |
| a live OpenSSH login through the agent is named as a host-bound login to that server's host key | `scripts/ssh-agent-itest.cjs` | the stub's dialog reads *"…to sign a signature whose purpose this build does not recognise?"* |

Positive guard (green before and after): *a complete publickey userauth is recognised, with the user and the service*
— the fixture at `:90-102` rewritten as a complete request (testing.md: a file of negatives needs one positive).

**Brief.** Order for an honest RED: steps 1, 2 and the new SIGNATURE of step 3 (the parameter still unused, the server
passing it) land first, suite green — otherwise the new tests fail to compile, which is not a RED. Then the tests,
red. Then the parse.

1. `keyFingerprintOf` moves from `sshKeyParse.ts:166-169` to `sshAgentProtocol.ts` (it reads a public blob, which is
   protocol). `sshKeyParse.ts` re-exports it, so `hostKeyPin.ts:1` and `sshKeyParse.ts:267` do not change.
2. `SignPurpose` (`sshAgentProtocol.ts:191-194`): `ssh-login` gains `hostKey?: string`.
3. `describeSignRequest(data: Buffer, signingKeyBlob: Buffer): SignPurpose` (`:225-229`). `describeUserauth`
   (`:211-223`) and `isPublicKeyLogin` (`:207-209`) become a strict parse per parent §6.3: session id ≥ 16 bytes
   (`startsUserauth`, `:203-205`, kept), `50`, user, service, method ∈ {`publickey`,
   `publickey-hostbound-v00@openssh.com`} (two named constants), `has_signature` byte = 1, algorithm, key blob equal
   to `signingKeyBlob`, for host-bound one more string (the server host key), then `reader.done` (`:63-65`). Anything
   else is `unknown`. Split so no function passes complexity 4 or 50 lines: `readUserauthHead(reader)`,
   `readKeyTail(reader, method, signingKeyBlob)` → `{ hostKey?: string } | undefined`.
4. `describePurpose` (`:251-262`) calls a new `describeLogin(purpose)`: *an SSH login as "git" (ssh-connection) to the
   server with host key SHA256:…*; without `hostKey`, today's sentence. The doc comment `:183-189` names both methods
   and the strict rule, citing OpenSSH `PROTOCOL` §3.1.
5. `sshAgentServer.ts:145`: `describeSignRequest(request.data, request.publicBlob)`.
6. Tests: one fixture builder `userauth({ method, hasSignature, blob, hostKey, trailing })` in the protocol test,
   user `git`. The expected fingerprint is read back from `keyFingerprintOf`, never typed (testing.md rule 2).
   The server harness (`test/sshAgentServer.test.ts:55-109`) passes the purpose to its `confirm`.
7. **The live OpenSSH login** (parent S10.2) — a new section in `scripts/ssh-agent-itest.cjs`, called after
   `unansweredPromptRefuses` (`:169`):
   - The vscode-stub writer of `unansweredPromptRefuses` (`:228-247`) becomes one helper both sections use; the stub
     reads its answer from a global and records each dialog. The manager gets its own storage dir (`manager-login`).
   - POSIX only. On Windows it prints `skip  live OpenSSH login — POSIX only; M1 covers Windows`. Where
     `/usr/sbin/sshd` is missing: with `CI=true` it is a `FAIL` (*"a skipped live login on the runner proves
     nothing"*); locally it prints `skip … — sshd not installed` and does not fail.
   - Its folder is `fs.mkdtempSync(path.join(os.tmpdir(), 'testsToDelete-sshd-'))`: a fresh host key
     (`ssh-keygen -q -t ed25519 -N '' -f`), `authorized_keys` with the agent key's `publicLine`, a `known_hosts` line
     `[127.0.0.1]:<port> <host pub>`, and an `sshd_config` (`ListenAddress 127.0.0.1`, a free port from
     `net` `listen(0)`, `HostKey`, `AuthorizedKeysFile`, `PidFile` in the folder, `UsePAM no`, `StrictModes no`,
     `PasswordAuthentication no`).
   - `spawn('/usr/sbin/sshd', ['-D', '-e', '-f', cfg])` (sshd refuses a relative path). Wait for the port, up to 5 s.
   - `ssh -F /dev/null -o IdentityAgent=<socket> -o IdentitiesOnly=yes -o IdentityFile=<pub> -o BatchMode=yes
     -o UserKnownHostsFile=<known_hosts> -o StrictHostKeyChecking=yes -p <port> <os.userInfo().username>@127.0.0.1
     true`. Checks: exit 0; one dialog; it names *an SSH login* and *host key* followed by the fingerprint that
     `ssh-keygen -l -E sha256 -f <host pub>` prints. It also prints `ssh -V`.
   - `finally`: `sshd.kill()` on that child — its own pid, never by name — then remove the folder by its full path.
   - The existing temp folder `creds-agent-itest-` (`:50`) becomes `testsToDelete-agent-itest-`.
8. **CI** (`.github/workflows/ci-extension.yml`): `npm run itest:ssh-agent` runs in the one job `build-test` on
   `ubuntu-latest` (`:26-28`, step `:130-131`). Before it, a new step: `test -x /usr/sbin/sshd || (sudo apt-get
   update && sudo apt-get install -y --no-install-recommends openssh-server)`. Its comment names the cost (one apt
   run, tens of seconds) and says the system `ssh` service it may start on port 22 is not used. The step comment at
   `:120-129` gains the live login. The first CI run records whether the image already had `sshd`.
9. RED of the live section: run it before step 3 in WSL with `openssh-server`, or let CI run it on the branch before
   the fix. Quote the log line.

**Docs.** `CHANGELOG.md` `[Unreleased]`: open `### Fixed — …` with *a login to a current OpenSSH server is named, with
the server's host key*. `research/module_extension.md`: the row *"The dialog names what is being signed"* (the strict
rule, both methods, the host key). `research/module_tests.md`: the itest row (`:41`, the live login; what it does not
prove — a Windows login, which is M1) and the leftovers row (`:137`, both new folder names).

**Done when.** The 7 REDs are quoted beside their GREENs; the live section RAN on the CI runner (not skipped); suite,
typecheck, lint green.

## 4. E1.2 — a removed or replaced key never signs, whatever the answer

**RED tests:**

| Test (the guarantee) | File | RED on `main` says |
|---|---|---|
| a key removed while its prompt is open does not sign, whatever the answer | `test/sshAgentServer.test.ts` (real socket) | reply type `14` (SIGN_RESPONSE), expected `5` (FAILURE) |
| a key re-loaded while its prompt is open signs with neither the old nor the new material | same | reply type `14` |
| a replaced key object refuses to sign, even with identical public bytes | `test/sshAgentManager.test.ts` (the captured `LoadedKey.sign`) | `sign` returned a `Buffer`, expected `undefined` |
| an unloaded key object refuses to sign | same | a `Buffer` |
| a disposed manager's key objects refuse to sign | same | a `Buffer` |

**Brief.**

1. **S0 first, as a pure move.** `FakeServer`, `World`, `realPrivateKey`, `world`, `manager`, `storageDir` with its exit
   sweep, `keyEntity`, `KEY_ID` (`test/sshAgentManager.test.ts:31-215`) and `unanswered` (`:359-366`) move to a new
   `test/sshAgentWorld.ts` (precedent `test/pinWorld.ts`; not `*.test.ts`). The temp prefix `creds-agent-test-`
   (`:195`) becomes `testsToDelete-agent-`. `showWarningMessage` also records its buttons (`w.buttons`, used by
   E1.4). The suite stays green with no assertion changed. The test file drops from 585 lines to about 400.
2. The server's temp prefix `creds-agent-` (`test/sshAgentServer.test.ts:59`, `:231`) becomes `testsToDelete-agent-`.
3. `sshAgentServer.ts` `confirmAndSign` (`:144-150`): after the `await`, sign only if `this.options.keys()
   .includes(key)`; otherwise log `REFUSED a signature with "<name>" — the key was removed while its prompt was open`
   and return `encodeFailure()`. Object identity, so a replacement with the same bytes is refused too.
4. `sshAgentManager.ts`: `LoadedKey` (`:68-71`) gains `revoke(): void`. `serve()` (`:149-159`) closes `sign` over a
   local `revoked` flag (`sign` returns `undefined` once revoked) and first calls `this.keys.get(details.id)?.revoke()`
   — revoke-on-replace, by object. `unload()` (`:162-174`) revokes before `delete`; `dispose()` (`:352-359`) revokes
   every key before `clear`. The server's *"could not sign … (unsupported request)"* (`:156-161`) is then reached only
   by a future caller that skips step 3 — say so in the comment.
5. The server tests hold the prompt open with a promise the test resolves after it changes the `keys` array.

**Docs.** `CHANGELOG` bullet: *a key removed while its prompt was open no longer signs*. `module_extension.md` SSH agent
section: the post-await check and revoke-on-replace. `module_tests.md`: `sshAgentWorld.ts`, the new temp names.

**Done when.** The 5 REDs quoted with their GREENs; `sshAgentManager.test.ts` ≤ 450 lines; suite, lint green.

## 5. E1.3 — a window belongs to one generation of one key (cornerstone — spec: fable)

**RED tests** (manager, in a new `test/sshAgentManagerWindows.test.ts` on the shared world, so the old file keeps
room for E2 and E3):

| Test (the guarantee) | RED on `main` says |
|---|---|
| re-adding a key that is already loaded starts it with no window (D1) | `dialogs.length` 1, expected 2 |
| an answer given after Remove from SSH Agent refuses, and opens no window for the key loaded next (D2) | the answer returned `true`; then `dialogs.length` 1, expected 2 |
| an answer given across a re-load refuses and opens no window (I2) | returned `true` |
| every silent signature names the window that allowed it, and until when (I10) | the log says `allowed (within the 10-minute window)` with no end time |

**New module — cannot be red** (`test/allowWindows.test.ts`; parent §3 and §11 settle that D3 cannot be red on
`main`): a window granted to one generation of a key never covers the next · a shorter grant never shortens a longer
one of the same scope · a revocation on one key never fences an answer for another · unload/re-load wins over every
other fence (`stale-key` first) · a revocation fences an answer even when no window was open · no grant reaches past
twelve hours, whatever it is handed · an `all` window never reaches past ten minutes, whatever it is handed · a
window granted in the future covers nothing · a clock moved forward ends a window early, never extends it · a login
window never covers a Git signature or an unrecognised request · a 10-minute window still covers every purpose · the
login ceiling is the MCP ask window (`ASK_WINDOW_MS`, `mcpConsentPolicy.ts:31`) · a book that did not change is the
same object · an expired window leaves the book, and `nextExpiry` names the nearest end.

**Brief** (Fable writes the final scenarios and brief; this is the frame it starts from).

1. New `src/allowWindows.ts`, pure, no `vscode`: the whole of parent §6.1, plus
   `askTicket(book, key: KeyRef): AskTicket` (the ticket taken at arrival, since E1 has no turns). Every function
   returns a new book, or the SAME object when nothing changed. `grantWindow` is split to stay at complexity ≤ 4:
   `crossing(book, ticket, currentGeneration)` → `stale-key` | `fenced-key` | `fenced-lock` | `undefined`, in I3's
   order, then `placed(...)`, which clamps `until` to `grantedAt + MAX_WINDOW_MS[scope]` and keeps the later deadline.
   `windowCovers` reuses `withinAllowWindow` (`agentConsent.ts:80-82`) plus `grantedAt <= now`.
2. `sshAgentManager.ts`: `windows: AllowWindows = NO_WINDOWS` replaces `allowedUntil` (`:77`); `LoadedKey` gains
   `generation`; `serve()` sets `generation: ++this.generations` and `forgetKey` (D1); `unload()` uses `forgetKey`
   (`:168`); `dispose()` resets to `NO_WINDOWS` (`:354`).
3. `confirm` (`:263-285`) is at complexity 4 today. Split: `confirm` (the ticket at arrival — the server's hand-off is
   synchronous, `sshAgentServer.ts:133-145`; covered → allow) → `askToSign` (unchanged) → `settle` (decision,
   presence, a moved generation → refuse with a log line, `openWindow`) → `openWindow` (`grantWindow` with scope
   `all`; `stale-key` → refuse). E1 can produce no `fenced-*` outcome; treat one as "allow once, no window". The gate
   asks only `['all']` — a named constant — until E3 can grant a login window and switches to `scopesFor`.
4. The I10 line: `allowed without asking: 10-minute window of "<name>" until <t> (granted <t>) for <purpose>`, both
   times through `localWallTime` (`requestTime.ts:31`).
5. `agentConsent.ts:22-29`: one sentence — #197 was considered and is not the third instance (parent §6.1).
6. `consentFromChoice` stays; E3 replaces it with `answerFromModal` + `decideSigning`.

**Docs.** `CHANGELOG` bullet: *re-adding a key starts it with no window*. `module_extension.md`: the book (rules, fences,
generation), the row at `:4841`, `allowWindows.ts` in the Mermaid diagram (`:42-43`). `module_tests.md`: both suites.

**Done when.** The 4 REDs quoted with their GREENs; every function in `allowWindows.ts` and the manager ≤ 4
complexity, ≤ 50 lines; Opus review and Fable's security judgement both passed.

## 6. E1.4 — every text of this release says what the prompt really does

**Order matters for an honest RED.** First the refactor: `export const SIGNING_BUTTONS = [ALLOW_ONCE, ALLOW_WINDOW,
DENY] as const` in `agentConsent.ts` (comment: E3 inserts `ALLOW_LONGER`), and `askToSign` passes `...SIGNING_BUTTONS`
(`sshAgentManager.ts:306-309`). Suite green. Then the tests, red. Then the texts.

| Test (the guarantee) | File | RED on `main` says |
|---|---|---|
| the help names every answer the signing prompt offers (loops `SIGNING_BUTTONS` × `HELP_LANGUAGES`, article `ssh-agent`) | new `test/sshAgentHelp.test.ts` | `ssh-agent (en) does not name "Allow once"` |
| no shipped text says every signature asks (English help `ssh-agent` + `wsl-relay`, `package.json`, both READMEs, `media/walkthrough/use.md`) | same | matches *"The SSH agent that asks every time"* |
| guard: the scan's pattern matches each old sentence, quoted in the test | same | new — the companion a structural test needs |
| guard: the dialog offers exactly `SIGNING_BUTTONS`, Allow once first | `test/sshAgentManager.test.ts` (`w.buttons`) | new — green after the refactor |

**Texts** — today's truth, *Allow once, or every use for 10 minutes*; English button and command names stay English
in every language, as `:187` already does. Title (`helpEn.ts:184` and the four): *"The SSH agent that asks: once, or
for 10 minutes"*. Then `help*.ts` `:185`, `:187`, `:189`, `:209`, `:212`, `:300`; `package.json:756` → *"Add to SSH
Agent"* (`helpCoverage`'s `asProse` already drops the parenthesis) and `:110`; `agentDoors.ts:103`; `extension.ts:584`
and its comment `:566` (line-neutral — the ratchet holds it at 1025); `sshProgram.ts:10` (a comment);
`src_vs_code/README.md:41`, `:73`, `:285`, `:1114`, `:1208`; the root `README.md:123`; `media/walkthrough/use.md:4`.
**Not touched:** `CommandLine.cs:208` (E3, ships with `cli-v`); `agentDoors.ts:87` (the CLI route really asks every
time — `agentDoors.test.ts:157` pins it); `research/PLAN_ssh_agent.md:154` (a record; it gets a pointer).

**Docs.** `CHANGELOG` bullet: *the help, the menu and the README no longer say every use asks*. Dated pointer lines on
`research/PLAN_ssh_agent.md`, `PLAN_ssh_sign_prompt_timeout.md`, `PLAN_ssh_sign_prompt_time.md`,
`PLAN_agent_consent_policy.md`. `research/PLAN_wsl_agent_relay.md:90-91` rewritten: while a 10-minute window is open,
any process in WSL signs with that key without asking. `research/architecture.md:460` the same. `module_tests.md`:
the help suite.

**Done when.** The 2 REDs quoted with their GREENs; `helpCoverage` green; the five languages read true.

## 7. Epic Definition of Done

- [ ] Every story's RED was observed on unfixed code and is quoted in the PR beside its GREEN (18 REDs).
- [ ] In `src_vs_code`: `npm test`, `npm run typecheck`, `npm run lint`, `npm run ratchet` green; `extension.ts` still
      1025 lines.
- [ ] `npm run itest:ssh-agent` green locally and in CI, the live OpenSSH login section RUN (not skipped) in CI.
- [ ] Temp folders of every touched test carry `testsToDelete-`; the sshd is killed by its own pid in `finally`.
- [ ] M1 (a real login from Windows to an OpenSSH ≥ 8.9 server shows the host-bound prompt) is recorded in the PR as
      **owed by the owner** — it needs the owner's Windows machine and a real server.
- [ ] Docs of each story landed with it; Mermaid renders; `plan-lifecycle.mjs` and `pin-check.mjs` pass.
- [ ] coai `review_code` with `plan: todo/PLAN_ssh_allow_longer_windows.md`, `epic: 1/3`; every finding resolved;
      verdicts and reviewer counts reported.
- [ ] PR opened, CodeRabbit answered, merged on green checks only.
- [ ] The `extension-v1.14.2` tag is **not** cut without the owner's approval.
