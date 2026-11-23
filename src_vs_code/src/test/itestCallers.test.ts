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
 * It reads each script WHOLE, not line by line: the name, the separator and the value may stand on different lines.
 * A smaller guard than a runtime throw in the builders: it changes no product code, and the product has no caller that can pass a string.</p>
 *
 * <p>Not named after a script on purpose: a new script that calls a builder is found by the scan, not by a list.</p>
 */

const SCRIPTS = path.join(__dirname, '..', '..', 'scripts');
const CALLS_A_BUILDER = /\b(?:buildSshExecArgv|buildBridgeArgv)\s*\(/;
/** What may stand between the parts of a property and its value: white space, with its line breaks, and comments. */
const GAP = String.raw`(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*`;
/**
 * `knownHostsFile`, then `:`, `=`, `??=`, `||=` or `&&=` and the value — or nothing (a shorthand property). Matched over the WHOLE source, never line by line:
 * the name, the separator and the value may be on three lines (a formatter or a long call makes them), and a scan of lines sees none of that.
 */
const PIN_PROPERTY = new RegExp(String.raw`\bknownHostsFile\b(${GAP})((?:\?\?|\|\||&&)?[:=](?!=))?(${GAP})`, 'g');
/**
 * The only values of the property that a rig may write: `await checkedPinOf(...)` or `undefined`. The `await` is REQUIRED: the rig's `checkedPinOf` is async (it
 * asks the client), and without it the builder gets a `Promise`, not a `CheckedPin`, and writes `UserKnownHostsFile=undefined`. `undefined` is its own value.
 */
const CHECKED_VALUE = /^(?:await\s+checkedPinOf\(|undefined\b)/;

const isComment = (line: string): boolean => /^\s*(?:\/\/|\/?\*)/.test(line);

/** The line that holds `index` of `source`: its text, and its number from 1. */
function lineAt(source: string, index: number): { n: number; text: string } {
  const start = source.lastIndexOf('\n', index - 1) + 1;
  const end = source.indexOf('\n', index);
  return { n: source.slice(0, index).split('\n').length, text: source.slice(start, end === -1 ? undefined : end) };
}

/** A property read has a name and no separator, and a `.` before it, though a line break may stand between: `x.knownHostsFile`, `x.\n knownHostsFile`. */
const isRead = (source: string, found: RegExpExecArray): boolean => found[2] === undefined && source.slice(0, found.index).trimEnd().endsWith('.');

/** Whether this match is no plain pin: in a comment, a property read, or a separator and a value that is a checked pin (the value is what follows the match, lines further on or not). */
function isFine(source: string, found: RegExpExecArray, line: string): boolean {
  const written = found[2] !== undefined && CHECKED_VALUE.test(source.slice(found.index + found[0].length));
  return isComment(line) || isRead(source, found) || written;
}

/**
 * The places `{ n, text }` of `source` that give `knownHostsFile` anything but a checked pin: `n` is the line of the name, `text` the name and
 * what follows it up to the end of the value's line. Not places: `knownHostsFile` in a comment, and a property read.
 */
function plainPins(source: string): Array<{ n: number; text: string }> {
  return [...source.matchAll(PIN_PROPERTY)].flatMap((found) => {
    const line = lineAt(source, found.index);
    if (isFine(source, found, line.text)) {
      return [];
    }
    const valueEnds = source.indexOf('\n', found.index + found[0].length);
    const text = source.slice(found.index, valueEnds === -1 ? undefined : valueEnds).replaceAll(/\s+/g, ' ').trim();
    return [{ n: line.n, text }];
  });
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

test('the scan names a plain path, a shorthand, an assignment and a checked pin with no await, and lets an awaited checked pin, undefined, a comment and a read through', () => {
  const bad = [
    "buildSshExecArgv(e, k, 'id', 'key', { knownHostsFile: started.knownHosts });",
    'const o = { port, knownHostsFile };',
    'options.knownHostsFile = started.knownHosts;',
    'buildBridgeArgv(e, { knownHostsFile: parts.pin ?? started.knownHosts }, isSafe);',
    // The same, with a line break between the parts (a formatter or a long line makes them).
    'const o = {\n  port,\n  knownHostsFile:\n    started.knownHosts,\n};',
    'const o = {\n  knownHostsFile\n    : started.knownHosts,\n};',
    'options.knownHostsFile\n  = started.knownHosts;',
    'options\n  .knownHostsFile\n  = started.knownHosts;',
    'options.knownHostsFile ??= started.knownHosts;',
    'options.\n  knownHostsFile =\n  started.knownHosts;',
    'const o = { knownHostsFile: // the pin\n  started.knownHosts };',
    'const o = {\n  knownHostsFile: await\n    parts.pin ?? started.knownHosts,\n};',
    // A checked pin with no `await`: the rig's `checkedPinOf` is async, the builder would get a Promise.
    "buildSshExecArgv(e, k, 'id', 'key', { knownHostsFile: checkedPinOf(rig.out, started.knownHosts) });",
    'const o = {\n  knownHostsFile:\n    checkedPinOf(rig.out, started.knownHosts),\n};',
    'const o = {\n  knownHostsFile: // the pin, checked\n    checkedPinOf(rig.out, started.knownHosts),\n};',
    'const o = {\n  knownHostsFile: await\n    somethingElse(rig.out),\n};',
  ];
  for (const text of bad) {
    assert.equal(plainPins(text).length, 1, text);
  }
  const good = [
    "buildSshExecArgv(e, k, 'id', 'key', { knownHostsFile: await checkedPinOf(rig.out, started.knownHosts) });",
    'const o = { knownHostsFile: undefined };',
    ' * (`knownHostsFile`, no `-F`) is refused by the argv builder.',
    '// knownHostsFile: started.knownHosts',
    'const pin = options.knownHostsFile;',
    // The same, with a line break between the parts.
    'const o = {\n  knownHostsFile:\n    await checkedPinOf(rig.out, started.knownHosts),\n};',
    'const o = {\n  knownHostsFile\n    : await checkedPinOf(rig.out, started.knownHosts),\n};',
    'const o = {\n  knownHostsFile: await\n    checkedPinOf(rig.out, started.knownHosts),\n};',
    'const o = {\n  knownHostsFile: // the pin, checked\n    await checkedPinOf(rig.out, started.knownHosts),\n};',
    'const o = {\n  knownHostsFile:\n    undefined,\n};',
    'const pin = options\n  .knownHostsFile;',
    'const pin = options.\n  knownHostsFile;',
  ];
  for (const text of good) {
    assert.deepEqual(plainPins(text), [], text);
  }
});
