'use strict';
// PK1 for the two `mysql` clients (the E1.7 spec §S7.4, PK1-m1 to PK1-m7; rig F, with rig K where a plugin needs a ticket): a server that SWITCHES the client to a plugin that
// authenticates with something other than the entry's password, and what the client answers. One leg per plugin of the parent's list, and one more for every other loadable
// authentication plugin the client's own folder lists (PA1-e's listing is read here, never remembered).
//
// Each leg: the CONTROL (the launch the builder writes with every candidate flag taken out, with the identity in reach), then the launch as built, then each candidate, for entry A
// (stores the user and the password, through `buildDbQueryLaunch`) and entry B (no password: the same launch with `MYSQL_PWD` taken away, by hand). A plugin the client cannot load has no
// control: the leg is `UNMEASURED` on that build, and the pair stays refused on it (a build that lacks a plugin of the list, L1).
//
// The record is words and numbers: the length of an answer and, where a plugin sends the entry's own word, whether the answer WAS that word. No answer's bytes are kept.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { check, record, unmeasured, notThisClients, stop, bridgedEnv, runClient, oneLine, throwawayWord, rigRun, systemRig } = require('./dbProbe.cjs');
const { withFakeMysql } = require('./pkMysqlFake.cjs');
const { MYSQL_SPN: SPN } = require('./pkKrbRig.cjs');

const CANDIDATE_FLAG = /^--(?:plugin-dir=|skip-enable-cleartext-plugin$|restricted-auth=)/;
/** What a client says when it does not know a flag it was given: it ends before it connects, so nothing a leg sees is the flag's doing (the first run called MariaDB's refusals `stopped`). */
const UNKNOWN_FLAG = /unknown (?:variable|option|flag)|unrecognized option|invalid option|option '[^']*' cannot take an argument|ambiguous option/i;
/** The client families of the legs: a client is `{ name, family, exe }`; Oracle's own build and the distribution's both are `oracle`, and `name` tells them apart in a leg's name. */
const familyOf = (client) => client.family ?? client.name;
/**
 * The names that are CLIENT authentication plugins: the `*_client` files (`authentication_kerberos_client`, `auth_gssapi_client`, `client_ed25519`) and the password plugins a client carries. A folder
 * that holds more (Oracle's distribution build lists `adt_null`, `group_replication`, `mysql_clone`: server plugins that are not clients' and cannot answer a server's request to switch) is not
 * a list of what the client can authenticate with; the first run switched the client to each of them and read their load errors as findings.
 */
const isClientAuthPlugin = (name) => /_client$/.test(name) || /^(?:mysql_clear_password|sha256_password|caching_sha2_password|mysql_native_password|mysql_old_password|dialog|parsec)$/.test(name);
const LOAD_FAILURE = /cannot be loaded|could not be loaded|plugin .* not (?:found|loaded|enabled)|unknown plugin|not enabled|cannot open shared object/i;
const LISTED_PASSWORD_PLUGINS = new Set(['caching_sha2_password', 'sha256_password', 'mysql_native_password', 'mysql_old_password', 'client_ed25519', 'parsec']);

const le16 = (text) => {
  const head = Buffer.alloc(2);
  head.writeUInt16LE(Buffer.byteLength(text));
  return Buffer.concat([head, Buffer.from(text)]);
};

/**
 * What the server's WebAuthn plugin sends the client after the switch: a capability byte, then the 32-byte random challenge and the relying party's id, each as a length-encoded string. The second CI run sent the
 * challenge alone, and the client said "Challange recevied is corrupt" before it looked for a device (a rig fault, not an answer). With this shape the client gets as far as the device and says
 * "No FIDO device available on client host" (read on Oracle's 8.4.13 build by hand), so the leg stays unmeasured for the right reason: no device and no answer made with one (spec L1).
 */
const WEBAUTHN_CHALLENGE = Buffer.concat([Buffer.from([0x00, 0x20]), Buffer.alloc(32, 0x5a), Buffer.from([0x09]), Buffer.from('mysql.com')]);

