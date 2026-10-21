# PLAN — E1 of #197: a window can never outlive what it was given for (fix release)

> Status: **E1 built on `feat/197-e1-a-window-never-outlives-its-key`, 2026-10-21** — stories E1.1–E1.4 and their
> review fixes landed, the coai code gate passed (`proceed`, 12 of 12 reviewers); it ships in the next extension
> release and stays in `todo/` until its parent promotes (E2 and E3 are open). Scope: `src_vs_code` — `sshAgentProtocol.ts`,
> `sshAgentServer.ts`, `sshAgentManager.ts`, `agentConsent.ts`, a new pure `allowWindows.ts`, `sshKeyParse.ts` (one
> function moves out), the five `help*.ts`, `package.json`, `agentDoors.ts`, `extension.ts` (one sentence),
> `commands/agentCommands.ts` (one sentence), `README.md`, the walkthrough, `CHANGELOG.md`, `scripts/ssh-agent-itest.cjs`,
> `.github/workflows/ci-extension.yml`; test helpers; the root `README.md` (one phrase); research docs. Release:
> `extension-v1.14.2` (`fix:`), only with the owner's approval.
>
> Parent: [PLAN_ssh_allow_longer_windows.md](PLAN_ssh_allow_longer_windows.md) § Epics → E1. The parent is the
> authority on the design (§6) and the invariants (§5); this document is the build order of E1 and decides nothing
> the parent did not, except the deviations named in §2.

## 1. The four stories, in order

One branch, `feat/197-e1-a-window-never-outlives-its-key`. Each story is one commit with its own RED tests and its
own docs. Per story: this brief (Opus; Fable for the cornerstone) → Sonnet codes → Opus reviews → Sonnet fixes.

| # | Story — the guarantee | Model | Defects / invariants | RED tests |
|---|---|---|---|---|
| E1.1 | A login to a current OpenSSH server is named as a login, with its host key — and only a complete userauth for this key is a login | `model: sonnet`; Fable security judgement at review (outside the quota) | D6; I5 (the classifier half) | 8 (7 unit + 1 live scenario) |
| E1.2 | A removed or replaced key never signs, whatever the answer | `model: sonnet`; Fable security judgement at review (outside the quota) | D2 (the material half); I1 | 5 |
| E1.3 | A window belongs to one generation of one key, and the book's rules keep it there | **cornerstone — `model: fable`** (spec); Sonnet codes | D1; D2 (the window half); I2, I3 (E1 part), I4, I5 (pure), I8 (rule), I10 | 4 (+17 new-module tests) |
| E1.4 | Every text of this release says what the prompt really does | `model: sonnet` | D5 (today's truth) | 3 (+2 guards) |

**The cornerstone decision: E1 takes one of the two, E1.3.** The quota is ⌈2·3/5⌉ = 2 for the whole plan, one
story per area. The window book's area exists only in E1: E2 and E3 call `endAllWindows`, `endWindows` and
`scopesFor`, they do not write them. So if the book is to have its Fable spec, it must be here. The material
boundary spans E1 and E2. E1's half (E1.2) is one membership check after an `await` and one `revoked` flag, and every
one of its tests is RED on `main` against a real socket — a mistake there is loud. E2's half (`ConsentTurns` late
continuations, `fenced-key` / `fenced-lock` answering "once, no window") is concurrency, where a mistake is silent.
**So E1.2 gets Fable's security judgement at review, but no Fable spec: the area's spec mark is reserved for E2.**

## 2. Verified on `main` 8d93997e — and where the parent differs

All parent anchors used below were re-read on 8d93997e and match, except these:

- **D5 misses three places.** `helpEn.ts:187` says *"Add to SSH Agent (confirm every use)"* (and `:187` in the four
  translations); the root `README.md:123` says *"serve from an agent with a prompt per signature"*;
  `commands/agentCommands.ts:679` says *"every use of the key asks first"*. All three are in E1.4.
- `research/PLAN_wsl_agent_relay.md` — the bullet is `:90-91`, not `:91`.
- `test/sshAgentProtocol.test.ts` — the positive userauth fixture is `:90-102`, not `:89-99`.
- **An import cycle the parent did not see.** The host-key fingerprint needs `keyFingerprintOf`
  (`sshKeyParse.ts:166`), and `sshKeyParse.ts:3` already imports `sshAgentProtocol.ts`. E1.1 moves the function.
- **`describePurpose` is at the complexity limit** (`sshAgentProtocol.ts:251-262`: two cases and a ternary = 4). The
  host-key branch needs a helper.
- **`tsconfig.json:12` sets `noUnusedParameters: true`**, and `npm test` compiles first. An interim unused parameter
  must be named with a leading `_` (TypeScript exempts it; `eslint.config.mjs` has no unused-variable rule at all).
- **`research/architecture.md:460`** (*"every signature still raises the consent dialog there"*) is false today. The
  parent puts it in E2; E1.4 fixes it, and E2 only adds the lock sentence. Deviation.
- **`SIGNING_BUTTONS`** is introduced in E1.4, not in the parent's S3 (E1.2 here) — it belongs with the help test
  that loops over it. Deviation.
- **S0's stub additions** (`showQuickPick`, `CancellationTokenSource`, `showInformationMessage`) have no user before E2/E3.
  E1 adds only a recorder of the modal's buttons. Deviation.
- **The pin `MAX_WINDOW_MS.login === ASK_WINDOW_MS`** (parent S7) moves to E1.3, where the constant is born. Deviation.
- **Two clocks** (gate G0): the book stores `grantedAtMono` beside `grantedAt`, and a window covers only when both
  clocks permit. The parent's I4 and §6.1 were updated to match.
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
| the server checks the purpose against the key it was asked for (a host-bound login of the served key) | `test/sshAgentServer.test.ts` | the purpose `confirm` receives is `unknown` |
| a login that names key A, sent as a sign request for key B, is not a login | same (two real keys) | the purpose is `ssh-login` |
| a live OpenSSH login through the agent is named as a host-bound login to that server's host key | `scripts/ssh-agent-itest.cjs` | the stub's dialog reads *"…to sign a signature whose purpose this build does not recognise?"* |

