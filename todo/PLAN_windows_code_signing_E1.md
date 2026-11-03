# PLAN — Windows code signing, E1: the reusable signing workflow in `dew_flow_release_signing`

> Status: **plan only, 2026-11-03.** Stories of epic E1 of [PLAN_windows_code_signing.md](PLAN_windows_code_signing.md).
> Scope: the new public repository `oleksandrdubyna88/dew_flow_release_signing` (cloned at
> `/home/jinx/git/dew_flow_release_signing`; `main` holds only `README.md` and `LICENSE`). All work is on branch
> `feat/sign-windows` from that commit. Nothing in this repository changes for E1. The `sign` path needs Azure; it is
> proven later by V1 in E2.

**Committed together with this document:** its row in `todo/README.md` under *Currently open* (the shared
`common/planning-docs.md` § *A plan split into epics and stories*). The cornerstone ledger of the parent's `## Epics`
already reads `Cornerstones: 1 of 1 — E1.1`; this document marks no other cornerstone, so the ledger does not change.

## Who writes what (the review gate's operator orders)

| Part | E1.1 (cornerstone) | E1.2 | E1.3 |
|---|---|---|---|
| Scenarios and brief | Fable — `todo/PLAN_windows_code_signing_E1_S1_spec.md` | Opus — this document | Opus — this document |
| Code and tests | Sonnet | Sonnet | Sonnet |
| Review | Opus | Opus | Opus |
| Review fixes | Sonnet | Sonnet | Sonnet |

The pack step's hash check and the publisher equality in Verify also get the security judgement (Fable) at review,
outside the quota (parent, E1 *Cornerstone areas*). The coai gate runs once for E1, on branch `feat/sign-windows`.

## Binding implementation constraints (from the parent, for every story)

- **Pins, 40-hex SHA with the version comment.** `azure/login@a641126d1b8aa4d1fa005f4f92df94a3a4c4c906 # v3.1.0`;
  `azure/artifact-signing-action@c7ab2a863ab5f9a846ddb8265964877ef296ee82 # v2.0.0`; and the exact pins of this
  repository's `.github/workflows/release.yml`: `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`,
  `actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2`,
  `actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2`. No other action.
- **No `${{ }}` expression inside any `run:` block.** Every input, variable and context value reaches a script
  through the step's `env:`. This closes script injection, and it is what lets the step harness run the blocks.
- `cache-dependencies: false` and `exclude-environment-credential: true` on the signing action.
- Runner `windows-2025` for the signing job (the action has no ARM support, parent F3).
- `permissions: contents: read` + `id-token: write` only on the signing job. The workflow's top level is
  `permissions: {}`.
- Every upload: `retention-days: 7`.
- The zip is made with exactly `(cd in && 7z a "../out/$PKG.zip" "$PKG")` and the checksum with exactly
  `(cd out && sha256sum "$PKG.zip" > "$PKG.zip.sha256")`, after `mkdir out`. (The parent's `> /dev/null` on the 7z
  line only silences its log.) These are today's commands (`release.yml:433`, `:455`), so the asset name, the
  layout `PKG/<file>` inside the zip and the checksum format do not change.
- `sign-windows.yml` checks out nothing: a called workflow cannot name its own commit (parent §3.1 step 2).

**Step ids.** The harness runs steps by id. The stories use these ids: `inputs`, `pkg` (after Download), `mode`,
`inventory`, `verify`, `pack`, `check` (the extract-and-compare part of §3.1 step 7). If the E1.1 spec renames its
ids, the harness follows the spec.

## The self-test cases

The fixtures (E1.3): an unsigned apphost built by `dotnet new console` (the "own file"), a copy of
`C:\Program Files\dotnet\dotnet.exe` (Microsoft-signed with an EMBEDDED Authenticode signature, the "vendor file"; the self-test asserts `SignatureType -eq 'Authenticode'` and `Valid` before using it — `System32` files such as `whoami.exe` are catalog-signed and do not qualify, per the E1.1 spec), and a copy of it with one byte flipped. They
are made at run time on the runner. No binary is committed. Cases 1–9 are the parent's (§3.1); E1.A1–E1.A5 are added here.

