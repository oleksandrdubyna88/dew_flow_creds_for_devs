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
  unsafeBridgedFileValue,
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
  '  PubkeyAcceptedAlgorithms -sk-*',
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

test('F2: a hop block has three keywords, the destination two, Host * the nineteen lines in order; no other IdentityFile', () => {
  const blocks = blocksOf(text(TWO_HOPS));

  assert.deepEqual(blocks.map((b) => b.host), ['hop1.example.com', 'Hop2.Example', 'prod.corp.com', '*']);
  for (const hop of blocks.slice(0, 2)) {
    assert.deepEqual(hop.lines.map(([word]) => word), ['IdentityFile', 'StrictHostKeyChecking', 'UserKnownHostsFile']);
  }
  assert.deepEqual(blocks[2].lines.map(([word]) => word), ['StrictHostKeyChecking', 'UserKnownHostsFile']);
  assert.equal(blocks[3].lines.length, 19);
  assert.deepEqual(
    blocks[3].lines.map(([word]) => word),
    ['BatchMode', 'PasswordAuthentication', 'KbdInteractiveAuthentication', 'IdentityAgent', 'IdentitiesOnly', 'IdentityFile', 'PubkeyAcceptedAlgorithms', 'ForwardAgent', 'ControlMaster', 'ControlPath',
      'ClearAllForwardings', 'ForwardX11', 'Tunnel', 'PermitLocalCommand', 'ProxyCommand', 'ConnectTimeout', 'StrictHostKeyChecking', 'UserKnownHostsFile', 'GlobalKnownHostsFile'],
  );
  const identityLines = blocks.flatMap((b) => b.lines).filter(([word]) => word === 'IdentityFile');
  assert.equal(identityLines.length, 3, 'one for each hop block, and the sentinel');
  assert.equal(BRIDGED_LOCKDOWN.length, 17, 'the lines of Host * that hold no path');
  for (const [word] of BRIDGED_LOCKDOWN) {
    assert.ok(!['IdentityFile', 'UserKnownHostsFile'].includes(word), `${word} holds a path, so it is written beside the lock-down`);
  }
});

const SK_LINE = '  PubkeyAcceptedAlgorithms -sk-*';

test('F11: PubkeyAcceptedAlgorithms -sk-* is asked for once, in Host * and nowhere else, straight after the sentinel IdentityFile line — in every shape of file', () => {
  const shapes: ReadonlyArray<readonly [string, ConfigInput]> = [
    ['no hop, unpinned destination', input()],
    ['one first-contact hop', input({ hops: [typed('hop.example', '/k/hop')] })],
    ['two hops and a pinned destination', TWO_HOPS],
  ];
  for (const [shape, given] of shapes) {
    const lines = text(given).split('\n');
    assert.equal(lines.filter((line) => line === SK_LINE).length, 1, `${shape}: the line stands once`);
    assert.equal(lines.filter((line) => line.includes('PubkeyAcceptedAlgorithms')).length, 1, `${shape}: no other spelling of the keyword`);
    const star = blocksOf(text(given)).find((block) => block.host === '*');
    assert.ok(star !== undefined, shape);
    const words = star.lines.map(([word]) => word);
    assert.equal(words[words.indexOf('IdentityFile') + 1], 'PubkeyAcceptedAlgorithms', `${shape}: straight after the sentinel's IdentityFile line`);
    for (const block of blocksOf(text(given)).filter((other) => other.host !== '*')) {
      assert.ok(!block.lines.some(([word]) => word === 'PubkeyAcceptedAlgorithms'), `${shape}: not in the block of ${block.host}`);
    }
  }
  assert.ok(BRIDGED_LOCKDOWN.some(([word, value]) => word === 'PubkeyAcceptedAlgorithms' && value === '-sk-*'), 'it is a line of the lock-down, so no caller hands it in');
});

test('F3: an unpinned key destination has no block of its own', () => {
  const written = text(input({ hops: [typed('hop.example', '/k/hop')] }));

  assert.deepEqual(blocksOf(written).map((b) => b.host), ['hop.example', '*']);
});

