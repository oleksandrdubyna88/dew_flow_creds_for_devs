# PLAN — N17, epic E1: the stories

> Status: **E1.S1 built (`3099f5a5`, `895e345b`), E1.S2 specified, not built; 2026-11-15.** The stories document of
> epic E1 of [PLAN_open_terminal_key_file_name.md](PLAN_open_terminal_key_file_name.md) (see its `## Epics`). This
> document keeps no change ledger: a change of it is an entry in the parent.

The goal, scope, dependencies and done-when of the epic are in the parent's `## Epics`. Each story's scenarios and
brief are in its spec.

## E1.S1 · The call name on every road of `prepareSshSession`

- **Kind.** Cornerstone (security): spec by Fable, code by Sonnet, review by Opus.
- **Spec.** [PLAN_open_terminal_key_file_name_E1_S1_spec.md](PLAN_open_terminal_key_file_name_E1_S1_spec.md).
- **State.** Built at `3099f5a5` (code and tests) and `895e345b` (documents); the first code round passed.
- **What.** The scan with its list of two, the new member and the real-terminal switch of the test world, T-N17a,
  T-N17b and T-N17c watched RED, T20 and T21, the literal assertions, the fix in `sshSession.ts`, the mutation checks M1
  to M6, and the documents of the parent's §4.

## E1.S2 · A Connect that reuses a live terminal leaves no key file

- **Kind.** Security work outside the cornerstone quota: spec by Fable, code by Sonnet, review by Opus.
- **Spec.** [PLAN_open_terminal_key_file_name_E1_S2_spec.md](PLAN_open_terminal_key_file_name_E1_S2_spec.md).
- **Depends on.** E1.S1; built forward on the same branch.
- **What.** The repairs of the test world with FX-D, FX-L and T-N17d watched RED; G1 rewritten, G2 and G3 watched RED,
  G4 and the extended T-N17c as guards; the fix in `openKeyTerminal` (`sshConnect.ts`); the mutation checks M7 to M17;
  the documents of the parent's §4.
- **Merge condition.** E1.S1 is not merged or released without E1.S2 (the parent's §8).
