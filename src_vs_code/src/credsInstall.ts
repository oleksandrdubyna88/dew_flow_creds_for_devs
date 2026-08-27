/**
 * Deciding what the *Install `creds`…* menu item should offer, and where the binary goes.
 *
 * <p>`creds` is the terminal half of this product — the same broker, reached from iTerm, tmux, a
 * script, or a remote host over the Remote-SSH bridge. On this machine the extension already
 * ships `agentCli.js` and the share snippet points at it, so nothing needs installing; the binary
 * matters when the editor's files are not at hand, which is exactly the bridge's case.</p>
 *
 * <p><b>Into the extension's own storage, not `~/.local/bin`.</b> Writing an executable into a
 * directory on someone's `PATH` is a change to their machine that outlives the extension and that
 * nothing here would ever clean up. The storage folder is ours: it is removed when the extension
 * is, an uninstall is a file delete, and the full path is what the snippet hands out anyway.</p>
 *
 * <p><b>The version is remembered here, because the binary cannot be asked.</b> `creds` has no
 * `--version` flag, so "is there an update" cannot be answered by running it. What is on disk is
 * therefore paired with what we recorded when we put it there — and if the file is gone while the
 * record remains, the record is what is wrong.</p>
 *
 * <p>Pure and `vscode`-free: every decision below is a unit test rather than something discovered
 * when a download half-works on somebody's laptop.</p>
 */

/** The four builds the release workflow produces. macOS is deliberately absent — see `ridFor`. */
export type CredsRid = 'win-x64' | 'win-arm64' | 'linux-x64' | 'linux-arm64';

/**
 * One installable binary: what it is called, and which tag line carries it.
 *
 * <p>There are two, and there were nearly two copies of this module. Everything below is the
 * same decision for both — which build this machine takes, what the asset is called, whether
 * what is on disk is older than what is published — and the only differences are three strings.
 * A second copy would have started identical and drifted at the first fix.</p>
 *
 * <p>They version independently, which is the whole reason each needs its own tag prefix: a
 * person installs `creds` for their terminal and `creds-mcp` for their agent, and neither
 * release should move the other.</p>
 */
export interface CredsProduct {
  /** The release tag prefix, e.g. `cli-v`. */
  readonly tagPrefix: string;
  /** The binary's name, which is also the asset's base name — the workflow uses both. */
  readonly binary: string;
  /** What a menu item calls it. */
  readonly label: string;
}

export const CREDS_CLI: CredsProduct = {
  tagPrefix: 'cli-v',
  binary: 'creds',
  label: 'creds',
};

export const CREDS_MCP: CredsProduct = {
  tagPrefix: 'mcp-v',
  binary: 'creds-mcp',
  label: 'the MCP server',
};

/**
 * The build for this machine, or `undefined` when the release matrix has none.
 *
 * <p><b>macOS returns `undefined` and that is not an oversight to paper over.</b> The release
 * workflow builds `win-x64`, `win-arm64`, `linux-x64` and `linux-arm64` — there is no `osx-*`
 * job. Guessing a nearby RID would download a binary that cannot execute, and reporting a
 * download failure would send someone hunting a network problem. So the menu says plainly that
 * there is no build for this platform yet.</p>
 */
export function ridFor(platform: string, arch: string): CredsRid | undefined {
  const cpu = cpuOf(arch);
  const os = osOf(platform);
  return cpu === undefined || os === undefined ? undefined : (`${os}-${cpu}` as CredsRid);
}

/** Only the two architectures the matrix builds; anything else is not approximated. */
function cpuOf(arch: string): 'x64' | 'arm64' | undefined {
  if (arch === 'arm64') {
    return 'arm64';
  }
  return arch === 'x64' ? 'x64' : undefined;
}

/** Only the two operating systems the matrix builds — `darwin` deliberately among the absent. */
function osOf(platform: string): 'win' | 'linux' | undefined {
  if (platform === 'win32') {
    return 'win';
  }
  return platform === 'linux' ? 'linux' : undefined;
}

/** The archive the release carries for one build — the name the workflow packages. */
export function assetNameFor(product: CredsProduct, rid: CredsRid, version: string): string {
  return `${product.binary}-${version}-${rid}${rid.startsWith('win-') ? '.zip' : '.tar.gz'}`;
}

