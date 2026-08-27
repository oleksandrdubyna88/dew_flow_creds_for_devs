import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RELEASES_REPO, bashInstall, powershellInstall } from '../installCommand';

// The scripts are text this extension hands to a terminal somewhere else. Both were RUN against
// the real API before these were written — the bash one installed a working binary and printed
// `creds-0.1.0-linux-x64.tar.gz: OK` from `sha256sum -c`; the PowerShell one installed and
// verified too, and running it is what found the em dash below.

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
    const cli = build('creds');
    const mcp = build('creds-mcp');

    // `creds-` then a DIGIT: that is what separates the CLI from creds-mcp-, and neither can
    // match cred-vault-server-, which has no `s` before the dash.
    // The needles carry a literal backslash, so they are built rather than written: a `d`
    // in a source file is one editing hop away from becoming a digit class.
    const BS = String.fromCharCode(92);
    assert.ok(cli.includes('creds-[0-9]') || cli.includes(`creds-${BS}d`), cli);
    assert.ok(mcp.includes('creds-mcp-[0-9]') || mcp.includes(`creds-mcp-${BS}d`), mcp);
    assert.doesNotMatch(cli, /creds-mcp/);
  });

  test(`${name}: the download is verified, not just fetched`, () => {
    // This tool holds credentials. An unverified download is not a detail.
    assert.match(build('creds'), /sha256/i);
  });

  test(`${name}: it is pure ASCII, because it is pasted into someone else's shell`, () => {
    // Found by running it: an em dash in the final message made PowerShell 5.1 report "the string
    // is missing the terminator" — it reads a .ps1 as ANSI unless there is a BOM, and the file
    // arrives through a clipboard that carries none.
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
