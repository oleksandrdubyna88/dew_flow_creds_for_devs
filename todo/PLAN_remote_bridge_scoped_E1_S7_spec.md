# PLAN — E1.7 spec: the database execution profiles — what a bridged database client may log in with, per client and system

> Status: **spec, 2026-11-17, by Fable, written as a security spec (authentication: what a database client may answer a server with) before its code. Nothing of it is built, and no probe of it has run.** Revised on 2026-11-18 with the findings accepted at its plan gate round and at the Opus judge's review (§S7.16, *Decided at the review*).
> Story E1.7 of [PLAN_remote_bridge_scoped_E1.md](PLAN_remote_bridge_scoped_E1.md) (parent [PLAN_remote_bridge_scoped.md](PLAN_remote_bridge_scoped.md):
> *Reading this plan* (the ninth and the tenth lesson), §2.1 Q15-Q18, §4.9 rows 7-13, §4.11 whole, §5 step 3f, §7 (the probes PK1, PS1, PP1, PA1
> and PE1, legs (u)-(w), *The database profile*, M11), §8, §9 (the database line and the invariant line), `## Epics` E1). The parent is approved
> at epoch 11, which has no entry, and is not edited here. This spec changes no scope, contract, decision or merge condition of the parent
> (§S7.16 says how that was checked). Where the parent is silent the point is in §S7.16, and the spec builds the safe side.
> What is built before it: the E1.6 spec [PLAN_remote_bridge_scoped_E1_S6_spec.md](PLAN_remote_bridge_scoped_E1_S6_spec.md) §S6.15 (Z0-Z7) and its
> As built (§S6.13), merged to `main` as `e18fd420` (#365): the gate with no pair served, the connection built from the entry's fields, the refusals.
>
> Scope: `src_vs_code/src` (`bridgedDbProfile.ts`, `bridgedDbSentences.ts`, `dbCliLauncher.ts`, `agentUseActions.ts`; new `bridgedDbClient.ts` and
> `bridgedDbQuery.ts`; for the refusal before the dialog (§S7.8) one field in `brokerRequests.ts`, one argument on a standing line of
> `credsAgentServer.ts`, the wall's entry refusal in `bridgeWallSource.ts` and a comment in `bridgeScope.ts`; one wiring line in `extension.ts`,
> for the client check); the tests of §S7.11;
> `src_vs_code/scripts` (`bridged-psql-itest.cjs`, `bridged-mysql-itest.cjs`, new `bridged-sqlcmd-itest.cjs`, their `lib/` files, `run-itests.mjs`);
> `src_vs_code/package.json` (one `itest:` line); `.github/workflows/ci-extension.yml` (the rig steps and jobs of §S7.3);
> `research/module_extension.md`, `research/module_tests.md`. No UI, no command, no help article, no client (`src_cli`, `src_mcp`,
> `src_broker_client` have an empty diff), no CHANGELOG bullet (§S7.15).

Every path is relative to `src_vs_code/src/` unless it starts with `scripts/`, `todo/`, `research/` or `.github/`. Every `file:line` was opened
on `e18fd420` on 2026-11-17; the lines the revision added (G2, G3, G6, G11) were opened on the same commit on 2026-11-18.

**How to read this spec.** **[C]** marks a contract: the coder builds against it and a test or a leg pins it. **[S]** marks a sketch: a name, a
shape, a rig detail or an order that the coder may replace, with the reason in §S7.20. A line in §S7.0 with no mark is an observation, with its
date. A control named for a client is a **candidate** until its probe has answered on that client, version and system (parent §4.11, part 2).
A candidate is never built for a pair before that pair's probes.

**The invariant. [C]** *A bridged query may use only the selected entry's own authentication material; ambient configuration and
server-negotiated authentication cannot enlarge that authority.* (Parent §4.11.) Every step below is read against it.

**What this story does.** E1.6 built parts 1 and 3 of the execution profile and a gate that serves no pair. E1.7 builds parts 2 and 4 for each
pair it can measure: the probes, the authentication controls the probes choose, the database client check with its floors, the gate's refusal
before the consent dialog, the keys Q15 lets it add, legs (u)-(w), and each measured pair's row turned to served. A pair it cannot measure stays
refused, and the PR says which and why.

## S7.0 — Facts this spec rests on

| # | Fact (verified on `e18fd420`) | Consequence |
|---|---|---|
| G1 | The gate table `BRIDGED_DB_PROFILES` (`bridgedDbProfile.ts:25`) holds nine rows, `psql`, `mysql` and `sqlcmd` on `linux`, `win32` and `darwin`, none served. A row (`DbProfileRow`, `:15-19`) has a client, a platform and `served`. It names no vendor and no version. `bridgedDbPair` (`:33-37`) reads a row by client and platform. DP1 pins that none is served | E1.7 gives a row its vendor, its recorded builds and the record of its runs (§S7.7). `mysql` is two clients under one program name, and so is `sqlcmd` |
| G2 | The order in `dbQueryAction.run` (`agentUseActions.ts:611-686`): the entry; its type; the gate (`:621`); the stored connection is read (`:629`); §S6.15 Z2's refusals (`:636`); `refuseQuery` (`:654`); the launch is built (`:660`), and a launch that is `undefined` answers the main port's sentence about a client that is never launched, to the caller as written (`:661-666`); a missing client answers `tool_missing` (`:667-672`); the exec slot (`:673`); the spawn (`:678`) under `bridgedSshEnv(process.env, process.platform, launch.env)` (`:680`). The spawn names no `cwd`, and its program is the bare word `launch.exe`. The gate is asked in `run`, so after the Allow. The file has 743 lines, and `run` already switches off the length and the complexity checks (`:610`) | §S7.6 writes the bridged order and puts it in a module of its own. §S7.8 asks the gate before the dialog too |
| G3 | Before anybody is asked, the broker calls `usable` (`credsAgentServer.ts:549-570`): the action's `validate(body, grant)` (`:562`), then for a bridged grant `referenceRefusal` (`bridgeScope.ts:316-318`), which asks the wall's `entryRefusal` first (`:60`, `:304-310`). On a refusal `usable` drops the grant (`:566`) and answers through `respondError` with the refusal's code and message and with `undefined` as the journal's detail (`:567`), and `respondError` then journals the message itself (`:742`, `detail ?? message`). A `Refusal` is a code and a message and has no other field (`brokerRequests.ts:24`). So on this road the agent and the journal read the same words. The wall's suppliers are built by `wallSuppliersOf(vault)` (`bridgeWallSource.ts:17-24`); its `entryRefusal` reads the entry's details (the agent-forwarding refusal, `:24`). **No production code wires a wall yet:** `bridgeWall` is an optional hook (`brokerHooks.ts:173`) that `extension.ts` does not set, and E2.2 wires it. The scenarios build their wall from the same `wallSuppliersOf` (`test/bridgeWallWorld.ts:364`; L4 of `test/bridgeLinks.test.ts:164` is the agent-forwarding refusal before anybody is asked). Consent is asked after `usable` (`credsAgentServer.ts:537`). `validate`'s target type has no bridge (`useActions.ts:19`). `credsAgentServer.ts` has 795 lines of 800. Through a bridge a database entry has the one action `query`: `rotate` is refused by the allow-list (`bridgeAllowList.ts:94`) | A road before the dialog exists for a bridged entry. As it stands it cannot say DR1 to the journal and the generic sentence to the agent, and it ends the grant. §S7.8 says what it needs, in which files, and that production gets it with E2's wiring |
| G4 | The bridged launch (`dbCliLauncher.ts:251-267`, `:272-276`). `psql`: `-X`, `-c`, the query with its leading space, `--`, the string of `bridgedPsqlString` (`bridgedDbProfile.ts:398-405`): `host`, `port`, `dbname`, `user`, the three settings, then `passfile`, `sslcert`, `sslkey` at the absent file. `mysql` (`:285-293`): `--no-defaults`, `--protocol=TCP`, `-h`, `-P`, `-u`, `-D`, the three pins, `-e`. `sqlcmd` (`:296-299`): `-S host[,port]`, `-d`, `-Q`, `-b`, `-x`, with `SQLCMDUSER` (`:279`). The programs are the bare words `psql`, `mysql`, `sqlcmd` (`:24-28`) | The authentication controls are added here (§S7.5). libpq takes the last value of a keyword written twice (PQ2-d3), so a control stands last |
| G5 | The bridged environment is `PATH` and `HOME` off Windows, and seven names on Windows, with `USERNAME`, `USERDOMAIN` and `LOGONSERVER` asked for empty (`bridgedSshEnv.ts:17-24`). It holds no `KRB5CCNAME`, no `KRB5_CONFIG`, no `APPDATA`, and no `PG…`, `MYSQL…`, `LIBMYSQL…` or `SQLCMD…` name but the ones the launch adds | A bridged client finds a ticket cache, a realm file and a profile folder only by its own defaults. A positive control must put the identity where those defaults look (§S7.3, rule R2) |
| G6 | The `ssh` client check (`bridgedSshClient.ts`): a pure reading of the version answer (`:63-76`) against a floor constant (`:28`); one spawn of `-V` under `bridgedSshEnv` with no extra name, in a folder of its own that holds nothing and is removed (`:134-151`, `:184-192`), bounded at 10 s (`:81`); each ask names a folder of its own (`:185`, `callKeyName()`); a good verdict kept per program word for the life of the check, a bad one not kept (`:117-131`); a request that ended goes on as ended; a runner that cannot start the program is a client that did not answer, with the cause in the journal (`:154-160`). Two calls that arrive before a verdict is kept both spawn: nothing joins them (`:119-131`). Production builds one check per window (`sshUseActions.ts:555`) | The model of §S7.6, which adds what the model does not have: one check in flight per program, and a verdict bound to the file that answered |
| G7 | The profile's settings: `sslmode`, `connect_timeout` and `application_name` for a postgres URI (`bridgedDbProfile.ts:249-253`); none for `mysql` and `mssql`; the key-value keys of `:199-202`; a `sqlcmd` host is one plain host name (`:294`) | §S7.9 widens this list, key by key |
| G8 | The harnesses: `scripts/bridged-psql-itest.cjs` with `scripts/lib/psqlRig.cjs` (a fake that asks for a clear-text password, a fake that requests a client certificate; PD2, PD3, PQ2, legs (r) and (s)) and `scripts/bridged-mysql-itest.cjs` (a fake that completes the handshake; leg (m), PD1, PM1, leg (t)). Both say *POSIX only*. There is no `sqlcmd` harness. No leg starts a real database server. No fake asks for GSSAPI or SSPI or switches the authentication plugin | Every rig of §S7.3 is new |
| G9 | CI (`.github/workflows/ci-extension.yml`): `build-test` on `ubuntu-latest` installs Oracle's `mysql` client and unpacks MariaDB's (`:182-189`), installs `postgresql-client` (`:201-202`) and runs the two harnesses (`:193-194`, `:207-208`). The matrix on `ubuntu-22.04` and `ubuntu-24.04` runs the bridged `ssh` harness only (`:241-279`). `runner-windows` runs PW1 (`:328-329`). There is no macOS job. Other workflows start containers (`docker.yml:98`) | PW1's record (parent §7): on `windows-latest` `psql` was not on `PATH`, `mysql` 8.4.13 and a `sqlcmd` 15.0 answered |
| G10 | `toolCheck.ts` offers a person `psql` (`:60-68`), `mysql` (`:69-74`: `Oracle.MySQL` by winget, `mysql-client` by apt) and `sqlcmd` (`:75-83`: `Microsoft.Sqlcmd` by winget, `sqlcmd` by apt) | These are the clients a person is led to. PA1 says which builds they are |
| G11 | `onPath` (`installFlow.ts:91-102`) asks `where` or `which` under the extension host's own environment and answers yes or no. It returns no path. The one place that turns a bare program word into a file is `spawnableSshProgram` (`sshProgram.ts:371-385`): on Windows, the first `ssh.exe` in an absolute folder of `PATH`, with a relative folder skipped | §S7.6's resolver widens that walk to a named program on every system. It does not copy it |

**From memory or from documentation, not run.** Each line is settled by the probe named, and nothing is built on it before that probe.

| # | Statement | Settled by |
|---|---|---|
| N1 | libpq knows `require_auth` and `sslcertmode` from version 16, and `gssencmode` from 12. An older libpq refuses a connection string that holds a keyword it does not know | PA1 |
| N2 | A libpq built with GSSAPI, under `gssencmode=prefer` (its default) and with a ticket cache in reach, asks the server for GSS encryption before anything else, and the token that follows is made from the ticket. `gssencmode=disable` stops that request. `require_auth` acts later, on the server's authentication request, so it does not stop the encryption request | PK1 |
| N3 | `psql --version` prints `psql`'s own version. It does not print the version of the libpq it loaded, and the two can differ | PA1; §S7.6 |
| N4 | A server that logs a client in with no authentication request (`trust`, `ident`, `cert`) is `none` to `require_auth`. `ident` asks the client's computer for the operating-system user of the connection | PE1 |
| N5 | On Windows libpq answers an SSPI request with the person's logon, and finds `%APPDATA%\postgresql\` (`pgpass.conf`, the certificate, `psqlrc.conf`) through the system, not through a variable | PK1 on `windows-latest` |
| N6 | Oracle's `mysql` loads authentication plugins from its plugin folder when a server switches to one: Kerberos, LDAP SASL, the cloud key file (`authentication_oci_client`), a security key (`authentication_webauthn_client`, earlier `authentication_fido_client`), and more in later versions. Built in: the password plugins, and `mysql_clear_password`, which is refused unless a flag, a variable or an option file enables it. On Windows `authentication_windows_client` is built in. `--plugin-dir` names the folder | PA1, PK1 |
| N7 | MariaDB's client loads `auth_gssapi_client`, `dialog`, `mysql_clear_password`, `caching_sha2_password` and others from its plugin folder; `mysql_native_password` is built in | PA1, PK1 |
| N8 | go-sqlcmd makes a SQL login when it is given a user and a password, and an integrated sign-in when it is given no user; it has `--authentication-method`; its own configuration file lives under the home folder. The ODBC `sqlcmd` uses trusted authentication when it is given no user. Driver 18 encrypts by default | PS1 |
| N9 | What the CI images carry: a PostgreSQL and a MySQL server on the Ubuntu images, stopped; PostgreSQL on `windows-latest` with `psql.exe` outside `PATH`; containers on the Linux runners only | PA1's inventory |
| N10 | On Debian and Ubuntu the `psql` on `PATH` is a link to a wrapper script of the packaging (`pg_wrapper`). The wrapper chooses which installed version to start, from the cluster configuration, from a variable and from a file under the home folder (`~/.postgresqlrc`), and it reads the name it was started by. All installed versions load the system's one libpq | PA1-i |
| N11 | In MariaDB's client `mysql_clear_password`, and other plugins, may be linked into the client library instead of loaded from the plugin folder, by the build. A plugin that is linked in is not kept out by `--plugin-dir`. MariaDB Connector/C has an option `restricted_auth`, a list of the plugins the client may use. Whether the `mariadb` program takes it as a flag is not known | PA1-d, PA1-e, PK1-m5 |
| N12 | go-sqlcmd reads a user written as `DOMAIN\user` as a Windows account and signs in with NTLM, with the password it was given. `--authentication-method=SqlPassword` is expected to keep that a SQL login | PS1-8 |
| N13 | Both `mysql` clients refuse a plugin name that holds a path | PK1-m7 |
| N14 | On Windows libpq also answers a server's GSSAPI request (7): through SSPI's Kerberos package, or through MIT's library where the build carries it (`gsslib`). Outside a domain neither has a ticket | PK1-w4 |
| N15 | An NTLM sign-in names the account in the clear: after the receiver's challenge (message 2) the client's answer (message 3) holds the user name and the domain or computer name as plain fields. A Kerberos token names nobody a fake can read | PK1-w0, PK1-m6 |
| N16 | A version line names more than a version. `psql` on Debian and Ubuntu prints the package after it (`(Ubuntu 18.6-1.pgdg24.04+1)`); an upstream build prints nothing there. Oracle's `mysql` prints its system and the distribution's words; MariaDB's prints `for debian-linux-gnu`. go-sqlcmd is one static file. The ODBC `sqlcmd` loads a driver that its version answer does not name | PA1-a |
| N17 | SQL Server LocalDB is reached by an instance name over a named pipe and has no TCP listener | rig Q |
| N18 | Windows looks for a program's libraries in the program's own folder, then in the system folders, then in the current folder | not probed here: §S7.6 keeps the folder that holds nothing as a defence and claims no more for it |

## S7.1 — Entry conditions

- **E1. E1.6 is merged.** Met: `e18fd420` (#365). The production table serves no pair (G1).
- **E2. Epoch 11 is open and has no entry.** Read on this tree (the parent's ledger, 2026-11-17). This spec adds none. A step that cannot be
  built without changing a contract of the parent is not built: the coder stops and the lead decides
  (`.agents/conventions/common/plan-change-control.md`; in doubt it is a change).
- **E3. Re-read at the start.** `agentUseActions.ts`, `dbCliLauncher.ts`, `bridgedDbProfile.ts`, `bridgeScope.ts` and `credsAgentServer.ts` at
  their `main` state. If one changed since `e18fd420`, G2, G3 and G4 are checked again before the first test is written.
- **E4. The PR opens when it is first buildable**, which is V0's first probe commit, and CodeRabbit is read before the inventory of behaviour is
  called complete (the parent's process line for E1's stories).

## S7.2 — The order

**[C]** Probes first, each beside its positive control, each in a commit that adds only the probe and is watched on CI before the code that
depends on it. Then the RED tests. Then the code. Then the legs as assertions, the rows, the mutations and the documents.

| Step | What | Section |
|---|---|---|
| V0 | The rigs, and PA1: what each image carries, each client's version line, which controls it knows | §S7.3, §S7.4 |
| V1 | PK1, PS1 and PP1, as record legs | §S7.4 |
| V2 | PE1, with the launch written by hand in the shape V3 will write | §S7.4 |
| V3 | RED tests, then the authentication controls in the launch | §S7.5, §S7.11 |
| V4 | RED tests, then the database client check and the floors | §S7.6 |
| V5 | RED tests, then the gate's refusal before the consent dialog | §S7.8 |
| V6 | The keys Q15 lets this story add, each with its leg, for a pair that will be served | §S7.9 |
| V7 | Legs (u), (v) and (w): the probe cases as assertions through the real builder and the real check, under a **candidate table** the harness hands them | §S7.12, §S7.7 |
| V8 | A pair's row turned to served, one commit per pair. Then the same legs on that commit **against the production table**, on CI, before the merge | §S7.7 |
| V9 | The mutations | §S7.13 |
| V10 | The documents, the PR body, and M11 | §S7.14, §S7.15 |

**Why V7 runs under a candidate table. [C]** While the production table serves no row for a client, the real check starts nothing (§S7.6
item 1). A leg through the real check and the production table therefore cannot run before the row is turned, and the row may be turned only
after that leg passed. So, until a row is turned, a leg takes its table as an argument: the production table with the one candidate row put in
(§S7.7). The check, the builder and the environment are the real ones, and the candidate row is the row the turning commit will write. Once the
row is turned the legs run with no candidate, through the production table alone, and that run is the one the merge waits for.

A probe that answers against §S7.4's decisions stops the work **on that pair** and goes to the lead; the other pairs go on. A probe's result
goes to the lead for the parent's probe table before the code that depends on it is merged into the branch. No step is skipped because the gate
would refuse the call anyway.

## S7.3 — The rigs, and what a runner can and cannot produce

**The rules of every rig. [C]**

- **R1. It names what it ran.** Each probe prints first the client's whole version line, `process.version` and the platform. A result holds
  for that client, version and system and for no other (the ninth lesson).
- **R2. The positive control runs under the bridged environment.** Its environment is `bridgedSshEnv` with the launch's own names, and its
  arguments are the launch as §S6.15 built it, with the control under test taken away. An identity that the client finds only because the
  harness named it (a `KRB5CCNAME`, a `KRB5_CONFIG`, a `PGSERVICE`) is not a positive control: a bridged child never gets that name (G5).
- **R3. A system-wide change needs a throwaway system.** A ticket in the default cache, `/etc/krb5.conf`, a marker file in the runner's own
  `%APPDATA%`, a database service of the image: a leg writes these only when `CI=true` and its step sets `BRIDGED_DB_SYSTEM_RIG=1`. Anywhere
  else the leg is a printed skip that says *not measured*. No leg writes any of them on a developer's computer. Everything else lives in an
  owned folder (`scripts/lib/leftovers.cjs`), and a container carries the token in its name, as `docker.yml` names its own, and is removed by
  the harness scope.
- **R4. Unmeasured is said, and counted.** A leg whose positive control was not shown prints `UNMEASURED <leg>: <what was missing>`. It is not a
  pass. Each harness ends with a table: the leg, *control shown* or *not shown*, what production did. With `CI=true`, an `UNMEASURED` line for
  a pair the production table serves fails the run (PP1 excepted, as the parent says).
- **R5. Nothing real.** The realm, the principals, the accounts, the passwords and the certificates are made at run time and are throwaway.
  No real host, login or path stands in a committed file or in a printed line.
- **R6. A record leg asserts nothing about the build.** Its failures are the rig's own. A line that starts `STOP (<leg>)` says that an answer
  went against §S7.4, as PQ2's and PM1's lines do.
- **R7. What is downloaded is pinned.** A client or a server that the image does not carry is fetched by an exact version and checked against a
  checksum written in the workflow.

**The rigs.** Where each stands is **[S]**; what it must show is **[C]** and stands in §S7.4.

| Rig | Where | What it gives | What it cannot give |
|---|---|---|---|
| K, a Kerberos realm | `ubuntu-latest`, in a job of its own. [S] On the runner: `krb5-kdc` and `krb5-user` by apt, the KDC run by the runner's user on a loopback port, `/etc/krb5.conf` written with `sudo` for the realm `BRIDGE.TEST` with reverse lookups off, a ticket for `probe@BRIDGE.TEST` put into the default cache by `kinit` from a keytab. Or one container that holds the KDC, the clients and the harness | A ticket that a client finds under `PATH` and `HOME` alone. Service keys for the receivers | A `windows-latest` runner is in no domain, so no Kerberos ticket and no directory sign-in is on offer there. A ticket made on the Linux job and carried to the Windows job was not tried. Not tried either, and an option only: a KDC inside WSL 1 on the Windows runner (WSL 1 uses the host's own loopback: from memory), with the realm made known to Windows by `ksetup`. Nothing in this spec depends on it, and no step promises it |
| G, a real PostgreSQL server | `ubuntu-latest` and `windows-latest`. [S] The image's own binaries, a cluster made by `initdb` in an owned folder and run by the runner's user; on Linux a container is the other way | One `pg_hba.conf` line per leg: `hostgssenc … gss`, `hostnogssenc … gss`, `sspi` (Windows), `scram-sha-256`, `md5`, `password`, `trust`, and `local … peer`. With `log_connections` its log names the identity and the method of each login | — |
| F, the fake servers | the harnesses, as today | PostgreSQL: it answers an encryption request with `G`, or sends authentication request 7 (GSSAPI) or 9 (SSPI), and records what comes back; after an SSPI request it sends an NTLM challenge and reads the user and the domain or computer name from the client's answer (N15). MySQL: it sends a switch request that names a plugin, a plugin named by a path among them (PK1-m7), and records the answer; for the Windows authentication plugin it sends the NTLM challenge and reads the same two names. PD2's and PD3's servers as built | A fake cannot read the name inside a Kerberos token. So for Kerberos the real server is the receiver that names the identity, and the fake shows the request and that a token followed. For NTLM the fake names the account itself |
| M, MySQL and MariaDB servers | Linux: [S] the image's MySQL service for the socket of PP1; containers for PE1. Windows: the image's MySQL, if PA1 finds one | PE1's logins; PP1's socket | The server plugins for Kerberos, LDAP and Windows authentication are not in the free servers. So every plugin leg of PK1 uses the fake |
| Q, a SQL Server | Linux: [S] Microsoft's container image. Windows: [S] SQL Server Express installed by the step, with TCP switched on at a fixed loopback port. LocalDB is not a rig: it has no TCP listener (N17), and the builder refuses a host that names an instance (G7) | PE1's login; how each login was made (`auth_scheme` of the connection; the server's error log) | An integrated login that succeeds needs a domain or, on Windows, the runner's own local account. On Linux the control is an attempt the server records, not a login. On Windows the install may not hold, or TCP may not come up: then every `sqlcmd` pair on Windows is unmeasured. [S] The parent also allows a listener that reads the login packet; it must speak the protocol's encryption step, and a client that insists on encryption shows it no login in the clear (N8) |
| The clients | PA1 lists what each image carries. Added by a step: Oracle's `mysql` with its whole plugin folder; MariaDB's client with its GSSAPI plugin package; go-sqlcmd; the ODBC `sqlcmd` where the image has none; an older `psql` in a container (PA1); a second `psql` version beside the first (PA1-i) | — | A security key: a runner has no device. [S] A virtual one is tried first (§S7.16 L1): a software authenticator behind the kernel's `uhid` device (from memory; whether a runner lets a step open that device is PA1-h's to record). If it cannot be made, the leg is unmeasured. macOS: this plan's CI has no such runner |

**The forecast, said plainly before any run.** It is a prediction, and the PR sets it beside what happened. A runner gives a Linux realm,
real servers that check a password, and on Windows the logon of the runner's own local account. It gives no Windows domain and no macOS, and
a security key only if the virtual one works. Every leg that needs one of those is unmeasured, and by the parent's rule its pair stays refused.

| Pair | Expected when E1.7 merges | What decides it |
|---|---|---|
| `psql`, Linux | served, for the builds CI installs | every road has a control on rigs K and G; PA1-i (the wrapper, N10) may send it to the lead first |
| MariaDB's client, Linux | refused | PE1 asks for a login at MySQL's default plugin, and this client loads that plugin from the folder its control empties (N7); clear text may be linked in (N11). `restricted_auth` as a flag (PA1-d) could change both |
| Oracle's `mysql`, Linux | refused, unless the virtual security key works | PK1-m4 |
| go-sqlcmd and the ODBC `sqlcmd`, Linux | open | whether the control of PS1-0, an integrated attempt the server records, can be shown |
| `psql`, Windows | refused | PK1-w4: outside a domain there is no Kerberos ticket to offer |
| Oracle's `mysql`, Windows | refused | Windows authentication is built into the client and no candidate stops it |
| MariaDB's client, Windows | refused | on no image |
| go-sqlcmd and the ODBC `sqlcmd`, Windows | refused, unless SQL Server Express installs with TCP on and every leg shows its control | rig Q |
| every client, macOS | refused | no runner |

**So it is likely that no Windows pair is served when E1.7 merges.** The owner's host is Windows. M11 may then find no client there in a
served row, and §9's database line waits for E4.2's question to the owner, as the parent says (§S7.14, §S7.15). This spec lowers no control
to change that.

## S7.4 — The probes

Each probe is the parent's row (§7, the probe table). The **decision** of each is quoted from that row and is not changed here. *Expected* is
this spec's prediction, written before the run; the PR sets each beside what was observed.

### PA1 — versions, known controls, and the floor (V0)

**[C]** On `ubuntu-22.04`, `ubuntu-24.04`, `ubuntu-latest` and `windows-latest`, for each client the image carries and each client a step adds:

| # | What is run | What the leg records |
|---|---|---|
| PA1-a | the client's version flag, under the bridged environment | the whole line, on which stream, the exit code, and the line's **build tag**: every part of it after the version (N16). For `sqlcmd`, the answers to `--version` and to `-?`, which tell go-sqlcmd from the ODBC client, and for the ODBC client the driver it loads, read from the rig and not from the client |
| PA1-b | `psql` against a loopback port where the harness listens, with a keyword string that holds one candidate: `require_auth`, `sslcertmode='disable'`, `gssencmode='disable'` | *known* (the listener gets a connection) or the client's own words for a keyword it does not know, with no connection at the listener |
| PA1-c | `psql` with `gssencmode='require'` | the client's own words: whether the build can do GSSAPI at all |
| PA1-d | each `mysql` client with `--plugin-dir=<a path nothing writes>` and, apart, `--skip-enable-cleartext-plugin`, before `--version`; MariaDB's client also with `--restricted-auth=<a list of plugin names>` (a candidate: N11) | known or not, in the client's words; for a flag it does not know, that the client ends there |
| PA1-e | the names of the files in each `mysql` client's own plugin folder | which loadable authentication plugins that build carries. PK1's list of plugin legs comes from this listing and from the parent's list together, never from memory. A plugin that is linked into the client is no file: it shows in PK1's legs and not here (N11) |
| PA1-f | each `sqlcmd` with each candidate flag of §S7.5 and §S7.9 | known or not |
| PA1-g | **an older client.** A `psql` whose libpq does not know `require_auth`, given the string V3 will write, against a port where the harness listens. [S] A container with an older distribution's own `postgresql-client` | it refuses the string and the listener gets no connection, or it goes on |
| PA1-h | the inventory: which servers and clients each image carries | the list §S7.3's rigs are built from |
| PA1-i | **which file a program word is.** For each client: the file the word resolves to on the bridged `PATH`, its real path, and whether it is a script. For `psql` on Debian and Ubuntu (N10), with two versions installed: the version that answers `--version`, and the version that runs the query's arguments, first with no steering file and then with a marker `~/.postgresqlrc` in the rig home that names the other version (the positive control: the wrapper starts the other one) | per image: the file, and whether a file under the home folder can make the version spawn and the query spawn start different programs |

**Decides (the parent):** each client's floor, and that an older client fails closed. **If it answers the other way (the parent):** *an older
client ignores an unknown control and goes on: the database client check is then its only lock, the row says so, and a client that neither
knows the control nor fails on it is not served.*

**Added by this spec, on the safe side:**

- If no rig can produce an older client (PA1-g), *fails closed* is unmeasured for it. The lowest recorded build is then the floor, the client
  check is the only lock below it, and the row's record says so.
- The check serves the builds PA1-a recorded and no other (§S7.7): a version alone does not name a build.
- **PA1-i's decision.** *The word is the client's own program, or a launcher that starts the same file for the version and for the query
  whatever the rig home holds:* the check's verdict is about the program that runs. *A file under the home folder makes the two differ:* the
  version the check read is then not the version that runs. The pair is not turned to served on that image, and the row returns to the lead
  with the record (§S7.16 L10).

*Expected:* `psql` 16 and newer know the three keywords; an older libpq refuses the string before it connects. Both `mysql` clients know
`--plugin-dir`. Whether MariaDB's program knows `--restricted-auth` is not known. On the Ubuntu images `psql` is the wrapper; the marker
file steers it, and it steers the version spawn and the query spawn alike, since neither names a host or a cluster as a flag.

### PK1 — does the client offer an identity that is not the entry's? (V1)

**[C]** Run for `psql` on Linux and on `windows-latest`, for Oracle's `mysql` on both, and for MariaDB's client on Linux. Each case runs twice:
for entry A, which stores a user and a password, through `buildDbQueryLaunch` with `bridged` as it stands on `main`; and for entry B, which
stores no password, by hand, since the launch refuses it. In the realm legs the entry's user is the ticket's own name: that is the case where
a ticket alone would log the agent in.

`psql` on Linux (rigs K, G and F):

| # | Launch | Receiver | What the leg records |
|---|---|---|---|
| PK1-p0 | **positive control, GSS encryption:** the string as built, host `localhost`, no control | G with a `hostgssenc … gss` line; then F | G's log names `probe@BRIDGE.TEST` with the method `gss`. F saw the encryption request and a token |
| PK1-p1 | **positive control, GSSAPI authentication:** the same with `gssencmode='disable'` written by hand | G with a `hostnogssenc … gss` line; then F sending request 7 | the same two observations |
| PK1-p2 | as launched by the builder, entry A | both | offered or not, per road |
| PK1-p3 | each candidate alone, written last: `gssencmode='disable'`; `require_auth` with §S7.5's list; then both | both | per candidate and road: the request, the token, the name in G's log |
| PK1-p4 | both candidates, against an environment that says the opposite, set by hand: `PGGSSENCMODE=prefer`, `PGREQUIREAUTH=gss` | both | which side won |
| PK1-p5 | the client certificate: `sslcertmode='disable'`, with and without the `sslcert` and `sslkey` keywords | PD3's server, a marker certificate in the rig home | offered or not, on each version (PQ2-d4 saw it hold on 18.6) |
| PK1-p6 | PK1-p2 again after the ticket is destroyed | both | nothing offered. Recorded to show what a run with no positive control sees, and why it does not count |

`psql` on `windows-latest` (rigs G and F; rule R3 for the profile files):

| # | Launch | Receiver | What the leg records |
|---|---|---|---|
| PK1-w0 | **positive control, SSPI:** the string as built, entry B | G with an `sspi` line; then F sending request 9 and, after the client's first token, an NTLM challenge | G's log names the runner's own logon with the method `sspi`. F reads the user and the computer name from the client's answer (N15) |
| PK1-w1 | as launched, entry A; then under `require_auth` | both | offered or not |
| PK1-w2 | GSS encryption: PA1-c's answer for this build | — | the build says it cannot do GSSAPI: recorded in those words. It can: no ticket can be on offer on this runner, so the leg is `UNMEASURED` |
| PK1-w3 | the profile files: a marker `pgpass.conf`, certificate and key, and `psqlrc.conf` in the runner's `%APPDATA%\postgresql` | PD2's and PD3's servers | the control (the three keywords and `-X` cut) sends the markers; the launch as built sends none |
| PK1-w4 | a server's GSSAPI request (7), for entry A and for entry B | F sending request 7; G with a `gss` line | N14: on Windows libpq answers this request too, through SSPI's Kerberos package or MIT's library. The positive control needs a Kerberos ticket, and a runner outside a domain has none: `UNMEASURED`. What the client does with no ticket is recorded and does not count, as in PK1-p6 |

Both `mysql` clients (rig F, with K where a plugin needs a ticket). One leg per plugin of the parent's list, and one more for every other
authentication plugin PA1-e lists for that client. Each leg: the control with no control of the profile; the launch as built; each candidate.

| # | The server switches the client to | The positive control needs | A runner can produce it |
|---|---|---|---|
| PK1-m1 | Kerberos (`authentication_kerberos_client`; MariaDB's `auth_gssapi_client`) | rig K and a client build that carries the plugin | Linux: yes, if a step adds the build. Windows: no (no domain) |
| PK1-m2 | LDAP SASL with the GSSAPI mechanism | rig K, the plugin, and the SASL module for GSSAPI | Linux: expected yes, not tried. Windows: no |
| PK1-m3 | the cloud key file (`authentication_oci_client`) | a throwaway key and configuration file in the rig home | yes: files only |
| PK1-m4 | a security key (`authentication_webauthn_client`, `authentication_fido_client`) | a device, and an answer the fake receives that was made with it | not with a real device. [S] A virtual device is tried first (rig *clients*). If the plugin reaches it and the fake gets its answer, that is the control. If not: `UNMEASURED` |
| PK1-m5 | a clear-text request (`mysql_clear_password`; MariaDB's `dialog`) | the enabling flag for Oracle's client. For MariaDB's: the plugin as a file of its folder, or linked into the client (N11) | yes. The leg records which of the two it is on MariaDB's build: under `--plugin-dir` at the absent path a linked-in plugin still answers |
| PK1-m6 | Windows authentication (`authentication_windows_client`), on Windows | the runner's own logon | yes: the fake sends an NTLM challenge, and the client's answer names the user and the computer (N15; §S7.16 L3). That leg has the name itself |
| PK1-m7 | a plugin named by a path: `../` steps that lead from the plugin folder to a copy of a loadable plugin of that build in the rig folder, and the absolute path of the same copy | **the control:** the copy's folder given as `--plugin-dir` and the plugin named bare: it loads and answers | yes, where PA1-e lists a loadable plugin. Each name runs as launched, and again with `--plugin-dir` at an empty folder that exists: from a folder that does not exist the `../` steps may lead somewhere on Windows only (from memory). The leg records the client's own words for each name, and whether the copy was opened |

For the Kerberos, LDAP, key-file and security-key legs the receiver is the fake, which cannot read a name. So each of those controls is shown
in two halves: an answer arrives while the rig's one ticket, key file or device is in reach, and none arrives once it is taken away. For
PK1-m6 the fake reads the name itself.

**A build that lacks a plugin has no control for that plugin's leg.** The parent's words are *no client build with the plugin*: such a leg is
`UNMEASURED` on that build, and the pair stays refused on it. So a `mysql` pair is measured only on a build that carries every plugin of the
parent's list for that client (§S7.16 L1). A step adds such a build (rig *clients*); the distribution's own build is expected to lack some.

For PK1-m5 on Oracle's client the legs also show what keeps the plugin off as launched: an option file that enables it, read without
`--no-defaults` and not with it; and the enabling variable set in the harness and absent in the child.

**Decides (the parent):** per pair, whether the identity is offered, and which control stops it. **The decisions (the parent, word for word):**

- *Offered as launched, and one control stops it in every leg:* that control is the pair's authentication policy and the leg becomes an assertion.
- *Not offered as launched, while the positive control shows it can be:* recorded; the pair still gets the control, since a default is not a lock.
- *Offered under every candidate:* the pair stays refused (Q18), and the row returns to the lead.
- **The positive control cannot be produced on a runner (no realm, no client build with the plugin, no client on the image): the leg is
  *unmeasured*, never closed, and the pair stays refused.**

**Per road, one keyword stops it in every leg (§S7.16 L7).** A client has several roads to an identity that is not the entry's. For `psql`
they are three: the GSS encryption request, an answer to a GSSAPI or SSPI authentication request, and a client certificate. The parent's
*one control stops it in every leg* is read per road: each road has one keyword, and that keyword stops the road in every leg of it
(`gssencmode` in PK1-p0 to p4, `require_auth` in PK1-p1 to p4 and PK1-w0, w1 and w4, `sslcertmode` in PK1-p5). A pair's policy is the keywords
of its roads. If PK1-p3 shows that one keyword closes two roads, the other still stands in the string: the parent's second decision (a default
is not a lock). A road that no one keyword stops in every leg of it is *offered under every candidate*.

*Expected.* `psql` on Linux: both GSS roads are offered as launched, and each is stopped by its keyword. `psql` on Windows: SSPI is offered
as launched and `require_auth` stops it; PK1-w4 is `UNMEASURED`, so the pair stays refused; PK1-w2 is `UNMEASURED` too if the build can do
GSSAPI. Oracle's `mysql` on Linux: each loadable plugin is offered as launched where the build carries it, and `--plugin-dir` at an absent
path stops it; clear text is not offered as launched; PK1-m4 is `UNMEASURED` unless the virtual device works; both path names of PK1-m7 are
refused by the client. Oracle's `mysql` on Windows: Windows authentication is offered as launched and under every candidate, because the
plugin is built in. MariaDB's client on Linux: GSSAPI is offered and `--plugin-dir` stops it; `dialog` sends the entry's password in the clear
and `--plugin-dir` stops it where the plugin is a file. **Clear text on MariaDB's client (corrected at the review):** if `mysql_clear_password`
is linked into the client (N11), `--plugin-dir` does not stop it and the password goes out in the clear at a server's request. That is
*offered under every candidate*, and by the parent's third decision the pair stays refused unless a measured control stops it. The one
candidate is `restricted_auth` (PA1-d).

### PS1 — what a `sqlcmd` signs in with (V1)

**[C]** go-sqlcmd and the ODBC client, each named by its own version answer, on Linux and on `windows-latest`, against rig Q.

| # | Launch | What the leg records |
|---|---|---|
| PS1-0 | **positive control:** no user, as the launch was built until §S6.15 (no `SQLCMDUSER`, no `-U`), by hand | Windows: the receiver names the runner's own identity. Linux, with rig K's ticket in reach: the receiver records an integrated attempt |
| PS1-1 | a user and a password in the environment: the launch as built, through the builder | how the login was made: a SQL login for that user (`auth_scheme`), and no integrated attempt in the server's log |
| PS1-2 | a user and no password, by hand | what is sent |
| PS1-3 | go-sqlcmd's configuration file in the rig home, naming another server and user, with `-S` given | which server was reached, and as whom |
| PS1-4 | the ODBC client with the driver manager's files in the rig home naming another server or a trusted connection | whether they are read, and what changes |
| PS1-5 | PS1-1 again with the identity in reach (rig K's ticket on Linux; on Windows the logon always is) | the same as PS1-1 |
| PS1-6 | go-sqlcmd with `--authentication-method=SqlPassword` (a candidate) | whether the client knows it, and whether PS1-1's login still works |
| PS1-7 | the host forms the builder refuses today, by hand: `tcp:host,port`, an IPv6 address, `host\instance` | which server each reaches. Recorded only; §S7.15 keeps them refused |
| PS1-8 | **a user written as a Windows account.** go-sqlcmd with the user `RIGDOM\probe` and a password in the environment, as the builder launches it; then the same with `--authentication-method=SqlPassword`. **The control** is the first half: N12 says the client then signs in with NTLM | how each sign-in was made: a SQL login for the name as written, or an NTLM exchange in the login packet. The ODBC client runs the same user once, recorded |

**Decides (the parent):** whether a `sqlcmd` that is given a user and a password can sign in as anything else. **The decisions (the parent):**

- *A user and a password give a SQL login for that user and nothing integrated:* the pair may be served.
- *An integrated or directory sign-in is still tried, or the configuration file is read:* that client stays refused until a flag is shown to
  stop it; back to the lead.
- *No receiver or no positive control on a platform:* unmeasured, refused.

*Expected.* PS1-1 is a SQL login on both clients. go-sqlcmd does not read its configuration file when `-S` is given. On Windows the control
depends on rig Q's install. On Linux the control depends on whether either client makes an attempt the server can record. PS1-8: go-sqlcmd
makes an NTLM sign-in for a user with a backslash, and `SqlPassword` stops that. If it does not, the parent's second decision holds:
go-sqlcmd stays refused until a flag is shown to stop it. A refusal of an `mssql` user that holds a backslash would be a new field shape of
the profile's part 1: that is the lead's, and is not built here.

### PP1 — the socket class (V1)

**[C]** On `ubuntu-latest`, under rule R3: a real server that logs in the operating-system user over its socket with no password (rig G with
`local … peer`; rig M with `auth_socket` or `unix_socket`, on the client's default socket path).

| # | Launch | What the leg records |
|---|---|---|
| PP1-0 | **positive control:** the client pointed at the socket, by hand, no password | it logs in as the runner's user (`select current_user`) |
| PP1-1 | the launch as built for an entry that names `localhost` and stores a user and a password | the connection is over TCP, and the login is the entry's user by its password |

**Decides (the parent):** that the socket class of §4.9's row 13 is real, and that the profile closes it. **The decisions (the parent):**
*The control shows no login by identity:* recorded as *unmeasured*; the socket refusal and `--protocol=TCP` stay, since they cost only local
sockets. PP1 never opens a road: Q17 refuses sockets on every pair, so an unmeasured PP1 keeps that road refused and does not by itself keep a
pair refused. *Production logs in over the socket:* back to the lead.

*Expected.* The control logs in as the runner's user for `psql` and for Oracle's `mysql`. PM1 could not show MariaDB's socket control on a
runner with no socket file; with a real server on the default path it may show.

### PE1 — the entry's own login still works, and nothing else decided it (V2)

**[C]** Under the pair's whole profile: first with the launch written by hand in the shape V3 will write, then, in legs (u)-(w), through the
builder.

| # | Server | Login | What the leg records |
|---|---|---|---|
| PE1-1 | PostgreSQL with `scram-sha-256` | the entry's user and password | logged in; the server's log names that method |
| PE1-2 | the same | a wrong password | refused |
| PE1-3 | PostgreSQL with `md5`, and with `password` | the entry's user and password; a wrong one | as PE1-1 and PE1-2, for each method §S7.5's list names |
| PE1-4 | PostgreSQL with `trust` | a wrong password; **the control:** the same launch with `require_auth` cut by hand | under the profile the **client** refuses: the server asked for nothing (N4). In the control the login succeeds with the wrong password, and the server's log names `trust` |
| PE1-5 | MySQL with its default plugin, and MariaDB with its default plugin, for Oracle's client | the entry's user and password; a wrong one | logged in at both; refused at both |
| PE1-6 | the same two servers, for MariaDB's client | the same | the same |
| PE1-7 | SQL Server | a SQL login with the entry's user and password; a wrong one | logged in, `auth_scheme` SQL; refused |

**Decides (the parent):** that the profile still lets the entry's own credential in, and that nothing else decided the login. **The decision
(the parent):** *the login fails under the profile:* the pair is not served until it passes. A control dropped to make it pass goes back to the
lead first.

**Both servers, for both `mysql` clients (corrected at the review).** The parent's row asks for a login at *the default plugin of MySQL and
of MariaDB*. So each `mysql` client must log in at both, and a login that fails at either holds that client's pair back: the parent's decision
has no exception for a cost of the control. *Expected:* Oracle's client logs in at both. MariaDB's client fails at MySQL's default plugin
under `--plugin-dir` at the absent path, since it loads `caching_sha2_password` from the folder that control empties (N7). Then MariaDB's pair
is not served by that control. What could serve it is a list of allowed plugins with the client's own folder left in place
(`restricted_auth`, PA1-d), measured through all of PK1's legs; anything else returns to the lead.

**Added by this spec:** a method stands in `require_auth`'s list only if PE1 logged in with it on that pair. A method that no leg ran is taken
out of the list for that pair, and the PR says so.

## S7.5 — The authentication controls each client gets (V3)

**The rules. [C]**

- A control is written by the builder, from constants and from the client check's verdict. Nothing of it comes from stored data. A stored
  connection that names one of these keys is still refused (DP4, Q15).
- A control stands after every setting that came from the entry, and last.
- A control that only one vendor knows is written only for that vendor, and the vendor is read from the client check's verdict (§S7.6). A
  bridged launch that is built with no verdict answers `undefined`, and the road says DR9.
- A candidate becomes a pair's control when that pair's probes answered for it. If the probes chose another control, the coder builds what
  they chose and §S7.20 says so. If they chose none, the pair stays refused and the row returns to the lead.
- Off a bridge every launch is byte for byte today's (Q11 of the E1.6 spec, kept).

| Client | Candidate controls | What each is to stop | Kept as defences, as built |
|---|---|---|---|
| `psql` | Three keywords at the end of the built string, after `sslkey`: `gssencmode='disable'`, `sslcertmode='disable'`, `require_auth='password,md5,scram-sha-256'` | The GSS encryption request and its token. Any client certificate. An answer to a GSSAPI or SSPI request, and a login the server grants with no request at all | `-X`; `passfile`, `sslcert`, `sslkey` at the absent file, as keywords and as variables; the leading space on `-c` |
| `mysql`, Oracle's | `--plugin-dir=<the absent file>` after `--protocol=TCP`; `--skip-enable-cleartext-plugin` if PA1-d shows the client knows it | Every loadable authentication plugin. A clear-text answer | `--no-defaults` first; `--protocol=TCP`; `MYSQL_TEST_LOGIN_FILE` at the absent file; the three pins |
| `mysql`, Oracle's, on Windows | none is known for the built-in Windows authentication plugin | — | the same |
| MariaDB's client | `--plugin-dir=<the absent file>`. Or, if PA1-d shows the program takes it: `--restricted-auth=<the password plugins PE1 logged in with>`, a positive list, with the client's own plugin folder left in place | GSSAPI, `dialog`, clear text. `--plugin-dir` stops only a plugin that is a file of the folder: a plugin linked into the client is stopped by the list alone (N11) | the same flags |
| go-sqlcmd | `--authentication-method=SqlPassword`, if PS1-6 shows it is known and the login still works | An integrated or directory sign-in, and the NTLM sign-in of a user written as a Windows account (PS1-8) | `-b`, `-x`; no `-X1` (the parent's change 4.1); both variables always |
| `sqlcmd`, the ODBC client | none: the user and the password, both always given | — | the same |

**The `require_auth` list. [C]** It names password methods and nothing else. It never names `gss`, `sspi` or `none`, and it does not grow by
itself with a later libpq: a method is added only by a commit that records its PE1 leg. Why `none` is out: a server that asks for nothing
has decided the login by something that is not the entry's password, and with `ident` that something is the person's own system login (N4;
PE1-4). Why the three password methods are in: each is an answer made from the entry's stored password, which is what part 2 of the parent's
profile allows. §S7.15 says what those three methods leave to whoever answers at the entry's host; the owner kept the clear-text one
(§S7.16 L9, 2026-11-18).

**The absent path. [C]** `--plugin-dir` names the same path as Y6's variables, `keys/<pid>/no-client-file`, which nothing writes. PK1 runs it
in that form.

**What no control here does.** None of them changes what the entry's own password is sent to: that is the entry's host, by Q11. None of them
closes a client that PK1 or PS1 did not run.

## S7.6 — The database client check and its floors (V4)

Modelled on the `ssh` client check (G6). New `bridgedDbClient.ts`, pure, no `vscode`. [S] The names and the shapes:

```ts
export type DbVendor = 'postgresql' | 'oracle' | 'mariadb' | 'go-sqlcmd' | 'odbc-sqlcmd';
/** The file a program word is on the bridged PATH: what is started, and what a kept verdict is bound to. */
export interface DbProgramFile { readonly program: string; readonly realPath: string; readonly size: number; readonly mtimeMs: number; readonly launcher: boolean }
export type DbClientVerdict = { ok: true; vendor: DbVendor; version: string; tag: string; file: DbProgramFile } | { ok: false; sentence: string };
/** Reads a version answer against the builds that are recorded for this client on this platform. */
export function dbClientVerdict(rows: readonly DbProfileRow[], client: DbClient, platform: NodeJS.Platform, exit: number | null, stdout: string, stderr: string): …;
/** The walk: the first file for this word in an absolute folder of PATH, with its real path and its identity. */
export function resolveDbProgram(word: string, pathValue: string | undefined, platform: NodeJS.Platform, files: …): DbProgramFile | undefined;
export function bridgedDbClientCheck(parts: DbClientCheckParts): (call: { client: DbClient; guards?: … }) => Promise<DbClientVerdict>;
```

**The bridged order inside `run`. [C]** For a call with a bridge, in this order, and each step ends the call when it refuses:

| # | Step | It answers | Where it stands today |
|---|---|---|---|
| 1 | the entry, and its type | `not_found`, `no_credential`, as on every door | `agentUseActions.ts:612-619` |
| 2 | the gate: the pair is served | DR1. Nothing of the entry was read | `:621` |
| 3 | the stored connection is read | `no_credential` | `:629` |
| 4 | §S6.15 Z2's refusals | DR2-DR6 | `:636` |
| 5 | `refuseQuery` | its own sentence, as today | `:654` |
| 6 | the client is on `PATH` | `tool_missing`, as today | `:667`, after the build today |
| 7 | the client check: the walk, then the kept verdict or the version spawn | DR7, DR8 | new |
| 8 | the build, with the verdict | a launch. `undefined` is DR9 | `:660`, before `tool_missing` today |
| 9 | the exec slot | `too_many_requests`, as today | `:673` |
| 10 | a folder that holds nothing is made; the file of step 7 is started from it; then the folder is removed and the slot is released | the client's output | `:678`, with no folder and the bare word today |

- Steps 6 to 8 change places against today's order, on a bridge only: the builder needs the verdict, and the check must not run for a client
  that is absent. No step before 7 starts a process, so an entry or a query that is refused spends no spawn, the version spawn included.
- **`launch === undefined` on a bridge (`:661` today) answers DR9**: the generic body, code `internal`, the sentence in the journal. The main
  port's sentence there speaks of a client that is never launched; on a bridge that client is refused at step 2, so the sentence would be
  false, and it would tell the agent more than the generic body.
- **Off a bridge nothing moves.** The order, the sentences, the bare program word and the spawn with no folder are today's, byte for byte.

**Where the bridged road lives. [C]** In a new module, `bridgedDbQuery.ts` (pure, no `vscode`): steps 2 to 10 for a call with a bridge, with
`bridgedDbRefused`, `bridgedDbGate` and `bridgedDbConnectionRefusal` moved into it from `agentUseActions.ts:545-576`. `dbQueryAction.run` keeps
step 1 and the off-bridge road and hands a bridged call over in one statement. Why: `agentUseActions.ts` has 743 lines of 800 and `run`
already switches off two checks (G2); ten steps more in it would add to both. [S] The read of the stored connection (`:629`) becomes one
function both roads call, so that it is written once.

**The check. [C]**

1. **When.** Only when the table serves at least one row for that client on this platform; otherwise nothing is started (parent §4.11). It is
   step 7 of the order above. A client that is not on `PATH` answers `tool_missing` at step 6: an absent client is not a client that did not
   answer.
2. **What is asked.** The client's version flag and nothing else: no host, no user, no query. The environment is `bridgedSshEnv` with no extra
   name, so the child holds no password variable and no user variable. Standard input is closed. It is bounded at ten seconds and killed at
   the bound.
3. **Which file, and the same file for the query.** The check does not start a bare word. `resolveDbProgram` walks the `PATH` the bridged
   child gets, in order, skips a folder that is not absolute, and takes the first file for the client's word (on Windows the word with `.exe`),
   as `spawnableSshProgram` does for `ssh` (G11); that walk is widened, not copied. The version spawn starts **that path**, and the query spawn
   of the same call starts **that path** too, never the bare word. A word the walk cannot turn into a file is a client that did not answer
   (DR7), with the cause in the journal. Why the path found and not its real path: a link whose target reads the name it was started by is
   another program under its real name (N10).
4. **The verdict is bound to the file. [C]** With the path the walk reads the file's identity: its real path, its size and its modification
   time. A good verdict is kept with that identity. Before every bridged query the walk runs again, which costs a `stat` and no spawn. The same
   path and identity: the kept verdict stands. Anything else (another file first on `PATH`, a link that points elsewhere, another size or
   time): the kept verdict is dropped and the check asks the new file. **Why size and time, and not a hash:** the changes this is for are a
   package upgrade, a second client installed, a `PATH` or a link that changed, and each of them changes one of the three. A hash would read
   tens of megabytes before every query. Neither closes the moment between the look and the start, and somebody who can write into a folder
   of the person's `PATH` already runs programs as the person, which no bridge defends. Neither sees a library under the client either: that
   is §S7.7's question.
5. **A launcher's verdict is not kept. [C]** If the file begins with `#!`, it starts another program, which the identity does not cover
   (N10). Its verdict stands for that one call, and the next call asks again.
6. **The two folders. [C]** The version spawn runs in a folder of its own that holds nothing. The query spawn of a bridged call runs in
   another. Each folder has a fresh random name (`bridgedCallFolder` with `callKeyName()`, as G6), is made for the one spawn, and is removed
   in a `finally`: after the child's exit, after a spawn that threw, and after a request or a window that ended. A folder that cannot be
   removed is one note in the journal and changes no answer. Why a folder at all, now that the program is a path: on Windows the current
   folder is still among the places a program's libraries are looked for (N18, not measured), and a `.` in `PATH` is closed the same way.
7. **One check in flight per file. [C]** Two calls that reach step 7 for the same path before a verdict is kept share one version spawn:
   the second waits for the first's answer and starts nothing. Only a good verdict is kept; a bad one is handed to the callers that waited
   for it and to nobody after them. The spawn is ended by its bound and by the window's end, and not by one caller's request: a caller whose
   request ended goes on as ended, and the others still get the verdict. **The version spawn takes no exec slot.** It is bounded by this
   rule instead: at most one per client program at a time, so at most three such children in a window, each for at most ten seconds. A slot
   would be held by callers that wait and start nothing. The query spawn takes its slot as today, after the check.
8. **The reading.** Vendor, version and build tag are read from the client's own version line, on the stream PA1-a recorded. The patterns are
   written from the lines PA1 recorded, and each recorded line is a test case with its CI run beside it. An exit that is not 0, or a line the
   patterns do not read, is DR7. A line that is read and that is not one of the row's recorded builds is DR8: another vendor, another
   version, or a recorded version with another build tag.
9. **Two clients under one name.** `mysql` is Oracle's or MariaDB's, and `sqlcmd` is go-sqlcmd or the ODBC client. The reading tells them
   apart, and a line it cannot place is DR7. [S] If no one flag makes both `sqlcmd` clients answer, a second bounded spawn is allowed for
   `sqlcmd` only, under the same rules.
10. **Kept.** A good verdict is kept per file for the life of the check, which is the window's, under items 4 and 5. A bad one is not kept.
    A runner that cannot start the file is a client that did not answer, with the cause in the journal.
11. **The floors.** A served row lists the builds that ran (§S7.7). The lowest recorded version is the row's floor, the highest its upper
    end, and a version between two recorded ones is refused like one outside them: nothing is assumed of a version no leg ran on (the tenth
    lesson).
12. **What the floor is not.** `psql` prints its own version and not libpq's (N3). The lock for a libpq that lacks a control is that it
    refuses the string before it connects (PA1-g). The floor is the earlier and clearer refusal. Where PA1-g could not be run, the row's
    record says that the check is the only lock.
13. **The verdict reaches the builder.** `buildDbQueryLaunch` with `bridged` takes the verdict and writes the vendor's controls from it
    (§S7.5). [S] As one more field of its options. The program of the launch is the verdict's file.

[S] One check per window, built where the database action's parts are built (`extension.ts:623-632`), with the storage folder and the
journal's note, as `sshUseActions.ts:555` builds the `ssh` one. That is this story's one line in `extension.ts`.

## S7.7 — The table, and how a pair turns to served (V8)

**The row lists builds. [C]** A served row names, beside its client and platform: the vendor, and the **builds** its legs ran on. A build is
the version and the build tag, each exactly as PA1-a recorded them from the client's own version line, with the record of its runs. [S] The
shape:

```ts
export interface DbRecordedBuild { readonly version: string; readonly tag: string; readonly record: string }
export interface DbServedClient { readonly vendor: DbVendor; readonly builds: readonly DbRecordedBuild[] }
export interface DbProfileRow { readonly client: DbClient; readonly platform: NodeJS.Platform; readonly served: boolean; readonly clients?: readonly DbServedClient[] }
```

- The check serves a client only when its line names a recorded build: the same vendor, version and tag. A version between two recorded
  builds, and a recorded version with another tag, are refused (DR8).
- The row's **version range**, the parent's unit, is the lowest and the highest recorded version of a vendor. The lead writes it into the
  parent's table. It is derived from the builds and decides nothing by itself.
- `record` names the CI run and the commit the build's legs ran on, as text (`run <number> at <sha>`): the run under the candidate table,
  below.
- `bridgedDbPair` answers by client and platform, as built: served when the row is. Which build it is, is the client check's question.

**Which lock each client has, and what that lock does not see. [C]** A version alone would serve a build that no leg ran on: the same
`psql` over another libpq, a `mysql` with other plugins linked in.

| Client | Served by | A check at run time that the build takes its controls | What neither sees |
|---|---|---|---|
| `psql` | the recorded build | Yes, and it is the query spawn itself: the three keywords stand in every launch, and a libpq that does not know one of them refuses the string before it opens a connection (PA1-b, PA1-g). No spawn is added for it | The libpq under it. `psql`'s line does not name it (N3), so a libpq newer than any that ran is served. `require_auth` is a positive list, so a method a later libpq adds is refused; a road a later libpq adds outside the three keywords is not covered (§S7.17) |
| Oracle's `mysql` | the recorded build and nothing else (§S7.16 L4) | None that decides. A flag the client does not know ends it (PA1-d), and that says nothing of the plugins a build links in | Two builds that print the same line |
| MariaDB's client | the same | the same | the same; and its client library, which is a file of its own |
| go-sqlcmd | the recorded version. Its line names no build, and the client is one static file | Yes, where §S7.5 gives it the flag: an unknown flag or value ends the client before it connects (PA1-f) | — |
| `sqlcmd`, the ODBC client | the recorded version line | None: it gets no control whose acceptance could be asked | The driver under it (N16). The record names the driver that ran; a person's driver is not read (§S7.16 L11) |

**Before a row is turned: the candidate table. [C]**

- A candidate row has the production row's shape and names builds the production table does not serve. [S] The candidates live with the
  harnesses, in `scripts/lib/dbCandidates.cjs`. No file under `src/` reads them.
- A leg for such a build runs through the real `bridgedDbClientCheck` and the real `buildDbQueryLaunch`. It hands them the production table
  with the candidate row put in, and prints `CANDIDATE <client> <vendor> <version> <tag> <platform>` first.
- The number of that run, and its commit, are what the row's `record` will hold.

**The commit that turns a row. [C]** One commit per pair. It moves the candidate row into the production table as it stands, sets `served`,
writes the record, deletes the candidate, changes the list of served rows that DP1 names and the list of the CI lock below, and adds the
pair's row to §S7.20 with every leg's result beside its control. It changes nothing else.

**Before that commit. [C]** For that client, vendor, build and platform, all on CI and all recorded:

1. PA1 answered, and every control of the pair is known to that client.
2. PK1 (or PS1) ran, each leg beside a positive control that was shown, and under the pair's controls nothing was offered in any leg.
3. PE1 logged in with the entry's own user and password at every server the parent's row names, and the wrong password was refused.
4. Every defence in the pair's row of the parent's §4.11 table ran on that platform. For a Windows pair that means the cases of leg (m), of
   PD1-PD3 and of legs (s) and (t) on `windows-latest`, which today's harnesses do not do (G8).
5. The pair's leg of (u)-(w) is green as assertions, through the real builder and the real check under the candidate table, on the commit
   before.
6. No leg of the pair printed `UNMEASURED`. PP1 is the one exception, as the parent says.

**After that commit: the production run. [C]** On the turning commit CI runs the pair's legs with no candidate: the check and the builder
read the production table and nothing else, and the harness prints `PRODUCTION <client> <vendor> <version> <tag> <platform>`. With `CI=true`
a candidate that names a build the production table serves fails the run, so a served pair cannot go on passing under a table that was
handed in. §S7.20 and the PR body name that run, per pair. **E1.7 does not merge until every served pair has a green production run on the
PR's head.** If that run is red, the row goes back to not served in a commit of its own, the candidate returns, and the cause is recorded.
The row's `record` names the candidate run and not this one: a commit cannot name its own run.

**The lock in CI. [C]**

- **What each job must find is written down.** [S] `scripts/lib/dbServedJobs.cjs`: per CI job, under the name the job sets in
  `BRIDGED_DB_JOB`, the served builds that job must find and, per build, the legs that must run.
- **A job fails** when an expected client is not on the image; when its real version line, read through `dbClientVerdict` against the
  production table, is not ok or names another build; or when one of that build's legs did not run, was skipped, or printed `UNMEASURED`
  (PP1 excepted). The harness prints `MISSING <build>: <what>` and exits with an error.
- **A served build that no job expects fails too.** DP21 reads the production table, that list and the workflow file: every served build
  stands in at least one job's list; every entry of the list is a served build; every job the list names is a job of `ci-extension.yml` that
  sets that name and runs that family's harness. A harness that runs with `CI=true` and no job name fails when the production table serves a
  row for its family on that platform.
- [S] One closing job needs every such job, so a job that did not run is red.
- So a served row whose client left the image, or moved to another build, turns the run red, and a build is added only by a commit that
  records its legs.

**What this costs, said here.** A served row follows the images. When an image moves a client to a new build, CI is red until that build's
legs are recorded. A person's client is served only while it is one of the recorded builds. Who records new builds after E1.7, and how often,
the parent does not say (§S7.16 L12).

**Who writes the parent.** The coder does not edit the parent or the stories document. The probe results go to the lead, who writes them into
the parent's probe table and into §4.11's table. Those are results recorded as the plan asks, not entries of the ledger.

## S7.8 — The gate's refusal before the consent dialog (V5)

The parent leaves this to E1.7 (§4.11): the refusal needs only the entry's type and the platform. **The decision: yes, for that part.**

**What is observed. [C]** A bridged `query` on an entry whose client has no served row on this platform is answered **before the dialog**:

- the body is `BRIDGE_USE_REFUSED(<the entry>)`, with the code `not_supported`;
- the journal holds one line for the call, and its detail is DR1, not the generic sentence;
- no dialog was shown (`w.dialogs.length === 0`), the stored connection was not read (the storage stub's count is 0), and nothing was spawned
  (`runs` is empty);
- **the grant is dropped**, as `usable` drops it on every refusal (G3): a second call with that token is answered as a token nobody knows.
  The refusal in `run`, after an Allow, leaves the grant as any failed run does; this one does not. Nothing is lost by it: the table is a
  constant of the build, so that pair is refused for the token's whole life.

This holds for a token call and for an MCP call, and under each consent policy of the entry.

**What the code needs, file by file.** The road of G3 cannot do this as it stands. A `Refusal` has no place for the journal's sentence, so
`usable` would journal the generic sentence and DR1 would be written nowhere. What is observed above is **[C]**; the shapes are **[S]**.

| File | Change | Size |
|---|---|---|
| `brokerRequests.ts:24` | `Refusal` gets an optional `detail`: what the journal holds when it must differ from what the caller reads | one line |
| `credsAgentServer.ts:567` | `usable` hands `refused.detail` to `respondError` where it hands `undefined` today. `respondError` already journals `detail ?? message` (`:742`) | one argument on a line that stands. The file stays at 795 lines of 800 |
| `bridgeWallSource.ts:17-24` | `wallSuppliersOf(vault, gate)` takes the table and the platform, both required. Its `entryRefusal` answers the agent-forwarding refusal first, as today; then, for an entry with a database type whose pair is not served, `{ code: 'not_supported', message: BRIDGE_USE_REFUSED(name), detail: DR1(client, platform) }`. It reads the entry's details and never the stored connection | a few lines; the pair is asked through `bridgedDbPair` |
| `bridgeScope.ts:56-60` | no code: `entryBarred` hands the refusal on whole (`:304-310`). The comment says what the entry refusal now carries | a comment |

- A refusal with no detail journals as today. So the agent-forwarding refusal and a validation refusal do not change, and L4 of
  `test/bridgeLinks.test.ts` stays green and untouched.
- Through a bridge a database entry has the one action `query` (G3), so a refusal of the entry is a refusal of that action.

**A note for E2, not a change.** The wall is wired in production by E2.2 (`brokerHooks.ts:173`; G3). Until then no production call reaches
`usable` with a wall, and none reaches a bridge door at all (R1). So E1.7 builds this refusal and pins it through the scenarios' wall, which
the same `wallSuppliersOf` makes; in production it begins with E2's wiring. E2's stories must wire the wall through `wallSuppliersOf` and hand
it the production table and `process.platform`. Both are required arguments, so a wiring without them does not compile. A wall whose
`entryRefusal` is written by hand, as the comment at `bridgeScope.ts:56-59` describes it today, would compile and would lose this refusal.
The lead carries this note into E2's stories document when E2 starts. It adds no step to the parent: E2.2 wires the wall either way.

- **The gate in `run` stays** (step 2 of §S7.6's order). It is asked twice, as the scope wall is asked again at launch: a second road into
  `run` must not skip it, and until E2's wiring it is the only gate production has. T68 and T69 take out one each.
- **Still after the Allow:** §S6.15 Z2's refusals (DR2-DR6), which need the stored connection, read only after the Allow as today; and the
  client check's refusals (DR7, DR8), which need a spawn, and no process is started for a call nobody allowed.
- For a pair that is served the dialog is shown as today, and its words do not change (parent §4.10).
- Off a bridge nothing changes: the same entry through the main port is asked and runs as today.

**What the sentence knows.** DR1 says that this client on this system is not among the measured ones. Its speaker knows the entry's type, the
platform and the table, before and after the dialog alike. It says nothing of the entry's connection, which was not read.

## S7.9 — The keys Q15 lets this story add (V6)

**The parent's rule (Q15). [C]** A key is added only as one of two kinds: (a) a transport-security key that a client can be made to honour by
a measured flag; (b) a key on a named list of keys a client does not use, which a key joins only when dropping it changes neither who
authenticates, which server is reached, nor how that server is verified. Added **by this spec's reading**: a key is added only for a pair
that is served, with its leg in the same commit. A key that is not added stays refused (DR2), and the PR lists which.

Candidates of kind (a). Each flag is from memory until PA1-f and its leg:

| Key | Where | Values taken | The flag | What the leg observes |
|---|---|---|---|---|
| `Encrypt` | a key-value string, `mssql` | `true`, `false`, `strict`, and the spellings PA1-f shows each client's flag takes | `-N` with the value, per client and version | with `true`, against a receiver that offers no encryption, no login is sent; with a real server the connection's `encrypt_option` |
| `TrustServerCertificate` | the same | `true`, `false` | `-C` for `true`; nothing for `false` | with `false`, against rig Q's self-signed certificate, no login is sent; with `true` the login works |
| `ssl-mode` | a `mysql` URI's query | `DISABLED`, `PREFERRED`, `REQUIRED` | `--ssl-mode=<value>`, Oracle's client only | with `REQUIRED`, against a fake that offers no TLS, no authentication answer is sent |

Candidates of kind (b), each with its reason written beside it in the module: `Application Name` and `App`; `Persist Security Info`;
`MultipleActiveResultSets`; `Pooling`; `Connect Retry Count`; `Connect Retry Interval`; and `Connection Timeout` with `Connect Timeout`,
unless the coder honours them by `-l` under kind (a)'s rule with a leg. A test shows that the launch for a string with such a key equals the
launch without it.

**Not added, and why.** `Integrated Security`, `Trusted_Connection`, `Authentication`: who authenticates. `Failover Partner`,
`MultiSubnetFailover`, `ApplicationIntent`, `target_session_attrs`: which server is reached. `sslrootcert`, `ssl-ca`, and `ssl-mode` with
`VERIFY_CA` or `VERIFY_IDENTITY`: how the server is verified, by a file the entry would name; that waits for a typed field (parent §8).
`ssl-mode` on MariaDB's client: it has no flag of that name. Any key the parent does not name as an example and that is neither kind: to the
lead.

## S7.10 — Sentences (journal only; on a bridge the agent reads `BRIDGE_USE_REFUSED`)

DR1-DR6 stay as built (`bridgedDbSentences.ts`). DR1 gains a road: before the dialog, as the detail of the refusal's own journal line
(§S7.8), beside its road in `run`. New, **[C]**:

| # | When | Sentence |
|---|---|---|
| DR7 | the client's word could not be turned into a file, the client did not answer its version, or the answer could not be read | `<client> did not answer its version under the environment a Remote Bridge gives it (exit <code>). No database query can go through a Remote Bridge with <client> from this computer until it does.` |
| DR8 | the answer was read, and it names no recorded build of a served row | `The <client> on this computer answered <token>. A Remote Bridge runs a query with <client> on <system> only for the builds that were measured: <builds>.` |
| DR9 | on a bridge the builder answered no launch (step 8 of §S7.6's order): it was handed no good verdict, or it refused by a rule of its own | `No launch was built for this call after the profile's rules and the client check had passed it. No query was started.` |

- **Roads.** A bridged `query` only, on the bridged road of `run`, after the Allow. DR9's code is `internal`; the others keep `not_supported`.
- **Observations.** DR7 and DR8: the spawner stub recorded one spawn, the version spawn, with no password variable, and no query spawn; the
  next call records a second version spawn (a bad verdict is not kept). DR9: `runs` holds no query spawn, and the body is the generic one,
  not the main port's sentence about a client that is never launched.
- **What each holds.** The client's fixed name, the exit code or the word `unknown`, the token the pattern matched (the vendor's words, the
  version and the build tag, and no other part of the output), the system's name, and the recorded builds, which are constants. No path, no
  value of the entry, no text of the stored connection. The cause a walk or a runner gives goes to the journal as a note of its own, as G6's
  does.
- **What each knows.** DR7 and DR8 are said by the check: it knows what the client answered now, and that the next call asks again. Neither
  says why the person's client is what it is, nor what to install. DR9 is said by the road: it knows that the builder answered nothing and
  that no query was started. It does not know which of the builder's rules spoke, and a version spawn may have run before it, so it says
  neither.

## S7.11 — The tests, RED first

Each is written before its code and watched failing for its own reason. The record goes in §S7.20.

New `test/bridgedDbClient.test.ts`:

| # | Scenario | Observation |
|---|---|---|
| DC1 | each version line PA1 recorded, with its CI run named in the test | the vendor, the version and the build tag |
| DC2 | an exit that is not 0; empty output; a version word later in the line; the line on the other stream | DR7 |
| DC3 | a version below every recorded build; above every one; **between two recorded builds; a recorded version with another build tag**; a vendor with no served row | DR8 with the token and the recorded builds; a sentinel in the rest of the output is in no sentence |
| DC4 | MariaDB's line and Oracle's; go-sqlcmd's and the ODBC client's | neither is read as the other |
| DC5 | a good answer, then a second call; a bad answer, then a second call | one spawn; two spawns |
| DC6 | the version spawn | its program is the path the walk found, not the bare word; its arguments are the version flag alone; its environment holds only the bridged names; its folder holds nothing, has a name no other check had, and is gone afterwards, also when the runner throws |
| DC7 | a request that ends during the spawn; a runner that throws | the caller goes on as ended; DR7 with the cause in the journal |
| DC8 | a table that serves no row for the client on this platform | the check starts nothing |
| DC9 | a good verdict, then the file changes: another size; another time; the link points to another file; another file comes first on `PATH` | each time one new version spawn, of the file that is there now; the old verdict is not used. With nothing changed: no spawn |
| DC10 | two calls for one file before the first verdict; then the first caller's request ends while the spawn runs | one version spawn; the second caller gets the verdict and the first goes on as ended; a bad verdict reaches both and a third call spawns again |
| DC11 | the walk: a relative folder first on `PATH`; no file at all; a link; on `win32` the word with `.exe` | the relative folder is skipped; DR7 with the cause in the journal; the program is the path found and the identity is of the file behind the link |
| DC12 | a file that begins with `#!` answers a recorded build; then a second call | the verdict is good, and it is not kept: two version spawns |
| DC13 | the version spawn while every exec slot is taken | it runs: the check takes no slot, and a second call for the same file starts no second child |

`test/bridgedDbProfile.test.ts`:

| # | Scenario | Observation |
|---|---|---|
| DP1, rewritten | the production table | its served rows are exactly the list the test names; each has a vendor and at least one recorded build with a version, a build tag and a record of the form `run <number> at <sha>`; no `darwin` row is served |
| DP18 | the `psql` string for a served pair | it ends with `passfile`, `sslcert`, `sslkey`, then the three policy keywords with §S7.5's values; nothing from the entry stands after them |
| DP19 | `require_auth`'s value | each word is a password method; `gss`, `sspi` and `none` are not in it |
| DP20 | the candidate rows of the harnesses | each has the production row's shape; none names a build the production table serves |
| DP21 | the production table, the jobs' list of §S7.7 and `ci-extension.yml` | every served build stands in a job's list; every entry of the list is a served build; every job the list names is in the workflow, sets that name and runs that family's harness |
| DP4, kept | a URI that names `require_auth`, `gssencmode` or `sslcertmode` | DR2 |

`test/dbCliLauncher.test.ts`:

| # | Scenario | Observation |
|---|---|---|
| Q1-Q3, extended | bridged, with a verdict, each client and vendor | the controls of §S7.5 in their places: `--no-defaults` first, `--protocol=TCP` second, then the vendor's flags; the program is the verdict's file |
| Q12 | bridged, with no verdict | `undefined` |
| Q13 | a MariaDB verdict; an ODBC verdict | no flag that only the other vendor knows |
| Q11, kept | off a bridge, the golden record | byte for byte `main`'s, the bare program word included |

`test/bridgeWallSource.test.ts`:

| # | Scenario | Observation |
|---|---|---|
| BW3 | `wallSuppliersOf(vault, gate)`: a database entry whose pair the table does not serve; one whose pair it serves; a database entry with no type; an entry that forwards the agent | a refusal with the code `not_supported`, the generic message and DR1 as its detail; nothing; nothing; today's refusal, with no detail |

`test/bridgeRunSites.test.ts`, through the doors:

| # | Scenario | Observation |
|---|---|---|
| DG5 | a wall built by `wallSuppliersOf` with a table that serves no row for the client on this platform; a bridged `query` by a token and by MCP | the body is the generic sentence with the code `not_supported`; the journal holds one line for the call and its detail is DR1, not the generic sentence; `w.dialogs.length === 0`; no read of the stored connection; `runs` empty; **the call's grant is gone**: a bridged token call rides a grant of its own (`brokerCall.ts`), so `usable` drops that call's grant and the token survives; a second call with the same token is refused the same way, before any dialog (corrected from *answered as an unknown token* by the coder of V5, 2026-11-19, from the code) |
| DG6 | DG5 under each consent policy | the same |
| DG7 | a table that serves the pair, a good verdict | one dialog with today's words; the version spawn, then the query spawn, both of the same path; a second call records the query spawn alone |
| DG8 | a table that serves the pair, a bad verdict | one dialog; the generic body; DR8 in the journal; one version spawn and no query spawn |
| DG9 | a table that serves the pair, and in turn: an entry §S6.15 Z2 refuses; a query `refuseQuery` refuses; a client that is not on `PATH` | each answers what it answers today, and there is no spawn at all, the version spawn included |
| DG10 | the query spawn of a served pair: it ends well; the runner throws; the request ends during it | its program is the path the check asked, not the bare word; its folder holds nothing and has a name of its own; **after each of the three the folder is gone**, and the slot is free |
| DG11 | a table that serves the pair, a builder that is handed no verdict | the generic body with the code `internal`; DR9 in the journal; no query spawn; the main port's sentence about a client that is never launched is in no answer |
| DG1, kept | the bridged road called directly with the production table and an unserved pair | DR1; nothing read; nothing spawned |
| DG2, kept | the main port | as today: no table, no check, no folder, the bare word, the main port's own sentences |
| DK1-DK3 | §S7.9: each key of kind (a) with each value; each key of kind (b); each key not added | the flag in the arguments; a launch equal to the one without the key; DR2 |

## S7.12 — The legs (u), (v) and (w) (V7)

**[C]** The parent's §7: one leg per client family, the cases of PK1, PP1 and PS1 as assertions on each pair the story serves, each beside its
positive control and with PE1's login. Each leg takes its arguments, its variables and its program from `buildDbQueryLaunch` with `bridged`
and the verdict of the real check, and its environment from `bridgedSshEnv`.

- **Which table. [C]** Before a pair's row is turned, its leg hands the check the production table with the candidate row put in, and says
  so in its first line. After the row is turned it hands nothing in, and the check reads the production table (§S7.7). A leg never builds a
  verdict by hand.
- **(u), `psql`.** In `scripts/bridged-psql-itest.cjs` and its `lib/`. Per served pair: the control of each road leaks (the name in the
  server's log, the marker, the certificate); production offers nothing on that road; PE1-1 to PE1-4 pass, PE1-4 beside its control; with
  `sslmode=verify-full` and a marker CA in the client's default place the client connects, offers no certificate and sends nothing but the
  login (the parent's *trust, not authentication*, on each served pair).
- **(u), the certificate road with the other defences cut.** The harness takes the builder's string, takes out the `sslcert` and `sslkey`
  keywords and the two variables, and leaves `sslcertmode` as the builder wrote it; a marker certificate and key stand in the client's default
  place in the rig home. PD3's server asks for a certificate, and none is offered. Its control cuts `sslcertmode` too, and the marker
  certificate is offered. This is the leg that fails when `sslcertmode` is dropped (T60).
- **(v), `mysql`.** In `scripts/bridged-mysql-itest.cjs`, per vendor. Each plugin leg of PK1 for that pair, PK1-m7's two path names among
  them; PP1-1; PE1-5 or PE1-6, at both servers.
- **(w), `sqlcmd`.** New `scripts/bridged-sqlcmd-itest.cjs`, with `itest:bridged-sqlcmd` in `package.json` and a line in `run-itests.mjs`.
  PS1-0, PS1-1, PS1-3 and PS1-5 per served pair; PS1-8 for go-sqlcmd; PE1-7.
- Each leg begins with §S7.7's lock and ends with it: the real client, read through the check, and the job's list of builds and legs.
- A pair that is not served keeps its record legs. They assert nothing and print what happened, so the next run on a wider rig starts from
  them.
- [S] A Windows pair needs these harnesses to run on `windows-latest`; they are POSIX only today (G8). [S] A harness file stays under 800
  lines; the rigs go to `scripts/lib/`.

## S7.13 — Mutations, added to the E1.6 spec's §S6.6

Each is applied, compiled, run and restored, as §S6.13 records for the others. T43 of §S6.15 (*mark one row served*) now fails DP1's list.

| # | Mutation | Must fail |
|---|---|---|
| T56 | Serve a row with no recorded build, or a build with no record | DP1 |
| T57 | Drop `gssencmode='disable'` | DP18; (u), the encryption road |
| T58 | Drop `require_auth` | DP18; (u), the authentication road, the SSPI road, PE1-4 |
| T59 | Add `gss`, then `none`, to the list | DP19; (u) |
| T60 | Drop `sslcertmode='disable'` | DP18; (u), the certificate road with the other defences cut |
| T61 | Write the policy keywords before the entry's settings | DP18 |
| T62 | Drop `--plugin-dir` | Q2; (v) |
| T63 | Write Oracle's flags for a MariaDB verdict | Q13 |
| T64 | Skip the client check for a served pair | DG7; Q12 |
| T65 | Keep a bad verdict | DC5; DG8's second call |
| T66 | Give the version spawn the password variable | DC6 |
| T67 | Accept a version above every recorded build; one between two of them; a recorded version with another tag | DC3 |
| T68 | Take out the ask before the dialog | DG5 |
| T69 | Take out the gate on the bridged road of `run` | DG1 |
| T70 | Run the client check before §S6.15 Z2's refusals; before `refuseQuery`; before `tool_missing` | DG9 |
| T71 | Start the query spawn from the extension host's folder | DG10 |
| T72 | Carry a kind (b) key into the arguments; honour `Encrypt=false` as `true` | DK1-DK3 |
| T73 | Apply any control off a bridge | Q11; DG2 |
| T74 | Start the query with the bare program word | DG10; DG7 |
| T75 | Keep a verdict when the file's identity changed; keep a launcher's verdict | DC9; DC12 |
| T76 | Leave the query's folder after the spawn; leave it when the spawn throws or the request ends | DG10 |
| T77 | Let two calls before a verdict start two version spawns; give two checks one folder | DC10; DC6 |
| T78 | Hand `usable` no detail; keep the grant | DG5 (the journal's detail; the second call) |
| T79 | Build the wall's entry refusal without the table | BW3; DG5 |
| T80 | Answer the main port's sentence when the builder answers no launch on a bridge | DG11 |
| T81 | Take a served build out of every job's list; skip one of its legs in the harness | DP21; the harness's own check at its end |
| T82 | Leave a candidate row for a build the production table serves; hand a served pair's leg a table | DP20; the harness's refusal of it under `CI=true` |
| T83 | Drop `--authentication-method=SqlPassword`, if PS1 chose it | Q3; (w), PS1-8 |

## S7.14 — M11, the owner's part (V10)

**What (the parent's §7 M11). [C]** On the owner's Windows host, under VS Code's own runtime: for each database client on that machine, what
the database client check answers and which row of the table it lands in; for a pair that row serves, one login with a throwaway account
under the profile, and the same entry with its user taken out, refused before any spawn. Nothing of the owner's own databases is used or
recorded.

**Who and how.** It is the owner's part: it runs on their machine, with their word. The lead prepares the driver, as for M9: it calls the
branch's compiled check and `dbQueryAction` from `out/` with a bridge context, against a throwaway database the lead starts on that machine
and reaches on loopback. The output masks every name. The driver stays on that host. The result goes into §S7.20 and, by the lead, into the
parent's M11 row.

**The decisions, written before the run.**

- *A client lands in a served row, the login works, and the entry with no user is refused with no spawn:* M11 is recorded, and E4.2 may walk
  §9's database line on that pair.
- *No client on that host lands in a served row:* recorded in those words. By §S7.3's forecast this is the likely outcome. The PR says that
  no pair is served on the owner's host, and E4.2 asks the owner, as the parent says. M11 by itself turns no row: a row opened from a run on
  a person's machine needs the same legs and positive controls as one opened from CI. How such a run is made is left to a later story
  (§S7.16 L5).
- *The login fails under the profile on that host though CI passed:* that pair's row goes back to refused for that platform in a commit of its
  own, and the row returns to the lead.

M11 is recorded before E1.7 merges (the parent's *Done when*), whatever it finds. [S] Where the production table serves no row for a client
on that host, the check starts nothing (DC8); the driver then runs the check's version spawn under a table of its own and reads the answer
against the production table, and the record is that answer and the words *no served row*.

## S7.15 — What stays refused, where it goes, and the documents

| What | Why | What would open it |
|---|---|---|
| Every client on macOS | this plan's CI has no such runner: unmeasured (the parent's row) | the same legs run on macOS, by the lead's decision to add the runner |
| MariaDB's client on Windows | on no image this plan has run | a Windows image with that client, and its legs |
| A client that is not a recorded build: older, newer, between two recorded versions, or a recorded version in another build | no leg ran on it | a commit that records its legs |
| Oracle's `mysql` on Windows (expected) | Windows authentication is built into the client, and no candidate stops it | a control shown to stop it; to the lead |
| Oracle's `mysql` on every system while PK1-m4 is `UNMEASURED` (expected, unless the virtual device works), and on any build that lacks a plugin of the parent's list | that leg has no positive control | a virtual device shown to work on the rig; a build that carries every plugin |
| MariaDB's client on Linux (expected) | PE1: no login at MySQL's default plugin under `--plugin-dir` at the absent path. And clear text, if it is linked into the client (N11) | `restricted_auth` shown to work as a flag, through all of PK1's legs and PE1's logins at both servers; anything else to the lead |
| `psql` on Windows (expected) | PK1-w4 has no positive control outside a domain; PK1-w2 neither, if the build can do GSSAPI | a rig with a realm the Windows client can find (rig K's untried option) |
| Every `sqlcmd` pair on Windows, when SQL Server Express does not install with TCP on; any `sqlcmd` pair whose control could not be produced | unmeasured | the rig |
| go-sqlcmd, if PS1-8 shows an NTLM sign-in that no flag stops | the parent's second decision of PS1 | a flag shown to stop it; to the lead |
| A `psql` that is a launcher which can start one program for the version and another for the query (PA1-i) | the check's verdict would be about another program | the lead's decision (§S7.16 L10) |
| `mongosh` | never launched, on every door, as before | — |
| An entry with no user or no stored password; a socket or no host; a setting outside the profile and outside §S7.9 | Q16, Q17, Q15 | the owner's other answers |
| A database that wants a client certificate, Kerberos, SSPI or a directory sign-in | the policy declines exactly that request | a typed field per kind (parent §8, E4's todo) |
| A server that logs in with no authentication request (`trust`, `ident`) | `none` is not in the list (§S7.5) | — |
| A MySQL account that needs a plugin its client loads from its folder | the plugin folder is the absent path | a folder this extension fills is not built here; to the lead |
| `sqlcmd` hosts with an instance name, an IPv6 address or a protocol prefix | as built; PS1-7 records them only | a later story |

**Windows, and the owner's host.** By §S7.3's forecast it is likely that no Windows pair is served when E1.7 merges: `psql` for want of a
Kerberos ticket, Oracle's `mysql` for its built-in plugin, MariaDB's client for want of an image, both `sqlcmd` clients unless SQL Server
Express comes up on the runner with TCP. M11 may then find no client in a served row on the owner's host. E1.7 still merges with M11
recorded in those words, and §9's database line waits for E4.2's question to the owner (the parent's E4.2). Nothing here opens a Windows pair
by a weaker reading.

**What `require_auth='password,md5,scram-sha-256'` leaves (recorded, not closed).**

- `password`: the server asks for the password itself. Under an `sslmode` that verifies nothing (`disable`, `allow`, `prefer`, `require`),
  whoever answers at the entry's host receives it.
- `md5`, and `scram-sha-256` without channel binding: whoever answers can pass the real server's challenge on and the client's answer back,
  and is then logged in at the real server as the entry's user. The profile carries no `channel_binding` (a stored key of that name is
  refused, Q15). With `md5` the answer also lets them try passwords at home.
- None of the three is an identity that is not the entry's, so the invariant holds. It is what Q11 warns of at scope selection (the entry's
  host receives the entry's login), and it is so off a bridge today.
- **The two families are not treated alike.** For a `mysql` client the parent counts a clear-text request among the plugins that must send
  nothing. For `psql` it allows any answer made from the stored password, and `password` is one; the owner kept it (§S7.16 L9, 2026-11-18).

**Documents (V10). [C]**

- `research/module_extension.md`: the database road on a bridge, from the code as built: the controls per client, the client check and the
  file it is bound to, the gate before the dialog and that production gets it with E2's wiring, which builds are served and which pairs are
  not, each with its reason.
- `research/module_tests.md`: the rigs, the probes and legs (u)-(w), the candidate table and the CI lock, and what each does not prove.
- No CHANGELOG bullet: no door reaches a bridged query (R1 until E2.2b, then the switch of the parent's §4.5 until E4.1's flip), and off a
  bridge nothing changes. If the diff shows a change on a local door, the bullet is written from that diff.
- The PR body says: which builds are served; for each served pair its candidate run and its production run; which pairs are refused, and
  for each whether it was measured and failed, or was unmeasured, and what was missing; §S7.3's forecast and each prediction of §S7.4 beside
  what was observed; the keys §S7.9 added and the ones it left; that the parent's §4.9 row 10 is disposed by PK1's record; and M11's state.

**Growth.** The client check keeps at most one verdict per file for a window's life, and a window has at most a handful of such files. Each
check and each bridged query makes one folder that holds nothing and removes it in the `finally` of its spawn. A folder that a killed window
left lies under that window's `keys/<pid>/`, which the keys purge reclaims with the rest of a dead window's folder, as it does for a bridged
`ssh` call's (`keysPurge.ts`: read, not run for this folder). The candidate rows and the jobs' list are files of the repository and shrink
when a row is turned. A rig's files live in owned folders and its containers are removed by the harness scope. Nothing here grows on a
person's computer.

## S7.16 — Decisions, what is owed to the parent, and the open points

**No plan change is needed to specify E1.7.** Checked against `plan-change-control.md`'s list: this spec adds no scope, goal, epic or story;
it changes no line of §9 and no merge condition; every probe decision is the parent's, quoted; the controls are the parent's candidates and
become contracts only by their probes, as §4.11 says; the gate before the dialog and the keys of Q15 are questions the parent hands to E1.7.

**The revision of 2026-11-18 was checked the same way, finding by finding.**

- *The candidate table and the production run (§S7.2, §S7.7).* An order of this story's own steps, and a run of legs that §9 already asks
  green. No merge condition of the parent changes.
- *The recorded builds (§S7.7).* Finer than the parent's unit (client, version range, platform) and inside it: the range is still the row's,
  and fewer clients are served, never more. The parent promises no pair. This is the writer's judgement, and the lead may read it otherwise.
- *The refusal before the dialog (§S7.8).* The parent hands the question to E1.7. E2 wires the wall as the parent plans; the note for E2 adds
  no step.
- *PE1 at both servers (§S7.4).* It restores the parent's row, which the first text had weakened.
- *The file the check is bound to, the folders, one check in flight (§S7.6).* The parent is silent on each, and each serves fewer calls or
  the same.

**What would be a plan change, and is therefore not built here.** Each goes to the lead, who asks the consultants first.

- Serving a pair whose positive control was not shown, or counting a weaker observation as that control (L1).
- Narrowing `require_auth` to fewer password methods than PE1 showed to work (L9), or serving an entry with no password.
- Dropping a control so that PE1 passes, or serving a `mysql` client while one of PE1's logins fails.
- Opening a row from M11 alone (L5).
- A spawn, before the query, that asks a client whether it takes its controls. The parent allows one spawn before a row is chosen, the
  version spawn. §S7.7 needs none: for `psql` and go-sqlcmd the query spawn is that check.
- A file of options that this extension writes for a `mysql` client, if MariaDB's program takes `restricted_auth` only from a file. The
  parent's contract is `--no-defaults` first.
- A new field shape in the profile's part 1: an `mssql` user with a backslash refused (PS1-8).

**Decided at the review (the plan gate round and the Opus judge, 2026-11-17 and 2026-11-18).** Each was an open point of the first text.

- **L1. The security-key leg: the strict reading stays.** The receiver must get an answer made with the device. A virtual device is tried
  first (rig *clients*). A leg that only shows *the plugin loaded and asked for a device* is not that control. And a build that lacks a
  plugin of the list makes that plugin's leg unmeasured too, so its pair stays refused on that build (§S7.4).
- **L2.** Moved into L9.
- **L3. PK1-m6 and the name: the fake is upgraded.** It sends an NTLM challenge, and the client's answer names the user and the domain or
  computer (N15). The receiver names the identity, as the parent asks.
- **L4. A build that did not run is not served.** A row lists the builds that ran (§S7.7). For the two `mysql` clients the build tag is the
  only lock, and only tags that ran are served.
- **L5. A row opened from a person's machine: left to a later story.** This spec keeps *M11 by itself turns no row*.
- **L6. The file and the folder of the query spawn: not a change.** They make *one client, one verdict* true.
- **L7. *One control*: reworded.** §S7.4 reads it per road: one keyword stops a road in every leg of it.
- **L8.** Gone: the lead corrected the stale lines of the parent and of `todo/README.md`.

**Open points for the lead.** None blocks the probes.

- **L9. `password` in `psql`'s list, beside MariaDB's clear text. Decided by the owner, 2026-11-18: no narrowing; `password` stays.** `require_auth` lists `password`, because the parent allows
  an answer made from the entry's own password; §S7.15 says what that leaves. For a `mysql` client the parent counts a clear-text request
  among the plugins that must send nothing, and where MariaDB's client has clear text linked in, that keeps the pair refused (§S7.4). So the
  same act, the entry's password sent in the clear to whoever answers, is allowed for one family and refuses a pair of the other. Taking
  `password` out of `psql`'s list would make the two alike and would refuse servers that ask for it: a narrowing, so a plan change, and the
  owner's to decide. The owner decided on 2026-11-18 not to narrow it, so this spec builds the parent as written, with the asymmetry recorded here.
- **L10. A `psql` that is a launcher (N10, PA1-i).** From memory, and for the Ubuntu images the expected case. §S7.6 keeps no verdict for a
  launcher, and §S7.4 sends the row to the lead if a file under the home folder can make the version spawn and the query spawn start different
  programs. If the lead wants more (the check to follow the launcher to the program it starts), that is a new step.
- **L11. The driver under the ODBC `sqlcmd`.** No version answer names it and this client has no control to refuse on (§S7.7). The spec
  serves the recorded version line and writes the driver that ran into the record. The lead may hold an ODBC pair refused instead.
  **Decided by the lead, 2026-11-19, after a consult (3d062873; one consultant of two answered, gemini, for (1)):** the verdict of the ODBC
  `sqlcmd` is bound to the driver too: the check reads the driver's file from the ODBC configuration the bridged environment gives the
  client (the `Driver=` path of *ODBC Driver 18 for SQL Server*), binds its real path, size and mtime beside the executable's, and records
  its version (from the file name, `libmsodbcsql-18.6.so.1.1`) in the row's build; a driver it cannot find or read refuses (DR7). Until
  that is built the pair stays refused. This is "the build that ran" made exact for a client whose authentication lives in a library, not a
  new refusal: a driver change re-checks, as an executable change does.
- **L12. Who records new builds after E1.7.** §S7.7's cost: a served row goes red with every image update until the new build's legs are
  recorded, and a person's client is served only while it is a recorded build. The parent names no owner and no rhythm for that.

**Owed to the parent, by the lead, from this story's results:** the probe table's rows PK1, PS1, PP1, PA1, PE1 and M11; §4.11's table (which
pairs are served, with their ranges and builds); §4.9's row 10; *Not established here* in §4.11, for every cell a probe settled. And, in
E2's stories document when E2 starts, §S7.8's note on the wall's wiring.

## S7.17 — Not verified by this spec

- No database client and no server was run for it. N1-N18 are from memory or from documentation. Every rig of §S7.3 is a design: none was built,
  and each *expected* line is a prediction.
- That a runner's image carries what N9 says. PA1-h reads it first, and a rig that needs something else changes with the reason in §S7.20.
- That a KDC runs as the runner's user, and that a client under `PATH` and `HOME` alone finds the ticket in the default cache. If it does
  not, rig K has no positive control and every leg that needs it is unmeasured.
- That the real PostgreSQL server's log names the identity before it checks the role. If it does not, the control uses a role with the
  ticket's name.
- The version lines of the five clients. The patterns of §S7.6 are written from PA1's record, not from this spec.
- That `--skip-enable-cleartext-plugin` and `--authentication-method=SqlPassword` exist in those spellings. PA1-d and PA1-f.
- What a library under a client does. The libpq under `psql`, the client library under MariaDB's program and the driver under the ODBC
  `sqlcmd` are files of their own, and no version line names them. §S7.7 says what covers each and what does not. Two builds that print
  the same line are one build to the check.
- The moment between the walk's look at a file and its start (§S7.6 item 4). Nothing here closes it.
- That an NTLM answer names the account in a form the fake can read (N15), that a virtual security key can be made on a runner, and that a
  KDC inside WSL 1 can serve a Windows client. The first is PK1's to show; the other two were not tried.
- ~~That a second call with a dropped grant's token is answered as an unknown token (§S7.8)~~: false as written; the dropped grant is the call's own, the token survives, and a second call is refused the same way (DG5 pins it, 2026-11-19).
- What a launcher starts (N10). The check binds to the launcher's file and keeps no verdict for it; PA1-i measures the rest.
- The Windows half as a whole. Today no database client was run on Windows beyond a version flag (the parent's §4.11).
- A measured pair is measured for the legs that ran. A plugin or a keyword that a later client version adds is covered only by the list
  of recorded builds, which refuses that version until its legs run.

## S7.18 — Review checklist

For Opus, on the code; points 8-19 are Fable's authentication judgement at review.

1. Off a bridge: the diff shows no changed line on the off-bridge road of `buildDbQueryLaunch` and `dbQueryAction` but the hand-over of a
   bridged call, and the golden record of Q11 is untouched.
2. Each probe commit adds only the probe, and its CI run is named in §S7.20 before the commit that builds on it.
3. Every refusal of §S6.15 Z2 is still before any spawn, the version spawn included.
4. The version spawn holds no password variable, no user variable and no connection argument.
5. Each sentence of §S7.10 holds no value and says only what its speaker knows.
6. The mutations of §S7.13 were run, and each named case failed for the reason given.
7. §S7.20 names each **[S]** that changed, with the reason, and §S7.3's forecast and each prediction beside its observation.
8. *What a served pair rests on.* For each served build, read its record: every leg of §S7.7's list ran on that client, build and platform,
   each control was **shown**, and no leg is `UNMEASURED`.
9. *The control was the thing that stopped it.* For each control, the leg that leaks without it and does not leak with it. A control with no
   such leg is a defence and is called that.
10. *The positive control was real.* It ran under the bridged environment (rule R2), and the receiver named the identity or the spec says why
    it could not.
11. *The list is positive.* `require_auth` names password methods only, each with its PE1 leg; a row serves recorded builds only, and no
    version between them.
12. *The entry's own login.* PE1 passed under the whole profile at every server the parent's row names, and a wrong password was refused by
    the server or, for `trust`, by the client, beside the control that shows `trust` would have let it in.
13. *One client, one verdict.* The file the check asked is the file the query starts, by its path. A verdict was kept only with that file's
    identity, and never for a launcher. Both spawns ran in folders that held nothing and are gone.
14. *Before the dialog.* Only the table decides there. Nothing of the entry's connection is read, and nothing is spawned, for a call nobody
    allowed.
15. *What stays refused is said.* The PR lists every refused pair with *measured and failed* or *unmeasured*, and no document calls an
    unmeasured pair closed.
16. *Candidate, then production.* Each served pair names both runs: under the candidate table before its row was turned, and through the
    production table on the PR's head. No candidate is left for a served build.
17. *The CI lock is a list.* Every served build stands in a job's list with its legs, and a job that misses a client or a leg is red.
18. *Two readers of one refusal.* Before the dialog the agent read the generic sentence and the journal read DR1; the grant was dropped;
    `credsAgentServer.ts` gained no line.
19. *The bridged order.* It is §S7.6's table, with DR9 where the builder answers nothing. The bridged road is in its own module, and
    `agentUseActions.ts` did not grow.

## S7.19 — Contract → step → test

| Contract (parent) | Step | Test or leg |
|---|---|---|
| §4.11 part 2: the client answers with the entry's password and nothing else | V1, V3 | PK1, PS1; DP18, DP19, Q1-Q3, Q13; (u), (v), (w); T57-T63, T83 |
| §4.11 part 4: measured on a named client, version and platform, beside a positive control, with PE1's login | V0-V2, V7, V8 | PA1, PK1, PS1, PP1, PE1; rules R1-R4; DP1, DP20; the candidate run and the production run (§S7.7); T82 |
| §4.11, the gate: a row is turned in the commit that records its runs | V8 | DP1, DP21; the CI lock; T56, T81; checklist 8, 16, 17 |
| §4.11, the database client check: before a window's first bridged spawn, bounded, never a query, a good answer kept, a bad one asked again | V4 | DC1-DC13; DG7-DG11; T64-T67, T70, T71, T74-T77, T80 |
| §4.11: whether the gate's refusal can be said before the dialog, observed by `w.dialogs.length` | V5 | BW3; DG5, DG6; DG1; T68, T69, T78, T79 |
| Q15: the keys E1.7 may add | V6 | DK1-DK3; T72 |
| Q16, Q17: still refused before any spawn | V4 | DG9; T70 |
| Q18: an unmeasured pair is refused; a pair whose control cannot be produced stays unmeasured | V1, V8 | rule R4; §S7.3's forecast; §S7.15; checklist 15 |
| §4.9 row 10 | V1 | PK1's record |
| §7 PE1: a login at the default plugin of MySQL and of MariaDB, for each `mysql` client | V2, V7 | PE1-5, PE1-6; (v) |
| §7 legs (u)-(w) | V7 | §S7.12 |
| §7 M11 | V10 | §S7.14 |
| §9, the invariant line: claimed for the served pairs and for no other | V8, V10 | DP1; the PR body |
| Off a bridge, byte for byte today's | every step | Q11; DG2; T73 |

## S7.20 — As built

*Empty until the story is built.* The coder records here: the RED record of §S7.11; each probe's CI run, commit, version lines and results,
with each prediction of §S7.4 beside what was observed; each pair's row as §S7.7 asks; each **[S]** that changed, with the reason; the
mutations' runs; M11.
