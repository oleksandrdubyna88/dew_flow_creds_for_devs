import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SCRIPT_LANGUAGES,
  detectSecretPrints,
  highlightScript,
  resolveScriptEnv,
  substituteScript,
} from '../scriptRender';

/**
 * Scripts: a big body with the CHANGEABLE parts pulled out into variables. The body
 * stays generic; `${NAME}` marks where a variable lands; the substituted result is what
 * gets copied to actually run somewhere.
 */

test('variables substitute into the body', () => {
  const out = substituteScript('aws s3 cp ${FILE} s3://${BUCKET}/', [
    { name: 'FILE', value: 'report.pdf' },
    { name: 'BUCKET', value: 'prod-backups' },
  ]);

  assert.equal(out, 'aws s3 cp report.pdf s3://prod-backups/');
});

test('a disabled variable stays a placeholder — visible, not silently empty', () => {
  const out = substituteScript('echo ${A} ${B}', [
    { name: 'A', value: 'yes' },
    { name: 'B', value: 'no', disabled: true },
  ]);

  assert.equal(out, 'echo yes ${B}');
});

test('an unknown placeholder is left alone rather than swallowed', () => {
  assert.equal(substituteScript('echo ${NOT_DEFINED}', []), 'echo ${NOT_DEFINED}');
});

test('a variable used twice lands twice', () => {
  assert.equal(
    substituteScript('${ENV}-a ${ENV}-b', [{ name: 'ENV', value: 'prod' }]),
    'prod-a prod-b',
  );
});

test('highlighting escapes HTML BEFORE anything else — the body goes into a webview', () => {
  // The one non-negotiable property: a script containing markup must never become
  // markup. Everything else about highlighting is cosmetics.
  const html = highlightScript('echo "<script>alert(1)</script>"', 'bash');

  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes('&lt;script&gt;'), true);
});

