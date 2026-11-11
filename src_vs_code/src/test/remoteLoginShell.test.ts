import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TestContext, test } from 'node:test';
import { SECRETS_NOT_WHOLE, secretsRemoteCommand, secretsScriptFirst, secretsScriptLast, secretsStdin, typedLine } from '../remoteLaunch';
import {
  ADD_BIN,
  POSIX_SHELL,
  Remote,
  SHELL_TIMEOUT_MS,
  E,
  NONCE,
  OTHER_NONCE,
  fakeSsh,
  loginDirect,
  loginStandIn,
  remoteHome,
  remotePlanOf,
  shellPath,
  skipUnless,
  sshdEnv,
  sshdRun,
} from './remoteShellHarness';

/**
 * The owner's bug, reproduced through the composer: a line that runs over SSH must find what the server's LOGIN profile puts on
 * `PATH` (`aws: command not found`, 127, for a tool that only `~/.profile` adds). Every run is sshd's way (`<shell> -c '<the one
 * remote command>'`) with an OWNED temp `HOME` (the test-leftovers rule), no `ENV`, `BASH_ENV` or `SSH_*`, and `SHLVL` set; see
 * `remoteShellHarness.ts`. `/etc/profile` is still read, so an assertion on exact output compares with the same line run by a
 * login shell directly, and a marker assertion uses `includes`. A shell that is not installed skips its tests, with the reason printed.
 */

const NOT_POSIX = process.platform === 'win32' ? 'the remote side is emulated with POSIX shells: not run on Windows' : false;

/** The shells of every test; zsh, ksh, mksh and ash only where they are installed (CI installs none of them). */
const CORE = ['bash', 'dash', 'sh'] as const;
const EXTRA = ['zsh', 'ksh', 'mksh', 'ash'] as const;

/** One body, run once per shell; a shell that is absent skips with its reason. */
function eachShell(names: readonly string[], title: string, body: (shell: string, name: string, t: TestContext) => void): void {
  for (const name of names) {
    test(`${title} (${name})`, { skip: NOT_POSIX || skipUnless(name) }, (t) => {
      const shell = shellPath(name);
      assert.ok(shell !== undefined, `${name} was found by the skip check`);
      body(shell, name, t);
    });
  }
}

/** The same text for the shells that read `~/.profile` and for zsh, which reads `~/.zprofile`. */
const profiles = (text: string): Record<string, string> => ({ '.profile': text, '.zprofile': text });

/** What a person might store as a secret: every character that ends a quote or starts an expansion, two line breaks and a final `\`. */
const VALUE = `it's "q" $HOME \`id\` back\\slash\nsecond line\n\nlast\\`;

const show = (value: string): string => `<${value}>`;

function secretsRun(shell: string, env: NodeJS.ProcessEnv, line: string, values: Record<string, string> = { CREDS_REF_1: VALUE }): Remote {
  return sshdRun(shell, secretsRemoteCommand(NONCE), env, secretsStdin(values, line, NONCE));
}

function bareRun(shell: string, env: NodeJS.ProcessEnv, line: string): Remote {
  return sshdRun(shell, remotePlanOf(line, false).remoteCommand, env);
}

// ---- the owner's bug ----------------------------------------------------------------------------------------------------------

eachShell(CORE, 'the_profile_path_reaches_the_bare_line_on_every_login_shell', (shell, _name, t) => {
  const home = remoteHome(t, profiles(ADD_BIN));
  const env = sshdEnv(home, shell);
  const run = bareRun(shell, env, 'tool a b');
  assert.equal(run.stdout.includes('tool ran: a b\n'), true, `${JSON.stringify(run)}`);
  assert.equal(run.status, 0, run.stderr);
  const direct = loginDirect(shell, 'tool a b', env);
  assert.equal(run.stdout, direct.stdout, 'the same output as the line run by a login shell directly');
  assert.equal(run.stderr, direct.stderr);
});

eachShell(CORE, 'the_profile_path_reaches_the_line_on_the_stay_open_roads', (shell, _name, t) => {
  const home = remoteHome(t, profiles(ADD_BIN));
  const env = sshdEnv(home, loginStandIn(t, shell));
  const run = sshdRun(shell, remotePlanOf('tool a b', true).remoteCommand, env);
  assert.equal(run.stdout.includes('tool ran: a b\n'), true, JSON.stringify(run));
  assert.equal(run.stdout.indexOf('LOGIN-SHELL') > run.stdout.indexOf('tool ran'), true, 'the login shell follows the line');
  assert.equal(run.stderr.includes('creds: the command ended'), false, run.stderr);
  assert.equal(run.status, 0);
});

