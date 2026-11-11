import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { SECOND_ENTRY_REFUSED, SecondEntry, agentRefusal } from '../agentNaming';

/**
 * The one chooser of rule B (`research/PLAN_agent_refusal_names_unlisted_entry.md` section 2.5): a refusal about a second entry reads as the
 * fixed sentence unless the agent may view that entry, and the journal line names the RELATION and never the entry. A plain import: the
 * module takes the question "may the agent view this id" as a function and imports nothing.
 */

/** The journal line of each relation. A third relation does not compile until this table has its line. */
const LINES: Readonly<Record<SecondEntry['relation'], string>> = {
  'linked key': 'prod: its linked key entry did not open for an automatic use (a PIN of its own, or a damaged value) (the agent was told only that another entry stopped the call)',
  'jump host': 'prod: a jump host in its chain has an address that is not a valid host (the agent was told only that another entry stopped the call)',
};

const MESSAGE = 'M with MARK-x';
const RELATIONS = Object.keys(LINES) as SecondEntry['relation'][];

test('B7: the fixed sentence names the addressed entry only, and says where the reason is', () => {
  assert.equal(
    SECOND_ENTRY_REFUSED('prod'),
    '"prod" could not be used: another entry that it needs (a linked key or a jump host) stopped the call, and that entry is not visible to agents. The reason is in the agent journal on this computer.',
  );
});

test('B7: a second entry the agent may NOT view is replaced by the fixed sentence, with the line of its relation and neither its id nor its message', () => {
  for (const relation of RELATIONS) {
    const asked: string[] = [];
    const said = agentRefusal({ message: MESSAGE, second: { id: 'x-9', relation } }, 'prod', (id) => (asked.push(id), false));
    assert.deepEqual(said, { message: SECOND_ENTRY_REFUSED('prod'), note: LINES[relation] }, relation);
    assert.deepEqual(asked, ['x-9'], 'it asked about the second entry');
    assert.deepEqual(['x-9', 'MARK-x'].filter((text) => String(said.note).includes(text)), [], 'the note holds neither the id nor the name');
  }
});

test('B7: a second entry the agent MAY view keeps the message and writes no note', () => {
  for (const relation of RELATIONS) {
    assert.deepEqual(agentRefusal({ message: MESSAGE, second: { id: 'x-9', relation } }, 'prod', () => true), { message: MESSAGE }, relation);
  }
});

test('B7: a refusal with no second entry is the message, and nobody was asked', () => {
  let asked = 0;
  assert.deepEqual(agentRefusal({ message: MESSAGE }, 'prod', () => (asked += 1, false)), { message: MESSAGE });
  assert.equal(asked, 0);
});

test('B7: the module imports nothing', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', 'agentNaming.ts'), 'utf8');
  assert.ok(!/^\s*import\b/m.test(source) && !/\brequire\(/.test(source), 'agentNaming.ts has an import');
  assert.ok(/^export function agentRefusal\(/m.test(source), 'the scan still finds the chooser');
});
