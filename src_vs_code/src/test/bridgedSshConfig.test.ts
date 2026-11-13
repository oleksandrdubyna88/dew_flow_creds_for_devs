import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BRIDGED_ASKPASS_OPTIONS,
  BRIDGED_LOCKDOWN,
  ConfigInput,
  HopBlock,
  bridgedConfigText,
  bridgedHostWord,
  bridgedKeyPathProblem,
  knownHostsName,
  unsafeBridgedUser,
  unsafeSshConfigValue,
} from '../bridgedSshConfig';

/**
 * The text of the per-call ssh_config of a bridged `ssh:exec` (E1.6 spec §S6.3, scenarios F1-F10): the shape, the order, and every rule a value
 * must pass before it is written. Pure: no file is made here.
 */

const KEYS = '/s/keys/1';
const FIRST_CONTACT = '/s/bridges/known_hosts';
const PERSON = '/home/me/.ssh/known_hosts';
const SENTINEL = `${KEYS}/no-default-identity`;

const stored = (host: string, id: string, check: HopBlock['check']): HopBlock => ({ host, identityFile: `${KEYS}/${id}.key`, typedKeyPath: false, check });
const typed = (host: string, identityFile: string, check: HopBlock['check'] = { firstContact: true }): HopBlock => ({ host, identityFile, typedKeyPath: true, check });

function input(overrides: Partial<ConfigInput> = {}): ConfigInput {
  return {
    hops: [],
    destination: { host: 'prod.corp.com' },
    noDefaultIdentity: SENTINEL,
    firstContactFile: FIRST_CONTACT,
    personKnownHosts: PERSON,
    ...overrides,
  };
}

const text = (given: ConfigInput): string => {
  const made = bridgedConfigText(given);
  assert.ok(made.ok, `the file was refused: ${JSON.stringify(made)}`);
  return made.text;
};

const refusedField = (given: ConfigInput): string => {
  const made = bridgedConfigText(given);
  assert.equal(made.ok, false, 'the file was written');
  return (made as { field: string }).field;
};

const HOST_STAR = (sentinel: string, firstContact: string, person: string): string[] => [
  'Host *',
  '  BatchMode yes',
  '  PasswordAuthentication no',
  '  KbdInteractiveAuthentication no',
  '  IdentityAgent none',
  '  IdentitiesOnly yes',
  `  IdentityFile "${sentinel}"`,
  '  ForwardAgent no',
  '  ControlMaster no',
  '  ControlPath none',
  '  ClearAllForwardings yes',
  '  ForwardX11 no',
  '  Tunnel no',
  '  PermitLocalCommand no',
  '  ProxyCommand none',
  '  ConnectTimeout 10',
  '  StrictHostKeyChecking yes',
  `  UserKnownHostsFile "${firstContact}" "${person}"`,
  '  GlobalKnownHostsFile none',
];

const TWO_HOPS = input({
  hops: [
    stored('hop1.example.com', 'call-a', { pinnedFile: `${KEYS}/call-b.known_hosts` }),
    typed('Hop2.Example', '/home/me/.ssh/hop2'),
  ],
  destination: { host: 'prod.corp.com', pinnedFile: `${KEYS}/call-c.known_hosts` },
});

test('F1: two hops and a pinned destination are the file of §S6.3, byte for byte, in its order', () => {
  const expected = [
    'Host hop1.example.com',
    `  IdentityFile "${KEYS}/call-a.key"`,
    '  StrictHostKeyChecking yes',
    `  UserKnownHostsFile "${KEYS}/call-b.known_hosts"`,
    'Host Hop2.Example',
    '  IdentityFile "/home/me/.ssh/hop2"',
    '  StrictHostKeyChecking accept-new',
    `  UserKnownHostsFile "${FIRST_CONTACT}" "${PERSON}"`,
    'Host prod.corp.com',
    '  StrictHostKeyChecking yes',
    `  UserKnownHostsFile "${KEYS}/call-c.known_hosts"`,
    ...HOST_STAR(SENTINEL, FIRST_CONTACT, PERSON),
    '',
  ].join('\n');

  assert.equal(text(TWO_HOPS), expected);
  assert.ok(!text(TWO_HOPS).includes('\r'), 'LF line ends');
});

interface Block { readonly host: string; readonly lines: readonly (readonly [string, string])[] }

/** The text as blocks of keyword lines; a keyword line has two spaces in front, and a `Host` line none. */
function blocksOf(written: string): Block[] {
  const blocks: { host: string; lines: [string, string][] }[] = [];
  for (const line of written.split('\n').filter((l) => l !== '')) {
    if (line.startsWith('Host ')) {
      blocks.push({ host: line.slice(5), lines: [] });
    } else {
      assert.ok(line.startsWith('  '), `a keyword line is indented: ${line}`);
      const [word, ...rest] = line.trim().split(' ');
      blocks[blocks.length - 1].lines.push([word, rest.join(' ')]);
    }
  }
  return blocks;
}

