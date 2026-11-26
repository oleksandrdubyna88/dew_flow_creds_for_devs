/**
 * S4 (change 11.1) on a real Windows image: a stored command whose "Runs on" is Windows, asked for through a Remote Bridge, runs on this computer
 * in the shell the person's Run uses (Windows PowerShell here: the image's `pwsh` is not asked for), with its `creds://` value in the child's
 * environment only. The child prints the value in TWO writes 300 ms apart, then its own command line; the answer holds the value masked, once.
 * The `runner-windows` job of `ci-extension.yml` runs this file; off `win32` the case is skipped by name (`bridgedRun.test.ts` S4-9 runs the
 * same road on Linux, with a POSIX shell given in the place of PowerShell).
 */
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { terminalRunAction } from '../agentUseActions';
import type { BridgeContext } from '../bridgeContext';
import { commandFingerprint } from '../commandTrust';
import { resolveCommand } from '../commandLine';
import { placeholderFor } from '../secretMasker';
import type { RefSource } from '../secretRef';
import type { EntityMetadata, TreeNode } from '../types';
import type { UseActionResult } from '../useActions';

const SKIPPED_OFF_WINDOWS = process.platform === 'win32' ? false : 'skipped: S4-W1 runs the Windows row in Windows PowerShell, on windows-latest only';

const ACCOUNT = 'acct-1';
const BRIDGE: BridgeContext = { bridgeId: 'bridge-1', accountId: ACCOUNT, serverEntityId: 'srv', serverName: 'build box', target: '', remoteOs: 'linux' };
const DB_PASSWORD = 'db-password-Zq7-long-enough';
const REF = 'creds://me@x.test/db/password';

/** No double quote anywhere: Windows PowerShell 5.1 parses a native argument's quotes on its own terms (`hostShell.ts`). */
const LINE = [
  `$v = ${REF}`,
  '[Console]::Out.Write($v.Substring(0, 6))',
  '[Console]::Out.Flush()',
  'Start-Sleep -Milliseconds 300',
  '[Console]::Out.Write($v.Substring(6))',
  '[Console]::Out.WriteLine()',
  "(Get-CimInstance Win32_Process -Filter ('ProcessId=' + $PID)).CommandLine",
].join('; ');

const ENTRY: EntityMetadata = { id: 'win', name: 'sign-in', isTerminal: true, isSshEnabled: false, terminalOs: 'windows', command: LINE };

test('S4-W1: the Windows row runs here in PowerShell, the value in its environment only, printed in two chunks and masked, never on its command line', { skip: SKIPPED_OFF_WINDOWS }, async (t) => {
  const node: TreeNode = { id: ENTRY.id, name: ENTRY.name, type: 'entity', details: ENTRY, parentId: null };
  const refSource: RefSource = {
    accounts: () => [{ accountId: ACCOUNT, email: 'me@x.test' }],
    entities: () => [{ id: 'db', name: 'db', path: ['db'] }],
    fieldReading: () => Promise.resolve({ kind: 'value', value: DB_PASSWORD }),
  };
  const deps = {
    storage: { getNode: (_accountId: string, id: string) => (id === ENTRY.id ? node : undefined) },
    storageDir: 'C:\\never-written',
    signal: new AbortController().signal,
    acquireExecSlot: () => () => undefined,
    note: () => undefined,
    trustStore: { get: () => [commandFingerprint(ENTRY.id, (resolveCommand(ENTRY) as { line: string }).line)], update: async () => undefined },
    applyEnv: async () => ({ written: [] as string[], withheld: [] }),
    onPath: () => false,
    overSsh: () => Promise.reject(new Error('the Windows row never goes to the server')),
    bridgeRefs: { refSource, wall: { scopes: { read: () => ({ admits: () => true }) } } as never },
  };
  const action = terminalRunAction(deps as never);
  const target = { accountId: ACCOUNT, entityId: ENTRY.id, entityName: ENTRY.name, bridge: BRIDGE };
  assert.equal(action.bridgedSite?.(target), 'laptop');

  const result: UseActionResult = await action.run({ ...target, signal: new AbortController().signal, site: 'laptop' }, {});

  const out = result.body as { exitCode: number | null; stdout: string; stderr: string };
  t.diagnostic(`S4-W1 exit ${out.exitCode}; stdout ${JSON.stringify(out.stdout)}; stderr ${JSON.stringify(out.stderr.slice(0, 400))}`);
  assert.equal(out.exitCode, 0, out.stderr);
  assert.ok(!out.stdout.includes(DB_PASSWORD), 'the value, printed across two chunks, is masked');
  assert.equal(out.stdout.split(placeholderFor('CREDS_REF_1')).length - 1, 1, 'the value stood once, in the printed output only, not on the command line');
  assert.ok(out.stdout.includes('$env:CREDS_REF_1'), 'the command line reads the value by name');
});
