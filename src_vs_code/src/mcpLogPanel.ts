import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { McpLogRow, mcpRowsIn } from './mcpLogRows';
import { renderMcpLog } from './mcpLogPage';

/**
 * The **MCP logs** view: everything an agent asked this window for, and what it was told.
 *
 * <p>It reads the broker's own audit files — a file per run, in a folder per day, swept after a
 * fortnight — and shows the lines that came in through MCP. There is no second store and no
 * second retention rule; the one that already exists is the one this is a window onto.</p>
 *
 * <p><b>Rendered once, filtered in the page.</b> The rows are already in memory by the time the
 * page is built, and a filter that went back to the extension host would make the three buttons
 * feel like three loads. Nothing here is interactive beyond that, so the page needs no message
 * channel at all.</p>
 */

/** Where the broker writes. Mirrors `agentAuditFile.ts`, which owns the naming. */
const AUDIT_PREFIX = 'agent-';

export function showMcpLog(storageDir: string | undefined): void {
  const panel = vscode.window.createWebviewPanel(
    'credSshMcpLog',
    'CredsForDevs: MCP logs',
    vscode.ViewColumn.Active,
    { enableScripts: true, localResourceRoots: [] },
  );
  panel.webview.html = renderMcpLog(readRows(storageDir));
}

/**
 * Every MCP row on disk, newest day first.
 *
 * <p>Best-effort in every direction, like the writer: an unreadable folder answers an empty list
 * rather than an error dialog. A journal that could fail to open is a journal somebody stops
 * trusting, and there is nothing here a person can do about a permissions problem in a folder
 * VS Code handed us.</p>
 */
export function readRows(storageDir: string | undefined): McpLogRow[] {
  if (storageDir === undefined) {
    return [];
  }
  const root = path.join(storageDir, 'logs');
  const rows = safeList(root)
    .sort()
    .reverse()
    .flatMap((day) => rowsForDay(root, day));
  // Newest first within the newest day: a person opening this wants what just happened.
  return rows.reverse();
}

/** One day folder's audit files, in the order they were written. */
function rowsForDay(root: string, day: string): McpLogRow[] {
  return safeList(path.join(root, day))
    .filter((file) => file.startsWith(AUDIT_PREFIX))
    .flatMap((file) => mcpRowsIn(safeRead(path.join(root, day, file)), day));
}

function safeList(folder: string): string[] {
  try {
    return fs.readdirSync(folder);
  } catch {
    return [];
  }
}

function safeRead(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}
