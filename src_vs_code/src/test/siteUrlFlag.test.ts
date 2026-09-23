import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EntityFlagsRefresher, EntityFlagSource, EntityFlagTarget, entityKey } from '../entityFlags';
import { entityContextValue } from '../treeRowText';
import { EntityMetadata } from '../types';

/**
 * Issue #104 — which tree rows offer *Open Site in Browser*. The URL is a keychain value, so the
 * row learns it from the flag walk, the way `:pwd` does; these pin what the walk decides.
 */

interface Entry {
  details: EntityMetadata;
  fields?: string;
  /** The keychain read fails for this entry. */
  unreadable?: boolean;
}

interface Walk {
  target: EntityFlagTarget;
  walker: EntityFlagsRefresher;
  reads: string[];
}

function walk(entries: Record<string, Entry>): Walk {
  const reads: string[] = [];
  const target: EntityFlagTarget = {
    historyById: new Map(),
    passwordIds: new Set(),
    urlIds: new Set(),
    invalidConfigIds: new Set(),
    refresh: () => undefined,
  };
  const source: EntityFlagSource = {
    getAccounts: () => [{ accountId: 'acc' }],
    getNodes: () => Object.entries(entries).map(([id, e]) => ({ id, type: 'entity' as const, details: e.details })),
    getHistory: () => Promise.resolve([]),
    getConfigBody: () => Promise.resolve(undefined),
    getFieldsRaw: (_a, id) => {
      reads.push(id);
      return entries[id]?.unreadable === true ? Promise.reject(new Error('keychain says no')) : Promise.resolve(entries[id]?.fields);
    },
    getPassword: (_a, id) => Promise.resolve(id === 'site' ? 'pw' : undefined),
  };
  return { target, walker: new EntityFlagsRefresher(source, target), reads };
}

async function urlIdsOf(entries: Record<string, Entry>): Promise<{ ids: string[]; reads: string[] }> {
  const w = walk(entries);
  await w.walker.refresh();
  return { ids: [...w.target.urlIds], reads: w.reads };
}

const credential = (id: string, extra: Partial<EntityMetadata> = {}): EntityMetadata => ({
  id,
  name: id,
  isSshEnabled: false,
  kind: 'credential',
  ...extra,
});

test('a credential with a URL that would open is offered; one without is not', async () => {
  const { ids } = await urlIdsOf({
    site: { details: credential('site'), fields: JSON.stringify({ login: 'me', url: 'www.godaddy.com' }) },
    bare: { details: credential('bare'), fields: JSON.stringify({ login: 'me' }) },
    none: { details: credential('none') },
  });
  assert.deepEqual(ids, [entityKey('acc', 'site')]);
});

test('a URL that would be REFUSED is not offered — the menu never promises what the click cannot do', async () => {
  const { ids } = await urlIdsOf({
    js: { details: credential('js'), fields: JSON.stringify({ url: 'javascript:alert(1)' }) },
    file: { details: credential('file'), fields: JSON.stringify({ url: 'file:///etc/passwd' }) },
  });
  assert.deepEqual(ids, []);
});

test('a PIN-protected credential is offered unread — its URL is sealed until the PIN', async () => {
  const { ids, reads } = await urlIdsOf({ locked: { details: credential('locked', { pinProtected: true }) } });
  assert.deepEqual(ids, [entityKey('acc', 'locked')]);
  assert.deepEqual(reads, [], 'nothing sealed is read by the walk');
});

test('only credentials are read — the kind whose save writes the URL', async () => {
  const { ids, reads } = await urlIdsOf({
    host: { details: { id: 'host', name: 'host', isSshEnabled: true, kind: 'ssh', host: 'h' }, fields: JSON.stringify({ url: 'https://x' }) },
  });
  assert.deepEqual(ids, []);
  assert.deepEqual(reads, [], 'no keychain read for a kind that has no URL field');
});

test('the row wears :url exactly when the walk said so', () => {
  assert.match(entityContextValue(credential('a'), true, false, false, true), /:pwd:url/);
  assert.doesNotMatch(entityContextValue(credential('a'), true, false, false, false), /:url/);
});

test('one unreadable record costs its own hint, never the walk — every other flag still lands', async () => {
  // Gate code round #18: a keychain read that rejected used to abort the whole walk, and the tree
  // kept its OLD flags for everything until some later walk happened to succeed.
  const w = walk({
    site: { details: credential('site'), fields: JSON.stringify({ url: 'https://ok.example' }) },
    broken: { details: credential('broken'), unreadable: true },
  });
  await w.walker.refresh();
  assert.deepEqual([...w.target.urlIds], [entityKey('acc', 'site')]);
  assert.deepEqual([...w.target.passwordIds], [entityKey('acc', 'site')], 'the password flags were published too');
});
