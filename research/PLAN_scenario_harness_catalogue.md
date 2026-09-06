# PLAN — the scenario harnesses this repository already has, named and catalogued

> Status: **IMPLEMENTED 2026-09-06.** [module_tests.md](module_tests.md) exists and names all nine
> harnesses, every one of them was RUN rather than read, two joined CI, and the four that stayed out
> carry a reason each.
>
> **Three deviations, and the first is why the rule exists.**
>
> - **The plan said "read each script's header and its assertions, not its name." Running them was
>   better, and it found a harness that could not START.** `wsl-agent-relay-itest.cjs` crashed with
>   `TypeError: distros.find is not a function` before its first manager check — two API drifts, from
>   `start(command, distro)` becoming `start(command, distros[])` and `socketPath` becoming
>   `socketPathFor(distro)`. Nothing could have caught either: these harnesses are untyped `.cjs`
>   requiring compiled `out/*.js`, so no compiler sees them, and this one is in no CI. It had been
>   proving nothing, silently, for long enough that the git history is the only way to date it. That
>   is the rule's own sentence — *owning a harness is not enough* — arriving as a fact.
> - **Two harnesses joined CI rather than collecting a reason.** `creds-mcp-itest.cjs` and
>   `masked-run-itest.cjs` had no reason to be out, only an absence: the extension job already sets
>   up .NET for the CLI harness, and neither needs anything platform-specific. Of the four that
>   remain out, three are Windows-only by construction (named pipes, WSL) against an `ubuntu-latest`
>   runner, and the fourth needs a running server — which CI already states in the workflow.
> - **The epic-1 corporate surface was not the first uncovered flow, and something larger was.** The
>   plan predicted it. What the catalogue actually surfaced is that **nothing drives the editor at
>   all** — every harness stubs `vscode` or talks to the broker underneath it — so a command wired to
>   no menu, a context value that stopped matching, or a webview that throws on open is caught by
>   nothing. That, and the fact that every harness here runs on Windows while the Linux keychain
>   fallback the README warns about has no scenario coverage whatever.
>
> Related docs: [module_tests.md](module_tests.md),
> `.claude/rules/shared/common/scenario-tests.md` (the rule this answers),
> [testing.md](../.claude/rules/shared/common/testing.md), [http/README.md](../http/README.md).

## The symptom

The shared rules gained `scenario-tests.md` at pin `c5a6019`, and it is mandatory: every repository has
a scenario harness, **and** that harness is described in `research/module_tests.md` — including the
flows it does not cover. This repository has the harnesses and does not have the document.

What exists today, uncatalogued:

| Harness | Drives | Run by |
|---|---|---|
| `http/` (httpyac + `http-run.mjs`) | the real server over HTTP, 82 requests across 9 files, with a coverage report that refuses an unlisted route | CI, `http · contract suite` |
| `src_vs_code/scripts/agent-broker-itest.cjs` | the broker over its loopback HTTP surface | `npm run itest:agent` |
| `scripts/creds-cli-itest.cjs` | the `creds` binary against a live broker | `npm run itest:cli` |
| `scripts/creds-mcp-itest.cjs`, `creds-mcp-wsl-itest.cjs` | `creds-mcp` over stdio, and the WSL relay | `npm run itest:mcp`, `itest:mcp-wsl` |
| `scripts/server-transport-itest.cjs`, `ssh-agent-itest.cjs`, `masked-run-itest.cjs` | the sync transport, the SSH agent, a masked run | their own `itest:` scripts |

The rule's second failure is the one that bites here: *owning a harness is not enough — it has to be
named, catalogued and run.* Four of the `itest:` scripts are not in CI and are run by whoever remembers
them, which is the state the rule was written about.

## What this delivers

1. **`research/module_tests.md`** — one document naming every harness above: what it drives, how it is
   started, what it asserts, and **what it does not cover**, in the register of the other module docs.
2. **A statement per harness of whether CI runs it**, and for each that CI does not, one sentence on why
   (needs a live vault window, needs WSL, needs a Marketplace build) — because "not in CI" with a reason
   is a decision, while "not in CI" alone is a harness rotting.
3. **The uncovered flows named.** Writing the catalogue is what finds them; the epic-1 corporate surface
   is the obvious first candidate — its `.http` files cover the routes, and nothing drives the extension
   half end to end.

## Build order

1. Inventory: read each script's header and its assertions, not its name.
2. Write `research/module_tests.md`.
3. Add its row to `research/README.md`.
4. For each harness CI does not run, either add it or record the reason in the document.

## Definition of Done

- [ ] `research/module_tests.md` exists and names every harness in the table above, with its coverage
      and its gaps.
- [ ] Every harness CI does not run carries a reason.
- [ ] `research/README.md` links it.
- [ ] `plan-lifecycle.mjs` clean.
