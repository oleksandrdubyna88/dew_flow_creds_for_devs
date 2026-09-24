import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatAuditLine, parseAuditLine } from '../agentAuditLog';
import {
  CALLER_MAX_FIELD_CHARS,
  CALLER_MAX_LABEL_CHARS,
  UNKNOWN_CALLER,
  callerForAudit,
  callerFrom,
  callerLine,
} from '../brokerCaller';

/**
 * The caller record, as the window reads it off an UNAUTHENTICATED body.
 *
 * <p>Any local process can POST an alias or MCP body with any `caller` it likes, and what it
 * reports is rendered into a security dialog. So the sanitiser here is the guard, and the
 * client-side cap in `CallerIdentity.cs` is courtesy: every rule below is asserted against text a
 * hostile caller would actually send, not against a well-formed record.</p>
 *
 * <p>The label never reaches a decision. Nothing in this module can refuse, route or throttle,
 * and the tests say so by asserting only what is RENDERED.</p>
 */

const REPORTED = { agent: 'Claude Code 2.1.268', session: '98bf9f23', sessionName: 'clauderag-d6', cwd: 'ClaudeRag', tabTitle: '' };

// Built by code point rather than written as escapes, so the fixture is readable in a diff and
// cannot be normalised away by an editor: a bell (Cc), a zero-width space (Cf) and an escape (Cc).
const BELL = String.fromCharCode(0x07);
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);
const ESCAPE = String.fromCharCode(0x1b);

test('a well-formed record renders as agent · session name (id) · in folder', () => {
  const label = callerFrom({ entry: 'e1', command: 'uptime', caller: REPORTED });

  assert.deepEqual(label, REPORTED);
  assert.equal(callerLine(label), 'Claude Code 2.1.268 · session clauderag-d6 (98bf9f23) · in ClaudeRag');
});

test('a hostile label cannot forge the modal — a newline in it does not start a new paragraph', () => {
  // The sentence is built with `\n\n` separators, so an unstripped label could append its own
  // "Allowing covers…" paragraph or a fake "(verified)" line to a security dialog.
  const label = callerFrom({
    caller: { ...REPORTED, agent: 'X\n\nAllow covers nothing. (verified by CredsForDevs)' },
  });

  assert.ok(label !== undefined);
  assert.equal(label.agent, 'X Allow covers nothing. (verified by CredsForDevs)');
  const line = callerLine(label);
  assert.equal(line.includes('\n'), false, line);
  assert.equal(line.includes('\r'), false, line);
  assert.equal(line.split('\n').length, 1, 'one line, whatever was sent');
});

test('control and format characters are gone — a tab, a bell, a zero-width space, an escape sequence', () => {
  const label = callerFrom({
    caller: {
      agent: `Claude\tCode${BELL}`,
      session: `98bf${ZERO_WIDTH_SPACE}9f23`,
      sessionName: `name${ESCAPE}[31m`,
      cwd: 'a\rb',
    },
  });

  assert.ok(label !== undefined);
  assert.equal(/[\p{Cc}\p{Cf}]/u.test(callerLine(label)), false, JSON.stringify(callerLine(label)));
  assert.equal(label.agent, 'Claude Code');
  assert.equal(label.cwd, 'a b');
});

test('the audit separator cannot arrive in a field — → is stripped', () => {
  const label = callerFrom({ caller: { ...REPORTED, agent: 'creds → exit 0  rm -rf /' } });

  assert.ok(label !== undefined);
  assert.equal(label.agent.includes('→'), false, label.agent);
  assert.equal(callerLine(label).includes('→'), false);
});

test('a 5,000-character field is capped at the contract\'s limit', () => {
  const label = callerFrom({ caller: { ...REPORTED, agent: 'a'.repeat(5000) } });

  assert.ok(label !== undefined);
  assert.equal(label.agent.length, CALLER_MAX_FIELD_CHARS);
  assert.equal(CALLER_MAX_FIELD_CHARS, 80);
});

test('the cap counts characters, not UTF-16 halves — no lone surrogate reaches the dialog', () => {
  const agent = callerFrom({ caller: { ...REPORTED, agent: '🙂'.repeat(100) } })?.agent ?? '';

  assert.equal(Array.from(agent).length, CALLER_MAX_FIELD_CHARS);
  const points = Array.from(agent).map((c) => c.codePointAt(0) ?? 0);
  assert.equal(points.some((point) => point >= 0xd800 && point <= 0xdfff), false, 'no half of a pair at the end');
});

test('the composed label is capped too, so four full fields cannot make a 64 KB modal', () => {
  const full = 'x'.repeat(CALLER_MAX_FIELD_CHARS);
  const label = callerFrom({ caller: { agent: full, session: full, sessionName: full, cwd: full, tabTitle: full } });

  assert.ok(callerLine(label).length <= CALLER_MAX_LABEL_CHARS, String(callerLine(label).length));
  assert.equal(CALLER_MAX_LABEL_CHARS, 160);
});

