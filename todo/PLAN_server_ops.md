# PLAN — cred-vault-server operational hardening

> Status: **items 1, 3, 4, 7, 8 and 9 shipped; items 2, 5 and 6 remain.** (1, 4, 8 on 2026-08-23;
> 3, 7 and 9 on 2026-08-26, after re-reviewing this plan against the client that grew past it.)
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

3. ~~**Inbox age-based pruning.**~~ **SHIPPED 2026-08-26.** Owner decision: **31 days**.
   `ShareMaintenance` (a `BackgroundService` on a `PeriodicTimer`) runs at startup and then every
   `Vault:MaintenanceIntervalMinutes` (60), sweeping any pending share and any sender receipt
   older than `Vault:ShareMaxAgeDays` (31). Age comes from the item's own `createdAt`, never the
   file timestamp — a restore rewrites every mtime, and a sweep that trusted them would delete a
   month of shares at the one moment nobody can afford a second failure. The test that matters is
   end to end: it puts a 90-day-old share on disk, starts the REAL server and waits for it to go,
   because a maintenance job that is registered but never reached looks identical from outside to
   one that runs. Removing the registration turns exactly that test red. Original text follows.

   **Inbox age-based pruning.** The per-recipient inbox quota is enforced
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

7. ~~**The HTTP contract carries no version**~~ **SHIPPED 2026-08-26.** Answer: a header both
   sides send, `X-Creds-Contract`. Below `Vault:MinimumClientContract` the server answers **426
   before authenticating** — an extension too old to serve is told THAT, not handed a 401 about a
   token that was never the problem. Newer-than-the-server is served (it knows better than an
   older server does, and it can read the version off the response). Absent or mangled is served:
   every extension released before this sends nothing, and refusing them would turn a handshake
   into an outage. It rides on a header rather than in `/api/client-config`, whose own doc argues
   for exactly one field. The minimum is CONFIGURABLE, which is not a convenience: with it equal
   to the current version the refusal branch is unreachable, and a test raises it to drive a real
   refusal instead of trusting a path nobody has run. Client side: the transport sends the header,
   turns 426 into a sentence quoting the server's own reason, and says ONCE — not per request —
   when the server has moved ahead. Original text follows.

   **The HTTP contract carries no version** (review architecture note). Neither side negotiates, and
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

9. ~~**A sender cannot withdraw a share**~~ **SHIPPED 2026-08-26.** Owner's design, and it is the
   one that avoids the disclosure: write what was sent into the SENDER's own file, reconcile
   hourly against the recipient's, and drop the record once they have taken it. So the server
   keeps `sent/<hash(sender)>/<id>.json` — a **receipt**, with no `salt`/`iv`/`tag`/`data`, since
   the sealed payload should exist exactly once. `GET /api/shares/sent` lists a sender their own
   actions, which discloses nothing new; scanning inboxes for their name would have.
   `DELETE /api/shares/sent/{id}` withdraws, and names the inbox from the receipt rather than from
   the request — so someone else's id has nothing to look up. Already accepted is **409, not 404**:
   "no such share" and "beyond recall" are different answers, and only one means the secret is now
   somewhere you cannot reach; the extension says so and names the only move left (rotate).
   Reconciliation is the hourly half of item 3's pass. Original text follows.

   **A sender cannot withdraw a share** (found 2026-08-26, reviewing the server against the client
   that grew past this plan). `DELETE /api/shares/{id}` resolves the path as
   `_sharesDir/KeyFor(callerEmail)/{id}.json` — the inbox is keyed by the RECIPIENT, so the caller
   can only delete from their own. There is no route by which the person who sent it can take it
   back. A share posted to the wrong colleague is posted.

   **What made this worth raising now is ephemeral secrets** (0.59.0), which shipped after this
   plan was written. `expiresAt` and `burnPolicy` DO travel inside the sealed payload —
   `shareFormat.ts:180` strips only `notes`, `dependsOn` and `depColor` — so a shared secret keeps
   its deadline at the recipient and an expired one is swept there. That half is sound. But
   **burn-on-use has no deadline**: the sender's copy burns on first use and the pending share
   stays live, in an inbox the sender cannot reach, for as long as the recipient ignores it.

   *Decision needed:* whether a sender may delete a share they sent (the id would have to be
   findable — today the sender is not told the id, and listing by sender is itself a disclosure),
   and whether burning or deleting the source should attempt it. Item 3's age-based sweep is the
   cheaper half-answer: it bounds the window without a new authorization rule.

## What the review found did NOT need the server (2026-08-26)

A large amount of client code landed between 2026-08-23 and 2026-08-26 — ephemeral secrets, the
depends-on graph, the SSH agent, the headless `creds` CLI with named grants, the Remote-SSH broker
bridge, agent forwarding, and the WSL agent relay. **None of it needs anything here**, and that is
checked rather than assumed:

- the client calls exactly five paths — `/api/vault`, `/api/team`, `/api/shares`,
  `/api/shares/{id}` and `/api/client-config` — all of which exist;
- no module of the broker, agent, CLI, bridge or relay refers to the vault server at all: those
  surfaces are a loopback port, a named pipe and a unix socket, and the credential never travels;
- every new entity field rides INSIDE the sealed payload, and `entityKind` is free-form up to 64
  characters server-side, so new kinds need no server release;
- the server takes no entity id anywhere, so the whole class of crafted-id defects fixed in the
  extension has no counterpart here — `KeyFor` hashes the email and a share id must parse as a
  GUID before it is joined to a path.

The one thing the growth DID change is item 7's urgency: there is now a lot of client to be out of
step with. It also supplied the pattern — `contract/broker-v1.json` is generated from the
TypeScript and asserted by a test on BOTH sides, and the HTTP contract could be versioned the same
way instead of inventing a second mechanism. Note the lesson recorded with it: those contract tests
were green while `/v1/use/exportEnv` was unreachable in every released build, because each side
only checked itself against the file. A version surface needs one end-to-end check that an old
client actually gets the answer the rule promises.

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
