// The rig of `bridged-ssh-itest.cjs` and `itestBridgedTrust.cjs` (E1.6, parent §7 *The SSH contract*): one owned folder with the keys, a
// storage folder and a home that have a SPACE in their names (so every path of the per-call file is quoted for a reason), the throwaway `sshd`
// runs (a hop on 127.0.0.1, a destination on 127.0.0.2: two legs of one call have two hosts), and the two ways to start a real `ssh`:
//
//   production(...)  the product's own `writeBridgedCall` and `bridgedSpawn` from `out/`, then a spawn of `ssh` with THAT argv, environment and cwd;
//   control(...)     an argv written by hand, under `-F <rig home>/.ssh/config`, to show that this rig can make the bad thing happen.
//
// Every spawn of `ssh` is counted (`rig.spawns`), so "zero spawns" is a number a leg reads. POSIX only.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { execFile, execFileSync } = require('node:child_process');
const { launch, startSshd, endChild } = require('./itestSshd.cjs');
const { ownedDir, shortSocketRoot } = require('./lib/leftovers.cjs');

const OUT = path.join(__dirname, '..', 'out');
const ME = os.userInfo().username;

/** `vscode` as the compiled modules need it at load time: a window that shows nothing. Written once, resolved for the life of the process. */
function withVscodeStub(dir) {
  const stubPath = path.join(dir, 'vscode-stub.cjs');
  fs.writeFileSync(stubPath, 'module.exports = { window: { showWarningMessage: () => Promise.resolve(undefined), showInformationMessage: () => Promise.resolve(undefined) } };');
  const original = Module._resolveFilename;
  Module._resolveFilename = (request, ...rest) => (request === 'vscode' ? stubPath : original.call(Module, request, ...rest));
}

/** The product's own functions, loaded from `out/`. */
function loadProduct(dir) {
  withVscodeStub(dir);
  const call = require(path.join(OUT, 'bridgedSshCall.js'));
  const installer = require(path.join(OUT, 'keyInstaller.js'));
  return { writeBridgedCall: call.writeBridgedCall, bridgedSpawn: call.bridgedSpawn, purge: installer.purgeMaterializedKeys };
}

function keygen(file) {
  return new Promise((resolve) => {
    // The PATH lookup is on purpose: the PATH's `ssh-keygen` is the tool under test (as `itestForwardAgent.cjs` says).
    execFile('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', file], { timeout: 15_000 }, (error, _out, stderr) => { // NOSONAR: a CI rig, the PATH's ssh-keygen is the tool under test
      resolve(error ? String(stderr).trim() || String(error) : undefined);
    });
  });
}

/** `SHA256:...` of a public key file, as `ssh-keygen -lf` prints it (and `sshd -d` logs it). */
function fingerprint(publicFile) {
  return execFileSync('ssh-keygen', ['-lf', publicFile], { encoding: 'utf8' }).split(/\s+/)[1]; // NOSONAR: the PATH's ssh-keygen is the tool under test
}

/** `<algorithm> <base64>` of a public key file: the pin an entry stores. */
const pinOf = (keyFile) => fs.readFileSync(`${keyFile}.pub`, 'utf8').trim().split(/\s+/).slice(0, 2).join(' ');

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** Resolves when `promise` has, or `ms` after this call: the timer does not outlive the race. */
function within(promise, ms, value) {
  let timer;
  const bound = new Promise((resolve) => {
    timer = setTimeout(resolve, ms, value);
  });
  return Promise.race([promise, bound]).finally(() => clearTimeout(timer));
}

/** The rig: keys, folders, the product, the counters. `section` is a scope of the harness; the folder is under the short socket root (a leg holds an agent socket). */
async function makeRig(section, check) {
  const dir = ownedDir(section, 'bridged', { parent: shortSocketRoot() });
  const rig = {
    scope: section, dir, check, spawns: 0, notes: [],
    storageDir: path.join(dir, 'storage dir'),
    home: path.join(dir, 'rig home'),
    key: (name) => path.join(dir, name),
  };
  fs.mkdirSync(rig.storageDir, { recursive: true });
  fs.mkdirSync(path.join(rig.home, '.ssh'), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(rig.home, '.ssh', 'known_hosts'), '# the person\'s own file; no leg of this harness may change it\n');
  rig.personFile = path.join(rig.home, '.ssh', 'known_hosts');
  rig.personHash = sha(rig.personFile);
  rig.control = path.join(rig.home, '.ssh', 'config');
  rig.product = loadProduct(dir);
  for (const name of ['host_hop', 'host_dest', 'host_other', 'hop_key', 'dest_key', 'other_key']) {
    const failed = await keygen(rig.key(name));
    check(`the throwaway key ${name} was generated`, failed === undefined, failed);
  }
  fs.writeFileSync(rig.key('authorized_hop'), fs.readFileSync(rig.key('hop_key.pub'), 'utf8'));
  fs.writeFileSync(rig.key('authorized_dest'), fs.readFileSync(rig.key('dest_key.pub'), 'utf8'));
  fs.writeFileSync(rig.key('askpass.sh'), `#!/bin/sh\nprintf '%s\\n' "$1" >> "${rig.key('askpass.log')}"\nprintf 'not-the-password\\n'\n`, { mode: 0o700 });
  rig.base = { storageDir: rig.storageDir, home: rig.home, platform: process.platform, note: (message) => void rig.notes.push(message) };
  return rig;
}

