import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

/**
 * A structural guard: no value is interpolated into a template literal with raw
 * `JSON.stringify`.
 *
 * <p><b>This exists because the same defect has now been written three times.</b>
 * `JSON.stringify` escapes quotes and backslashes and leaves `&lt;` exactly as it found it, and
 * an HTML parser ends a script element at `&lt;/script&gt;` wherever that sequence appears —
 * inside a JavaScript string literal included. A value carrying it therefore closes the script
 * early and the remainder of the page's own code is parsed as markup.</p>
 *
 * <p>The three: `webauthnPrf.ts` knew the trap and escaped by hand; `entityFormScript.ts` did
 * not, which was a live defect reachable from any synced vault; and `depPickerScript.ts`
 * reintroduced it in new code, in a fragment interpolated into the very file that had just been
 * fixed and already imported the escaper. Each was found by a person looking. That is not a
 * control.</p>
 *
 * <p>So the rule is mechanical, and the exceptions are named. `jsonForScript` (in
 * `webviewHtml.ts`) is the one sanctioned way to put a value into a template literal; anything
 * else has to be listed below with a reason a reviewer can check. Adding a fourth site now
 * means arguing with this list rather than remembering a rule nobody wrote down.</p>
 *
 * <p>Modelled on `commandsRegistered.test.ts`, which scans the whole tree for the same kind of
 * reason: a gap that is invisible until someone runs the feature is worth a test that makes it
 * impossible to miss.</p>
 */

const SRC = path.join(__dirname, '..', '..', 'src');

/**
 * The interpolations that are NOT markup, each with the reason it is safe.
 *
 * <p>Keyed by file, valued by the exact line content, so moving a line does not silently widen
 * the exemption and neither does adding a second one to the same file.</p>
 */
const ALLOWED: Record<string, { line: string; because: string }[]> = {
  'entityKind.ts': [
    {
      line: 'throw new Error(`${what}: unhandled kind ${JSON.stringify(value)}`);',
      because: 'an exception message, read by a developer in a stack trace — never rendered',
    },
  ],
  'syncMerge.ts': [
    {
      line: '`${t.deletedAt}|${JSON.stringify(sortRecord(t.v))}`,',
      because: 'a hash key for tombstone comparison — never leaves the process',
    },
  ],
};

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'test' ? [] : sourceFiles(full);
    }
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

interface Site {
  file: string;
  line: number;
  text: string;
}

/** Every `${JSON.stringify(…)}` in the shipped source, with where it is. */
function interpolationSites(): Site[] {
  return sourceFiles(SRC).flatMap((full) =>
    fs
      .readFileSync(full, 'utf8')
      .split('\n')
      .flatMap((text, index) =>
        text.includes('${JSON.stringify(')
          ? [{ file: path.basename(full), line: index + 1, text: text.trim() }]
          : [],
      ),
  );
}

function isAllowed(site: Site): boolean {
  return (ALLOWED[site.file] ?? []).some((entry) => entry.line === site.text);
}

test('no value is interpolated into a template literal with raw JSON.stringify', () => {
  // A template literal is how every page, script and fragment in this extension is built, so
  // an interpolation here is markup until proven otherwise. `jsonForScript` is the proof.
  const unexpected = interpolationSites().filter((site) => !isAllowed(site));

  assert.deepEqual(
    unexpected.map((s) => `${s.file}:${s.line}  ${s.text}`),
    [],
    'Use jsonForScript() from webviewHtml.ts, or add the line to ALLOWED with a reason.',
  );
});

test('every ALLOWED entry still exists — a stale exemption is a hole nobody is guarding', () => {
  // An exemption that outlives the line it excused quietly widens what the guard above permits:
  // the next `${JSON.stringify(` in that file would have to match it exactly, but nobody would
  // notice the entry describes code that is gone.
  const sites = interpolationSites();

  for (const [file, entries] of Object.entries(ALLOWED)) {
    for (const entry of entries) {
      assert.ok(
        sites.some((s) => s.file === file && s.text === entry.line),
        `ALLOWED lists ${file} — "${entry.line}" (${entry.because}) but no such line exists any more; remove it.`,
      );
    }
  }
});

test('the sanctioned escaper is what the script-building modules actually use', () => {
  // The guard above is a prohibition; this is the positive half. A module that builds a page
  // script and imports nothing to escape with is either not interpolating anything, or is
  // about to be the fourth instance.
  const builders = ['entityFormScript.ts', 'depPickerScript.ts', 'webauthnPrf.ts', 'entityViewPanel.ts'];

  for (const name of builders) {
    const source = fs.readFileSync(path.join(SRC, name), 'utf8');
    assert.match(source, /jsonForScript/, `${name} builds a page script but escapes nothing`);
  }
});
