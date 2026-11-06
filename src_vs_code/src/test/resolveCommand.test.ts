import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCommandLine, commandRefusal, describeCommand, resolveCommand, shownCommandLine, willNotRunLines } from '../commandLine';
import { NAME_REFUSAL } from '../commandName';
import { commandFingerprint } from '../commandTrust';
import { CommandArg } from '../types';

/**
 * `resolveCommand`: the ONE line of an entry (parent `PLAN_terminal_folder_run.md` §1). `{name}` is filled from the
 * entry's name when the name is on the allow-list, and refused when it is not; what is displayed, approved,
 * fingerprinted and typed is the string this answers.
 */

function E(name: string, command: string, args?: CommandArg[]) {
  return { id: 'e1', name, isSshEnabled: false, isTerminal: true, command, commandArgs: args };
}

function ready(entry: ReturnType<typeof E>) {
  const resolved = resolveCommand(entry);
  assert.equal(resolved.kind, 'ready', JSON.stringify(resolved));
  return resolved.kind === 'ready' ? resolved : assert.fail('not ready');
}

test('no_command_is_empty_whatever_the_name', () => {
  const entry = E('a b', '  ', [{ value: '{name}' }]);
  assert.deepEqual(resolveCommand(entry), { kind: 'empty' });
  assert.equal(shownCommandLine(entry), '');
});

test('no_token_runs_any_name_as_today', () => {
  // A name the line does not use is not judged.
  const resolved = ready(E('a;b', 'ls -la'));
  assert.equal(resolved.line, 'ls -la');
});

test('an_accepted_name_fills_command_and_rows', () => {
  const resolved = ready(E('alert', 'tmux {name}', [{ value: '-t {name}', note: 'n' }]));
  assert.equal(resolved.line, 'tmux alert -t alert');
  assert.equal(resolved.parts.command, 'tmux alert');
  assert.deepEqual(resolved.parts.args[0], { value: '-t alert', note: 'n' });
  assert.equal(buildCommandLine(resolved.parts.command, resolved.parts.args), resolved.line);
});

test('a_refused_name_gives_the_template_and_the_reason', () => {
  const resolved = resolveCommand(E('a b', 'tmux attach', [{ value: '-t {name}' }]));
  assert.equal(resolved.kind, 'refused');
  if (resolved.kind === 'refused') {
    assert.equal(resolved.template, 'tmux attach -t {name}');
    assert.equal(resolved.reason, NAME_REFUSAL);
  }
  assert.ok(!('line' in resolved), 'a refusal carries no line to type');
});

test('a_disabled_row_cannot_refuse_and_is_not_filled', () => {
  const first = ready(E('a b', 'ls', [{ value: '-t {name}', disabled: true }]));
  assert.equal(first.line, 'ls');
  assert.equal(first.parts.args[0].value, '-t {name}');
  const second = ready(E('alert', 'ls', [{ value: '-t {name}', disabled: true }, { value: 'x{name}' }]));
  assert.equal(second.line, 'ls xalert');
  assert.equal(second.parts.args[0].value, '-t {name}');
});

test('shown_is_the_resolved_line_else_the_template', () => {
  const empty = E('a b', '  ', [{ value: '{name}' }]);
  const filled = E('alert', 'tmux {name}', [{ value: '-t {name}', note: 'n' }]);
  const refused = E('a b', 'tmux attach', [{ value: '-t {name}' }]);
  assert.deepEqual([empty, filled, refused].map(shownCommandLine), ['', 'tmux alert -t alert', 'tmux attach -t {name}']);
  assert.deepEqual([empty, filled, refused].map(commandRefusal), [undefined, undefined, NAME_REFUSAL]);
  assert.deepEqual([empty, filled, refused].map(willNotRunLines), [[], [], ['will not run: ' + NAME_REFUSAL]]);
});

test('config_stays_literal_and_name_is_filled', () => {
  assert.equal(shownCommandLine(E('alert', 'openvpn --config {config} --remote {name}')), 'openvpn --config {config} --remote alert');
  // A name cannot smuggle the other token in: `{config}` is not on the allow-list.
  const smuggled = E('{config}', 'openvpn --config {config} --remote {name}');
  assert.equal(resolveCommand(smuggled).kind, 'refused');
  assert.equal(shownCommandLine(smuggled), 'openvpn --config {config} --remote {name}');
});

test('a_rename_changes_the_fingerprint', () => {
  const print = (name: string): string => commandFingerprint('e1', shownCommandLine(E(name, 'x {name}')));
  assert.notEqual(print('a'), print('b'));
  assert.equal(print('a'), print('a'));
});

test('describe_shows_the_resolved_line_and_the_stored_rows', () => {
  const entry = { ...E('alert', 'x', [{ value: '-t {name}', note: 'why' }]), commandNote: 'for' };
  const text = describeCommand(entry);
  assert.ok(text.startsWith('x -t alert'), text);
  assert.ok(text.includes('for'), text);
  assert.ok(text.split('\n').includes('-t {name}  — why'), text);
  const refused = describeCommand({ ...entry, name: 'a b' }).split('\n');
  assert.equal(refused[0], 'x -t {name}');
  assert.ok(refused[1].startsWith('will not run: '), refused.join('\n'));
});

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test('resolving_changes_nothing_it_was_given', () => {
  const entry = deepFreeze(E('alert', 'tmux {name}', [{ value: '-t {name}', note: 'n' }, { value: '{name}', disabled: true }]));
  const before = JSON.stringify(entry);
  assert.doesNotThrow(() => resolveCommand(entry));
  assert.equal(JSON.stringify(entry), before);
  assert.equal(entry.commandArgs?.[1]?.value, '{name}');
});
