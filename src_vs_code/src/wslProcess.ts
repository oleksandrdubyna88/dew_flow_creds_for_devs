import * as childProcess from 'node:child_process';

/**
 * Running `wsl.exe` and reading what it said.
 *
 * <p>Extracted from `extension.ts` when a second feature needed it — the MCP install, which puts
 * the Linux half of the bridge into a distribution. A second copy of a spawn that has one
 * measured encoding rule in it is exactly the drift the shared-implementation rule exists for.</p>
 *
 * <p>Neither ever rejects. A missing `wsl.exe` is the ordinary case on a machine without WSL, and
 * a caller asking "which distributions are there" wants an empty answer, not an exception to
 * catch. Every failure therefore reads as "it said nothing".</p>
 */

/** Text out of a WSL child, with whatever it wrote to stdin first. Empty when it could not run. */
export function runWsl(args: readonly string[], stdin?: string): Promise<string> {
  return new Promise((resolve) => {
    const child = childProcess.spawn('wsl.exe', [...args], {
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
    });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      out += chunk;
    });
    child.on('error', () => resolve(''));
    child.on('close', () => resolve(out));
    child.stdin.end(stdin ?? '');
  });
}

/**
 * The same child, but handing back BYTES.
 *
 * <p>`wsl -l -q` answers in UTF-16LE — measured, the bytes begin `55 00 62 00`. Decoding it as
 * UTF-8 gives names interleaved with NULs that match nothing, and the symptom is "no
 * distributions found" rather than anything that points at an encoding.</p>
 */
export function runWslRaw(args: readonly string[]): Promise<Buffer> {
  return new Promise((resolve) => {
    const child = childProcess.spawn('wsl.exe', [...args], {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', () => resolve(Buffer.alloc(0)));
    child.on('close', () => resolve(Buffer.concat(chunks)));
  });
}
