import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ResolvedCommand, resolveCommand } from '../commandLine';
import { NAME_PATTERNS } from '../commandName';
import { commandPreviewScript } from '../commandPreviewScript';
import { jsonForScript } from '../webviewHtml';
import { MiniDocument, runFragment } from './miniDom';
import { ACCEPTED, REFUSED, REFUSED_MORE, TOKEN_ROWS } from './commandNameTable';

/**
 * The form's "Full command" preview runs the REAL fragment under `miniDom.ts` (parent
 * `PLAN_terminal_folder_run.md` §1, story S2). It must agree with `resolveCommand` for every name and every token
 * row: the preview is what the person reads before saving, and the line that runs is another string if it does not.
 */

const PRELUDE = "var argRows = [{ value: '-t {name}' }, { value: '{name}', disabled: true }]; function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }";
const NAMES = ['updatePreview', 'wirePreviewName', 'resolvedPreview'] as const;

function page() {
  const doc = new MiniDocument();
  const elements = {
    command: doc.place('command', 'input'),
    name: doc.place('name', 'input'),
    preview: doc.place('commandPreview', 'input'),
    refusal: doc.place('commandPreviewRefusal', 'p'),
  };
  return { elements, fns: runFragment(PRELUDE + commandPreviewScript(), doc, NAMES) };
}

/** A value that left the `vm` context, as this realm's own. */
const own = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

/** What the preview must show for what `resolveCommand` answered. */
function expectedPreview(resolved: ResolvedCommand): { line: string; refusal: string } {
  if (resolved.kind === 'refused') {
    return { line: resolved.template, refusal: resolved.reason };
  }
  return { line: resolved.kind === 'ready' ? resolved.line : '', refusal: '' };
}

test('the_preview_agrees_with_resolveCommand_for_every_name_and_token', () => {
  const { fns } = page();
  for (const name of [...ACCEPTED, ...REFUSED, ...REFUSED_MORE]) {
    for (const template of TOKEN_ROWS) {
      const resolved = resolveCommand({ name, command: template });
      const expected = expectedPreview(resolved);
      const label = `${JSON.stringify(name)} x ${JSON.stringify(template)}`;
      assert.deepEqual(own(fns.resolvedPreview(template as never, name as never)), expected, label);
    }
  }
});

test('the_preview_reads_the_live_name_field_and_listens_to_it', () => {
  const { elements, fns } = page();
  elements.command.value = 'tmux attach';
  elements.name.value = ' alert ';

  fns.updatePreview();
  assert.equal(elements.preview.value, 'tmux attach -t alert', 'the name is trimmed as the save trims it; the disabled row is not in the line');
  assert.equal(elements.refusal.hidden, true);

  fns.wirePreviewName();
  elements.name.value = 'a b';
  elements.name.fire('input');
  assert.equal(elements.preview.value, 'tmux attach -t {name}');
  assert.equal(elements.refusal.hidden, false);
  assert.ok(elements.refusal.textContent.startsWith('Will not run: '), elements.refusal.textContent);
});

test('the_patterns_survive_the_escaper_as_u_flag_sources', () => {
  const script = commandPreviewScript();
  for (const source of Object.values(NAME_PATTERNS)) {
    const literal = jsonForScript(source);
    assert.ok(script.includes(literal), `the fragment holds ${literal}`);
    assert.equal(JSON.parse(literal), source, 'evaluating the literal answers the pattern exactly');
    assert.doesNotThrow(() => new RegExp(source, 'u'));
  }
  assert.ok(script.includes('(?\\u003c![$#%{])'), 'the token’s < travels escaped');
});

test('the_fragment_can_sit_in_a_template_literal', () => {
  const script = commandPreviewScript();
  assert.ok(!script.includes('`'), 'no backtick');
  assert.ok(!script.includes('${'), 'and no unintended interpolation either');
  assert.ok(!/<\/script/i.test(script), 'and no script end tag');
});
