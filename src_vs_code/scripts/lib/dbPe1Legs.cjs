'use strict';
// PE1 (E1.7 spec §S7.4, parent §7's probe table): the entry's own login still works under the pair's whole profile, and nothing else decided it. The launch is the builder's own for
// the entry, built under the verdict of the REAL database client check for the client asked (`dbCandidates.cjs`), so it carries the controls V3 wrote (the spec's §S7.5): for `psql` three keywords at the end of the built string, for `mysql`
// `--plugin-dir` at the absent file after `--protocol=TCP` (and, on Oracle's client, `--skip-enable-cleartext-plugin`). The CONTROLS of a leg are the same launch with a control cut out by hand. Each login is asked against a real server that checks it, with
// the entry's right credential and with a wrong one. RECORD legs: they print what happened and fail only for the rig's own faults. A login that fails under the profile while the same
// launch without its controls succeeds is a `STOP`: the pair is not served until it passes, and a control dropped to make it pass goes back to the lead first.
const path = require('node:path');
const { ownedDir } = require('./leftovers.cjs');
const { check, bridgedEnv, runSync, oneLine, noteLeg, unmeasured, stop } = require('./dbProbeRig.cjs');
const servers = require('./dbServers.cjs');
const candidates = require('./dbCandidates.cjs');

/** The keywords V3 writes after `sslkey` (the spec's §S7.5), each as the builder writes it. */
const PROFILE_KEYWORD = /\s+(?:gssencmode|sslcertmode|require_auth)='[^']*'/g;
const REQUIRE_AUTH_KEYWORD = /\s+require_auth='[^']*'/g;

/** The built `psql` arguments with the keywords matching `pattern` cut out of the keyword string (the last argument): `undefined` cuts nothing, the launch as built. */
const psqlArgs = (args, pattern) => args.map((arg, at) => (at === args.length - 1 && pattern !== undefined ? arg.replaceAll(pattern, '') : arg));

/** The flags V3 writes into a `mysql` launch as controls. */
const CONTROL_FLAG = /^--(?:plugin-dir=|skip-enable-cleartext-plugin$)/;

/** What a run did, in words that hold no credential: logged in as the row's user, or refused in the client's own words. */
function outcomeOf(run, user) {
  return run.code === 0 && run.stdout.includes(user) ? 'LOGGED IN' : `REFUSED (exit ${run.code}): ${oneLine(run.stderr, 130)}`;
}
const loggedIn = (run, user) => run.code === 0 && run.stdout.includes(user);

/**
 * The runs that did not complete, in words: a spawn error or the bound (`runSync` gives a string code then), or an end by a signal (a null status). Neither a login nor a refusal is read from
 * such a run; a numeric exit, 0 or not, is a measured answer.
 */
const notCompleted = (runs) => runs.filter((run) => typeof run.code === 'string' || run.code === null).map((run) => (run.code === null ? 'ended by a signal' : run.code));

/** The `method=` words of the server's log lines since `from`, for the user: what the server says decided the login. */
async function methodsSince(pg, from, user) {
  const lines = (await pg.log()).slice(from).split('\n').filter((line) => line.includes(`"${user}"`) && /authenticated/.test(line));
  return lines.map((line) => /method=(\S+)/.exec(line)?.[1] ?? 'no method named').join(', ') || 'no "connection authenticated" line';
}

/** PE1-1 to PE1-4 for `psql`. Whether a leg launched the client (the job's file of builds names only a client a leg ran). */
async function legPsql(scope, client, shared) {
  const under = await candidates.verdictFor(client, shared);
  if (!under.ok) {
    unmeasured('PE1 psql', 'the real check refused this psql under the candidate table (the finding is printed above), so the builder launches nothing');
    return false;
  }
  candidates.say('PE1-1 to PE1-4 psql', under);
  const rig = { ...shared, verdict: under.verdict };
  const hba = ['local all all peer', 'host pe1_scram all 127.0.0.1/32 scram-sha-256', 'host pe1_md5 all 127.0.0.1/32 md5', 'host pe1_password all 127.0.0.1/32 password', 'host pe1_trust all 127.0.0.1/32 trust'];
  const pg = await servers.startPostgres(scope, 'pe1-pg', hba);
  if (pg.missing !== undefined) {
    unmeasured('PE1 psql', pg.missing);
    return false;
  }
  const good = servers.throwaway();
  const wrong = servers.throwaway();
  // one statement for each `-c`: `create database` cannot run inside the transaction a multi-statement string makes, and the md5 role needs the setting in its own session
  const made = [
    pg.admin(`create role pe1user login password '${good}'`),
    pg.admin("set password_encryption = 'md5'", `create role pe1md5user login password '${good}'`),
    ...['pe1_scram', 'pe1_md5', 'pe1_password', 'pe1_trust'].map((name) => pg.admin(`create database ${name}`)),
  ];
  check('(PE1) the rig made the roles and databases', made.every((run) => run.code === 0), made.map((run) => run.stderr.slice(0, 120)).join(' | '));
  const cases = [['PE1-1/2', 'scram-sha-256', 'pe1_scram', 'pe1user'], ['PE1-3', 'md5', 'pe1_md5', 'pe1md5user'], ['PE1-3', 'password', 'pe1_password', 'pe1user'], ['PE1-4', 'trust', 'pe1_trust', 'pe1user']];
  for (const [leg, method, database, user] of cases) {
    await psqlMethod(pg, client, rig, { leg, method, database, user, good, wrong });
  }
  return true;
}

