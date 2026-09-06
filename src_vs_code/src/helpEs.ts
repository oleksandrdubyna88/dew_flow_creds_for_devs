import { HelpBody } from './helpContent';

/**
 * Es bodies, one entry per article id.
 *
 * <p>Empty at the split (2026-09-06) and filled by the content pass. Every article missing from
 * here falls back to English VISIBLY — "not translated yet — showing English" — which is the rule
 * the catalog has always had: a missing translation must never hide an article.</p>
 */
export const ES_BODIES: Readonly<Record<string, HelpBody>> = {};
