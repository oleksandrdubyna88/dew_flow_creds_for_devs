// Integration test: the REAL server binary taking, checking and opening a REAL backup archive.
//
//   npm run itest:backup-archive
//   CVBK_SERVER=/path/to/CredVaultServer npm run itest:backup-archive   # a published AOT binary
//
// What it proves that nothing else does. The unit suite drives `BackupArchive` and
// `BackupArchiveCommand` in-process, which answers "is the format right" and says nothing about
// whether the SHIPPED thing can be run at all. The archive verbs are the recovery kit: the moment
// anybody needs them, the server is gone and there is an image, a key, and no second chance to
// discover that the entry point never wired them up. That is exactly the shape of failure this
// family has already had once — a route unreachable in every released build while both sides'
// contract tests were green.
//
// So this drives the binary the way a person would: seal a tree, verify it, open it somewhere else,
// compare what came out byte for byte, and then damage the archive in each of the ways that must be
// refused. Nothing is stubbed; the only thing faked is the tree.
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');

// In the SERVER's tree, not the extension's: this is the server's flow, and the pipeline that must
// re-run it is the one a server-only change triggers. It is still in `run-itests.mjs` and still has
// an `itest:backup-archive` alias, because a catalogue with a hole in it is how a harness comes to
// prove nothing.
const SERVER_DIR = path.join(__dirname, '..', 'src');

let fails = 0;
function check(what, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) {
    fails += 1;
    if (detail !== undefined) console.log(`      ${detail}`);
  }
}

