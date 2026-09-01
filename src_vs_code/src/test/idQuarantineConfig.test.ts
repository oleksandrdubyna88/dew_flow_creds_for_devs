import assert from 'node:assert/strict';
import { test } from 'node:test';
import { quarantineUnsafeIds } from '../idQuarantine';
import type { TreeNode } from '../types';

/**
 * A config body must follow its entry when an unsafe imported id is renamed.
 *
 * <p>Found while fixing the identical bug for `payment` (its code review named it). `remapBundle`
 * re-keys nine maps BY HAND, and `configs` was never one of them — so restoring a backup whose config
 * node id is `x:config` renames the node to a safe uuid, leaves the document under the old key, and
 * the restored entry reads as an empty config while the only copy of the file becomes an unreachable
 * keychain orphan. Pre-existing since the `config` kind shipped in 0.77.0.</p>
 *
 * <p>Its own test file and its own commit, deliberately: it is not the payment story's bug, and
 * burying somebody else's data-loss fix inside a feature commit is how it stops being found.</p>
 */

function configNode(id: string): TreeNode {
  return {
    id,
    name: 'appsettings',
    type: 'entity',
    parentId: null,
    details: { id, name: 'appsettings', isSshEnabled: false, kind: 'config', isConfig: true },
  };
}

test('a config document follows its entry when an unsafe id is quarantined', () => {
  const body = '{"ConnectionStrings":{"Default":"Host=db"}}';
  const bundle = {
    nodes: [configNode('x:config')],
    passwords: {},
    configs: { 'x:config': body },
  };

  const { bundle: safe, renamed } = quarantineUnsafeIds(bundle as never, {}, () => 'fresh-uuid');

  assert.equal(renamed['x:config'], 'fresh-uuid', 'the id was quarantined');
  assert.equal(safe.nodes[0]?.id, 'fresh-uuid');
  assert.equal(
    (safe as { configs?: Record<string, string> }).configs?.['fresh-uuid'],
    body,
    'the document moved with the entry, rather than being stranded under the old key',
  );
  assert.equal(
    (safe as { configs?: Record<string, string> }).configs?.['x:config'],
    undefined,
    'nothing left behind to become an orphan',
  );
});
