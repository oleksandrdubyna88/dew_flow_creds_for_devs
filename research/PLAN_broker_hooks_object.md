# PLAN — the broker's eleven optional hooks stop being positional

> Status: **IMPLEMENTED, 2026-09-11.** Scope as built: the new `src_vs_code/src/brokerHooks.ts` and
> `test/brokerHooks.test.ts`, `credsAgentServer.ts`, `extension.ts`, `cliAliases.ts`,
> `test/brokerWorld.ts`, four `scripts/*-itest.cjs`, `.size-baseline.json`,
> `research/module_extension.md`.
>
> Related docs: [module_extension.md](module_extension.md) (the broker),
> [PLAN_one_use_serialized.md](PLAN_one_use_serialized.md) (whose open tail this is).

## Symptom

`CredsAgentServer` takes **fourteen positional constructor parameters**, eleven of them optional
callbacks (`credsAgentServer.ts:96-204`). Inserting one in the middle hands every argument after it
to the wrong slot, and the types do not catch it, because most of them are lambdas that structurally
fit each other's holes.

It has happened **twice**, both times silently:

- **2026-08-27 (`32d8f01`)** — `visibleConfig` was added. `creds-mcp-itest.cjs` records what followed
  in its own comment: *"every lambda after it silently shifted one place, the gate became the config
  supplier, and nineteen checks here failed with 'no window answered' — for a month, unseen, because
  this script is not in CI."*
- **2026-09-11** — `isOneUse` was added for audit finding #3. `listAliases` landed in its slot and
  `creds ls` answered *"no entry is enabled for the CLI yet"*. Caught by `creds-cli-itest.cjs`,
  which IS in CI; nothing else would have.

Moving `isOneUse` to the end fixed that insertion, not the next one. *"Add new hooks at the end"* is
a convention with nothing enforcing it.

**Why the compiler cannot help.** Seven construction sites, and five of them are `.cjs`:

| site | positional `undefined`s | typechecked | in CI |
|---|---|---|---|
| `src/extension.ts:519` | — | yes | yes |
| `src/test/brokerWorld.ts:167` | 1 | yes | yes |
| `scripts/creds-mcp-itest.cjs:274` | 4 | **no** | yes |
| `scripts/creds-mcp-wsl-itest.cjs:250` | 4 | **no** | **no** |
| `scripts/creds-cli-itest.cjs:136` | 2 | **no** | yes |
| `scripts/agent-broker-itest.cjs:154` | 1 | **no** | yes |
| `scripts/creds-mcp-itest.cjs:710` | 0 | **no** | yes |

`creds-mcp-wsl-itest.cjs` has four positional `undefined`s and is not in CI, so a shift there is
invisible today — exactly the shape of the 2026-08-27 month.

## What must be true when this is done

1. The eleven optional hooks are passed **by name**. A hook cannot land in another hook's slot.
2. **A misspelled hook name is refused loudly**, at construction. This is the failure mode the
   change introduces and it must not be shipped bare: positional got the slot wrong, named gets the
   key wrong, and a typo that silently means "absent" is worse than a shift that breaks a test —
   every hook here is optional, so `resolveAlais` would simply turn a feature off.
3. Behaviour is otherwise unchanged: every existing test, every integration script.
4. `credsAgentServer.ts` stays under its 800-line ceiling (it is AT 800 today).

## Build order

1. **`brokerHooks.ts`** (new): the `BrokerHooks` interface carrying all eleven fields with the doc
   comments they have now, and `checkedHooks(hooks)` which throws on a key that is not one of them.
   A new file rather than a section, because the ceiling is the reason `performCall` already lives
   in `brokerCall.ts` — and because the eleven doc comments are ~90 lines on their own.
2. **RED test** `brokerHooks.test.ts`: a typo'd key is refused and names itself; a correct set is
   accepted; an empty set is accepted (a real build — the CLI integration script constructs a server
   with nothing but a registry).
3. **`credsAgentServer.ts`**: constructor becomes `(actions, onUserPresent, storageDir?, hooks = {})`;
   the thirteen `this.<hook>` uses become `this.hooks.<hook>`.
4. **The seven call sites**, each naming its hooks.
5. `research/module_extension.md`.

## Test plan

- The existing suite is the behaviour proof: 3875 unit tests, plus `itest:agent`, `itest:cli`,
  `itest:mcp`, `itest:masked-run`, `itest:git` in CI.
