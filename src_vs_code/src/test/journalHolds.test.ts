import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { HELP_LANGUAGES, HelpLanguage, bodyFor, helpArticle } from '../helpContent';
import { MCP_LOG_FILTERS, applyFilter, emptyMessage, isRefusal, mcpRowsIn } from '../mcpLogRows';
import type { McpLogFilter } from '../mcpLogRows';
import { renderMcpLog } from '../mcpLogPage';
import { parseAuditLine } from '../agentAuditLog';
import type { McpFolderHooks } from '../brokerFolderDoor';
import type { McpCreateHooks } from '../brokerMcpDoor';
import { UNANSWERED_FAILURE, errorBody } from '../brokerProtocol';
import type { ErrorCode } from '../brokerProtocol';
import { RotateDeps, StoreOutcome, rotateAction } from '../rotateAction';
import { NEW_SECRET_PLACEHOLDER } from '../secretRotation';
import { NO_GENERATOR_OUTCOME } from '../secretKinds';
import { stored } from '../storedSecret';
import type { EntityMetadata } from '../types';
import type { UseAction, UseActionResult } from '../useActions';
import { call, code, share, world } from './brokerWorld';
import type { World } from './brokerWorld';

/**
 * What the journal holds, and what the texts about it say (N2; `todo/PLAN_agent_small_truths_n8_n9_n2.md` sections 1.3 and 2.3).
 *
 * <p>These rows hold what the texts say. When a row of J changes, the texts T1 to T8 and T10 to T13 of that plan (the five help articles, the journal
 * page, the two README sentences, the hints and the comments) change in the same commit. J1 to J4 run the real broker and read what it wrote; their behaviour did not
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


/*
 * The page shows the lines that it counts (N2, the second part; `todo/PLAN_agent_small_truths_n8_n9_n2.md` sections 1.5 and 2.4).
 *
 * <p>Rows J5 to J13 run the real broker and read what it wrote with the page's own reader. Each row asserts the AGENT's answer first, the whole
 * status and the whole body, and the journal after: the words of the journal change, no answer to an agent does. A failure of a row on code that
 * has not been changed therefore names the journal, and the answer passed before it.</p>
 */

/** The four counts of the page: the rows that the filter of each button matches, as `mcpLogPage` counts them. */
const COUNTED: readonly McpLogFilter[] = ['refused', 'rotations', 'agentSecrets', 'noGenerator'];

const countsOf = (w: World): Record<string, number> => {
  const rows = rowsOf(w);
  return Object.fromEntries(COUNTED.map((filter) => [filter, applyFilter(rows, filter).length]));
};

const NO_COUNT = { refused: 0, rotations: 0, agentSecrets: 0, noGenerator: 0 };

/** The request left ONE row on the page, and it is the line that says how the request ended. */
function assertOneRow(w: World, action: string, outcome: string): void {
  const rows = rowsOf(w);
  assert.equal(rows.length, 1, `one row on the page for the request; the journal holds: ${w.audit.join(' | ')}`);
  assert.deepEqual([rows[0]?.action, rows[0]?.outcome], [action, outcome], w.audit.join(' | '));
}

/** JG2: the line of the grant and the line of the question are in the journal, and the page shows neither. */
function assertQuietLines(w: World): void {
  const written = w.audit.map((line) => parseAuditLine(line)?.outcome);
  assert.ok(written.includes('minted'), `the line that says a grant was minted: ${w.audit.join(' | ')}`);
  assert.ok(written.includes('ALLOWED'), `the line that says the person allowed it: ${w.audit.join(' | ')}`);
  assert.deepEqual(rowsOf(w).filter((row) => row.outcome === 'minted' || row.outcome === 'ALLOWED'), [], 'the page does not show them');
}

test('J5: a create that ran, with a secret from the agent, leaves one row on the page, and it is counted under Secrets from the agent', async () => {
  const w = world({ create: 'open' });
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/mcp/create', { body: { name: 'app-03', kind: 'ssh', secret: 'k' } });

    assert.deepEqual([answer.status, answer.body], [200, { created: true, id: 'new-1', name: 'app-03' }]);
    assertQuietLines(w);
    assertOneRow(w, 'create', 'created with agent secret');
    assert.deepEqual(countsOf(w), { ...NO_COUNT, agentSecrets: 1 });
  } finally {
    w.server.dispose();
  }
});

