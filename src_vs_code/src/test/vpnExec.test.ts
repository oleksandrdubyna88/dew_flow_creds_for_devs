import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveVpnLauncher } from '../vpnExec';
import { vpnStartCommand } from '../vpnCommand';

const noEnv = {};
const never = () => false;

test('a tool on PATH is used by its bare name', () => {
  const r = resolveVpnLauncher('openvpn', 'win32', noEnv, (n) => n === 'openvpn.exe', never);

  assert.deepEqual(r, { kind: 'cli', exe: 'openvpn.exe' });
});

test('a tool found only in its install folder is used by full path', () => {
  // The reported failure: Start-Process openvpn.exe -> "cannot find the file". The
  // community edition installs into Program Files\OpenVPN\bin and does NOT add itself
  // to PATH, so the bare name was never going to work on a default install.
  const env = { ProgramFiles: 'C:\\Program Files' };
  const exists = (p: string) => p === 'C:\\Program Files\\OpenVPN\\bin\\openvpn.exe';

  const r = resolveVpnLauncher('openvpn', 'win32', env, never, exists);

  assert.deepEqual(r, { kind: 'cli', exe: 'C:\\Program Files\\OpenVPN\\bin\\openvpn.exe' });
});

test('OpenVPN Connect is recognised as a DIFFERENT product, not a missing CLI', () => {
  // The machine this came from: only OpenVPN Connect (the GUI) is installed. It does
  // not take `--config` and it may already be holding the tunnel up — telling the user
  // "openvpn.exe not found" there is true and useless.
  const env = { ProgramFiles: 'C:\\Program Files' };
  const exists = (p: string) => p === 'C:\\Program Files\\OpenVPN Connect\\OpenVPNConnect.exe';

  const r = resolveVpnLauncher('openvpn', 'win32', env, never, exists);

  assert.deepEqual(r, {
    kind: 'openvpn-connect',
    exe: 'C:\\Program Files\\OpenVPN Connect\\OpenVPNConnect.exe',
  });
});

test('the community CLI wins over OpenVPN Connect when both are present', () => {
  const env = { ProgramFiles: 'C:\\Program Files' };
  const exists = () => true;

  assert.equal(resolveVpnLauncher('openvpn', 'win32', env, never, exists).kind, 'cli');
});

test('nothing found says WHAT was looked for', () => {
  const env = { ProgramFiles: 'C:\\Program Files' };

  const r = resolveVpnLauncher('wireguard', 'win32', env, never, never);

  assert.equal(r.kind, 'missing');
  if (r.kind !== 'missing') return;
  assert.ok(r.looked.some((p) => p.includes('WireGuard')), r.looked.join(', '));
});

test('POSIX resolves from PATH only', () => {
  assert.equal(resolveVpnLauncher('openvpn', 'linux', noEnv, (n) => n === 'openvpn', never).kind, 'cli');
  assert.equal(resolveVpnLauncher('openvpn', 'linux', noEnv, never, never).kind, 'missing');
});

test('a resolved absolute path survives quoting in the elevated command', () => {
  const r = vpnStartCommand('openvpn', 'win32', 'C:\\cfg\\a.ovpn', 'C:\\Program Files\\OpenVPN\\bin\\openvpn.exe');

  assert.equal(r.kind, 'run');
  if (r.kind !== 'run') return;
  assert.match(r.command, /'C:\\Program Files\\OpenVPN\\bin\\openvpn\.exe'/);
});
