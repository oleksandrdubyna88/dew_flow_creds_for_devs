import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

/**
 * G1, E2.S2 follow-up: a script of `scripts/` that calls `buildSshExecArgv` or `buildBridgeArgv` hands it a CHECKED pin, never a plain path.
 *
 * <p><b>What this holds.</b> E2.S2 made `knownHostsFile` a `CheckedPin` in both builders. `tsc` forbids a string in a `.ts` caller, but the
 * real-`sshd` scripts are `.cjs` and nothing typed them: they went on passing the path, the argv said `UserKnownHostsFile=undefined`, and
 * fifteen checks failed with "No ED25519 host key is known" in a run that no CI job makes. The scan reads every `scripts/*.cjs` that
 * calls a builder and fails, naming file and line, on a `knownHostsFile` whose value is not the rig's `checkedPinOf(...)` (or `undefined`).
 * A smaller guard than a runtime throw in the builders: it changes no product code, and the product has no caller that can pass a string.</p>
 *
 * <p>Not named after a script on purpose: a new script that calls a builder is found by the scan, not by a list.</p>
 */

const SCRIPTS = path.join(__dirname, '..', '..', 'scripts');
const CALLS_A_BUILDER = /\b(?:buildSshExecArgv|buildBridgeArgv)\s*\(/;
/** `knownHostsFile`, then what follows it on the line: a `:` or an `=` and a value, or nothing (a shorthand property). */
const PIN_PROPERTY = /\bknownHostsFile\b\s*([:=](?!=))?\s*(.*)$/;
/** The only values of the property that a rig may write. */
const CHECKED_VALUE = /^(?:checkedPinOf\(|undefined\b)/;

const isComment = (line: string): boolean => /^\s*(?:\/\/|\/?\*)/.test(line);

/** Whether this line of a script is no plain pin: no `knownHostsFile` in code, a property read (`x.knownHostsFile`), or a value that is a checked pin. */
function isFine(text: string): boolean {
  const found = isComment(text) ? null : PIN_PROPERTY.exec(text);
  if (found === null) {
    return true;
  }
  const [, separator, value] = found;
  return separator === undefined ? text[found.index - 1] === '.' : CHECKED_VALUE.test(value);
}

/** The lines `{ n, text }` of `source` that give `knownHostsFile` anything but a checked pin. A property read (`x.knownHostsFile`) is not one. */
function plainPins(source: string): Array<{ n: number; text: string }> {
  return source.split(/\r?\n/).flatMap((text, i) => (isFine(text) ? [] : [{ n: i + 1, text: text.trim() }]));
}

const callers = (): string[] =>
  fs.readdirSync(SCRIPTS).filter((name) => name.endsWith('.cjs') && CALLS_A_BUILDER.test(fs.readFileSync(path.join(SCRIPTS, name), 'utf8'))).sort();

test('every script that calls an argv builder gives it a checked pin, not a path', () => {
  const found = callers();
  const plain = found.flatMap((name) => plainPins(fs.readFileSync(path.join(SCRIPTS, name), 'utf8')).map((line) => `${name}:${line.n}: ${line.text}`));
  assert.deepEqual(plain, []);
  // The scan is alive: the two real-sshd scripts that E2.S2 left behind are among its callers.
  assert.ok(found.includes('itestForwardAgent.cjs') && found.includes('itestNoSharing.cjs'), `callers found: ${found.join(', ')}`);
});

test('the scan names a plain path, a shorthand and an assignment, and lets a checked pin, undefined, a comment and a read through', () => {
  const bad = [
    "buildSshExecArgv(e, k, 'id', 'key', { knownHostsFile: started.knownHosts });",
    'const o = { port, knownHostsFile };',
    'options.knownHostsFile = started.knownHosts;',
    'buildBridgeArgv(e, { knownHostsFile: parts.pin ?? started.knownHosts }, isSafe);',
  ];
  for (const text of bad) {
    assert.equal(plainPins(text).length, 1, text);
  }
  const good = [
    "buildSshExecArgv(e, k, 'id', 'key', { knownHostsFile: checkedPinOf(rig.out, started.knownHosts) });",
    'const o = { knownHostsFile: undefined };',
    ' * (`knownHostsFile`, no `-F`) is refused by the argv builder.',
    '// knownHostsFile: started.knownHosts',
    'const pin = options.knownHostsFile;',
  ];
  for (const text of good) {
    assert.deepEqual(plainPins(text), [], text);
  }
});
