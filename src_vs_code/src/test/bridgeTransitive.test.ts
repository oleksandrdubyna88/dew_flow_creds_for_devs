import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { Reply, code, message, pause } from './bridgeDoorHarness';
import { loadBridgeModules, present, put } from './bridgeModules';
import { ACCOUNT, Ask, SERVER, WallWorld, registryOf, send, sendSlow, until, viaBridge, viaMain, wallWorld } from './bridgeWallWorld';

/**
 * What a call does AFTER the wall let it in (E1.3, S8-S12, S14, S21): the references in the stored command, the scope
 * changing under an open modal, the one-use lane, and a token that only authenticates.
 *
 * <p>Every scenario goes through the three ways a call reaches `perform` (an MCP id, an alias, a token), because the
 * gate at launch is the one place all three must pass and a test of one route would not notice another skipping it.</p>
 */

const { scope: { REFERENCE_REFUSED }, requests: { GRANT_NOT_ALLOWED, UNKNOWN_TOKEN } } = loadBridgeModules();

const LEAK_REF = 'creds://a@x.test/Agents/leak-target/password';

interface Route {
  readonly via: 'mcp' | 'alias' | 'token';
  readonly ask: Ask;
  /** What a bridge answers for an entry out of scope on this route (§S3.3). */
  readonly out: { readonly status: number; readonly code: string; readonly message: string };
}

/** The three ways to ask for `e1`'s `exec`, and the sentence each gives when e1 is not in scope. */
function routes(token: string): Route[] {
  const command = 'id';
  return [
    { via: 'mcp', ask: { path: '/v1/mcp/use/exec', body: { entry: 'e1', command } }, out: { status: 404, code: 'not_found', message: 'No such entry, or this window does not serve it.' } },
    { via: 'alias', ask: { path: '/v1/alias/exec', body: { alias: 'one', command } }, out: { status: 404, code: 'not_found', message: 'No entry is enabled for the CLI under "one".' } },
    { via: 'token', ask: { path: '/v1/use/exec', token, body: { command } }, out: { status: 401, code: 'unauthorized', message: 'Unknown or missing grant token.' } },
  ];
}

const sentence = (): string => REFERENCE_REFUSED('prod');
const ranOf = (ww: WallWorld): string[] => ww.w.ran.map((r) => r.entityId);

/** One request, started and not awaited — for the scenarios that act while it is open. */
function begin(ww: WallWorld, ask: Ask): Promise<Reply> {
  return send(viaBridge(ww.bridge), ask);
}

const ASK_TOKEN = (token: string): Ask => ({ path: '/v1/use/exec', token, body: { command: 'id' } });

const narrowTo = async (ww: WallWorld, entries: string[]): Promise<void> => void (await put(ww.scopes, ACCOUNT, SERVER, entries));

test('S8: a stored command that names an entry out of scope is refused with the one sentence, before any dialog, on all three routes', async () => {
  const ww = await wallWorld({ storedTexts: [`deploy ${LEAK_REF}`] });
  try {
    const token = await ww.tokenFor(ACCOUNT, 'e1', 'prod');
    for (const route of routes(token)) {
      const reply = await send(viaBridge(ww.bridge), route.ask);
      assert.deepEqual([reply.status, code(reply), message(reply)], [403, 'denied', sentence()], route.via);
    }
    assert.deepEqual(ww.w.dialogs, [], 'nobody was asked to allow a call that cannot run');
    assert.deepEqual(ww.w.ran, []);
    assert.ok(ww.w.audit.some((line) => line.includes('denied')), 'and the refusal is in the journal, with the grant');
  } finally {
    ww.dispose();
  }
});

test('S8: the same stored command runs on the main port — the refusal is the bridge\'s, not the line\'s', async () => {
  const ww = await wallWorld({ storedTexts: [`deploy ${LEAK_REF}`] });
  try {
    const token = await ww.tokenFor(ACCOUNT, 'e1', 'prod');
    for (const route of routes(token)) {
      assert.equal((await send(viaMain(ww), route.ask)).status, 200, route.via);
    }
  } finally {
    ww.dispose();
  }
});

