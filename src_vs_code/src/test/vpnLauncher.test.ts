import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EntityMetadata, TreeNode } from '../types';
import { canStartVpn, launcherConfigFileName, launcherStopNote, substituteConfig, usesConfig } from '../vpnLauncher';
import { entityContextValue } from '../treeRowText';
import { shareableDetails } from '../shareFormat';
import { quarantineUnsafeIds } from '../idQuarantine';
import { BackupBundle } from '../types';

/**
 * Issue #103 — a VPN started by a Terminal entry the person wrote. The pure half: `{config}`,
 * the file name, which rows offer Start, and the rule that the reference never leaves the vault
 * it names an entry in.
 */

const vpn = (extra: Partial<EntityMetadata> = {}): EntityMetadata => ({
  id: 'v1',
  name: 'Org Meter Stage',
  isSshEnabled: false,
  isVpn: true,
  ...extra,
});

test('{config} becomes the path, quoted for the shell that reads it — every occurrence', () => {
  const path = "C:\\Users\\o'brien\\keys\\42\\org_meter_stage.ovpn";

  assert.equal(
    substituteConfig('openvpn --config {config} --log {config}.log', path, 'powershell'),
    "openvpn --config 'C:\\Users\\o''brien\\keys\\42\\org_meter_stage.ovpn' --log 'C:\\Users\\o''brien\\keys\\42\\org_meter_stage.ovpn'.log",
  );
  assert.equal(substituteConfig('sudo openvpn --config {config}', '/k/a b.ovpn', 'posix'), "sudo openvpn --config '/k/a b.ovpn'");
  assert.equal(usesConfig('rasdial "Work VPN"'), false, 'a launcher that knows its own profile needs no file');
});

test('the config keeps the uploaded extension when it is a plain one, else the tool default', () => {
  assert.equal(launcherConfigFileName(vpn({ vpnType: 'ikev2', vpnConfigFileName: 'Work.PBK' })), 'org_meter_stage.pbk');
  assert.equal(launcherConfigFileName(vpn({ vpnType: 'openvpn' })), 'org_meter_stage.ovpn');
  assert.equal(launcherConfigFileName(vpn({ vpnType: 'l2tp', vpnConfigFileName: 'x.tar.gz;rm -rf' })), 'org_meter_stage.conf');
});

test('a launcher makes ANY type startable — that is what naming one is for', () => {
  assert.equal(canStartVpn(vpn({ vpnType: 'ikev2' })), false);
  assert.equal(canStartVpn(vpn({ vpnType: 'ikev2', vpnLauncherEntityId: 't1' })), true);
  assert.equal(canStartVpn(vpn({ vpnType: 'openvpn' })), true);
  assert.match(entityContextValue(vpn({ vpnType: 'l2tp', vpnLauncherEntityId: 't1' }), false), /:vpn:vpnrun/);
  assert.doesNotMatch(entityContextValue(vpn({ vpnType: 'l2tp' }), false), /:vpnrun/);
});

test('Stop with a launcher says where to stop it — this extension does not guess a process', () => {
  assert.match(launcherStopNote('start openvpn'), /started by "start openvpn".*does not guess/s);
});

test('a share carries neither the launcher nor the execute mark — they are the SENDER\'s', () => {
  const shared = shareableDetails(vpn({ vpnType: 'openvpn', vpnLauncherEntityId: 't1', runDependencies: true, dependsOn: ['t1'] }), false);

  assert.equal(shared?.vpnLauncherEntityId, undefined);
  assert.equal(shared?.runDependencies, undefined);
  assert.equal(shared?.dependsOn, undefined);
});

test('the terminal OS DOES travel — it describes the command, not the sender\'s vault', () => {
  const shared = shareableDetails({ id: 't', name: 't', isSshEnabled: false, isTerminal: true, command: 'ls', terminalOs: 'linux' }, false);
  assert.equal(shared?.terminalOs, 'linux');
});

test('an import that renames the launcher renames the reference with it', () => {
  const node = (id: string, details: Partial<EntityMetadata>): TreeNode =>
    ({ id, name: id, type: 'entity', parentId: null, details: { id, name: id, isSshEnabled: false, ...details } }) as unknown as TreeNode;
  const input = { nodes: [node('bad:id', { isTerminal: true, command: 'x' }), node('v1', { isVpn: true, vpnLauncherEntityId: 'bad:id' })], passwords: {} } as unknown as BackupBundle;

  const result = quarantineUnsafeIds(input, {}, () => 'fresh-1');

  const vpnNode = result.bundle.nodes.find((n) => n.id === 'v1');
  assert.equal(vpnNode?.details?.vpnLauncherEntityId, 'fresh-1');
});

test('a VPN without a launcher keeps no launcher key after an import remap — absent, not undefined', () => {
  const input = {
    nodes: [
      { id: 'bad:id', name: 'x', type: 'entity', parentId: null, details: { id: 'bad:id', name: 'x', isSshEnabled: false } },
    ],
    passwords: {},
  } as unknown as BackupBundle;

  const details = quarantineUnsafeIds(input, {}, () => 'fresh-1').bundle.nodes[0].details ?? {};
  assert.equal('vpnLauncherEntityId' in details, false);
});