test('F2: a hop block has three keywords, the destination two, Host * the eighteen lines in order; no other IdentityFile, no PubkeyAcceptedAlgorithms', () => {
  const blocks = blocksOf(text(TWO_HOPS));

  assert.deepEqual(blocks.map((b) => b.host), ['hop1.example.com', 'Hop2.Example', 'prod.corp.com', '*']);
  for (const hop of blocks.slice(0, 2)) {
    assert.deepEqual(hop.lines.map(([word]) => word), ['IdentityFile', 'StrictHostKeyChecking', 'UserKnownHostsFile']);
  }
  assert.deepEqual(blocks[2].lines.map(([word]) => word), ['StrictHostKeyChecking', 'UserKnownHostsFile']);
  assert.equal(blocks[3].lines.length, 18);
  assert.deepEqual(
    blocks[3].lines.map(([word]) => word),
    ['BatchMode', 'PasswordAuthentication', 'KbdInteractiveAuthentication', 'IdentityAgent', 'IdentitiesOnly', 'IdentityFile', 'ForwardAgent', 'ControlMaster', 'ControlPath',
      'ClearAllForwardings', 'ForwardX11', 'Tunnel', 'PermitLocalCommand', 'ProxyCommand', 'ConnectTimeout', 'StrictHostKeyChecking', 'UserKnownHostsFile', 'GlobalKnownHostsFile'],
  );
  const identityLines = blocks.flatMap((b) => b.lines).filter(([word]) => word === 'IdentityFile');
  assert.equal(identityLines.length, 3, 'one for each hop block, and the sentinel');
  assert.ok(!text(TWO_HOPS).includes('PubkeyAcceptedAlgorithms'));
  assert.equal(BRIDGED_LOCKDOWN.length, 16, 'the lines of Host * that hold no path');
  for (const [word] of BRIDGED_LOCKDOWN) {
    assert.ok(!['IdentityFile', 'UserKnownHostsFile'].includes(word), `${word} holds a path, so it is written beside the lock-down`);
  }
});

test('F3: an unpinned key destination has no block of its own', () => {
  const written = text(input({ hops: [typed('hop.example', '/k/hop')] }));

  assert.deepEqual(blocksOf(written).map((b) => b.host), ['hop.example', '*']);
});

test('F4: a Windows path with a space and backslashes is in quotes, backslashes once, and "%" in our own paths is written "%%"', () => {
  const written = text(input({
    hops: [{ host: 'hop.example', identityFile: 'C:\\Users\\My Name\\keys\\1\\call-a.key', typedKeyPath: false, check: { pinnedFile: 'C:\\Users\\My Name\\keys\\1\\call-b.known_hosts' } }],
    destination: { host: 'prod.corp.com', pinnedFile: 'C:\\Users\\100%me\\keys\\call-c.known_hosts' },
    noDefaultIdentity: 'C:\\Users\\100%me\\keys\\no-default-identity',
    firstContactFile: 'C:\\Users\\My Name\\bridges\\known_hosts',
    personKnownHosts: 'C:\\Users\\My Name\\.ssh\\known_hosts',
  }));

  assert.ok(written.includes('  IdentityFile "C:\\Users\\My Name\\keys\\1\\call-a.key"\n'), written);
  assert.ok(!written.includes('\\\\'), 'a backslash is never doubled');
  assert.ok(written.includes('  UserKnownHostsFile "C:\\Users\\100%%me\\keys\\call-c.known_hosts"\n'), 'the pin path of the destination');
  assert.ok(written.includes('  IdentityFile "C:\\Users\\100%%me\\keys\\no-default-identity"\n'), 'the sentinel');
  assert.ok(written.includes('  UserKnownHostsFile "C:\\Users\\My Name\\bridges\\known_hosts" "C:\\Users\\My Name\\.ssh\\known_hosts"\n'));
});

/** The measured value of the parent's D15: a line break and a ProxyCommand that wins over `Host *`'s. */
const MEASURED = '/k/id\nProxyCommand /tmp/evil %h';

const PATH_FIELDS: ReadonlyArray<readonly [field: string, build: (value: string) => ConfigInput]> = [
  ['hop:0:key', (value) => input({ hops: [typed('hop.example', value)] })],
  ['hop:0:key', (value) => input({ hops: [{ host: 'hop.example', identityFile: value, typedKeyPath: false, check: { firstContact: true } }] })],
  ['hop:0:pin', (value) => input({ hops: [stored('hop.example', 'call-a', { pinnedFile: value })] })],
  ['destination:pin', (value) => input({ destination: { host: 'prod.corp.com', pinnedFile: value } })],
  ['keys', (value) => input({ noDefaultIdentity: value })],
  ['known-hosts', (value) => input({ firstContactFile: value })],
  ['known-hosts', (value) => input({ personKnownHosts: value })],
];

