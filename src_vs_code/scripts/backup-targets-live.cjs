#!/usr/bin/env node
'use strict';

// backup-targets-live.cjs — the ONE live check of a contract that has two implementations.
//
// GET /api/org/backup/targets and the status's `lastSuccessAt` are implemented twice: in
// src_minimalapi_server (C#) and in src_vs_code/src/orgBackupClient.ts (TypeScript). Each suite
// asserts contract/backup-targets-v1.json, and testing.md is explicit that two suites agreeing with
// one file is NOT the live check it requires: "One live check compares the two sides for real,
// against a running counterpart, and fails on degradation." This is that check. It starts nothing
// itself — the caller starts the real server, exactly as the .http contract suite's job does — and
// drives the REAL compiled client (out/orgBackupClient.js, the vscode-free half) against it.
//
// What it drives, end to end over the wire, as an administrator's extension would:
//   1. readTargets      — the route exists and answers a list (a 404 is a client built from this
//                         commit talking to a server without the route: a contract failure here,
//                         because the caller started the server from the same commit);
//   2. readStatus       — the status carries lastSuccessAt as an instant;
//   3. saveSettings     — the whole destinations list with one NEW destination at a host that
//                         cannot resolve (.invalid, RFC 6761): the server proves it with a write
//                         probe and REFUSES, and that refusal must arrive through the client's own
//                         error path naming the destination — never as a 204 that saved nothing
//                         reachable;
//   4. readTargets      — nothing was saved by the refused request.
//
// What it does NOT prove, said plainly: a PROVED save (a destination the probe accepts) needs a
// reachable bucket with credentials nobody should commit, so add/edit/remove with a 204 stays
// covered in-process over a stubbed transport (BackupEndpointTests) and never here.
//
// Exit codes follow http-run.mjs: 0 pass · 1 CONTRACT · 3 environment (nothing answered) ·
// 4 configuration (a missing piece, named). The verdict is the exit code, never the log tail.
//
// Run it (the same recipe http/README.md gives for the server):
//   export VAULT_LOCAL_SIGNING_KEY="$(openssl rand -base64 48)"
//   <start the server with that key, a three-officer roster, a KEK and a fresh data dir>
//   (cd src_vs_code && npx tsc -p ./)
//   node src_vs_code/scripts/backup-targets-live.cjs
//
// The signing key is the same one the server was started with; whoever holds it can mint a token
// for any address on that server, so it belongs to a throwaway local server and nothing else.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const KEY = process.env.VAULT_LOCAL_SIGNING_KEY ?? '';
const BASE = withoutTrailingSlashes(process.env.VAULT_BASE_URL ?? 'http://127.0.0.1:5099');

/** A loop rather than `/\/+$/`: that regex backtracks super-linearly on a long run of slashes. */
function withoutTrailingSlashes(url) {
  let trimmed = url;
  while (trimmed.endsWith('/')) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
}
const DOMAIN = process.env.VAULT_TEST_DOMAIN ?? 'example.com';
const OFFICER = `officer@${DOMAIN}`;

const CONTRACT = 1;
const ENVIRONMENT = 3;
const CONFIGURATION = 4;

function leave(code, message) {
  const word = { 1: 'CONTRACT REGRESSION', 3: 'ENVIRONMENT', 4: 'CONFIGURATION' }[code];
  console.error(`backup-targets-live: ${word} — ${message}`);
  process.exit(code);
}

/** An HS256 token the `Local` scheme accepts — the same mint http/httpyac.config.js uses. */
function mint(email, name) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const signingInput =
    `${encode({ alg: 'HS256', typ: 'JWT' })}.` +
    encode({ iss: 'cred-vault-local', email, name, iat: now, nbf: now - 60, exp: now + 3600 });
  const signature = crypto.createHmac('sha256', KEY).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

