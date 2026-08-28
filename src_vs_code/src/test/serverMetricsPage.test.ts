import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ServerMetrics, formatBytes, formatUptime, isServerMetrics, renderServerMetricsHtml } from '../serverMetricsPage';

const METRICS: ServerMetrics = {
  service: 'cred-vault-server',
  version: '0.4.0',
  runtime: '.NET 10.0.3',
  runtimeSupport: '.NET 10.0.3 (LTS) — supported until 2028-11-14, 800 days left',
  startedAt: '2026-08-28T10:00:00.0000000+00:00',
  uptimeSeconds: 3 * 86_400 + 4 * 3600 + 5 * 60,
  requests: 1234,
  status4xx: 12,
  status5xx: 1,
  rateLimited: 3,
  vaultReads: 400,
  vaultWrites: 80,
  vaultBytesWritten: 80 * 1024 * 1024,
  vaults: 21,
  vaultBytesOnDisk: 41 * 1024 * 1024,
  pendingShares: 2,
  shareBytesOnDisk: 40 * 1024,
  dataDirFreeBytes: 120 * 1024 * 1024 * 1024,
};

test('the page lays the document out for a person — counts, bytes in units, uptime in days and hours', () => {
  const html = renderServerMetricsHtml({ location: 'https://vault.example.com', officerEmail: 'cto@example.com', metrics: METRICS, readAt: 0 });
  assert.ok(html.includes('cred-vault-server 0.4.0'));
  assert.ok(html.includes('3d 4h 05m'), 'uptime');
  assert.ok(html.includes('80.0 MiB'), 'bytes written');
  assert.ok(html.includes('21 (41.0 MiB)'), 'vaults and their size');
  assert.ok(html.includes('120.0 GiB'), 'free space');
  assert.ok(html.includes('supported until 2028-11-14'));
  assert.ok(html.includes('cto@example.com'));
  assert.ok(!html.includes('class="warn"'), 'nothing urgent about the runtime');
});

test('a runtime past support, or inside its last quarter, is shown as a warning', () => {
  const late = { ...METRICS, runtimeSupport: '.NET 8.0.1 (LTS) is PAST end of support since 2026-11-10 — move to the current LTS now' };
  assert.ok(renderServerMetricsHtml({ location: 'x', officerEmail: 'a', metrics: late, readAt: 0 }).includes('class="warn"'));
});

test('the server shape is checked field by field — a newer server may add, never drop', () => {
  assert.equal(isServerMetrics(METRICS), true);
  assert.equal(isServerMetrics({ ...METRICS, extra: 1 }), true);
  const { vaults: _dropped, ...without } = METRICS;
  assert.equal(isServerMetrics(without), false);
  assert.equal(isServerMetrics({ ...METRICS, requests: '1' }), false);
  assert.equal(isServerMetrics(null), false);
});

test('units and uptime read as people say them', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1.5 KiB');
  assert.equal(formatBytes(-1), 'unknown');
  assert.equal(formatUptime(59), '0m');
  assert.equal(formatUptime(3_900), '1h 05m');
  assert.equal(formatUptime(90_000), '1d 1h 00m');
});
