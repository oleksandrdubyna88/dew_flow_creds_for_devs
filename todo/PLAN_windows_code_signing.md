# PLAN — the Windows `creds.exe` and `creds-mcp.exe` are signed, so Smart App Control lets them run

> Status: **plan only, nothing implemented yet, 2026-11-03 — re-reviewed, epoch 2 open.** Scope: a new public repository
> `oleksandrdubyna88/dew_flow_release_signing` holding one reusable signing workflow (E1); the
> `cli-binaries`, `cli-release`, `mcp-binaries` and `mcp-release` jobs of `.github/workflows/release.yml`
> here (E2); the owner's one-time Azure and GitHub setup. No product code, no contract change.
> Twin plan: `dew_flow_connect_other_ais · todo/PLAN_windows_code_signing.md` (its `coai-mcp` line,
> the same reusable workflow).

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

> Epoch 2 · approved 2026-11-03 · by reviewers · state: open

  (Re-review gate round, 2/2 reviewers, proceed. Its accepted findings 1, 4 and 5 are part of the approved text: the
  `extra-files` allow-list, the tag ref forcing `required`, V1 checking the organization record. From epoch 2 on, an
  approving round's own findings are read as part of the approval, as in the coai twin.)

- 2.1 · 2026-11-03 · agent · approach — a job calling a reusable workflow cannot take continue-on-error, so expected-failure calls would leave CI red; the self-test runs the workflow's own run blocks against fixtures and asserts exit codes, with one real trial call
  (Cadence consultation 7927faa8, epics 1-2. Its advice to tag v1.0.0 only after V1 was not taken: callers pin a SHA, and both callers merge only after V1.)

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
  Authenticode-signed by the owner's organization through **Azure Artifact Signing** (the service
  formerly called Trusted Signing), RSA, with an RFC 3161 timestamp.
- A tag release whose Windows binaries are not signed **fails** and stays a draft (owner decision
  2026-11-03). A `workflow_dispatch` trial with no signing configuration packages unsigned and says so.
- The signing code is written **once**, in a reusable workflow that this repository and coai both call
  (owner decision 2026-11-03: a separate new repository, `dew_flow_release_signing`).
- No long-lived secret: GitHub OIDC → a managed identity, only inside a protected environment.

**Out of scope, named so nobody assumes it.**

- **macOS notarization.** The extension downloads with Node and `install.sh` with `curl`; neither sets
  the quarantine attribute, so Gatekeeper does not check those files, and .NET Native AOT already
  ad-hoc signs (required on Apple Silicon). Only a browser download is affected. Fixing that needs an
  Apple Developer ID and notarization — a separate plan if wanted.
- **Linux.** Nothing gates execution; the `.sha256` beside each asset already lets a user check bytes.
- **The server's Windows binaries** (`server-binaries`, `release.yml:120`): nobody installs them on a
  SAC desktop through the extension. The same call can be added later in one job.

## 2. What was checked, with sources (2026-11-03)

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
| F11 | release-please here skips a commit that touches only `.github/**` (`release-please-config.json:72-98`), and `Release-As:` does not bypass that. A cli or mcp release needs a releasable commit under `src_cli/` or `src_mcp/`. | `release-please-config.json` |

## 3. Design

### 3.1 The shared workflow (E1, new repository `dew_flow_release_signing`)

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

Job: `runs-on: windows-2025` (F3), `timeout-minutes: 20`, `environment: ${{ inputs.environment }}`,
`permissions: { contents: read, id-token: write }`, `strategy.fail-fast: false`. Steps, in order:

1. **Download** `unsigned-${{ matrix.artifact }}` into `in/`. Assert `in/` holds exactly one directory
   (`PKG`) and nothing else.
