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
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { check, record, unmeasured, stop, bridgedEnv, runClient, oneLine, throwawayWord, rigRun } = require('./dbProbe.cjs');
const { withFakeMysql } = require('./pkMysqlFake.cjs');

const CANDIDATE_FLAG = /^--(?:plugin-dir=|skip-enable-cleartext-plugin$|restricted-auth=)/;
const LOAD_FAILURE = /cannot be loaded|could not be loaded|plugin .* not (?:found|loaded|enabled)|unknown plugin|not enabled|cannot open shared object/i;
const LISTED_PASSWORD_PLUGINS = new Set(['caching_sha2_password', 'sha256_password', 'mysql_native_password', 'mysql_old_password', 'client_ed25519', 'parsec']);

const le16 = (text) => {
  const head = Buffer.alloc(2);
  head.writeUInt16LE(Buffer.byteLength(text));
  return Buffer.concat([head, Buffer.from(text)]);
};
const SPN = 'mysql_service/localhost@BRIDGE.TEST';

/** The plugins of the parent's list. `names` per client, `kind` says what the positive control is, `data` is what that plugin's server sends after the name. */
const PLUGINS = [
  { leg: 'PK1-m1', label: 'Kerberos', kind: 'ticket', names: { oracle: ['authentication_kerberos_client'], mariadb: ['auth_gssapi_client'] }, data: { oracle: Buffer.concat([le16(SPN), le16('BRIDGE.TEST')]), mariadb: Buffer.from(`${SPN}\0`) } },
  { leg: 'PK1-m2', label: 'LDAP SASL with the GSSAPI mechanism', kind: 'ticket', names: { oracle: ['authentication_ldap_sasl_client'], mariadb: [] }, data: { oracle: Buffer.from('GSSAPI') } },
  { leg: 'PK1-m3', label: 'the cloud key file', kind: 'file', names: { oracle: ['authentication_oci_client'], mariadb: [] }, data: { oracle: Buffer.from('0123456789abcdef0123456789abcdef') } },
  { leg: 'PK1-m4', label: 'a security key', kind: 'device', names: { oracle: ['authentication_webauthn_client', 'authentication_fido_client'], mariadb: [] }, data: { oracle: Buffer.from('0123456789abcdef0123456789abcdef') } },
  { leg: 'PK1-m5', label: 'a clear-text request', kind: 'word', names: { oracle: ['mysql_clear_password'], mariadb: ['dialog', 'mysql_clear_password'] }, data: { oracle: Buffer.alloc(0), mariadb: Buffer.concat([Buffer.from([0x04]), Buffer.from('Password: ')]) } },
  { leg: 'PK1-m5b', label: 'a clear-text request (the plugin of that name, which N11 says may be linked into the client)', kind: 'word', only: 'mariadb', names: { oracle: [], mariadb: ['mysql_clear_password'] }, data: { mariadb: Buffer.alloc(0) } },
];
const WINDOWS_PLUGIN = { leg: 'PK1-m6', label: 'Windows authentication', kind: 'ntlm', names: { oracle: ['authentication_windows_client'], mariadb: [] }, data: { oracle: Buffer.from('BRIDGE\0') } };

/** The folder a client loads plugins from by default: named by the step, else the first usual place that exists. */
function pluginFolder(name) {
  const named = process.env[name === 'oracle' ? 'BRIDGED_MYSQL_ORACLE_PLUGIN_DIR' : 'BRIDGED_MARIADB_PLUGIN_DIR'];
  const usual = name === 'oracle'
    ? ['/usr/lib/x86_64-linux-gnu/mysql/plugin', '/usr/lib/mysql/plugin', '/usr/lib64/mysql/plugin', '/usr/lib/aarch64-linux-gnu/mysql/plugin']
    : ['/usr/lib/x86_64-linux-gnu/libmariadb3/plugin', '/usr/lib/aarch64-linux-gnu/libmariadb3/plugin', '/usr/lib/mariadb/plugin', '/usr/lib/mysql/plugin'];
  return [named, ...usual].find((folder) => folder !== undefined && folder !== '' && fs.existsSync(folder));
}

const listPlugins = (folder) => (folder === undefined ? [] : fs.readdirSync(folder).filter((file) => /\.(so|dll)$/.test(file)).map((file) => file.replace(/\.(so|dll)$/, '')).sort());

