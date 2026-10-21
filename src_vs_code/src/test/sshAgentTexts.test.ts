import assert from 'node:assert/strict';
import { test } from 'node:test';
import { durationText, timeLeftText } from '../sshAgentTexts';

/** How the SSH agent's prompt words a duration — a fixed bound to the nearest unit, a time running out rounded down. */

test('a fixed bound reads to the nearest unit: minutes, or seconds under a minute', () => {
  assert.equal(durationText(300_000), '5 minutes');
  assert.equal(durationText(60_000), '1 minute');
  assert.equal(durationText(90_000), '2 minutes');
  assert.equal(durationText(20), '1 second');
  assert.equal(durationText(45_000), '1 minute', 'it rounds — which is why a time that is running out does not use it');
});

test('the time left is rounded DOWN — 30 seconds never reads "1 minute"', () => {
  assert.equal(timeLeftText(30_000), '30 seconds');
  assert.equal(timeLeftText(210_000), '3 minutes', 'three and a half minutes is three');
  assert.equal(timeLeftText(300_000), '5 minutes');
});

test('the time left is in seconds below two minutes, minutes from two', () => {
  assert.equal(timeLeftText(119_999), '119 seconds');
  assert.equal(timeLeftText(120_000), '2 minutes');
  assert.equal(timeLeftText(60_000), '60 seconds');
  assert.equal(timeLeftText(45_000), '45 seconds');
});

test('the time left never reads "0 seconds", and one second is singular', () => {
  assert.equal(timeLeftText(0), '1 second');
  assert.equal(timeLeftText(20), '1 second');
  assert.equal(timeLeftText(1_999), '1 second');
  assert.equal(timeLeftText(2_000), '2 seconds');
});
