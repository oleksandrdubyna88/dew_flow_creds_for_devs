# PLAN — Windows code signing, E2: this repository signs its Windows `creds` and `creds-mcp` binaries

> Status: **plan only, 2026-11-03.** Stories of epic E2 of [PLAN_windows_code_signing.md](PLAN_windows_code_signing.md).
> Scope: `.github/workflows/release.yml` (jobs `cli-binaries`, `cli-release`, `mcp-binaries`, `mcp-release`, two new
> jobs `cli-sign` / `mcp-sign`), `src_vs_code/src/test/releaseSigning.test.ts` (new), `CLAUDE.md`, `src_cli/README.md`,
> `src_mcp/README.md` (new, D9). Branch `ci/windows-code-signing` (it exists; it holds only plan commits). No product
> code, no contract change.

**Committed together with this document:** its row in `todo/README.md` under *Currently open* (the shared
`common/planning-docs.md` § *A plan split into epics and stories*). E2 marks no cornerstone; the parent's ledger stays
`Cornerstones: 1 of 1 — E1.1`.

## Who writes what (the review gate's operator orders)

| Part | E2.1 | E2.2 | E2.3 |
|---|---|---|---|
| Scenarios and brief | Opus — this document | Opus — this document | Opus — this document |
| Code and tests | Sonnet | Sonnet | Sonnet (docs and the two `fix:` commits) |
| Review | Opus | Opus | Opus |
| Review fixes | Sonnet | Sonnet | Sonnet |

No cornerstone in E2, so no Fable spec. Opus's review checks the parent's *watched at review* list: the release jobs
`needs` the sign jobs, `id-token: write` only on the two caller jobs, the 40-hex pin, and the cross-repository
federation (only V1 proves it). The coai gate runs once for E2: code rounds on the PR from `ci/windows-code-signing`.

## Binding constraints (from the parent, for every story)

- **The pin.** `uses: oleksandrdubyna88/dew_flow_release_signing/.github/workflows/sign-windows.yml@<40-hex> # v1.0.0`.
  E1 is being built now, so the SHA is not known. It is written **at E2.2 time**: E1's merge commit, which the tag
  `v1.0.0` points at (read it with `git ls-remote … refs/tags/v1.0.0` and its `^{}` line if the tag is annotated). E2.1
  needs no pin and may start before `v1.0.0` exists; E2.2 may not.
- The five inputs are E1.1's (spec §S1.1): `artifacts`, `own-files`, `extra-files` (default `[]`), `required`,
  `environment` (default `release-signing`). E2 passes `artifacts`, `own-files`, `required` only. This repository's
  packages hold one own file each, so `extra-files` stays at its default; `environment` keeps `release-signing` (O7).