eachShell([...CORE, ...EXTRA], 'the_profile_path_reaches_run_with_secrets', (shell, _name, t) => {
  const home = remoteHome(t, profiles(ADD_BIN));
  const env = sshdEnv(home, shell);
  const run = secretsRun(shell, env, 'printf "<%s>" "$CREDS_REF_1"; tool sec');
  assert.equal(run.stdout.includes(`${show(VALUE)}tool ran: sec\n`), true, JSON.stringify(run));
  assert.equal(run.status, 0, run.stderr);
  // The line has no file descriptor 3: the script was never handed on to it.
  const fd3 = secretsRun(shell, env, '(: <&3) 2>/dev/null && echo open || echo closed');
  assert.equal(fd3.stdout.includes('closed'), true, JSON.stringify(fd3));
  assert.equal(fd3.stdout.includes('open'), false, JSON.stringify(fd3));
});

eachShell(EXTRA, 'the_profile_path_reaches_the_bare_line_on_the_other_installed_shells', (shell, _name, t) => {
  const env = sshdEnv(remoteHome(t, profiles(ADD_BIN)), shell);
  const run = bareRun(shell, env, 'tool a b');
  assert.equal(run.stdout.includes('tool ran: a b\n'), true, JSON.stringify(run));
  assert.equal(run.status, 0, run.stderr);
});

test('bash_reads_bash_profile_first', { skip: NOT_POSIX || skipUnless('bash') || skipUnless('dash') }, (t) => {
  const home = remoteHome(t, { '.bash_profile': ADD_BIN, '.profile': '# adds nothing\n' });
  const bash = shellPath('bash') as string;
  const dash = shellPath('dash') as string;
  const found = bareRun(bash, sshdEnv(home, bash), 'tool a b');
  assert.equal(found.stdout.includes('tool ran: a b\n'), true, JSON.stringify(found));
  assert.equal(found.status, 0, found.stderr);
  // dash reads only `~/.profile`, which adds nothing here: what a login at a prompt does.
  const missing = bareRun(dash, sshdEnv(home, dash), 'tool a b');
  assert.equal(missing.status, 127, JSON.stringify(missing));
  assert.equal(missing.stdout.includes('tool ran'), false);
});

// ---- the exit code, the folder and `exit` -------------------------------------------------------------------------------------

/** `tool` is on the PATH of the environment itself, so the line needs no profile: a guard that is green on the old code too. */
function envWithTool(t: TestContext, shell: string, files: Record<string, string> = {}): NodeJS.ProcessEnv {
  const home = remoteHome(t, files);
  return sshdEnv(home, shell, { PATH: `${path.join(home, 'bin')}:/usr/bin:/bin` });
}

eachShell(['bash', 'dash'], 'the_exit_code_of_the_line_is_the_status', (shell, _name, t) => {
  const env = envWithTool(t, shell);
  const bareSeven = bareRun(shell, env, 'TOOL_EXIT=7 tool x');
  assert.equal(bareSeven.status, 7, JSON.stringify(bareSeven));
  assert.equal(bareSeven.stdout.includes('tool ran: x'), true);
  assert.equal(bareRun(shell, env, 'false').status, 1);
  assert.equal(secretsRun(shell, env, 'TOOL_EXIT=7 tool x').status, 7);
  assert.equal(secretsRun(shell, env, 'false').status, 1);
  assert.equal(secretsRun(shell, env, 'exit 7').status, 7);
  const stand = sshdEnv(env.HOME as string, loginStandIn(t, shell), { PATH: env.PATH });
  const open = sshdRun(shell, remotePlanOf('TOOL_EXIT=7 tool x', true).remoteCommand, stand);
  assert.equal(open.stderr.includes('creds: the command ended with exit code 7\n'), true, JSON.stringify(open));
  assert.equal(open.stdout.indexOf('LOGIN-SHELL') > open.stdout.indexOf('tool ran'), true, 'the login shell follows');
});

