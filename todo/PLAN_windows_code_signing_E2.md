# PLAN — Windows code signing, E2: this repository signs its Windows `creds` and `creds-mcp` binaries

> Status: **built and gated, 2026-11-03; re-baselined 2026-11-04 (parent epoch 3) — on `ci/windows-code-signing-e2`, not merged. The merge belongs to E4 (pin bump to `v1.1.0`, the `allow-unsigned-release` switch, docs reworded, squash merge with `ALLOW_UNSIGNED_RELEASES=true`); V1, V2 and the `fix` releases belong to E5, the activation cutover.** Stories of epic E2 of [PLAN_windows_code_signing.md](PLAN_windows_code_signing.md).
> Scope: `.github/workflows/release.yml` (jobs `cli-binaries`, `cli-release`, `mcp-binaries`, `mcp-release`, two new
> jobs `cli-sign` / `mcp-sign`), `src_vs_code/src/test/releaseSigning.test.ts` (new), `CLAUDE.md`, `src_cli/README.md`,
> `src_mcp/README.md` (new, D9). Branch `ci/windows-code-signing-e2`, cut from `ci/windows-code-signing` (which holds only the plan commits) so E2 gets its own gate session. No product
> code, no contract change.

**Committed together with this document:** its row in `todo/README.md` under *Currently open* (the shared
`common/planning-docs.md` § *A plan split into epics and stories*). E2 marks no cornerstone; after the epoch-3 re-split
the parent's ledger reads `Cornerstones: 2 of 2 — E1.1, E3.1`.

**Epoch-3 note (2026-11-04).** The parent's re-review (§3.4, E3–E5) changed what this document said about the merge:
no provider exists, so E2 does not wait for O1–O8, V1 or V2. E4 continues on this branch and merges it behind the
switch; E5 does the activation later. Where a paragraph below says "merged only after O1–O8, V1 and V2", "Rebase and
merge" or "the docs say the Windows binaries are signed", the parent's §3.2, §3.4 and E4 replace it; the paragraphs are
kept as the record of what E2 built. The stories' code and tests stand as built.

## Who writes what (the review gate's operator orders)

| Part | E2.1 | E2.2 | E2.3 |
|---|---|---|---|
| Scenarios and brief | Opus — this document | Opus — this document | Opus — this document |
| Code and tests | Sonnet | Sonnet | Sonnet (docs and the two `fix:` commits) |
| Review | Opus | Opus | Opus |
| Review fixes | Sonnet | Sonnet | Sonnet |

No cornerstone in E2, so no Fable spec. Opus's review checks the parent's *watched at review* list: the release jobs
`needs` the sign jobs, `id-token: write` only on the two caller jobs, the 40-hex pin, and the cross-repository
federation (only V1 proves it). The coai gate runs once for E2: code rounds on the PR from `ci/windows-code-signing-e2`.

## Binding constraints (from the parent, for every story)

- **The pin.** `uses: oleksandrdubyna88/dew_flow_release_signing/.github/workflows/sign-windows.yml@<40-hex> # v1.0.0`.
  E1 is being built now, so the SHA is not known. It is written **at E2.2 time**: E1's merge commit, which the tag
  `v1.0.0` points at (read it with `git ls-remote … refs/tags/v1.0.0` and its `^{}` line if the tag is annotated). E2.1
  needs no pin and may start before `v1.0.0` exists; E2.2 may not. (Built: 609cc23. E4 bumps it to `v1.1.0`'s merge
  commit and adds `allow-unsigned-release: ${{ vars.ALLOW_UNSIGNED_RELEASES == 'true' }}` to both sign jobs.)
- The five inputs are E1.1's (spec §S1.1): `artifacts`, `own-files`, `extra-files` (default `[]`), `required`,
  `environment` (default `release-signing`). E2 passes `artifacts`, `own-files`, `required` only. This repository's
  packages hold one own file each, so `extra-files` stays at its default; `environment` keeps `release-signing` (O7).