/** The plugins of the parent's list. `names` per client, `kind` says what the positive control is, `data` is what that plugin's server sends after the name. */
const PLUGINS = [
  { leg: 'PK1-m1', label: 'Kerberos', kind: 'ticket', names: { oracle: ['authentication_kerberos_client'], mariadb: ['auth_gssapi_client'] }, data: { oracle: Buffer.concat([le16(SPN), le16('BRIDGE.TEST')]), mariadb: Buffer.from(`${SPN}\0`) } },
  { leg: 'PK1-m2', label: 'LDAP SASL with the GSSAPI mechanism', kind: 'ticket', names: { oracle: ['authentication_ldap_sasl_client'], mariadb: [] }, data: { oracle: Buffer.from('GSSAPI') } },
  { leg: 'PK1-m3', label: 'the cloud key file', kind: 'file', names: { oracle: ['authentication_oci_client'], mariadb: [] }, data: { oracle: Buffer.from('0123456789abcdef0123456789abcdef') } },
  { leg: 'PK1-m4', label: 'a security key', kind: 'device', names: { oracle: ['authentication_webauthn_client', 'authentication_fido_client'], mariadb: [] }, data: { oracle: WEBAUTHN_CHALLENGE } },
  { leg: 'PK1-m5', label: 'a clear-text request', kind: 'word', names: { oracle: ['mysql_clear_password'], mariadb: ['dialog', 'mysql_clear_password'] }, data: { oracle: Buffer.alloc(0), mariadb: Buffer.concat([Buffer.from([0x04]), Buffer.from('Password: ')]) } },
  { leg: 'PK1-m5b', label: 'a clear-text request (the plugin of that name, which N11 says may be linked into the client)', kind: 'word', only: 'mariadb', names: { oracle: [], mariadb: ['mysql_clear_password'] }, data: { mariadb: Buffer.alloc(0) } },
];
const WINDOWS_PLUGIN = { leg: 'PK1-m6', label: 'Windows authentication', kind: 'ntlm', names: { oracle: ['authentication_windows_client'], mariadb: [] }, data: { oracle: Buffer.from('BRIDGE\0') } };

/** The folder a client loads plugins from by default: named by the step (for the build the step named, not for the distribution's), else the first usual place that exists. */
function pluginFolder(client) {
  const family = familyOf(client);
  const named = client.name === family ? process.env[family === 'oracle' ? 'BRIDGED_MYSQL_ORACLE_PLUGIN_DIR' : 'BRIDGED_MARIADB_PLUGIN_DIR'] : undefined;
  const usual = family === 'oracle'
    ? ['/usr/lib/x86_64-linux-gnu/mysql/plugin', '/usr/lib/mysql/plugin', '/usr/lib64/mysql/plugin', '/usr/lib/aarch64-linux-gnu/mysql/plugin']
    : ['/usr/lib/x86_64-linux-gnu/libmariadb3/plugin', '/usr/lib/aarch64-linux-gnu/libmariadb3/plugin', '/usr/lib/mariadb/plugin', '/usr/lib/mysql/plugin'];
  return [named, ...usual].find((folder) => folder !== undefined && folder !== '' && fs.existsSync(folder));
}

const listPlugins = (folder) => (folder === undefined ? [] : fs.readdirSync(folder).filter((file) => /\.(so|dll)$/.test(file)).map((file) => file.replace(/\.(so|dll)$/, '')).sort((a, b) => a.localeCompare(b)));

