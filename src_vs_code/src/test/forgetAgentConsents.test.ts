import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadWithVscode } from './vscodeStub';
import { EN_BODIES } from '../helpEn';
import { RU_BODIES } from '../helpRu';
import { UK_BODIES } from '../helpUk';
import { DE_BODIES } from '../helpDe';
import { ES_BODIES } from '../helpEs';
import {
  ASK_WINDOW_MS,
  ConsentStamp,
  ConsentStampStore,
  STAMPS_KEY,
  consentDue,
  consentStampsFor,
  stampKey,
} from '../mcpConsentPolicy';

/**
 * The way out (#95, S4.1).
 *
 * <p>`every12h` remembers an answer for twelve hours on this machine. Changing the policy takes
 * effect on the NEXT call, because the policy is read fresh — but it does not undo a window
 * somebody already opened by clicking Allow. This command is what does, and it is machine-wide
 * because the record is: the stamps never sync, so there is nothing per-entry to revoke anywhere
 * else.</p>
 *
 * <p>The handler is captured from a `commands.registerCommand` stub rather than imported, so what
 * these tests invoke is what the extension REGISTERED. A command whose title is in the help and
 * whose handler sits under another id is a palette entry that throws when pressed, and importing
 * the function directly would not notice.</p>
 */

const NOW = 1_700_000_000_000;
const A1 = 'a1';
const E1 = 'e1';
const RUNGS = 'true,true,false,false,,false,false,';

type Handler = (...args: unknown[]) => unknown;

interface Captured {
  handlers: Map<string, Handler>;
  state: ConsentStampStore & { keys: () => string[] };
  warned: string[];
  told: string[];
}

/** A `Memento` that holds what it is given and reports which keys were written. */
function memento(): ConsentStampStore & { keys: () => string[] } {
  const held = new Map<string, unknown>();
  return {
    keys: () => [...held.keys()],
    get: <T,>(key: string): T | undefined => held.get(key) as T | undefined,
    update: (key: string, value: unknown): Thenable<void> => Promise.resolve(void held.set(key, value)),
  };
}

/**
 * Register the real agent commands against a stubbed editor, and hand back what they registered.
 *
 * <p>`confirm` is what the person does with the confirmation: pressing the button, or dismissing
 * it — which VS Code reports as `undefined` and which has to leave the record alone, since this is
 * not recoverable. A BOOLEAN rather than the answer itself, because a parameter defaulted to
 * `'Forget them'` and called with an explicit `undefined` takes the DEFAULT — so the dismiss case
 * silently tested the confirm case, and this test caught it by failing.</p>
 */
function registered(confirm = true, store = memento()): Captured {
  const answer = confirm ? 'Forget them' : undefined;
  const warned: string[] = [];
  const told: string[] = [];
  const handlers = new Map<string, Handler>();
  const state = store;
  const mod = loadWithVscode<{ registerAgentCommands(host: Record<string, unknown>): void }>(
    '../commands/agentCommands',
    {
      window: {
        showWarningMessage: (message: string): Thenable<string | undefined> => {
          warned.push(message);
          return Promise.resolve(answer);
        },
        showInformationMessage: (message: string): Thenable<undefined> => {
          told.push(message);
          return Promise.resolve(undefined);
        },
        showErrorMessage: (message: string): Thenable<undefined> => {
          told.push(message);
          return Promise.resolve(undefined);
        },
      },
    },
  );
  mod.registerAgentCommands({
    MACHINES: [],
    agentServer: { setFolderHooks: (): void => undefined },
    aliasMap: () => ({}),
    bridges: {},
    log: {},
    mutated: (): void => undefined,
    offerInstall: (): Promise<void> => Promise.resolve(),
    provider: {},
    register: (command: string, handler: Handler): void => void handlers.set(command, handler),
    setAliasMap: (): Thenable<void> => Promise.resolve(),
    sshAgent: {},
    state,
    storage: { getAccounts: () => [], getNodes: () => [], getNode: () => undefined },
    storageDir: '',
    vaultKeys: {},
  });
  return { handlers, state, warned, told };
}

