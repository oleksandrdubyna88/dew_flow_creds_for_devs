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

/**
 * How each snippet hands the key to `creds`: the launch it makes, and the line that feeds the key.
 *
 * <p>Pinned per language rather than matched by one clever regex, because the property is
 * per-language syntax and a generic detector is exactly what let the old argument form look safe:
 * it checked for a shell, and the leak was the argument list itself, readable by every process on
 * the machine (todo/PLAN_config_key_off_the_command_line.md).</p>
 */
const STDIN_FEEDS: Readonly<Record<string, { launch: RegExp; feed: RegExp }>> = {
  'csharp:net6': {
    launch: /ArgumentList\.Add\("config"\);\s*start\.ArgumentList\.Add\("-"\);/,
    feed: /StandardInput\.WriteLine\(key\);\s*process\.StandardInput\.Close\(\);/,
  },
  'csharp:netfx': {
    launch: /new ProcessStartInfo\("creds", "config -"\)/,
    feed: /StandardInput\.WriteLine\(key\);\s*process\.StandardInput\.Close\(\);/,
  },
  'fsharp:default': {
    launch: /ArgumentList\.Add\("config"\)\s*start\.ArgumentList\.Add\("-"\)/,
    feed: /StandardInput\.WriteLine\(key\)\s*p\.StandardInput\.Close\(\)/,
  },
  'vbnet:default': {
    launch: /ArgumentList\.Add\("config"\)\s*start\.ArgumentList\.Add\("-"\)/,
    feed: /StandardInput\.WriteLine\(key\)\s*process\.StandardInput\.Close\(\)/,
  },
  'java:default': {
    launch: /new ProcessBuilder\("creds", "config", "-"\)/,
    feed: /try \(var stdin = process\.getOutputStream\(\)\) \{\s*stdin\.write\(\(key \+ "\\n"\)/,
  },
  'kotlin:default': {
    launch: /ProcessBuilder\("creds", "config", "-"\)/,
    feed: /outputStream\.use \{ it\.write\(\(key \+ "\\n"\)/,
  },
  'scala:default': {
    launch: /Seq\("creds", "config", "-"\) #< stdin/,
    feed: /new ByteArrayInputStream\(\(key \+ "\\n"\)/,
  },
  'python:default': {
    launch: /\["creds", "config", "-"\]/,
    feed: /input=key \+ "\\n"/,
  },
  'javascript:esm': {
    launch: /execFileSync\('creds', \['config', '-'\]/,
    feed: /input: key \+ '\\n'/,
  },
  'javascript:cjs': {
    launch: /execFileSync\('creds', \['config', '-'\]/,
    feed: /input: key \+ '\\n'/,
  },
  'typescript:default': {
    launch: /execFileSync\('creds', \['config', '-'\]/,
    feed: /input: key \+ '\\n'/,
  },
  'go:default': {
    launch: /exec\.Command\("creds", "config", "-"\)/,
    feed: /cmd\.Stdin = strings\.NewReader\(key \+ "\\n"\)/,
  },
  'rust:default': {
    launch: /Command::new\("creds"\)\s*\.args\(\["config", "-"\]\)\s*\.stdin\(Stdio::piped\(\)\)/,
    feed: /stdin\.take\(\)[^;]*\.write_all\(format!\("\{key\}\\n"\)\.as_bytes\(\)\)/,
  },
  'php:default': {
    launch: /proc_open\(\['creds', 'config', '-'\], \[0 => \['pipe', 'r'\]/,
    feed: /fwrite\(\$pipes\[0\], \$key \. "\\n"\);\s*fclose\(\$pipes\[0\]\);/,
  },
  'ruby:default': {
    launch: /Open3\.capture2\('creds', 'config', '-', /,
    feed: /stdin_data: key \+ "\\n"/,
  },
  'swift:default': {
    launch: /process\.arguments = \["creds", "config", "-"\]/,
    feed: /input\.fileHandleForWriting\.write\(Data\(\(key \+ "\\n"\)\.utf8\)\)\s*try input\.fileHandleForWriting\.close\(\)/,
  },
  'dart:default': {
    launch: /Process\.start\('creds', \['config', '-'\]\)/,
    feed: /process\.stdin\.writeln\(key\);\s*await process\.stdin\.close\(\);/,
  },
  'perl:default': {
    launch: /open2\(my \$out, my \$in, 'creds', 'config', '-'\)/,
    feed: /print \{\$in\} "\$key\\n";\s*close\(\$in\);/,
  },
  'bash:default': {
    launch: /\| creds config -\)/,
    feed: /printf '%s\\n' "\$\{CREDSFORDEVS_KEY\}" \| creds config -/,
  },
  'powershell:default': {
    launch: /\| & creds config -$/m,
    feed: /\$env:CREDSFORDEVS_KEY \| & creds config -/,
  },
};

/**
 * The two whose standard library cannot write to a child's stdin and read its stdout at once — so
 * the key goes into the CHILD's environment, which only its owner can read, and `creds config`
 * runs with no argument at all.
 */
const ENVIRONMENT_FEEDS: Readonly<Record<string, { launch: RegExp; feed: RegExp; why: RegExp }>> = {
  'cpp:default': {
    launch: /popen\("creds config", "r"\)/,
    feed: /setenv\("CREDSFORDEVS_KEY", key\.c_str\(\), 1\)/,
    why: /popen can read OR write/,
  },
  'elixir:default': {
    launch: /System\.cmd\("creds", \["config"\], env: \[\{"CREDSFORDEVS_KEY", key\}\]\)/,
    feed: /env: \[\{"CREDSFORDEVS_KEY", key\}\]/,
    why: /System\.cmd cannot write to/,
  },
};

/** Every shape the snippets used to pass the key in. Any one of them back is the leak back. */
const ARGUMENT_SHAPES: readonly RegExp[] = [
  /ArgumentList\.Add\(key\)/,
  /"config", key\b/,
  /'config', key\b/,
  /'config', \$key\b/,
  /\.arg\(key\)/,
  /config " \+ key/,
  /creds config "\$\{/,
  /creds config \$env:/,
  /\["config", key\]/,
];

test('every snippet is accounted for: on stdin, or in the environment with its reason', () => {
  const ids = everySnippet().map((one) => one.id).sort();

  assert.deepEqual(ids, [...Object.keys(STDIN_FEEDS), ...Object.keys(ENVIRONMENT_FEEDS)].sort());
});

test('the stdin snippets start `creds config -` and write the key to its stdin, then close it', () => {
  for (const [id, { launch, feed }] of Object.entries(STDIN_FEEDS)) {
    const [language, variant] = id.split(':');
    const code = snippetFor(language, variant, CONTEXT).code;

    assert.match(code, launch, `${id} does not start creds config with "-"`);
    assert.match(code, feed, `${id} does not write the key to stdin and close it`);
  }
});

test('the two environment snippets run `creds config` with no argument and say why', () => {
  for (const [id, { launch, feed, why }] of Object.entries(ENVIRONMENT_FEEDS)) {
    const [language, variant] = id.split(':');
    const code = snippetFor(language, variant, CONTEXT).code;

    assert.match(code, launch, `${id} does not run a constant creds config`);
    assert.match(code, feed, `${id} does not put the key in the child's CREDSFORDEVS_KEY`);
    assert.match(code, why, `${id} does not say why it is not stdin`);
  }
});

test('NO snippet passes the key as an argument — none of the shapes they used to', () => {
  for (const { id, code } of everySnippet()) {
    for (const shape of ARGUMENT_SHAPES) {
      assert.equal(shape.test(code), false, `${id} passes the key as an argument again: ${shape}`);
    }
  }
});

test('the old shapes are what the detector catches — a positive control', () => {
  // Without this, a detector that matched nothing would pass the test above forever. Each line is
  // the launch a snippet shipped with up to extension 1.13.0.
  const old = [
    'start.ArgumentList.Add(key);',
    'new ProcessBuilder("creds", "config", key)',
    "execFileSync('creds', ['config', key], { encoding: 'utf8' })",
    "proc_open(['creds', 'config', $key], [], $pipes)",
    'Command::new("creds").arg("config").arg(key)',
    'new ProcessStartInfo("creds", "config " + key)',
    'config=$(creds config "${CREDSFORDEVS_KEY}")',
    '$configText = & creds config $env:CREDSFORDEVS_KEY',
  ];
  for (const line of old) {
    assert.ok(ARGUMENT_SHAPES.some((shape) => shape.test(line)), `the detector misses: ${line}`);
  }
});

test('no command string handed to a shell carries anything variable', () => {
  // C++ is the one snippet whose launch goes through a shell (popen). Its command is now a
  // constant, so there is nothing a shell could reinterpret and no alphabet check is needed.
  const cpp = snippetFor('cpp', 'default', CONTEXT).code;

  assert.match(cpp, /popen\("creds config", "r"\)/);
  assert.equal(/popen\([^"]/.test(cpp), false, 'C++ hands popen something other than a literal');
});

test('the Framework snippet says why it needs no ArgumentList', () => {
  const netfx = snippetFor('csharp', 'netfx', CONTEXT).code;

  assert.match(netfx, /no ArgumentList/);
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
