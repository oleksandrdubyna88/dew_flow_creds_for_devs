import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { BUILT_IN_DIR, GIT_SSH, pathWith } from './sshPath';
import {
  AGENT_SOCKET_ENV,
  E3_INHERITED_DROP,
  NOTHING_DROPPED,
  NO_AGENT_TO_FORWARD,
  NO_SSH_TO_SPAWN,
  agentForwardEnv,
  envWithout,
  openSshBinary,
  builtInOpenSsh,
  openSshProgram,
  pathDirsOf,
  pathSshIsBuiltIn,
  spawnableSshProgram,
  sshSpawnLaunch,
  wslWindowsSshClient,
} from '../sshProgram';
import type { EntityMetadata } from '../types';

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

// --- the client WSL can borrow ----------------------------------------------------------------
//
// A WSL shell cannot use a Windows-side key with its own ssh: /mnt/c reports 0777, chmod there is a
// no-op, and OpenSSH refuses a key whose permissions it cannot trust. It can LAUNCH the Windows
// client through interop, which reads the same file under the ACLs that make those permissions
// real. Measured: /mnt/c/Windows/System32/OpenSSH/ssh.exe -V -> OpenSSH_for_Windows_9.5p2.

test('the client WSL borrows is the built-in one, spelled the way that shell must spell it', () => {
  assert.equal(wslWindowsSshClient('win32', present), '/mnt/c/Windows/System32/OpenSSH/ssh.exe');
});

test('it is judged by the WINDOWS file, because that is the side this code runs on', () => {
  // The path asked about is the Windows one; the path handed back is the Linux one. A test that
  // let those be the same string would not notice the translation going missing.
  const asked: string[] = [];
  const answer = wslWindowsSshClient('win32', (candidate) => {
    asked.push(candidate);
    return true;
  });

  assert.deepEqual(asked, ['C:/Windows/System32/OpenSSH/ssh.exe']);
  assert.equal(answer.startsWith('/mnt/c/'), true);
});

test('a Windows without it lends nothing, and says so as an empty string', () => {
  assert.equal(wslWindowsSshClient('win32', absent), '');
});

test('and no other host has one to lend — WSL runs on Windows or nowhere', () => {
  assert.equal(wslWindowsSshClient('linux', present), '');
  assert.equal(wslWindowsSshClient('darwin', present), '');
});

// ---- the spawn of Run with Secrets over SSH (E3.S1, P1-P7) -------------------------------------------------------------------
//
// Any host: the platform, the PATH value and `exists` are injected, so a Linux runner decides for Windows.

/** In each string one backslash per `\\`: a relative folder, a drive-relative one, an absolute one and the built-in client's. */
const WIN_PATH = '.;tools;\\rooted;C:\\Git\\usr\\bin;C:\\Windows\\System32\\OpenSSH';

const SSH_ENTITY = { id: 's1', name: 'box', isSshEnabled: true, host: 'h', user: 'u' } as EntityMetadata;

/** An `exists` that says yes to every candidate and records what it was asked. */
function recordingExists(answer: (candidate: string) => boolean): { exists: (candidate: string) => boolean; asked: string[] } {
  const asked: string[] = [];
  return {
    exists: (candidate) => {
      asked.push(candidate);
      return answer(candidate);
    },
    asked,
  };
}

test('on_windows_a_bare_ssh_becomes_the_first_absolute_path_folder_that_holds_it', () => {
  const seen = recordingExists((candidate) => candidate.endsWith('ssh.exe'));
  assert.equal(spawnableSshProgram('ssh', 'win32', WIN_PATH, seen.exists), path.win32.join('C:\\Git\\usr\\bin', 'ssh.exe'));
  assert.deepEqual(seen.asked, [path.win32.join('C:\\Git\\usr\\bin', 'ssh.exe')], '`.`, `tools` and the drive-relative `\\rooted` are skipped, never asked');
});

test('on_windows_with_no_ssh_on_the_path_the_built_in_is_used', () => {
  assert.equal(spawnableSshProgram('ssh', 'win32', 'C:\\bin', (candidate) => candidate === builtInOpenSsh('ssh')), builtInOpenSsh('ssh'));
});