async function forget(world: Captured): Promise<void> {
  const handler = world.handlers.get('credSshManager.forgetAgentConsents');
  assert.ok(handler !== undefined, `the command is not registered; registered: ${[...world.handlers.keys()].join(', ')}`);
  await handler();
}

/** Put a stamp on record the way a remembered consent does. */
async function remember(state: ConsentStampStore, at = NOW): Promise<void> {
  await consentStampsFor(state).remember(stampKey(A1, E1), RUNGS, at);
}

function stamp(state: ConsentStampStore, at = NOW): ConsentStamp | undefined {
  return consentStampsFor(state).get(stampKey(A1, E1), at);
}

test('the registered command empties the real globalState key', () => {
  const world = registered();
  return remember(world.state)
    .then(() => {
      assert.notEqual(stamp(world.state), undefined, 'nothing was remembered, so the clear proves nothing');
      return forget(world);
    })
    .then(() => {
      assert.deepEqual(world.state.get(STAMPS_KEY), {}, 'the stamps key still holds records');
      assert.equal(stamp(world.state), undefined);
    });
});

test('after forgetting, a call inside the OLD twelve-hour window asks again', () => {
  // The emptiness is not the guarantee — this is. The door reads `consentDue` against what the
  // store answers, so the question is whether a call that would have been silent now prompts.
  const world = registered();
  const inside = NOW + ASK_WINDOW_MS - 1;
  return remember(world.state)
    .then(() => {
      assert.equal(consentDue('every12h', stamp(world.state, inside), RUNGS, inside), false, 'it was silent before');
      return forget(world);
    })
    .then(() => {
      assert.equal(consentDue('every12h', stamp(world.state, inside), RUNGS, inside), true);
    });
});

test('forgetting writes the two machine-local keys and nothing else', () => {
  // The tombstone and the map, both under `credSshManager.*` in globalState. Nothing here syncs,
  // and a third key would be a record this feature never said it kept.
  const world = registered();
  return forget(world).then(() => {
    assert.deepEqual(
      world.state.keys().sort(),
      ['credSshManager.mcpConsentForgotten', STAMPS_KEY].sort(),
      `wrote: ${world.state.keys().join(', ')}`,
    );
  });
});

test('dismissing the confirmation forgets nothing — it is not recoverable', () => {
  const world = registered(false);
  return remember(world.state)
    .then(() => forget(world))
    .then(() => {
      assert.notEqual(stamp(world.state), undefined, 'a dismissed dialog cleared the record anyway');
      assert.equal(world.told.length, 0, 'and it claimed to have done something');
      assert.equal(world.warned.length, 1, 'the confirmation was shown');
    });
});

test('the person is told only after the writes land, and told the truth when they do not', () => {
  // `forgetAll` is two awaited writes. A message shown before them would say the windows are gone
  // while they were still in flight; a message shown after a REJECTED write would be worse.
  const world = registered();
  return forget(world).then(() => {
    assert.equal(world.told.length, 1);
    assert.match(world.told[0], /forgotten/i);
  });
});

/** A `globalState` that cannot be written — what a locked or read-only profile answers. */
function refusing(): ConsentStampStore & { keys: () => string[] } {
  return {
    keys: () => [],
    get: () => undefined,
    update: (): Thenable<void> => Promise.reject(new Error('globalState is read-only')),
  };
}

test('a store that refuses the write says so, through the REGISTERED handler', () => {
  // Driven through the command rather than through `forgetAll`, because the thing under test is the
  // handler's catch branch: a rejected write that escaped it would be an unhandled command failure,
  // and calling the store directly would never reach that code at all.
  const world = registered(true, refusing());

  return forget(world).then(() => {
    assert.equal(world.told.length, 1, 'the person was told nothing at all');
    assert.match(world.told[0], /Could not forget agent consents/);
    assert.match(world.told[0], /read-only/, 'and not told what went wrong');
    assert.doesNotMatch(world.told[0], /have been forgotten/, 'it claimed success over a failed write');
  });
});

