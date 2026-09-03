import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AddressCells, EMPTY_ADDRESS, countryCode, formatAddress, parseAddress } from '../addressFormat';
import { paymentMarkup } from '../paymentFormMarkup';
import { paymentCardMarkup } from '../paymentViewCard';
import { paymentCardFor } from '../paymentViewMessages';
import { cardInputsFrom } from '../cardFormFields';

/**
 * The billing address as cells. It was one free textarea, which is where an address goes to become
 * unusable: nobody can copy just the postcode out of it, and a form that asks for "city" cannot be
 * filled from it.
 *
 * <p>The parse is a GUESS by design, following `commandParse`'s doctrine — every guess lands in a
 * box somebody can correct in a second. So these tests assert that nothing is dropped and that the
 * common shapes land right, never that the parser is clever.</p>
 */

const cells = (over: Partial<AddressCells>): AddressCells => ({ ...EMPTY_ADDRESS, ...over });

test('the United States writes the city, the state and the ZIP on one line', () => {
  const address = cells({ line1: '1 Infinite Loop', city: 'Cupertino', region: 'CA', postal: '95014', country: 'US' });

  assert.equal(formatAddress(address), '1 Infinite Loop\nCupertino, CA 95014\nUS');
});

test('Germany and Poland put the postcode before the city', () => {
  const berlin = cells({ line1: 'Unter den Linden 1', city: 'Berlin', postal: '10117', country: 'Germany' });
  const warsaw = cells({ line1: 'Marszalkowska 1', city: 'Warszawa', postal: '00-001', country: 'PL' });

  assert.equal(formatAddress(berlin), 'Unter den Linden 1\n10117 Berlin\nGermany');
  assert.equal(formatAddress(warsaw), 'Marszalkowska 1\n00-001 Warszawa\nPL');
});

test('the United Kingdom gives the postcode a line of its own', () => {
  const address = cells({ line1: '10 Downing Street', city: 'London', postal: 'SW1A 2AA', country: 'United Kingdom' });

  assert.equal(formatAddress(address), '10 Downing Street\nLondon\nSW1A 2AA\nUnited Kingdom');
});

test('a country nobody put in the table is written plainly rather than wrongly', () => {
  const address = cells({ line1: 'Keizersgracht 1', city: 'Amsterdam', postal: '1015 CJ', country: 'NL' });

  assert.equal(formatAddress(address), 'Keizersgracht 1\nAmsterdam\n1015 CJ\nNL');
});

test('an empty cell contributes no line, so a half-filled address is short and not gappy', () => {
  assert.equal(formatAddress(cells({ line1: 'Somewhere' })), 'Somewhere');
  assert.equal(formatAddress(EMPTY_ADDRESS), '', 'and an empty address is empty, not a stack of blanks');
});

test('a pasted one-liner lands in the cells, and nothing is dropped on the way', () => {
  const parsed = parseAddress('1 Infinite Loop, Cupertino, CA, 95014, United States');

  assert.equal(parsed.line1, '1 Infinite Loop');
  assert.equal(parsed.postal, '95014');
  assert.equal(parsed.country, 'United States');
  assert.equal(parsed.region, 'CA');
  assert.equal(parsed.city, 'Cupertino');
});

test('a postcode written beside the city is split out rather than left inside it', () => {
  const parsed = parseAddress('Unter den Linden 1\n10117 Berlin\nGermany');

  assert.equal(parsed.postal, '10117');
  assert.equal(parsed.city, 'Berlin', 'the city cell holds a city, not "10117 Berlin"');
  assert.equal(parsed.country, 'Germany');
});

test('a British postcode is recognised by its shape', () => {
  const parsed = parseAddress('10 Downing Street\nLondon\nSW1A 2AA\nUnited Kingdom');

  assert.equal(parsed.postal, 'SW1A 2AA');
  assert.equal(parsed.city, 'London');
});

test('garbage and emptiness produce cells rather than a throw', () => {
  assert.deepEqual(parseAddress(''), EMPTY_ADDRESS);
  assert.equal(parseAddress('not an address at all').line1, 'not an address at all');
  assert.equal(parseAddress('   ').line1, '', 'whitespace is nothing at all');
});

test('a house number in the middle is not mistaken for a postcode', () => {
  const parsed = parseAddress('Somestreet 1234\nAmsterdam\nNL');

  assert.equal(parsed.line1, 'Somestreet 1234', 'the street keeps its number');
});

test('the country box is read by code or by name, and an unknown one is left alone', () => {
  assert.equal(countryCode('us'), 'US');
  assert.equal(countryCode('  Germany '), 'DE');
  assert.equal(countryCode('United Kingdom'), 'GB');
  assert.equal(countryCode('Atlantis'), '', 'nothing in the table claims it, so it formats plainly');
});

/**
 * The two surfaces, checked where they meet the cells — the form that fills them and the card that
 * shows them.
 */
test('the form asks for the cells, and shows the block it will store', () => {
  const markup = paymentMarkup((id) => `<fieldset id="${id}">`, 'card');

  for (const id of ['cardAddressLine1', 'cardAddressLine2', 'cardAddressCity', 'cardAddressRegion', 'cardAddressPostal']) {
    assert.ok(markup.includes(`id="${id}"`), `${id} has a box of its own`);
  }
  assert.match(markup, /id="addressPaste"/, 'and there is somewhere to paste a whole one');
  assert.match(markup, /id="addressPreview"[\s\S]{0,40}readonly/, 'with the assembled block underneath');
  assert.ok(!markup.includes('id="cardAddress"'), 'the single free textarea is gone');
});

test('the card shows every cell on its own row, and the block on a row of its own', () => {
  const html = paymentCardMarkup(paymentCardFor('e1', 'card', {
    addressLine1: '1 Infinite Loop',
    addressCity: 'Cupertino',
    addressRegion: 'CA',
    addressPostal: '95014',
    address: '1 Infinite Loop\nCupertino, CA 95014',
  }, () => 0.5));

  assert.match(html, /id="pay_addressCity"/, 'the city can be copied on its own');
  assert.match(html, /id="pay_addressPostal"/, 'and so can the postcode, which is the whole point');
  assert.match(html, /<textarea readonly rows="4" id="pay_address"/, 'the block gets a box that fits it');
  assert.ok(!html.includes('Cupertino'), 'and no value reaches the page — it arrives by message');
});

test('an older record with only the block opens with its cells filled in', () => {
  // A guess, visible and correctable, rather than an address that vanishes because the build that
  // wrote it did not have cells.
  const boxes = cardInputsFrom({ address: '1 Infinite Loop\nCupertino, CA, 95014, United States' });

  assert.equal(boxes.cardAddressLine1, '1 Infinite Loop');
  assert.equal(boxes.cardAddressPostal, '95014');
});

test('a record that already has cells is not re-parsed from its own block', () => {
  const boxes = cardInputsFrom({ addressLine1: 'Typed by hand', address: 'Something else entirely' });

  assert.equal(boxes.cardAddressLine1, 'Typed by hand', 'what is stored beats what could be guessed');
});