test('S9: every way a reference can fail reads alike through the real broker, and a reference in scope lets the call run', async () => {
  const ww = await wallWorld({ scope: ['e1', 'e2'] });
  try {
    const failing = [
      'creds://nobody@x.test/Agents/second/password',
      'creds://a@x.test/Agents/nothing/password',
      'creds://a@x.test/Agents/dup/password',
      LEAK_REF,
      'creds://b@x.test/Agents/only-a2-entry/password',
    ];
    const bridge = viaBridge(ww.bridge);
    const ask: Ask = { path: '/v1/mcp/use/exec', body: { entry: 'e1', command: 'id' } };
    for (const ref of failing) {
      ww.texts.current = [`x ${ref}`];
      const reply = await send(bridge, ask);
      assert.deepEqual([reply.status, code(reply), message(reply)], [403, 'denied', sentence()], ref);
      // S29: the stored text is text no listing shows, so nothing of it is echoed — not the account, not a folder, not a name.
      for (const part of ref.slice('creds://'.length).split('/')) {
        assert.ok(!reply.body.includes(part), `"${part}" of ${ref} is in the refusal: ${reply.body}`);
      }
      assert.equal(reply.body.split('creds://').length - 1, 1, 'the only creds:// in the body is the sentence\'s own word for what it refused');
    }
    assert.deepEqual(ww.w.dialogs, [], 'and not one of them raised a dialog');
  } finally {
    ww.dispose();
  }
});

test('S9: every target of the stored command in scope — the call proceeds, and is asked once', async () => {
  const ww = await wallWorld({ scope: ['e1', 'e2'], storedTexts: ['x creds://a@x.test/Agents/second/password'] });
  try {
    assert.equal((await send(viaBridge(ww.bridge), { path: '/v1/mcp/use/exec', body: { entry: 'e1', command: 'id' } })).status, 200);
    assert.equal(ww.w.dialogs.length, 1);
    assert.deepEqual(ranOf(ww), ['e1']);
  } finally {
    ww.dispose();
  }
});

test('S9: a storedTexts that throws is the same refusal, not a 500', async () => {
  const ww = await wallWorld();
  try {
    ww.wall.storedTexts = (): never => {
      throw new Error('C:\\Users\\person\\vault.json is locked');
    };
    const reply = await send(viaBridge(ww.bridge), { path: '/v1/mcp/use/exec', body: { entry: 'e1', command: 'id' } });
    assert.deepEqual([reply.status, code(reply), message(reply)], [403, 'denied', sentence()]);
    assert.ok(!reply.body.includes('vault.json'));
  } finally {
    ww.dispose();
  }
});

/** The grants a bridge door minted, as the registry holds them now. */
const bridgeGrants = (ww: WallWorld): Array<{ status: string; uses: number; bridge?: { context: { serverEntityId: string } } }> =>
  [...registryOf(ww).grants.values()].filter((grant) => grant.bridge !== undefined);

/** One route: the modal is open, the scope is narrowed to nothing, the person says Allow. */
async function narrowedUnderTheModal(index: number): Promise<void> {
  const promoted: string[] = [];
  const ww = await wallWorld({ holdDialogs: true, releaseWaiting: (account, entity) => (promoted.push(`${account}/${entity}`), Promise.resolve()) });
  try {
    const route = routes(await ww.tokenFor(ACCOUNT, 'e1', 'prod'))[index];
    const pending = begin(ww, route.ask);
    await until(() => ww.w.openDialogs.length === 1, `the dialog of ${route.via}`);
    await narrowTo(ww, []);
    ww.w.openDialogs[0]('Allow');
    const reply = await pending;

    assert.deepEqual([reply.status, code(reply), message(reply)], [route.out.status, route.out.code, route.out.message], route.via);
    assert.deepEqual(ww.w.ran, [], `${route.via}: the action did not run after Allow`);
    assert.deepEqual(promoted, [], `${route.via}: S27 — a waiting rotation was not promoted onto an entry the scope no longer admits`);
    const never = await send(viaBridge(ww.bridge), route.ask);
    assert.equal(reply.body.replace(/"durationMs":\d+/, ''), never.body.replace(/"durationMs":\d+/, ''), 'the same bytes as a request out of scope from the start');

    const [minted, ...others] = bridgeGrants(ww);
    assert.deepEqual(others, [], `${route.via}: one call grant`);
    assert.equal(minted.status, 'allowed', 'Allow was recorded');
    assert.equal(present(minted.bridge, 'the bridge').context.serverEntityId, SERVER, 'and the bridge survived allow and the use count');
    assert.equal(minted.uses, 0, 'the call grant spent no use');
    assert.deepEqual(ww.w.burned, []);
    assert.ok(ww.w.audit.some((line) => line.includes(route.out.code)), `${route.via}: one line in the journal for the refusal`);
    const tokenUses = route.ask.token === undefined ? 0 : present(registryOf(ww).get(route.ask.token), 'the token').uses;
    assert.equal(tokenUses, 0, 'and neither did the token');
  } finally {
    ww.dispose();
  }
}

