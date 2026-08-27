import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeConfigProblem, invalidSaveConfirmation } from '../configFormat';

/**
 * Whether a config body is what it claims to be.
 *
 * <p>A save is never blocked by this — the answer is "saved, but this is not valid JSON", and the
 * row is marked until it parses. Refusing the save would be the worse product: a config is often
 * pasted in halves, and a vault that will not hold work in progress is a vault people keep a copy
 * of on the side, which is the whole problem this feature exists for.</p>
 *
 * <p><b>The checks are not equally exact, and that is stated rather than hidden.</b> JSON and
 * `.env` are checked exactly, because `JSON.parse` exists and `.env` is a line grammar. YAML, XML,
 * TOML and INI are checked STRUCTURALLY, by hand, because the extension ships no runtime
 * dependencies. Each of those accepts documents a real parser would reject, and the cases at the
 * bottom that record what gets through are tests on purpose: a known limit is a decision, an
 * unknown one is a bug report waiting to be filed.</p>
 */

test('a well-formed body of every format passes', () => {
  assert.equal(describeConfigProblem('json', '{"a": 1}'), undefined);
  assert.equal(describeConfigProblem('env', 'DB_PASSWORD=hunter2\n# a note\n\nPORT=5432'), undefined);
  assert.equal(describeConfigProblem('yaml', 'serilog:\n  minimumLevel: Information\n'), undefined);
  assert.equal(describeConfigProblem('xml', '<root><child a="1"/></root>'), undefined);
  assert.equal(describeConfigProblem('toml', '[server]\nport = 5432\n'), undefined);
  assert.equal(describeConfigProblem('ini', '[server]\nport = 5432\n; a note\n'), undefined);
});

test('an empty body is valid for every format', () => {
  // A config entity created and not yet filled in is not a broken one, and marking it would put
  // `!!!` on every entry the moment it was made.
  for (const format of ['json', 'env', 'yaml', 'xml', 'toml', 'ini'] as const) {
    assert.equal(describeConfigProblem(format, ''), undefined, format);
    assert.equal(describeConfigProblem(format, '   \n\n'), undefined, `${format} (whitespace)`);
  }
});

test('the unclosed brace — the case this was asked for — is caught', () => {
  const problem = describeConfigProblem('json', '{\n  "Serilog": {\n    "Default": "Information"\n}\n');

  assert.notEqual(problem, undefined);
  assert.match(problem?.message ?? '', /JSON/i);
});

test('JSON says WHERE, whenever the engine says where', () => {
  // "This is not valid JSON" on a 200-line appsettings is a worse answer than none: it sends
  // somebody off to read the whole file. The line is the useful half.
  const problem = describeConfigProblem('json', '{\n  "x": {\n}\n');

  assert.notEqual(problem, undefined);
  assert.equal(problem?.line, 4, `expected line 4, got ${String(problem?.line)}`);
});

test('and stays silent about the line when the engine does not say — a measured limit', () => {
  // V8 has two message shapes and only one carries a position. Measured on Node 24:
  //   "Expected ',' or '}' after property value in JSON at position 13 (line 4 column 1)"
  //   "Unexpected token 'o', ..."b": oops\n}" is not valid JSON"        <- no position at all
  // The second form carries a context SNIPPET instead, and locating that snippet in the body is
  // guesswork: it spans the failure rather than pointing at it, and the message format is not a
  // contract. So the line is reported when it is known and omitted when it is not — an absent
  // line is honest, and a wrong one sends somebody to the wrong place.
  const problem = describeConfigProblem('json', '{\n  "a": 1,\n  "b": oops\n}');

  assert.notEqual(problem, undefined, 'the body is still reported as invalid');
  assert.equal(problem?.line, undefined);
  assert.match(problem?.message ?? '', /JSON/i);
});

test('an env line that is not a comment and has no `=` is named by number', () => {
  const problem = describeConfigProblem('env', 'A=1\nthis is prose\nB=2');

  assert.notEqual(problem, undefined);
  assert.equal(problem?.line, 2);
  assert.match(problem?.message ?? '', /=/);
});

test('env accepts what a real .env accepts: export, comments, blanks, empty values', () => {
  assert.equal(describeConfigProblem('env', 'export PATH_EXTRA=/opt/bin'), undefined);
  assert.equal(describeConfigProblem('env', 'EMPTY='), undefined, 'an empty value is a value');
  assert.equal(describeConfigProblem('env', '  # indented comment'), undefined);
  assert.equal(describeConfigProblem('env', 'QUOTED="a=b=c"'), undefined, 'only the FIRST = splits');
});

