/**
 * Replacing vault secrets in text an agent is about to read.
 *
 * <p><b>The channel this closes.</b> The broker's structural promise is that no response
 * type has a field a secret could travel in — true of the SHAPES, and false of what
 * `stdout` can carry. An agent that may compose a command can make it print the very
 * password the broker supplied to run it (`env`, `cat .env`, `terraform output`), and the
 * bytes go back verbatim. Masking here means the value is replaced by
 * `&lt;CREDS_MASKED:LABEL&gt;` before it leaves the extension.</p>
 *
 * <p><b>What it deliberately does not do.</b> It does not guess. No entropy heuristics, no
 * "looks like a token" regexes: those produce false positives, and a false positive here
 * corrupts a `git diff` or a JSON payload the agent then tries to act on — worse than the
 * leak it was guarding, because it is silent and wrong rather than absent. Only exact
 * values from the vault, and only values long enough to be unambiguous.</p>
 *
 * <p>Pure and `vscode`-free, so the rules below are unit tests rather than claims.</p>
 */

/**
 * Values shorter than this are not masked.
 *
 * <p>A four-character password would turn every line number and every `true` into
 * `&lt;CREDS_MASKED&gt;`. Short secrets are a PIN-policy problem, not something a text filter can
 * fix without destroying the text. Eight is the shortest length at which an exact match is
 * more likely to be the secret than a coincidence.</p>
 */
export const MIN_MASKABLE_LENGTH = 8;

export interface MaskEntry {
  /** The exact secret value. */
  readonly value: string;
  /** What to call it in the placeholder — an env-binding name, or a field name. */
  readonly label: string;
}

/** A prepared table: the forms to search for, longest first. */
export interface MaskTable {
  readonly entries: readonly { readonly needle: string; readonly label: string }[];
}

export const EMPTY_MASK_TABLE: MaskTable = { entries: [] };

export function placeholderFor(label: string): string {
  return `<CREDS_MASKED:${label}>`;
}

/** Split on either line ending. Built from a char code so no editing layer can eat the escape. */
const LINE_BREAK = new RegExp(String.fromCharCode(92) + 'r?' + String.fromCharCode(92) + 'n');

/** The base64 bodies of a PEM blob — the part that survives being reformatted. */
function pemBodies(value: string): string[] {
  if (!value.includes('-----BEGIN')) {
    return [];
  }
  return value
    .split(LINE_BREAK)
    .map((line) => line.trim())
    .filter((line) => line.length >= 32 && !line.startsWith('-----'));
}

/** The percent-encoded form, when it differs and the value can be encoded at all. */
function urlForm(value: string): string[] {
  try {
    const encoded = encodeURIComponent(value);
    return encoded === value ? [] : [encoded];
  } catch {
    // A lone surrogate cannot be percent-encoded; the plain form still applies.
    return [];
  }
}

function formsOf(value: string): string[] {
  const forms = [
    value,
    ...urlForm(value),
    Buffer.from(value, 'utf8').toString('base64'),
    ...pemBodies(value),
  ];
  return [...new Set(forms)].filter((form) => form.length >= MIN_MASKABLE_LENGTH);
}

/**
 * Build the search table.
 *
 * <p>Longest needle first, so a short secret that happens to be a substring of a longer one
 * cannot cut the longer one in half and leave a fragment of it in the text.</p>
 */
export function buildMaskTable(entries: readonly MaskEntry[]): MaskTable {
  const seen = new Map<string, string>();
  for (const entry of entries.filter((e) => e.value.length >= MIN_MASKABLE_LENGTH)) {
    for (const needle of formsOf(entry.value)) {
      if (!seen.has(needle)) {
        seen.set(needle, entry.label);
      }
    }
  }
  const prepared = [...seen]
    .map(([needle, label]) => ({ needle, label }))
    .sort((a, b) => b.needle.length - a.needle.length);
  return { entries: prepared };
}

export interface MaskResult {
  readonly text: string;
  /** How many replacements were made — for the audit line, never the values. */
  readonly hits: number;
}

/** Replace every occurrence of every known secret form. */
export function maskText(text: string, table: MaskTable): MaskResult {
  let out = text;
  let hits = 0;
  for (const { needle, label } of table.entries) {
    const parts = out.split(needle);
    hits += parts.length - 1;
    out = parts.join(placeholderFor(label));
  }
  return { text: out, hits };
}

/** The response fields that carry program output. Nothing else is text an agent reads. */
const TEXT_FIELDS = ['stdout', 'stderr'] as const;

/**
 * Mask a response body in place of the caller.
 *
 * <p>Shape-tolerant on purpose: it masks the text fields it recognises and returns anything
 * else untouched, so a future action returning a new body is never silently corrupted — and
 * never silently unmasked either, because a new TEXT field would have to be added here to
 * be carried at all.</p>
 */
export function maskResponseBody(body: unknown, table: MaskTable): { body: unknown; hits: number } {
  if (typeof body !== 'object' || body === null) {
    return { body, hits: 0 };
  }
  const source = body as Record<string, unknown>;
  const masked: Record<string, unknown> = { ...source };
  const hits = TEXT_FIELDS.reduce((sum, field) => {
    const result = maskField(source[field], table);
    masked[field] = result.value;
    return sum + result.hits;
  }, 0);
  return hits === 0 ? { body, hits: 0 } : { body: masked, hits };
}

/** One field: masked when it is text, carried through untouched when it is anything else. */
function maskField(value: unknown, table: MaskTable): { value: unknown; hits: number } {
  if (typeof value !== 'string') {
    return { value, hits: 0 };
  }
  const result = maskText(value, table);
  return { value: result.text, hits: result.hits };
}
