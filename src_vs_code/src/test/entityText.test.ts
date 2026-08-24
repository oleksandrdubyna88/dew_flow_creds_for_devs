import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatEntityBlock } from '../entityText';
import { EntityMetadata } from '../types';

const base: EntityMetadata = { id: 'e1', name: 'aws sso login', isSshEnabled: false };

test('a terminal entry shows the command, what each argument means, and the whole line', () => {
  // Reported from the details view: a terminal entry rendered its Name and nothing else,
  // and Copy All copied the same nothing. The three things asked for are the command,
  // the argument notes, and the assembled line — all of which describeCommand already
  // produced for the tooltip and simply was not reached from here.
  const block = formatEntityBlock(
    {
      ...base,
      isTerminal: true,
      command: 'aws sso login',
      commandNote: 'Refresh the session before terraform.',
      commandArgs: [
        { value: '--sso-session OD-org', note: 'the SSO profile in ~/.aws/config' },
        { value: '--debug', note: 'verbose output', disabled: true },
      ],
    },
    undefined,
  );

  assert.match(block, /aws sso login --sso-session OD-org/);
  assert.match(block, /Refresh the session before terraform\./);
  assert.match(block, /--sso-session OD-org {2}— the SSO profile in ~\/\.aws\/config/);
  assert.match(block, /--debug {2}— verbose output {2}\(off\)/);
  // A disabled argument is described but must not appear in what runs.
  assert.equal(/aws sso login --sso-session OD-org --debug/.test(block), false);
});

test('a terminal entry with no arguments still shows its command', () => {
  const block = formatEntityBlock({ ...base, isTerminal: true, command: 'terraform plan' }, undefined);

  assert.match(block, /terraform plan/);
});

test('the other kinds are untouched by the terminal branch', () => {
  const ssh = formatEntityBlock({ ...base, name: 'prod', host: 'h1', user: 'root' }, 'pw');

  assert.match(ssh, /Host: h1/);
  assert.match(ssh, /User: root/);
  assert.match(ssh, /Password: pw/);
  assert.equal(/—/.test(ssh), false);
});