test('an env key that could not be exported is refused', () => {
  // A name a shell cannot carry is not a variable, however well-formed the line looks.
  assert.notEqual(describeConfigProblem('env', '9LIVES=cat'), undefined);
  assert.notEqual(describeConfigProblem('env', 'has-dash=1'), undefined);
});

test('YAML refuses a tab used as indentation, which is the error nobody can see', () => {
  // The one YAML mistake that is invisible in an editor and forbidden by the spec outright.
  const problem = describeConfigProblem('yaml', 'root:\n\tchild: 1\n');

  assert.notEqual(problem, undefined);
  assert.match(problem?.message ?? '', /tab/i);
  assert.equal(problem?.line, 2);
});

test('XML catches the tag that was never closed, and the one closed out of order', () => {
  assert.notEqual(describeConfigProblem('xml', '<root><child></root>'), undefined);
  assert.notEqual(describeConfigProblem('xml', '<a><b></a></b>'), undefined);
  assert.equal(
    describeConfigProblem('xml', '<a><b/><!-- </a> --></a>'),
    undefined,
    'a tag inside a comment is text, not structure',
  );
});

test('TOML and INI catch the unclosed section header', () => {
  assert.notEqual(describeConfigProblem('toml', '[server\nport = 1'), undefined);
  assert.notEqual(describeConfigProblem('ini', '[server\nport = 1'), undefined);
});

test('an unclosed ${ is caught in EVERY format, because it is text in all of them', () => {
  // The case asked for by name. A body can be perfect JSON and still be broken this way: the
  // placeholder sits inside a string, so no parser objects, and what reaches the application is
  // a literal `${DB_PASSWORD`.
  const problem = describeConfigProblem('json', '{"pw": "${DB_PASSWORD"}');

  assert.notEqual(problem, undefined, 'valid JSON, broken placeholder');
  assert.match(problem?.message ?? '', /\$\{/);

  assert.notEqual(describeConfigProblem('env', 'PW=${DB_PASSWORD'), undefined);
  assert.notEqual(describeConfigProblem('yaml', 'pw: ${DB_PASSWORD'), undefined);
});

test('a closed ${ } is left alone, and a bare $ is not a placeholder', () => {
  assert.equal(describeConfigProblem('env', 'PW=${DB_PASSWORD}'), undefined);
  assert.equal(describeConfigProblem('env', 'PRICE=$100'), undefined);
  assert.equal(describeConfigProblem('env', 'SHELL_STYLE=$HOME/bin'), undefined);
});

test('the structural checkers accept things a real parser would not — recorded, not hidden', () => {
  // Each of these is a KNOWN limit of a hand-written checker, written down so that "valid" reads
  // as "nothing obviously wrong" rather than as "a parser accepted this". Turning any of them
  // into a failure is a deliberate change, and this test is where it will be noticed.
  assert.equal(
    describeConfigProblem('yaml', 'a: 1\n a: 2\n'),
    undefined,
    'YAML: inconsistent indentation is not detected',
  );
  assert.equal(
    describeConfigProblem('yaml', 'a: "unterminated\n'),
    undefined,
    'YAML: an unterminated quote is not detected',
  );
  assert.equal(
    describeConfigProblem('toml', 'port = = 5432\n'),
    undefined,
    'TOML: the value side is not parsed at all',
  );
});

test('the question names the format, says what is wrong, and offers to save anyway', () => {
  // Asked before the write, while the form is still open and the cursor is still where it was —
  // the first shape of this reported the same fact in a toast after the form had closed, by which
  // point the only thing to do about it was open the entry again.
  const problem = describeConfigProblem('json', '{\n"a": 1\n');
  assert.notEqual(problem, undefined);

  const notice = invalidSaveConfirmation('appsettings.Development.json', 'json', problem!);

  assert.match(notice, /Save it anyway/);
  assert.match(notice, /not valid JSON/);
  assert.match(notice, /!!!/);
  assert.match(notice, /appsettings\.Development\.json/);
});

test('the question names a line only when one is known', () => {
  const withLine = invalidSaveConfirmation('a', 'env', { message: 'Nope.', line: 7 });
  const without = invalidSaveConfirmation('a', 'env', { message: 'Nope.' });

  assert.match(withLine, /line 7/);
  assert.equal(/line/.test(without), false, 'a guessed line is worse than no line');
});
