import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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
 * the machine (research/PLAN_config_key_off_the_command_line.md).</p>
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

test('C++ takes the key back out of its own environment as soon as the child has it (code round)', () => {
  // setenv changes the APPLICATION's environment, not only the child's: left there, every child
  // the application starts later would inherit a key it was never meant to have. The previous
  // value is put back — or the variable removed — right after popen, before anything else runs.
  const cpp = snippetFor('cpp', 'default', CONTEXT).code;
  const launched = cpp.indexOf('popen("creds config", "r")');
  const restored = cpp.search(/unsetenv\("CREDSFORDEVS_KEY"\)/);

  assert.match(cpp, /const char\* before = std::getenv\("CREDSFORDEVS_KEY"\)/, 'the previous value is not saved');
  assert.ok(restored > launched, 'the variable is not removed after popen');
  assert.match(cpp, /setenv\("CREDSFORDEVS_KEY", previous\.c_str\(\), 1\)/, 'a previous value is not put back');
});

/**
 * The C++ snippet's two branches, as the preprocessor sees them: every line under `#ifdef _WIN32` up to
 * its `#else`, and every line under that `#else` up to its `#endif`. More than one block is allowed —
 * the launch and the close are two.
 */
const CPP_BLOCK = /^#ifdef _WIN32\r?\n([\s\S]*?)^#else\r?\n([\s\S]*?)^#endif[^\n]*\n?/gm;

function cppBranches(cpp: string): { windows: string; posix: string; outside: string } {
  const blocks = [...cpp.matchAll(CPP_BLOCK)];
  // Comment lines are prose about the branches and may name either spelling; code outside them may not.
  const outside = cpp.replace(CPP_BLOCK, '').split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  return { windows: blocks.map((m) => m[1]).join('\n'), posix: blocks.map((m) => m[2]).join('\n'), outside };
}

/** Where `needle` sits in `text` — or a failing assertion naming what is missing. */
function at(text: string, needle: string, what: string): number {
  const index = text.indexOf(needle);
  assert.notEqual(index, -1, `${what}: ${needle}`);
  return index;
}

