/**
 * Writing a file so that a reader never sees a half-written one.
 *
 * <p>The vault file at a sync/backup location is read by other machines as authoritative.
 * A crash, a full disk, or — the realistic case for a NAS path — a dropped network share
 * partway through a write must not leave a truncated file under the final name; it must
 * leave the previous file untouched and, at worst, a stray temp file. So every writer of
 * that file writes to a temp sibling first and renames over the target, a rename being the
 * one operation a filesystem makes atomic.</p>
 *
 * <p>Pure and `vscode`-free: the three filesystem operations are injected, so the ordering
 * — the whole point — is a unit test rather than a comment. `FolderTransport` and the
 * "Backup to NAS" command both go through this, instead of each getting it right or, as
 * happened, one of them not.</p>
 */

export interface AtomicWriteOps<T> {
  writeFile(target: T, data: Uint8Array): Thenable<void>;
  rename(from: T, to: T, options: { overwrite: boolean }): Thenable<void>;
  remove(target: T): Thenable<void>;
}

export async function writeFileAtomically<T>(
  ops: AtomicWriteOps<T>,
  tempPath: T,
  finalPath: T,
  content: string,
): Promise<void> {
  await ops.writeFile(tempPath, Buffer.from(content, 'utf8'));
  try {
    await ops.rename(tempPath, finalPath, { overwrite: true });
  } catch (error) {
    // The rename never happened, so the target still holds the previous good file. Clear
    // the temp we wrote and surface the failure; best-effort, a leftover temp is harmless.
    await Promise.resolve(ops.remove(tempPath)).then(undefined, () => undefined);
    throw error;
  }
}
