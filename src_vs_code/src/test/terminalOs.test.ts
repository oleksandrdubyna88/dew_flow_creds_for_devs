import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execDetails, runDependenciesField, terminalOsField, vpnLauncherField } from '../execFormFields';
import { osMismatch, capturedRun } from '../hostShell';
import { commandRowLabel } from '../commandLine';
import { isEntityMetadata } from '../typeGuards';

/**
 * Issue #103, the Terminal entry's OS: the dropdown, what a save keeps, and the refusal. The
 * field is loose on purpose, so the guard and the form must both carry a value they do not know.
 */

test('a NEW Terminal entry starts on this machine\'s OS; the person can change it', () => {
  const html = terminalOsField(undefined, 'create', 'macos');
  assert.match(html, /<option value="macos" selected>macOS<\/option>/);
  assert.match(html, /<option value="windows">Windows<\/option>/);
  assert.match(html, /<option value="linux">Linux<\/option>/);
});

test('an EXISTING entry without an OS stays unset — a save must not quietly change how it runs', () => {
  const html = terminalOsField({ id: 'e', name: 'x', isSshEnabled: false }, 'edit', 'windows');
  assert.match(html, /<option value="" selected>/);
  assert.doesNotMatch(html, /value="windows" selected/);
});

test('a stored OS this build does not know stays selectable, so a save keeps it', () => {
  const html = terminalOsField({ id: 'e', name: 'x', isSshEnabled: false, terminalOs: 'solaris' }, 'edit', 'windows');
  assert.match(html, /<option value="solaris" selected>solaris<\/option>/);
});

test('the save keeps the OS on a Terminal entry only', () => {
  assert.equal(execDetails({ terminalOs: 'linux' }, 'terminal', 0, 'e1').terminalOs, 'linux');
  assert.equal(execDetails({ terminalOs: 'linux' }, 'ssh', 0, 'e1').terminalOs, undefined);
  assert.equal(execDetails({ terminalOs: '' }, 'terminal', 0, 'e1').terminalOs, undefined);
});

test('the guard accepts any OS string and refuses a non-string — the counter-example is vpnType', () => {
  const base = { id: 'e', name: 'x', isSshEnabled: false };
  assert.equal(isEntityMetadata({ ...base, terminalOs: 'solaris' }), true);
  assert.equal(isEntityMetadata({ ...base, terminalOs: 7 }), false);
  assert.equal(isEntityMetadata({ ...base, vpnLauncherEntityId: 'v2', runDependencies: true }), true);
  assert.equal(isEntityMetadata({ ...base, runDependencies: 'yes' }), false);
});

test('a line written for another OS is refused with both OS names; none recorded means no refusal', () => {
  assert.match(osMismatch('deploy', 'macos', 'win32') ?? '', /"deploy" is written for macOS, and this machine runs Windows/);
  assert.equal(osMismatch('deploy', 'windows', 'win32'), undefined);
  assert.equal(osMismatch('deploy', undefined, 'win32'), undefined);
  assert.equal(osMismatch('deploy', '', 'linux'), undefined);
});

test('the captured run: no OS keeps Node\'s shell:true, an OS gets the native shell', () => {
  assert.deepEqual(capturedRun(undefined, 'ls -la', 'linux', () => true), { program: 'ls -la', args: [], shell: true });
  assert.deepEqual(capturedRun('windows', 'Get-ChildItem', 'win32', () => false), {
    program: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-Command', 'Get-ChildItem'],
    shell: false,
  });
  assert.deepEqual(capturedRun('linux', 'ls', 'linux', (p) => p === '/bin/bash'), {
    program: '/bin/bash',
    args: ['-c', 'ls'],
    shell: false,
  });
});

test('the viewer names the OS beside the command', () => {
  assert.equal(commandRowLabel(undefined), 'Command');
  assert.equal(commandRowLabel('linux'), 'Command · runs on Linux');
});

test('the launcher picker lists Terminal entries with their OS, built-in first', () => {
  const html = vpnLauncherField({ id: 'v', name: 'vpn', isSshEnabled: false, vpnLauncherEntityId: 't2' }, [
    { id: 't1', name: 'start openvpn', os: 'windows' },
    { id: 't2', name: 'mac launcher', os: 'macos' },
  ]);
  assert.match(html, /<option value="">— built-in \(detected\) —<\/option>/);
  assert.match(html, /<option value="t1">start openvpn · Windows<\/option>/);
  assert.match(html, /<option value="t2" selected>mac launcher · macOS<\/option>/);
});

test('a launcher that no longer exists is shown missing, not silently dropped', () => {
  const html = vpnLauncherField({ id: 'v', name: 'vpn', isSshEnabled: false, vpnLauncherEntityId: 'gone' }, []);
  assert.match(html, /<option value="gone" selected>\(missing entry\)<\/option>/);
});

test('the save keeps a launcher only on a VPN, never pointing at itself', () => {
  assert.equal(execDetails({ vpnLauncherEntityId: 't1' }, 'vpn', 0, 'v1').vpnLauncherEntityId, 't1');
  assert.equal(execDetails({ vpnLauncherEntityId: 'v1' }, 'vpn', 0, 'v1').vpnLauncherEntityId, undefined);
  assert.equal(execDetails({ vpnLauncherEntityId: 't1' }, 'terminal', 0, 'v1').vpnLauncherEntityId, undefined);
});

test('the execute mark is kept only while there is a dependency to execute', () => {
  assert.equal(execDetails({ runDependencies: true }, 'vpn', 1, 'v1').runDependencies, true);
  assert.equal(execDetails({ runDependencies: true }, 'vpn', 0, 'v1').runDependencies, undefined);
  assert.equal(execDetails({ runDependencies: 'true' }, 'vpn', 1, 'v1').runDependencies, undefined);
  assert.match(runDependenciesField({ id: 'e', name: 'x', isSshEnabled: false, runDependencies: true }), /id="runDependencies" type="checkbox" checked/);
});
