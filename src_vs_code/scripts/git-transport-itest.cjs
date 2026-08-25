// Integration test: drives the compiled GitTransport against a REAL local bare repository.
//
//   npm run compile && node scripts/git-transport-itest.cjs
//
// No network and no hosting account: `git init --bare` in a temp directory is a complete git
// remote, so clone / fetch / commit / push / convergence are exercised for real. What this
// proves that the unit tests cannot: that the argv actually works against git, and that a
// second machine sees what the first pushed and converges on it.
//
// The rejected-push path is NOT forced here. `writeVault` always fetches first, so producing a
// non-fast-forward through the public API would mean racing two pushes inside one millisecond —
// a flaky test for a path already covered exactly: classifyGitError has a unit test on git's own
// rejection text, and the retry loop in rewriteShares has one on the retry behaviour.
//
// Skips itself, loudly, when `git` is missing: a test that quietly passes without the thing it
// tests is worse than one that says why it did nothing.
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFile, execFileSync } = require('child_process');
const Module = require('module');

const stub = path.join(os.tmpdir(), 'creds-git-vscode-stub.cjs');
fs.writeFileSync(
  stub,
  'module.exports = { workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }, Uri: { file: (p) => ({ fsPath: p }) } };',
);
const orig = Module._resolveFilename;
Module._resolveFilename = (req, ...a) => (req === 'vscode' ? stub : orig.call(Module, req, ...a));

const OUT = path.join(__dirname, '..', 'out');
const { GitTransport } = require(path.join(OUT, 'gitTransport.js'));
const { VAULT_BRANCH } = require(path.join(OUT, 'gitRemote.js'));

try {
  execFileSync('git', ['--version'], { stdio: 'ignore' });
} catch {
  console.log('SKIP  git is not on PATH — this transport requires it, so nothing was tested.');
  process.exit(0);
}

let fails = 0;
const check = (what, ok, extra) => {
  console.log(`${ok ? '  ok' : 'FAIL'}  ${what}${ok || extra === undefined ? '' : `  (${extra})`}`);
  if (!ok) fails += 1;
};

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-git-itest-'));
const bare = path.join(root, 'origin.git');
execFileSync('git', ['init', '--bare', '--initial-branch', VAULT_BRANCH, bare], { stdio: 'ignore' });

const ACCOUNT = { accountId: 'acct-11112222', email: 'alice@example.com', provider: 'microsoft' };

const run = (args, options) =>
  new Promise((resolve) => {
    execFile('git', args, { cwd: options.cwd, env: options.env }, (error, stdout, stderr) => {
      resolve({
        exitCode: error && typeof error.code === 'number' ? error.code : error ? 1 : 0,
        stdout: String(stdout),
        stderr: String(stderr),
      });
    });
  });

/** One "machine": its own clone root, the same bare origin. */
function machine(name) {
  return new GitTransport(
    bare,
    { url: bare, scheme: 'ssh' },
    path.join(root, name),
    run,
    async () => ({ kind: 'inherit' }),
    () => [ACCOUNT],
  );
}

function envelope(marker) {
  return JSON.stringify(
    {
      format: 'cred-ssh-manager-backup',
      version: 3,
      kdf: 'hkdf',
      account: ACCOUNT,
      salt: 'c2FsdA==',
      iv: 'aXY=',
      tag: 'dGFn',
      data: Buffer.from(marker).toString('base64'),
    },
    null,
    2,
  );
}

(async () => {
  const a = machine('machine-a');
  const b = machine('machine-b');

  check('an empty repository reads as nothing, not as an error', (await a.readVault(ACCOUNT)) === undefined);

  await a.writeVault(ACCOUNT, envelope('one'));
  check('the first write publishes the branch and reads back', (await a.readVault(ACCOUNT)) === envelope('one'));

  const bRead = await b.readVault(ACCOUNT);
  check('a second machine reads what the first pushed', bRead === envelope('one'));

  // The convergence property the whole transport rests on: the clone is a cache, so whatever
  // the remote says now is what a read returns — a stale local copy can never win.
  await b.writeVault(ACCOUNT, envelope('from-b'));
  check('the other machine converges on the newer remote content', (await a.readVault(ACCOUNT)) === envelope('from-b'));

  // An unchanged write must not produce an empty commit on every sync cycle — that is what
  // would turn a 5-minute timer into an ever-growing log.
  const before = commitCount();
  await a.writeVault(ACCOUNT, envelope('from-b'));
  check('writing identical content adds no commit', commitCount() === before, `${before} -> ${commitCount()}`);

  const team = await a.listTeam([ACCOUNT]);
  check(
    'the vault owner is discovered from the envelope in the repository',
    team.length === 1 && team[0].isSelf === true && team[0].account.email === ACCOUNT.email,
    JSON.stringify(team.map((t) => t.account.email)),
  );

  await a.deleteVault(ACCOUNT);
  check('a deleted vault is absent from a fresh clone', (await machine('machine-c').readVault(ACCOUNT)) === undefined);

  fs.rmSync(root, { recursive: true, force: true });
  console.log(fails === 0 ? '\nall checks passed' : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

function commitCount() {
  return Number(
    execFileSync('git', ['rev-list', '--count', VAULT_BRANCH], { cwd: bare, encoding: 'utf8' }).trim(),
  );
}
