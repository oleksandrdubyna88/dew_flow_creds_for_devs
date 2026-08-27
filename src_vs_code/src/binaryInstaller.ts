import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import * as crypto from 'node:crypto';
import {
  CredsAction,
  CredsProduct,
  CredsRid,
  InstalledCreds,
  actionFor,
  assetNameFor,
  binaryNameFor,
  choicesFor,
  compareVersions,
  digestIn,
  entryPathIn,
  ridFor,
  versionFromTag,
} from './credsInstall';
import { describeError } from './describeError';

/**
 * Putting a published binary on this machine, and the menu that offers to.
 *
 * <p>The decisions are all next door in `credsInstall.ts`, which is pure and tested; this half
 * is the part that touches the network, the disk and a person. It serves both binaries —
 * `creds` for a terminal, `creds-mcp` for an agent — because the only differences between them
 * are three strings, and a second copy of this would have drifted at the first fix.</p>
 *
 * <p><b>Into the extension's own storage, not onto the PATH.</b> Writing an executable into a
 * directory on somebody's `PATH` is a change to their machine that outlives the extension and
 * that nothing here would ever clean up. The storage folder is ours: uninstalling the extension
 * removes it, and the full path is what gets copied into an MCP client's config anyway.</p>
 *
 * <p><b>The download is verified, the way `install.sh` verifies it.</b> Every release publishes a
 * `.sha256` beside each asset, and the shell installer has refused a mismatch since it was
 * written. This path did not check at all until a security pass found the asymmetry (2026-08-27):
 * two ways to install the same binary, one of which trusted whatever arrived. A release cut before
 * checksums existed has none, and that case is reported out loud rather than skipped silently — a
 * quiet skip is indistinguishable from a check that passed, which is the failure mode the shell
 * script already had a comment about.</p>
 *
 * <p><b>Extraction runs `tar`.</b> Node ships gzip but no zip reader, and this extension has
 * zero runtime dependencies — a constraint that has already cost it a file format. `tar` reads
 * both archives and is present on every platform the release matrix builds for: Windows 10 and
 * later ship bsdtar as `tar.exe`, which handles a zip. The alternative was a hand-written zip
 * reader in a credential manager, to save one process launch that happens once.</p>
 */

/** Where the extension remembers what it installed. Keyed per product. */
function stateKey(product: CredsProduct): string {
  return `credsInstall.${product.binary}`;
}

interface InstallRecord {
  version: string;
}

export interface InstallHost {
  /** The extension's own storage — created if absent, removed when the extension is. */
  readonly storage: vscode.Uri;
  readonly state: vscode.Memento;
}

/** The GitHub release this product's latest tag points at, or nothing when unreachable. */
async function latestVersion(product: CredsProduct): Promise<string | undefined> {
  try {
    const response = await fetch(
      'https://api.github.com/repos/oleksandrdubyna88/dew_flow_creds_for_devs/releases?per_page=30',
      { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'creds-for-devs' } },
    );
    if (!response.ok) {
      return undefined;
    }
    const releases = (await response.json()) as { tag_name?: unknown }[];
    return newestOf(product, releases);
  } catch {
    // Offline, rate-limited, or behind a proxy that refuses. All of them mean the same thing to
    // the person — "cannot tell you what is published" — and none is worth a stack trace.
    return undefined;
  }
}

/**
 * The highest version among this product's tags.
 *
 * <p>The list is newest-first by publication, which is nearly always version order and is not
 * guaranteed to be: a patch cut for an older line publishes last. Compared numerically for the
 * same reason `compareVersions` exists at all.</p>
 */
function newestOf(product: CredsProduct, releases: { tag_name?: unknown }[]): string | undefined {
  const versions = releases.flatMap((release) => {
    const tag = typeof release.tag_name === 'string' ? release.tag_name : '';
    const version = versionFromTag(product, tag);
    return version === undefined ? [] : [version];
  });
  // `compareVersions`, not a second numeric comparison written here: it is the one that already
  // knows `0.10.0` is newer than `0.9.0`, which a string sort gets backwards exactly once the
  // tenth minor ships.
  return versions.length === 0 ? undefined : versions.sort((a, b) => compareVersions(b, a))[0];
}

/** Where this product's binary lives once installed. */
export function binaryPath(host: InstallHost, product: CredsProduct, rid: CredsRid): vscode.Uri {
  return vscode.Uri.joinPath(host.storage, 'bin', binaryNameFor(product, rid));
}