/** The builder's launch for the fake at `port`, then what a leg does to it by hand. */
function launchMysql(ctx, client, port, { entry = 'A', control = false, add = [], home = ctx.home } = {}) {
  const { product } = ctx;
  const built = product.buildDbQueryLaunch('mysql', `mysql://${ctx.user}:${ctx.entryWord}@127.0.0.1:${port}/db`, 'select 1', { bridged: true, absentFile: product.materializedKeyPath(ctx.dir, 'no-client-file') });
  if (built === undefined) {
    throw new Error('buildDbQueryLaunch refused the entry of a PK1 mysql leg that must launch');
  }
  const args = control ? built.args.filter((arg) => !CANDIDATE_FLAG.test(arg)) : [...built.args];
  const at = args.indexOf('--protocol=TCP') + 1;
  args.splice(at, 0, ...add);
  const env = bridgedEnv(product, home, built.env);
  if (entry === 'B') {
    delete env.MYSQL_PWD;
  }
  return { args, env, exe: client.exe };
}

/** One client against one fake that switches it to `pluginName`: what it answered. */
async function observe(ctx, client, plugin, pluginName, options) {
  const fake = await withFakeMysql({ plugin: pluginName, data: plugin.data?.[client.name] ?? Buffer.alloc(0), entryWord: ctx.entryWord, ntlm: plugin.kind === 'ntlm' }, async (port) => {
    const launched = launchMysql(ctx, client, port, options);
    return runClient(ctx.scope, launched.exe, launched.args, launched.env);
  });
  const state = fake.state;
  const first = state.replies[0];
  const said = oneLine(fake.result.stderr, 140);
  return {
    state, said, ended: fake.result.ended, switched: state.switched, answered: first !== undefined,
    offered: first !== undefined && first.length > 0 && first.label !== 'empty',
    lacks: !state.switched ? false : first === undefined && LOAD_FAILURE.test(fake.result.stderr),
    words: first === undefined ? `no answer after the switch to ${pluginName}; the client said ${JSON.stringify(said)}` : `answered with ${first.length} byte(s) (${first.label})${state.ntlm === undefined ? '' : `; the NTLM answer names user ${JSON.stringify(state.ntlm.user)} of ${JSON.stringify(state.ntlm.domain)} on ${JSON.stringify(state.ntlm.workstation)}`}`,
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
  if (client.name === 'oracle') {
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
  if (process.platform === 'win32' && client.name === 'oracle') {
    return []; // no candidate is known for the built-in Windows authentication plugin (spec §S7.5)
  }
  return list;
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
  const pluginName = (plugin.names[client.name] ?? []).find((name) => ctx.present[client.name].includes(name)) ?? plugin.names[client.name]?.[0];
  const tag = `${plugin.leg}-${client.name}`;
  if (plugin.only !== undefined && plugin.only !== client.name) {
    return;
  }
  if (plugin.leg === 'PK1-m5b') {
    record(`${tag}-form`, 'shown', `mysql_clear_password is ${ctx.present[client.name].includes('mysql_clear_password') ? 'a FILE of the client\'s plugin folder (--plugin-dir at the absent path is expected to stop it)' : 'NOT a file of the client\'s plugin folder: it may be linked into the client (N11), and --plugin-dir would not stop it'}`);
  }
  if (pluginName === undefined) {
    unmeasured(tag, `${client.name}'s client has no ${plugin.label} plugin in the parent's list for it (no client build with the plugin)`);
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
      record(`${tag}-${candidate.what.split(' ')[0].replaceAll('-', '')}-${entry}`, 'shown', `${candidate.what}, entry ${entry}: ${seen.offered ? 'IDENTITY OFFERED' : 'identity not offered'}; ${seen.words}`);
      offeredUnder.push({ what: candidate.what, entry, offered: seen.offered });
    }
  }
  const stoppers = candidates.filter((candidate) => offeredUnder.filter((row) => row.what === candidate.what).every((row) => !row.offered)).map((candidate) => candidate.what);
  if (candidates.length === 0) {
    record(`${tag}-decision`, 'shown', 'no candidate control is known for this plugin on this client (spec §S7.5): the pair stays refused');
  } else if (stoppers.length === 0 && offeredUnder.some((row) => row.offered)) {
    stop(`${tag}-decision`, `${plugin.label} is offered under every candidate (parent §7, row PK1: the pair stays refused, Q18)`);
  } else {
    record(`${tag}-decision`, 'shown', `stopped in every leg of it by: ${stoppers.join('; ') || 'nothing was offered under any candidate'}`);
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
  const carrier = ['mysql_clear_password', 'dialog', 'caching_sha2_password'].find((name) => ctx.present[client.name].includes(name));
  if (folder === undefined || carrier === undefined) {
    unmeasured(tag, `no loadable plugin to copy: the client's plugin folder ${folder === undefined ? 'was not found' : 'lists none of mysql_clear_password, dialog, caching_sha2_password'}`);
    return;
  }
  const rigFolder = path.join(ctx.dir, `m7 ${client.name}`);
  const empty = path.join(ctx.dir, `m7 ${client.name} empty`);
  fs.mkdirSync(rigFolder, { recursive: true });
  fs.mkdirSync(empty, { recursive: true });
  const extension = process.platform === 'win32' ? '.dll' : '.so';
  fs.copyFileSync(path.join(folder, `${carrier}${extension}`), path.join(rigFolder, `${carrier}${extension}`));
  const plugin = PLUGINS.find((entry) => entry.leg === 'PK1-m5');
  const flags = ['--enable-cleartext-plugin'];
  let shown = await observe(ctx, client, plugin, carrier, { control: true, add: [`--plugin-dir=${rigFolder}`, ...flags] });
  if (!shown.offered) {
    shown = await observe(ctx, client, plugin, carrier, { control: true, add: [`--plugin-dir=${rigFolder}`] });
  }
  if (!shown.offered) {
    unmeasured(tag, `the control (the copy's folder as --plugin-dir, the plugin named bare) did not load and answer: ${shown.words}`);
    return;
  }
  record(`${tag}-control`, 'shown', `positive control, ${carrier} named bare with the copy's folder as --plugin-dir: ${shown.words}`);
  for (const [where, pluginDir] of [['as launched (the client\'s own plugin folder)', folder], ['with --plugin-dir at an empty folder that exists', empty]]) {
    const steps = path.relative(pluginDir, path.join(rigFolder, carrier)).split(path.sep).join('/');
    for (const [what, name] of [['a name with ../ steps', steps], ['the absolute path', path.join(rigFolder, carrier)]]) {
      const options = where.startsWith('as launched') ? { control: true, add: flags } : { control: true, add: [`--plugin-dir=${empty}`, ...flags] };
      const seen = await observe(ctx, client, plugin, name, options);
      record(`${tag}-${what.startsWith('a name') ? 'dotdot' : 'absolute'}-${where.startsWith('as launched') ? 'default' : 'empty'}`, 'shown', `${what}, ${where}: ${seen.offered ? 'THE COPY WAS OPENED AND ANSWERED' : 'the copy was not opened'}; ${seen.words}`);
      if (seen.offered) {
        stop(tag, `the client followed a path in a plugin name (${what}; N13 says both clients refuse one): a path in the server's plugin name reaches a file of the person's disk`);
      }
    }
  }
}

/** One throwaway key file and configuration for the cloud plugin (R5), under `home`. */
function makeKeyFile(home) {
  const folder = path.join(home, '.oci');
  fs.mkdirSync(folder, { recursive: true });
  rigRun('openssl', ['genrsa', '-out', path.join(folder, 'oci_api_key.pem'), '2048']);
  fs.writeFileSync(path.join(folder, 'config'), ['[DEFAULT]', 'user=ocid1.user.oc1..rigfake', 'fingerprint=00:11:22:33:44:55:66:77:88:99:aa:bb:cc:dd:ee:ff', `key_file=${path.join(folder, 'oci_api_key.pem')}`, 'tenancy=ocid1.tenancy.oc1..rigfake', 'region=rig-test-1', ''].join('\n'));
  return folder;
}

/** PK1-m1 to PK1-m7, and the listed plugins, for each `mysql` client the harness found. `clients` is `[{ name, exe }]`. */
async function mysqlLegs(ctx, clients) {
  const entryWord = throwawayWord();
  const base = { ...ctx, entryWord, user: ctx.realm?.user ?? 'probe', present: {}, folders: {} };
  for (const client of clients) {
    const folder = pluginFolder(client.name);
    base.folders[client.name] = folder;
    base.present[client.name] = listPlugins(folder);
    console.log(`PA1-e ${client.name}: plugin folder ${folder ?? 'NOT FOUND'}; loadable authentication plugins listed: ${base.present[client.name].join(', ') || 'none'}`);
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
  keyFolder.current = ctx.canWriteHome === true ? makeKeyFile(ctx.home) : undefined;
  for (const client of clients) {
    const plugins = process.platform === 'win32' ? [...PLUGINS, WINDOWS_PLUGIN] : PLUGINS;
    for (const plugin of plugins) {
      if (plugin.kind === 'file' && keyFolder.current === undefined) {
        unmeasured(`${plugin.leg}-${client.name}`, 'no throwaway key file was made for this platform (the rig home is the profile only off Windows)');
      } else {
        await pluginLeg(base, client, plugin);
      }
    }
    for (const listed of base.present[client.name].filter((name) => !LISTED_PASSWORD_PLUGINS.has(name) && !PLUGINS.some((plugin) => plugin.names[client.name]?.includes(name)) && name !== WINDOWS_PLUGIN.names.oracle[0])) {
      await pluginLeg(base, client, { leg: `PK1-m8-${listed}`, label: `the listed plugin ${listed}`, kind: 'listed', names: { [client.name]: [listed] }, data: {} });
    }
    await legPath(base, client);
  }
}

module.exports = { mysqlLegs };