eachShell(['bash', 'dash'], 'the_stay_open_shell_keeps_the_folder_and_exit', (shell, _name, t) => {
  const base = envWithTool(t, shell);
  const env = sshdEnv(base.HOME as string, loginStandIn(t, shell), { PATH: base.PATH });
  const sub = fs.realpathSync(path.join(base.HOME as string, 'sub'));
  const moved = sshdRun(shell, remotePlanOf('cd "$HOME/sub" && tool', true).remoteCommand, env);
  assert.equal(moved.stdout.includes(`LOGIN-SHELL in=${sub} `), true, JSON.stringify(moved));
  const exited = sshdRun(shell, remotePlanOf('exit 3', true).remoteCommand, env);
  assert.equal(exited.status, 3, JSON.stringify(exited));
  assert.equal(exited.stdout.includes('LOGIN-SHELL'), false, 'an exit in the line ends the session, as before');
});

// ---- the typed line, end to end -----------------------------------------------------------------------------------------------

eachShell(['bash', 'dash'], 'the_typed_line_end_to_end', (shell, _name, t) => {
  const plan = remotePlanOf(`tool "it's"`, true);
  const prepared = { entity: E, options: { program: 'ssh' }, platform: 'linux' as const, prefix: undefined, acceptNew: false };
  const typed = typedLine(plan, prepared, POSIX_SHELL);
  assert.equal(typed.kind, 'typed', JSON.stringify(typed));
  // A real LOCAL bash parses the typed line; the fake ssh records the one remote word it was given.
  const fake = fakeSsh(t);
  const local = spawnSync('bash', ['-c', (typed as { line: string }).line], { env: fake.env, timeout: SHELL_TIMEOUT_MS, encoding: 'utf8' });
  assert.equal(local.status, 0, local.stderr);
  const argv = fake.read();
  const remote = argv[argv.length - 1].toString('utf8');
  const home = remoteHome(t, profiles(ADD_BIN));
  const run = sshdRun(shell, remote, sshdEnv(home, loginStandIn(t, shell)));
  assert.equal(run.stdout.includes("tool ran: it's\n"), true, JSON.stringify(run));
  assert.equal(run.stdout.includes('LOGIN-SHELL'), true, JSON.stringify(run));
});

// ---- Run with Secrets: what a startup file may and may not do ----------------------------------------------------------------

eachShell(['bash', 'dash'], 'a_profile_that_reads_stdin_gets_no_value', (shell, _name, t) => {
  const home = remoteHome(t, profiles(`${ADD_BIN}read -r x; printf '[%s]\\n' "$x"\n`));
  const run = secretsRun(shell, sshdEnv(home, shell), 'printf "%s" "$CREDS_REF_1"');
  assert.equal(run.stdout.includes('[]\n'), true, `the profile read nothing: ${JSON.stringify(run)}`);
  assert.equal(run.stdout.endsWith(VALUE), true, 'the value arrived byte-equal');
  assert.equal(run.status, 0, run.stderr);
});

test('a_startup_file_that_reads_stdin_before_the_login_shell_gets_no_value', { skip: NOT_POSIX || skipUnless('bash') }, (t) => {
  const bash = shellPath('bash') as string;
  // bash reads `~/.bashrc` for a `-c` command when `SHLVL` is not set AND `SSH_CLIENT` is (sshd sets it): the file reads the script first.
  const asSshd = { SHLVL: undefined, SSH_CLIENT: '127.0.0.1 50000 22' };
  const reader = remoteHome(t, { ...profiles(ADD_BIN), '.bashrc': `read -r x; printf 'RC[%s]\\n' "$x"\n` });
  const one = secretsRun(bash, sshdEnv(reader, bash, asSshd), 'tool sec');
  assert.equal(one.stdout.includes(`RC[${secretsScriptFirst(NONCE)}]\n`), true, `the file was read, and took the marker: ${JSON.stringify(one)}`);
  assert.equal(one.stderr.includes(SECRETS_NOT_WHOLE), true, JSON.stringify(one));
  assert.equal(one.status, 1, JSON.stringify(one));
  assert.equal(one.stdout.includes('tool ran'), false, 'the line did not run');
  const eater = remoteHome(t, { ...profiles(ADD_BIN), '.bashrc': 'cat >/dev/null\n' });
  const all = secretsRun(bash, sshdEnv(eater, bash, asSshd), 'tool sec');
  assert.equal(all.stderr.includes(SECRETS_NOT_WHOLE), true, JSON.stringify(all));
  assert.equal(all.status, 1, JSON.stringify(all));
  assert.equal(all.stdout.includes('tool ran'), false);
});