| # | Given | When | Then | Proved by |
|---|---|---|---|---|
| 1 | a package with the own file and the vendor file; no signing variables; `required: false`; a branch ref | the real call of `sign-windows.yml` | green; `NAME` holds `$PKG.zip` + `.sha256`; the zip extracts to the same hashes; `sha256sum -c` passes | E1.3 `trial-*` jobs |
| 2 | no variables; `required: true` | `mode` | red, the message names the six variables | E1.3 harness, E1.1 code |
| 3 | one of the six set (e.g. `SIGNING_ACCOUNT`); `required: false` | `mode` | red: a half configuration is never a skip | harness, E1.1 |
| 4 | the own file is missing from the package | `inventory` | red, names the missing file | harness, E1.1 |
| 5 | the vendor-signed file renamed to the own file's name | `inventory` | red: an own file must be `NotSigned` | harness, E1.1 |
| 6 | the vendor file with one byte flipped (`HashMismatch`) | `inventory` | red, names the file and its status | harness, E1.1 |
| 7 | an unsigned PE that is neither own nor in `extra-files` | `inventory` | red: nobody declared it | harness, E1.1 |
| 8 | the same PE, its name in `extra-files` | `mode` → `inventory` → `pack` → `check` | green; it is in the to-sign list | harness, E1.1 + E1.2 |
| 9 | no variables; `required: false`; `GITHUB_REF=refs/tags/x` | `mode` | red: a tag ref is always required | harness, E1.1 |
| E1.A1 | `in/` holds two directories, or one directory and a file | `pkg` | red | harness, E1.1 |
| E1.A2 | five of the six variables set; `required: true` | `mode` | red, names the missing one | harness, E1.1 |
| E1.A3 | the own file twice in the package (root and a subfolder) | `inventory` | red: the subfolder copy is neither an own file (own-files are exact paths) nor declared | harness, E1.1 |
| E1.A4 | `pack` ran; then one file under `in/$PKG` changes | `check` | red, names the file whose hash differs | harness, E1.2 |
| E1.A5 | a copy of the workflow with `${{ inputs.required }}` in one `run:` | `run-step.mjs` | non-zero exit, names the step | harness, E1.3 |

Each harness case asserts the exit code AND the step that failed. A green case asserts every step it ran exited 0.

## E1.1 — the workflow's contract (cornerstone)

**The detailed spec is a separate document by another author (Fable):** `todo/PLAN_windows_code_signing_E1_S1_spec.md`.
It holds the brief: the inputs and their parsing, the matrix, the exact messages and the output formats. This
section gives only the scenarios and the acceptance, and it does not repeat the spec. Where the two differ, the spec
decides and this section is corrected.

**Scope.** `.github/workflows/sign-windows.yml`, parent §3.1 steps 1–3: `on: workflow_call` with the five inputs
(`artifacts`, `own-files`, `extra-files` default `[]`, `required`, `environment` default `release-signing`); the job
(`windows-2025`, `timeout-minutes: 20`, `environment: ${{ inputs.environment }}`, `strategy.fail-fast: false`, a
matrix `artifact` over `fromJSON(inputs.artifacts)`); Download of `unsigned-<artifact>` into `in/`; `pkg`;
`mode`; `inventory`.

**Scenarios.** Cases 2–9 and E1.A1–E1.A3 above. Also, read from the YAML by the harness: the job's permissions are exactly
`contents: read` + `id-token: write`, and the six variables reach `mode` only through its `env:`.

