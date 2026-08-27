import * as vscode from 'vscode';
import { ArrivalHighlights } from './arrivalHighlight';
import { DepColorKey, depColorThemeId } from './depColors';
import { RelationLabel } from './depGraph';

/**
 * Painting a tree ROW, which a `TreeItem` cannot do.
 *
 * <p>`TreeItem` offers exactly three channels — the icon, the label text and the grey
 * description — and it can colour only the first, through `ThemeIcon`. That channel is already
 * spoken for: a tinted icon means "this entry keeps previous versions"
 * (`treeDataProvider.ts`'s `HISTORY_COLOR`), and the comment there is right that one channel
 * carrying two meanings tells you neither.</p>
 *
 * <p>So the label text is coloured the only way the API allows: give the row a `resourceUri`
 * and answer for that uri from a `FileDecorationProvider`. The uri is synthetic — it names no
 * file — and its scheme is ours, which is what lets `provideFileDecoration` recognise its own
 * rows and refuse everything else. That refusal is not an optimisation: a decoration provider
 * is registered against the whole workbench, not against one view, so VS Code will ask this
 * object about every file in the person's actual workspace.</p>
 */

/** Ours, and deliberately not a scheme anything else could produce. */
export const DEP_SCHEME = 'credsdep';

export interface DepRef {
  accountId: string;
  entityId: string;
}

/** The row's address, as a uri: `credsdep:/<accountId>/<entityId>`. */
export function depUri(accountId: string, entityId: string): vscode.Uri {
  return vscode.Uri.from({
    scheme: DEP_SCHEME,
    path: `/${encodeURIComponent(accountId)}/${encodeURIComponent(entityId)}`,
  });
}

/**
 * The inverse, and the gate.
 *
 * <p>Returns `undefined` for anything that is not one of our rows — a foreign scheme, a path of
 * the wrong shape — so a caller can spend nothing on the workspace files it will be asked
 * about far more often than about these.</p>
 */
export function parseDepUri(uri: vscode.Uri): DepRef | undefined {
  if (uri.scheme !== DEP_SCHEME) {
    return undefined;
  }
  const parts = uri.path.split('/').filter((part) => part !== '');
  if (parts.length !== 2) {
    return undefined;
  }
  return { accountId: decodeURIComponent(parts[0]), entityId: decodeURIComponent(parts[1]) };
}

/** What the provider needs to answer — `DepIndexCache` satisfies it, and is the only instance. */
export interface DepDecorationSource {
  tintColorKey(accountId: string, entityId: string): DepColorKey | undefined;
  relationLabel(accountId: string, entityId: string): RelationLabel | undefined;
}

export class DepDecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<undefined>();
  readonly onDidChangeFileDecorations = this.emitter.event;

  /**
   * @param arrivals The just-arrived rows (T13). Merged HERE rather than registered as a second
   * provider, deliberately: VS Code composes multiple decorations poorly, and two providers
   * racing over one row is how the dependency colour would start flickering.
   */
  constructor(
    private readonly source: DepDecorationSource,
    private readonly arrivals?: ArrivalHighlights,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Answer for one row.
   *
   * <p>The scheme check is the FIRST line, and it is a correctness requirement rather than an
   * optimisation: a decoration provider is registered against the whole workbench, not against
   * one view, so VS Code asks this object about every file in the person's actual workspace on
   * every repaint. Anything more than a string comparison here is paid for by an editor that is
   * not this extension's.</p>
   */
  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const ref = parseDepUri(uri);
    if (ref === undefined) {
      return undefined;
    }
    // A row that just ARRIVED outranks its dependency colour for the few seconds it glows —
    // "here it is" is the more urgent statement, and the dependency tint returns by itself
    // when the window lapses and the next repaint asks again.
    return this.arrivalDecoration(ref) ?? this.dependencyDecoration(ref);
  }

  private arrivalDecoration(ref: DepRef): vscode.FileDecoration | undefined {
    if (this.arrivals?.isActive(ref.accountId, ref.entityId, this.now()) !== true) {
      return undefined;
    }
    return new vscode.FileDecoration(
      undefined,
      'Just arrived',
      new vscode.ThemeColor('credSshManager.newArrival'),
    );
  }

  private dependencyDecoration(ref: DepRef): vscode.FileDecoration | undefined {
    const label = this.source.relationLabel(ref.accountId, ref.entityId);
    if (label === undefined) {
      return undefined;
    }
    return new vscode.FileDecoration(label.badge, label.tooltip, this.colorFor(ref));
  }

  private colorFor(ref: DepRef): vscode.ThemeColor | undefined {
    const key = this.source.tintColorKey(ref.accountId, ref.entityId);
    return key === undefined ? undefined : new vscode.ThemeColor(depColorThemeId(key));
  }

  /**
   * Repaint every row's decoration.
   *
   * <p>Fired with no argument rather than with the uris that changed, and deliberately: one edit
   * can move the colour of an arbitrary number of OTHER rows — every entity depending on the
   * target whose colour was just changed — so enumerating "what changed" would be the same walk
   * the index already does, done twice and kept in step by hand.</p>
   */
  refresh(): void {
    this.emitter.fire(undefined);
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
