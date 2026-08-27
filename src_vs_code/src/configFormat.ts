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