Positive guard (green before and after): *a complete publickey userauth is recognised, with the user and the service*
— the fixture at `:90-102` rewritten as a complete request (testing.md: a file of negatives needs one positive). For
plain `publickey` the purpose has NO `hostKey` key at all — omitted, not `undefined`, because `node:assert/strict`
`deepEqual` tells the two apart.

**Brief.** Order for an honest RED: steps 1, 2 and the new SIGNATURE of step 3 land first, suite green — the new
parameter named `_signingKeyBlob` while it is unused (`tsconfig.json:12`), the server already passing it. Otherwise
the new tests fail to compile, which is not a RED. Then the tests, red. Then the parse, and the `_` goes.

1. `keyFingerprintOf` moves from `sshKeyParse.ts:166-169` to `sshAgentProtocol.ts` (it reads a public blob, which is
   protocol). `sshKeyParse.ts` re-exports it, so `hostKeyPin.ts:1` and `sshKeyParse.ts:267` do not change.
2. `SignPurpose` (`sshAgentProtocol.ts:191-194`): `ssh-login` gains `hostKey?: string`, set only for host-bound.
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
6. Tests: ONE fixture builder, `userauth({ method, hasSignature, blob, hostKey, trailing })`, in a new shared helper
   `test/sshUserauth.ts` (not `*.test.ts`), used by both the protocol and the server tests. User `git`. The expected
   fingerprint is read back from `keyFingerprintOf`, never typed (testing.md rule 2). The server harness
   (`test/sshAgentServer.test.ts:55-109`) passes the purpose to its `confirm`.
7. **The live OpenSSH login** (parent S10.2) — a new section in `scripts/ssh-agent-itest.cjs`, called after
   `unansweredPromptRefuses` (`:169`):
   - **One stub module for both sections.** `require(OUT/sshAgentManager.js)` (`:250`) is cached after section 4, so
     the module stays bound to the `vscode` stub it first resolved (`:240`). The stub is written once; its
     `showWarningMessage` records each dialog and reads its answer from a global AT CALL TIME. A named constant
     `NEVER_ANSWER` makes it return a promise that never settles — what section 4 needs.
   - **Folder names, short on purpose.** The main folder `creds-agent-itest-` (`:50`) becomes `testsToDelete-ait-`;
     the managers' storage dirs are `m` (section 4) and `l` (this section). The socket is
     `<dir>/<m|l>/keys/<pid>/agent.sock`; worst case on macOS (`os.tmpdir()` ≈ 49 bytes) is ≈ 100 bytes, under the
     104-byte `sun_path` limit; the long `testsToDelete-agent-itest-` would reach ≈ 108. The section asserts the
     length below 104 and fails naming the path.
   - POSIX only. On Windows it prints `skip  live OpenSSH login — POSIX only; M1 covers Windows`. Where
     `/usr/sbin/sshd` is missing: with `CI=true` it is a `FAIL` (*"a skipped live login on the runner proves
     nothing"*); locally it prints `skip … — sshd not installed` and does not fail.
   - The sshd folder is `fs.mkdtempSync(path.join(os.tmpdir(), 'testsToDelete-sshd-'))`: a fresh host key
     (`ssh-keygen -q -t ed25519 -N '' -f`), `authorized_keys` with the agent key's `publicLine`, a `known_hosts` line
     `[127.0.0.1]:<n> <host pub>`, and an `sshd_config` with absolute paths only: `ListenAddress 127.0.0.1:<n>` (a free
     port from `net` `listen(0)`), `HostKey`, `AuthorizedKeysFile`, `PidFile`, `UsePAM no`, `StrictModes no`,
     `PasswordAuthentication no`, `KbdInteractiveAuthentication no`.
   - `spawn('/usr/sbin/sshd', ['-d', '-e', '-f', cfg])`. **`-d` serves exactly ONE connection without forking**, so no
     detached child can outlive a kill of this pid. sshd refuses a relative path.
   - **Readiness, with no masked failure.** Wait for sshd's stderr line `Server listening on 127.0.0.1 port <n>` while
     watching its `exit`. Not a TCP probe: under `-d` a probe would spend the one connection. If sshd exits first →
     `FAIL` at once with its captured stderr. If that stderr shows a bind failure (`Address already in use`), the whole
     setup is retried ONCE with a fresh port — that is the answer to the free-port race. No line within 10 s → `FAIL`
     (never a skip) with the stderr in the detail.
   - The client is a spawned child: `ssh -F /dev/null -o IdentityAgent=<published.SSH_AUTH_SOCK> -o
     IdentitiesOnly=yes -o IdentityFile=<pub> -o BatchMode=yes -o UserKnownHostsFile=<known_hosts>
     -o StrictHostKeyChecking=yes -p <n> <os.userInfo().username>@127.0.0.1 true`. The socket is READ BACK from what
     the real manager published, never rebuilt. Checks: exit 0; one dialog; it names *an SSH login* and *host key*
     followed by the fingerprint that `ssh-keygen -l -E sha256 -f <host pub>` prints. It also prints `ssh -V`.
   - `finally`, in this order: end the ssh client (its own pid) if still running; kill the sshd by its own pid if it
     has not exited; AWAIT its `exit` event, bounded at 5 s; only then `rmSync` the folder by its full path.
8. **CI** (`.github/workflows/ci-extension.yml`): `npm run itest:ssh-agent` runs in the one job `build-test` on
   `ubuntu-latest` (`:26-28`, step `:130-131`). Before it, a new step: `test -x /usr/sbin/sshd || (sudo apt-get update
   && sudo apt-get install -y --no-install-recommends openssh-server)`, then `sudo mkdir -p /run/sshd` — belt and
   braces: a non-root sshd does not need its privilege-separation directory, but a missing one is a known sshd abort.
   The comment names the cost (one apt run, tens of seconds) and says the system `ssh` service it may start on port 22
   is not used. The comment at `:120-129` gains the live login. The first CI run records whether the image had `sshd`.
9. RED of the live section: run it before step 3 in WSL with `openssh-server`, or let CI run it on the branch before
   the fix. Quote the log line.

**Docs.** `CHANGELOG.md` `[Unreleased]`: open `### Fixed — …` with *a login to a current OpenSSH server is named, with
the server's host key*. `research/module_extension.md`: the row *"The dialog names what is being signed"* (the strict
rule, both methods, the host key). `research/module_tests.md`: the itest row (`:41`, the live login; what it does not
prove — a Windows login, which is M1) and the leftovers row (`:137`, both new folder names).

