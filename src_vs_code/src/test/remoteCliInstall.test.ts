import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  INSTALLER_URL,
  blockerFor,
  confirmationFor,
  installCommand,
  interpretInstall,
  interpretProbe,
  probeCommand,
} from '../remoteCliInstall';

/**
 * Installing `creds` on a remote host from the entity's own context menu.
 *
 * <p>What a remote command does is decided by exactly which characters reach the remote shell, so
 * these tests are about strings — and about the two ways this could go wrong quietly: reporting a
 * success that did not happen, and blocking forever on input nobody can supply.</p>
 */

const PROBE = (creds: string, arch = 'x86_64', os = 'Linux', get = '/usr/bin/curl'): string =>
  `creds=${creds}\narch=${arch}\nos=${os}\nget=${get}\n`;

test('one probe answers four questions, because each round trip is its own ssh', () => {
  const cmd = probeCommand();

  for (const fragment of ['command -v creds', 'uname -m', 'uname -s', 'command -v curl']) {
    assert.ok(cmd.includes(fragment), fragment);
  }
});

test('the probe reads a host that has creds already', () => {
  const facts = interpretProbe(PROBE('/usr/local/bin/creds'));

  assert.equal(facts.credsPath, '/usr/local/bin/creds');
  assert.equal(facts.arch, 'x86_64');
  assert.equal(facts.answered, true);
});

test('"not found" comes back as EMPTY, never as the placeholder', () => {
  // The command prints `-` for a missing value so that a blank line cannot be mistaken for one.
  // If that placeholder leaked through, `credsPath` would be truthy and the menu would offer to
  // replace a `creds` at the path "-".
  const facts = interpretProbe(PROBE('-'));

  assert.equal(facts.credsPath, '');
  assert.equal(facts.answered, true, 'the host still answered');
});

test('a host that answered nothing is UNKNOWN, not "nothing installed"', () => {
  // The difference decides whether the menu offers an install or explains itself. Treating
  // silence as "absent" would offer to install onto a machine we failed to reach.
  const facts = interpretProbe('');

  assert.equal(facts.answered, false);
  assert.match(blockerFor(facts), /did not answer/);
});

test('an unsupported platform is refused BY NAME, not attempted', () => {
  assert.match(blockerFor(interpretProbe(PROBE('-', 'x86_64', 'Darwin'))), /no build for Darwin/);
  assert.match(blockerFor(interpretProbe(PROBE('-', 'ppc64le'))), /no build for ppc64le/);
});

test('a host with no curl and no wget is told so before anything runs', () => {
  const facts = interpretProbe(PROBE('-', 'x86_64', 'Linux', '-'));

  assert.match(blockerFor(facts), /neither curl nor wget/);
});

test('both supported architectures pass, under either spelling', () => {
  for (const arch of ['x86_64', 'amd64', 'aarch64', 'arm64']) {
    assert.equal(blockerFor(interpretProbe(PROBE('-', arch))), '', arch);
  }
});

test('the install command closes STDIN — it must be unable to wait for input', () => {
  // The lesson from the bridge: a remote command that can block does not fail, it hangs, and
  // everything downstream then reads as "not yet" rather than "never". On the other side of this
  // one is a progress notification, not a person who could answer a sudo prompt.
  const cmd = installCommand();

  assert.match(cmd, /< \/dev\/null/, cmd);
  assert.ok(cmd.includes(INSTALLER_URL));
});

test('a chosen prefix is quoted, so a path with a space cannot split the command', () => {
  const cmd = installCommand('/opt/my tools/bin');

  assert.ok(cmd.includes(`CREDS_PREFIX='/opt/my tools/bin'`), cmd);
});

test('a quote inside the prefix cannot escape the quoting', () => {
  const cmd = installCommand("/opt/it's/bin");

  assert.equal(cmd.includes("/opt/it's/bin "), false, 'the bare value must not appear unquoted');
  assert.ok(cmd.includes(`'/opt/it'\''s/bin'`), cmd);
});

test('success is read from the installer’s own line, never from the exit code', () => {
  // `curl … | sh` reports the SHELL's status, so a 404 body fed to `sh` exits 0 having done
  // nothing at all. An exit code of 0 is therefore not evidence and is not treated as any.
  const outcome = interpretInstall('creds-install: installed /usr/local/bin/creds\n', '', 0);

  assert.deepEqual(outcome, { kind: 'installed', path: '/usr/local/bin/creds' });
});

test('a cheerful exit code with no success line is a FAILURE', () => {
  const outcome = interpretInstall('', '', 0);

  assert.equal(outcome.kind, 'failed');
});

test('the installer’s own complaint is what the person is shown', () => {
  const outcome = interpretInstall(
    'creds-install: creds-0.1.0-linux-x64\n',
    'creds-install: checksum mismatch — refusing to install.\n',
    1,
  );

  assert.equal(outcome.kind, 'failed');
  assert.match(outcome.kind === 'failed' ? outcome.reason : '', /checksum mismatch/);
});

test('a curl failure is surfaced as curl’s, not as a generic exit code', () => {
  const outcome = interpretInstall('', 'curl: (6) Could not resolve host: raw.githubusercontent.com\n', 6);

  assert.match(outcome.kind === 'failed' ? outcome.reason : '', /Could not resolve host/);
});

test('the confirmation shows the exact command that will run on someone else’s machine', () => {
  const c = confirmationFor(interpretProbe(PROBE('-')), 'build box');

  assert.match(c.message, /Install .*build box/);
  assert.ok(c.detail.includes(installCommand()), 'the command itself, not a description of it');
  assert.match(c.detail, /checksum/, 'and what protects the download');
});

test('replacing an existing copy SAYS so, and names the file it will overwrite', () => {
  const c = confirmationFor(interpretProbe(PROBE('/usr/bin/creds')), 'build box');

  assert.match(c.message, /Replace/);
  assert.match(c.detail, /\/usr\/bin\/creds will be overwritten|already exists at \/usr\/bin\/creds/);
  assert.equal(c.action, 'Replace it');
});