test('S10: scope narrowed while the modal is open — the call is refused with the route\'s own sentence, byte for byte as if it had never been in scope', async () => {
  for (const index of [0, 1, 2]) {
    await narrowedUnderTheModal(index);
  }
});

test('S27: positive control — the same call with the scope left alone does promote the waiting rotation, once, before it runs', async () => {
  for (const index of [0, 1, 2]) {
    const promoted: string[] = [];
    const ww = await wallWorld({ releaseWaiting: (account, entity) => (promoted.push(`${account}/${entity}`), Promise.resolve()) });
    try {
      const route = routes(await ww.tokenFor(ACCOUNT, 'e1', 'prod'))[index];
      assert.equal((await send(viaBridge(ww.bridge), route.ask)).status, 200, route.via);
      assert.deepEqual(promoted, [`${ACCOUNT}/e1`], `${route.via}: the spy is alive, so its silence above means something`);
    } finally {
      ww.dispose();
    }
  }
});

test('S28: a token denied while its bridged call waits is refused at the gate — nothing runs, nothing is spent', async () => {
  const promoted: string[] = [];
  const ww = await wallWorld({ holdDialogs: true, releaseWaiting: (account, entity) => (promoted.push(`${account}/${entity}`), Promise.resolve()) });
  try {
    const token = await ww.tokenFor(ACCOUNT, 'e1', 'prod');
    const pending = begin(ww, ASK_TOKEN(token));
    await until(() => ww.w.openDialogs.length === 1, 'the bridged dialog');
    registryOf(ww).deny(token);
    ww.w.openDialogs[0]('Allow');
    const reply = await pending;
    assert.equal(reply.status, 403, `a token the person denied while the call waited ran anyway: ${reply.body}`);
    assert.deepEqual([reply.status, code(reply), message(reply)], [403, 'denied', GRANT_NOT_ALLOWED]);
    assert.deepEqual(ww.w.ran, [], 'the action did not run');
    assert.equal(registryOf(ww).get(token)?.uses, 0, 'the token\'s uses are as they were');
    assert.deepEqual(bridgeGrants(ww).map((grant) => grant.uses), [0], 'and so are the call grant\'s');
    assert.deepEqual(promoted, [], 'and no waiting rotation was promoted for a token the person had refused');
    assert.ok(ww.w.audit.some((line) => line.includes('denied')), 'one line in the journal for the refusal');
  } finally {
    ww.dispose();
  }
});

test('S11: a line edited while the modal is open — the new reference is refused at launch, after the dialog', async () => {
  for (const index of [0, 1, 2]) {
    const ww = await wallWorld({ holdDialogs: true, storedTexts: [] });
    try {
      const route = routes(await ww.tokenFor(ACCOUNT, 'e1', 'prod'))[index];
      const pending = begin(ww, route.ask);
      await until(() => ww.w.openDialogs.length === 1, `the dialog of ${route.via}`);
      assert.equal(ww.w.dialogs.length, 1, 'a clean line was shown to the person');
      ww.texts.current = [`deploy ${LEAK_REF}`];
      ww.w.openDialogs[0]('Allow');
      const reply = await pending;
      assert.deepEqual([reply.status, code(reply), message(reply)], [403, 'denied', sentence()], route.via);
      assert.deepEqual(ww.w.ran, [], `${route.via}: nothing ran`);
    } finally {
      ww.dispose();
    }
  }
});