test('F4: a Windows path with a space and backslashes is in quotes, backslashes once, and "%" in our own paths is written "%%"', () => {
  const written = text(input({
    hops: [{ host: 'hop.example', identityFile: 'C:\\Users\\me\\My Name\\keys\\1\\call-a.key', typedKeyPath: false, check: { pinnedFile: 'C:\\Users\\me\\My Name\\keys\\1\\call-b.known_hosts' } }],
    destination: { host: 'prod.corp.com', pinnedFile: 'C:\\Users\\me\\100%\\keys\\call-c.known_hosts' },
    noDefaultIdentity: 'C:\\Users\\me\\100%\\keys\\no-default-identity',
    firstContactFile: 'C:\\Users\\me\\My Name\\bridges\\known_hosts',
    personKnownHosts: 'C:\\Users\\me\\My Name\\.ssh\\known_hosts',
  }));

  assert.ok(written.includes('  IdentityFile "C:\\Users\\me\\My Name\\keys\\1\\call-a.key"\n'), written);
  assert.ok(!written.includes('\\\\'), 'a backslash is never doubled');
  assert.ok(written.includes('  UserKnownHostsFile "C:\\Users\\me\\100%%\\keys\\call-c.known_hosts"\n'), 'the pin path of the destination');
  assert.ok(written.includes('  IdentityFile "C:\\Users\\me\\100%%\\keys\\no-default-identity"\n'), 'the sentinel');
  assert.ok(written.includes('  UserKnownHostsFile "C:\\Users\\me\\My Name\\bridges\\known_hosts" "C:\\Users\\me\\My Name\\.ssh\\known_hosts"\n'));
});

/** The measured value of the parent's D15: a line break and a ProxyCommand that wins over `Host *`'s. */
const MEASURED = '/k/id\nProxyCommand /tmp/evil %h';

const PATH_FIELDS: ReadonlyArray<readonly [field: string, build: (value: string) => ConfigInput]> = [
  ['hop:0:key', (value) => input({ hops: [typed('hop.example', value)] })],
  ['hop:0:key', (value) => input({ hops: [{ host: 'hop.example', identityFile: value, typedKeyPath: false, check: { firstContact: true } }] })],
  ['hop:0:pin', (value) => input({ hops: [stored('hop.example', 'call-a', { pinnedFile: value })] })],
  ['destination:pin', (value) => input({ destination: { host: 'prod.corp.com', pinnedFile: value } })],
  ['keys', (value) => input({ noDefaultIdentity: value })],
  ['first-contact', (value) => input({ firstContactFile: value })],
  ['known-hosts', (value) => input({ personKnownHosts: value })],
];

