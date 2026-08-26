import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { deadPidSubdirs } from '../keysPurge';
import { EntityMetadata } from '../types';

/**
 * Writing key material to disk — the one place the extension leaves a secret behind on
 * purpose (audit A3).
 *
 * <p>Two very different lifetimes meet in this file, and confusing them is the whole risk.
 * `materializePrivateKey` writes into the extension's own `keys/<pid>/`, which is purged on
 * activate and deactivate, so a decrypted key never outlives its session. `installKeyToSystem`
 * writes into `~/.ssh` and that copy is PERMANENT — untracked, never purged. So the install
 * path is gated behind a modal that has to say so, and the tests below hold it to that: no
 * confirmation, no file.</p>
 *
 * <p>The purge is pinned hardest, because it encodes a real defect. Materialized keys once
 * lived directly in `keys/`, shared by every window of the profile, so any window's activate
 * or dispose deleted a LIVE window's key out from under it — opening a second window was
 * enough. The per-pid split fixed it, and "a live window's directory survives another
 * window's purge" is that fix stated as a test.</p>
 */

type Installer = typeof import('../keyInstaller');

interface World {
  mod: Installer;
  home: string;
  storage: string;
  /** Modal answers, consumed in order. */
  answers: string[];
  warnings: string[];
  errors: string[];
  infos: string[];
}

function world(answers: string[] = []): World {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-home-'));
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-store-'));
  const w: World = {
    mod: undefined as never,
    home,
    storage,
    answers: [...answers],
    warnings: [],
    errors: [],
    infos: [],
  };
  w.mod = loadWithVscode<Installer>(
    '../keyInstaller',
    {
      window: {
        showWarningMessage: (m: string): Promise<string | undefined> => {
          w.warnings.push(m);
          return Promise.resolve(w.answers.shift());
        },
        showErrorMessage: (m: string): Promise<undefined> => {
          w.errors.push(m);
          return Promise.resolve(undefined);
        },
        showInformationMessage: (m: string): Promise<undefined> => {
          w.infos.push(m);
          return Promise.resolve(undefined);
        },
      },
    },
    // `~/.ssh` is a real directory belonging to whoever runs this suite. Redirecting homedir
    // is the only way to test the install path without writing into it.
    { 'node:os': { ...os, homedir: (): string => home } },
  );
  return w;
}

function cleanup(w: World): void {
  fs.rmSync(w.home, { recursive: true, force: true });
  fs.rmSync(w.storage, { recursive: true, force: true });
}

const entity = (name: string, publicKey?: string): EntityMetadata =>
  ({ id: 'e1', name, kind: 'sshkey', publicKey }) as EntityMetadata;

const sshFile = (w: World, name: string): string => path.join(w.home, '.ssh', name);

test('a materialized key lands under THIS window pid and gets a trailing newline', () => {
  // ssh refuses a key file whose last line has no newline, and the stored value often has none.
  const w = world();
  try {
    const keyPath = w.mod.materializePrivateKey(w.storage, 'ent-1', 'PRIVATE KEY BODY');

    assert.equal(path.basename(path.dirname(keyPath)), String(process.pid));
    assert.equal(fs.readFileSync(keyPath, 'utf8'), 'PRIVATE KEY BODY\n');
  } finally {
    cleanup(w);
  }
});

test('an already-terminated key is not given a SECOND newline', () => {
  const w = world();
  try {
    const keyPath = w.mod.materializePrivateKey(w.storage, 'ent-1', 'BODY\n');

    assert.equal(fs.readFileSync(keyPath, 'utf8'), 'BODY\n');
  } finally {
    cleanup(w);
  }
});

test('a VPN config is written under the NAME the tool needs, not the entity id', () => {
  // `wg-quick` takes the interface name from the file name, so `a1b2c3.key` would not come up.
  const w = world();
  try {
    const configPath = w.mod.materializeVpnConfig(w.storage, 'wg0.conf', '[Interface]');

    assert.equal(path.basename(configPath), 'wg0.conf');
    assert.equal(path.basename(path.dirname(configPath)), String(process.pid), 'and still purged');
  } finally {
    cleanup(w);
  }
});

test('the askpass script is written once and shared — it holds no secret', () => {
  const w = world();
  try {
    const a = w.mod.writeAskpassScriptFile(w.storage, process.platform);
    const b = w.mod.writeAskpassScriptFile(w.storage, process.platform);

    assert.equal(a, b, 'idempotent, so eight callers do not make eight files');
    assert.ok(!fs.readFileSync(a, 'utf8').includes('PRIVATE'), 'it names an env var, nothing more');
  } finally {
    cleanup(w);
  }
});

test('forgetting a key that is already gone is silent', () => {
  const w = world();
  try {
    assert.doesNotThrow(() => w.mod.forgetMaterializedKey(path.join(w.storage, 'not-there.key')));
  } finally {
    cleanup(w);
  }
});

