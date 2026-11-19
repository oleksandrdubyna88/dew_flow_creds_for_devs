'use strict';
// The assertions of legs (u), (v) and (w) of the E1.7 spec (`todo/PLAN_remote_bridge_scoped_E1_S7_spec.md` §S7.12, §S7.7 item 5): what each leg of a pair must show, as data over the lines the legs
// print. The probe legs (`pkPsqlLegs.cjs`, `pkMysqlLegs.cjs`, `psLegs.cjs`, `dbPe1Legs.cjs`, `dbPp1Legs.cjs`) and the direct psql legs (`dbAssertPsqlLegs.cjs`) build every launch through the REAL
// `buildDbQueryLaunch` under the verdict of the REAL client check (`dbCandidates.cjs`); `dbAssert.cjs` reads what they printed and judges it against the expectations below.
//
// An expectation is `{ id, leg, match, mode, min, after, na, noStop }`:
//   id     the abstract name of the leg, as a job's list of §S7.7 holds it (it names no client);
//   leg    the id the printed `record (<leg>)` line carries (it may hold the client's name in this harness);
//   match  what the text of a record of that leg must say; `mode` is `any` (some record says it: the default, since a leg id is shared by lines of several cases) or `all` (every record says it);
//   min    how many records of the leg there must be (default 1);
//   after  the id of the expectation that is the POSITIVE CONTROL of this one: while that is not shown, this one is not judged (R4: `not shown`);
//   na     the id of a record that says the leg is not this client's road (a plugin the parent's list does not name for MariaDB's client): the expectation is then not applicable;
//   noStop a `STOP (<leg>)` line of the same leg is a failure.
// A leg whose control printed `UNMEASURED` is `not shown`, and one that printed nothing is `not run`. The words each `match` looks for are fixed words of the legs: a leg that stops saying them
// turns its pair's assertions into `FAIL`, never into a pass.

const LEAKS = /\bLEAKS\b/;
const HELD = /\bHELD\b/;
const SHOWN = /./;
const NOT_OFFERED = /identity not offered/;