test('F5: the measured value, a quote, CR, ESC, DEL, "${", a last backslash, two backslashes in a row, a backslash before an apostrophe and the empty text are each refused in each path field, with the field and none of the value', () => {
  const bad = [MEASURED, 'a\nb', 'a"b', 'a\rb', 'a\u001bb', 'a\u007fb', '/k/${X}/id', '/k/dir\\', '', 'C:\\keys\\\\id', "C:\\'k\\id", '\\\\fs\\share\\id'];
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

test('Y5: a hop named none, in any letter case, has no Host word and is refused with the host field; a destination named none, and a hop named none.example, are not', () => {
  for (const host of ['none', 'NONE', 'None', 'nOnE']) {
    assert.equal(bridgedHostWord(host, 'hop'), undefined, `${host} as a hop`);
    assert.equal(refusedField(input({ hops: [typed(host, '/k/hop')] })), 'hop:0:host', host);
    assert.equal(bridgedHostWord(host, 'destination'), host, `${host} as the destination is its own word`);
  }
  assert.equal(bridgedConfigText(input({ destination: { host: 'none' } })).ok, true, 'a destination named none is written');
  for (const host of ['none.example', 'nonesuch', 'not-none', 'a.none']) {
    assert.equal(bridgedHostWord(host, 'hop'), host, `${host} as a hop`);
  }
  assert.equal(bridgedConfigText(input({ hops: [typed('none.example', '/k/hop')] })).ok, true, 'control: the same field with another host is written');
});

test('Y5: unsafeBridgedFileValue is the value rule plus two backslashes in a row and a backslash before an apostrophe; unsafeSshConfigValue itself is unchanged', () => {
  const refusedByBoth = ['', 'a"', 'a\n', 'a${b', 'a\\'];
  const refusedByTheFileOnly = ['C:\\keys\\\\id', '\\\\fs\\share\\id', "C:\\'k\\id", 'a\\\\', "x\\'"];
  const allowed = ['/a b/c', 'C:\\x\\y', '~/k', '/k/%u', "it's/fine", 'C:\\Users\\me\\a\\b'];
  assert.deepEqual(refusedByBoth.map(unsafeBridgedFileValue), refusedByBoth.map(() => true));
  assert.deepEqual(refusedByBoth.map(unsafeSshConfigValue), refusedByBoth.map(() => true));
  assert.deepEqual(refusedByTheFileOnly.map(unsafeBridgedFileValue), refusedByTheFileOnly.map(() => true), 'a value the FILE carries');
  assert.deepEqual(refusedByTheFileOnly.slice(0, 3).map(unsafeSshConfigValue), [false, false, false], 'the argv-only rule still lets them through');
  assert.deepEqual(allowed.map(unsafeBridgedFileValue), allowed.map(() => false));
});

test('Y5: a path that goes to -i alone keeps the old rule (a UNC path is let through); a hop key path, which goes into the file, meets both', () => {
  assert.equal(bridgedKeyPathProblem('\\\\fs\\keys\\id'), undefined, 'bridgedKeyPathProblem is the -i rule and is unchanged');
  assert.equal(bridgedKeyPathProblem('C:\\keys\\\\id'), undefined);
  assert.equal(bridgedKeyPathProblem('/k/%u/id'), 'percent');
  assert.equal(refusedField(input({ hops: [typed('hop.example', '\\\\fs\\keys\\id')] })), 'hop:0:key', 'typed by the person, written into the file');
  assert.equal(refusedField(input({ hops: [typed('hop.example', 'C:\\keys\\\\id')] })), 'hop:0:key');
  assert.equal(refusedField(input({ hops: [typed('hop.example', "C:\\'k\\id")] })), 'hop:0:key');
  assert.equal(bridgedConfigText(input({ hops: [typed('hop.example', 'C:\\keys\\id')] })).ok, true, 'control: single backslashes are written');
});

test('Y5: a Windows storage folder on a UNC path is refused in every path the file takes from it — the keys folder, the pin files, the sentinel, the first-contact file — and the person\'s own known_hosts has its own field', () => {
  const unc = '\\\\fs\\share\\x';
  assert.equal(refusedField(input({ noDefaultIdentity: `${unc}\\keys\\1\\no-default-identity` })), 'keys');
  assert.equal(refusedField(input({ destination: { host: 'prod.corp.com', pinnedFile: `${unc}\\keys\\1\\call-c.known_hosts` } })), 'destination:pin');
  assert.equal(refusedField(input({ hops: [stored('hop.example', 'call-a', { pinnedFile: `${unc}\\keys\\1\\call-b.known_hosts` })] })), 'hop:0:pin');
  assert.equal(refusedField(input({ hops: [{ host: 'hop.example', identityFile: `${unc}\\keys\\1\\call-a.key`, typedKeyPath: false, check: { firstContact: true } }] })), 'hop:0:key');
  assert.equal(refusedField(input({ firstContactFile: `${unc}\\bridges\\known_hosts` })), 'first-contact');
  assert.equal(refusedField(input({ personKnownHosts: '\\\\fs\\profile\\.ssh\\known_hosts' })), 'known-hosts');
});