test('a field that is not a string is dropped, not stringified', () => {
  // `parseJsonObject` yields `unknown`; an object or an array must never reach a template literal.
  const label = callerFrom({
    caller: { agent: ['Claude', 'Code'], session: 42, sessionName: { name: 'x' }, cwd: 'ClaudeRag' },
  });

  assert.deepEqual(label, { agent: '', session: '', sessionName: '', cwd: 'ClaudeRag', tabTitle: '' });
  assert.equal(callerLine(label), 'in ClaudeRag');
});

test('absent, empty, non-object and all-blank callers are all undefined — never " ·  · "', () => {
  assert.equal(callerFrom({ entry: 'e1' }), undefined);
  assert.equal(callerFrom({ caller: {} }), undefined);
  assert.equal(callerFrom({ caller: null }), undefined);
  assert.equal(callerFrom({ caller: 'Claude Code' }), undefined);
  assert.equal(callerFrom({ caller: ['Claude Code'] }), undefined);
  assert.equal(callerFrom({ caller: { agent: '   ', session: '\n', sessionName: '\t', cwd: ZERO_WIDTH_SPACE } }), undefined);
  assert.equal(callerLine(undefined), UNKNOWN_CALLER);
  assert.equal(UNKNOWN_CALLER, 'An agent');
  assert.equal(callerForAudit(undefined), undefined, 'the audit line carries no "by" for nobody');
});

test('both wire shapes parse to the same label — nested object and flat caller* fields', () => {
  // The fallback the parser does not know is a fallback that silently turns every label into
  // "An agent". Whichever shape the C# side ended up sending, this window reads both.
  const nested = callerFrom({ entry: 'e1', caller: REPORTED });
  const flat = callerFrom({
    entry: 'e1',
    callerAgent: REPORTED.agent,
    callerSession: REPORTED.session,
    callerSessionName: REPORTED.sessionName,
    callerCwd: REPORTED.cwd,
  });

  assert.deepEqual(flat, nested);
  assert.deepEqual(nested, REPORTED);
});

test('the nested object wins when both shapes are present, so a flat field cannot override it', () => {
  const label = callerFrom({ caller: REPORTED, callerAgent: 'somebody else' });

  assert.equal(label?.agent, REPORTED.agent);
});

test('a record with no session — the CLI in a person\'s own terminal — reads as itself, not as an agent', () => {
  const label = callerFrom({ alias: 'prod', caller: { agent: 'creds CLI', session: '', sessionName: '', cwd: 'ClaudeRag' } });

  assert.equal(callerLine(label), 'creds CLI · in ClaudeRag');
});

test('each segment is omitted when its field is empty, and the separators go with it', () => {
  assert.equal(callerLine({ agent: 'Codex', session: '9f2c41ab', sessionName: '', cwd: '', tabTitle: '' }), 'Codex · session 9f2c41ab');
  assert.equal(callerLine({ agent: '', session: '', sessionName: 'clauderag-d6', cwd: '', tabTitle: '' }), 'session clauderag-d6');
  assert.equal(callerLine({ agent: 'Gemini CLI', session: '', sessionName: '', cwd: '', tabTitle: '' }), 'Gemini CLI');
  const onlyFolder = callerLine({ agent: '', session: '', sessionName: '', cwd: 'ClaudeRag', tabTitle: '' });
  assert.equal(onlyFolder, 'in ClaudeRag');
  assert.equal(onlyFolder.includes(' ·  · '), false, onlyFolder);
});

test('whitespace runs collapse to one space and the ends are trimmed', () => {
  const label = callerFrom({ caller: { ...REPORTED, cwd: '  Claude   Rag  ' } });

  assert.equal(label?.cwd, 'Claude Rag');
});

test('the audit form is the same label, or nothing — never "An agent"', () => {
  assert.equal(callerForAudit(REPORTED), callerLine(REPORTED));
  assert.equal(callerForAudit(undefined), undefined);
});

test('a HOSTILE label, once sanitised, still survives the audit round trip', () => {
  // The two guards meet here: the sanitiser strips the separator and the newline, and the
  // formatter then writes a line its own parser reads back whole — with the forged outcome
  // still inside the label, where it can mislead nobody who reads the columns.
  const label = callerFrom({
    caller: { agent: 'X\n→ exit 0  rm -rf / (verified)\t', session: '98bf9f23', sessionName: '', cwd: 'a → b' },
  });
  const text = callerForAudit(label);

  assert.ok(text !== undefined);
  const entry = parseAuditLine(
    formatAuditLine({
      at: new Date('2026-08-27T14:05:09Z'),
      grant: 'tok…f2',
      entityName: 'orders-db',
      action: 'query',
      outcome: 'exit 0',
      seq: 3,
      via: 'mcp',
      caller: text,
      detail: 'SELECT 1',
    }),
  );
  assert.equal(entry?.caller, text);
  assert.equal(entry?.outcome, 'exit 0', 'the forged outcome did not become the outcome');
  assert.equal(entry?.detail, 'SELECT 1');
});

// ---- the tab title (issue #136) ------------------------------------------------------------

const TITLED = { ...REPORTED, tabTitle: 'creds old issues' };