**Done when.** The 8 REDs are quoted beside their GREENs; the live section RAN on the CI runner (not skipped); suite,
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
   local `revoked` flag and first calls `this.keys.get(details.id)?.revoke()` — revoke-on-replace, by object.
   `unload()` (`:162-174`) revokes before `delete`; `dispose()` (`:352-359`) revokes every key before `clear`.
   **A revoked `sign` logs its own line** — `refused to sign with "<name>": the key was removed or replaced` — before
   it returns `undefined`. The server's *"could not sign … (unsupported request)"* (`sshAgentServer.ts:156-161`) cannot
   carry that meaning: `signForAgent` also returns `undefined` for a key or flags it cannot sign (`signEcdsa`,
   `sshAgentSign.ts:80-92`, returns it at `:83` and `:87`; `signForAgent` is `:96-106`).
5. The server tests hold the prompt open with a promise the test resolves after it changes the `keys` array.

**Docs.** `CHANGELOG` bullet: *a key removed while its prompt was open no longer signs*. `module_extension.md` SSH agent
section: the post-await check and revoke-on-replace. `module_tests.md`: `sshAgentWorld.ts`, the new temp names.

**Done when.** The 5 REDs quoted with their GREENs; `sshAgentManager.test.ts` ≤ 450 lines; suite, lint green; Fable's
security judgement at review passed.

## 5. E1.3 — a window belongs to one generation of one key (cornerstone, `model: fable`)

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
same object · an expired window leaves the book, and `nextExpiry` names the nearest end · **two clocks** (gate G0), a
10-minute grant with (wall elapsed, monotonic elapsed) of **(11 min, 1 min) refuses** · **(1 min, 11 min) refuses** ·
**a wall clock set back that stays above `grantedAt` refuses**: grant at 10:00; after 9 real minutes the wall clock is
reset to 10:01; 8 more minutes (wall 10:09, which the wall clock alone permits; monotonic 17 min) → refused. Eight,
not nine: with nine the wall clock alone ends the window at 10:10, and the test would not hinge on the second clock.

**Brief** (Fable writes the final scenarios and brief; this is the frame it starts from).

1. New `src/allowWindows.ts`, pure, no `vscode`: the whole of parent §6.1 (with `grantedAtMono`), plus
   `askTicket(book, key: KeyRef): AskTicket` (the ticket taken at arrival, since E1 has no turns). Every function
   returns a new book, or the SAME object when nothing changed. `grantWindow` is split to stay at complexity ≤ 4:
   `crossing(book, ticket, currentGeneration)` → `stale-key` | `fenced-key` | `fenced-lock` | `undefined`, in I3's
   order, then `placed(...)`, which clamps `until` to `grantedAt + MAX_WINDOW_MS[scope]` and keeps the later deadline.
   `windowCovers` reuses `withinAllowWindow` (`agentConsent.ts:80-82`) plus `grantedAt <= now`, AND checks
   `0 <= nowMono − grantedAtMono < until − grantedAt`. Both must permit.
2. **The monotonic source is injected**: a last optional constructor parameter `monotonic: () => number =
   () => performance.now()`, after `consentTimeoutMs` (`sshAgentManager.ts:98`), so no existing call changes. Note
   for the code comment: Node's `performance.now()` / `process.hrtime` read libuv's `uv_hrtime`, which on Windows is
   `QueryPerformanceCounter` — documented by Microsoft as counting through standby and hibernation (cite the page). On
   a platform where it pauses in sleep, the wall clock still ends the window; that is what "both permit" buys.
3. `sshAgentManager.ts`: `windows: AllowWindows = NO_WINDOWS` replaces `allowedUntil` (`:77`); `LoadedKey` gains
   `generation`; `serve()` sets `generation: ++this.generations` and `forgetKey` (D1); `unload()` uses `forgetKey`
   (`:168`); `dispose()` resets to `NO_WINDOWS` (`:354`).
4. `confirm` (`:263-285`) is at complexity 4 today. Split: `confirm` → `askToSign` (unchanged) → `settle` →
   `openWindow`.
   - `confirm` reads the arrival generation as `this.keys.get(key.entityId)?.generation`, synchronously at arrival —
     the server's hand-off is synchronous (`sshAgentServer.ts:133-145`), and the manager tests pass plain
     `{ entityId, name, fingerprint }` objects, so `key.generation` would be `undefined`. No loaded key at arrival →
     refuse with a log line. Covered → allow.
   - `settle`: the decision, presence, and `openWindow` when the answer is timed. No generation check here.
   - `openWindow`: `grantWindow` with scope `all`; `stale-key` → refuse. **The generation is checked in ONE place**, the
     book's `stale-key`. An *Allow once* across unload or re-load is refused by E1.2's server check (object identity).
     E1 can produce no `fenced-*` outcome; treat one as "allow once, no window".
   - The gate asks only `['all']` — a named constant — until E3 can grant a login window and switches to `scopesFor`.