test('a key is NOT installed to ~/.ssh without an explicit confirmation', async () => {
  // The dialog is the gate. Escaping it must leave the home directory exactly as it was.
  const w = world([]); // no answer: the modal is dismissed
  try {
    await w.mod.installKeyToSystem(entity('prod', 'ssh-ed25519 AAAA'), 'PRIVATE');

    assert.equal(fs.existsSync(path.join(w.home, '.ssh')), false, 'nothing was written');
  } finally {
    cleanup(w);
  }
});

test('the confirmation says the copy is PERMANENT, because every other one is not', async () => {
  const w = world(['Install']);
  try {
    await w.mod.installKeyToSystem(entity('prod', 'ssh-ed25519 AAAA'), 'PRIVATE');

    assert.match(w.warnings[0], /PERMANENT/);
    assert.match(w.warnings[0], /never purged/, 'and says what that means');
  } finally {
    cleanup(w);
  }
});

test('confirming writes both halves, and names the file to use with ssh -i', async () => {
  const w = world(['Install']);
  try {
    await w.mod.installKeyToSystem(entity('Prod Server', 'ssh-ed25519 AAAA'), 'PRIVATE');

    assert.equal(fs.readFileSync(sshFile(w, 'prod_server'), 'utf8'), 'PRIVATE\n');
    assert.equal(fs.readFileSync(sshFile(w, 'prod_server.pub'), 'utf8'), 'ssh-ed25519 AAAA\n');
    assert.match(w.infos[0], /ssh -i/);
  } finally {
    cleanup(w);
  }
});

test('an existing file is named in the warning BEFORE it is overwritten', async () => {
  // Overwriting somebody's id_ed25519 without saying so is the worst outcome this file has.
  const w = world(['Install']);
  try {
    fs.mkdirSync(path.join(w.home, '.ssh'), { recursive: true });
    fs.writeFileSync(sshFile(w, 'prod'), 'THEIR OWN KEY');

    await w.mod.installKeyToSystem(entity('prod'), 'MINE');

    assert.match(w.warnings[0], /OVERWRITES: prod/);
  } finally {
    cleanup(w);
  }
});

test('an entity with no key content is refused with an instruction, not a silent no-op', async () => {
  const w = world(['Install']);
  try {
    await w.mod.installKeyToSystem(entity('empty'), undefined);

    assert.match(w.warnings[0], /no stored key content/);
    assert.equal(fs.existsSync(path.join(w.home, '.ssh')), false);
  } finally {
    cleanup(w);
  }
});

test('removing an installed key deletes ONLY the files the install would have written', async () => {
  const w = world(['Delete']);
  try {
    fs.mkdirSync(path.join(w.home, '.ssh'), { recursive: true });
    fs.writeFileSync(sshFile(w, 'prod'), 'ours');
    fs.writeFileSync(sshFile(w, 'prod.pub'), 'ours');
    fs.writeFileSync(sshFile(w, 'id_ed25519'), 'THEIR OWN KEY');

    await w.mod.removeInstalledKey(entity('prod'));

    assert.equal(fs.existsSync(sshFile(w, 'prod')), false);
    assert.equal(fs.existsSync(sshFile(w, 'prod.pub')), false);
    assert.equal(fs.readFileSync(sshFile(w, 'id_ed25519'), 'utf8'), 'THEIR OWN KEY', 'untouched');
  } finally {
    cleanup(w);
  }
});

test('declining the delete keeps the files', async () => {
  const w = world([]);
  try {
    fs.mkdirSync(path.join(w.home, '.ssh'), { recursive: true });
    fs.writeFileSync(sshFile(w, 'prod'), 'ours');

    await w.mod.removeInstalledKey(entity('prod'));

    assert.equal(fs.existsSync(sshFile(w, 'prod')), true);
  } finally {
    cleanup(w);
  }
});

test('removing what was never installed says so instead of claiming success', async () => {
  const w = world(['Delete']);
  try {
    await w.mod.removeInstalledKey(entity('prod'));

    assert.match(w.infos[0], /Nothing to remove/);
  } finally {
    cleanup(w);
  }
});

test('a purge takes THIS window pid directory', () => {
  const w = world();
  try {
    const keyPath = w.mod.materializePrivateKey(w.storage, 'ent-1', 'PRIVATE');
    w.mod.purgeMaterializedKeys(w.storage);

    assert.equal(fs.existsSync(keyPath), false, 'decrypted material never outlives the session');
  } finally {
    cleanup(w);
  }
});

test('a purge NEVER touches a LIVE window directory — the defect this split exists for', () => {
  // Before the per-pid split, opening a second window deleted the first window's in-use key.
  // `process.ppid` is a real, running process that is not us — exactly the shape of another
  // open VS Code window — so its directory must survive our purge while a dead one does not.
  const w = world();
  try {
    const root = path.join(w.storage, 'keys');
    const otherLiveWindow = path.join(root, String(process.ppid));
    const crashedWindow = path.join(root, '999999'); // out of pid range: gone
    fs.mkdirSync(otherLiveWindow, { recursive: true });
    fs.mkdirSync(crashedWindow, { recursive: true });
    fs.writeFileSync(path.join(otherLiveWindow, 'in-use.key'), 'ANOTHER WINDOW LIVE KEY');
    const ownKey = w.mod.materializePrivateKey(w.storage, 'ent-1', 'MINE');

    w.mod.purgeMaterializedKeys(w.storage);

    assert.equal(fs.existsSync(ownKey), false, 'our own pid directory is purged');
    assert.equal(fs.existsSync(crashedWindow), false, 'and a crashed window is swept');
    assert.equal(
      fs.readFileSync(path.join(otherLiveWindow, 'in-use.key'), 'utf8'),
      'ANOTHER WINDOW LIVE KEY',
      'but a live window keeps the key it is using',
    );
  } finally {
    cleanup(w);
  }
});

