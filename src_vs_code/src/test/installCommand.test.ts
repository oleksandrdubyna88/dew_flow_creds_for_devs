import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RELEASES_REPO, bashInstall, installScript, powershellInstall } from '../installCommand';

// The scripts are text this extension hands to a terminal somewhere else. Both were RUN against
// the real API before any of this was written — the bash one installed a working binary into a
// sandboxed HOME and printed `creds-0.1.0-linux-x64.tar.gz: OK` from `sha256sum -c`; the
// PowerShell one installed and verified too, and running it is what found the em dash below.

const both = [
  ['bash', bashInstall],
  ['powershell', powershellInstall],
] as const;

for (const [name, build] of both) {
  test(`${name}: no version is baked in — it resolves the newest release when it RUNS`, () => {
    // A script with a version in it is correct the day it is copied and wrong afterwards, and the
    // person pasting it cannot tell which.
    const script = build('creds');

    assert.doesNotMatch(script, /\d+\.\d+\.\d+/, 'no version literal anywhere');
    assert.match(script, /releases\?per_page=100/, 'it asks the API');
  });

  test(`${name}: it does not ask GitHub for "latest", which is the wrong release here`, () => {
    // Checked 2026-08-27: /releases/latest was server-v0.3.1, whose assets include
    // cred-vault-server-0.3.1-win-x64.zip — a loose match would install the SERVER as `creds`.
    assert.doesNotMatch(build('creds'), /releases\/latest/);
  });

  test(`${name}: the pattern cannot pick another binary's archive`, () => {
    // `creds-` then a DIGIT is what separates the CLI from `creds-mcp-`, and neither matches
    // `cred-vault-server-`. The needles are BUILT rather than written, because a backslash in a
    // source file is one editing hop away from becoming something else.
    const backslash = String.fromCharCode(92);
    const cli = build('creds');
    const mcp = build('creds-mcp');

    assert.ok(cli.includes('creds-[0-9]') || cli.includes(`creds-${backslash}d`), cli);
    assert.ok(mcp.includes('creds-mcp-[0-9]') || mcp.includes(`creds-mcp-${backslash}d`), mcp);
    assert.doesNotMatch(cli, /creds-mcp/);
  });

  test(`${name}: the download is verified, not just fetched`, () => {
    // This tool holds credentials. An unverified download is not a detail.
    assert.match(build('creds'), /sha256/i);
  });

  test(`${name}: it is pure ASCII, because it is pasted into someone else's shell`, () => {
    // Found by running it: an em dash in the final message made PowerShell 5.1 report "the string
    // is missing the terminator" — it reads a .ps1 as ANSI unless there is a BOM, and a clipboard
    // carries none.
    const odd = [...build('creds')].filter((c) => c.charCodeAt(0) > 126);

    assert.deepEqual(odd, [], `non-ASCII characters: ${JSON.stringify(odd.join(''))}`);
  });

  test(`${name}: a missing release is reported in words, not as a crash`, () => {
    // There is no `mcp-v*` tag yet, so this is today's ordinary answer for creds-mcp.
    assert.match(build('creds-mcp'), /has been published yet/);
  });

  test(`${name}: it installs without asking for root or elevation`, () => {
    assert.doesNotMatch(build('creds'), /sudo|RunAs|Administrator/);
  });
}

test('both scripts name the same public repository', () => {
  assert.equal(RELEASES_REPO, 'oleksandrdubyna88/dew_flow_creds_for_devs');
  assert.match(bashInstall('creds'), new RegExp(RELEASES_REPO));
  assert.match(powershellInstall('creds'), new RegExp(RELEASES_REPO));
});

// --- choosing the machine: arm and amd, Windows and Linux -----------------------------------

test('all four builds the release workflow makes are reachable', () => {
  // The workflow builds exactly these four RIDs. A picker that offered three of them would leave
  // someone with an arm laptop running a script for x64.
  const cases = [
    { machine: { os: 'windows', rid: 'win-x64' } as const, expect: "rid = 'win-x64'" },
    { machine: { os: 'windows', rid: 'win-arm64' } as const, expect: "rid = 'win-arm64'" },
    { machine: { os: 'linux', rid: 'linux-x64' } as const, expect: 'rid=linux-x64' },
    { machine: { os: 'linux', rid: 'linux-arm64' } as const, expect: 'rid=linux-arm64' },
  ];

  for (const { machine, expect } of cases) {
    for (const target of ['creds', 'creds-mcp'] as const) {
      const script = installScript(target, machine);

      assert.ok(script.includes(expect), `${target} on ${machine.rid}: ${script}`);
      assert.ok(script.includes(target), `${target} on ${machine.rid} must name its own binary`);
    }
  }
});

test('without a pinned architecture it works one out where it RUNS', () => {
  // The safer default, and why it stays the recommended choice: the script is ON the machine it
  // installs to, and knows more than whoever copied it.
  assert.match(bashInstall('creds'), /uname -m/);
  assert.match(powershellInstall('creds'), /PROCESSOR_ARCHITECTURE/);
});

test('a pinned architecture never ALSO detects one', () => {
  // Two answers to the same question is how a script installs the wrong build on a good day.
  assert.doesNotMatch(installScript('creds', { os: 'linux', rid: 'linux-arm64' }), /uname -m/);
  assert.doesNotMatch(
    installScript('creds', { os: 'windows', rid: 'win-arm64' }),
    /PROCESSOR_ARCHITECTURE/,
  );
});

test('the shell follows from the machine, so the two cannot be mismatched', () => {
  // Asking "which shell?" separately invites the one mistake this cannot recover from: a bash
  // script pasted into PowerShell runs its first line and stops.
  assert.match(installScript('creds', { os: 'windows', rid: 'win-arm64' }), /Invoke-RestMethod/);
  assert.match(installScript('creds', { os: 'linux', rid: 'linux-x64' }), /sha256sum -c/);
});

test('the archive extension follows the operating system, not the architecture', () => {
  // The unpacking command is the unambiguous witness: win-* ships a .zip and linux-* a
  // .tar.gz, and a script that reached for the wrong one would fail on a file it cannot open.
  assert.ok(installScript('creds', { os: 'windows', rid: 'win-arm64' }).includes('Expand-Archive'));
  assert.ok(installScript('creds', { os: 'linux', rid: 'linux-arm64' }).includes('tar xzf'));
});
