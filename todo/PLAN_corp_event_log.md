# PLAN — epic 4: one event log, a query that can answer questions, and a place to read it

> Status: **plan only, nothing implemented yet, 2026-09-04.** Scope: every corporate action leaves a
> line — shares with their real outcome, roles, projects, assignments, blocks, login keys, backups,
> settings — kept forever, metadata only. An admin can search all of it; everybody else sees their
> own. Fourth of five epics under [PLAN_corp_control_plane.md](PLAN_corp_control_plane.md), which
> holds the owner decisions, the invariants and the shared shapes.
>
> The log's **writer** ships in [PLAN_corp_registry_roles.md](PLAN_corp_registry_roles.md) so epics
> 1–3 record from their first commit; this plan owns the **reader**, the query endpoint, the outcome
> reporting, the viewer tab and the Team search. Depends on epic 1 for `RequireAdmin` and on
> [PLAN_corp_projects_share_rule.md](PLAN_corp_projects_share_rule.md) for the project a row cites.
>
> Related docs: [module_server.md](../research/module_server.md) (the break-glass audit log, the
> streaming helper), [module_extension.md](../research/module_extension.md) (the tree filter, the
> history rows, the webview precedents).

## The symptom

Ask the product "who gave Boris the production database password, and when" and there is no answer.
The sender's receipt is deleted the moment the recipient acts on the share
(`src_minimalapi_server/src/VaultStoreOutbox.cs:102-118`), and whatever survives that is swept after
31 days (`:133-156`). Nothing distinguishes *accepted* from *declined*: both are the recipient
calling `DELETE /api/shares/{id}` (`Program.cs:1288-1295`).

The one durable, cross-account trail in the product is the break-glass audit log
(`OrgRecoveryStore.cs:312-317`), and it covers vault recoveries only. It is also written with a bare
`File.AppendAllTextAsync` and **no lock** — safe today because a break-glass is rare and gated, and
not safe at all for a log every share writes to.

## What this epic delivers

1. **The reader**: a filtered, cursor-paginated query over the day-split NDJSON the writer produces.
2. **The true outcome of a share**: contract 3 carries `?outcome=accepted|declined` on the inbox
   delete, so the row says what happened instead of "it left the inbox".
3. **Expiry and withdrawal as events**, including the identity of the sender, which the current
   receipt shape cannot supply.
4. **A viewer tab** with filters, search and "load more", plus rows in the tree under a person.
5. **Team search**, so the existing tree filter matches a colleague by name, role or project rather
   than by email alone.

## Decisions taken here, with their reasons

**Its own root, `org/events/`, never under `org-recovery/`.** Both sweeps
(`ShareMaintenance.cs:55-78`, `OrgRecoveryMaintenance.cs:41-70`) walk *named subdirectories*, which
is precisely why the audit log has survived. A log parked under a folder that a future maintainer
might reasonably enumerate wholesale is a log with a deletion waiting for it. A test asserts both
sweeps leave `org/events/` untouched.

**One file per UTC day**, `org/events/<yyyy-MM-dd>.ndjson`, opened lazily on the day's first append —
the shape the server's own log sink already uses. One file forever would make every `since`/`until`
query a scan of the whole history and would force an arbitrary "and at 100 MB we do… what?" rule. Day
files make the range query skip whole files, and make the cursor stable.

**One dedicated lock, not the vault's stripe of 64.** Striping keys works when writers touch
different files; here every writer in the process appends to the same file. One
`SemaphoreSlim(1, 1)` serialises appends, with a comment saying why, so nobody later "optimises" it
into a stripe that races inside one day.

**The cursor is `<day>:<lineIndex>`.** Appends only ever add lines after any index already handed
out, and never touch an earlier day's file, so a page taken while the log is being written neither
skips nor repeats. A byte offset into a single growing file would have neither property once a range
filter is applied.

**No `total`.** An exact count means a second full scan with the same filter, which is what the
server already refused to pay when `/api/shares` was changed to stream (`module_server.md`). The page
plus the presence of `nextCursor` is what a "load more" button actually needs. The field stays out of
the envelope rather than being present and always null.

**Scoping is applied before any row leaves the process.** A non-admin's query is forced to
`actor == caller || subject == caller`, and the filter parameters may only narrow that set. The test
that matters is a non-admin passing `person=somebody-else` and getting their own rows, not an error
and not a leak.

**The outcome is reported by the client, and an absent one is not an error.** A client that sends no
`outcome` — an older build, a bug — records `share.unknown`. Refusing the delete would break the
inbox over a log field.

**The share is read before it is deleted.** `DELETE /api/shares/{id}` today returns a bool
(`Program.cs:1292`); the row needs the entity name and the sender, so the handler reads the item
first, exactly as the sent-side path already does (`:1270`).

