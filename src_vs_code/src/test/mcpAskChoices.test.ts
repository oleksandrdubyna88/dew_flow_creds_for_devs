import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MCP_ASK_CHOICES,
  MCP_ASK_HINT,
  MCP_BAR_COLORS,
  MCP_SWITCHES,
  askWords,
  mcpAskHtml,
} from '../mcpSwitches';
import { matchesPredicates } from '../searchPredicates';
import type { McpAskPolicy } from '../mcpAccess';

/**
 * The four answers to *how often should I be asked* (#95), and the markup that offers them.
 *
 * <p>The cadence is the first control in this product that can turn a confirmation OFF, so the
 * words beside it are part of the control rather than decoration: somebody choosing "never ask"
 * has to be told, in that sentence, that the switches above become the whole gate.</p>
 *
 * <p>The other thing pinned here is a separation. The cadence is NOT a switch, and `MCP_SWITCHES`
 * is read by `searchPredicates.ts`, which throws at module load for an id it has no predicate name
 * for — so an ask option quietly appended to that list would break every search in the product at
 * startup, before any test about consent ever ran.</p>
 */

function radios(html: string): { id: string; checked: boolean; value: string }[] {
  return [...html.matchAll(/<input id="(mcpAsk[A-Za-z0-9]+)"[\s\S]*?>/g)].map((found) => ({
    id: found[1],
    checked: found[0].includes(' checked'),
    value: /value="([^"]*)"/.exec(found[0])?.[1] ?? '',
  }));
}

function labelFor(html: string, id: string): string {
  return new RegExp(`<label for="${id}">([^<]*)</label>`).exec(html)?.[1] ?? '(no label)';
}

test('four choices, each with a why, and never-ask says the switches become the whole gate', () => {
  // A permission whose consequence is not written beside it is a permission granted by shrug —
  // the rule the ten switches in this file already follow, applied to the one control that can
  // remove a confirmation entirely.
  assert.deepEqual(
    MCP_ASK_CHOICES.map((choice) => choice.value),
    [undefined, 'always', 'every12h', 'never'],
  );
  for (const choice of MCP_ASK_CHOICES) {
    assert.ok(choice.why.length > 40, `${choice.id} has no why worth reading`);
    assert.ok(choice.label.length > 0, `${choice.id} has no label`);
  }
  const never = MCP_ASK_CHOICES.find((choice) => choice.value === 'never')?.why ?? '';
  assert.match(never, /switches above become the whole gate/);
  assert.match(never, /recorded in the journal/, 'a call nobody confirms is still a call somebody can read about');
  assert.match(never, /creating and deleting still ask/i);
});

test('the group hint says what the cadence covers, and that creating and deleting always ask', () => {
  assert.match(MCP_ASK_HINT, /USES/);
  assert.match(MCP_ASK_HINT, /Creating and deleting always ask/);
  assert.ok(mcpAskHtml(undefined).includes(MCP_ASK_HINT.slice(0, 40)), 'the hint is rendered, not merely declared');
});

test('exactly one radio is checked, and it is the local answer when there is one', () => {
  for (const local of [undefined, 'always', 'every12h', 'never'] as (McpAskPolicy | undefined)[]) {
    const checked = radios(mcpAskHtml(local)).filter((radio) => radio.checked);

    assert.equal(checked.length, 1, `local ${String(local)} checked ${checked.length} radios`);
    assert.equal(
      checked[0].value,
      local ?? 'inherit',
      `local ${String(local)} checked the wrong one: ${checked[0].id}`,
    );
  }
});

test('an inheriting folder shows Inherit checked with the folder above and its answer named', () => {
  const html = mcpAskHtml(undefined, { ask: 'never', from: 'Projects' });

  const label = labelFor(html, 'mcpAskInherit');
  assert.match(label, /Projects/, 'a control called Inherit that does not say what it inherits sends somebody off the page');
  assert.match(label, /never ask/);
  assert.equal(radios(html).filter((radio) => radio.checked)[0].id, 'mcpAskInherit');
});

test('with nothing above, the option does not claim to inherit — and is still offered', () => {
  // A root folder has nothing to inherit FROM, so the word would be a lie. It must still be
  // selectable: taking back an answer this folder made is exactly what that option is for.
  const label = labelFor(mcpAskHtml('never'), 'mcpAskInherit');

  assert.doesNotMatch(label, /Inherit from/);
  assert.match(label, /nothing above answers/);
  assert.match(label, /ask every time/, 'and it says what happens instead');
  assert.doesNotMatch(mcpAskHtml('never'), /id="mcpAskInherit"[^>]*disabled/);
});

test('a folder name in the Inherit label is escaped', () => {
  // Folder names arrive by sync and by import. This extension has already shipped one
  // interpolation of a name into a page.
  const html = mcpAskHtml(undefined, { ask: 'always', from: '<script>alert(1)</script>' });

  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});

test('the words for a policy come from its own label, so there is one spelling of each', () => {
  assert.equal(askWords('always'), 'ask every time');
  assert.equal(askWords('every12h'), 'ask once every 12 hours');
  assert.equal(askWords('never'), 'never ask');
  for (const policy of ['always', 'every12h', 'never'] as McpAskPolicy[]) {
    assert.ok(
      MCP_ASK_CHOICES.some((choice) => choice.label.toLowerCase() === askWords(policy)),
      `${policy} is worded somewhere other than its own label`,
    );
  }
});

test('MCP_SWITCHES still has ten entries and five bar colours, and no ask id is among them', () => {
  // The separation, stated as a number. `searchPredicates.ts` builds its map from MCP_SWITCHES and
  // THROWS at module load for an id it does not know — importing it here is what proves this file
  // did not break every search in the product. `matchesPredicates` is called so the import cannot
  // be dropped as unused.
  assert.equal(MCP_SWITCHES.length, 10);
  assert.equal(MCP_BAR_COLORS.length, 5);
  const switchIds = MCP_SWITCHES.map((one) => one.id);
  for (const choice of MCP_ASK_CHOICES) {
    assert.ok(!switchIds.includes(choice.id), `${choice.id} entered the switch list`);
  }
  assert.equal(typeof matchesPredicates, 'function', 'searchPredicates loaded without throwing');
});
