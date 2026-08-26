import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { StubEventEmitter, loadWithVscode } from './vscodeStub';

/**
 * The terminal whose output the extension owns, so a secret cannot appear in it (audit A3).
 *
 * <p>This is the only surface where a secret handed to a child process is supposed to be
 * unprintable, and the guarantee is worth stating precisely: the child DOES receive the real
 * value in its environment — it has to, or the command would not work — and what is replaced
 * is only what comes back out. So the test that matters spawns a real child, gives it a real
 * secret, has it print that secret deliberately, and asserts the screen never shows it.</p>
 *
 * <p>A real child, not a stub, because the masking runs over chunk boundaries: a value split
 * across two `data` events is exactly the case a stub would never produce and a slow pipe
 * produces constantly. `SecretMasker` holds a tail back for that, and the flush-before-exit
 * ordering below is what keeps the held-back characters from arriving after `[exit 0]`.</p>
 */

type Masked = typeof import('../maskedTerminal');

interface Pty {
  onDidWrite(listener: (text: string) => void): { dispose(): void };
  onDidClose(listener: (code: number) => void): { dispose(): void };
  open(): void;
  close(): void;
  handleInput(data: string): void;
}

interface World {
  mod: Masked;
  /** The pty VS Code was handed, plus everything written to it. */
  pty(): Pty;
  written(): string;
  exitCode(): number | undefined;
  shown: number;
}

function world(): World {
  let pty: Pty | undefined;
  let out = '';
  let code: number | undefined;
  const w = {
    mod: undefined as never as Masked,
    pty: (): Pty => pty as Pty,
    written: (): string => out,
    exitCode: (): number | undefined => code,
    shown: 0,
  };
  w.mod = loadWithVscode<Masked>('../maskedTerminal', {
    EventEmitter: StubEventEmitter,
    window: {
      createTerminal: (options: { pty: Pty }): unknown => {
        pty = options.pty;
        // VS Code subscribes before it opens; so does this.
        pty.onDidWrite((text) => {
          out += text;
        });
        pty.onDidClose((c) => {
          code = c;
        });
        return {
          show: (): void => {
            w.shown += 1;
          },
          dispose: (): void => undefined,
        };
      },
    },
    workspace: { workspaceFolders: undefined },
  });
  return w;
}

/** Run one command to completion in the masked terminal and return what reached the screen. */
async function run(
  w: World,
  options: { commandLine: string; env?: Record<string, string>; secrets: readonly (string | { value: string; label: string })[] },
): Promise<string> {
  w.mod.runInMaskedTerminal({
    name: 'test',
    commandLine: options.commandLine,
    env: options.env ?? {},
    secrets: options.secrets,
    banner: '[masked]',
    shell: process.platform === 'win32' ? undefined : '/bin/sh',
  });
  w.pty().open();
  await closed(w);
  return w.written();
}

function closed(w: World): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = setInterval(() => {
      if (w.exitCode() !== undefined) {
        clearInterval(poll);
        resolve();
      } else if (Date.now() - started > 20_000) {
        clearInterval(poll);
        reject(new Error(`child never closed; output so far: ${w.written()}`));
      }
    }, 10);
  });
}

const NODE = JSON.stringify(process.execPath);

test('a secret the child PRINTS never reaches the screen', async () => {
  // The whole feature. `vscode.window.createTerminal({ env })` cannot do this — the extension
  // never sees a byte — which is why the script feature could previously only warn about it.
  const w = world();

  const out = await run(w, {
    commandLine: `${NODE} -e "console.log(process.env.TOKEN)"`,
    env: { TOKEN: 'sk-live-abcdef123456' },
    secrets: ['sk-live-abcdef123456'],
  });

  assert.ok(!out.includes('sk-live-abcdef123456'), `the secret leaked: ${out}`);
  assert.match(out, /\[exit 0\]/, 'and the run itself succeeded');
});

test('the child still RECEIVES the real value — masking is about the screen, not the run', async () => {
  // A masker that also broke the command would be worse than no masker.
  const w = world();

  const out = await run(w, {
    commandLine: `${NODE} -e "process.exit(process.env.TOKEN === 'sk-live-abcdef123456' ? 0 : 3)"`,
    env: { TOKEN: 'sk-live-abcdef123456' },
    secrets: ['sk-live-abcdef123456'],
  });

  assert.match(out, /\[exit 0\]/, `the child did not see the real value: ${out}`);
});