**The spec must settle** (open in the parent): whether an `extra-files` glob matches the file name or the
package-relative path; the format of the multiline to-sign output that the signing action's `files` input reads (its
`action.yml` at the pin); which variable carries the caller's ref into `mode` (case 9 assumes `GITHUB_REF`).

**Done when.** The spec exists and its review is resolved; cases 2–9 and E1.A1–E1.A3 pass in the harness on
`windows-2025`; actionlint is clean; Opus's review is resolved; no `run:` block holds `${{`.

## E1.2 — the signing leg, Verify, the hash-matched pack and the upload

**What to change.** `.github/workflows/sign-windows.yml`, parent §3.1 steps 4–8, after the E1.1 steps:

1. `azure/login` (pin above), `if: steps.mode.outputs.mode == 'sign'`; `with:` `client-id: ${{ vars.AZURE_CLIENT_ID }}`,
   `tenant-id: ${{ vars.AZURE_TENANT_ID }}`, `allow-no-subscriptions: true`. These values go in `with:`, never `env:`.
2. `azure/artifact-signing-action` (pin above), `if:` sign mode AND the inventory listed files; `endpoint`,
   `signing-account-name`, `certificate-profile-name` from `vars`; `files` from the inventory output;
   `file-digest: SHA256`; `timestamp-digest: SHA256`; `cache-dependencies: false`;
   `exclude-environment-credential: true`.
3. `verify` (pwsh), `SIGNING_PUBLISHER` and the mode in its `env:`. Sign mode: each listed file is `Valid`, has a
   `TimeStamperCertificate`, and its signer's simple name **equals** `SIGNING_PUBLISHER`; each kept vendor file is
   still `Valid`. Any miss is red. Skip mode: it prints that the files are unsigned and exits 0.
4. `pack` (bash): `PKG` comes from `pkg`; the two fixed commands above.
5. `check` (bash): extract `out/$PKG.zip` into `check/`; the set of paths and each file's SHA-256 equal `in/$PKG`;
   `(cd out && sha256sum -c "$PKG.zip.sha256")` passes.
6. Upload `${{ matrix.artifact }}`, path `out/`, `if-no-files-found: error`, `retention-days: 7`.

**Scenarios.**

- Given the case 1 package in skip mode, when `verify`, `pack` and `check` run, then all exit 0, `verify` says
  "unsigned", and `out/` holds exactly `$PKG.zip` and `$PKG.zip.sha256` (case 1, case 8).
- Given a zip made by `pack`, when it is listed, then its only top-level entry is `$PKG/` (case 1, asserted by
  `trial-check`).
- Given `pack` ran and then a file under `in/$PKG` changed, when `check` runs, then it is red (E1.A4).
- Given sign mode, when the job runs, then login comes before signing, and `verify` rejects a wrong publisher, a
  missing timestamp and a vendor file that is no longer `Valid`. This needs Azure: **V1 proves it, in E2.** In E1 it
  is checked by reading the code at review, nothing more.

**Break-it.** The parent asks none for E1.2. E1.A4 is its negative test: drop the hash compare from `check`, watch E1.A4 go
green when it must be red, restore. Quote that output in the PR.

**Done when.** Cases 1 and 8 and E1.A4 pass; actionlint and shellcheck are clean; Opus's review and the security
judgement on `check` and `verify` are resolved.

## E1.3 — CI, the self-test, dependabot, README, the tag and the protection

**What to change.**

- `test/run-step.mjs <workflow> <step-id>`: reads the workflow with a YAML parser, prints the step's `shell` and
  `run:` text. Exit non-zero when the id is not found, and when ANY `run:` block in the file holds `${{` (E1.A5).
- `test/selftest.ps1` (on `windows-2025`): makes the fixtures under one run folder that it removes at the end; for
  each case, lays out `in/`, sets the case's environment (`GITHUB_OUTPUT` and `GITHUB_ENV` to temp files, step
  outputs passed forward), runs the steps through `run-step.mjs` with `bash` or `pwsh`, and asserts the exit code and
  the failing step. It prints `case N: pass|FAIL` for every case and exits non-zero on any FAIL.
