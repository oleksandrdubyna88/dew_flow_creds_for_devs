import { describeError } from './describeError';

/**
 * What a config entity IS, as a format rather than as a language.
 *
 * <p>`scriptLanguage` puts JSON in a list beside Bash and Dockerfile, which is exactly right for
 * highlighting something a shell runs and exactly wrong for a document an application parses. A
 * config carries a FORMAT: it decides what "valid" means, what extension materialising gives the
 * file, and which fields the Fields tab can offer.</p>
 *
 * <p>Free of `vscode`, and the home the validators will be written into — so what counts as a
 * valid `.env` stays a unit test rather than something discovered by saving one.</p>
 */

/**
 * The formats a config entity may be stored as.
 *
 * <p>Only formats the product can VALIDATE belong here. `src_vs_code` ships no runtime
 * dependencies — deliberately, for something that holds secrets — so every checker is written by
 * hand, and offering a format nobody can check would make "valid" a word that means nothing. How
 * exact each check is differs by format and is stated per format where the checker lives.</p>
 */
export const CONFIG_FORMATS = ['json', 'env', 'yaml', 'xml', 'toml', 'ini'] as const;

export type ConfigFormat = (typeof CONFIG_FORMATS)[number];

/** How each format is named on screen, and the extension materialising gives it. */
export const CONFIG_FORMAT_LABELS: Readonly<Record<ConfigFormat, { label: string; ext: string }>> = {
  json: { label: 'JSON', ext: '.json' },
  env: { label: '.env', ext: '.env' },
  yaml: { label: 'YAML', ext: '.yaml' },
  xml: { label: 'XML', ext: '.xml' },
  toml: { label: 'TOML', ext: '.toml' },
  ini: { label: 'INI', ext: '.ini' },
};

export function isConfigFormat(value: unknown): value is ConfigFormat {
  return typeof value === 'string' && (CONFIG_FORMATS as readonly string[]).includes(value);
}

/**
 * The config fields of a stored record, checked together.
 *
 * <p>Its own function so `isEntityMetadata` does not grow a fourth screen: that guard is a flat
 * list of independent field checks, and the useful unit to add to it is one per FEATURE rather
 * than one per property.</p>
 */
export function hasValidConfigFields(v: Record<string, unknown>): boolean {
  return optionalBoolean(v.isConfig) && optionalFormat(v.configFormat) && optionalString(v.configFileName);
}

// Three one-line predicates rather than three inline `x === undefined || …` pairs: the same split
// `typeGuards.ts` makes next door, and for the same reason — each `||` counts against the
// complexity ceiling, so a guard over four optional fields cannot be written as one expression.
function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function optionalFormat(value: unknown): boolean {
  return value === undefined || isConfigFormat(value);
}

// ---------- is this body what it claims to be? ----------

/**
 * What is wrong with a config body, or `undefined` when nothing is.
 *
 * <p>Shaped after `describeAliasProblem` next door: the absence of a problem is the common answer
 * and reads best as `undefined`, and the presence of one carries the words the person needs to fix
 * it rather than a code somebody has to look up.</p>
 */
export interface ConfigProblem {
  readonly message: string;
  /** 1-based, and absent when the checker genuinely does not know — never guessed. */
  readonly line?: number;
}

/**
 * The verdict on a body. Never blocks a save; it decides the message and the tree marker.
 *
 * <p>An empty body is valid for every format: a config entity somebody has just made and not yet
 * filled in is not a broken one, and marking it would put `!!!` on every entry at the moment it
 * was created.</p>
 *
 * <p>The placeholder check runs FIRST and for every format, because it is the one defect that
 * survives a successful parse — `"${DB_PASSWORD"` is a perfectly good JSON string, and what
 * reaches the application is that text rather than a password.</p>
 */
export function describeConfigProblem(format: ConfigFormat, body: string): ConfigProblem | undefined {
  if (body.trim().length === 0) {
    return undefined;
  }
  return unclosedPlaceholder(body) ?? CHECKERS[format](body);
}

type Checker = (body: string) => ConfigProblem | undefined;