test('on_windows_with_no_client_at_all_the_answer_is_undefined', () => {
  assert.equal(spawnableSshProgram('ssh', 'win32', WIN_PATH, absent), undefined);
  assert.ok(NO_SSH_TO_SPAWN.includes('ssh.exe'), 'the refusal sentence exists and names what was missing');
});

test('on_windows_an_absolute_program_is_kept_and_nothing_is_searched', () => {
  const seen = recordingExists(() => true);
  assert.equal(spawnableSshProgram(builtInOpenSsh('ssh'), 'win32', WIN_PATH, seen.exists), builtInOpenSsh('ssh'));
  assert.deepEqual(seen.asked, []);
  assert.equal(spawnableSshProgram('\\\\server\\share\\ssh.exe', 'win32', WIN_PATH, seen.exists), '\\\\server\\share\\ssh.exe', 'a \\\\ prefix is absolute too');
  assert.deepEqual(seen.asked, []);
});

test('off_windows_the_bare_name_is_kept_and_nothing_is_searched', () => {
  const seen = recordingExists(() => true);
  for (const platform of ['linux', 'darwin'] as const) {
    assert.equal(spawnableSshProgram('ssh', platform, '/usr/bin:.:', seen.exists), 'ssh');
  }
  assert.deepEqual(seen.asked, []);
});

test('on_windows_the_spawned_program_is_never_a_bare_name', () => {
  const everything = recordingExists(() => true);
  const nothing = recordingExists(() => false);
  for (const agentForward of [true, false]) {
    const program = sshSpawnLaunch({ ...SSH_ENTITY, agentForward }, '/tmp/a.sock', 'win32').program;
    assert.match(spawnableSshProgram(program, 'win32', WIN_PATH, everything.exists) ?? '', /^[A-Za-z]:[\\/]/, `agentForward ${String(agentForward)}`);
    assert.equal(spawnableSshProgram(program, 'win32', WIN_PATH, nothing.exists), undefined, 'never the bare word, however the client was named');
  }
});

test('a_forwarding_entry_gets_the_agent_socket_and_a_missing_socket_is_a_warning', () => {
  const forwarding = { ...SSH_ENTITY, agentForward: true };
  assert.deepEqual(sshSpawnLaunch(forwarding, '/tmp/a.sock', 'linux'), { program: 'ssh', env: { SSH_AUTH_SOCK: '/tmp/a.sock' } });
  assert.deepEqual(sshSpawnLaunch(forwarding, undefined, 'linux'), { program: 'ssh', env: {}, warning: NO_AGENT_TO_FORWARD });
  assert.deepEqual(sshSpawnLaunch(SSH_ENTITY, '/tmp/a.sock', 'linux'), { program: 'ssh', env: {} }, 'no forwarding: the socket is not handed over');
});

test('the_hosts_agent_socket_does_not_reach_the_ssh_of_e3s_two_roads', () => {
  const base = { SSH_AUTH_SOCK: '/h', CREDS_REF_9: 'x', PATH: '/p' };
  assert.deepEqual(envWithout(base, E3_INHERITED_DROP, 'linux'), { PATH: '/p' });
  assert.deepEqual(base, { SSH_AUTH_SOCK: '/h', CREDS_REF_9: 'x', PATH: '/p' }, 'a copy: the argument still holds all three');

  const windows = { Ssh_Auth_Sock: '/h', creds_ref_9: 'x', Path: 'p' };
  assert.deepEqual(envWithout(windows, E3_INHERITED_DROP, 'win32'), { Path: 'p' }, 'a Windows environment does not tell the spellings apart');
  assert.deepEqual(envWithout(windows, E3_INHERITED_DROP, 'linux'), windows, 'elsewhere they are other variables');

  assert.deepEqual(envWithout(base, NOTHING_DROPPED, 'linux'), base, 'nothing dropped: every variable stays');
  assert.deepEqual(E3_INHERITED_DROP, { names: [AGENT_SOCKET_ENV], prefixes: ['CREDS_REF_'] });
  assert.equal(AGENT_SOCKET_ENV, 'SSH_AUTH_SOCK');
});
