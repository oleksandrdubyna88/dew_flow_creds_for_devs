import { ConfigFormat } from './configFormat';

/**
 * Every value in a config as an editable row — a VIEW over the raw text, never a second copy of
 * it.
 *
 * <p>The obvious design is parse, edit the tree, serialise. It cannot keep the document:
 * `JSON.parse` followed by `JSON.stringify` loses the indentation somebody chose, the blank lines
 * between blocks and the trailing newline, so opening the Fields tab and changing nothing would
 * rewrite the file. For `.env` it is worse — every comment goes, and a `.env` is half comments.</p>
 *
 * <p>So a field records WHERE its value sits in the body, and an edit is spliced into that span.
 * An untouched body comes back byte-identical because nothing reassembled it, and a body with one
 * edit differs by exactly that value. That is a property rather than a hope, and
 * `configFields.test.ts` states it as one.</p>
 *
 * <p>Paths use `:`, which is the .NET configuration separator — so `Serilog:MinimumLevel:Default`
 * is the same string here, in `IConfiguration`, and in the environment-variable spelling of the
 * same key. That is the whole reason it is not a dot.</p>
 *
 * <p>Free of `vscode`, so the round-trip is a unit test rather than something discovered by
 * saving somebody's appsettings.</p>
 */

/** How a new value has to be written back for this field's format. */
export type FieldEncoding =
  /** Verbatim — the format has no quoting at this position (`.env`). */
  | 'text'
  /** A JSON string: the value is re-encoded, so a quote in it cannot end the document. */
  | 'json-string'
  /** A JSON number, boolean or null: kept bare while the new text still is one. */
  | 'json-literal';

export interface ConfigField {
  /** `Serilog:MinimumLevel:Default` — the .NET configuration path. */
  readonly path: string;
  /** The decoded value, as a person should see and type it. */
  readonly value: string;
  /** Where the RAW value text sits in the body, so an edit is a splice. */
  readonly start: number;
  readonly end: number;
  readonly encoding: FieldEncoding;
}

export interface FieldEdit {
  readonly field: ConfigField;
  readonly value: string;
}

/**
 * The rows for a body, or `undefined` when this body has no field view.
 *
 * <p>`undefined` means "the raw tab is the only honest one", and it is returned for two different
 * reasons that read the same to the caller: a format whose round-trip cannot be exact, and a body
 * that does not parse. Offering rows in either case would mean a tab that silently rewrites
 * somebody's document the first time it is opened.</p>
 */
export function configFields(format: ConfigFormat, body: string): readonly ConfigField[] | undefined {
  if (format === 'env') {
    return envFields(body);
  }
  return format === 'json' ? jsonFields(body) : undefined;
}

/**
 * The body with these edits applied.
 *
 * <p>Applied from the END backwards, which is the whole of the correctness argument: a splice
 * shifts every offset after it, so a left-to-right pass corrupts the second edit by exactly the
 * length the first one changed. Nothing else in this module needs to know that, because nothing
 * else holds more than one edit at a time.</p>
 */
export function withFieldValues(body: string, edits: readonly FieldEdit[]): string {
  let next = body;
  for (const edit of [...edits].sort((a, b) => b.field.start - a.field.start)) {
    next = next.slice(0, edit.field.start) + encodeValue(edit) + next.slice(edit.field.end);
  }
  return next;
}

function encodeValue(edit: FieldEdit): string {
  if (edit.field.encoding === 'text') {
    return edit.value;
  }
  // A port edited from 5432 to 5433 must not become the string "5433"; a port edited to
  // `localhost` must not stay bare, because `"Port": localhost` is not a document anyone wanted.
  return edit.field.encoding === 'json-literal' && isJsonLiteral(edit.value)
    ? edit.value
    : JSON.stringify(edit.value);
}

function isJsonLiteral(value: string): boolean {
  return /^(-?\d+(\.\d+)?([eE][-+]?\d+)?|true|false|null)$/.test(value);
}

// ---------- .env ----------

function envFields(body: string): ConfigField[] {
  const out: ConfigField[] = [];
  let offset = 0;
  for (const line of body.split('\n')) {
    addEnvField(line, offset, out);
    offset += line.length + 1;
  }
  return out;
}

