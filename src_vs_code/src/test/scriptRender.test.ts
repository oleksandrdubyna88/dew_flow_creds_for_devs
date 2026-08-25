import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SCRIPT_LANGUAGES,
  highlightScript,
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
