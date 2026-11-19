import * as vscode from 'vscode';

/**
 * The green Search row.
 *
 * <p>The owner asked on 2026-11-18 for the magnifier AND the word "Search" to be green, so the
 * row reads as the one control in the tree and not as one more entry. The icon is the easy half:
 * `ThemeIcon` takes a colour. The label is not — a `TreeItem` cannot colour its own text, and the
 * only way the API allows is the one `depDecorations.ts` already documents: give the row a
 * `resourceUri` and answer for that uri from a `FileDecorationProvider`.</p>
 *
 * <p>The uri is synthetic and its scheme is ours, so the provider can recognise the row and
 * refuse every other uri by a string comparison alone — the reason is in `depDecorations.ts`.</p>
 *
 * <p>The colour id lives here and nowhere else in source; `package.json` declares the same string
 * under `contributes.colors`, and a test ties the two. Nothing is built at module load — the
 * `Uri` and the `ThemeColor` are made when asked for.</p>
 */

/** The theme colour of the row's icon and label, declared in `package.json`. */
export const SEARCH_ACCENT_COLOR_ID = 'credSshManager.searchAccent';

/** Ours, and deliberately not a scheme anything else could produce. */
const SEARCH_ROW_SCHEME = 'credssearch';

/** The row's address: `credssearch:/row`. It names no file. */
export function searchRowUri(): vscode.Uri {
  return vscode.Uri.from({ scheme: SEARCH_ROW_SCHEME, path: '/row' });
}

/** The green label, for the search row's uri; `undefined` for every other uri. */
export function searchRowDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
  if (uri.scheme !== SEARCH_ROW_SCHEME) {
    return undefined;
  }
  return new vscode.FileDecoration(
    undefined,
    undefined,
    new vscode.ThemeColor(SEARCH_ACCENT_COLOR_ID),
  );
}
