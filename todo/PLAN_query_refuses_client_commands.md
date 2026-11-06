# PLAN — The `query` action refuses every road from an agent's SQL to the client's own commands

> Status: **plan only, nothing implemented yet, 2026-11-06.** Scope: `src_vs_code/src/dbCliLauncher.ts`, its test,
> `src_vs_code/CHANGELOG.md`, `research/module_extension.md`. Extension only; every door (local MCP, alias, token) goes
> through the same function. Security fix for a defect live on `main` and in every released version since 0.56.1.

## 1. The defect

`refuseQuery(dbType, query)` (`src_vs_code/src/dbCliLauncher.ts:88-117`) is the one gate between an agent's text and a
database client that holds the stored password in its environment (`PGPASSWORD`, `MYSQL_PWD`, `SQLCMDPASSWORD`;
`agentUseActions.ts:344-347` calls it, `buildDbQueryLaunch` re-checks at `:157`). The promise is that an agent USES
the credential without receiving it. Four holes, measured on 2026-11-06 by an Opus reviewer running the real function
and real clients against a fake server on loopback (nothing left the machine):

| # | Input that passes today | What the client then does | Measured |
|---|---|---|---|
| D1 | `connect somedb <host>` for `mysql` | `connect` is not in `MYSQL_CLIENT_WORDS` (`:59`). mysql 8.4.11 opened a connection to the host the query named, on the entry's port, went TLS without verification, accepted a `caching_sha2_password` full-auth request and **sent the stored password in plaintext** to that host. A second line after `select 1;` passes too. MariaDB 11.8.6 connected with an empty password | yes, both clients |
| D2 | `ssl_session_data_print <path>` for `mysql` | the word regex `/^([a-z]+)(?:\s|$)/` (`:104`) cannot match an underscore. Writes a laptop file | the gate; not run |
| D3 | `＼! …` (U+FF3C FULLWIDTH REVERSE SOLIDUS) for any type | on Windows the client's C runtime narrows `argv` with the system code page and **best-fit** folds the fullwidth character to `\`; `tar.exe -tf "＼x！"` under ACP 1252 printed `\x!`. `psql.exe` 17.5 imports `__p___argv` only, no `activeCodePage` in its manifest (read statically), so its first-character test sees `\` and `\!` runs a shell holding `PGPASSWORD`. mysql's "no backslash anywhere" rule (`:96`) is defeated the same way | strong inference; the last link (psql.exe itself) was not run, and the plan does not depend on running it |
| D4 | `select 1\r:!! whoami` and `ed` for `mssql` | `split(/\r?\n/)` (`:89`) does not treat a bare CR as a line break; `ed` opens the editor named by the environment, which inherits `SQLCMDPASSWORD` | the gate; sqlcmd's reading of a bare CR and of `ed` inside `-Q` is not established |

Also found, in scope because the fix touches the same lines: the brief's premise that the launcher prefixes a space to
psql's `-c` string is **not on `main` at 8723fe2** (`:178` passes `query` as is); the reviewer measured on psql 18.6 that a
leading space sends the whole string to the server as SQL, which §2.3 turns into a deliberate measure.

## 2. The rules, decided

The stance stays the one the file already states (`:74`): prove the shape, never sanitize. Every refusal is one sentence
that names nothing from the query except the word or code point it refuses.

### 2.1 mysql: refuse by the client's whole command list, minus the two that are SQL

The client's long-form commands (MySQL 8.4 `help` listing; MariaDB's is the same set without `query_attributes`,
`resetconnection` and `ssl_session_data_print`): `?`, `charset`, `clear`, `connect`, `delimiter`, `edit`, `ego`, `exit`,
`go`, `help`, `nopager`, `notee`, `nowarning`, `pager`, `print`, `prompt`, `query_attributes`, `quit`, `rehash`,
`resetconnection`, `source`, `ssl_session_data_print`, `status`, `system`, `tee`, `use`, `warnings`. Short forms are all
backslash forms and stay under the blanket backslash rule.

Judged one by one, the question being *does refusing it lose SQL a person writes?*

