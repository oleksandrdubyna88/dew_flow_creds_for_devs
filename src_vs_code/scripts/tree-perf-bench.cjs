// Performance bench for the sidebar tree and the storage layer — the numbers behind the
// audit's §C items (todo/PLAN_audit_roadmap_2026_08_25.md, C1–C4).
//
//   npm run compile && node scripts/tree-perf-bench.cjs
//   BENCH_OUT=/path/to/another/out node scripts/tree-perf-bench.cjs   # e.g. HEAD compiled elsewhere
//
// Runs the REAL compiled StorageManager and CredTreeDataProvider over a fake memento and a
// fake SecretStorage that COUNT their calls, with `vscode` stubbed the way the itests do.
// Counts are the measurement that matters: a keychain read is a cross-process call whose
// latency depends on the OS, so "300 reads → 0 reads" is the reproducible fact and the
// milliseconds are the illustration. Wall-clock is reported too, median of several runs.
//
// The vault: one account, 10 folders, 1000 entities — 300 of them in the first folder, the
// rest spread over the other nine. Half the entities have a password.
const path = require('path');
const os = require('os');
const fs = require('fs');
const Module = require('module');

// ---- vscode stub -------------------------------------------------------------
const emitterFires = { count: 0 };
const stub = path.join(os.tmpdir(), 'creds-tree-bench-vscode-stub.cjs');
fs.writeFileSync(
  stub,
  `const fires = global.__CREDS_BENCH_FIRES__;
   class TreeItem { constructor(label, collapsibleState) { this.label = label; this.collapsibleState = collapsibleState; } }
   class ThemeIcon { constructor(id, color) { this.id = id; this.color = color; } }
   class ThemeColor { constructor(id) { this.id = id; } }
   class MarkdownString { constructor() { this.value = ''; this.supportThemeIcons = false; } appendText(t) { this.value += t; } }
   class EventEmitter { constructor() { this.event = () => ({ dispose() {} }); } fire() { fires.count += 1; } }
   module.exports = {
     TreeItem, ThemeIcon, ThemeColor, MarkdownString, EventEmitter,
     TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
     Uri: { joinPath: (...parts) => ({ parts }), file: (p) => ({ fsPath: p }) },
     workspace: { getConfiguration: () => ({ get: (_k, d) => d }) },
     window: { showWarningMessage: () => Promise.resolve(undefined) },
   };`,
);
global.__CREDS_BENCH_FIRES__ = emitterFires;
const orig = Module._resolveFilename;
Module._resolveFilename = (req, ...a) => (req === 'vscode' ? stub : orig.call(Module, req, ...a));

const OUT = process.env.BENCH_OUT ? path.resolve(process.env.BENCH_OUT) : path.join(__dirname, '..', 'out');
const { StorageManager } = require(path.join(OUT, 'storageManager.js'));
const { CredTreeDataProvider } = require(path.join(OUT, 'treeDataProvider.js'));

// ---- counting fakes ------------------------------------------------------------
function memento() {
  const map = new Map();
  const counts = { get: 0, update: 0 };
  return {
    counts,
    get: (key, fallback) => {
      counts.get += 1;
      return map.has(key) ? map.get(key) : fallback;
    },
    update: (key, value) => {
      counts.update += 1;
      // Mirror ExtHostMemento: a stored object is a JSON clone, stable until the next write.
      map.set(key, value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value);
      return Promise.resolve();
    },
  };
}

function secrets() {
  const map = new Map();
  const counts = { get: 0, store: 0, delete: 0 };
  return {
    counts,
    get: (k) => {
      counts.get += 1;
      return Promise.resolve(map.get(k));
    },
    store: (k, v) => {
      counts.store += 1;
      map.set(k, v);
      return Promise.resolve();
    },
    delete: (k) => {
      counts.delete += 1;
      map.delete(k);
      return Promise.resolve();
    },
    onDidChange: () => ({ dispose() {} }),
    _map: map,
  };
}

// ---- the vault ------------------------------------------------------------------
const ACCOUNT = { accountId: 'acc-bench', email: 'bench@example.com', provider: 'google' };
const FOLDERS = 10;
const ENTITIES = 1000;
const BIG_FOLDER_SIZE = 300;

