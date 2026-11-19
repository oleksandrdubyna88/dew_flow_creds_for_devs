'use strict';
// Rig K of the E1.7 spec §S7.3: a throwaway Kerberos realm on the Linux runner, with one user's ticket in the DEFAULT cache, so that a bridged client under `PATH` and `HOME`
// alone finds it (rule R2: a ticket found only through `KRB5CCNAME` is no positive control, since a bridged child never gets that name, G5).
//
// What it writes, and where (rule R3). Everything lives in an owned folder but ONE file: `/etc/krb5.conf`, which a client reads with no variable at all. It is written with `sudo`
// and put back by the scope (the old file by its copy, or removed when there was none). The KDC and the principal database are the runner user's own, on a loopback port; no
// service of the image is started or stopped. The realm is BRIDGE.TEST (R5), made here, with a random master key; the keytabs are files of the owned folder.
//
// Nothing of a ticket is read or printed: the rig asks `klist -s` (an exit code) and compares a principal's NAME.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { execFileSync, spawnSync } = require('node:child_process');
const { launch, endChild } = require('../itestSshd.cjs');
const { check, systemRig, rigRun, findFile, throwawayWord, freePort, waitFor, bridgedEnv, productOf, oneLine } = require('./dbProbe.cjs');

const REALM = 'BRIDGE.TEST';
const USER = 'probe';
/** The service principal the fake MySQL server of PK1 sends to a Kerberos plugin: a service of the rig's realm, so that the client's ticket request is one the KDC can answer. */
const MYSQL_SPN = `mysql_service/localhost@${REALM}`;
const TOOLS = ['/usr/sbin', '/usr/bin', '/usr/lib/mit-krb5', '/usr/lib/krb5/sbin'];

/** The configuration file a client finds by default (the rig's own copy is the same text, with the KDC's logging section after it). */
function clientConfig(port) {
  return [
    '[libdefaults]',
    `  default_realm = ${REALM}`,
    '  dns_lookup_kdc = false',
    '  dns_lookup_realm = false',
    '  rdns = false',
    '  dns_canonicalize_hostname = false',
    // MIT 1.18+ appends the DNS search domain to a short name such as `localhost` (qualify_shortname); the second CI run asked for
    // postgres/localhost.<the runner's domain> in that domain's realm. An empty value turns it off.
    '  qualify_shortname = ""',
    '  udp_preference_limit = 1',
    '  default_ccache_name = FILE:/tmp/krb5cc_%{uid}', // NOSONAR: the MIT default, written out so that the client and the rig name one cache
    '[realms]',
    `  ${REALM} = {`,
    `    kdc = 127.0.0.1:${port}`,
    '  }',
    // Which realm a host name belongs to is asked of this table and never of the DNS (`dns_lookup_realm = false`): a service on `localhost` or on the loopback address has no domain to
    // take a realm from, and a client that cannot name the realm of the service asks for a ticket the KDC does not know.
    '[domain_realm]',
    `  localhost = ${REALM}`,
    `  .localhost = ${REALM}`,
    `  127.0.0.1 = ${REALM}`,
    '',
  ].join('\n');
}

/**
 * The KDC's own log, a file of the owned folder: what a leg that got no ticket for a service prints when the rig's check fails (the first run's legs said only `no token followed`). The
 * KDC reads `[logging]` from the profile of its context, so the section is in its own `kdc.conf` and in the rig's own copy of `krb5.conf`, never in the file clients find in `/etc`.
 */
const loggingLines = (dir) => [
  '[logging]',
  `  kdc = FILE:${path.join(dir, 'kdc.log')}`,
  `  admin_server = FILE:${path.join(dir, 'kadmin.log')}`,
  `  default = FILE:${path.join(dir, 'krb5.log')}`,
];

function kdcConfig(dir, port) {
  return [
    ...loggingLines(dir),
    '[kdcdefaults]',
    `  kdc_listen = 127.0.0.1:${port}`,
    `  kdc_tcp_listen = 127.0.0.1:${port}`,
    '[realms]',
    `  ${REALM} = {`,
    `    database_name = ${path.join(dir, 'principal')}`,
    `    key_stash_file = ${path.join(dir, 'stash')}`,
    `    acl_file = ${path.join(dir, 'kadm5.acl')}`,
    '    max_life = 1d 0h 0m 0s',
    '    supported_enctypes = aes256-cts-hmac-sha1-96:normal',
    '  }',
    '',
  ].join('\n');
}

