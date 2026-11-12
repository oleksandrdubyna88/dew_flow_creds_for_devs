import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { withoutComments } from './importWalk';

/**
 * A structural guard: nothing joins a name into the key directory by hand.
 *
 * <p>`keys/&lt;pid&gt;/` holds decrypted private keys, VPN configs, `known_hosts` files and
 * executable script bodies. Every name written there is built from vault data — an entity id, or
 * something derived from one — and import and restore write an envelope's nodes with their own
 * ids, so an id of `x/../../../../evil` resolves clean out of the directory.</p>
 *
 * <p><b>Sanitising at each call site was tried and was not enough.</b> Four sites were fixed by
 * hand; enumerating them properly afterwards found two more — `agent-script-${entityId}` and
 * `run-${details.id}` — both of which write a file with mode 0700 and then execute it. That is
 * the fourth time in this codebase a protective measure has been applied to some of the places
 * that need it, so this one is enforced rather than remembered.</p>
 *
 * <p>The rule is narrow enough to be free of false alarms: `materializedKeyPath` is the only
 * thing allowed to join into that directory, and it sanitises. Everything else may ask for the
 * directory itself (to purge it, or to create it) but not for a path inside it.</p>
 */

const SRC = path.join(__dirname, '..', '..', 'src');

/** `materializedKeys.ts` defines the directory and the one sanctioned way into it. */
const OWNER = 'materializedKeys.ts';

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'test' ? [] : sourceFiles(full);
    }
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

interface Site {
  file: string;
  line: number;
  text: string;
}

/**
 * Every place that builds a path INSIDE the key directory.
 *
 * <p>Matched across lines, because the offending sites are formatted over three: the `path.join(`
 * and its `materializedKeysDir(` argument routinely sit on separate lines, and a line-by-line
 * scan would have reported none of the six that existed when this was written.</p>
 */
function joinSites(): Site[] {
  return sourceFiles(SRC).flatMap((full) => {
    const source = fs.readFileSync(full, 'utf8');
    const pattern = /path\.join\(\s*materializedKeysDir\(/g;
    const found: Site[] = [];
    for (let match = pattern.exec(source); match !== null; match = pattern.exec(source)) {
      const before = source.slice(0, match.index);
      found.push({
        file: path.basename(full),
        line: before.split('\n').length,
        text: source.slice(match.index, match.index + 60).split('\n')[0],
      });
    }
    return found;
  });
}

test('nothing builds a path inside the key directory by hand', () => {
  // Use `materializedKeyPath(storageDir, name)`, which sanitises the name. A name that reaches
  // `path.join` unsanitised writes a private key — or an executable script — wherever it says.
  const offenders = joinSites().filter((site) => site.file !== OWNER);

  assert.deepEqual(
    offenders.map((s) => `${s.file}:${s.line}  ${s.text}`),
    [],
    'Use materializedKeyPath() from materializedKeys.ts instead of path.join(materializedKeysDir(…)).',
  );
});

test('the guard would notice — it finds the sanctioned join in the owning module', () => {
  // A scan that matched nothing anywhere would pass this suite while enforcing nothing, which
  // is the failure mode of every structural test. `materializedKeys.ts` contains exactly the
  // pattern being searched for, so finding it there proves the search works.
  const inOwner = joinSites().filter((site) => site.file === OWNER);

  assert.ok(inOwner.length > 0, 'the pattern matched nothing at all — the scan is broken');
});

/**
 * The files that may name `materializePrivateKey` (the writer of a key file whose name is built from an id), and why. A key file of
 * an agent's call is written by `materializeCallKey`, whose name is random (rule C). A new caller of the writer needs a decision in
 * the plan, not a new name on this list.
 *
 * <p>What the scan does NOT find: a name that is built at run time (`mod['materialize' + …]`); a new call inside a file of this
 * list; and the other writers that name a file from an id through `materializedKeyPath` (`known_hosts-<id>`, `agent-script-<id>`).</p>
 */
const WRITER_LIST: Readonly<Record<string, string>> = {
  'keyInstaller.ts': 'the writer itself, and `materializeCallKey`, which gives it a random name',
  'sshSession.ts': "the person's Connect and the person's roads: the path goes into the person's terminal or a dialog, no agent reads it",
  'transportFactory.ts': "the deploy key of the vault's git sync: no action of an agent imports this module",
};

interface WriterSite extends Site {
  call: boolean;
}

/** Every identifier `materializePrivateKey` in the source of the product, comments apart, with the line of the source. */
function writerSites(): WriterSite[] {
  return sourceFiles(SRC).flatMap((full) => {
    const source = fs.readFileSync(full, 'utf8');
    const code = withoutComments(source);
    const file = path.relative(SRC, full).split(path.sep).join('/');
    return [...code.matchAll(/\bmaterializePrivateKey\b/g)].map((match) => {
      const at = match.index ?? 0;
      const line = code.slice(0, at).split('\n').length;
      return {
        file,
        line,
        text: (source.split('\n')[line - 1] ?? '').trim(),
        call: /^\s*\(/.test(code.slice(at + match[0].length)),
      };
    });
  });
}

test('only the written files name materializePrivateKey: a key file of a call is written by materializeCallKey', () => {
  const offenders = writerSites().filter((site) => !Object.hasOwn(WRITER_LIST, site.file));

  assert.deepEqual(
    offenders.map((s) => `${s.file}:${s.line}  ${s.text}`),
    [],
    'A key file of a call is written with materializeCallKey() of keyInstaller.ts: its name holds no id of an entry (rule C). ' +
      'A new caller of materializePrivateKey needs a decision in the plan, not a new name on this list.',
  );
});

test('the scan of the writer would notice: the list is exactly three files, and the scan finds a call in each', () => {
  assert.deepEqual(Object.keys(WRITER_LIST).sort(), ['keyInstaller.ts', 'sshSession.ts', 'transportFactory.ts']);

  const sites = writerSites();
  for (const file of Object.keys(WRITER_LIST)) {
    assert.ok(
      sites.some((site) => site.file === file && site.call),
      `${file}: the scan found no call of materializePrivateKey — the scan is broken`,
    );
  }
});
