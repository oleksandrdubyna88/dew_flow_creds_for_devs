import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as nodePath from 'node:path';
import { after, test } from 'node:test';
import { LeasedQueue } from '../leasedQueue';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { WindowLock, nodeLockFs } from '../windowLock';
import { loadBridgeModules, put } from './bridgeModules';

/**
 * The scope store across windows (S25): the real filesystem, a real directory, and two `LeasedQueue`s over two
 * `WindowLock`s on the one lock directory — two windows of one VS Code, in one process.
 *
 * <p>What the unit tests of `bridgeScope.test.ts` cannot show: that a narrow made in one window is the next read in
 * another, that a write made from an old copy cannot bring back what another window removed, and that two writers
 * racing for one server do not both land.</p>
 */

const M = loadBridgeModules();
const { NO_SCOPE, SCOPE_STALE, SCOPES_DIR, SCOPES_LOCK_DIR, nodeScopeFs, scopeFileName } = M.scope;

const A1 = 'a1';
const S1 = 'server1';

interface Windows {
  readonly dir: string;
  readonly scopesDir: string;
  readonly a: import('../bridgeScope').BridgeScopes;
  readonly b: import('../bridgeScope').BridgeScopes;
  readonly fileOf: (account: string, server: string) => string;
}

/** Every folder this file makes is owned and claimed, and removed when the file's tests end. */
const scope = cleanupScope();
after(() => scope.close());

/** Two windows over one storage folder; the folder is owned, so it is removed whatever the scenario did. */
async function twoWindows(scenario: (w: Windows) => Promise<void>): Promise<void> {
  const dir = ownedDir(scope, 'store');
  const scopesDir = nodePath.join(dir, SCOPES_DIR);
  const window = (): import('../bridgeScope').BridgeScopes =>
    new M.scope.BridgeScopes(scopesDir, nodeScopeFs(), new LeasedQueue(new WindowLock(nodePath.join(dir, SCOPES_LOCK_DIR), nodeLockFs())), () => 1_000);
  await scenario({ dir, scopesDir, a: window(), b: window(), fileOf: (account, server) => nodePath.join(scopesDir, scopeFileName(account, server)) });
}

test('S25: a scope narrowed in one window is the next read in another, with no reconnect', async () => {
  await twoWindows(async ({ a, b }) => {
    await put(a, A1, S1, ['e1', 'e2']);
    assert.deepEqual([...b.read(A1, S1).entries].sort(), ['e1', 'e2'], 'positive control: B sees what A wrote');
    await put(a, A1, S1, ['e1']);
    assert.deepEqual([...b.read(A1, S1).entries], ['e1'], 'A narrowed; B\'s next read is the narrowed scope');
    assert.equal(b.read(A1, S1).admits(A1, 'e2'), false);
    assert.notEqual(b.read(A1, S1).revision, NO_SCOPE);
  });
});

test('S25: a write made from an old copy is refused and restores nothing', async () => {
  await twoWindows(async ({ a, b }) => {
    await put(a, A1, S1, ['e1', 'e2']);
    const copy = b.read(A1, S1);
    assert.notEqual(copy.revision, NO_SCOPE, 'B looked at a scope that exists');
    await put(a, A1, S1, ['e1']);
    await assert.rejects(b.set(A1, S1, ['e1', 'e2'], false, copy.revision), { message: SCOPE_STALE });
    assert.deepEqual([...a.read(A1, S1).entries], ['e1'], 'A\'s narrow stands: nothing was restored');
    assert.notEqual(a.read(A1, S1).revision, copy.revision, 'and A\'s revision is not the one B held');
  });
});

test('S25: a window that forgot the scope cannot be undone by a window that still holds a copy', async () => {
  await twoWindows(async ({ a, b }) => {
    await put(a, A1, S1, ['e1']);
    const copy = a.read(A1, S1);
    await b.forget(A1, S1);
    await assert.rejects(a.set(A1, S1, ['e1'], false, copy.revision), { message: SCOPE_STALE }, 'the file is gone; it is NO_SCOPE now');
    assert.equal(a.read(A1, S1).entries.size, 0, 'still forgotten');
    assert.equal(a.read(A1, S1).revision, NO_SCOPE);
  });
});

test('S25: two sets racing for one server from two windows — exactly one lands, the other is stale', async () => {
  await twoWindows(async ({ a, b }) => {
    await put(a, A1, S1, ['e1']);
    const held = a.read(A1, S1).revision;
    const outcomes = await Promise.allSettled([a.set(A1, S1, ['from-a'], false, held), b.set(A1, S1, ['from-b'], false, held)]);
    const landed = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const refused = outcomes.filter((outcome) => outcome.status === 'rejected');
    assert.equal(landed.length, 1, 'one landed');
    assert.equal(refused.length, 1, 'and one was refused');
    assert.equal((refused[0] as PromiseRejectedResult).reason.message, SCOPE_STALE);
    const winner = (await Promise.all([outcomes[0].status === 'fulfilled' ? 'from-a' : 'from-b']))[0];
    assert.deepEqual([...b.read(A1, S1).entries], [winner], 'the file holds the winner');
    assert.equal(b.read(A1, S1).revision, (landed[0] as PromiseFulfilledResult<string>).value, 'at the winner\'s revision: the loser did not write on top');
  });
});

test('S25: a corrupt file written beside the store is an empty scope, and the next set expecting NO_SCOPE replaces it', async () => {
  await twoWindows(async ({ a, b, fileOf, scopesDir }) => {
    fs.mkdirSync(scopesDir, { recursive: true });
    fs.writeFileSync(fileOf(A1, S1), '{ half a file');
    assert.equal(b.read(A1, S1).entries.size, 0);
    assert.equal(b.read(A1, S1).revision, NO_SCOPE);
    assert.equal(await a.set(A1, S1, ['e1'], false, NO_SCOPE), a.read(A1, S1).revision);
    assert.deepEqual([...b.read(A1, S1).entries], ['e1']);
    assert.equal(JSON.parse(fs.readFileSync(fileOf(A1, S1), 'utf8')).v, 1, 'what is on disk is a ScopeFile again');
  });
});