function buildVault(gs, ss) {
  const nodes = [];
  for (let f = 0; f < FOLDERS; f += 1) {
    nodes.push({ id: `f${f}`, name: `Folder ${f}`, type: 'folder', parentId: null, sortOrder: f });
  }
  for (let i = 0; i < ENTITIES; i += 1) {
    const folder = i < BIG_FOLDER_SIZE ? 0 : 1 + ((i - BIG_FOLDER_SIZE) % (FOLDERS - 1));
    const id = `e${i}`;
    nodes.push({
      id,
      name: `ent-${i}`,
      type: 'entity',
      parentId: `f${folder}`,
      details: { id, name: `ent-${i}`, host: `host-${i}.example.com`, user: 'deploy', isSshEnabled: true },
      updatedAt: 1_700_000_000_000 + i,
      v: { bench: i + 1 },
    });
    if (i % 2 === 0) {
      ss._map.set(`${ACCOUNT.accountId}_${id}`, `pw-${i}`);
    }
  }
  gs.update('credSshManager.accounts', [ACCOUNT]);
  gs.update(`credSshManager.nodes.${ACCOUNT.accountId}`, nodes);
  return nodes;
}

function resetCounts(...counters) {
  for (const c of counters) {
    for (const k of Object.keys(c)) {
      c[k] = 0;
    }
  }
}