/** The builder's launch for the fake at `port`, then what a leg does to it by hand. */
function launchMysql(ctx, client, port, { entry = 'A', control = false, add = [], home = ctx.home, envSet = {} } = {}) {
  const { product } = ctx;
  const built = product.buildDbQueryLaunch('mysql', `mysql://${ctx.user}:${ctx.entryWord}@127.0.0.1:${port}/db`, 'select 1', { bridged: true, absentFile: product.materializedKeyPath(ctx.dir, 'no-client-file') });
  if (built === undefined) {
    throw new Error('buildDbQueryLaunch refused the entry of a PK1 mysql leg that must launch');
  }
  const args = control ? built.args.filter((arg) => !CANDIDATE_FLAG.test(arg)) : [...built.args];
  const at = args.indexOf('--protocol=TCP') + 1;
  args.splice(at, 0, ...add);
  const env = { ...bridgedEnv(product, home, built.env), ...envSet };
  if (entry === 'B') {
    delete env.MYSQL_PWD;
  }
  return { args, env, exe: client.exe };
}

/** One client against one fake that switches it to `pluginName`: what it answered. */
async function observe(ctx, client, plugin, pluginName, options) {
  const fake = await withFakeMysql({ plugin: pluginName, data: plugin.data?.[familyOf(client)] ?? Buffer.alloc(0), entryWord: ctx.entryWord, ntlm: plugin.kind === 'ntlm' }, async (port) => {
    const launched = launchMysql(ctx, client, port, options);
    return runClient(ctx.scope, launched.exe, launched.args, launched.env);
  });
  const state = fake.state;
  const first = state.replies[0];
  const said = oneLine(fake.result.stderr, 260);
  const refusedFlag = !state.switched && UNKNOWN_FLAG.test(fake.result.stderr);
  return {
    state, said, refusedFlag, ended: fake.result.ended, switched: state.switched, answered: first !== undefined,
    offered: first !== undefined && first.length > 0 && first.label !== 'empty',
    lacks: !state.switched ? false : first === undefined && LOAD_FAILURE.test(fake.result.stderr),
    words: refusedFlag ? `the client refused a flag before connecting (it said ${JSON.stringify(said)}): UNKNOWN TO THIS CLIENT` : first === undefined ? `no answer after the switch to ${pluginName}; the client said ${JSON.stringify(said)}` : `answered with ${first.length} byte(s) (${first.label})${state.ntlm === undefined ? '' : `; the NTLM answer names user ${JSON.stringify(state.ntlm.user)} of ${JSON.stringify(state.ntlm.domain)} on ${JSON.stringify(state.ntlm.workstation)}`}`,
  };
}

/** Whether the client knows `flag` (PA1-d's question, asked of `--version`). */
function knowsFlag(client, flag, env) {
  try {
    execFileSync(client.exe, [flag, '--version'], { env, stdio: 'pipe', timeout: 20_000 }); // NOSONAR: a path chosen by the rig
    return true;
  } catch {
    return false;
  }
}

/** The candidates of one client: `--plugin-dir` at the absent file, and the flag only one vendor knows when the client knows it. */
function candidatesOf(ctx, client) {
  const absent = ctx.product.materializedKeyPath(ctx.dir, 'no-client-file');
  const env = bridgedEnv(ctx.product, ctx.home);
  const list = [{ what: '--plugin-dir at the absent file', flags: [`--plugin-dir=${absent}`] }];
  if (familyOf(client) === 'oracle') {
    const flag = '--skip-enable-cleartext-plugin';
    if (knowsFlag(client, flag, env)) {
      list.push({ what: flag, flags: [flag] });
    }
  } else {
    const flag = '--restricted-auth=mysql_native_password,caching_sha2_password,sha256_password,client_ed25519,parsec';
    if (knowsFlag(client, flag, env)) {
      list.push({ what: 'restricted-auth with the password plugins only', flags: [flag] });
    }
  }
  if (process.platform === 'win32' && familyOf(client) === 'oracle') {
    return []; // no candidate is known for the built-in Windows authentication plugin (spec §S7.5)
  }
  return list;
}

/**
 * What a ticket plugin's control that offered nothing leaves for the reader (the second run's LDAP SASL control said only "Unknown MySQL error"): the plugin's own log at the error level
 * (`AUTHENTICATION_LDAP_CLIENT_LOG=3`, a variable that changes what the plugin says and nothing it does, added to this one diagnostic run only), the client library's trace of what it asked and the
 * KDC's last lines (which service names it was asked for). Printed, never counted; a ticket's text is in none of them.
 */
