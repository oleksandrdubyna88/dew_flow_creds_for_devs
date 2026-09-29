import assert from 'node:assert/strict';
import { test } from 'node:test';
import { secretKindRefusal, validateAgentFields } from '../agentFieldValidation';
import { AGENT_KINDS, agentKindHelp } from '../agentKindFields';
import { ENTITY_KINDS } from '../types';

/**
 * The sentences an agent gets back, and the shapes that pass — at the pure seam, so each is a line
 * rather than a vault. What lands in storage is `mcpCreateHooks.test.ts`'s job.
 */

function refusal(kind: Parameters<typeof validateAgentFields>[0], fields: Record<string, unknown>): string {
  const verdict = validateAgentFields(kind, fields);
  return verdict.ok ? '' : verdict.message;
}

test('an unknown key is refused with the whole list of what the kind takes, required ones marked', () => {
  assert.equal(
    refusal('terminal', { host: 'x' }),
    '`host` is not a field of a terminal entry. A terminal entry takes: command (required), args, commandNote, terminalOs, notes — see creds_kind_help.',
  );
});

test('every secret word is refused inside fields with the sentence that points at secret and secretKind', () => {
  for (const word of ['secret', 'secretKind', 'password', 'privateKey', 'vpnConfig', 'dbConnection', 'configBody', 'totp']) {
    assert.equal(
      refusal('credential', { [word]: 'v' }),
      `\`${word}\` is a secret: send it as \`secret\`, or prefer \`secretKind\` so the window makes it.`,
    );
  }
});

test('a wrong type, a bad enum word and a bad row shape each say what would be right', () => {
  assert.match(refusal('ssh', { host: 'h', port: '22' }), /^`port` must be a positive integer\. A ssh entry takes/);
  assert.match(refusal('ssh', { host: 'h', port: 0 }), /`port` must be a positive integer/);
  assert.match(refusal('db', { dbType: 'oracle' }), /^`dbType` must be one of: postgres, mysql, mssql, mongodb\./);
  assert.match(refusal('terminal', { command: 'ls', args: 'not rows' }), /`args` must be an array of \{ value, note\?, enabled\? \}/);
  assert.match(refusal('terminal', { command: 'ls', args: [{ note: 'no value' }] }), /`args` must be an array of/);
  assert.match(refusal('script', { script: 'x', vars: [{ value: 'nameless' }] }), /`vars` must be an array of \{ name, value, note\?, enabled\? \}/);
  assert.match(refusal('ssh', { host: 'h', tags: '!!!' }), /`tags` must be one or more labels/);
});

test('a missing required field is refused by name, and a blank one counts as missing', () => {
  assert.match(refusal('terminal', {}), /^A terminal entry needs `command`\. A terminal entry takes/);
  assert.match(refusal('terminal', { command: '   ' }), /needs `command`/);
  assert.match(refusal('ssh', { user: 'u' }), /needs `host`/);
  assert.match(refusal('script', { scriptLanguage: 'bash' }), /needs `script`/);
});

test('values land by store: the record, the login/URL fields, or the notes — with the kind\'s defaults', () => {
  const credential = validateAgentFields('credential', { login: ' me ', url: 'https://x', notes: '  kept as typed  ' });
  const terminal = validateAgentFields('terminal', {
    command: ' pwsh ',
    args: [{ value: ' -File ', note: ' the script ' }, { value: '', note: 'dropped: blank' }, { value: '-v', enabled: false }],
    terminalOs: 'windows',
  });
  const script = validateAgentFields('script', { script: '  body\n', vars: [{ name: ' A ', value: '1', enabled: true }] });
  const config = validateAgentFields('config', { configFileName: '.env' });

  assert.deepEqual(credential, { ok: true, values: { details: {}, fields: { login: 'me', url: 'https://x' }, notes: '  kept as typed  ' } });
  assert.deepEqual(terminal, {
    ok: true,
    values: {
      details: {
        command: 'pwsh',
        commandArgs: [{ value: '-File', note: 'the script' }, { value: '-v', disabled: true }],
        terminalOs: 'windows',
      },
    },
  });
  assert.deepEqual(script, { ok: true, values: { details: { scriptLanguage: 'bash', script: '  body\n', scriptVars: [{ name: 'A', value: '1' }] } } });
  assert.deepEqual(config, { ok: true, values: { details: { configFormat: 'json', configFileName: '.env' } } });
});

test('tags become the word list the record holds, deduplicated and cleaned', () => {
  const verdict = validateAgentFields('ssh', { host: 'h', tags: ' prod  eu-west prod ' });

  assert.deepEqual(verdict.ok && verdict.values.details.tags, ['prod', 'eu-west']);
});

test('payment is refused in the owner\'s words whatever was sent', () => {
  assert.match(refusal('payment', {}), /cannot be created by an agent/);
  assert.match(refusal('payment', { anything: 1 }), /cannot be created by an agent/);
});

test('every example the help hands out passes the validator it will be judged by', () => {
  // The example is what an agent copies. One that the window would refuse is worse than none.
  for (const kind of ENTITY_KINDS.filter((k) => AGENT_KINDS[k].notCreatable === undefined)) {
    const example = agentKindHelp(kind).example as { fields: Record<string, unknown>; secretKind?: string };
    const verdict = validateAgentFields(kind, example.fields);

    assert.equal(verdict.ok, true, `${kind}: ${JSON.stringify(verdict)}`);
    assert.equal(secretKindRefusal(kind, example.secretKind), undefined, `${kind}: the example's secretKind is honoured`);
  }
});

test('secretKind is honoured only where the secret is a password', () => {
  assert.equal(secretKindRefusal('ssh', 'passphrase'), undefined);
  assert.equal(secretKindRefusal('db', undefined), undefined, 'not asking is always fine');
  assert.equal(
    secretKindRefusal('db', 'password'),
    "A db entry's secret is its connection string, which cannot be generated here — send it as `secret`.",
  );
  assert.match(secretKindRefusal('config', 'password') ?? '', /config body/);
  assert.match(secretKindRefusal('vpn', 'password') ?? '', /VPN configuration/);
  assert.match(secretKindRefusal('sshkey', 'password') ?? '', /private key/);
});
