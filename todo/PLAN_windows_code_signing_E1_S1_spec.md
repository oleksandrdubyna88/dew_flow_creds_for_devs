# PLAN — E1.1 spec: the workflow's contract (CORNERSTONE)

> Status: **built and merged, 2026-11-03 — cornerstone spec by Fable, written before its code; implemented in `dew_flow_release_signing` #1 (deviations in §S1.11).**
> Story E1.1 of [PLAN_windows_code_signing_E1.md](PLAN_windows_code_signing_E1.md) (parent
> [PLAN_windows_code_signing.md](PLAN_windows_code_signing.md) §3.1 steps 1–3, §6, `## Epics` E1). Its own file because
> the stories document goes whole to the review gate and must stay short; it is promoted with E1's.
>
> Scope: `.github/workflows/sign-windows.yml` in `oleksandrdubyna88/dew_flow_release_signing` (clone:
> `dew_flow_release_signing`, today only `LICENSE` and `README.md`) — the `workflow_call` inputs, the job
> header, and the steps `inputs`, `pkg`, `mode`, `inventory`. The login, signing, Verify, Pack and Upload steps are E1.2;
> here only the outputs they read (§S1.6). The harness and the fixtures are E1.3; here only the cases E1.1 owns (§S1.7).

## S1.0 — Facts this spec rests on

Parent §2: F3 (x64 runner signs both architectures), F8 (`environment:` and the OIDC subject are the caller's), F10
(upload keeps the package directory only when its parent is uploaded). Added here, from the GitHub docs (*Reusing
workflows*, *Workflow syntax*, *Using environments*); G1 and G2 are to be confirmed at E1.3's first CI run:

| # | Fact | Consequence |
|---|---|---|
| G1 | `matrix: { artifact: ${{ fromJSON(inputs.artifacts) }} }` is evaluated before any step. Malformed JSON, a JSON scalar, or an empty list is red at that point: `Error when evaluating 'strategy' for job 'sign'` / `Matrix vector 'artifact' does not contain any values`. | No step can report these two cases in the real workflow; the `inputs` step still checks them, so the harness proves the rule and the message. |
| G2 | A job that names an environment the caller's repository does not have gets it **created**, empty, with no rules and no variables. | A typo in `environment` is not an error: a trial takes `skip`, a tag is red naming the six variables. So every message of the `mode` step names the environment. |
| G3 | A boolean input placed in `env:` arrives as the string `true` or `false`. An unset `vars.X` arrives as the empty string. | The `mode` step compares `"$REQUIRED" = true` and tests emptiness, nothing else. |
| G4 | In a called workflow the default variable `GITHUB_REF` is the caller's ref (the `github` context is the caller's). | The tag rule reads `GITHUB_REF`; the harness sets it per case. |
| G5 | On `windows-2025`, `shell: bash` is Git Bash run as `bash --noprofile --norc -eo pipefail {0}`; `shell: pwsh` is PowerShell 7. `$GITHUB_OUTPUT` takes a multiline value as `name<<EOF` … `EOF`. | Every `run:` text begins with its own strictness line (`set -euo pipefail` / `$ErrorActionPreference = 'Stop'`) so the harness runs it under the same rules. |
| G6 | PowerShell `-like`, `-eq`, `-in` on strings are case-insensitive; `[regex]::IsMatch` is not. | Globs and path comparisons are case-insensitive, as NTFS is; the name regexes are exact. |

## S1.1 — The file and the job header

`.github/workflows/sign-windows.yml`, `name: sign windows`, no `concurrency`, no `defaults`. The caller's own
`github` context is the one every expression sees. The inputs block, verbatim:

