import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HELP_LANGUAGES, HelpArticle, bodyFor, helpArticle } from '../helpContent';

/**
 * Every language explains a rotation that lands while its entry is being protected
 * (`todo/PLAN_rotation_quarantine.md` §7): the tree's own words, which every translation keeps in
 * English because the row does, in the PIN article — and the agent surface says where such a value is.
 * `bodyFor` marks a MISSING translation, never a STALE one; this is the check for the stale one.
 */

/** The row's own words. */
const ROW = 'rotated password waiting';
/** The agent's word, as the answer says it. */
const WORD = 'quarantined';
/** The command's name — kept in English by every translation, as every command name is (the security review, finding 7b). */
const BURN = 'Burn Now…';

function article(id: string): HelpArticle {
  const found = helpArticle(id);
  assert.ok(found !== undefined, `there is no help article called ${id}`);
  return found;
}

for (const language of HELP_LANGUAGES) {
  test(`the ${language} help explains a rotated value waiting for the entry's PIN, and the agent surface names its word`, () => {
    const pin = bodyFor(article('entity-pin'), language);
    const agents = bodyFor(article('agent-surface'), language);

    assert.equal(pin.fallback, false, 'a real translation, not English standing in for one');
    assert.ok(pin.body.usage.includes(ROW), `the ${language} PIN article does not explain a waiting rotation — a stale translation reads as a complete one`);
    assert.ok(pin.body.usage.includes(BURN), `the ${language} PIN article does not name Burn Now among the permanent deletions that lose a waiting value`);
    assert.ok(agents.body.usage.includes(WORD), `the ${language} agent article does not say where a rotation refused by a PIN is`);
  });
}
