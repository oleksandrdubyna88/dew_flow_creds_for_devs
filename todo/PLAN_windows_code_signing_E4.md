# PLAN — Windows code signing, E4: this repository adopts the shared workflow `v1.1.0` and merges with the switch on

> Status: **built and gated, 2026-11-04 — E4.1 and E4.2's code and docs are on this PR (#295): the pin to v1.1.0 = a9a7eccdf76306d8fdbc67fc917cf8d5a362d851, the switch, the dispatch input, T2/T7/T8, the reworded docs; M1 and M2 set and read back; the forced trials green. Left: the squash merge, M3, O9 and the record PR.** Stories of epic E4 of [PLAN_windows_code_signing.md](PLAN_windows_code_signing.md) (§3.2, §3.4, §4 *At the merge*, §6 E4, §8, §9 wiring, `## Epics` E4, the CUT rows of *Re-review for epoch 3*).
> Scope: `.github/workflows/release.yml` (`cli-sign`, `mcp-sign`, their comments, the header), `src_vs_code/src/test/releaseSigning.test.ts`, `CLAUDE.md`, `src_cli/README.md`, `src_mcp/README.md`, `research/architecture.md`, `research/module_tests.md`, `todo/README.md`; the owner's M1, M2, O9. Work on `ci/windows-code-signing-e4` (its own gate session, cut from the E2 head); before the trials it is
> fast-forwarded onto `ci/windows-code-signing-e2`, PR #295's branch, which the `release-signing` environment admits —
> so the trials run on `-e2` and PR #295 carries the work (continues E2). No product code, no contract change.

**Committed together with this document:** its row in `todo/README.md` under *Currently open*. E4 marks no
cornerstone; the parent's ledger stays `Cornerstones: 2 of 2 — E1.1, E3.1`.

## Who writes what (the review gate's operator orders)

| Part | E4.1 | E4.2 |
|---|---|---|
| Scenarios and brief | Opus — this document | Opus — this document |
| Code, tests, docs | Sonnet | Sonnet (the owner does M1, M2, O9; the agent reads them back) |
| Review | Opus | Opus |
| Review fixes | Sonnet | Sonnet |

Opus's review checks the parent's *watched at review* list: the switch reads `vars` and compares with `'true'`; the
pin is `v1.1.0`'s commit, not the tag; no doc claims a signature. The gate is the interim path of
`plan-change-control.md`: the parent to `review_document`, then `review_code` on the PR with the parent as `planText`,
`again: true`.

## Binding constraints (both stories)

- **The pin.** Both sign jobs: `uses: oleksandrdubyna88/dew_flow_release_signing/.github/workflows/sign-windows.yml@<40-hex> # v1.1.0`.
  The SHA is E3's squash commit, the one tag `v1.1.0` points at. It is **not known yet**: read it when E3 merges with
  `git ls-remote https://github.com/oleksandrdubyna88/dew_flow_release_signing refs/tags/v1.1.0` (the `^{}` line; the
  tag is annotated) and check that it is on that repository's `main`. Write it here and in the test. Never the tag name.
- **The switch line, exactly:** `allow-unsigned-release: ${{ vars.ALLOW_UNSIGNED_RELEASES == 'true' }}` in the `with:` of
  both jobs, with **no trailing comment** (the test helper `jobBlock` keeps a trailing `# …` in the value; the parent's
  §3.2 snippet has one, see gap 1). The comment goes on its own line above.
- **Nothing else in `with:`.** `extra-files` and `environment` keep their defaults (E3 amendment 8: the permission trusts
  the environment NAME, so no caller passes one). No new job, no `- rid:` line, no permission change: T4 stays as built.
- **Fix forward.** The CUT rows (docs 27ca896, fd3f144, e62e758, 6c6c67e, b673460; the claim comments of 390c1d3 /
  da3e253; b2b09b1 `fix(cli)`, 6ad54e1 `fix(mcp)`) are changed by NEW commits. No revert, no history rewrite, no
  force-push (blocked). `src_mcp/README.md` stays (D9).
