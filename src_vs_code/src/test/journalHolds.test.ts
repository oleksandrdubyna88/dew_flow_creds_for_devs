import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { HELP_LANGUAGES, HelpLanguage, bodyFor, helpArticle } from '../helpContent';
import { MCP_LOG_FILTERS, emptyMessage, isRefusal, mcpRowsIn } from '../mcpLogRows';
import { renderMcpLog } from '../mcpLogPage';
import { parseAuditLine } from '../agentAuditLog';
import type { McpCreateHooks } from '../brokerMcpDoor';
import { NO_GENERATOR_OUTCOME } from '../secretKinds';
import { call, code, share, world } from './brokerWorld';
import type { World } from './brokerWorld';

/**
 * What the journal holds, and what the texts about it say (N2; `todo/PLAN_agent_small_truths_n8_n9_n2.md` sections 1.3 and 2.3).
 *
 * <p>These rows hold what the texts say. When a row of J1 to J4 changes, the texts T1 to T8 of that plan (the five help articles, the journal
 * page, the two README sentences) change in the same commit. J1 to J4 run the real broker and read what it wrote; their behaviour did not
 * change in that plan, so a mutation shows that each can fail. H1 and H2 pin the sentences through the product's own functions.</p>
 */

/** The lines that the journal page would read: the broker's output channel, as one file's text. */
const rowsOf = (w: World): ReturnType<typeof mcpRowsIn> => mcpRowsIn(w.audit.join('\n'), '2026-11-27');

async function get(port: number, path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  return call(port, path, { method: 'GET' });
}

test('J1: a listing of entries, of folders and of a config snippet answers 200 and leaves no line in the journal', async () => {
  const w = world({ mcpEntries: [], visibleConfig: () => undefined });
  try {
    const { port } = await share(w);

    const lines = w.audit.length;

    for (const path of ['/v1/mcp/entries', '/v1/mcp/folders', '/v1/mcp/config-snippet?id=c1']) {
      const answer = await get(port, path);
      assert.equal(answer.status, 200, `${path}: ${JSON.stringify(answer.body)}`);
    }

    assert.equal(w.audit.length, lines, `a read route is answered with no line: ${w.audit.slice(lines).join(' | ')}`);
  } finally {
    w.server.dispose();
  }
});

test('J2: a use and a delete that are refused at the lookup leave no line and ask nobody — an id not served, a switch that is off, a body with no entry', async () => {
  const cases: ReadonlyArray<readonly [string, 'usable' | 'closed', Record<string, unknown>, string]> = [
    ['an id that is not served', 'usable', { entry: 'e-nope', command: 'x' }, 'not_found'],
    ['an entry whose switch is off', 'closed', { entry: 'e1', command: 'x' }, 'denied'],
    ['a body with no entry', 'usable', { command: 'x' }, 'invalid_request'],
  ];
  for (const route of ['/v1/mcp/use/exec', '/v1/mcp/delete']) {
    for (const [label, mcpUse, body, expected] of cases) {
      const w = world({ mcpUse, trash: true });
      try {
        const { port } = await share(w);
        const lines = w.audit.length;

        const answer = await call(port, route, { body });

        assert.equal(code(answer), expected, `${route}: ${label}`);
        assert.equal(w.audit.length, lines, `${route}: ${label}: no line: ${w.audit.slice(lines).join(' | ')}`);
        assert.equal(w.dialogs.length, 0, `${route}: ${label}: nobody was asked`);
      } finally {
        w.server.dispose();
      }
    }
  }
});

test('J3: a use that is allowed, one that is denied and one that nobody answers each leave one row, with their outcomes', async () => {
  const worlds: ReadonlyArray<readonly [string, Parameters<typeof world>[0], string, boolean]> = [
    ['allowed', { mcpUse: 'usable' }, 'exit 0', false],
    ['denied', { mcpUse: 'usable', answers: ['Deny'] }, 'denied', true],
    ['nobody answers', { mcpUse: 'usable', holdDialogs: true, consentTimeoutMs: 100 }, 'consent_timeout', true],
  ];
  for (const [label, options, outcome, refused] of worlds) {
    const w = world(options);
    try {
      const { port } = await share(w);

      await call(port, '/v1/mcp/use/exec', { body: { entry: 'e1', command: 'uptime' } });

      const rows = rowsOf(w);
      assert.equal(rows.length, 1, `${label}: ${w.audit.join(' | ')}`);
      assert.equal(rows[0]!.outcome, outcome, label);
      assert.equal(isRefusal(rows[0]!), refused, label);
    } finally {
      w.server.dispose();
    }
  }
});

test('J4: a secret that this window was asked to make and could not leaves one line, the word the journal counts, and a refused lookup adds none', async () => {
  const create: McpCreateHooks = {
    choose: () => ({ ok: false, code: 'not_supported', message: 'This window cannot make that kind of secret.', noGenerator: true }),
    settle: async () => ({ ok: true }),
    make: async () => ({ id: 'x', name: 'x' }),
  };
  const w = world({ mcpUse: 'usable', mcpCreateReal: create });
  try {
    const { port } = await share(w);
    const lines = w.audit.length;

    assert.equal(code(await call(port, '/v1/mcp/create', { body: { name: 'cert-01', kind: 'ssh' } })), 'not_supported');
    const written = w.audit.slice(lines).map((line) => parseAuditLine(line));
    assert.equal(written.length, 1, w.audit.join(' | '));
    assert.equal(written[0]?.action, 'create');
    assert.equal(written[0]?.outcome, NO_GENERATOR_OUTCOME);

    assert.equal(code(await call(port, '/v1/mcp/use/exec', { body: { entry: 'e-nope', command: 'x' } })), 'not_found');
    assert.equal(w.audit.length, lines + 1, 'the refused lookup adds no line');
  } finally {
    w.server.dispose();
  }
});

