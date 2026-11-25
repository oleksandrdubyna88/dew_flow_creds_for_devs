import { spawn } from 'node:child_process';
import type { BridgeNote } from './bridgeNote';

/** How long the one-shot `ssh` that writes a note may take: a login and three file operations. */
export const NOTE_WRITE_TIMEOUT_MS = 30_000;

/** What writing a note came to: written, or the reason in words that hold no key (`ssh`'s own stderr, clipped, never the note). */
export type NoteWriteOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** The spawner, injected so a test can stand in for `ssh`. */
export type NoteSpawn = typeof spawn;

/**
 * Writes a bridge's note on the server (change 11.1, S1): runs `ssh` with `argv` (from `buildNoteArgv`), whose remote command reads the
 * note from STDIN, and hands it the note as one JSON line. The note holds the listener's key, so it goes only to stdin: never to an argument,
 * an environment variable or a log. Bounded: a login that hangs is killed at {@link NOTE_WRITE_TIMEOUT_MS} and reported.
 */
export function writeBridgeNote(note: BridgeNote, argv: readonly string[], env: NodeJS.ProcessEnv, run: NoteSpawn = spawn, timeoutMs = NOTE_WRITE_TIMEOUT_MS): Promise<NoteWriteOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    let stderr = '';
    const finish = (outcome: NoteWriteOutcome): void => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(outcome);
      }
    };
    const child = run('ssh', [...argv], { env, shell: false, windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, reason: `the server did not answer within ${Math.round(timeoutMs / 1000)} s` });
    }, timeoutMs);
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString('utf8')}`.slice(-400);
    });
    child.on('error', (error) => finish({ ok: false, reason: `ssh could not be started (${error.message})` }));
    child.on('close', (code) => finish(code === 0 ? { ok: true } : { ok: false, reason: `ssh ended with ${code ?? 'a signal'}${stderr.trim() === '' ? '' : `: ${stderr.trim().split('\n').slice(-2).join(' | ')}`}` }));
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(JSON.stringify(note) + '\n');
  });
}