test('comments and strings get their spans', () => {
  const bash = highlightScript('# comment\necho "hello"', 'bash');
  assert.match(bash, /<span class="tok-comment"># comment<\/span>/);
  assert.match(bash, /<span class="tok-string">&quot;hello&quot;<\/span>/);

  const py = highlightScript("# note\nx = 'v'", 'python');
  assert.match(py, /tok-comment/);
  assert.match(py, /tok-string/);
});

test('keywords of the chosen language are marked', () => {
  assert.match(highlightScript('if x:\n  return y', 'python'), /<span class="tok-kw">if<\/span>/);
  assert.match(highlightScript('SELECT id FROM t', 'sql'), /<span class="tok-kw">SELECT<\/span>/);
  assert.match(highlightScript('function f() {}', 'javascript'), /<span class="tok-kw">function<\/span>/);
});

test('variable placeholders are highlighted in every language', () => {
  assert.match(highlightScript('cp ${SRC} .', 'bash'), /<span class="tok-var">\$\{SRC\}<\/span>/);
});

test('an unknown language still escapes and renders, without keyword spans', () => {
  const html = highlightScript('anything <b>here</b>', 'other');
  assert.equal(html.includes('<b>'), false);
  assert.equal(html.includes('tok-kw'), false);
});

test('the language list covers the popular ones and each has an id and a label', () => {
  const ids = SCRIPT_LANGUAGES.map((l) => l.id);
  for (const want of ['bash', 'powershell', 'python', 'javascript', 'sql', 'yaml', 'other']) {
    assert.ok(ids.includes(want), want);
  }
  for (const l of SCRIPT_LANGUAGES) {
    assert.ok(l.id.length > 0 && l.label.length > 0);
  }
});

/* --- env injection: values reach the process, never the script text --- */

test('bash needs no translation — ${NAME} is already how a shell reads the environment', () => {
  const plan = resolveScriptEnv('aws s3 sync ${SRC} s3://${BUCKET}/', [
    { name: 'SRC', value: './dist' },
    { name: 'BUCKET', value: 'prod-secret-bucket' },
  ], 'bash');

  assert.equal(plan.body, 'aws s3 sync ${SRC} s3://${BUCKET}/');
  assert.deepEqual(plan.env, { SRC: './dist', BUCKET: 'prod-secret-bucket' });
});

test('no value ever appears in the translated body, in any language', () => {
  // The property this whole change exists for: the body is written to a file and shown
  // in the viewer, so a value inside it is a value on disk and on screen.
  for (const lang of ['bash', 'powershell', 'python', 'javascript']) {
    const plan = resolveScriptEnv('use ${TOKEN} here', [{ name: 'TOKEN', value: 'hunter2-secret' }], lang);
    assert.equal(plan.body.includes('hunter2-secret'), false, lang);
    assert.equal(plan.env.TOKEN, 'hunter2-secret', lang);
  }
});

test('each language reads the variable its own way', () => {
  const vars = [{ name: 'TOKEN', value: 'x' }];
  assert.match(resolveScriptEnv('${TOKEN}', vars, 'powershell').body, /^\$env:TOKEN$/);
  assert.match(resolveScriptEnv('${TOKEN}', vars, 'javascript').body, /^process\.env\.TOKEN$/);
  assert.match(resolveScriptEnv('${TOKEN}', vars, 'python').body, /os\.environ/);
});

test('python gets its import, and only when something was actually translated', () => {
  const withVar = resolveScriptEnv('print(${A})', [{ name: 'A', value: '1' }], 'python');
  assert.match(withVar.body, /^import os/);

  const without = resolveScriptEnv('print("hello")', [], 'python');
  assert.equal(without.body, 'print("hello")');
});

test('a disabled variable stays a literal placeholder and contributes no env', () => {
  const plan = resolveScriptEnv('a ${A} b ${B}', [
    { name: 'A', value: 'on' },
    { name: 'B', value: 'off-value', disabled: true },
  ], 'powershell');

  assert.match(plan.body, /\$env:A/);
  assert.match(plan.body, /\$\{B\}/);
  assert.equal('B' in plan.env, false);
  assert.equal(plan.body.includes('off-value'), false);
});

test('an unknown placeholder is left alone, never translated into a read of nothing', () => {
  const plan = resolveScriptEnv('${NOPE}', [], 'powershell');

  assert.equal(plan.body, '${NOPE}');
  assert.deepEqual(plan.env, {});
});

test('a language with no interpreter is left verbatim — nothing will read an environment', () => {
  const plan = resolveScriptEnv('SELECT ${A}', [{ name: 'A', value: 'v' }], 'sql');

  assert.equal(plan.body, 'SELECT ${A}');
  assert.deepEqual(plan.env, { A: 'v' });
});

/* --- the residual: a script the user wrote can print its own variables --- */

test('a script that prints a variable is flagged, per language', () => {
  // Env injection keeps values out of the file and the viewer. It cannot stop a script
  // from printing them itself — that is the user's own code. So: say so, once.
  const names = ['TOKEN'];

  assert.deepEqual(detectSecretPrints('echo "${TOKEN}"', names, 'bash'), ['TOKEN']);
  assert.deepEqual(detectSecretPrints('Write-Host ${TOKEN}', names, 'powershell'), ['TOKEN']);
  assert.deepEqual(detectSecretPrints('print(${TOKEN})', names, 'python'), ['TOKEN']);
  assert.deepEqual(detectSecretPrints('console.log(${TOKEN})', names, 'javascript'), ['TOKEN']);
});

test('using a variable without printing it is not flagged', () => {
  // The common, correct case: pass it to a tool. Warning on this would train people to
  // dismiss the warning.
  assert.deepEqual(detectSecretPrints('curl -H "Auth: ${TOKEN}" https://x', ['TOKEN'], 'bash'), []);
  assert.deepEqual(detectSecretPrints('aws s3 sync ${SRC} s3://b/', ['SRC'], 'bash'), []);
});

test('only variables that actually carry a value are considered', () => {
  assert.deepEqual(detectSecretPrints('echo "${OTHER}"', ['TOKEN'], 'bash'), []);
});

test('each flagged name is reported once, however many times it is printed', () => {
  assert.deepEqual(detectSecretPrints('echo ${A}\necho ${A}', ['A'], 'bash'), ['A']);
});

test('an unknown language flags nothing rather than guessing', () => {
  assert.deepEqual(detectSecretPrints('echo ${A}', ['A'], 'sql'), []);
});