test('S12: a one-use entry queued in the lane behind a call of another door, narrowed meanwhile — it refuses at its turn and spends nothing', async () => {
  for (const index of [0, 1, 2]) {
    const ww = await wallWorld({ oneUse: true });
    try {
      const token = await ww.tokenFor(ACCOUNT, 'e1', 'prod');
      const route = routes(token)[index];
      let release = (): void => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      ww.w.hold = () => gate;
      // The first call fails (500), so the lane is not marked spent and the second really does reach its turn.
      ww.w.result = { status: 500, body: { error: 'the far side said no' } };
      // The main port's token route takes no throttle slot, so the bridge's call (which raises a dialog) can queue behind it.
      const first = send(viaMain(ww), ASK_TOKEN(token));
      await until(() => ww.w.ran.length === 1, 'the first call to be inside the action');
      const second = begin(ww, route.ask);
      await until(() => ww.w.dialogs.length === 2, `the ${route.via} call to have been asked`);
      const spent = registryOf(ww).get(token)?.uses;
      await narrowTo(ww, []);
      release();
      assert.equal((await first).status, 500);
      const refused = await second;
      assert.deepEqual([refused.status, code(refused), message(refused)], [route.out.status, route.out.code, route.out.message], route.via);
      assert.equal(ww.w.ran.length, 1, 'only the first ever ran');
      assert.equal(registryOf(ww).get(token)?.uses, spent, `${route.via}: and the refused one did not count a use of the token`);
      assert.deepEqual([...registryOf(ww).grants.values()].filter((grant) => grant.bridge !== undefined).map((grant) => grant.uses), [0], 'nor of its own grant');
      assert.deepEqual(ww.w.burned, []);
    } finally {
      ww.dispose();
    }
  }
});

test('S12: a listener closed with a modal open — one ABANDONED line, and nothing runs', async () => {
  const ww = await wallWorld({ holdDialogs: true });
  try {
    const gone = begin(ww, { path: '/v1/mcp/use/exec', body: { entry: 'e1', command: 'id' } }).then(
      () => 'answered',
      () => 'hung up',
    );
    await until(() => ww.w.openDialogs.length === 1, 'the dialog');
    await ww.bridge.close();
    assert.equal(await gone, 'hung up');
    // The broker learns of the hang-up on its own tick; an Allow clicked before it did would be a click on a live request.
    await until(() => ww.w.audit.some((line) => line.includes('ABANDONED')), 'the abandoned line');
    ww.w.openDialogs[0]('Allow');
    await until(() => ww.w.audit.some((line) => line.includes('ignored')), 'the late Allow to be read and applied to nothing');
    assert.equal(ww.w.audit.filter((line) => line.includes('ABANDONED')).length, 1);
    assert.deepEqual(ww.w.ran, []);
  } finally {
    ww.dispose();
  }
});

test('S21: a refused launch spends nothing — not the call grant, not the token, and nothing is burned', async () => {
  const ww = await wallWorld({ holdDialogs: true });
  try {
    const secret = await ww.tokenFor(ACCOUNT, 'e1', 'prod');
    const before = { ...registryOf(ww).get(secret) };
    const pending = begin(ww, { path: '/v1/use/exec', token: secret, body: { command: 'id' } });
    await until(() => ww.w.openDialogs.length === 1, 'the dialog');
    await narrowTo(ww, []);
    ww.w.openDialogs[0]('Allow');
    assert.equal((await pending).status, 401);
    const after = registryOf(ww).get(secret);
    assert.deepEqual([after?.uses, after?.lastUsedAt, after?.status], [before.uses, before.lastUsedAt, before.status]);
    assert.deepEqual([...registryOf(ww).grants.values()].filter((grant) => grant.bridge !== undefined).map((grant) => grant.uses), [0]);
    assert.deepEqual(ww.w.burned, []);
  } finally {
    ww.dispose();
  }
});

test('S14: a token allowed on the main port still asks through a bridge, and its own allowance is untouched', async () => {
  const ww = await wallWorld();
  try {
    const token = await ww.tokenFor(ACCOUNT, 'e1', 'prod');
    assert.equal((await send(viaMain(ww), ASK_TOKEN(token))).status, 200);
    assert.equal(ww.w.dialogs.length, 1);
    assert.equal(registryOf(ww).get(token)?.status, 'allowed');
    assert.equal((await send(viaMain(ww), ASK_TOKEN(token))).status, 200);
    assert.equal(ww.w.dialogs.length, 1, 'locally the token is silent now');

    assert.equal((await send(viaBridge(ww.bridge), ASK_TOKEN(token))).status, 200);
    assert.equal(ww.w.dialogs.length, 2, 'a dialog anyway');
    assert.equal((await send(viaBridge(ww.bridge), ASK_TOKEN(token))).status, 200);
    assert.equal(ww.w.dialogs.length, 3, 'and again: every bridged call asks');
    assert.equal(registryOf(ww).get(token)?.status, 'allowed', 'the local grant is as it was');
    assert.equal((await send(viaMain(ww), ASK_TOKEN(token))).status, 200);
    assert.equal(ww.w.dialogs.length, 3, 'and a following local call is still silent');
  } finally {
    ww.dispose();
  }
});

