import { PAGE_MAX_WIDTH_PX, THREE_COLUMN_AT, TWO_COLUMN_AT } from './webviewHtml';
import { ZOOM_CSS, zoomStyle } from './zoomControl';
import { FORM_SECTIONS } from './formSections';
import { mcpSwitchStyles } from './mcpSwitches';

/**
 * The entity form's stylesheet, out of `entityFormPage.ts` for the recurring reason: the page
 * crossed the 800-line ceiling, and a stylesheet is the one part of a page that reads as a unit
 * on its own. The rules are unchanged; only the file moved.
 */
// One template literal — a stylesheet — so it is one "function" only in the way TypeScript counts.
// eslint-disable-next-line max-lines-per-function
export function formStyleSheet(uiScale: number): string {
  return `
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
         background: var(--vscode-editor-background); padding: 16px 24px;
         max-width: ${PAGE_MAX_WIDTH_PX}px; ${zoomStyle(uiScale)} }
  h2 { margin: 0 0 12px; font-size: 1.2em; }
  /* The kind beside the name: two entries can share a name and be different things. */
  .kindChip { margin-left: 10px; font-size: .62em; letter-spacing: .08em;
              text-transform: uppercase; opacity: .55; vertical-align: middle; }
  fieldset { border: 1px solid var(--vscode-widget-border, #4444); border-radius: 4px;
             margin: 0 0 14px; padding: 10px 12px; }
  legend { padding: 0 6px; opacity: .85; }
  ${ZOOM_CSS}
  .agentDoors { margin-top: 10px; border-top: 1px solid var(--vscode-widget-border, #3c3c3c); padding-top: 8px; }
  .agentDoorsHead { font-weight: 600; opacity: .9; }
  .agentDoor { margin: 6px 0; font-size: .92em; }
  .doorLink { cursor: pointer; text-decoration: underline; margin-left: 6px; }
  /* T27: the same treatment the viewer gives — captions a notch up, names dark orange. */
  .fileName { color: var(--vscode-credSshManager-fileName, #d98a3d); font-size: 1.08em;
              font-family: var(--vscode-editor-font-family, monospace); margin: 4px 0 2px; }
  .formPreview { max-width: 220px; max-height: 160px; display: block; margin: 6px 0;
                 border: 1px solid var(--vscode-widget-border, #3c3c3c); border-radius: 4px; }
  /* The native checkbox tinted by webview defaults is nearly invisible on dark themes
     (tails T31): checked gets the action colour, and the size raise is what helps the
     UNCHECKED box, whose border the browser draws thicker at 15px than at the 13px default.
     The per-switch mcpSwitch rules override the colour, deliberately. */
  input[type=checkbox] { accent-color: var(--vscode-button-background); width: 15px; height: 15px; }
  label { display: block; margin: 8px 0 3px; }
  .check { display: flex; align-items: center; gap: 6px; margin: 6px 0; }
  .genRow { display: flex; gap: 8px; margin: 6px 0 0; flex-wrap: wrap; }
  .check label { margin: 0; }
  .envRow { margin: 4px 0 0 2px; padding: 4px 8px;
            border-left: 2px solid var(--vscode-focusBorder, #007fd4); opacity: .95; }
  /* Two columns as a FLOW, not a two-column grid: the sections have wildly different heights,
     and grid rows would leave a tall Connection sitting beside a short Notes with a hole under
     it. Multi-column packs them the way the eye expects. break-inside is what keeps a fieldset
     from being sliced in half at the column boundary. Below the breakpoint the whole thing
     collapses to one column, and the Main group is simply above the Additional one.
     No backticks in here: one inside a CSS comment ends the template literal this page is. */
  /* The two GROUPS are the two columns: Main on the left, Additional on the right, each one
     stacked as a single column of its own sections. Not each group internally split in two —
     that was the first reading of the requirement and it puts main fields on the right and
     additional fields on the left, which is exactly the confusion the split exists to remove.
     Below the breakpoint the grid collapses to one column and Main simply sits above Additional.
     align-items: start, so the shorter column does not stretch to match the taller one.
     No backticks in here: one inside a CSS comment ends the template literal this page is. */
  /* T24a: one column stacks main -> additional -> agent; two columns put the agent group under
     Additional (exactly the old layout); a screen wide enough gives Agent access its OWN third
     column. CSS order + grid placement, so the MARKUP stays one source order. */
  .formGroups { display: grid; grid-template-columns: 1fr; gap: 0 24px; align-items: start; }
  #agentGroup { order: 3; }
  @media (min-width: ${TWO_COLUMN_AT}px) {
    .formGroups { grid-template-columns: 1fr 1fr; }
    #mainGroup { grid-column: 1; grid-row: 1 / span 2; }
    #additionalGroup { grid-column: 2; grid-row: 1; }
    #agentGroup { grid-column: 2; grid-row: 2; order: 0; }
  }
  @media (min-width: ${THREE_COLUMN_AT}px) {
    .formGroups { grid-template-columns: 1fr 1fr 1fr; }
    #mainGroup { grid-row: 1; }
    #additionalGroup { grid-row: 1; }
    #agentGroup { grid-column: 3; grid-row: 1; }
  }
  .groupTitle { margin: 18px 0 8px; font-size: .95em; text-transform: uppercase;
                letter-spacing: .08em; opacity: .6; }
  /* The legend keeps the default foreground on purpose - only the border carries the colour, so
     a section is identified without the page turning into fifteen coloured captions. */
  .sec { border-color: currentColor; }
  ${FORM_SECTIONS.map(
    (section) =>
      `.sec.${section.color} { border-color: var(--vscode-credSshManager-${section.color}, var(--vscode-widget-border, #4444)); }`,
  ).join('\n  ')}
  /* Five segments with gaps, dimmed where the switch is off: the whole permission set read at a
     glance, in the same colours the switches themselves carry. */
  .mcpBar { display: flex; gap: 3px; margin: 2px 0 6px; }
  .mcpSeg { width: 26px; height: 4px; border-radius: 2px; opacity: .18; }
  .mcpSegOn { opacity: 1; }
  .mcpWhy { margin: 0 0 8px 22px; opacity: .75; }
  ${mcpSwitchStyles()}
  .depRow { display: flex; align-items: center; gap: 6px; margin: 6px 0; flex-wrap: wrap; }
  .depGone { opacity: .7; font-style: italic; }
  .depSwatches { display: inline-flex; gap: 3px; }
  /* A swatch is painted with the contributed theme colour itself — a webview is given every
     registered colour as a CSS variable — so what is picked here is what the tree will show,
     in whichever theme is on. The hex behind the comma is only there for the case where that
     variable is absent, so the picker degrades to ten distinguishable squares. */
  .depSwatch { width: 18px; height: 18px; padding: 0; border-radius: 3px; cursor: pointer;
               border: 1px solid var(--vscode-widget-border, #8884); }
  .depSwatchOn { outline: 2px solid var(--vscode-focusBorder, #007fd4); outline-offset: 1px; }
  .depRemove { padding: 1px 8px; }
  .envRow label { opacity: .85; }
  /* The config section's Raw / Fields tabs. Coloured from the editor's own tokens rather than
     from fixed values, so a high-contrast theme is legible without a second rule. */
  .hint.bad { color: var(--vscode-editorWarning-foreground, #cca700); opacity: 1; }
  .tabs { display: flex; gap: 2px; margin: 8px 0 6px; }
  .tab { background: transparent; color: var(--vscode-foreground); opacity: .7;
         border: none; border-bottom: 2px solid transparent; padding: 4px 10px; cursor: pointer; }
  .tab.on { opacity: 1; border-bottom-color: var(--vscode-focusBorder); }
  .fieldRow { display: grid; grid-template-columns: minmax(140px, 40%) 1fr; gap: 8px;
              align-items: center; margin: 4px 0; }
  .fieldRow label { margin: 0; overflow-wrap: anywhere; opacity: .85; }
  .codeWrap { position: relative; }
  .codeWrap pre { position: absolute; inset: 0; margin: 0; padding: 5px 7px; overflow: auto;
    font-family: var(--vscode-editor-font-family, monospace); font-size: 1em; line-height: 1.45;
    white-space: pre-wrap; word-break: break-all; pointer-events: none;
    color: var(--vscode-editor-foreground); }
  .codeWrap textarea { position: relative; background: transparent;
    color: var(--vscode-editor-foreground);
    caret-color: var(--vscode-editor-foreground);
    font-family: var(--vscode-editor-font-family, monospace); font-size: 1em; line-height: 1.45;
    white-space: pre-wrap; word-break: break-all; }
  /* The textarea's own glyphs disappear ONLY once the overlay has actually painted the
     same text underneath — the class is added by the page script when a highlight
     response arrives. Unconditional transparency is how a dead or slow highlighter turns
     into an editor whose contents are invisible except where they are selected. */
  .codeWrap.lit textarea { color: transparent; }
  .tok-comment { color: var(--vscode-descriptionForeground); font-style: italic; }
  .tok-string { color: var(--vscode-charts-orange, #ce9178); }
  .tok-kw { color: var(--vscode-charts-blue, #569cd6); font-weight: 600; }
  .tok-num { color: var(--vscode-charts-green, #b5cea8); }
  .tok-var { color: var(--vscode-charts-purple, #c586c0); font-weight: 600; }
  /* T17: the key side of a pair — the split that keeps a JSON body from being one colour. */
  .tok-key { color: var(--vscode-debugTokenExpression-name, #9CDCFE); }
  .fieldDivider { border: 0; border-top: 1px solid var(--vscode-widget-border, #4444);
                  margin: 12px 0; }
  /* input:not(...) rather than a list of input[type=…]: an attribute selector does not
     match an input with no type attribute at all, and the browser default for one of those is a
     WHITE box in a dark theme. That is how the read-only Dates fields shipped looking like
     they belonged to a different application. Named exclusions instead, so the next input
     someone adds is themed whether or not they remember the attribute. */
  input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select {
    width: 100%; box-sizing: border-box; padding: 5px 7px;
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent); border-radius: 3px;
    font-family: var(--vscode-editor-font-family, monospace); }
  textarea { resize: vertical; }
  .argRow { border: 1px solid var(--vscode-widget-border, #3c3c3c); border-radius: 4px; padding: 6px; margin-bottom: 6px; }
.argTop { display: flex; gap: 6px; align-items: center; }
.argTop input[type=text] { flex: 1; }
.argTop button { flex: 0 0 auto; min-width: 28px; }
.argNote { width: 100%; margin-top: 4px; font-size: 0.9em; opacity: 0.85; }
#commandPreview { font-family: var(--vscode-editor-font-family, monospace); opacity: 0.9; }
.hint { font-size: .85em; opacity: .7; margin: 3px 0 0; }
  .error { color: var(--vscode-errorForeground); margin: 10px 0; min-height: 1.2em; white-space: pre-wrap; }
  /* Inside the sticky bar the message must not reserve an empty line forever. */
  .topBar .error { margin: 6px 0 0; min-height: 0; }
  /* A field you cannot type in should look like it: same box, dimmer text, no caret. */
  .readonly { opacity: .75; cursor: default; }
  /* Save and Cancel sit ABOVE the heading, and stay there: a long form (a terminal command
     with a dozen argument rows, a script with its variables) put them below the fold, so
     saving meant scrolling to the bottom to find out where they had gone. Sticky, because
     moving them to the top of the document alone would only relocate the same problem. */
  .topBar { position: sticky; top: 0; z-index: 2; padding: 4px 0 8px;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-widget-border, #4444); margin-bottom: 14px; }
  .buttons { display: flex; gap: 10px; }
  button { padding: 6px 18px; border: none; border-radius: 3px; cursor: pointer;
           background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  /* Secondary = DISMISS (Cancel), nothing else: the action buttons wear the primary palette,
     because a control nobody recognises as a button is a missing control (tails T14c — the
     owner read "+ Add argument" and "Generate password" as plain text). The border is what
     keeps Cancel readable as a button on themes where the secondary fill sits within a few
     percent of the panel background. */
  button.secondary { background: var(--vscode-button-secondaryBackground);
                     color: var(--vscode-button-secondaryForeground);
                     border: 1px solid var(--vscode-button-border, var(--vscode-widget-border, #666)); }
  .row { display: grid; grid-template-columns: 2fr 1fr; gap: 10px; }
  /* The accounts found in a pasted QR. Empty and invisible until there is more than one to
     choose between — an export picture holds every account at once. */
  .qrChoices:empty { display: none; }
  .qrChoices { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
  .qrChoices button { text-align: left; padding: 5px 10px; }
  .qrChoices .qrWhy { font-size: .85em; opacity: .7; }
  kbd { font-family: var(--vscode-editor-font-family, monospace); font-size: .9em;
        border: 1px solid var(--vscode-widget-border, #4444); border-radius: 3px; padding: 0 3px; }
`;
}
