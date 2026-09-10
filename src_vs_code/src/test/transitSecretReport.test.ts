import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeTransitSecret, logSafe, transitSecretReport } from '../transitSecretReport';

/**
 * The shape of a transit secret, said out loud without saying the secret.
 *
 * <p>The property under test is a security property first and a diagnostic one second, so every
 * case here asserts BOTH: that the line answers the question a person has ("did my PIN survive the
 * chat?") and that the value cannot be read back out of it. The fixtures are distinctive strings
 * precisely so the second assertion can be a grep rather than a hope — the same technique
 * `diagnosticLog.test.ts` uses for the channel as a whole.</p>
 *
 * <p>Every unusual character is written as an escape rather than typed. A test about invisible
 * characters that CONTAINS invisible characters is one nobody can review, and the first draft of
 * this file had a zero-width space in it that no reader could have seen.</p>
 */

/** Six four-letter words joined by '-', the shape `generateSharePin` actually draws. */
const DRAWN = 'able-acid-army-atom-avid-away';

const EN_DASH = '\u2013';
const NO_BREAK_SPACE = '\u00a0';
const ZERO_WIDTH_SPACE = '\u200b';

test('a drawn passphrase reports clean: no edge whitespace, nothing unusual', () => {
  const line = describeTransitSecret(DRAWN);

  assert.equal(line, 'len=29 cp=29 ws=none unusual=none');
});

test('a trailing space is named, and the length is one longer than the sender saw', () => {
  const sender = describeTransitSecret(DRAWN);
  const recipient = describeTransitSecret(`${DRAWN} `);

  assert.match(sender, /ws=none/);
  assert.match(recipient, /ws=trailing/);
  // The comparison two people actually make down a phone line.
  assert.equal(transitSecretReport(`${DRAWN} `).units, transitSecretReport(DRAWN).units + 1);
});

test('leading and trailing whitespace together are reported as both', () => {
  assert.match(describeTransitSecret(` ${DRAWN} `), /ws=both/);
  assert.match(describeTransitSecret(`\t${DRAWN}`), /ws=leading/);
});

test('a hyphen substituted for an en dash is named with its position', () => {
  const mangled = DRAWN.replace('-', EN_DASH);

  const line = describeTransitSecret(mangled);

  assert.match(line, /U\+2013 EN DASH@4/);
  // The length is IDENTICAL to the clean one, which is exactly why this needs naming: a length
  // comparison alone would have acquitted the transport.
  assert.equal(transitSecretReport(mangled).units, transitSecretReport(DRAWN).units);
});

test('invisible characters are named too — a zero-width space and a no-break space', () => {
  const zeroWidth = `able${ZERO_WIDTH_SPACE}-acid-army-atom`;
  const noBreak = `able${NO_BREAK_SPACE}acid-army-atom`;

  assert.match(describeTransitSecret(zeroWidth), /U\+200B ZERO WIDTH SPACE@4/);
  assert.match(describeTransitSecret(noBreak), /U\+00A0 NO-BREAK SPACE@4/);
});

test('an astral character counts once as a code point and twice as a unit', () => {
  const report = transitSecretReport('passphrase\u{1f511}');

  assert.equal(report.codePoints, 11);
  assert.equal(report.units, 12);
});

test('a secret with no printable ASCII gets a COUNT and no per-character detail', () => {
  // The review finding that changed this design: naming every non-ASCII code point would print a
  // secret written in a non-Latin script character by character. With no ASCII bulk for a position
  // to be a small part of, positions ARE the value, so there are none.
  const line = describeTransitSecret('密码密码密码密码');

  assert.match(line, /outside-ascii x8/);
  assert.doesNotMatch(line, /@\d/);
});

test('a value made only of NAMED characters still gets no positions, and is not called clean', () => {
  // The same argument one step further, and the bug the first draft of this module had: eight
  // no-break spaces and en dashes named nothing, counted nothing, and read as `unusual=none`.
  const line = describeTransitSecret(`${NO_BREAK_SPACE.repeat(4)}${EN_DASH.repeat(4)}`);

  assert.doesNotMatch(line, /@\d/);
  assert.doesNotMatch(line, /unusual=none/);
  assert.match(line, /outside-ascii x8/);
});

test('an empty secret says so instead of throwing or reading as clean', () => {
  assert.equal(describeTransitSecret(''), 'len=0 cp=0 ws=none unusual=EMPTY');
});

test('the secret itself never appears in the line', () => {
  const secrets = [
    'zqxjvkbnm-wpfghtyu-secretword',
    ` zqxjvkbnm-wpfghtyu `,
    `zqxjvkbnm${EN_DASH}wpfghtyu`,
    `密码zqxjvkbnm`,
    'zqxjvkbnm\u{1f511}',
  ];

  for (const secret of secrets) {
    const line = describeTransitSecret(secret);
    assert.ok(!line.includes('zqxjvkbnm'), `leaked in: ${line}`);
    assert.ok(!line.includes('wpfghtyu'), `leaked in: ${line}`);
    assert.ok(!line.includes('secretword'), `leaked in: ${line}`);
    assert.ok(!line.includes('密码'), `leaked in: ${line}`);
  }
});

test('many named characters are capped, and the remainder is counted', () => {
  const line = describeTransitSecret(`a${EN_DASH.repeat(12)}b`);

  assert.match(line, /\+4 more/);
});

test('logSafe turns a newline into a visible escape instead of a second log line', () => {
  const forged = 'ionos server\nshare accept OK - nothing to see here';

  const safe = logSafe(forged);

  assert.ok(!safe.includes('\n'));
  assert.match(safe, /\\u000a/);
});

test('logSafe bounds a field so one enormous name cannot push the line out of view', () => {
  const safe = logSafe('x'.repeat(500));

  assert.ok(safe.length < 200);
  assert.match(safe, /\.\.\.\(\+380\)/);
});