**`SentShare` gains `FromEmail`.** The receipt does not carry it (`Models.cs:127-134`) and its
directory is a one-way hash of the sender (`VaultStoreOutbox.cs:30`), so the expiry sweep literally
cannot name who sent the thing it is deleting. One field, populated where `item.FromEmail` is already
in scope (`Program.cs:1211-1221`). Receipts written before this ship read as empty for their
remaining ≤31 days — bounded, self-healing, and stated rather than discovered.

**One optional parameter, not a second path, for the outcome.** Accept and decline already funnel
through one function: `sharingManager.removeOwnShare` (`sharingManager.ts:177-188`) →
`VaultTransport.removeShare` (`vaultTransport.ts:57-58`). Widening that method is the reuse-first
move; a parallel "removeWithOutcome" would be the duplicate that drifts.

**The viewer is a webview with real message passing**, built on the entity-form panel's shape
(`entityFormPanel.ts`, `formMessage.ts`), not on the MCP log page's client-side filtering
(`mcpLogPanel.ts`): our data is server-paginated, so every filter change and every "load more" is a
round trip. The page itself stays pure and `vscode`-free, uses `webviewHtml.ts`'s `escapeHtml` and
`jsonForScript` (which already fixed one script-injection class), and borrows the MCP page's table
and CSS conventions so the product looks like itself.

## The shapes

```csharp
public sealed record OrgEventDto(
    long At,               // UTC ms
    string Kind,           // "share.sent" | "share.accepted" | … | "member.blocked" | "backup.run"
    string Actor,          // who did it
    string? Subject,       // whom it was done to
    string? Project,
    string? ShareId,
    string? EntityName,    // already plaintext on ShareItem; never a secret
    string? EntityKind,
    string? Outcome,
    string? Detail);       // short, human, never content

public sealed record OrgEventQuery(string? Actor, string? Subject, string? Person, string? Project,
    string? Kind, long? Since, long? Until, string? Text, string? Cursor, int Limit,
    string? RestrictToSelf);
```

**The kinds, as one list** (the union every epic emits into):

| Group | Kinds |
|---|---|
| shares | `share.sent`, `share.accepted`, `share.declined`, `share.unknown`, `share.withdrawn`, `share.withdrawn_blocked`, `share.expired` |
| people | `member.registered`, `member.role_changed`, `member.share_default_changed`, `member.blocked`, `member.unblocked` |
| projects | `project.created`, `project.renamed`, `project.archived`, `project.assigned`, `project.unassigned` |
| keys | `loginkey.issued`, `loginkey.revoked` |
| operations | `settings.changed`, `backup.configured`, `backup.run`, `backup.failed` |

## Files

### Server

| File | New/modify | Responsibility |
|---|---|---|
| `src/OrgEventLog.cs` | epic 1 creates, this epic extends | `AppendAsync` (epic 1) and `QueryAsync` (here): walk day files newest-first, filter per line, page by `<day>:<lineIndex>`. A line that will not parse is skipped and counted, logged once per file — a torn final line from a killed process must not end a query. |
| `src/Models.cs` | modify | `SentShare.FromEmail`. |
| `src/VaultStoreOutbox.cs` | modify | `PruneOlderThanAsync` and `ReconcileSentAsync` return what they removed, not just how many, so the sweep can name it. The existing count stays as `.Count`. |
| `src/ShareMaintenance.cs` | modify | One `share.expired` row per pruned item. |
| `src/OrgEventsEndpoints.cs` | new | `GET /api/org/events`, as this epic's own extension method. |
| `src/Program.cs` | modify | `?outcome=` on `DELETE /api/shares/{id}` plus the read-before-delete; the `share.sent` and `share.withdrawn` hooks; one `MapOrgEventsEndpoints` call. |
| `src/AppJsonContext.cs` | modify | `OrgEventDto`, `List<OrgEventDto>`. |
| `http/org/events.http` | new | The happy page, a cursor page, a non-admin's scoped page, and each refusal. |

**The endpoint**

| Method | Path | Auth | Answers |
|---|---|---|---|
| GET | `/api/org/events` | any allowed caller | `{items: [...], nextCursor: "…"|null}`. Admin: everything in the domain. Everyone else: rows where they are actor or subject, narrowed further by the filters but never widened. Parameters: `actor`, `subject`, `person`, `project`, `kind`, `since`, `until`, `q`, `cursor`, `limit` (default 100, capped). |

The envelope is written by hand around the existing `WriteJsonArrayAsync` (`Program.cs:483-503`):
`{"items":` then the streamed array then `,"nextCursor":…}`. Extending the helper to know about
envelopes would complicate its three current callers for the sake of one new one.

**Hooks, with where they go**

| Event | Site |
|---|---|
| `share.sent` | `Program.cs:1207-1222`, after both writes land |
| `share.accepted` / `.declined` / `.unknown` | the rewritten `DELETE /api/shares/{id}` (`:1288-1295`) |
| `share.withdrawn` | `DELETE /api/shares/sent/{id}` (`:1266-1286`), on the `204` path only |
| `share.withdrawn_blocked` | epic 2's block handler |
| `share.expired` | `ShareMaintenance` over the widened prune result |
| people, projects, keys, operations | each epic's endpoint, at its point of durable write |

