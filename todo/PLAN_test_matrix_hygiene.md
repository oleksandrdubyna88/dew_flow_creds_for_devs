# PLAN — two SSH tests inject the PATH they assert about, and JSON positions are asserted on fixtures

> Status: **plan only, nothing implemented yet, 2026-09-10.** Scope: `src_vs_code/src/test/sshProgram.test.ts`,
> `sshCommand.test.ts`, `configValidation.test.ts`, `configFieldsOutcome.test.ts`, `sshProgram.ts`,
> `research/module_tests.md`.
> Audit finding **#8** of [REVIEW_product_audit_2026-09-09.md](REVIEW_product_audit_2026-09-09.md),
> re-verified 2026-09-10 (§Перепроверка).
>
> Related docs: [module_tests.md](../research/module_tests.md), [PLAN_ssh_agent.md](../research/PLAN_ssh_agent.md) (T20).

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

- [ ] The two SSH failures reproduced here, then green here and in CI.
- [ ] `npm run typecheck`, `npm test` green.
- [ ] `module_tests.md` updated with the runtime statement.
- [ ] `coai` plan → `proceed`, code round run, findings resolved.
- [ ] Promoted to `research/` with deviations recorded.
