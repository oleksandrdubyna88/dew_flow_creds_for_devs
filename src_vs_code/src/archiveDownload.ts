import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as fs from 'node:fs';
import { describeError } from './describeError';

/**
 * Writing a backup archive to disk: a stream, a temporary neighbour, and one rename.
 *
 * <p>Node only, no `vscode`, so the property that matters is a unit test rather than something
 * observed by downloading four hundred megabytes by hand.</p>
 */

/**
 * Stream `body` to `destination`, atomically.
 *
 * <p><b>Through a temporary file beside the destination, then renamed.</b> A download that fails
 * halfway — a dropped connection, a full disk, a closed lid — would otherwise leave a TRUNCATED file
 * at the chosen path, and a truncated archive is indistinguishable from a good one until somebody
 * needs it. Worse, the chosen path is often where the previous archive already is, so a partial
 * write destroys the copy that did work. The rename is atomic within a directory, so what appears at
 * the destination is the whole archive or nothing at all.</p>
 *
 * <p><b>Piped, never buffered.</b> This is the largest thing this extension writes to disk; a body
 * read into a string or an `ArrayBuffer` first is an out-of-memory on a machine that was fine a
 * moment ago.</p>
 *
 * <p>The temporary file is removed on every failure path, so a cancelled download leaves nothing
 * behind for somebody to find and wonder about.</p>
 *
 * @returns how many bytes were written.
 */
export async function writeArchiveTo(
  body: ReadableStream<Uint8Array>,
  destination: string,
  onProgress?: (bytes: number) => void,
): Promise<number> {
  const partial = `${destination}.part-${process.pid}`;
  let written = 0;
  try {
    const source = Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]);
    source.on('data', (chunk: Buffer) => {
      written += chunk.length;
      onProgress?.(written);
    });
    await pipeline(source, fs.createWriteStream(partial));
  } catch (failure) {
    throw await withCleanup(failure, partial);
  }
  await fs.promises.rename(partial, destination);
  return written;
}

/**
 * The download's own failure, with the cleanup's added when the cleanup also failed.
 *
 * <p><b>Neither swallowed nor substituted.</b> Discarding the cleanup error hides a temporary file
 * somebody will find months later and have to work out; letting it REPLACE the original hides why
 * the download failed at all, which is the thing the person actually needs. So the download's
 * failure is what is thrown, and the cleanup's is appended to it — a full disk usually causes both,
 * and reading one of them alone sends you looking in the wrong place.</p>
 */
async function withCleanup(failure: unknown, partial: string): Promise<unknown> {
  try {
    await fs.promises.rm(partial, { force: true });
    return failure;
  } catch (cleanup) {
    const original = failure instanceof Error ? failure : new Error(describeError(failure));
    original.message
      += ` (and the partial file ${partial} could not be removed: ${describeError(cleanup)})`;
    return original;
  }
}
