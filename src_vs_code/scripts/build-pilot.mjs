// The Remote Bridge pilot (change 11.1, S5; the plan's E2.4): one folder with everything the owner's check needs, built from ONE
// committed state of this branch. It is never released and never published: the switch stays off in the source.
//
//   node scripts/build-pilot.mjs --out <folder outside the repository> [--rid linux-x64]
//
// The folder gets:
//   creds-for-devs-<version>-bridge-pilot-<sha>.vsix   the shipped bundle with the switch ON and `onStartupFinished` (lib/pilotBuild.cjs)
//   <rid>/creds, <rid>/creds-mcp, <rid>/SHA256SUMS     the clients of this commit (Native AOT), version <released>-pilot.<sha>
//   <rid>/creds-pilot.sh                               install / status / undo on the server (scripts/pilot/creds-pilot.sh)
//   SHA256SUMS                                         of the VSIX
// It refuses a work tree with changes: the pilot must be one commit, named in its file names.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { switchOn, pilotManifest, pilotVersion, pilotVsixName } = require('./lib/pilotBuild.cjs');

const EXTENSION = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(EXTENSION, '..');
/** Top-level entries of the extension folder that are never in the VSIX (`.vscodeignore`) and are not copied to the stage. */
const NOT_STAGED = new Set(['node_modules', 'out', 'src', 'scripts', 'dist']);

function argsOf(argv) {
  const at = (flag) => {
    const i = argv.indexOf(flag);
    return i < 0 ? undefined : argv[i + 1];
  };
  const out = at('--out');
  if (out === undefined) {
    throw new Error('usage: node scripts/build-pilot.mjs --out <folder outside the repository> [--rid linux-x64]');
  }
  return { out: path.resolve(out), rid: at('--rid') ?? 'linux-x64' };
}

/** Runs a program with an argument list (no shell); throws with its output when it does not end with 0. */
function run(program, args, cwd) {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`${program} ${args.join(' ')} ended with ${result.status ?? result.signal}\n${(result.stdout ?? '').slice(-3000)}${(result.stderr ?? '').slice(-3000)}`);
  }
  return result.stdout;
}

/** A working folder of the build inside `out` (never a temp path: the repository's guard, S2.1), emptied first; the caller removes it. */
function freshFolder(out, name) {
  const folder = path.join(out, name);
  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(folder);
  return folder;
}

const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sumsOf = (folder, names) => names.map((name) => `${sha256(path.join(folder, name))}  ${name}\n`).join('');

function committedState() {
  const dirty = run('git', ['status', '--porcelain', '--untracked-files=no'], REPO).trim();
  if (dirty !== '') {
    throw new Error(`the work tree has changes; the pilot is built from a commit only:\n${dirty}`);
  }
  return run('git', ['rev-parse', 'HEAD'], REPO).trim();
}

/** The VSIX: bundle, stage a copy, switch on in the copy, package the copy. The extension folder itself is not changed. */
function buildVsix(out, sha) {
  run('npm', ['run', 'bundle'], EXTENSION);
  const stage = freshFolder(out, '.stage');
  try {
    for (const entry of fs.readdirSync(EXTENSION)) {
      if (!NOT_STAGED.has(entry)) {
        fs.cpSync(path.join(EXTENSION, entry), path.join(stage, entry), { recursive: true });
      }
    }
    fs.mkdirSync(path.join(stage, 'dist'));
    for (const file of fs.readdirSync(path.join(EXTENSION, 'dist')).filter((name) => name.endsWith('.js'))) {
      const text = fs.readFileSync(path.join(EXTENSION, 'dist', file), 'utf8');
      fs.writeFileSync(path.join(stage, 'dist', file), file === 'extension.js' ? switchOn(text) : text);
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(EXTENSION, 'package.json'), 'utf8'));
    fs.writeFileSync(path.join(stage, 'package.json'), `${JSON.stringify(pilotManifest(manifest), null, 2)}\n`);
    const vsix = path.join(out, pilotVsixName(manifest.version, sha));
    run(path.join(EXTENSION, 'node_modules', '.bin', 'vsce'), ['package', '--no-dependencies', '--out', vsix], stage);
    return vsix;
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

/** The two clients for `rid`, each with the released version marked as this commit's pilot, and the server script beside them. */
function buildClients(out, rid, sha) {
  const released = JSON.parse(fs.readFileSync(path.join(REPO, '.release-please-manifest.json'), 'utf8'));
  const folder = path.join(out, rid);
  fs.mkdirSync(folder, { recursive: true });
  const clients = [
    { project: 'src_cli/src/CredsCli.csproj', name: 'creds', version: pilotVersion(released.src_cli, sha) },
    { project: 'src_mcp/src/CredsMcp.csproj', name: 'creds-mcp', version: pilotVersion(released.src_mcp, sha) },
  ];
  for (const client of clients) {
    const publish = freshFolder(out, `.publish-${client.name}`);
    try {
      run('dotnet', ['publish', path.join(REPO, client.project), '-c', 'Release', '-r', rid, '-o', publish, `-p:Version=${client.version}`, '-m:4'], REPO);
      fs.copyFileSync(path.join(publish, client.name), path.join(folder, client.name));
      fs.chmodSync(path.join(folder, client.name), 0o755);
    } finally {
      fs.rmSync(publish, { recursive: true, force: true });
    }
  }
  fs.copyFileSync(path.join(EXTENSION, 'scripts', 'pilot', 'creds-pilot.sh'), path.join(folder, 'creds-pilot.sh'));
  fs.writeFileSync(path.join(folder, 'SHA256SUMS'), sumsOf(folder, ['creds', 'creds-mcp', 'creds-pilot.sh']));
  return { folder, clients };
}

function main() {
  const { out, rid } = argsOf(process.argv.slice(2));
  if (out === REPO || out.startsWith(`${REPO}${path.sep}`)) {
    throw new Error(`--out must be outside the repository: ${out}`);
  }
  const sha = committedState();
  fs.mkdirSync(out, { recursive: true });
  const vsix = buildVsix(out, sha);
  fs.writeFileSync(path.join(out, 'SHA256SUMS'), sumsOf(out, [path.basename(vsix)]));
  const { folder, clients } = buildClients(out, rid, sha);
  if (rid === `${process.platform}-${process.arch === 'x64' ? 'x64' : process.arch}`) {
    run(path.join(folder, 'creds'), ['--help'], folder); // a binary that cannot answer --help did not really build
  }
  console.log(`pilot of ${sha}:\n  ${vsix}\n${clients.map((c) => `  ${path.join(folder, c.name)} (${c.version})`).join('\n')}\n  ${path.join(folder, 'creds-pilot.sh')}`);
}

try {
  main();
} catch (error) {
  console.error(`build-pilot: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
