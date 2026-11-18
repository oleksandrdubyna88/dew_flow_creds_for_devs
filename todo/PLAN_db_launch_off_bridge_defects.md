# PLAN — two defects of the local database launch: a URI's `?password=` on the command line, and `Server=,1433`

> Status: **plan only, nothing implemented yet, 2026-11-18.** Found while building E1.6 of
> [`PLAN_remote_bridge_scoped.md`](PLAN_remote_bridge_scoped.md) (its E1.6 spec §S6.13, *As built for epoch 11*), and left as they
> are there on purpose: a bridged query never reaches this code (it is built from the entry's checked fields, `bridgedDbConnection`),
> and the off-bridge launch is pinned byte for byte by a golden record. Scope: `src_vs_code/src/dbCliLauncher.ts`,
> `src_vs_code/src/dbConnString.ts`, their tests, `research/module_extension.md`. Off a bridge only: the local doors and the person's own
> runs.

## 1. The symptoms

**D1. A password written in a postgres URI's query string goes to `psql`'s command line.** `buildDbQueryLaunch` hands a postgres entry's
stored connection string to `psql` after `--`, through `withoutPassword` (`dbCliLauncher.ts:360`). `withoutPassword` removes only the
`user:password@` form (`dbConnString.ts:148-153`). A URI such as `postgresql://app@db.example.com/app?password=s3cret` keeps its query
string whole, so the password stands in the argv of the `psql` child, where any process of the same user can read it. And because the parser
reads the password only from the `user:password@` form, `PGPASSWORD` is not set for that entry: the URI's own parameter is what logs in.
The module's own header (`dbCliLauncher.ts:4-11`) promises the opposite: *only host/port/database ever reach the command line.*

**D2. A SQL Server key-value string whose server is only a port builds `-S undefined,1433`.** `Server=,1433;User Id=app;Password=…` splits
into an empty host and the port 1433 (`dbConnString.ts:66-73`). The launch then writes `${parts.host},${parts.port}` (`dbCliLauncher.ts:385`)
with the host `undefined`, so `sqlcmd` is asked for a server named `undefined`. The golden record of today's off-bridge launches keeps that
row as it is (`src_vs_code/src/test/bridgedDbOffBridgeGolden.ts:110`, *sqlcmd kv host is only a port*).

## 2. What is not decided yet (sketches, the build's to settle)

- **D1.** Two shapes. (a) Take a `password` key out of the query string, the way `withoutPassword` takes the `user:password@` part, and give
  it to `PGPASSWORD`; the rest of the query string stays (it carries `sslmode` and other settings the person chose). (b) Refuse a stored URI
  whose query string names `password`, with a sentence that says where a password belongs. (a) keeps working entries working; (b) is
  simpler. Whichever is chosen: a percent-encoded key (`%70assword`) and a doubled key must be handled (libpq decodes keys and takes the
  last value, as probe PQ2 of the bridge plan showed on `psql` 18.6).
- **D2.** Refuse an empty host after the split (the launch answers no launch, as for a missing host today), rather than guessing a default.

## 3. Build order

1. RED tests in `dbCliLauncher.test.ts`: D1's URI gives an argv in which no word holds the password (and, for shape (a), `PGPASSWORD` set);
   D2's string gives no launch.
2. The fixes in `dbConnString.ts` and `dbCliLauncher.ts`.
3. The golden record's rows for both cases change on purpose; regenerate them from the fixed builder, and say so in the commit.
4. `research/module_extension.md`: the database launch paragraph.

## 4. Test plan

- Unit: the two RED tests above, plus the percent-encoded and doubled `password` keys for D1, and `Server=:1433`, `Server=,` for D2.
- The golden-record test (`Q11` of the bridge plan's E1.6 spec) stays green after the regeneration and still fails when one row differs.
- A mutation per fix: put the password back on the argv (D1's test fails); drop the empty-host check (D2's test fails).

## 5. Definition of Done

- [ ] No word of a local `psql` argv holds a password the stored URI carried, in any of its spellings.
- [ ] A key-value string with no host gives no launch, with a sentence, and never `-S undefined,…`.
- [ ] The tests above are green, the mutations fail them, the golden record is regenerated and the module doc says what the launch does.
