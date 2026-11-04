# PLAN — Windows code signing, E3: the shared workflow `v1.1.0` — the exception for missing configuration

> Status: **plan only, nothing implemented yet, 2026-11-04.** Stories of epic E3 of [PLAN_windows_code_signing.md](PLAN_windows_code_signing.md) (§3.1 the inputs and the mode table, §3.4 the switch and the cutover, §6 the E3 tests, `## Epics` E3).
> Scope: `oleksandrdubyna88/dew_flow_release_signing` only (clone: `/home/jinx/git/dew_flow_release_signing`, `main` = 609cc23 = `v1.0.0`): `.github/workflows/sign-windows.yml` (one input, the `mode` step, the header comment), `test/selftest.ps1` (the summary file, nine cases), `.github/workflows/ci.yml` (a second real call and its check, the wiring step), `test/wiring.mjs` (new), `README.md`. Branch `feat/allow-unsigned-release` from 609cc23; one PR; the squash commit tagged `v1.1.0`. Nothing in this repository changes for E3; E4 adopts the tag.

**Committed together with this document:** its row in `todo/README.md` under *Currently open*, and the cornerstone spec
`todo/PLAN_windows_code_signing_E3_S1_spec.md` with its own row (the shared `common/planning-docs.md` § *A plan split
into epics and stories*). The parent's ledger already reads `Cornerstones: 2 of 2 — E1.1, E3.1`; this document marks no
other cornerstone, so the ledger does not change.

## What E3 is, in one paragraph

`v1.0.0` has no road for a tag without a signing provider: its `mode` step forces `required` on every `refs/tags/*` ref
and is red with zero variables (parent F14). The owner wants the callers merged before a provider exists (D10). So
`v1.1.0` adds one boolean input, `allow-unsigned-release`, default `false`. It is a **permission for missing
configuration**, not an off switch. It acts in one state only: the caller's environment holds **none** of the six
variables, the leg is forced (a tag ref, or `required: true`), and the input is `true`. Then the leg takes `skip` —
today's unsigned packing — with a loud `::warning::` that names the environment and says the **release** is unsigned,
and a banner `UNSIGNED RELEASE` in the job summary. Every other row of the mode table is unchanged: a partial
configuration (one to five variables) is red whatever the input; a full configuration signs whatever the input, and a
login, signing or verify failure stays red and never falls back to unsigned; a trial (not forced) with zero variables
skips as before. A `v1.0.0` caller passes nothing, gets the default `false`, and behaves exactly as before.

## Who writes what (the review gate's operator orders)

| Part | E3.1 (cornerstone) | E3.2 |
|---|---|---|
| Scenarios and brief | Fable — `todo/PLAN_windows_code_signing_E3_S1_spec.md` | Opus — the §E3.2 below is the draft written with the spec; Opus confirms or corrects it before Sonnet starts |
| Code and tests | Sonnet | Sonnet |
| Review | Opus | Opus |
| Review fixes | Sonnet | Sonnet |

The `mode` decision is the only code path that lets a tag ship unsigned, so it also gets the security judgement (Fable)
at review, outside the quota (parent, E3 *Cornerstone areas*). The coai gate runs once for E3, on branch
`feat/allow-unsigned-release`: `review_plan` on the parent (epoch 3) first, then `review_code` on the finished branch.

## Binding constraints (from the parent and E1, for both stories)

- **No `${{ }}` inside any `run:` block.** The new input reaches the `mode` step through its `env:`
  (`ALLOW_UNSIGNED_RELEASE: ${{ inputs.allow-unsigned-release }}`), like `REQUIRED`. `test/run-step.mjs` refuses a
  `run:` that holds `${{` (E1.A5 stays).
- **The order of checks in `mode` stays:** partial (one to five set) → all six → forced → trial. The partial row is
  decided before anything reads the new input, so a half configuration is never skipped (spec §S1.3).