test('S14: a token asked through a bridge and allowed there is still pending for the main port', async () => {
  const ww = await wallWorld();
  try {
    const token = await ww.tokenFor(ACCOUNT, 'e1', 'prod');
    assert.equal((await send(viaBridge(ww.bridge), ASK_TOKEN(token))).status, 200);
    assert.equal(registryOf(ww).get(token)?.status, 'pending', 'the bridge\'s Allow was given to a call grant, not to the token');
    assert.equal((await send(viaMain(ww), ASK_TOKEN(token))).status, 200);
    assert.equal(ww.w.dialogs.length, 2, 'the main port asks for itself');
  } finally {
    ww.dispose();
  }
});

test('S14: a token the person denied is refused through a bridge with no dialog; a Deny through a bridge refuses that call only', async () => {
  const ww = await wallWorld();
  try {
    ww.w.answers.splice(0, ww.w.answers.length, 'Deny');
    const denied = await ww.tokenFor(ACCOUNT, 'e1', 'prod');
    assert.equal((await send(viaMain(ww), ASK_TOKEN(denied))).status, 403);
    const dialogs = ww.w.dialogs.length;
    const through = await send(viaBridge(ww.bridge), ASK_TOKEN(denied));
    assert.deepEqual([through.status, code(through), message(through)], [403, 'denied', GRANT_NOT_ALLOWED]);
    assert.equal(ww.w.dialogs.length, dialogs, 'no dialog');

    ww.w.answers.splice(0, ww.w.answers.length, 'Deny', 'Allow');
    const fresh = await ww.tokenFor(ACCOUNT, 'e1', 'prod');
    const first = await send(viaBridge(ww.bridge), ASK_TOKEN(fresh));
    assert.deepEqual([first.status, code(first)], [403, 'denied'], 'Deny through the bridge refuses the call');
    assert.equal(registryOf(ww).get(fresh)?.status, 'pending', 'and does not tombstone the token');
    assert.equal((await send(viaBridge(ww.bridge), ASK_TOKEN(fresh))).status, 200, 'the next call asks again, and is allowed');
  } finally {
    ww.dispose();
  }
});

test('S14: with a limit of one call, the first bridged call runs and the second says the token ran out — the token is counted first', async () => {
  const ww = await wallWorld({ maxCalls: 1 });
  try {
    const token = await ww.tokenFor(ACCOUNT, 'e1', 'prod');
    assert.equal((await send(viaBridge(ww.bridge), ASK_TOKEN(token))).status, 200);
    assert.equal(registryOf(ww).get(token)?.uses, 1, 'the token\'s use was counted');
    const second = await send(viaBridge(ww.bridge), ASK_TOKEN(token));
    assert.equal(second.status, 401);
    assert.match(message(second), /reached its limit of 1 calls/);
    assert.equal(ww.w.ran.length, 1, 'and nothing ran for it');
  } finally {
    ww.dispose();
  }
});

test('S14: a token path is throttled like an alias call — one dialog at a time, five a minute', async () => {
  const ww = await wallWorld({ holdDialogs: true });
  try {
    const [one, two] = await Promise.all([ww.tokenFor(ACCOUNT, 'e1', 'prod'), ww.tokenFor(ACCOUNT, 'e1', 'prod')]);
    const first = begin(ww, ASK_TOKEN(one));
    await until(() => ww.w.openDialogs.length === 1, 'the first dialog');
    const busy = await send(viaBridge(ww.bridge), ASK_TOKEN(two));
    assert.deepEqual([busy.status, code(busy)], [429, 'too_many_requests']);
    assert.match(message(busy), /Another request is already waiting/);
    ww.w.openDialogs[0]('Allow');
    assert.equal((await first).status, 200);
    assert.equal(ww.w.dialogs.length, 1, 'the refused call raised no dialog');
  } finally {
    ww.dispose();
  }
});

test('S14: the sixth token call inside a minute is refused', async () => {
  const ww = await wallWorld();
  try {
    const token = await ww.tokenFor(ACCOUNT, 'e1', 'prod');
    for (let call = 1; call <= 5; call += 1) {
      assert.equal((await send(viaBridge(ww.bridge), ASK_TOKEN(token))).status, 200, `call ${call}`);
    }
    const sixth = await send(viaBridge(ww.bridge), ASK_TOKEN(token));
    assert.deepEqual([sixth.status, code(sixth)], [429, 'too_many_requests']);
    assert.match(message(sixth), /at most 5 times a minute/);
    assert.equal(ww.w.dialogs.length, 5);
  } finally {
    ww.dispose();
  }
});

