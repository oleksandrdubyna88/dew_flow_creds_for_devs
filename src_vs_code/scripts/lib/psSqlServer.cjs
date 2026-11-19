'use strict';
// Rig Q of the E1.7 spec §S7.3: a REAL SQL Server, the receiver of PS1 that records how each login was made.
//
//   Linux     Microsoft's container image on the runner's docker (pinned by tag AND digest in the workflow, rule R7), published on a loopback port, with a throwaway CA and a server certificate for
//             127.0.0.1 so that a client that verifies the certificate (go-sqlcmd and Driver 18 do) can sign in with the launch as the builder writes it (no `-C`). The CA is put in the runner's
//             trust store with `sudo` and taken out again (rule R3). The container carries the leftovers token in its name and its owner label, and is removed by exact name.
//   Windows   SQL Server Express, installed by the workflow step with TCP on at a fixed loopback port; the harness reads the port from `BRIDGED_MSSQL_PORT`. Its certificate is its own: a client that
//             refuses it is `UNMEASURED` on that client, with the client's words.
//
// How a login was made is read two ways, and each is a fact of the SERVER, not of the client: the query `select suser_sname(), auth_scheme from sys.dm_exec_connections where session_id = @@spid`
// run through the client under test (`SQL`, `NTLM` or `KERBEROS`, and the name the server logged the session in as), and the server's own error log, which names each failed or integrated attempt.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { check, freePort, rigRun, throwawayWord, waitFor, oneLine } = require('./dbProbe.cjs');
const owned = require('./leftovers.cjs');

const QUERY = 'select suser_sname() as signed_in_as, auth_scheme as scheme from sys.dm_exec_connections where session_id = @@spid';
const SQL_LOGIN = 'ps1probe';
const LOG_LINE = /login failed|sspi|ntlm|kerberos|untrusted domain|integrated|windows authentication|could not find a login|login timeout|login is from/i;

