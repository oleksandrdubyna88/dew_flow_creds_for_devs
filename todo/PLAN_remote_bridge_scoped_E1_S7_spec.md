# PLAN — E1.7 spec: the database execution profiles — what a bridged database client may log in with, per client and system

> Status: **spec, 2026-11-17, by Fable, written as a security spec (authentication: what a database client may answer a server with) before its code. Nothing of it is built, and no probe of it has run.**
> Story E1.7 of [PLAN_remote_bridge_scoped_E1.md](PLAN_remote_bridge_scoped_E1.md) (parent [PLAN_remote_bridge_scoped.md](PLAN_remote_bridge_scoped.md):
> *Reading this plan* (the ninth and the tenth lesson), §2.1 Q15-Q18, §4.9 rows 7-13, §4.11 whole, §5 step 3f, §7 (the probes PK1, PS1, PP1, PA1
> and PE1, legs (u)-(w), *The database profile*, M11), §8, §9 (the database line and the invariant line), `## Epics` E1). The parent is approved
> at epoch 11, which has no entry, and is not edited here. This spec changes no scope, contract, decision or merge condition of the parent
> (§S7.16 says how that was checked). Where the parent is silent the point is in §S7.16, and the spec builds the safe side.
> What is built before it: the E1.6 spec [PLAN_remote_bridge_scoped_E1_S6_spec.md](PLAN_remote_bridge_scoped_E1_S6_spec.md) §S6.15 (Z0-Z7) and its
> As built (§S6.13), merged to `main` as `e18fd420` (#365): the gate with no pair served, the connection built from the entry's fields, the refusals.
>
> Scope: `src_vs_code/src` (`bridgedDbProfile.ts`, `bridgedDbSentences.ts`, `dbCliLauncher.ts`, `agentUseActions.ts`, the wall's entry refusal in
> `bridgeScope.ts` and `bridgeWallSource.ts`, one wiring line in `extension.ts`; new `bridgedDbClient.ts`); the tests of §S7.11;
> `src_vs_code/scripts` (`bridged-psql-itest.cjs`, `bridged-mysql-itest.cjs`, new `bridged-sqlcmd-itest.cjs`, their `lib/` files, `run-itests.mjs`);
> `src_vs_code/package.json` (one `itest:` line); `.github/workflows/ci-extension.yml` (the rig steps and jobs of §S7.3);
> `research/module_extension.md`, `research/module_tests.md`. No UI, no command, no help article, no client (`src_cli`, `src_mcp`,
> `src_broker_client` have an empty diff), no CHANGELOG bullet (§S7.15).

Every path is relative to `src_vs_code/src/` unless it starts with `scripts/`, `todo/`, `research/` or `.github/`. Every `file:line` was opened
on `e18fd420` on 2026-11-17.

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
| G1 | The gate table `BRIDGED_DB_PROFILES` (`bridgedDbProfile.ts:25`) holds nine rows, `psql`, `mysql` and `sqlcmd` on `linux`, `win32` and `darwin`, none served. A row (`DbProfileRow`, `:15-19`) has a client, a platform and `served`. It names no vendor and no version. `bridgedDbPair` (`:33-37`) reads a row by client and platform. DP1 pins that none is served | E1.7 gives a row its vendor, its version ranges and the record of its runs (§S7.7). `mysql` is two clients under one program name, and so is `sqlcmd` |
| G2 | The order in `dbQueryAction.run` (`agentUseActions.ts:611-686`): the entry; its type; the gate (`:621`); the stored connection is read (`:629`); §S6.15 Z2's refusals (`:636`); `refuseQuery`; the launch; a missing client answers `tool_missing` (`:667-672`); the exec slot; the spawn (`:678`) under `bridgedSshEnv(process.env, process.platform, launch.env)` (`:680`). The spawn names no `cwd`. The gate is asked in `run`, so after the Allow | §S7.6 puts the client check between Z2's refusals and the spawn. §S7.8 asks the gate before the dialog too |
| G3 | Before anybody is asked, the broker calls `usable` (`credsAgentServer.ts:549-570`): the action's `validate(body, grant)` (`:562`), then for a bridged grant `referenceRefusal` (`bridgeScope.ts:316-318`), which asks the wall's `entryRefusal` first (`:60`, `:304-310`). Production builds it from the entry's details (`bridgeWallSource.ts:24`: the agent-forwarding refusal). Consent is asked after (`credsAgentServer.ts:537`). `validate`'s target type has no bridge (`useActions.ts:19`). `credsAgentServer.ts` has 795 lines of 800 | A road before the dialog exists for a bridged entry, and it needs no line in the broker's file (§S7.8) |
| G4 | The bridged launch (`dbCliLauncher.ts:251-267`, `:272-276`). `psql`: `-X`, `-c`, the query with its leading space, `--`, the string of `bridgedPsqlString` (`bridgedDbProfile.ts:398-405`): `host`, `port`, `dbname`, `user`, the three settings, then `passfile`, `sslcert`, `sslkey` at the absent file. `mysql` (`:285-293`): `--no-defaults`, `--protocol=TCP`, `-h`, `-P`, `-u`, `-D`, the three pins, `-e`. `sqlcmd` (`:296-299`): `-S host[,port]`, `-d`, `-Q`, `-b`, `-x`, with `SQLCMDUSER` (`:279`). The programs are the bare words `psql`, `mysql`, `sqlcmd` (`:24-28`) | The authentication controls are added here (§S7.5). libpq takes the last value of a keyword written twice (PQ2-d3), so a control stands last |
| G5 | The bridged environment is `PATH` and `HOME` off Windows, and seven names on Windows, with `USERNAME`, `USERDOMAIN` and `LOGONSERVER` asked for empty (`bridgedSshEnv.ts:17-24`). It holds no `KRB5CCNAME`, no `KRB5_CONFIG`, no `APPDATA`, and no `PG…`, `MYSQL…`, `LIBMYSQL…` or `SQLCMD…` name but the ones the launch adds | A bridged client finds a ticket cache, a realm file and a profile folder only by its own defaults. A positive control must put the identity where those defaults look (§S7.3, rule R2) |
| G6 | The `ssh` client check (`bridgedSshClient.ts`): a pure reading of the version answer (`:63-76`) against a floor constant (`:28`); one spawn of `-V` under `bridgedSshEnv` with no extra name, in a folder of its own that holds nothing and is removed (`:134-151`, `:184-192`), bounded at 10 s (`:81`); a good verdict kept per program for the life of the check, a bad one not kept (`:117-131`); a request that ended goes on as ended; a runner that cannot start the program is a client that did not answer, with the cause in the journal (`:154-160`). Production builds one check per window (`sshUseActions.ts:555`) | The model of §S7.6 |
| G7 | The profile's settings: `sslmode`, `connect_timeout` and `application_name` for a postgres URI (`bridgedDbProfile.ts:249-253`); none for `mysql` and `mssql`; the key-value keys of `:199-202`; a `sqlcmd` host is one plain host name (`:294`) | §S7.9 widens this list, key by key |
| G8 | The harnesses: `scripts/bridged-psql-itest.cjs` with `scripts/lib/psqlRig.cjs` (a fake that asks for a clear-text password, a fake that requests a client certificate; PD2, PD3, PQ2, legs (r) and (s)) and `scripts/bridged-mysql-itest.cjs` (a fake that completes the handshake; leg (m), PD1, PM1, leg (t)). Both say *POSIX only*. There is no `sqlcmd` harness. No leg starts a real database server. No fake asks for GSSAPI or SSPI or switches the authentication plugin | Every rig of §S7.3 is new |
| G9 | CI (`.github/workflows/ci-extension.yml`): `build-test` on `ubuntu-latest` installs Oracle's `mysql` client and unpacks MariaDB's (`:182-189`), installs `postgresql-client` (`:201-202`) and runs the two harnesses (`:193-194`, `:207-208`). The matrix on `ubuntu-22.04` and `ubuntu-24.04` runs the bridged `ssh` harness only (`:241-279`). `runner-windows` runs PW1 (`:328-329`). There is no macOS job. Other workflows start containers (`docker.yml:98`) | PW1's record (parent §7): on `windows-latest` `psql` was not on `PATH`, `mysql` 8.4.13 and a `sqlcmd` 15.0 answered |
| G10 | `toolCheck.ts` offers a person `psql` (`:60-68`), `mysql` (`:69-74`: `Oracle.MySQL` by winget, `mysql-client` by apt) and `sqlcmd` (`:75-83`: `Microsoft.Sqlcmd` by winget, `sqlcmd` by apt) | These are the clients a person is led to. PA1 says which builds they are |

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
| V7 | Legs (u), (v) and (w): the probe cases as assertions through the real builder and the real check | §S7.12 |
| V8 | A pair's row turned to served, one commit per pair | §S7.7 |
| V9 | The mutations | §S7.13 |
| V10 | The documents, the PR body, and M11 | §S7.14, §S7.15 |

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
| K, a Kerberos realm | `ubuntu-latest`, in a job of its own. [S] On the runner: `krb5-kdc` and `krb5-user` by apt, the KDC run by the runner's user on a loopback port, `/etc/krb5.conf` written with `sudo` for the realm `BRIDGE.TEST` with reverse lookups off, a ticket for `probe@BRIDGE.TEST` put into the default cache by `kinit` from a keytab. Or one container that holds the KDC, the clients and the harness | A ticket that a client finds under `PATH` and `HOME` alone. Service keys for the receivers | A `windows-latest` runner is in no domain, so no Kerberos ticket and no directory sign-in is on offer there. A ticket made on the Linux job and carried to the Windows job was not tried |
| G, a real PostgreSQL server | `ubuntu-latest` and `windows-latest`. [S] The image's own binaries, a cluster made by `initdb` in an owned folder and run by the runner's user; on Linux a container is the other way | One `pg_hba.conf` line per leg: `hostgssenc … gss`, `hostnogssenc … gss`, `sspi` (Windows), `scram-sha-256`, `md5`, `password`, `trust`, and `local … peer`. With `log_connections` its log names the identity and the method of each login | — |
| F, the fake servers | the harnesses, as today | PostgreSQL: it answers an encryption request with `G`, or sends authentication request 7 (GSSAPI) or 9 (SSPI), and records what comes back. MySQL: it sends a switch request that names a plugin, and records the answer. PD2's and PD3's servers as built | A fake cannot read the name inside a token. So the real server is the receiver that names the identity; the fake shows the request and that a token followed |
| M, MySQL and MariaDB servers | Linux: [S] the image's MySQL service for the socket of PP1; containers for PE1. Windows: the image's MySQL, if PA1 finds one | PE1's logins; PP1's socket | The server plugins for Kerberos, LDAP and Windows authentication are not in the free servers. So every plugin leg of PK1 uses the fake |
| Q, a SQL Server | Linux: [S] Microsoft's container image. Windows: [S] LocalDB if the image carries it, or SQL Server Express installed by the step with TCP on | PE1's login; how each login was made (`auth_scheme` of the connection; the server's error log) | An integrated login that succeeds needs a domain. On Linux the control is an attempt the server records, not a login. On Windows the install may not hold: then the pair is unmeasured. [S] The parent also allows a listener that reads the login packet; it must speak the protocol's encryption step, and a client that insists on encryption shows it no login in the clear (N8) |
| The clients | PA1 lists what each image carries. Added by a step: Oracle's `mysql` with its whole plugin folder; MariaDB's client with its GSSAPI plugin package; go-sqlcmd; the ODBC `sqlcmd` where the image has none; an older `psql` in a container (PA1) | — | A security key: a runner has no device. A virtual one was not tried. macOS: this plan's CI has no such runner |

**Said plainly, before any run.** A runner gives a Linux realm, real servers that check a password, and the Windows logon of the runner's own
account. It gives no Windows domain, no security key and no macOS. Every leg that needs one of those is unmeasured, and by the parent's rule
its pair stays refused. §S7.4 says which pairs that touches.

## S7.4 — The probes

Each probe is the parent's row (§7, the probe table). The **decision** of each is quoted from that row and is not changed here. *Expected* is
this spec's prediction, written before the run; the PR sets each beside what was observed.

### PA1 — versions, known controls, and the floor (V0)

**[C]** On `ubuntu-22.04`, `ubuntu-24.04`, `ubuntu-latest` and `windows-latest`, for each client the image carries and each client a step adds:

| # | What is run | What the leg records |
|---|---|---|
| PA1-a | the client's version flag, under the bridged environment | the whole line, on which stream, the exit code. For `sqlcmd`, the answers to `--version` and to `-?`, which tell go-sqlcmd from the ODBC client |
| PA1-b | `psql` against a closed loopback port with a keyword string that holds one candidate: `require_auth`, `sslcertmode='disable'`, `gssencmode='disable'` | *known* (the client goes on to the port) or the client's own words for a keyword it does not know |
| PA1-c | `psql` with `gssencmode='require'` | the client's own words: whether the build can do GSSAPI at all |
| PA1-d | each `mysql` client with `--plugin-dir=<a path nothing writes>` and, apart, `--skip-enable-cleartext-plugin`, before `--version` | known or not, in the client's words |
| PA1-e | the names of the files in each `mysql` client's own plugin folder | which loadable authentication plugins that build carries. PK1's list of plugin legs comes from this listing and from the parent's list together, never from memory |
| PA1-f | each `sqlcmd` with each candidate flag of §S7.5 and §S7.9 | known or not |
| PA1-g | **an older client.** A `psql` whose libpq does not know `require_auth`, given the string V3 will write. [S] A container with an older distribution's own `postgresql-client` | it refuses the string, or it goes on |
| PA1-h | the inventory: which servers and clients each image carries | the list §S7.3's rigs are built from |

**Decides (the parent):** each client's floor, and that an older client fails closed. **If it answers the other way (the parent):** *an older
client ignores an unknown control and goes on: the database client check is then its only lock, the row says so, and a client that neither
knows the control nor fails on it is not served.*

**Added by this spec, on the safe side:** if no rig can produce an older client (PA1-g), *fails closed* is unmeasured for it. The floor is then
the oldest version that ran with every control, the client check is the only lock below it, and the row's record says so.

*Expected:* `psql` 16 and newer know the three keywords; an older libpq refuses the string. Both `mysql` clients know `--plugin-dir`.

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
| PK1-w0 | **positive control, SSPI:** the string as built, entry B | G with an `sspi` line; then F sending request 9 | G's log names the runner's own logon with the method `sspi`. F got a token |
| PK1-w1 | as launched, entry A; then under `require_auth` | both | offered or not |
| PK1-w2 | GSS encryption: PA1-c's answer for this build | — | the build says it cannot do GSSAPI: recorded in those words. It can: no ticket can be on offer on this runner, so the leg is `UNMEASURED` |
| PK1-w3 | the profile files: a marker `pgpass.conf`, certificate and key, and `psqlrc.conf` in the runner's `%APPDATA%\postgresql` | PD2's and PD3's servers | the control (the three keywords and `-X` cut) sends the markers; the launch as built sends none |

Both `mysql` clients (rig F, with K where a plugin needs a ticket). One leg per plugin of the parent's list, and one more for every other
authentication plugin PA1-e lists for that client. Each leg: the control with no control of the profile; the launch as built; each candidate.

| # | The server switches the client to | The positive control needs | A runner can produce it |
|---|---|---|---|
| PK1-m1 | Kerberos (`authentication_kerberos_client`; MariaDB's `auth_gssapi_client`) | rig K and a client build that carries the plugin | Linux: yes, if a step adds the build. Windows: no (no domain) |
| PK1-m2 | LDAP SASL with the GSSAPI mechanism | rig K, the plugin, and the SASL module for GSSAPI | Linux: expected yes, not tried. Windows: no |
| PK1-m3 | the cloud key file (`authentication_oci_client`) | a throwaway key and configuration file in the rig home | yes: files only |
| PK1-m4 | a security key (`authentication_webauthn_client`, `authentication_fido_client`) | a device | no. `UNMEASURED` unless a virtual device is shown to work on the runner |
| PK1-m5 | a clear-text request (`mysql_clear_password`; MariaDB's `dialog`) | the enabling flag for Oracle's client; the plugin for MariaDB's | yes |
| PK1-m6 | Windows authentication (`authentication_windows_client`), on Windows | the runner's own logon | yes: the fake receives the first token of the logon's handshake. It cannot read the name (rig F) |

For these legs the receiver is the fake, which cannot read a name. So each control is shown in two halves: an answer arrives while the rig's
one ticket, key file or logon is in reach, and none arrives once it is taken away (the logon cannot be taken away: §S7.16 L3).

For PK1-m5 on Oracle's client the legs also show what keeps the plugin off as launched: an option file that enables it, read without
`--no-defaults` and not with it; and the enabling variable set in the harness and absent in the child.

**Decides (the parent):** per pair, whether the identity is offered, and which control stops it. **The decisions (the parent, word for word):**

- *Offered as launched, and one control stops it in every leg:* that control is the pair's authentication policy and the leg becomes an assertion.
- *Not offered as launched, while the positive control shows it can be:* recorded; the pair still gets the control, since a default is not a lock.
- *Offered under every candidate:* the pair stays refused (Q18), and the row returns to the lead.
- **The positive control cannot be produced on a runner (no realm, no client build with the plugin, no client on the image): the leg is
  *unmeasured*, never closed, and the pair stays refused.**

**How this spec reads *one control*.** For `psql` the policy is a set of keywords, since by N2 the two GSS roads are closed by two different
keywords. Each keyword of the set has a leg that leaks without it. If PK1-p3 shows that one keyword closes both roads, the other still stands
in the string: the parent's second decision (a default is not a lock).

*Expected.* `psql` on Linux: both GSS roads are offered as launched, and the two keywords together stop both. `psql` on Windows: SSPI is
offered as launched and `require_auth` stops it; PK1-w2 is `UNMEASURED` if the build can do GSSAPI. Oracle's `mysql` on Linux: each loadable
plugin is offered as launched where the build carries it, and `--plugin-dir` at an absent path stops it; clear text is not offered as launched;
PK1-m4 is `UNMEASURED`. Oracle's `mysql` on Windows: Windows authentication is offered as launched and under every candidate, because the plugin
is built in. MariaDB's client on Linux: GSSAPI is offered, `dialog` and clear text send the entry's password in the clear, and `--plugin-dir`
stops all three.

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

**Decides (the parent):** whether a `sqlcmd` that is given a user and a password can sign in as anything else. **The decisions (the parent):**

- *A user and a password give a SQL login for that user and nothing integrated:* the pair may be served.
- *An integrated or directory sign-in is still tried, or the configuration file is read:* that client stays refused until a flag is shown to
  stop it; back to the lead.
- *No receiver or no positive control on a platform:* unmeasured, refused.

*Expected.* PS1-1 is a SQL login on both clients. go-sqlcmd does not read its configuration file when `-S` is given. On Windows the control
depends on rig Q's install. On Linux the control depends on whether either client makes an attempt the server can record.

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
| PE1-4 | PostgreSQL with `trust` | a wrong password | the **client** refuses: the server asked for nothing (N4) |
| PE1-5 | MySQL with its default plugin, for Oracle's client; MariaDB with its default plugin, for MariaDB's client | the entry's user and password; a wrong one | logged in; refused |
| PE1-6 | the two cross cases: MariaDB's client to MySQL, Oracle's client to MariaDB | the entry's user and password | recorded. A failure here is a cost of the control and is said in §S7.15; it does not hold a pair back |
| PE1-7 | SQL Server | a SQL login with the entry's user and password; a wrong one | logged in, `auth_scheme` SQL; refused |

**Decides (the parent):** that the profile still lets the entry's own credential in, and that nothing else decided the login. **The decision
(the parent):** *the login fails under the profile:* the pair is not served until it passes. A control dropped to make it pass goes back to the
lead first.

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
| MariaDB's client | `--plugin-dir=<the absent file>` | GSSAPI, `dialog`, clear text | the same flags |
| go-sqlcmd | `--authentication-method=SqlPassword`, if PS1-6 shows it is known and the login still works | An integrated or directory sign-in | `-b`, `-x`; no `-X1` (the parent's change 4.1); both variables always |
| `sqlcmd`, the ODBC client | none: the user and the password, both always given | — | the same |

**The `require_auth` list. [C]** It names password methods and nothing else. It never names `gss`, `sspi` or `none`, and it does not grow by
itself with a later libpq: a method is added only by a commit that records its PE1 leg. Why `none` is out: a server that asks for nothing
has decided the login by something that is not the entry's password, and with `ident` that something is the person's own system login (N4;
PE1-4). Why the three password methods are in: each is an answer made from the entry's stored password, which is what part 2 of the parent's
profile allows. §S7.16 L2 names the cost of the clear-text one.

**The absent path. [C]** `--plugin-dir` names the same path as Y6's variables, `keys/<pid>/no-client-file`, which nothing writes. PK1 runs it
in that form.

**What no control here does.** None of them changes what the entry's own password is sent to: that is the entry's host, by Q11. None of them
closes a client that PK1 or PS1 did not run.

## S7.6 — The database client check and its floors (V4)

Modelled on the `ssh` client check (G6). New `bridgedDbClient.ts`, pure, no `vscode`. [S] The names and the shapes:

```ts
export type DbVendor = 'postgresql' | 'oracle' | 'mariadb' | 'go-sqlcmd' | 'odbc-sqlcmd';
export type DbClientVerdict = { ok: true; vendor: DbVendor; version: string } | { ok: false; sentence: string };
/** Reads a version answer against the rows that are served for this client on this platform. */
export function dbClientVerdict(rows: readonly DbProfileRow[], client: DbClient, platform: NodeJS.Platform, exit: number | null, stdout: string, stderr: string): DbClientVerdict;
export function bridgedDbClientCheck(parts: DbClientCheckParts): (call: { client: DbClient; program: string; guards?: … }) => Promise<DbClientVerdict>;
```

**[C]**

1. **When.** Only when the table serves at least one row for that client on this platform; otherwise nothing is started (parent §4.11). After
   the Allow, after §S6.15 Z2's refusals and after `refuseQuery`, and before the query spawn. So an entry the profile refuses spends no spawn,
   the version spawn included. A client that is not on `PATH` answers `tool_missing` as today (G2), before the check: an absent client is
   not a client that did not answer.
2. **What is asked.** The client's version flag and nothing else: no host, no user, no query. The environment is `bridgedSshEnv` with no extra
   name, so the child holds no password variable and no user variable. Standard input is closed. It is bounded at ten seconds and killed at
   the bound.
3. **Which program.** The check asks the program word the query spawn will use, from a folder of its own that holds nothing and is removed
   afterwards. The query spawn of a bridged call starts from a folder that holds nothing too. Why: on Windows a bare program name is looked
   for in the current folder before `PATH` (G6), and today the query spawn names no folder (G2), so the two could start different files.
4. **The reading.** Vendor and version are read from the start of the client's own version line, on the stream PA1-a recorded. The patterns
   are written from the lines PA1 recorded, and each recorded line is a test case with its CI run beside it. An exit that is not 0, or a line
   the patterns do not read, is DR7. A line that is read and that no served row holds (another vendor, a version below a range or above it)
   is DR8.
5. **Two clients under one name.** `mysql` is Oracle's or MariaDB's, and `sqlcmd` is go-sqlcmd or the ODBC client. The reading tells them
   apart, and a line it cannot place is DR7. [S] If no one flag makes both `sqlcmd` clients answer, a second bounded spawn is allowed for
   `sqlcmd` only.
6. **Kept.** A good verdict is kept per program for the life of the check, which is the window's. A bad one is not kept: the next call asks
   again. A request or a window that ends while the spawn runs goes on as ended, not as DR7. A runner that cannot start the program is a
   client that did not answer, with the cause in the journal.
7. **The floors.** A served row holds version ranges (§S7.7). The lower end of a range is the floor, and both ends are versions a leg ran on.
   A version above the newest that ran is refused like one below the floor: nothing is assumed of what a later client adds (the tenth lesson).
8. **What the floor is not.** `psql` prints its own version and not libpq's (N3). The lock for a libpq that lacks a control is that it refuses
   the string (PA1-g). The floor is the earlier and clearer refusal. Where PA1-g could not be run, the row's record says that the check is
   the only lock.
9. **The verdict reaches the builder.** `buildDbQueryLaunch` with `bridged` takes the verdict and writes the vendor's controls from it
   (§S7.5). [S] As one more field of its options.

[S] One check per window, built where the database action's parts are built (`extension.ts:623-632`), with the storage folder and the
journal's note, as `sshUseActions.ts:555` builds the `ssh` one.

## S7.7 — The table, and how a pair turns to served (V8)

**The row. [C]** A served row names, beside its client and platform: the vendor; one or more version ranges, each with a lower and an upper
end; and the record of its runs. [S] The shape:

```ts
export interface DbServedBuild { readonly vendor: DbVendor; readonly from: string; readonly to: string; readonly record: string }
export interface DbProfileRow { readonly client: DbClient; readonly platform: NodeJS.Platform; readonly served: boolean; readonly builds?: readonly DbServedBuild[] }
```

- A range covers no version series that no leg ran on. [S] The series: a major version for `psql`, `major.minor` for the two `mysql` clients
  and for the two `sqlcmd` clients.
- `record` names the CI run and the commit the legs ran on, as text (`run <number> at <sha>`).
- `bridgedDbPair` answers by client and platform, as built: served when the row is. Which build and version is the client check's question.

**The commit that turns a row. [C]** One commit per pair. It sets `served`, writes the vendor, the ranges and the record, changes the list
of served rows that DP1 names, and adds the pair's row to §S7.20 with every leg's result beside its control. It changes nothing else.

**Before that commit. [C]** For that client, vendor, version series and platform, all on CI and all recorded:

1. PA1 answered, and every control of the pair is known to that client.
2. PK1 (or PS1) ran, each leg beside a positive control that was shown, and under the pair's controls nothing was offered in any leg.
3. PE1 logged in with the entry's own user and password, and the wrong password was refused.
4. Every defence in the pair's row of the parent's §4.11 table ran on that platform. For a Windows pair that means the cases of leg (m), of
   PD1-PD3 and of legs (s) and (t) on `windows-latest`, which today's harnesses do not do (G8).
5. The pair's leg of (u)-(w) is green as assertions, through the builder and the check, on the commit before.
6. No leg of the pair printed `UNMEASURED`. PP1 is the one exception, as the parent says.

**The lock in CI. [C]** Each harness reads the real version line of every client it finds through `dbClientVerdict` and the production table.
If the table serves a row for that client on that platform, the verdict must be ok and that pair's legs must have run in that job. So a
served row whose client left the image, or moved past the range, turns the run red, and a new series is added only by a commit that records
its legs.

**Who writes the parent.** The coder does not edit the parent or the stories document. The probe results go to the lead, who writes them into
the parent's probe table and into §4.11's table. Those are results recorded as the plan asks, not entries of the ledger.

**A wider reading than what ran, said here.** A row's unit is the parent's: the client's vendor, a version range and the platform. The legs
run on the builds CI installs. A build CI does not install (another distribution's package of the same version) is served by the same row,
because the check reads the vendor and the version and nothing finer. §S7.17 says so, and §S7.16 L4 leaves it with the lead.

## S7.8 — The gate's refusal before the consent dialog (V5)

The parent leaves this to E1.7 (§4.11): the refusal needs only the entry's type and the platform. **The decision: yes, for that part.**

**[C]**

- A bridged `query` on an entry whose client has no served row on this platform is answered **before the dialog**. The body is
  `BRIDGE_USE_REFUSED(<the entry>)`. The journal holds DR1, once. No dialog was shown (`w.dialogs.length === 0`). The stored connection was not
  read (the storage stub's count is 0). Nothing was spawned (`runs` is empty). This holds for a token call and for an MCP call, and under each
  consent policy of the entry.
- It is asked in the step where the broker asks before anybody is asked (G3). [S] The seam is the wall's `entryRefusal`, which production
  builds from the entry's details: a database entry has the one action `query` (`agentUseActions.ts:592`), so a refusal of the entry is a
  refusal of that action. The other seam is an optional method of `UseAction`. Either way `credsAgentServer.ts` stays within its 800 lines.
  [S] The code stays `not_supported`, and the journal sentence travels as the refusal's detail.
- **The gate in `run` stays** (`agentUseActions.ts:621`). It is asked twice, as the scope wall is asked again at launch: a second road into
  `run` must not skip it. T68 and T69 take out one each.
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

DR1-DR6 stay as built (`bridgedDbSentences.ts`). New, **[C]**:

| # | When | Sentence |
|---|---|---|
| DR7 | the client did not answer its version, or the answer could not be read | `<client> did not answer its version under the environment a Remote Bridge gives it (exit <code>). No database query can go through a Remote Bridge with <client> from this computer until it does.` |
| DR8 | the answer was read, and no served row holds it | `The <client> on this computer answered <token>. A Remote Bridge runs a query with <client> on <system> only for the versions that were measured: <ranges>.` |
| DR9 | a bridged launch was asked for with no verdict of the client check | `The launch of this call was built without the client check having passed.` |

- **Roads.** A bridged `query` only, in `run`, after the Allow. DR9's code is `internal`; the others keep `not_supported`.
- **Observations.** DR7 and DR8: the spawner stub recorded one spawn, the version spawn, with no password variable, and no query spawn; the
  next call records a second version spawn (a bad verdict is not kept). DR9: `runs` is empty.
- **What each holds.** The client's fixed name, the exit code or the word `unknown`, the token the pattern matched (the vendor's words and
  the version, and no other part of the output), the system's name, and the ranges, which are constants. No path, no value of the entry, no
  text of the stored connection.
- **What each knows.** DR7 and DR8 are said by the check: it knows what the client answered now, and that the next call asks again. Neither
  says why the person's client is what it is, nor what to install.

## S7.11 — The tests, RED first

Each is written before its code and watched failing for its own reason. The record goes in §S7.20.

New `test/bridgedDbClient.test.ts`:

| # | Scenario | Observation |
|---|---|---|
| DC1 | each version line PA1 recorded, with its CI run named in the test | the vendor and the version |
| DC2 | an exit that is not 0; empty output; a version word later in the line; the line on the other stream | DR7 |
| DC3 | a version below a range; above it; a vendor with no served row | DR8 with the token and the ranges; a sentinel in the rest of the output is in no sentence |
| DC4 | MariaDB's line and Oracle's; go-sqlcmd's and the ODBC client's | neither is read as the other |
| DC5 | a good answer, then a second call; a bad answer, then a second call | one spawn; two spawns |
| DC6 | the version spawn | its arguments are the version flag alone; its environment holds only the bridged names; its folder holds nothing and is gone afterwards |
| DC7 | a request that ends during the spawn; a runner that throws | it goes on as ended; DR7 with the cause in the journal |
| DC8 | a table that serves no row for the client on this platform | the check starts nothing |

`test/bridgedDbProfile.test.ts`:

| # | Scenario | Observation |
|---|---|---|
| DP1, rewritten | the production table | its served rows are exactly the list the test names; each has a vendor, ranges whose lower end is not above the upper, and a record of the form `run <number> at <sha>`; no `darwin` row is served |
| DP18 | the `psql` string for a served pair | it ends with `passfile`, `sslcert`, `sslkey`, then the three policy keywords with §S7.5's values; nothing from the entry stands after them |
| DP19 | `require_auth`'s value | each word is a password method; `gss`, `sspi` and `none` are not in it |
| DP4, kept | a URI that names `require_auth`, `gssencmode` or `sslcertmode` | DR2 |

`test/dbCliLauncher.test.ts`:

| # | Scenario | Observation |
|---|---|---|
| Q1-Q3, extended | bridged, with a verdict, each client and vendor | the controls of §S7.5 in their places: `--no-defaults` first, `--protocol=TCP` second, then the vendor's flags |
| Q12 | bridged, with no verdict | `undefined` |
| Q13 | a MariaDB verdict; an ODBC verdict | no flag that only the other vendor knows |
| Q11, kept | off a bridge, the golden record | byte for byte `main`'s |

`test/bridgeRunSites.test.ts`, through the doors:

| # | Scenario | Observation |
|---|---|---|
| DG5 | a table with no served row for the client on this platform; a bridged `query` by a token and by MCP | the generic body; DR1 once in the journal; `w.dialogs.length === 0`; no read of the stored connection; `runs` empty |
| DG6 | DG5 under each consent policy | the same |
| DG7 | a table that serves the pair, a good verdict | one dialog with today's words; the version spawn, then the query spawn; a second call records the query spawn alone |
| DG8 | a table that serves the pair, a bad verdict | one dialog; the generic body; DR8 in the journal; one version spawn and no query spawn |
| DG9 | a table that serves the pair, an entry §S6.15 Z2 refuses | no spawn at all, the version spawn included |
| DG10 | the query spawn of a served pair | it starts from a folder that holds nothing, with the program word the check asked |
| DG1, kept | `run` called directly with the production table and an unserved pair | DR1; nothing read; nothing spawned |
| DG2, kept | the main port | as today; no table, no check |
| DK1-DK3 | §S7.9: each key of kind (a) with each value; each key of kind (b); each key not added | the flag in the arguments; a launch equal to the one without the key; DR2 |

## S7.12 — The legs (u), (v) and (w) (V7)

**[C]** The parent's §7: one leg per client family, the cases of PK1, PP1 and PS1 as assertions on each pair the story serves, each beside its
positive control and with PE1's login. Each leg takes its arguments and variables from `buildDbQueryLaunch` with `bridged` and the verdict of
the real check, and its environment from `bridgedSshEnv`.

- **(u), `psql`.** In `scripts/bridged-psql-itest.cjs` and its `lib/`. Per served pair: the control of each road leaks (the name in the
  server's log, the marker, the certificate); production offers nothing on that road; PE1-1 to PE1-4 pass; with `sslmode=verify-full` and a
  marker CA in the client's default place the client connects, offers no certificate and sends nothing but the login (the parent's *trust,
  not authentication*, on each served pair).
- **(v), `mysql`.** In `scripts/bridged-mysql-itest.cjs`, per vendor. Each plugin leg of PK1 for that pair; PP1-1; PE1-5.
- **(w), `sqlcmd`.** New `scripts/bridged-sqlcmd-itest.cjs`, with `itest:bridged-sqlcmd` in `package.json` and a line in `run-itests.mjs`.
  PS1-0, PS1-1, PS1-3 and PS1-5 per served pair; PE1-7.
- Each leg begins with §S7.7's lock: the real client, read through the check against the production table.
- A pair that is not served keeps its record legs. They assert nothing and print what happened, so the next run on a wider rig starts from
  them.
- [S] A Windows pair needs these harnesses to run on `windows-latest`; they are POSIX only today (G8). [S] A harness file stays under 800
  lines; the rigs go to `scripts/lib/`.

## S7.13 — Mutations, added to the E1.6 spec's §S6.6

Each is applied, compiled, run and restored, as §S6.13 records for the others. T43 of §S6.15 (*mark one row served*) now fails DP1's list.

| # | Mutation | Must fail |
|---|---|---|
| T56 | Serve a row with no record, or with a range whose ends are swapped | DP1 |
| T57 | Drop `gssencmode='disable'` | DP18; (u), the encryption road |
| T58 | Drop `require_auth` | DP18; (u), the authentication road, the SSPI road, PE1-4 |
| T59 | Add `gss`, then `none`, to the list | DP19; (u) |
| T60 | Drop `sslcertmode='disable'` | DP18. (No leg fails while `sslcert` and `sslkey` stand at the absent file: said, not hidden) |
| T61 | Write the policy keywords before the entry's settings | DP18 |
| T62 | Drop `--plugin-dir` | Q2; (v) |
| T63 | Write Oracle's flags for a MariaDB verdict | Q13 |
| T64 | Skip the client check for a served pair | DG7; Q12 |
| T65 | Keep a bad verdict | DC5; DG8's second call |
| T66 | Give the version spawn the password variable | DC6 |
| T67 | Accept a version above the range | DC3 |
| T68 | Take out the ask before the dialog | DG5 |
| T69 | Take out the gate in `run` | DG1 |
| T70 | Run the client check before §S6.15 Z2's refusals | DG9 |
| T71 | Start the query spawn from the extension host's folder | DG10 |
| T72 | Carry a kind (b) key into the arguments; honour `Encrypt=false` as `true` | DK1-DK3 |
| T73 | Apply any control off a bridge | Q11; DG2 |

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
- *No client on that host lands in a served row:* recorded in those words. The PR says that no pair is served on the owner's host, and E4.2
  asks the owner, as the parent says. M11 by itself turns no row: a row opened from a run on a person's machine needs the same legs and
  positive controls as one opened from CI, and that is the lead's decision (§S7.16 L5).
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
| A client outside every served range, older or newer | no leg ran on it | a commit that records its legs |
| Oracle's `mysql` on Windows (expected) | Windows authentication is built into the client, and no candidate stops it | a control shown to stop it; to the lead |
| Oracle's `mysql`, wherever PK1-m4 is `UNMEASURED` (expected) | a runner has no security key, so that leg has no positive control | a virtual device on the rig; or the lead's decision on that leg (§S7.16 L1) |
| `psql` on Windows, if PK1-w2 is `UNMEASURED` (expected) | no Kerberos ticket can be on offer on a runner outside a domain | a rig with a realm the Windows client can find |
| A `sqlcmd` pair whose rig Q or whose control could not be produced | unmeasured | the rig |
| `mongosh` | never launched, on every door, as before | — |
| An entry with no user or no stored password; a socket or no host; a setting outside the profile and outside §S7.9 | Q16, Q17, Q15 | the owner's other answers |
| A database that wants a client certificate, Kerberos, SSPI or a directory sign-in | the policy declines exactly that request | a typed field per kind (parent §8, E4's todo) |
| A server that logs in with no authentication request (`trust`, `ident`) | `none` is not in the list (§S7.5) | — |
| A MySQL account that needs a plugin MariaDB's client loads from its folder (expected: `caching_sha2_password`) | the plugin folder is the absent path | a folder this extension fills is not built here; to the lead |
| `sqlcmd` hosts with an instance name, an IPv6 address or a protocol prefix | as built; PS1-7 records them only | a later story |

**Documents (V10). [C]**

- `research/module_extension.md`: the database road on a bridge, from the code as built: the controls per client, the client check, the gate
  before the dialog, which pairs are served and which are not, each with its reason.
- `research/module_tests.md`: the rigs, the probes and legs (u)-(w), and what each does not prove.
- No CHANGELOG bullet: no door reaches a bridged query (R1 until E2.2b, then the switch of the parent's §4.5 until E4.1's flip), and off a
  bridge nothing changes. If the diff shows a change on a local door, the bullet is written from that diff.
- The PR body says: which pairs are served, with their versions; which are refused, and for each whether it was measured and failed, or was
  unmeasured, and what was missing; each prediction of §S7.4 beside what was observed; the keys §S7.9 added and the ones it left; that the
  parent's §4.9 row 10 is disposed by PK1's record; and M11's state.

**Growth.** The client check keeps at most one verdict per program for a window's life. Its folder is removed after each check. A rig's
files live in owned folders and its containers are removed by the harness scope. Nothing here grows on a person's computer.

## S7.16 — Decisions, what is owed to the parent, and the open points

**No plan change is needed to specify E1.7.** Checked against `plan-change-control.md`'s list: this spec adds no scope, goal, epic or story;
it changes no line of §9 and no merge condition; every probe decision is the parent's, quoted; the controls are the parent's candidates and
become contracts only by their probes, as §4.11 says; the gate before the dialog and the keys of Q15 are questions the parent hands to E1.7.

**What would be a plan change, and is therefore not built here.** Serving a pair whose positive control was not shown. Counting a weaker
observation as that control (L1). Narrowing `require_auth` to fewer password methods than PE1 showed to work (L2), or serving an entry with no
password. Dropping a control so that PE1 passes. Opening a row from M11 alone. Each goes to the lead, who asks the consultants first.

**Open points for the lead.**

- **L1. The security-key leg.** By the parent's rule Oracle's `mysql` stays refused on every system while PK1-m4 has no positive control. The
  control `--plugin-dir` works by keeping the plugin from loading at all, so a leg could show *the plugin loaded and asked for a device* against
  *the plugin could not be loaded*. That is a weaker control than the parent's (*the receiver must get a token for that identity*). Accepting
  it changes PK1's rule and counts. This spec builds the strict reading.
- **L2. The clear-text password method.** `require_auth` lists `password`, because the parent allows an answer made from the entry's own
  password. With a `sslmode` that verifies nothing, whoever answers at the entry's host gets the password itself. That is so off a bridge
  today, and for `mysql` (the parent's §4.11 measured it). A list of `scram-sha-256` alone is stronger and refuses older servers: a
  narrowing, for the owner.
- **L3. PK1-m6 and the name.** The fake receives the first token of the logon's handshake and cannot read a name. This spec counts that as the
  control for Oracle's `mysql` on Windows only to show that the road is open; the pair is expected to stay refused, so nothing rests on it.
  If a control for that plugin is ever found, the receiver must name the identity before the pair is served.
- **L4. A build that did not run.** §S7.7's last paragraph. The lead may narrow the reading to the builds that ran.
- **L5. A row opened from a person's machine.** Q18 allows it (*a recorded run on a person's machine*). This spec gives no procedure for it
  beyond *the same legs and controls*. The owner's host is Windows, and the Windows pairs are the ones a runner measures worst (§S7.3).
- **L6. The query spawn's folder.** §S7.6 item 3 changes where a bridged query starts. The parent is silent. It is built as the safe side.
- **L7. *One control*, read as a set.** §S7.4 reads the parent's *one control stops it in every leg* as a set of keywords for `psql`, each
  with its own leg, because two roads are expected to need two keywords (N2). If the lead reads the parent strictly, a pair whose roads
  need two keywords returns to the lead before it is served.
- **L8. Stale lines in the parent and in `todo/README.md`.** The parent's status line and its README row still say that E1.6 is on PR #365,
  unmerged. `main` holds it as `e18fd420`. Neither names this file yet. Wording, for the lead.

**Owed to the parent, by the lead, from this story's results:** the probe table's rows PK1, PS1, PP1, PA1, PE1 and M11; §4.11's table (which
pairs are served, with their ranges); §4.9's row 10; *Not established here* in §4.11, for every cell a probe settled.

## S7.17 — Not verified by this spec

- No database client and no server was run for it. N1-N9 are from memory or from documentation. Every rig of §S7.3 is a design: none was built,
  and each *expected* line is a prediction.
- That a runner's image carries what N9 says. PA1-h reads it first, and a rig that needs something else changes with the reason in §S7.20.
- That a KDC runs as the runner's user, and that a client under `PATH` and `HOME` alone finds the ticket in the default cache. If it does
  not, rig K has no positive control and every leg that needs it is unmeasured.
- That the real PostgreSQL server's log names the identity before it checks the role. If it does not, the control uses a role with the
  ticket's name.
- The version lines of the five clients. The patterns of §S7.6 are written from PA1's record, not from this spec.
- That `--skip-enable-cleartext-plugin` and `--authentication-method=SqlPassword` exist in those spellings. PA1-d and PA1-f.
- What a second build of the same vendor and version does (§S7.7). One build per version runs.
- The Windows half as a whole. Today no database client was run on Windows beyond a version flag (the parent's §4.11).
- A measured pair is measured for the legs that ran. A plugin or a keyword that a later client version adds is covered only by the upper end
  of the range, which refuses that version until its legs run.

## S7.18 — Review checklist

For Opus, on the code; points 8-15 are Fable's authentication judgement at review.

1. Off a bridge: the diff shows no changed line on the off-bridge branches of `buildDbQueryLaunch` and `dbQueryAction` but the added
   conditions, and the golden record of Q11 is untouched.
2. Each probe commit adds only the probe, and its CI run is named in §S7.20 before the commit that builds on it.
3. Every refusal of §S6.15 Z2 is still before any spawn, the version spawn included.
4. The version spawn holds no password variable, no user variable and no connection argument.
5. Each sentence of §S7.10 holds no value and says only what the check read.
6. The mutations of §S7.13 were run, and each named case failed for the reason given.
7. §S7.20 names each **[S]** that changed, with the reason, and each prediction beside its observation.
8. *What a served pair rests on.* For each served row, read its record: every leg of §S7.7's list ran on that client, version and platform,
   each control was **shown**, and no leg is `UNMEASURED`.
9. *The control was the thing that stopped it.* For each control, the leg that leaks without it and does not leak with it. A control with no
   such leg is a defence and is called that.
10. *The positive control was real.* It ran under the bridged environment (rule R2), and the receiver named the identity or the spec says why
    it could not.
11. *The list is positive.* `require_auth` names password methods only, each with its PE1 leg; a row's range has two ends that ran.
12. *The entry's own login.* PE1 passed under the whole profile, and a wrong password was refused by the server or, for `trust`, by the client.
13. *One client, one verdict.* The program the check asked is the program the query starts, from a folder that holds nothing.
14. *Before the dialog.* Only the table decides there. Nothing of the entry's connection is read, and nothing is spawned, for a call nobody
    allowed.
15. *What stays refused is said.* The PR lists every refused pair with *measured and failed* or *unmeasured*, and no document calls an
    unmeasured pair closed.

## S7.19 — Contract → step → test

| Contract (parent) | Step | Test or leg |
|---|---|---|
| §4.11 part 2: the client answers with the entry's password and nothing else | V1, V3 | PK1, PS1; DP18, DP19, Q1-Q3, Q13; (u), (v), (w); T57-T63 |
| §4.11 part 4: measured on a named client, version and platform, beside a positive control, with PE1's login | V0-V2, V7, V8 | PA1, PK1, PS1, PP1, PE1; rules R1-R4; DP1; §S7.7's lock |
| §4.11, the gate: a row is turned in the commit that records its runs | V8 | DP1; T56; checklist 8 |
| §4.11, the database client check: before a window's first bridged spawn, bounded, never a query, a good answer kept, a bad one asked again | V4 | DC1-DC8; DG7-DG10; T64-T67, T70, T71 |
| §4.11: whether the gate's refusal can be said before the dialog, observed by `w.dialogs.length` | V5 | DG5, DG6; DG1; T68, T69 |
| Q15: the keys E1.7 may add | V6 | DK1-DK3; T72 |
| Q16, Q17: still refused before any spawn | V4 | DG9; T70 |
| Q18: an unmeasured pair is refused; a pair whose control cannot be produced stays unmeasured | V1, V8 | rule R4; §S7.15; checklist 15 |
| §4.9 row 10 | V1 | PK1's record |
| §7 legs (u)-(w) | V7 | §S7.12 |
| §7 M11 | V10 | §S7.14 |
| §9, the invariant line: claimed for the served pairs and for no other | V8, V10 | DP1; the PR body |
| Off a bridge, byte for byte today's | every step | Q11; DG2; T73 |

## S7.20 — As built

*Empty until the story is built.* The coder records here: the RED record of §S7.11; each probe's CI run, commit, version lines and results,
with each prediction of §S7.4 beside what was observed; each pair's row as §S7.7 asks; each **[S]** that changed, with the reason; the
mutations' runs; M11.