test('J5b: a create that ran with no secret leaves one row too, and no count moves', async () => {
  const w = world({ create: 'open' });
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/mcp/create', { body: { name: 'no-secret-yet', kind: 'ssh' } });

    assert.deepEqual([answer.status, answer.body], [200, { created: true, id: 'new-1', name: 'no-secret-yet' }]);
    assertOneRow(w, 'create', 'created');
    assert.deepEqual(countsOf(w), NO_COUNT);
  } finally {
    w.server.dispose();
  }
});

test('J6: a delete that ran leaves one row on the page, and no count moves', async () => {
  const w = world({ mcpUse: 'usable', trash: true });
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/mcp/delete', { body: { entry: 'e1' } });

    assert.deepEqual([answer.status, answer.body], [200, { deleted: true, entity: 'prod', restorable: true }]);
    assertQuietLines(w);
    assertOneRow(w, 'delete', 'moved to Trash');
    assert.deepEqual(countsOf(w), NO_COUNT);
  } finally {
    w.server.dispose();
  }
});

/** A create whose window cannot make the kind of secret that was asked for, so nobody is asked (the world of J4). */
const NO_GENERATOR_CREATE: McpCreateHooks = {
  choose: () => ({ ok: false, code: 'not_supported', message: 'This window cannot make that kind of secret.', noGenerator: true }),
  settle: async () => ({ ok: true }),
  make: async () => ({ id: 'x', name: 'x' }),
};

test('J7: a create for a secret that this window cannot make leaves one row on the page, counted under Could not generate and not under Refused', async () => {
  const w = world({ mcpUse: 'usable', mcpCreateReal: NO_GENERATOR_CREATE });
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/mcp/create', { body: { name: 'cert-01', kind: 'ssh' } });

    assert.deepEqual([answer.status, answer.body], [404, errorBody('not_supported', 'This window cannot make that kind of secret.')]);
    assertOneRow(w, 'create', NO_GENERATOR_OUTCOME);
    assert.deepEqual(countsOf(w), { ...NO_COUNT, noGenerator: 1 });
  } finally {
    w.server.dispose();
  }
});

const FOLDER_HOOKS: McpFolderHooks = {
  list: () => [],
  choose: () => ({ ok: true, target: { accountId: 'a1', entityId: 'f1', entityName: 'Servers', kind: 'folder' }, summary: 'staging in "Servers"', edit: {} }),
  create: () => Promise.resolve({ id: 'f2', name: 'staging' }),
  edit: () => Promise.resolve(true),
  remove: () => Promise.resolve(true),
};

test('J9: a folder change that ran leaves one row on the page, and no count moves', async () => {
  const w = world({ mcpUse: 'usable' });
  w.server.setFolderHooks(FOLDER_HOOKS);
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/mcp/folder/create', { body: { name: 'staging', parent: 'f1' } });

    assert.deepEqual([answer.status, answer.body], [200, { folder: 'Servers', created: true, id: 'f2', name: 'staging' }]);
    assertQuietLines(w);
    assertOneRow(w, 'folder-create', 'done');
    assert.deepEqual(countsOf(w), NO_COUNT);
  } finally {
    w.server.dispose();
  }
});

/* ------------------------------------------------------------------------------------------------------------------------------------
 * A rotation, through the real `rotateAction` behind the real broker, over a statement action that answers what the row says.
 * ---------------------------------------------------------------------------------------------------------------------------------- */

const OLD_CONNECTION = 'mysql://app:old-password-9f2c@db-01.example.internal:3306/orders';
const STATEMENT = `ALTER USER app IDENTIFIED BY '${NEW_SECRET_PLACEHOLDER}'`;
const DATABASE: EntityMetadata = { id: 'e1', name: 'prod', kind: 'db', isSshEnabled: false, dbType: 'mysql' };