- **The banner goes through `$GITHUB_STEP_SUMMARY`**, appended, Markdown. The harness supplies that file per step, as
  it supplies `GITHUB_OUTPUT` (spec §S1.5).
- **No new action, no new pin, no checkout.** The pins of E1 stay as they are. The YAML parser dependency stays at its
  locked version.
- **The 44 existing harness cases do not change** (43 in the table of `test/selftest.ps1` plus E1.A5). They run with
  the new variable unset, which is the `v1.0.0` behaviour. The existing default-input trial call (`trial-call`) stays.
- **The harness cannot see the `env:` mapping.** It sets the step's environment itself, so cases 10–13 stay green when
  the workflow's `allow-unsigned-release` → `ALLOW_UNSIGNED_RELEASE` line is deleted or misspelled (cadence consultation
  96bf9488). The proof of the mapping is a second **real** call in `ci.yml` (E3.2), forced and permitted, which must be
  green; its break-it deletes the mapping and watches that call go red. The mapping's SOURCE (`inputs.required` or a
  literal `true` in its place) is invisible to both; `test/wiring.mjs` pins it (E3.2, B3b).
- **The permission trusts the caller's environment NAME.** GitHub creates an environment the caller names but does not
  have, empty (E1 spec G2). With the permission on, a typo in `environment` on a tag is an unsigned release with the
  banner, not a red run. Accepted for the switch-on period: both callers use the default name `release-signing`, and A6
  removes the permission in code at activation. The README says so (E3.2). No other mitigation is added.
- **No release-note labelling, no asset renaming.** The owner chose "unsigned exactly as today" (D10): the zip, its
  layout and its checksum are what `v1.0.0` packs in `skip` mode. The warning and the banner are the only marks.

**Step ids and output names** stay those of the E1.1 spec §S1.6. The harness grows by one case key pair (`Summary`,
`NoSummary`) and one clean-environment name; nothing else in it changes.

## The self-test cases

Fixtures and defaults as in E1 (`in/pkg/` with `app.exe` and `vendor.exe`; the six variables empty; `REQUIRED=false`;
`GITHUB_REF=refs/heads/main`; `ENVIRONMENT=release-signing`; `ARTIFACT=cli-win-x64`). New for E3: `ALLOW_UNSIGNED_RELEASE`
is **unset** in the defaults and set per case; `GITHUB_STEP_SUMMARY` is a fresh empty file per step. Cases 10–13 are the
parent's (§3.1, §6); E3.A1–E3.A5 and the real call R2 are added here. The full table with the output fragments is the
spec's §S1.6.

| # | Given | When | Then | Proved by |
|---|---|---|---|---|
| 10 | a tag ref; no variables; input `true` | `mode` | exit 0, `mode=skip`; the `::warning::` says `UNSIGNED RELEASE`, names `release-signing` and `refs/tags/x`; the summary file holds `UNSIGNED RELEASE` | harness, E3.1 |
| 11 | a tag ref; no variables; input `false` | `mode` | exit 1, `signing is required`, names the six variables; no output, no summary — as case 9 | harness, E3.1 |
| 12 | one variable set; a tag ref; input `true` | `mode` | exit 1, `partial signing configuration`, names the set and the missing; no output, no summary | harness, E3.1 |
| 13 | all six set; a tag ref; input `true` | `mode` | exit 0, `mode=sign`; no summary (the input does nothing) | harness, E3.1 |
| E3.A1 | five of six set; a tag ref; input `true` | `mode` | exit 1, `partial signing configuration`, `missing SIGNING_PUBLISHER` | harness, E3.1 |
| E3.A2 | `REQUIRED=true` on a branch ref; no variables; input `true` | `mode` | exit 0, `mode=skip`, the warning and the banner — `required: true` is forced like a tag | harness, E3.1 |
| E3.A3 | as case 10 | `mode` | the summary file holds the exact banner: the heading `## UNSIGNED RELEASE`, the artifact, the environment, the ref, and the sentence that the exception ends at activation | harness, E3.1 |
| E3.A4 | a tag ref; no variables; input `1` (not the string `true`) | `mode` | exit 1 as case 11: only the exact string `true` permits | harness, E3.1 |
| E3.A5 | a branch ref; `REQUIRED=false`; no variables; input `true` | `mode` | exit 0, `UNSIGNED trial`, `mode=skip`, **no** summary — a trial is not a release, the banner is for forced legs only | harness, E3.1 |
| R2 | the case-1 fixture package; `required: true`; `allow-unsigned-release: true`; environment `selftest-no-signing` (never holds variables) | the real call `trial-call-forced` of `sign-windows.yml` | green; the artifact `selftest-forced-win-x64` passes the case-1 checks (layout, hashes, `sha256sum -c`); the PR quotes the leg's `::warning::sign-windows: UNSIGNED RELEASE` log line, and the run's summary page shows its one banner (read, not asserted: the called workflow has no outputs) | `ci.yml`, E3.2 |