async function installedRecord(
  host: InstallHost,
  product: CredsProduct,
  rid: CredsRid,
): Promise<InstalledCreds | undefined> {
  const record = host.state.get<InstallRecord>(stateKey(product));
  if (record === undefined) {
    return undefined;
  }
  return { version: record.version, present: await exists(binaryPath(host, product, rid)) };
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

/**
 * Download the asset, extract the one file, and put it where it belongs.
 *
 * <p>Through a temporary directory that is removed either way: a half-written binary left beside
 * the real one is the kind of thing that gets run six months later.</p>
 */
async function download(
  host: InstallHost,
  product: CredsProduct,
  rid: CredsRid,
  version: string,
): Promise<vscode.Uri> {
  const asset = assetNameFor(product, rid, version);
  const url = `https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/releases/download/${product.tagPrefix}${version}/${asset}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'creds-for-devs' } });
  if (!response.ok) {
    throw new Error(`the release does not carry ${asset} (HTTP ${response.status})`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const verdict = await verify(bytes, `${url}.sha256`);
  if (verdict.kind === 'mismatch') {
    throw new Error(
      `the download does not match the checksum this release publishes — refusing to install it (expected ${verdict.expected}, got ${verdict.actual})`,
    );
  }
  if (verdict.kind === 'unpublished') {
    // Said out loud rather than skipped silently: a quiet skip is indistinguishable from a check
    // that passed, which is the failure mode `install.sh` already carries a comment about.
    void vscode.window.showWarningMessage(
      `${product.label}: this release publishes no checksum, so the download was NOT verified.`,
    );
  }

  const scratch = vscode.Uri.joinPath(host.storage, `.download-${product.binary}`);
  await vscode.workspace.fs.createDirectory(scratch);
  try {
    const archive = vscode.Uri.joinPath(scratch, asset);
    await vscode.workspace.fs.writeFile(archive, bytes);
    await extract(archive, scratch);

    const extracted = vscode.Uri.joinPath(scratch, ...entryPathIn(product, rid, version).split('/'));
    const target = binaryPath(host, product, rid);
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(host.storage, 'bin'));
    await vscode.workspace.fs.copy(extracted, target, { overwrite: true });
    await makeExecutable(target);
    return target;
  } finally {
    await vscode.workspace.fs.delete(scratch, { recursive: true, useTrash: false });
  }
}

/**
 * Whether these bytes are what the release says they are.
 *
 * <p>Three outcomes and they are not the same. <b>Matched</b> is the ordinary one. <b>Mismatch</b>
 * refuses the install. <b>Unpublished</b> — a release cut before checksums existed, or a network
 * that answered the asset and not the sum — proceeds, because refusing would break installing a
 * real release over a file that was never published; the caller says so out loud.</p>
 */
async function verify(
  bytes: Uint8Array,
  sumUrl: string,
): Promise<{ kind: 'matched' | 'unpublished' } | { kind: 'mismatch'; expected: string; actual: string }> {
  const expected = await publishedSum(sumUrl);
  if (expected === undefined) {
    return { kind: 'unpublished' };
  }
  const actual = crypto.createHash('sha256').update(bytes).digest('hex');
  return actual === expected ? { kind: 'matched' } : { kind: 'mismatch', expected, actual };
}

/** The hex digest a `.sha256` file names, or nothing when the release publishes none. */
async function publishedSum(sumUrl: string): Promise<string | undefined> {
  try {
    const response = await fetch(sumUrl, { headers: { 'User-Agent': 'creds-for-devs' } });
    if (!response.ok) {
      return undefined;
    }
    return digestIn(await response.text());
  } catch {
    return undefined;
  }
}

/** `tar` reads both a .tar.gz and a .zip, on every platform the matrix builds for. */
function extract(archive: vscode.Uri, into: vscode.Uri): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('tar', ['-xf', archive.fsPath, '-C', into.fsPath], (error) => {
      if (error) {
        reject(new Error(`could not unpack the download (${describeError(error)})`));
        return;
      }
      resolve();
    });
  });
}

/**
 * The executable bit, which the archive carries and the copy does not.
 *
 * <p>`workspace.fs.copy` writes the bytes and not the mode, so a Linux install that skipped this
 * would land a file the person cannot run — and the error a shell gives for that names the file
 * rather than the reason.</p>
 */
async function makeExecutable(target: vscode.Uri): Promise<void> {
  if (process.platform === 'win32') {
    return;
  }
  await new Promise<void>((resolve) => {
    execFile('chmod', ['755', target.fsPath], () => resolve());
  });
}

/** What the menu should say and offer, for this product on this machine. */
export async function installMenu(
  host: InstallHost,
  product: CredsProduct,
): Promise<{ rid: CredsRid | undefined; action: CredsAction; choices: string[] }> {
  const rid = ridFor(process.platform, process.arch);
  const installed = rid === undefined ? undefined : await installedRecord(host, product, rid);
  const action = actionFor(rid, process.platform, await latestVersion(product), installed);
  return { rid, action, choices: choicesFor(product, action) };
}

/** Perform whichever choice was picked. Answers the path when one is now installed. */
export async function performInstall(
  host: InstallHost,
  product: CredsProduct,
  rid: CredsRid,
  version: string,
): Promise<vscode.Uri> {
  const target = await download(host, product, rid, version);
  await host.state.update(stateKey(product), { version } satisfies InstallRecord);
  return target;
}

/** Take it away again, record included — a removal that left the record would read as installed. */
export async function removeInstall(
  host: InstallHost,
  product: CredsProduct,
  rid: CredsRid,
): Promise<void> {
  try {
    await vscode.workspace.fs.delete(binaryPath(host, product, rid), { useTrash: false });
  } catch {
    // Already gone is the outcome asked for.
  }
  await host.state.update(stateKey(product), undefined);
}