async function diagnoseTicket(ctx, client, plugin, pluginName) {
  const traceFile = path.join(ctx.dir, `diagnose-${client.name}-${plugin.leg}.trace`);
  fs.rmSync(traceFile, { force: true });
  const seen = await observe(ctx, client, plugin, pluginName, { control: true, envSet: { AUTHENTICATION_LDAP_CLIENT_LOG: '3', KRB5_TRACE: traceFile } });
  const lines = (text, limit) => text.trim().split('\n').slice(-limit).map((line) => line.slice(0, 200)).join('\n    ');
  console.log(`diagnosis (${plugin.leg}-${client.name}, the control launched again with the plugin's error log and the client library's trace on):`);
  console.log(`  the client said: ${JSON.stringify(seen.said)} (the plugin's own lines above are in it)`);
  console.log(`  the client library's trace:\n    ${fs.existsSync(traceFile) ? lines(fs.readFileSync(traceFile, 'utf8'), 20) : '(none written: the plugin did not reach Kerberos)'}`);
  console.log(`  the KDC's log:\n    ${ctx.realm.kdcLogTail(10).split('\n').join('\n    ')}`);
}

/** The control of a plugin kind: the launch with no candidate, and the half that takes the identity away. `{ shown, text }`. */
async function control(ctx, client, plugin, pluginName, controlFlags) {
  const base = { control: true, add: controlFlags };
  const withIdentity = await observe(ctx, client, plugin, pluginName, base);
  check(`(${plugin.leg}) ${client.name} control: the client ended in time`, withIdentity.ended, withIdentity.words);
  if (!withIdentity.switched) {
    return { shown: false, text: `the client never logged in at the fake (${withIdentity.said})` };
  }
  if (withIdentity.lacks) {
    return { shown: false, text: `this build cannot load ${pluginName}: ${withIdentity.words}` };
  }
  if (plugin.kind === 'device') {
    return { shown: false, text: `a security key needs a device and an answer made with it (spec L1): none can be made on this runner; the client with the plugin: ${withIdentity.words}` };
  }
  if (!withIdentity.offered) {
    if (plugin.kind === 'ticket' && ctx.realm?.ok === true) {
      await diagnoseTicket(ctx, client, plugin, pluginName);
    }
    return { shown: false, text: `the client offered nothing with the identity in reach: ${withIdentity.words}` };
  }
  if (plugin.kind === 'ticket' || plugin.kind === 'file') {
    ctx.takeAway(plugin.kind);
    const without = await observe(ctx, client, plugin, pluginName, base);
    ctx.putBack(plugin.kind);
    if (without.offered) {
      return { shown: false, text: `the client answered just the same with the identity taken away, so the answer is not the identity's: ${without.words}` };
    }
    return { shown: true, text: `${withIdentity.words}; with the ${plugin.kind === 'ticket' ? 'ticket' : 'key file'} taken away: ${without.words}` };
  }
  return { shown: true, text: withIdentity.words };
}

