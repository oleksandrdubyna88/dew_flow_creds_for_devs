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

const REPORTED = { agent: 'Claude Code 2.1.268', session: '98bf9f23', sessionName: 'clauderag-d6', cwd: 'ClaudeRag' };

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
  const label = callerFrom({ caller: { agent: full, session: full, sessionName: full, cwd: full } });

  assert.ok(callerLine(label).length <= CALLER_MAX_LABEL_CHARS, String(callerLine(label).length));
  assert.equal(CALLER_MAX_LABEL_CHARS, 160);
});

test('a field that is not a string is dropped, not stringified', () => {
  // `parseJsonObject` yields `unknown`; an object or an array must never reach a template literal.
  const label = callerFrom({
    caller: { agent: ['Claude', 'Code'], session: 42, sessionName: { name: 'x' }, cwd: 'ClaudeRag' },
  });

  assert.deepEqual(label, { agent: '', session: '', sessionName: '', cwd: 'ClaudeRag' });
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
  assert.equal(callerLine({ agent: 'Codex', session: '9f2c41ab', sessionName: '', cwd: '' }), 'Codex · session 9f2c41ab');
  assert.equal(callerLine({ agent: '', session: '', sessionName: 'clauderag-d6', cwd: '' }), 'session clauderag-d6');
  assert.equal(callerLine({ agent: 'Gemini CLI', session: '', sessionName: '', cwd: '' }), 'Gemini CLI');
  const onlyFolder = callerLine({ agent: '', session: '', sessionName: '', cwd: 'ClaudeRag' });
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
