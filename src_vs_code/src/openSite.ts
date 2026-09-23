import * as vscode from 'vscode';
import { siteUrlToOpen } from './siteUrl';
import { describeError } from './describeError';
import { StorageManager } from './storageManager';
import { EntityMetadata } from './types';
import { parseFields } from './entityFields';
import { admit, openedText } from './pinAdmission';
import { entryPinGate } from './pinPrompt';

/**
 * Open an entry's stored URL in the default browser (issue #104) — the `vscode` half, and the ONE
 * place a stored URL reaches `vscode.env.openExternal` (a structural test pins the callers).
 *
 * <p>Judged by `siteUrl.ts` first: only http and https leave, and a refusal is said, naming the
 * entry. Every other outcome is said too — an editor that answers "not opened", or throws, is a
 * warning rather than a click that silently did nothing. Returns whether the browser was asked.</p>
 */
export async function openSite(entryName: string, raw: string | undefined): Promise<boolean> {
  const judged = siteUrlToOpen(raw);
  if (!judged.ok) {
    return warn(`"${entryName}": ${judged.reason}`);
  }
  try {
    // Strict parsing of the WHATWG serialization `siteUrlToOpen` produced — already well formed.
    const opened = await vscode.env.openExternal(vscode.Uri.parse(judged.url, true));
    return opened || warn(`VS Code did not open ${judged.url} in the browser.`);
  } catch (error) {
    return warn(`Could not open ${judged.url}: ${describeError(error)}`);
  }
}

/**
 * The context menu's *Open Site in Browser*: the entry's CURRENT url, read through the same PIN gate
 * the viewer uses — the menu token was only the flag walk's hint, so a URL a sync changed since is
 * judged as it is now. A PIN-protected entry asks first; declining opens nothing, a wrong PIN says
 * so, and an entry that turns out to have no URL says that instead of doing nothing.
 */
export async function openEntrySite(storage: StorageManager, accountId: string, details: EntityMetadata): Promise<boolean> {
  const gate = entryPinGate(accountId, details.id, details.name);
  const admission = await admit(storage, accountId, details.id, gate);
  if (admission.kind !== 'in') {
    return admission.kind === 'refused' ? warn(admission.reason) : false;
  }
  const fields = parseFields(await openedText(await storage.getFieldsRaw(accountId, details.id), gate));
  return openSite(details.name, fields.url);
}

function warn(message: string): false {
  void vscode.window.showWarningMessage(message);
  return false;
}