function median(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const RUNS = 7;
const fmt = (ms) => `${ms.toFixed(2)} ms`;

async function timed(fn) {
  const samples = [];
  for (let r = 0; r < RUNS; r += 1) {
    const t0 = process.hrtime.bigint();
    await fn();
    samples.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  return median(samples);
}

/** One full render pass, as VS Code performs it after `onDidChangeTreeData` fires. */
async function renderPass(provider) {
  const roots = provider.getChildren(undefined);
  await provider.getTreeItem({ kind: 'search' });
  for (const root of roots) {
    if (root.kind !== 'account') {
      continue;
    }
    await provider.getTreeItem(root);
    for (const child of provider.getChildren(root)) {
      await provider.getTreeItem(child);
      if (child.kind === 'node' && child.node.type === 'folder') {
        for (const leaf of provider.getChildren(child)) {
          await provider.getTreeItem(leaf);
        }
      }
    }
  }
}

async function main() {
  const gs = memento();
  const ss = secrets();
  const nodes = buildVault(gs, ss);
  const storage = new StorageManager(gs, ss);
  const provider = new CredTreeDataProvider(storage, { fsPath: '/ext' });
  const storageChildrenCalls = { count: 0 };
  const innerGetChildren = storage.getChildren.bind(storage);
  storage.getChildren = (accountId, parentId) => {
    storageChildrenCalls.count += 1;
    return innerGetChildren(accountId, parentId);
  };

  // After C1 the flags live on the provider and are filled at mutation time; the bench fills
  // them the way the extension's refresher does, and reports that cost on its own line.
  const hasFlagCache = provider.passwordIds instanceof Set;
  let populateReads = 0;
  let populateMs = 0;
  if (hasFlagCache) {
    populateMs = await timed(async () => {
      resetCounts(ss.counts);
      provider.passwordIds.clear();
      for (const node of storage.getNodes(ACCOUNT.accountId)) {
        if (node.type !== 'entity') {
          continue;
        }
        if ((await storage.getPassword(ACCOUNT.accountId, node.id)) !== undefined) {
          provider.passwordIds.add(`${ACCOUNT.accountId}:${node.id}`);
        }
      }
      populateReads = ss.counts.get;
    });
  }

  const rows = [];
  const say = (scenario, metric, value) => rows.push([scenario, metric, value]);

  // ---- C1: expand the 300-entity folder ------------------------------------------
  const bigFolder = nodes.find((n) => n.id === 'f0');
  const folderElement = { kind: 'node', accountId: ACCOUNT.accountId, node: bigFolder };
  let expandReads = 0;
  const expandMs = await timed(async () => {
    resetCounts(ss.counts, gs.counts);
    const children = provider.getChildren(folderElement);
    for (const child of children) {
      await provider.getTreeItem(child);
    }
    expandReads = ss.counts.get;
  });
  say('C1 expand folder (300 entities)', 'keychain reads (secrets.get)', expandReads);
  say('C1 expand folder (300 entities)', 'wall, median of 7', fmt(expandMs));
  if (hasFlagCache) {
    say('C1 flag refresh at mutation time', 'keychain reads (secrets.get)', populateReads);
    say('C1 flag refresh at mutation time', 'wall, median of 7', fmt(populateMs));
  }

  // ---- C3: repeated reads without a mutation ---------------------------------------
  const readsMs = await timed(async () => {
    resetCounts(gs.counts);
    for (let i = 0; i < 100; i += 1) {
      storage.getNodes(ACCOUNT.accountId);
      storage.getChildren(ACCOUNT.accountId, 'f3');
    }
  });
  say('C3 100× getNodes + getChildren, no mutation', 'wall, median of 7', fmt(readsMs));
  say(
    'C3 100× getNodes + getChildren, no mutation',
    'same array instance returned',
    storage.getNodes(ACCOUNT.accountId) === storage.getNodes(ACCOUNT.accountId) ? 'yes' : 'no',
  );

  // ---- C2: one filter keystroke rendered over 1000 entities ---------------------------
  // A DIFFERENT term per run: a keystroke is a new term, and a memo warm from the previous
  // run would measure "the same term rendered twice", which is not what typing does.
  let filterChildrenCalls = 0;
  let filterMementoGets = 0;
  let keystroke = 0;
  const filterMs = await timed(async () => {
    provider.setSearchQuery('');
    resetCounts(gs.counts);
    storageChildrenCalls.count = 0;
    keystroke += 1;
    provider.setSearchQuery(`ent-${keystroke}`);
    await renderPass(provider);
    filterChildrenCalls = storageChildrenCalls.count;
    filterMementoGets = gs.counts.get;
  });
  say('C2 one keystroke, render pass (1000 entities)', 'storage.getChildren calls', filterChildrenCalls);
  say('C2 one keystroke, render pass (1000 entities)', 'memento reads (globalState.get)', filterMementoGets);
  say('C2 one keystroke, render pass (1000 entities)', 'wall, median of 7', fmt(filterMs));

  // ---- C2: five keystrokes typed within 10 ms → how many tree refreshes fire ------------
  provider.setSearchQuery('');
  await new Promise((r) => setTimeout(r, 120));
  emitterFires.count = 0;
  for (const q of ['e', 'en', 'ent', 'ent-', 'ent-7']) {
    provider.setSearchQuery(q);
    await new Promise((r) => setTimeout(r, 2));
  }
  await new Promise((r) => setTimeout(r, 120));
  say('C2 five keystrokes within 10 ms', 'onDidChangeTreeData fires', emitterFires.count);
  provider.setSearchQuery('');
  await new Promise((r) => setTimeout(r, 120));

  // ---- C4: what an idle sync cycle reads to build the local snapshot -------------------
  let snapshotReads = 0;
  const snapshotMs = await timed(async () => {
    resetCounts(ss.counts);
    await storage.getSnapshot(ACCOUNT.accountId);
    snapshotReads = ss.counts.get;
  });
  // What a cycle that MERGES pays to build the local snapshot; an idle cycle used to pay it
  // too. Whether the build can skip it is `storage.changeToken` (the decision itself is pure and
  // unit-tested in syncIdle.test.ts, so it is reported here as present/absent, not re-measured).
  say('C4 getSnapshot (a merging cycle\'s local read)', 'keychain reads (secrets.get)', snapshotReads);
  say('C4 getSnapshot (a merging cycle\'s local read)', 'wall, median of 7', fmt(snapshotMs));
  say(
    'C4 idle cycle skips getSnapshot + merge',
    'storage.changeToken present',
    typeof storage.changeToken === 'function' ? 'yes (0 keychain reads when idle)' : 'no (pays the line above every cycle)',
  );

  // ---- print --------------------------------------------------------------------------
  const w0 = Math.max(...rows.map((r) => r[0].length));
  const w1 = Math.max(...rows.map((r) => r[1].length));
  console.log(`tree-perf-bench — ${ENTITIES} entities, ${FOLDERS} folders, ${BIG_FOLDER_SIZE} in the first folder`);
  console.log(`${'scenario'.padEnd(w0)} | ${'metric'.padEnd(w1)} | value`);
  console.log(`${'-'.repeat(w0)}-|-${'-'.repeat(w1)}-|------`);
  for (const [s, m, v] of rows) {
    console.log(`${s.padEnd(w0)} | ${m.padEnd(w1)} | ${v}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
