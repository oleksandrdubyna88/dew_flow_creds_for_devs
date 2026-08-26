// Integration test: drives the REAL masked terminal against a REAL child process, with
// `vscode` stubbed the way the other itests do.
//
//   npm run compile && node scripts/masked-run-itest.cjs
//
// What it proves that the unit tests cannot: the pseudoterminal actually spawns through the
// shell it was given, the child actually receives the secret in its environment, and what the
// terminal is asked to display has the value replaced. It runs on Windows and on Linux/WSL,
// which is the point — the shell that executes the line and the syntax the reference was
// rewritten into have to agree on both.
const path = require('path');
const os = require('os');
const fs = require('fs');
const Module = require('module');

// ---- vscode stub: an EventEmitter and a createTerminal that runs the pty -----------------
const written = [];
let closedWith;
const stub = path.join(os.tmpdir(), `creds-masked-vscode-stub-${process.pid}.cjs`);
fs.writeFileSync(
  stub,
  `class EventEmitter {
     constructor() { this.listeners = []; }
     event = (listener) => { this.listeners.push(listener); return { dispose() {} }; };
     fire(value) { for (const l of this.listeners) { l(value); } }
   }
   module.exports = {
     EventEmitter,
     window: {
       createTerminal: (options) => {
         global.__CREDS_PTY__ = options.pty;
         return { show() {}, dispose() {}, name: options.name };
       },
     },
     workspace: { workspaceFolders: undefined },
   };`,
);
const originalResolve = Module._resolveFilename;
Module._resolveFilename = (request, ...rest) =>
  request === 'vscode' ? stub : originalResolve.call(Module, request, ...rest);

const OUT = path.join(__dirname, '..', 'out');
const { runInMaskedTerminal } = require(path.join(OUT, 'maskedTerminal.js'));
const { planRefs, buildCommandLineWithRefs, shellRead } = require(path.join(OUT, 'runPlan.js'));
// The placeholder comes from the shared masker, so the check follows it rather than a literal.
const { MASK } = require(path.join(OUT, 'outputMask.js'));

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ` — ${detail}`}`);
  if (!ok) {
    failures += 1;
  }
}

const SECRET = 'sup3r-secret-token-value';
const REF = 'creds://me@example.com/api/password';

/** The shell to run through — the one a developer's VS Code would report. */
function shellFor() {
  if (process.platform === 'win32') {
    // Both are worth covering; PowerShell is the VS Code default on Windows and the one the
    // naive `shell: true` (cmd.exe) would have got wrong.
    return 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
  }
  return '/bin/bash';
}

function runOnce(commandLine, env, secrets, shell) {
  return new Promise((resolve) => {
    written.length = 0;
    closedWith = undefined;
    runInMaskedTerminal({
      name: 'itest',
      commandLine,
      env,
      secrets,
      shell,
      cwd: os.tmpdir(),
      banner: 'itest banner',
    });
    const pty = global.__CREDS_PTY__;
    pty.onDidWrite((text) => written.push(text));
    pty.onDidClose((code) => {
      closedWith = code;
      resolve({ output: written.join(''), code });
    });
    pty.open();
  });
}

async function main() {
  const shell = shellFor();

  // ---- 1. a command that ECHOES its own secret gets masked -------------------------------
  const plan = planRefs([REF]);
  const name = plan.names[REF];
  const read = shellRead(name, process.platform, shell);
  // The line a user would have stored, with the reference where the value would be.
  const line = buildCommandLineWithRefs('echo', [{ value: REF }], plan, process.platform, shell);
  check('the reference became a variable read, not the value', line === `echo ${read}`, line);
  check('the command line carries no secret and no reference', !line.includes(SECRET) && !line.includes('creds://'), line);

  const echoed = await runOnce(line, { [name]: SECRET }, [SECRET], shell);
  check(
    'the child received the secret through its environment (it printed something)',
    echoed.output.trim().length > 'itest banner'.length,
    JSON.stringify(echoed.output),
  );
  check(
    'the value the child printed is MASKED in what the terminal shows',
    !echoed.output.includes(SECRET),
    JSON.stringify(echoed.output),
  );
  check('and the masked placeholder stands in its place', echoed.output.includes(MASK), JSON.stringify(echoed.output));
  check('the exit code is reported', echoed.output.includes('[exit 0]'), JSON.stringify(echoed.output));
  check('the pty closed with the child code', closedWith === 0, String(closedWith));

  // ---- 2. a secret split across writes is still caught ------------------------------------
  // Two echoes, each printing half of the secret's neighbourhood, so the value crosses the
  // boundary between two `data` events in the general case.
  const half = process.platform === 'win32'
    ? `$env:${name}.Substring(0,10); $env:${name}.Substring(10)`
    : `printf %s "\${${name}:0:10}"; sleep 0.05; printf '%s\\n' "\${${name}:10}"`;
  const split = await runOnce(half, { [name]: SECRET }, [SECRET], shell);
  if (process.platform === 'win32') {
    // PowerShell prints the two halves on separate lines, so the value never reassembles —
    // the honest thing to check there is that neither half is a whole secret.
    check('windows: no whole secret appears', !split.output.includes(SECRET), JSON.stringify(split.output));
  } else {
    check(
      'a secret split across two writes is still masked',
      !split.output.includes(SECRET) && split.output.includes(MASK),
      JSON.stringify(split.output),
    );
  }

  // ---- 3. ordinary output is untouched -----------------------------------------------------
  // Asserted per word rather than as one phrase: PowerShell's `echo` is Write-Output, which
  // prints each argument on its own line. That is the shell being itself, not the mask.
  const plain = await runOnce('echo hello world', {}, [SECRET], shell);
  check(
    'output with no secret in it passes through untouched',
    plain.output.includes('hello') && plain.output.includes('world') && !plain.output.includes(MASK),
    JSON.stringify(plain.output),
  );

  try {
    fs.rmSync(stub, { force: true });
  } catch {
    // nothing to do
  }
  console.log(failures === 0 ? '\nall masked-run integration checks passed' : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