/** The compiled client, or the sentence saying how to build it. */
function loadClient() {
  const out = path.join(__dirname, '..', 'out');
  const client = path.join(out, 'orgBackupClient.js');
  if (!fs.existsSync(client)) {
    leave(CONFIGURATION, `${client} is not built. Run \`npx tsc -p ./\` in src_vs_code first.`);
  }
  return { ...require(client), ...require(path.join(out, 'backupTargets.js')) };
}

async function alive() {
  try {
    const response = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(10_000) });
    return response.ok;
  } catch {
    return false;
  }
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  if (KEY.length === 0) {
    leave(CONFIGURATION, 'VAULT_LOCAL_SIGNING_KEY is not set — it must be the key the server under test was started with.');
  }
  if (!(await alive())) {
    leave(ENVIRONMENT, `nothing answered at ${BASE}/api/health. The contract was NOT exercised.`);
  }
  const { OrgBackupClient, toInputs } = loadClient();
  const account = { accountId: 'live-officer', email: OFFICER, provider: 'microsoft' };
  const token = mint(OFFICER, 'Olivia Officer');
  const client = new OrgBackupClient(BASE, async () => token);
  let checks = 0;

  // 1. The route exists and the client reads it as a list.
  const before = await client.readTargets(account);
  if (before === undefined) {
    leave(CONTRACT, 'GET /api/org/backup/targets answered 404: the client built from this commit reads that as a server older than destination editing, and this server was started from the same commit.');
  }
  if (!Array.isArray(before)) {
    leave(CONTRACT, `readTargets answered ${typeof before}, not a list.`);
  }
  checks += 1;

  // 2. The status carries the second instant.
  const status = await client.readStatus(account);
  if (status.lastResult === 'no backup here') {
    leave(CONTRACT, 'GET /api/org/backup/status answered 404 on a server started from this commit.');
  }
  if (typeof status.lastSuccessAt !== 'number') {
    leave(CONTRACT, `the status carries lastSuccessAt as ${typeof status.lastSuccessAt}, and the row that tells the last run from the last success needs a number.`);
  }
  checks += 1;

  // 3. A save the server must REFUSE, refused through the client's own error path.
  const unreachable = {
    kind: 's3',
    endpoint: 'https://nowhere.invalid',
    region: 'eu-central-1',
    bucket: 'vaults',
    prefix: 'live-probe',
    accessKeyId: 'AKIDLIVE',
    secretAccessKey: 'not-a-real-secret',
  };
  let refusal = '';
  try {
    await client.saveSettings(account, {
      scheduleHourUtc: status.scheduleHourUtc,
      retentionDays: status.retentionDays,
      targets: [...toInputs(before), unreachable],
    });
  } catch (error) {
    refusal = error instanceof Error ? error.message : String(error);
  }
  if (refusal.length === 0) {
    leave(CONTRACT, 'the server ACCEPTED a destination at nowhere.invalid — the save-time probe did not run, or the client did not surface its refusal.');
  }
  if (refusal.startsWith('Vault server unreachable')) {
    leave(ENVIRONMENT, `the save could not reach the server: ${refusal}`);
  }
  if (!refusal.includes('s3 vaults/live-probe')) {
    leave(CONTRACT, `the refusal does not name the destination the way the client shows it: "${refusal}"`);
  }
  checks += 1;

  // 4. Nothing was saved.
  const after = await client.readTargets(account);
  if (!same(before, after)) {
    leave(CONTRACT, `a refused save changed the destinations: before ${JSON.stringify(before)}, after ${JSON.stringify(after)}.`);
  }
  checks += 1;

  console.log(`backup-targets-live: PASS — ${checks} check(s) against ${BASE}: the compiled client read the destinations and the status's lastSuccessAt, and a save the server refused arrived as the client's own refusal naming the destination ("${refusal.slice(0, 80)}…").`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  leave(message.startsWith('Vault server unreachable') ? ENVIRONMENT : CONTRACT, message);
});
