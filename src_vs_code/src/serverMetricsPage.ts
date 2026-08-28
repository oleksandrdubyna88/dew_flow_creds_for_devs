import { escapeHtml } from './webviewHtml';

/**
 * The officers' metrics page (server-ops item 5, the owner's shape, 2026-08-28): the server's
 * one JSON document laid out for a human. Pure — the panel is `serverMetricsPanel.ts`.
 */

export interface ServerMetrics {
  service: string;
  version: string;
  runtime: string;
  runtimeSupport: string;
  startedAt: string;
  uptimeSeconds: number;
  requests: number;
  status4xx: number;
  status5xx: number;
  rateLimited: number;
  vaultReads: number;
  vaultWrites: number;
  vaultBytesWritten: number;
  vaults: number;
  vaultBytesOnDisk: number;
  pendingShares: number;
  shareBytesOnDisk: number;
  dataDirFreeBytes: number;
}

const NUMBER_FIELDS: ReadonlyArray<keyof ServerMetrics> = [
  'uptimeSeconds', 'requests', 'status4xx', 'status5xx', 'rateLimited', 'vaultReads', 'vaultWrites',
  'vaultBytesWritten', 'vaults', 'vaultBytesOnDisk', 'pendingShares', 'shareBytesOnDisk', 'dataDirFreeBytes',
];
const STRING_FIELDS: ReadonlyArray<keyof ServerMetrics> = ['service', 'version', 'runtime', 'runtimeSupport', 'startedAt'];

/** The server's shape, checked field by field — a newer server may add fields, never drop these. */
export function isServerMetrics(value: unknown): value is ServerMetrics {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return NUMBER_FIELDS.every((f) => typeof v[f] === 'number') && STRING_FIELDS.every((f) => typeof v[f] === 'string');
}

/** `1.5 GiB`, `312 KiB`, `-1` → `unknown`. */
const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];

export function formatBytes(bytes: number): string {
  if (bytes < 0) {
    return 'unknown';
  }
  const unit = bytes < 1024 ? 0 : Math.min(Math.floor(Math.log2(bytes) / 10), UNITS.length - 1);
  const value = bytes / 1024 ** unit;
  return `${unit === 0 ? value : value.toFixed(1)} ${UNITS[unit]}`;
}

/** `3d 4h 05m`, `4h 05m`, `12m`. */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const mm = String(minutes).padStart(2, '0');
  return days > 0 ? `${days}d ${hours}h ${mm}m` : hours > 0 ? `${hours}h ${mm}m` : `${minutes}m`;
}

export interface ServerMetricsViewOptions {
  location: string;
  officerEmail: string;
  metrics: ServerMetrics;
  /** When the page was read — the numbers are a snapshot, not a live feed. */
  readAt: number;
}

function row(label: string, value: string): string {
  return `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
}

function section(title: string, rows: string): string {
  return `<h3>${escapeHtml(title)}</h3><table>${rows}</table>`;
}

export function renderServerMetricsHtml(options: ServerMetricsViewOptions): string {
  const m = options.metrics;
  const urgent = /PAST end of support|move to the next LTS/.test(m.runtimeSupport);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<title>Server metrics — ${escapeHtml(options.location)}</title>
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
         background: var(--vscode-editor-background); padding: 16px 24px; max-width: 900px; }
  h2 { font-size: 1.2em; margin: 0 0 4px; }
  h3 { font-size: .95em; text-transform: uppercase; letter-spacing: .06em; margin: 18px 0 6px; opacity: .85; }
  .quiet { opacity: .7; }
  .warn { color: var(--vscode-editorWarning-foreground, #d0a000); font-weight: 600; }
  table { border-collapse: collapse; }
  th { text-align: left; font-weight: 500; padding: 3px 18px 3px 0; opacity: .85; }
  td { padding: 3px 0; font-family: var(--vscode-editor-font-family, monospace); }
</style>
</head>
<body>
  <h2>${escapeHtml(m.service)} ${escapeHtml(m.version)} — ${escapeHtml(options.location)}</h2>
  <p class="quiet">Read at ${escapeHtml(new Date(options.readAt).toLocaleString())} as ${escapeHtml(options.officerEmail)} — a snapshot, not a live feed; run the command again for a fresh one.</p>
  <p class="${urgent ? 'warn' : 'quiet'}">${escapeHtml(m.runtimeSupport)}</p>
  ${section('Process', [
    row('Runtime', m.runtime),
    row('Started', new Date(m.startedAt).toLocaleString()),
    row('Uptime', formatUptime(m.uptimeSeconds)),
  ].join(''))}
  ${section('Requests since start', [
    row('Total', String(m.requests)),
    row('Client errors (4xx)', String(m.status4xx)),
    row('Server errors (5xx)', String(m.status5xx)),
    row('Rate-limited (429)', String(m.rateLimited)),
  ].join(''))}
  ${section('Vault traffic since start', [
    row('Reads', String(m.vaultReads)),
    row('Writes', String(m.vaultWrites)),
    row('Bytes written', formatBytes(m.vaultBytesWritten)),
  ].join(''))}
  ${section('On disk now', [
    row('Vaults', `${m.vaults} (${formatBytes(m.vaultBytesOnDisk)})`),
    row('Pending shares', `${m.pendingShares} (${formatBytes(m.shareBytesOnDisk)})`),
    row('Free space on the data disk', formatBytes(m.dataDirFreeBytes)),
  ].join(''))}
</body>
</html>`;
}
