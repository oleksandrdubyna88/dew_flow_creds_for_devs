// Every scenario harness this platform can run, in one command, with exit codes captured.
//
//   npm run itest:all
//
// Why this exists: a reviewer asked for it and was right. The harnesses were run by whoever
// remembered them, one at a time, and on 2026-09-06 one of them turned out to have been unable to
// START for long enough that git history was the only way to date it. A person running nine
// commands by hand can miss a crash among the passes; a runner that collects exit codes cannot.
//
// It does NOT replace CI. Four of these cannot run on the Ubuntu runner and the reasons are in
// research/module_tests.md — this is the command for the machine that can run them.
//
// Nothing here is skipped silently: a harness whose prerequisites are missing prints its own SKIP
// line with the command that fixes it, and that is reported as a skip rather than a pass.
import { spawnSync } from 'node:child_process';
import { platform } from 'node:process';

/** Every harness, with what it needs. `windows` means it is meaningless anywhere else. */
const HARNESSES = [
  { name: 'agent', needs: 'nothing', windows: false },
  { name: 'git', needs: 'git', windows: false },
  { name: 'cli', needs: 'the .NET CLI built — dotnet build src_cli/src/CredsCli.csproj', windows: false },
  { name: 'mcp', needs: 'creds-mcp built — dotnet build src_mcp/src/CredsMcp.csproj', windows: false },
  { name: 'masked-run', needs: 'nothing', windows: false },
  { name: 'ssh-agent', needs: 'OpenSSH; its subject is the Windows named-pipe path', windows: true },
  { name: 'mcp-wsl', needs: 'a WSL distribution with the .NET SDK inside it', windows: true },
  { name: 'wsl-relay', needs: 'a WSL distribution with the .NET SDK inside it', windows: true },
  // Deliberately last and deliberately expected to fail without a server: it is the one harness
  // CI states a reason for, and the only way to run it is to start the server first.
  { name: 'server', needs: 'a running Cred Vault Server on 127.0.0.1:5113 with the Local auth scheme', windows: false },
];

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const wanted = HARNESSES.filter((h) => only.length === 0 || only.includes(h.name));
const results = [];

for (const harness of wanted) {
  if (harness.windows && platform !== 'win32') {
    results.push({ ...harness, state: 'not-here', detail: `Windows only — ${harness.needs}` });
    continue;
  }
  process.stdout.write(`\n===== itest:${harness.name} =====\n`);
  const run = spawnSync('npm', ['run', `itest:${harness.name}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    encoding: 'utf8',
  });
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  process.stdout.write(output);
  const skipped = /^SKIP —/m.test(output);
  results.push({
    ...harness,
    state: skipped ? 'skipped' : run.status === 0 ? 'pass' : 'FAIL',
    detail: skipped ? (output.match(/^SKIP — (.*)$/m) ?? [])[1] ?? '' : `exit ${run.status}`,
  });
}

process.stdout.write('\n===== summary =====\n');
for (const r of results) {
  process.stdout.write(`${r.state.padEnd(9)} itest:${r.name.padEnd(12)} ${r.detail}\n`);
}
const failed = results.filter((r) => r.state === 'FAIL');
process.stdout.write(
  failed.length === 0
    ? `\n${results.filter((r) => r.state === 'pass').length} passed, ` +
        `${results.filter((r) => r.state === 'skipped').length} skipped, ` +
        `${results.filter((r) => r.state === 'not-here').length} not runnable here\n`
    : `\n${failed.length} harness(es) FAILED: ${failed.map((r) => r.name).join(', ')}\n`,
);
process.exit(failed.length === 0 ? 0 : 1);
