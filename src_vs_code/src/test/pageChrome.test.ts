import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { formHeaderHtml, pageChromeCss } from '../pageChrome';
import { PAGE_MAX_WIDTH_PX } from '../webviewHtml';
import { ZOOM_CSS, zoomStyle } from '../zoomControl';

/**
 * The chrome both forms wear (#53, #54).
 *
 * <p>The entity form and the folder form were two hand-rolled pages: two page widths, two bars,
 * two button paddings, one text-zoom control between them, and a heading that said "Edit folder:"
 * on one and "Edit:" on the other. Nothing shared the chrome, so it drifted — which is exactly
 * the argument `formPanels.ts` already makes about lock behaviour, applied to what the two pages
 * LOOK like.</p>
 *
 * <p>What is pinned here is therefore the shared half itself, not either page's rendering of it:
 * the row primitives the form never had, and the three element ids the two page scripts bind.
 * A header that renders beautifully and posts nothing on Save is the regression a builder
 * invites, so the ids are asserted rather than assumed.</p>
 */

/**
 * CSS compared without its layout: whitespace around punctuation is dropped and every other run
 * collapses to one space, so a reformat is not a behaviour change while a multi-value shorthand
 * such as `flex: 1 1 12em` stays three readable values instead of becoming `1112em`.
 */
function squashed(css: string): string {
  return css.replace(/\s*([{};:,>])\s*/g, '$1').replace(/\s+/g, ' ');
}

test('the chrome carries the row primitive the form never had (#54)', () => {
  const css = squashed(pageChromeCss(0));

  assert.ok(css.includes('.line{display:flex'), 'a field and its button need a flex row to be spaced by');
  assert.ok(
    css.includes('.line>input:not([type=checkbox]):not([type=radio]),.line>select,.line>textarea{flex:1;width:auto'),
    'and the field inside one must give up its 100% width, or the button is pushed onto the next line',
  );
  assert.ok(css.includes('.genRow{display:flex'), 'the generate rows are the same primitive');
  assert.ok(
    css.includes('.genRow>select{flex:1 1 12em;width:auto;min-width:0'),
    'a select in a genRow must not eat the whole row — that is what pushed Generate key pair under it',
  );
  assert.ok(css.includes('.actions{margin-top:8px'), 'a lone button under a field still needs its gap');
});

test('the chrome is the whole page frame, so neither form keeps a private copy', () => {
  const css = pageChromeCss(0);

  assert.ok(css.includes('.topBar'), 'the sticky bar');
  assert.ok(css.includes('.topBar .error'), 'including the exception that keeps the bar from reserving a blank line');
  assert.ok(css.includes(ZOOM_CSS), 'the zoom control is styled wherever the header is rendered');
  assert.ok(css.includes(`max-width: ${PAGE_MAX_WIDTH_PX}px`), 'one page width, not 1280 here and 760 there');
  assert.ok(css.includes('button.secondary'), 'Cancel is a bordered secondary button on both pages');
});

test('the chrome roots the page text size in the shared setting (T28)', () => {
  assert.ok(pageChromeCss(3).includes(zoomStyle(3)), 'the body font size IS the zoom offset');
  assert.notEqual(zoomStyle(3), zoomStyle(0), 'and a different offset is a different page');
});

test('the header renders the three ids both page scripts bind', () => {
  const html = formHeaderHtml({ heading: 'Edit: prod', uiScale: 0 });

  assert.ok(html.includes('id="save"'), 'Save');
  assert.ok(html.includes('id="cancel"'), 'Cancel');
  assert.ok(html.includes('id="error"'), 'the validation line the save gate writes into');
  assert.ok(html.includes('data-zoom="-1"') && html.includes('data-zoom="1"'), 'the text-size control');
  assert.match(html, /<h2>Edit: prod/, 'and the heading, as the page that asked for it spelled it');
});

test('a heading is escaped — it is somebody typed name, and it arrives by sync', () => {
  const html = formHeaderHtml({ heading: 'Edit: <img src=x onerror=alert(1)>', uiScale: 0 });

  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});

test('the chip is shown only when the page has one to show', () => {
  const chipped = formHeaderHtml({ heading: 'Edit: scripts', chip: 'folder', uiScale: 0 });
  assert.match(chipped, /<span class="kindChip">folder<\/span>/);

  const bare = formHeaderHtml({ heading: 'New entity', uiScale: 0 });
  assert.doesNotMatch(bare, /kindChip/, 'an empty chip beside every heading would be decoration');
});

test('a heading is escaped exactly ONCE — the caller hands over the raw value', () => {
  // Both pages escaped at the call site before the builder existed. Keeping that AND escaping
  // here would turn an ampersand into `&amp;amp;` on screen — the classic double-escape, which
  // looks like a typo in somebody's folder name rather than like a bug in the page.
  const html = formHeaderHtml({ heading: 'R&D <x> "q"', chip: 'R&D', uiScale: 0 });

  assert.ok(html.includes('R&amp;D &lt;x&gt; &quot;q&quot;'), html.slice(0, 400));
  assert.ok(!html.includes('R&amp;amp;D'), 'the heading was escaped twice');
  assert.ok(html.includes('<span class="kindChip">R&amp;D</span>'), 'and a chip is a value too');
});
