import * as vscode from 'vscode';
import { copySecret } from './secretClipboard';
import { applyZoomDelta, currentUiScale, pushUiScaleTo } from './uiScaleHost';
import { ViewerTab } from './viewerClicks';
import { BINDABLE_FIELDS, BindableField } from './envBinding';
import {
  CopyMessage,
  EntityViewOptions,
  copyValueFor,
  renderEntityViewHtml,
  snippetAnswer,
} from './entityViewPage';

export { EntityViewOptions } from './entityViewPage';

/**
 * Read-only entity viewer (a single click previews it, a double click pins it): the edit form's layout with nothing
 * editable and no Save — just values and a Copy button per field. Secrets are shown masked and
 * are NEVER sent into the webview; their Copy buttons round-trip through the extension host,
 * which reads the value and writes it to the clipboard.
 *
 * <p>The markup itself lives in `entityViewPage.ts`, which imports no `vscode` and is therefore
 * testable — this file is the panel, its message loop and the clipboard.</p>
 */

/**
 * The ONE preview tab single clicks share (the owner's model, 2026-08-28 — see
 * `viewerClicks.ts`): which entry it shows, and how to make it show another.
 */
let preview: { panel: vscode.WebviewPanel; key: string; show: (options: EntityViewOptions) => void } | undefined;

/**
 * A double click on the entry the preview shows: that tab becomes an ordinary one and takes
 * focus, and the next single click will open a fresh preview. False when no preview shows it.
 */
export function pinPreview(key: string): boolean {
  if (preview === undefined || preview.key !== key) {
    return false;
  }
  const { panel } = preview;
  preview = undefined;
  panel.reveal(undefined, false);
  return true;
}

/** The loaded entry into the shared preview tab — reusing it when it exists. */
function showPreview(options: EntityViewOptions, key: string): void {
  if (preview !== undefined) {
    preview.key = key;
    preview.show(options);
    preview.panel.reveal(undefined, true);
    return;
  }
  const { panel, show } = mountEntityView(options, true);
  preview = { panel, key, show };
  panel.onDidDispose(() => {
    if (preview?.panel === panel) {
      preview = undefined;
    }
  });
}

/**
 * Show a loaded entry. `tab` is asked AFTER the load — a click that was superseded while the
 * keychain answered shows nothing (`stale`); the rest go to the shared preview or to a tab of
 * their own (a double click, or every other route: the quick pick, a command).
 */
/** Where a loaded entry goes, asked after the load, and the key the preview remembers it by. */
export interface ViewerPlacement {
  readonly tab: () => ViewerTab | 'stale';
  readonly key: string;
}

const OWN_TAB: ViewerPlacement = { tab: () => 'pinned', key: '' };

export function showEntityView(options: EntityViewOptions, placement: ViewerPlacement = OWN_TAB): void {
  const where = placement.tab();
  if (where === 'preview') {
    showPreview(options, placement.key);
  } else if (where === 'pinned') {
    mountEntityView(options, false);
  }
}

// One webview's wiring: the panel, its message loop and the clipboard; the logic it used to
// hold moved to entityViewPage.ts, where it is tested. `show` re-renders the same panel for
// another entry — the preview tab's whole trick — and the message loop reads the CURRENT
// options, never the ones it was created with.
// eslint-disable-next-line max-lines-per-function
function mountEntityView(
  first: EntityViewOptions,
  preserveFocus: boolean,
): { panel: vscode.WebviewPanel; show: (options: EntityViewOptions) => void } {
  const panel = vscode.window.createWebviewPanel(
    'credSshEntityView',
    first.details.name,
    { viewColumn: vscode.ViewColumn.Active, preserveFocus },
    { enableScripts: true, localResourceRoots: [] },
  );
  const state = { options: first };
  const show = (options: EntityViewOptions): void => {
    state.options = options;
    panel.title = options.details.name;
    panel.webview.html = renderEntityViewHtml({ ...options, uiScale: currentUiScale() });
  };
  show(first);
  // T28: this page follows the shared setting for as long as it lives.
  const zoomHook = pushUiScaleTo(panel.webview);
  panel.onDidDispose(() => zoomHook.dispose());

  // eslint-disable-next-line complexity, max-lines-per-function
  panel.webview.onDidReceiveMessage(async (message: CopyMessage) => {
    const options = state.options;
    const d = options.details;
    if (message.type === 'close') {
      panel.dispose();
      return;
    }
    if ((message as { type: string }).type === 'zoom') {
      await applyZoomDelta((message as unknown as { delta: number }).delta);
      return;
    }
    if (message.type === 'snippet') {
      // The same round-trip the form's highlighter makes: one highlighter, host-side, rather
      // than a second one living in a template string where nothing can check it.
      void panel.webview.postMessage(snippetAnswer(options, message.field));
      return;
    }
    if (message.type === 'totp') {
      // Asked for on load and again each time the shown code expires — computed here, from
      // the seed the host holds, so the page only ever sees the expiring result.
      const snapshot = await options.totp?.();
      if (snapshot !== undefined) {
        void panel.webview.postMessage({ type: 'totp', ...snapshot });
      }
      return;
    }
    if (message.type === 'env' || message.type === 'envcheck') {
      const field = message.field as BindableField;
      if (!(BINDABLE_FIELDS as readonly string[]).includes(field)) {
        return;
      }
      const bound = d.envBindings?.[field];
      if (bound === undefined) {
        return;
      }
      if (message.type === 'env') {
        await options.setEnv(field, bound);
      } else {
        options.checkEnv(bound);
      }
      return;
    }
    if (message.type === 'download' && message.field === 'vpnConfig') {
      await options.saveVpnConfig();
      return;
    }
    if (message.type === 'download' && (message.field === 'attachment' || message.field === 'image')) {
      await options.saveAttachment(message.field);
      return;
    }
    if (message.type !== 'copy') {
      return;
    }
    const value = await copyValueFor(options, message.field);
    if (value === undefined || value.length === 0) {
      void vscode.window.showWarningMessage('Nothing to copy — the field is empty.');
      return;
    }
    await copySecret(vscode.env.clipboard, value);
    void panel.webview.postMessage({ type: 'copied', field: message.field });
  });
  return { panel, show };
}
