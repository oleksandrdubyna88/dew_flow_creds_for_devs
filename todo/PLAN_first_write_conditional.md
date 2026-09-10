# PLAN — after a 404 the first write says "only if I am first"

> Status: **plan only, nothing implemented yet, 2026-09-10.** Scope: `src_vs_code/src/serverTransport.ts`,
> its tests, `research/module_server.md`.
> Audit finding **#5** of [REVIEW_product_audit_2026-09-09.md](REVIEW_product_audit_2026-09-09.md),
> re-verified 2026-09-10 (§Перепроверка) — impact re-rated to P3, kept because the fix is cheap and the
> server already speaks it.
>
> Related docs: [module_server.md](../research/module_server.md) (`PUT /api/vault` preconditions),
> [PLAN_cross_window_write_coordination.md](../research/PLAN_cross_window_write_coordination.md).

## Symptom

`readVault` on a `404` deletes the remembered version (`serverTransport.ts:237-241`); `writeVault` then
sends **no** precondition (`:250-255` — `If-Match` only when a version is known, never `If-None-Match`).
Two devices that both read "no vault" both write unconditionally; the second replaces the first. The
server implements the missing half already — `If-None-Match: *` → `RequireAbsent` → `412`
(`VaultStore.cs:79-84`, `Program.cs:856-858`, `ConcurrencyTests.cs:124-129`) — and no client sends it
(`grep If-None-Match src_vs_code/src` is empty).

Re-rated: `syncProfile` reads, decrypts, `mergeProfiles` and pushes on every cycle
(`syncManager.ts:423-556`, merge at `:552`), so the losing device re-unions its local entries on its next
cycle. The loss is permanent only when that device never syncs again. It **compounds with finding #4**:
after a vault deletion every other device of the account sees `404`, forgets its version and races to
recreate.

## What must be true when this is done

1. The transport distinguishes *never read*, *read and absent*, *read and present(etag)*.
2. After a confirmed `404`, the next write carries `If-None-Match: *`.
3. A `412` on that write is handled the way a stale `If-Match` is today: forget, and report that the
   next cycle re-reads and merges (`:257-265`).
4. A write with nothing ever read keeps today's unconditional behaviour, and the doc says so.

## Design

`versions: Map<string, string | typeof ABSENT>` with `const ABSENT = Symbol('absent')`. `readVault` sets
`ABSENT` on `404` instead of deleting. `writeVault`:

```ts
const known = this.versions.get(account.accountId);
headers: known === undefined ? undefined
       : known === ABSENT   ? { 'If-None-Match': '*' }
       :                      { 'If-Match': known }
```

`deleteVault` (`:452-458`) keeps clearing the entry — after a delete the next read decides. The `412`
branch and its sentence are unchanged; the message already says *re-reading and merging on the next
cycle; nothing was overwritten*, which is now true for the create case too.

`module_server.md`: the `PUT /api/vault` row says the extension sends `If-None-Match: *` after a `404`.
Not a contract change (the server accepted the header since it was added); rule 6 is satisfied by the
doc line.

## Build order

1. RED: `serverTransport.test.ts` — `'after a 404 the first write is conditional on absence'`: a fetch
   stub answering `404` then recording the `PUT`; assert `If-None-Match: *` and no `If-Match`. Today:
   neither header.
2. RED: `'a 412 on the conditional create forgets the absence and reports a merge on the next cycle'`.
3. RED: `'a write with nothing ever read stays unconditional'` (guard for rule 4).
4. Implement → GREEN.
5. `npm run typecheck`; full `npm test`; `node scripts/server-transport-itest.cjs` if it drives a real
   server here (report either way).
6. `module_server.md`; `CHANGELOG.md`.

## Test plan

| Sequence | Header on the write |
|---|---|
| never read → write | none |
| read 404 → write | `If-None-Match: *` |
| read 200 (etag) → write | `If-Match: <etag>` |
| read 404 → write 412 → next write | none (absence forgotten; the next cycle reads first) |
| delete → write | none |

## Definition of Done

- [ ] All tests above; RED and GREEN reported.
- [ ] `npm run typecheck`, `npm test` green; itest reported.
- [ ] `module_server.md` and `CHANGELOG.md` updated.
- [ ] `coai` plan → `proceed`, code round run, findings resolved.
- [ ] Promoted to `research/` with deviations recorded.