- **The two that are NOT in CI are run by hand here** — `itest:mcp-wsl` and `itest:ssh-agent` —
  because `creds-mcp-wsl-itest.cjs` is one of the seven call sites and is the blind spot this plan
  names.
- Teeth for the new guard: watch `checkedHooks` accept a typo'd key with the check removed.

## Definition of Done

- [ ] No construction site passes a positional `undefined` for a hook.
- [ ] An unknown hook name throws at construction, naming the key and listing what was expected.
- [ ] `npm run lint`, `npm run typecheck`, the full unit suite.
- [ ] Every integration script, including the two CI does not run.
- [ ] `size-ratchet.mjs`, `plan-lifecycle.mjs`.
- [ ] `module_extension.md` updated; this plan promoted with its deviations.

## Deliberately NOT in this change

- **Putting `itest:mcp-wsl`, `itest:ssh-agent` and `itest:wsl-relay` into CI.** It is the right
  question — the 2026-08-27 break lived a month precisely because its script was not run — but it is
  a workflow change with its own cost (WSL is not available on a GitHub runner at all, which is why
  that one is absent), and bundling it here would hide both changes inside each other.
- **Folding `actions`, `onUserPresent` and `storageDir` into the object.** Those three are not
  interchangeable with anything: two are required and the third is a string. The defect is about
  eleven same-shaped optional callbacks.


## What shipped differently

**`storageDir` went INTO the object, and the plan said it would not.** The plan reasoned that it is
a string among callbacks, so it could not be confused with one — true, and beside the point a
reviewer made: the trap is about ORDER, not about types. An optional positional in front of an
options object rebuilds it exactly, because `new CredsAgentServer(actions, present, { listAliases })`
binds the object to `storageDir`, leaves `hooks` at its default and switches every hook off with no
error anywhere. Two required positionals and one named object has no such shape, so that is what
shipped, and the "Deliberately NOT" section it contradicts is left above as the record.

**The guard runs in the constructor, and there is a test that constructs a server with a bad key.**
Three reviewers across three vendors read the plan the same way — as testing `checkedHooks` in
isolation while the class stored the raw object — and they were right that the plan never said
otherwise. A guard the constructor does not call protects the test suite and nothing else.

**A value that is not a hook set at all is refused too**, which the plan did not cover. That is the
half-migrated `.cjs` shape: a caller still passing the old third positional now hands a STRING where
the hooks belong, and ignoring it would switch every hook off at once — the August failure with a
new spelling.

**The name tuple is pinned to the interface at COMPILE time.** A reviewer's, and the alternative
they offered (a test that enumerates the interface) cannot be written, because a TypeScript type has
no runtime enumeration. `SameSet<keyof BrokerHooks, typeof BROKER_HOOK_NAMES[number]>` stops the
build instead — add a hook to one and not the other and it fails here, rather than at some window's
startup.

**`aliasEntry` came out of `extension.ts` into `cliAliases.ts`.** The alias hook was a fourteen-line
inline lambda, and an options object reads badly with one of those in it. It also pulled
`extension.ts` down from 1066 lines to 1052, so the size baseline came down with it.

## What was run, including what CI does not run

`npm run lint`, `npm run typecheck`, 3880 unit tests (0 fail), and every integration script:
`itest:agent`, `itest:cli`, `itest:mcp`, `itest:masked-run`, `itest:git`, `itest:ssh-agent` — all
passed.

**`itest:mcp-wsl` and `itest:wsl-relay` fail on this machine, identically on `main` and on this
branch**, and that is worth writing down rather than hiding. Both fail one check — *"no half of the
bridge outlives the client"* / *"disposing the manager takes it down"* — because stray `creds-mcp`
and `creds relay` processes from earlier runs are still alive in WSL. Nothing to do with the
constructor: the same check, the same message, with this change stashed. The comparison is the
evidence; a green claim would not have been.

## Open tail

- **`itest:mcp-wsl`, `itest:ssh-agent` and `itest:wsl-relay` are still not in CI**, which is the
  condition that let August last a month. `itest:mcp-wsl` and `itest:wsl-relay` cannot run on a
  GitHub runner at all — there is no WSL there — so that one is a real constraint rather than an
  omission; `itest:ssh-agent` has no such excuse and is the cheap half of this question.
- **The two WSL scripts leave processes behind when they fail**, which then fails the NEXT run's
  "nothing outlives the window" check. Self-inflicted flakiness, separate from this change.
- `actions` and `onUserPresent` stay positional. Both are required, one is a class instance and the
  other a function, so nothing can shift: the defect was eleven same-shaped OPTIONAL callbacks.
