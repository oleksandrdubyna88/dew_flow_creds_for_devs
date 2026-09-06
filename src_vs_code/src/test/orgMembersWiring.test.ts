import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

/**
 * The corporate-roles half is wired, and a scan says so.
 *
 * <p>This repository has shipped a corporate feature whose resolver was never assigned, with a
 * green suite (`orgRecoveryWiring.test.ts` tells the story). The unit tests here supply their own
 * hosts — a `refreshOrgPolicy` that nobody calls passes every one of them — so, exactly as that
 * file does, this checks that production code MAKES the calls, without caring what they do.</p>
 */

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');

function productionSources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'test' ? [] : productionSources(full);
    }
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/** Every production file that mentions `needle`, excluding the one that defines it. */
function callersOf(needle: string, definedIn: string): string[] {
  return productionSources(SRC)
    .filter((file) => path.basename(file) !== definedIn)
    .filter((file) => fs.readFileSync(file, 'utf8').includes(needle));
}

interface Manifest {
  contributes: {
    commands: { command: string }[];
    menus: Record<string, { command?: string; when?: string }[]>;
  };
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as Manifest;

test('the policy refresh has a production caller — otherwise the tree never learns a role', () => {
  // A file that IMPORTS the module and calls it. `host.refreshOrgPolicy(...)` in the commands
  // module is a call through a host field and passed the naive check while the readiness loop
  // still called nothing — watched on 2026-09-06, which is why the import is required.
  const wired = callersOf('refreshOrgPolicy(', 'orgPolicyRefresh.ts').filter((file) =>
    /from '\.\.?\/(?:.*\/)?orgPolicyRefresh'/.test(fs.readFileSync(file, 'utf8')),
  );
  assert.notDeepEqual(
    wired,
    [],
    'refreshOrgPolicy has no production caller — orgPolicy stays empty and every account is a member',
  );
});

test('the members client is actually resolved somewhere', () => {
  assert.notDeepEqual(
    callersOf('orgMembersFor(', 'transportFactory.ts'),
    [],
    'orgMembersFor has no production caller — the members client exists and is never built',
  );
});

test('both commands are registered, and the family is installed from activate', () => {
  const sources = productionSources(SRC).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  for (const id of ['credSshManager.setMemberRole', 'credSshManager.showMyRole']) {
    assert.match(sources, new RegExp(`register\\(\\s*'${id.replace('.', '\\.')}'`), `${id} is contributed but never registered`);
    assert.ok(manifest.contributes.commands.some((c) => c.command === id), `${id} is not in the manifest`);
  }
  assert.notDeepEqual(
    callersOf('registerOrgMemberCommands(', 'orgMemberCommands.ts'),
    [],
    'registerOrgMemberCommands is never called — both handlers are dead code',
  );
});

test('the admin-view row the menu is gated on is a value the tree actually assigns', () => {
  // A `when` clause matching a contextValue nothing produces is a menu entry that never appears
  // — the same failure as a command with no handler, one layer earlier.
  const gated = manifest.contributes.menus['view/item/context'].filter((m) => m.command === 'credSshManager.setMemberRole');
  assert.notEqual(gated.length, 0, 'Set Role… is in no menu');
  for (const entry of gated) {
    assert.match(entry.when ?? '', /viewItem == teamMember-adminView/);
  }
  assert.notDeepEqual(
    callersOf("'teamMember-adminView'", 'package.json'),
    [],
    'no production source assigns teamMember-adminView — the menu entry can never show',
  );
});

test('no Team-row entry is gated on the bare `teamMember` value — the admin view would lose it', () => {
  // An admin's colleague rows carry `teamMember-adminView`, so an entry contributed against
  // `viewItem == teamMember` exactly disappears for admins. Create Entity for… did, until this.
  const bare = manifest.contributes.menus['view/item/context']
    .filter((m) => /viewItem == teamMember(\s|$|&)/.test(m.when ?? ''))
    .map((m) => m.command);
  assert.deepEqual(bare, [], 'gate Team-row entries on viewItem =~ /^teamMember/ instead');
});

test('the policy page is gated on the corp prefix, so every enrolled account can read its own', () => {
  const gated = manifest.contributes.menus['view/item/context'].filter((m) => m.command === 'credSshManager.showMyRole');
  assert.notEqual(gated.length, 0, 'My Role and Policy… is in no menu');
  for (const entry of gated) {
    assert.match(entry.when ?? '', /viewItem =~ \/\^account-corp\//);
  }
});