/** One plugin on one client: control, as built, each candidate, for entry A and entry B. */
async function pluginLeg(ctx, client, plugin) {
  const pluginName = (plugin.names[familyOf(client)] ?? []).find((name) => ctx.present[client.name].includes(name)) ?? plugin.names[familyOf(client)]?.[0];
  const tag = `${plugin.leg}-${client.name}`;
  if (plugin.only !== undefined && plugin.only !== familyOf(client)) {
    return;
  }
  if (plugin.leg === 'PK1-m5b') {
    record(`${tag}-form`, 'shown', `mysql_clear_password is ${ctx.present[client.name].includes('mysql_clear_password') ? 'a FILE of the client\'s plugin folder (--plugin-dir at the absent path is expected to stop it)' : 'NOT a file of the client\'s plugin folder: it may be linked into the client (N11), and --plugin-dir would not stop it'}`);
  }
  if ((plugin.names[familyOf(client)] ?? []).length === 0) {
    // The parent's list (§4.11) names no such plugin for this client: it is not this client's road, so it is no missing control either.
    notThisClients(tag, `${plugin.label} is not on the parent's list for ${familyOf(client)}'s client (§4.11): nothing to measure, and nothing left unmeasured`);
    return;
  }
  if (pluginName === undefined) {
    unmeasured(tag, `${client.name}'s client has no ${plugin.label} plugin in the parent's list for it (no client build with the plugin${client.name === familyOf(client) ? '' : `; this is the distribution's package: Oracle's own build is the \`oracle\` client`})`);
    return;
  }
  if ((plugin.kind === 'ticket' && ctx.realm?.ok !== true) || (plugin.kind === 'ntlm' && process.platform !== 'win32')) {
    unmeasured(tag, plugin.kind === 'ntlm' ? 'Windows authentication is a Windows leg' : `no realm: ${ctx.realm?.why ?? 'not built'}`);
    return;
  }
  const flags = plugin.kind === 'word' ? ['--enable-cleartext-plugin'] : [];
  let ready = await control(ctx, client, plugin, pluginName, flags);
  if (!ready.shown && flags.length > 0 && /never logged in|did not|unknown option|unrecognized/i.test(ready.text)) {
    ready = await control(ctx, client, plugin, pluginName, []);
  }
  if (!ready.shown) {
    unmeasured(tag, ready.text);
    return;
  }
  record(`${tag}-control`, 'shown', `positive control, ${plugin.label} (${pluginName}), entry A, no control of the profile: ${ready.text}`);
  const candidates = candidatesOf(ctx, client);
  const offeredUnder = [];
  for (const entry of ['A', 'B']) {
    const asBuilt = await observe(ctx, client, plugin, pluginName, { entry });
    record(`${tag}-built-${entry}`, 'shown', `as launched, entry ${entry}: ${asBuilt.offered ? 'IDENTITY OFFERED' : 'identity not offered'}; ${asBuilt.words}`);
    for (const candidate of candidates) {
      const seen = await observe(ctx, client, plugin, pluginName, { entry, add: candidate.flags });
      const verdict = seen.refusedFlag ? 'the flag is UNKNOWN TO THIS CLIENT (it was refused before connecting: it stopped nothing and offered nothing)' : (seen.offered ? 'IDENTITY OFFERED' : 'identity not offered');
      record(`${tag}-${candidate.what.split(' ')[0].replaceAll('-', '')}-${entry}`, 'shown', `${candidate.what}, entry ${entry}: ${verdict}; ${seen.words}`);
      offeredUnder.push({ what: candidate.what, entry, offered: seen.offered, unknown: seen.refusedFlag });
    }
  }
  // A flag the client refused before connecting is not a control that stopped a road: it is not one of this client's flags, and it is left out of the decision.
  const known = candidates.filter((candidate) => offeredUnder.some((row) => row.what === candidate.what && !row.unknown));
  const unknown = candidates.filter((candidate) => !known.includes(candidate)).map((candidate) => candidate.what);
  const stoppers = known.filter((candidate) => offeredUnder.filter((row) => row.what === candidate.what).every((row) => !row.offered)).map((candidate) => candidate.what);
  if (known.length === 0) {
    record(`${tag}-decision`, 'shown', `no candidate control is known for this plugin on this client (spec §S7.5)${unknown.length === 0 ? '' : `; the client does not know: ${unknown.join('; ')}`}: the pair stays refused`);
  } else if (stoppers.length === 0 && offeredUnder.some((row) => row.offered)) {
    stop(`${tag}-decision`, `${plugin.label} is offered under every candidate (parent §7, row PK1: the pair stays refused, Q18)`);
  } else {
    record(`${tag}-decision`, 'shown', `stopped in every leg of it by: ${stoppers.join('; ') || 'nothing was offered under any candidate'}${unknown.length === 0 ? '' : `; unknown to this client, not counted: ${unknown.join('; ')}`}`);
  }
}

/**
 * PK1-m7: a plugin named by a path. A copy of a loadable plugin of the build is put in a folder of the rig; the server names it with `../` steps that lead there from the
 * client's plugin folder, and by its absolute path. The control names the copy bare, with the copy's folder as `--plugin-dir`. Each name runs as launched and again with `--plugin-dir` at an
 * empty folder that exists. "Opened" is read from the answer: a plugin that was opened and ran has answered.
 */
async function legPath(ctx, client) {
  const tag = `PK1-m7-${client.name}`;
  const folder = ctx.folders[client.name];
  const clear = PLUGINS.find((entry) => entry.leg === 'PK1-m5');
  const kerberos = PLUGINS.find((entry) => entry.leg === 'PK1-m1');
  // The plugin files THIS build has: the password plugins that are files of MariaDB's and of the distribution's client, and, in Oracle's own build (whose password plugins are linked in), the
  // Kerberos plugin, which answers when the rig's ticket is in reach. The second run looked for the three password names in Oracle's own folder and found none.
  const carriers = [
    ...['mysql_clear_password', 'dialog', 'caching_sha2_password'].map((name) => ({ name, plugin: clear, flags: ['--enable-cleartext-plugin'] })),
    ...(familyOf(client) === 'oracle' && ctx.realm?.ok === true ? [{ name: 'authentication_kerberos_client', plugin: kerberos, flags: [] }] : []),
  ];
  const carrier = folder === undefined ? undefined : carriers.find((entry) => ctx.present[client.name].includes(entry.name));
  if (carrier === undefined) {
    const listed = ctx.present[client.name].filter(isClientAuthPlugin);
    unmeasured(tag, `no loadable plugin to copy: the client's plugin folder ${folder === undefined ? 'was not found' : `lists no client plugin this leg can use (it lists: ${listed.join(', ') || 'none'}; the password plugins of this build are linked in, N11`}${folder === undefined ? '' : `, and the Kerberos plugin needs the realm: ${ctx.realm?.ok === true ? 'built' : 'not built'})`}`);
    return;
  }
  const { name: loaded, plugin, flags } = carrier;
  const rigRoot = path.join(ctx.dir, `m7 ${client.name}`);
  const rigFolder = path.join(rigRoot, 'lib', 'plugin');
  const empty = path.join(ctx.dir, `m7 ${client.name} empty`);
  fs.mkdirSync(rigFolder, { recursive: true });
  fs.mkdirSync(empty, { recursive: true });
  const extension = process.platform === 'win32' ? '.dll' : '.so';
  fs.copyFileSync(path.join(folder, `${loaded}${extension}`), path.join(rigFolder, `${loaded}${extension}`));
  // A plugin of Oracle's own build finds its libraries through `$ORIGIN/../private`: the copy's folder has the same neighbour, so that the copy loads as the original does.
  const privateLibs = path.join(folder, '..', 'private');
  if (process.platform !== 'win32' && fs.existsSync(privateLibs) && !fs.existsSync(path.join(rigRoot, 'lib', 'private'))) {
    fs.symlinkSync(fs.realpathSync(privateLibs), path.join(rigRoot, 'lib', 'private'));
  }
  const withFlags = (extra) => [...extra, ...flags];
  let shown = await observe(ctx, client, plugin, loaded, { control: true, add: withFlags([`--plugin-dir=${rigFolder}`]) });
  if (!shown.offered) {
    shown = await observe(ctx, client, plugin, loaded, { control: true, add: [`--plugin-dir=${rigFolder}`] });
  }
  if (!shown.offered) {
    unmeasured(tag, `the control (the copy's folder as --plugin-dir, ${loaded} named bare) did not load and answer: ${shown.words}`);
    return;
  }
  record(`${tag}-control`, 'shown', `positive control, ${loaded} named bare with the copy's folder as --plugin-dir: ${shown.words}`);
  for (const [where, pluginDir] of [['as launched (the client\'s own plugin folder)', folder], ['with --plugin-dir at an empty folder that exists', empty]]) {
    const steps = path.relative(pluginDir, path.join(rigFolder, loaded)).split(path.sep).join('/');
    for (const [what, name] of [['a name with ../ steps', steps], ['the absolute path', path.join(rigFolder, loaded)]]) {
      const options = where.startsWith('as launched') ? { control: true, add: withFlags([]) } : { control: true, add: withFlags([`--plugin-dir=${empty}`]) };
      const seen = await observe(ctx, client, plugin, name, options);
      record(`${tag}-${what.startsWith('a name') ? 'dotdot' : 'absolute'}-${where.startsWith('as launched') ? 'default' : 'empty'}`, 'shown', `${what}, ${where}: ${seen.offered ? 'THE COPY WAS OPENED AND ANSWERED' : 'the copy was not opened'}; ${seen.words}`);
      if (seen.offered) {
        stop(tag, `the client followed a path in a plugin name (${what}; N13 says both clients refuse one): a path in the server's plugin name reaches a file of the person's disk`);
      }
    }
  }
}

