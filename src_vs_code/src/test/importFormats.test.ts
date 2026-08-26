import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ImportedEntity,
  detectFormat,
  hostFrom,
  parseCsv,
  parseCsvExport,
  parseImport,
  parseJsonExport,
  parseSshConfig,
  toTreeNodes,
} from '../importFormats';

// ---- ~/.ssh/config -----------------------------------------------------------

const SSH_CONFIG = `
# work
Host prod
  HostName 10.0.0.7
  User deploy
  Port 2222
  IdentityFile ~/.ssh/id_prod

Host gw jump
  HostName gateway.corp.com
  User admin
  ProxyJump bastion

Host bare-alias

Host *
  ServerAliveInterval 30
`;

test('a Host block becomes an SSH entity with its address, user, port and key path', () => {
  const { entities } = parseSshConfig(SSH_CONFIG);
  const prod = entities.find((e) => e.name === 'prod');
  assert.notEqual(prod, undefined);

  // Read once into a non-optional local: five `prod?.` reads are five branches, and this file
  // is held to the same complexity limit as the code it checks.
  const details = (prod as ImportedEntity).details;
  assert.equal(details.host, '10.0.0.7');
  assert.equal(details.user, 'deploy');
  assert.equal(details.port, 2222);
  assert.equal(details.sshKeyPath, '~/.ssh/id_prod');
  assert.equal(details.isSshEnabled, true, 'it must be connectable, or the import was pointless');
});

test('a Host with no HostName uses its own name as the address', () => {
  // `Host bare-alias` with nothing under it is how a real hostname is written short.
  const { entities } = parseSshConfig(SSH_CONFIG);
  assert.equal(entities.find((e) => e.name === 'bare-alias')?.details.host, 'bare-alias');
});

test('a wildcard Host is skipped and SAID to be skipped — it is settings, not a host', () => {
  const { entities, skipped } = parseSshConfig(SSH_CONFIG);

  assert.equal(entities.some((e) => e.name === '*'), false);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0], /Host \*/);
  assert.match(skipped[0], /pattern/);
});

test('several names on one Host line make one entity, filed under the first', () => {
  const { entities } = parseSshConfig(SSH_CONFIG);
  assert.equal(entities.some((e) => e.name === 'gw'), true);
  assert.equal(entities.some((e) => e.name === 'jump'), false);
});

test('ProxyJump is carried into the notes rather than guessed into a link', () => {
  const gw = parseSshConfig(SSH_CONFIG).entities.find((e) => e.name === 'gw');
  assert.equal(gw?.secrets.notes, 'ProxyJump bastion');
});

test('comments, blank lines and unknown keywords do not produce entities or errors', () => {
  const { entities, skipped } = parseSshConfig('# just a comment\n\nCompression yes\n');
  assert.deepEqual(entities, []);
  assert.deepEqual(skipped, []);
});

// ---- CSV --------------------------------------------------------------------

test('the CSV reader handles quotes, doubled quotes and newlines inside a field', () => {
  const rows = parseCsv('a,b\n"x,1","he said ""hi"""\n"multi\nline",z\n');
  assert.deepEqual(rows, [
    ['a', 'b'],
    ['x,1', 'he said "hi"'],
    ['multi\nline', 'z'],
  ]);
});

test('a Bitwarden CSV becomes entities, with the folder it came from', () => {
  const csv = [
    'folder,favorite,type,name,notes,fields,login_uri,login_username,login_password,login_totp',
    'Servers,,login,prod-db,some note,,https://db.corp.com:5432/x,dbadmin,s3cret,',
    ',,login,github,,,https://github.com,octocat,hunter2,otpauth://totp/x?secret=JBSW',
  ].join('\n');

  const { entities, skipped } = parseCsvExport(csv, 'Bitwarden');

  assert.deepEqual(skipped, []);
  assert.equal(entities.length, 2);
  assert.equal(entities[0].name, 'prod-db');
  assert.equal(entities[0].folder, 'Servers');
  assert.equal(entities[0].details.user, 'dbadmin');
  assert.equal(entities[0].details.host, 'db.corp.com', 'the scheme, port and path are stripped');
  assert.equal(entities[0].secrets.password, 's3cret');
  assert.equal(entities[1].secrets.totp, 'otpauth://totp/x?secret=JBSW');
  assert.equal(entities[1].details.hasTotp, true);
});