- **`retention-days: 7` on every cli and mcp artifact** — the unsigned ones and the packaged ones (parent §3.2, §8:
  *Re-run failed jobs* after a signing outage must still find every platform's asset). Today both uploads say `1`.
- **`Package` uses the Version step's `$VERSION`** (`release.yml:374-381`, `:591-598`). Today it recomputes it from
  `GITHUB_REF_NAME` (`:429`, `:638`), so a dispatch from `ci/windows-code-signing-e2` puts the branch name, slash
  included, into the package name and V1 cannot even package.
- No new action. New `run:` blocks hold no `${{ }}`; values reach them through `env:` (the existing blocks stay).
- **Add no `- rid:` line.** `credsInstall.test.ts:46-57` collects every `^\s+- rid:` line of `release.yml` and
  compares the set with `CREDS_RIDS`. The sign jobs name their artifacts in `artifacts:`, never in a matrix.

## The tests (parent §6), mapped to stories

`src_vs_code/src/test/releaseSigning.test.ts`: reads `release.yml` like `credsInstall.test.ts:50-53` (path from
`__dirname`, no `vscode` import), normalises CRLF, cuts the text into jobs (`^  <name>:$` under `jobs:`) and steps
(`^      - `). No YAML parser: `src_vs_code` has none and E2 adds no dependency.

| Test | Asserts | Story | Before the change (RED first) |
|---|---|---|---|
| T1 | in `cli-binaries` and `mcp-binaries`: an upload named `unsigned-<product>-${{ matrix.rid }}` with `if: startsWith(matrix.rid, 'win-')` and `path: pkg`; `Checksum` and the old upload carry `if: ${{ !startsWith(matrix.rid, 'win-') }}`; the Windows branch of `Package` holds no `7z` | E2.1 | red: no `unsigned-` upload exists; the Windows legs zip and checksum (`:434`, `:455`, `:643`, `:656`) |
| T5 | each `Package` step has no `GITHUB_REF_NAME` and uses `$VERSION`; every `upload-artifact` in both jobs has `retention-days: 7`; `cli-sign` passes `own-files: '["creds.exe"]'`, `mcp-sign` `'["creds-mcp.exe"]'` | E2.1 (own-files part in E2.2) | red: `:429`, `:638` read `GITHUB_REF_NAME`; `:464`, `:665` say `1`; no sign job |
| T2 | `cli-sign` / `mcp-sign` call `oleksandrdubyna88/dew_flow_release_signing/.github/workflows/sign-windows.yml@` + 40 hex; `artifacts` equals `<product>-` + each `win-*` RID of the job's matrix, no more, no less; `required: ${{ startsWith(github.ref, 'refs/tags/') }}`; permissions exactly `contents: read` + `id-token: write` | E2.2 | red: no sign jobs |
| T3 | `cli-release` needs `cli-sign`; `mcp-release` needs `mcp-sign` | E2.2 | red: `:471`, `:669` need only the build job |
| T4 | no job but `cli-sign` / `mcp-sign` holds `id-token` | E2.2 | green today (no job has it). Its RED is shown by a mutation: add `id-token: write` to `cli-release`, run, see T4 fail, restore |

## E2.1 — the build legs

**Exact edits** (`release.yml`, today's lines; the two jobs get the same change):

1. `cli-binaries` `Package` (`:424-440`): delete `:429` (`VERSION="${GITHUB_REF_NAME#cli-v}"`), so `NAME` (`:430`)
   reads the `VERSION` that the Version step put in `GITHUB_ENV`. In the `win-*` branch (`:432-435`) replace
   `mkdir`/`cp`/`7z`/`ASSET=` by `mkdir -p "pkg/$NAME"` and `cp out/creds.exe "pkg/$NAME/"` (no zip, no `ASSET`).
   Move `mkdir "$NAME"` (`:431`) into the non-Windows branch; that branch (`:436-439`) is otherwise unchanged.
2. `Checksum` (`:453-455`): add `if: ${{ !startsWith(matrix.rid, 'win-') }}`.
3. The upload (`:457-464`): the same `if:`; `retention-days: 1` → `7`.
4. After `:464`, a new step: `actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2`,
   `if: startsWith(matrix.rid, 'win-')`, `name: unsigned-cli-${{ matrix.rid }}`, `path: pkg` (the PARENT, parent F10,
   so the artifact holds `creds-<v>-win-x64/creds.exe`, the one directory E1's `pkg` step asserts),
   `if-no-files-found: error`, `retention-days: 7`.
5. `mcp-binaries` `Package` (`:633-649`): the same, deleting `:638`, with `creds-mcp.exe` (`:642`); `Checksum`
   (`:654-656`) and the upload (`:658-665`) as 2–3; the new step after `:665` with `name: unsigned-mcp-${{ matrix.rid }}`.

The smoke steps stay where they are, before packaging. The name `unsigned-…` never matches `pattern: cli-*` /
`mcp-*` (`:480`, `:678`), so the release jobs never download an unsigned package.

**Scenarios.**

- Given today's `release.yml`, when T1 and T5 run, then both are red (table above). Commit the tests first.
- Given the edits, when T1 and T5 run, then both are green, and `credsInstall.test.ts` stays green (no `- rid:` added).
- Given a `workflow_dispatch` `target: cli` from `ci/windows-code-signing-e2`, when the build legs run, then the Windows
  legs upload `unsigned-cli-win-x64` / `-win-arm64` holding `creds-0.0.0-win-x64/creds.exe`, and the other four
  legs upload `cli-<rid>` with `creds-0.0.0-<rid>.tar.gz` (not `creds-ci/windows-code-signing-e2-…`). This run is
  optional here; V1 runs it anyway.

**Break-it.** The parent asks none for E2.1. Its RED is T1/T5 before the change.

**Done when.** T1 and T5 (its E2.1 part) green; `npm run typecheck` and `npm test` green; actionlint clean; Opus's review
resolved. One commit `ci(release): the Windows legs hand an unsigned package to the signing workflow` (with the test).

## E2.2 — the caller jobs, the `needs`, no other `id-token`

**Exact edits** (`release.yml`; line numbers are today's, E2.1 moves them by a few lines):

1. A new job `cli-sign` between `cli-binaries` and the comment above `cli-release` (today after `:464`), exactly the
   parent §3.2 snippet: `needs: cli-binaries`, `if: startsWith(github.ref, 'refs/tags/cli-v') || inputs.target == 'cli'`,
   `permissions: contents: read` + `id-token: write`, `uses: …/sign-windows.yml@<40-hex> # v1.0.0`,
   `artifacts: '["cli-win-x64","cli-win-arm64"]'`, `own-files: '["creds.exe"]'`,
   `required: ${{ startsWith(github.ref, 'refs/tags/') }}`. A short comment above it says why (SAC; parent link).
2. `cli-release` `needs: cli-binaries` (`:471`) → `needs: [cli-binaries, cli-sign]`.
3. `mcp-sign` after `mcp-binaries` (today after `:665`): the same with `mcp`, `refs/tags/mcp-v`, `inputs.target == 'mcp'`,
   `["mcp-win-x64","mcp-win-arm64"]`, `["creds-mcp.exe"]`.
4. `mcp-release` `needs: mcp-binaries` (`:669`) → `needs: [mcp-binaries, mcp-sign]`.
5. Nothing else: the asset-count checks (`:502-519`, `:700-717`) stay the last word on completeness.

**Scenarios.**

- Given E2.1's `release.yml`, when T2, T3 and T4 run, then T2 and T3 are red and T4 is green (shown red by its mutation).
- Given the edits, when the suite runs, then T1–T5 are green and `credsInstall.test.ts` stays green.
- Given `artifacts` with one RID removed (`'["cli-win-x64"]'`), when T2 runs, then it is red and names `win-arm64`.
- Given a `server-v*` tag, when the workflow runs, then `cli-sign` / `mcp-sign` are skipped with their build jobs.

**Break-it (parent §6, T3).** Drop `cli-sign` from `cli-release`'s `needs`. Run `npm test`: T3 must fail and name
`cli-release`. Restore; T3 green. Quote both outputs in the PR. Do the same once with T4's mutation.

**Done when.** T1–T5 green; the T3 break-it quoted; `npm run typecheck`, `npm test`, the actionlint job of
`ci-server.yml`, `plan-lifecycle.mjs` and `pin-check.mjs` green; Opus's review resolved. One commit
`ci(release): cli-sign and mcp-sign call the shared signing workflow; the release jobs wait for them`.

## E2.3 — the docs, the releasable commits, V1 and V2, the merge

**Epoch 3:** items 1–4 were built as written. Their present-tense wording ("is signed", "was checked") is true only
after activation, so E4 rewords all of them (and `research/architecture.md`, `research/module_tests.md`) to "wired for
signing; releases stay unsigned until the owner activates a provider". The `fix(cli)` / `fix(mcp)` commits below stay
on this branch but never reach `main`: the PR is squash-merged with a `ci(release): …` title (E4), and the real
`fix(cli)` / `fix(mcp)` commits are written at activation (E5), when the sentences become true.

**Exact edits.**

1. `release.yml` header (`:3-7`): one line after `:7` — the Windows zips are signed by
   `dew_flow_release_signing`'s `sign-windows.yml` before the release jobs run. In the `ci(release)` commit of E2.2 or a
   third `ci(release)` commit (`.github/**` only, not releasable either way).
2. `CLAUDE.md` § *Releasing and deploying* (`:88-135`): one paragraph after `:101` — the Windows binaries are signed
   by the shared workflow; a `cli-v*` / `mcp-v*` tag is red without the `release-signing` setup; the owner steps live
   in the parent §4. Commit `docs(claude): …`.
3. `src_cli/README.md`: a short section before *Building and testing* (`:58`): the Windows binary is Authenticode-signed
   by the owner's organization through Azure Artifact Signing (both `win-x64` and `win-arm64`); Smart App Control was
   checked to let the `win-x64` build run (V2) — the `win-arm64` build carries the same signature from the same
   profile, but was not run under SAC here. The docs claim exactly that, no more. Commit
   `fix(cli): the Windows binary is signed, so Smart App Control lets it run`.
4. `src_mcp/README.md` (new, short): what `creds-mcp` is, how the extension installs it (*Install the MCP Server…*,
   `src_vs_code/package.json:922`), and that its Windows build is signed. Commit
   `fix(mcp): the Windows binary is signed, so Smart App Control lets it run`.

**D9, taken as an assumption.** This document takes the parent's recommendation: a new short `src_mcp/README.md`
carries the mcp release commit (`release-please-config.json:126-129`; `src_mcp/RELEASES.md` is the changelog and is
never edited by hand). **The owner may overturn it**; the alternative is to wait for the next real `src_mcp` change.

**Owner steps E2 waits on (epoch 2 text, replaced in epoch 3).** Epoch 2 merged only after O1–O8, V1 and V2, because
D3 made signing mandatory on a tag and a merge before Azure worked would have turned every `cli-v*` / `mcp-v*` release
red. Epoch 3 (parent §3.4, §4 *At the merge*): the merge waits for E3's `v1.1.0`, the E4 changes on this branch, and
the owner's M1 (`ALLOW_UNSIGNED_RELEASES=true` as a repository variable in both repositories) and M2 (the
`release-signing` environment holds zero variables). O1–O8, V1 and V2 are E5's, after the merge, on `main`.

**Scenarios (on the real services) — in epoch 3 these run in E5, on `main`, after the merge; kept here as written.**

- **V1** — given O1–O8, when `workflow_dispatch` `target: cli` and `target: mcp` run from `ci/windows-code-signing-e2`,
  then every sign leg logs `sign` mode and passes Verify; the four FINAL zips (`cli-win-x64`, `cli-win-arm64`,
  `mcp-win-x64`, `mcp-win-arm64`, from the run's artifacts) extracted on the owner's machine give
  `Get-AuthenticodeSignature` `Valid`, signer = the organization, timestamp present; the certificate subject matches
  the O4 validation record. The first observation of F8. Before O7 the same dispatch logs `skip` with the warning.
- **V2** — given V1's `win-x64` packages, when `creds --help`, `creds relay-pipe` (it starts, writes its log and ends
  with `noAgentAnnounced`) and `creds-mcp --version` run on the owner's SAC machine, then SAC blocks none of them. The
  `win-arm64` packages are checked for their signature only (V1); the owner's machine is x64.
- **If O4 is refused or delayed.** Nothing has reached `main`: E2.1–E2.3 live only on this branch. The PR stays a draft;
  if the identity validation is refused for good, the PR is closed unmerged and the fallback — an RSA OV certificate
  from a commercial CA with cloud signing — becomes a new plan. No revert is needed.
- **V3** — given the merge and O9, when a trial is dispatched from a branch other than `main`, then the environment
  refuses it.

**Break-it.** None asked; V1 is the first test of the `sign` path.

**Done when (epoch 3).** Items 1–4 built and reviewed (done 2026-11-03). The rest moved: the docs rewording, the
squash merge, O9 and the release-please check are E4's done-when; V1, V2, V3, the `fix` releases (R1) and V4 are E5's.
(Epoch 2 read: the docs say the Windows binaries are signed; V1 and V2 observed; the PR merged with *Rebase and merge*;
release-please has opened the `cli` and `mcp` release PRs.)

## Order

E2.1 (may start now) → E2.2 (after E1's `v1.0.0`, the pin) → E2.3 docs and `fix:` commits → open the PR → coai code
rounds and Opus's review. Then, in epoch 3: E3 (`v1.1.0`) → E4 on this branch (pin bump, the switch line, T2 extended,
docs reworded; M1, M2; squash merge; M3; O9) → E5 later (O1–O8 → V1 → V2 → A6 → `fix` commits → R1 → V4 → V3).

## Gaps found in the parent (recorded, not fixed here)

1. **The merge method.** The parent wants the `fix(cli)` and `fix(mcp)` commits to reach `main` as separate commits
   (§3.2, F11), but this repository squash-merges with the PR title (`main` history; squash and rebase are both
   enabled, merge commits are not). A squash leaves one commit typed by the PR title. E2 must use *Rebase and merge*
   and keep `main` un-merged into the branch; the parent does not say so. **Closed in epoch 3 the other way round:**
   the squash is now the point — a `ci(release)` title keeps the `fix` commits (which claim a signature) off `main`
   and cuts no release; the releasable commits come at activation (parent §3.2).
2. §3.2 says "E2 lands as two commits" and then names three (`ci(release)`, `fix(cli)`, `fix(mcp)`).
3. §9 says "T1–T4 green"; §6 and the E2 done-when have T5.
4. The E2 epic says the branch starts after `v1.0.0` exists; E2.1 does not need the pin, so here it may start earlier.
5. §6 T4 is green before the change; the parent names no way to show it red. E2.2 uses a mutation.
6. §4 lists O9 before O8; §5 reads "O1–O8 → V1".