test('a grant a bridge door mints is a call grant, reclaimed before any token somebody holds — on every route', async () => {
  const ww = await wallWorld();
  try {
    const token = await ww.tokenFor(ACCOUNT, 'e1', 'prod');
    for (const route of routes(token)) {
      const before = bridgeGrants(ww).length;
      assert.equal((await send(viaBridge(ww.bridge), route.ask)).status, 200, route.via);
      assert.equal(bridgeGrants(ww).length, before + 1, `${route.via}: one grant minted for the call`);
    }
    const scopes = [...registryOf(ww).grants.values()].filter((grant) => grant.bridge !== undefined).map((grant) => grant.scope);
    assert.deepEqual(scopes, ['call', 'call', 'call']);
    assert.equal(registryOf(ww).get(token)?.scope, 'token', 'and the token itself is still the token it was');
  } finally {
    ww.dispose();
  }
});


/* ---------------------------------------------------------------------------------------------------------------
 * Amendment 2, B.4 — a Deny that lands between the token's lookup and its body
 * ------------------------------------------------------------------------------------------------------------- */

test('T1: a token denied after the bridge looked it up and before its body arrived is refused — no dialog, no minted grant', async () => {
  const ww = await wallWorld({ allows: 0 });
  try {
    const token = await ww.tokenFor(ACCOUNT, 'e1', 'prod');
    let sendBody = (): void => undefined;
    const bodyAfter = new Promise<void>((resolve) => {
      sendBody = resolve;
    });
    const slow = sendSlow(viaBridge(ww.bridge), ASK_TOKEN(token), bodyAfter);
    await pause(100); // the headers have been read and the token looked up: it was pending
    ww.w.answers.push('Deny');
    const local = await send(viaMain(ww), ASK_TOKEN(token));
    assert.equal(local.status, 403, 'a local dialog was answered Deny');
    const dialogs = ww.w.dialogs.length;
    const journal = ww.w.audit.length;
    sendBody();
    const reply = await slow;
    assert.deepEqual([reply.status, code(reply), message(reply)], [403, 'denied', GRANT_NOT_ALLOWED]);
    assert.equal(ww.w.dialogs.length, dialogs, 'and nobody was asked');
    assert.equal(ww.w.audit.slice(journal).some((line) => line.includes('minted')), false, 'no call grant was minted for it');
    assert.deepEqual(ww.w.ran, [], 'nothing ran');
  } finally {
    ww.dispose();
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * Amendment 3, C.5 — a token that is gone between the lookup and the body is answered as an unknown one
 * ------------------------------------------------------------------------------------------------------------- */

test('T2: a token evicted after the bridge looked it up and before its body arrived is answered 401 unknown — no dialog, no line, nothing ran', async () => {
  const ww = await wallWorld({ allows: 0 });
  try {
    const token = await ww.tokenFor(ACCOUNT, 'e1', 'prod');
    let sendBody = (): void => undefined;
    const bodyAfter = new Promise<void>((resolve) => {
      sendBody = resolve;
    });
    const slow = sendSlow(viaBridge(ww.bridge), ASK_TOKEN(token), bodyAfter);
    await pause(100); // the headers have been read and the token looked up: it was pending
    for (let n = 0; n < 256; n += 1) {
      await ww.tokenFor(ACCOUNT, 'e1', 'prod'); // the registry fills; the oldest pending token is the last resort, and goes
    }
    assert.equal(registryOf(ww).get(token), undefined, 'the registry evicted the token the bridge had looked up');
    const dialogs = ww.w.dialogs.length;
    const journal = ww.w.audit.length;
    sendBody();
    const reply = await slow;
    assert.deepEqual([reply.status, code(reply), message(reply)], [401, 'unauthorized', UNKNOWN_TOKEN]);
    assert.equal(ww.w.dialogs.length, dialogs, 'and nobody was asked');
    assert.deepEqual(ww.w.audit.slice(journal), [], 'an unknown token writes no line, as on the main port');
    assert.deepEqual(ww.w.ran, [], 'nothing ran');
  } finally {
    ww.dispose();
  }
});
