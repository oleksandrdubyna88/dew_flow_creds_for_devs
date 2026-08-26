import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildCommandLineWithRefs,
  planRefs,
  refVarName,
  rewriteRefs,
  rewriteScriptRefs,
  shellRead,
} from '../runPlan';

const REF = 'creds://work@corp.com/prod-db/password';
const REF2 = 'creds://work@corp.com/api/dbPassword';

test('every distinct reference gets a numbered variable, in the order they appear', () => {
  const plan = planRefs([`psql ${REF}`, `curl -H "Auth: ${REF2}" ${REF}`]);
  assert.deepEqual(plan.refs, [REF, REF2]);
  assert.deepEqual(plan.names, { [REF]: 'CREDS_REF_1', [REF2]: 'CREDS_REF_2' });
  assert.equal(refVarName(0), 'CREDS_REF_1');
});

test('a text with no reference plans nothing', () => {
  assert.deepEqual(planRefs(['plain --flag value']).refs, []);
});

test('the shell read follows the SHELL, not the OS — a Windows git-bash needs the POSIX form', () => {
  assert.equal(shellRead('X', 'win32', 'C:\\Program Files\\Git\\bin\\bash.exe'), '"$X"');
  assert.equal(shellRead('X', 'win32', 'C:\\WINDOWS\\System32\\cmd.exe'), '%X%');
  assert.equal(shellRead('X', 'win32', 'C:\\...\\powershell.exe'), '$env:X');
  assert.equal(shellRead('X', 'win32', undefined), '$env:X', 'Windows default');
  assert.equal(shellRead('X', 'linux', '/bin/zsh'), '"$X"');
});

test('a reference in a command line becomes a variable read — never the value in argv', () => {
  const plan = planRefs([`psql ${REF}`]);
  const line = buildCommandLineWithRefs('psql', [{ value: REF }], plan, 'linux', '/bin/bash');
  assert.equal(line, 'psql "$CREDS_REF_1"');
  assert.equal(line.includes('creds://'), false, 'the reference itself is gone too');
});

test('a disabled argument stays out of the line, as it does without references', () => {
  const plan = planRefs([REF]);
  const line = buildCommandLineWithRefs(
    'aws',
    [{ value: '--debug', disabled: true }, { value: REF }],
    plan,
    'linux',
    '/bin/bash',
  );
  assert.equal(line, 'aws "$CREDS_REF_1"');
});

test('an empty command produces an empty line, whatever the arguments say', () => {
  assert.equal(buildCommandLineWithRefs('   ', [{ value: REF }], planRefs([REF]), 'linux'), '');
});

test('the same reference twice reads one variable both times', () => {
  const plan = planRefs([`${REF} and ${REF}`]);
  assert.equal(rewriteRefs(`${REF} ${REF}`, plan, 'linux', '/bin/sh'), '"$CREDS_REF_1" "$CREDS_REF_1"');
});

test('a script body reads its references in its OWN language, not the shell', () => {
  const plan = planRefs([REF]);
  assert.equal(rewriteScriptRefs(`echo ${REF}`, plan, 'bash'), 'echo "$CREDS_REF_1"');
  assert.equal(rewriteScriptRefs(`Write-Host ${REF}`, plan, 'powershell'), 'Write-Host $env:CREDS_REF_1');
  assert.equal(rewriteScriptRefs(`console.log(${REF})`, plan, 'javascript'), 'console.log(process.env.CREDS_REF_1)');
});

test('a python script that needed a reference gets the import, and only then', () => {
  const plan = planRefs([REF]);
  assert.equal(
    rewriteScriptRefs(`print(${REF})`, plan, 'python'),
    "import os\nprint(os.environ.get('CREDS_REF_1', ''))",
  );
  assert.equal(rewriteScriptRefs('print(1)', plan, 'python'), 'print(1)', 'nothing translated, no import');
  assert.equal(
    rewriteScriptRefs(`import os\nprint(${REF})`, plan, 'python'),
    "import os\nprint(os.environ.get('CREDS_REF_1', ''))",
    'an existing import is not duplicated',
  );
});

test('a language with no interpreter is left verbatim — nothing there reads an environment', () => {
  const plan = planRefs([REF]);
  assert.equal(rewriteScriptRefs(`SELECT ${REF}`, plan, 'sql'), `SELECT ${REF}`);
});