/** A throwaway CA and a server certificate for 127.0.0.1 and localhost, RSA, made by `openssl` into `folder` (the PATH's openssl is the rig's own tool). */
function makeCertificates(folder) {
  fs.mkdirSync(folder, { recursive: true });
  const run = (...args) => rigRun('openssl', args);
  const file = (name) => path.join(folder, name);
  run('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=bridge-test-ca', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign', '-keyout', file('ca.key'), '-out', file('ca.crt'));
  run('req', '-new', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=localhost', '-keyout', file('server.key'), '-out', file('server.csr'));
  fs.writeFileSync(file('server.ext'), 'subjectAltName=IP:127.0.0.1,DNS:localhost\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n');
  run('x509', '-req', '-in', file('server.csr'), '-CA', file('ca.crt'), '-CAkey', file('ca.key'), '-CAcreateserial', '-days', '2', '-out', file('server.crt'), '-extfile', file('server.ext'));
  for (const name of ['server.key', 'server.crt', 'ca.crt']) {
    fs.chmodSync(file(name), 0o644); // NOSONAR: a throwaway certificate, read by the container's own user
  }
  return { ca: file('ca.crt'), key: file('server.key'), cert: file('server.crt') };
}

/** The CA in the runner's trust store, taken out by the scope (rule R3). */
function trustCa(scope, ca) {
  const target = '/usr/local/share/ca-certificates/bridge-test-ps1.crt';
  execFileSync('sudo', ['-n', 'cp', ca, target], { stdio: 'pipe' }); // NOSONAR: the CI runner's own sudo
  scope.after(() => {
    try {
      execFileSync('sudo', ['-n', 'rm', '-f', target], { stdio: 'pipe' }); // NOSONAR: the CI runner's own sudo
      execFileSync('sudo', ['-n', 'update-ca-certificates', '--fresh'], { stdio: 'pipe' }); // NOSONAR: the CI runner's own sudo
    } catch (error) {
      console.log(`rig: the throwaway CA was NOT taken out of the trust store (${error.message.slice(0, 100)})`);
    }
  });
  execFileSync('sudo', ['-n', 'update-ca-certificates'], { stdio: 'pipe' }); // NOSONAR: the CI runner's own sudo
}

/** One query as the rig's own administrator (never the client under test). `{ ok, text }`. */
function admin(handle, sql) {
  const answer = spawnSync(handle.adminClient, handle.adminArgs(sql), { encoding: 'utf8', timeout: 60_000, env: handle.adminEnv, windowsHide: true }); // NOSONAR: the rig's own tool
  return { ok: answer.status === 0, text: `${answer.stdout ?? ''}${answer.stderr ?? ''}` };
}

/** The server's log lines that name a login attempt, since `mark`: clipped, never more than a few. */
const linesOf = (text) => text.split(/\r?\n/).filter((line) => LOG_LINE.test(line)).map((line) => line.replace(/^\S+\s+\S+\s+(?:spid\S+\s+)?/i, '').trim().slice(0, 170));

/** Linux: the container, its certificates, the administrator's client (go-sqlcmd with the SA word in its environment). */
async function startLinux(scope, dir, goSqlcmd) {
  const image = process.env.BRIDGED_MSSQL_IMAGE;
  check('rig Q: BRIDGED_MSSQL_IMAGE names the SQL Server image (the workflow pins it by tag and digest)', image !== undefined && image !== '', 'the workflow step sets BRIDGED_MSSQL_IMAGE');
  if (image === undefined || image === '') {
    return { ok: false, why: 'no SQL Server image named' };
  }
  fs.mkdirSync(dir, { recursive: true }); // the rig folder q is this function's to make, as rig K's is (pkKrbRig.cjs)
  fs.chmodSync(dir, 0o755); // NOSONAR: the container's own user reads the certificate and the configuration through the folder
  const certs = makeCertificates(path.join(dir, 'certs'));
  fs.chmodSync(path.join(dir, 'certs'), 0o755); // NOSONAR: the container's own user reads through the folder
  trustCa(scope, certs.ca);
  const conf = path.join(dir, 'mssql.conf');
  fs.writeFileSync(conf, '[network]\ntlscert = /certs/server.crt\ntlskey = /certs/server.key\ntlsprotocols = 1.2\nforceencryption = 0\n');
  fs.chmodSync(conf, 0o666); // NOSONAR: the container's own user must be able to read the file
  const port = await freePort();
  const name = owned.ownedName('ps1-mssql');
  const saWord = `Aa1!${throwawayWord()}`;
  const ownerLabel = `testsToDelete.owner=${owned.formatOwner(owned.thisOwner())}`;
  scope.after(() => spawnSync('docker', ['rm', '-f', '-v', name], { stdio: 'pipe', timeout: 60_000 })); // NOSONAR: the CI runner's own docker; by exact name, on every path
  rigRun('docker', ['run', '--rm', '-d', '--name', name, '--label', ownerLabel, '-e', 'ACCEPT_EULA=Y', '-e', `MSSQL_SA_PASSWORD=${saWord}`, '-p', `127.0.0.1:${port}:1433`,
    '-v', `${path.join(dir, 'certs')}:/certs:ro`, '-v', `${conf}:/var/opt/mssql/mssql.conf`, image]);
  const handle = {
    ok: true, host: '127.0.0.1', port, kind: 'container', name, adminClient: goSqlcmd, adminEnv: { PATH: process.env.PATH, HOME: dir, SQLCMDUSER: 'sa', SQLCMDPASSWORD: saWord },
    adminArgs: (sql) => ['-S', `127.0.0.1,${port}`, '-Q', sql, '-b'],
    log: () => {
      const answer = spawnSync('docker', ['logs', name], { encoding: 'utf8', timeout: 30_000 }); // NOSONAR: the CI runner's own docker
      return `${answer.stdout ?? ''}${answer.stderr ?? ''}`;
    },
  };
  const up = await waitFor(() => admin(handle, 'select 1').ok, 150_000, 3000);
  check('rig Q: SQL Server answered the administrator within 150 s', up, `the container's last log lines: ${oneLine(handle.log().split('\n').slice(-6).join('\n'), 400)}`);
  return up ? handle : { ok: false, why: 'the SQL Server container did not come up' };
}

/** Windows: the Express instance the step installed, reached as the runner's own logon (a sysadmin through BUILTIN\Administrators). */
function startWindows(adminClient) {
  const port = Number(process.env.BRIDGED_MSSQL_PORT ?? '');
  check('rig Q: BRIDGED_MSSQL_PORT names the fixed loopback port of the Express instance (the workflow step sets it)', Number.isInteger(port) && port > 0, 'the workflow step did not export it');
  if (!(port > 0)) {
    return { ok: false, why: 'SQL Server Express was not installed with TCP on a fixed port' };
  }
  const logFile = process.env.BRIDGED_MSSQL_ERRORLOG;
  const handle = {
    ok: true, host: '127.0.0.1', port, kind: 'express', adminClient, adminEnv: { ...process.env },
    adminArgs: (sql) => ['-S', `127.0.0.1,${port}`, '-Q', sql, '-b', '-C'],
    log: () => (logFile !== undefined && fs.existsSync(logFile) ? fs.readFileSync(logFile).toString('utf16le') : ''),
  };
  return handle;
}

/**
 * Starts the receiver and makes the one SQL login the legs use. `adminClient` is the client the rig asks its own questions with. `{ ok: true, ... }` with the handle below, or `{ ok: false, why }`.
 */
async function startSqlServer(scope, dir, adminClient) {
  const handle = process.platform === 'win32' ? startWindows(adminClient) : await startLinux(scope, dir, adminClient);
  if (!handle.ok) {
    return handle;
  }
  const loginWord = throwawayWord();
  const made = admin(handle, `if not exists (select 1 from sys.server_principals where name = '${SQL_LOGIN}') create login ${SQL_LOGIN} with password = '${loginWord}', check_policy = off;`);
  check('rig Q: the administrator made the SQL login of the legs', made.ok, oneLine(made.text, 300));
  if (!made.ok) {
    return { ok: false, why: 'the SQL login could not be made' };
  }
  return {
    ...handle, login: SQL_LOGIN, loginWord, query: QUERY,
    /** A mark of the server's log now. */
    mark: () => handle.log().length,
    /** The login-related lines the server wrote since `mark`, after a moment for the log to settle. */
    async linesSince(mark) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return linesOf(handle.log().slice(mark));
    },
  };
}

module.exports = { startSqlServer, QUERY, SQL_LOGIN };