- **The wording rule.** Until activation nothing says in the present tense that a release is signed or that Smart App
  Control accepts it, and nothing says without a condition that an unsigned tag is red, mandatory, impossible or a
  draft. A sentence about enforcement names its condition: "if the repository variable `ALLOW_UNSIGNED_RELEASES` is
  missing or not exactly `true`, …".
- `ALLOW_UNSIGNED_RELEASES` is a **repository** variable (F12). The `release-signing` environment holds **zero** of the
  six variables (M2): one stray variable makes every release red.

## E4.1 — the pin bump, the switch line, the comments, T2 extended, T7 (RED first)

**Edits to `release.yml`.**

1. `cli-sign` and `mcp-sign`: the pin above; the switch line after `required:`, with one comment line above it:
   `# Until a signing provider is active (todo/PLAN_windows_code_signing.md §3.4): with ZERO signing variables a tag packs unsigned, with a warning and a banner.`
2. The header (`:9-10`): the Windows zips go through `sign-windows.yml` (jobs `cli-sign`, `mcp-sign`) before the
   release jobs run; until the owner activates a provider (§3.4, E5) the repository variable `ALLOW_UNSIGNED_RELEASES`
   lets a tag ship them unsigned, as before, with an `UNSIGNED RELEASE` banner.
3. The job comments (`:481-484`, `:711-714`): "are signed … so Smart App Control can accept the binary" → the shared
   workflow signs them once a provider is active and until then packs them unsigned; it uploads the final zip and its
   checksum as `cli-win-<arch>` / `mcp-win-<arch>`. The checksum comments (`:443-444`, `:683-684`): "after signing" →
   "after its sign or skip step". The `id-token` sentence stays.
4. The test file's own header comment (`releaseSigning.test.ts:7-8`, `:15-17`: "signed before a release publishes
   them", "makes it impossible to skip") → it pins the wiring through which signing runs once active (gap 2).

**Test changes (`releaseSigning.test.ts`).**

- **T2 extended**, per product: a constant `SIGN_WORKFLOW_SHA = '<40-hex>'`; `uses` equals exactly
  `` `${SIGN_WORKFLOW}@${SIGN_WORKFLOW_SHA} # v1.1.0` ``; the `with:` keys are exactly
  `['allow-unsigned-release', 'artifacts', 'own-files', 'required']` (today three); `allow-unsigned-release` equals
  exactly `${{ vars.ALLOW_UNSIGNED_RELEASES == 'true' }}`. The rest of T2 stays.
- **T7 (new) — no sign job passes `environment`.** T6 is reserved for A6 (E5). It finds the sign jobs by their job-level
  `uses` (starts with `SIGN_WORKFLOW@`), not by a name list, so a later third caller is covered; asserts the set is
  exactly `{cli-sign, mcp-sign}` (a parser that finds none cannot pass), and that none has `environment` in `with:` or
  a job-level `environment:`.
- T1, T3, T4, T5 unchanged.

**Scenarios.**

- Given today's branch (pin 609cc23, no switch), when the changed tests run, then T2 is red for both products (the
  pin, the key set, the missing switch) and T1, T3, T4, T5, T7 are green. Record the output; that is the RED.
