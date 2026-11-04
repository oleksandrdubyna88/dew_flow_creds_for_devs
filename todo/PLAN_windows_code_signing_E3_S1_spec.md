# PLAN — E3.1 spec: the exception for missing configuration in `mode` (CORNERSTONE)

> Status: **plan only, nothing implemented yet, 2026-11-04 — cornerstone spec by Fable, written before its code.**
> Story E3.1 of [PLAN_windows_code_signing_E3.md](PLAN_windows_code_signing_E3.md) (parent
> [PLAN_windows_code_signing.md](PLAN_windows_code_signing.md) §3.1 input table and step 3, §3.4, §6 E3, `## Epics` E3).
> Its own file because the stories document goes whole to the review gate and must stay short; it is promoted with E3's.
>
> Scope: `.github/workflows/sign-windows.yml` in `oleksandrdubyna88/dew_flow_release_signing` (clone:
> `/home/jinx/git/dew_flow_release_signing`, `main` = 609cc23 = `v1.0.0`) — one new input and the `mode` step; and
> `test/selftest.ps1` — the summary file, two case keys, nine cases. The second real call in `ci.yml`, the README and the
> header comment are E3.2; here only what E3.2's forced call must see (§S1.4). Everything the E1.1 spec fixed
> ([PLAN_windows_code_signing_E1_S1_spec.md](PLAN_windows_code_signing_E1_S1_spec.md)) stays; this spec changes the
> `mode` step's §S1.4 of that document and nothing else of it.

## S1.0 — Facts this spec rests on

E1 spec G1–G6 hold (confirmed on the runner, E1 §S1.11). Added here, from the GitHub docs (*Workflow commands*, *Reusing
workflows*, *Variables*); G7 and G8 are confirmed by E3.2's forced real call:

| # | Fact | Consequence |
|---|---|---|
| G7 | `GITHUB_STEP_SUMMARY` is a default environment variable in every step: the path of a per-step file. Markdown appended to it is shown on the run's summary page under the job, in step order. Up to 1 MiB per step. | The banner is appended (`>>`), never written with `>`; the harness points the variable at a fresh empty file per step and reads it after. |
| G8 | A boolean `workflow_call` input the caller does not pass takes its `default`; in `env:` it arrives as the string `false`. A caller that passes it gets `true` or `false`, never another spelling. | A `v1.0.0` caller is unchanged. The step compares `"$ALLOW_UNSIGNED_RELEASE" = true`, exactly as it compares `REQUIRED`; any other string is `false`. |
| G9 | A `::warning::` line is an annotation: it is shown on the run's summary page, in the job log, and on the PR's checks tab; it does not fail the step. `::notice::` is quieter. | The warning is the loud mark the parent asks for; the banner is the mark a reader of the summary page cannot miss. |
| G10 | The harness runs a step with an environment IT builds (`Invoke-WorkflowStep`: the case's `env` plus `GITHUB_OUTPUT`). It never reads the step's `env:` block of the YAML. | A deleted or misspelled `env:` mapping is invisible to every harness case. The proof of the mapping is a real call (E3.2's `trial-call-forced`, §S1.4). |
| G11 | A called job that names an environment the caller's repository does not have gets it created, empty (E1 G2). | With the permission on, a typo in `environment` on a tag is an unsigned release with the banner. Accepted for the switch-on period (§S1.9 decision 6); every message names the environment, so the typo is readable in the warning and the banner. |

## S1.1 — The input, verbatim

Appended to `on.workflow_call.inputs` after `environment`. Nothing else in the inputs block changes:

```yaml
      allow-unsigned-release:
        description: 'A permission for MISSING configuration, not an off switch. true: a forced leg (required: true, or a caller ref under refs/tags/) whose environment holds NONE of the six signing variables takes skip and packs the release unsigned, with a ::warning:: and a job-summary banner UNSIGNED RELEASE. It changes nothing else: one to five variables set is red, all six set signs, and a login, signing or verify failure is red. For the period before a signing provider exists; callers remove it at activation.'
        type: boolean
        required: false
        default: false
```

The README (E3.2) carries this description as the same bytes. The job header, `permissions`, the matrix and every step
but `mode` are unchanged.

## S1.2 — The `mode` step's `env:`

One line added, after `REQUIRED`:

```yaml
          ALLOW_UNSIGNED_RELEASE: ${{ inputs.allow-unsigned-release }}
```

The `env:` of `mode` is then exactly: the six `${{ vars.X }}` under their own names, `REQUIRED`, `ALLOW_UNSIGNED_RELEASE`,
`ENVIRONMENT`, `ARTIFACT`. `GITHUB_REF` and `GITHUB_STEP_SUMMARY` are default variables (G4, G7). No `${{` in the `run:`.

## S1.3 — The decision table and its order

*Set* = non-empty (no trimming). *Forced* = `REQUIRED` is `true` **or** `GITHUB_REF` starts with `refs/tags/`.
*Permitted* = `ALLOW_UNSIGNED_RELEASE` is exactly `true`. The rows are decided **in this order**; the first that matches
ends the step:

| # | Set of six | Forced | Permitted | Result | Exit | Output / lines |
|---|---|---|---|---|---|---|
| 1 | 1–5 | any | any | red | 1 | `::error::sign-windows: partial signing configuration in environment '<ENVIRONMENT>': set <names>; missing <names>` (unchanged, names only) |
| 2 | 6 | any | any | sign | 0 | `mode=sign`; `mode: sign (required=<REQUIRED>, ref=<GITHUB_REF>, environment=<ENVIRONMENT>)` (unchanged) |
| 3 | 0 | yes | yes | **skip, unsigned release** | 0 | the banner (§S1.5) appended to `$GITHUB_STEP_SUMMARY`; then `mode=skip`; then `::warning::sign-windows: UNSIGNED RELEASE — signing is required (required=<REQUIRED>, caller ref <GITHUB_REF>) but none of the six signing variables is set in environment '<ENVIRONMENT>', and allow-unsigned-release is true; <ARTIFACT> is packed unsigned` |
| 3r | 0 | yes | yes, but `GITHUB_STEP_SUMMARY` unset or empty | red | 1 | `::error::sign-windows: GITHUB_STEP_SUMMARY is not set, so the UNSIGNED RELEASE banner cannot be written; <ARTIFACT> is not packed unsigned without it` |
| 4 | 0 | yes | no | red | 1 | `::error::sign-windows: signing is required (required=<REQUIRED>, caller ref <GITHUB_REF>) but none of AZURE_CLIENT_ID, AZURE_TENANT_ID, SIGNING_ENDPOINT, SIGNING_ACCOUNT, SIGNING_PROFILE, SIGNING_PUBLISHER is set in environment '<ENVIRONMENT>'` (unchanged — `v1.0.0`'s row) |
| 5 | 0 | no | any | skip, trial | 0 | `mode=skip`; `::warning::sign-windows: UNSIGNED trial — none of the six signing variables is set in environment '<ENVIRONMENT>'; <ARTIFACT> is packed unsigned` (unchanged; no banner) |

Why this order: row 1 before everything, so the permission can never skip a half configuration (the parent's first
break-it); row 2 before row 3, so a full configuration signs whatever the input, and a login, signing or verify failure
later in the job stays red (those steps do not read the input at all); row 3 inside the forced branch only, so a trial
(row 5) keeps its `v1.0.0` text and writes no banner. Row 3r is fail-closed: a leg that cannot announce the unsigned
release does not pack it. Values of the six variables are never printed. `mode` is written to `$GITHUB_OUTPUT` only on
exit 0.

The shape of the code, so the order is visible (the existing text stays; the forced branch gains the inner `if`):

```bash
          # The partial row is decided before the forced row: a half configuration is never "none set".
          if [ "${#set_names[@]}" -gt 0 ] && [ "${#set_names[@]}" -lt 6 ]; then … exit 1; fi
          if [ "${#set_names[@]}" -eq 6 ]; then … mode=sign … exit 0; fi
          if [ "$forced" = yes ]; then
            # The permission acts here only: zero variables on a forced leg. Never on a partial or a full configuration.
            if [ "${ALLOW_UNSIGNED_RELEASE:-}" = true ]; then
              if [ -z "${GITHUB_STEP_SUMMARY:-}" ]; then
                echo "::error::sign-windows: GITHUB_STEP_SUMMARY is not set, so the UNSIGNED RELEASE banner cannot be written; ${ARTIFACT:-} is not packed unsigned without it"
                exit 1
              fi
              write_banner >> "$GITHUB_STEP_SUMMARY"
              echo "mode=skip" >> "$GITHUB_OUTPUT"
              echo "::warning::sign-windows: UNSIGNED RELEASE — signing is required (required=${REQUIRED:-}, caller ref ${GITHUB_REF:-}) but none of the six signing variables is set in environment '${ENVIRONMENT:-}', and allow-unsigned-release is true; ${ARTIFACT:-} is packed unsigned"
              exit 0
            fi
            echo "::error::sign-windows: signing is required … " ; exit 1      # unchanged
          fi
          echo "mode=skip" >> "$GITHUB_OUTPUT"                                   # unchanged trial row
          echo "::warning::sign-windows: UNSIGNED trial — …"
```

`write_banner` is a shell function defined above (next to `join_names`) that prints §S1.5's lines with `printf`/`echo`;
it writes nothing to stdout itself except through the redirection. Under `set -euo pipefail` a failed append is red.

## S1.4 — What the harness cannot prove, and what proves it

The harness builds the step's environment (G10). Cases 10–13 set `ALLOW_UNSIGNED_RELEASE` themselves, so they are green
even when the `env:` line of §S1.2 is missing or reads `inputs.allow_unsigned_release`. Only a real call carries the input
from `with:` through `env:` into the script. E3.2 therefore adds `trial-call-forced` to `ci.yml`: the case-1 fixture
package, `required: true`, `allow-unsigned-release: true`, environment `selftest-no-signing` (never holds variables).
It must be **green**, its `mode` step must take row 3 (the warning in the log, the banner in the run's summary), and its
output artifact must pass the case-1 checks. Its break-it (E3.2 B3) deletes the `env:` line: the harness stays green,
that call goes red at `mode` with `signing is required` (row 4), and the existing `trial-call` (default input, not
forced) stays green. E3.1's code is written so that this call passes; E3.1 does not write the `ci.yml` job.

## S1.5 — The banner: what is written to `$GITHUB_STEP_SUMMARY`

Appended, exactly these lines (Markdown; `<X>` are the env values; an empty value prints empty):

```markdown
## UNSIGNED RELEASE

`<ARTIFACT>` is packed **unsigned**: none of the six signing variables is set in environment `<ENVIRONMENT>` and `allow-unsigned-release` is `true` (required=<REQUIRED>, caller ref `<GITHUB_REF>`).

This exception is for the period before a signing provider exists. At activation the caller removes the `allow-unsigned-release` input; from then on a release without signing is red.
```

Four lines of text with a blank line between them, and a trailing newline, so two legs of one job (two artifacts) give
two readable banners. The heading is the harness's anchor (`## UNSIGNED RELEASE`). No other step writes to the
summary. The trial row (row 5) writes nothing to it.

**How the harness provides it.** `Invoke-WorkflowStep` in `test/selftest.ps1` creates a fresh empty file
`gh-summary-<guid>.txt` in the scratch folder per step, sets `GITHUB_STEP_SUMMARY` to its path in the child's
environment (the `^GITHUB_` clean rule already removes the runner's own), and returns its content as `SummaryText`.
`Test-StepRun` gains two optional step keys: `Summary = @('fragment', …)` — each fragment must occur in `SummaryText`
(ordinal), problem text `summary lacks '<fragment>'`; `NoSummary = $true` — `SummaryText.Trim()` must be empty, problem
text `summary was written but none expected: <text>`. A case that names neither is not checked, so the 44 existing cases
are unchanged. `ALLOW_UNSIGNED_RELEASE` is added to `$cleanEnvNames` and is **not** in `$base` (unset by default).

## S1.6 — Harness cases E3.1 owns (`test/selftest.ps1`, step `mode`)

Defaults as E1 §S1.7: tree `in/pkg/` with `app.exe` and `vendor.exe`; the six variables empty; `REQUIRED=false`;
`GITHUB_REF=refs/heads/main`; `ENVIRONMENT=release-signing`; `ARTIFACT=cli-win-x64`; `ALLOW_UNSIGNED_RELEASE` unset.
`AUR` below = `ALLOW_UNSIGNED_RELEASE`. Every case is one `mode` run.

| Case | Environment | Exit | Output contains | Outputs | Summary |
|---|---|---|---|---|---|
| 10 | `GITHUB_REF=refs/tags/x`, `AUR=true` | 0 | `::warning::sign-windows: UNSIGNED RELEASE`, `environment 'release-signing'`, `caller ref refs/tags/x`, `cli-win-x64 is packed unsigned` | `mode=skip` | contains `UNSIGNED RELEASE` |
| 11 | `GITHUB_REF=refs/tags/x`, `AUR=false` | 1 | `signing is required`, `refs/tags/x`, `SIGNING_PUBLISHER is set in environment 'release-signing'` | none | empty |
| 12 | `AZURE_CLIENT_ID=x`, `AUR=true` | 1 | `partial signing configuration`, `set AZURE_CLIENT_ID`, `missing AZURE_TENANT_ID` | none | empty |
| 13 | all six `=x`, `GITHUB_REF=refs/tags/x`, `AUR=true` | 0 | `mode: sign` | `mode=sign` | empty |
| E3.A1 | five of six `=x` (not `SIGNING_PUBLISHER`), `GITHUB_REF=refs/tags/x`, `AUR=true` | 1 | `partial signing configuration`, `missing SIGNING_PUBLISHER` | none | empty |
| E3.A2 | `REQUIRED=true`, `AUR=true` (branch ref) | 0 | `UNSIGNED RELEASE`, `required=true`, `caller ref refs/heads/main` | `mode=skip` | contains `UNSIGNED RELEASE` |
| E3.A3 | as 10 | 0 | `UNSIGNED RELEASE` | `mode=skip` | contains `## UNSIGNED RELEASE`, `` `cli-win-x64` is packed **unsigned** ``, `` environment `release-signing` ``, `` caller ref `refs/tags/x` ``, `the caller removes the `allow-unsigned-release` input` |
| E3.A4 | `GITHUB_REF=refs/tags/x`, `AUR=1` | 1 | `signing is required` | none | empty |
| E3.A5 | `AUR=true` (branch ref, not required) | 0 | `UNSIGNED trial` | `mode=skip` | empty |

`Summary` and `NoSummary` are set on every one of the nine (the "empty" column is `NoSummary = $true`). Case 11 with
`AUR` unset is case 9 already; case 13 with a branch ref is S1.A5 already. The real forced call (R2) is E3.2's.

**RED first.** Commit the harness changes (§S1.5) and the nine cases before touching the workflow. Against `v1.0.0`'s
`mode`: **10, E3.A2 and E3.A3 are red** (exit 1 where 0 was expected, `signing is required` in the output, no output
written); **11, 12, 13, E3.A1, E3.A4 and E3.A5 are green already** — they are the `v1.0.0` rows and prove, when the
code lands, that nothing else moved. Record both sets. Then the §S1.3 code turns the three green; 44 + 9 = 53 pass.

## S1.7 — Break-its (mutate, watch the named case fail, restore; the outputs go in the PR)

| # | Mutation | Red case | Symptom | Who |
|---|---|---|---|---|
| B1 | `mode`: test `AUR` before the partial row (the permission skips a half configuration) | 12, E3.A1 | exit 0 and `UNSIGNED RELEASE` where exit 1 and `partial signing configuration` were expected | E3.2 (parent §6) |
| B2 | `mode`: row 3 without the banner append | 10, E3.A3 | `summary lacks 'UNSIGNED RELEASE'` | E3.2 (parent §6) |
| B3 | delete the `env:` line of §S1.2 | none in the harness (53 pass — record it); `trial-call-forced` red at `mode` | the real call prints `signing is required`; `trial-call` stays green | E3.2 (consultation 96bf9488) |
| B4 | `mode`: compare `AUR` with `-n` instead of `= true` | E3.A4 | exit 0, `UNSIGNED RELEASE` for the value `1` | optional, not quoted |
| B5 | `mode`: write the banner in the trial row too | E3.A5 | `summary was written but none expected` | optional, not quoted |

B1–B3 are quoted in the PR; B4 and B5 may be run and are not required.

## S1.8 — Opus review checklist for the code

- The input block is the bytes of §S1.1; `default: false`; `required: false`; placed after `environment`.
- The `env:` of `mode` is exactly the list of §S1.2; no `${{` in any `run:`; `run-step.mjs` still exits 0 on the file.
- The order of §S1.3 is the order in the code: partial → six → forced (permitted → red) → trial. The inner `if` lives
  inside `if [ "$forced" = yes ]` and nowhere else. Row 2 reads nothing of the input. The login, sign, verify, pack,
  check and upload steps are byte-for-byte `v1.0.0`'s.
- The comparison is `= true` (exact string), as for `REQUIRED`; not `-n`, not `-eq`, not a regex.
- Row 3 writes the banner first, then `mode=skip`, then the warning; row 3r is red before anything is written; the
  banner is appended with `>>`; the heading is `## UNSIGNED RELEASE`; the warning line starts
  `::warning::sign-windows: UNSIGNED RELEASE` and names the environment, the ref, `required`, and the artifact.
- Values of the six variables are never printed, in any row.
- The trial row's text is unchanged (`UNSIGNED trial`), and it writes nothing to the summary.
- `test/selftest.ps1`: `GITHUB_STEP_SUMMARY` is a fresh file per step; `Summary` / `NoSummary` are checked only when a
  case names them; `ALLOW_UNSIGNED_RELEASE` is in `$cleanEnvNames` and not in `$base`; the nine cases are the rows of
  §S1.6; the 44 existing cases are untouched (diff the table).
- The RED-first record names exactly {10, E3.A2, E3.A3} as red before the code.
- Nothing labels, renames or marks the zip or the checksum (D10: unsigned exactly as today).

## S1.9 — Decisions closed

1. **The input is read in the forced branch only.** It is not a fourth column that every row consults: a reader of the
   code sees the permission where it acts and nowhere else.
2. **Exact `true` permits; everything else is `false`.** G8 says a boolean input never arrives as another spelling; the
   exact comparison costs nothing and E3.A4 pins it.
3. **An unset `GITHUB_STEP_SUMMARY` is red (row 3r).** The parent says the banner goes through the summary; a leg that
   cannot write it would otherwise pack an unsigned release with a warning only. Fail-closed is the cheaper mistake.
4. **The banner is written before the output and the warning.** A failed append under `set -e` then leaves no
   `mode=skip` behind. On the harness the order is invisible; at review it is checked.
5. **The trial row keeps its text and writes no banner.** A trial is not a release; cases 8, S1.A6 and E3.A5 pin it.
6. **The permission trusts the environment NAME** (G11). A mistyped `environment` on a tag, with the permission on, is
   an unsigned release with the banner — the same road as the right name with zero variables. Accepted for the
   switch-on period: both callers use the default `release-signing`, every message names the environment, and A6
   removes the input in code at activation. No allow-list of environment names is added (it would be a second thing to
   keep in step with the callers, and the typo would still be possible on the caller's side).
7. **Case 13 carries a tag ref.** Forced, permitted and fully configured must sign; a branch ref with six variables is
   S1.A5 already.
8. **No second summary key for the trial, no release-note labelling, no asset mark.** The owner chose "unsigned exactly
   as today" (D10); the warning and the banner are the only marks.
9. **The harness proves the step; the forced real call proves the mapping** (G10). Both are needed; neither replaces the
   other. The forced call is E3.2's, in `ci.yml`, with the default-input call kept.

## S1.10 — Deviations found while building

(Filled by E3.1's coder and reviewer, as E1 §S1.11; empty until then.)