test('S25: the file carries whose it is, and the lock directory is left clean when the write is done', async () => {
  await twoWindows(async ({ a, dir, fileOf, scopesDir }) => {
    await put(a, A1, S1, ['e1']);
    const text = JSON.parse(fs.readFileSync(fileOf(A1, S1), 'utf8'));
    assert.deepEqual(text, { v: 1, accountId: A1, serverEntityId: S1, entries: ['e1'], quiet: false, revision: a.read(A1, S1).revision, at: 1_000 });
    assert.deepEqual(fs.readdirSync(scopesDir), [scopeFileName(A1, S1)], 'only the file: no temp file stays behind');
    assert.ok(!fs.existsSync(nodePath.join(dir, SCOPES_LOCK_DIR)), 'and the lock is released');
  });
});

test('S25: nodeScopeFs lists only .json files, an absent directory as empty, and never a temp file left by a crash', async () => {
  await twoWindows(async ({ scopesDir }) => {
    const io = nodeScopeFs();
    assert.deepEqual(await io.list(scopesDir), [], 'the directory is not there yet');
    fs.mkdirSync(scopesDir, { recursive: true });
    fs.writeFileSync(nodePath.join(scopesDir, 'a.json'), '{}');
    fs.writeFileSync(nodePath.join(scopesDir, 'a.json.1234-abcd.tmp'), 'half');
    fs.writeFileSync(nodePath.join(scopesDir, 'notes.txt'), 'x');
    assert.deepEqual(await io.list(scopesDir), ['a.json']);
    assert.equal(io.readSync(nodePath.join(scopesDir, 'missing.json')), undefined, 'a file that is not there reads as undefined, not a throw');
    await io.remove(nodePath.join(scopesDir, 'missing.json'));
  });
});

test('S25: a write that cannot rename leaves no temp file, and says why', async () => {
  await twoWindows(async ({ scopesDir }) => {
    const io = nodeScopeFs();
    const target = nodePath.join(scopesDir, 'taken.json');
    fs.mkdirSync(target, { recursive: true });
    await assert.rejects(io.write(target, '{}'));
    assert.deepEqual(fs.readdirSync(scopesDir), ['taken.json'], 'the temp file was removed');
  });
});

/** `fs.promises.rename` made to fail with `code` for the first `times` calls. */
async function renameFailing(code: string, times: number, work: () => Promise<void>): Promise<number> {
  const real = fs.promises.rename;
  let calls = 0;
  fs.promises.rename = ((from: fs.PathLike, to: fs.PathLike): Promise<void> => {
    calls += 1;
    return calls <= times ? Promise.reject(Object.assign(new Error(`${code}: rename`), { code })) : real(from, to);
  }) as typeof fs.promises.rename;
  try {
    await work();
  } finally {
    fs.promises.rename = real;
  }
  return calls;
}

test('S25: a rename a reader is holding (EPERM/EBUSY, as on Windows) is retried, and gives up after three tries', async () => {
  await twoWindows(async ({ scopesDir }) => {
    const io = nodeScopeFs();
    for (const code of ['EPERM', 'EBUSY']) {
      const file = nodePath.join(scopesDir, `${code}.json`);
      const calls = await renameFailing(code, 2, () => io.write(file, '{"ok":true}'));
      assert.equal(calls, 3, `${code}: two refusals and a third try that lands`);
      assert.equal(fs.readFileSync(file, 'utf8'), '{"ok":true}');
    }
    const file = nodePath.join(scopesDir, 'stuck.json');
    let calls = 0;
    await assert.rejects(
      renameFailing('EPERM', 99, async () => {
        calls = 1;
        await io.write(file, '{}');
      }),
      /EPERM/,
    );
    assert.ok(calls === 1 && !fs.existsSync(file), 'a rename that never lands writes nothing');
    assert.ok(!fs.readdirSync(scopesDir).some((name) => name.endsWith('.tmp')), 'and leaves no temp file');
    const other = await renameFailing('EACCES', 1, () => io.write(nodePath.join(scopesDir, 'other.json'), '{}').catch(() => undefined));
    assert.equal(other, 1, 'any other error is not retried');
  });
});

test('V1: forget, set again, and a copy from before the Close is stale — the revision is never reused', async () => {
  await twoWindows(async ({ a, b }) => {
    await put(a, A1, S1, ['e1', 'e2']);
    const copy = a.read(A1, S1); // A's picker looked at the scope as it was
    await b.forget(A1, S1); // the person closed the bridge in B...
    const reopened = await b.set(A1, S1, ['e1'], false, NO_SCOPE); // ...and opened it again: a new pick, from nothing
    assert.notEqual(reopened, copy.revision, 'the new file does not carry the old copy\'s revision');
    await assert.rejects(a.set(A1, S1, ['e1', 'e2'], false, copy.revision), { message: SCOPE_STALE }, 'A\'s copy from before the Close cannot save over the new pick');
    assert.deepEqual([...b.read(A1, S1).entries], ['e1'], 'the new pick stands');
  });
});

test('V1: a set that expects the absent scope on a scope that exists is stale', async () => {
  await twoWindows(async ({ a, b }) => {
    await put(a, A1, S1, ['e1']);
    await assert.rejects(b.set(A1, S1, ['e1', 'e2'], false, NO_SCOPE), { message: SCOPE_STALE });
    assert.deepEqual([...a.read(A1, S1).entries], ['e1']);
  });
});
