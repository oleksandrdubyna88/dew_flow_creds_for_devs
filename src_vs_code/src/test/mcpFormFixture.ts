import * as assert from 'node:assert/strict';
import { MiniDocument, MiniElement } from './miniDom';
import { MCP_ASK_CHOICES, MCP_SWITCHES } from '../mcpSwitches';
import { normalizeMcpAccess } from '../mcpAccess';
import type { McpAccess } from '../mcpAccess';

/**
 * The Agent-access markup, as a document a page script can be run against.
 *
 * <p>One builder rather than one per test file, because two copies of a fixture that must mirror
 * one piece of markup are two copies that drift — and a page fixture that has drifted is a test
 * that passes for a page nobody renders. Both the controls and their STATE come from the same two
 * lists and the same predicate the real markup uses, so a control renamed or a rung re-derived
 * cannot leave a green test behind it.</p>
 */

/** What the host page defines above the fragment — `folderFormPage.ts` and `entityFormScript.ts`. */
export const HOST_CHK =
  'var chk = function (id) { var el = document.getElementById(id); return el ? el.checked === true : false; };';

/** How many stripes the bar has; the script repaints them and would throw on nothing to repaint. */
const SEGMENTS = 5;

export interface McpPageOptions {
  /** Which cadence the markup rendered as checked. Defaults to the record's own, then Inherit. */
  checked?: string;
  /** `false` builds the page the entity form is until S3.2: switches, no radio group. */
  radios?: boolean;
}

export function mcpPage(mcp: McpAccess | undefined, options: McpPageOptions = {}): MiniDocument {
  const document = new MiniDocument();
  placeSwitches(document, normalizeMcpAccess(mcp));
  if (options.radios !== false) {
    placeRadios(document, checkedValue(mcp, options));
  }
  return document;
}

/** Ticked from the record through the SAME predicate the markup uses, never all-off by default. */
function placeSwitches(document: MiniDocument, shown: McpAccess): void {
  for (const one of MCP_SWITCHES) {
    document.place(one.id, 'input').checked = one.on(shown);
  }
  for (let i = 0; i < SEGMENTS; i += 1) {
    document.place(`mcpSeg${i}`, 'span').className = 'mcpSeg';
  }
}

function placeRadios(document: MiniDocument, checked: string): void {
  for (const choice of MCP_ASK_CHOICES) {
    const el = document.place(choice.id, 'input');
    el.value = askValue(choice.value);
    el.checked = el.value === checked;
  }
}

function checkedValue(mcp: McpAccess | undefined, options: McpPageOptions): string {
  return options.checked ?? mcp?.ask ?? 'inherit';
}

/** The wire value of a choice: its policy, or the word the Inherit radio carries. */
export function askValue(policy: string | undefined): string {
  return policy ?? 'inherit';
}

export function askIdFor(value: string): string {
  const choice = MCP_ASK_CHOICES.find((one) => askValue(one.value) === value);
  assert.ok(choice !== undefined, `no radio carries the value ${value}`);
  return choice.id;
}

export function elementAt(document: MiniDocument, id: string): MiniElement {
  const el = document.getElementById(id);
  assert.ok(el !== null, `the fixture has no ${id}`);
  return el;
}

/** Pick a radio the way a person does: the browser unchecks the others, then fires change. */
export function chooseAsk(document: MiniDocument, value: string): void {
  for (const choice of MCP_ASK_CHOICES) {
    elementAt(document, choice.id).checked = askValue(choice.value) === value;
  }
  elementAt(document, askIdFor(value)).fire('change');
}