/**
 * Where the cloud plugin reads its configuration, by the client's OWN words: with no file it says `Could not read the config file: <path>`. The plugin does not look in `HOME` (the second
 * run set the bridged `HOME` to the rig home, wrote its marker there, and the client read `/home/runner/.oci/config`): it takes the account's home from the passwd entry, so a file the plugin
 * reads is a file of the runner's own home. The path is read from the answer, never assumed, and must be `.oci/config` in the account's own home folder before anything is written (rule R3).
 * `undefined` when the client says no such thing (a build that cannot load the plugin, a platform that keeps the file elsewhere).
 */
async function keyFileSite(ctx, client, plugin, pluginName) {
  const seen = await observe(ctx, client, plugin, pluginName, { control: true });
  const named = /config file: (.+?)(?: \||$)/.exec(seen.said)?.[1]?.trim();
  if (named === undefined) {
    return { why: `the client names no configuration file in its words (it said ${JSON.stringify(seen.said)})` };
  }
  const home = os.homedir();
  const inside = path.relative(home, named);
  if (inside.startsWith('..') || path.isAbsolute(inside) || !/^\.oci[\\/]config$/.test(inside)) {
    return { why: `the client reads ${named}, which is not .oci/config under the account's own home folder (${home}): nothing is written there` };
  }
  return { file: named, folder: path.dirname(named), home };
}

