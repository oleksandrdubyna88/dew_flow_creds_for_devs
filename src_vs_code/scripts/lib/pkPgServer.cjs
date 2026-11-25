'use strict';
// Rig G of the E1.7 spec §S7.3: a REAL PostgreSQL server, the image's own binaries, a cluster made by `initdb` in an owned folder and run by the runner's user (the
// restricted token of PostgreSQL on Windows lets `initdb` run there too). Its `pg_hba.conf` is rewritten and reloaded per leg: one line per leg (`hostgssenc ... gss`,
// `hostnogssenc ... gss`, `sspi`, ...). With `log_connections` its log names the identity and the method of each login, and that line is what a leg reads: a login that
// was made names `identity="..."` and `method=...`.
//
// The server listens on a loopback port and on no unix socket; its log is a file of the owned folder. Nothing of the image is changed (no service is started or stopped).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { check, freePort, rigRun, waitFor } = require('./dbProbe.cjs');

/** The newest `bin` folder of an installed PostgreSQL that holds `initdb`, or `undefined`. */
function binFolder() {
  const named = process.env.BRIDGED_PG_BIN;
  const roots = process.platform === 'win32' ? ['C:\\Program Files\\PostgreSQL'] : ['/usr/lib/postgresql'];
  const exe = process.platform === 'win32' ? 'initdb.exe' : 'initdb';
  if (named !== undefined && named !== '' && fs.existsSync(path.join(named, exe))) {
    return named;
  }
  const found = roots.filter((root) => fs.existsSync(root)).flatMap((root) => fs.readdirSync(root).map((version) => path.join(root, version, 'bin')));
  return found.filter((folder) => fs.existsSync(path.join(folder, exe))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);
}

/** The server's identity lines of `text`: `[{ identity, method }]`, in order. */
function identitiesOf(text) {
  return [...text.matchAll(/connection authenticated: identity="([^"]*)" method=(\w+)/g)].map((match) => ({ identity: match[1], method: match[2] }));
}

/**
 * Starts the server. `{ ok: true, ... }` or `{ ok: false, why }`; a missing PostgreSQL FAILS the rig's check on CI and is a printed skip off it. `roles` are made with `login`; `keytab` is the
 * service key for a `gss` line (a file of the owned folder).
 */
async function startPgServer(scope, dir, { roles, keytab }) {
  const bin = binFolder();
  const win = process.platform === 'win32';
  const exe = (name) => path.join(bin ?? '', win ? `${name}.exe` : name);
  check('rig G: a PostgreSQL server (initdb, pg_ctl, psql) is installed', bin !== undefined || process.env.CI !== 'true', 'no initdb in BRIDGED_PG_BIN, /usr/lib/postgresql/*/bin or C:\\Program Files\\PostgreSQL\\*\\bin (the postgresql package)');
  if (bin === undefined) {
    return { ok: false, why: 'no PostgreSQL server binaries on this machine' };
  }
  fs.mkdirSync(dir, { recursive: true });
  const data = path.join(dir, 'data');
  const logFile = path.join(dir, 'server.log');
  const port = await freePort();
  const owner = os.userInfo().username;
  rigRun(exe('initdb'), ['-D', data, '-U', owner, '-A', 'trust', '--no-sync']);
  const settings = [
    "listen_addresses = '127.0.0.1'", `port = ${port}`, 'log_connections = on', 'fsync = off', 'max_connections = 20',
    ...(win ? [] : ["unix_socket_directories = ''"]),
    ...(keytab === undefined ? [] : [`krb_server_keyfile = '${keytab.replaceAll('\\', '/')}'`]),
  ];
  fs.appendFileSync(path.join(data, 'postgresql.conf'), `\n${settings.join('\n')}\n`);
  const hbaFile = path.join(data, 'pg_hba.conf');
  /**
   * Rewrites `pg_hba.conf` and reloads it. `pg_ctl reload` only sends a signal, so the server's own log is read until it says it reloaded (a fixed pause could let the next connection meet the old
   * rules). A reload the server rejected, or none seen within the bound, is a rig failure: no leg runs on rules it cannot name.
   */
  const setHba = async (lines) => {
    const mark = fs.existsSync(logFile) ? fs.statSync(logFile).size : 0;
    fs.writeFileSync(hbaFile, `${lines.join('\n')}\n`);
    rigRun(exe('pg_ctl'), ['-D', data, 'reload']);
    const since = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile).subarray(mark).toString('utf8') : '');
    for (let waited = 0; waited < 10_000; waited += 100) {
      const said = since();
      if (/pg_hba\.conf was not reloaded|could not load .*pg_hba\.conf/i.test(said)) {
        throw new Error(`the server did not take the new pg_hba.conf: ${said.trim().slice(-300)}`);
      }
      if (/received SIGHUP, reloading configuration files/.test(said)) {
        await new Promise((resolve) => setTimeout(resolve, 100)); // the line is written as the reload starts; the backends read the file at their start, after it
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('the server did not say within 10 s that it reloaded pg_hba.conf');
  };
  fs.writeFileSync(hbaFile, 'host all all 127.0.0.1/32 trust\n');
  // Registered BEFORE the start, so that a start that timed out still stops the server it began (a running server holds its folder, and the scope could not remove it).
  scope.after(() => {
    try {
      execFileSync(exe('pg_ctl'), ['-D', data, '-m', 'immediate', 'stop'], { stdio: 'ignore', timeout: 60_000 }); // NOSONAR: the rig's own binary
    } catch (error) {
      console.log(`rig: the PostgreSQL server did not stop cleanly (${error.message.slice(0, 120)})`);
    }
  });
  try {
    // No pipe on any of the three streams: `postgres` inherits the handles of the `pg_ctl` that starts it, and on Windows a pipe it holds keeps `spawnSync` waiting for an end of
    // file that never comes (the first CI run: the server was ready after 1 s and the call still ended on its 120 s limit). The server's own words go to `logFile`.
    rigRun(exe('pg_ctl'), ['-D', data, '-l', logFile, '-w', '-t', '60', 'start'], { stdio: 'ignore' });
  } catch (error) {
    check('rig G: the server started', false, `${error.message}\n${fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').slice(-600) : 'no log'}`);
    return { ok: false, why: 'the PostgreSQL server did not start' };
  }
  for (const role of roles) {
    rigRun(exe('psql'), ['-X', '-h', '127.0.0.1', '-p', String(port), '-U', owner, '-d', 'postgres', '-c', `create role "${role}" login`]);
  }
  const logText = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '');
  return {
    ok: true, bin, port, owner, exe, setHba, logText,
    /** A mark of the log now: what a leg reads is what comes after it. */
    mark: () => logText().length,
    /** The identity lines the server wrote since `mark`, after the log has had a moment to settle. */
    async identitiesSince(mark) {
      let last = -1;
      await waitFor(async () => {
        const length = logText().length;
        const settled = length === last;
        last = length;
        return settled;
      }, 3000, 250);
      return identitiesOf(logText().slice(mark));
    },
    /** The server's own words since `mark` about a refused connection, one line each, clipped. */
    refusedSince: (mark) => logText().slice(mark).split(/\r?\n/).filter((line) => /FATAL|rejected|no pg_hba/.test(line)).map((line) => line.trim().slice(0, 160)),
  };
}

module.exports = { startPgServer, identitiesOf };
