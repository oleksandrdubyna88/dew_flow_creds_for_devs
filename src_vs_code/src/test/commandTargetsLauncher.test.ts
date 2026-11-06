import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectLauncherCandidates } from '../commandTargets';
import { EntityMetadata } from '../types';

/**
 * Who may be picked as a VPN's launcher (parent `PLAN_terminal_folder_run.md` §1, story S2). `commandTargets.ts`
 * imports no `vscode`, and `collectLauncherCandidates` reads only `getNodes`.
 */

test('a_refused_entry_stays_pickable_as_a_launcher', () => {
  const details: EntityMetadata = { id: 't', name: 'a b', isSshEnabled: false, isTerminal: true, command: 'x {name}' };
  // Only `getNodes` is read: the rest of the storage is not this test's business.
  const storage = { getNodes: () => [{ id: 't', type: 'entity', name: 'a b', details }] } as never;
  // `executableLine` answers the TEMPLATE for a refused name; `undefined` would have read as "not pickable".
  assert.deepEqual(collectLauncherCandidates(storage, 'a1', 'other'), [{ id: 't', name: 'a b', os: undefined }]);
});