test('a directory that is not a pid at all is left alone by the sweep', () => {
  // The sweep deletes by "the process is gone", so anything it cannot read as a pid must not
  // be guessed about — `keys/` is the extension's own directory, not a scratch area.
  const w = world();
  try {
    const root = path.join(w.storage, 'keys');
    fs.mkdirSync(path.join(root, 'not-a-pid'), { recursive: true });

    w.mod.purgeMaterializedKeys(w.storage);

    assert.equal(fs.existsSync(path.join(root, 'not-a-pid')), true);
  } finally {
    cleanup(w);
  }
});

test('purging a storage directory that does not exist yet is silent', () => {
  const w = world();
  try {
    assert.doesNotThrow(() => w.mod.purgeMaterializedKeys(path.join(w.storage, 'never-created')));
  } finally {
    cleanup(w);
  }
});

/**
 * The pure sweep decision, kept from this file's original form: which `keys/<pid>/`
 * subdirectories a purge may reclaim. `keysPurge.ts` holds it apart from `vscode` so the agent
 * broker can use it too, and the filesystem tests above drive the same rule end to end.
 */

test('only numeric subdirs of dead processes are swept', () => {
  const alive = new Set([100, 200]);

  const swept = deadPidSubdirs(['100', '200', '300', 'legacy.key', 'abc', '0'], (pid) =>
    alive.has(pid),
  );

  // 100/200 belong to live windows — never touched. 300 is a dead window's leftovers.
  // legacy.key/abc are not pid dirs; 0 is not a real pid.
  assert.deepEqual(swept, ['300']);
});

test('a live window keeps its directory even when it is the only one', () => {
  assert.deepEqual(
    deadPidSubdirs(['4242'], () => true),
    [],
  );
});

test('everything is swept when nothing is alive', () => {
  assert.deepEqual(
    deadPidSubdirs(['1', '2', '3'], () => false),
    ['1', '2', '3'],
  );
});

/**
 * Path traversal through an entity id.
 *
 * <p>These functions build a file name from an entity id or a caller-supplied name, and both
 * arrive from the vault. A share cannot reach them — `shareInbox` gives every accepted entry a
 * fresh local id, deliberately — but **import and restore write the envelope's nodes with their
 * own ids**, so a crafted backup a person is talked into importing, or a sync location an
 * attacker can write to, puts an arbitrary id into the tree. Connecting to that entity then
 * writes its private key wherever the id says.</p>
 *
 * <p>`vpnConfigFileName` already sanitises for exactly this reason. These did not — the same
 * "the measure exists, applied at one of the sites" shape this repository keeps producing.</p>
 */

const TRAVERSAL = 'x/../../../../evil';

test('a traversing entity id cannot write a key outside the keys directory', () => {
  const w = world();
  try {
    const keyPath = w.mod.materializePrivateKey(w.storage, TRAVERSAL, 'PRIVATE KEY BODY');

    assert.ok(
      path.resolve(keyPath).startsWith(path.resolve(w.storage)),
      `the key escaped its directory: ${keyPath}`,
    );
  } finally {
    cleanup(w);
  }
});

test('a traversing VPN file name cannot write a config outside it either', () => {
  const w = world();
  try {
    const configPath = w.mod.materializeVpnConfig(w.storage, `${TRAVERSAL}.conf`, '[Interface]');

    assert.ok(
      path.resolve(configPath).startsWith(path.resolve(w.storage)),
      `the config escaped its directory: ${configPath}`,
    );
  } finally {
    cleanup(w);
  }
});

test('sanitising the name still keeps two different ids apart', () => {
  // A sanitiser that collapsed everything to one name would make two entities overwrite each
  // other's key — a connection using the wrong credential, which is worse than the traversal.
  const w = world();
  try {
    const first = w.mod.materializePrivateKey(w.storage, 'ent-a/../b', 'A');
    const second = w.mod.materializePrivateKey(w.storage, 'ent-a/../c', 'B');

    assert.notEqual(first, second);
    assert.equal(fs.readFileSync(first, 'utf8'), 'A\n', 'and neither overwrote the other');
  } finally {
    cleanup(w);
  }
});

test('an ordinary uuid is left exactly as it is', () => {
  // The sanitiser must not rewrite the normal case: the file name is how a purge and a wipe
  // find the file again.
  const w = world();
  try {
    const keyPath = w.mod.materializePrivateKey(w.storage, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'K');

    assert.equal(path.basename(keyPath), 'a1b2c3d4-e5f6-7890-abcd-ef1234567890.key');
  } finally {
    cleanup(w);
  }
});
