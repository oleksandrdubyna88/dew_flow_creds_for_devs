import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { HELP_ARTICLES, HELP_LANGUAGES, bodyFor, helpArticle } from '../helpContent';
import { articleHtml, renderHelpHtml, searchIndex } from '../helpPage';

/**
 * T21 — the help catalog is data, so its guarantees are cheap and real: one fixed article
 * shape, unique ids, the hard-to-guess features leading the index, a visible language fallback,
 * and a page whose index renders in catalog order with breadcrumbs and Back on an article.
 */

const FIELDS = ['title', 'whatItIs', 'why', 'setup', 'usage', 'whatCanGoWrong'] as const;

test('every article carries every field, non-empty, in English — the style is the schema', () => {
  for (const article of HELP_ARTICLES) {
    for (const field of FIELDS) {
      const floor = field === 'title' ? 5 : 20;
      assert.ok(article.en[field].trim().length > floor, `${article.id}.en.${field} is empty or a stub`);
    }
  }
});

test('ids are unique and the index order names the hard-to-guess features first', () => {
  const ids = HELP_ARTICLES.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate article id');
  // The owner's own examples of "what on earth is this": MCP logs, Install…
  assert.deepEqual(ids.slice(0, 2), ['mcp-logs', 'install-menu']);
  assert.ok(ids.indexOf('basics') > ids.indexOf('agents-mcp'), 'the obvious comes last');
});

test('a missing translation falls back to English VISIBLY — never hides an article', () => {
  const article = helpArticle('mcp-logs');
  assert.ok(article !== undefined);
  const de = bodyFor(article, 'de');
  assert.equal(de.fallback, true);
  assert.equal(de.body.title, article.en.title);
  const ru = bodyFor(article, 'ru');
  assert.equal(ru.fallback, false);
  assert.notEqual(ru.body.title, article.en.title);
  assert.ok(articleHtml('mcp-logs', 'de').includes('Noch nicht übersetzt'));
  assert.ok(!articleHtml('mcp-logs', 'ru').includes('fallback'));
});

test('Russian ships complete — every article, every field', () => {
  for (const article of HELP_ARTICLES) {
    assert.ok(article.ru !== undefined, `${article.id} has no Russian`);
    for (const field of FIELDS) {
      const floor = field === 'title' ? 5 : 20;
      assert.ok(article.ru[field].trim().length > floor, `${article.id}.ru.${field}`);
    }
  }
});

test('the search index finds an article by a word in its body, per language', () => {
  const en = searchIndex('en');
  assert.ok(en.some((e) => e.id === 'cli' && e.haystack.includes('uname')));
  const ru = searchIndex('ru');
  assert.ok(ru.some((e) => e.id === 'filters' && e.haystack.includes('предикат')));
});

test('the page renders the index in catalog order, with search at the top and the language switch', () => {
  const html = renderHelpHtml({ language: 'en' });
  const positions = HELP_ARTICLES.map((a) => html.indexOf(`data-open="${a.id}"`));
  assert.ok(positions.every((p) => p !== -1), 'every article is on the index');
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'index order is catalog order');
  assert.ok(html.indexOf('id="search"') < html.indexOf('id="index"'), 'search sits above the index');
  for (const code of HELP_LANGUAGES) {
    assert.ok(html.includes(`<option value="${code}"`), `language ${code} missing from the switch`);
  }
  assert.ok(html.includes('data-zoom="1"'), 'the ± zoom rides on the help page too (T28)');
});

test('an article renders its five sections in the fixed order, escaped', () => {
  const html = articleHtml('config-entities', 'en');
  const order = ['What it is', 'Why', 'How to set it up', 'How to use it', 'What can go wrong'].map((h) =>
    html.indexOf(`<h3>${h}</h3>`),
  );
  assert.ok(order.every((p) => p !== -1));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(!html.includes('<script'), 'article text is escaped');
});

test('the manifest carries the help command in the title bar and the help-only language setting (T22)', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
    contributes: {
      commands: Array<{ command: string; icon?: string }>;
      menus: { 'view/title': Array<{ command?: string; group?: string }> };
      views: Record<string, Array<{ id: string; name: string }>>;
      configuration: { properties: Record<string, { enum?: string[] }> };
    };
  };
  const help = manifest.contributes.commands.find((c) => c.command === 'credSshManager.help');
  assert.ok(help !== undefined, 'the help command is contributed');
  assert.equal(help.icon, '$(question)');
  const inTitle = manifest.contributes.menus['view/title'].find((e) => e.command === 'credSshManager.help');
  assert.ok(inTitle !== undefined, 'the mark sits in the title bar');
  assert.ok((inTitle.group ?? '').startsWith('navigation'), 'in the navigation group, beside the name');
  const view = manifest.contributes.views.credSshManager.find((v) => v.id === 'credSshManagerView');
  assert.equal(view?.name, 'CredsForDevs', 'the view must not repeat the product name as a second word');
  assert.deepEqual(manifest.contributes.configuration.properties['credSshManager.helpLanguage'].enum, [...HELP_LANGUAGES]);
});
