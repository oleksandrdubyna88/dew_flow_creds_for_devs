# PLAN — two SSH tests inject the PATH they assert about, and JSON positions are asserted on fixtures

> Status: **IMPLEMENTED, 2026-09-11.** Scope as built: `sshProgram.ts`, `configFormat.ts`,
> `sshProgram.test.ts`, `sshCommand.test.ts`, `configValidation.test.ts`, `configFieldsOutcome.test.ts`,
> and the new `sshDefaultProbe.test.ts`, `jsonErrorLine.test.ts`, `sshPath.ts`, `engineJson.ts`;
> `research/module_tests.md`.
> Audit finding **#8** of [REVIEW_product_audit_2026-09-09.md](../todo/REVIEW_product_audit_2026-09-09.md),
> re-verified 2026-09-10 (§Перепроверка).
>
> Related docs: [module_tests.md](module_tests.md), [PLAN_ssh_agent.md](PLAN_ssh_agent.md) (T20).

## Symptom

- `sshProgram.test.ts:25-30` (*on Windows a forwarding connection gets the built-in client*) calls
  `openSshProgram('ssh', true, 'win32', present)` with no `probe`; `sshCommand.test.ts:97-103` (*on Windows
  a forwarding line names the client that can reach the agent*) sets `builtInExists` and no `pathProbe`
  (the field exists, `sshCommand.ts:45`, and no test anywhere supplies it). Both fall through to
  `defaultProbe()` (`sshProgram.ts:59-64`), which reads the **real** `PATH`. On a Windows machine whose
  first `ssh.exe` is the built-in — the common case — the product correctly answers `ssh` (T20) and the
  test fails. The audit saw exactly that: 2 failures on Windows, Node 24.
- CI passes them **by accident**: `.github/workflows/ci-extension.yml` runs on `ubuntu-latest`, and
  `defaultProbe` splits `PATH` on `;` (`:61`), so on Linux the whole colon-joined `PATH` is one bogus
  directory, `hasTool` never fires, and the forced path is always returned. The Windows logic has never
  been exercised by CI.
- `jsonErrorLine` (`configFormat.ts:166-178`) parses V8's `SyntaxError` text and says so: *measured on
  Node 24*. `configValidation.test.ts:46-53` and `configFieldsOutcome.test.ts:26-46` assert a line number
  from whatever engine runs the suite; under WSL/Node 20 the audit got 2 failures there and none of the
  SSH ones.
- There is no matrix: one job, Node 22, Ubuntu. "The suite does not pass" is a statement about local
  runs, and it is true of every Windows developer machine with OpenSSH first on `PATH`.

## What must be true when this is done

1. The two SSH tests state the `PATH` they are about, and pass on any machine.
2. The JSON-position tests assert the parser against both message shapes as fixtures, and the
   engine-driven assertion accepts only *the right line or no line*.
3. `defaultProbe` splits on the platform's delimiter, so it is not silently wrong off Windows.
4. `module_tests.md` names the runtime the unit suite is asserted on, and what is not.

## Design

1. Both tests inject `{ pathDirs: [], hasTool: () => false }` — "nothing on the PATH resolves to ssh;
   the forced path is needed" — and gain the converse: a probe whose first hit is the built-in directory →
   the bare word (already covered for `pathSshIsBuiltIn` at `sshProgram.test.ts:76-98`; add it through
   `openSshProgram` and `buildSshCommand`).
2. `defaultProbe` uses `path.delimiter`. Behaviour on Windows is unchanged (`;`); off Windows the probe is
   never consulted (`pathSshIsBuiltIn` returns early at `:87`), so this is hygiene with a test that the
   split is by delimiter.
3. `jsonErrorLine` gets a fixture test with the two shapes quoted in its own comment — one with
   `(line 4 column 1)`, one without a position — asserting `4` and `undefined`. The two engine-driven
   tests assert `line === undefined || line === <expected>`: a wrong number is the defect, an absent one
   is honest, and which of the two an engine gives is not this suite's contract.
4. `module_tests.md`: "unit suite asserted on Node 22 (CI); Windows-only branches are tested through
   injected probes, not through the runner's OS". **Not done, recorded:** a Windows job in
   `ci-extension.yml` — minutes per run to exercise one `if`, when the seam exists; the owner can add it
   later if the seam proves insufficient.

## Build order

1. RED on this machine: run `npm test -- --test-name-pattern "forwarding"` with the built-in first on
   `PATH` — the two failures the audit reported, reproduced here (report the assertion text).
2. Inject the probes; add the converse tests → GREEN here and in CI.
3. RED: `sshProgram.test.ts` — `'the default probe splits PATH on the platform delimiter'` (assert via an
   exported `pathDirsOf(pathValue, delimiter)` helper).
4. `path.delimiter` → GREEN.
5. Fixture tests for `jsonErrorLine`; relax the two engine-driven assertions.
6. `npm run typecheck`; full `npm test`.
7. `module_tests.md`.

