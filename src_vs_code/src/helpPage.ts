import * as crypto from 'node:crypto';
import { escapeHtml, jsonForScript } from './webviewHtml';
import { ZOOM_CSS, zoomControlHtml, zoomScript, zoomStyle } from './zoomControl';
import {
  HELP_ARTICLES,
  HELP_LANGUAGES,
  HELP_LANGUAGE_LABELS,
  HelpLanguage,
  bodyFor,
} from './helpContent';

/**
 * The help page, as pure markup (tails T21): the index in catalog order, one article view with
 * breadcrumbs and Back, a search box at the top centre, the language switch, and the ± zoom
 * every page carries. Routing is client-side page STATE — index ↔ article — never a panel
 * re-creation, so Back is instant and the search box keeps its text.
 *
 * <p>`vscode`-free, like every other page module: what the index lists, in what order, and what
 * an article renders is asserted directly.</p>
 */

export interface HelpPageOptions {
  readonly language: HelpLanguage;
  readonly uiScale?: number;
}

const SECTION_LABELS: Record<HelpLanguage, Readonly<Record<'whatItIs' | 'why' | 'setup' | 'usage' | 'whatCanGoWrong', string>>> = {
  en: { whatItIs: 'What it is', why: 'Why', setup: 'How to set it up', usage: 'How to use it', whatCanGoWrong: 'What can go wrong' },
  ru: { whatItIs: 'Что это', why: 'Зачем', setup: 'Как настроить', usage: 'Как пользоваться', whatCanGoWrong: 'Что может пойти не так' },
  uk: { whatItIs: 'Що це', why: 'Навіщо', setup: 'Як налаштувати', usage: 'Як користуватися', whatCanGoWrong: 'Що може піти не так' },
  de: { whatItIs: 'Was es ist', why: 'Warum', setup: 'Einrichtung', usage: 'Verwendung', whatCanGoWrong: 'Was schiefgehen kann' },
  es: { whatItIs: 'Qué es', why: 'Por qué', setup: 'Cómo configurarlo', usage: 'Cómo usarlo', whatCanGoWrong: 'Qué puede salir mal' },
};

const UI: Record<HelpLanguage, { search: string; back: string; home: string; fallback: string; noHits: string }> = {
  en: { search: 'Search the help…', back: '← Back', home: 'Help', fallback: 'Not translated yet — showing English.', noHits: 'Nothing matches.' },
  ru: { search: 'Поиск по справке…', back: '← Назад', home: 'Справка', fallback: 'Ещё не переведено — показан английский.', noHits: 'Ничего не найдено.' },
  uk: { search: 'Пошук у довідці…', back: '← Назад', home: 'Довідка', fallback: 'Ще не перекладено — показано англійську.', noHits: 'Нічого не знайдено.' },
  de: { search: 'Hilfe durchsuchen…', back: '← Zurück', home: 'Hilfe', fallback: 'Noch nicht übersetzt — Englisch wird angezeigt.', noHits: 'Keine Treffer.' },
  es: { search: 'Buscar en la ayuda…', back: '← Atrás', home: 'Ayuda', fallback: 'Aún sin traducir — se muestra en inglés.', noHits: 'Sin resultados.' },
};

/** What the page's search runs over — titles and bodies in the shown language, per article. */
export function searchIndex(language: HelpLanguage): ReadonlyArray<{ id: string; title: string; haystack: string }> {
  return HELP_ARTICLES.map((article) => {
    const { body } = bodyFor(article, language);
    return {
      id: article.id,
      title: body.title,
      haystack: [body.title, body.whatItIs, body.why, body.setup, body.usage, body.whatCanGoWrong]
        .join(' ')
        .toLowerCase(),
    };
  });
}

/**
 * One section's text, as paragraphs, bullets and emphasis.
 *
 * <p><b>Escaped first, marked up second, and the order is the whole safety of it.</b> Every
 * character that could open a tag is gone before any tag of ours is added, so the markup below
 * can only ever produce the four elements it names.</p>
 *
 * <p>It exists because the catalog had been written as though it were supported: twelve places
 * carried `**emphasis**` that reached the reader as literal asterisks, and no article could
 * express a list at all — which is what a page describing ten switches and sixteen tools needs
 * most. Three constructs, deliberately: a blank line starts a paragraph, a line beginning "- "
 * is a bullet, and `**text**` is emphasis. Anything more would be a markdown parser, and this
 * is a help page.</p>
 */