2. **Mode** — an inline bash step. The six variables (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
   `SIGNING_ENDPOINT`, `SIGNING_ACCOUNT`, `SIGNING_PROFILE`, `SIGNING_PUBLISHER`) reach it through the
   step's `env:` (`${{ vars.X }}` — `vars` is not exported to a shell on its own; none of them is a
   secret), with `inputs.required`. It writes `mode=sign|skip`:
   - all six set → `sign`;
   - none set and not required (and the caller's ref is not a tag) → `skip`, with a `::warning::` that
     the trial is **unsigned**;
   - none set and required → **red**, naming the six variables;
   - some set → **red** in both cases (a half configuration is a mistake, never a skip).
   Inline, not a script: a called workflow starts with an EMPTY workspace, and no context gives it
   its own commit to check out (`github.workflow_sha` is the caller's; only the OIDC token's
   `job_workflow_sha` claim has it). A checkout of `main` would run code the caller did not pin. The
   fail-closed promise is tested end to end instead, by the self-test (§6).
3. **Inventory** (pwsh), in every mode and before any login:
   - each `own-files` path exists exactly once under `in/$PKG` and is `NotSigned` — a missing product
     binary, or a vendor-signed file renamed to the product's name, is red here;
   - every other `*.exe` / `*.dll`: `Valid` → a kept vendor file, logged with its signer; `NotSigned`
     and matched by `extra-files` → to sign; `NotSigned` and NOT matched → red; any other status
     (`HashMismatch`, `NotTrusted`, …) → red.
   Writes the absolute paths to sign (own files + unsigned others) as a multiline step output.
4. `azure/login@a641126d1b8aa4d1fa005f4f92df94a3a4c4c906 # v3.1.0` — `if: mode == 'sign'`; `client-id`,
   `tenant-id` from `vars`, `allow-no-subscriptions: true`. Values go as `with:` inputs, never into an
   `env:`.
5. `azure/artifact-signing-action@c7ab2a863ab5f9a846ddb8265964877ef296ee82 # v2.0.0` — `if: mode ==
   'sign' && the inventory has files`; `endpoint`, `signing-account-name`, `certificate-profile-name`
   from `vars`; `files` from step 3; `file-digest: SHA256`; `timestamp-digest: SHA256`;
   **`cache-dependencies: false`** (a job holding `id-token: write` does not restore a cache another
   run could have written; it costs about a minute); `exclude-environment-credential: true` so only the
   `azure/login` session (AzureCliCredential) can authenticate.
6. **Verify** (pwsh), `if: mode == 'sign'`, `SIGNING_PUBLISHER` in its `env:` — every file step 3
   listed to sign: `Valid`, `TimeStamperCertificate` present, and the signer's simple name **equals**
   `SIGNING_PUBLISHER`; every kept vendor file: still `Valid`. Any miss → red. In `skip` mode the step
   prints that the files are unsigned.
7. **Pack** (bash). `PKG` is the directory's real name, e.g. `creds-0.4.6-win-x64`, read in step 1.
   `mkdir out && (cd in && 7z a "../out/$PKG.zip" "$PKG" > /dev/null)` and
   `(cd out && sha256sum "$PKG.zip" > "$PKG.zip.sha256")` — the commands of today's Windows legs
   (`release.yml:433-434`, `:455`), run from the same relative place, so the asset name, the layout
   inside the zip (`creds-<v>-win-x64/creds.exe`, as every release since cli-v0.1.0) and the checksum
   format do not change. Then the zip is **extracted** into `check/` and every file's SHA-256 must
   equal the verified file under `in/$PKG`, with the same set of paths — names alone cannot prove the
   verified bytes are the ones that ship. `sha256sum -c` of the checksum file must pass.
8. **Upload** `${{ matrix.artifact }}` with path `out/`, i.e. `$PKG.zip` and `$PKG.zip.sha256`, `if-no-files-found: error`,
   `retention-days: 7` (the retry window, §8) — the same name and contents the build leg uploads today,
   so the release jobs downstream read it unchanged.

What the workflow never does: write to a release (`contents: read` only), read a secret (there are
none), or build anything. The caller owns build, smoke tests and publishing.

Also in the new repository: `README.md` (inputs, the owner setup, the caller snippet), `LICENSE` (MIT),
`.github/workflows/ci.yml` (actionlint + shellcheck over the `run:` blocks + a **self-test**). A job
that calls a reusable workflow cannot take `continue-on-error`, so a call that is meant to fail would
leave every CI run red. The self-test therefore has two parts:

- **Step harness.** `test/run-step.mjs <workflow> <step-id>` prints one step's `run:` text and its
  shell, read with a YAML parser; `test/selftest.ps1` (on `windows-2025`) runs the mode, inventory, pack
  and check steps that way, with the environment each case needs, and asserts the exit code and the
  failing step. This is possible because **no `run:` block holds a `${{ }}` expression** — every input,
  variable and context value arrives through the step's `env:` (which also closes script injection);
  the harness fails if one appears.
- **One real call** of `sign-windows.yml` (case 1 below), which must be green.

The fixtures: an unsigned PE named as the own file (a .NET apphost from `dotnet new
console`), a Microsoft-signed vendor file with an embedded signature (a copy of `C:\Program Files\dotnet\dotnet.exe`; `System32` files are catalog-signed). The calls:
(1) a trial with no variables must succeed, and its zip must extract to the same hashes and pass
`sha256sum -c`; (2) `required: true` with no variables must FAIL; (3) one of the six variables set
(an environment holding it) must FAIL; (4) the own file missing must FAIL; (5) the vendor-signed file
named as the own file must FAIL; (6) a vendor file with one byte flipped (`HashMismatch`) must FAIL; (7) an unsigned PE that is neither
own nor in `extra-files` must FAIL; (8) the same file listed in `extra-files` passes the trial;
(9) a tag ref (`GITHUB_REF=refs/tags/x`) with `required: false` and no variables must FAIL. Cases 2–9 run
in the step harness, case 1 as the real call.
The publisher check on the `sign` path cannot run without Azure; V1 covers it. The epic's stories
document adds cases A1–A5 and fixes the harness's YAML parser and the real call's environment.

Also in the repository: `.github/dependabot.yml` (github-actions), and a tag `v1.0.0` on the merged commit. `main` protected
like the other repositories (PR only).

### 3.2 This repository (E2)

**Build legs** (`cli-binaries`, `release.yml:308-464`; `mcp-binaries`, `:532-665`). Only the Windows
RIDs change:

- `Package` (`:424-440`, `:633-649`): it uses the Version step's `$VERSION` (`:374-381`, `:591-598`)
  instead of recomputing `${GITHUB_REF_NAME#cli-v}` (`:429`, `:638`) — on a dispatch from a branch the
  old line put the branch name, slash included, into the package name, so the pre-merge V1 could not
  even package. For `win-*` it builds `pkg/$NAME/` with the `.exe` instead of zipping. Non-Windows
  RIDs keep their tar.gz.
- **Retention**: every cli and mcp artifact, unsigned and packaged, `retention-days: 7` instead of 1
  (`:464`, `:665`), so *Re-run failed jobs* after a signing outage still finds every platform's asset.
- `Checksum` and the upload (`:453-464`, `:654-665`) run only for non-Windows RIDs; a new upload step
  for `win-*` uploads `pkg` (F10) as `unsigned-cli-${{ matrix.rid }}` / `unsigned-mcp-…`. The name starts
  with `unsigned-`, so the release jobs' `pattern: cli-*` / `mcp-*` (`:480`, `:678`) never pick it up.
- The smoke steps stay where they are, on the build legs, before signing. Signing appends a signature
  to the file and changes no code; the verify step in E1 checks the signed bytes are what ship.

**Two caller jobs:**

```yaml
cli-sign:
  name: sign creds cli (windows)
  needs: cli-binaries
  if: startsWith(github.ref, 'refs/tags/cli-v') || inputs.target == 'cli'
  permissions:
    contents: read
    id-token: write
  uses: oleksandrdubyna88/dew_flow_release_signing/.github/workflows/sign-windows.yml@<40-hex> # v1.0.0
  with:
    artifacts: '["cli-win-x64","cli-win-arm64"]'
    own-files: '["creds.exe"]'
    required: ${{ startsWith(github.ref, 'refs/tags/') }}
```

`mcp-sign` is the same with `mcp`. `cli-release` gets `needs: [cli-binaries, cli-sign]` and
`mcp-release` `needs: [mcp-binaries, mcp-sign]`. Their asset-count checks (`:502-519`, `:700-717`) stay
as the last word on completeness.

**These are the only jobs in the repository with `id-token: write`** (none has it today).

**Docs.** `CLAUDE.md` § *Releasing and deploying*: one paragraph — the Windows binaries are signed by
the shared workflow, a tag fails without the `release-signing` setup, where the owner steps live.
`src_cli/README.md`: the Windows binary is signed, and by whom. The `release.yml` header gains one line.

**The releasable commit (F11).** E2 lands as two commits: `ci(release): …` (the workflow and the test)
and `fix(cli): the Windows binary is signed, so Smart App Control lets it run` touching
`src_cli/README.md`, and `fix(mcp): the Windows binary is signed, so Smart App Control lets it run`
touching a file under `src_mcp/` (`release-please-config.json:126-129`). `src_mcp/` has no README and
its `RELEASES.md` is release-please's changelog, which is never edited by hand — so D9 decides the file.
That is honest: for a user the release is the fix. release-please then proposes `cli` and `mcp` patch
releases; the owner merges them **after** O1–O8 and V1.

### 3.3 Owner decisions (taken 2026-11-03)

| # | Decision | Answer |
|---|---|---|
| D1 | Signer | an organization the owner controls (F1). If it is an employer, the employer must approve. |
| D2 | Scope here | `creds` and `creds-mcp`; coai's `coai-mcp` in its twin plan; server binaries later |
| D3 | Unsigned on a tag | red, draft stays |
| D4 | Login | OIDC, no secret |
| D5 | Shape | one reusable workflow in a new repository `dew_flow_release_signing` |
| D6 | coai's bundled DLLs | sign every unsigned `exe`/`dll` (SAC also blocks DLLs) |
| D7 | PR cap | one over-cap signing PR here and one in coai |

Open, recommended answer in brackets:

- **D8 — one identity for creds and coai, or one each.** [One user-assigned managed identity
  `dew-flow-release-signer`, with one federated credential per repository. The role is per certificate
  profile, so two identities narrow nothing. It is NOT the Marketplace identity of
  `todo/PLAN_marketplace_entra_publish.md`: that one may publish, this one may sign, and neither needs
  the other's power.]
- **D9 — which `src_mcp/` file carries the mcp release commit.** [A new, short `src_mcp/README.md`:
  what `creds-mcp` is, how the extension installs it, and that its Windows build is signed — the
  README `src_cli/` has and `src_mcp/` lacks. The alternative is to wait for the next real `src_mcp`
  change, which leaves `creds-mcp.exe` blocked until then.]

## 4. Owner steps, once (no code)

- **O1 — subscription.** An Azure subscription in the owner's Entra tenant (pay-as-you-go). Shared with
  `PLAN_marketplace_entra_publish.md` O0; if that one is answered, reuse it.
- **O2 — provider.** Register `Microsoft.CodeSigning` on the subscription.
- **O3 — account.** Create an Artifact Signing account (Basic SKU) in a resource group, e.g.
  `rg-release-signing`. Record its **endpoint** (region-specific, e.g. `https://weu.codesigning.azure.net/`)
  and its **name**.
- **O4 — identity validation.** Public Trust, Organization. It needs the legal documents and can take
  several days. If it is refused, stop: E2 and the coai twin do not merge, and the fallback is an RSA OV
  certificate from a commercial CA with cloud signing (a new plan).
- **O5 — certificate profile.** Public Trust, linked to the validated identity. Record its name and the
  organization name as it appears in the certificate subject (`SIGNING_PUBLISHER`).
- **O6 — identity and trust (D8).** A user-assigned managed identity `dew-flow-release-signer`; role
  *Artifact Signing Certificate Profile Signer* on the profile; federated credentials (issuer
  `https://token.actions.githubusercontent.com`, audience `api://AzureADTokenExchange`):
  - `repo:oleksandrdubyna88@71817001/dew_flow_creds_for_devs@1343621986:environment:release-signing`
  - `repo:oleksandrdubyna88@71817001/dew_flow_connect_other_ais@1352342534:environment:release-signing`
  Re-read both prefixes first (F7).
- **O7 — GitHub environments.** In each of the two repositories, an environment `release-signing`:
  *Selected branches and tags* = `main` + `cli-v*` + `mcp-v*` here, `main` + `mcp-v*` in coai.
  Variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `SIGNING_ENDPOINT`, `SIGNING_ACCOUNT`,
  `SIGNING_PROFILE`, `SIGNING_PUBLISHER` — none is a secret. **Until the merge**, the deployment rule
  also admits the PR branch (`ci/windows-code-signing` here, coai's twin branch there), so V1 runs
  before anything lands on `main`.
- **O9 — after the merge,** remove the PR branches from both environments' deployment rules.
- **O8 — re-read the tag ruleset** (F9) — the guard that makes a tag a human decision.

## 5. Build order

| Step | What | Who |
|---|---|---|
| E1 | the new repository, its workflow, CI and self-test; tag `v1.0.0` | agent (the repository is created only after this plan's gate says `proceed`) |
| E2 | this repository's PR, pinned to E1's commit; merged **only after O1–O8 and V1** | agent |
| twin | coai's PR, the same pin | agent |
| O1–O8 | Azure and GitHub setup — can run in parallel with E1/E2 | owner |
| V1 | dry probe: `workflow_dispatch` `target: cli` and `target: mcp` on the PR branch sign the Windows zips | owner + agent |
| V2 | the trial packages run on the owner's SAC machine — before the merge | owner |
| R1 | the cli and mcp patch releases from release-please | owner |
| V4 | after R1: reinstall through the extension, run | owner |

Why E2 merges only after O1–O8 and V1: D3 makes signing mandatory on a tag, so merged before Azure
works it would turn every `cli-v*`/`mcp-v*` release red. O7 admits the PR branch until the merge, so the
order is: O1–O8 → V1 on the PR branch → V2 on a SAC machine with V1's packages → merge E2 → O9 → R1 → V4.

## 6. Test and verification plan

**E1 (new repository):** actionlint over both workflows; shellcheck over the `run:` blocks; the
self-test's nine cases (§3.1). Break-it: make `none + required` take `skip`, watch the harness fail
naming case 2, restore. The `sign` path cannot run without Azure; V1 covers it.

**E2 (here):** `src_vs_code/src/test/releaseSigning.test.ts`, reading `release.yml` like
`credsInstall.test.ts:46-57` does (no `vscode` import, CRLF normalised):

- T1 — in `cli-binaries` and `mcp-binaries`, the Windows RIDs upload `unsigned-<product>-<rid>` and
  their zip/checksum steps carry a non-Windows `if:`;
- T2 — `cli-sign` / `mcp-sign` call `dew_flow_release_signing/.github/workflows/sign-windows.yml@`
  a 40-hex SHA, pass exactly the Windows RIDs of their matrix, pass `required` from the tag, and hold
  exactly `contents: read` + `id-token: write`;
- T3 — `cli-release` needs `cli-sign`, `mcp-release` needs `mcp-sign`;
- T4 — no other job in `release.yml` has `id-token`;
- T5 — the `Package` steps of `cli-binaries` and `mcp-binaries` read `$VERSION` and never
  `GITHUB_REF_NAME`; every upload in those two jobs has `retention-days: 7`; `own-files` names the
  job's own binary.
Break-it: drop `cli-sign` from `cli-release`'s `needs`; T3 fails; restore. Both outputs go in the PR.
Plus `npm run typecheck`, `npm test`, the actionlint job of `ci-server.yml`, `plan-lifecycle.mjs`,
`pin-check.mjs`.

**On the real services:**

- **V1** — the dispatch trials on the PR branch (§5), `target: cli` and `target: mcp`: every leg logs
  `sign` mode and passes Verify; then the four FINAL zips (both products × both architectures) are
  downloaded from the runs, extracted, and `Get-AuthenticodeSignature` on the owner's machine says
  `Valid`, signer = the organization, timestamp present. The owner also compares the certificate's
  subject with the organization name in the Azure identity validation record (O4) — the configured
  `SIGNING_PUBLISHER` string alone cannot catch a profile linked to the wrong identity. This is the
  first observation of F8.
- **V2** — before the merge, on the owner's SAC machine: the extracted `win-x64` trial packages from V1,
  `creds --help` and `creds-mcp --help` in a terminal; SAC blocks neither. So nothing SAC would block is
  ever published.
- **V4** — after R1, on the same machine: *Install `creds` (terminal CLI)…* and *Install the MCP
  server*, then run both. This is the goal of the plan; without V4 it is not done.
- **V3 (negative)** — after O9, a trial dispatched from a branch other than `main` is refused by the
  environment.

## 7. Growth surfaces

None that grows on its own. Artifacts: six per product per run plus two `unsigned-*`, each a few MB,
`retention-days: 7` (was 1) — at most a few hundred MB held for a week after a release, retired by
GitHub. Azure: the Basic SKU is a fixed monthly price with a signature quota
(thousands a month); a release signs two files here and a few in coai. No state, no cache (step 5).

## 8. Rollback

- A broken signing workflow: the callers pin a SHA, so a fix is a new commit there and a pin bump here.
- Azure down on release day: the tag run is red, the draft stays unpublished; *Re-run failed jobs*
  within **7 days** (the artifacts' retention). Later than that, the patch version is burned and the
  next one is released — never a moved tag. Earlier releases stay installable.
- Signing must be undone entirely: revert E2's PR; the build legs zip as before.

A tag is never moved.

## 9. Definition of Done

- [ ] E1 merged; CI and the self-test green; `v1.0.0` tagged; `main` protected.
- [ ] E2 merged; T1–T4 green with the break-it outputs in the PR; actionlint green.
- [ ] `coai` gate: plan round `proceed`, code rounds on E1 and E2 resolved; verdicts and reviewer counts
      in the summary.
- [ ] O1–O8 done; V1 and V2 observed before the merge; R1 released; V4 observed on a SAC machine.
- [ ] `CLAUDE.md`, `src_cli/README.md` and the workflow header say the Windows binaries are signed.
- [ ] Plan promoted to `research/` with its deviations.

## Epics

Two epics, in this order: E1 is the shared workflow in the new repository, E2 is this repository calling it. The
coai twin is a separate plan in `dew_flow_connect_other_ais`, not an epic here. Each epic's stories are one document,
`todo/PLAN_windows_code_signing_E<n>.md`, written when that epic starts, not now; it links back here and gets its own
`todo/README.md` row. The review gate runs once per epic, on that epic's branch. Two epics → the cornerstone quota is 1.

### E1 — the reusable signing workflow (new repository `oleksandrdubyna88/dew_flow_release_signing`)

- **Goal.** One `workflow_call` workflow that takes `unsigned-NAME` artifacts, signs the caller's own files and every
  unsigned vendor file with Azure Artifact Signing over OIDC, verifies the publisher, and uploads `NAME` with the zip
  layout and checksum format the callers ship today. On a tag it fails closed; on a trial with no configuration it
  packages unsigned and says so.
- **Repository and branch.** The repository is created after this plan's gate says `proceed`, with an initial commit on
  `main` (README stub, LICENSE). All work is on branch `feat/sign-windows` from that commit; the gate reviews that
  branch; the merge is tagged `v1.0.0` and `main` is protected (PR only).
- **Scope.** `.github/workflows/sign-windows.yml` (§3.1, steps 1–8), `README.md`, `LICENSE`, `.github/dependabot.yml`,
  `.github/workflows/ci.yml` (actionlint, shellcheck, the self-test (step harness + one real call) with its fixtures).
- **Depends on.** The plan gate `proceed`. Nothing in Azure: the `sign` path is proven later by V1 (E2).
- **Done when.** CI and the self-test are green on the merged commit; the break-it of §6 (`none + required` made to
  `skip` → the step harness fails naming case 2) is quoted in the PR; `v1.0.0` points at that commit; the README names the five inputs,
  the owner steps and the caller snippet of §3.2.
- **Cornerstone areas.** The caller↔workflow contract: inputs `artifacts`, `own-files`, `extra-files`, `required`, `environment`;
  the artifact names `unsigned-NAME` → `NAME`; the mode decision (all six → sign, none → skip only when not required,
  some → red); the own-file vs vendor-file classification before any login. The hash-matched pack step and the publisher
  equality in Verify are security-relevant too, but their contract is in §3.1 word for word and the self-test pins them;
  they get the security judgement at review, outside the quota.
- **Stories** (`todo/PLAN_windows_code_signing_E1.md`, written when E1 starts):
  1. E1.1 **(cornerstone)** — the workflow's contract: inputs (with `extra-files`), the artifact matrix, download and the one-directory
     assertion, the inline mode step, and the inventory that classifies own files and vendor files.
  2. E1.2 — the signing leg: `azure/login`, `artifact-signing-action` with its pins and `cache-dependencies: false`,
     Verify (publisher, timestamp, kept vendor files), the hash-matched pack and the upload.
  3. E1.3 — `ci.yml` with actionlint, shellcheck and the self-test's step harness and its one real call, nine cases on fixtures; dependabot; the break-it;
     tag `v1.0.0` and the branch protection.

### E2 — this repository signs its Windows binaries (`dew_flow_creds_for_devs`)

- **Goal.** `cli-binaries` and `mcp-binaries` hand their Windows packages to the E1 workflow, `cli-release` and
  `mcp-release` publish only after signing succeeded, and a tag without the `release-signing` setup is red.
- **Repository and branch.** Branch `ci/windows-code-signing` from `main` of this repository, started after E1's
  `v1.0.0` commit exists (the caller pins that 40-hex SHA). The gate reviews this branch. It merges only after
  O1–O8 and V1 (§5), because D3 makes signing mandatory on a tag.
- **Scope.** `.github/workflows/release.yml` (the four jobs of §3.2 and two new `cli-sign` / `mcp-sign` jobs),
  `src_vs_code/src/test/releaseSigning.test.ts` (T1–T5), `CLAUDE.md`, `src_cli/README.md`, the `src_mcp/` file D9
  decides (recommended: a new `src_mcp/README.md`), the `release.yml` header.
- **Depends on.** E1 tagged `v1.0.0`. For the merge: O1–O8 done by the owner and V1 observed on this branch.
- **Done when.** T1–T5 green with the break-it (T3) quoted in the PR; `npm run typecheck`, `npm test`, actionlint,
  `plan-lifecycle.mjs` and `pin-check.mjs` green; V1 observed (both products, both architectures, signer = the
  organization, timestamp present — the first observation of F8) and V2 (the trial packages run under SAC); merged; O9 done and V3 observed; release-please
  has opened the `cli` and `mcp` release PRs. R1 and V4 are the plan's Definition of Done, after this epic.
- **Cornerstone areas.** None marked (the quota is used by E1.1). Watched at review: `cli-release` / `mcp-release`
  `needs` the sign jobs, so publication never happens without signing; `id-token: write` only on the two caller jobs;
  the 40-hex pin; the cross-repository federation (caller's environment and OIDC subject), which only V1 can prove.
- **Stories** (`todo/PLAN_windows_code_signing_E2.md`, written when E2 starts):
  1. E2.1 — the build legs: `Package` reads `$VERSION`, `win-*` builds `pkg/$NAME/` and uploads
     `unsigned-<product>-<rid>`, checksum and upload only for non-Windows RIDs, `retention-days: 7`; T1 and T5.
  2. E2.2 — the caller jobs `cli-sign` / `mcp-sign` pinned to E1's SHA, the release jobs' `needs`, no other
     `id-token`; T2–T4 with the break-it; actionlint.
  3. E2.3 — the docs and the releasable commits (`fix(cli):`, `fix(mcp):` with the D9 file); V1 with the owner on
     this branch and V2 on a SAC machine; the merge; O9 and V3.

Cornerstones: 1 of 1 — E1.1