/**
 * How exact each check is, in one place.
 *
 * <p>JSON and `.env` are checked EXACTLY — `JSON.parse` exists, and `.env` is a line grammar
 * small enough to state. The other four are checked STRUCTURALLY, by hand, because this extension
 * ships no runtime dependencies and a YAML parser would be its first. Each of those four accepts
 * documents a real parser would reject; `configValidation.test.ts` records which, so that "valid"
 * is read as "nothing obviously wrong" rather than as "a parser accepted this".</p>
 */
const CHECKERS: Record<ConfigFormat, Checker> = {
  json: checkJson,
  env: checkEnv,
  yaml: checkYaml,
  xml: checkXml,
  toml: checkSectioned,
  ini: checkSectioned,
};

// ---------- placeholders ----------

/** `${` opened and not closed by a well-formed name — in any format, since all carry text. */
function unclosedPlaceholder(body: string): ConfigProblem | undefined {
  const lines = body.split('\n');
  for (const [index, line] of lines.entries()) {
    if (hasUnclosedPlaceholder(line)) {
      return {
        message:
          'A `${` on this line is never closed by a name and a `}` — the application receives that text literally, not a value.',
        line: index + 1,
      };
    }
  }
  return undefined;
}

/**
 * Whether a line opens a placeholder it does not close.
 *
 * <p>The name must be an identifier, and the character after it must be `}`. Looking merely for
 * the next `}` anywhere is not enough: `{"pw": "${DB_PASSWORD"}` has one, at the end of the
 * object, and that body is broken while looking closed.</p>
 */
function hasUnclosedPlaceholder(line: string): boolean {
  for (const match of line.matchAll(/\$\{/g)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*\}/.test(line.slice((match.index ?? 0) + 2))) {
      return true;
    }
  }
  return false;
}

// ---------- JSON: exact ----------

function checkJson(body: string): ConfigProblem | undefined {
  try {
    JSON.parse(body);
    return undefined;
  } catch (error) {
    const text = describeError(error);
    return { message: `Not valid JSON — ${text}`, line: jsonErrorLine(text) };
  }
}

/**
 * The line V8 named, or nothing.
 *
 * <p>V8 has two message shapes and only one carries a position (measured on Node 24):
 * `Expected ',' or '}' after property value in JSON at position 13 (line 4 column 1)` against
 * `Unexpected token 'o', ..."b": oops` with no position at all. The second carries a context
 * SNIPPET, which spans the failure rather than pointing at it — locating it in the body would be
 * guesswork built on a message format that is not a contract. An absent line is honest; a wrong
 * one sends somebody to the wrong place in a file they are already unsure about.</p>
 */
function jsonErrorLine(text: string): number | undefined {
  const named = /\bline (\d+)/i.exec(text);
  return named === null ? undefined : Number(named[1]);
}

// ---------- .env: exact ----------

/** `KEY=value`, `export KEY=value`, `# comment`, or blank. Nothing else is a line of a `.env`. */
function checkEnv(body: string): ConfigProblem | undefined {
  return firstBadLine(body, (line) => envLineProblem(line));
}

function envLineProblem(line: string): string | undefined {
  const text = line.trim().replace(/^export\s+/, '');
  if (text.length === 0 || text.startsWith('#')) {
    return undefined;
  }
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(text)
    ? undefined
    : envReason(text);
}

function envReason(text: string): string {
  return text.includes('=')
    ? `"${text.split('=')[0].trim()}" is not a name a shell could export — use letters, digits and underscore, not starting with a digit.`
    : 'This line is neither a comment nor `NAME=value`.';
}

// ---------- YAML: structural ----------

/**
 * The one YAML error worth catching without a parser: a tab used as indentation.
 *
 * <p>The specification forbids it outright, every editor renders it identically to spaces, and it
 * is therefore the mistake that costs the most time per occurrence. Everything else about YAML —
 * inconsistent indentation, an unterminated quote, a duplicate key — needs a real parser, and the
 * limits are recorded as tests rather than implied by silence.</p>
 */
function checkYaml(body: string): ConfigProblem | undefined {
  return firstBadLine(body, (line) =>
    /^[ ]*\t/.test(line)
      ? 'YAML forbids a tab as indentation, and it looks exactly like spaces in every editor.'
      : undefined,
  );
}

// ---------- TOML and INI: structural ----------

/** A section header that opens and never closes — the one that silently swallows the keys under it. */
function checkSectioned(body: string): ConfigProblem | undefined {
  return firstBadLine(body, (line) => {
    const text = line.trim();
    return text.startsWith('[') && !text.endsWith(']')
      ? 'This section header opens with `[` and never closes — every key below it belongs to the wrong place.'
      : undefined;
  });
}