/** Puts `text` in `/etc/krb5.conf` with `sudo`, keeping the old file for the scope to put back. */
function installSystemConfig(scope, dir, text) {
  const target = '/etc/krb5.conf';
  const kept = path.join(dir, 'krb5.conf.system');
  const had = fs.existsSync(target);
  if (had) {
    execFileSync('sudo', ['-n', 'cp', '-p', target, kept], { stdio: 'pipe' }); // NOSONAR: the CI runner's own sudo
  }
  scope.after(() => {
    try {
      if (had) {
        execFileSync('sudo', ['-n', 'cp', '-p', kept, target], { stdio: 'pipe' }); // NOSONAR: the CI runner's own sudo
      } else {
        execFileSync('sudo', ['-n', 'rm', '-f', target], { stdio: 'pipe' }); // NOSONAR: the CI runner's own sudo
      }
    } catch (error) {
      console.log(`rig: /etc/krb5.conf was NOT put back (${error.message})`);
    }
  });
  execFileSync('sudo', ['-n', 'tee', target], { input: text, stdio: ['pipe', 'ignore', 'pipe'] }); // NOSONAR: the CI runner's own sudo
  execFileSync('sudo', ['-n', 'chmod', '644', target], { stdio: 'pipe' }); // NOSONAR: the CI runner's own sudo
}

/** Whether something accepts a TCP connection on `port` of the loopback. */
const listening = (port) => new Promise((resolve) => {
  const probe = net.connect(port, '127.0.0.1');
  probe.once('connect', () => {
    probe.destroy();
    resolve(true);
  });
  probe.once('error', () => resolve(false));
});

/**
 * Builds the realm. `{ ok: true, ... }` with the handle below, or `{ ok: false, why }`: off CI or without the step's switch it is the printed skip of R3 (not measured), and on CI a tool that is
 * missing FAILS the rig's check, named.
 */
