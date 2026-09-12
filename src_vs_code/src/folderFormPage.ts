import * as crypto from 'node:crypto';
import { McpAccess, accessMask, normalizeMcpAccess } from './mcpAccess';
import { MCP_SWITCHES, mcpBarHtml, mcpSwitchStyles } from './mcpSwitches';
import { escapeHtml } from './webviewHtml';
import { formHeaderHtml, pageChromeCss } from './pageChrome';
import { zoomApplyScript, zoomButtonsScript } from './zoomControl';
import { mcpSwitchScript } from './mcpSwitchScript';

/**
 * The folder form's page — markup, CSS and its inline script.
 *
 * <p>Pure and free of `vscode`, exactly like `entityFormPage.ts` beside it, so the markup is a
 * unit test rather than something only a running editor can look at. The panel next door owns
 * the webview and never builds HTML.</p>
 *
 * <p>The page frame and the header come from `pageChrome.ts` (#53). They used to be a private
 * copy — 760px against the entity form's 1280, an unbordered bar, 4px buttons, and no text-size
 * control at all — and the copy had drifted on every one of those points. What is left below is
 * this page's own: the agent-access switches, and the sentence that says what they reach.</p>
 *
 * <p>A folder had no form at all until now: it could be created and renamed through an input
 * box, and that was the whole of it. Agent access inherits from the folder, so it needed
 * somewhere to be set, and a rename box is not a place to put five permissions.</p>
 *
 * <p>Deliberately small. Name and agent access, and nothing else — in particular NOT the folder
 * TYPE, which dictates what kind of entity the folder may hold. Changing it after the fact would
 * strand contents the folder no longer admits; that is a feature with a migration question of
 * its own, not a field to slip into a form while adding another.</p>
 */

export interface FolderFormOptions {
  name: string;
  /** Absent means this folder has no answer of its own — the switches start empty. */
  mcp?: McpAccess;
  /** How many entries the switches would reach, said out loud so the blast radius is visible. */
  entryCount: number;
  /**
   * What this folder is subject to from ABOVE, when it has no answer of its own.
   *
   * <p>Present only when an ancestor decided. The boxes are then pre-filled with it and the hint
   * names the folder, because a form that says "Not set. Nothing here is reachable" under an open
   * parent is not merely unhelpful — it is false, and it is the screen somebody checks before
   * trusting the switch.</p>
   */
  inherited?: { access: McpAccess; from: string };
  /**
   * The text-zoom offset (T28), from `credSshManager.uiScale` — filled in by the panel, exactly
   * as `mountForm` fills the entity form's in. Optional for the same reason it is optional on
   * {@link EntityFormOptions}: the callers that OPEN a folder form describe a folder, and none of
   * them should have to know that a page has a text size.
   */
  uiScale?: number;
  /** The Trash, or anything inside it: nothing there is reachable, whatever a switch says. */
  inTrash: boolean;
}

