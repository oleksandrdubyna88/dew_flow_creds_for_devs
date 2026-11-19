'use strict';
// PS1 (the E1.7 spec §S7.4; parent §7's probe table row PS1): what a bridged `sqlcmd` signs in with. go-sqlcmd and the ODBC client, each named by its own version answers, against a real SQL
// Server (rig Q) that says how each login was made: `auth_scheme` of the session (`SQL`, `NTLM`, `KERBEROS`) and the name it logged the session in as, and the server's own error log, which names
// every integrated, Windows or failed attempt. The legs are RECORDS; a leg whose positive control was not shown is `UNMEASURED`.
//
// The positive control (PS1-0) is a launch with NO user, as the builder wrote it until §S6.15: Windows: the server logs the session in as the runner's own logon. Linux: with the throwaway
// realm's ticket in the default cache the client makes an integrated attempt that the server records (the server is no domain member, so it is an attempt, not a login). Where that cannot be
// shown the other legs are printed as what was seen without a control, and the pair stays refused.
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { check, record, unmeasured, stop, bridgedEnv, runClient, oneLine, throwawayWord, systemRig } = require('./dbProbe.cjs');

/**
 * What the server's log says of an INTEGRATED attempt. The word `Integrated` alone is not one: a client that sent a SQL login with an empty user (go-sqlcmd with no user) is told "An attempt to
 * login using SQL authentication failed. Server is configured for Integrated authentication only", and the first run took that line for the integrated attempt the control needs.
 */
const INTEGRATED = /sspi|ntlm|kerberos|untrusted domain|windows authentication/i;
const SQL_ATTEMPT = /using SQL authentication/i;
const isIntegrated = (line) => INTEGRATED.test(line) && !SQL_ATTEMPT.test(line);
/**
 * What is the RIG's fault and no client's answer: the reading login could not read the session (`VIEW SERVER PERFORMANCE STATE` was not granted), or the client refused the receiver's
 * certificate before it signed in. A leg whose run says one of these is `UNMEASURED`, with the words, and never a `STOP`.
 */
const RIG_DEFECT = /VIEW SERVER (?:PERFORMANCE )?STATE|certificate verify failed|subject name does not match|SSL Provider|x509: certificate|tls: failed to verify/i;
/** What a client says of a flag it does not know. */
const UNKNOWN_FLAG = /unknown (?:flag|shorthand flag|option)|unrecognized option|unknown command/i;
/** How the server says a session was made: `Login succeeded for user 'x'. Connection made using SQL Server authentication.` */
const MADE = /Login succeeded for user '([^']*)'\.\s*Connection made using ([a-z ]+?) authentication/i;
const SCHEME = /\b(SQL|NTLM|KERBEROS)\b/;
const ABSENT_ADDRESS = '127.0.0.1';

/** The launch of the builder for entry A, then what a leg does to it by hand. `host` replaces the `-S` value, `user` the entry's user, `flags` are added last. */
function launchFor(ctx, { user = ctx.q.login, host, nouser = false, withoutWord = false, wrongWord = false, flags = [], home = ctx.home, extraEnv = {} } = {}) {
  const { product, q } = ctx;
  const encoded = encodeURIComponent(user);
  const built = product.buildDbQueryLaunch('mssql', `mssql://${encoded}:${q.loginWord}@127.0.0.1:${q.port}/master`, q.query, { bridged: true, absentFile: product.materializedKeyPath(ctx.dir, 'no-client-file') });
  if (built === undefined) {
    throw new Error('buildDbQueryLaunch refused the entry of a PS1 leg that must launch (it stores a user and a password and names only the profile)');
  }
  const args = [...built.args];
  if (host !== undefined) {
    args[args.indexOf('-S') + 1] = host;
  }
  const env = { ...bridgedEnv(product, home, built.env), ...extraEnv };
  if (nouser) {
    delete env.SQLCMDUSER;
    delete env.SQLCMDPASSWORD;
  } else if (withoutWord) {
    delete env.SQLCMDPASSWORD;
  } else if (wrongWord) {
    env.SQLCMDPASSWORD = throwawayWord();
  }
  return { args: [...args, ...flags], env, userAsRead: built.env.SQLCMDUSER };
}