5. The I10 line: `allowed without asking: 10-minute window of "<name>" until <t> (granted <t>) for <purpose>`, both
   times through `localWallTime` (`requestTime.ts:31`).
6. `agentConsent.ts:22-29`: one sentence — #197 was considered and is not the third instance (parent §6.1).
7. `consentFromChoice` stays; E3 replaces it with `answerFromModal` + `decideSigning`.

**Docs.** `CHANGELOG` bullet: *re-adding a key starts it with no window*. `module_extension.md`: the book (rules, fences,
generation, two clocks), the row at `:4841`, `allowWindows.ts` in the Mermaid diagram (`:42-43`). It says plainly that
the **lock and row-button fences are defined in the book but NOT wired until E2** — E1 must not read as "a lock ends
windows". `module_tests.md`: both suites.

**Done when.** The 4 REDs quoted with their GREENs; every function in `allowWindows.ts` and the manager ≤ 4
complexity, ≤ 50 lines; Opus review and Fable's security judgement both passed.

#### E1.3 spec (Fable)

Anchors are `sshAgentManager.ts` on `7e9d82af` (E1.2's `revoke` lines shift them; re-anchor by the quoted text).
Where this spec and the frame above differ, this spec wins (the list closes §3 here).

##### 1. The module contract — `src/allowWindows.ts` (pure, no `vscode`)

```ts
import { ALLOW_WINDOW_MS, withinAllowWindow } from './agentConsent';   // one way in E1; E3 adds `import type { WindowScope }` back
export type WindowScope = 'all' | 'login';
export interface KeyRef { readonly entityId: string; readonly generation: number }
export interface AskTicket extends KeyRef { readonly keyFence: number; readonly lockEpoch: number }
export interface OpenWindow { readonly generation: number; readonly grantedAt: number; readonly grantedAtMono: number; readonly until: number }
export type ScopeWindows = Readonly<Partial<Record<WindowScope, OpenWindow>>>;
export interface AllowWindows { readonly lockEpoch: number; readonly keyFences: ReadonlyMap<string, number>; readonly open: ReadonlyMap<string, ScopeWindows> }
export const NO_WINDOWS: AllowWindows;                               // lockEpoch 0, two empty maps, frozen
export const MAX_WINDOW_MS: Readonly<Record<WindowScope, number>>;   // { all: ALLOW_WINDOW_MS, login: 12 * 3_600_000 }
export const ALL_ONLY: readonly WindowScope[];                       // ['all'] — the only scopes E1's gate asks
export type GrantOutcome = 'opened' | 'kept-later' | 'stale-key' | 'fenced-key' | 'fenced-lock';
export function askTicket(book: AllowWindows, key: KeyRef): AskTicket;
export function grantWindow(book: AllowWindows, ticket: AskTicket, scope: WindowScope, currentGeneration: number | undefined,
  grantedAt: number, grantedAtMono: number, until: number): { book: AllowWindows; outcome: GrantOutcome };
export function scopesFor(purposeIsLogin: boolean, autoLockMinutes: number): readonly WindowScope[];
export function windowCovers(book: AllowWindows, key: KeyRef, scopes: readonly WindowScope[], now: number, nowMono: number): OpenWindow | undefined;
export function windowsFor(book: AllowWindows, key: KeyRef, scopes: readonly WindowScope[], now: number, nowMono: number): ScopeWindows;
export function endWindows(book: AllowWindows, entityId: string): AllowWindows;     // the row button (E2)
export function endLoginWindows(book: AllowWindows): AllowWindows;                   // auto-lock set to 0 (E3)
export function endAllWindows(book: AllowWindows): AllowWindows;                     // any lock (E2)
export function forgetKey(book: AllowWindows, entityId: string): AllowWindows;      // unload, re-load (E1)
export function withoutExpired(book: AllowWindows, now: number, nowMono: number): AllowWindows;
export function nextExpiry(book: AllowWindows, now: number): number | undefined;
```

The rules:

- A fence never moved reads **0**: one private `fenceOf(book, id)` (`?? 0`) — used by `askTicket` AND the crossing
  check, never two spellings of the default. `askTicket` = `{ ...key, keyFence: fenceOf(…), lockEpoch: book.lockEpoch }`.
- `grantWindow` = private `crossing(book, ticket, currentGeneration)` in I3's order — `currentGeneration !==
  ticket.generation` → `stale-key`; `fenceOf(book, id) !== ticket.keyFence` → `fenced-key`; `book.lockEpoch !==
  ticket.lockEpoch` → `fenced-lock`; a crossing returns the SAME book — then private `placed`: `until' = min(until,
  grantedAt + MAX_WINDOW_MS[scope])`; an existing window of this scope with `until >= until'` → `kept-later`, same
  book; else `opened`: new book, new `open` map, this key's other scope kept, entry `{ generation:
  ticket.generation, grantedAt, grantedAtMono, until: until' }`. An `until` at or before `grantedAt` is placed as
  handed; it covers nothing.
- ONE private `covers(w, key, now, nowMono)` (two helpers, wall and mono, for complexity): `w.generation ===
  key.generation`, `withinAllowWindow(w.until, now)`, `w.grantedAt <= now`, and `0 <= nowMono − w.grantedAtMono <
  w.until − w.grantedAt`. `windowCovers` = the first scope in `scopes` order that covers; `windowsFor` = every one.
- `scopesFor` = `purposeIsLogin && autoLockMinutes > 0 ? ['all', 'login'] : ALL_ONLY`.
- `forgetKey` and `endWindows` = one private `fenced(book, id)`: fence + 1, the key's `open` entry deleted; always a
  new book, even with nothing open (I3). Two names, one operation, so the caller's intent reads.
