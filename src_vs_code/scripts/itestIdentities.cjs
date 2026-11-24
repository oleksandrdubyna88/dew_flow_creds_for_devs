// The record of identities of a real run (G1, E3.S2; decision 16 of `todo/PLAN_person_roads_pin_host_key.md`, its setup *The identities*
// and *The launch instrument*): what ran, by path, version and SHA-256, and every config text the run handed out, by SHA-256, beside the
// commit of the tree and the answer of `git status --porcelain --untracked-files=no`. A result with no identity beside it is not a result
// of its row, and a run from a tree with a modified tracked file is no run of its commit.
//
// The record is written as `identities.json` in the section's owned folder (it goes with that folder, as every file of the run) and
// printed as ONE line, `identities <json>`, which is what a commit body and `research/module_tests.md` quote. Two kinds of fact stay
// apart: what the run NAMED (the parameters, the helper programs its config lines name) and what the kernel ANSWERED (`/proc/<pid>/exe` of
// each listener and of each process it forked for the master's session). A value that could not be read is `null`, never `0` or `''`.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFile } = require('node:child_process');
const { RUN } = require('./itestSshd.cjs');
const { EXECUTABLE_VARIABLE, CONFIG_VARIABLE } = require('./lib/sshdRun.cjs');

/** The repository root: `scripts/` is one folder below `src_vs_code`. */
const REPO = path.resolve(__dirname, '..', '..');
/** The config texts the run hands out, by file name: each counterpart's, each client's, and the `KnownHostsCommand` that row M8 hands the client by its config (E3.S6, D13). */
const CONFIG_NAMES = new Set(['sshd_config', 'client_config', 'known_hosts_command']);
/** The files a run's own shims are: every `ssh` in a folder named `shim`, at any depth (section 10's, and each leg's of the rows). */
const SHIM_NAME = 'ssh';
/** The lines of the run that name a helper program of sshd. */
const HELPER = /^(SshdSessionPath|SshdAuthPath)\s+(\S+)$/i;

/** The SHA-256 of a file's bytes, or `null`. */
function sha256Of(file) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
}

/** The real path of a file, or `null`. */
function realOf(file) {
  try {
    return fs.realpathSync(file);
  } catch {
    return null;
  }
}

/** What a program printed and its exit, bounded (10 s; the timeout ends it): `{ code, out, error }`. Never rejects. */
function answer(program, args) {
  return new Promise((resolve) => {
    // The PATH lookup of `git` is on purpose, as `ps` of the end of a server: the machine's own.
    execFile(program, args, { timeout: 10_000 }, (error, stdout, stderr) => { // NOSONAR: a CI rig
      resolve({ code: error ? (error.code ?? error.signal) : 0, out: `${stdout}${stderr}`, error: error ? String(error.message) : undefined });
    });
  });
}

/** `git -C <repo> <args>`, trimmed; `null` when git failed. `status` keeps its text whole: empty is the answer of a clean tree. */
async function git(args) {
  const said = await answer('git', ['-C', REPO, ...args]);
  return said.code === 0 ? said.out.replace(/\n$/, '') : null;
}

/** The first line that starts with `OpenSSH_` in what `<program> -V` printed (a version, or the head of a usage text), or `null`. */
async function versionOf(program) {
  const said = await answer(program, ['-V']);
  return said.out.split(/\r?\n/).find((line) => line.startsWith('OpenSSH_')) ?? null;
}

/** Every file under `dir` whose name is one of `names`, as `{ file, sha256 }`, `file` relative to `dir`. */
function filesNamed(dir, names) {
  const found = [];
  const walk = (relative) => {
    for (const entry of fs.readdirSync(path.join(dir, relative), { withFileTypes: true })) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (names.has(entry.name)) found.push({ file: child, sha256: sha256Of(path.join(dir, child)) });
    }
  };
  walk('');
  return found.sort((a, b) => (a.file < b.file ? -1 : 1));
}

