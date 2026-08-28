import * as vscode from 'vscode';
import { HELP_LANGUAGES, HelpLanguage } from './helpContent';
import { renderHelpHtml } from './helpPage';
import { applyZoomDelta, currentUiScale, pushUiScaleTo } from './uiScaleHost';

/**
 * The help panel (tails T21/T22): one webview, reused while open. The language lives in the
 * setting `credSshManager.helpLanguage` — a real setting so it syncs — and nothing else reads
 * it, which is what scopes the choice to the help pages as the owner asked.
 */

const SECTION = 'credSshManager';
const LANGUAGE_KEY = 'helpLanguage';

let panel: vscode.WebviewPanel | undefined;

interface HelpMessage {
  type: string;
  language?: string;
  delta?: number;
}

async function onHelpMessage(message: HelpMessage): Promise<void> {
  const handlers: Record<string, () => Promise<void>> = {
    zoom: () => applyZoomDelta(message.delta ?? 0),
    language: () => setHelpLanguage(message.language ?? ''),
  };
  await handlers[message.type]?.();
}

/** Writes the setting only for a language the catalog knows — the value comes off a select. */
async function setHelpLanguage(language: string): Promise<void> {
  if (!(HELP_LANGUAGES as readonly string[]).includes(language)) {
    return;
  }
  await vscode.workspace
    .getConfiguration(SECTION)
    .update(LANGUAGE_KEY, language, vscode.ConfigurationTarget.Global);
}

export function helpLanguage(): HelpLanguage {
  const value = vscode.workspace.getConfiguration(SECTION).get<string>(LANGUAGE_KEY, 'en');
  return (HELP_LANGUAGES as readonly string[]).includes(value) ? (value as HelpLanguage) : 'en';
}

export function showHelp(): void {
  if (panel !== undefined) {
    panel.reveal();
    return;
  }
  panel = vscode.window.createWebviewPanel(
    'credSshHelp',
    'CredsForDevs — Help',
    vscode.ViewColumn.Active,
    { enableScripts: true, localResourceRoots: [] },
  );
  const render = (): void => {
    if (panel !== undefined) {
      panel.webview.html = renderHelpHtml({ language: helpLanguage(), uiScale: currentUiScale() });
    }
  };
  render();
  const zoomHook = pushUiScaleTo(panel.webview);
  const languageHook = vscode.workspace.onDidChangeConfiguration((change) => {
    if (change.affectsConfiguration(`${SECTION}.${LANGUAGE_KEY}`)) {
      render();
    }
  });
  panel.webview.onDidReceiveMessage((message: HelpMessage) => void onHelpMessage(message));
  panel.onDidDispose(() => {
    zoomHook.dispose();
    languageHook.dispose();
    panel = undefined;
  });
}
