import {
  DEFAULT_SNIPPET_LANGUAGE,
  SNIPPET_LANGUAGES,
  snippetFor,
  snippetLanguage,
} from './configSnippet';
import { CONFIG_KEY_ENV } from './configKey';
import { configFileNameFor } from './configFile';
import { EntityMetadata } from './types';

/**
 * `GET /v1/mcp/config-snippet` — how an application reads THIS config, told to an agent
 * (tails T10).
 *
 * <p>Config entities shipped with a twenty-language answer to "how do I read this from code?" —
 * in the viewer, where an agent cannot look. The agent is the one actor best placed to wire the
 * reading code into `Program.cs`, and the one surface built for agents never learned the
 * feature existed. This route serves the SAME catalog the viewer renders (`configSnippet.ts` —
 * one catalog, so the two surfaces cannot drift), and the tool's tests pin byte-identity.</p>
 *
 * <p><b>What it discloses, decided out loud:</b> the snippet — public text assembled from the
 * entry's file name and format — and the language catalog. It serves only entries the caller's
 * SUPPLIER offers, and the supplier is wired to the same agent-visibility wall the entries
 * route uses: an entry no switch was turned on for cannot be named here, so this route reveals
 * strictly less than `/v1/mcp/entries` already does. It never returns the config BODY and has
 * no shape a secret could travel in.</p>
 *
 * <p><b>The key is never minted here.</b> The snippet names `CREDSFORDEVS_KEY`; whether a key
 * exists is `codeAccessEnabled` on the listing, and minting one is the person's own
 * *Enable Code Access…* — stating that boundary in the tool description is what stops a model
 * from hunting for a way around it.</p>
 */

export interface SnippetCatalogLanguage {
  readonly id: string;
  readonly label: string;
  readonly variants: ReadonlyArray<{ readonly id: string; readonly label: string }>;
}

export interface ConfigSnippetBody {
  /** Set when the id names nothing an agent may see. The route still answers 200 — the MCP
   * tool reads the body either way, and "which ids exist" is already the entries route's
   * disclosure, not this one's. */
  readonly error?: string;
  /** The environment variable the generated code reads the key from. */
  readonly envVar: string;
  readonly languages: readonly SnippetCatalogLanguage[];
  /** Present when a language was asked for. */
  readonly snippet?: {
    readonly language: string;
    readonly variant: string;
    readonly code: string;
    /** Where the code goes — "Program.cs, before builder.Build()." — the field a bare code
     * block loses and the one an agent needs most. */
    readonly where: string;
    readonly does: string;
  };
}


/** The catalog alone — what the tool answers when no language is given, so the agent picks
 * rather than guesses. */
export function snippetCatalog(): readonly SnippetCatalogLanguage[] {
  return SNIPPET_LANGUAGES.map((language) => ({
    id: language.id,
    label: language.label,
    variants: language.variants.map((variant) => ({ id: variant.id, label: variant.label })),
  }));
}

/**
 * Answer one snippet request.
 *
 * <p>`details` is the ALREADY-AUTHORIZED entry — the caller resolved the id against the same
 * visibility wall the entries route uses, and `undefined` means "not visible or not a config",
 * deliberately indistinguishable. Language and variant are untrusted strings off a query;
 * `snippetFor` falls back rather than throwing, the same contract the viewer relies on.</p>
 */
export function configSnippetResult(
  details: EntityMetadata | undefined,
  language: string | undefined,
  variant: string | undefined,
): ConfigSnippetBody {
  if (!isVisibleConfig(details)) {
    return { error: 'no such config is open to agents', envVar: CONFIG_KEY_ENV, languages: [] };
  }
  return withSnippet({ envVar: CONFIG_KEY_ENV, languages: snippetCatalog() }, details, language, variant);
}

/** The catalog alone when no language was asked for; the catalog plus the snippet when one was. */
function withSnippet(
  base: ConfigSnippetBody,
  details: EntityMetadata,
  language: string | undefined,
  variant: string | undefined,
): ConfigSnippetBody {
  return language ? { ...base, snippet: snippetPart(details, language, variant ?? '') } : base;
}

function isVisibleConfig(details: EntityMetadata | undefined): details is EntityMetadata {
  return details !== undefined && details.isConfig === true;
}

function snippetPart(
  details: EntityMetadata,
  language: string,
  variant: string,
): NonNullable<ConfigSnippetBody['snippet']> {
  const resolvedLanguage = snippetLanguage(language)?.id ?? DEFAULT_SNIPPET_LANGUAGE;
  const snippet = snippetFor(resolvedLanguage, variant, {
    envVar: CONFIG_KEY_ENV,
    fileName: configFileNameFor(details.configFileName, details.configFormat ?? 'json', details.name),
  });
  return { language: resolvedLanguage, variant, code: snippet.code, where: snippet.where, does: snippet.does };
}
