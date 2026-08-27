import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  clampScale,
  offsetLabel,
  scalePx,
  zoomControlHtml,
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
