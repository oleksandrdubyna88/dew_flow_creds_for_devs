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
// The recipient's own build. Past LEGACY_SHARES_UNTIL an unbound FOLDER share is refused, so
// running this at 0.0.0 would hide exactly the refusal the user hit.
const EXT_VERSION = require(path.join(__dirname, '..', 'package.json')).version;

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

// Point this at whatever is running: a bare `dotnet run`, or the real deployment
// stack over HTTPS. Testing the deployed stack is the whole point — a transport
// that works against plain HTTP on loopback has not been shown to work through
// nginx, TLS termination and the forwarded-proto guard.
//
//   node scripts/server-transport-itest.cjs https://vault.example.com
//
// Against a certificate signed by a CA Node does not know, set NODE_EXTRA_CA_CERTS
// to the CA file. The transport uses global fetch with no certificate override —
// deliberately — so this is exactly the constraint a real user faces.
const BASE_URL = process.argv[2] || process.env.VAULT_URL || 'http://127.0.0.1:5113';
console.log(`target: ${BASE_URL}\n`);
const t = new ServerTransport(BASE_URL, (acc) => Promise.resolve(tokens[acc.accountId]));

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
  // Which form to seal in is the SERVER's answer, exactly as ShareInbox.deliverBatch asks it:
  // a server below contract 2 drops `format`, so a bound share would arrive unopenable.
  const form = t.carriesShareFormat ? 'server' : 'legacy';
  check('server states its contract version', t.serverContract > 0);
  console.log(`  ..  server contract ${t.serverContract} -> sealing in the '${form}' form`);
  const item = sealShare(payload, bobMember.shareKeyId, alice, 'PIN-9', Date.now(), { form });
  await t.appendShares(alice, bobMember, [item]);

  check("sender's own inbox stays empty", (await t.listShares(alice)).length === 0);
  const inbox = await t.listShares(bob);
  check('recipient sees exactly one share', inbox.length === 1);
  check('sender identity is server-stamped', inbox[0].item.fromEmail === alice.email);
  check('binding routes decryption to the email', inbox[0].shareKeyId === bob.email);
  // The check this whole script existed to make and could not: the AAD form has to survive the
  // trip, or the recipient cannot choose it. Dropped between 0.82.1 and 0.87.
  check('the AAD form survives the round trip', inbox[0].item.format === item.format);
  // The server stamps these two itself, which is why the server form does not bind them.
  check('the server stamps its own createdAt', inbox[0].item.createdAt !== item.createdAt);

  // The recipient opens it with the PIN; a wrong PIN must fail. `true` = came off a vault
  // server, which is what ShareInbox passes and what makes the server form honourable.
  const opened = openShare(inbox[0].item, inbox[0].shareKeyId, 'PIN-9', EXT_VERSION, true);
  check('payload decrypts with the right PIN', opened.secrets.dbConnection === 'mysql://u:secret@h/db');
  let threw = false;
  try { openShare(inbox[0].item, inbox[0].shareKeyId, 'nope', EXT_VERSION, true); } catch { threw = true; }
  check('wrong PIN is rejected', threw);

  // The same item off a folder must NOT open: the server form leaves `fromEmail` unbound, and
  // only a server can stamp it.
  let refused = false;
  try { openShare(inbox[0].item, inbox[0].shareKeyId, 'PIN-9', EXT_VERSION); } catch { refused = true; }
  check('the server form is refused when it did not come from a server', refused || form === 'legacy');

  // resolveShares (the accept-all engine) works over server-sourced items.
  const r = resolveShares(inbox, ['PIN-9'], EXT_VERSION, () => true);
  check('resolveShares opens server items', r.opened.length === 1 && r.remaining.length === 0);

  await t.removeShare(bob, inbox[0]);
  check('accepted share is removed server-side', (await t.listShares(bob)).length === 0);

  console.log(fails === 0 ? '\nALL TRANSPORT CHECKS PASSED' : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
})();