/** A world whose `rotate` route is the real rotation. `stores` holds each value that reached the vault; `entry: false` is an entry that has gone. */
function rotationWorld(statement: UseActionResult, entry = true): { w: World; stores: string[] } {
  const stores: string[] = [];
  const underlying: UseAction = {
    kind: 'db',
    action: 'query',
    mutatesSecrets: false,
    verb: 'run a query against',
    validate: () => ({ ok: true }),
    summarize: () => STATEMENT,
    describeOutcome: () => 'ok',
    run: () => Promise.resolve(statement),
  };
  const deps: RotateDeps = {
    generate: (kind) =>
      kind === 'x509'
        ? { ok: false, kind: 'x509', message: 'Certificates come from a certificate authority.' }
        : { ok: true, value: 'NEW-secret-4b7e', kind: 'password' },
    entity: () => (entry ? DATABASE : undefined),
    current: () => Promise.resolve(stored(OLD_CONNECTION)),
    snapshot: () => Promise.resolve({ at: 1, name: 'prod', details: DATABASE, secrets: {} }),
    record: () => Promise.resolve(),
    store: (_ctx, _slot, value) => {
      stores.push(value);
      return Promise.resolve<StoreOutcome>('stored');
    },
  };
  const w = world({ kind: 'db', mcpUse: 'usable', supports: ['rotate'], realActions: { rotate: rotateAction(underlying, 'query', deps) } });
  return { w, stores };
}

const rotate = async (w: World, extra: Record<string, unknown> = {}): Promise<{ status: number; body: unknown }> => {
  const { port } = await share(w);
  return call(port, '/v1/mcp/use/rotate', { body: { entry: 'e1', statement: STATEMENT, ...extra } });
};

test('JG1: a rotation that ran and stored its value stays one row, `rotated`, counted under Secrets replaced', async () => {
  const { w, stores } = rotationWorld({ status: 200, body: { exitCode: 0, stdout: 'ALTER\n' } });
  try {
    const answer = await rotate(w);

    assert.deepEqual([answer.status, answer.body], [200, { rotated: true, entity: 'prod', stdout: 'ALTER\n' }]);
    assert.equal(stores.length, 1, 'the new value reached the vault');
    assertOneRow(w, 'rotate', 'rotated');
    assert.deepEqual(countsOf(w), { ...NO_COUNT, rotations: 1 });
  } finally {
    w.server.dispose();
  }
});

test('J8: a rotation that cannot draw its secret is one row, `no generator`, counted under Could not generate, under no other count', async () => {
  const { w, stores } = rotationWorld({ status: 200, body: { exitCode: 0 } });
  try {
    const answer = await rotate(w, { secretKind: 'x509' });

    assert.deepEqual(
      [answer.status, answer.body],
      [404, { error: { code: 'not_supported', message: 'Certificates come from a certificate authority.' }, noGenerator: true }],
    );
    assert.deepEqual(stores, [], 'nothing ran, nothing was stored');
    assertOneRow(w, 'rotate', NO_GENERATOR_OUTCOME);
    assert.deepEqual(countsOf(w), { ...NO_COUNT, noGenerator: 1 });
  } finally {
    w.server.dispose();
  }
});

test('J10: a rotation whose statement ran and failed is one row, `statement failed`, and it is not a replaced secret', async () => {
  const { w, stores } = rotationWorld({ status: 200, body: { exitCode: 1, stderr: 'denied' } });
  try {
    const answer = await rotate(w);

    assert.deepEqual([answer.status, answer.body], [200, { exitCode: 1, stderr: 'denied' }]);
    assert.deepEqual(stores, [], 'the vault must not hold a password the server refused');
    assertOneRow(w, 'rotate', 'statement failed');
    assert.deepEqual(countsOf(w), NO_COUNT);
  } finally {
    w.server.dispose();
  }
});

test('J11: a rotation that the action refuses in its run, because the entry is gone, is one row with its status, and it is not a replaced secret', async () => {
  const { w, stores } = rotationWorld({ status: 200, body: { exitCode: 0 } }, false);
  try {
    const answer = await rotate(w);

    assert.deepEqual([answer.status, answer.body], [400, errorBody('invalid_request', '"prod" no longer exists in the vault.')]);
    assert.deepEqual(stores, []);
    assertOneRow(w, 'rotate', '400');
    assert.deepEqual(countsOf(w), NO_COUNT);
  } finally {
    w.server.dispose();
  }
});

const STATEMENT_ERRORS: ReadonlyArray<readonly [number, ErrorCode]> = [
  [404, 'not_found'],
  [409, 'no_credential'],
  [412, 'tool_missing'],
  [429, 'too_many_requests'],
  [500, 'internal'],
];