### Extension

| File | New/modify | Responsibility |
|---|---|---|
| `src/vaultTransport.ts` | modify | `removeShare(account, share, outcome?)` (`:57-58`). |
| `src/serverTransport.ts` | modify | The query parameter (`:334-338`). |
| `src/folderTransport.ts`, `src/gitTransport.ts` | modify | Accept and ignore — there is no server to tell. |
| `src/sharingManager.ts` | modify | `removeOwnShare(share, outcome?)` (`:177-188`). |
| `src/shareInbox.ts`, `src/commands/shareCommands.ts` | modify | `'accepted'` at the accept site (`shareInbox.ts:652`), `'declined'` at the decline site (`shareCommands.ts:136`). |
| `src/eventQuery.ts` | new, pure | The query-string builder, the cursor round-trip and an `isOrgEventDto` shape guard in the style of the existing response guards. |
| `src/orgEventsPanel.ts` | new | The host: fetch, own the panel, handle `loadMore` and `filterChanged`, post back rows. |
| `src/orgEventsPage.ts` | new, pure | The page: filter bar, table, "load more", CSP nonce, escaped values. |
| `src/treeDataProvider.ts` | modify | A lazy "Shares" child under a `teamMember` row for an admin and "My shares" under the account row for everyone else, loaded on expand into a map before render, the way history rows already are (`:105-110`); and the Team filter fix at `:339-340`. |
| `src/teamSearch.ts` | new, pure | `teamMemberHaystack(member)` — email, name, role, projects, lowercased and joined — fed to the existing `matchesTerms` (`treeSearch.ts:57-59`). The predicate today matches the email alone. |

## Growth

| Surface | Size | Retired by | Interrupted |
|---|---|---|---|
| `org/events/*.ndjson` | ~120 rows/day × ~400 B ≈ 50 KB/day; **~18 MB/year, kept forever** by decision 11 | nobody; both sweeps must skip it, pinned by a test | a torn last line is skipped by the reader and logged once per file |
| day files | 365/year, opened only when a query's range needs them | nobody | — |

Ten years is under 200 MB on the same disk as the vaults. That is the decision, recorded as a number
rather than as "small".

## Build order

1. `SentShare.FromEmail` and its population — everything about expiry identity depends on it.
2. `OrgEventLog.QueryAsync` + the reader's round-trip and torn-line tests.
3. Contract 3's `?outcome=` on the inbox delete, the read-before-delete, and the `share.sent` /
   `share.withdrawn` hooks.
4. The widened prune result and `share.expired`.
5. `GET /api/org/events` with scoping, filters and the cursor.
6. `http/org/events.http`.
7. Extension: the `removeShare` widening and its two call sites; `eventQuery.ts` + tests.
8. Extension: `teamSearch.ts` and the filter fix.
9. Extension: the tree rows, then the viewer panel and page.
10. Docs: `module_server.md` (endpoint, storage, the sweep exclusion), `module_extension.md` (the
    outcome parameter, the viewer, the Team search).

## Test plan

**Server**: append then query round-trip; each filter alone and combined; a non-admin cannot see
another person's rows even by asking for them by name; pagination is stable across an append made
between two pages; a torn final line does not end a query; both maintenance sweeps leave the folder
untouched (a direct filesystem assertion, the style the existing sweep tests use); an absent
`outcome` deletes the share and records `share.unknown`.

**Extension** (`node:test`): `eventQuery.test.ts` for the string and the cursor; the widened team
predicate matching by role and project and still by email; the panel's message protocol as types and
a shape test, the way the entity form's messages are tested.

## Risks

1. **Epic 1's `RequireAdmin` is a live dependency.** Until it exists, every caller reads as
   non-admin, which fails closed — but it must not ship as "done" in that state.
2. **`SentShare.FromEmail` is a schema addition to files already on disk.** Old receipts read as
   empty for up to 31 days; expiry rows in that window have no actor. Bounded and stated.
3. **The single append lock is process-wide.** Correct at this server's scale, and commented so it
   is not "optimised" into a race.
4. **Day-file enumeration order** is an OS-level assumption; the reader sorts explicitly and a test
   proves it rather than trusting the filesystem.
5. **The log records entity names.** They are already plaintext on the wire, and the umbrella's
   invariant forbids content. A reviewer should check that no new field ever carries more than a
   name and a kind.

## Definition of Done

- [ ] Both suites green; the scoping test and the pagination-under-append test were watched failing.
- [ ] An admin can answer "who shared what with Boris, when, and did he take it" from the viewer.
- [ ] A member sees their own rows and nobody else's, verified by a request that asks for someone
      else's.
- [ ] Epic 3's retention-bounded "who shared with me" for a dev's Team is switched to this log.
- [ ] `http/org/events.http` runs green.
- [ ] `module_server.md` and `module_extension.md` updated.
- [ ] The `coai` gate: `review_plan` reached `proceed`, `review_code` ran, findings resolved,
      verdicts and reviewer counts reported.
