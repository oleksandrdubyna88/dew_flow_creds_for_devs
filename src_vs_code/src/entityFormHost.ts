/**
 * The host side of the entity form — what needs `vscode` and Node, kept apart from the message
 * loop in `entityFormPanel.ts`: mounting the panel, drawing generated secrets, and running the
 * agent-doors footer's commands (T24b).
 */
import * as vscode from 'vscode';
import { renderHtml } from './entityFormPage';
import { draw } from './formGenerate';
import { parseSshPrivateKey } from './sshKeyParse';
import { currentUiScale, pushUiScaleTo } from './uiScaleHost';
import { FORM_WEBVIEW_OPTIONS, formPanels } from './formPanels';
import type { EntityFormOptions, FormMessage } from './entityFormPanel';

/** The public half of a freshly generated private key, for the form's Public key field. */
function publicLineFor(privateKey: string): string {
  const parsed = parseSshPrivateKey(privateKey);
  return parsed.ok ? parsed.key.publicLine : '';
}

export function formPanelFor(options: EntityFormOptions): vscode.WebviewPanel {
  return vscode.window.createWebviewPanel(
    'credSshEntityForm',
    options.mode === 'create' ? 'New Entity' : `Edit: ${options.initial?.name ?? ''}`,
    vscode.ViewColumn.Active,
    FORM_WEBVIEW_OPTIONS,
  );
}

/**
 * Register, render, and hook the zoom — everything a panel needs before its message loop.
 *
 * <p>Registered BEFORE the markup is built, because a filled-in form holds a plaintext secret
 * for as long as it stays open and locking the vaults has to be able to reach it: rendering
 * can throw, and a panel already on screen must be closable whether or not it got a page.</p>
 */
export function mountForm(panel: vscode.WebviewPanel, options: EntityFormOptions): () => void {
  const unregister = formPanels.register(panel);
  panel.webview.html = renderHtml({ ...options, uiScale: currentUiScale() });
  // T28: this page follows the shared setting for as long as it lives.
  const zoomHook = pushUiScaleTo(panel.webview);
  panel.onDidDispose(() => zoomHook.dispose());
  return unregister;
}

/**
 * Drawn HERE, not in the page: `crypto.randomInt` is a Node API, and a webview reaching for
 * `Math.random()` would produce something that merely looks random.
 */
export function answerGenerate(panel: vscode.WebviewPanel, message: FormMessage): void {
  const made = draw({
    kind: message.kind,
    genLength: message.genLength,
    genLower: message.genLower,
    genUpper: message.genUpper,
    genDigits: message.genDigits,
    genSymbols: message.genSymbols,
    genKeyType: message.genKeyType,
    genWords: message.genWords,
  });
  void panel.webview.postMessage({
    type: 'generated',
    ...made,
    publicLine: made.target === 'privateKey' ? publicLineFor(made.value) : '',
  });
}

const DOOR_COMMANDS: ReadonlySet<string> = new Set([
  'credSshManager.revokeConfigAccess',
  'credSshManager.enableCliAccess',
  'credSshManager.closeRemoteBridge',
  'credSshManager.setUpWslRelay',
]);

export async function runDoorCommand(command: string, options: EntityFormOptions): Promise<void> {
  if (!DOOR_COMMANDS.has(command)) {
    return;
  }
  await vscode.commands.executeCommand(command, options.entityTarget);
}