Each harness case asserts the exit code, the output fragments, the outputs written (or that none were) and, new, the
summary file's content (or that it is empty). The counts after E3: 53 harness cases (44 + 9), one wiring check and two real calls.

## E3.1 — the input, the `mode` row, the warning and the banner (cornerstone)

**The detailed spec is a separate document by another author (Fable):** `todo/PLAN_windows_code_signing_E3_S1_spec.md`.
It holds the exact input block, the decision table and its order, the exact messages, the banner and how it is written,
the harness changes, the cases with their environments, the RED-first notes, the break-its and the Opus checklist. This
section gives only the scope and the acceptance. Where the two differ, the spec decides and this section is corrected.

**Scope.** `.github/workflows/sign-windows.yml`: the input `allow-unsigned-release` (boolean, default `false`) in
`on.workflow_call.inputs`, after `environment`; the `mode` step: one more `env:` line and one more branch inside the
forced row, with the warning and the banner. `test/selftest.ps1`: `GITHUB_STEP_SUMMARY` per step, the `Summary` /
`NoSummary` assertions, `ALLOW_UNSIGNED_RELEASE` in the clean-environment names, cases 10–13 and E3.A1–E3.A5.

**Scenarios.** Cases 10–13 and E3.A1–E3.A5 above; cases 1–9, S1.A1–S1.A9, E1.A1–E1.A5 and every other existing case
unchanged and green. Also, read at review: the six variables and the two booleans reach `mode` only through its
`env:`; nothing else in the file changes.

**RED first.** Commit the harness changes and the nine cases before the workflow changes. With `v1.0.0`'s `mode` step:
10, E3.A2, E3.A3 fail on the exit code (1 instead of 0); 13 fails on the missing summary assertion only if the harness
is wrong (it must pass — a sign leg is a sign leg); 11, 12, E3.A1, E3.A4 pass already (the `v1.0.0` rows); E3.A5 passes
already. Record that state: the RED set is exactly {10, E3.A2, E3.A3}, and the passing-before set is what proves the
other rows are unchanged. Then the workflow change turns the three green with no other case moving.

**Done when.** The spec exists and its review is resolved; 53 harness cases pass on `windows-2025`; actionlint and
shellcheck are clean; no `run:` block holds `${{`; Opus's review and the security judgement on `mode` are resolved.
One commit `feat(sign): allow-unsigned-release — a forced leg with zero signing variables packs unsigned, with a warning
and a banner` (with the harness cases).

## E3.2 — the second real call, the README, the header, the break-its, the merge and the tag

**What to change.**

