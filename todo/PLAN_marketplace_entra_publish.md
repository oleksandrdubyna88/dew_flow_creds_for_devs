# PLAN — the extension reaches the Marketplace through Microsoft Entra ID, not a global PAT, before 2026-12-01

> Status: **plan only, nothing implemented yet — 2026-10-09.** Scope: the `extension` job of
> `.github/workflows/release.yml` (the Marketplace publish and the GitHub release around it), one new
> dispatch-only workflow, the GitHub `marketplace` environment, `src_vs_code/docs/PUBLISHING.md`, and the
> owner's one-time Azure / Marketplace setup. No product code, no server, no contract change.
>
> Hard deadline: **2026-12-01**, when Azure DevOps stops accepting global PATs. The owner decided on
> 2026-10-09 to write this plan and NOT to implement it yet. Twin plans:
> `dew_flow_connect_other_ais · todo/PLAN_marketplace_entra_publish.md` (same design; it carries the
> full research notes) and `wsl_care · todo/PLAN_marketplace_entra_publish.md` (being written
> separately). §9 draws the boundary.

## 1. The symptom and the goal

**What runs today.** An `extension-v*` tag, or a `workflow_dispatch` with `target: extension`
(`release.yml:20-26`, `:646`), runs one job, `extension` (`release.yml:644-749`):

1. `npm ci`, typecheck and tests (`:665-669`);
2. it refuses a placeholder publisher (`:671-679`) and a tag that disagrees with `package.json` (`:684-695`);
3. it packages once (`:699-700`);
4. it publishes with a stored token, **failing closed** when the token is absent:

   ```yaml
   # release.yml:702-710
   - name: Publish to the Marketplace
     env:
       VSCE_PAT: ${{ secrets.VSCE_PAT }}
     run: |
       if [ -z "${VSCE_PAT}" ]; then echo "VSCE_PAT secret is not set — see docs/PUBLISHING.md."; exit 1; fi
       npx vsce publish --packagePath creds-for-devs.vsix --pat "${VSCE_PAT}"
   ```

5. Only after the publish does it upload the build artifact (`:712-715`). For a tag, it then writes the
   notes and makes release-please's draft public with the `.vsix` attached (`:719-749`).

`VSCE_PAT` is a repository secret, set 2026-08-24 (`gh secret list`, read 2026-10-09). The handover doc
says it must be created for **"Organization: All accessible organizations"**, scope *Marketplace →
Manage* (`src_vs_code/docs/PUBLISHING.md:84-93`, and `:39-48` for the secret). That is a **global** PAT.

**What breaks.** Azure DevOps decommissions every global PAT on **2026-12-01**. The owner saw the banner
on the PAT page on 2026-10-09. After that date step 4 fails. The failure is visible: the job goes red
before step 5, release-please's draft stays a draft, and nothing half-published is left behind. But
**nothing ships to the Marketplace from then on.** Every tag goes red, and an extension release needs a
manual upload. The 401/403 itself is expected, not observed (§2, N5).

**Goal.** Before 2026-12-01, an `extension-v*` tag publishes to the Marketplace with **no stored
long-lived credential**:

- a short-lived Microsoft Entra ID token, obtained through GitHub Actions OIDC, does the publishing;
- only a job in a protected `marketplace` environment can obtain that token;
- the PAT stays as a dated rollback until one real release has gone out through Entra, and then it is
  deleted.

The fail-closed behaviour (step 4) and the order "Marketplace first, GitHub release second" are kept.

## 2. What was checked, with sources (2026-10-09)

The coai twin (§2 there) has the full table with every quote. **Its F-numbers differ from these**, so
cite a fact by its content, not by its number, across the two. The facts this plan depends on:

| # | Fact | Source |
|---|---|---|
| F1 | Global PATs stop working on **2026-12-01**. The block on creating new global PATs announced for 2026-03-15 was withdrawn: *"You may continue creating global PATs until December 1."* | <https://devblogs.microsoft.com/devops/retirement-of-global-personal-access-tokens-in-azure-devops/> (2025-12-12, updated 03/05) |
| F2 | The VS Code guide (DateApproved 10/7/2026) tells publishers to move to *"secure automated publishing with Microsoft Entra ID"*. The steps are: a **user-assigned managed identity**; a federated credential; the identity's id read with `az rest -u https://app.vssps.visualstudio.com/_apis/profile/profiles/me --resource 499b84ac-1321-427f-aa17-267ca6975798`; that id *"as a member of your publisher"* with role **Contributor**; then `vsce publish --azure-credential` (vsce ≥ 2.26.1). The recipe is written for Azure Pipelines; there is no GitHub Actions example. | <https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace> |
| F3 | Uploading a `.vsix` by hand on the management page is a documented way to publish, and needs no PAT. | same page; <https://marketplace.visualstudio.com/manage> |
| F4 | `--azure-credential` asks for scope `499b84ac-…/.default` through a chain that includes `AzureCliCredential`, so an `azure/login` session is enough. | <https://github.com/microsoft/vscode-vsce/blob/v4.0.0/src/auth.ts> |
| F5 | **A PAT beats `--azure-credential`.** `getPAT` returns `options.pat` first, and `--pat` **defaults to `process.env.VSCE_PAT`**. With `VSCE_PAT` in the step's environment, `--azure-credential` is silently ignored. | <https://github.com/microsoft/vscode-vsce/blob/v4.0.0/src/publish.ts> (`getPAT`), <https://github.com/microsoft/vscode-vsce/blob/v4.0.0/src/main.ts> (`publish` and `verify-pat` options); same order at <https://github.com/microsoft/vscode-vsce/blob/v3.9.2/src/publish.ts> |
| F6 | `vsce verify-pat [publisher] --azure-credential` succeeds for **any** publisher role, Reader included. A green result proves membership, not publish rights. `vsce show` takes no credential. | <https://github.com/microsoft/vscode-vsce/blob/v4.0.0/src/store.ts> (`verifyPat`), <https://github.com/microsoft/vscode-vsce/blob/v4.0.0/src/main.ts> (`show`) |
| F7 | This repository runs vsce **4.0.0** (`src_vs_code/package.json:83` `^4.0.0`, `src_vs_code/package-lock.json:1512`) and `@azure/identity` 4.13.3. | this repository, read 2026-10-09; releases: <https://github.com/microsoft/vscode-vsce/releases/tag/v4.0.0> |
| F8 | Federated credential: issuer `https://token.actions.githubusercontent.com`, audience `api://AzureADTokenExchange`. A subject must match exactly; a wrong one is accepted at creation and fails silently at exchange. At most 20 credentials per identity; no wildcards. | <https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-create-trust-user-assigned-managed-identity> |
| F9 | A job that references an environment presents a subject ending in `:environment:<NAME>`, and needs `id-token: write`. | <https://docs.github.com/en/actions/reference/security/oidc> |
| F10 | **This repository emits the IMMUTABLE subject:** `gh api repos/oleksandrdubyna88/dew_flow_creds_for_devs/actions/oidc/customization/sub` → `use_immutable_subject: true`, prefix `repo:oleksandrdubyna88@71817001/dew_flow_creds_for_devs@1343621986`. So the subject to trust is `repo:oleksandrdubyna88@71817001/dew_flow_creds_for_devs@1343621986:environment:marketplace`. | API read 2026-10-09; <https://learn.microsoft.com/en-us/entra/workload-id/workload-identities-github-immutable-subjects> |
| F11 | `azure/login` v3.1.0 (2026-09-10) is commit `a641126d1b8aa4d1fa005f4f92df94a3a4c4c906`. Its inputs are `client-id`, `tenant-id` and `allow-no-subscriptions`. | `Azure/login · action.yml`, release list |
| F12 | Environment variables and secrets reach only jobs that reference the environment. "Selected branches and tags" limits the refs that may deploy. Required reviewers work on public repositories, and this one is public. | <https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments> |
| F13 | `vsce publish --oidc` ("trusted publishing", with no Azure involved) exists in 4.0.0 but is **hidden** from `--help`. Its exchange was fixed only in the **pre-release** 4.0.1-1, whose PR says *"Live end-to-end publishing has not been tested"*. The Marketplace team wrote on 2026-09-14 that it is *"not complete yet"*. Organization-scoped PATs are not supported (issue still open). | `microsoft/vscode-vsce` PRs #1291, #1297, #1337; <https://github.com/microsoft/vsmarketplace/issues/2121> |

*Later pre-releases:* vsce 4.0.1-2 and 4.0.1-3 (both 2026-10-03) came after 4.0.1-1. Their notes name
no OIDC change (read 2026-10-09). F13's verdict stands.

**Not confirmed — each one is checked by a step below:**