// One template literal, like the entity page: a document that reads top to bottom, and the tests
// parse it whole. No backticks in here — a stray one inside this string ends it, and the compile
// error lands dozens of lines away from the cause.
// eslint-disable-next-line max-lines-per-function
export function renderFolderHtml(options: FolderFormOptions): string {
  const nonce = crypto.randomBytes(16).toString('base64url');
  const uiScale = options.uiScale ?? 0;
  const decided = options.mcp !== undefined;
  const mcp = shownAccess(options);
  const inheritedFrom = inheritedName(options);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  ${pageChromeCss(uiScale)}
  /* What is left is what this page alone has: the agent-access switches and their bar. */
  .mcpWhy { margin: 0 0 10px 22px; }
  .sec { border-color: var(--vscode-credSshManager-depColor10, var(--vscode-widget-border, #4444)); }
  .mcpBar { display: flex; gap: 3px; margin: 2px 0 6px; }
  .mcpSeg { width: 26px; height: 4px; border-radius: 2px; opacity: .18; }
  .mcpSegOn { opacity: 1; }
  ${mcpSwitchStyles()}
</style>
</head>
<body>
${formHeaderHtml({ heading: `Edit: ${options.name}`, chip: 'folder', uiScale })}

  <fieldset>
    <legend>General</legend>
    <label for="name">Name</label>
    <input id="name" type="text" spellcheck="false" autocomplete="off" autofocus
           value="${escapeHtml(options.name)}">
  </fieldset>

  ${options.inTrash ? trashNotice() : accessFieldset(mcp, decided, options.entryCount, inheritedFrom)}

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const chk = (id) => document.getElementById(id)?.checked === true;
  ${options.inTrash ? 'function collectMcp() { return undefined; }' : mcpSwitchScript(decided)}
  function save() {
    vscode.postMessage({ type: 'save', data: {
      name: document.getElementById('name').value,
      mcp: collectMcp(),
    }});
  }
  document.getElementById('save').addEventListener('click', save);
  document.getElementById('cancel').addEventListener('click', () => {
    vscode.postMessage({ type: 'cancel' });
  });
  document.getElementById('name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { save(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { vscode.postMessage({ type: 'cancel' }); }
  });
  ${zoomButtonsScript()}
  ${zoomApplyScript()}
</script>
</body>
</html>`;
}

/**
 * The switches, and the sentence that says what they reach.
 *
 * <p>The blast radius is spelled out because a folder setting is the one place here where
 * ticking a box grants something to entries nobody is looking at — including entries that do
 * not exist yet.</p>
 */
/** Its own answer when it has one, otherwise whatever is in force from above. */
function shownAccess(options: FolderFormOptions): McpAccess {
  return normalizeMcpAccess(options.mcp ?? options.inherited?.access);
}

function inheritedName(options: FolderFormOptions): string | undefined {
  return options.inherited?.from;
}

/**
 * Which of the three things is true here, in one sentence.
 *
 * <p>Three, not two: "set here", "not set anywhere" and "set above and in force here" are
 * different situations with different next moves, and the third used to be told it was the
 * second.</p>
 */
function accessSentence(decided: boolean, inheritedFrom: string | undefined, covers: string): string {
  if (decided) {
    return `Applies to ${covers}.`;
  }
  if (inheritedFrom !== undefined) {
    return `Inherited from "${inheritedFrom}" — these answers are in force here already. Ticking or clearing anything gives this folder an answer of its own, which then applies to ${covers}.`;
  }
  return `Not set. Nothing in this folder is reachable by an agent unless an entry says so itself. Setting it here would cover ${covers}.`;
}

function accessFieldset(
  mcp: McpAccess,
  decided: boolean,
  entryCount: number,
  inheritedFrom: string | undefined,
): string {
  const reach = entryCount === 1 ? '1 entry' : `${entryCount} entries`;
  const covers = `each of the ${reach} in this folder and the folders inside it that has no answer of its own, and everything created here afterwards`;
  const said = accessSentence(decided, inheritedFrom, covers);
  return `<fieldset class="sec">
    <legend>Agent access (MCP)</legend>
    ${mcpBarHtml(accessMask(mcp))}
    <p class="hint">${escapeHtml(said)}</p>
    ${MCP_SWITCHES.map(
      (s) => `<div class="check">
      <input id="${s.id}" type="checkbox" class="mcpSwitch ${s.color}" ${s.on(mcp) ? 'checked' : ''}>
      <label for="${s.id}">${escapeHtml(s.label)}</label>
    </div>
    <p class="hint mcpWhy">${escapeHtml(s.why)}</p>`,
    ).join('')}
  </fieldset>`;
}

/** No switches for the Trash: they would be controls that decide nothing. */
function trashNotice(): string {
  return `<fieldset class="sec">
    <legend>Agent access (MCP)</legend>
    <p class="hint">Nothing in the Trash is reachable by an agent, whatever it was set to before
      it was deleted. Restore an entry to give it back its permissions.</p>
  </fieldset>`;
}