/** The file inside that archive: the workflow puts the binary in a directory of the same name. */
export function entryPathIn(product: CredsProduct, rid: CredsRid, version: string): string {
  return `${product.binary}-${version}-${rid}/${binaryNameFor(product, rid)}`;
}

/** What the installed binary is called once it is in place. */
export function binaryNameFor(product: CredsProduct, rid: CredsRid): string {
  return rid.startsWith('win-') ? `${product.binary}.exe` : product.binary;
}

/**
 * `cli-v0.1.0` → `0.1.0`, for the product that owns that prefix.
 *
 * <p>A tag belonging to another product yields nothing rather than a wrong version, and that is
 * load-bearing now that there are four tag lines: `mcp-v0.2.0` read as a `creds` release would
 * offer an update that downloads an asset which does not exist.</p>
 */
export function versionFromTag(product: CredsProduct, tag: string): string | undefined {
  return tag.startsWith(product.tagPrefix) && tag.length > product.tagPrefix.length
    ? tag.slice(product.tagPrefix.length)
    : undefined;
}

/**
 * Newer / same / older, by numeric parts.
 *
 * <p>Compared segment by segment as NUMBERS, because `'0.10.0' < '0.9.0'` is true as strings and
 * would offer a downgrade as an update exactly once the tenth minor shipped. Missing segments are
 * zero, so `0.1` and `0.1.0` are the same version.</p>
 */
export function compareVersions(left: string, right: string): number {
  const a = numericParts(left);
  const b = numericParts(right);
  const width = Math.max(a.length, b.length);
  const at = (parts: number[], i: number): number => parts[i] ?? 0;
  for (let i = 0; i < width; i += 1) {
    const diff = at(a, i) - at(b, i);
    if (diff !== 0) {
      return Math.sign(diff);
    }
  }
  return 0;
}

/** `'0.10.0'` → `[0, 10, 0]`. A segment that is not a number counts as zero rather than NaN. */
function numericParts(version: string): number[] {
  return version.split('.').map((part) => Number.parseInt(part, 10) || 0);
}

/** What the extension knows about the copy it installed. */
export interface InstalledCreds {
  /** The version recorded when it was written. */
  readonly version: string;
  /** Whether the file is still where it was put — a person can delete it from under us. */
  readonly present: boolean;
}

export type CredsAction =
  | { kind: 'unsupported'; platform: string }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'install'; version: string }
  | { kind: 'update'; from: string; to: string }
  | { kind: 'reinstall'; version: string }
  | { kind: 'installed'; version: string };

/**
 * What the menu offers, given what is on disk and what the release carries.
 *
 * <p>Every branch is a different sentence to a person, which is why this returns a shape rather
 * than a boolean: "install 0.1.0", "update 0.1.0 → 0.2.0" and "0.1.0 is installed" are three
 * different menus, and a `reinstall` — the record says a version, the file is gone — is a fourth
 * that would otherwise read as "installed" while nothing runs.</p>
 */
// eslint-disable-next-line complexity
export function actionFor(
  rid: CredsRid | undefined,
  platform: string,
  latest: string | undefined,
  installed: InstalledCreds | undefined,
): CredsAction {
  if (rid === undefined) {
    return { kind: 'unsupported', platform };
  }
  if (installed !== undefined && !installed.present) {
    return { kind: 'reinstall', version: latest ?? installed.version };
  }
  if (latest === undefined) {
    return installed === undefined
      ? { kind: 'unavailable', reason: 'no published release was found' }
      : { kind: 'installed', version: installed.version };
  }
  if (installed === undefined) {
    return { kind: 'install', version: latest };
  }
  return compareVersions(installed.version, latest) < 0
    ? { kind: 'update', from: installed.version, to: latest }
    : { kind: 'installed', version: installed.version };
}

/** The choices offered for one action, in order; the first is the default a person expects. */
// eslint-disable-next-line complexity
export function choicesFor(product: CredsProduct, action: CredsAction): string[] {
  switch (action.kind) {
    case 'install':
      return [`Install ${product.label} ${action.version}`];
    case 'update':
      return [`Update to ${action.to}`, `Remove ${product.label}`];
    case 'reinstall':
      return [`Install ${product.label} ${action.version} again`, 'Forget it'];
    case 'installed':
      return ['Copy the path', `Remove ${product.label}`];
    // `unsupported` and `unavailable` offer nothing to click, on purpose: a menu whose every
    // option fails is worse than one sentence saying why there is nothing to do.
    default:
      return [];
  }
}
