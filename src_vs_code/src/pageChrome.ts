import { PAGE_MAX_WIDTH_PX, escapeHtml } from './webviewHtml';
import { ZOOM_CSS, zoomControlHtml, zoomStyle } from './zoomControl';

/**
 * The chrome every form page wears — the frame, and the header that goes in it (#53, #54).
 *
 * <p>There were two hand-rolled pages. The entity form capped at 1280px with a bordered sticky
 * bar, 6px buttons, a text-size control and a kind chip beside the name; the folder form capped
 * at 760px with an unbordered bar, 4px buttons, no zoom control at all and a heading that read
 * "Edit folder:". Nothing shared the chrome, so it drifted — which is the argument `formPanels.ts`
 * already makes about lock behaviour, applied to what the two pages LOOK like. This is reuse-first
 * move 2: the shared half extracted, each page left its own body.</p>
 *
 * <p>Pure and free of `vscode`, like the two page modules it serves, so the markup and the
 * stylesheet are unit tests rather than something only a running editor can look at.</p>
 */

/**
 * The page frame: everything both forms need before their own fields exist.
 *
 * <p>In four named pieces rather than one block, because a stylesheet nobody can read in one
 * screen is how the two copies drifted in the first place. The document, the controls, the bar,
 * and the row primitives of #54 — each reads as its own paragraph and each is asserted as one.</p>
 */
export function pageChromeCss(uiScale: number): string {
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
${fieldCss()}
${topBarCss()}
${rowPrimitivesCss()}`;
}

/** Every control a form page puts in a fieldset, and the helper line under it. */
function fieldCss(): string {
  return `  /* The native checkbox tinted by webview defaults is nearly invisible on dark themes
     (tails T31): checked gets the action colour, and the size raise is what helps the
     UNCHECKED box, whose border the browser draws thicker at 15px than at the 13px default.
     The per-switch mcpSwitch rules override the colour, deliberately. */
  input[type=checkbox] { accent-color: var(--vscode-button-background); width: 15px; height: 15px; }
  label { display: block; margin: 8px 0 3px; }
  .check { display: flex; align-items: center; gap: 6px; margin: 6px 0; }
  .check label { margin: 0; }
  .hint { font-size: .85em; opacity: .7; margin: 3px 0 0; }
  /* input:not(...) rather than a list of input[type=...]: an attribute selector does not
     match an input with no type attribute at all, and the browser default for one of those is a
     WHITE box in a dark theme. That is how the read-only Dates fields shipped looking like
     they belonged to a different application. Named exclusions instead, so the next input
     someone adds is themed whether or not they remember the attribute. */
  input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select {
    width: 100%; box-sizing: border-box; padding: 5px 7px;
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent); border-radius: 3px;
    font-family: var(--vscode-editor-font-family, monospace); }
  textarea { resize: vertical; }`;
}

/** The sticky bar, its buttons, and the validation line that rides with them. */
function topBarCss(): string {
  return `  .error { color: var(--vscode-errorForeground); margin: 10px 0; min-height: 1.2em; white-space: pre-wrap; }
  /* Inside the sticky bar the message must not reserve an empty line forever. */
  .topBar .error { margin: 6px 0 0; min-height: 0; }
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
                     border: 1px solid var(--vscode-button-border, var(--vscode-widget-border, #666)); }`;
}

/**
 * The row primitives the form never had (#54).
 *
 * <p>The viewer has carried one since it was written — `entityViewStyles.ts` gives `.line` a flex
 * row and its fields `flex: 1`, so every field/button pair in it is 8px apart. The form had the
 * opposite: fields at `width: 100%`, `button` with no margin, and no `.line` rule at all. A button
 * after a field therefore touched it, and a `class="line"` written in a form page was dead markup
 * — which is how `phraseFormMarkup.ts` ended up with a full-width select and a Generate button
 * stacked flush on top of one another.</p>
 *
 * <p>One class of defect with eleven sites, so the fix is a class rather than eleven patches;
 * `entityFormPage.test.ts` lints for the twelfth.</p>
 */
function rowPrimitivesCss(): string {
  return `  .line { display: flex; gap: 8px; align-items: center; }
  /* A field inside a row must give up its 100% width, or it takes the whole line and pushes
     the button it was paired with onto the next one. Checkboxes and radios keep their size. */
  .line > input:not([type=checkbox]):not([type=radio]), .line > select, .line > textarea {
    flex: 1; width: auto; }
  .genRow { display: flex; gap: 8px; margin: 8px 0 0; flex-wrap: wrap; }
  /* A select is the one control that has to be told to share: left to the rule above it takes
     the whole row, and min-width: 0 is what lets it shrink again inside a flex row. */
  .genRow > select { flex: 1 1 12em; width: auto; min-width: 0; }
  /* A lone button under a field: no row to join, but the same gap. */
  .actions { margin-top: 8px; }`;
}

/** What a form page's header needs to know about itself. */
export interface PageHeader {
  /** The raw heading text. Escaped HERE, so no caller escapes it a second time. */
  heading: string;
  /** The uppercase chip beside it — an entity's kind, or the word "folder". Raw, escaped here. */
  chip?: string;
  /** The text-zoom offset (T28), for the control and nothing else. */
  uiScale: number;
}

/**
 * The sticky bar, the text-size control, the validation line and the heading — one header for
 * both forms.
 *
 * <p><b>The three element ids are a contract.</b> `save`, `cancel` and `error` are what the two
 * page scripts bind and write into; a header that renders beautifully and posts nothing on Save
 * is exactly the regression a builder invites, so both page tests assert all three.</p>
 */
export function formHeaderHtml(header: PageHeader): string {
  const chip =
    header.chip === undefined ? '' : `<span class="kindChip">${escapeHtml(header.chip)}</span>`;
  return `  <div class="topBar">
    <div class="buttons">
      <button type="button" id="save">Save</button>
      <button type="button" id="cancel" class="secondary">Cancel</button>
      ${zoomControlHtml(header.uiScale)}
    </div>
    <!-- The validation message rides with the buttons. Below them it would scroll out of
         sight, and "I pressed Save and nothing happened" is exactly what it exists to
         answer. role=alert: a screen reader is told the save was refused, not left to
         find a red line. -->
    <div class="error" id="error" role="alert" aria-live="assertive"></div>
  </div>
  <!-- Which entity, not merely that it is one: two windows on two entries of the same kind
       were told apart only by the tab title, and the tab title is the first thing a wide
       editor group truncates. The name is escaped like every other value on this page. -->
  <h2>${escapeHtml(header.heading)}${chip}</h2>`;
}
