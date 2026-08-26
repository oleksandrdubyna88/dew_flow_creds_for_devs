import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { formPageScript } from '../entityFormScript';
import { EntityMetadata } from '../types';

/**
 * The values that cross from the host into the form's page script (audit A3).
 *
 * <p>`webviewHtml.test.ts` already PARSES this script for every kind, which covers the trap
 * that motivated it — a backtick inside a CSS comment ending the template. What it does not
 * cover is the three host values interpolated into it, and those are the only way anything
 * from a vault reaches the page as CODE rather than as text.</p>
 *
 * <p>That makes one case worth checking explicitly: `JSON.stringify` escapes quotes but NOT
 * `&lt;/script&gt;`, so a stored value containing that sequence closes the inline script tag
 * early and everything after it is parsed as markup. The values here come from a SYNCED
 * vault — a colleague's entity, or a restored backup — so "our own user typed it" is not an
 * argument. The tests below record what this module actually does with such a value.</p>
 */

const NONCE = 'test-nonce-value';

const entity = (extra: Partial<EntityMetadata>): EntityMetadata =>
  ({ id: 'e1', name: 'x', kind: 'ssh', ...extra }) as unknown as EntityMetadata;

/** The `const INITIAL_X = …;` literal the script starts from. */
function literal(script: string, name: string): string {
  const found = new RegExp(`const ${name} = (.*);`).exec(script);
  assert.ok(found !== null, `${name} is not declared in the script`);
  return found[1];
}

test('an entity with no rows still declares EMPTY lists, never undefined', () => {
  // `JSON.stringify(undefined)` is the string "undefined", which parses and then behaves as a
  // value nothing in the page can iterate — a form that opens and does nothing.
  const script = formPageScript(NONCE, undefined);

  assert.equal(literal(script, 'INITIAL_ARGS'), '[]');
  assert.equal(literal(script, 'INITIAL_SCRIPT_VARS'), '[]');
  assert.equal(literal(script, 'INITIAL_FORWARDS'), '[]');
});

test('the nonce it is given is the one on its script tag', () => {
  // The page's CSP allows exactly this nonce; a mismatch is a script that never runs.
  assert.match(formPageScript(NONCE, undefined), new RegExp(`<script nonce="${NONCE}">`));
});

test('stored command arguments arrive as data the page can edit', () => {
  const script = formPageScript(
    NONCE,
    entity({ commandArgs: [{ name: '--region', value: 'eu-west-1' }] } as Partial<EntityMetadata>),
  );

  assert.deepEqual(JSON.parse(literal(script, 'INITIAL_ARGS')), [
    { name: '--region', value: 'eu-west-1' },
  ]);
});

test('a port forward is rendered back into the ONE compact field people actually edit', () => {
  // A rule is edited as `port:host:hostport`, the text already in their ~/.ssh/config — not as
  // four separate boxes to be reassembled.
  const script = formPageScript(
    NONCE,
    entity({
      portForwards: [{ kind: 'local', bindPort: 8080, host: 'db.internal', hostPort: 5432 }],
    } as Partial<EntityMetadata>),
  );

  const parsed = JSON.parse(literal(script, 'INITIAL_FORWARDS')) as { kind: string; rule: string }[];
  assert.equal(parsed[0].kind, 'local');
  assert.match(parsed[0].rule, /8080:db\.internal:5432/);
});

test('a DISABLED forward stays disabled — it is a saved rule, not a deleted one', () => {
  const script = formPageScript(
    NONCE,
    entity({
      portForwards: [
        { kind: 'local', bindPort: 1, host: 'h', hostPort: 2, disabled: true },
        { kind: 'local', bindPort: 3, host: 'h', hostPort: 4 },
      ],
    } as Partial<EntityMetadata>),
  );

  const parsed = JSON.parse(literal(script, 'INITIAL_FORWARDS')) as { disabled: boolean }[];
  assert.deepEqual(parsed.map((f) => f.disabled), [true, false]);
});

test('a quote in a stored value cannot break the JSON literal', () => {
  const script = formPageScript(
    NONCE,
    entity({ commandArgs: [{ name: 'q', value: 'he said "hi" \\ and left' }] } as Partial<EntityMetadata>),
  );

  const parsed = JSON.parse(literal(script, 'INITIAL_ARGS')) as { value: string }[];
  assert.equal(parsed[0].value, 'he said "hi" \\ and left');
});

test('a stored value containing </script> does not end the inline script tag', () => {
  // The one that is not obvious: JSON.stringify escapes quotes and backslashes but leaves
  // `</script>` alone, and an HTML parser ends a script element at that sequence REGARDLESS of
  // the JavaScript context it appears in. The value comes from a synced vault, so it is not
  // necessarily this person's own text.
  const script = formPageScript(
    NONCE,
    entity({
      commandArgs: [{ name: 'x', value: '</script><img src=x onerror=alert(1)>' }],
    } as Partial<EntityMetadata>),
  );

  const body = script.slice(script.indexOf('>') + 1);
  const endsAt = body.indexOf('</script>');
  assert.equal(
    body.slice(endsAt + '</script>'.length).trim(),
    '',
    'markup after the first </script> means the tag was closed early:\n' + body.slice(endsAt, endsAt + 200),
  );
});

test('a backtick in a stored value does not end the host template literal', () => {
  // The template-string trap this module's own docblock records, arriving through data rather
  // than through source.
  const script = formPageScript(
    NONCE,
    entity({ scriptVars: [{ name: 'v', value: '`${process.env.HOME}`' }] } as Partial<EntityMetadata>),
  );

  const parsed = JSON.parse(literal(script, 'INITIAL_SCRIPT_VARS')) as { value: string }[];
  assert.equal(parsed[0].value, '`${process.env.HOME}`');
});

test('the whole script still parses with hostile values in every list', () => {
  // Parsing is the assertion that matters: a script that does not parse never runs, and the
  // form silently fails to open.
  const script = formPageScript(
    NONCE,
    entity({
      commandArgs: [{ name: '"', value: '\\' }],
      scriptVars: [{ name: '\n', value: '</script>' }],
      portForwards: [{ kind: 'local', bindPort: 1, host: '"', hostPort: 2 }],
    } as Partial<EntityMetadata>),
  );

  const body = script.replace(/^<script[^>]*>/, '').replace(/<\/script>\s*$/, '');
  assert.doesNotThrow(() => new Function('acquireVsCodeApi', body));
});