1. `.github/workflows/ci.yml`, after `trial-check`:
   - `trial-call-forced`: `needs: trial-input`; `permissions: contents: read` + `id-token: write`;
     `uses: ./.github/workflows/sign-windows.yml` with `artifacts: '["selftest-forced-win-x64"]'`,
     `own-files: '["selftest.exe"]'`, `required: true`, `allow-unsigned-release: true`,
     `environment: selftest-no-signing`. It needs its own input artifact: `trial-input` uploads the same `unsigned/`
     folder a second time as `unsigned-selftest-forced-win-x64` (one package folder, two artifact names; the called
     workflow reads `unsigned-NAME` per leg).
   - `trial-check-forced`: `needs: trial-call-forced`, `windows-2025`; downloads `unsigned-selftest-forced-win-x64` and
     `selftest-forced-win-x64`; runs the same four case-1 assertions on them (the listing, the one top-level entry, the
     hashes, `sha256sum -c`). The assertion text is one `run:` in both check jobs; copy it, a shared script would be
     a checkout the called workflow does not do and a drift the harness cannot see — the comment above says so.
   - A comment above `trial-call-forced`: it is the only proof that the input reaches the `mode` step, because the
     harness supplies the step's environment itself (consultation 96bf9488).
   - `push` stays `branches: ['**']`, never a tag: with the permission on, a tag push would now be green, not red, and
     the point of the forced call is to be forced by `required: true`, not by a ref.
   - The comment above `trial-input` (`ci.yml:70-71`, `The one real call of sign-windows.yml (case 1)`) →
     `The package for both real calls of sign-windows.yml: trial-call (case 1, the unsigned trial road) and
     trial-call-forced (R2, forced and permitted). It has an own file and a vendor file, and the called environment
     never holds variables.`
   - `test/wiring.mjs` (new; the locked `yaml` parser, as `run-step.mjs`): exits 1 unless the `mode` step's
     `env.ALLOW_UNSIGNED_RELEASE` is exactly `${{ inputs.allow-unsigned-release }}` and no other string in the file
     names `inputs.allow-unsigned-release`; on success prints `wiring ok: mode reads allow-unsigned-release from the
     input only`. The `harness` job runs it as its own step after `Run the self-test` (`node test/wiring.mjs
     .github/workflows/sign-windows.yml`; no `${{` in that `run:`). Why: a mapping read from the wrong SOURCE
     (`inputs.required`, a literal `true`) leaves the harness (G10) and both real calls green — `trial-call-forced` is
     permitted either way and `trial-call` is not forced — while a real tag caller with the input `false` would ship
     unsigned. The forced call proves the input arrives; this check proves nothing else arrives in its place.
2. `sign-windows.yml` header comment (`:3-5`): one line — `v1.1.0: allow-unsigned-release is a permission for MISSING
   configuration (zero variables on a forced leg), never an off switch; callers remove it at activation (A6)`.
