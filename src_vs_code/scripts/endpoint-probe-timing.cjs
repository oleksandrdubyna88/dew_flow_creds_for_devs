#!/usr/bin/env node
'use strict';

/**
 * Where the time of an endpoint walk goes — one line per announcement file.
 *
 * <p>Written for todo/PLAN_stale_endpoint_files_slow_every_refusal.md §3. A refusal for an unknown
 * config key walked every `window-*.json` and took about 2 s per file; this script splits that cost
 * into the parts a walk pays for each file, so the fix is chosen by measurement rather than by
 * arithmetic:</p>
 *
 * <ul>
 *   <li><b>read</b> — reading and parsing the file;</li>
 *   <li><b>pid</b> — whether the announcing process is still there (`process.kill(pid, 0)`:
 *       `ESRCH` is gone, `EPERM` is alive but not ours to signal);</li>
 *   <li><b>tcp</b> — one raw connect to the announced loopback port, bounded at 2 s;</li>
 *   <li><b>health</b> — one `GET /v1/health`, bounded at 2 s, exactly as the clients probe.</li>
 * </ul>
 *
 * <p>It prints pids, ports and timings — nothing secret, and no path: the directory is named only by
 * its file count. It writes nothing and deletes nothing; the files belong to the extension.</p>
 *
 * Usage: node endpoint-probe-timing.cjs [<endpoints directory>]
 *   default: CREDS_ENDPOINT_DIR, else the stable VS Code globalStorage path for this OS.
 */

const fs = require('node:fs');
const net = require('node:net');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const BOUND_MS = 2000;
const HOST = '127.0.0.1';

function defaultDir() {
  if (process.env.CREDS_ENDPOINT_DIR) {
    return process.env.CREDS_ENDPOINT_DIR;
  }
  const root = process.platform === 'win32' ? process.env.APPDATA : path.join(os.homedir(), '.config');
  return path.join(root ?? '', 'Code', 'User', 'globalStorage', 'remsoftdev.creds-for-devs', 'endpoints');
}

function since(start) {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

function pidState(pid) {
  try {
    process.kill(pid, 0);
    return 'alive';
  } catch (e) {
    return e.code === 'EPERM' ? 'alive(EPERM)' : e.code === 'ESRCH' ? 'gone' : `err:${e.code}`;
  }
}

function tcpConnect(port) {
  const start = process.hrtime.bigint();
  return new Promise((resolve) => {
    const socket = net.connect({ host: HOST, port });
    const done = (outcome) => {
      socket.destroy();
      resolve({ outcome, ms: since(start) });
    };
    socket.setTimeout(BOUND_MS, () => done('timeout'));
    socket.once('connect', () => done('open'));
    socket.once('error', (e) => done(e.code === 'ECONNREFUSED' ? 'refused' : `err:${e.code}`));
  });
}

function health(port) {
  const start = process.hrtime.bigint();
  return new Promise((resolve) => {
    const request = http.get({ host: HOST, port, path: '/v1/health', timeout: BOUND_MS }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        let service = '';
        try {
          service = JSON.parse(body).service ?? '';
        } catch {
          service = 'not-json';
        }
        resolve({ outcome: `${response.statusCode}:${service || '-'}`, ms: since(start) });
      });
    });
    request.on('timeout', () => {
      request.destroy(new Error('timeout'));
    });
    request.on('error', (e) => resolve({ outcome: e.message === 'timeout' ? 'timeout' : `err:${e.code}`, ms: since(start) }));
  });
}

function readOne(file) {
  const start = process.hrtime.bigint();
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { value, ms: since(start) };
  } catch {
    return { value: undefined, ms: since(start) };
  }
}

async function main() {
  const dir = process.argv[2] ?? defaultDir();
  const listStart = process.hrtime.bigint();
  let names;
  try {
    names = fs.readdirSync(dir).filter((n) => /^window-.*\.json$/.test(n));
  } catch (e) {
    console.log(`cannot read the endpoint directory: ${e.code}`);
    process.exitCode = 2;
    return;
  }
  const listMs = since(listStart);
  console.log(`platform=${process.platform} files=${names.length} list_ms=${listMs.toFixed(1)}`);
  console.log(['pid', 'port', 'read_ms', 'pid_state', 'tcp', 'tcp_ms', 'health', 'health_ms'].join('\t'));

  const totals = { tcp: 0, health: 0 };
  for (const name of names) {
    const { value, ms: readMs } = readOne(path.join(dir, name));
    if (!value || typeof value.pid !== 'number' || typeof value.port !== 'number') {
      console.log(`?\t?\t${readMs.toFixed(1)}\tunparsed`);
      continue;
    }
    const pid = pidState(value.pid);
    const tcp = await tcpConnect(value.port);
    const probe = await health(value.port);
    totals.tcp += tcp.ms;
    totals.health += probe.ms;
    console.log(
      [value.pid, value.port, readMs.toFixed(1), pid, tcp.outcome, tcp.ms.toFixed(0), probe.outcome, probe.ms.toFixed(0)].join('\t'),
    );
  }
  console.log(`total_tcp_ms=${totals.tcp.toFixed(0)} total_health_ms=${totals.health.toFixed(0)}`);
}

void main();
