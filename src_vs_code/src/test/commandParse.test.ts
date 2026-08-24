import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCommandLine } from '../commandLine';
import { parseCommandLine, splitTokens } from '../commandParse';

/**
 * Turning a pasted command line into rows. The reason it is worth doing at all: nobody
 * types an argument list into a form, they paste the line they already have — and a form
 * that then makes them re-key it row by row is a form they will not use twice.
 */

test('quotes hold a value together', () => {
  assert.deepEqual(
    splitTokens('git commit -m "two words" --amend').map((t) => t.text),
    ['git', 'commit', '-m', 'two words', '--amend'],
  );
});

test('the raw text of a token keeps its quotes, so nothing is lost on the way back', () => {
  assert.deepEqual(
    splitTokens('git commit -m "two words"').map((t) => t.raw),
    ['git', 'commit', '-m', '"two words"'],
  );
});

test('a flag and its value become ONE row', () => {
  const r = parseCommandLine('aws sso login --sso-session OD-org');

  assert.equal(r.command, 'aws sso login');
  assert.deepEqual(r.args.map((a) => a.value), ['--sso-session OD-org']);
});

test('an =-joined flag is one row as written', () => {
  const r = parseCommandLine('kubectl get pods --namespace=prod');

  assert.deepEqual(r.args.map((a) => a.value), ['--namespace=prod']);
});

test('a flag with no value stands alone, and does not eat the next flag', () => {
  const r = parseCommandLine('docker build --no-cache --pull -t myimage');

  assert.deepEqual(r.args.map((a) => a.value), ['--no-cache', '--pull', '-t myimage']);
});

test('the verb stops at the first thing that is not a subcommand', () => {
  // `a.txt` has a dot, so it is a value; `cp` is a subcommand. Guessing this is the whole
  // job, and the guess has to be visible and editable rather than clever.
  const r = parseCommandLine('aws s3 cp a.txt s3://bucket/');

  assert.equal(r.command, 'aws s3 cp');
  assert.deepEqual(r.args.map((a) => a.value), ['a.txt', 's3://bucket/']);
});

test('the verb never runs away — three words at most', () => {
  const r = parseCommandLine('one two three four five');

  assert.equal(r.command, 'one two three');
  assert.deepEqual(r.args.map((a) => a.value), ['four', 'five']);
});

test('a bare command produces no rows', () => {
  const r = parseCommandLine('terraform');

  assert.equal(r.command, 'terraform');
  assert.deepEqual(r.args, []);
});

test('empty input is not an error', () => {
  assert.deepEqual(parseCommandLine('   '), { command: '', args: [] });
});

test('what was pasted is what will run', () => {
  // The round-trip is the real assertion: a parse that changes the command is worse than
  // no parse, because it changes it silently.
  for (const line of [
    'aws sso login --sso-session OD-org',
    'kubectl get pods --namespace=prod -o json',
    'git commit -m "two words" --amend',
    'docker run --rm -it ubuntu:24.04 bash',
  ]) {
    const r = parseCommandLine(line);
    assert.equal(buildCommandLine(r.command, r.args), line, line);
  }
});

test('a leading dollar or prompt character is dropped', () => {
  // Half the commands in the world are copied out of a README with the prompt attached.
  assert.equal(parseCommandLine('$ npm ci').command, 'npm ci');
  assert.equal(parseCommandLine('> npm ci').command, 'npm ci');
});