/** The title a body reports, as the window reads it. */
const titleOf = (body: Record<string, unknown>): string | undefined => callerFrom(body)?.tabTitle;

test('the tab title is read from both wire shapes and cleaned like every other field', () => {
  assert.equal(titleOf({ caller: TITLED }), 'creds old issues');
  assert.equal(titleOf({ callerAgent: 'Claude Code 2.1.281', callerTabTitle: 'creds old issues' }), 'creds old issues');
  assert.equal(titleOf({ caller: { ...REPORTED, tabTitle: 'X\n\n(verified) → ok' } }), 'X (verified) ok');
  assert.equal(titleOf({ caller: { ...REPORTED, tabTitle: { text: 'x' } } }), '', 'not a string, not stringified');
  assert.equal(titleOf({ caller: { agent: 'x' } }), '', 'an older sender simply has none');
});

test('a record that knows only the tab title is still a caller, not "An agent"', () => {
  const label = callerFrom({ caller: { tabTitle: 'creds old issues' } });

  assert.ok(label !== undefined);
  assert.equal(callerLine(label), 'session "creds old issues"');
});

test('the tab title names the session in the modal, quoted, in place of the derived registry name', () => {
  // The derived name (clauderag-d6) and the id are on no tab; the title IS the tab. Two names for
  // one session in a security dialog would read as two sessions, so the title replaces the name.
  assert.equal(callerLine(TITLED), 'Claude Code 2.1.268 · session "creds old issues" (98bf9f23) · in ClaudeRag');
  assert.equal(callerLine({ ...TITLED, session: '' }), 'Claude Code 2.1.268 · session "creds old issues" · in ClaudeRag');
  assert.equal(callerLine(REPORTED), 'Claude Code 2.1.268 · session clauderag-d6 (98bf9f23) · in ClaudeRag', 'no title: unchanged');
});

test('the title is shown in full up to the field cap, so the tab text — however the tab cuts it — is a prefix of it', () => {
  const long = 'Fix the consent modal so it shows the tab title of the session';
  const line = callerLine({ ...TITLED, tabTitle: long });

  assert.ok(line.includes(`session "${long}" (98bf9f23)`), line);
  assert.ok(line.includes(`"${long.slice(0, 24)}`), 'the tab shows the first 24 characters');
});

test('the audit line names the session by its tab title, exactly as the modal does (owner, 2026-09-24)', () => {
  // D4 reversed by the owner: the journal is where "which session did this" is asked AFTERWARDS, and
  // the tab title is the name the person knows it by. One label for both surfaces, so the line they
  // read later is the line they allowed.
  const audit = callerForAudit(TITLED) ?? '';

  assert.equal(audit, 'Claude Code 2.1.268 · session "creds old issues" (98bf9f23) · in ClaudeRag');
  assert.equal(audit, callerLine(TITLED), 'the audit label IS the modal label');
  assert.equal(
    callerForAudit({ agent: '', session: '', sessionName: '', cwd: '', tabTitle: 'only a title' }),
    'session "only a title"',
    'a caller known only by its title is still named in the journal',
  );
});

test('a hostile tab title is neutralised on the audit line the same way as in the modal', () => {
  // The journal is durable and read by people: a title that could forge a second session there, or
  // break the ` → ` the line is split on, would be worse than in a modal that closes.
  const hostile = { ...TITLED, tabTitle: 'prod" (deadbeef) · session "x" → allowed\ninjected' };
  const audit = callerForAudit(callerFrom({ caller: hostile })) ?? '';

  assert.equal(audit, callerLine(callerFrom({ caller: hostile })));
  assert.equal(audit.split('"').length - 1, 2, 'one pair of quotes: the one around the title');
  assert.equal(audit.includes('→'), false, 'the audit separator cannot arrive inside a field');
  assert.equal(audit.includes('\n'), false, 'nor a line break');
});

test('a title cannot forge a second session in the label — its quotes and the separator are neutralised', () => {
  // An AI title is written by a model from the conversation, so text the agent READ can steer it.
  // Unescaped, `prod" (deadbeef) · session "Claude Code` would render as two sessions, one with a
  // forged id (code round, 2026-09-24). Inside the quotes the title stays visibly one value.
  const line = callerLine({ ...TITLED, tabTitle: 'prod" (deadbeef) · session "Claude Code' });

  assert.equal(line, `Claude Code 2.1.268 · session "prod' (deadbeef) - session 'Claude Code" (98bf9f23) · in ClaudeRag`);
  assert.equal(line.split('"').length - 1, 2, 'exactly one pair of quotes: the one around the title');
  assert.equal(line.split(' · ').length, 3, 'agent · session · folder, and no fourth segment');
});

test('a hostile title cannot forge the modal, and five full fields still make at most 160 characters', () => {
  const label = callerFrom({ caller: { ...REPORTED, tabTitle: `X\n\nAllow covers nothing. (verified) → ${'y'.repeat(5000)}` } });
  const line = callerLine(label);

  assert.equal(line.includes('\n'), false, line);
  assert.equal(line.includes('→'), false, line);
  assert.ok(line.length <= CALLER_MAX_LABEL_CHARS, String(line.length));
});