/** The sentence of T1, in the five languages (Appendix A of the plan). A native reader can polish a word; the clauses stay. */
const WHAT_IT_IS: Record<HelpLanguage, string> = {
  en:
    'A journal of what AI agents did through this extension: each action that ran for an agent and how it ended, each one that you declined or did not answer, and two counts worth watching — secrets that came FROM an agent, and secrets that this window was asked to make and could not. It is not a record of every request. A listing leaves no line. A request that is refused before anybody is asked can leave none: for example an id that is not open to agents, a switch that is off, or a request that is not complete.',
  ru:
    'Журнал того, что ИИ-агенты сделали через расширение: каждое действие, выполненное для агента, и чем оно закончилось, каждое, которое вы отклонили или оставили без ответа, и два счётчика — секреты, пришедшие ОТ агента, и секреты, которые это окно попросили создать, а оно не смогло. Это не запись каждого запроса. Список не оставляет строки. Запрос, отклонённый до того, как кого-либо спросили, может не оставить строки: например, id, не открытый агентам, выключенный переключатель или неполный запрос.',
  uk:
    'Журнал того, що AI-агенти зробили через це розширення: кожна дія, виконана для агента, і чим вона закінчилася, кожна, яку ви відхилили або залишили без відповіді, — і два лічильники, за якими варто стежити: секрети, що прийшли ВІД агента, і секрети, які це вікно попросили створити, а воно не змогло. Це не запис кожного запиту. Перелік не лишає рядка. Запит, відхилений до того, як когось запитали, може не лишити рядка: наприклад, id, не відкритий агентам, вимкнений перемикач або неповний запит.',
  de:
    'Ein Journal dessen, was KI-Agenten durch diese Erweiterung getan haben: jede Aktion, die für einen Agenten lief, und wie sie endete, jede, die Sie abgelehnt oder nicht beantwortet haben — und zwei Zahlen, die zu beobachten sich lohnt: Geheimnisse, die VON einem Agenten kamen, und Geheimnisse, die dieses Fenster erzeugen sollte und nicht erzeugen konnte. Es ist kein Protokoll jeder Anfrage. Eine Auflistung hinterlässt keine Zeile. Eine Anfrage, die abgelehnt wird, bevor jemand gefragt wird, kann ebenfalls keine hinterlassen: zum Beispiel eine ID, die für Agenten nicht geöffnet ist, ein Schalter, der aus ist, oder eine unvollständige Anfrage.',
  es:
    'Un diario de lo que los agentes de IA hicieron a través de esta extensión: cada acción que se ejecutó para un agente y cómo terminó, cada una que usted rechazó o no respondió — y dos cuentas que conviene vigilar: secretos que vinieron DESDE un agente, y secretos que se pidió generar a esta ventana y no pudo. No es un registro de todas las peticiones. Un listado no deja ninguna línea. Una petición que se rechaza antes de preguntar a nadie puede no dejar ninguna: por ejemplo, un id que no está abierto a los agentes, un interruptor apagado o una petición incompleta.',
};

test('H1: the article of the journal says in each language what the journal holds, and that it is not a record of every request', () => {
  for (const language of HELP_LANGUAGES) {
    const { body, fallback } = bodyFor(helpArticle('mcp-logs') as NonNullable<ReturnType<typeof helpArticle>>, language);

    assert.equal(fallback, false, language);
    assert.equal(body.whatItIs, WHAT_IT_IS[language], language);
  }
});

/** The page's text with its line breaks and runs of spaces folded, because the markup wraps a sentence over lines. */
const flat = (html: string): string => html.replace(/\s+/g, ' ');

test('H2: the journal page says what it holds — the hints of the filters, the two empty messages and the lede', () => {
  const hint = (id: string): string | undefined => MCP_LOG_FILTERS.find((f) => f.id === id)?.hint;

  assert.equal(hint('all'), 'Every line of the journal that came through MCP.');
  assert.equal(
    hint('refused'),
    'What it asked for and did not get — a prompt you declined, a prompt nobody answered, a run that was refused. A request that is refused before anybody is asked can leave no line.',
  );
  assert.equal(
    emptyMessage('all', 0),
    'The journal holds no line yet. A listing leaves none, and a request that is refused before anybody is asked can leave none. Entries are invisible to agents until you turn on Agent access for one.',
  );
  assert.equal(emptyMessage('refused', 3), 'No refusal is in the journal. A request that is refused before anybody is asked can leave no line.');
  const page = flat(renderMcpLog([]));
  assert.ok(page.includes('What AI agents did through this window, from the same record the broker writes to disk.'), page);
  assert.ok(!page.includes('Every call an AI agent made'), 'the old claim is gone');
});
