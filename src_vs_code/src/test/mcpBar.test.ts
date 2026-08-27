import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderHtml } from '../entityFormPage';
import { MCP_BAR_COLORS, MCP_SWITCHES, mcpBarHtml } from '../mcpSwitches';
import { accessMask, normalizeMcpAccess } from '../mcpAccess';
import { mcpSwitchScript } from '../mcpSwitchScript';
import type { EntityFormOptions } from '../entityFormPanel';
import type { EntityMetadata } from '../types';

/**
 * The five-stripe bar, and the arithmetic that has to agree in four places.
 *
 * <p>Six switches, five stripes. That gap is the whole reason this file exists: the form's
 * markup was built by mapping the SWITCHES, so it drew six segments — while the page script that
 * repaints them on every click walks an array of five, and `accessMask` (which the tree icon and
 * the viewer are generated from) returns five. The sixth segment was therefore painted once, at
 * render time, and never again: tick "may delete anything" and the extra red stripe kept the
 * answer it had when the form opened.</p>
 *
 * <p>Nobody would have seen it as a stuck stripe. They would have seen a duplicated red, decided
 * the bar has two delete stripes, and read one of them as false. A permissions display that lies
 * in the safe direction is still a permissions display that lies.</p>
 *
 * <p>So the bar has ONE builder, and this file pins its length against `accessMask` rather than
 * against the number five — the two are the same claim, and writing the number twice is how they
 * would come apart again.</p>
 */

function options(overrides: Partial<EntityFormOptions> = {}): EntityFormOptions {
  return {
    mode: 'create',
    entityId: 'e1',
    hasStoredPassword: false,
    hasStoredPrivateKey: false,
    hasStoredAttachment: false,
    hasStoredImage: false,
    hasStoredVpnConfig: false,
    hasStoredDbConnection: false,
    hasStoredTotp: false,
    hasStoredHostKey: false,
    keyCandidates: [],
    jumpCandidates: [],
    dependencyFolders: [],
    dependencyColors: {},
    ...overrides,
  } as EntityFormOptions;
}

function segments(html: string): string[] {
  return [...html.matchAll(/<span class="mcpSeg([^"]*)"/g)].map((m) => m[1].trim());
}

test('the bar has exactly as many stripes as the mask the script repaints', () => {
  const html = renderHtml(options());
  assert.equal(segments(html).length, accessMask({}).length);
});

test('every stripe the form draws is one the page script can reach', () => {
  // The defect this file was written for: the script walks five, the markup drew six, and the
  // last one was frozen at its opening value. Counting both is the only assertion that fails.
  const drawn = segments(renderHtml(options())).length;
  const painted = mcpSwitchScript(false).match(/chk\('mcp/g);
  assert.ok(painted !== null);
  // Five entries in the paint array; the sixth switch shares the fifth stripe by design.
  assert.equal(drawn, MCP_BAR_COLORS.length);
  assert.ok(drawn < MCP_SWITCHES.length, 'the two delete scopes must share one stripe');
});

test('the stripes carry the switch colours, in ladder order, with the delete pair merged', () => {
  const expected = [...new Set(MCP_SWITCHES.map((s) => s.color))];
  assert.deepEqual([...MCP_BAR_COLORS], expected);
  assert.deepEqual(segments(mcpBarHtml(accessMask({}))), expected);
});

test('a stripe is lit exactly when its bit is set', () => {
  const access = normalizeMcpAccess({ edit: true });
  const html = mcpBarHtml(accessMask(access));
  const lit = segments(html).map((cls) => cls.includes('mcpSegOn'));
  // The ladder filled in view and use underneath edit; create and delete stay dark.
  assert.deepEqual(lit, [true, true, true, false, false]);
});

test('the form lights the stripes of the entry it was opened on', () => {
  const html = renderHtml(
    options({
      mode: 'edit',
      initial: {
        id: 'e1',
        name: 'prod',
        kind: 'credential',
        mcp: { delete: 'any' },
      } as EntityMetadata,
    }),
  );
  // Everything, because deleting sits at the top of the ladder.
  assert.deepEqual(
    segments(html).map((cls) => cls.includes('mcpSegOn')),
    [true, true, true, true, true],
  );
});