function addEnvField(line: string, offset: number, out: ConfigField[]): void {
  const text = line.trim();
  const eq = line.indexOf('=');
  if (text.length === 0 || text.startsWith('#') || eq < 0) {
    return;
  }
  out.push({
    path: line.slice(0, eq).trim().replace(/^export\s+/, ''),
    value: line.slice(eq + 1, lineEnd(line)),
    start: offset + eq + 1,
    end: offset + lineEnd(line),
    encoding: 'text',
  });
}

/** Where the line's text stops — a CRLF file leaves a `\r` that is not part of anybody's value. */
function lineEnd(line: string): number {
  return line.endsWith('\r') ? line.length - 1 : line.length;
}

// ---------- JSON ----------

interface Cursor {
  readonly text: string;
  at: number;
}

/**
 * Fields for a JSON body.
 *
 * <p>`JSON.parse` runs FIRST and its result is thrown away. That is not waste: it means the
 * scanner below never meets malformed input, so it needs no error handling at all — and a scanner
 * with no error paths is one that can be read in a sitting and kept under the complexity ceiling.
 * The parse is also the honest gate: a body that does not parse has no fields.</p>
 */
function jsonFields(body: string): ConfigField[] | undefined {
  try {
    JSON.parse(body);
  } catch {
    return undefined;
  }
  const cursor: Cursor = { text: body, at: 0 };
  const out: ConfigField[] = [];
  readValue(cursor, '', out);
  return out;
}

function readValue(c: Cursor, path: string, out: ConfigField[]): void {
  skipSpace(c);
  if (c.text[c.at] === '{') {
    readObject(c, path, out);
    return;
  }
  if (c.text[c.at] === '[') {
    readArray(c, path, out);
    return;
  }
  readScalar(c, path, out);
}

function readObject(c: Cursor, path: string, out: ConfigField[]): void {
  c.at += 1;
  for (;;) {
    skipSpace(c);
    if (c.text[c.at] === '}') {
      c.at += 1;
      return;
    }
    if (c.text[c.at] === ',') {
      c.at += 1;
      continue;
    }
    readMember(c, path, out);
  }
}

function readMember(c: Cursor, path: string, out: ConfigField[]): void {
  const key = readStringToken(c);
  skipSpace(c);
  c.at += 1; // the colon
  readValue(c, join(path, key), out);
}

function readArray(c: Cursor, path: string, out: ConfigField[]): void {
  c.at += 1;
  let index = 0;
  for (;;) {
    skipSpace(c);
    if (c.text[c.at] === ']') {
      c.at += 1;
      return;
    }
    if (c.text[c.at] === ',') {
      c.at += 1;
      continue;
    }
    readValue(c, join(path, String(index)), out);
    index += 1;
  }
}

function readScalar(c: Cursor, path: string, out: ConfigField[]): void {
  const start = c.at;
  const quoted = c.text[c.at] === '"';
  const value = quoted ? readStringToken(c) : readBareToken(c);
  out.push({ path, value, start, end: c.at, encoding: quoted ? 'json-string' : 'json-literal' });
}

/**
 * A `"…"` token, returned DECODED.
 *
 * <p>Decoded by handing the token back to `JSON.parse` rather than by unescaping by hand: `\\u00e9`,
 * `\\n` and a surrogate pair are three ways to get this wrong, and the engine already knows all
 * three. The scan itself only has to find where the token ends, which is a matter of counting
 * backslashes.</p>
 */
function readStringToken(c: Cursor): string {
  const start = c.at;
  c.at += 1;
  while (c.text[c.at] !== '"') {
    c.at += c.text[c.at] === '\\' ? 2 : 1;
  }
  c.at += 1;
  return JSON.parse(c.text.slice(start, c.at)) as string;
}

/** A number, `true`, `false` or `null` — everything up to whatever ends a value. */
function readBareToken(c: Cursor): string {
  const start = c.at;
  while (c.at < c.text.length && !',}] \t\r\n'.includes(c.text[c.at])) {
    c.at += 1;
  }
  return c.text.slice(start, c.at);
}

function skipSpace(c: Cursor): void {
  while (c.at < c.text.length && ' \t\r\n'.includes(c.text[c.at])) {
    c.at += 1;
  }
}

function join(path: string, key: string): string {
  return path === '' ? key : `${path}:${key}`;
}
