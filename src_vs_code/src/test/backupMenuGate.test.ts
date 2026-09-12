import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { isCorpAdmin } from '../corpPolicy';
import { OrgRecoveryAccess, accountContextValue } from '../orgRecoveryAccess';

/**
 * Who may administer this server, said in three places, pinned to agree.
 *
 * <p>The server decides: `RequireAdminAsync` accepts a recovery officer or a registry admin, and
 * every backup route is behind it — and since 2026-09-12 so is `GET /api/metrics`. The extension
 * then says the same thing TWICE — in each menu's `when` clause, which matches tree
 * `contextValue`s, and in the watch, which polls only where `policy.isAdmin`. A review round
 * pointed out that adding a fourth admin-like role means editing two client lists by hand, in
 * unrelated layers, and that they would drift.</p>
 *
 * <p><b>The check runs over a TABLE of commands, not once per command.</b> The metrics entry joined
 * on the day its gate opened, and adding a second copy of the assertion by hand would have been
 * exactly the thing this file warns about — two lists kept in step by somebody remembering to.</p>
 *
 * <p>It cannot check the SERVER's half — that is C# — so the `.http` suite's admin matrix remains
 * the thing that pins that end.</p>
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

/**
 * Every command gated on "does this person administer the server", and the row it is gated ON.
 *
 * <p>A table rather than a test each, so a command added to this family is one line here and a
 * command whose clause drifts is a red test — the copy-paste alternative is what the header warns
 * about. `orgBackup` is contributed TWICE (the account row and the Server section's Backup row), so
 * the clause is looked up by BOTH command and the row kind it names.</p>
 */
const ACCOUNT_ROW_COMMANDS: readonly string[] = [
  'credSshManager.orgBackup',
  // Officer-only until 2026-09-12, when `/api/metrics` became RequireAdminAsync. An admin who is
  // not on the recovery roster had no menu entry at all, for a page they were entitled to.
  'credSshManager.serverMetrics',
];

/** The `viewItem == X` tokens of one clause — exact tokens, never a substring search. */
function namedRows(clause: string): Set<string> {
  return new Set([...clause.matchAll(/viewItem\s*==\s*([A-Za-z-]+)/g)].map((m) => m[1]));
}

/** The clause a command carries on an ACCOUNT row (`orgBackup` has a second one, on serverBackup). */
function accountRowClause(command: string): string | undefined {
  return manifest.contributes.menus['view/item/context']
    .find((entry) => entry.command === command && (entry.when ?? '').includes('account-corp'))?.when;
}

for (const command of ACCOUNT_ROW_COMMANDS) {
  test(`${command} is offered to exactly the rows the watch would poll`, () => {
    const clause = accountRowClause(command);
    assert.ok(clause !== undefined, 'the command is contributed to the tree row menu');

    // Every corporate contextValue is a PREFIX of the next one up (`account` ⊂ `account-corp` ⊂
    // `account-corpAdmin`), which is what lets one clause cover every corporate state — and what
    // makes `includes` say yes to all of them. Hence exact tokens.
    const named = namedRows(clause);
    const offered = EVERY_ACCESS.filter((access) => named.has(accountContextValue(access)));
    const polled = EVERY_ACCESS.filter((access) => isCorpAdmin(FACTS[access]));

    assert.deepEqual(
      [...offered].sort(),
      [...polled].sort(),
      'a row that is offered the command but never polled is a nag that cannot fire; a row that is '
      + 'polled but never offered it is a nag with nothing to press',
    );
  });
}

test('the Server section’s Backup row offers the SAME command, never a new one', () => {
  // No registerCommand, no new id, nothing for commandsRegistered.test.ts or helpCoverage.test.ts
  // to demand an article for. The row is a second place to press what already exists.
  const rowClause = manifest.contributes.menus['view/item/context']
    .find((entry) => entry.command === 'credSshManager.orgBackup'
      && (entry.when ?? '').includes('serverBackup'))?.when;

  assert.ok(rowClause !== undefined, 'the Backup row has the backup command in its menu');
  assert.deepEqual([...namedRows(rowClause)], ['serverBackup']);
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
