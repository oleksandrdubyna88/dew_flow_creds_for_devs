# PLAN — a node write made from a stale copy is refused, not stored

> Status: **not started, a stub, 2026-11-12.**
> Scope: the extension's node writes (`src_vs_code/src/storageManager.ts`: `saveNodes`, `updateNodeFields` and the other leased writes of the node list). Found by the
> folder colours ([PLAN_folder_colors_E1.md](PLAN_folder_colors_E1.md), residual P1); the module document links it. Nothing here is built.

## Goal

A window whose `globalState` copy of the node list is stale can write the WHOLE list. `saveNodes` (`storageManager.ts:1005`) stores the
list it is given, inside the cross-window lease. The lease makes the windows take turns; it does not make a copy fresh: a write from
another window reaches this window by a broadcast with no order against a local read (`windowLock.ts:17-21`;
[PLAN_cross_window_write_coordination.md](../research/PLAN_cross_window_write_coordination.md), section *The design round that changed the
primitive — 2026-09-03*). So a write can drop another window's write that has not arrived yet: a folder's colour, a rename, any node edit
made within the broadcast delay. Nothing reports it. The folder colours named it (P1 of E1) and did not fix it. It holds for EVERY leased
node write in this extension, not for the colour alone. The aim is that such a write is refused, or merged, and never silently lost.

## The precedent

In the sibling repository `dew_flow_connect_other_ais` (paths, not links; the planning rule on citations across repositories). The chat
store has the same need and refuses a stale write:

- `dew_flow_connect_other_ais · src_vs_code/src/chatStoreFile.ts:421` — `save(record, expectedRev, now)`: a save names the revision it read.
- `dew_flow_connect_other_ais · src_vs_code/src/chatStoreFile.ts:522-554` — `saveClaimed`: inside the claim it reads the record on disk, compares the revision, and
  refuses a mismatch before anything is written.
- `dew_flow_connect_other_ais · src_vs_code/src/test/chatStoreFile.test.ts:700` — two writers with one baseline: exactly one lands, whole, and the other is refused.
- `dew_flow_connect_other_ais · src_vs_code/src/chatStoreWrite.ts:74-90` — after a refusal, taking the disk's revision and trying again re-opens the lost update, so
  the retry compares contents, not numbers.

The chat store reads its record from a file, so a read inside the claim is fresh. A memento has no such read. That difference is the
whole question.

## Open questions (not answered in this stub)

1. Where does the authoritative revision live, since a memento has no fresh read? A counter in a file under `globalStorageUri` next to
   the lease? A revision inside the stored value that every write checks?
2. Refuse or merge? A refusal needs a caller that can try again; a merge needs a rule per field, and a rule for two edits of one field.
3. What does each caller do with a refusal: the auto-pick (picks again at the next terminal), the folder form (asks the person again),
   the import, the sync, the share accept?

## Build order, test plan, Definition of Done

Written when the plan is written. Until then:

- [ ] A plan with stories replaces this stub, with the three questions above answered by a measurement, and it passed the plan round of
      the coai review gate. That is this stub's own done-when.