/** One `pg_hba` method: the entry's right credential, a wrong one, and the control that shows what the profile changed. */
async function psqlMethod(pg, client, rig, { leg, method, database, user, good, wrong }) {
  const entry = `postgresql://${user}:${good}@127.0.0.1:${pg.port}/${database}`;
  const built = rig.product.buildDbQueryLaunch('postgres', entry, 'select current_user as who', { bridged: true, absentFile: rig.absentFile, verdict: rig.verdict });
  check(`(${leg}) ${method}: the builder launched the entry`, built !== undefined, 'buildDbQueryLaunch answered undefined');
  // The file the builder launches (the check's own file, a link or a copy the candidate rig made), for the production run and for its controls alike: they differ by their arguments only.
  const ask = (cut, env) => runSync(built.exe, psqlArgs(built.args, cut), bridgedEnv(rig.product, rig.home, env));
  const from = (await pg.log()).length;
  const right = ask(undefined, built.env);
  const profileRight = right.stderr.includes('invalid connection option') ? undefined : outcomeOf(right, user);
  if (profileRight === undefined) {
    unmeasured(`${leg} psql ${method}`, `this psql does not know a control of the profile (PA1-b): ${oneLine(right.stderr, 140)}`);
    return;
  }
  const rightMethods = await methodsSince(pg, from, user);
  const mark = (await pg.log()).length;
  const bad = ask(undefined, { ...built.env, PGPASSWORD: wrong });
  const badMethods = await methodsSince(pg, mark, user);
  const control = ask(REQUIRE_AUTH_KEYWORD, { ...built.env, PGPASSWORD: wrong });
  const broken = notCompleted([right, bad, control]);
  if (broken.length > 0) {
    unmeasured(`${leg} psql ${method}`, `a run did not complete (${broken.join('; ')}): no login and no refusal is read from it`);
    return;
  }
  console.log(`record (${leg}) psql, server method ${method}, the entry's user and password, under the whole profile: ${profileRight}; the server's log names: ${rightMethods}`);
  console.log(`record (${leg}) psql, server method ${method}, a wrong password, under the whole profile: ${outcomeOf(bad, user)}; the server's log names: ${badMethods}`);
  console.log(`record (${leg}) psql, server method ${method}, CONTROL: a wrong password with require_auth cut by hand: ${outcomeOf(control, user)}`);
  if (method === 'trust') {
    // PE1-4: the server asks for nothing, so under the profile the CLIENT refuses (even with the right credential), and the control, with require_auth cut by hand, logs in with a wrong one.
    const asPredicted = !loggedIn(right, user) && !loggedIn(bad, user) && loggedIn(control, user);
    console.log(`record (PE1-4) ${asPredicted ? 'as the spec predicts: the client refuses under the profile and the control would have let the wrong password in (the log line above names the method of the server)' : 'NOT as the spec predicts (the client refuses under the profile, and the control logs in): read the three lines above'}`);
    noteLeg('PE1 psql trust', loggedIn(control, user), `under the profile: entry ${loggedIn(right, user) ? 'IN' : 'refused by the client'}, wrong password ${loggedIn(bad, user) ? 'IN' : 'refused'}; control (require_auth cut): wrong password ${loggedIn(control, user) ? 'IN (trust would have let it in)' : 'refused'}`);
    return;
  }
  if (!loggedIn(right, user) && loggedIn(ask(PROFILE_KEYWORD, built.env), user)) {
    stop(`${leg} psql ${method}`, "the entry's own login fails under the profile and succeeds without its controls: the pair is not served until it passes (parent §7, row PE1)");
  }
  noteLeg(`PE1 psql ${method}`, loggedIn(right, user), `entry: ${loggedIn(right, user) ? 'in' : 'REFUSED'}; wrong password: ${loggedIn(bad, user) ? 'IN' : 'refused'}`);
}