test('C++ has a Windows branch — _putenv_s, _popen, _pclose — that restores the environment exactly as the POSIX one does', () => {
  // The snippet used to be POSIX only and leave Windows to a comment. A paster on Windows got a body
  // that does not compile there. Both branches now set the key, launch, take the key back out right
  // after the launch — put the previous value back, or remove the variable — and close their own pipe.
  const { windows, posix, outside } = cppBranches(snippetFor('cpp', 'default', CONTEXT).code);

  assert.notEqual(windows, '', 'the C++ snippet has no #ifdef _WIN32 branch');
  const set = at(windows, '_putenv_s("CREDSFORDEVS_KEY", key.c_str())', 'Windows does not set the key');
  const launched = at(windows, '_popen("creds config", "r")', 'Windows does not launch through _popen');
  const restored = at(windows, '_putenv_s("CREDSFORDEVS_KEY", previous.c_str())', 'Windows does not put a previous value back');
  const removed = at(windows, '_putenv_s("CREDSFORDEVS_KEY", "")', 'Windows does not remove the variable (an empty _putenv_s removes it)');
  assert.ok(set < launched && launched < restored && launched < removed, 'the Windows branch does not restore right after the launch');
  at(windows, '_pclose(pipe)', 'Windows does not close its own pipe');

  const posixSet = at(posix, 'setenv("CREDSFORDEVS_KEY", key.c_str(), 1)', 'POSIX does not set the key');
  const posixLaunched = at(posix, 'popen("creds config", "r")', 'POSIX does not launch through popen');
  assert.ok(posixSet < posixLaunched && posixLaunched < at(posix, 'unsetenv("CREDSFORDEVS_KEY")', 'POSIX does not remove the variable'));
  at(posix, 'pclose(pipe)', 'POSIX does not close its own pipe');
  // A key that could not be set must not launch creds against whatever key was there before (code round).
  assert.match(windows, /if \(_putenv_s\("CREDSFORDEVS_KEY", key\.c_str\(\)\) != 0\) throw/, 'Windows launches creds even when the key could not be set');
  assert.match(posix, /if \(setenv\("CREDSFORDEVS_KEY", key\.c_str\(\), 1\) != 0\) throw/, 'POSIX launches creds even when the key could not be set');
  // A key that could not be taken back out would reach every later child: both branches hand the result on,
  // and the function stops on it, closing the pipe first (code round 2).
  const cpp = snippetFor('cpp', 'default', CONTEXT).code;
  assert.match(windows, /const int restored = hadBefore \? _putenv_s\("CREDSFORDEVS_KEY", previous\.c_str\(\)\) : _putenv_s\("CREDSFORDEVS_KEY", ""\);/, 'Windows does not keep the restore result');
  assert.match(posix, /const int restored = hadBefore \? setenv\("CREDSFORDEVS_KEY", previous\.c_str\(\), 1\) : unsetenv\("CREDSFORDEVS_KEY"\);/, 'POSIX does not keep the restore result');
  assert.match(cpp, /if \(restored != 0\) \{\s*closeCreds\(pipe\);\s*throw std::runtime_error/, 'a failed restore does not stop the read');
  assert.equal(/\b_?setenv\(|\b_?putenv|\b_?p(?:open|close)\(/.test(outside), false, `a launch or an environment write sits outside both branches:\n${outside}`);
});

// ---------- the snippets RUN: a real pwsh for the PowerShell body, a real compiler for the C++ one ----------

const THREE_LINE_DOCUMENT = ['{', '  "ConnectionStrings": {', '    "Default": "Server=db;Database=app"', '  }', '}'];

/** Nothing spawned here may hold the suite: a probe, a shell, a compiler or the built program gets a minute. */
const SPAWN_TIMEOUT_MS = 60_000;

/**
 * Whether `command` is on this machine — `false` only when it is NOT there. A tool that is there and fails its
 * own probe is a broken machine, and the probe says so instead of quietly skipping the test (code round).
 */
function has(command: string, args: string[]): boolean {
  try {
    execFileSync(command, args, { stdio: 'ignore', timeout: SPAWN_TIMEOUT_MS });
    return true;
  } catch (error) {
    if ((error as { code?: unknown }).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/**
 * A `creds` first on PATH for one child: it reads its key from STDIN (`-`) or from `CREDSFORDEVS_KEY`,
 * refuses when it got neither, and prints the three-line document — line by line, as the real binary
 * writes a file's body. A `.cmd` on Windows, a shell script elsewhere.
 */
function fakeCreds(dir: string): void {
  if (process.platform === 'win32') {
    // `creds config -`: the verb is the first argument, the dash the second — exactly as the sh fake reads `$2`.
    const lines = ['@echo off', 'set "KEY=%CREDSFORDEVS_KEY%"', 'if "%~2"=="-" set /p KEY=', 'if "%KEY%"=="" exit /b 7', ...THREE_LINE_DOCUMENT.map((line) => `echo ${line}`)];
    fs.writeFileSync(path.join(dir, 'creds.cmd'), lines.join('\r\n') + '\r\n');
    return;
  }
  const quoted = THREE_LINE_DOCUMENT.map((line) => `'${line}'`).join(' ');
  const lines = ['#!/bin/sh', 'KEY="$CREDSFORDEVS_KEY"', 'if [ "$2" = "-" ]; then read -r KEY; fi', '[ -n "$KEY" ] || exit 7', `printf '%s\\n' ${quoted}`];
  fs.writeFileSync(path.join(dir, 'creds'), lines.join('\n') + '\n', { mode: 0o755 });
}

/** The child's environment: the fake `creds` first on PATH (whatever the variable is spelled), and the key. */
function childEnv(dir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
  env[pathKey] = `${dir}${path.delimiter}${env[pathKey] ?? ''}`;
  env.CREDSFORDEVS_KEY = 'cfd_test_key_not_a_secret';
  return env;
}

/** Run the real PowerShell body under `shell` against the fake `creds`; the BYTES it wrote to the config file. */
function writtenByPowerShell(shell: string): Buffer {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-pwsh-'));
  try {
    fakeCreds(dir);
    const file = path.join(dir, 'written.json');
    const script = path.join(dir, 'snippet.ps1');
    fs.writeFileSync(script, snippetFor('powershell', 'default', { ...CONTEXT, fileName: file }).code);

    execFileSync(shell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { env: childEnv(dir), stdio: 'pipe', timeout: SPAWN_TIMEOUT_MS });

    return fs.readFileSync(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const UTF8_BOM = [0xef, 0xbb, 0xbf];

/** The document the file holds, line by line — and no byte-order mark in front of it. */
function documentWritten(written: Buffer): void {
  assert.notDeepEqual([...written.subarray(0, 3)], UTF8_BOM, 'a byte-order mark was written — a strict JSON reader rejects the file');
  const text = written.toString('utf8');
  assert.deepEqual(text.split(/\r?\n/).filter((line) => line !== ''), THREE_LINE_DOCUMENT, `the file on disk reads:\n${text}`);
}

test(
  'the PowerShell snippet writes a multi-line config with its lines intact — run through a real pwsh',
  { skip: !has('pwsh', ['-NoProfile', '-NonInteractive', '-Command', 'exit 0']) },
  () => {
    // `$configText` is an ARRAY of lines (PowerShell splits a native command's output), and
    // `Set-Content -NoNewline` concatenates its inputs with nothing between them: a three-line JSON
    // landed on disk as one line with every newline gone — a config with `//` comments, destroyed.
    documentWritten(writtenByPowerShell('pwsh'));
  },
);

test(
  'the PowerShell snippet under Windows PowerShell 5.1 writes the same lines and no byte-order mark',
  { skip: process.platform !== 'win32' || !has('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'exit 0']) },
  () => {
    // `-Encoding utf8` was offered for 5.1 and refused by the code round: there it ADDS a byte-order mark,
    // which a strict JSON reader rejects. No encoding flag — pwsh 7 writes UTF-8 without a mark anyway.
    documentWritten(writtenByPowerShell('powershell.exe'));
  },
);

/** The first C++ compiler on this machine, or `undefined` — the test is then skipped, not faked. */
function cppCompiler(): string | undefined {
  return ['g++', 'clang++', 'c++'].find((compiler) => has(compiler, ['--version']));
}

test(
  'the C++ snippet compiles and runs on this host’s branch — the key reaches creds through the environment and the document comes back',
  { skip: cppCompiler() === undefined },
  () => {
    // Whichever branch this host compiles — `_WIN32` on Windows, POSIX elsewhere — is built with a real
    // compiler and run against the fake `creds`, which exits 7 unless the key reached its environment.
    const compiler = cppCompiler() as string;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-cpp-'));
    try {
      fakeCreds(dir);
      const code = snippetFor('cpp', 'default', CONTEXT).code;
      const tail = code.indexOf('const char* vaultKey');
      assert.notEqual(tail, -1, 'the snippet no longer ends in the statements a main() would hold');
      const program = `${code.slice(0, tail)}\nint main() {\n${code.slice(tail)}\n    std::fputs(readFromVault(vaultKey).c_str(), stdout);\n    return 0;\n}\n`;
      const source = path.join(dir, 'snippet.cpp');
      const binary = path.join(dir, process.platform === 'win32' ? 'snippet.exe' : 'snippet');
      fs.writeFileSync(source, program);
      execFileSync(compiler, ['-std=c++17', '-o', binary, source], { stdio: 'pipe', timeout: SPAWN_TIMEOUT_MS });

      const printed = execFileSync(binary, [], { env: childEnv(dir), encoding: 'utf8', stdio: 'pipe', timeout: SPAWN_TIMEOUT_MS });

      assert.deepEqual(printed.split(/\r?\n/).filter((line) => line !== ''), THREE_LINE_DOCUMENT, `the program printed:\n${printed}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);

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
