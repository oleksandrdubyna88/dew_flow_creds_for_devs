import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  describeTarget,
  endpointProblem,
  identityOf,
  normalizeTarget,
  targetProblem,
  toInputs,
  withTarget,
  withoutTarget,
} from '../backupTargets';
import { BackupTargetInput, BackupTargetSummary } from '../orgBackupClient';

/**
 * The destinations as the tab edits them, pure: the server's own refusals mirrored so a typo costs
 * no probe, and the list a save sends built from what the server returned plus the one edited row.
 *
 * <p>The property that matters most is negative and easy to lose: nothing here carries a credential
 * further than the one request it was typed for. `toInputs` builds key-less requests from key-less
 * summaries, and that is what lets a save send the list WHOLE.</p>
 */

const s3 = (over: Partial<BackupTargetInput> = {}): BackupTargetInput => ({
  kind: 's3',
  endpoint: 'https://s3.example.com',
  region: 'eu-central-1',
  bucket: 'vaults',
  prefix: 'nightly',
  ...over,
});

const azure = (over: Partial<BackupTargetInput> = {}): BackupTargetInput => ({
  kind: 'azure-blob',
  endpoint: 'https://acct.blob.core.windows.net',
  region: '',
  bucket: 'vaults',
  prefix: 'nightly',
  ...over,
});

test('the server refusals are mirrored, in its own words, before any request', () => {
  assert.match(targetProblem(s3({ kind: 'ftp' }), false), /'ftp' is not a kind of destination/);
  assert.match(targetProblem(s3({ endpoint: 'not a url' }), false), /not a URL/);
  assert.match(targetProblem(s3({ endpoint: 'http://s3.example.com' }), false), /must be https/);
  assert.match(targetProblem(s3({ bucket: '' }), false), /bucket name is required/);
  assert.match(targetProblem(azure({ bucket: '' }), false), /container name is required/);
});

test('plain http is accepted on loopback and nowhere else — the developer running MinIO', () => {
  assert.equal(endpointProblem('http://127.0.0.1:9000'), '');
  assert.equal(endpointProblem('http://localhost:9000'), '');
  assert.equal(endpointProblem('http://[::1]:9000'), '');
  assert.match(endpointProblem('http://192.168.1.10:9000'), /must be https/, '"it is on our network" is the assumption');
  assert.equal(endpointProblem('https://192.168.1.10'), '', 'https is accepted wherever it points');
});

test('both halves of a credential, or neither — and the missing one is NAMED', () => {
  assert.match(targetProblem(s3({ accessKeyId: 'AKID' }), true), /secretAccessKey is missing/);
  assert.match(targetProblem(s3({ secretAccessKey: 'shh' }), true), /accessKeyId is missing/);
  assert.match(targetProblem(azure({ accountName: 'acct' }), true), /accountKey is missing/);
  assert.equal(targetProblem(s3({ accessKeyId: 'AKID', secretAccessKey: 'shh' }), false), '');
  assert.equal(targetProblem(azure({ accountName: 'acct', accountKey: 'a2V5' }), false), '');
});

test('neither half is "keep the sealed ones" only where something is sealed; the first save needs both', () => {
  assert.equal(targetProblem(s3(), true), '', 'an edit that leaves the keys out keeps them');
  assert.match(targetProblem(s3(), false), /required the first time this destination is saved/);
  assert.match(targetProblem(azure(), false), /account name and an account key/);
});

test('a region typed under S3 is not sent once the kind is Azure, and empty credentials are OMITTED', () => {
  // Plan gate (local): the hidden region input survives a switch of kind, and the server has no
  // region for Azure. And "left empty" must arrive as ABSENT — the server reads an absent credential
  // as "keep the sealed ones", and an empty string is half a credential.
  const sent = normalizeTarget({
    ...azure({ region: 'eu-central-1' }),
    accountName: '  ',
    accountKey: '',
    accessKeyId: undefined,
  });

  assert.equal(sent.region, '');
  assert.deepEqual(Object.keys(sent).sort(), ['bucket', 'endpoint', 'kind', 'prefix', 'region']);
  assert.equal(normalizeTarget(s3({ region: ' eu-west-1 ', accessKeyId: ' AKID ', secretAccessKey: 'shh' })).region, 'eu-west-1');
  assert.equal(normalizeTarget(s3({ accessKeyId: ' AKID ', secretAccessKey: 'shh' })).accessKeyId, 'AKID', 'trimmed');
});

test('a destination is described in the words the server and the page use, and identified as the server identifies it', () => {
  assert.equal(describeTarget(s3()), 's3 vaults/nightly');
  assert.equal(describeTarget(s3({ prefix: '' })), 's3 vaults');
  assert.equal(describeTarget(azure()), 'azure vaults/nightly');
  assert.equal(identityOf(s3()), 's3|https://s3.example.com|vaults|nightly');
  assert.equal(identityOf(s3({ region: 'eu-west-1' })), identityOf(s3()), 'the region is a setting, not an identity');
});

test('the summaries the server returned become key-less requests — the "keep the sealed ones" shape', () => {
  const summaries: BackupTargetSummary[] = [
    { kind: 's3', endpoint: 'https://s3.example.com', region: 'eu-central-1', bucket: 'vaults', prefix: 'nightly', credentials: 'sealed' },
    { kind: 'azure-blob', endpoint: 'https://acct.blob.core.windows.net', region: '', bucket: 'vaults', prefix: 'old', credentials: 'unopenable' },
  ];

  const inputs = toInputs(summaries);

  assert.equal(inputs.length, 2);
  for (const input of inputs) {
    assert.deepEqual(Object.keys(input).sort(), ['bucket', 'endpoint', 'kind', 'prefix', 'region'], 'no credential field, not even empty');
  }
  assert.ok(!JSON.stringify(inputs).includes('credentials'), 'and the credentials WORD does not travel either');
});

test('editing replaces the row in place and adding appends — new lists, the input untouched', () => {
  const list = toInputs([
    { kind: 's3', endpoint: 'https://s3.example.com', region: 'eu-central-1', bucket: 'vaults', prefix: 'a', credentials: 'sealed' },
    { kind: 's3', endpoint: 'https://s3.example.com', region: 'eu-central-1', bucket: 'vaults', prefix: 'b', credentials: 'sealed' },
  ]);
  const edited = s3({ prefix: 'b', region: 'eu-west-1' });

  const replaced = withTarget(list, edited, 1);
  const appended = withTarget(list, s3({ prefix: 'c' }), undefined);
  const removed = withoutTarget(list, 0);

  assert.deepEqual(replaced.map((t) => t.prefix), ['a', 'b']);
  assert.equal(replaced[1].region, 'eu-west-1');
  assert.deepEqual(appended.map((t) => t.prefix), ['a', 'b', 'c']);
  assert.deepEqual(removed.map((t) => t.prefix), ['b']);
  assert.deepEqual(withoutTarget(list, 7), list, 'an index out of range changes nothing');
  assert.deepEqual(list.map((t) => t.prefix), ['a', 'b'], 'and the input is what it was');
});