/** PE1-5 and PE1-6 for one `mysql` client against one server. */
function mysqlLogin(client, rig, server, label, verdict) {
  const user = 'pe1user';
  const good = server.good;
  const wrong = servers.throwaway();
  const entry = `mysql://${user}:${good}@127.0.0.1:${server.port}/pe1db`;
  const built = rig.product.buildDbQueryLaunch('mysql', entry, 'select current_user() as who', { bridged: true, absentFile: rig.absentFile, verdict });
  check(`(PE1-5/6) ${client.name} on ${label}: the builder launched the entry`, built !== undefined, 'buildDbQueryLaunch answered undefined');
  const flags = built.args.filter((arg) => CONTROL_FLAG.test(arg));
  const ask = (withFlags, env) => runSync(built.exe, withFlags ? built.args : built.args.filter((arg) => !CONTROL_FLAG.test(arg)), bridgedEnv(rig.product, rig.home, env));
  const right = ask(true, built.env);
  const bad = ask(true, { ...built.env, MYSQL_PWD: wrong });
  const control = ask(false, built.env);
  const broken = notCompleted([right, bad, control]);
  if (broken.length > 0) {
    unmeasured(`PE1-${client.family === 'oracle' ? '5' : '6'} ${client.name} on ${label}`, `a run did not complete (${broken.join('; ')}): no login and no refusal is read from it`);
    return;
  }
  console.log(`record (PE1-${client.family === 'oracle' ? '5' : '6'}) ${client.name} on ${label}: under the profile (${flags.join(' ').replace(rig.absentFile, '<the absent file>')}): the entry ${outcomeOf(right, user)}; a wrong password ${outcomeOf(bad, user)}; CONTROL, the same launch with no control flag: the entry ${outcomeOf(control, user)}`);
  if (!loggedIn(right, user) && loggedIn(control, user)) {
    stop(`PE1-${client.family === 'oracle' ? '5' : '6'} ${client.name} on ${label}`, 'the entry\'s own login fails under the profile and succeeds without its controls: the pair is not served by this control (parent §7, row PE1: back to the lead)');
  }
  noteLeg(`PE1 ${client.name} on ${label}`, loggedIn(control, user), `entry under the profile: ${loggedIn(right, user) ? 'in' : 'REFUSED'}; wrong password: ${loggedIn(bad, user) ? 'IN' : 'refused'}`);
}

/** PE1-5 and PE1-6: MySQL's server and MariaDB's, each at its default plugin, for each client present. The clients a leg launched. */
async function legMysql(scope, clients, rig, mariadbImage) {
  const ran = new Set();
  const oracle = clients.find((client) => client.family === 'oracle');
  if (oracle === undefined) {
    unmeasured('PE1-5/6', "no Oracle mysql client: the rig's own administration needs one");
    return [];
  }
  const mysqlServer = await servers.startMysqld(scope, 'pe1-my', path.join(ownedDir(scope, 'pe1-mysock'), 'my.sock'), oracle.exe);
  const targets = [];
  if (mysqlServer.missing === undefined) {
    targets.push(await accountsOn(mysqlServer, 'MySQL'));
  } else {
    unmeasured('PE1-5/6 on MySQL', mysqlServer.missing);
  }
  const mariadbClient = clients.find((client) => client.family === 'mariadb');
  const container = mariadbImage === undefined || mariadbClient === undefined ? { missing: 'no MariaDB image or no MariaDB client was named' } : await servers.startMariadbContainer(scope, 'pe1-maria', mariadbImage, mariadbClient.exe);
  if (container.missing === undefined) {
    targets.push(await accountsOn(container, 'MariaDB'));
  } else {
    unmeasured('PE1-5/6 on MariaDB', container.missing);
  }
  const verdicts = new Map();
  for (const client of clients) {
    verdicts.set(client, await candidates.verdictFor(client, rig));
  }
  for (const [server, label] of targets) {
    for (const client of clients) {
      const under = verdicts.get(client);
      if (under.ok) {
        candidates.say(`PE1-${client.family === 'oracle' ? '5' : '6'} ${client.name} on ${label}`, under);
        mysqlLogin(client, rig, server, label, under.verdict);
        ran.add(client);
      } else {
        unmeasured(`PE1-${client.family === 'oracle' ? '5' : '6'} ${client.name} on ${label}`, 'the real check refused this client under the candidate table (the finding is printed above), so the builder launches nothing');
      }
    }
  }
  return [...ran];
}

/** An account at the server's DEFAULT plugin (no plugin named), with its throwaway credential, and a database it may use. */
async function accountsOn(server, label) {
  const good = servers.throwaway();
  const made = server.admin(`create database pe1db; create user 'pe1user'@'127.0.0.1' identified by '${good}'; grant all on pe1db.* to 'pe1user'@'127.0.0.1'`);
  check(`(PE1) the rig made the ${label} account`, made.code === 0, made.stderr.slice(0, 300));
  return [{ ...server, good }, label];
}

module.exports = { legPsql, legMysql };