- `test/fixtures/`: the script that makes the fixtures (the `dotnet new console` apphost, the `dotnet.exe` copy, the
  one-byte flip, the unsigned extra PE). Nothing binary is committed.
- `.github/workflows/ci.yml`, on `pull_request` and `push` to `main`, top level `permissions: contents: read`:
  - `lint` (ubuntu-latest): actionlint pinned by version and SHA-256, as this repository's `ci-server.yml:303`; assert
    shellcheck is present first, so actionlint also lints the `run:` blocks.
  - `harness` (windows-2025): checkout (`persist-credentials: false`), the YAML parser's install, `selftest.ps1`.
  - `trial-input` (windows-2025): build the fixture package `selftest-0.0.0-win-x64/` (the apphost as `selftest.exe`
    plus the `dotnet.exe` copy) and upload its PARENT as `unsigned-selftest-win-x64` (parent F10).
  - `trial-call`: `uses: ./.github/workflows/sign-windows.yml` with `artifacts: '["selftest-win-x64"]'`,
    `own-files: '["selftest.exe"]'`, `required: false`, `environment: selftest-no-signing` (an environment that never
    holds variables). It needs `permissions: contents: read` + `id-token: write`: a caller must grant what the called
    job asks for.
  - `trial-check` (windows-2025): download `selftest-win-x64`; assert case 1 (the hashes, the layout, `sha256sum -c`).
- `.github/dependabot.yml`: `github-actions` (and the YAML parser's ecosystem), weekly, as this repository's.
- `README.md`: the five inputs, the owner steps O1–O9 (summarised, citing
  `dew_flow_creds_for_devs · todo/PLAN_windows_code_signing.md` §4 as a path), and the caller snippet of §3.2.

**Scenarios.** Cases 1–9 and E1.A1–E1.A5 all run in CI on every PR. Given a clean branch, when CI runs, then `lint`,
`harness` and `trial-check` are green and `harness` prints 13 `pass` lines (cases 2–9, E1.A1–E1.A5).

**Break-it (parent §6).** Make `none + required` take `skip` in `mode`. Run the harness. It must fail and name
case 2 (case 9 may fail too, when the tag rule shares that branch). Restore. Quote both outputs in the PR.

**After the merge.** Tag `v1.0.0` on the merge commit. Protect `main` like the other repositories (PR only, CI
required). Record the 40-hex SHA of `v1.0.0`: E2 and the coai twin pin it.

**Done when.** CI and the self-test are green on the merged commit; the break-it is quoted in the PR; `v1.0.0`
points at that commit; `main` is protected; the README names the five inputs, the owner steps and the caller snippet.

## Order

E1.1 spec (Fable) → E1.1 code (Sonnet) → E1.2 code → E1.3 code; the harness grows with each story, so each story's
cases go green in its own commit. One PR from `feat/sign-windows`; the coai code rounds on it; merge; tag; protect.

## Gaps found in the parent (recorded, not fixed here)

1. A caller job must grant `id-token: write` to call a workflow whose job asks for it. §3.1 does not say so for the
   self-test's real call; E1.3 grants it on `trial-call`.
2. "Read with a YAML parser" names no parser and no pin. Node has none built in, so E1.3 adds one dependency (for
   example the `yaml` package, an exact version, with a lock file) — one file more than the parent's scope list.
3. The nine cases do not test the one-directory assertion, the "exactly once" rule, a negative of the extracted-hash
   check, or the `${{`-in-`run:` refusal. E1.A1–E1.A5 add them.
4. The parent does not say where the fixtures come from at run time, nor which environment the real call uses
   (`release-signing` in this new repository could later get variables). E1.3 makes both explicit.
5. Editorial: §3.1's last paragraph has a stray `)` and runs the file list on after the cases.