export function bodyHtml(text: string): string {
  return blocks(text)
    .map((block) => (block.bullets ? list(block.lines) : `<p>${inline(block.lines.join(' '))}</p>`))
    .join('\n');
}

interface Block {
  bullets: boolean;
  lines: string[];
}

/** Blank lines separate blocks; a block of "- " lines is a list, anything else a paragraph. */
function blocks(text: string): Block[] {
  const found: Block[] = [];
  for (const raw of text.split(/\n\s*\n/)) {
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length > 0) {
      found.push({ bullets: lines.every((line) => line.startsWith('- ')), lines });
    }
  }
  return found;
}

function list(lines: readonly string[]): string {
  return `<ul>${lines.map((line) => `<li>${inline(line.slice(2))}</li>`).join('')}</ul>`;
}

/** Escaped, then the one inline construct. Nothing here can widen what the escape allowed. */
function inline(text: string): string {
  return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

/** The article markup: five labelled sections in the fixed order, plus the fallback note. */
export function articleHtml(id: string, language: HelpLanguage): string {
  const article = HELP_ARTICLES.find((candidate) => candidate.id === id);
  if (article === undefined) {
    return '';
  }
  const { body, fallback } = bodyFor(article, language);
  const labels = SECTION_LABELS[language];
  const sections: Array<[keyof typeof labels, string]> = [
    ['whatItIs', body.whatItIs],
    ['why', body.why],
    ['setup', body.setup],
    ['usage', body.usage],
    ['whatCanGoWrong', body.whatCanGoWrong],
  ];
  return `<article data-article="${escapeHtml(id)}">
    <h2>${escapeHtml(body.title)}</h2>
    ${fallback ? `<p class="fallback">${escapeHtml(UI[language].fallback)}</p>` : ''}
    ${sections
      .map(([key, text]) => `<h3>${escapeHtml(labels[key])}</h3>${bodyHtml(text)}`)
      .join('\n')}
  </article>`;
}

export function renderHelpHtml(options: HelpPageOptions): string {
  const nonce = crypto.randomBytes(16).toString('base64url');
  const language = options.language;
  const index = searchIndex(language);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
${helpStyles(options.uiScale ?? 0)}
</style>
</head>
<body>
${helpBody(language, index, options.uiScale ?? 0)}
${helpScript(nonce, language, index)}
</body>
</html>`;
}

function helpStyles(uiScale: number): string {
  return `
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
         background: var(--vscode-editor-background); padding: 16px 24px; max-width: 900px;
         margin: 0 auto; ${zoomStyle(uiScale)} }
  .topBar { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
  .topBar .crumbs { flex: 1; min-width: 0; opacity: .8; }
  .crumbs a { cursor: pointer; text-decoration: underline; }
  .searchRow { display: flex; justify-content: center; margin: 4px 0 18px; }
  #search { width: min(520px, 100%); padding: 8px 12px; font-size: 1.05em;
            background: var(--vscode-input-background); color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, transparent); border-radius: 4px; }
  select { background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground);
           border: 1px solid var(--vscode-dropdown-border, transparent); padding: 4px 6px; }
  button { padding: 6px 14px; border: none; border-radius: 3px; cursor: pointer;
           background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button.secondary { background: var(--vscode-button-secondaryBackground);
                     color: var(--vscode-button-secondaryForeground);
                     border: 1px solid var(--vscode-button-border, var(--vscode-widget-border, #666)); }
  ul.index { list-style: none; padding: 0; margin: 0; }
  ul.index li { padding: 10px 12px; border: 1px solid var(--vscode-widget-border, #3c3c3c);
                border-radius: 4px; margin-bottom: 8px; cursor: pointer; }
  ul.index li:hover { background: var(--vscode-list-hoverBackground); }
  ul.index li .lead { opacity: .75; font-size: .92em; margin-top: 3px; }
  article h2 { margin: 0 0 6px; }
  article h3 { margin: 18px 0 4px; font-size: 1em; opacity: .85; text-transform: uppercase;
               letter-spacing: .06em; }
  article p { margin: 0; line-height: 1.5; }
  .fallback { color: var(--vscode-editorWarning-foreground, #cca700); font-style: italic; }
  .hidden { display: none; }
  .empty { opacity: .7; font-style: italic; }
  ${ZOOM_CSS}
`;
}

function helpBody(language: HelpLanguage, index: ReturnType<typeof searchIndex>, uiScale: number): string {
  const ui = UI[language];
  return `
  <div class="topBar">
    <div class="crumbs" id="crumbs"><a data-nav="home">${escapeHtml(ui.home)}</a></div>
    <button type="button" id="back" class="secondary hidden">${escapeHtml(ui.back)}</button>
    <select id="language" aria-label="Help language">${HELP_LANGUAGES.map(
      (code) => `<option value="${code}"${code === language ? ' selected' : ''}>${escapeHtml(HELP_LANGUAGE_LABELS[code])}</option>`,
    ).join('')}</select>
    ${zoomControlHtml(uiScale)}
  </div>
  <div class="searchRow" id="searchRow">
    <input id="search" type="search" placeholder="${escapeHtml(ui.search)}" autofocus>
  </div>
  <ul class="index" id="index">
    ${index
      .map(
        (entry) => `<li data-open="${escapeHtml(entry.id)}"><div class="title">${escapeHtml(entry.title)}</div>
      <div class="lead">${escapeHtml(bodyFor(HELP_ARTICLES.find((a) => a.id === entry.id) as (typeof HELP_ARTICLES)[number], language).body.whatItIs)}</div></li>`,
      )
      .join('\n    ')}
  </ul>
  <p id="noHits" class="empty hidden">${escapeHtml(ui.noHits)}</p>
  <div id="article" class="hidden"></div>
`;
}

// One template literal — the page script — so it is one "function" only in the way TypeScript counts.
// eslint-disable-next-line max-lines-per-function
function helpScript(nonce: string, language: HelpLanguage, index: ReturnType<typeof searchIndex>): string {
  const ui = UI[language];
  const articles = Object.fromEntries(HELP_ARTICLES.map((a) => [a.id, articleHtml(a.id, language)]));
  return `<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const ARTICLES = ${jsonForScript(articles)};
  const INDEX = ${jsonForScript(index)};
  const HOME = ${jsonForScript(ui.home)};
  const indexEl = document.getElementById('index');
  const articleEl = document.getElementById('article');
  const crumbs = document.getElementById('crumbs');
  const back = document.getElementById('back');
  const searchRow = document.getElementById('searchRow');
  const noHits = document.getElementById('noHits');
  const search = document.getElementById('search');

  function showIndex() {
    articleEl.classList.add('hidden');
    indexEl.classList.remove('hidden');
    searchRow.classList.remove('hidden');
    back.classList.add('hidden');
    crumbs.innerHTML = '<a data-nav="home">' + HOME + '</a>';
    applyFilter();
  }
  function showArticle(id) {
    const html = ARTICLES[id];
    if (!html) { return; }
    const title = (INDEX.find((e) => e.id === id) || { title: id }).title;
    articleEl.innerHTML = html;
    articleEl.classList.remove('hidden');
    indexEl.classList.add('hidden');
    searchRow.classList.add('hidden');
    noHits.classList.add('hidden');
    back.classList.remove('hidden');
    crumbs.innerHTML = '<a data-nav="home">' + HOME + '</a> › <span>' + title.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]) + '</span>';
    window.scrollTo(0, 0);
  }
  function applyFilter() {
    const term = search.value.trim().toLowerCase();
    let shown = 0;
    for (const li of indexEl.querySelectorAll('li[data-open]')) {
      const entry = INDEX.find((e) => e.id === li.dataset.open);
      const hit = term === '' || (entry && entry.haystack.includes(term));
      li.classList.toggle('hidden', !hit);
      if (hit) { shown += 1; }
    }
    noHits.classList.toggle('hidden', shown > 0);
  }
  indexEl.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-open]');
    if (li) { showArticle(li.dataset.open); }
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-nav="home"]')) { showIndex(); }
  });
  back.addEventListener('click', showIndex);
  search.addEventListener('input', applyFilter);
  document.getElementById('language').addEventListener('change', (e) => {
    vscode.postMessage({ type: 'language', language: e.target.value, field: '' });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !articleEl.classList.contains('hidden')) { showIndex(); }
  });
  ${zoomScript()}
</script>`;
}