- **N1** — Which Marketplace UI adds the identity (*Members → Add*), that it takes the profile `id` and
  not a client, object or resource id, and that an **app registration** fails at publish where a
  managed identity works. One secondary source says so: a DEV Community post, "Jul 10", no year
  (<https://dev.to/emrecodes/publishing-to-the-vs-code-marketplace-with-ci-4p2h>). No Microsoft page
  found says this. Checked at O5.
- **N2** — Whether `remsoftdev`, a publisher created with a Microsoft account
  (`src_vs_code/docs/PUBLISHING.md:77-82`), accepts an identity from an Entra tenant. Checked at O5/O6.
- **N3** — Whether the identity needs an Azure role. F2's Reader is for a subscription-scoped Azure
  Pipelines connection, and `allow-no-subscriptions: true` needs none. So no role is assigned. If the
  probe's login fails, Reader is granted on the identity's resource group, and that is recorded.
- **N4** — Whether the portal's "GitHub Actions" scenario can produce the immutable subject (F10). Not
  checked, so the credential is created with an explicit subject.
- **N5** — The current PAT's **expiry date**. Secrets are write-only from here. The owner records it
  (O7). An expiry earlier than the switch shortens the rollback window.
- **N6** — Whether `profiles/me` answers for an identity that belongs to no Azure DevOps organization.
  F2's recipe runs inside Azure Pipelines, where the identity is already known to one. This is an
  inference, not checked. V1 shows it.
  - **If it fails:** add the identity to a free Azure DevOps organization connected to the same tenant
    (Stakeholder access), then re-run O4.
  - **If that fails too:** the managed-identity road stops, and the plan is revised.

## 3. Design

### 3.1 The road

`--azure-credential` + a user-assigned managed identity + GitHub OIDC through `azure/login` (F2, F4,
F7). Trusted publishing (`--oidc`) is not ready before the deadline (F13); it is a follow-up (§8). An
org-scoped PAT does not exist (F13). Manual upload (F3) is the break-glass path, not the plan.

### 3.2 Close the PAT-wins trap first (F5)

A "migration" that leaves the old `env:` block in place keeps publishing with the PAT. It would pass
review and break on 2026-12-01. `verify-pat` reads `VSCE_PAT` the same way, so a green preflight could
be the PAT too. Three layers:

- **Structural.** Every `run:` that passes `--azure-credential`, in the release job and in the probe,
  is `env -u VSCE_PAT npx vsce … --azure-credential`. The variable cannot reach vsce, whatever `env:`
  someone adds at step, job or workflow level. A separate guard step would not work: `env:` is per
  step, so it would never see a variable added to the publish step.
- **Absent.** No `VSCE_PAT` key in any Entra step's, that job's or the workflow's `env:`.
- **Pinned.** T1 (§6) fails on either.

### 3.3 Three jobs instead of one, so the OIDC token never meets `npm ci`

Granting `id-token: write` to today's `extension` job would hand a Marketplace-capable token to every
lifecycle script and test in the dependency tree. So the job splits along the line it already has, and
the order of effects stays the same:

| Job | Does | Permissions | Environment |
|---|---|---|---|
| `extension` | `release.yml:655-715` unchanged: install, typecheck, test, the publisher and version guards, package, upload `extension-vsix`. **The publish step leaves.** It gains `outputs: version: ${{ steps.version.outputs.version }}`, because `:747` reads that step and a different job cannot. | `contents: read` (it no longer writes the release) | — |
| `extension-marketplace` (new) | `needs: extension`; `defaults.run.working-directory: src_vs_code`. **One** checkout, with `fetch-depth: 0`. A second checkout would `git clean -ffdx` away `node_modules` and the downloaded `.vsix`, because the action's default is `clean: true`. Provenance comes next (below), then `npm ci --ignore-scripts`, so the lockfile decides which vsce runs (F7). Then download `extension-vsix` with `path: src_vs_code`, using the `actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1` pin already used at `release.yml:226`. Then the steps below, in this order. | `contents: read`, `id-token: write` | `marketplace` |
| `extension-release` (new) | `needs: [extension, extension-marketplace]`, `if:` tag; `defaults.run.working-directory: src_vs_code`. Checkout, for `package.json` and `CHANGELOG.md`, and the artifact with `path: src_vs_code`. Then `release.yml:719-749`, with its `GH_TOKEN` env (`:735-736`) and **one** change: the title at `:747` reads `needs.extension.outputs.version`. | `contents: write` | — |

`extension-marketplace`, step by step:

```yaml
- provenance: git merge-base --is-ancestor "$GITHUB_SHA" origin/main, right after the single fetch-depth: 0
  checkout and before anything is installed (a depth-1 clone cannot prove that a tag behind main's tip
  is an ancestor)
- id: mode   # writes path=entra|pat|manual; never "exit 0 to skip", which would not stop later steps
  # unset/entra -> entra (and a missing vars.AZURE_CLIENT_ID is RED, as a missing VSCE_PAT is today, :706-709)
  # pat -> pat (RED on/after 2026-12-01);  manual -> manual;  ANY other value -> RED, naming the three
- azure/login@a641126d1b8aa4d1fa005f4f92df94a3a4c4c906 # v3.1.0          if: steps.mode.outputs.path == 'entra'
  with: client-id: ${{ vars.AZURE_CLIENT_ID }}, tenant-id: ${{ vars.AZURE_TENANT_ID }}, allow-no-subscriptions: true
- env -u VSCE_PAT npx vsce verify-pat remsoftdev --azure-credential       (entra; membership preflight, F6)
- env -u VSCE_PAT npx vsce publish --skip-duplicate --packagePath creds-for-devs.vsix --azure-credential   (entra)
- npx vsce publish --skip-duplicate --packagePath creds-for-devs.vsix --pat "${VSCE_PAT}"   (pat; VSCE_PAT in THIS step's env only)
- npx vsce show remsoftdev.creds-for-devs --json   (manual; parse .versions[0].version from the JSON and fail unless it EQUALS needs.extension.outputs.version — vsce show exits 0 for any existing extension, so the exit code proves nothing; polled every 30 s for up to 10 min, printing what the gallery serves each time, because a hand upload takes minutes to show; red on timeout)
```

Every step but `mode` carries an `if:` on `steps.mode.outputs.path`. Environment-scoped variables
cannot be read in a job-level `if:`, so the switch has to be step-level. **`azure/login` sits directly
before the two Entra vsce steps**: the az session exchanges the short-lived GitHub assertion when vsce
asks for the Azure DevOps token, so nothing slow belongs in between. T1 pins that order.

Notes:

- **The vsix is the build's artifact, never a rebuild.** `vsce publish --packagePath` runs no
  `vscode:prepublish`. The artifact keeps the repository's default retention. Nothing here is a
  rollback source; the GitHub release is.
- **Dispatch keeps working.** `workflow_dispatch` `target: extension` publishes from `main` without a
  tag. `PUBLISHING.md:35-37` documents it as the re-run path, and it exists today because
  `release.yml:702` has no tag guard. `extension-marketplace` keeps that
  (`if: startsWith(github.ref, 'refs/tags/extension-v') || inputs.target == 'extension'`). That is why
  the environment admits branch `main` as well as tag `extension-v*` (D3). A dispatch from any **other**
  branch is now refused by the environment. Today it would publish whatever that branch holds, so the
  refusal is a tightening. `PUBLISHING.md:35-37` says so in S2.
- **`--skip-duplicate`** makes a re-run idempotent. A publish can succeed on the server and time out on
  the client. The version is still guarded by the tag/manifest check (`:684-695`), and the tag by the
  ruleset (D2). `PUBLISHING.md:32-33` ("Re-tagging the same version fails at `vsce publish`") changes
  in S2 to say that a re-run of a published version is now green and does nothing.
- **Provenance guards against accidents, not against a writer.** The job refuses a commit that is not
  on `main`, which catches a run on the wrong commit. It cannot stop someone who can change the workflow
  at that commit, or who dispatches a workflow naming the environment against an `extension-v*` tag
  (`workflow_dispatch` accepts a tag ref). The real boundaries are outside the workflow:
  - the tag ruleset (D2): only the release App creates `extension-v*` tags;
  - `main`'s pull-request protection;
  - the single collaborator.

  The plan does not claim more than those.
- **Actions stay pinned by SHA.** The `azure/login` pin is re-resolved at implementation (F11).
  Dependabot's `github-actions` ecosystem (`.github/dependabot.yml:67`) keeps it fresh.
- **`AZURE_*` values go to `azure/login` as `with:` inputs**, never exported into the vsce step.

### 3.4 The rollback switch, and the date it expires

An environment variable `MARKETPLACE_AUTH` in `marketplace` chooses the path:

| `MARKETPLACE_AUTH` | Path |
|---|---|
| unset or `entra` | the Entra path of 3.3 |
| `pat` | the current command, `npx vsce publish … --pat "${VSCE_PAT}"`. It reads the repository secret, which stays until S3, and **refuses on or after 2026-12-01** with a message naming the manual upload (F3). |
| `manual` | **Break-glass.** The person has uploaded the `.vsix` by hand (F3). The job only checks that the gallery serves the tagged version, then succeeds, so `extension-release` runs and the GitHub release does not stay a draft. Without this value a hand upload would leave the release stuck: `extension-release` needs this job green. |
| anything else | red, listing the accepted values |

**Rolling back:** set `MARKETPLACE_AUTH=pat`, then *Re-run failed jobs*. That re-runs
`extension-marketplace` and the `extension-release` it held back, on the same artifact. S3 deletes the
`pat` path after one real Entra release; `manual` stays.

### 3.5 The probe workflow, kept as the dry check

`.github/workflows/marketplace-identity.yml` is `workflow_dispatch` only. It has one job in
`marketplace`, with `contents: read` and `id-token: write`. Its steps:

0. Checkout (`persist-credentials: false`), the job's only one.
1. `azure/login` (as above).
2. `az rest -u https://app.vssps.visualstudio.com/_apis/profile/profiles/me --resource 499b84ac-1321-427f-aa17-267ca6975798 --query "{id:id,displayName:displayName}"`.
   This prints the profile `id`, which O5 pastes. It is an identifier, not a secret. It is the cheapest
   first answer to N6, and it runs before any Node setup.

   2b. `setup-node`, then `npm ci --ignore-scripts` in `src_vs_code`. This runs before any `vsce`, so
   `npx vsce` resolves the lockfile's 4.0.0 (F7) from `node_modules/.bin`. A fresh runner has no vsce of
   its own, and `npx` with nothing installed would fetch whatever version is newest.
3. `env -u VSCE_PAT npx vsce verify-pat remsoftdev --azure-credential`, with **no**
   `continue-on-error`. Before O5 the run is red, as expected, and step 2 has already printed the id.
   After O5 a green run is the evidence.
4. `npx --no-install vsce show remsoftdev.creds-for-devs --json`, with `if: always() && steps.install.outcome == 'success'` on the step (2b carries `id: install`), printing the served version. It still runs when step 3 failed, but **never after a failed install**: with no local vsce, a plain `npx` would download whatever version is newest and run it in a job holding `id-token: write`. Every `npx vsce` in this plan means `npx --no-install vsce`, which refuses to download.
   This is a public read with no credential.
5. A boolean input, `check_pat` (default false). When it is true, steps 1, 2 and 3 are **skipped** (2b still runs), and one step
   runs `npx vsce verify-pat remsoftdev` with `VSCE_PAT` in its own `env:`. That separate run proves the
   rollback authenticates, without publishing.

It stays after the migration. It is the cheap answer to "does publishing still authenticate?".

### 3.6 Owner decisions

- **D1 — one identity for the publisher, or one per repository.**
  - **Recommended: one.** A user-assigned managed identity `remsoftdev-marketplace-publisher`, with one
    federated credential each for `dew_flow_connect_other_ais`, this repository and `wsl_care` (3 of 20).
  - **Why one is enough:** the Contributor role is per publisher, so separate identities do not narrow
    anything. Revoking one repository means deleting its credential either way.
  - **Either choice works with this plan**, because the code reads `vars.AZURE_CLIENT_ID`.
- **D2 — a required reviewer on `marketplace`.** Recommended: no. The tag is the human decision, and
  the tag is already guarded:
  - ruleset **23780086 "release tags"** (`gh api repos/oleksandrdubyna88/dew_flow_creds_for_devs/rulesets/23780086`,
    read 2026-10-09) blocks **creation, update and deletion** of `refs/tags/extension-v*`, and of the
    other three release prefixes, for everyone except one bypass actor: the GitHub App integration
    5018284, which cuts the release tags. The body and the reasoning are in `.github/tag-ruleset.json`
    ("the GitHub App and NOBODY ELSE"; it was verified on 2026-09-21 by a refused probe creation);
  - `main` accepts changes only through a pull request;
  - the only collaborator is the owner.

  So the people who can reach the environment are the people who can release today with `VSCE_PAT`,
  and this plan does not widen that set. O3 re-reads the ruleset, and V6 proves it. If the ruleset is
  ever relaxed, D2 becomes **yes**. The owner may choose yes now; no code changes either way.
- **D3 — keep the untagged dispatch publish.** Recommended: keep it. It is documented, and `main` is
  protected. The alternative is to drop `main` from the environment and delete the dispatch path, with
  `PUBLISHING.md:35-37` updated to match.

## 4. Owner steps, once (no code)

- **O0 — go/no-go, by 2026-10-16: an Azure subscription exists** in an Entra tenant (portal.azure.com →
  *Subscriptions*). A user-assigned managed identity is an ARM resource. The publisher was created with
  a Microsoft account (N2), and nothing here shows the owner has a subscription.
  - If there is none, create a **pay-as-you-go** subscription, not a free trial. A trial is disabled
    when it ends, and what then happens to the identity was not checked.
  - Add a budget alert of, say, 1 USD. The identity itself costs nothing.

  If the coai plan's O0 already answered this, reuse that answer.
- **O1 — Azure: create the identity.** This needs a subscription in the owner's Entra tenant.
  1. In portal.azure.com, create a resource group `rg-marketplace-publishing`.
  2. In it, create the managed identity `remsoftdev-marketplace-publisher`.
  3. Record its **Client ID** and **Directory (tenant) ID**.

  Assign **no** role (N3). If the identity is shared (D1) and the coai plan's O1 already ran, skip this
  step.
- **O2 — Azure: trust this repository.**
  1. First re-read the subject prefix: `gh api repos/oleksandrdubyna88/dew_flow_creds_for_devs/actions/oidc/customization/sub`.
  2. On the identity: *Federated credentials → Add credential → Other issuer*.
     - Issuer: `https://token.actions.githubusercontent.com`
     - Subject: `repo:oleksandrdubyna88@71817001/dew_flow_creds_for_devs@1343621986:environment:marketplace` (F10)
     - Audience: `api://AzureADTokenExchange`
     - Name: `creds-marketplace`

  The same thing in Cloud Shell:
  `az identity federated-credential create --name creds-marketplace --identity-name remsoftdev-marketplace-publisher --resource-group rg-marketplace-publishing --issuer https://token.actions.githubusercontent.com --subject '<subject above>' --audiences api://AzureADTokenExchange`.
- **O3 — GitHub: create the environment.**
  1. Create the environment `marketplace`.
  2. *Selected branches and tags*: tag `extension-v*` and branch `main` (D3).
  3. Add the variables `AZURE_CLIENT_ID` and `AZURE_TENANT_ID`:
     `gh variable set AZURE_CLIENT_ID --env marketplace -R oleksandrdubyna88/dew_flow_creds_for_devs`
     (and the same for the tenant).

  D2 decides whether it gets a reviewer, after V6 has re-read the tag ruleset.
- **O4 — after S1: read the profile id.** Dispatch *marketplace-identity* on `main`. Step 2 prints the
  `id`.
- **O5 — Marketplace: add the identity as a member.** At marketplace.visualstudio.com/manage, open
  `remsoftdev` → *Members → Add*, paste the id, and choose role **Contributor** (F2, N1). If the identity
  is shared and already a member, skip this step.
- **O6 — prove it dry.**
  1. Dispatch the probe again; step 3 must pass. That proves membership only (F6), so check the role
     on the Members page by eye.
  2. Dispatch once more with `check_pat`; it must pass, which proves the rollback.
- **O7 — record the PAT's expiry.** Write it in §11 here by 2026-10-31. S2 then moves it into
  `src_vs_code/docs/PUBLISHING.md` beside the check S2 adds, which does not exist before S2. The expiry cannot be later
  than 2026-12-01. **The rollback is only as long as the PAT.** If the expiry falls before S3 plus
  a few days, the owner chooses one of two things before S2 merges:
  - **Renew the PAT** with an expiry of 2026-12-01 (still allowed, F1), then re-run O6 step 2.
  - **Declare the rollback to be manual upload only (F3).** S2 then ships without the `pat` path.

  The choice is recorded here as a deviation.
- **O8 — after S3: retire the PAT.**
  1. `gh secret delete VSCE_PAT -R oleksandrdubyna88/dew_flow_creds_for_devs`.
  2. Revoke the token on dev.azure.com **once no repository still needs it**. It may be shared three
     ways:
     - `dew_flow_connect_other_ais` holds a `VSCE_PAT` repository secret;
     - `wsl_care` holds one as an environment secret in its `marketplace` environment
       (`wsl_care · .github/workflows/release-extension.yml:45-48`).

## 5. Build order

The target dates leave a week of slack before the deadline.

| Step | What | Who | By |
|---|---|---|---|
| O0 | subscription exists (go/no-go) | owner | **2026-10-16** |
| O1–O3 | identity, trust, environment | owner | 2026-10-24 |
| **S1** | PR: `marketplace-identity.yml` (3.5) + test T2. It is small enough to land as soon as O0 says go, so O4/O5, the real go/no-go, can run early. | agent | 2026-10-24 |
| O4–O7 | profile id, membership, dry proof, PAT expiry | owner | 2026-10-31 |
| **S2** | PR: the three jobs (3.3) and the switch (3.4). Update `PUBLISHING.md:39-48` and `:84-117` (Entra first; the PAT section marked as the dated rollback), `research/architecture.md:318,341` and `research/module_extension.md:6662` where they describe the publish, the `release.yml:1-8` header, and the extension-owned checklist in `src_vs_code/docs/PUBLISHING.md` (*Verifying what you are about to ship*, `:143-152`): a check "the publish credential authenticates" (the probe) and the PAT expiry line. NOT the root `POST_DEPLOY.md`, which is the server deploy checklist; its `:51-53` says extension checks belong with the extension, which ships on its own clock. Also:<br>• `PUBLISHING.md:41-42` ("on the organisation that owns the publisher") contradicts `:90` ("All accessible organizations"); reconcile them.<br>• `:32-33` changes for `--skip-duplicate`.<br>• `:35-37` documents the non-`main` dispatch refusal.<br>• `src_vs_code/package.json:68` `"publish": "vsce publish"` is the local PAT route, which dies on 2026-12-01. It is removed, or `PUBLISHING.md` says it is break-glass only until then.<br>• `POST_DEPLOY.md` stays untouched, which also keeps S2 out of `ci-server.yml`'s push `paths` (`:17`), so merging it does not rebuild the server image.<br>Test T1. | agent | 2026-11-07 |
| R1 | The next `extension-v*` tag publishes through Entra, observed (V4). If none is due by 2026-11-14, the owner decides whether to cut a patch release to prove it. | owner + agent | 2026-11-14 |
| **S3** | PR: delete the `pat` path and `check_pat`; `PUBLISHING.md` loses the PAT section. Then O8. | agent, owner | 2026-11-24 |
| — | **deadline** | | **2026-12-01** |

S1 comes before S2 because it proves every Azure and Marketplace step with nothing at stake. If O5
fails (N1/N2), S2 does not start. From 2026-12-01 the break-glass upload (F3) carries releases while
the plan is revised: a service principal, or `--oidc` if it has shipped.

**Rollback:**

- before 2026-12-01: `MARKETPLACE_AUTH=pat` + *Re-run failed jobs*;
- after that, or after S3: download `creds-for-devs.vsix` from the run's artifact, upload it at the
  management page (F3), then set `MARKETPLACE_AUTH=manual` and *Re-run failed jobs*. The gallery check
  passes, and `extension-release` makes the draft public;
- a broken S2 is reverted by a revert PR.

A tag is never moved.

## 6. Test and verification plan

Tests go in `src_vs_code/src/test/`, next to `credsInstall.test.ts:46-57`, which already reads
`release.yml`. The job is sliced from its header and CRLF is normalised:

- **T1 (S2)**:
  - the only job with `id-token: write` is `extension-marketplace`, and it declares
    `environment: marketplace`;
  - every command carrying `--azure-credential` starts with `env -u VSCE_PAT`;
  - `VSCE_PAT` is in no Entra step's `env:`, nor in the job's or the workflow's;
  - `secrets.VSCE_PAT` appears **only** in the `pat` step (and the probe's `check_pat` step);
  - `vsce publish` appears **only** in `extension-marketplace`, so the old publish cannot linger in
    `extension`, publish with the PAT first, and make R1 prove nothing;
  - `azure/login@` is followed by a 40-hex SHA and immediately by the two Entra vsce steps;
  - the provenance step comes right after the single checkout, before `npm ci`, and there is exactly one checkout in the job;
  - `mode` rejects unknown values, and the `pat` path carries the 2026-12-01 refusal;
  - the provenance checkout has `fetch-depth: 0`, and the `manual` step compares the served version with
    `needs.extension.outputs.version` rather than trusting `vsce show`'s exit code;
  - `extension-release` `needs` both jobs, so a failed publish never makes the release public, and
    its title reads `needs.extension.outputs.version`, never `steps.version`;
  - both new jobs set `working-directory: src_vs_code` and download the artifact into it.

  **Break-it:** put `VSCE_PAT: ${{ secrets.VSCE_PAT }}` back into the Entra publish step, and separately
  drop its `env -u VSCE_PAT`. Watch T1 fail naming F5 each time, then restore and watch it pass. Both
  outputs go in the PR.
- **T2 (S1)**: the probe workflow is dispatch-only, in `marketplace`, and runs
  `npm ci --ignore-scripts` before its first `vsce`. Its Entra `verify-pat` starts with
  `env -u VSCE_PAT` and has no `continue-on-error`, and its `vsce show` runs only after a successful install (`steps.install.outcome == 'success'`). No `npx` in the plan may download (`--no-install`). Its `az rest`
  prints a `--query` projection, not the raw response.
- `npm run typecheck` and `npm test` in `src_vs_code`, the server suite (untouched, as a guard), and
  `ci-server.yml`'s actionlint job (`ci-server.yml:238`) over the two workflow files.
- `node .claude/rules/shared/tools/plan-lifecycle.mjs` and `pin-check.mjs`.

On the real services:

- **V1 (O4)** — the probe prints a profile `id`. This proves the credential, the immutable subject
  (F10) and `azure/login`.
- **V2 (O6)** — `verify-pat --azure-credential` prints *"The Personal Access Token verification
  succeeded for the publisher 'remsoftdev'."* That is the literal string in `src/store.ts`, even for an
  Entra token. It proves membership (F6).
- **V3 (O6)** — `check_pat` passes, so the rollback is alive.
- **V4 (R1)** — the tag's `extension-marketplace` log shows `Published remsoftdev.creds-for-devs
  v<version>`, with no `VSCE_PAT` in its environment. `npx vsce show remsoftdev.creds-for-devs` serves
  that version within minutes. The GitHub release became public only after that.
- **V5 (S1, negative)** — a probe dispatched from a branch other than `main` is refused by the
  environment (F12). That covers branches only. Tags are covered by the ruleset (V6). The provenance step only catches accidents (3.3).
- **V6 (O3, negative)** — the tag guard D2 relies on. Read
  `gh api repos/oleksandrdubyna88/dew_flow_creds_for_devs/rulesets/23780086`. It must still list
  `refs/tags/extension-v*` with the rules `creation`, `update` and `deletion`, and only the release App
  as a bypass actor.

  The check is a **read, deliberately not a push.** A probe tag pushed while the guard happens to be
  missing would START `release.yml`, because every `extension-v*` tag triggers it. Its version check
  (`release.yml:684-695`) should stop that run, but a verification step must not depend on another
  guard holding.

## 7. Growth surfaces

None that grows on its own:

- the probe keeps nothing;
- the `extension-vsix` artifact already exists (`release.yml:712-715`) and its retention is unchanged;
- the identity holds one federated credential per repository (3 of 20, F8);
- the rollback path has a date on it, and S3 deletes it.

## 8. Risks and follow-ups

- **N1/N2 fail at O5.** The plan stops before any code depends on them.
- **No Azure subscription.** O0 is the earliest-dated step for that reason. An app registration needs
  no subscription and is the other documented Azure DevOps identity, but it is reported to fail at
  publish (N1). Try it only after the managed identity has failed, or if O0 says no.
- **Splitting the job changes which job writes the release.** T1's last assertion and V4's ordering
  check exist for that reason.
- **Follow-up, not this plan:** when `--oidc` trusted publishing is announced in a non-pre-release
  vsce (F13), evaluate dropping Azure entirely. That gets its own `todo/` plan.

## 9. Across repositories

| Item | `dew_flow_creds_for_devs` (this plan) | `dew_flow_connect_other_ais` | `wsl_care` |
|---|---|---|---|
| Managed identity + `remsoftdev` membership | shared (D1); built by whichever repo goes first | the same | its own plan decides |
| Federated credential | `creds-marketplace`, this repo's immutable subject | `coai-marketplace`, its own | its own |
| Workflow, environment, tests, docs | here | there (`release.yml:591-604`; its publish **skips** with a warning when unconfigured, where this one **fails**, and each keeps its own contract) | there |
| `VSCE_PAT` | deleted here after S3; the token is revoked only when no repo needs it | the same | the same |

**Order:** the identity first, then each repository's S1–S3 independently. **Disjoint:** no file is
shared. Noted for `wsl_care`'s author and not edited from here: its
`.github/workflows/release-extension.yml:51` (in the *MARKETPLACE CREDENTIAL* comment, `:45-55`, local
checkout read 2026-10-09) sketches the name-only subject, but `wsl_care` also
answers `use_immutable_subject: true` (read 2026-10-09). The same comment also puts
`--azure-credential` on `vsce show`, which takes no credential.

## 10. Definition of Done

- [ ] O0 answered by 2026-10-16. O1–O7 done and recorded (§11): identity, a federated credential with the immutable subject, the
      `marketplace` environment (tag `extension-v*` + `main`, two variables), the Contributor member,
      and the PAT expiry.
- [ ] S1 merged; V1, V2, V3, V5 and V6 observed; the PAT's expiry covers the rollback window, or the
      rollback was declared manual-only (O7).
- [ ] S2 merged; `id-token: write` only on `extension-marketplace`; T1 watched failing with `VSCE_PAT`
      in the Entra step and passing without it; `PUBLISHING.md`, `architecture.md`,
      and `module_extension.md` say Entra, and `PUBLISHING.md` carries the extension-owned credential check.
- [ ] One real `extension-v*` release published through Entra and observed (V4), **before 2026-12-01**.
- [ ] S3 merged before 2026-11-24 (in any case before 2026-12-01); `VSCE_PAT` deleted here; the
      token revoked once no repository needs it.
- [ ] Deviations recorded, N1–N6 as observed, and the plan promoted to `research/` with
      `IMPLEMENTED <date>`.

## 11. Recorded by the owner

Identifiers and dates only, never a secret.

| Item | Value | Date |
|---|---|---|
| O0 — subscription exists (yes/no, offer type) | | |
| O1 — identity client id / tenant id | | |
| O4 — profile `id` | | |
| O5 — what the Members UI asked for (N1) | | |
| O7 — `VSCE_PAT` expiry | | |
