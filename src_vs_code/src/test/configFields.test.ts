import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configFields, withFieldValues } from '../configFields';

/**
 * The Fields view: every value in a config as an editable row.
 *
 * <p><b>A view over the raw text, not a second representation of it.</b> The obvious design —
 * parse, edit the tree, serialise — cannot keep the document: `JSON.parse` then
 * `JSON.stringify` loses the indentation somebody chose, every comment, and the trailing newline,
 * so opening the Fields tab and touching nothing would rewrite the file. Instead each field
 * records WHERE its value sits in the body, and an edit is spliced into that span. An untouched
 * body then comes back byte-identical because nothing reassembled it.</p>
 *
 * <p>Paths use `:` — the .NET configuration separator, so `Serilog:MinimumLevel:Default` is the
 * same string here, in `IConfiguration`, and in the environment-variable form of the same key.
 * That is the whole reason for choosing it over a dot.</p>
 */

test('a JSON object becomes one row per leaf, with .NET-shaped paths', () => {
  const body = '{\n  "Serilog": {\n    "MinimumLevel": {\n      "Default": "Information"\n    }\n  }\n}';

  const fields = configFields('json', body);

  assert.deepEqual(
    fields?.map((f) => [f.path, f.value]),
    [['Serilog:MinimumLevel:Default', 'Information']],
  );
});

test('every scalar kind becomes a row, and arrays are indexed', () => {
  const body = '{"a": 1, "b": true, "c": null, "d": ["x", "y"]}';

  const fields = configFields('json', body);

  assert.deepEqual(
    fields?.map((f) => [f.path, f.value]),
    [
      ['a', '1'],
      ['b', 'true'],
      ['c', 'null'],
      ['d:0', 'x'],
      ['d:1', 'y'],
    ],
  );
});

test('an untouched body comes back byte-identical — the whole promise', () => {
  // Comments are not legal JSON, so the case that matters here is formatting: tabs, an unusual
  // indent, a trailing newline, blank lines between blocks. A parse-and-serialise design loses
  // all four without anyone asking it to.
  const body = '{\n\t"a" :   1,\n\n\t"b": "two"\n}\n';

  assert.equal(withFieldValues(body, []), body);
});

test('editing one value changes exactly that value and nothing else', () => {
  const body = '{\n  "ConnectionStrings": {\n    "Default": "Server=localhost"\n  },\n  "Port": 5432\n}\n';
  const fields = configFields('json', body) ?? [];
  const target = fields.find((f) => f.path === 'ConnectionStrings:Default');
  assert.notEqual(target, undefined);

  const next = withFieldValues(body, [{ field: target!, value: 'Server=prod' }]);

  assert.equal(
    next,
    '{\n  "ConnectionStrings": {\n    "Default": "Server=prod"\n  },\n  "Port": 5432\n}\n',
  );
});

test('two edits in one pass do not disturb each other', () => {
  // Splicing shifts every offset after the cut, so edits are applied from the end backwards. Two
  // edits where the EARLIER one grows is the case that catches a left-to-right implementation.
  const body = '{"a": "x", "b": "y"}';
  const fields = configFields('json', body) ?? [];

  const next = withFieldValues(body, [
    { field: fields[0], value: 'a much longer value' },
    { field: fields[1], value: 'z' },
  ]);

  assert.equal(next, '{"a": "a much longer value", "b": "z"}');
});

test('a string value is written back escaped, so a quote cannot break the document', () => {
  const body = '{"pw": "old"}';
  const fields = configFields('json', body) ?? [];

  const next = withFieldValues(body, [{ field: fields[0], value: 'he said "hi"\\ok' }]);

  assert.equal(JSON.parse(next).pw, 'he said "hi"\\ok');
});

test('a non-string value stays unquoted when the new text is still that kind', () => {
  // Editing a port from 5432 to 5433 must not turn it into the string "5433": .NET would bind it
  // to an int property just the same, but a JSON schema and every human reader would disagree.
  const body = '{"Port": 5432, "Debug": false}';
  const fields = configFields('json', body) ?? [];

  const next = withFieldValues(body, [
    { field: fields[0], value: '5433' },
    { field: fields[1], value: 'true' },
  ]);

  assert.equal(next, '{"Port": 5433, "Debug": true}');
});

test('a non-string value edited into something that is not one becomes a string', () => {
  // `"Port": localhost` is not a document anyone wanted. Quoting is what keeps the result parsable.
  const body = '{"Port": 5432}';
  const fields = configFields('json', body) ?? [];

  const next = withFieldValues(body, [{ field: fields[0], value: 'not a number' }]);

  assert.equal(JSON.parse(next).Port, 'not a number');
});

test('an env body becomes rows, and the value keeps everything after the first =', () => {
  const body = '# a note\nDB_PASSWORD=p@ss=word\n\nexport PORT=5432\n';

  const fields = configFields('env', body);

  assert.deepEqual(
    fields?.map((f) => [f.path, f.value]),
    [
      ['DB_PASSWORD', 'p@ss=word'],
      ['PORT', '5432'],
    ],
  );
});

test('editing an env value keeps the comments, the blanks and the export', () => {
  const body = '# a note\nDB_PASSWORD=old\n\nexport PORT=5432\n';
  const fields = configFields('env', body) ?? [];
  const target = fields.find((f) => f.path === 'PORT');

  const next = withFieldValues(body, [{ field: target!, value: '6000' }]);

  assert.equal(next, '# a note\nDB_PASSWORD=old\n\nexport PORT=6000\n');
});

test('a format with no exact round-trip offers no field view at all', () => {
  // Saying "no fields here" is the honest answer. Offering rows built by a hand-written YAML
  // reader would mean a tab that silently rewrites somebody's document the first time it is used,
  // and the raw tab already works for every format.
  for (const format of ['yaml', 'xml', 'toml', 'ini'] as const) {
    assert.equal(configFields(format, 'a: 1'), undefined, format);
  }
});

test('a body that does not parse has no fields — the raw tab is the only honest one', () => {
  assert.equal(configFields('json', '{"a": '), undefined);
  assert.equal(configFields('json', 'not json at all'), undefined);
});

test('an empty body has no fields, and that is not a failure', () => {
  assert.deepEqual(configFields('env', ''), []);
  assert.equal(configFields('json', ''), undefined, 'an empty string is not a JSON document');
});
