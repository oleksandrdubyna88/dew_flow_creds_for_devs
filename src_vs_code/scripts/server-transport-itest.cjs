// Integration test: drives the extension's compiled ServerTransport against
// a RUNNING Cred Vault Server started with the Local auth scheme.
//
//   # terminal 1 (repo root ../cred-vault-server/src)
//   Vault__DataDir=/tmp/cv Vault__AllowedDomains=example.com \
//     Auth__Microsoft__Tenant= Auth__Local__SigningKey=itest-key-itest-key-itest-key-32x \
//     ASPNETCORE_URLS=http://127.0.0.1:5113 dotnet run
//
//   # terminal 2
//   npm run compile && node scripts/server-transport-itest.cjs
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const Module = require('module');
const orig = Module._resolveFilename;
// The transport imports `vscode` for config/Uri only — stub it out.
const stub = path.join(os.tmpdir(), 'cred-ssh-vscode-stub.cjs');
fs.writeFileSync(stub, 'module.exports = { workspace: { onDidChangeConfiguration(){}, getConfiguration: () => ({ get: (_k, d) => d }) }, Uri: { file: (p) => ({ fsPath: p }) } };');
Module._resolveFilename = (req, ...a) => (req === 'vscode' ? stub : orig.call(Module, req, ...a));

const EXT = path.join(__dirname, '..', 'out');
const { ServerTransport } = require(path.join(EXT, 'serverTransport.js'));
const { sealShare, openShare, resolveShares } = require(path.join(EXT, 'shareFormat.js'));

// Sign local-scheme JWTs (same shape the server validates).
const KEY = 'itest-key-itest-key-itest-key-32x';
function jwt(email, name) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ iss: 'cred-vault-local', email, name, exp: Math.floor(Date.now()/1000) + 600 });
  const sig = crypto.createHmac('sha256', KEY).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
const alice = { accountId: 'a-1', email: 'alice@example.com', provider: 'microsoft' };
const bob   = { accountId: 'b-1', email: 'bob@example.com',   provider: 'microsoft' };
const tokens = { 'a-1': jwt(alice.email, 'Alice'), 'b-1': jwt(bob.email, 'Bob') };
const t = new ServerTransport('http://127.0.0.1:5113', (acc) => Promise.resolve(tokens[acc.accountId]));

let fails = 0;
const check = (what, ok) => { console.log(`${ok ? '  ok' : 'FAIL'}  ${what}`); if (!ok) fails++; };

(async () => {
  check('empty vault reads as undefined', (await t.readVault(alice)) === undefined);
  const vault = JSON.stringify({ format: 'cred-ssh-manager-backup', data: 'ciphertext-A' });
  await t.writeVault(alice, vault, []);
  check('vault round-trips through the server', (await t.readVault(alice)) === vault);
  await t.writeVault(bob, JSON.stringify({ format: 'cred-ssh-manager-backup', data: 'ciphertext-B' }), []);
  check("other account's vault is separate", (await t.readVault(bob)).includes('ciphertext-B'));

  const team = await t.listTeam([alice, bob]);
  const emails = team.map((m) => m.account.email).sort();
  check('team lists both members', emails.join() === 'alice@example.com,bob@example.com');
  const bobMember = team.find((m) => m.account.email === bob.email);
  check('share key id is the email (server binding)', bobMember.shareKeyId === bob.email);

  // Alice shares an entity with Bob.
  const payload = {
    node: { id: 'e1', name: 'prod db', type: 'entity', parentId: null,
            details: { id: 'e1', name: 'prod db', isSshEnabled: false, isDb: true, dbType: 'mysql' } },
    secrets: { dbConnection: 'mysql://u:secret@h/db' },
  };
  const item = sealShare(payload, bobMember.shareKeyId, alice, 'PIN-9', Date.now());
  await t.appendShares(alice, bobMember, [item]);

  check("sender's own inbox stays empty", (await t.listShares(alice)).length === 0);
  const inbox = await t.listShares(bob);
  check('recipient sees exactly one share', inbox.length === 1);
  check('sender identity is server-stamped', inbox[0].item.fromEmail === alice.email);
  check('binding routes decryption to the email', inbox[0].shareKeyId === bob.email);

  // The recipient opens it with the PIN; a wrong PIN must fail.
  const opened = openShare(inbox[0].item, inbox[0].shareKeyId, 'PIN-9');
  check('payload decrypts with the right PIN', opened.secrets.dbConnection === 'mysql://u:secret@h/db');
  let threw = false;
  try { openShare(inbox[0].item, inbox[0].shareKeyId, 'nope'); } catch { threw = true; }
  check('wrong PIN is rejected', threw);

  // resolveShares (the accept-all engine) works over server-sourced items.
  const r = resolveShares(inbox, ['PIN-9']);
  check('resolveShares opens server items', r.opened.length === 1 && r.remaining.length === 0);

  await t.removeShare(bob, inbox[0]);
  check('accepted share is removed server-side', (await t.listShares(bob)).length === 0);

  console.log(fails === 0 ? '\nALL TRANSPORT CHECKS PASSED' : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
})();