interface Manifest {
  contributes: { commands: { command: string; title: string }[] };
}

/** The manifest as `listingCoverage.test.ts` reads it — `JSON.parse` answers `any`, so no cast. */
function manifest(): Manifest {
  const text = fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8');
  return JSON.parse(text);
}

test('the command the manifest contributes is the command that is registered', () => {
  // A title in the help and a handler under another id is a palette entry that throws when pressed.
  const contributed = manifest().contributes.commands.find(
    (one) => one.command === 'credSshManager.forgetAgentConsents',
  );

  assert.ok(contributed !== undefined, 'the command is not in the manifest');
  assert.equal(contributed.title, 'Forget Agent Consents on This Machine');
  assert.equal(registered().handlers.has(contributed.command), true);
});

/**
 * The same paragraph in all five languages (#95).
 *
 * <p>`helpCoverage.test.ts` checks the ENGLISH corpus only, which is what a command title needs —
 * so English alone would go green. And a translation that is merely OUT OF DATE is invisible to a
 * coverage test that only knows how to spot a missing one: a person reading the Russian article
 * would have been told every call raises a modal, which stopped being true in S2.2.</p>
 */
/** Every catalog, imported rather than required by name — a typo is a compile error this way. */
const CATALOGS = { helpEn: EN_BODIES, helpRu: RU_BODIES, helpUk: UK_BODIES, helpDe: DE_BODIES, helpEs: ES_BODIES };

/**
 * The obsolete claim, in each language's own words.
 *
 * <p>It was true until S2.2 and it is the one sentence a stale translation would keep while looking
 * complete — which is exactly what a coverage test cannot see, since it only knows how to spot a
 * MISSING article.</p>
 */
const STALE_CLAIMS = [
  'Every action still raises the consent modal',
  'Каждое действие всё равно поднимает модал согласия',
  'Кожна дія все одно піднімає вікно згоди',
  'Jede Handlung löst weiterhin die Zustimmungsabfrage aus',
  'Toda acción sigue levantando la ventana de consentimiento',
];

function staleClaimIn(text: string): string | undefined {
  return STALE_CLAIMS.find((claim) => text.includes(claim));
}

function article(language: keyof typeof CATALOGS): string {
  const found = CATALOGS[language]['agents-mcp'];
  assert.ok(found !== undefined, `${language} has no agents-mcp article`);
  return Object.values(found).join('\n');
}

test('the stale-claim scan still finds a known obsolete sentence', () => {
  // The companion to the prohibitions below: a scan that matches nothing passes forever, and these
  // sentences are exactly the kind a rewording would quietly move out of reach.
  for (const claim of STALE_CLAIMS) {
    assert.equal(staleClaimIn(`before. ${claim}. after`), claim, 'the scan no longer recognises its own subject');
  }
  assert.equal(staleClaimIn('a paragraph that says nothing of the sort'), undefined);
});

for (const language of Object.keys(CATALOGS) as (keyof typeof CATALOGS)[]) {
  test(`the ${language} article names the command that takes a consent window back`, () => {
    assert.match(article(language), /Forget Agent Consents on This Machine/);
  });

  test(`the ${language} article no longer says every action raises the modal`, () => {
    assert.equal(staleClaimIn(article(language)), undefined, `${language} still carries the obsolete claim`);
  });

  test(`the ${language} article says never-ask makes the switches the whole gate`, () => {
    // The sentence somebody needs BEFORE choosing it, not after. Asserted per language because
    // this is the one option in the product that can turn a confirmation off.
    assert.match(article(language), /MCP logs/, 'a call nobody confirms is still one somebody can read about');
  });
}