```yaml
on:
  workflow_call:
    inputs:
      artifacts:
        description: 'JSON list of output artifact names, e.g. ["cli-win-x64","cli-win-arm64"]. For each NAME the caller uploaded unsigned-NAME holding exactly one top-level directory. Non-empty; each name matches ^[A-Za-z0-9._-]+$.'
        type: string
        required: true
      own-files:
        description: 'JSON list of package-relative paths of the caller''s OWN binaries, e.g. ["creds.exe"]. Non-empty; "/" separators; no globs; no "." or ".." segments. Each must exist once and arrive unsigned.'
        type: string
        required: true
      extra-files:
        description: 'JSON list of file-NAME globs (PowerShell -like: * ? []) of other files that may be signed when they arrive unsigned, e.g. ["e_sqlite3.dll","*tree-sitter*.dll"]. No path separators. An unsigned PE that is neither an own file nor matched here is red.'
        type: string
        required: false
        default: '[]'
      required:
        description: 'true: missing configuration or any failure is red. Independently, a caller ref under refs/tags/ is treated as required.'
        type: boolean
        required: true
      environment:
        description: 'The caller''s environment that holds AZURE_CLIENT_ID, AZURE_TENANT_ID, SIGNING_ENDPOINT, SIGNING_ACCOUNT, SIGNING_PROFILE, SIGNING_PUBLISHER and the OIDC trust.'
        type: string
        required: false
        default: release-signing
```

The job, verbatim (E1.2 appends its steps after `inventory`; nothing else changes):

```yaml
jobs:
  sign:
    name: sign ${{ matrix.artifact }}
    runs-on: windows-2025
    timeout-minutes: 20
    environment: ${{ inputs.environment }}
    permissions:
      contents: read
      id-token: write
    strategy:
      fail-fast: false
      matrix:
        artifact: ${{ fromJSON(inputs.artifacts) }}
```

Rule for every step of this file: **no `${{ }}` inside `run:`**. Every input, variable, matrix value and step output
reaches a script through the step's `env:`; the harness refuses a `run:` that contains `${{` (§S1.7). Red means
`::error::` line(s) on stdout, then `exit 1`.

## S1.2 — Step `inputs` (pwsh): the three JSON lists are checked before anything is downloaded

`id: inputs`, `shell: pwsh`. `env:` `ARTIFACTS: ${{ inputs.artifacts }}`, `OWN_FILES: ${{ inputs.own-files }}`,
`EXTRA_FILES: ${{ inputs.extra-files }}`, `ARTIFACT: ${{ matrix.artifact }}`. No outputs; the `inventory` step parses
the same `env:` values again (one parse rule, written once as a function in each script — copying is cheaper than a
checkout the caller did not pin, parent §3.1 step 2).

Parsing: `ConvertFrom-Json -NoEnumerate` inside `try`; a parse error, or a value that is not an array, is one finding
`<input> is not a JSON list`. Rules, each a finding when broken (all findings are printed, then one exit):