| Word | Effect in the client | Collides with SQL? | Decision |
|---|---|---|---|
| `system`, `edit`, `pager`, `nopager` | runs a local program, environment inherited | no | refuse |
| `source`, `tee`, `notee`, `ssl_session_data_print` | reads or writes a laptop file | no | refuse |
| `connect` | opens a connection to an agent-named host with the stored password (D1) | no | refuse |
| `delimiter` | changes where the client splits statements, so a later command can sit where this gate sees the middle of a statement | no | refuse |
| `charset`, `clear`, `ego`, `exit`, `go`, `nowarning`, `print`, `prompt`, `query_attributes`, `quit`, `rehash`, `resetconnection`, `status`, `warnings` | harmless: formats, prints, or ends | no: none is a MySQL statement (`SHOW STATUS`, `SHOW WARNINGS`, `SET CHARSET` start with another word) | refuse — nothing is lost, and a word that is not SQL has no business at a statement start |
| `use` | the client checks the name and sends `USE db` to the server; no local effect | **yes**, `USE orders;` is ordinary SQL | allow |
| `help` | bare: prints the client's help; with an argument: sends `HELP 'x'` to the server | **yes**, `HELP 'contents'` is server-side SQL; both forms are harmless | allow |
| `?` | prints the client's help | not a word; a query starting with `?` is not SQL anyway | not in the list; harmless |

So `MYSQL_CLIENT_WORDS` becomes the table above minus `use` and `help`, and the word regex becomes
`/^([a-z_]+)(?:\s|$)/` so that `ssl_session_data_print` and `query_attributes` are words. One list, one comment per
group saying why, so a reader does not re-derive it.

**Statement start, comments and the mid-line case.** A command is recognised when the client's buffer is empty, which
is true at the start of the `-e` string, after a newline, and after the delimiter; this gate already splits on `;` and
newlines (`:100`). Two roads around that:

- *A leading comment.* `/*x*/connect y`: whether the client recognises `connect` after a stripped comment depends on
  `--comments`, whose default **differs** between the two clients (read from `--help` of the downloaded binaries:
  mysql 8.4.11 `comments TRUE`, mariadb 11.8.6 `comments FALSE`). Rather than depend on either, the first word of a
  statement is taken **after skipping leading comments** (`/* … */`, `-- ` to end of line, `#` to end of line) and
  leading whitespace, so a comment can never hide a word from this gate. Whether the client would have run it is not
  established and does not need to be.
- *Mid-line with named commands on.* `--named-commands` (`-G`) makes the long forms recognised anywhere a line starts
  a command; a `[mysql]` section of a `my.cnf` the agent never sees can turn it on, and `delimiter=//` in the same file
  changes the split. The launch does not pass `--no-defaults` on `main`, and **should not**: it would drop the
  person's `ssl-ca`, `ssl-mode`, `default-character-set`, socket and `login-path` settings, which is real function.
  Instead the launch passes two explicit options, which win over option files by the client's own precedence:
  `--skip-named-commands` and `--delimiter=;`. Both options exist on both downloaded clients (`--help`, read
  2026-11-06), so the person's other settings survive and the two that change how an agent's text is parsed are
  pinned. `--local-infile=0` is **not** added here: the bridge plan owns that decision and files the local flag as a
  todo (`feat/remote-bridge-e1` · `todo/PLAN_remote_bridge_scoped.md` §4.11 and §8); this plan does not take it.

**Known over-refusal, accepted.** The split ignores quotes, so `select 'a; system b'` is refused as `system` today and
stays refused. The sentence names the word, the person rewrites with `CHAR()` or another word. Parsing SQL to be
exact here would be the sanitizing the file refuses to do.

### 2.2 The folded form: a shape rule before every other check, on all platforms

Best-fit narrowing is a Windows C-runtime behaviour, but the rule is applied everywhere so that a query is accepted
or refused the same way on every machine and the tests prove one function. The rule, in order, chosen as the smallest
sound one:

1. **NFKC-to-ASCII.** Refuse any character `c` whose `c.normalize('NFKC')` consists only of ASCII and differs from `c`.
   This is the whole fullwidth block (`＼` U+FF3C, `！`, `；`, `／`, `Ａ`…), `﹨` U+FE68, the Greek question mark U+037E
   (`;`), superscripts, ligatures, and U+00A0 (no-break space). Checked in Node 2026-11-06: U+FF3C and U+FE68 fold to
   `\`, U+FF1B and U+037E to `;`, U+00A0 to a space, U+042F (Cyrillic) and U+2028 stay themselves.
2. **A short named list** of characters NFKC leaves alone but a Windows best-fit table folds to a character the shape
   rules reason about (`\ / - # : ; ! * ' "` and the ASCII letters): at least `∖` U+2216 SET MINUS and `⧵` U+29F5
   REVERSE SOLIDUS OPERATOR (to `\`); `¥` U+00A5 and `₩` U+20A9 (the `\` position under code pages 932 and 949);
   `∕` U+2215 and `⁄` U+2044 (to `/`, which opens a comment); the dashes U+2010–U+2015 (to `-`, which opens a `-- `
   comment). The coder **derives the list from Microsoft's published WindowsBestFit tables** (hosted at unicode.org
   under `Public/MAPPINGS/VENDORS/MICSFT/WindowsBestFit/`, one file per code page: 874, 932, 936, 949, 950, 1250–1258),
   restricted to those targets, and commits it as data with the source file named per row; a hand-typed list is the
   draft, not the result. If the tables cannot be read, the hand list above ships and the plan's "found" list says so.

Legitimate non-ASCII data keeps working: Cyrillic, CJK, accented Latin and emoji are untouched by both steps, so
`select * from t where name = 'Яблоко'` runs on Linux and macOS as today. **What the rule misses:** a code page not in
the published set, and any folding done by something other than the client's C runtime (a client that re-encodes its
own argv). Both are named rather than claimed covered.

**How the other checks see the folded form.** They do not fold. The fold rule runs first and refuses, so by the time the
backslash and line-start checks run, no character in the text can become `\`, `:`, `!`, `/`, `-` or a letter on a
narrow `argv`; the existing checks therefore stay on the original text and need no second form. The refusal sentence:
`Refused: the character U+FF3C can become ASCII on a Windows command line, where the client reads it as a client
command. Send the query without it.` (only the code point is named).

### 2.3 psql: a leading space on `-c`, and the line-start rule stays as margin

psql takes the `-c` string as **one meta-command only when its first character is `\`**; otherwise the whole string is
one request to the server, where a `\!` on any later line is a syntax error (reviewer, psql 18.6, measured both ways:
`select 1; \! touch m1` and `select 1;\n\! touch m2` reached the server as text, and a string that began with a space
did too). So `buildDbQueryLaunch` passes `' ' + query` at `:178`. That single space defeats the first-character case on
every platform **including the folded one**: on Windows the first byte is the space whether or not a later character
folds to `\`. What remains for a later `\` in a line is nothing in psql's `-c` path, so the existing "no line starts
with a backslash" check (`:92`) stays as margin and as a readable refusal instead of a server error. The space is
asserted by a test, with the reason in the test's name, so nobody removes it as whitespace.

### 2.4 mssql: a bare CR is a line break; `ed` is a line-start command; `-X1` only after a measurement

- Lines are split on `/\r\n|\r|\n/` for **all three types**, not only mssql: a bare CR is a line break to every client
  worth guarding against, and the one split lives in one place.
- `ed` joins `:` and `!!` at a line start (`:111`): it opens the editor named by the environment with
  `SQLCMDPASSWORD` in that environment. `GO`, `RESET`, `QUIT`, `EXIT` stay allowed: they end or reset, run nothing.
- `-X1` (disable commands that could compromise the system; with `1`, exit on one) is **not added by this plan until
  measured**: sqlcmd's documentation also lists "environment variables passed to sqlcmd" among what `-X` disables, and
  the launch needs `SQLCMDPASSWORD` and `SQLCMDUSER` from the environment (`:195`, `:162`). If a measurement with a real
  sqlcmd shows the launch still authenticates under `-X1`, add it as defence in depth in a follow-up commit with the
  version measured in the commit message; if it drops the credential, record that in the "found" list and do not add
  it. Whether `-Q` even parses `ed` or a bare CR as a command is likewise not established; the line-start refusal
  costs nothing either way.

## 3. Build order

1. **RED tests first** (`src_vs_code/src/test/dbCliLauncher.test.ts`), one case per row of §4.1, watched failing
   against `main`'s function, failure messages kept for the summary.
2. **Split `refuseQuery`** so each piece is under the repo's complexity limit of 4 (`eslint.config.mjs:32`) and the
   `eslint-disable-next-line complexity` at `:87` goes away rather than widening: `refuseFolded(query)`,
   `refusePostgres(lines)`, `refuseMysql(query)`, `refuseMssql(lines)`, and `refuseQuery` as the dispatcher. The word
   list, the fold list and the comment-skipping helper are module constants beside `MYSQL_CLIENT_WORDS`. If the file
   nears 800 lines (`eslint.config.mjs:30`; it is 211 today) the fold list moves to its own data module; it should not.
3. **The launch changes**: `' ' + query` for psql; `--skip-named-commands` and `--delimiter=;` for mysql, placed before
   `-e`; mssql's argv unchanged unless §2.4's measurement says otherwise.
4. `npm run typecheck`, `npm test`, lint, in `src_vs_code`, at lowered priority.
5. **Documents**: a `### Fixed — security` entry under `## [Unreleased]` in `src_vs_code/CHANGELOG.md:8`; a paragraph
   under `research/module_extension.md:5031` (*Client meta-commands are a shell escape (0.56.1)*) recording the four
   holes, the rules of §2 and the versions read; this plan's "found" list filled; then promotion per planning-docs.
6. The `coai` plan round before step 1 and a code round on the finished branch (CLAUDE.md § Review gate); the PR body
   says how many reviewers answered.

## 4. Test plan

### 4.1 RED cases, exact inputs (`BS` = backslash, `NL` = newline, `CR` = carriage return)

| Type | Input | Expected | Today |
|---|---|---|---|
| mysql | `connect somedb 127.0.0.2` | refused, sentence names `connect` | passes |
| mysql | `CONNECT somedb 127.0.0.2` | refused | passes |
| mysql | `select 1;` + NL + `connect somedb 127.0.0.2` | refused | passes |
| mysql | `ssl_session_data_print /tmp/x` | refused, names `ssl_session_data_print` | passes |
| mysql | `delimiter //` | refused | passes |
| mysql | `/*x*/connect y`, `-- x` + NL + `connect y`, `# x` + NL + `connect y`, `  /* a */ /* b */ system id` | refused | the first passes |
| mysql | every remaining word of §2.1's refuse rows, as `<word> x` | refused, names that word | most pass |
| mysql | `use orders`, `USE orders;`, `help contents`, `HELP 'contents'`, `select system_user()`, `select * from pager_log`, `select * from connect_log`, `select status from jobs` | allowed | allowed |
| all three | `＼! id` (U+FF3C), `﹨! id` (U+FE68), `∖! id` (U+2216), `⧵! id` (U+29F5), `select 1 ¥! id` (U+00A5), `∕*x*∕connect y` (U+2215), `select 1 –– x` (U+2013), `select` + U+00A0 + `1` | refused, sentence names the code point and nothing else | pass |
| all three | `select 'Яблоко'`, `select '日本語'`, `select 'café'`, `select '🍎'` | allowed | allowed |
| mssql | `select 1` + CR + `:!! whoami` | refused | passes |
| mssql | `ed`, `  ED`, `select 1` + NL + `ed` | refused | passes |
| mssql | `select 1` + NL + `GO`, `RESET`, `select 1` + NL + `EXIT` | allowed | allowed |
| postgres | `select 1` + CR + BS + `! id` | refused | passes |
| postgres launch | `buildDbQueryLaunch('postgres', PG, 'select 1')` | `args[1] === ' select 1'` (the index after `-c`) | `'select 1'` |
| mysql launch | argv contains `--skip-named-commands` and `--delimiter=;`, both before `-e`; no `--no-defaults` | — | neither |
| refusal text | for each refused input, the sentence contains no other substring of the query than the named word or `U+XXXX` | — | — |

The last row is one test over every refused case: it asserts the sentence does not contain the input's second token,
which is how "names nothing but the word" is proven rather than read.

### 4.2 Mutation checks (each one must turn a test red)

- Remove `connect` from the word list → the `connect` rows go red.
- Change the word regex back to `[a-z]+` → the `ssl_session_data_print` row goes red.
- Delete the comment-skipping → the `/*x*/connect y` row goes red.
- Delete step 1 of the fold rule → the U+FF3C row goes red; delete step 2 → the U+2216 row goes red.
- Replace the line split with `/\r?\n/` → the CR rows go red.
- Drop the leading space, `--skip-named-commands` or `--delimiter=;` → the launch rows go red.
- Re-add `use` to the word list → the `USE orders;` row goes red (the allow side is tested, not assumed).

### 4.3 A live leg: what CI has, and what is proved at unit level only

`.github/workflows/ci-extension.yml` installs no database client (it installs `openssh-server` for the live ssh login,
`:144-146`); `ci-clients.yml` installs none. The GitHub `ubuntu-latest` image is believed to carry `mysql` and `psql`
clients, but **that is not verified here**. So the live leg is modest and server-free: a step that, for each of
`mysql`, `mariadb`, `psql` found by `command -v`, asserts from `--help` that the options this plan relies on still
exist (`--skip-named-commands`/`--named-commands`, `--delimiter`, and psql's `-c`), and prints `skipped: <client> not
on this runner` otherwise, so a client that drops an option fails CI instead of failing the person. Everything about
what a client *does* with a given string is proved at unit level only, and the research paragraph says so, with the
versions actually read on 2026-11-06: mysql 8.4.11-0ubuntu0.26.04.1 and mariadb 11.8.6 (client 15.2), Linux, by
`--version` and `--help`; psql 18.6 by the reviewer's measurement; psql.exe 17.5 statically (imports and manifest);
no sqlcmd of any version was run.

## 5. Out of scope, said once

- The bridge work on `feat/remote-bridge-e1` and its `--local-infile=0` on bridged launches; that plan's §4.11 cites
  this fix and merges `main` afterwards. The local `LOAD DATA LOCAL INFILE` flag stays that plan's §8 todo.
- The local MCP door serving `connectionString` to a local agent (the same plan's D12 todo).
- What Windows best-fit does to Cyrillic today: under ACP 1252 a Cyrillic query reaches `mysql.exe` or `psql.exe` as
  `?` characters, wrong data rather than a leak; under ACP 1251 it survives. Filed in §7, not fixed here.
- `-X1` for sqlcmd beyond §2.4's measurement; `mongosh`, refused outright already.

## 6. Definition of Done

- [ ] Every row of §4.1 was watched **failing** against the unchanged function, then passes; the summary quotes one
      failure message and the pass.
- [ ] Every mutation of §4.2 was tried and turned at least one test red.
- [ ] `refuseQuery` carries no `eslint-disable` for complexity; `npm run typecheck`, `npm test` and lint are green in
      `src_vs_code` at lowered priority; `dbCliLauncher.ts` stays under 800 lines.
- [ ] The fold list is derived from the published best-fit tables with its source named per row, or the "found" list
      says the tables were not read and the hand list shipped.
- [ ] psql's `-c` string begins with a space; mysql's argv carries `--skip-named-commands` and `--delimiter=;` and no
      `--no-defaults`; mssql's argv is unchanged unless `-X1` was measured to keep the credential.
- [ ] The CI step of §4.3 exists and reported once (green or `skipped`) before the PR merges.
- [ ] `src_vs_code/CHANGELOG.md` has the `### Fixed — security` entry; `research/module_extension.md` records the
      four holes, the rules and the versions read; no real host, address or token anywhere in the diff.
- [ ] `coai`: a `review_plan` round reached `proceed` before step 1, a `review_code` round ran on the finished branch,
      every finding resolved, the PR body reports the verdicts and how many reviewers answered.
- [ ] `node .claude/rules/shared/tools/plan-lifecycle.mjs` and `pin-check.mjs` pass; this plan is promoted with its
      deviations in the same task that finishes it.
- [ ] The owner has heard that a release must follow: `extension-v1.17.0` (published 2026-11-06) carries the defect.

## 7. Found along the way (filled by the coder; opened here)

- Windows best-fit turns Cyrillic and other non-1252 text into `?` before `mysql.exe`/`psql.exe` see it: wrong data,
  silently, on a Western-code-page machine. A fix would spawn the client with a UTF-8 code page or a manifest it does
  not have. Separate plan.
- The brief's "leading space already on the launcher" was not on `main`; §2.3 adds it. Check whether another branch
  carries it so the merge does not double the space.