/**
 * One throwaway key file and configuration for the cloud plugin (R5), in the folder the plugin reads (R3: the account's own home on a CI runner whose step says so). A folder that is already there is
 * moved aside, and `restore` (idempotent; the scope calls it too) removes the rig's own and puts the old one back. `{ folder, restore }`.
 */
function makeKeyFile(ctx, site) {
  const folder = site.folder;
  const aside = `${folder}.pk1-aside`;
  const had = fs.existsSync(folder);
  let restored = false;
  const restore = () => {
    if (restored) {
      return;
    }
    restored = true;
    fs.rmSync(folder, { recursive: true, force: true });
    fs.rmSync(`${folder}.away`, { recursive: true, force: true });
    if (had && fs.existsSync(aside)) {
      fs.renameSync(aside, folder);
    }
  };
  if (had) {
    fs.renameSync(folder, aside);
  }
  ctx.scope.after(restore);
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  rigRun('openssl', ['genrsa', '-out', path.join(folder, 'oci_api_key.pem'), '2048']);
  fs.writeFileSync(path.join(folder, 'config'), ['[DEFAULT]', 'user=ocid1.user.oc1..rigfake', 'fingerprint=00:11:22:33:44:55:66:77:88:99:aa:bb:cc:dd:ee:ff', `key_file=${path.join(folder, 'oci_api_key.pem')}`, 'tenancy=ocid1.tenancy.oc1..rigfake', 'region=rig-test-1', ''].join('\n'), { mode: 0o600 });
  return { folder, restore };
}