test('a header that names nothing recognisable is refused, with the header as the reason', () => {
  // Better than importing four hundred entities called "undefined".
  const { entities, skipped } = parseCsvExport('alpha,beta\n1,2\n');
  assert.deepEqual(entities, []);
  assert.match(skipped[0], /names neither a title nor a password/);
  assert.match(skipped[0], /alpha, beta/);
});

test('a row with no name and no address is skipped by row number, not dropped in silence', () => {
  const { entities, skipped } = parseCsvExport('name,password\n,onlyapassword\nreal,x\n');
  assert.equal(entities.length, 1);
  assert.equal(entities[0].name, 'real');
  assert.match(skipped[0], /row 2/);
});

test('an imported login is NOT marked SSH — a website is not a host you connect to', () => {
  const { entities } = parseCsvExport('name,login_uri\ngithub,https://github.com\n');
  assert.equal(entities[0].details.isSshEnabled, false);
  assert.equal(entities[0].details.host, 'github.com');
});

// ---- JSON --------------------------------------------------------------------

const BITWARDEN_JSON = JSON.stringify({
  items: [
    {
      name: 'prod-db',
      notes: 'the main one',
      login: { username: 'dbadmin', password: 's3cret', totp: 'otpauth://totp/x?secret=JBSW', uris: [{ uri: 'ssh://db.corp.com' }] },
    },
    { name: 'my card', card: { number: '4111' } },
    { login: { username: 'nameless' } },
  ],
});

test('a JSON export becomes entities, and non-login items are skipped WITH the reason', () => {
  const { entities, skipped } = parseJsonExport(BITWARDEN_JSON);

  assert.equal(entities.length, 1);
  assert.equal(entities[0].name, 'prod-db');
  assert.equal(entities[0].details.user, 'dbadmin');
  assert.equal(entities[0].details.host, 'db.corp.com');
  assert.equal(entities[0].secrets.password, 's3cret');
  assert.equal(entities[0].secrets.notes, 'the main one');

  assert.equal(skipped.length, 2);
  assert.match(skipped.join(' '), /"my card" — not a login item/);
  assert.match(skipped.join(' '), /no name/);
});

test('malformed JSON and a JSON that is not an export both say so instead of throwing', () => {
  assert.match(parseJsonExport('{not json').skipped[0], /not valid JSON/);
  assert.match(parseJsonExport('{"other":1}').skipped[0], /not an export this reader knows/);
});

// ---- detection and addressing -------------------------------------------------

test('the format is detected from the CONTENT, so a misnamed file still imports', () => {
  assert.equal(detectFormat('{"items":[]}'), 'json');
  assert.equal(detectFormat('Host prod\n  HostName 1.2.3.4\n'), 'ssh-config');
  assert.equal(detectFormat('name,password\na,b\n'), 'csv');
  assert.equal(detectFormat('Host prod, and a comma', 'config'), 'ssh-config', 'the name breaks the tie');
});

test('parseImport routes to the right reader', () => {
  assert.equal(parseImport('Host a\n  HostName b\n').source, 'OpenSSH config');
  assert.equal(parseImport('{"items":[]}').source, 'Bitwarden/1Password JSON');
  assert.equal(parseImport('name,password\nx,y\n').source, 'CSV export');
});

test('hostFrom strips the scheme, the credentials, the port and the path', () => {
  assert.equal(hostFrom('https://user:pw@example.com:8443/path?q=1'), 'example.com');
  assert.equal(hostFrom('ssh://box.local'), 'box.local');
  assert.equal(hostFrom('plain.host'), 'plain.host');
  assert.equal(hostFrom(''), undefined);
  assert.equal(hostFrom(undefined), undefined);
});