test('J12: an error answer of the statement action goes to the agent as it came and is one row with its status number; the 404 is not `no generator`', async () => {
  for (const [status, errorCode] of STATEMENT_ERRORS) {
    const body = errorBody(errorCode, 'the statement action says no');
    const { w, stores } = rotationWorld({ status, body });
    try {
      const answer = await rotate(w);

      assert.deepEqual([answer.status, answer.body], [status, body], String(status));
      assert.deepEqual(stores, [], String(status));
      assertOneRow(w, 'rotate', String(status));
      assert.deepEqual(countsOf(w), NO_COUNT, String(status));
    } finally {
      w.server.dispose();
    }
  }
});

test('J13: a statement action that answers a body that is no object goes to the agent as it came — not as a 500 — and is one row with its status number', async () => {
  for (const sent of [null, 'bad gateway']) {
    const { w } = rotationWorld({ status: 502, body: sent });
    try {
      const answer = await rotate(w);

      const body: unknown = answer.body;
      assert.equal(answer.status, 502, `body ${String(sent)}: the agent read ${answer.status} ${JSON.stringify(answer.body)}`);
      assert.equal(body, sent, String(sent));
      assertOneRow(w, 'rotate', '502');
      assert.deepEqual(countsOf(w), NO_COUNT, String(sent));
    } finally {
      w.server.dispose();
    }
  }
});

test('JG4: a create whose handler throws leaves a line with the route and no mark, and no row on the page (F10: the texts say that such a request can leave no row)', async () => {
  const throws: McpCreateHooks = {
    choose: () => ({ ok: true, target: { accountId: 'a1', entityId: 'f1', entityName: 'Servers', kind: 'ssh' }, summary: 'x (ssh) in "Servers"', withSecret: false }),
    settle: async () => ({ ok: true }),
    make: () => Promise.reject(new Error('the vault is locked')),
  };
  const w = world({ mcpUse: 'usable', mcpCreateReal: throws });
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/mcp/create', { body: { name: 'x', kind: 'ssh' } });

    assert.deepEqual([answer.status, answer.body], [500, errorBody('internal', UNANSWERED_FAILURE)]);
    const failed = w.audit.map((line) => parseAuditLine(line)).filter((entry) => entry?.action === 'request');
    assert.deepEqual(
      failed.map((entry) => [entry?.outcome, entry?.via, entry?.detail]),
      [['failed', undefined, 'a handler failed: Error on POST /v1/mcp/create; headers not sent']],
      w.audit.join(' | '),
    );
    assert.deepEqual(rowsOf(w), [], 'and the page has no row for it');
  } finally {
    w.server.dispose();
  }
});

