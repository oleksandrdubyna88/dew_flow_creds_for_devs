# PLAN — an agent's refusal does not confirm the name of an entry it cannot see

> Status: **not started, 2026-11-10.** The owner said yes to fix it as its own item. Scope: the extension's broker
> refusal (`src_vs_code/src/brokerRequests.ts`) and its tests. Found as F7 of
> [PLAN_terminal_command_over_ssh_E3_S2_security.md](PLAN_terminal_command_over_ssh_E3_S2_security.md) §16, item 7.

## Symptom

An agent call on an entry id (for example `creds_exec`) goes through `usable` (`brokerRequests.ts:150-157`). When
`findUsableEntry` answers `closed`, `refusalFor` (`brokerRequests.ts:209-217`) says
`"<entry name>" is not open to agents for that. Turn on "<switch>" in its Agent access section.` The verdict reads the
`use` switch, not `view` (`mcpEntries.ts:422-436`), so it is also `closed` for a node the agent cannot list. So an agent
that guesses or keeps an id learns the NAME of an entry that was never opened to it. Every other unknown id gets
`No such entry, or this window does not serve it.` (`:216`).

## Fix idea (not decided)

Name the entry in the `closed` sentence only when the agent may `view` it; otherwise answer the `not_found` sentence,
so "closed and not listed" reads the same as "missing". Put the decision in `refusalFor` (the one road), and sweep its
other callers (`bridgeScope.ts:244`, `:248`) and every refusal that names an entry by the same method.

## Build order

1. A RED test: an entry with `use` off and `view` off, called by id → today the name is in the message.
2. The fix in `refusalFor` (or in the lookup it is given), then the sweep.
3. Help or README only if a sentence there promises the old text.

## Test plan

- The RED test above, watched failing first; a `view`-on, `use`-off entry still gets the named sentence (positive control).
- The existing broker and bridge-scope tests stay green.

## Definition of Done

- [ ] No refusal names an entry the agent cannot `view`; the sweep's method is in the summary.
- [ ] Tests above green, the first one watched RED; the coai gate ran on plan and code.
- [ ] `research/` updated; this plan promoted.
