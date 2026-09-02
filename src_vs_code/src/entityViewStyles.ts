import { ZOOM_CSS, zoomStyle } from './zoomControl';
import { PAGE_MAX_WIDTH_PX, groupsGridCss } from './webviewHtml';
import { mcpSwitchStyles } from './mcpSwitches';
import { FORM_SECTIONS } from './formSections';
import { paymentCardStyles } from './paymentViewCard';

/**
 * The viewer page's stylesheet, moved out of `entityViewPage.ts` verbatim.
 *
 * <p>Not a tidy-up: that file reached 798 of this repository's 800-line ceiling when the payment card
 * landed, and the rule here is extract rather than suppress. The stylesheet is the cleanest seam it
 * has — one cohesive thing, no logic, and every colour in it already comes from somewhere else
 * (`FORM_SECTIONS`, `mcpSwitchStyles`, `groupsGridCss`, `ZOOM_CSS`), which is what makes moving it a
 * move rather than a rewrite.</p>
 *
 * <p>Pure: no `vscode`.</p>
 */
export function entityViewStyles(uiScale: number): string {
  return pageStyles(uiScale) + controlStyles();
}

/** The page itself: its width, the two-column grid, the agent bar and the code panel. */
function pageStyles(uiScale: number): string {
  return `
  /* Both numbers come from webviewHtml.ts, and that is the fix rather than a tidy-up: this page
     used to cap itself at 640px while splitting into two columns at a 1000px window, so it split
     exactly where it had no room. Sharing them makes the two pages unable to disagree. */
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
         background: var(--vscode-editor-background); padding: 16px 24px;
         max-width: ${PAGE_MAX_WIDTH_PX}px; ${zoomStyle(uiScale)} }
  h2 { font-size: 1.2em; }
  .row { margin-bottom: 10px; }
  .note { opacity: .75; font-style: italic; }
  /* The same five segments the form shows, in the same colours — a card and its editor must not
     describe one permission set two different ways. Both the markup and the colours come from
     the switch catalog; this file used to keep its own copy of the five hex values, which is a
     palette that agrees with the form only until somebody edits one of them. */
  .mcpBar { display: flex; gap: 3px; margin: 2px 0 4px; }
  .mcpSeg { width: 26px; height: 4px; border-radius: 2px; opacity: .18; }
  .mcpSegOn { opacity: 1; }
  ${mcpSwitchStyles()}
  .env { font-size: .72em; letter-spacing: .5px; }
  .envTag { opacity: .8; font-family: var(--vscode-editor-font-family); font-size: .9em; }
  .envLine { margin-top: 3px; align-items: center; }
  /* The form's own rule, deliberately: two columns when there is room, stacked when there is
     not, and the two pages then narrow the same way instead of nearly the same way. */
  ${groupsGridCss('viewGroups', false)}
  .hint.bad { color: var(--vscode-editorWarning-foreground, #cca700); opacity: 1; }
  .code { flex: 1; margin: 0; padding: 6px 8px; max-height: 320px; overflow: auto;
    font-family: var(--vscode-editor-font-family, monospace); font-size: 1em; line-height: 1.45;
    white-space: pre-wrap; word-break: break-all;
    border: 1px solid var(--vscode-widget-border, #3c3c3c); border-radius: 4px; }
  .tok-comment { color: var(--vscode-descriptionForeground); font-style: italic; }
  .tok-string { color: var(--vscode-charts-orange, #ce9178); }
  .tok-kw { color: var(--vscode-charts-blue, #569cd6); font-weight: 600; }
  .tok-num { color: var(--vscode-charts-green, #b5cea8); }
  .tok-var { color: var(--vscode-charts-purple, #c586c0); font-weight: 600; }
  /* T17: the key side of a pair — the split that keeps a JSON body from being one colour. */
  .tok-key { color: var(--vscode-debugTokenExpression-name, #9CDCFE); }
`;
}

/**
 * The controls: frames, rows, inputs, buttons, the file captions and the payment card's own.
 *
 * <p>Split from the block above only for the 50-line ceiling, and the seam is where it would have
 * been drawn anyway: everything here is a CONTROL, and everything there is the page around them.</p>
 */
function controlStyles(): string {
  return `
  .totp { font-size: 1.25em; letter-spacing: .18em; max-width: 11em; flex: 0 1 11em; }
  /* The form's frame rules, verbatim in shape: only the border carries the colour. */
  fieldset { border: 1px solid var(--vscode-widget-border, #4444); border-radius: 4px;
             margin: 0 0 14px; padding: 10px 12px; }
  legend { padding: 0 6px; opacity: .85; }
  /* The native checkbox tinted by webview defaults is nearly invisible on dark themes
     (tails T31) - the action colour is the one guaranteed to contrast with the panel. */
  input[type=checkbox] { accent-color: var(--vscode-button-background); width: 15px; height: 15px; }
  .sec { border-color: currentColor; }
  ${FORM_SECTIONS.map(
    (section) =>
      `.sec.${section.color} { border-color: var(--vscode-credSshManager-${section.color}, var(--vscode-widget-border, #4444)); }`,
  ).join('\n  ')}
  .totpLeft { align-self: center; min-width: 3em; opacity: .8; font-variant-numeric: tabular-nums; }
  /* Width only, height auto (T26): the zoom used to set BOTH to a square, the column clamped
     the width, and the un-clamped height turned into empty letterbox bands that read as a
     distorted zoom. max-width keeps the box inside the column at every zoom step. */
  .preview { width: 200px; max-width: 100%; height: auto; cursor: zoom-in;
             border: 1px solid var(--vscode-widget-border, #3c3c3c); border-radius: 4px;
             background: var(--vscode-editor-background); }
  label { display: block; margin-bottom: 3px; opacity: .8; }
  .line { display: flex; gap: 8px; align-items: flex-start; }
  input, textarea { flex: 1; box-sizing: border-box; padding: 5px 7px;
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent); border-radius: 3px;
    font-family: var(--vscode-editor-font-family, monospace); }
  textarea { resize: vertical; white-space: pre; }
  button { padding: 5px 14px; border: none; border-radius: 3px; cursor: pointer;
           background: var(--vscode-button-secondaryBackground);
           color: var(--vscode-button-secondaryForeground); }
  button.icon { padding: 5px 8px; min-width: 32px; display: inline-flex;
                align-items: center; justify-content: center; }
  button.primary { background: var(--vscode-button-background);
                   color: var(--vscode-button-foreground);
                   display: inline-flex; align-items: center; gap: 6px; }
  /* The title and Copy All on one line, the button hugging the title rather than the far edge —
     a button flung to the right of a 1280px page is as lost as one at the bottom was. */
  .pageHead { display: flex; align-items: center; gap: 16px; margin: 0 0 14px; flex-wrap: wrap; }
  .pageHead h2 { margin: 0; }
  .subtitle { margin: -8px 0 12px; opacity: .7; }
  ${ZOOM_CSS}
  /* T27: captions a notch larger, the NAME dark orange and larger still — the owner's spec. */
  .fileCaption { font-size: 1.08em; }
  .fileName { color: var(--vscode-credSshManager-fileName, #d98a3d); font-size: 1.08em;
              font-family: var(--vscode-editor-font-family, monospace); margin: 2px 0; }
  ${paymentCardStyles()}
`;
}