/** One run of `client` and what the server saw: `{ code, scheme, who, lines, integrated, said, ended }`. */
async function observe(ctx, client, options) {
  const mark = ctx.q.mark();
  const launched = launchFor(ctx, options);
  const run = await runClient(ctx.scope, client.exe, launched.args, launched.env, { ms: options.ms ?? 40_000 });
  const lines = await ctx.q.linesSince(mark);
  const scheme = SCHEME.exec(run.stdout)?.[1];
  const row = run.stdout.split(/\r?\n/).find((line) => scheme !== undefined && line.includes(scheme));
  const who = row === undefined ? undefined : row.replace(scheme, '').trim().replaceAll(/\s+/g, ' ').slice(0, 80);
  const made = lines.map((line) => MADE.exec(line)).find((found) => found !== null);
  return {
    ended: run.ended, code: run.code, scheme, who, lines, integrated: lines.some(isIntegrated), said: oneLine(`${run.stderr} ${scheme === undefined ? run.stdout : ''}`, 200), launched,
    madeAs: made === undefined ? undefined : `${made[1]} (${made[2]} authentication)`, rigDefect: RIG_DEFECT.exec(`${run.stderr}\n${run.stdout}`)?.[0],
  };
}

/** The words of one observation for a record line. */
const wordsOf = (seen) => `exit ${seen.code}; ${seen.scheme === undefined ? 'no session was made' : `the server logged the session in as ${JSON.stringify(seen.who)} by ${seen.scheme}`}; the server's log ${seen.madeAs === undefined ? '' : `says the session was made as ${seen.madeAs}; it `}${seen.lines.length === 0 ? 'names no attempt' : `names: ${JSON.stringify(seen.lines.slice(0, 3))}`}; the client said ${JSON.stringify(seen.said)}`;

