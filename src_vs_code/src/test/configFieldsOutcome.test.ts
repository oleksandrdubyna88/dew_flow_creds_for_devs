import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fieldsOutcome } from '../configFields';

/**
 * Why the Fields tab has nothing to show — which is three answers, not two.
 *
 * <p>This exists because of a defect that reached a person. `configFields` returned `undefined`
 * for two unrelated reasons — a format with no field view, and a body that does not parse — and
 * the comment on it said the two "read the same to the caller" as though that were a tidy
 * simplification. It is not. Opening a JSON config with one missing brace showed "No field view
 * for this format", which is false about JSON, sends the reader off to check the Format selector,
 * and never mentions the missing brace that is the actual problem.</p>
 *
 * <p>An unparsable body knows exactly what is wrong and where. Saying so is the difference
 * between a tab that looks broken and one that tells you what to fix.</p>
 */

test('a parsable JSON body gives rows', () => {
  const outcome = fieldsOutcome('json', '{"a": 1}');

  assert.equal(outcome.kind, 'rows');
  assert.equal(outcome.kind === 'rows' ? outcome.fields.length : -1, 1);
});

test('an unparsable body says SO, and says where — never "no field view"', () => {
  // The exact body from the report: nine lines of good JSON and a missing closing brace.
  const body = [
    '{',
    '  "Serilog": {',
    '    "MinimumLevel": {',
    '      "Default": "Information",',
    '      "Override": {',
    '        "Microsoft.AspNetCore": "Warning"',
    '      }',
    '    }',
    '  },',
    '  "AllowedHosts": "*"',
  ].join('\n');

  const outcome = fieldsOutcome('json', body);

  assert.equal(outcome.kind, 'unparsable');
  assert.match(outcome.kind === 'unparsable' ? outcome.problem.message : '', /JSON/);
  // Strict where this engine names a position, silent where it does not — see `enginePositions`.
  const line = outcome.kind === 'unparsable' ? outcome.problem.line : undefined;
  assert.equal(line, enginePositions(body) ? 10 : undefined);
});

test('and the same body, closed, gives exactly the rows a person expects', () => {
  const body = [
    '{',
    '  "Serilog": {',
    '    "MinimumLevel": {',
    '      "Default": "Information",',
    '      "Override": {',
    '        "Microsoft.AspNetCore": "Warning"',
    '      }',
    '    }',
    '  },',
    '  "AllowedHosts": "*"',
    '}',
  ].join('\n');

  const outcome = fieldsOutcome('json', body);

  assert.deepEqual(
    outcome.kind === 'rows' ? outcome.fields.map((f) => `${f.path} = ${f.value}`) : [],
    [
      'Serilog:MinimumLevel:Default = Information',
      'Serilog:MinimumLevel:Override:Microsoft.AspNetCore = Warning',
      'AllowedHosts = *',
    ],
  );
});

test('a format with no field view says that, and only that', () => {
  // The message this outcome carries must not be reached by a JSON body, ever — which is the
  // whole defect. A YAML body is what it is genuinely for.
  assert.equal(fieldsOutcome('yaml', 'a: 1').kind, 'noView');
  assert.equal(fieldsOutcome('xml', '<a/>').kind, 'noView');
});

test('a format with no field view says so even when its body is broken', () => {
  // Two things are true at once and only one of them is actionable here: there would be no rows
  // for YAML however well it parsed, so pointing at the syntax would send somebody to fix the
  // wrong thing.
  assert.equal(fieldsOutcome('yaml', 'root:\n\tchild: 1').kind, 'noView');
});

test('an empty body is rows, not a complaint', () => {
  const outcome = fieldsOutcome('env', '');

  assert.equal(outcome.kind, 'rows');
  assert.deepEqual(outcome.kind === 'rows' ? outcome.fields : undefined, []);
});

/**
 * Whether THIS engine offers a position for this body at all.
 *
 * <p>V8 has two message shapes and only one carries one; which you get depends on the engine, and the
 * 2026-09-09 audit watched these assertions fail under Node 20 while passing under Node 24 (finding
 * #8). Relaxing them to "the right line OR none" would have made them vacuous — a regression that
 * stopped extracting lines entirely would pass. Asking the engine what it said keeps the assertion
 * strict wherever an answer exists, and silent only where none does.</p>
 */
function enginePositions(body: string): boolean {
  try {
    JSON.parse(body);
    return false;
  } catch (error) {
    return /\bline \d+/i.test((error as Error).message);
  }
}