| Input | Rule | Finding text (after `::error::sign-windows inputs: `) |
|---|---|---|
| `artifacts` | non-empty | `artifacts is empty` |
| | each element a string matching `^[A-Za-z0-9._-]+$` | `artifact name '<x>' is not ^[A-Za-z0-9._-]+$` |
| | no duplicates (case-insensitive); `ARTIFACT` is in the list | `artifacts has a duplicate '<x>'`; `artifact '<ARTIFACT>' is not in artifacts` |
| `own-files` | non-empty | `own-files is empty` |
| | each a string; split on `/`; a `\` anywhere is red; each segment matches `^[A-Za-z0-9._-]+$` and is neither `.` nor `..` | `own-files entry '<x>' is not a plain relative path (segments of [A-Za-z0-9._-], no . or .., no globs, "/" separators)` |
| | no duplicates (case-insensitive) | `own-files has a duplicate '<x>'` |
| `extra-files` | a list (may be empty); each a non-empty string with no `/` or `\`, matching `^[A-Za-z0-9._*?\[\]-]+$` | `extra-files entry '<x>' is not a file-name glob` |

Exit 1 with a last line `::error::sign-windows inputs: <n> problem(s)`; exit 0 prints
`inputs ok: <a> artifacts, <o> own files, <e> extra-file globs`. The regex for own-file segments excludes `*`, `?` and
`[`, which is what "no globs" means in code.

## S1.3 — Step `download` and step `pkg`: one directory, nothing else

`download`: `actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2` (the pin
`release.yml:226` uses), `with: { name: unsigned-${{ matrix.artifact }}, path: in }`. A missing artifact is red by the
action's own message (`Artifact not found`); nothing to add.

`pkg`: `id: pkg`, `shell: pwsh`, `env:` `IN_DIR: in` (relative to the working directory; the harness sets the working
directory to the fixture tree). `Get-ChildItem -LiteralPath $env:IN_DIR -Force` must list exactly one entry and it must
be a directory. Otherwise red, one line: `::error::sign-windows: in/ must hold exactly one directory and nothing else;
found: <name (dir)|name (file)>, …` (an absent or empty `in/` gives `found: nothing`). Outputs `name` = the directory's
name (e.g. `creds-0.4.6-win-x64`), `dir` = its absolute path (`Resolve-Path`, Windows form). Prints `package: <dir>`.

## S1.4 — Step `mode` (bash): sign, skip or red, decided from `env:` alone

`id: mode`, `shell: bash`. `env:` the six `${{ vars.X }}` under their own names, `REQUIRED: ${{ inputs.required }}`,
`ENVIRONMENT: ${{ inputs.environment }}`, `ARTIFACT: ${{ matrix.artifact }}`; `GITHUB_REF` is the default variable (G4).
First line `set -euo pipefail`. A variable is *set* when its value is non-empty (no trimming — a lone space is a
mistake a later login reports). *Forced* = `REQUIRED` is `true` **or** `GITHUB_REF` starts with `refs/tags/`.

| Set of six | Forced | Result | Output / line |
|---|---|---|---|
| 6 | any | sign | `mode=sign`; prints `mode: sign (required=<REQUIRED>, ref=<GITHUB_REF>, environment=<ENVIRONMENT>)` |
| 0 | no | skip | `mode=skip`; `::warning::sign-windows: UNSIGNED trial — none of the six signing variables is set in environment '<ENVIRONMENT>'; <ARTIFACT> is packed unsigned` |
| 0 | yes | red | `::error::sign-windows: signing is required (required=<REQUIRED>, caller ref <GITHUB_REF>) but none of AZURE_CLIENT_ID, AZURE_TENANT_ID, SIGNING_ENDPOINT, SIGNING_ACCOUNT, SIGNING_PROFILE, SIGNING_PUBLISHER is set in environment '<ENVIRONMENT>'` |
| 1–5 | any | red | `::error::sign-windows: partial signing configuration in environment '<ENVIRONMENT>': set <names>; missing <names>` — names only, never values |

Outputs: `mode` (`sign` or `skip`), written only on exit 0. The partial row is checked before the forced row, so a
half configuration is never reported as "none set".

## S1.5 — Step `inventory` (pwsh): own files and vendor files, before any login, in every mode

`id: inventory`, `shell: pwsh`. `env:` `PKG_DIR: ${{ steps.pkg.outputs.dir }}`, `PKG_NAME: ${{ steps.pkg.outputs.name }}`,
`OWN_FILES`, `EXTRA_FILES` (as in `inputs`). No `MODE`: the step does the same work in both modes, which is what lets
the harness run it without a mode. First line `$ErrorActionPreference = 'Stop'`. Steps:

1. Parse `OWN_FILES` and `EXTRA_FILES` with the §S1.2 rules; an empty `OWN_FILES` is red here too
   (`own-files is empty`), so the step is safe when run alone.
2. `$pe = Get-ChildItem -LiteralPath $env:PKG_DIR -Recurse -File | Where-Object { $_.Extension -in '.exe', '.dll' }`
   (case-insensitive, G6). Each file's *rel* = its path below `PKG_DIR` with `/` separators.
3. Own files, in list order: `$p = Join-Path $env:PKG_DIR ($own -replace '/', '\')`. Not a file
   (`Test-Path -LiteralPath $p -PathType Leaf` false) → finding `own file '<own>' not found under <PKG_NAME>`. Else
   `Get-AuthenticodeSignature -LiteralPath $p`: status `NotSigned` → to sign; any other status → finding
   `own file '<own>' is <Status>, signer '<SimpleName>' — a vendor file named as the product's binary?` (`SimpleName` =
   `SignerCertificate.GetNameInfo(SimpleName, $false)`, or `-` when there is no certificate; the same reading E1.2's
   Verify compares with `SIGNING_PUBLISHER`). Own files are checked whatever their extension.
4. Every file of `$pe` whose *rel* is not an own path (case-insensitive) is a vendor candidate, in ordinal order of
   *rel*: `Valid` → kept, line `kept vendor file <rel>: Valid, signer '<SimpleName>', <SignatureType>`; `NotSigned` and
   the file NAME `-like` any `extra-files` glob → to sign, line `extra file <rel>: NotSigned, matched '<glob>'`;
   `NotSigned` and unmatched → finding `unsigned file '<rel>' is neither an own file nor matched by extra-files <EXTRA_FILES>`;
   any other status (`HashMismatch`, `NotTrusted`, `NotSupportedFileFormat`, `UnknownError`, `Incompatible`) → finding
   `file '<rel>' has signature status <Status>`.
5. Any finding → each as `::error::sign-windows inventory: <finding>`, then
   `::error::sign-windows inventory: <n> problem(s) in <PKG_NAME>`, `exit 1`. Nothing is written to `$GITHUB_OUTPUT`.
6. Else outputs: `files` — the absolute paths to sign, own files first in list order, then extras in step 4's order,
   one per line, heredoc delimiter `__SIGN_WINDOWS_EOF__`; `count` — their number; `kept-files` — the kept vendor
   files' absolute paths, same form (may be empty); `kept-count`. Last line `to sign: <count>, kept: <kept-count>`.

`count` is never 0 on exit 0, because `own-files` is non-empty and every own file either is to sign or is a finding.
Empty `own-files` is red at `inputs` (§S1.2) and again here. A catalog-signed Windows file (no embedded signature) shows
`Valid` on a runner holding its catalog and `NotSigned` elsewhere; both roads end in the table above, so the rule needs
no case for it — but the E1.3 fixture that must be `Valid` has to carry an **embedded** signature (`SignatureType`
`Authenticode`), and the self-test asserts that before it uses the file.

## S1.6 — The interface E1.2 reads (frozen by this story)

| Step | Output | Form | Read by (E1.2) |
|---|---|---|---|
| `pkg` | `name` | the package directory's name | Pack (zip name, `check/` compare) |
| `pkg` | `dir` | absolute path of `in/<name>` | signing `files`, Verify, Pack |
| `mode` | `mode` | `sign` or `skip` | `if:` of login, signing, Verify |
| `inventory` | `files`, `count` | newline list of absolute paths; integer ≥ 1 | signing `files`, Verify |
| `inventory` | `kept-files`, `kept-count` | newline list (may be empty); integer ≥ 0 | Verify (kept vendor files still `Valid`) |

The step ids `inputs`, `pkg`, `mode`, `inventory` and these output names are part of the contract; E1.3's harness
addresses steps by id.

## S1.7 — Harness cases E1.1 owns (run by E1.3's `test/selftest.ps1` through `test/run-step.mjs`)

What E1.1 needs from the harness: `node test/run-step.mjs .github/workflows/sign-windows.yml <id>` prints the step's
`shell` and `run` text (YAML-parsed, exit 2 when the id is absent or the text contains `${{`); `selftest.ps1` writes the
text to a file, sets the case's environment, points `GITHUB_OUTPUT` at a temp file, sets the working directory to the
case's fixture tree, runs `bash -eo pipefail <file>` or `pwsh -NoProfile -File <file>`, and asserts the exit code, a
fragment of the combined output, and the outputs named. Fixtures (E1.3): `app.exe` (unsigned apphost), `vendor.exe`
(embedded-signed Microsoft file), `vendor-flipped.exe` (`vendor.exe` with one byte of its code changed), `extra.dll`
(a copy of `app.exe`). Unless stated, the tree is `in/pkg/` with `app.exe` and `vendor.exe`, `OWN_FILES='["app.exe"]'`,
`EXTRA_FILES='[]'`, `PKG_DIR` = the absolute `in/pkg`, `PKG_NAME=pkg`, the six variables empty, `REQUIRED=false`,
`GITHUB_REF=refs/heads/main`, `ENVIRONMENT=release-signing`, `ARTIFACT=cli-win-x64`.

| Case | Step | Environment / tree | Exit | Output contains | Outputs |
|---|---|---|---|---|---|
| 2 (parent) | `mode` | `REQUIRED=true` | 1 | `signing is required` | none |
| 3 (parent) | `mode` | `AZURE_CLIENT_ID=x` only | 1 | `partial signing configuration` … `missing AZURE_TENANT_ID` | none |
| 9 (parent) | `mode` | `GITHUB_REF=refs/tags/x` | 1 | `signing is required` … `refs/tags/x` | none |
| 4 (parent) | `inventory` | tree without `app.exe` | 1 | `own file 'app.exe' not found` | none |
| 5 (parent) | `inventory` | `app.exe` is a copy of `vendor.exe` | 1 | `own file 'app.exe' is Valid` | none |
| 6 (parent) | `inventory` | tree plus `vendor-flipped.exe` | 1 | `vendor-flipped.exe` with `HashMismatch` (or `neither an own file` if the fixture turns out catalog-signed) | none |
| 7 (parent) | `inventory` | tree plus `extra.dll` | 1 | `unsigned file 'extra.dll' is neither an own file` | none |
| 8 (parent) | `inventory` | tree plus `extra.dll`, `EXTRA_FILES='["extra.dll"]'` | 0 | `extra file extra.dll: NotSigned, matched 'extra.dll'` | `count=2`, `files` = `app.exe` then `extra.dll` paths, `kept-count=1` |
| S1.A1 | `inputs` | `OWN_FILES='["creds.exe"'` | 1 | `own-files is not a JSON list` | — |
| S1.A2 | `inputs` | `ARTIFACTS='["cli win"]'`, `OWN_FILES='["../x.exe"]'` | 1 | `artifact name 'cli win'` and `own-files entry '../x.exe'` (both, one run) | — |
| S1.A3 | `inputs` | `OWN_FILES='[]'` | 1 | `own-files is empty` | — |
| S1.A4 | `pkg` | `in/` holds `pkg/` and `other/`; second run: `pkg/` and a file | 1 | `exactly one directory` … `found: ` | none |
| S1.A5 | `mode` | all six `=x` | 0 | `mode: sign` | `mode=sign` |
| S1.A6 | `mode` | defaults | 0 | `UNSIGNED trial` | `mode=skip` |
| S1.A7 | `inventory` | defaults | 0 | `kept vendor file vendor.exe: Valid` | `count=1`, `kept-count=1` |
| S1.A8 | `inventory` | tree plus `extra.dll`, `EXTRA_FILES='["*.DLL"]'` | 0 | `matched '*.DLL'` | `count=2` |

Cases 2–9 are the parent's (§6); S1.A1–S1.A8 are this story's additions, which test rules the parent states without a case.
Case 1 (the real call) is E1.3's. **RED first:** with no `sign-windows.yml`, every case is red at `run-step.mjs` (exit 2,
no file). With the file and stub steps whose `run:` is `exit 0`, cases 2–7, 9, S1.A1–S1.A4 are red on the exit code (0 instead
of 1) and 8, S1.A5–S1.A8 are red on a missing output; that is the state to record before the real `run:` texts are written.

## S1.8 — Break-its (mutate, watch the named case fail, restore; both outputs in the PR)

| # | Mutation | Red case | Symptom |
|---|---|---|---|
| B1 | `mode`: drop the forced check, so none-set always takes `skip` | 2, 9 | exit 0 and `mode=skip` where exit 1 was expected |
| B2 | `mode`: drop the tag test, keep `REQUIRED` | 9 (2 stays green) | exit 0, `UNSIGNED trial` |
| B3 | `mode`: treat 1–5 set as none | 3 | `UNSIGNED trial` instead of `partial signing configuration` |
| B4 | `inventory`: accept a `Valid` own file | 5 | exit 0, `count=1` |
| B5 | `inventory`: match extra globs with `-eq` instead of `-like` | S1.A8 | `neither an own file` for `extra.dll` |
| B6 | `inventory`: treat every non-`NotSigned` status as kept | 6 | exit 0, `kept-count=2` |
| B7 | `pkg`: take the first directory without counting | S1.A4 | exit 0, `name=other` or `name=pkg` |
| B8 | put `${{ inputs.required }}` inside the `mode` run text | every `mode` case | `run-step.mjs` exit 2 naming the step |

## S1.9 — Opus review checklist for the code

- No `${{` in any `run:`; every value named in §S1.2–S1.5 is in that step's `env:`, and nothing more is.
- `permissions` is exactly `contents: read` + `id-token: write`; `timeout-minutes: 20`; `fail-fast: false`; the matrix
  key is `artifact`; `environment: ${{ inputs.environment }}`.
- Step ids and output names are those of §S1.6; `inputs` and `pkg` come before `mode`; `inventory` comes before any
  `azure/login`; no step before `inventory` reaches the network except `download`.
- `mode`: the partial row is decided before the forced row; the tag test is a prefix test on `GITHUB_REF`; values of the
  six variables are never echoed; every message names the environment.
- `inventory`: all findings are collected and printed before the one `exit 1`; the extension test is case-insensitive;
  the glob is applied to the file NAME only; own paths are joined under `PKG_DIR` and were validated against `..`; the
  heredoc delimiter is `__SIGN_WINDOWS_EOF__`; `SimpleName` is read the way E1.2's Verify reads it.
- The run texts start with `set -euo pipefail` / `$ErrorActionPreference = 'Stop'`, so the harness and GitHub run them
  under the same rules; a `::error::` line is always followed by `exit 1`, never by a thrown exception alone.
- The README names the five inputs with the words of §S1.1 (E1's done-when).

## S1.10 — Decisions closed

1. One job only, as the parent says; input checking is a first step `inputs` inside the matrix leg, not a second job.
   Malformed or empty `artifacts` is red by GitHub before any step (G1); the step repeats the check for the harness.
2. `own-files` entries are exact package-relative paths with `/` separators; "exactly once" means the path is a file
   and the list has no duplicate. Own files are not restricted to `.exe`/`.dll`.
3. `extra-files` globs are PowerShell `-like` patterns on the file name, case-insensitive, no path separators.
4. The mode step reads `GITHUB_REF` (a default variable), not `GITHUB_REF_TYPE`, matching the parent's wording.
5. The inventory takes no `mode`; it does the same work in `sign` and `skip`, so the harness runs it without one.
6. `inventory` outputs also `kept-files` / `kept-count`, because E1.2's Verify must re-check the kept vendor files.
7. The download action pin is the one `release.yml:226` carries (v8.0.2); the harness cases are the parent's 2–9 plus
   S1.A1–S1.A8; the fixture that must be `Valid` carries an embedded signature, asserted by the self-test.

## S1.11 — Deviations found while building (2026-11-03)

- **`ConvertFrom-Json -NoEnumerate` is not strict on the runner.** PowerShell 7 on `windows-2025` read `["creds.exe"`
  (no closing bracket) as a one-element list, so case S1.A1 failed (run 41628108252). Both `inputs` and `inventory`
  parse with `System.Text.Json.JsonDocument.Parse` instead (commit `fee63f3`); findings and messages are unchanged.
- G1–G6 held on the runner: `dotnet.exe` is embedded-signed (`Authenticode`, signer `.NET`), the flipped copy reads
  `HashMismatch`, Git Bash is `C:\Program Files\Git\bin\bash.exe`. The `download` step is exercised only by E1.3's real
  call, not by the step harness.
