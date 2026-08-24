import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeFlag, helpProbes, isProbeSafe } from '../helpText';

/**
 * Reading a flag's meaning out of a CLI's own `--help`.
 *
 * <p>There is no standard for this text, so the parser is a heuristic over the three
 * shapes that actually occur — description on the same line, description on the next
 * line, and a short/long pair sharing one description. It has to fail QUIETLY: a wrong
 * note is worse than no note, because the note is the thing being trusted later.</p>
 */

const CLAP = [
  'Options:',
  '  -s, --sso-session <NAME>   The SSO session to use from ~/.aws/config',
  '  -r, --region <REGION>      AWS region to send the request to',
  '      --no-verify-ssl        Do not verify SSL certificates',
  '  -h, --help                 Print help',
].join(String.fromCharCode(10));

const NEXT_LINE = [
  'Options:',
  '  --namespace=NAMESPACE',
  '      If present, the namespace scope for this CLI request',
  '  --output=OUTPUT',
  '      Output format. One of: json|yaml|wide',
].join(String.fromCharCode(10));

test('a description on the same line is read', () => {
  assert.equal(describeFlag(CLAP, '--sso-session'), 'The SSO session to use from ~/.aws/config');
  assert.equal(describeFlag(CLAP, '--region'), 'AWS region to send the request to');
});

test('a long flag is found through its short alias line', () => {
  assert.equal(describeFlag(CLAP, '-s'), 'The SSO session to use from ~/.aws/config');
});

test('a flag with no short alias is still found', () => {
  assert.equal(describeFlag(CLAP, '--no-verify-ssl'), 'Do not verify SSL certificates');
});

test('a description on the following line is read', () => {
  assert.equal(
    describeFlag(NEXT_LINE, '--namespace'),
    'If present, the namespace scope for this CLI request',
  );
  assert.equal(describeFlag(NEXT_LINE, '--output'), 'Output format. One of: json|yaml|wide');
});

test('a flag that is not there returns nothing rather than a neighbour', () => {
  // The failure mode that matters: confidently attaching the WRONG explanation.
  assert.equal(describeFlag(CLAP, '--profile'), undefined);
  assert.equal(describeFlag(NEXT_LINE, '--nam'), undefined);
});

test('a prefix of a real flag does not match it', () => {
  assert.equal(describeFlag(CLAP, '--region-x'), undefined);
  assert.equal(describeFlag(CLAP, '--sso'), undefined);
});

test('junk in, nothing out', () => {
  assert.equal(describeFlag('', '--x'), undefined);
  assert.equal(describeFlag(CLAP, ''), undefined);
  assert.equal(describeFlag(CLAP, 'notaflag'), undefined);
});

test('the probes are argv arrays, never a shell string', () => {
  // A command assembled into a shell line is a command someone can inject into. These
  // are spawned with an argv array and no shell, which is why this is asserted.
  const probes = helpProbes('aws sso login');

  assert.ok(probes.length >= 2);
  for (const p of probes) {
    assert.equal(p.file, 'aws');
    assert.ok(Array.isArray(p.args));
    assert.ok(p.args.every((a) => typeof a === 'string'));
  }
  assert.deepEqual(probes[0], { file: 'aws', args: ['sso', 'login', '--help'] });
});

test('a bare command still gets probed', () => {
  assert.deepEqual(helpProbes('terraform')[0], { file: 'terraform', args: ['--help'] });
});

test('nothing to probe is an empty list, not a crash', () => {
  assert.deepEqual(helpProbes('   '), []);
});

test('only a plain tool name is ever probed', () => {
  // On Windows a `.cmd` shim cannot be spawned without a shell, and a shell is a place
  // things get injected. Rather than reason about quoting, nothing with a shell
  // metacharacter is probed at all — and a shared entry is exactly where one would come
  // from, so this is not hypothetical.
  assert.equal(isProbeSafe('aws sso login'), true);
  assert.equal(isProbeSafe('docker-compose up'), true);
  assert.equal(isProbeSafe('./my-tool'), true);

  for (const bad of [
    'aws & calc',
    'aws | tee x',
    'aws; rm -rf /',
    'aws $(whoami)',
    'aws `whoami`',
    'aws > out.txt',
    'aws "quoted thing"',
    'aws %PATH%',
    '',
  ]) {
    assert.equal(isProbeSafe(bad), false, bad);
  }
});

test('an unsafe command yields no probes at all', () => {
  assert.deepEqual(helpProbes('aws & calc'), []);
});

/* --- Shapes taken from real tools on a real machine, because the invented ones all
   passed and these did not. --- */

const DOCKER = [
  'Options:',
  '      --rm                               Automatically remove the',
  '                                         container and its associated',
  '                                         anonymous volumes when it exits',
  '      --runtime string                   Runtime to use for this container',
].join(String.fromCharCode(10));

const GIT_USAGE = [
  'usage: git commit [-a | --interactive | --patch] [-s] [-v] [-u<mode>] [--amend]',
  '           [--dry-run] [(-c | -C | --squash) <commit> | --fixup [(amend|reword):]<commit>]',
  '           [-F <file> | -m <msg>] [--reset-author] [--allow-empty]',
  '           [--allow-empty-message] [--no-verify] [-e] [--author=<author>]',
].join(String.fromCharCode(10));

test('a wrapped description is joined, not truncated at the first line break', () => {
  // Observed: `--rm` came back as "Automatically remove the". A note that stops mid
  // sentence is worse than none — it reads as if that IS the whole meaning.
  assert.equal(
    describeFlag(DOCKER, '--rm'),
    'Automatically remove the container and its associated anonymous volumes when it exits',
  );
});

test('joining stops at the next flag, and does not swallow its description', () => {
  assert.equal(describeFlag(DOCKER, '--runtime'), 'Runtime to use for this container');
});

test('a usage synopsis is never mistaken for a description', () => {
  // Observed, and the worst failure this file can have: `-m` came back as
  // "[--allow-empty-message] [--no-verify] [-e] [--author=<author>]" — confident,
  // attached to the row, and complete nonsense.
  assert.equal(describeFlag(GIT_USAGE, '-m'), undefined);
  assert.equal(describeFlag(GIT_USAGE, '--amend'), undefined);
  assert.equal(describeFlag(GIT_USAGE, '--allow-empty'), undefined);
});

test('a bracketed flag list is not a definition', () => {
  const npmish = '[--workspaces] [--include-workspace-root] [--install-links]';
  assert.equal(describeFlag(npmish, '--workspaces'), undefined);
});

test('bundled short flags are explained letter by letter', () => {
  // `docker run -it` is one of the most typed commands there is, and no help text has an
  // entry for `-it`. Splitting the bundle is the difference between a useful note and a
  // dash on the row people will actually paste.
  const help = [
    'Options:',
    '  -i, --interactive    Keep STDIN open even if not attached',
    '  -t, --tty            Allocate a pseudo-TTY',
  ].join(String.fromCharCode(10));

  assert.equal(
    describeFlag(help, '-it'),
    'Keep STDIN open even if not attached; Allocate a pseudo-TTY',
  );
});

test('a bundle is only split when the whole of it is explained', () => {
  // Half an answer presented as the answer is the failure mode; better to say nothing.
  const help = '  -i, --interactive    Keep STDIN open';
  assert.equal(describeFlag(help, '-it'), undefined);
});

test('a long flag is never treated as a bundle', () => {
  assert.equal(describeFlag('  -r, --rm   Remove it', '--rm'), 'Remove it');
});
