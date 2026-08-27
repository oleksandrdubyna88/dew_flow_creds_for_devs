import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GrayImage, decodeQr } from '../qrSample';
import { QR_CORPUS, RenderOptions, matrixOf, renderQr } from './qrCorpus';

/**
 * The picture half of the reader: thresholding, the finder search, the grid and the sampling.
 *
 * <p>Every case here goes in as pixels, the way a paste arrives. The corpus is forty real
 * payloads — app stores, a device sign-in, one-time-code enrolment and a Google Authenticator
 * export, a café's wi-fi and menu and card, payments, a poster campaign, a calendar invitation,
 * Ukrainian and Japanese text — so a regression in the reader shows up as "the café wi-fi one
 * stopped working", which is a sentence somebody can act on.</p>
 */

function decodeOf(fixture: (typeof QR_CORPUS)[number], options: RenderOptions = {}): string {
  const result = decodeQr(renderQr(matrixOf(fixture), options));
  return result.ok ? result.text : `REFUSED: ${result.reason}`;
}

test('every payload in the corpus decodes from a rendered picture', () => {
  for (const fixture of QR_CORPUS) {
    assert.equal(decodeOf(fixture), fixture.text, `${fixture.name} (v${fixture.version}${fixture.ec})`);
  }
});

test('a small snip, and one zoomed in, both decode', () => {
  for (const fixture of QR_CORPUS) {
    assert.equal(decodeOf(fixture, { scale: 2 }), fixture.text, `${fixture.name} at 2 px per module`);
  }
  // Nine pixels per module is what a screenshot of a phone showing a QR full-screen looks like,
  // and it used to be the case that failed: a block of the threshold grid fits inside one module
  // there, so the block's own statistics say nothing at all.
  const zoomed = QR_CORPUS.filter((fixture) => fixture.version <= 9).slice(0, 8);
  for (const fixture of zoomed) {
    assert.equal(decodeOf(fixture, { scale: 9 }), fixture.text, `${fixture.name} at 9 px per module`);
  }
});

test('the awkward pictures decode too — rotated, inverted, blurred, noisy, tightly cropped', () => {
  const sample = [
    'otpauth github',
    'google authenticator export, 3 accounts',
    'google authenticator export, 10 accounts',
    'wi-fi wpa',
    'ukrainian text',
    'ticket, numeric only',
    'apple app store',
    'vcard',
  ];
  const variants: [string, RenderOptions][] = [
    ['a dark-mode screenshot', { invert: true }],
    ['a noisy capture', { noise: 90 }],
    ['a blurred photo', { blur: 1, scale: 6 }],
    ['cropped to one module of quiet zone', { quiet: 1 }],
    ['held slightly crooked', { rotate: 7, scale: 6 }],
    ['well off-axis', { rotate: 33, scale: 6 }],
    ['sideways', { rotate: 90 }],
  ];
  for (const name of sample) {
    const fixture = QR_CORPUS.find((entry) => entry.name === name);
    assert.ok(fixture !== undefined, `the corpus lost "${name}"`);
    for (const [label, options] of variants) {
      assert.equal(decodeOf(fixture, options), fixture.text, `${fixture.name}, ${label}`);
    }
  }
});

// eslint-disable-next-line complexity -- a loop that damages or draws a picture, then asserts on it
test('a QR pasted with the rest of the page around it still decodes', () => {
  // A `Win+Shift+S` snip is never just the symbol: it carries whatever was beside it, and the
  // page furniture — rules, borders, blocks of text — produces confident false finder patterns.
  const fixture = QR_CORPUS.find((entry) => entry.name === 'café menu');
  assert.ok(fixture !== undefined);
  const symbol = renderQr(matrixOf(fixture), { scale: 5 });
  const width = 700;
  const height = 520;
  const gray = new Uint8Array(width * height).fill(255);
  // Every coordinate below is inside the canvas by construction, so no bounds check.
  const ink = (x: number, y: number): void => {
    gray[y * width + x] = 20;
  };
  for (let x = 40; x < 660; x++) {
    ink(x, 30); // a rule across the top
    ink(x, 31);
  }
  for (let row = 0; row < 9; row++) {
    for (let x = 40; x < 300 - (row % 3) * 40; x++) {
      ink(x, 70 + row * 18); // lines of "text" beside the symbol
    }
  }
  for (let y = 60; y < 460; y++) {
    ink(360, y); // a vertical divider
  }
  const left = 400;
  const top = 90;
  for (let y = 0; y < symbol.height; y++) {
    for (let x = 0; x < symbol.width; x++) {
      gray[(top + y) * width + left + x] = symbol.gray[y * symbol.width + x];
    }
  }
  const page: GrayImage = { gray, width, height };
  const result = decodeQr(page);
  assert.equal(result.ok && result.text, fixture.text);
});

test('a picture with no QR code in it says so instead of inventing one', () => {
  const blank: GrayImage = { gray: new Uint8Array(240 * 180).fill(255), width: 240, height: 180 };
  const blankResult = decodeQr(blank);
  assert.equal(blankResult.ok, false);
  assert.ok(!blankResult.ok && blankResult.reason.length > 0);

  let seed = 7;
  const speckled = new Uint8Array(240 * 180);
  for (let i = 0; i < speckled.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    speckled[i] = seed % 256;
  }
  const noiseResult = decodeQr({ gray: speckled, width: 240, height: 180 });
  assert.equal(noiseResult.ok, false);
});
