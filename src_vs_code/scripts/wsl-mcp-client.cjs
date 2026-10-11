'use strict';

// A client shaped like Claude Code, run INSIDE the distribution by `creds-mcp-wsl-itest.cjs`:
//
//   node wsl-mcp-client.cjs <fixture.jsonl> -- <wrapper> [args...]
//
// It spawns the Linux `creds-mcp` wrapper DIRECTLY — no shell, no `&` job: a background job of a non-interactive
// shell starts with SIGINT ignored, which would make a SIGINT test pass or fail for the wrong reason (plan §7.1).
// The bridge's variables (the endpoint directory, the log directory, WSLENV, the Windows binary) are inherited:
// `wslSteps.sh` exported them before it exec'd this process. It writes the captured Claude Code session
// (server/discover, subscriptions/listen, server/discover, tools/list), waits until every request but the held
// listen is answered, and says so on stdout. Then it waits for ONE word on its own stdin — SIGINT, SIGTERM,
// SIGHUP or SIGKILL, which it sends itself as the wrapper's parent (as Claude Code does), or `eof`, which closes
// the wrapper's stdin — and reports how the wrapper ended.
//
// Every line it prints is one JSON event: {event: "ready", pid}, {event: "ended", code, signal, ms},
// {event: "failed", reason}. The wrapper's stderr is passed through on this process's stderr.
//
// PLAN_wsl_bridge_outlives_its_client.md, E5.S1. Runs under the distribution's own node; nothing here deletes.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const readline = require('node:readline');

const READY_BOUND_MS = 60_000;
const END_BOUND_MS = 20_000;
const WORDS = new Set(['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGKILL', 'eof']);

const say = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);

/** `<fixture> -- <wrapper> [args...]` */
function parse(argv) {
  const split = argv.indexOf('--');
  if (split !== 1 || split === argv.length - 1) {
    throw new Error('usage: wsl-mcp-client.cjs <fixture.jsonl> -- <wrapper> [args...]');
  }
  return { fixture: argv[0], wrapper: argv[split + 1], args: argv.slice(split + 2) };
}

/** The ids the server answers: every request of the session except the listen, which it holds open. */
function expectedIds(lines) {
  return lines
    .map((line) => JSON.parse(line))
    .filter((message) => message.id !== undefined && message.method !== 'subscriptions/listen')
    .map((message) => String(message.id));
}

function watchReplies(child, waiting, onReady) {
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    try {
      const message = JSON.parse(line);
      if (message.id !== undefined && waiting.delete(String(message.id)) && waiting.size === 0) {
        onReady();
      }
    } catch {
      /* a partial line from a process being ended is not an event */
    }
  });
}

function end(child, word) {
  if (word === 'eof') {
    child.stdin.end();
  } else {
    child.kill(word);
  }
}

function main() {
  const { fixture, wrapper, args } = parse(process.argv.slice(2));
  const lines = fs.readFileSync(fixture, 'utf8').split('\n').filter((line) => line.trim() !== '');
  const child = spawn(wrapper, args, { stdio: ['pipe', 'pipe', 'inherit'] });
  const waiting = new Set(expectedIds(lines));
  let endedAt;
  let exited = false;

  const notReady = setTimeout(() => {
    say({ event: 'failed', reason: `no answer to ${[...waiting].join(', ')} within ${READY_BOUND_MS} ms` });
    child.kill('SIGKILL');
  }, READY_BOUND_MS);

  child.on('exit', (code, signal) => {
    exited = true;
    clearTimeout(notReady);
    say({ event: 'ended', code, signal, ms: endedAt === undefined ? null : Date.now() - endedAt });
    process.exit(0);
  });
  // A wrapper that could not be started is an event, not a stack trace the Windows side waits 90 s to miss.
  child.on('error', (error) => {
    say({ event: 'failed', reason: `could not start ${wrapper}: ${error.message}` });
    process.exit(2);
  });
  child.stdin.on('error', () => undefined); // a wrapper that is gone closes its stdin under us
  watchReplies(child, waiting, () => {
    clearTimeout(notReady);
    say({ event: 'ready', pid: child.pid });
  });
  for (const line of lines) {
    child.stdin.write(`${line}\n`);
  }

  const control = readline.createInterface({ input: process.stdin });
  control.on('line', (word) => {
    if (!WORDS.has(word.trim()) || endedAt !== undefined) {
      return;
    }
    endedAt = Date.now();
    end(child, word.trim());
    setTimeout(() => {
      if (exited) {
        return; // the wrapper left; its `exit` is on its way out of this process (CodeRabbit on #218)
      }
      say({ event: 'failed', reason: `the wrapper did not end within ${END_BOUND_MS} ms of ${word.trim()}` });
      child.kill('SIGKILL');
    }, END_BOUND_MS).unref();
  });
  // The Windows side went away without a word: take the wrapper down rather than leave it to anyone.
  control.on('close', () => {
    if (!exited && endedAt === undefined) {
      child.kill('SIGKILL');
    }
  });
}

try {
  main();
} catch (error) {
  say({ event: 'failed', reason: String(error.message ?? error) });
  process.exit(2);
}
