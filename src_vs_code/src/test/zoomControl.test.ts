import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  clampScale,
  offsetLabel,
  scalePx,
  zoomApplyScript,
  zoomButtonsScript,
  zoomControlHtml,
  zoomScript,
  zoomStyle,
} from '../zoomControl';

/** T28 — the ± text zoom: the clamp, the label, the factor, and the control's shape. */

test('a sixth press stays at five — and junk is the base, never a crash', () => {
  assert.equal(clampScale(6), UI_SCALE_MAX);
  assert.equal(clampScale(-9), UI_SCALE_MIN);
  assert.equal(clampScale(3.7), 3);
  assert.equal(clampScale('big'), 0);
  assert.equal(clampScale(Number.NaN), 0);
  assert.equal(clampScale(undefined), 0);
});

test('the offset label reads +n / −n and is silent at the base', () => {
  assert.equal(offsetLabel(0), '');
  assert.equal(offsetLabel(5), '+5');
  assert.equal(offsetLabel(-3), '−3');
});

test('each step is ×1.1 from a 13px base, five steps bracketing ×1.61 either way', () => {
  assert.equal(scalePx(0), 13);
  assert.equal(scalePx(1), 14.3);
  assert.ok(Math.abs(scalePx(5) / 13 - 1.61) < 0.01);
  assert.ok(Math.abs(13 / scalePx(-5) - 1.61) < 0.01);
});

test('the control carries both buttons and the live offset slot', () => {
  const html = zoomControlHtml(2);
  assert.ok(html.includes('data-zoom="-1"') && html.includes('data-zoom="1"'));
  assert.ok(html.includes('>+2<'));
  assert.ok(zoomStyle(2).startsWith('font-size: '));
});

/**
 * The two halves (#2). A page that wires its own buttons — as the entity form did — can take the
 * click half without taking the apply half twice, and a page that already has buttons must be able
 * to take the apply half alone. Splitting is only safe while the whole still equals its parts:
 * a page that inlines `zoomScript()` on top of its own wiring binds `button[data-zoom]` twice and
 * posts two presses for one click, which is the reason these are functions rather than one blob.
 */
test('the whole zoom script is exactly its two halves, so no page can bind a press twice', () => {
  assert.equal(zoomScript(), zoomButtonsScript() + zoomApplyScript());
});

test('the click half reports the press under the one spelling the hosts read', () => {
  const buttons = zoomButtonsScript();
  assert.ok(buttons.includes("document.querySelectorAll('button[data-zoom]')"));
  assert.match(buttons, /type: 'zoom', delta:/);
  assert.doesNotMatch(buttons, /uiScale/, 'the apply half must not ride along with the clicks');
});

test('the apply half REPAINTS the page, it does not merely listen', () => {
  // A listener that exists and does nothing is exactly the bug this closes, so the assertion is
  // the DOM write itself: the root font size, and the offset shown beside the buttons.
  const apply = zoomApplyScript();
  assert.match(apply, /event\.data\?\.type !== 'uiScale'/);
  assert.ok(apply.includes("document.body.style.fontSize = event.data.px + 'px';"));
  assert.ok(apply.includes("getElementById('zoomOffset')") && apply.includes('event.data.label'));
  assert.doesNotMatch(apply, /data-zoom/, 'the click half must not ride along with the listener');
});
