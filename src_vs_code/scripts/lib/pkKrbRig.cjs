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
const { execFileSync } = require('node:child_process');
const { launch, endChild } = require('../itestSshd.cjs');
const { check, systemRig, rigRun, findFile, throwawayWord, freePort, waitFor, bridgedEnv, productOf } = require('./dbProbe.cjs');

const REALM = 'BRIDGE.TEST';
const USER = 'probe';
const TOOLS = ['/usr/sbin', '/usr/bin', '/usr/lib/mit-krb5', '/usr/lib/krb5/sbin'];

/** The configuration file a client finds by default and the rig's own copy: the same text. */
function clientConfig(port) {
  return [
    '[libdefaults]',
    `  default_realm = ${REALM}`,
    '  dns_lookup_kdc = false',
    '  dns_lookup_realm = false',
    '  rdns = false',
    '  dns_canonicalize_hostname = false',
    '  udp_preference_limit = 1',
    '  default_ccache_name = FILE:/tmp/krb5cc_%{uid}',
    '[realms]',
    `  ${REALM} = {`,
    `    kdc = 127.0.0.1:${port}`,
    '  }',
    '',
  ].join('\n');
}

function kdcConfig(dir, port) {
  return [
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
    execFileSync('sudo', ['-n', 'cp', '-p', target, kept], { stdio: 'pipe' });
  }
  scope.after(() => {
    try {
      if (had) {
        execFileSync('sudo', ['-n', 'cp', '-p', kept, target], { stdio: 'pipe' });
      } else {
        execFileSync('sudo', ['-n', 'rm', '-f', target], { stdio: 'pipe' });
      }
    } catch (error) {
      console.log(`rig: /etc/krb5.conf was NOT put back (${error.message})`);
    }
  });
  execFileSync('sudo', ['-n', 'tee', target], { input: text, stdio: ['pipe', 'ignore', 'pipe'] });
  execFileSync('sudo', ['-n', 'chmod', '644', target], { stdio: 'pipe' });
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
  const needed = { krb5kdc: 'krb5-kdc', 'kdb5_util': 'krb5-kdc', 'kadmin.local': 'krb5-admin-server', kinit: 'krb5-user', klist: 'krb5-user', kdestroy: 'krb5-user' };
  const tool = {};
  for (const [name, packageName] of Object.entries(needed)) {
    tool[name] = findFile(TOOLS, [name]);
    check(`rig K: ${name} is installed (the ${packageName} package)`, tool[name] !== undefined, `${name} is not in ${TOOLS.join(', ')}`);
  }
  if (Object.values(tool).includes(undefined)) {
    return { ok: false, why: 'a Kerberos tool is missing (named above)' };
  }
  const port = await freePort();
  const rigEnv = { PATH: process.env.PATH, KRB5_CONFIG: path.join(dir, 'krb5.conf'), KRB5_KDC_PROFILE: path.join(dir, 'kdc.conf') };
  fs.writeFileSync(rigEnv.KRB5_CONFIG, clientConfig(port));
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
  scope.after(() => handle.destroy());
  // Not a rig fault: a client that finds no ticket by default leaves every leg that needs one without its positive control (spec §S7.17), and those legs say so.
  const found = handle.renew() && handle.ticketInReach();
  console.log(`rig K: kinit under PATH and HOME alone ${found ? 'put a ticket in the default cache, and klist under the same finds it' : 'did NOT leave a ticket that klist finds under the same environment'}`);
  return found ? handle : { ok: false, why: 'no ticket is found by default under PATH and HOME alone' };
}

module.exports = { startRealm, REALM, USER };