/** One `sshd -d` for `name`, in a folder of its own with no space in its name (`startSshd` writes its paths with no quotes). */
async function sshd(rig, name, { hostKey, authorized, address = '127.0.0.1', port, first, extra = [] }) {
  const dir = path.join(rig.dir, `sshd-${name}`);
  fs.mkdirSync(dir, { recursive: true });
  const started = await startSshd(rig.scope, dir, rig.key(hostKey), rig.key(authorized), extra, { address, port, first });
  return started.failure === undefined ? { ...started, hostKeyFile: rig.key(hostKey) } : started;
}

/** A hop on 127.0.0.1 and a destination on 127.0.0.2, each on its own `sshd -d` (each serves ONE connection). */
async function pair(rig, name, options = {}) {
  const hop = await sshd(rig, `${name}-hop`, { hostKey: 'host_hop', authorized: 'authorized_hop', ...options.hop });
  const destination = await sshd(rig, `${name}-dest`, { hostKey: 'host_dest', authorized: 'authorized_dest', address: '127.0.0.2', ...options.destination });
  const failure = hop.failure ?? destination.failure;
  rig.check(`the sshd pair "${name}" started`, failure === undefined, failure);
  return {
    hop, destination, failure,
    close: async () => {
      await endChild(destination.sshd);
      await endChild(hop.sshd);
    },
  };
}

const entry = (id, extra) => ({ id, name: id, kind: 'ssh', isSshEnabled: true, user: ME, ...extra });
/** A hop entry on a started sshd; pinned with the sshd's host key when `pin` is given. */
const hopEntry = (started, extra = {}) => entry('hop', { name: 'the hop', host: '127.0.0.1', port: started.port, ...extra });
const destinationEntry = (started, extra = {}) => entry('dest', { name: 'the destination', host: '127.0.0.2', port: started.port, jumpHostEntityId: 'hop', ...extra });
const storedKeyOf = (rig, name) => ({ kind: 'storedKey', keyEntityId: 'k', content: fs.readFileSync(rig.key(name), 'utf8') });

/** The three outcomes of one `ssh` child: its exit code (or `timeout`), its output after the pipes closed, and its stderr. */
async function finishClient(client) {
  const code = await within(client.done, 25_000, 'timeout');
  await within(client.closed, 2000);
  const result = { code, stdout: client.stdout, stderr: client.stderr };
  await endChild(client);
  return result;
}

/**
 * The production road: `writeBridgedCall`, `bridgedSpawn`, then a real `ssh` with that argv, environment and cwd. `destination.keyPath`
 * is the `-i` path (the entry's key as a typed path). Answers `{ refused }` when the writer or the argv rules stopped the call (no spawn), else
 * the child's result with the argv, the text of `c.conf` as it was while the child ran, and the journal sentences of first contact.
 */
async function production(rig, call) {
  const { destination, hops = [], auth = 'key', keyPath, command = 'true', askpassEnv = {}, sourceEnv = process.env, extraEnv = {}, extraArgs = [] } = call;
  const files = rig.product.writeBridgedCall(rig.base, { destination, auth, keyPath, hops });
  if (!files.ok) {
    return { refused: files };
  }
  const spawn = rig.product.bridgedSpawn({ destination, keyPath, auth, askpassEnv, remoteCommand: command, files, sourceEnv, platform: process.platform });
  if (spawn === undefined) {
    files.remove();
    return { refused: { ok: false, code: 'no_credential', reason: 'the argv rules refused' } };
  }
  const conf = fs.readFileSync(path.join(spawn.cwd, 'c.conf'), 'utf8');
  try {
    rig.spawns += 1;
    const client = launch(rig.scope, 'ssh', [...extraArgs, ...spawn.argv], { cwd: spawn.cwd, env: { ...spawn.env, ...extraEnv } });
    const result = await finishClient(client);
    return { ...result, argv: spawn.argv, env: spawn.env, conf, files, first: files.afterRun() };
  } finally {
    files.remove();
  }
}

/** A real `ssh` with an argv written by hand, under `-F <rig home>/.ssh/config` unless the argv says another; counted. */
async function control(rig, argv, options = {}) {
  rig.spawns += 1;
  const client = launch(rig.scope, 'ssh', argv, { cwd: rig.dir, env: options.env ?? { ...process.env } });
  return finishClient(client);
}

/** Whether the sshd saw a connection at all, and whether it accepted a key whose fingerprint is `fp`. */
const sawConnection = (started) => /Connection from 127\.0\.0\.\d/.test(started.sshd.stderr);
const accepted = (started, fp) => started.sshd.stderr.includes(`Accepted publickey`) && started.sshd.stderr.includes(fp);
const tail = (started) => started.sshd.stderr.trim().split(/\r?\n/).slice(-12).join('\n');

module.exports = { ME, OUT, makeRig, pair, sshd, production, control, keygen, fingerprint, pinOf, sha, within, entry, hopEntry, destinationEntry, storedKeyOf, sawConnection, accepted, tail };