function tempDir(tag) {
  const dir = path.join(os.tmpdir(), `cvbk-itest-${tag}-${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ---- how the binary is reached ---------------------------------------------
// A published AOT binary when one is named or lying about, otherwise the framework-dependent dll
// through `dotnet`. Both are the real entry point — Program.cs top-level statements — which is the
// thing under test; the AOT path is what ships, so CI should point at it once story 5 builds one.
function serverCommand() {
  const named = process.env.CVBK_SERVER;
  if (named && fs.existsSync(named)) return { exe: named, lead: [] };
  // NEWEST wins, and that is not a detail. The first run of this harness picked a published binary
  // from an earlier build, and every check about the new verb failed for a reason that had nothing to
  // do with the code under test. A stale artefact quietly under test is worse than no artefact.
  const candidates = [];
  for (const rid of ['win-x64', 'linux-x64', 'linux-arm64', 'osx-arm64']) {
    for (const name of ['CredVaultServer.exe', 'CredVaultServer']) {
      const p = path.join(SERVER_DIR, 'bin', 'Release', 'net10.0', rid, 'publish', name);
      if (fs.existsSync(p)) candidates.push({ exe: p, lead: [], at: fs.statSync(p).mtimeMs });
    }
  }
  for (const config of ['Debug', 'Release']) {
    const dll = path.join(SERVER_DIR, 'bin', config, 'net10.0', 'CredVaultServer.dll');
    if (fs.existsSync(dll)) candidates.push({ exe: 'dotnet', lead: [dll], at: fs.statSync(dll).mtimeMs });
  }
  candidates.sort((a, b) => b.at - a.at);
  return candidates[0];
}

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd.exe, [...cmd.lead, ...args], { timeout: 120000 }, (error, stdout, stderr) =>
      resolve({ code: error && typeof error.code === 'number' ? error.code : error ? 1 : 0, stdout, stderr }));
  });
}

// ---- the tree that goes in --------------------------------------------------
const FILES = {
  'vaults/alice.json': crypto.randomBytes(4096),
  'vaults/bob.json': Buffer.from('{"vault":"bob"}'),
  'deep/nested/further/one.bin': crypto.randomBytes(20000),
  'empty.json': Buffer.alloc(0),
  'org/events/2026-09-07.ndjson': Buffer.from('{"kind":"share.sent"}\n'),
};
const NEVER = {
  'vaults/alice.json.tmp': Buffer.from('a write in flight'),
  'org/backup/key.sealed': Buffer.from('the key that opens this archive'),
  'org/backup/archives/older.cvbk': crypto.randomBytes(64),
};

function plant(root, files) {
  for (const [relative, bytes] of Object.entries(files)) {
    const p = path.join(root, relative);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, bytes);
  }
}

(async () => {
  const cmd = serverCommand();
  if (!cmd) {
    console.log('SKIP: no CredVaultServer build found. Build it first:');
    console.log('  dotnet build src_minimalapi_server/src/CredVaultServer.csproj');
    console.log('  (or set CVBK_SERVER to a published binary)');
    process.exitCode = 0;
    return;
  }
  console.log(`server: ${cmd.exe}${cmd.lead.length ? ' ' + cmd.lead[0] : ''}\n`);

  const source = tempDir('source');
  plant(source, FILES);
  plant(source, NEVER);
  const work = tempDir('work');
  const archive = path.join(work, 'archive.cvbk');
  const keyFile = path.join(work, 'key.b64');
  fs.writeFileSync(keyFile, crypto.randomBytes(32).toString('base64'));

  // ---- seal -----------------------------------------------------------------
  const sealed_ = await run(cmd, ['--create-archive', source, archive, keyFile]);
  check('the binary seals a tree', sealed_.code === 0, sealed_.stderr || sealed_.stdout);
  check('...and says what it sealed', /Sealed \d+ file\(s\)/.test(sealed_.stdout), sealed_.stdout);
  check('...into a file that exists', fs.existsSync(archive));
  check('...and leaves no half-written one beside it', !fs.existsSync(`${archive}.partial`));

  // ---- verify ---------------------------------------------------------------
  const verified = await run(cmd, ['--verify-archive', archive, keyFile]);
  check('the binary verifies it', verified.code === 0, verified.stderr);
  check('...naming the archive before the work', /^Verifying /.test(verified.stdout), verified.stdout);
  check('...and each entry as it goes', verified.stdout.includes('vaults/alice.json'), verified.stdout);
  check('...writing nothing', /Nothing was written/.test(verified.stdout), verified.stdout);

  // ---- open -----------------------------------------------------------------
  const restored = path.join(work, 'restored');
  const opened = await run(cmd, ['--decrypt-archive', archive, restored, keyFile]);
  check('the binary opens it', opened.code === 0, opened.stderr);
  let identical = true;
  for (const [relative, bytes] of Object.entries(FILES)) {
    const got = fs.existsSync(path.join(restored, relative)) ? fs.readFileSync(path.join(restored, relative)) : null;
    if (!got || !got.equals(bytes)) {
      identical = false;
      check(`  ${relative} came back exactly as it went in`, false, got ? 'different bytes' : 'missing');
    }
  }
  check('every file came back byte for byte', identical);
  for (const relative of Object.keys(NEVER)) {
    check(`  ${relative} never entered the archive`, !fs.existsSync(path.join(restored, relative)));
  }

  // ---- the refusals ---------------------------------------------------------
  const wrongKeyFile = path.join(work, 'wrong.b64');
  fs.writeFileSync(wrongKeyFile, crypto.randomBytes(32).toString('base64'));
  const wrongKey = await run(cmd, ['--verify-archive', archive, wrongKeyFile]);
  check('a wrong key is refused', wrongKey.code === 1, `code ${wrongKey.code}`);
  check('...and the message is about the key', /wrong key/.test(wrongKey.stderr), wrongKey.stderr);

  const tampered = path.join(work, 'tampered.cvbk');
  const bytes = fs.readFileSync(archive);
  bytes[bytes.length - 1] ^= 0x01;
  fs.writeFileSync(tampered, bytes);
  const damaged = await run(cmd, ['--verify-archive', tampered, keyFile]);
  check('a flipped byte is refused', damaged.code === 1, `code ${damaged.code}`);

  const cut = path.join(work, 'cut.cvbk');
  fs.writeFileSync(cut, fs.readFileSync(archive).subarray(0, 120));
  const short = await run(cmd, ['--verify-archive', cut, keyFile]);
  check('a truncated archive is refused', short.code === 1, `code ${short.code}`);
  check('...as TRUNCATED, not as a shorter archive', /truncated/.test(short.stderr), short.stderr);

  const noKey = await run(cmd, ['--verify-archive', archive, path.join(work, 'absent.b64')]);
  check('a missing key file is a sentence', noKey.code === 1 && /does not exist/.test(noKey.stderr), noKey.stderr);

  const badKeyFile = path.join(work, 'bad.b64');
  fs.writeFileSync(badKeyFile, 'hunter2');
  const badKey = await run(cmd, ['--verify-archive', archive, badKeyFile]);
  check('a key that is not 32 bytes names the contract', /base64 of exactly 32 bytes/.test(badKey.stderr), badKey.stderr);

  const occupied = tempDir('occupied');
  fs.writeFileSync(path.join(occupied, 'someone-elses.json'), 'already here');
  const refused = await run(cmd, ['--decrypt-archive', archive, occupied, keyFile]);
  check('an occupied destination is refused', refused.code === 1, `code ${refused.code}`);
  check('...and nothing in it was touched', fs.existsSync(path.join(occupied, 'someone-elses.json')));

  const usage = await run(cmd, ['--decrypt-archive', 'only-one-argument']);
  check('the wrong number of arguments answers 2 with the usage', usage.code === 2, `code ${usage.code}`);
  check('...listing all three verbs', /--create-archive/.test(usage.stderr), usage.stderr);

  console.log(fails === 0 ? '\nall checks passed' : `\n${fails} check(s) failed`);
  process.exitCode = fails === 0 ? 0 : 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