/** The sentence of T1, in the five languages (Appendix A of the plan, after S4). A native reader can polish a word; the clauses stay. */
const WHAT_IT_IS: Record<HelpLanguage, string> = {
  en:
    'A journal of what AI agents did over MCP through this extension: each action that ran for an agent and how it ended, each one that you declined or did not answer, and two counts worth watching — secrets that came FROM an agent, and secrets that this window was asked to make and could not. It is not a record of every request. A listing leaves no line. A request that is refused before anybody is asked can leave none: for example an id that is not open to agents, a switch that is off, or a request that is not complete. A request that fails inside this window can leave no row on the page. A create, a delete or a folder change that ran under an older version of the extension is absent from the page while its journal file is kept; the files are swept after 14 days.',
  ru:
    'Журнал того, что ИИ-агенты сделали по MCP через расширение: каждое действие, выполненное для агента, и чем оно закончилось, каждое, которое вы отклонили или оставили без ответа, и два счётчика — секреты, пришедшие ОТ агента, и секреты, которые это окно попросили создать, а оно не смогло. Это не запись каждого запроса. Список не оставляет строки. Запрос, отклонённый до того, как кого-либо спросили, может не оставить строки: например, id, не открытый агентам, выключенный переключатель или неполный запрос. Запрос, завершившийся сбоем внутри этого окна, может не оставить строки на странице. Создание, удаление или изменение папки, выполненные в более старой версии расширения, отсутствуют на странице, пока хранится их файл журнала; файлы удаляются через 14 дней.',
  uk:
    'Журнал того, що AI-агенти зробили через MCP у цьому розширенні: кожна дія, виконана для агента, і чим вона закінчилася, кожна, яку ви відхилили або залишили без відповіді, — і два лічильники, за якими варто стежити: секрети, що прийшли ВІД агента, і секрети, які це вікно попросили створити, а воно не змогло. Це не запис кожного запиту. Перелік не лишає рядка. Запит, відхилений до того, як когось запитали, може не лишити рядка: наприклад, id, не відкритий агентам, вимкнений перемикач або неповний запит. Запит, що завершився збоєм усередині цього вікна, може не лишити рядка на сторінці. Створення, видалення або зміна папки, виконані у старішій версії розширення, відсутні на сторінці, доки зберігається їхній файл журналу; файли видаляються через 14 днів.',
  de:
    'Ein Journal dessen, was KI-Agenten über MCP durch diese Erweiterung getan haben: jede Aktion, die für einen Agenten lief, und wie sie endete, jede, die Sie abgelehnt oder nicht beantwortet haben — und zwei Zahlen, die zu beobachten sich lohnt: Geheimnisse, die VON einem Agenten kamen, und Geheimnisse, die dieses Fenster erzeugen sollte und nicht erzeugen konnte. Es ist kein Protokoll jeder Anfrage. Eine Auflistung hinterlässt keine Zeile. Eine Anfrage, die abgelehnt wird, bevor jemand gefragt wird, kann ebenfalls keine hinterlassen: zum Beispiel eine ID, die für Agenten nicht geöffnet ist, ein Schalter, der aus ist, oder eine unvollständige Anfrage. Eine Anfrage, die innerhalb dieses Fensters fehlschlägt, kann auf der Seite keine Zeile hinterlassen. Ein Erstellen, ein Löschen oder eine Ordneränderung, die unter einer älteren Version der Erweiterung lief, fehlt auf der Seite, solange die zugehörige Journaldatei aufbewahrt wird; die Dateien werden nach 14 Tagen entfernt.',
  es:
    'Un diario de lo que los agentes de IA hicieron por MCP a través de esta extensión: cada acción que se ejecutó para un agente y cómo terminó, cada una que usted rechazó o no respondió — y dos cuentas que conviene vigilar: secretos que vinieron DESDE un agente, y secretos que se pidió generar a esta ventana y no pudo. No es un registro de todas las peticiones. Un listado no deja ninguna línea. Una petición que se rechaza antes de preguntar a nadie puede no dejar ninguna: por ejemplo, un id que no está abierto a los agentes, un interruptor apagado o una petición incompleta. Una petición que falla dentro de esta ventana puede no dejar ninguna línea en la página. Una creación, un borrado o un cambio de carpeta que se ejecutó con una versión anterior de la extensión no aparece en la página mientras se conserva su archivo del diario; los archivos se eliminan a los 14 días.',
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

  assert.equal(hint('all'), 'Every line that this page shows.');
  assert.equal(
    hint('refused'),
    'What it asked for and did not get — a prompt you declined, a prompt nobody answered, a run that was refused. A request that is refused before anybody is asked can leave no line. A call that ended with an error status is under Everything.',
  );
  assert.equal(
    emptyMessage('all', 0),
    'No line to show yet. A listing leaves none, and a request that is refused before anybody is asked can leave none. Entries are invisible to agents until you turn on Agent access for one.',
  );
  assert.equal(emptyMessage('refused', 3), 'No line shown here is a refusal. A request that is refused before anybody is asked can leave no line.');
  const page = flat(renderMcpLog([]));
  assert.ok(page.includes('What AI agents did through this window, from the same record the broker writes to disk.'), page);
  assert.ok(
    page.includes(
      'A create, a delete or a folder change that ran under an older version of the extension is absent while its journal file is kept; the files are swept after 14 days.',
    ),
    page,
  );
  assert.ok(!page.includes('Every call an AI agent made'), 'the old claim is gone');
});

test('H3: the hint of Secrets replaced and the empty messages of the count filters say what the journal records, not what it never saw', () => {
  const hint = (id: string): string | undefined => MCP_LOG_FILTERS.find((f) => f.id === id)?.hint;

  assert.equal(hint('rotations'), 'Each rotation that the journal records as done. The value passed through this window and never through the agent.');
  assert.equal(emptyMessage('rotations', 3), 'No line shown here is a rotation that the journal records as done.');
  assert.equal(emptyMessage('agentSecrets', 3), 'No line shown here is a secret that came from an agent.');
  assert.equal(emptyMessage('noGenerator', 3), 'No line shown here is a secret that this window could not make.');
});
