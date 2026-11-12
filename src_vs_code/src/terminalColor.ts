import * as vscode from 'vscode';
import { DepColorKey, depColorThemeId } from './depColors';

/**
 * The one place a terminal gets a folder's colour: the `color` of its creation options.
 *
 * <p>Its own module, not a function of `pinnedTerminal.ts`: `terminalManager.test.ts` replaces `./pinnedTerminal`
 * with `composedShellPath` alone, and a helper there would be missing in that world. VS Code fixes a terminal's
 * colour when it is CREATED, so every site that creates a folder-named terminal spreads this into its options
 * (`folderColorScan.test.ts` counts the sites). Without a key it adds nothing, so an uncoloured terminal is
 * created with the options it always had.</p>
 */
export function folderColorOption(key: DepColorKey | undefined): { readonly color?: vscode.ThemeColor } {
  return key === undefined ? {} : { color: new vscode.ThemeColor(depColorThemeId(key)) };
}
