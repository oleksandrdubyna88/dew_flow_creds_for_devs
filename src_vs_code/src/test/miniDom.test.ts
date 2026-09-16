import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MiniDocument } from './miniDom';

/**
 * The harness, tested — because a harness that is wrong makes every test written on it wrong, and
 * in the same direction: green.
 *
 * <p>Its own header already records two defects found that way (`undefined` where a real DOM answers
 * `null`, and a bare tag matched as a class). These two are the third: a selector this could not
 * parse used to match EVERY element, so `querySelector('[data-woven-host]')` — the selector the
 * viewer's page script binds by — answered the first element in the document.</p>
 */

test('a presence selector matches only an element that carries the attribute', () => {
  const document = new MiniDocument();
  const host = document.place('host');
  const other = document.place('other');
  host.dataset.wovenHost = '';

  assert.equal(document.querySelector('[data-woven-host]'), host, 'the one that has it');
  assert.equal(document.querySelectorAll('[data-woven-host]').length, 1, 'and only that one');
  assert.ok(other.id === 'other', 'the other element exists, so the test is not passing on an empty tree');
});

test('a selector the harness cannot parse matches NOTHING, not everything', () => {
  const document = new MiniDocument();
  document.place('first');
  document.place('second');

  // Not a shape this harness supports. The honest answer is none; the dangerous one is all.
  assert.equal(document.querySelector('[aria-hidden="true"]'), null);
  assert.equal(document.querySelectorAll('[aria-hidden="true"]').length, 0);
  // The companion: a shape it DOES support still matches, so this is not passing because the
  // matcher stopped working altogether.
  assert.equal(document.querySelectorAll('div').length, 2, 'the supported selector still finds both');
});

test('a value selector still distinguishes values, and presence does not imply a value', () => {
  const document = new MiniDocument();
  const pin = document.place('pin');
  const cvv = document.place('cvv');
  pin.dataset.key = 'pin';
  cvv.dataset.key = 'cvv';

  assert.equal(document.querySelector('[data-key="pin"]'), pin);
  assert.equal(document.querySelector('[data-key="cvv"]'), cvv);
  assert.equal(document.querySelectorAll('[data-key]').length, 2, 'both carry the attribute');
});
