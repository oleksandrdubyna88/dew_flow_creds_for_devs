# PLAN — N16, epic E1: the stories

> Status: **plan only, nothing implemented yet, 2026-11-16.** The stories document of epic E1 of
> [PLAN_person_roads_forget_key.md](PLAN_person_roads_forget_key.md) (its `## Epics`). One branch, one PR, one code round
> over the whole diff of E1.

## E1.S1 · The bounded roads forget their key (cornerstone)

- The imports of `commands/agentCommands.ts` grouped per module (§2.3 of the parent); no request string changes.
- The helper of §2.1 in its own small module; the socket check and *Install creds on host* run inside it.
- Tests 1 and 2 of the parent's §3, RED first; the mutations of §3.5 for these two roads.
- Docs: the CHANGELOG entry (first half), the module documents' lines for these two roads.

## E1.S2 · A bridge's key goes when its `ssh` ends

- The continuation on the started bridge's `exited`; the forget at once on no argv and on a throwing `start` (§2.2).
- The spawner of `extension.ts` moved to an exported function whose `exited` settles on `'error'` too.
- Tests 3 and 4 of the parent's §3, RED first; the mutations of §3.5 for the bridge and the spawner.
- Docs: the CHANGELOG entry (second half), the row *SSH private key on disk*, the bridge section's spawner sentence.
