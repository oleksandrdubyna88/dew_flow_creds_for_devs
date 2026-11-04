# PLAN — the Windows `creds.exe` and `creds-mcp.exe` are signed, so Smart App Control lets them run

> Status: **wiring merged, activation open — 2026-11-04, epoch 3. E1 `v1.0.0` and E3 `v1.1.0` (a9a7ecc) in `dew_flow_release_signing`; creds #295 (ae8aed8) and coai #944 (7de8a74) merged with `ALLOW_UNSIGNED_RELEASES=true`. Releases stay UNSIGNED until E5; the goal is not reached yet. The provider is the owner's open decision (D11).** Scope: a new public repository
> `oleksandrdubyna88/dew_flow_release_signing` holding one reusable signing workflow (E1, E3); the
> `cli-binaries`, `cli-release`, `mcp-binaries` and `mcp-release` jobs of `.github/workflows/release.yml`
> here (E2, E4); the owner's one-time provider and GitHub setup (E5). No product code, no contract change.
> Twin plan: `dew_flow_connect_other_ais · todo/PLAN_windows_code_signing.md` (its `coai-mcp` line,
> the same reusable workflow, the same caller change).

## Plan changes

> Epoch 1 · approved 2026-11-03 · by reviewers · state: closed

- 1.1 · 2026-11-03 · reviewer · approach — a called workflow starts with an empty workspace and no context names its own commit, so the mode decision is inline with its variables in env, tested end to end by the self-test
- 1.2 · 2026-11-03 · reviewer · build-order — O7 admits the PR branch until the merge, so V1 signs before anything lands on main; O9 removes it
  (This second change stopped the plan. Gate round 1 finding 2 was rejected: the nested zip layout is today's.)

### Re-review for epoch 2

Narrowed: no

| Work | Where | Verdict | Action |
|---|---|---|---|
| plan commits 5087917, eaa88d5 | pushed, unmerged | — | nothing was built |

  (Re-review: consultation 7b364257 and the question consultants 083acd47. The whole plan was revised: own-files
  contract checked before any login, extracted-hash check of the final zip, retention 7 days for every cli and mcp
  artifact, the Package step reads the Version step, F8 marked unobserved until V1, V2 moved before the merge on the
  trial package, epics re-split by Fable.)

> Epoch 2 · approved 2026-11-03 · by reviewers · state: closed

  (Re-review gate round, 2/2 reviewers, proceed. Its accepted findings 1, 4 and 5 are part of the approved text: the
  `extra-files` allow-list, the tag ref forcing `required`, V1 checking the organization record. From epoch 2 on, an
  approving round's own findings are read as part of the approval, as in the coai twin.)

- 2.1 · 2026-11-03 · agent · approach — a job calling a reusable workflow cannot take continue-on-error, so expected-failure calls would leave CI red; the self-test runs the workflow's own run blocks against fixtures and asserts exit codes, with one real trial call
  (Cadence consultation 7927faa8, epics 1-2. Its advice to tag v1.0.0 only after V1 was not taken: callers pin a SHA, and both callers merge only after V1.)
- 2.2 · 2026-11-04 · owner · merge-conditions, contract, approach — merge the callers before any signing provider exists (Azure not set up; SignPath Foundation asked for references), through an explicit ALLOW_UNSIGNED_RELEASES switch so releases stay unsigned as today until it is removed
  (This second change stopped the plan. Consultation 64aafd4e: both consultants against a plain merge; the owner chose the switch.)

### Re-review for epoch 3

Narrowed: yes — the merge no longer waits for a provider; activation moved to a later cutover

| Work | Where | Verdict | Action |
|---|---|---|---|
| E1 `v1.0.0`, `dew_flow_release_signing` #1 (609cc23) | main (merged) | fits | kept; the new input defaults to false, so v1.0.0 is a subset of v1.1.0; E3 rewords its README lines that say a tag is always red |
| creds wiring and tests: da3e253, 5e6c920, d2fd9ae, 44f59f5 (release.yml jobs, T1–T5) | pushed, unmerged | fits | kept; E4 extends T2 and adds the switch line |
| creds pin 241d568 (609cc23 = v1.0.0) | pushed, unmerged | fits | kept; E4 bumps the pin to v1.1.0 in a new commit |
| creds docs: 27ca896, fd3f144, e62e758, 6c6c67e, b673460 and the claim comments of 390c1d3 / da3e253 in release.yml | pushed, unmerged | cut | fix forward in E4: new commits reword the text; no revert, no history rewrite |
| creds b2b09b1 `fix(cli)`, 6ad54e1 `fix(mcp)` | pushed, unmerged | cut | E4 rewords the content; the squash with a `ci(release)` title and a CLEAN body keeps their types off main (M3 checks); src_mcp/README.md stays (D9) |
| creds plan commits (5087917 … e2a8235) | pushed, unmerged | fits | kept; the plan record, superseded by this revision |
| coai #944 code and tests (14c0ae22 … 08c8cde1) | pushed, unmerged | fits | kept; the twin adds the switch line and the pin bump |
| coai #944 claim text: a38e9b38 / 3bf899ea (architecture.md) and the release.yml comment that a tag without signing fails | pushed, unmerged | cut | fix forward in the coai twin: reword, then squash-merge |
| coai twin plan (4d2d6652 … e763d81b) | pushed, unmerged | fits | kept; its own ledger records the owner's change before #944 continues |

  (Re-review: the owner, consultation 64aafd4e and the re-review consultation 768212f2 agreed the design of §3.4. The whole plan
  was revised to it: merge readiness separated from activation readiness, O1–O8 moved to the cutover, the Definition of
  Done split into wiring and activation, epics E3–E5 added by Fable, the cornerstone ledger recounted. The rows were sorted by an Opus judge: the docs that claim a signature and the two fix commits are cut, fixed forward in E4 and the twin.)


> Epoch 3 · approved 2026-11-04 · by owner · state: open

  (Re-review gate round on docs/windows-code-signing-epoch3, 2/2 reviewers, proceed; its accepted findings 0, 1 and 3 are
  part of the approved text: A6 removes the input in code too (T6), V5 checks the published assets, M3's fallback.)

- 3.1 · 2026-11-04 · reviewer · approach — nothing before the merge proved the caller's switch on a forced run (a dispatch is never forced), so release.yml's workflow_dispatch gains a boolean input `required` and the sign jobs pass `required: ${{ startsWith(github.ref, 'refs/tags/') || inputs.required }}`: a dispatch with required=true takes exactly the tag path before the merge, and later serves V1

## 1. The symptom and the goal

**Symptom.** On Windows 11 with Smart App Control (SAC) turned on, *Install `creds` (terminal CLI)…*
(`src_vs_code/package.json:934`) downloads `creds-<v>-win-x64.zip`, unpacks `creds.exe` into the
extension's storage, and SAC blocks it at its first run. Every user with SAC on hits this, and so does
`creds-mcp.exe`. Nothing in the release signs anything: `grep -rn "signtool\|id-token" .github/` is
empty (checked 2026-11-03).

**Why SAC blocks it.** SAC lets a binary run when Microsoft's cloud service already trusts it, or when
it is signed with a certificate from a CA in Microsoft's trusted root program. A new build of an
unsigned binary has neither. A self-signed certificate is not accepted. SAC also does not accept ECC
signatures, so the certificate must be RSA. Source:
<https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control>.

**Goal.**

- Every `cli-v*` and `mcp-v*` release carries `win-x64` and `win-arm64` zips whose `.exe` is
  Authenticode-signed by the owner's organization, RSA, with an RFC 3161 timestamp, and SAC accepts them.
  The provider is open (D11): the wiring is built for **Azure Artifact Signing** (formerly Trusted
  Signing); SignPath Foundation is the alternative.
- Once a provider is active, a tag release whose Windows binaries are not signed **fails** and stays a
  draft (owner decision 2026-11-03, D3). A `workflow_dispatch` trial with no signing configuration
  packages unsigned and says so.
- The signing code is written **once**, in a reusable workflow that this repository and coai both call
  (owner decision 2026-11-03: a separate new repository, `dew_flow_release_signing`).
- No long-lived secret: GitHub OIDC → a managed identity, only inside a protected environment.
- **The wiring merges before a provider exists** (owner decision 2026-11-04, D10), behind an explicit
  switch that lets a tag ship unsigned only while no signing configuration exists at all (§3.4). Until
  activation, releases are unsigned exactly as today. **The goal is reached at activation (E5) and V4,
  not when the wiring merges.**

**Out of scope, named so nobody assumes it.**

- **macOS notarization.** The extension downloads with Node and `install.sh` with `curl`; neither sets
  the quarantine attribute, so Gatekeeper does not check those files, and .NET Native AOT already
  ad-hoc signs (required on Apple Silicon). Only a browser download is affected. Fixing that needs an
  Apple Developer ID and notarization — a separate plan if wanted.
- **Linux.** Nothing gates execution; the `.sha256` beside each asset already lets a user check bytes.
- **The server's Windows binaries** (`server-binaries`, `release.yml:120`): nobody installs them on a
  SAC desktop through the extension. The same call can be added later in one job.
- **A SignPath road in the shared workflow** (its own action and variables): a separate later plan if D11
  picks SignPath Foundation.

## 2. What was checked, with sources (2026-11-03, F12–F14 on 2026-11-04)

| # | Fact | Source |
|---|---|---|
| F1 | Public-trust identity validation: individuals only in the USA and Canada; organizations in a list of countries (Microsoft lists at least USA, Canada, EU, UK). The owner chose **organization** (2026-11-03). | <https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart>, Microsoft Q&A threads (Oct 2026) |
| F2 | `Azure/artifact-signing-action` v2.0.0 (2026-05-14) is commit `c7ab2a863ab5f9a846ddb8265964877ef296ee82` (annotated tag `208f8af…` dereferenced). Inputs used: `endpoint`, `signing-account-name`, `certificate-profile-name`, `files`, `file-digest` (default SHA256), `timestamp-rfc3161` (default `http://timestamp.acs.microsoft.com`), `cache-dependencies` (default **true**), the `exclude-*-credential` set (`exclude-azure-cli-credential` default false). | `gh api repos/Azure/artifact-signing-action/contents/action.yml?ref=v2.0.0` |
| F3 | **The action does not run on Windows ARM runners**: *"We currently do not support Windows Arm runners"*; supported: `windows-2025`, `windows-2022`. Issue #92 is open. So `win-arm64` cannot be signed in its own build leg (`windows-11-arm`, `release.yml:322`). Authenticode does not depend on the binary's CPU, so an x64 runner signs both. | action README at v2.0.0; <https://github.com/Azure/artifact-signing-action/issues/92> |
| F4 | The signer identity needs the role **Artifact Signing Certificate Profile Signer** on the certificate profile. OIDC is the recommended login. | action README at v2.0.0 |
| F5 | `azure/login` v3.1.0 is commit `a641126d1b8aa4d1fa005f4f92df94a3a4c4c906` (annotated tag `053f728…` dereferenced) — the same pin `todo/PLAN_marketplace_entra_publish.md` F11 recorded. | `gh api repos/Azure/login/git/tags/053f7285…` |
| F6 | Federated credentials take no wildcards, so tags `cli-v*` cannot be named in a subject. A job that declares `environment: X` presents a subject ending `:environment:X`. | <https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-create-trust>; GitHub OIDC reference |
| F7 | This repository uses the **immutable** subject: prefix `repo:oleksandrdubyna88@71817001/dew_flow_creds_for_devs@1343621986`. coai's is `repo:oleksandrdubyna88@71817001/dew_flow_connect_other_ais@1352342534`. | `gh api repos/…/actions/oidc/customization/sub`, both read 2026-11-03 |
| F8 | In a reusable workflow, `environment:` on its job resolves in the **caller's** repository, and the OIDC subject is the caller's. `vars.*` of that environment reach the called job. | GitHub docs, *Reusing workflows* — **not yet observed here**; V1 is the proof |
| F9 | Ruleset 23780086 "release tags" blocks creation, update and deletion of `refs/tags/{server,extension,cli,mcp}-v*` for everyone but the release App (integration 5018284). | `gh api repos/oleksandrdubyna88/dew_flow_creds_for_devs/rulesets/23780086`, 2026-11-03 |
| F10 | `actions/upload-artifact` with a directory path stores the directory's **contents** at the root, dropping the directory name. To keep `creds-<v>-win-x64/` inside the artifact, upload its **parent**. | upload-artifact README (least common ancestor rule) |
| F11 | release-please here skips a commit that touches only `.github/**` (`release-please-config.json:72-98`), and `Release-As:` does not bypass that. A cli or mcp release needs a releasable commit (`fix`, `feat`, …) under `src_cli/` or `src_mcp/`; a `ci(…)` commit is never releasable, whatever it touches. | `release-please-config.json`; release-please's changelog types |
| F12 | The `with:` of a job that `uses:` a reusable workflow is evaluated in the caller's context, **before** the called job declares its environment. `vars.X` there reads a **repository** (or organization) variable, never an environment variable. A variable that does not exist evaluates to the empty string, so `vars.X == 'true'` is `false`. | GitHub docs, *Reusing workflows* and *Contexts* (`vars`) — observed by the first green tag release after the E4 merge |
| F13 | No provider exists on 2026-11-04: Azure is not set up (O1–O8 not started). SignPath Foundation (free OSS signing; the publisher shown in the certificate is "SignPath Foundation", not the owner) answered the application with a request for public reputation references before approving. | the owner, 2026-11-04 |
| F14 | `v1.0.0` of the shared workflow has no way to let a tag ship unsigned: its `mode` step forces `required` on any `refs/tags/*` ref and is red with zero variables. Merging the `v1.0.0` callers as they are turns every `cli-v*` / `mcp-v*` release red. | `dew_flow_release_signing · .github/workflows/sign-windows.yml` (`mode` step) and `README.md` at 609cc23 |

## 3. Design

### 3.1 The shared workflow (E1 built as `v1.0.0`; E3 adds one input as `v1.1.0`, repository `dew_flow_release_signing`)

`.github/workflows/sign-windows.yml`, `on: workflow_call`. One job, a **matrix over the artifacts**, so
each artifact is downloaded, signed, verified, packed and uploaded on its own leg and the upload name
can be a matrix value.

Inputs:

| input | type | meaning |
|---|---|---|
| `artifacts` | string, required | JSON list of output names, e.g. `["cli-win-x64","cli-win-arm64"]`. For each NAME the caller has uploaded `unsigned-NAME`, holding exactly one top-level directory (the package folder). |
| `own-files` | string, required | JSON list of package-relative paths that are the caller's OWN binaries, e.g. `["creds.exe"]`. Each must exist exactly once and be unsigned before signing, and must carry `SIGNING_PUBLISHER`'s signature after. |
| `extra-files` | string, default `[]` | JSON list of file-name globs (package-relative) of OTHER files the caller allows to be signed when they arrive unsigned, e.g. coai's `["e_sqlite3.dll","*tree-sitter*.dll"]`. An unsigned PE that is neither an own file nor matched here is red — the workflow never signs a binary nobody declared. |
| `required` | boolean, required | `true` → missing configuration or any failure is red. The callers pass `${{ startsWith(github.ref, 'refs/tags/') }}`. Independently of the input, a caller ref under `refs/tags/` (the `github` context is the caller's) is always treated as required. |
| `environment` | string, default `release-signing` | the caller's environment that holds the variables and the OIDC trust. |
| `allow-unsigned-release` | boolean, default `false` | **(v1.1.0, E3)** a permission for MISSING configuration, not an off switch: with **zero** of the six variables and this input `true`, a forced leg (a tag, or `required: true`) takes `skip` instead of red. It changes nothing else (§3.4). |

Job: `runs-on: windows-2025` (F3), `timeout-minutes: 20`, `environment: ${{ inputs.environment }}`,
`permissions: { contents: read, id-token: write }`, `strategy.fail-fast: false`. Steps, in order
(as merged in `v1.0.0`):

1. **Inputs** (pwsh): the three JSON lists parsed strictly and checked (names, paths, globs).
2. **Download** `unsigned-${{ matrix.artifact }}` into `in/`; **pkg** asserts `in/` holds exactly one
   directory (`PKG`) and nothing else, with a name matching `^[A-Za-z0-9][A-Za-z0-9._-]*$`.
3. **Mode** — an inline bash step. The six variables (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
   `SIGNING_ENDPOINT`, `SIGNING_ACCOUNT`, `SIGNING_PROFILE`, `SIGNING_PUBLISHER`) reach it through the
   step's `env:` (`${{ vars.X }}` — `vars` is not exported to a shell on its own; none of them is a
   secret), with `inputs.required` and, from `v1.1.0`, `inputs.allow-unsigned-release`. A leg is
   **forced** when `required` is true or the caller's ref is under `refs/tags/`. It writes `mode=sign|skip`:

   | variables set | forced | `allow-unsigned-release` | result |
   |---|---|---|---|
   | all six | any | any | `sign` |
   | none | no | any | `skip`, with a `::warning::` that the trial is **unsigned** |
   | none | yes | `false` (v1.0.0 always) | **red**, naming the six variables |
   | none | yes | `true` | `skip`, with a `::warning::` and a job-summary banner: **UNSIGNED RELEASE** (v1.1.0) |
   | one to five | any | any | **red** (a half configuration is a mistake, never a skip) |

   Inline, not a script: a called workflow starts with an EMPTY workspace, and no context gives it
   its own commit to check out (`github.workflow_sha` is the caller's; only the OIDC token's
   `job_workflow_sha` claim has it). A checkout of `main` would run code the caller did not pin. The
   fail-closed promise is tested end to end instead, by the self-test (§6).
4. **Inventory** (pwsh), in every mode and before any login: each `own-files` path exists exactly once
   under `in/$PKG` and is `NotSigned` (a missing product binary, or a vendor-signed file renamed to the
   product's name, is red here); every other PE (`*.exe`, `*.dll`, or any file starting with `MZ`):
   `Valid` → a kept vendor file, logged with its signer; `NotSigned` and matched by `extra-files` → to
   sign; `NotSigned` and NOT matched → red; any other status (`HashMismatch`, `NotTrusted`, …) → red.
   Writes the paths to sign (at most 200) as step outputs.
5. `azure/login@a641126d1b8aa4d1fa005f4f92df94a3a4c4c906 # v3.1.0` — `if: mode == 'sign'`; `client-id`,
   `tenant-id` from `vars`, `allow-no-subscriptions: true`. Values go as `with:` inputs, never into an `env:`.
6. `azure/artifact-signing-action@c7ab2a863ab5f9a846ddb8265964877ef296ee82 # v2.0.0` — `if: mode ==
   'sign' && the inventory has files`; `endpoint`, `signing-account-name`, `certificate-profile-name`
   from `vars`; `files` from step 4; `file-digest` and `timestamp-digest` SHA256; **`cache-dependencies:
   false`** (a job holding `id-token: write` restores no cache another run could have written);
   `exclude-environment-credential: true` so only the `azure/login` session can authenticate.
7. **Verify** (pwsh), `SIGNING_PUBLISHER` in its `env:` — in `sign` mode, every file step 4 listed to
   sign: `Valid`, `TimeStamperCertificate` present, and the signer's simple name **equals**
   `SIGNING_PUBLISHER`; every kept vendor file: still `Valid`. Any miss → red. In `skip` mode the step
   prints that the files are unsigned. In both modes it then writes a manifest (SHA-256 and relative
   path of every file under `in/$PKG`) of what was verified.
8. **Pack** (bash): `(cd in && 7z a "../out/$PKG.zip" "$PKG")` and `(cd out && sha256sum "$PKG.zip" >
   "$PKG.zip.sha256")` — the commands of today's Windows legs (`release.yml:433-434`, `:455`), run from
   the same relative place, so the asset name, the layout inside the zip (`creds-<v>-win-x64/creds.exe`,
   as every release since cli-v0.1.0) and the checksum format do not change. **Check**: the zip is
   extracted into `check/` and every path and SHA-256 must equal the manifest of step 7 — names alone
   cannot prove the verified bytes are the ones that ship. `sha256sum -c` must pass.
9. **Upload** `${{ matrix.artifact }}` with path `out/` (`$PKG.zip`, `$PKG.zip.sha256`),
   `if-no-files-found: error`, `retention-days: 7` (the retry window, §8) — the same name and contents
   the build leg uploads today, so the release jobs downstream read it unchanged.

What the workflow never does: write to a release (`contents: read` only), read a secret (there are
none), or build anything. The caller owns build, smoke tests and publishing.

Also in the repository: `README.md` (inputs, the owner setup, the caller snippet), `LICENSE` (MIT),
`.github/dependabot.yml`, `.github/workflows/ci.yml` (actionlint + shellcheck over the `run:` blocks + a
**self-test**). A job that calls a reusable workflow cannot take `continue-on-error`, so a call that is
meant to fail would leave every CI run red. The self-test therefore has two parts: a **step harness**
(`test/selftest.ps1` on `windows-2025` runs single steps of `sign-windows.yml` the way the runner runs
them, with the environment each case needs, and asserts the exit code and the failing step — possible
because **no `run:` block holds a `${{ }}` expression**; every value arrives through `env:`, which also
closes script injection, and the harness fails if one appears) and **one real call** (case 1), which
must be green.

The fixtures (made at run time): an unsigned PE named as the own file (a .NET apphost), a
Microsoft-signed vendor file. The `v1.0.0` cases: (1) a trial with no variables succeeds and its zip
extracts to the same hashes and passes `sha256sum -c`; FAIL for (2) `required: true` with no variables,
(3) one of the six set, (4) the own file missing, (5) the vendor-signed file named as the own file,
(6) a vendor file with one byte flipped (`HashMismatch`), (7) an unsigned PE neither own nor in
`extra-files`, (9) a tag ref (`GITHUB_REF=refs/tags/x`) with `required: false` and no variables;
(8) the file of case 7 listed in `extra-files` passes; plus A1–A5 of E1's stories document. The `v1.1.0`
cases (E3): (10) a tag ref, no variables, `allow-unsigned-release: true` → `mode=skip`, the warning and
the summary banner present; (11) the same with the input `false` → FAIL, as case 9; (12) one to five
variables set with the input `true` → FAIL; (13) all six set with the input `true` → `mode=sign` (the
mode step only; login, sign and the publisher check need a provider — V1 covers them). Cases 1–9 and
A1–A5 stay unchanged.

`main` is protected (PR only). Tags: `v1.0.0` = 609cc23 (E1); `v1.1.0` = E3's merge commit. Callers pin
the 40-hex commit, never a tag.

### 3.2 This repository (E2 built; E4 adopts `v1.1.0`, rewords the docs and merges)

**Build legs** (`cli-binaries`, `release.yml:308-464`; `mcp-binaries`, `:532-665`; line numbers of
`main` before E2). Only the Windows RIDs change:

- `Package` (`:424-440`, `:633-649`): it uses the Version step's `$VERSION` (`:374-381`, `:591-598`)
  instead of recomputing `${GITHUB_REF_NAME#cli-v}` (`:429`, `:638`) — on a dispatch from a branch the
  old line put the branch name, slash included, into the package name, so a trial could not even
  package. For `win-*` it builds `pkg/$NAME/` with the `.exe` instead of zipping. Non-Windows RIDs keep
  their tar.gz.
- **Retention**: every cli and mcp artifact, unsigned and packaged, `retention-days: 7` instead of 1
  (`:464`, `:665`), so *Re-run failed jobs* after a signing outage still finds every platform's asset.
- `Checksum` and the upload (`:453-464`, `:654-665`) run only for non-Windows RIDs; a new upload step
  for `win-*` uploads `pkg` (F10) as `unsigned-cli-${{ matrix.rid }}` / `unsigned-mcp-…`. The name starts
  with `unsigned-`, so the release jobs' `pattern: cli-*` / `mcp-*` (`:480`, `:678`) never pick it up.
- The smoke steps stay where they are, on the build legs, before signing. Signing appends a signature
  to the file and changes no code; the check step in E1 proves the verified bytes are what ship.

**Two caller jobs** (E2 as built, plus the E4 line marked):

```yaml
cli-sign:
  name: sign creds cli (windows)
  needs: cli-binaries
  if: startsWith(github.ref, 'refs/tags/cli-v') || inputs.target == 'cli'
  permissions:
    contents: read
    id-token: write
  uses: oleksandrdubyna88/dew_flow_release_signing/.github/workflows/sign-windows.yml@<40-hex> # v1.1.0 (E4; v1.0.0 = 609cc23 today)
  with:
    artifacts: '["cli-win-x64","cli-win-arm64"]'
    own-files: '["creds.exe"]'
    required: ${{ startsWith(github.ref, 'refs/tags/') || inputs.required }}
    allow-unsigned-release: ${{ vars.ALLOW_UNSIGNED_RELEASES == 'true' }}
```

`mcp-sign` is the same with `mcp`. `cli-release` gets `needs: [cli-binaries, cli-sign]` and
`mcp-release` `needs: [mcp-binaries, mcp-sign]`. Their asset-count checks (`:502-519`, `:700-717`) stay
as the last word on completeness. `ALLOW_UNSIGNED_RELEASES` is a **repository** variable (F12): a
`with:` cannot read the `release-signing` environment. Absent, empty or misspelled = `false` = enforcement.
**These are the only jobs in the repository with `id-token: write`** (none had it before E2).

**Docs (E4 rewords what E2 wrote).** Until activation, no document claims in the present tense that a
release is signed or that SAC accepts it. `CLAUDE.md` § *Releasing and deploying*, `src_cli/README.md`,
`src_mcp/README.md` (new in E2, D9), `research/architecture.md`, `research/module_tests.md` and the
`release.yml` header say the same thing: the release pipeline is wired for signing (`cli-sign` /
`mcp-sign` call the shared workflow), releases stay unsigned until the owner activates a provider (§3.4,
E5), and how to check a signature with `Get-AuthenticodeSignature` once they are signed. At activation
(E5), the `fix(cli)` / `fix(mcp)` commits turn these sentences into the present tense: signed from
release X on, SAC acceptance checked on `win-x64` (V2).

**The merge (E4) and the releasable commits (E5, F11).** PR #295 is **squash-merged** with a
`ci(release): …` title and a clean body, so its `fix(cli)` / `fix(mcp)` commits (which say the binary is
signed) never reach `main` and cut no release that claims a signature; release-please must propose
nothing for `cli` or `mcp` from the squash (a `ci` type is not releasable, F11). The release-triggering
commits come at activation: `fix(cli): the Windows binary is signed, so Smart App Control lets it run`
touching `src_cli/README.md`, and `fix(mcp): …` touching `src_mcp/README.md`
(`release-please-config.json:126-129`; `src_mcp/RELEASES.md` is release-please's changelog, never edited
by hand). For a user the release is the fix. (Epoch 2 planned a rebase merge of three commits; with the
switch on those commits would be false, so the squash replaces it.)

### 3.3 Owner decisions (D1–D9 taken 2026-11-03, D10 on 2026-11-04)

| # | Decision | Answer |
|---|---|---|
| D1 | Signer | an organization the owner controls (F1). If it is an employer, the employer must approve. |
| D2 | Scope here | `creds` and `creds-mcp`; coai's `coai-mcp` in its twin plan; server binaries later |
| D3 | Unsigned on a tag | red, draft stays — **once the switch is deleted** (E5); until then §3.4 |
| D4 | Login | OIDC, no secret |
| D5 | Shape | one reusable workflow in a new repository `dew_flow_release_signing` |
| D6 | coai's bundled DLLs | sign every unsigned `exe`/`dll` (SAC also blocks DLLs) |
| D7 | PR cap | one over-cap signing PR here and one in coai |
| D9 | the `src_mcp/` file of the mcp release commit | a new short `src_mcp/README.md` (E2 wrote it; E5's `fix(mcp)` commit touches it) |
| D10 | Merge before a provider exists | yes, behind the explicit `ALLOW_UNSIGNED_RELEASES` switch (§3.4); the owner said "merge all the work, we return to signing later" |

Open, recommended answer in brackets:

- **D8 — one identity for creds and coai, or one each.** [One user-assigned managed identity
  `dew-flow-release-signer`, with one federated credential per repository. The role is per certificate
  profile, so two identities narrow nothing. It is NOT the Marketplace identity of
  `todo/PLAN_marketplace_entra_publish.md`: that one may publish, this one may sign, and neither needs
  the other's power.] Decided at E5.
- **D11 — the provider.** Azure Artifact Signing (organization identity validation, Basic SKU about
  $10 a month; §3.1 is built for it) or SignPath Foundation (free; needs reputation references, F13; the
  publisher name is theirs; needs a SignPath road in the shared workflow — a separate later plan).
  [Azure, because nothing else changes.] Decided at E5.

### 3.4 The switch and the cutover (epoch 3)

**What the switch is.** `allow-unsigned-release` is a permission for **missing configuration**. It acts
in one state only: the environment holds **none** of the six variables. Then a tag takes `skip` — the
unsigned packing of today — loudly (`::warning::` on the leg, a banner in the job summary). No other row
of the mode table (§3.1 step 3) changes: a partial configuration is red, a full configuration signs, a
login, signing or verify failure is red. So the switch cannot skip a failing provider, and cannot turn
signing "off" once a configuration exists — the only road back to unsigned is deleting all six
variables, a decision, not an incident fix.

**Where it is read.** A repository variable `ALLOW_UNSIGNED_RELEASES`, passed as
`${{ vars.ALLOW_UNSIGNED_RELEASES == 'true' }}` (F12). Absent or misspelled means enforcement: a mistake
makes a release red, never unsigned. Set to `true` in both repositories at the merge (M1), **deleted** at
activation (A6).

**Merge readiness ≠ activation readiness.** The callers merge when `v1.1.0` is pinned, the tests and
gates pass and `ALLOW_UNSIGNED_RELEASES=true` is set. Nothing about a provider is a merge condition.
Activation is a **cutover**, later, owner-gated (E5), in this order: `cli` / `mcp` releases paused (no
release-please PR for them merged during the cutover); D11 and D8 decided; O1–O8; the six variables set
**at once** (a half set is red by design); V1 (a signed dispatch trial on `main`, both products, both
architectures, signer = the organization, timestamp present; the switch is still on and does nothing,
because a full configuration signs); V2 (the trial packages on the owner's SAC machine) **before any
signed release**; `ALLOW_UNSIGNED_RELEASES` deleted in both repositories (A6); the `fix(cli)` /
`fix(mcp)` commits cut the first signed releases (R1); V4 on the SAC machine; V3.

**A release meanwhile** is exactly today's: the Windows zips packed unsigned by the shared workflow,
same layout and checksum; the run shows the warning and the banner.

## 4. Owner steps, once (no code)

**At the merge (E4), in this order:**

- **M1 — the switch.** In both repositories, Settings → Secrets and variables → Actions → *Variables*
  (repository level, NOT the environment): `ALLOW_UNSIGNED_RELEASES` = `true`, before the merge.
- **M2 — an empty environment.** `release-signing` exists in both repositories with its deployment
  rules set (O7, done: creds `main`, `ci/windows-code-signing-e2`, `cli-v*`, `mcp-v*`; coai `main`,
  `ci/windows-code-signing`, `mcp-v*`). It holds **zero** of the six variables until the cutover: one
  stray variable makes every release red.
- **M3 — the squash merge** of #295 and coai #944 (§3.2); check that release-please opens no `cli`, `mcp` or
  `extension` PR from it (the squash also touches `src_vs_code/`; its config releases on `feat`/`fix`/`deps` only,
  and the squash body is clean). If one appears anyway, it is closed unmerged with a comment naming this step.
- **O9 — after the merge,** remove the PR branches from both environments' deployment rules.

**Activation cutover (E5), later, after D11 and D8 (O1–O6 are Azure's road; SignPath replaces them by
a new plan):**

- **O1 — subscription.** An Azure subscription in the owner's Entra tenant (pay-as-you-go); shared with
  `PLAN_marketplace_entra_publish.md` O0 if that one is answered.
- **O2 — provider.** Register `Microsoft.CodeSigning` on the subscription.
- **O3 — account.** An Artifact Signing account (Basic SKU) in a resource group, e.g. `rg-release-signing`.
  Record its **endpoint** (region-specific, e.g. `https://weu.codesigning.azure.net/`) and its **name**.
- **O4 — identity validation.** Public Trust, Organization. It needs the legal documents and can take
  several days. If refused, nothing in the repositories changes: releases stay unsigned behind the
  switch; the fallback is SignPath Foundation or an RSA OV certificate from a commercial CA (a new plan).
- **O5 — certificate profile.** Public Trust, linked to the validated identity. Record its name and the
  organization name as it appears in the certificate subject (`SIGNING_PUBLISHER`).
- **O6 — identity and trust (D8).** A user-assigned managed identity `dew-flow-release-signer`; role
  *Artifact Signing Certificate Profile Signer* on the profile; federated credentials (issuer
  `https://token.actions.githubusercontent.com`, audience `api://AzureADTokenExchange`) for
  `repo:oleksandrdubyna88@71817001/dew_flow_creds_for_devs@1343621986:environment:release-signing` and
  `repo:oleksandrdubyna88@71817001/dew_flow_connect_other_ais@1352342534:environment:release-signing`.
  Re-read both prefixes first (F7).
- **O7 — GitHub environments.** The deployment rules are set (M2). At the cutover, in each repository,
  the six variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `SIGNING_ENDPOINT`, `SIGNING_ACCOUNT`,
  `SIGNING_PROFILE`, `SIGNING_PUBLISHER` (none is a secret), set **in one sitting**, releases paused.
- **O8 — re-read the tag ruleset** (F9) — the guard that makes a tag a human decision.
- **A6 — delete the switch, in code too.** After V1 and V2: remove `ALLOW_UNSIGNED_RELEASES` from both
  repositories AND, in the same cutover, a PR in each caller removes the `allow-unsigned-release` line, with a
  test (T6) that fails if any job passes that input. Then no variable can bring the exception back. From here D3
  holds: a tag without signing is red.

## 5. Build order

| Step | What | Who | State |
|---|---|---|---|
| E1 | the shared repository, its workflow, CI and self-test; tag `v1.0.0` | agent | done, merged (#1, 609cc23) |
| E2 | this repository's callers pinned to `v1.0.0`, tests, docs; PR #295 | agent | built, gated, unmerged |
| twin | coai #944, the same pin | agent | built, unmerged |
| E3 | `v1.1.0`: the `allow-unsigned-release` input, cases 10–13, README; tag | agent | next |
| E4 | #295: pin bump to `v1.1.0`, the `allow-unsigned-release` line, T2 extended, docs reworded; M1, M2; squash merge; M3; O9 | agent + owner | after E3 |
| twin | coai #944: the same caller change and merge | agent + owner | with E4 |
| E5 | the activation cutover: D11, D8, O1–O8, V1, V2, A6, the `fix` commits, R1, V4, V3 | owner + agent | later, owner-gated |

Why E4 merges without a provider: `v1.1.0` plus the switch packs a tag with zero configuration unsigned
as today, so no release goes red (F14 is what `v1.0.0` would do). Why E5 is a cutover: a half
configuration is red, so the six variables are set together with releases paused, and V1/V2 prove the
signed packages before the switch goes and before any signed release.

## 6. Test and verification plan

**E1 (built):** actionlint over both workflows; shellcheck over the `run:` blocks; the self-test's cases
1–9 and A1–A5 (§3.1). Break-it done: `none + required` made to take `skip`, the harness failed naming
case 2, restored.

**E3 (`v1.1.0`):** cases 10–13 added to the harness; cases 1–9 and A1–A5 unchanged and green. Break-it:
make the input also skip a partial configuration; case 12 must fail naming the set and missing
variables; restore. A second break-it: make the input skip a tag without printing the banner; case 10
must fail on the missing summary line; restore. The README's mode table gains the two new rows and the
caller snippet the new line.

**E2 (built) and E4 (here):** `src_vs_code/src/test/releaseSigning.test.ts`, reading `release.yml` like
`credsInstall.test.ts:46-57` does (no `vscode` import, CRLF normalised):

- T1 — in `cli-binaries` and `mcp-binaries`, the Windows RIDs upload `unsigned-<product>-<rid>` and
  their zip/checksum steps carry a non-Windows `if:`;
- T2 — `cli-sign` / `mcp-sign` call `dew_flow_release_signing/.github/workflows/sign-windows.yml@`
  a 40-hex SHA, pass exactly the Windows RIDs of their matrix, pass `required` from the tag, and hold
  exactly `contents: read` + `id-token: write`; **E4 adds:** the SHA equals `v1.1.0`'s merge commit (the
  test holds the constant) and both jobs pass
  `allow-unsigned-release: ${{ vars.ALLOW_UNSIGNED_RELEASES == 'true' }}` exactly;
- T3 — `cli-release` needs `cli-sign`, `mcp-release` needs `mcp-sign`;
- T4 — no other job in `release.yml` has `id-token` (nor `write-all`);
- T5 — the `Package` steps of `cli-binaries` and `mcp-binaries` read `$VERSION` and never
  `GITHUB_REF_NAME`; every upload in those two jobs has `retention-days: 7`; `own-files` names the
  job's own binary.
Break-it (E2, done): drop `cli-sign` from `cli-release`'s `needs`; T3 fails; restore. E4's break-it:
change the switch expression to `vars.ALLOW_UNSIGNED_RELEASES` (a string, never a boolean); T2 fails;
restore. Both outputs go in the PR. Plus `npm run typecheck`, `npm test`, the actionlint job of
`ci-server.yml`, `plan-lifecycle.mjs`, `pin-check.mjs`, and a docs grep before the merge: no
present-tense "is signed" / "accepts" claim, and no "mandatory" / "red" / "draft" / "impossible" claim about an
unsigned tag, in the five documents of §3.2 nor in the cli-sign / mcp-sign job comments of release.yml.

**After the E4 merge:** the first `cli` or `mcp` release shows the sign legs in `skip` mode with the
banner, and its Windows zips install and run as today (not under SAC) — F12 observed on a real tag.

**On the real services (E5):**

- **V1** — the dispatch trials on `main` after O1–O8, `target: cli` and `target: mcp`: every leg logs
  `sign` mode and passes Verify; the four FINAL zips (both products × both architectures) are downloaded,
  extracted, and `Get-AuthenticodeSignature` on the owner's machine says `Valid`, signer = the
  organization, timestamp present. The owner also compares the certificate's subject with the
  organization name in the identity validation record (O4) — the `SIGNING_PUBLISHER` string alone cannot
  catch a profile linked to the wrong identity. The first observation of F8.
- **V2** — before any signed release, on the owner's SAC machine: the extracted `win-x64` trial
  packages from V1, `creds --help`, `creds relay-pipe` (it starts, writes its log and ends with
  `noAgentAnnounced`) and `creds-mcp --version`; SAC blocks none. The `win-arm64` packages are checked
  for their signature only (V1); the owner's machine is x64.
- **V5** — after R1: the published Windows assets themselves (not the run's artifacts) are downloaded from the
  release pages for both products and architectures; checksums and signatures checked (DoD).
- **V4** — after R1, on the same machine: *Install `creds` (terminal CLI)…* and *Install the MCP
  server*, then run both. This is the goal of the plan; without V4 it is not done.
- **V3 (negative)** — after A6, a trial dispatched from a branch other than `main` is refused by the
  environment; with one variable removed, a dispatch is red (then restore all six).

## 7. Growth surfaces

None that grows on its own. Artifacts: six per product per run plus two `unsigned-*`, each a few MB,
`retention-days: 7` (was 1) — at most a few hundred MB held for a week after a release, retired by
GitHub. Azure: the Basic SKU is a fixed monthly price with a signature quota
(thousands a month); a release signs two files here and a few in coai. No state, no cache (step 6).

## 8. Rollback

- A broken signing workflow: the callers pin a SHA, so a fix is a new commit there and a pin bump here.
- **While the switch is on (E4 to A6):** nothing to roll back — a release is unsigned as today. Red
  because the switch is gone or misspelled: put `ALLOW_UNSIGNED_RELEASES=true` back, re-run. Red because
  one variable was set early: remove it, re-run (never set the other five outside the cutover).
- **After activation:** the provider down on release day: the tag run is red, the draft stays
  unpublished; *Re-run failed jobs* within **7 days** (the artifacts' retention). Later than that, the
  patch version is burned and the next one is released — never a moved tag. The switch is **not** a
  workaround: with six variables set it does nothing (§3.4).
- The cutover must be undone (O4 refused late, a wrong profile): BEFORE A6, delete all six variables in one
  sitting and restore the switch — releases are unsigned as before. AFTER A6 the callers no longer pass the
  input, so the variable does nothing and a tag with zero variables is red: undoing then needs a reviewed caller PR
  (revert the A6 PR, which re-adds the input and drops T6) and a new tag — never a variable change alone.
- Signing must be undone entirely: revert the E4 squash commit; the build legs zip as before.

A tag is never moved.

## 9. Definition of Done

**Wiring (E1–E4) — merge readiness:**

- [x] E1 merged; CI and the self-test green; `v1.0.0` tagged; `main` protected.
- [x] E3 merged (#3, a9a7ecc); cases 10–13 green with both break-its quoted in the PR; `v1.1.0` tagged; README updated.
- [x] E4: T1–T5 green with the break-it outputs in the PR; actionlint green; the pin is `v1.1.0`'s commit;
      both callers pass the switch; the docs make no present-tense signature or SAC claim; M1 and M2 done;
      #295 squash-merged with a `ci(release)` title (ae8aed8); M3 (release-please run 41829733199 at ae8aed8:
      "No user facing commits" for cli, mcp and extension) and O9 done. The coai twin merged the same way
      (#944, 7de8a74; O9 done; its release-please was not dispatched, because other streams have pending
      commits there, and a `ci` commit with a clean body is never releasable).
      Still to observe: the first real `cli-v*` / `mcp-v*` tag under the switch (green, the `UNSIGNED RELEASE`
      warning on its Windows legs). No such tag has been cut yet.
- [x] `coai` gate: plan round `proceed` (epoch 3 approved by the owner, narrowed), code rounds on E3 and E4
      resolved; verdicts and reviewer counts in the summary.

**Activation (E5) — the goal; the plan stays in `todo/` until these are ticked:**

- [ ] D11 and D8 decided; O1–O8 done; V1 and V2 observed before any signed release.
- [ ] A6: `ALLOW_UNSIGNED_RELEASES` deleted in both repositories, and the `allow-unsigned-release` input
      removed from both callers with T6 green.
- [ ] R1: the `fix(cli)` / `fix(mcp)` commits merged, the cli and mcp releases cut and signed; V4 observed
      on a SAC machine; V3 observed.
- [ ] V5: the PUBLISHED Windows assets of the first signed cli and mcp releases (both architectures, and coai's
      next mcp release) downloaded from the release pages, `sha256sum -c` passed, and every exe/dll inside
      `Valid`, signed by the organization, timestamped — recorded before activation is called done.
- [ ] `CLAUDE.md`, `src_cli/README.md`, `src_mcp/README.md`, the research pages and the workflow header say
      the Windows binaries are signed, from which release on, and what was checked under SAC.
- [ ] Plan promoted to `research/` with its deviations, together with its stories documents.

## Epics

Five epics: E1 and E3 are the shared workflow in `dew_flow_release_signing`, E2 and E4 this repository calling it, E5
the owner's activation cutover. E1 and E2 are built (E2 unmerged); E3 and E4 are the epoch-3 work; E5 waits for a
provider. The coai twin is a separate plan in `dew_flow_connect_other_ais`, not an epic here; it gets the same caller
change as E4 (pin, switch line, docs wording, squash merge with the switch on). Each epic's stories are one document,
`todo/PLAN_windows_code_signing_E<n>.md`, written when that epic starts; it links back here and gets its own
`todo/README.md` row. The review gate runs once per epic, on that epic's branch. Five epics → the cornerstone quota is
2 (2·5/5).

### E1 — the reusable signing workflow (repository `oleksandrdubyna88/dew_flow_release_signing`) — built, merged

- **Goal.** One `workflow_call` workflow that takes `unsigned-NAME` artifacts, signs the caller's own files and every
  declared unsigned vendor file with Azure Artifact Signing over OIDC, verifies the publisher, and uploads `NAME` with the
  zip layout and checksum format the callers ship today. On a tag it fails closed; a trial with no configuration
  packages unsigned and says so.
- **Done.** Branch `feat/sign-windows`, merged as #1 = 609cc23 on 2026-11-03, tagged `v1.0.0`, `main` protected. Scope:
  `sign-windows.yml` (§3.1, steps 1–9), `README.md`, `LICENSE`, dependabot, `ci.yml` (actionlint, shellcheck, the
  self-test). CI green; the break-it quoted in #1.
- **Cornerstone areas.** The caller↔workflow contract: the five inputs; `unsigned-NAME` → `NAME`; the mode decision; the
  own-file vs vendor-file classification before any login.
- **Stories** (`todo/PLAN_windows_code_signing_E1.md`, spec `…_E1_S1_spec.md`): E1.1 **(cornerstone)** the contract,
  mode and inventory; E1.2 the signing leg, verify, the hash-matched pack and upload; E1.3 `ci.yml`, the harness, the
  real call, dependabot, the break-it, the tag and the protection.

### E2 — this repository calls the workflow (`dew_flow_creds_for_devs`) — built, unmerged

- **Goal.** `cli-binaries` and `mcp-binaries` hand their Windows packages to the shared workflow, `cli-release` and
  `mcp-release` publish only after the sign jobs, and T1–T5 pin the wiring.
- **Built, 2026-11-03,** on `ci/windows-code-signing-e2`, PR #295, gated (coai code rounds, Opus review, CodeQL fix
  44f59f5): `release.yml` (the four jobs of §3.2, `cli-sign` / `mcp-sign` pinned to 609cc23, the header),
  `src_vs_code/src/test/releaseSigning.test.ts` (T1–T5, the T3 break-it quoted), `CLAUDE.md`, `src_cli/README.md`,
  `src_mcp/README.md` (new, D9), `research/architecture.md`, `research/module_tests.md`. All checks green.
- **Not merged as E2.** Its docs claim a signature in the present tense and its `fix(cli)` / `fix(mcp)` commits would
  cut a release: E4 continues on the same branch, rewords the docs, and the squash merge keeps those commits off `main`.
- **Cornerstone areas.** None marked. Watched at review: the release jobs `needs` the sign jobs; `id-token: write` only on
  the two caller jobs; the 40-hex pin.
- **Stories** (`todo/PLAN_windows_code_signing_E2.md`): E2.1 the build legs; E2.2 the caller jobs and the `needs`;
  E2.3 the docs and the `fix` commits (built; its V1/V2/merge part moved to E4 and E5).

### E3 — the shared workflow `v1.1.0`: the exception for missing configuration

- **Goal.** `sign-windows.yml` takes `allow-unsigned-release` (boolean, default `false`) and, with it `true` and **zero**
  of the six variables, a forced leg takes `skip` with a `::warning::` and a job-summary banner **UNSIGNED RELEASE**.
  Every other row of the mode table is unchanged; `v1.0.0` callers behave exactly as before.
- **Repository and branch.** `dew_flow_release_signing`, branch `feat/allow-unsigned-release` from `main` (609cc23);
  its own gate (`review_plan` on this plan, then `review_code`); merged by PR; the merge commit tagged `v1.1.0`.
- **Scope.** The input; the `mode` step (one more `env:` line, one more branch, the banner through
  `$GITHUB_STEP_SUMMARY`); harness cases 10–13 and the two break-its of §6; the README (input list, mode table rows,
  caller snippet, M1/M2/A6 in short); the workflow header comment.
- **Depends on.** Epoch 3 approved by the owner.
- **Done when.** CI and the self-test green on the merged commit with cases 1–13 and A1–A5; both break-its quoted in the
  PR; `v1.1.0` points at the merge commit; the README says the input is a permission for missing configuration, not an
  off switch.
- **Cornerstone areas.** The mode decision with the new input: the only code path that lets a tag ship unsigned; a
  wrong branch would skip a partial configuration (sign nothing while the owner believes signing is on) or swallow a
  signing failure.
- **Stories** (`todo/PLAN_windows_code_signing_E3.md`, written when E3 starts):
  1. E3.1 **(cornerstone)** — the input, the `mode` step's new row, the warning and the banner; cases 10–13 RED first.
  2. E3.2 — the README and the header; the two break-its; tag `v1.1.0`.

### E4 — the callers adopt `v1.1.0` and merge with the switch on

- **Goal.** PR #295 merges without a provider: pinned to `v1.1.0`, passing the switch, its docs claiming nothing that is
  not true, and the release flow of today unchanged for the user.
- **Repository and branch.** `ci/windows-code-signing-e2` (continues E2's branch and PR); the interim gate path of
  `plan-change-control.md` (this plan to `review_document`, then `review_code` with it as `planText`, `again: true`).
- **Scope.** `release.yml`: the pin bump to `v1.1.0`'s commit, `allow-unsigned-release: ${{
  vars.ALLOW_UNSIGNED_RELEASES == 'true' }}` on both sign jobs, the header line. `releaseSigning.test.ts`: T2 extended
  (the pin constant, the switch line) with its break-it. The docs of §3.2 reworded. The owner's M1 and M2 before the
  merge; the squash merge with a `ci(release): …` title and a clean body; M3; O9; the `todo/README.md` rows.
- **Depends on.** E3 merged and tagged `v1.1.0`; M1 and M2 done by the owner.
- **Done when.** T1–T5 green with the T2 break-it quoted; typecheck, tests, actionlint, `plan-lifecycle.mjs`,
  `pin-check.mjs` green; the docs grep of §6 empty; `ALLOW_UNSIGNED_RELEASES=true` in both repositories; #295 and coai
  #944 squash-merged; release-please opened no `cli` / `mcp` PR from the squash; O9 done.
- **Cornerstone areas.** None marked. Watched at review: the switch expression reads `vars` and compares with `'true'`
  (a bare string would be truthy); the pin is `v1.1.0`'s merge commit, not the tag; no doc claims a signature.
- **Stories** (`todo/PLAN_windows_code_signing_E4.md`, written when E4 starts):
  1. E4.1 — the pin bump, the switch line, the header; T2 extended, RED first, with its break-it.
  2. E4.2 — the docs reworded; the grep; M1, M2 confirmed; the squash merge; M3; O9; the README rows.

### E5 — the activation cutover (owner-gated, later)

- **Goal.** Signed releases accepted by SAC: the provider is active, the switch is gone, the first signed `cli` and
  `mcp` releases are out and V4 passed.
- **Branch.** Owner work first (no code); then one short branch for the `fix(cli)` / `fix(mcp)` commits (the docs in the
  present tense); its own gate. If D11 is SignPath, a new plan (the SignPath road) precedes E5.
- **Scope.** D11, D8; O1–O8; releases paused; the six variables set at once; V1 and V2 on dispatch trials from `main`;
  A6; the `fix` commits; R1; V4; V3; this plan's promotion with its stories documents.
- **Depends on.** E4 merged in both repositories; a provider the owner has set up.
- **Done when.** The activation items of §9 are ticked; the deviations recorded; the plan promoted.
- **Cornerstone areas.** None (no code beyond two docs commits). Watched: the order of the cutover (variables → V1 →
  V2 → A6 → `fix` commits); any other order can publish an unsigned or unproven release.
- **Stories** (`todo/PLAN_windows_code_signing_E5.md`, written when E5 starts): E5.1 the provider and O1–O8; E5.2 the
  trials V1/V2 and A6; E5.3 the `fix` commits, R1, V4, V3, the promotion.

Cornerstones: 2 of 2 — E1.1, E3.1