- `endAllWindows`: `lockEpoch + 1`, `open` empty, fences kept; always new. `endLoginWindows`: every `login` entry
  dropped, no fence moved. `withoutExpired`: keeps the windows that pass the wall and mono halves of `covers`. Those
  two drop a key whose entry is empty and return the same object when nothing was dropped.
- `nextExpiry`: the smallest `until > now` over every open window, else `undefined`.

**Wired in E1:** `NO_WINDOWS`, `askTicket`, `grantWindow` (scope `all`), `windowCovers` with `ALL_ONLY`, `forgetKey`.
**Defined and tested in E1, unwired until later:** `endWindows`, `windowsFor` (E2's row and button), `endAllWindows`
(E2's lock — `lockEpoch` moves only there), `withoutExpired` / `nextExpiry` (E2's timer), `endLoginWindows`,
`scopesFor` at the gate, `MAX_WINDOW_MS.login` (E3). No E1 path produces `fenced-key` or `fenced-lock`.

##### 2. The scenarios

Constants in both files: `MIN = 60_000`, `H = 3_600_000`, `W = Date.UTC(2026, 8, 24, 10, 0, 0)` (wall, "10:00"),
`M = 50_000` (monotonic — NOT 0, trap 8), `A = { entityId: 'key-1', generation: 1 }`, `B` the same for `key-2`.
Helper `grant(book, key, scope, grantedAt, mono, until)` = `askTicket` + `grantWindow` with `currentGeneration =
key.generation`. A probe is `(wall, mono)`; unless said, the window is `A`, scope `all`, granted `(W, M)` until `W + 10·MIN`.

**`src/test/allowWindows.test.ts`** (pure; none can be RED on `main` — the module is new):

1. *a window granted to one generation of a key never covers the next* — `windowCovers` for `{ key-1, generation: 2 }`
   at `(W + MIN, M + MIN)` → `undefined`; generation 1 at the same probe → the window; after `forgetKey(book,
   'key-1')` both are `undefined` and `open.has('key-1')` is false.
2. *a revocation fences an answer even when no window was open* — `t = askTicket(NO_WINDOWS, A)`; `b1 =
   endWindows(NO_WINDOWS, 'key-1')`; `grantWindow(b1, t, 'all', 1, W, M, W + 10·MIN)` → `fenced-key`, `book === b1`.
   The same with `endAllWindows` → `fenced-lock`.
3. *a revocation on one key never fences an answer for another* — `t` for `A`; `endWindows` then `forgetKey` on
   `key-2`; grant with `t` → `opened`.
4. *unload/re-load wins over every other fence* — `t` for `A`; `b1 = forgetKey(endAllWindows(NO_WINDOWS), 'key-1')`;
   `grantWindow(b1, t, 'all', 2, …)` → `stale-key` (not `fenced-lock`); `currentGeneration` `undefined` → `stale-key`.
5. *a fresh key's first grant opens* — `askTicket(NO_WINDOWS, A)` then grant → `opened` (pins the `?? 0`).
6. *no grant reaches past its scope's ceiling, whatever it is handed* — `all` handed `W + H` → stored `until === W +
   ALLOW_WINDOW_MS`, probe `(W + 11·MIN, M + 11·MIN)` undefined; `login` handed `W + 13·H` → `W + 12·H`;
   `MAX_WINDOW_MS.login === ASK_WINDOW_MS` (the TEST imports `mcpConsentPolicy.ts`; the module never does) and
   `MAX_WINDOW_MS.all === ALLOW_WINDOW_MS`.
7. *a shorter grant never shortens a longer one of the same scope* — then at `(W + MIN, M + MIN)` a grant until
   `W + 5·MIN` → `kept-later`, same object, probe `(W + 9·MIN, M + 9·MIN)` covered; the reverse order → `opened`,
   the same probe covered.
8. *scopes are independent* — a `login` until `W + H` beside the `all`: `windowsFor(…, ['all', 'login'], W + MIN,
   M + MIN)` holds both.
9. *a window granted in the future covers nothing* — `(W − MIN, M + MIN)` undefined (wall below `grantedAt`);
   `(W + MIN, M − 1)` undefined (mono below `grantedAtMono`).
10. *a clock moved forward ends a window early, never extends it* — `(W + 25·MIN, M + MIN)` undefined.
11. *two clocks, (11 min, 1 min) refuses* — `(W + 11·MIN, M + MIN)` undefined.
12. *two clocks, (1 min, 11 min) refuses* — `(W + MIN, M + 11·MIN)` undefined.
13. *the boundary expires on both clocks* — `(W + MIN, M + MIN)` covered (the control); `(W + 10·MIN − 1, M + 10·MIN
    − 1)` covered; `(W + 10·MIN, M + MIN)` undefined; `(W + MIN, M + 10·MIN)` undefined.
14. *a wall clock set back that stays above `grantedAt` refuses* — `(W + 9·MIN, M + 17·MIN)` undefined; the control
    `(W + 9·MIN, M + 9·MIN)` covered, so the case hinges on the second clock.
15. *a login window never covers a Git signature or an unrecognised request* — `login` until `W + H` only;
    `windowCovers(book, A, scopesFor(false, 60), W + 30·MIN, M + 30·MIN)` undefined; with `scopesFor(true, 60)` → it.
16. *a 10-minute window still covers every purpose* — covered under `scopesFor(false, 60)`, `(true, 60)` and
    `(true, 0)`; and `scopesFor(true, 60)` → `['all', 'login']`, `(false, 60)`, `(true, 0)`, `(true, −1)` → `['all']`.
17. *a book that did not change is the same object, and a grant never changes the book it was given* —
    `assert.equal(result, book)` for `kept-later`, each crossing, `endLoginWindows` with no `login` window,
    `withoutExpired` with nothing expired; hold `before`, grant, `before.open.size === 0`.
18. *a lock ends every window and keeps the fences* — `endAllWindows`: `open.size 0`, `lockEpoch + 1`, `keyFences` unchanged.
19. *ending the login windows moves no fence* — `t` for `A`; `b1 = endLoginWindows(A's login + all)`; `all`
    survives, `login` gone; `grantWindow(b1, t, 'all', 1, …)` → `opened`.
20. *an expired window leaves the book, `nextExpiry` names the nearest end, and both clocks count* — `B` until
    `W + 5·MIN` beside `A`; `withoutExpired(book, W + 6·MIN, M + 6·MIN)` → `B` gone, `A` kept, `open.has('key-2')`
    false; `nextExpiry(book, W) === W + 5·MIN`, after → `W + 10·MIN`, on `NO_WINDOWS` → undefined;
    `withoutExpired(book, W + MIN, M + 11·MIN)` → `A` gone.

**`src/test/sshAgentManagerWindows.test.ts`** (on `test/sshAgentWorld.ts` from E1.2; `manager()` gains
`monotonic?: () => number`, the fifth constructor argument). `key` is the plain `{ entityId: KEY_ID, name: 'prod',
fingerprint: 'SHA256:abc' }` the old file uses.

- M1 *re-adding a key that is already loaded starts it with no window* (D1) — answers `[ALLOW_WINDOW, ALLOW_ONCE]`;
  load; confirm; `load` again (no unload); confirm → `dialogs.length === 2`. **RED on `main`:** `1 !== 2`.
- M2 *an answer given after Remove from SSH Agent refuses, and opens no window for the key loaded next* (D2) —
  `modal = unanswered()`, answers `[modal.answer, ALLOW_ONCE]`, `consentTimeoutMs: 1000`; load; `pending =
  confirm(key)`; `unload(KEY_ID)`; `modal.clickLate(ALLOW_WINDOW)`; `await pending === false` and a log line
  `/REFUSED .* removed or re-added/`; `load` again; confirm → `dialogs.length === 2`. **RED:** `true !== false`
  (`consentFromChoice` is applied whatever happened), then `1 !== 2`.
- M3 *an answer given across a re-load refuses and opens no window* (I2) — M2 with `load` in place of `unload`.
  **RED:** `true !== false`.
- M4 *every silent signature names the window that allowed it, and until when* (I10) — stopped clock `W`, answers
  `[ALLOW_WINDOW]`; confirm; clock to `W + MIN`; confirm (silent); one log line starts with `allowed without asking:
  10-minute window of "prod" until ${localWallTime(new Date(W + ALLOW_WINDOW_MS))} (granted ${localWallTime(new
  Date(W))}) for ` — both stamps read through the function, never typed. **RED:** no line matches `/allowed without
  asking/`; `main` writes `allowed (within the 10-minute window) for …`.
- M5 *the gate reads the injected monotonic clock* (new; the parameter does not exist on `main`) — wall `W` then
  `W + MIN`, monotonic `M` then `M + 11·MIN`, answers `[ALLOW_WINDOW, ALLOW_ONCE]`; confirm; confirm →
  `dialogs.length === 2` ("the wall clock alone would have covered it").
- M6 *a request for a key that is not loaded is refused without a dialog* (new) — `entityId: 'ghost'` → `false`,
  `dialogs.length === 0`, a log line `/not loaded/`.

##### 3. The brief — `sshAgentManager.ts`

1. `:5` add `localWallTime` to the `requestTime` import. `:12-19` drop `withinAllowWindow` (unused → `noUnusedLocals`);
   add `ALL_ONLY, AllowWindows, AskTicket, NO_WINDOWS, askTicket, forgetKey, grantWindow, windowCovers` from `./allowWindows`.
2. `:68-71` `LoadedKey` gains `generation: number` (beside E1.2's `revoke`). `:76-77` the `allowedUntil` map becomes
   `private windows: AllowWindows = NO_WINDOWS;` (not `readonly`: replaced, never mutated), `private generations = 0;`
   and `private readonly monotonic: () => number;`.
3. `:80-99` the constructor gains a FIFTH parameter after `consentTimeoutMs`: `monotonic?: () => number` — **optional,
   NO default value**. ESLint counts a defaulted parameter (`AssignmentPattern`) as a branch; the constructor is at 4
   today (three defaults) and `= () => performance.now()` makes it 5 — measured with `eslint --stdin`, 2026-10-20.
   The body, today `{}`, becomes `{ this.monotonic = monotonicSource(monotonic); }` with a module-level `function
   monotonicSource(source: (() => number) | undefined): () => number { return source ?? (() => performance.now()); }`.
   Its comment: `performance.now()` is libuv's `uv_hrtime`, on Windows `QueryPerformanceCounter`, documented as
   counting through standby (learn.microsoft.com, *Acquiring high-resolution time stamps*); where it pauses, the wall
   clock still ends the window. `performance` is a global under `@types/node` 20. `extension.ts:568` does not change.
4. `:149-159` `serve()`: first line `this.windows = forgetKey(this.windows, details.id);` (after E1.2's `revoke()`),
   and `generation: ++this.generations` in the literal — every serve, first load included, one path, no branch.
   `:168` → `this.windows = forgetKey(this.windows, entityId);`. `:354` → `this.windows = NO_WINDOWS;`.
5. `:263-285` `confirm` becomes four methods, plus a private `generationOf(entityId): number | undefined` returning
   `this.keys.get(entityId)?.generation` (the `?.` is a branch; keep it out of `confirm`).
   - `confirm(key, purpose, data)`: `asked = this.clock()`, `generation = this.generationOf(key.entityId)`, `nowMono =
     this.monotonic()` — all three BEFORE the first `await`, which is what "arrival" means (`sshAgentServer.ts:133-145`
     hands off synchronously; the tests pass plain objects, so `key.generation` is never read); `noteUnknown`;
     `generation === undefined` → log `REFUSED a signature with "<name>": the key is not loaded`, return `false`;
     `arrived = { entityId, generation }`; `covered = windowCovers(this.windows, arrived, ALL_ONLY, asked.getTime(),
     nowMono)`; covered → `logCovered(key, purpose, covered)`, return `true`; `ticket = askTicket(this.windows,
     arrived)`; `choice = await this.askToSign(key, purpose, asked)`; return `this.settle(key, ticket, choice)`. Complexity 3.
   - `settle(key, ticket, choice): boolean`: `grantedAt = this.clock().getTime()`, `grantedAtMono = this.monotonic()`
     (read once each, side by side); `decision = consentFromChoice(choice, grantedAt)`; presence as today;
     `allowedUntil === undefined` → return `decision.allow`; else return `this.openWindow(key, ticket, { grantedAt,
     grantedAtMono, until: decision.allowedUntil })`. No generation check here. Complexity 3.
   - `openWindow(key, ticket, at): boolean`: `grantWindow(this.windows, ticket, 'all', this.generationOf(key.entityId),
     at.grantedAt, at.grantedAtMono, at.until)`; `this.windows = book`; `stale-key` → log `REFUSED a signature with
     "<name>": answered after the key was removed or re-added — no window was opened`, return `false`; anything else →
     `true` (`opened`, `kept-later`, the two E1-unreachable fences). **The one place the generation is checked.** Complexity 2.
   - `logCovered(key, purpose, w)`: the I10 line, `allowed without asking: 10-minute window of "${key.name}" until
     ${localWallTime(new Date(w.until))} (granted ${localWallTime(new Date(w.grantedAt))}) for ${describePurpose(purpose)}`.
6. `agentConsent.ts:22-29`: the one sentence of frame step 6. Nothing else in that file.
7. **Not to change:** `askToSign` and its text (E1.4 edits the buttons), `consentFromChoice` (E3), no `ConsentTurns`
   or queue, no lock wiring or `onDidLock`, no hooks, no expiry timer, no row text, `withinAllowWindow`'s signature,
   `mcpConsentPolicy.ts`.

**Where this spec differs from the frame above:** the frame's step 2 defaulted parameter (lint, step 3 here);
`generationOf` instead of an inline `?.`; M5 and M6 added; 20 pure tests holding 26 guarantees, not 17.

##### 4. The traps, each with the test that pins it

1. **`>=` at the boundary.** `withinAllowWindow` is strict (`until > now`, `agentConsent.test.ts:54`); the mono half
   is strict too (`elapsed < length`). Pinned by 13.
2. **The clock read twice** (the gate for the check and again for the log; `settle` for `consentFromChoice` and again
   for `grantedAt`) can straddle a boundary. A stopped test clock cannot see it; the Opus review checks it.
3. **The fence compared with `<` or `>`.** Use `!==`: with a missed `?? 0`, `undefined < 1` is `false` and the fence
   is silently passed; `!==` fails safe. Pinned by 2 and 5.
4. **Mutating a `ReadonlyMap` through a cast** (`(book.open as Map).set(…)`), or `kept-later` building a new book
   anyway (E2 repaints on reference change). Pinned by 17.
5. **The monotonic clock injected but not used** — in the gate, or in `withoutExpired`. Pinned by M5 and 20.
6. **A fourth defaulted constructor parameter.** Complexity 5; `npm run lint` is the pin (brief step 3).
7. **The generation read after the first `await`** (inside `settle`): a re-load during the prompt is then read as the
   current generation and `stale-key` never fires. Pinned by M3. Reading `key.generation` from the `AgentKey`
   argument is the same trap: the manager tests pass plain objects, every M-test refuses as "not loaded".
8. **`grantedAtMono` never stored, or stored as `0`.** `M = 50_000` makes the arithmetic wrong in both cases; 13's
   control and M5 catch it. Never start a test's monotonic clock at 0.
9. **`forgetKey` only in `unload`, not in `serve`.** Pinned by M1. **The generation checked on one side only** —
   `covers` (1) and `crossing` (4) both check it; both stay.
10. **`endLoginWindows` moving the key fence** (a pending 10-minute answer must still open) — pinned by 19;
    **`scopesFor` with `!== 0`** (a negative setting must read as "off") — pinned by 16; **`withoutExpired` leaving an
    empty key entry, or dropping a key's other scope** — pinned by 20 and 1.

## 6. E1.4 — every text of this release says what the prompt really does

**Order matters for an honest RED.** First the refactor: `export const SIGNING_BUTTONS = [ALLOW_ONCE, ALLOW_WINDOW,
DENY] as const` in `agentConsent.ts` (comment: E3 inserts `ALLOW_LONGER`), and `askToSign` passes `...SIGNING_BUTTONS`
(`sshAgentManager.ts:307-309`). Suite green. Then the tests, red. Then the texts.

| Test (the guarantee) | File | RED on `main` says |
|---|---|---|
| the help names every answer the signing prompt offers (loops `SIGNING_BUTTONS` × `HELP_LANGUAGES`, article `ssh-agent`) | new `test/sshAgentHelp.test.ts` | `ssh-agent (en) does not name "Allow once"` |
| no shipped text says every signature asks (English help `ssh-agent` + `wsl-relay`, `package.json`, both READMEs, `media/walkthrough/use.md`) | same | matches *"The SSH agent that asks every time"* |
| no replaced sentence survives, in any language: each old sentence, quoted per language, is absent from all five `help*.ts`, and the old strings of `extension.ts:584`, `agentDoors.ts:103` and `commands/agentCommands.ts:679` are absent from those files | same | `helpDe.ts still says "Der SSH-Agent, der jedes Mal fragt"` |
| guard: the scan's pattern matches each old English sentence, quoted in the test | same | new — the companion a structural test needs |
| guard: the dialog offers exactly `SIGNING_BUTTONS`, Allow once first | `test/sshAgentManager.test.ts` (`w.buttons`) | new — green after the refactor |

Reading files: reuse `REPO` and `read()` of `test/readmeClaims.test.ts:37-66` — they are module-private, so they move
to a new helper `test/repoFiles.ts` (with the root guard of `:39-50`), and `readmeClaims.test.ts` imports them.
Never derive the repository root a second time (reuse-first move 2).

**Texts** — today's truth, *Allow once, or every use for 10 minutes*; English button and command names stay English
in every language, as `:187` already does. Title (`helpEn.ts:184` and the four): *"The SSH agent that asks: once, or
for 10 minutes"*. Then `help*.ts` `:185`, `:187`, `:189`, `:209`, `:212`, `:300`; `package.json:756` → *"Add to SSH
Agent"* (`helpCoverage`'s `asProse` already drops the parenthesis) and `:110`; `agentDoors.ts:103`; `extension.ts:584`
(line-neutral — the ratchet holds the file at 1025); `commands/agentCommands.ts:679`; `src_vs_code/README.md:41`,
`:73`, `:285`, `:1114`, `:1208`; the root `README.md:123`; `media/walkthrough/use.md:4`. **Comments that say the same
thing**, fixed line-neutral: `extension.ts:566`, `sshProgram.ts:10`, `sshAgentServer.ts:20`, `sshAgentManager.ts:243`.
**Not touched:** `CommandLine.cs:208` (E3, ships with `cli-v`); `agentDoors.ts:87` (the CLI door: it really asks every
time, because `handleAlias` mints a fresh grant per call, and `agentDoors.test.ts:157` pins that sentence);
`research/PLAN_ssh_agent.md:154` (a record; it gets a pointer).

**Who attests the new prose:** the Opus review of E1.4 reads the four translations explicitly, sentence by sentence
against the English, and its verdict on them is quoted in the PR.

**Docs.** `CHANGELOG` bullet: *the help, the menu and the README no longer say every use asks*. Dated pointer lines on
`research/PLAN_ssh_agent.md`, `PLAN_ssh_sign_prompt_timeout.md`, `PLAN_ssh_sign_prompt_time.md`,
`PLAN_agent_consent_policy.md`. `research/PLAN_wsl_agent_relay.md:90-91` rewritten: while a 10-minute window is open,
any process in WSL signs with that key without asking. `research/architecture.md:460` the same. `module_tests.md`:
the help suite and the two new helpers.

**Done when.** The 3 REDs quoted with their GREENs; `helpCoverage` and `readmeClaims` green; the translation review
quoted in the PR.

## 7. Epic Definition of Done

- [ ] Every story's RED was observed on unfixed code and is quoted in the PR beside its GREEN (20 REDs).
- [ ] In `src_vs_code`: `npm test`, `npm run typecheck`, `npm run lint`, `npm run ratchet` green; `extension.ts` still
      1025 lines.
- [ ] `npm run itest:ssh-agent` green locally and in CI, the live OpenSSH login section RUN (not skipped) in CI.
- [ ] Temp folders of every touched test carry `testsToDelete-`; the sshd ran with `-d`, was killed by its own pid,
      and its `exit` was awaited before the folder was removed.
- [ ] M1 (a real login from Windows to an OpenSSH ≥ 8.9 server shows the host-bound prompt) is recorded in the PR as
      **owed by the owner** — it needs the owner's Windows machine and a real server.
- [ ] Docs of each story landed with it; Mermaid renders; `plan-lifecycle.mjs` and `pin-check.mjs` pass.
- [ ] coai `review_code` with `plan: todo/PLAN_ssh_allow_longer_windows.md`, `epic: 1/3`; every finding resolved;
      verdicts and reviewer counts reported.
- [ ] PR opened, CodeRabbit answered, merged on green checks only.
- [ ] The `extension-v1.14.2` tag is **not** cut without the owner's approval.

## 8. Review record

- **coai plan gate on `63b77365`** (this document's first version): verdict **`proceed`**, **3 of 3 reviewers
  answered**, 9 findings. Accepted: 0 (two clocks, §5), 3 (sshd startup: no free-port race, no masked failure,
  §3 step 7), 4 (the negation guard and who attests the translations, §6), 5 (`/run/sshd`, §3 step 8), 6 (no sshd
  child left behind: `-d`, kill by pid, await `exit`, §3 step 7). Rejected: 1 — release-please's PR bumps
  `package.json` and `package-lock.json` together (#247 shows it); 2 — the classifier is platform-independent, the
  named pipe and the relay forward the bytes unchanged, and M1 stays a recommended post-release check; 7 — VS Code
  cannot dismiss a modal, and E2 adds the stale-click message; 8 — the arrival generation is current by
  construction, and `grantWindow` re-checks it.
- **Own review (Opus), same commit:** 11 findings, all folded in — the `_` parameter (`tsconfig.json:12`),
  `agentCommands.ts:679` and the negation guard reusing `REPO`/`read()`, the key-binding RED and one shared
  `userauth` builder, the arrival generation read from the map and checked in one place, the live section's cached
  stub / read-back socket / short paths, the revoked `sign`'s own log line, the E2-only fences said in the docs, the
  deviation and comment lists, `hostKey` omitted, the `model: fable` mark, the button anchor `:307-309`.
- **Cadence consultation for epics 1–3:** the split is kept; three additions folded in — the two clocks (E1.3), the
  `sshd -d` cleanup (E1.1), and the eligibility re-check at the pick (E3, parent §6.2, §6.6 and Epics → E3).
