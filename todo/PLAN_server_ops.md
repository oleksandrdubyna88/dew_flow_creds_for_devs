# PLAN — cred-vault-server operational hardening

> Status: **items 1, 4 and 8 shipped 2026-08-23; items 2, 3, 5, 6 and 7 remain.**
> Scope: deployment/runtime of the `cred-vault-server` .NET service — not code changes to the
> extension. This plan stays in `todo/` because most of its value is still ahead of it.
>
> Extracted from the audit follow-ups (the code items shipped; see
> [research/PLAN_audit_followups.md](../research/PLAN_audit_followups.md)).
> These are infrastructure/deployment decisions or small server features that
> need an owner call, so they are parked here rather than silently actioned.
>
> Items 6-8 come from [../research/SECURITY_REVIEW_2026-08-23.md](../research/SECURITY_REVIEW_2026-08-23.md)
> (findings 9, 11, 12) and its architecture note on contract versioning.

## Goal

Make the zero-knowledge vault server (`src_minimalapi_server/src/Program.cs`,
`src_minimalapi_server/src/VaultStore.cs`) run unattended for years without data loss or drift
between a user's two machines.

## Open items

1. ~~**Restart policy / log rotation / backups (infra).**~~ **SHIPPED 2026-08-23.** The
   decision was compose: `deploy/docker-compose.yml` sets `restart: unless-stopped` on every
   long-lived service, caps container logs at 10 MB x 5, and mounts `Vault__DataDir` as a host
   directory that updates never touch. `deploy/backup.sh` archives data + certificates + `.env`,
   needs no downtime, and verifies the tarball before reporting success. Serilog now writes a file
   per run under `logs/{UTC date}/`. Cadence is documented as a cron line rather than enforced —
   the restore rehearsal — item 8 — which has since been **done (2026-08-23, re-checked
   2026-08-25)**. This line said "nobody has yet rehearsed a restore" for two days after it stopped
   being true, and a security review copied it. A summary that contradicts its own body is worse
   than no summary.

2. **`DataDir` must be a local / atomic-rename-capable FS.** `VaultStore`'s
   durability relies on `File.Move` being atomic; on SMB/old NFS it is not.
   Document the requirement and, optionally, probe at startup and refuse a
   non-local `Vault__DataDir`.

3. **Inbox age-based pruning.** The per-recipient inbox quota is enforced
   (`Program.cs` share cap), but there is no TTL job that drops shares a
   recipient never accepted. *Decision needed:* max age before a pending share
   is swept.

4. ~~**Optimistic concurrency on `PUT /api/vault`.**~~ **DONE 2026-08-23.** `ETag` on read,
   `If-Match`/`If-None-Match` on write, `412` on a stale copy, compare-and-write under one striped
   lock. The extension sends the precondition automatically and drops its stale version on a 412 so
   the retry re-reads. Original text follows.

   **Optimistic concurrency on `PUT /api/vault`.** Two of a user's machines
   writing concurrently is last-writer-wins at the blob level today. An
   ETag/version precondition (reject on stale version, client re-pulls and
   re-merges) would remove the lost-update window. Note the causal
   **version-vector** merge (v0.22.0) already prevents *content* loss on the
   next sync; this is about the raw blob write race.

5. **Metrics endpoint + .NET LTS upgrade cadence.** A `/metrics` (or health
   detail) surface for monitoring, and a documented cadence for moving off an
   EOL .NET runtime.

6. **`/api/health` writes to disk on every call** (review finding 11). The probe creates and
   deletes `.health-probe` per request, and the endpoint is public. With a 30-second container
   healthcheck plus an nginx probe that is thousands of writes a day, and the reliability rule says
   health must do no blocking work inline. *Fix:* cache the probe result for a few seconds and serve
   the cached verdict. Keep probing — a health check that cannot see a full or detached volume is
   the constant the rule warns against.

7. **The HTTP contract carries no version** (review architecture note). Neither side negotiates, and
   nothing detects an old extension talking to a new server — which is the normal state of the world,
   because users update on their own schedule. *Decision needed:* a `/api/version` surface, or a
   header the client sends and the server checks, and what the server should do on a mismatch
   (serve, warn, or refuse). Cheap now; expensive after the first breaking change.

8. ~~**Nobody has restored a backup.**~~ **DONE 2026-08-23.** Rehearsed end to end against the
   published image: a vault was written, the data directory destroyed, and `deploy/restore.sh` used
   to bring it back — verified by reading the exact blob out of the API afterwards. The rehearsal
   paid for itself immediately by finding two defects that only appear in a real recovery: the
   scheduled backup archived the EMPTY directory after the outage and shadowed the good restore
   point, and `restore.sh` failed after moving the data aside, leaving the stack down. Both fixed
   and covered in `deploy/README.md`. The original text follows.

   **Nobody has restored a backup.** `deploy/backup.sh` verifies its own archive, but no one has
   untarred one into a fresh deployment and confirmed the extension syncs against it. An unrehearsed
   restore is a hope, and this is the **largest single reliability risk in the product** — ahead of
   anything in the code. *Work:* restore into a clean stack, point a real extension at it, confirm a
   vault opens and an inbox lists. Then write down how long it took.

## Build order

Item 8 first — it is the only one that could reveal that the others do not matter. Then 6 (small,
self-contained), then 2 and 3, then 4 and 7 together since both touch the write path and the client,
then 5.

## Test plan

- Items 3, 4, 6 ship with tests in `src_minimalapi_server/tests/` (xUnit v3, in-process through
  `WebApplicationFactory` — run the test executable, never `dotnet test`): a swept-inbox case, a
  stale-ETag `PUT` rejected with `412`, and a health probe asserted to hit disk at most once per
  cache window.
- Item 7's mismatch behaviour is a test once the behaviour is decided.
- Items 1, 2 and 8 are verified operationally — kill-and-restart, a non-local `DataDir` refused at
  startup, and a real restore — not by unit tests. Item 8's outcome is written into
  `deploy/README.md` as a runbook.

## Definition of Done

- [ ] Each item is either implemented **or** carries the owner's explicit decision to defer.
- [ ] Every shipped server feature has a test in `src_minimalapi_server/tests/` and the suite is green.
- [ ] `DataDir`/restart/backup expectations are documented in [../deploy/README.md](../deploy/README.md).
- [ ] A restore has actually been performed, and the runbook records how long it took.
- [ ] The open-findings table in [../research/SECURITY_REVIEW_2026-08-23.md](../research/SECURITY_REVIEW_2026-08-23.md)
      is updated as items 4, 6 and 3 close.
