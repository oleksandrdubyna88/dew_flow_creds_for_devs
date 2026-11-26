import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { MACOS_ON_BRIDGE, REFERENCE_ON_SERVER, SERVER_TEXT_AS_WRITTEN, VARIABLES_ON_SERVER, decideRunSite, scopePickDetail } from '../runSite';

/**
 * §4.6's table, row by row (change 11.1, S4): where a stored command or script an agent asks for through a Remote Bridge runs. Each row is
 * written out here, not derived from the code, so a row that moves is a red line a reviewer reads.
 */

const NAME = 'vpn-up';
const row = (terminalOs: string | undefined, hasReferences: boolean, injectsVariables: boolean) =>
  decideRunSite({ entityName: NAME, terminalOs, hasReferences, injectsVariables });

test('RS1: no reference, "Runs on" not set or Linux: the server', () => {
  assert.deepEqual(row(undefined, false, false), { kind: 'server' });
  assert.deepEqual(row('', false, false), { kind: 'server' }, 'an empty "Runs on" is "not set"');
  assert.deepEqual(row('linux', false, false), { kind: 'server' });
});

test('RS2: "Runs on" Windows: this computer, with or without references, with or without variables', () => {
  for (const hasReferences of [false, true]) {
    for (const injectsVariables of [false, true]) {
      assert.deepEqual(row('windows', hasReferences, injectsVariables), { kind: 'laptop' }, `references ${hasReferences}, variables ${injectsVariables}`);
    }
  }
});

test('RS3: a creds:// reference with "Runs on" not set or Linux is refused: the value would have to reach the server', () => {
  for (const terminalOs of [undefined, 'linux']) {
    assert.deepEqual(row(terminalOs, true, false), { kind: 'refused', code: 'denied', message: REFERENCE_ON_SERVER(NAME) });
    assert.deepEqual(row(terminalOs, true, true), { kind: 'refused', code: 'denied', message: REFERENCE_ON_SERVER(NAME) }, 'the reference is said first');
  }
  assert.match(REFERENCE_ON_SERVER(NAME), /Nothing ran\. To run it on this computer with the value kept here, set its "Runs on" to Windows\.$/);
});

test('RS4: a script that injects a variable with "Runs on" not set or Linux is refused, and the sentence names both ways out', () => {
  for (const terminalOs of [undefined, 'linux']) {
    assert.deepEqual(row(terminalOs, false, true), { kind: 'refused', code: 'denied', message: VARIABLES_ON_SERVER(NAME) });
  }
  assert.match(VARIABLES_ON_SERVER(NAME), /Move a secret value to a creds:\/\/ reference and set "Runs on" to Windows, or remove the variables\.$/);
});

test('RS5: "Runs on" macOS is refused on a bridge, whatever else is true', () => {
  for (const hasReferences of [false, true]) {
    assert.deepEqual(row('macos', hasReferences, false), { kind: 'refused', code: 'denied', message: MACOS_ON_BRIDGE(NAME) });
  }
});

test('RS7: the scope pick says under every Terminal and script row, and under no other, that the stored text goes to the server as written', () => {
  assert.equal(SERVER_TEXT_AS_WRITTEN, 'When it runs on the server, its stored command or script goes there as written: keep secrets in creds:// references.');
  assert.equal(scopePickDetail('terminal'), SERVER_TEXT_AS_WRITTEN);
  assert.equal(scopePickDetail('script'), SERVER_TEXT_AS_WRITTEN);
  for (const kind of ['ssh', 'db', 'credential', 'vpn', 'config', undefined]) {
    assert.equal(scopePickDetail(kind), undefined, String(kind));
  }
});

test('RS6: every refusal is `denied`, never a 404 the client would read as "this window does not have the entry"', () => {
  const answers = [row('linux', true, false), row(undefined, false, true), row('macos', false, false)];
  assert.deepEqual(answers.map((answer) => (answer.kind === 'refused' ? answer.code : answer.kind)), ['denied', 'denied', 'denied']);
});
