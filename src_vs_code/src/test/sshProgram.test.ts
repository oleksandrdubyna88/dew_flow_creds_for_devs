import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILT_IN_DIR, GIT_SSH, pathWith } from './sshPath';
import {
  NO_AGENT_TO_FORWARD,
  agentForwardEnv,
  openSshBinary,
  builtInOpenSsh,
  openSshProgram,
  pathDirsOf,
  pathSshIsBuiltIn,
} from '../sshProgram';

const present = (): boolean => true;
const absent = (): boolean => false;

test('off Windows the bare name is kept, so the person PATH decides', () => {
  assert.equal(openSshProgram('ssh', true, 'linux', present), 'ssh');
  assert.equal(openSshProgram('ssh', true, 'darwin', present), 'ssh');
});

test('on Windows without agent forwarding nothing is substituted', () => {
  // The measured hazard is reaching OUR agent. A connection that does not want the agent has
  // no reason to be moved off the client the person's own config was written against.
  assert.equal(openSshProgram('ssh', false, 'win32', present), 'ssh');
});

test('on Windows a forwarding connection gets the built-in client when PATH does not', () => {
  assert.equal(
    openSshProgram('ssh', true, 'win32', present, pathWith()),
    'C:/Windows/System32/OpenSSH/ssh.exe',
  );
});

test('...and when PATH resolves ssh to GIT first, which is the state that needs the full path', () => {
  // The case the empty PATH does not cover, and the one that matters: an MSYS `ssh` shadowing the
  // built-in is exactly why T20 exists — it cannot open the named pipe our agent listens on. An
  // implementation that emitted the bare word whenever PATH held ANY ssh would pass the other two
  // cases and break this one.
  assert.equal(
    openSshProgram('ssh', true, 'win32', present, pathWith(GIT_SSH, BUILT_IN_DIR)),
    'C:/Windows/System32/OpenSSH/ssh.exe',
  );
});

test('...and the BARE word when PATH already resolves ssh to the built-in', () => {
  // Then the command shown in the viewer is one a person could have typed.
  assert.equal(openSshProgram('ssh', true, 'win32', present, pathWith(BUILT_IN_DIR, GIT_SSH)), 'ssh');
});

test('a Windows install without the built-in falls back rather than failing to spawn', () => {
  // Forwarding nothing is bad. Not connecting at all is worse.
  assert.equal(openSshProgram('ssh', true, 'win32', absent), 'ssh');
});

test('every tool resolves under the same directory', () => {
  assert.equal(builtInOpenSsh('ssh-add'), 'C:/Windows/System32/OpenSSH/ssh-add.exe');
  assert.equal(builtInOpenSsh('ssh-keygen'), 'C:/Windows/System32/OpenSSH/ssh-keygen.exe');
});

test('without agent forwarding the environment is passed through untouched', () => {
  const base = { PATH: '/usr/bin' };
  const result = agentForwardEnv(base, false, '/run/agent.sock');
  assert.equal(result.env, base);
  assert.equal(result.warning, undefined);
});

test('a forwarding connection carries SSH_AUTH_SOCK into the child', () => {
  // The whole defect this module exists for: the variable was published to TERMINALS, and a
  // child spawned by the extension host never saw it.
  const base: NodeJS.ProcessEnv = { PATH: '/usr/bin' };
  const result = agentForwardEnv(base, true, '/run/agent.sock');
  assert.equal(result.env.SSH_AUTH_SOCK, '/run/agent.sock');
  assert.equal(result.env.PATH, '/usr/bin');
  assert.equal(base.SSH_AUTH_SOCK, undefined, 'the caller env is not mutated');
});

test('forwarding asked for with no agent running says so instead of going quiet', () => {
  const result = agentForwardEnv({}, true, undefined);
  assert.equal(result.warning, NO_AGENT_TO_FORWARD);
  assert.equal(result.env.SSH_AUTH_SOCK, undefined);
});

test('an empty socket path counts as no agent', () => {
  assert.equal(agentForwardEnv({}, true, '').warning, NO_AGENT_TO_FORWARD);
});

// ---------------------------------------------------------------------------
// T20 (PLAN_tails) — the PATH probe. The owner's viewer showed
// `C:/Windows/System32/OpenSSH/ssh.exe …` on a forwarding connection; on a
// modern Windows the FIRST ssh on PATH usually IS that binary, and then the
// full path is noise a person cannot paste anywhere else.
// ---------------------------------------------------------------------------

test('when PATH already resolves ssh to the built-in, the bare word is kept even for forwarding', () => {
  const program = openSshProgram('ssh', true, 'win32', () => true, {
    pathDirs: ['C:\\Users\\dev\\bin', 'C:\\Windows\\System32\\OpenSSH'],
    hasTool: (dir: string) => dir === 'C:\\Windows\\System32\\OpenSSH',
  });
  assert.equal(program, 'ssh');
});