## Test plan

| Test | Proves |
|---|---|
| forced path with an empty probe, both entry points | rule 1 |
| bare word with a built-in-first probe, both entry points | rule 1, converse |
| `pathDirsOf` with `;` and `:` | rule 3 |
| `jsonErrorLine` on both fixture shapes | rule 2 |
| engine-driven: right line or none | rule 2 |

## Definition of Done

- [x] The two SSH failures reproduced here, then green here and in CI.
- [x] `npm run typecheck`, `npm test` green.
- [x] `module_tests.md` updated with the runtime statement.
- [x] `coai` plan → `proceed`, code round run, findings resolved.
- [x] Promoted to `research/` with deviations recorded.


## What shipped differently

**The sharper half of this finding was not in the plan's symptom at first.** Two tests reading the
real `PATH` is a hygiene problem; two tests that have **never once exercised the branch they are
named for** is a shipped feature with no working test, and that is what the hard-coded `;` split
made true. CI is Linux, so the colon-joined `PATH` became one bogus entry, `hasTool` was never true,
and `pathSshIsBuiltIn` always answered false — green for a reason that had nothing to do with the
logic.

**The real probe is tested, which the plan did not propose.** Three reviewers asked for it
independently, and they were right: every other test injects a probe, so nothing covered the wiring
underneath — that omitting it reaches `defaultProbe`, which reads the environment and splits it the
way the platform does.

**And the first version of that test had no teeth**, which the code round caught. It asserted
`pathSshIsBuiltIn === false` on a Linux runner, and `false` is what a probe that ignored the
environment entirely would answer too. It now asks the probe what it SAW — the directories it
parsed, whether it found the file — and was watched failing (3 of 5) against a probe returning an
empty `pathDirs`.

**The delimiter follows the TARGET platform, not the host.** A reviewer's, and it closes this
change's own bug from the other side: `openSshProgram('ssh', true, 'win32', …)` from a Linux runner
would otherwise split a Windows `PATH` on `:` into one bogus entry.

**Three cases per entry point, not one.** The plan had "empty probe" and "built-in first". A reviewer
pointed out that neither covers **Git first** — the state this machine is actually in, and the one
T20 exists for — and that an implementation emitting the bare word whenever `PATH` held any `ssh`
would pass both planned cases and break it.

**The engine-driven JSON tests ask the engine rather than relaxing.** The plan proposed accepting
"the right line or none"; a reviewer observed that this would pass a regression that stopped
extracting lines entirely. They now ask whether this engine named a position at all, and stay strict
where it did.

**Two fixtures are shared rather than copied.** `sshPath.ts` and `engineJson.ts` — every vendor
flagged the duplication, and a second copy of a regex over an engine's error text is a thing to
update that nothing notices was missed.

## Open tail

- **A Windows CI job is deliberately not added**, and `module_tests.md` says so with the reason:
  minutes per run to exercise one `if` whose seam now exists, is used by both entry points, and has a
  real-probe test beside it. The day that seam proves insufficient, the job is the answer.
- **The built-in-first real-probe case is skipped off Windows**, because `C:\Windows\System32\OpenSSH`
  cannot be created on a Linux runner. It runs — and is the audit's exact condition — on any Windows
  machine.


## And one the review on the PR found, which is not test hygiene at all

`openSshProgram` answers the bare word `ssh` whenever the PATH already resolves it to the built-in
client — the T20 change above, so that the command in the viewer is one a person could have typed.
That is right for a string somebody reads or pastes into a shell. It is wrong for the other caller:
`sshUseActions.ts` hands the same string to `spawn(program, …, { shell: false })`, and on Windows a
relative name is resolved the way `CreateProcess` resolves one — the **current directory is searched
before `PATH`**. An `ssh.exe` left in the extension host's working directory would be the client
launched with `-A` and with `SSH_AUTH_SOCK` pointing at our agent, which is the one connection where
the client is handed keys. CWE-426, raised by CodeRabbit on the pull request.

`openSshBinary` is the spawn's answer: where the built-in is REQUIRED — agent forwarding, on
Windows, and only if it is there — it names the file, and everywhere else it is the bare word, so
the person's own `PATH` still decides every connection that is not depending on our agent. It takes
no `PathProbe`, because what the PATH resolves to is the viewer's question. It also closes a smaller
hole that needs no attacker: `PATH` is read when the probe runs and again when the process starts,
and nothing holds it still in between.

It is in this change rather than a follow-up because the file it is in is the file this change
rewrote, and shipping a known untrusted-search-path while touching the same function is the wrong
trade. Tested three ways — that the spawn is absolute while the viewer's string stays bare, that
neither a non-forwarding connection nor a non-Windows one is affected, and that a Windows without
the built-in client falls back rather than failing to spawn — and watched failing with "the spawn
names the file it means" against a version that always answered the bare word.