3. `README.md`:
   - *Inputs*: `allow-unsigned-release` (boolean, optional, default `false`), description **verbatim** from the
     workflow (spec §S1.1).
   - The mode table: the `none | yes` row becomes two rows — input `false` (or absent): red, naming the six variables;
     input `true`: skip, an UNSIGNED RELEASE, with a warning and a job-summary banner. A column `allow-unsigned-release`
     is added; the other rows say `any`.
   - A paragraph under the table: the exception is for the period before a signing provider exists; the caller passes it
     from a repository variable (`${{ vars.ALLOW_UNSIGNED_RELEASES == 'true' }}`, so absent = enforcement); at
     activation the owner deletes the variable **and** the callers remove the input in code (A6) — then no variable can
     bring the exception back. It cannot skip a partial configuration, a failing provider or a failed verify. And the
     environment-name sentence: with the permission on, a mistyped `environment` (auto-created, empty) is an unsigned
     release with the banner, not an error; accepted while the permission is on because the callers use the default
     name and A6 removes the permission.
   - Line 52 (`a trial takes skip, a tag is red`) → `a trial takes skip, a tag is red — or, with allow-unsigned-release
     true, an unsigned release with the banner`.
   - Line 83 (*Security rules*, `A tag ref always requires signing, whatever required says`) → `A tag ref is always
     FORCED, whatever required says: with zero variables it is red, unless the caller passes allow-unsigned-release:
     true, which packs it unsigned and says so in a warning and a banner. With one to five variables it is red in every
     case; with six it signs.`
   - *Owner setup* O7 (`:132-133`, `holding the six variables. Until the merge the rule also admits the PR branch`) →
     the environment holds **zero** variables until the activation cutover, then the six set in one sitting with
     releases paused; the deployment rule admits `main` and the release tags (the PR branches were admitted until the
     merge and removed by O9). Add M1 (the repository variable `ALLOW_UNSIGNED_RELEASES=true` in each caller before
     the merge), M2 (the environment exists and is empty) and A6 (delete the variable and remove the input in code),
     citing the parent §4 as a path.
   - *Self-test* (`:155-156`, `V1 proves it: a dry run on the caller's PR branch before its merge`) → `V1 proves it: a
     signed dispatch trial on the caller's main during the activation cutover (dew_flow_creds_for_devs ·
     todo/PLAN_windows_code_signing.md section 3.4)`. The self-test list (`:144-145`, `trial-input, trial-call,
     trial-check: one real call in the unsigned trial road …`) → `trial-input builds the package for both real calls;
     trial-call, trial-check: the real call in the unsigned trial road (environment selftest-no-signing, which never
     holds variables) and the checks of its result; trial-call-forced, trial-check-forced: the real forced-and-permitted
     call, green in skip mode with the banner, and the same checks`. The `harness` entry gains: `then test/wiring.mjs
     checks that the mode step reads allow-unsigned-release from the input and from nothing else`.
   - *Caller snippet*: `# v1.1.0` on the `uses:` line and
     `allow-unsigned-release: ${{ vars.ALLOW_UNSIGNED_RELEASES == 'true' }}   # until activation (A6)`.
   - The *What `sign-windows.yml` does* step 3: `… from the six signing variables of the caller's environment and the
     allow-unsigned-release input (mode step)`.
   A docs grep before the PR: no line of the README says a tag is "always red", "always requires signing", that V1
   runs on a PR branch, or that there is one real call; no comment of `ci.yml` says `The one real call`.
4. The break-its (parent §6 and the consultations). Each is pushed to a throwaway branch `breakit/e3-bN` cut from the
   PR head (CI runs on every branch push; the harness needs Windows, so CI is where it runs); its run URL and failing
   lines are quoted in the PR, and the branch is deleted. Nothing is committed to the PR branch, and the PR head's own
   green run is the "restored" run.
   - **B1** `mode`: insert above the partial row
     `if [ "$forced" = yes ] && [ "${ALLOW_UNSIGNED_RELEASE:-}" = true ] && [ "${#set_names[@]}" -lt 6 ]; then` + row
     3's body (banner, `mode=skip`, warning) + `exit 0; fi` (the permission skips a half configuration on a forced
     leg). The harness must fail naming exactly case 12 and E3.A1 (`exit code 0, expected 1; output lacks 'partial
     signing configuration'`), and no other case.
   - **B2** `mode`: delete row 3's `write_banner >> "$GITHUB_STEP_SUMMARY"` line (the forced leg skips without the
     banner). The harness must fail naming exactly case 10, E3.A2 and E3.A3 (`summary lacks 'UNSIGNED RELEASE'` /
     `summary lacks '## UNSIGNED RELEASE'`).
   - **B3** `sign-windows.yml`: delete the line `ALLOW_UNSIGNED_RELEASE: ${{ inputs.allow-unsigned-release }}` from the
     `mode` step's `env:`. The self-test step prints 53 pass (record that, it is the finding of 96bf9488); the wiring
     step is red; `trial-call-forced` is red at `mode` with `signing is required`; `trial-call` is green.
   - **B3b** `sign-windows.yml`: change that line to `ALLOW_UNSIGNED_RELEASE: ${{ inputs.required }}`. The self-test
     step prints 53 pass; the wiring step is red; `trial-call-forced` and `trial-call` are both green — the wiring
     check is the only red, which is why it exists.
