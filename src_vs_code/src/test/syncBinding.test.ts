import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KeyWrap, newMasterKey, unwrapWithPin, wrapWithPin, wrapWithPrf } from '../keyWrap';
import { BindingWrite, bindingWrapsFor, describeStrip } from '../syncBinding';
import { StoredAccount } from '../types';

const account: StoredAccount = { accountId: 'acct-1', email: 'alice@example.com', provider: 'microsoft' };
const S = { key: Buffer.alloc(32, 9), fingerprint: 'aaaabbbbccccdddd' };
const dev = { role: 'dev', active: true };

const master = newMasterKey();
const plainPin = wrapWithPin(master, account.accountId, '1234', 1);
const boundPin = wrapWithPin(master, account.accountId, '1234', 1, S);
const recovery: KeyWrap = { kind: 'recovery', id: 'recovery', createdAt: 1, salt: 's', iv: 'i', tag: 't', data: 'd' };

function write(wraps: readonly KeyWrap[], context: BindingWrite['context']): BindingWrite & {
  said: string[];
  logged: string[];
} {
  const said: string[] = [];
  const logged: string[] = [];
  return {
    wraps,
    masterKey: master,
    account,
    context,
    now: 2,
    log: (m) => logged.push(m),
    announce: (m) => said.push(m),
    said,
    logged,
  };
}

test('a developer with a key and a PIN gets a bound PIN wrap', async () => {
  const w = write([plainPin], { policy: dev, loginKey: S, pin: '1234' });

  const wraps = await bindingWrapsFor(w);

  assert.ok(wraps !== undefined);
  assert.equal(wraps[0].serverBound, true);
  assert.deepEqual(unwrapWithPin(wraps[0], account.accountId, '1234', S), master);
});

test('the same developer WITHOUT a stored PIN writes nothing', async () => {
  // The finding that reshaped this story: a background cycle holds the master key, not the PIN, and
  // the PIN wrap's key cannot be re-derived without it. Binding waits for an unlock that asks.
  const w = write([plainPin], { policy: dev, loginKey: S });

  assert.equal(await bindingWrapsFor(w), undefined);
  assert.deepEqual(w.said, []);
});

test('a bound vault with no key in hand leaves the list alone and says why in the log', async () => {
  const w = write([boundPin], { policy: dev, pin: '1234' });

  assert.equal(await bindingWrapsFor(w), undefined);
  assert.match(w.logged.join('\n'), /left as it is \(noLoginKey\)/);
});

test('a cycle that could not ask changes nothing at all', async () => {
  const w = write([boundPin], { loginKey: S, pin: '1234' });

  assert.equal(await bindingWrapsFor(w), undefined);
});

test('demotion rewrites the PIN wrap unbound', async () => {
  const w = write([boundPin], { policy: { role: 'member', active: true }, loginKey: S, pin: '1234' });

  const wraps = await bindingWrapsFor(w);

  assert.ok(wraps !== undefined);
  assert.equal(wraps[0].serverBound, undefined);
  assert.deepEqual(unwrapWithPin(wraps[0], account.accountId, '1234'), master);
});

test('binding drops the printed code and an unbound security key, and SAYS so', async () => {
  // Both doors close silently otherwise, and the first time either is discovered is the moment
  // somebody needs it.
  const key = wrapWithPrf(master, 'cred-1', 'salt', Buffer.alloc(32, 5), 'YubiKey', 1);
  const w = write([plainPin, key, recovery], { policy: dev, loginKey: S, pin: '1234' });

  const wraps = await bindingWrapsFor(w);

  assert.deepEqual(wraps?.map((x) => x.kind), ['pin']);
  assert.equal(w.said.length, 1);
  assert.match(w.said[0], /printed recovery code no longer opens it/);
  assert.match(w.said[0], /registered again/);
});

test('a bind that takes nothing away says nothing', async () => {
  const w = write([plainPin], { policy: dev, loginKey: S, pin: '1234' });

  await bindingWrapsFor(w);

  assert.deepEqual(w.said, []);
});

test('the sentence names only what was actually lost', () => {
  assert.match(describeStrip([recovery]), /printed recovery code/);
  assert.doesNotMatch(describeStrip([recovery]), /security key/);
  assert.equal(describeStrip([]), '');
});
