import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { SHUFFLE_CODES, ShuffleCode, shuffleTokens } from '../shuffle';
import { phraseColumns } from '../phraseLayout';
import { RowOrder, displayed } from '../rowFlip';
import { wovenPictureTokens } from '../wovenPicture';

/**
 * The colours of the stored column, and the one thing they must never do: disagree with the two
 * rows printed above them.
 *
 * <p>Every test here asserts by MEMBERSHIP — is this token one of the tokens of the row it claims
 * to be in — rather than by counting tags. A count passes for a colouring that is exactly backwards,
 * which is the failure this module is built to avoid.</p>
 */

const ORDERS: readonly RowOrder[] = ['as-read', 'swapped'];

/** Sentinel tokens, distinct per row, so a token can be traced to the row it belongs to. */
const MINE = ['m1', 'm2', 'm3', 'm4'];
const OTHER = ['o1', 'o2', 'o3', 'o4'];

/** What the two rows SHOW, for a pair the arithmetic produced as (MINE, OTHER). */
const rowsFor = (order: RowOrder) => displayed({ first: MINE, second: OTHER }, order);

/**
 * Every painted token is IN the row it claims — the one assertion all of this is about.
 *
 * <p>Its own function so the loops that drive it stay inside the complexity ceiling, and so the
 * claim is written once: a count of tags passes for a colouring that is exactly backwards.</p>
 */
function assertRowsHold(
  painted: readonly { readonly text: string; readonly side: 'first' | 'second' }[],
  rows: { readonly first: readonly string[]; readonly second: readonly string[] },
  where: string,
): void {
  for (const token of painted) {
    const claimed = token.side === 'first' ? rows.first : rows.second;
    assert.ok(
      claimed.includes(token.text),
      `${where}: ${token.text} is painted as the ${token.side} row, which does not hold it`,
    );
  }
}

test('every stored token is coloured by the row it is SHOWN in, under both orders and every method', () => {
  for (const code of SHUFFLE_CODES) {
    for (const order of ORDERS) {
      const stored = shuffleTokens(MINE, OTHER, code);
      const rows = rowsFor(order);

      const painted = wovenPictureTokens(stored, code, order);

      assert.equal(painted.length, stored.length, `${code}/${order}: one token painted per stored token`);
      assert.deepEqual(
        painted.map((token) => token.text),
        [...stored],
        `${code}/${order}: the tokens are the stored ones, in order`,
      );
      assertRowsHold(painted, rows, `${code}/${order}`);
    }
  }
});

/**
 * The trap this module exists for.
 *
 * <p>Under `horizontal` the two woven COLUMNS are not the two rows — each column is half of each
 * phrase. A picture coloured straight from `Slot.side` contradicts the rows beneath it for every
 * horizontal record, and nothing on screen says so; the person simply reads the wrong colour and
 * copies the wrong row. The rows here are built the way the real weave builds them, so a naive
 * colouring fails this and only this.</p>
 */
test('a horizontal phrase is coloured by its ROWS, not by its woven columns', () => {
  const mine = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];
  const other = ['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis'];

  // The weave happened ONCE, at save time, over the arithmetic's pair. The display order is a
  // view-time decision and cannot reach back into what is stored — so the fixture is built from
  // (mine, other) whatever the rows will later show.
  const columns = phraseColumns(mine, other, 'horizontal');

  for (const code of SHUFFLE_CODES) {
    for (const order of ORDERS) {
      const stored = shuffleTokens(columns.first, columns.secondColumn, code);
      const rows = displayed({ first: mine, second: other }, order);

      const painted = wovenPictureTokens(stored, code, order, 'horizontal');

      assertRowsHold(painted, rows, `${code}/${order}`);
    }
  }

  // And the fixture is a genuine horizontal weave — half of each phrase in the first column.
  // Without this the loop above could pass over a record horizontal never rearranged, proving
  // nothing about the layout at all.
  assert.ok(
    columns.first.includes(mine[0] as string) && columns.first.includes(other[0] as string),
    'the first woven column holds half of each phrase, which is what horizontal means',
  );
});

test('the layout defaults to vertical, which is the password’s case', () => {
  const stored = shuffleTokens([...'hunter22'], [...'x7yq3mza'], SHUFFLE_CODES[5] as ShuffleCode);

  const defaulted = wovenPictureTokens(stored, SHUFFLE_CODES[5] as ShuffleCode, 'as-read');
  const explicit = wovenPictureTokens(stored, SHUFFLE_CODES[5] as ShuffleCode, 'as-read', 'vertical');

  assert.deepEqual(defaulted, explicit, 'a password passes no layout and must not have to');
});

test('the picture holds nothing but the stored tokens and a row tag', () => {
  const stored = shuffleTokens(MINE, OTHER, SHUFFLE_CODES[0] as ShuffleCode);

  const painted = wovenPictureTokens(stored, SHUFFLE_CODES[0] as ShuffleCode, 'swapped');

  assert.deepEqual(
    [...painted].map((token) => token.text).sort(),
    [...stored].sort(),
    'exactly the stored tokens, no more and no fewer',
  );
  for (const token of painted) {
    assert.deepEqual(Object.keys(token).sort(), ['side', 'text'], 'and nothing else rides along');
  }
  assert.ok(!/real|decoy/i.test(JSON.stringify(painted)));
});

/**
 * A structural claim, with the companion that keeps it honest: a scan asserting an ABSENCE passes
 * for ever once the thing it scans moves. The second assertion proves the scan still finds imports
 * that are there.
 */
test('the module cannot name a value’s truth — it imports neither reassembly nor the weaver', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', 'wovenPicture.ts'), 'utf8');
  const imports = source.slice(0, source.indexOf('export function'));

  assert.ok(!/from '\.\/phraseReassembly'/.test(imports), 'reassembly knows which half is real');
  assert.ok(!/from '\.\/wovenSecret'/.test(imports), 'and so does the weaver');
  assert.ok(/from '\.\/shuffle'/.test(imports), 'the scan still finds an import that IS there');
  assert.ok(/from '\.\/phraseLayout'/.test(imports), 'and the second one');
});
