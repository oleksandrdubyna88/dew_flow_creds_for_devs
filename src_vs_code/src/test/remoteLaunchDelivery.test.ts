import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TestContext, test } from 'node:test';
import { secretsStdin, stayOpenWrapper } from '../remoteLaunch';
import { buildSshCommand } from '../sshCommand';
import { EntityMetadata } from '../types';
import { ownedDir } from '../../scripts/lib/leftovers.cjs';

/**
 * The remote command through REAL shells (E1.S2 spec §S2.8): no stub of the quoting. A fake `ssh` records its argv, so
 * what the typed line delivers is observed byte for byte; a second real shell stands in for the remote side
 * (`<shell> -c <element>`, the parse `sshd` gives the one argument); the stay-open wrapper and the secrets script run
 * for real. A real sshd round trip and Windows' own native re-quoting are hand checks (spec §S2.12).
 */

const SHELL_TIMEOUT_MS = 20_000;

function has(program: string, args: string[]): boolean {
  try {
    execFileSync(program, args, { stdio: 'ignore', timeout: SHELL_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

/** A Linux or macOS machine without bash FAILS; only a Windows machine without it skips. */
const NO_BASH = process.platform === 'win32' && !has('bash', ['-c', 'true']) ? 'no bash on this Windows machine' : false;
const skipUnless = (shell: string): string | false => (has(shell, ['-c', 'true']) ? false : `no ${shell} on this machine`);
const NO_PWSH = has('pwsh', ['-NoProfile', '-Command', '1']) ? false : 'no pwsh on this machine';

const dirOf = (t: TestContext, what: string): string => ownedDir(t, what);

/** What a person might store: shell syntax, quotes of every kind, a leading `--`, an option look-alike, unicode, a tab. */
const CORPUS: readonly string[] = [
  'echo hi; echo there',
  'a && b | c',
  `printf '%s|' a\\ b "c;d" '$(x)' && echo; echo "$HOME"`,
  '`id`',
  'back\\slash\\',
  '100% !bang *glob',
  'tab\there',
  'ünïcode €',
  `it's 'quoted' "and" $(sub)`,
  '--',
  '-oProxyCommand=id',
  'trail # comment',
  'echo a &',
  "x'",
  `'"'"'`,
  // PowerShell reads U+2018, U+2019, U+201A and U+201B as single quotes: unescaped, one of them ends the literal.
  'it\u2019s \u2018x\u2019 \u201Ay\u201B',
];

const E: EntityMetadata = { id: 's', name: 'srv', host: 'host', user: 'deploy', port: 2222, isSshEnabled: true };

function lineFor(command: string, platform: NodeJS.Platform): string {
  const line = buildSshCommand(E, platform, { program: 'ssh', remote: { command, tty: true } });
  assert.ok(line !== undefined, 'the builder refused the entity');
  return line;
}

/** A `ssh` that records its argv NUL-separated and calls nothing named `ssh` (so it can never resolve to itself). */
function fakeSsh(t: TestContext): { env: NodeJS.ProcessEnv; read: () => Buffer[] } {
  const dir = dirOf(t, 'ssh');
  const out = path.join(dir, 'argv.bin');
  fs.writeFileSync(path.join(dir, 'ssh'), '#!/bin/sh\nprintf \'%s\\0\' "$@" > "$FAKE_SSH_OUT"\n', { mode: 0o755 });
  const env = { ...process.env, PATH: dir + path.delimiter + (process.env.PATH ?? ''), FAKE_SSH_OUT: out };
  const read = (): Buffer[] => {
    const bytes = fs.readFileSync(out);
    const parts: Buffer[] = [];
    let from = 0;
    for (let i = 0; i < bytes.length; i += 1) {
      if (bytes[i] === 0) {
        parts.push(bytes.subarray(from, i));
        from = i + 1;
      }
    }
    return parts;
  };
  return { env, read };
}

function assertDelivered(argv: Buffer[], command: string, via: string): void {
  const text = (b: Buffer): string => b.toString('utf8');
  assert.equal(text(argv[0]), '-t', `${via}: ${JSON.stringify(command)}`);
  const dashes = argv.findIndex((b) => text(b) === '--');
  assert.ok(dashes >= 0, `${via}: no -- in ${JSON.stringify(argv.map(text))}`);
  assert.equal(text(argv[dashes + 1]), 'deploy@host', `${via}: ${JSON.stringify(command)}`);
  const rest = argv.slice(dashes + 2);
  assert.equal(rest.length, 1, `${via}: ${JSON.stringify(command)} arrived as ${JSON.stringify(rest.map(text))}`);
  assert.ok(rest[0].equals(Buffer.from(command, 'utf8')), `${via}: ${JSON.stringify(command)} arrived as ${JSON.stringify(text(rest[0]))}`);
}

/** The one remote element `bash` hands the fake for `command`, as bytes. */
function deliveredByBash(t: TestContext, command: string): Buffer {
  const fake = fakeSsh(t);
  const run = spawnSync('bash', ['-c', lineFor(command, 'linux')], { env: fake.env, timeout: SHELL_TIMEOUT_MS });
  assert.equal(run.error, undefined, String(run.error));
  assert.equal(run.status, 0, run.stderr.toString('utf8'));
  const argv = fake.read();
  return argv[argv.length - 1];
}

test('bash_delivers_one_remote_element_byte_equal', { skip: NO_BASH }, (t) => {
  for (const command of CORPUS) {
    const fake = fakeSsh(t);
    const run = spawnSync('bash', ['-c', lineFor(command, 'linux')], { env: fake.env, timeout: SHELL_TIMEOUT_MS });
    assert.equal(run.error, undefined, String(run.error));
    assert.equal(run.status, 0, `${JSON.stringify(command)}: ${run.stderr.toString('utf8')}`);
    assertDelivered(fake.read(), command, 'bash');
  }
});

test('pwsh_delivers_one_remote_element_byte_equal', { skip: NO_PWSH }, (t) => {
  for (const command of CORPUS) {
    const fake = fakeSsh(t);
    const run = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', lineFor(command, 'win32')], { env: fake.env, timeout: SHELL_TIMEOUT_MS });
    assert.equal(run.error, undefined, String(run.error));
    assert.equal(run.status, 0, `${JSON.stringify(command)}: ${run.stderr.toString('utf8')}`);
    assertDelivered(fake.read(), command, 'pwsh');
  }
});

/** The commands of the corpus (and a few like them) that a shell can run, with what they print. HOME is pinned below. */
const RUNNABLE: readonly { command: string; stdout: string }[] = [
  { command: 'echo hi; echo there', stdout: 'hi\nthere\n' },
  { command: `printf '%s|' a\\ b "c;d" '$(x)' && echo; echo "$HOME"`, stdout: 'a b|c;d|$(x)|\n/h\n' },
  { command: 'echo a &', stdout: 'a\n' },
  { command: "printf '%s' 'ünïcode €'", stdout: 'ünïcode €' },
  { command: "printf '[%s]' 'tab\there'", stdout: '[tab\there]' },
  { command: `echo 'it'"'"'s'`, stdout: "it's\n" },
];

for (const sh of ['dash', 'bash', 'zsh']) {
  test(`dash_bash_zsh_parse_the_element_as_the_line (${sh})`, { skip: skipUnless(sh) }, (t) => {
    const env = { ...process.env, HOME: '/h' };
    for (const { command, stdout } of RUNNABLE) {
      const element = deliveredByBash(t, command).toString('utf8');
      const viaSsh = spawnSync(sh, ['-c', element], { env, timeout: SHELL_TIMEOUT_MS, encoding: 'utf8' });
      const direct = spawnSync(sh, ['-c', command], { env, timeout: SHELL_TIMEOUT_MS, encoding: 'utf8' });
      assert.equal(viaSsh.stdout, direct.stdout, `${sh}: ${command}`);
      assert.equal(viaSsh.stderr, direct.stderr, `${sh}: ${command}`);
      assert.equal(viaSsh.status, direct.status, `${sh}: ${command}`);
      assert.equal(viaSsh.stdout, stdout, `${sh}: ${command} printed something else than the corpus says`);
    }
  });
}

/** A login shell that only says it was started. The wrapper's `exec ${SHELL:-sh} -l` runs THIS. */
function loginMarker(t: TestContext): string {
  const marker = path.join(dirOf(t, 'login'), 'marker');
  fs.writeFileSync(marker, "#!/bin/sh\nprintf 'LOGIN-SHELL\\n'\n", { mode: 0o755 });
  return marker;
}

function wrapped(sh: string, line: string, marker: string): { stdout: string; stderr: string; status: number | null } {
  const run = spawnSync(sh, ['-c', stayOpenWrapper(line)], { env: { ...process.env, SHELL: marker }, timeout: SHELL_TIMEOUT_MS, encoding: 'utf8' });
  assert.equal(run.error, undefined, String(run.error));
  return run;
}

for (const sh of ['dash', 'bash', 'zsh']) {
  test(`the_wrapper_keeps_the_login_shell_after_a_comment_and_an_ampersand (${sh})`, { skip: skipUnless(sh) }, (t) => {
    const marker = loginMarker(t);
    const comment = wrapped(sh, 'echo ok # a note', marker);
    assert.equal(comment.stdout, 'ok\nLOGIN-SHELL\n');
    assert.equal(comment.status, 0);
    // `&` runs `echo a` beside the shell, so the order of the two lines is not promised; that both come is.
    const background = wrapped(sh, 'echo a &', marker);
    assert.deepEqual(background.stdout.split('\n').sort(), ['', 'LOGIN-SHELL', 'a']);
    assert.equal(background.stderr, '');
  });

  // MEASURED 2026-11-10, and NOT what spec §S2.4 says for dash: a syntax error in `eval` is an error of a SPECIAL builtin,
  // which ends a non-interactive dash (status 2); bash and zsh report it and go on. The error is still said (ssh shows it
  // and closes). `command eval` would keep dash going; the wrapper text is the spec's, so this test records what is true.
  test(`the_wrapper_reports_an_unclosed_quote_and_a_login_shell_follows_except_in_dash (${sh})`, { skip: skipUnless(sh) }, (t) => {
    const broken = wrapped(sh, "echo 'oops", loginMarker(t));
    assert.notEqual(broken.stderr, '', 'the syntax error is said');
    if (sh === 'dash') {
      assert.equal(broken.status, 2);
      assert.equal(broken.stdout, '');
    } else {
      assert.equal(broken.stdout, 'LOGIN-SHELL\n');
      assert.equal(broken.stderr.endsWith('creds: the command ended with exit code 2\n'), true, broken.stderr);
    }
  });

  test(`the_wrapper_says_a_non_zero_exit (${sh})`, { skip: skipUnless(sh) }, (t) => {
    const marker = loginMarker(t);
    const failed = wrapped(sh, 'false', marker);
    assert.equal(failed.stderr, 'creds: the command ended with exit code 1\n');
    assert.equal(failed.stdout, 'LOGIN-SHELL\n');
    const done = wrapped(sh, 'true', marker);
    assert.equal(done.stderr, '', 'a command that succeeds says nothing');
    assert.equal(done.stdout, 'LOGIN-SHELL\n');
    const exited = wrapped(sh, 'exit 3', marker);
    assert.equal(exited.status, 3);
    assert.equal(exited.stdout.includes('LOGIN-SHELL'), false, 'an exit in the line ends the session, as the parent plan accepts');
  });
}

const VALUE = `' " $HOME \`id\` \\\nsecond line`;

for (const sh of ['dash', 'bash']) {
  test(`the_secrets_script_runs_under_sh_s_with_a_stdin_reading_command (${sh})`, { skip: skipUnless(sh) }, () => {
    const run = (line: string, env: Record<string, string> = {}): { stdout: Buffer; status: number | null } => {
      const r = spawnSync(sh, ['-s'], { input: secretsStdin(env, line), timeout: SHELL_TIMEOUT_MS });
      assert.equal(r.error, undefined, String(r.error));
      return { stdout: r.stdout, status: r.status };
    };
    // A value with every character that ends a quote or starts an expansion comes back byte for byte.
    const round = run('printf %s "$CREDS_REF_1"', { CREDS_REF_1: VALUE });
    assert.ok(round.stdout.equals(Buffer.from(VALUE, 'utf8')), round.stdout.toString('utf8'));
    // A command that reads stdin reads the end of input at once; the rest of the group still runs.
    assert.equal(run('cat; echo after-cat').stdout.toString('utf8'), 'after-cat\n');
    assert.equal(run('echo x # comment').stdout.toString('utf8'), 'x\n');
    assert.equal(run('echo tail \\').stdout.toString('utf8'), 'tail\n');
    assert.equal(run('exit 7').status, 7);
    const failed = run('false');
    assert.equal(failed.status, 1);
    assert.equal(run('true').status, 0);
  });
}
