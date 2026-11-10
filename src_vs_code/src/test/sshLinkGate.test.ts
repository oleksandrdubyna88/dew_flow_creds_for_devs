import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { sshLinkRefusal } from '../remoteLaunch';

/** E1.S1 of `PLAN_terminal_command_over_ssh.md`: the ONE sentence every road says for a linked Terminal entry. */

test('the_refusal_sentence_is_exact', () => {
  assert.equal(
    sshLinkRefusal({ id: 't1', name: 'deploy', sshEntityId: 's1' }),
    '"deploy" is set to run over SSH, which this version cannot do yet. To run it on this machine, edit it and set "Runs over SSH" to "Do not use".',
  );
});

// A guard for S1-D2, green with the stub as well: "not linked" is absent OR empty.
test('no_link_and_an_empty_link_are_no_refusal', () => {
  assert.equal(sshLinkRefusal({ id: 't1', name: 'deploy' }), undefined);
  assert.equal(sshLinkRefusal({ id: 't1', name: 'deploy', sshEntityId: '' }), undefined);
});

// A guard, green once the file exists: the gate is pure.
test('the_gate_imports_no_vscode', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', 'remoteLaunch.ts'), 'utf8');
  assert.equal(/from\s+['"]vscode['"]/.test(source), false);
  assert.equal(/require\(\s*['"]vscode['"]\s*\)/.test(source), false);
});