// ---- becoming nodes ------------------------------------------------------------

test('every imported node gets a FRESH id — an id from a file is somebody else\'s tree', () => {
  const { entities } = parseSshConfig(SSH_CONFIG);
  let n = 0;
  const made = toTreeNodes(entities, () => `new-${(n += 1)}`, () => 'folder-1');

  assert.equal(made.length, entities.length);
  assert.deepEqual(made.map((m) => m.node.id), ['new-1', 'new-2', 'new-3']);
  for (const { node } of made) {
    assert.equal(node.details?.id, node.id, 'the metadata id must match the node id');
    assert.equal(node.parentId, 'folder-1');
    assert.equal(node.type, 'entity');
  }
});

test('the secrets travel beside the node, never inside its metadata', () => {
  // Metadata is the plaintext half that syncs; a password in there would be a leak by design.
  const { entities } = parseCsvExport('name,login_password\nx,s3cret\n');
  const made = toTreeNodes(entities, () => 'id-1', () => null);

  assert.equal(made[0].secrets.password, 's3cret');
  assert.equal(JSON.stringify(made[0].node).includes('s3cret'), false);
});

// ---- what D7 lets the ssh_config import stop dropping ------------------------

test('ProxyJump becomes a real link to the imported bastion, not just a note', () => {
  // Before D7 there was no field to put this in, so it went into the notes and the connection
  // still could not be made. The name is resolved once every entity has an id.
  const parsed = parseImport(
    ['Host bastion', '  HostName bastion.example.com', '', 'Host app', '  HostName 10.0.0.5', '  ProxyJump bastion'].join('\n'),
    'config',
  );
  let n = 0;
  const nodes = toTreeNodes(parsed.entities, () => `id${n++}`, () => null);

  const bastion = nodes.find((x) => x.node.name === 'bastion');
  const app = nodes.find((x) => x.node.name === 'app');
  assert.equal(app?.node.details?.jumpHostEntityId, bastion?.node.id);
});

test('a ProxyJump with a user and a port still names the host entity', () => {
  // `ProxyJump ops@bastion:2222` points at the SAME Host block; the user and port belong to
  // that host's own entry, which was imported with it.
  const parsed = parseImport(
    ['Host bastion', '  HostName b.example.com', '', 'Host app', '  HostName a', '  ProxyJump ops@bastion:2222'].join('\n'),
    'config',
  );
  let n = 0;
  const nodes = toTreeNodes(parsed.entities, () => `id${n++}`, () => null);

  assert.equal(
    nodes.find((x) => x.node.name === 'app')?.node.details?.jumpHostEntityId,
    nodes.find((x) => x.node.name === 'bastion')?.node.id,
  );
});

test('a ProxyJump naming a host that is not in the file is left unlinked, with the note kept', () => {
  const parsed = parseImport(['Host app', '  HostName a', '  ProxyJump elsewhere'].join('\n'), 'config');
  const nodes = toTreeNodes(parsed.entities, () => 'id0', () => null);

  assert.equal(nodes[0].node.details?.jumpHostEntityId, undefined);
  assert.match(nodes[0].secrets.notes ?? '', /ProxyJump elsewhere/);
});

test('LocalForward and RemoteForward are imported, in both spellings ssh accepts', () => {
  const parsed = parseImport(
    [
      'Host app',
      '  HostName a',
      '  LocalForward 5432 db.internal:5432',
      '  RemoteForward 9000:localhost:9000',
    ].join('\n'),
    'config',
  );

  assert.deepEqual(parsed.entities[0].details.portForwards, [
    { kind: 'local', bindPort: 5432, host: 'db.internal', hostPort: 5432 },
    { kind: 'remote', bindPort: 9000, host: 'localhost', hostPort: 9000 },
  ]);
});

test('a forward that does not parse is dropped rather than half-imported', () => {
  const parsed = parseImport(['Host app', '  HostName a', '  LocalForward nonsense'].join('\n'), 'config');
  assert.equal(parsed.entities[0].details.portForwards, undefined);
});
