# PLAN — the scenario harnesses this repository already has, named and catalogued

> Status: **plan only, nothing implemented yet, 2026-09-06.** Scope: `research/module_tests.md`, which
> does not exist, plus whatever the writing of it exposes as an uncovered flow.
>
> Related docs: `.claude/rules/shared/common/scenario-tests.md` (the rule this answers),
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