- **`retention-days: 7` on every cli and mcp artifact** — the unsigned ones and the packaged ones (parent §3.2, §8:
  *Re-run failed jobs* after a signing outage must still find every platform's asset). Today both uploads say `1`.
- **`Package` uses the Version step's `$VERSION`** (`release.yml:374-381`, `:591-598`). Today it recomputes it from
  `GITHUB_REF_NAME` (`:429`, `:638`), so a dispatch from `ci/windows-code-signing` puts the branch name, slash
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
- Given a `workflow_dispatch` `target: cli` from `ci/windows-code-signing`, when the build legs run, then the Windows
  legs upload `unsigned-cli-win-x64` / `-win-arm64` holding `creds-0.0.0-win-x64/creds.exe`, and the other four
  legs upload `cli-<rid>` with `creds-0.0.0-<rid>.tar.gz` (not `creds-ci/windows-code-signing-…`). This run is
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

**Exact edits.**

1. `release.yml` header (`:3-7`): one line after `:7` — the Windows zips are signed by
   `dew_flow_release_signing`'s `sign-windows.yml` before the release jobs run. In the `ci(release)` commit of E2.2 or a
   third `ci(release)` commit (`.github/**` only, not releasable either way).
2. `CLAUDE.md` § *Releasing and deploying* (`:88-135`): one paragraph after `:101` — the Windows binaries are signed
   by the shared workflow; a `cli-v*` / `mcp-v*` tag is red without the `release-signing` setup; the owner steps live
   in the parent §4. Commit `docs(claude): …`.
3. `src_cli/README.md`: a short section before *Building and testing* (`:58`): the Windows binary is Authenticode-signed
   by the owner's organization through Azure Artifact Signing, so SAC lets it run. Commit
   `fix(cli): the Windows binary is signed, so Smart App Control lets it run`.
4. `src_mcp/README.md` (new, short): what `creds-mcp` is, how the extension installs it (*Install the MCP Server…*,
   `src_vs_code/package.json:922`), and that its Windows build is signed. Commit
   `fix(mcp): the Windows binary is signed, so Smart App Control lets it run`.

**D9, taken as an assumption.** This document takes the parent's recommendation: a new short `src_mcp/README.md`
carries the mcp release commit (`release-please-config.json:126-129`; `src_mcp/RELEASES.md` is the changelog and is
never edited by hand). **The owner may overturn it**; the alternative is to wait for the next real `src_mcp` change.

**Owner steps E2 waits on.** O1–O8 (parent §4: subscription, provider, account, identity validation, certificate
profile, identity and federated credentials, the `release-signing` environment admitting this branch, the tag
ruleset re-read) **before the merge**; V1 and V2 on the PR branch. The PR **may be opened before them** (CI, the coai
code rounds, Opus's review all run) but it is **merged only after** O1–O8, V1 and V2: D3 makes signing mandatory on a
tag, so a merge before Azure works turns every `cli-v*` / `mcp-v*` release red.

**Scenarios (on the real services).**

- **V1** — given O1–O8, when `workflow_dispatch` `target: cli` and `target: mcp` run from `ci/windows-code-signing`,
  then every sign leg logs `sign` mode and passes Verify; the four FINAL zips (`cli-win-x64`, `cli-win-arm64`,
  `mcp-win-x64`, `mcp-win-arm64`, from the run's artifacts) extracted on the owner's machine give
  `Get-AuthenticodeSignature` `Valid`, signer = the organization, timestamp present; the certificate subject matches
  the O4 validation record. The first observation of F8. Before O7 the same dispatch logs `skip` with the warning.
- **V2** — given V1's `win-x64` packages, when `creds --help` and `creds-mcp --help` run on the owner's SAC machine,
  then SAC blocks neither.
- **V3** — given the merge and O9, when a trial is dispatched from a branch other than `main`, then the environment
  refuses it.

**Break-it.** None asked; V1 is the first test of the `sign` path.

**Done when.** The docs say the Windows binaries are signed; V1 and V2 observed and quoted in the PR; the PR merged with
*Rebase and merge* (see gap 1); O9 done and V3 observed; release-please has opened the `cli` and `mcp` release PRs.
R1 and V4 belong to the parent's Definition of Done, after this epic.

## Order

E2.1 (may start now) → E2.2 (after E1's `v1.0.0`, the pin) → E2.3 docs and `fix:` commits → open the PR → coai code
rounds and Opus's review → O1–O8 (owner, in parallel) → V1 → V2 → merge → O9 → V3 → release-please PRs.

## Gaps found in the parent (recorded, not fixed here)

1. **The merge method.** The parent wants the `fix(cli)` and `fix(mcp)` commits to reach `main` as separate commits
   (§3.2, F11), but this repository squash-merges with the PR title (`main` history; squash and rebase are both
   enabled, merge commits are not). A squash leaves one commit typed by the PR title. E2 must use *Rebase and merge*
   and keep `main` un-merged into the branch; the parent does not say so.
2. §3.2 says "E2 lands as two commits" and then names three (`ci(release)`, `fix(cli)`, `fix(mcp)`).
3. §9 says "T1–T4 green"; §6 and the E2 done-when have T5.
4. The E2 epic says the branch starts after `v1.0.0` exists; E2.1 does not need the pin, so here it may start earlier.
5. §6 T4 is green before the change; the parent names no way to show it red. E2.2 uses a mutation.
6. §4 lists O9 before O8; §5 reads "O1–O8 → V1".
