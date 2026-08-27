import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

/**
 * A security control that exists in source and is never called is worse than one that is
 * missing: the tests pass, the code reads correctly, and the review that finds it has to be
 * looking for absence rather than for a mistake.
 *
 * <p>Corporate recovery shipped with two of them. `pinOrgRecovery` had no caller, so the TOFU
 * pin was never written, `judgeOrgRecovery` answered `firstContact` forever and the
 * `keyChanged` / `rosterChanged` warnings were unreachable — a substituted organisation key
 * would have been re-sealed to with a reassuring message. And `SyncManager.resolveEscrow` was
 * never assigned, so no vault gained an escrow wrap at all. Both suites were green throughout,
 * because the unit tests supply those dependencies themselves.</p>
 *
 * <p>So this scans the source the way `commandsRegistered` scans the manifest: it does not care
 * what the call does, only that production code makes it. Cheap, and it fails the day somebody
 * removes the wiring in a refactor.</p>
 */

const SRC = path.join(__dirname, '..', '..', 'src');

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

test('the corporate-recovery TOFU pin is actually written by production code', () => {
  // Without a caller the pin store stays empty forever, so every judgement is `firstContact`
  // and no substitution of the organisation key can ever be detected.
  assert.notDeepEqual(
    callersOf('pinOrgRecovery(', 'orgRecoveryPinning.ts'),
    [],
    'pinOrgRecovery has no production caller — the org-key pin is never written',
  );
});

test('the sync cycle is actually given an escrow resolver', () => {
  // `SyncManager.escrowFor` short-circuits when `resolveEscrow` is undefined, so without an
  // assignment the whole enrolment path is dead code that tests exercise and users never reach.
  const assigned = productionSources(SRC).filter((file) =>
    // `[^=]` matters: without it this matched `this.resolveEscrow === undefined`, the very
    // short-circuit the assignment is missing FROM, and the test passed while the defect stood.
    /\.resolveEscrow\s*=[^=]/.test(fs.readFileSync(file, 'utf8')),
  );

  assert.notDeepEqual(assigned, [], 'nothing assigns resolveEscrow — no vault ever enrols');
});

test('the officers shown in the enrolment notice are supplied too', () => {
  // `escrowOfficers` defaults to an empty list, and the notice names them: "recoverable by your
  // organisation's officers ()" is a sentence that undermines the disclosure it exists for.
  const assigned = productionSources(SRC).filter((file) =>
    /\.escrowOfficers\s*=[^=]/.test(fs.readFileSync(file, 'utf8')),
  );

  assert.notDeepEqual(assigned, [], 'nothing assigns escrowOfficers — the notice would name nobody');
});