/**
 * The JSON files `name` at EVERY depth under `dir`, parsed, each with its counterpart: the folder that holds it, relative to `dir` (`k1`, and
 * `m1/k1` for a counterpart of a leg of the rows, E3.S4): what each counterpart recorded of itself.
 */
function recorded(dir, name) {
  return filesNamed(dir, new Set([name])).map((one) => ({ counterpart: path.dirname(one.file), ...JSON.parse(fs.readFileSync(path.join(dir, one.file), 'utf8')) }));
}

/** `dpkg -S` of a file: the Debian package that holds it, or `null`. */
async function packageOf(file) {
  const said = await answer('dpkg', ['-S', file]);
  const found = said.code === 0 ? /^([^:\s]+)(?::\S+)?: /.exec(said.out) : null;
  return found === null ? null : found[1];
}

/**
 * A program that a leg named in `tool.json` (E3.S5: `ssh-keyscan`, which has no `-V`): its real path, its SHA-256, and the version of the Debian package that holds it
 * (`dpkg -S` of the real path, or of the named one, then `dpkg-query`), with `versionSource: "dpkg"`; or `null` with the reason. Bounded.
 */
async function toolEntry(one) {
  const real = typeof one.path === 'string' ? realOf(one.path) : null;
  const entry = { role: `${one.role}, named by the leg ${one.counterpart}`, path: real ?? one.path ?? null, real, sha256: real === null ? null : sha256Of(real), version: null, versionSource: null, versionReason: null };
  const pkg = real === null ? null : ((await packageOf(real)) ?? (await packageOf(one.path)));
  if (pkg === null) {
    return { ...entry, versionReason: real === null ? 'the path names no file' : 'no Debian package holds the file (dpkg -S)' };
  }
  const said = await answer('dpkg-query', ['-W', '-f', '${Version}', pkg]);
  return said.code === 0 && said.out.trim() !== '' ? { ...entry, package: pkg, version: said.out.trim(), versionSource: 'dpkg' } : { ...entry, package: pkg, versionReason: 'dpkg-query gave no version' };
}

/** The executables of the run: the sshd as named, the helpers its lines name, the programs the kernel answered, the real client. */
async function executablesOf(rig, real) {
  const named = { role: 'sshd, as the run names it', path: RUN.executable, real: realOf(RUN.executable), version: await versionOf(RUN.executable), sha256: sha256Of(RUN.executable) };
  const helpers = RUN.lines.map((line) => HELPER.exec(line)).filter((found) => found !== null)
    .map((found) => ({ role: `${found[1]}, as a line of the run names it`, path: found[2], version: null, sha256: sha256Of(found[2]) }));
  const listeners = recorded(rig.dir, 'program.json').map((one) => ({ role: `the program the listener of ${one.counterpart} ran`, path: one.exe, sha256: one.sha256 }));
  const sessions = recorded(rig.dir, 'session-programs.json').flatMap((one) => one.programs.map((program) => ({ role: `a program the listener of ${one.counterpart} forked for a session`, path: program.exe, sha256: program.sha256 })));
  const client = { role: 'ssh, the real client', path: real, version: await versionOf(real), sha256: sha256Of(real) };
  const tools = await Promise.all(recorded(rig.dir, 'tool.json').map(toolEntry));
  return [named, ...helpers, ...listeners, ...sessions, client, ...tools];
}

/** Every shim of the run, at any depth: each file `ssh` in a folder named `shim`, as `{ file, sha256 }`. */
const shimsOf = (dir) => filesNamed(dir, new Set([SHIM_NAME])).filter((one) => path.basename(path.dirname(one.file)) === 'shim');

/** The record of this run: the tree, the parameters, the executables and the config texts. `real` is the real client's path. */
async function identitiesOf(rig, real) {
  const configs = filesNamed(rig.dir, CONFIG_NAMES);
  const handed = RUN.configFile === undefined ? [] : [{ file: RUN.configFile, sha256: sha256Of(RUN.configFile) }];
  return {
    record: 1,
    commit: await git(['rev-parse', 'HEAD']),
    trackedChanges: await git(['status', '--porcelain', '--untracked-files=no']),
    conventions: await git(['rev-parse', 'HEAD:.agents/conventions']),
    parameters: { [EXECUTABLE_VARIABLE]: process.env[EXECUTABLE_VARIABLE] || null, [CONFIG_VARIABLE]: process.env[CONFIG_VARIABLE] || null },
    executables: await executablesOf(rig, real),
    configs: [...configs, ...handed, ...shimsOf(rig.dir)],
  };
}