- Given T7 green on today's file, when `environment: release-signing` is added to `cli-sign`'s `with:`, then T7 fails
  naming `cli-sign` (T2's key set fails too). Restore. This is T7's RED, by mutation (as T4 in E2).
- Given the edits, when `npm test` runs, then T1–T5 and T7 are green and `credsInstall.test.ts` stays green.
- **Break-it B1 (parent §6):** in `cli-sign` write `allow-unsigned-release: ${{ vars.ALLOW_UNSIGNED_RELEASES }}` (the
  variable's bare string, which GitHub never compares with `'true'`). T2 must fail naming `cli-sign` and the expected
  expression. Restore.
- **Break-it B2:** write `allow-unsigned-release: true` (a literal: no variable deletion could end it). T2 must fail. Restore.
- Given a `server-v*` tag, when the workflow runs, then the sign jobs are skipped with their build jobs (unchanged).

**Done when.** RED, the T7 mutation and B1/B2 outputs quoted in the PR; T1–T5 and T7 green; `npm run typecheck`,
`npm test`, the actionlint job of `ci-server.yml` green; Opus's review resolved. One commit
`ci(release): pin the shared signing workflow to v1.1.0 <short-sha> and pass allow-unsigned-release from the repository variable`
(with the test).

## E4.2 — the docs reworded, the checks, the trial, the merge, M3, O9

**Docs (new `docs(…)` commits; types do not reach `main`, the squash decides).** Each says the same, in its place: the
release pipeline is wired for signing (`cli-sign` / `mcp-sign` call the shared workflow); releases stay unsigned, as
before, until the owner activates a provider (parent §3.4, E5); the repository variable `ALLOW_UNSIGNED_RELEASES=true`
is what lets a tag ship unsigned meanwhile, with a warning and an `UNSIGNED RELEASE` banner, and must not be removed
outside the cutover (§8); once releases are signed, `Get-AuthenticodeSignature` checks one.

| File | Today (cut) | After |
|---|---|---|
| `CLAUDE.md:103-109` | "binaries are signed", SAC "checked on `win-x64`", "signing is mandatory … red … draft" | the paragraph above; owner steps: parent §4 |
| `src_cli/README.md:58-64` | heading "The Windows binary is signed"; signed from this release; SAC checked | heading `Windows code signing (not active yet)`; until then SAC can block `creds.exe` |
| `src_mcp/README.md:22-29`, `:41-42` | the same; "the Windows ones are signed by `mcp-sign`" | the same as cli; "pass through `mcp-sign`" |
| `research/architecture.md:369`, `:395-404` | "(Windows ones signed, below)"; "signed before they are published"; "mandatory … draft"; SAC checked | "(Windows ones through the signing workflow, below)"; wired, not active; the switch, M1/M2, A6 |
| `research/module_tests.md:263-271` | "pins what makes skipping the signature impossible" | "pins the wiring"; T2's pin and switch, T7, E4's RED and B1/B2 added; the E2 record kept |

**The docs grep (parent §6, extended).** The word list over whole files hits about 155 lines (`module_tests.md` alone
has 107 `RED` records), so it is run on the signing lines only:
`grep -n -i -E 'sign|smart app|SAC' <the five docs> | grep -i -w -E 'is signed|are signed|accepts?|mandatory|red|draft|impossible'`,
and the same over `release.yml` lines 1-15 and the comment blocks of `cli-sign` / `mcp-sign`. Empty, or each kept hit
is a conditional sentence (wording rule) listed in the PR with its reason.

**The owner's steps and their read-back (before the trial):**

- **M2** — `gh api repos/oleksandrdubyna88/dew_flow_creds_for_devs/environments/release-signing/variables` shows
  `total_count: 0`; its deployment rule (O7) admits `main`, `ci/windows-code-signing-e2`, `cli-v*`, `mcp-v*`.
- **M1** — `gh api repos/oleksandrdubyna88/dew_flow_creds_for_devs/actions/variables/ALLOW_UNSIGNED_RELEASES` shows
  `true`, at the REPOSITORY level. Set before the merge; the trial does not need it (a trial is not forced).

**Skip-mode dispatch trial (after the E4.1 push, both targets).** `gh workflow run release.yml --ref
ci/windows-code-signing-e2 -f target=cli`, then `-f target=mcp`. Given M2, then every sign leg is green with
`mode=skip` and the `::warning::` `UNSIGNED trial`, no `UNSIGNED RELEASE` banner (a trial is not a release, E3.A5),
and the artifacts `cli-win-x64`, `cli-win-arm64`, `mcp-win-x64`, `mcp-win-arm64` hold
`creds[-mcp]-0.0.0-win-<arch>.zip` and its `.sha256`; the release jobs are skipped (no tag). Run URLs and the warning
lines (`gh run view <id> --log`) go in the PR. This is the first call of `v1.1.0` from this repository; it does not
prove the switch, which only a tag forces (gap 3).

**The merge.**

1. coai `review_code` round(s) and Opus's review resolved; then mark #295 ready (it is a draft) and wait for CodeRabbit;
   resolve its findings.
2. Retitle #295: today's title claims a signature ("binaries are signed …, so Smart App Control can accept them"). New:
   `ci(release): the Windows cli and mcp packages go through the shared signing workflow, unsigned until a provider is activated`.
3. If `main` moved, merge `main` into the branch (no rebase, no force-push). Wait until the head SHA's checks exist and
   pass; never merge on "no failure found".
4. Squash merge with an explicit subject and a CLEAN body: `gh pr merge 295 --squash --subject "<title> (#295)"
   --body-file <file>`. The default body lists every branch commit, the two `fix(…)` lines included, and
   release-please reads a body. Before the merge, `grep -E '^(feat|fix|deps|chore|docs|ci|test|refactor|perf|build|revert)(\(|!|:)|BREAKING|Release-As' <file>`
   is empty. The body: two or three plain sentences and the parent path.

**M3, after the merge.** List the open release PRs before the merge (`gh pr list --search "release in:title"`). Here
`release-please.yml` runs on `workflow_dispatch` ONLY (its `push: main` trigger is commented out), so nothing runs by
itself: read the merged message (`git show -s --format=%B <squash-sha>` — no conventional-commit line in the body), then
dispatch `release-please.yml` on `main` once and record the run and the SHA it saw. After it ends: no release
attributable to the squash — no `cli` or `mcp` release PR gains it, and none open before gains it in its changelog
(a release PR for unrelated, earlier commits is not M3's concern). Before the merge, also check #295's description: no `BEGIN_COMMIT_OVERRIDE` block, and no `release-as` or
`BREAKING` footer in the description or the squash body (case-insensitive — the parser reads lowercase `release-as`).
If a release attributable to the squash appears anyway, closing that PR is not enough (the input stays for later runs):
edit #295's description with a `BEGIN_COMMIT_OVERRIDE` … `END_COMMIT_OVERRIDE` block holding only the `ci(release): …`
line, dispatch `release-please.yml` again, and show the next proposal is clean (risk consultation 3e1a6d8b). The squash also touches `src_vs_code/` (the test), so the same holds for
`extension` (gap 4). If one appears anyway, close it unmerged with a comment naming M3.

**O9.** The owner removes `ci/windows-code-signing-e2` from the environment's deployment rule; the agent reads the
rule back (`…/environments/release-signing/deployment-branch-policies`): `main`, `cli-v*`, `mcp-v*` only.

**`todo/README.md` rows** (in the last commit before the squash): the parent row (no "A tag without signing is red";
E4 merging with the switch on), the E2 row (merged through E4's squash), this row. The M3 and O9 results land after the
merge, in the next plan commit (gap 5).

**The forced trial (parent ledger 3.1, E4 plan gate findings 0–1).** `release.yml`'s `workflow_dispatch` gains a
boolean input `required` (default `false`, description: "force the signing decision as on a release tag"), and both
sign jobs pass `required: ${{ startsWith(github.ref, 'refs/tags/') || inputs.required }}` (on a push `inputs.required`
is empty, so a tag decides as before). T2 pins that exact expression. Before the merge, with M1 and M2 in place, a
dispatch with `target: cli` and `required: true`, and one with `target: mcp` and `required: true`, run on the PR branch:
each Windows leg must be GREEN in `skip` with the `UNSIGNED RELEASE` warning — exactly the tag path a release will take.
A break-it run with M1 absent is not needed: the shared workflow's own tests cover that row; the forced trial proves the
caller's wiring. The release jobs still run only on a tag, so nothing is published.

**After the merge (a follow-up PR, gap 5 closed).** `main` takes changes only through PRs, so M3's and O9's read-backs,
the first real `cli-v*`/`mcp-v*` tag run under the switch (green, the `UNSIGNED RELEASE` warning on its Windows legs), and
the parent's §9 E4 tick land in one small `docs(plan): record E4 …` PR right after the merge.

**Done when.** The docs of the table reworded and the grep clean (kept hits listed); M1, M2 read back; the two trials
and the two forced trials quoted; CodeRabbit, coai and Opus resolved; #295 squash-merged with a `ci(release)` subject and a clean body; M3 and O9
done and read back; plan-lifecycle.mjs and pin-check.mjs green; the parent's §9 E4 line ticked once the coai twin
merged too.

## The coai twin, in parallel

`dew_flow_connect_other_ais` makes the same caller change on its own branch `ci/windows-code-signing` (PR #944), under its
own plan `dew_flow_connect_other_ais · todo/PLAN_windows_code_signing.md` (§4 merge steps): `mcp-sign` pinned to the same
`v1.1.0` SHA with the same switch line; `windowsPackageIsSigned.test.ts` extended with the exact expression and the
bare-string break-it (the no-`environment` check of E3 amendment 8 applies to it too); its CUT claim text
(`research/architecture.md` a38e9b38 / 3bf899ea, the release.yml comment that a tag without signing fails) reworded by
new commits; its own M1 (the repository variable in coai), M2 (`release-signing` empty; rule `main`,
`ci/windows-code-signing`, `mcp-v*`), a skip-mode `mcp` dispatch trial, the squash merge with a `ci(release)` subject
and a clean body, M3 (no `mcp` release PR) and O9. Neither PR waits for the other; both wait for E3. The parent's E4
is done when both are merged.

## Order

E3 merged and tagged → the SHA written here → E4.1 RED → E4.1 edits, T7 mutation, B1/B2 → E4.2 docs → grep → M2 and M1
set and read back (both BEFORE any trial: the forced trial needs M1) → push → the two trials and the two forced trials → coai `review_code`, Opus → ready, CodeRabbit → retitle → `main` merged in if
needed, checks green on the head SHA → squash, clean body → M3 → O9 → records. E5 later.

## Gaps found in the parent (recorded, not fixed here)

1. §3.2's snippet puts `# E4, §3.4` after the switch expression on the same line; the test reads that comment into the
   value, so the exact check of §6 cannot pass with it. Here the comment moves above the line.
2. The judge's reword list does not name the header comment of `releaseSigning.test.ts` ("impossible to skip"); E4.1
   rewords it. §6 also does not say that T2 already pins the `with:` key set to three, which E4 must change to four.
3. Nothing before the merge proves the switch in this repository: a dispatch is never forced and a tag needs the merge.
   The §6 "after the E4 merge" observation (the first `cli`/`mcp` tag in skip mode with the banner, F12) is in no
   done-when, neither E4's nor E5's. If the expression were wrong, the first tag is red (§8 recovers it).
4. M3 names only `cli` and `mcp`; the squash also touches `src_vs_code/`, so `extension` must be checked too.
5. §4 and the E4 scope put M3 and O9 after the merge but name no commit that records them, nor the §9 tick; `main` is
   PR-only, so they need a later plan commit (E5's stories document or a `docs(plan)` PR).
6. §4 M1 says "before the merge"; §5 lists M1, M2 among E4's own steps, and E4 *Depends on* lists them as preconditions.
   Here: M2 before the trial, M1 before the squash.
7. PR #295's current title claims a signature; the parent names only the `ci(release)` type, not a retitle.