/** Leg (u), `psql`: the roads of PK1 (entries A and B, the environment that says the opposite), the certificate road with the other defences cut (T60), verify-full, `~/.postgresqlrc`, PE1-1 to PE1-4, PP1-1. */
const PSQL = [
  { id: 'PK1-p0', leg: 'U-enc-control', match: LEAKS },
  { id: 'PK1-p1', leg: 'U-auth-control', match: LEAKS },
  { id: 'PK1-p5', leg: 'U-cert-control', match: LEAKS },
  { id: 'PK1-p2-enc', leg: 'U-enc-built', match: HELD, after: 'PK1-p0', min: 2, mode: 'all' },
  { id: 'PK1-p2-auth', leg: 'U-auth-built', match: HELD, after: 'PK1-p1', min: 2, mode: 'all' },
  { id: 'PK1-p4-enc', leg: 'U-enc-env', match: HELD, after: 'PK1-p0', min: 2, mode: 'all' },
  { id: 'PK1-p4-auth', leg: 'U-auth-env', match: HELD, after: 'PK1-p1', min: 2, mode: 'all' },
  { id: 'PK1-p5-built', leg: 'U-cert-built', match: HELD, after: 'PK1-p5' },
  { id: 'PK1-p5-sslcertmode', leg: 'U-cert-mode-only', match: HELD, after: 'PK1-p5' },
  { id: 'PQ2-f-verify-full', leg: 'U-verify-full', match: HELD, after: 'PK1-p5' },
  { id: 'PA1-i-postgresqlrc', leg: 'U-rc', match: /HELD|NOT A LAUNCHER/ },
  { id: 'PE1-1', leg: 'PE1-1/2', match: /server method scram-sha-256, the entry's user and password, under the whole profile: LOGGED IN/ },
  { id: 'PE1-2', leg: 'PE1-1/2', match: /server method scram-sha-256, a wrong password, under the whole profile: REFUSED/ },
  { id: 'PE1-3-md5-login', leg: 'PE1-3', match: /server method md5, the entry's user and password, under the whole profile: LOGGED IN/ },
  { id: 'PE1-3-md5-wrong', leg: 'PE1-3', match: /server method md5, a wrong password, under the whole profile: REFUSED/ },
  { id: 'PE1-3-password-login', leg: 'PE1-3', match: /server method password, the entry's user and password, under the whole profile: LOGGED IN/ },
  { id: 'PE1-3-password-wrong', leg: 'PE1-3', match: /server method password, a wrong password, under the whole profile: REFUSED/ },
  { id: 'PE1-4-control', leg: 'PE1-4', match: /server method trust, CONTROL: a wrong password with require_auth cut by hand: LOGGED IN/ },
  { id: 'PE1-4', leg: 'PE1-4', match: /server method trust, a wrong password, under the whole profile: REFUSED/, after: 'PE1-4-control' },
  { id: 'PP1-1', leg: 'PP1-1', match: /psql, the production launch .*over TCP/ },
];

const PLUGINS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm5b'];

/** Leg (v), a `mysql` client named `name`: each plugin leg (control, entries A and B, the decision), PK1-m7's four path names, PP1-1, PE1-5 or PE1-6 at both servers. */
function mysqlRules(name, vendor) {
  const login = vendor === 'oracle' ? 'PE1-5' : 'PE1-6';
  const plugin = (leg) => [
    { id: `PK1-${leg}-control`, leg: `PK1-${leg}-${name}-control`, match: SHOWN, na: `PK1-${leg}-${name}` },
    ...['A', 'B'].map((side) => ({ id: `PK1-${leg}-built-${side}`, leg: `PK1-${leg}-${name}-built-${side}`, match: NOT_OFFERED, after: `PK1-${leg}-control`, na: `PK1-${leg}-${name}` })),
    { id: `PK1-${leg}-decision`, leg: `PK1-${leg}-${name}-decision`, match: /stopped in every leg of it by|nothing was offered under any candidate/, after: `PK1-${leg}-control`, na: `PK1-${leg}-${name}`, noStop: true },
  ];
  const paths = ['dotdot-default', 'absolute-default', 'dotdot-empty', 'absolute-empty'].map((leg) => ({ id: `PK1-m7-${leg}`, leg: `PK1-m7-${name}-${leg}`, match: /the copy was not opened/, after: 'PK1-m7-control', noStop: true }));
  return [
    ...PLUGINS.flatMap(plugin),
    { id: 'PK1-m7-control', leg: `PK1-m7-${name}-control`, match: SHOWN },
    ...paths,
    { id: 'PP1-1', leg: 'PP1-1', match: new RegExp(`^${name}, the production launch .*\\(TCP`) },
    { id: `${login}-mysql`, leg: login, match: new RegExp(`^${name} on MySQL: .*the entry LOGGED IN; a wrong password REFUSED`) },
    { id: `${login}-mariadb`, leg: login, match: new RegExp(`^${name} on MariaDB: .*the entry LOGGED IN; a wrong password REFUSED`) },
  ];
}

/** Leg (w), a `sqlcmd` client named `name`: PS1-0 (the control), PS1-1, PS1-3 and PS1-8 (go-sqlcmd), PS1-4 (the ODBC client), PS1-5 and PE1-7. */
function sqlcmdRules(name, vendor) {
  const common = [
    { id: 'PS1-0', leg: `PS1-0-${name}`, match: SHOWN },
    { id: 'PS1-1', leg: `PS1-1-${name}`, match: SHOWN, after: 'PS1-0', noStop: true },
    { id: 'PS1-5', leg: `PS1-5-${name}`, match: SHOWN, after: 'PS1-0', noStop: true },
    { id: 'PE1-7', leg: `PE1-7-${name}`, match: /logged in, auth_scheme SQL; a wrong password refused/, noStop: true },
  ];
  const go = [
    { id: 'PS1-3-control', leg: `PS1-3-control-${name}`, match: SHOWN },
    { id: 'PS1-3', leg: `PS1-3-${name}`, match: SHOWN, after: 'PS1-3-control', noStop: true },
    { id: 'PS1-8', leg: `PS1-8-${name}`, match: SHOWN },
    { id: 'PS1-8-flag', leg: `PS1-8-flag-${name}`, match: SHOWN, after: 'PS1-8', noStop: true },
  ];
  const odbc = [
    { id: 'PS1-4-control', leg: `PS1-4-control-${name}`, match: SHOWN },
    { id: 'PS1-4', leg: `PS1-4-${name}`, match: SHOWN, after: 'PS1-4-control' },
  ];
  return [...common, ...(vendor === 'go-sqlcmd' ? go : odbc)];
}

/** The expectations of a family for one client of it (`name` is what the harness named it). */
function rulesFor(family, vendor, name) {
  if (family === 'psql') {
    return PSQL;
  }
  return family === 'mysql' ? mysqlRules(name, vendor) : sqlcmdRules(name, vendor);
}

/** The ids of the legs a build of this vendor must run (§S7.7: a job's list names them): what `rulesFor` holds, with no client's name in it. */
const legsOf = (family, vendor) => rulesFor(family, vendor, vendor).map((rule) => rule.id);

module.exports = { rulesFor, legsOf };