const HEX40 = /^[0-9a-f]{40}$/;
const whole = (one) => typeof one.sha256 === 'string' && typeof one.path === 'string';

/** Writes the record into the section's folder, prints it as one line, and checks it. */
async function recordIdentities(check, rig, real) {
  const record = await identitiesOf(rig, real);
  fs.writeFileSync(path.join(rig.dir, 'identities.json'), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`identities ${JSON.stringify(record)}`);
  check('the run is a run of its commit: git status --porcelain --untracked-files=no answered, and it is empty', record.trackedChanges === '', JSON.stringify(record.trackedChanges));
  check('the record names the commit and the pin of the shared rules (git rev-parse HEAD and HEAD:.agents/conventions)', HEX40.test(record.commit ?? '') && HEX40.test(record.conventions ?? ''), JSON.stringify([record.commit, record.conventions]));
  const versions = record.executables.filter((one) => one.role.startsWith('sshd') || one.role.startsWith('ssh,'));
  const listeners = record.executables.filter((one) => one.role.startsWith('the program the listener'));
  check('the record of identities is whole: every executable has its path and SHA-256, the sshd and the client their version, and at least one listener was recorded', record.executables.every(whole) && versions.every((one) => one.version !== null) && listeners.length > 0, JSON.stringify(record.executables));
  check('every config text the run handed out has its SHA-256: each sshd_config, each client_config, the shim and the run\'s config file', record.configs.length >= 2 && record.configs.every((one) => typeof one.sha256 === 'string'), JSON.stringify(record.configs));
  check('every counterpart of the run ran one program: one SHA-256 of /proc/<pid>/exe', new Set(listeners.map((one) => one.sha256)).size === 1, JSON.stringify(listeners));
  // A wrapper that does not `exec` leaves the listener's pid to a shell: the listener-only stop would then end the shell and leave sshd.
  check('every listener ran an sshd itself (its /proc/<pid>/exe ends with /sshd): a wrapper hands over its pid by exec', listeners.length > 0 && listeners.every((one) => /\/sshd$/.test(one.path ?? '')), JSON.stringify(listeners));
  // R7 (E3.S4): the record reads every depth. An independent walk counts the `program.json` files of the section's folder; each is a listener of the record.
  const files = filesNamed(rig.dir, new Set(['program.json'])).length;
  check('every program.json under the section\'s folder is a listener of the record: the walk of the record missed none', files === listeners.length && files > 0, JSON.stringify({ files, listeners: listeners.length }));
  // R8 (E3.S5): every program that a leg named in a `tool.json` is in the record, with its path, SHA-256 and version; an independent walk counts the files.
  const tools = record.executables.filter((one) => one.versionSource !== undefined);
  const named = filesNamed(rig.dir, new Set(['tool.json'])).length;
  check('every tool that a leg named (tool.json) is in the record, with its path, SHA-256 and version', named > 0 && tools.length === named && tools.every((one) => whole(one) && one.version !== null), JSON.stringify({ named, tools }));
  // R9 (E3.S6): the recording command of M8 is a text that the run hands the client by its config; each is in the record with its SHA-256. An independent walk counts the files of that name.
  const commands = filesNamed(rig.dir, new Set(['known_hosts_command'])).length;
  const recorded = record.configs.filter((one) => path.basename(one.file) === 'known_hosts_command');
  check('every known_hosts_command of the run is a config text of the record, with its SHA-256', commands > 0 && recorded.length === commands && recorded.every((one) => typeof one.sha256 === 'string'), JSON.stringify({ commands, recorded }));
  return record;
}

module.exports = { recordIdentities, identitiesOf };