async function startRealm(scope, dir, home) {
  if (!systemRig()) {
    return { ok: false, why: 'the realm writes /etc/krb5.conf: it runs on a CI runner whose step sets BRIDGED_DB_SYSTEM_RIG=1 (rule R3)' };
  }
  const needed = { krb5kdc: 'krb5-kdc', 'kdb5_util': 'krb5-kdc', 'kadmin.local': 'krb5-admin-server', kinit: 'krb5-user', klist: 'krb5-user', kdestroy: 'krb5-user', kvno: 'krb5-user' };
  const tool = {};
  for (const [name, packageName] of Object.entries(needed)) {
    tool[name] = findFile(TOOLS, [name]);
    check(`rig K: ${name} is installed (the ${packageName} package)`, tool[name] !== undefined, `${name} is not in ${TOOLS.join(', ')}`);
  }
  if (Object.values(tool).includes(undefined)) {
    return { ok: false, why: 'a Kerberos tool is missing (named above)' };
  }
  fs.mkdirSync(dir, { recursive: true }); // the caller names the folder; nothing before this made it (the first CI run: ENOENT on its `krb5.conf`)
  const port = await freePort();
  const rigEnv = { PATH: process.env.PATH, KRB5_CONFIG: path.join(dir, 'krb5.conf'), KRB5_KDC_PROFILE: path.join(dir, 'kdc.conf') };
  fs.writeFileSync(rigEnv.KRB5_CONFIG, `${clientConfig(port)}${loggingLines(dir).join('\n')}\n`);
  fs.writeFileSync(rigEnv.KRB5_KDC_PROFILE, kdcConfig(dir, port));
  fs.writeFileSync(path.join(dir, 'kadm5.acl'), '');
  rigRun(tool['kdb5_util'], ['-r', REALM, 'create', '-s', '-P', throwawayWord()], { env: rigEnv });
  const keytab = (name) => path.join(dir, `${name.replaceAll(/[/@:]/g, '_')}.keytab`);
  const addPrincipal = (name) => {
    rigRun(tool['kadmin.local'], ['-r', REALM, '-q', `addprinc -randkey ${name}@${REALM}`], { env: rigEnv });
    rigRun(tool['kadmin.local'], ['-r', REALM, '-q', `ktadd -k ${keytab(name)} ${name}@${REALM}`], { env: rigEnv });
    return keytab(name);
  };
  const userKeytab = addPrincipal(USER);
  const serviceKeytab = addPrincipal('postgres/localhost');
  // The service names the receivers of the legs ask for: PostgreSQL's (`postgres` on `localhost`, which libpq builds from the host word) and the one PK1's fake MySQL server sends in its plugin data
  // (the first run had no such principal, so MariaDB's GSSAPI plugin asked the KDC for a service it did not know and the leg was `UNMEASURED`).
  addPrincipal(MYSQL_SPN.replace(`@${REALM}`, ''));
  const kdc = launch(scope, tool.krb5kdc, ['-n', '-r', REALM], { env: rigEnv });
  const up = await waitFor(() => listening(port), 10_000);
  check('rig K: the KDC listens on its loopback port', up, `krb5kdc said: ${kdc.stderr.trim().slice(0, 300)}`);
  if (!up) {
    await endChild(kdc);
    return { ok: false, why: 'the KDC did not start' };
  }
  installSystemConfig(scope, dir, clientConfig(port));
  const product = productOf();
  const env = bridgedEnv(product, home);
  const client = (program, args) => {
    try {
      execFileSync(tool[program], args, { env, stdio: 'pipe', timeout: 30_000 }); // NOSONAR: the rig's own path; the bridged environment
      return true;
    } catch {
      return false;
    }
  };
  const handle = {
    ok: true, realm: REALM, user: USER, identity: `${USER}@${REALM}`, serviceKeytab, addPrincipal, kdcPort: port, rigEnv, tool,
    /** A ticket in the default cache, found under the bridged environment alone. */
    ticketInReach: () => client('klist', ['-s']),
    /** The ticket taken away (the leg's `no ticket` half). */
    destroy: () => client('kdestroy', []),
    /** The ticket made again from the keytab, by the bridged environment, into the default cache. */
    renew: () => client('kinit', ['-k', '-t', userKeytab, `${USER}@${REALM}`]),
  };
  const tail = (file, lines) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').slice(-lines).map((line) => line.slice(0, 220)).join('\n') : `(${path.basename(file)} was not written)`);
  /** The last lines of the KDC's own log: what it answered, and the service names it was asked for. */
  handle.kdcLogTail = (lines = 12) => tail(path.join(dir, 'kdc.log'), lines);
  /**
   * Asks the client library, under the bridged environment, for a ticket for a service: `kvno` against a COPY of the default cache (the copy takes the service ticket; the default cache the legs
   * use is not touched). The answer is the program's own words (a principal and a number) and the library's trace of what it asked and what the KDC said, never a ticket's text.
   * `{ ok, said, trace }`.
   */
  handle.serviceCheck = (args) => {
    const cacheLine = (() => {
      try {
        return execFileSync(tool.klist, [], { env, encoding: 'utf8', stdio: 'pipe', timeout: 30_000 }); // NOSONAR: the rig's own path; the bridged environment
      } catch {
        return '';
      }
    })();
    const source = /Ticket cache: (?:FILE:)?(\S+)/.exec(cacheLine)?.[1];
    const copy = path.join(dir, 'service-check.cc');
    const traceFile = path.join(dir, 'service-check.trace');
    fs.rmSync(traceFile, { force: true });
    if (source === undefined || !fs.existsSync(source)) {
      return { ok: false, said: 'klist names no ticket cache file of the default cache', trace: '' };
    }
    fs.copyFileSync(source, copy);
    const answer = spawnSync(tool.kvno, args, { env: { ...env, KRB5CCNAME: `FILE:${copy}`, KRB5_TRACE: traceFile }, encoding: 'utf8', timeout: 30_000 }); // NOSONAR: the rig's own path
    fs.rmSync(copy, { force: true });
    return { ok: answer.status === 0, said: oneLine(`${answer.stdout ?? ''} ${answer.stderr ?? ''}`, 240), trace: tail(traceFile, 25) };
  };
  scope.after(() => handle.destroy());
  // Not a rig fault: a client that finds no ticket by default leaves every leg that needs one without its positive control (spec §S7.17), and those legs say so.
  const found = handle.renew() && handle.ticketInReach();
  console.log(`rig K: kinit under PATH and HOME alone ${found ? 'put a ticket in the default cache, and klist under the same finds it' : 'did NOT leave a ticket that klist finds under the same environment'}`);
  if (!found) {
    return { ok: false, why: 'no ticket is found by default under PATH and HOME alone' };
  }
  // The rig's own check that a client library under the bridged environment can GET a ticket for each service a leg asks for. A failure is the rig's fault (a leg that needs the service cannot be
  // shown), and it prints what the library asked, what the KDC answered and the KDC's own log.
  for (const [label, args] of [['postgres on localhost, as libpq names it (service postgres, host localhost)', ['-S', 'postgres', 'localhost']], [`${MYSQL_SPN}, as the fake MySQL server sends it`, [MYSQL_SPN]]]) {
    const got = handle.serviceCheck(args);
    check(`rig K: the client library gets a ticket for ${label}`, got.ok, `kvno said: ${got.said}\nthe client library's trace:\n${got.trace}\nthe KDC's log:\n${handle.kdcLogTail()}`);
  }
  return handle;
}

module.exports = { startRealm, REALM, USER, MYSQL_SPN };