test('F5: the measured value, a quote, CR, ESC, DEL, "${", a last backslash and the empty text are each refused in each path field, with the field and none of the value', () => {
  const bad = [MEASURED, 'a\nb', 'a"b', 'a\rb', 'a\u001bb', 'a\u007fb', '/k/${X}/id', '/k/dir\\', ''];
  for (const [field, build] of PATH_FIELDS) {
    for (const value of bad) {
      const made = bridgedConfigText(build(value));
      assert.deepEqual(made, { ok: false, field }, `${field}: ${JSON.stringify(value)}`);
      assert.ok(!JSON.stringify(made).includes('evil'), 'the answer holds nothing of the value');
    }
  }
  assert.equal(bridgedConfigText(PATH_FIELDS[0][1]('/k/id')).ok, true, 'control: the same field with a plain path is written');
});

test('F6: letter case is kept in the Host word, brackets come off, and equal words are two legs only when they differ', () => {
  assert.equal(bridgedHostWord('HOP.Example', 'hop'), 'HOP.Example');
  assert.equal(bridgedHostWord('[::1]', 'hop'), '::1');
  assert.equal(bridgedHostWord('::1', 'destination'), '::1');
  assert.equal(bridgedHostWord('[::1]', 'destination'), '::1');
  const written = text(input({ hops: [typed('HOP.Example', '/k/hop'), typed('[::1]', '/k/hop2')], destination: { host: '0:0:0:0:0:0:0:1' } }));
  assert.deepEqual(blocksOf(written).map((b) => b.host), ['HOP.Example', '::1', '*'], 'two spellings of one address are two words: ssh keeps them apart');
  assert.equal(knownHostsName('HOP.Example', 22), 'hop.example');
  assert.equal(knownHostsName('HOP.Example', undefined), 'hop.example');
  assert.equal(knownHostsName('::1', 2222), '[::1]:2222');
  assert.equal(knownHostsName('gw', 2201), '[gw]:2201');
});

test('F7: a port in the host, a bare IPv6 hop, brackets round a name, a bracket elsewhere and a zone id are refused, with the host field', () => {
  for (const [host, leg] of [['gw:2201', 'hop'], ['gw:2201', 'destination'], ['::1', 'hop'], ['[gw]', 'hop'], ['[gw]', 'destination'], ['a[b', 'destination'],
    ['[::1]x', 'destination'], ['fe80::1%eth0', 'destination'], ['[fe80::1%eth0]', 'hop'], ['', 'destination'], ['-oProxyCommand=x', 'destination']] as const) {
    assert.equal(bridgedHostWord(host, leg), undefined, `${host} as a ${leg}`);
  }
  assert.equal(refusedField(input({ hops: [typed('gw:2201', '/k/hop')] })), 'hop:0:host');
  assert.equal(refusedField(input({ hops: [typed('::1', '/k/hop')] })), 'hop:0:host');
  assert.equal(refusedField(input({ destination: { host: 'gw:2201' } })), 'destination:host');
  assert.equal(refusedField(input({ destination: { host: '[fe80::1%eth0]' } })), 'destination:host');
  assert.equal(refusedField(input({ hops: [typed('[gw]', '/k/hop')] })), 'hop:0:host');
});

test('F8: inside bridgedConfigText alone, two legs with one Host word are refused — the brackets off, the letter case ignored, the destination counted', () => {
  assert.equal(refusedField(input({ hops: [typed('[::1]', '/k/hop')], destination: { host: '::1' } })), 'hosts');
  assert.equal(refusedField(input({ hops: [typed('Hop.example', '/k/a'), typed('hop.EXAMPLE', '/k/b')] })), 'hosts');
  assert.equal(refusedField(input({ hops: [typed('prod.corp.com', '/k/a')] })), 'hosts', 'an unpinned destination too: its accept-new would write into the hop');
  assert.equal(bridgedConfigText(input({ hops: [typed('hop.example', '/k/a')] })).ok, true, 'control: two hosts are fine');
});

test('F9: a user that holds "$", a backslash or a space is refused; a plain one and one with a dash are not', () => {
  assert.deepEqual(['$BRIDGE_PROBE', 'CORP\\alice', 'alice', 'alice-name', 'a b'].map(unsafeBridgedUser), [true, true, false, false, true]);
});

test('F10: a typed key path with "%" is refused with the key field; an own path with "%" is not', () => {
  assert.equal(refusedField(input({ hops: [typed('hop.example', '/k/%u/id')] })), 'hop:0:key');
  assert.equal(bridgedKeyPathProblem('/k/%u/id'), 'percent');
  assert.equal(bridgedKeyPathProblem('/k/${X}/id'), 'value');
  assert.equal(bridgedKeyPathProblem('~/.ssh/id'), undefined, '"~" stays allowed');
  assert.equal(bridgedConfigText(input({ noDefaultIdentity: '/s/100%/no-default-identity' })).ok, true);
});

test('the value rule and the password words', () => {
  assert.deepEqual([...BRIDGED_ASKPASS_OPTIONS], ['-o', 'BatchMode=no', '-o', 'PasswordAuthentication=yes', '-o', 'KbdInteractiveAuthentication=yes']);
  assert.deepEqual(['/a b/c', 'C:\\x\\y', '~/k', '/k/%u'].map(unsafeSshConfigValue), [false, false, false, false]);
  assert.deepEqual(['', 'a"', 'a\n', 'a${b', 'a\\'].map(unsafeSshConfigValue), [true, true, true, true, true]);
});