/** PK1-m3 on one client: the cloud plugin. The file is written where the client says it reads (see `keyFileSite`), then the leg runs as every other. */
async function fileLeg(ctx, client, plugin, keyFolder) {
  const tag = `${plugin.leg}-${client.name}`;
  const pluginName = (plugin.names[familyOf(client)] ?? []).find((name) => ctx.present[client.name].includes(name)) ?? plugin.names[familyOf(client)]?.[0];
  if (!systemRig()) {
    unmeasured(tag, "the cloud plugin reads .oci/config in the account's own home folder (not HOME), a file of the runner's own profile: a CI runner whose step sets BRIDGED_DB_SYSTEM_RIG=1 (rule R3)");
    return;
  }
  const site = await keyFileSite(ctx, client, plugin, pluginName);
  let made;
  if (site.why === undefined) {
    made = makeKeyFile(ctx, site);
    keyFolder.current = made.folder;
    console.log(`rig: the cloud plugin of ${client.name} reads ${site.file} (the account's home by the passwd entry, ${site.home}; the bridged HOME is ${ctx.home} and does not move it): a throwaway key and configuration are there for this leg and are put back`);
  } else {
    console.log(`rig: no key file is written for ${tag}: ${site.why}`);
  }
  try {
    await pluginLeg(ctx, client, plugin);
  } finally {
    keyFolder.current = undefined;
    made?.restore();
  }
}

/** PK1-m1 to PK1-m7, and the listed plugins, for each `mysql` client the harness found. `clients` is `[{ name, exe }]`. */
async function mysqlLegs(ctx, clients) {
  const entryWord = throwawayWord();
  const base = { ...ctx, entryWord, user: ctx.realm?.user ?? 'probe', present: {}, folders: {} };
  for (const client of clients) {
    const folder = pluginFolder(client);
    base.folders[client.name] = folder;
    base.present[client.name] = listPlugins(folder);
    const auth = base.present[client.name].filter(isClientAuthPlugin);
    console.log(`PA1-e ${client.name}: plugin folder ${folder ?? 'NOT FOUND'}; client authentication plugins listed: ${auth.join(', ') || 'none'}; other files of the folder (server plugins, not authentication clients, never switched to): ${base.present[client.name].length - auth.length}`);
  }
  const keyFolder = { current: undefined };
  base.takeAway = (kind) => {
    if (kind === 'ticket') {
      check('rig K: the ticket is destroyed for the half of the control that takes it away', ctx.realm.destroy() && !ctx.realm.ticketInReach(), 'kdestroy left a ticket');
    } else if (keyFolder.current !== undefined) {
      fs.renameSync(keyFolder.current, `${keyFolder.current}.away`);
    }
  };
  base.putBack = (kind) => {
    if (kind === 'ticket') {
      ctx.realm.renew();
    } else if (keyFolder.current !== undefined) {
      fs.renameSync(`${keyFolder.current}.away`, keyFolder.current);
    }
  };
  for (const client of clients) {
    const plugins = process.platform === 'win32' ? [...PLUGINS, WINDOWS_PLUGIN] : PLUGINS;
    for (const plugin of plugins) {
      if (plugin.kind === 'file' && (plugin.names[familyOf(client)] ?? []).length > 0) {
        await fileLeg(base, client, plugin, keyFolder);
      } else {
        await pluginLeg(base, client, plugin);
      }
    }
    for (const listed of base.present[client.name].filter((name) => isClientAuthPlugin(name) && !LISTED_PASSWORD_PLUGINS.has(name) && !PLUGINS.some((plugin) => plugin.names[familyOf(client)]?.includes(name)) && name !== WINDOWS_PLUGIN.names.oracle[0])) {
      await pluginLeg(base, client, { leg: `PK1-m8-${listed}`, label: `the listed plugin ${listed}`, kind: 'listed', names: { [familyOf(client)]: [listed] }, data: {} });
    }
    await legPath(base, client);
  }
}

module.exports = { mysqlLegs };
