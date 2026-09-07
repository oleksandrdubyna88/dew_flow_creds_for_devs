import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesTerms, searchTerms } from '../treeSearch';
import { matchingTeamMembers, teamMemberHaystack } from '../teamSearch';

/**
 * The Team filter used to look in the email and nothing else, while the row beside it showed the
 * provider, the role and up to three project names — so a project name a person could READ on
 * screen matched nobody. These are the guarantees of what it looks in now.
 */

const FULL = {
  email: 'Boris@Corp.com',
  provider: 'microsoft',
  role: 'dev',
  projectNames: ['Atlas', 'Borealis', 'Cygnus'],
};

function matches(facts: Parameters<typeof teamMemberHaystack>[0], query: string): boolean {
  return matchesTerms(teamMemberHaystack(facts), searchTerms(query));
}

test('a project name the row shows now finds the row', () => {
  assert.ok(matches(FULL, 'atlas'));
  assert.ok(matches(FULL, 'CYGNUS'), 'and case is not a fact about a person');
});

test('the role and the provider find it too', () => {
  assert.ok(matches(FULL, 'dev'));
  assert.ok(matches(FULL, 'microsoft'));
});

test('the email still finds it, whole or in part', () => {
  assert.ok(matches(FULL, 'boris'));
  assert.ok(matches(FULL, 'boris@corp.com'));
});

test('two terms are ANDed, as everywhere else in the tree', () => {
  assert.ok(matches(FULL, 'boris atlas'));
  assert.equal(matches(FULL, 'boris denebola'), false);
});

test('a colleague on none of it is not found by somebody else\'s facts', () => {
  const bare = { email: 'anna@corp.com', provider: 'google' };
  assert.equal(matches(bare, 'atlas'), false, 'a project she is not on must not match her row');
  assert.equal(matches(bare, 'dev'), false);
  assert.ok(matches(bare, 'anna'));
});

test('fields are separated, so a term spanning two of them matches neither', () => {
  // Concatenated, `anna@corp.comgoogle` would match a term belonging to no field at all.
  assert.equal(matches({ email: 'anna@corp.com', provider: 'google' }, 'comgoogle'), false);
});

test('an absent role and an unnamed project cost nothing', () => {
  // A project id the client could not resolve contributes NO text — the row shows a count for it,
  // and matching an id nobody can read would be matching a fact the person cannot see.
  const partial = { email: 'anna@corp.com', provider: 'google', role: undefined, projectNames: [undefined, 'Atlas'] };
  assert.equal(teamMemberHaystack(partial), 'anna@corp.com google atlas');
  assert.ok(matches(partial, 'atlas'));
});

test('a colleague with nothing but an address yields exactly that address', () => {
  assert.equal(teamMemberHaystack({ email: 'anna@corp.com' }), 'anna@corp.com');
});

test('the filter builds the project map ONCE, not once per colleague', () => {
  // On every keystroke, for every colleague: a domain of 500 people against 200 projects was
  // 100,000 map insertions per character, on the thread that draws the tree.
  let reads = 0;
  const projects = new Proxy([{ id: 'p1', name: 'Atlas' }], {
    get(target, key, receiver) {
      if (key === 'map') {
        reads += 1;
      }
      return Reflect.get(target, key, receiver);
    },
  }) as unknown as Parameters<typeof matchingTeamMembers>[2]['projects'];
  const members = ['a', 'b', 'c', 'd'].map((id) => ({
    account: { accountId: id, email: `${id}@corp.com`, provider: 'microsoft' },
    location: 'https://vault.corp.com',
    shareKeyId: `${id}@corp.com`,
    isSelf: false,
    projectIds: ['p1'],
  })) as unknown as Parameters<typeof matchingTeamMembers>[0];

  const kept = matchingTeamMembers(members, searchTerms('atlas'), {
    viewer: undefined,
    roster: undefined,
    projects,
  });

  assert.equal(kept.length, 4, 'they are all on Atlas');
  assert.equal(reads, 1, 'the map is built for the filter, not for each of the four');
});
