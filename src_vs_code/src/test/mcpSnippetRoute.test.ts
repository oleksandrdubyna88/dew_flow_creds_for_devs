import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { configSnippetResult, snippetCatalog } from '../mcpSnippetRoute';
import { DEFAULT_SNIPPET_LANGUAGE, SNIPPET_LANGUAGES, snippetFor } from '../configSnippet';
import { CONFIG_KEY_ENV } from '../configKey';
import { configFileNameFor } from '../configFile';
import { EntityMetadata } from '../types';

/**
 * T10 — the MCP config-snippet route. The one guarantee that keeps the two surfaces honest:
 * what the tool serves is BYTE-IDENTICAL to what the viewer renders for the same entry,
 * because both call the same `snippetFor` with the same context. Everything else is the
 * refusal shape and the catalog.
 */

function config(over: Partial<EntityMetadata> = {}): EntityMetadata {
  return {
    id: 'c1',
    name: 'conf1',
    isConfig: true,
    configFormat: 'json',
    configFileName: 'appsettings.Development.json',
    ...over,
  } as EntityMetadata;
}

test('with no language, the catalog — ids, labels, variants — so the agent picks, never guesses', () => {
  const body = configSnippetResult(config(), undefined, undefined);
  assert.equal(body.error, undefined);
  assert.equal(body.envVar, CONFIG_KEY_ENV);
  assert.equal(body.languages.length, SNIPPET_LANGUAGES.length);
  assert.equal(body.snippet, undefined);
  const csharp = body.languages.find((l) => l.id === 'csharp');
  assert.ok(csharp !== undefined, 'C# is in the catalog');
  assert.ok(csharp.variants.length > 0, 'C# offers its variants');
});

test('the snippet is byte-identical to what the viewer renders for the same entry', () => {
  const details = config();
  const body = configSnippetResult(details, 'csharp', 'aspnet');
  const viewer = snippetFor('csharp', 'aspnet', {
    envVar: CONFIG_KEY_ENV,
    fileName: configFileNameFor(details.configFileName, details.configFormat ?? 'json', details.name),
  });
  assert.ok(body.snippet !== undefined, 'a language was asked for, so a snippet must come back');
  assert.equal(body.snippet.code, viewer.code, 'two surfaces, one catalog — or they drift');
  assert.equal(body.snippet.where, viewer.where, 'the target file is the field an agent needs most');
  assert.equal(body.snippet.does, viewer.does);
});

test('an unknown language falls back to the default instead of erroring at a select value', () => {
  const body = configSnippetResult(config(), 'cobol', undefined);
  assert.equal(body.snippet?.language, DEFAULT_SNIPPET_LANGUAGE);
  assert.ok((body.snippet?.code ?? '').length > 0);
});

test('not-found, not-visible and not-a-config are one indistinguishable refusal', () => {
  const missing = configSnippetResult(undefined, 'csharp', undefined);
  const notConfig = configSnippetResult({ id: 'x', name: 'ssh host' } as EntityMetadata, 'csharp', undefined);
  assert.equal(missing.error, notConfig.error);
  assert.match(missing.error ?? '', /no such config/);
  assert.equal(missing.snippet, undefined);
});

test('nothing in the answer can carry a secret — the body has no field for one', () => {
  // A property of the shape: the response is envVar + catalog + code assembled from NAME and
  // FORMAT. Assert the fields, so a future "convenience" field trips this test first.
  const body = configSnippetResult(config(), 'csharp', 'aspnet');
  assert.deepEqual(
    Object.keys(body).sort(),
    ['envVar', 'languages', 'snippet'],
    'a new response field on this route is a disclosure decision — make it in mcpSnippetRoute.ts',
  );
  assert.deepEqual(Object.keys(body.snippet ?? {}).sort(), ['code', 'does', 'language', 'variant', 'where']);
});

test('the catalog is stable and secret-free', () => {
  for (const language of snippetCatalog()) {
    assert.ok(language.id.length > 0, 'a language without an id');
    assert.ok(language.label.length > 0, `${language.id} has no label`);
  }
});
