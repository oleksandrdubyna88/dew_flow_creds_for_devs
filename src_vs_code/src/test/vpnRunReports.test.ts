import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';

/**
 * `runVpn` tells its caller whether it started anything — and where it runs the line.
 *
 * <p>The agent's `creds_vpn_up` reached `runVpn` through a wrapper that answered `true` whatever
 * happened next: no stored config, no launcher, an unsupported type — each showed the PERSON a
 * warning and told the AGENT "opened". An agent that then waits for a tunnel that was never
 * started is the failure this pins.</p>
 *
 * <p>The second half is issue #103 itself: the composed line must reach a terminal whose shell is
 * the one it was composed for, never the window's default profile (WSL bash, in the report).</p>
 */

interface Created {
  name: string;
  shellPath?: string;
  sent: string[];
}

function stub(remoteName?: string): { vscode: Record<string, unknown>; created: Created[]; warnings: string[] } {
  const created: Created[] = [];
  const warnings: string[] = [];
  const vscode = {
    env: { remoteName },
    window: {
      terminals: [] as unknown[],
      showWarningMessage: (text: string) => {
        warnings.push(text);
        return Promise.resolve(undefined);
      },
      showInformationMessage: (text: string) => {
        warnings.push(text);
        return Promise.resolve(undefined);
      },
      createTerminal: (options: { name: string; shellPath?: string }) => {
        const terminal: Created = { name: options.name, shellPath: options.shellPath, sent: [] };
        created.push(terminal);
        return {
          name: options.name,
          creationOptions: options,
          exitStatus: undefined,
          show: () => undefined,
          sendText: (text: string) => terminal.sent.push(text),
        };
      },
    },
  };
  return { vscode, created, warnings };
}

type RunVpn = (
  target: unknown,
  action: 'start' | 'stop',
  storage: unknown,
  storageDir: string,
  vaultKeys: unknown,
) => Promise<boolean>;

function vpnNode(vpnType: string): unknown {
  return {
    kind: 'node',
    accountId: 'a1',
    node: { id: 'v1', name: 'org meter stage', details: { id: 'v1', name: 'org meter stage', isVpn: true, vpnType } },
  };
}

const vaultKeys = { noteUserActivity: () => undefined };

test('a VPN with no stored config reports FALSE — an agent is never told "opened" about nothing', async () => {
  const s = stub();
  const { runVpn } = loadWithVscode<{ runVpn: RunVpn }>('../vpnRun', s.vscode);
  const storage = { getVpnConfig: () => Promise.resolve(undefined) };

  const started = await runVpn(vpnNode('openvpn'), 'start', storage, 'C:\\store', vaultKeys);

  assert.equal(started, false, 'nothing started, so the caller must hear false');
  assert.equal(s.created.length, 0, 'no terminal is opened for a refusal');
  assert.match(s.warnings[0] ?? '', /no stored VPN config/);
});

test('an unsupported VPN type reports FALSE', async () => {
  const s = stub();
  const { runVpn } = loadWithVscode<{ runVpn: RunVpn }>('../vpnRun', s.vscode);

  const started = await runVpn(vpnNode('ikev2'), 'start', { getVpnConfig: () => Promise.resolve('x') }, 'C:\\store', vaultKeys);

  assert.equal(started, false);
});

test('in a Remote-SSH window nothing is typed into the far machine, and the caller hears FALSE', async () => {
  const s = stub('ssh-remote');
  const { runVpn } = loadWithVscode<{ runVpn: RunVpn }>('../vpnRun', s.vscode);

  const started = await runVpn(vpnNode('wireguard'), 'stop', { getVpnConfig: () => Promise.resolve('x') }, '/store', vaultKeys);

  assert.equal(started, false);
  assert.equal(s.created.length, 0);
  assert.match(s.warnings[0] ?? '', /another computer \(ssh-remote\)/);
});

test('a WireGuard stop runs in a terminal whose shell is PINNED, not the default profile (#103)', async () => {
  const s = stub();
  // The launcher probe reads this machine's PATH and Program Files; the question here is only
  // which terminal the line lands in, so the binary is declared present.
  const { runVpn } = loadWithVscode<{ runVpn: RunVpn }>('../vpnRun', s.vscode, {
    './vpnExec': { resolveVpnLauncher: () => ({ kind: 'cli', exe: 'wg-quick' }) },
  });

  const started = await runVpn(vpnNode('wireguard'), 'stop', { getVpnConfig: () => Promise.resolve('x') }, '/store', vaultKeys);

  assert.equal(started, true);
  assert.equal(s.created.length, 1);
  // PowerShell 7 when this Windows has it, else Windows PowerShell; bash (or sh) elsewhere.
  const expected = process.platform === 'win32' ? /^(pwsh|powershell)\.exe$/ : /^\/bin\/(ba)?sh$/;
  assert.match(s.created[0].shellPath ?? '', expected);
});
