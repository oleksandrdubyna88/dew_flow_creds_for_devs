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
  try {
    await ops.writeFile(tempPath, Buffer.from(content, 'utf8'));
    await ops.rename(tempPath, finalPath, { overwrite: true });
  } catch (error) {
    // Whatever failed, the target still holds the previous good file — the rename is the only
    // step that touches it. Clear the temp we may have written and surface the failure.
    //
    // The WRITE used to sit outside this try, on the reasoning that a stray temp is harmless.
    // That was true while both callers wrote a fixed name: the next attempt overwrote the same
    // stray. The export does not — its temp carries a fresh id so two exports cannot collide,
    // so every failed attempt would drop a NEW orphan in the folder the person chose.
    await Promise.resolve(ops.remove(tempPath)).then(undefined, () => undefined);
    throw error;
  }
}