test('when PATH resolves ssh to the MSYS one first, a forwarding connection still gets the full built-in path', () => {
  const program = openSshProgram('ssh', true, 'win32', () => true, {
    pathDirs: ['C:\\Program Files\\Git\\usr\\bin', 'C:\\Windows\\System32\\OpenSSH'],
    hasTool: () => true,
  });
  assert.equal(program, 'C:/Windows/System32/OpenSSH/ssh.exe');
});

test('the probe never touches a non-forwarding connection — PATH decides, as it always did', () => {
  const program = openSshProgram('ssh', false, 'win32', () => true, {
    pathDirs: ['C:\\Program Files\\Git\\usr\\bin'],
    hasTool: () => true,
  });
  assert.equal(program, 'ssh');
});

test('pathSshIsBuiltIn compares case-insensitively and takes the FIRST hit', () => {
  assert.equal(
    pathSshIsBuiltIn('win32', {
      pathDirs: ['c:\\windows\\system32\\openssh', 'C:\\Program Files\\Git\\usr\\bin'],
      hasTool: () => true,
    }),
    true,
  );
  assert.equal(
    pathSshIsBuiltIn('win32', {
      pathDirs: ['C:\\Program Files\\Git\\usr\\bin', 'C:\\Windows\\System32\\OpenSSH'],
      hasTool: () => true,
    }),
    false,
  );
  // No ssh anywhere on PATH: not "built-in", and the caller falls back to the full path.
  assert.equal(pathSshIsBuiltIn('win32', { pathDirs: ['C:\\bin'], hasTool: () => false }), false);
});

test('the PATH is split on the PLATFORM delimiter, not on a hard-coded semicolon', () => {
  // The bug under the bug. The split was `;` always, so on Linux the whole colon-joined PATH became
  // ONE entry, `hasTool` was never true, and `pathSshIsBuiltIn` always said false - which is the
  // only reason the two tests above were ever green in CI.
  assert.deepEqual(pathDirsOf(String.raw`C:\a;C:\b`, ';'), [String.raw`C:\a`, String.raw`C:\b`]);
  assert.deepEqual(pathDirsOf('/usr/bin:/bin', ':'), ['/usr/bin', '/bin']);
  assert.deepEqual(pathDirsOf('/usr/bin:/bin', ';'), ['/usr/bin:/bin'], 'the wrong delimiter is one bogus entry');
  assert.deepEqual(pathDirsOf('', ';'), [], 'an empty PATH is no directories, never one empty one');
  assert.deepEqual(pathDirsOf(undefined, ';'), []);
});

/**
 * What is SPAWNED, as opposed to what is SHOWN.
 *
 * <p>Since T20 `openSshProgram` answers the bare word whenever the PATH already resolves `ssh` to
 * the built-in client, so the command in the viewer is the command a person could have typed. That
 * is right for a string somebody reads or pastes into a terminal — and wrong for `spawn(program,
 * …, { shell: false })`, which on Windows resolves a relative name through `CreateProcess`: the
 * CURRENT DIRECTORY is searched before `PATH`. An `ssh.exe` sitting in the extension host's working
 * directory would then be launched with `-A` and with `SSH_AUTH_SOCK` pointing at our agent — the
 * one connection where the client is handed the keys. CWE-426, and CodeRabbit's on PR #68.</p>
 *
 * <p>There is a second reason that needs no attacker: `PATH` is read when the probe runs and again
 * when the process starts, and nothing holds it still in between.</p>
 */

test('the binary to SPAWN is absolute when the built-in is the one that must run', () => {
  // Even though the PATH already resolves `ssh` to the built-in — which is exactly when
  // `openSshProgram` hands back the bare word for the viewer.
  const probe = { pathDirs: ['C:/Windows/System32/OpenSSH'], hasTool: () => true };

  const shown = openSshProgram('ssh', true, 'win32', () => true, probe);
  const spawned = openSshBinary('ssh', true, 'win32', () => true);

  assert.equal(shown, 'ssh', 'the viewer still shows a command a person could type');
  assert.equal(spawned, 'C:/Windows/System32/OpenSSH/ssh.exe', 'the spawn names the file it means');
});

test('a spawn that does not need our agent is still the bare word', () => {
  // Nothing is being defended here: no agent, so the person's own PATH decides, as it always did.
  assert.equal(openSshBinary('ssh', false, 'win32', () => true), 'ssh');
  assert.equal(openSshBinary('ssh', true, 'linux', () => true), 'ssh');
});

test('a Windows without the built-in client falls back rather than failing to spawn', () => {
  // The difference between a connection that forwards nothing and no connection at all.
  assert.equal(openSshBinary('ssh', true, 'win32', () => false), 'ssh');
});