eachShell(['bash', 'dash'], 'a_profile_that_hides_cat_fails_closed', (shell, _name, t) => {
  const home = remoteHome(t, profiles('PATH="$HOME/bin"; export PATH\n'));
  const run = secretsRun(shell, sshdEnv(home, shell), 'tool sec');
  assert.equal(run.status, 127, JSON.stringify(run));
  assert.equal(run.stdout.includes('tool ran'), false, 'nothing of the line ran');
  // It is the missing `cat` that stopped the run (the profile was read), not a `tool` that no profile put on the path.
  assert.match(run.stderr, /cat: (command )?not found/, run.stderr);
});

// ---- Run with Secrets: the logout file, the environment, the trace ---------------------------------------------------------------

test('a_logout_file_runs_only_after_exit_and_never_for_run_with_secrets', { skip: NOT_POSIX || skipUnless('bash') }, (t) => {
  const bash = shellPath('bash') as string;
  const world = (logout: string): NodeJS.ProcessEnv => sshdEnv(remoteHome(t, { '.profile': ADD_BIN, '.bash_logout': logout }), bash);
  const quiet = world('echo LOGOUT-RAN; false\n');
  const ranLogout = (run: Remote): boolean => run.stdout.includes('LOGOUT-RAN');
  const exitSeven = bareRun(bash, quiet, 'exit 7');
  assert.deepEqual([ranLogout(exitSeven), exitSeven.status], [true, 7], 'a line with exit runs the logout file and keeps its status');
  const plain = bareRun(bash, quiet, 'TOOL_EXIT=7 tool x');
  assert.deepEqual([ranLogout(plain), plain.status], [false, 7], 'a line with no exit runs no logout file');
  for (const line of ['exit 7', 'TOOL_EXIT=7 tool x']) {
    const secrets = secretsRun(bash, quiet, line);
    assert.deepEqual([ranLogout(secrets), secrets.status], [false, 7], `Run with Secrets: ${line}`);
  }
  const hiding = world('echo LOGOUT-RAN; exit 0\n');
  assert.equal(secretsRun(bash, hiding, 'exit 7').status, 7, 'the status of Run with Secrets is the line\'s, not the logout file\'s');
  const refused = sshdRun(bash, secretsRemoteCommand(NONCE), hiding, 'tool x\n');
  assert.deepEqual([ranLogout(refused), refused.status], [false, 1], 'a script that is not whole: refused with status 1, no logout file');
  // RECORDED, the limit of L11 on the other roads: the logout file's own `exit 0` replaces the status of a line that calls `exit`.
  assert.equal(bareRun(bash, hiding, 'exit 7').status, 0);
});

const CHILD_SEES = `sh -c 'echo "child:\${creds_script+SET}"'; printf '<%s>' "$CREDS_REF_1"`;

eachShell(['bash', 'dash'], 'the_script_is_not_in_a_childs_environment', (shell, _name, t) => {
  for (const profile of ['set -a\n', 'creds_script=OLD; export creds_script\n']) {
    const home = remoteHome(t, profiles(ADD_BIN + profile));
    const run = secretsRun(shell, sshdEnv(home, shell), CHILD_SEES);
    assert.equal(run.stdout.includes('child:\n'), true, `${JSON.stringify(profile)}: ${JSON.stringify(run)}`);
    assert.equal(run.stdout.includes('child:SET'), false, `${JSON.stringify(profile)} put the script into a child's environment`);
    assert.equal(run.stdout.includes(show(VALUE)), true, 'the value still arrived byte-equal');
    assert.equal(run.status, 0, run.stderr);
  }
  const locked = remoteHome(t, profiles(`${ADD_BIN}creds_script=OLD; readonly creds_script\n`));
  const refused = secretsRun(shell, sshdEnv(locked, shell), CHILD_SEES);
  assert.notEqual(refused.status, 0, JSON.stringify(refused));
  assert.equal(refused.stdout.includes('child:'), false, 'the line did not run');
});

