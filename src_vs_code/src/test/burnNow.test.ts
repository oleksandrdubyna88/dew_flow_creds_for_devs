import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BURN_BUTTON, burnNow, burnNowText, canBurnNow } from '../burnNow';
import { TreeNode } from '../types';

const NOW = 1_800_000_000_000;
const ephemeral: TreeNode = {
  id: 'e1',
  name: 'deploy token',
  type: 'entity',
  parentId: null,
  details: { id: 'e1', name: 'deploy token', isSshEnabled: false, expiresAt: NOW + 3600_000, burnPolicy: 'ttl' } as never,
};
const ordinary: TreeNode = { ...ephemeral, id: 'e2', details: { id: 'e2', name: 'x', isSshEnabled: false } as never };

function world(answer: boolean) {
  const burned: string[] = [];
  const asked: Array<{ text: string; button: string }> = [];
  const deps = {
    confirm: (text: string, button: string): Promise<boolean> => {
      asked.push({ text, button });
      return Promise.resolve(answer);
    },
    burn: (_a: string, id: string): Promise<string[]> => {
      burned.push(id);
      return Promise.resolve([id]);
    },
    lost: (): Promise<string> => Promise.resolve(''),
  };
  return { deps, burned, asked };
}

test('the question carries what the burn loses beyond the entry — a rotated value waiting beside it — after its own words', async () => {
  const w = world(false);
  const lost = ' "deploy token" holds a rotated password that was never stored; deleting it permanently loses the only copy.';

  await burnNow({ ...w.deps, lost: () => Promise.resolve(lost) }, 'a1', ephemeral);

  assert.ok(w.asked[0].text.endsWith(`gone for good.${lost}`), `the question does not name what the burn loses: ${w.asked[0].text}`);
  assert.equal(burnNowText('x'), burnNowText('x', ''), 'nothing waiting adds nothing');
});

test('the question names the entry and says it is not the Trash; the one button is Burn', async () => {
  const w = world(true);
  assert.equal(await burnNow(w.deps, 'a1', ephemeral), 'burned');
  assert.equal(w.asked.length, 1);
  assert.ok(w.asked[0].text.includes('"deploy token"') && w.asked[0].text.includes('not the Trash'));
  assert.equal(w.asked[0].button, BURN_BUTTON);
  assert.deepEqual(w.burned, ['e1'], 'through the one delete path');
});

test('declining burns nothing', async () => {
  const w = world(false);
  assert.equal(await burnNow(w.deps, 'a1', ephemeral), 'kept');
  assert.deepEqual(w.burned, []);
});

test('an entry without a lifetime is never offered, and never asked about', async () => {
  const w = world(true);
  assert.equal(canBurnNow(ordinary), false);
  assert.equal(canBurnNow(ephemeral), true);
  assert.equal(await burnNow(w.deps, 'a1', ordinary), 'kept');
  assert.equal(w.asked.length, 0);
  assert.ok(burnNowText('x').startsWith('Burn "x" now?'));
});