/** PS1-0 on one client: the positive control. `{ shown, text }`. */
async function control(ctx, client) {
  const seen = await observe(ctx, client, { nouser: true });
  check(`(PS1-0) ${client.name}: the client ended in time`, seen.ended, wordsOf(seen));
  if (process.platform === 'win32') {
    const own = (process.env.USERNAME ?? '').toLowerCase();
    const shown = seen.scheme !== undefined && seen.scheme !== 'SQL' && own !== '' && (seen.who ?? '').toLowerCase().includes(own);
    return { shown, text: `no user, by hand: ${wordsOf(seen)}${shown ? '' : ` (the runner's own logon, ${own || 'unknown'}, was not the name the server logged)`}`, seen };
  }
  const shown = ctx.realm?.ok === true && seen.integrated;
  return { shown, text: `no user, by hand, ${ctx.realm?.ok === true ? 'with the realm\'s ticket in the default cache' : `with no ticket (${ctx.realm?.why ?? 'no realm'})`}: ${wordsOf(seen)}`, seen };
}

/** A TCP listener that only counts who connected: the "another server" of PS1-3 and PS1-4. */
async function listener() {
  const state = { connections: 0 };
  const open = new Set();
  const server = net.createServer((socket) => {
    state.connections += 1;
    open.add(socket);
    socket.on('error', () => undefined);
    socket.destroy();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { state, port: server.address().port, close: () => new Promise((resolve) => server.close(resolve)), open };
}

/** The records of PS1-1, 2, 5, 6, 7, 8 for one client: each is `record` when the control was shown and `UNMEASURED` (with what was seen) when it was not. */
function say(leg, shown, text, seen) {
  if (seen?.rigDefect !== undefined) {
    unmeasured(leg, `a RIG DEFECT, not an answer of the client (${JSON.stringify(seen.rigDefect)}): ${text}`);
  } else if (shown) {
    record(leg, 'shown', text);
  } else {
    unmeasured(leg, `no positive control for this client and platform; without one: ${text}`);
  }
}

/** PS1-1: the launch as built, through the builder. A SQL login for that user, and nothing integrated. */
async function legBuilt(ctx, client, shown, leg = 'PS1-1') {
  const seen = await observe(ctx, client, {});
  check(`(${leg}) ${client.name}: the client ended in time`, seen.ended, wordsOf(seen));
  say(`${leg}-${client.name}`, shown, `the launch as built (user and password in the environment): ${wordsOf(seen)}`, seen);
  const clean = seen.scheme === 'SQL' && (seen.who ?? '').includes(ctx.q.login) && !seen.integrated;
  if (shown && !clean && seen.rigDefect === undefined) {
    stop(`${leg}-${client.name}`, `the launch as built did not make a plain SQL login for the entry's user (parent §7, row PS1: that client stays refused until a flag is shown to stop it)`);
  }
}

/**
 * PE1-7 (the spec's §S7.4: SQL Server): the entry's user and password make a SQL login, and a wrong password does not. Both through the launch as built, the first with the entry's
 * word, the second with another in its place. `record` when the right one made a session by `SQL` and the wrong one made none; a rig defect is `UNMEASURED`; anything else the client did
 * is a `STOP` for the lead (the entry's own login fails, or a wrong password logs in).
 */
async function legEntry(ctx, client) {
  const leg = `PE1-7-${client.name}`;
  const right = await observe(ctx, client, {});
  const wrong = await observe(ctx, client, { wrongWord: true });
  check(`(PE1-7) ${client.name}: both clients ended in time`, right.ended && wrong.ended, `${wordsOf(right)} | ${wordsOf(wrong)}`);
  const rigDefect = right.rigDefect ?? wrong.rigDefect;
  const text = `the entry's user and password: ${wordsOf(right)}. A wrong password: ${wordsOf(wrong)}`;
  if (rigDefect !== undefined) {
    unmeasured(leg, `a RIG DEFECT, not an answer of the client (${JSON.stringify(rigDefect)}): ${text}`);
    return;
  }
  const loggedIn = right.scheme === 'SQL' && (right.who ?? '').includes(ctx.q.login);
  const refused = wrong.scheme === undefined;
  record(leg, 'shown', `${loggedIn ? 'logged in, auth_scheme SQL' : 'did NOT log in as a SQL login'}; a wrong password ${refused ? 'refused' : 'made a session'}: ${text}`);
  if (!loggedIn || !refused) {
    stop(leg, `${loggedIn ? 'a wrong password made a session' : "the entry's own SQL login did not make a SQL session"} under the launch as built (parent §7, row PE1: the pair is not served by this client)`);
  }
}

/** PS1-3: go-sqlcmd's configuration file in the rig home names another server and user, with `-S` given. */
/** Puts `text` at `target` (a file of the runner's own profile on Windows, rule R3), keeping what was there for the scope to put back. */
function placeFile(scope, dir, target, text) {
  const kept = path.join(dir, `kept-${path.basename(target)}`);
  const had = fs.existsSync(target);
  if (had) {
    fs.copyFileSync(target, kept);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
  scope.after(() => {
    if (had) {
      fs.copyFileSync(kept, target);
    } else {
      fs.rmSync(target, { force: true });
    }
  });
}

async function legConfig(ctx, client, shown) {
  const windows = process.platform === 'win32';
  if (windows && !systemRig()) {
    unmeasured(`PS1-3-${client.name}`, "the configuration file belongs in the runner's own profile: a CI runner whose step sets BRIDGED_DB_SYSTEM_RIG=1 (rule R3)");
    return;
  }
  const other = await listener();
  const home = windows ? process.env.USERPROFILE : path.join(ctx.dir, 'ps3 home');
  const otherWord = throwawayWord();
  placeFile(ctx.scope, ctx.dir, path.join(home, '.sqlcmd', 'sqlconfig'), [
    'apiVersion: v1', 'kind: Config', 'contexts:', '- context:', '    endpoint: ep1', '    user: user1', '  name: ctx1', 'current-context: ctx1', 'endpoints:', '- endpoint:',
    `    address: ${ABSENT_ADDRESS}`, `    port: ${other.port}`, '  name: ep1', 'users:', '- authentication-type: basic', '  basic-auth:', '    username: otheruser', '    password-encryption: none', `    password: ${otherWord}`, '  name: user1', '',
  ].join('\n'));
  try {
    const noHost = launchFor(ctx, { home });
    const idx = noHost.args.indexOf('-S');
    const withoutS = [...noHost.args.slice(0, idx), ...noHost.args.slice(idx + 2)];
    const run = await runClient(ctx.scope, client.exe, withoutS, noHost.env, { ms: 30_000 });
    const controlShown = other.state.connections > 0;
    if (controlShown) {
      record(`PS1-3-control-${client.name}`, 'shown', `positive control, the configuration file with NO -S: the client went to the file's server (${other.state.connections} connection(s) there); the client said ${JSON.stringify(oneLine(run.stderr + run.stdout, 120))}`);
    } else {
      unmeasured(`PS1-3-control-${client.name}`, `the configuration file was not read even with no -S (the client said ${JSON.stringify(oneLine(run.stderr + run.stdout, 160))})`);
    }
    const before = other.state.connections;
    const seen = await observe(ctx, client, { home });
    const reached = other.state.connections - before;
    const text = `the launch as built with the configuration file in the rig home and -S given: the file's server saw ${reached} connection(s); ${wordsOf(seen)}`;
    if (controlShown) {
      record(`PS1-3-${client.name}`, shown ? 'shown' : 'not shown', text);
      if (shown && reached > 0) {
        stop(`PS1-3-${client.name}`, 'the configuration file was read although -S was given (parent §7, row PS1: that client stays refused until a flag is shown to stop it)');
      }
    } else {
      unmeasured(`PS1-3-${client.name}`, `no control that the file is read; without one: ${text}`);
    }
  } finally {
    await other.close();
  }
}

/** PS1-4: the ODBC client with the driver manager's file in the rig home naming another server. */
async function legOdbc(ctx, client, shown) {
  if (process.platform === 'win32') {
    unmeasured(`PS1-4-${client.name}`, 'the Windows driver manager reads the registry, not a file of the home folder: not probed here');
    return;
  }
  const other = await listener();
  const home = path.join(ctx.dir, 'ps4 home');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, '.odbc.ini'), ['[ps1dsn]', 'Driver=ODBC Driver 18 for SQL Server', `Server=${ABSENT_ADDRESS},${other.port}`, 'Trusted_Connection=yes', 'Encrypt=no', ''].join('\n'));
  try {
    const launched = launchFor(ctx, { home });
    const dsnArgs = ['-D', '-S', 'ps1dsn', '-Q', 'select 1', '-b'];
    const run = await runClient(ctx.scope, client.exe, dsnArgs, launched.env, { ms: 30_000 });
    const controlShown = other.state.connections > 0;
    if (controlShown) {
      record(`PS1-4-control-${client.name}`, 'shown', `positive control, -D with the DSN of the rig home's .odbc.ini: the client went to the file's server (${other.state.connections} connection(s) there)`);
    } else {
      unmeasured(`PS1-4-control-${client.name}`, `the driver manager's file was not read even with -D (the client said ${JSON.stringify(oneLine(run.stderr + run.stdout, 160))})`);
    }
    const before = other.state.connections;
    const seen = await observe(ctx, client, { home });
    const text = `the launch as built with .odbc.ini in the rig home: the file's server saw ${other.state.connections - before} connection(s); ${wordsOf(seen)}`;
    if (controlShown) {
      record(`PS1-4-${client.name}`, shown ? 'shown' : 'not shown', text);
    } else {
      unmeasured(`PS1-4-${client.name}`, `no control that the file is read; without one: ${text}`);
    }
  } finally {
    await other.close();
  }
}

/** PS1-6 (go-sqlcmd): the candidate flag, and whether the login still works under it. */
async function legFlag(ctx, client, shown) {
  const seen = await observe(ctx, client, { flags: ['--authentication-method=SqlPassword'] });
  const works = seen.scheme === 'SQL' && (seen.who ?? '').includes(ctx.q.login);
  const unknown = !works && UNKNOWN_FLAG.test(seen.said);
  say(`PS1-6-${client.name}`, shown, `--authentication-method=SqlPassword added to the launch as built: ${works ? 'the client knows it and the login still works' : (unknown ? 'the flag is UNKNOWN TO THIS CLIENT (it refused it)' : 'the login did NOT work with the flag, and the client did not call the flag unknown')}; ${wordsOf(seen)}`, seen);
}

/** PS1-7: the host forms the builder refuses today, by hand: recorded only (§S7.15 keeps them refused). */
async function legHosts(ctx, client, shown) {
  const forms = [['PS1-7-tcp', `tcp:127.0.0.1,${ctx.q.port}`], ['PS1-7-ipv6', `[::1],${ctx.q.port}`], ['PS1-7-instance', '127.0.0.1\\ps1instance']];
  for (const [leg, host] of forms) {
    const seen = await observe(ctx, client, { host, ms: 30_000 });
    say(`${leg}-${client.name}`, shown, `host ${JSON.stringify(host)}, by hand: ${wordsOf(seen)}`, seen);
  }
}

/** PS1-8: a user written as a Windows account: `RIGDOM\probe`, with a password in the environment, as the builder launches it; then with `SqlPassword`. */
async function legAccount(ctx, client, shown) {
  const user = 'RIGDOM\\probe';
  const asRead = launchFor(ctx, { user }).userAsRead;
  check(`(PS1-8) ${client.name}: the builder passes the user with its backslash as written`, asRead === user, JSON.stringify({ readBack: asRead }));
  const classify = (seen) => {
    if (seen.lines.some((line) => /untrusted domain|sspi|ntlm|windows/i.test(line))) {
      return 'an NTLM or Windows sign-in was made (the server names it in its log)';
    }
    return seen.lines.some((line) => /could not find a login/i.test(line)) ? 'a SQL login for the name as written (the server looked for a login of that name)' : 'the server\'s log does not say which';
  };
  const plain = await observe(ctx, client, { user, ms: 30_000 });
  say(`PS1-8-${client.name}`, shown, `user ${user} with a password, as the builder launches it: ${classify(plain)}; ${wordsOf(plain)}`, plain);
  if (client.name === 'go-sqlcmd') {
    const flagged = await observe(ctx, client, { user, flags: ['--authentication-method=SqlPassword'], ms: 30_000 });
    say(`PS1-8-flag-${client.name}`, shown, `user ${user} with --authentication-method=SqlPassword: ${classify(flagged)}; ${wordsOf(flagged)}`, flagged);
    if (shown && flagged.rigDefect === undefined && classify(flagged).startsWith('an NTLM')) {
      stop(`PS1-8-flag-${client.name}`, 'SqlPassword did not stop the NTLM sign-in of a user written as a Windows account (parent §7, row PS1: go-sqlcmd stays refused until a flag is shown to stop it)');
    }
  }
}

/** PS1 for one client. */
async function oneClient(ctx, client) {
  const made = await control(ctx, client);
  if (made.shown) {
    record(`PS1-0-${client.name}`, 'shown', `positive control, ${made.text}`);
  } else {
    const rigDefect = made.seen?.rigDefect;
    unmeasured(`PS1-0-${client.name}`, `${rigDefect === undefined ? '' : `a RIG DEFECT, not an answer of the client (${JSON.stringify(rigDefect)}): `}the identity on offer was not shown: ${made.text}`);
  }
  await legBuilt(ctx, client, made.shown);
  await legEntry(ctx, client);
  const bareUser = await observe(ctx, client, { withoutWord: true });
  say(`PS1-2-${client.name}`, made.shown, `a user and no password, by hand: ${wordsOf(bareUser)}`, bareUser);
  if (client.name === 'go-sqlcmd') {
    await legConfig(ctx, client, made.shown);
    await legFlag(ctx, client, made.shown);
  } else {
    await legOdbc(ctx, client, made.shown);
  }
  if (ctx.realm?.ok === true && process.platform !== 'win32') {
    check('rig K: the ticket is in the default cache for PS1-5', ctx.realm.renew() && ctx.realm.ticketInReach(), 'kinit left no ticket');
  }
  await legBuilt(ctx, client, made.shown, 'PS1-5');
  await legHosts(ctx, client, made.shown);
  await legAccount(ctx, client, made.shown);
}

/** PS1 for every client the harness found. `clients` is `[{ name, exe }]`; `ctx.q` is the receiver. */
async function ps1Legs(ctx, clients) {
  for (const client of clients) {
    await oneClient(ctx, client);
  }
}

module.exports = { ps1Legs };