eachShell(['bash', 'dash'], 'a_profile_that_traces_does_not_print_the_values', (shell, _name, t) => {
  const secret = `s3cr3t'q"x`;
  for (const option of ['set -x', 'set -v']) {
    const home = remoteHome(t, profiles(`${option}\n${ADD_BIN}`));
    const run = secretsRun(shell, sshdEnv(home, shell), 'printf %s "$CREDS_REF_1"', { CREDS_REF_1: secret });
    assert.equal(run.stderr.includes(secret), false, `${option}: the value is on standard error`);
    assert.equal(run.stderr.includes('s3cr3t'), false, `${option}: part of the value is on standard error`);
    assert.equal(run.stderr.includes(option === 'set -x' ? 'PATH=' : 'export PATH'), true, `${option}: the profile was read and traced: ${run.stderr}`);
    assert.equal(run.stdout.endsWith(secret), true, `${option}: ${JSON.stringify(run)}`);
    assert.equal(run.status, 0, run.stderr);
  }
});

// ---- Run with Secrets: whole or not at all ---------------------------------------------------------------------------------------

function ranTool(run: Remote): boolean {
  return run.stdout.includes('tool ran');
}

eachShell(['bash', 'dash'], 'the_script_runs_whole_or_not_at_all', (shell, _name, t) => {
  const env = sshdEnv(remoteHome(t, profiles(ADD_BIN)), shell);
  const script = secretsStdin({ CREDS_REF_1: 'v4lue' }, 'tool sec', NONCE);
  // The whole script, and the one without its final line break, run.
  for (const whole of [script, script.slice(0, -1)]) {
    const run = sshdRun(shell, secretsRemoteCommand(NONCE), env, whole);
    assert.equal(ranTool(run), true, JSON.stringify(run));
    assert.equal(run.status, 0, run.stderr);
  }
  // Every other cut loses a part of the last marker line: nothing runs, and the status is not 0.
  for (let length = 0; length < script.length - 1; length += 1) {
    const run = sshdRun(shell, secretsRemoteCommand(NONCE), env, script.slice(0, length));
    assert.equal(ranTool(run), false, `a cut at ${length} bytes ran the line: ${JSON.stringify(run)}`);
    assert.notEqual(run.status, 0, `a cut at ${length} bytes ended with status 0`);
  }
});

eachShell(['bash', 'dash'], 'a_cut_right_after_a_line_that_ends_with_the_last_marker_runs_nothing', (shell, _name, t) => {
  const env = sshdEnv(remoteHome(t, profiles(ADD_BIN)), shell);
  const script = secretsStdin({}, `tool sec ${secretsScriptLast(NONCE)}`, NONCE);
  const cut = script.slice(0, script.indexOf(secretsScriptLast(NONCE), 20) + secretsScriptLast(NONCE).length);
  const run = sshdRun(shell, secretsRemoteCommand(NONCE), env, cut);
  assert.equal(ranTool(run), false, JSON.stringify(run));
  assert.notEqual(run.status, 0, 'the group is not closed: a syntax error');
  // The control: the same line in the whole script runs (the marker text is a comment there).
  assert.equal(ranTool(sshdRun(shell, secretsRemoteCommand(NONCE), env, script)), true, 'the whole script runs');
});

eachShell(['bash', 'dash'], 'a_child_of_the_profile_that_reads_the_script_gets_it_refused', (shell, _name, t) => {
  const home = remoteHome(t, profiles(`${ADD_BIN}cat <&3 >/dev/null\n`));
  const run = secretsRun(shell, sshdEnv(home, shell), 'tool sec');
  assert.equal(run.stderr.includes(SECRETS_NOT_WHOLE), true, JSON.stringify(run));
  assert.equal(run.status, 1, JSON.stringify(run));
  assert.equal(ranTool(run), false);
});

// ---- Run with Secrets: the real `cat` ------------------------------------------------------------------------------------------------

eachShell(['bash', 'dash', ...EXTRA], 'the_script_is_read_by_the_real_cat', (shell, name, t) => {
  const word = 'pässwörd';
  // An alias (the shells that expand one in `-c`) and a function (every shell) named `cat` change what is read: `command` does not.
  const hiding = ['alias cat="cat -v"\n', 'cat() { command cat -E "$@"; }\n'].map((text) => `echo PROFILE-READ\n${text}`);
  for (const hide of name === 'bash' ? hiding.slice(1) : hiding) {
    const home = remoteHome(t, profiles(ADD_BIN + hide));
    const run = secretsRun(shell, sshdEnv(home, shell), 'printf %s "$CREDS_REF_1"', { CREDS_REF_1: word });
    assert.equal(run.stdout.includes('PROFILE-READ'), true, 'the profile was read');
    assert.equal(run.stdout.endsWith(word), true, `${JSON.stringify(hide)}: ${JSON.stringify(run)}`);
    assert.equal(run.status, 0, run.stderr);
  }
});

