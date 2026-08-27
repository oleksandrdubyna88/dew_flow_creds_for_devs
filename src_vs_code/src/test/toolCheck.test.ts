import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { KNOWN_TOOLS, installRecipe } from '../toolCheck';
import { sshClientPresent } from '../sshProgram';

/**
 * T20 — the missing-tool recipes. What matters: every tool a launcher can miss has an answer
 * for both platforms, the Linux answer opens with the owner's mandated update-upgrade, and an
 * unknown tool is a clean undefined rather than a guess.
 */

test('every launcher-reachable tool has a recipe on both platforms', () => {
  // The launchers: ssh (connect), wg-quick/openvpn (VPN), psql/mysql/sqlcmd/mongosh (DB CLIs),
  // git (git-sync, config materialisation checks).
  for (const tool of ['ssh', 'wg-quick', 'openvpn', 'psql', 'mysql', 'sqlcmd', 'mongosh', 'git']) {
    assert.ok(KNOWN_TOOLS.includes(tool), `${tool} has no recipe`);
    for (const platform of ['win32', 'linux'] as const) {
      const recipe = installRecipe(tool, platform, true);
      assert.ok(recipe !== undefined && recipe.command.length > 0, `${tool} on ${platform}`);
      assert.ok(recipe.display.length > 0, `${tool} has no display name`);
    }
  }
});

test('the Linux recipe opens with update-upgrade — the owner said so, in as many words', () => {
  const recipe = installRecipe('ssh', 'linux', true);
  assert.ok(
    recipe?.command.startsWith('sudo apt update && sudo apt upgrade -y && '),
    `got: ${recipe?.command}`,
  );
});

test('a machine without apt gets the command named, with an honest adaptation note', () => {
  const recipe = installRecipe('openvpn', 'linux', false);
  assert.ok(recipe !== undefined);
  assert.ok(!recipe.command.includes('apt update'), 'no apt preamble where there is no apt');
  assert.match(recipe.note, /no apt/);
});

test('an unknown tool is undefined, never an invented recipe', () => {
  assert.equal(installRecipe('kubectl', 'linux', true), undefined);
});

test('the Windows ssh recipe is the capability install and says it needs admin', () => {
  const recipe = installRecipe('ssh', 'win32', false);
  assert.match(recipe?.command ?? '', /Add-WindowsCapability/);
  assert.match(recipe?.note ?? '', /administrator/i);
});

test('the ssh presence probe: built-in wins on Windows; PATH decides elsewhere', () => {
  // Built-in present: yes regardless of PATH.
  assert.equal(
    sshClientPresent('win32', { PATH: '' }, (p: string) => p.includes('System32')),
    true,
  );
  // Nothing anywhere: no.
  assert.equal(sshClientPresent('win32', { PATH: 'C:\bin' }, () => false), false);
  // Linux: PATH decides.
  assert.equal(
    sshClientPresent('linux', { PATH: '/usr/bin:/bin' }, (p: string) => p === '/usr/bin/ssh'),
    true,
  );
  assert.equal(sshClientPresent('linux', { PATH: '/usr/bin' }, () => false), false);
});