5. The PR from `feat/allow-unsigned-release`: title `feat(sign): allow-unsigned-release — a permission for missing
   configuration on a forced leg`; body: the parent path, the four break-its quoted, the 53/2 counts and the wiring
   check, the coai verdicts and reviewer counts. Squash-merge by PR (`main` is protected; as `v1.0.0`, #1). Tag the
   squash commit `v1.1.0` (annotated, as `v1.0.0`: `git tag -a v1.1.0 <squash-sha> -m "…"`, pushed;
   `git ls-remote --tags` shows both the tag object and its `^{}` line). Record the 40-hex squash-commit SHA: E4 and
   the coai twin pin it (never the tag).

**Scenarios.**

- Given a clean branch, when CI runs, then `lint`, `harness` (53 `pass` lines and `wiring ok`), `trial-check` and
  `trial-check-forced` are green; the PR quotes the `::warning::sign-windows: UNSIGNED RELEASE` line from
  `trial-call-forced`'s log and the `UNSIGNED trial` line from `trial-call`'s log (`gh run view <id> --log`), and
  records that the run's summary page shows exactly one `## UNSIGNED RELEASE` banner. (The called workflow has no
  outputs, so no check job can see the mode; a green forced call alone does not prove row 3.)
- Given B3's mutant, when CI runs, then the self-test step prints 53 pass, the wiring step is red, `trial-call-forced`
  is red at `mode` with `signing is required`, and `trial-call` is green.
- Given B3b's mutant, when CI runs, then the self-test step prints 53 pass, the wiring step is red, and both real calls
  are green.
- Given the README after step 3, when it is checked, then a node one-liner prints the YAML-parsed
  `allow-unsigned-release` description and `grep -cF` finds it exactly once in `README.md`; the mode table has five
  data rows and an `allow-unsigned-release` column.

**Done when.** CI green on the squash commit with 53 harness cases, the wiring check and both real calls; B1–B3b
quoted in the PR; the README changes of step 3 in; `v1.1.0` points at the squash commit and its 40-hex SHA is recorded
in E4's story document when that one is written; the parent's §9 wiring line for E3 ticked; the coai code round
resolved. One commit for `ci.yml` and `test/wiring.mjs`, one for the README and the header; the break-its leave no
commit on the PR branch.

## Order

E3.1 spec (Fable, this commit) → coai `review_plan` on the parent (epoch 3, narrowed) → E3.1 harness cases RED →
E3.1 code → E3.2 `ci.yml` (the forced call) → E3.2 README and header → B1–B3 → PR → Opus review, coai `review_code`
→ merge → tag `v1.1.0` → the SHA to E4.

## Gaps found in the parent (recorded, not fixed here)

1. The parent's case 13 says "the mode step only" without a ref; a tag ref is the stronger case (forced AND permitted
   AND configured must sign), so the spec gives it one. A branch ref with six variables is E1's S1.A5 already.
2. The parent names cases 10–13 and no case for `required: true` + zero + `true` on a branch, for the exact banner text,
   for a non-`true` value, or for the trial row with the input on. E3.A1–E3.A5 add them.
3. The parent's §6 lists two break-its; the cadence consultation 96bf9488 found that neither can catch a deleted
   `env:` mapping, because the harness supplies the environment. B3 and the second real call close that; the parent's
   "one real call (case 1)" becomes two.
4. The parent's §3.1 says the banner is written "through `$GITHUB_STEP_SUMMARY`" and says nothing about a runner where
   it is unset. The spec makes that red (fail-closed): a release that cannot announce it is unsigned is not packed.
5. The parent's README list for E3 ("input list, mode table rows, caller snippet, M1/M2/A6 in short") does not name the
   three lines that are wrong after epoch 3 (a tag always red; V1 on the PR branch; O7 holding the six variables). This
   document names them.
