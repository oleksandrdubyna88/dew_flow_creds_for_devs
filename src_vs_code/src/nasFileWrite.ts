import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import { AtomicWriteOps, writeFileAtomically } from './atomicFileWrite';

/**
 * The one atomic writer every producer of a vault file at a folder/NAS location goes
 * through: `FolderTransport`'s automatic sync and the manual "Backup to NAS" command both
 * write the SAME file name, so both must write it the same safe way. The temp-then-rename
 * sequencing itself is tested in `atomicFileWrite.ts`; this is the thin `vscode` wiring.
 */

const vscodeFsOps: AtomicWriteOps<vscode.Uri> = {
  writeFile: (target, data) => vscode.workspace.fs.writeFile(target, data),
  rename: (from, to, options) => vscode.workspace.fs.rename(from, to, options),
  remove: (target) => vscode.workspace.fs.delete(target),
};

export function writeVaultFileAtomically(
  dir: vscode.Uri,
  fileName: string,
  content: string,
): Promise<void> {
  const tempUri = vscode.Uri.joinPath(
    dir,
    `.${fileName}.tmp-${crypto.randomBytes(4).toString('hex')}`,
  );
  const finalUri = vscode.Uri.joinPath(dir, fileName);
  return writeFileAtomically(vscodeFsOps, tempUri, finalUri, content);
}