test('a labelled secret says WHICH one stood there', async () => {
  // With several in play, an anonymous block of asterisks tells nobody what was hidden.
  const w = world();

  const out = await run(w, {
    commandLine: `${NODE} -e "console.log(process.env.TOKEN)"`,
    env: { TOKEN: 'sk-live-abcdef123456' },
    secrets: [{ value: 'sk-live-abcdef123456', label: 'API_TOKEN' }],
  });

  assert.match(out, /API_TOKEN/, out);
  assert.ok(!out.includes('sk-live-abcdef123456'));
});

test('stderr is masked too — a secret in an error message is still a secret', async () => {
  const w = world();

  const out = await run(w, {
    commandLine: `${NODE} -e "console.error('failed for ' + process.env.TOKEN)"`,
    env: { TOKEN: 'sk-live-abcdef123456' },
    secrets: ['sk-live-abcdef123456'],
  });

  assert.ok(!out.includes('sk-live-abcdef123456'), out);
  assert.match(out, /failed for/, 'the rest of the message survives');
});

test('a secret split across two writes is still caught', async () => {
  // The reason the masker holds a tail back. Two writes with no newline between them arrive
  // as separate chunks, and a per-chunk replace would miss the value spanning them.
  const w = world();
  const half = 'sk-live-abcdef';

  const out = await run(w, {
    commandLine: `${NODE} -e "process.stdout.write('${half}'); setTimeout(() => process.stdout.write('123456' + String.fromCharCode(10)), 50)"`,
    env: {},
    secrets: [`${half}123456`],
  });

  assert.ok(!out.includes(`${half}123456`), `the split value leaked: ${JSON.stringify(out)}`);
});

test('the held-back tail is released BEFORE the exit line, not after it', async () => {
  // Otherwise the last characters of the output arrive after `[exit 0]` — or never.
  const w = world();

  const out = await run(w, {
    commandLine: `${NODE} -e "process.stdout.write('tail-without-newline')"`,
    env: {},
    secrets: ['nothing-here'],
  });

  assert.ok(out.indexOf('tail-without-newline') < out.indexOf('[exit'), out);
});

test('the exit CODE is reported rather than the terminal just vanishing', async () => {
  const w = world();

  const out = await run(w, { commandLine: `${NODE} -e "process.exit(7)"`, secrets: [] });

  assert.match(out, /\[exit 7\]/, out);
  assert.equal(w.exitCode(), 7, 'and VS Code is told the same code');
});

test('a command that cannot start says so instead of an empty terminal', async () => {
  const w = world();

  const out = await run(w, {
    commandLine: 'definitely-not-a-real-binary-xyz --version',
    secrets: [],
  });

  assert.ok(/Could not start|\[exit/.test(out), `a silent terminal is the failure mode: ${out}`);
  assert.notEqual(w.exitCode(), 0, 'and it is not reported as success');
});

test('the banner is written before anything the child prints', async () => {
  const w = world();

  const out = await run(w, { commandLine: `${NODE} -e "console.log('child output')"`, secrets: [] });

  assert.ok(out.indexOf('[masked]') < out.indexOf('child output'), out);
});

test('output is CRLF, or every line stair-steps', async () => {
  // A terminal needs CRLF; a child writes LF.
  const w = world();

  const out = await run(w, { commandLine: `${NODE} -e "console.log('one')"`, secrets: [] });

  assert.ok(!/(?<!\r)\n/.test(out), `a bare LF reached the terminal: ${JSON.stringify(out)}`);
});

test('typing is echoed, because a pipe does not echo it back', async () => {
  // Without this a person answering a prompt sees nothing at all as they type.
  const w = world();
  w.mod.runInMaskedTerminal({
    name: 'test',
    commandLine: `${NODE} -e "setTimeout(() => process.exit(0), 300)"`,
    env: {},
    secrets: [],
    banner: '[masked]',
  });
  w.pty().open();

  w.pty().handleInput('y');
  w.pty().handleInput('\r');

  assert.match(w.written(), /y\r\n/, w.written());
  w.pty().close();
  await closed(w);
});

test('a keystroke arriving after the child exited does not take the extension host down', async () => {
  // The real race: `write()` after a stream has ended emits ERR_STREAM_WRITE_AFTER_END, and
  // with nothing listening Node throws it — which in an extension host is not a dropped
  // keystroke but "Extension host terminated unexpectedly".
  const w = world();
  await run(w, { commandLine: `${NODE} -e "process.exit(0)"`, secrets: [] });

  assert.doesNotThrow(() => w.pty().handleInput('late'));
  assert.doesNotThrow(() => w.pty().close());
});

test('the terminal is shown, not left to be found in the panel list', () => {
  const w = world();

  w.mod.runInMaskedTerminal({ name: 'test', commandLine: 'echo hi', env: {}, secrets: [], banner: 'b' });

  assert.equal(w.shown, 1);
});