// ---- Run with Secrets: a value cannot forge the marker ---------------------------------------------------------------------------

/** What a startup file that reads two lines of standard input leaves: the script starts at its third line, where a value may hold the marker. */
const TWO_LINES = 'read -r a; read -r b\n';
const FORGED_RUN = 'echo INJECTED-FROM-VALUE >&2; touch PWNED\n';

eachShell(['bash', 'zsh'], 'a_value_that_holds_a_marker_line_runs_nothing', (shell, name, t) => {
  // bash reads `~/.bashrc` for a `-c` command when `SHLVL` is not set and `SSH_CLIENT` is; zsh reads `~/.zshenv` always.
  const extra = name === 'bash' ? { SHLVL: undefined, SSH_CLIENT: '127.0.0.1 50000 22' } : {};
  const forgeries = {
    'the first marker of the old form': `a\n#creds-secrets-1\n${FORGED_RUN}`,
    'the first marker of another run': `a\n${secretsScriptFirst(OTHER_NONCE)}\n${FORGED_RUN}`,
    'both markers of another run': `a\n${secretsScriptFirst(OTHER_NONCE)}\n${FORGED_RUN}${secretsScriptLast(OTHER_NONCE)}\n`,
  };
  for (const [what, forged] of Object.entries(forgeries)) {
    const home = remoteHome(t, { ...profiles(ADD_BIN), '.bashrc': TWO_LINES, '.zshenv': TWO_LINES });
    const run = secretsRun(shell, sshdEnv(home, shell, extra), 'tool sec', { CREDS_REF_1: forged });
    assert.equal(fs.existsSync(path.join(home, 'PWNED')), false, `${what}: the value ran as code: ${JSON.stringify(run)}`);
    assert.equal(run.stderr.includes('INJECTED-FROM-VALUE'), false, `${what}: the value ran as code: ${JSON.stringify(run)}`);
    assert.equal(run.stderr.includes(SECRETS_NOT_WHOLE), true, `${what}: ${JSON.stringify(run)}`);
    assert.equal(run.status, 1, `${what}: ${JSON.stringify(run)}`);
    assert.equal(ranTool(run), false, `${what}: the line did not run`);
  }
});

test('a_profile_with_a_debug_trap_does_not_print_the_values', { skip: NOT_POSIX || skipUnless('bash') }, (t) => {
  // bash runs a DEBUG trap before every command it runs, the assignments of the script included; `set -T` lets a function inherit it.
  const bash = shellPath('bash') as string;
  const home = remoteHome(t, profiles(`${ADD_BIN}set -T; trap 'echo DBG:$BASH_COMMAND >&2' DEBUG\n`));
  const run = secretsRun(bash, sshdEnv(home, bash), 'printf %s "$CREDS_REF_1"', { CREDS_REF_1: 'TOPSECRET' });
  assert.equal(run.stderr.includes('TOPSECRET'), false, `the DEBUG trap printed the value: ${JSON.stringify(run)}`);
  assert.equal(run.stdout.endsWith('TOPSECRET'), true, JSON.stringify(run));
  assert.equal(run.status, 0, run.stderr);
});

test('the_word_that_clears_the_debug_trap_does_not_end_dash', { skip: NOT_POSIX || skipUnless('dash') }, (t) => {
  // In dash `trap - DEBUG` is an error, and an error of a special builtin ends a non-interactive shell: `command` keeps it going.
  const dash = shellPath('dash') as string;
  const run = secretsRun(dash, sshdEnv(remoteHome(t, profiles(ADD_BIN)), dash), 'printf %s "$CREDS_REF_1"', { CREDS_REF_1: 'TOPSECRET' });
  assert.equal(run.stdout.endsWith('TOPSECRET'), true, JSON.stringify(run));
  assert.equal(run.status, 0, run.stderr);
});