/** Walk the lines, stop at the first one a rule objects to, and report it by number. */
function firstBadLine(
  body: string,
  reason: (line: string) => string | undefined,
): ConfigProblem | undefined {
  for (const [index, line] of body.split('\n').entries()) {
    const message = reason(line);
    if (message !== undefined) {
      return { message, line: index + 1 };
    }
  }
  return undefined;
}

// ---------- XML: structural ----------

interface XmlTag {
  readonly name: string;
  readonly closing: boolean;
  readonly selfClosing: boolean;
  readonly line: number;
}

/**
 * Tag balance, which is the XML error people actually make.
 *
 * <p>Comments, CDATA, processing instructions and the doctype are blanked out FIRST rather than
 * skipped in the scan — a `</a>` inside a comment is text, and treating it as structure would
 * report a perfectly good document as broken. Blanking preserves every newline, so the line
 * numbers stay the document's own.</p>
 *
 * <p>Known limit, recorded here rather than discovered: an attribute value containing `>` ends
 * the tag early for this scanner. A real parser knows it is inside a quoted value; this one does
 * not, and giving it that knowledge is most of writing the parser.</p>
 */
function checkXml(body: string): ConfigProblem | undefined {
  const open: XmlTag[] = [];
  for (const tag of xmlTags(withoutXmlNoise(body))) {
    const problem = applyXmlTag(open, tag);
    if (problem !== undefined) {
      return problem;
    }
  }
  return unclosedXmlTag(open);
}

function unclosedXmlTag(open: readonly XmlTag[]): ConfigProblem | undefined {
  const last = open[open.length - 1];
  return last === undefined
    ? undefined
    : { message: `<${last.name}> is opened here and never closed.`, line: last.line };
}

function applyXmlTag(open: XmlTag[], tag: XmlTag): ConfigProblem | undefined {
  if (tag.selfClosing) {
    return undefined;
  }
  if (tag.closing) {
    return closeXmlTag(open, tag);
  }
  open.push(tag);
  return undefined;
}

/** Its own function only because the complexity ceiling is four, and this branch is two of it. */
function closeXmlTag(open: XmlTag[], tag: XmlTag): ConfigProblem | undefined {
  const started = open.pop();
  return started?.name === tag.name
    ? undefined
    : { message: xmlMismatch(tag, started), line: tag.line };
}

function xmlMismatch(tag: XmlTag, started: XmlTag | undefined): string {
  return started === undefined
    ? `</${tag.name}> closes a tag that was never opened.`
    : `</${tag.name}> closes <${started.name}>, which is not what was open here.`;
}

function* xmlTags(body: string): Generator<XmlTag> {
  for (const match of body.matchAll(/<(\/?)([A-Za-z_][\w.:-]*)[^>]*?(\/?)>/g)) {
    yield {
      name: match[2],
      closing: match[1] === '/',
      selfClosing: match[3] === '/',
      line: body.slice(0, match.index ?? 0).split('\n').length,
    };
  }
}

/** Everything that LOOKS like markup but is not structure, blanked out with its newlines kept. */
function withoutXmlNoise(body: string): string {
  return body.replace(
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>/gi,
    (found) => found.replace(/[^\n]/g, ' '),
  );
}

// ---------- what to say about it ----------

/**
 * What to tell somebody who just saved a config that does not parse.
 *
 * <p>A save is never refused. A config is often pasted in halves, and a vault that will not hold
 * work in progress is a vault people keep a copy of on the side — which is the exact habit this
 * whole feature exists to end. So the body is stored, the person is told, and the row carries the
 * mark until it parses.</p>
 *
 * <p>The line is included only when a checker knew one. "Line undefined" would be worse than
 * silence, and a guessed line worse still.</p>
 */
export function savedButInvalidNotice(
  name: string,
  format: ConfigFormat,
  problem: ConfigProblem,
): string {
  const where = problem.line === undefined ? '' : ` on line ${problem.line}`;
  return `"${name}" was saved, but it is not valid ${CONFIG_FORMAT_LABELS[format].label}${where}. ${problem.message} The entry stays marked !!! until it parses.`;
}
