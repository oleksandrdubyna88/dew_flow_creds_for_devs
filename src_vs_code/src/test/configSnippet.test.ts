import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_SNIPPET_LANGUAGE,
  SNIPPET_LANGUAGES,
  snippetFor,
  snippetLanguage,
} from '../configSnippet';
import { CONFIG_KEY_PREFIX, newConfigKey } from '../configKey';

/**
 * The twenty snippets the viewer offers, and the properties that make them safe to paste.
 *
 * <p>These are read by people who will not read them first — that is what a snippet IS — so the
 * things asserted here are the ones nobody would notice were missing: that no key is baked in,
 * that no shell is handed a command line to re-read, and that every one fails loudly rather than
 * starting an application against nothing.</p>
 */

const CONTEXT = { envVar: 'CREDSFORDEVS_KEY', fileName: 'appsettings.Development.json' };

function everySnippet(): { id: string; code: string }[] {
  return SNIPPET_LANGUAGES.flatMap((language) =>
    language.variants.map((variant) => ({
      id: `${language.id}:${variant.id}`,
      code: snippetFor(language.id, variant.id, CONTEXT).code,
    })),
  );
}

test('there are twenty languages, and every one of them has a snippet', () => {
  assert.equal(SNIPPET_LANGUAGES.length, 20);

  for (const { id, code } of everySnippet()) {
    assert.ok(code.length > 100, `${id} has no real snippet: ${code.length} characters`);
  }
});

test('NO snippet contains a key, and none could', () => {
  // The property this whole design rests on. The vault keeps only a SHA-256 of the key, so there
  // is nothing to interpolate even by accident — and a snippet is pasted into a repository, where
  // a key would be exactly the leak the feature exists to end.
  const key = newConfigKey();

  for (const { id, code } of everySnippet()) {
    assert.equal(code.includes(CONFIG_KEY_PREFIX), false, `${id} carries something key-shaped`);
    assert.equal(code.includes(key), false, `${id} carries a key`);
  }
});

test('every snippet reads the key from the environment variable it was given', () => {
  for (const { id, code } of everySnippet()) {
    assert.ok(code.includes(CONTEXT.envVar), `${id} never mentions ${CONTEXT.envVar}`);
  }
});

test('the environment variable is substituted, never hard-coded', () => {
  // A different caller must be able to name a different variable; a literal here would make the
  // panel's own text and the code it shows disagree the first time that happened.
  const renamed = snippetFor('python', 'default', { ...CONTEXT, envVar: 'MY_OWN_NAME' });

  assert.ok(renamed.code.includes('MY_OWN_NAME'));
  assert.equal(renamed.code.includes('CREDSFORDEVS_KEY'), false);
  assert.equal(renamed.code.includes('__ENV__'), false, 'the placeholder leaked into the output');
});

test('no placeholder survives into any snippet', () => {
  for (const { id, code } of everySnippet()) {
    assert.equal(code.includes('__ENV__'), false, `${id} still has __ENV__ in it`);
    assert.equal(code.includes('__FILE__'), false, `${id} still has __FILE__ in it`);
  }
});

test('every snippet fails loudly — none of them can start an application against nothing', () => {
  // The failure mode worth guarding: a config read that quietly returns empty is how a service
  // starts against the wrong database, and nobody finds out until it writes something.
  for (const { id, code } of everySnippet()) {
    const shouts = /throw|raise|fatalError|bail!|die |failwith|check\(|set -e|return nil, |return err|Throw New/.test(
      code,
    );
    assert.ok(shouts, `${id} has no visible failure path`);
  }
});

test('the key is passed as an ARGUMENT, not built into a command line for a shell', () => {
  // The one real injection surface a snippet like this has. C++ is the stated exception — popen
  // takes a command string — and it guards by checking the key's alphabet first, which is why it
  // is allowed to concatenate at all.
  // Matched on the CONCATENATION itself, not on the words: every snippet's comment contains the
  // phrase "creds config <key>", and a detector that looked for that flagged all twenty-two.
  const concatenating = everySnippet().filter(({ code }) => /config " \+ key/.test(code));

  assert.deepEqual(
    concatenating.map((one) => one.id).sort(),
    ['cpp:default', 'csharp:netfx'],
    'a new snippet builds a command line for a shell — say why, in place, or use an argument list',
  );
});

test('the two snippets that DO concatenate say so and guard it', () => {
  const cpp = snippetFor('cpp', 'default', CONTEXT).code;
  const netfx = snippetFor('csharp', 'netfx', CONTEXT).code;

  assert.match(cpp, /find_first_not_of/, 'C++ concatenates without checking the alphabet first');
  assert.match(cpp, /popen DOES go through a shell/, 'the reason is not stated where it applies');
  assert.match(netfx, /no ArgumentList/, 'the Framework snippet does not say why it concatenates');
});

test('a version picker exists only where the code genuinely differs', () => {
  // A selector with identical code behind both entries is a promise with nothing behind it.
  for (const language of SNIPPET_LANGUAGES.filter((one) => one.variants.length > 1)) {
    const codes = language.variants.map((v) => snippetFor(language.id, v.id, CONTEXT).code);

    assert.equal(new Set(codes).size, codes.length, `${language.id} offers a choice that changes nothing`);
  }
});

test('C# offers exactly the two .NET generations, and they really differ', () => {
  const csharp = snippetLanguage('csharp');

  assert.deepEqual(csharp?.variants.map((v) => v.id), ['net6', 'netfx']);
  assert.match(snippetFor('csharp', 'net6', CONTEXT).code, /builder\.Configuration\.AddJsonStream/);
  assert.match(snippetFor('csharp', 'netfx', CONTEXT).code, /new ConfigurationBuilder\(\)/);
});

test('the .NET three plug into the platform; the rest hand you a parsed document', () => {
  // Both are useful and they are not the same thing. Twenty entries that all looked equally deep
  // would be the dishonest version of this panel.
  const framework = SNIPPET_LANGUAGES.filter((one) => one.depth === 'framework').map((one) => one.id);

  assert.deepEqual(framework, ['csharp', 'fsharp', 'vbnet']);
  assert.match(snippetFor('csharp', 'net6', CONTEXT).does, /configuration source/);
  assert.match(snippetFor('go', 'default', CONTEXT).does, /parsed document/);
});

test('an unknown language or variant falls back rather than throwing', () => {
  // Both arrive from a <select> in a webview, which is untrusted input like any other.
  assert.equal(snippetFor('cobol', 'default', CONTEXT).code, snippetFor(DEFAULT_SNIPPET_LANGUAGE, 'net6', CONTEXT).code);
  assert.equal(
    snippetFor('python', 'no-such-variant', CONTEXT).code,
    snippetFor('python', 'default', CONTEXT).code,
  );
});

test('the shell snippets write to the file name they were given', () => {
  const bash = snippetFor('bash', 'default', { ...CONTEXT, fileName: 'local.settings.json' }).code;

  assert.ok(bash.includes('local.settings.json'));
  assert.equal(bash.includes('appsettings.Development.json'), false);
});

test('every language says where its snippet goes', () => {
  for (const language of SNIPPET_LANGUAGES) {
    const where = snippetFor(language.id, language.variants[0].id, CONTEXT).where;

    assert.ok(where.length > 10, `${language.id} does not say where to paste it`);
  }
});
