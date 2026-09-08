import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { isCorpAdmin } from '../corpPolicy';
import { OrgRecoveryAccess, accountContextValue } from '../orgRecoveryAccess';

/**
 * Who may back the server up, said in three places, pinned to agree.
 *
 * <p>The server decides: `RequireAdminAsync` accepts a recovery officer or a registry admin, and
 * every backup route is behind it. The extension then says the same thing TWICE — in the menu's
 * `when` clause, which matches tree `contextValue`s, and in the watch, which polls only where
 * `policy.isAdmin`. A review round pointed out that adding a fourth admin-like role means editing
 * two client lists by hand, in unrelated layers, and that they would drift.</p>
 *
 * <p>They agree today, and this is what makes drifting a red test rather than a feature that is
 * silently missing for whoever the new role belongs to. It cannot check the SERVER's half — that is
 * C# — so the `.http` suite's admin matrix remains the thing that pins that end.</p>
 */

const ROOT = path.join(__dirname, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
  contributes: { menus: Record<string, Array<{ command: string; when?: string }>> };
};

/** Every corporate standing a tree row can be in. */
const EVERY_ACCESS: readonly OrgRecoveryAccess[] = ['officer', 'admin', 'dev', 'enrolled', 'none'];

/** What `orgAccessWithRole` produced that standing FROM — the same two facts the server reads. */
const FACTS: Readonly<Record<OrgRecoveryAccess, { role: string; isOfficer: boolean }>> = {
  officer: { role: '', isOfficer: true },
  admin: { role: 'admin', isOfficer: false },
  dev: { role: 'dev', isOfficer: false },
  enrolled: { role: 'member', isOfficer: false },
  none: { role: '', isOfficer: false },
};

test('the menu offers Server Backup to exactly the rows the watch would poll', () => {
  const clause = manifest.contributes.menus['view/item/context']
    .find((entry) => entry.command === 'credSshManager.orgBackup')?.when;
  assert.ok(clause !== undefined, 'the command is contributed to the tree row menu');

  // The exact `viewItem == X` tokens, not a substring search: every corporate contextValue is a
  // PREFIX of the next one up (`account` ⊂ `account-corp` ⊂ `account-corpAdmin`), which is what lets
  // one clause cover every corporate state — and what makes `includes` say yes to all of them.
  const named = new Set([...clause.matchAll(/viewItem\s*==\s*([A-Za-z-]+)/g)].map((m) => m[1]));
  const offered = EVERY_ACCESS.filter((access) => named.has(accountContextValue(access)));
  const polled = EVERY_ACCESS.filter((access) => isCorpAdmin(FACTS[access]));

  assert.deepEqual(
    [...offered].sort(),
    [...polled].sort(),
    'a row that is offered the tab but never polled is a nag that cannot fire; a row that is polled '
    + 'but never offered the tab is a nag with nothing to press',
  );
});

test('and that set is the officer and the admin — not everybody enrolled', () => {
  // Stated as a literal too, so a change that broke BOTH lists in the same direction still fails.
  assert.deepEqual(EVERY_ACCESS.filter((access) => isCorpAdmin(FACTS[access])), ['officer', 'admin']);
});

test('the officer row is named explicitly, because its contextValue is not the admin one', () => {
  // The trap this exists for: an officer passes RequireAdmin on the SERVER, while their row carries
  // `account-corpOfficer` rather than `account-corpAdmin`. Gating the menu on the admin value alone
  // would have hidden the feature from exactly the people who administer unconditionally.
  assert.notEqual(accountContextValue('officer'), accountContextValue('admin'));
});
