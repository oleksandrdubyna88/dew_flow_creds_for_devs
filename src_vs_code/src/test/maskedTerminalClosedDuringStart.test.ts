import * as assert from 'node:assert/strict';
import * as childProcess from 'node:child_process';
import { test } from 'node:test';
import * as childKill from '../childKill';
import { StubEventEmitter, loadWithVscode } from './vscodeStub';
import { ownedDir } from '../../scripts/lib/leftovers.cjs';

/**
 * A terminal that closes WHILE the run is starting (E3 review, accepted finding A).
 *
 * <p>`openRun` fires the banner first; a listener of that write may close the terminal at once. The close finds no child yet, so it
 * only ends the run (`over`), and `openRun` then spawned a child anyway and wrote the script (the secret values) to it. After the
 * fix a run that is already over when the child exists kills the child's tree and never writes the script.</p>
 */

type Masked = typeof import('../maskedTerminal');

interface Pty {
  onDidWrite(listener: (text: string) => void): { dispose(): void };
  open(): void;
  close(): void;
}

interface Seen {
  /** Every child that started. */
  children: childProcess.ChildProcess[];
  /** Every `stdin.end(text)` any child was given: the script being written. */
  stdinEnds: unknown[];
  /** The options of every `killChild` call. */
  kills: unknown[];
}

function load(seen: Seen, ptyOut: { pty?: Pty }): Masked {
  const createTerminal = (created: { pty: Pty }): unknown => {
    ptyOut.pty = created.pty;
    return { show: (): void => undefined, dispose: (): void => undefined };
  };
  const stub = { EventEmitter: StubEventEmitter, window: { createTerminal }, workspace: { workspaceFolders: undefined } };
  return loadWithVscode<Masked>('../maskedTerminal', stub, {
    'node:child_process': {
      ...childProcess,
      spawn: (...args: Parameters<typeof childProcess.spawn>): childProcess.ChildProcess => {
        const child = childProcess.spawn(...args);
        const end = child.stdin?.end.bind(child.stdin);
        if (child.stdin !== null && end !== undefined) {
          child.stdin.end = ((...endArgs: unknown[]): unknown => {
            seen.stdinEnds.push(endArgs[0]);
            return (end as (...a: unknown[]) => unknown)(...endArgs);
          }) as typeof child.stdin.end;
        }
        seen.children.push(child);
        return child;
      },
    },
    './childKill': {
      ...childKill,
      killChild: (child: childProcess.ChildProcess, options: childKill.KillOptions): void => {
        seen.kills.push(options);
        childKill.killChild(child, options);
      },
    },
  });
}

function exited(child: childProcess.ChildProcess, ms: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`the child did not end within ${ms} ms`)), ms);
    child.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

const SCRIPT = 'SECRET-VALUES-SCRIPT\n';
const POSIX_ONLY = process.platform === 'win32' ? 'argv-mode children are spawned through /bin/sh here: POSIX only' : false;

test('a_terminal_closed_while_the_banner_is_written_kills_the_child_and_never_writes_the_script', { skip: POSIX_ONLY, timeout: 15_000 }, async (t) => {
  const seen: Seen = { children: [], stdinEnds: [], kills: [] };
  const ptyOut: { pty?: Pty } = {};
  const mod = load(seen, ptyOut);
  let ended = 0;
  mod.runInMaskedTerminal({
    name: 'test',
    argv: ['/bin/sh', '-c', 'cat > /dev/null'],
    cwd: ownedDir(t, 'cwd'),
    env: {},
    stdinText: SCRIPT,
    secrets: [],
    banner: '[masked]',
    onEnded: () => void (ended += 1),
  });
  const pty = ptyOut.pty as Pty;
  let closedOnBanner = false;
  pty.onDidWrite(() => {
    if (!closedOnBanner) {
      closedOnBanner = true;
      pty.close(); // the first write is the banner: the terminal closes during it
    }
  });
  pty.open();
  assert.equal(closedOnBanner, true, 'the stub closed the terminal during the banner');
  assert.equal(ended, 1, 'the close ended the run once');
  try {
    assert.equal(seen.children.length, 1, 'the spawn happens after the banner, so the child exists');
    await exited(seen.children[0], 5_000);
    assert.deepEqual(seen.kills, [{ tree: true }], 'a run that is over when its child appears kills the child tree');
    assert.deepEqual(seen.stdinEnds, [], 'the script (the values) is never written to a child nobody watches');
  } finally {
    for (const child of seen.children) {
      child.kill('SIGKILL'); // a RED run must leave no process behind
    }
  }
});
