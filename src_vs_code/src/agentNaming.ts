/**
 * Which second entry a refusal is about, so that one chooser can decide whether the agent may be told about it (rule B of
 * `todo/PLAN_agent_refusal_names_unlisted_entry.md`). `relation` says HOW the addressed entry uses it: the key it borrows, or a hop of its chain.
 */
export interface SecondEntry {
  readonly id: string;
  readonly relation: 'linked key' | 'jump host';
}

/** What an agent reads when a second entry that it may not view stopped the call. It names the addressed entry only. */
export function SECOND_ENTRY_REFUSED(entityName: string): string {
  return `"${entityName}" could not be used: another entry that it needs (a linked key or a jump host) stopped the call, and that entry is not visible to agents. The reason is in the agent journal on this computer.`;
}

/** What the journal says for each relation: the relation, never the entry. A name or an id cannot arrive here, because none is read. */
const RELATION_LINE: Readonly<Record<SecondEntry['relation'], string>> = {
  'linked key': 'its linked key entry did not open for an automatic use (a PIN of its own, or a damaged value)',
  'jump host': 'a jump host in its chain has an address that is not a valid host',
};

/**
 * The ONE chooser of rule B: what an agent reads when a refusal is about a second entry, and what the journal is told instead.
 *
 * <p>The question is about the SITE, not about the value. A resolver sets `second` whenever the owner of a stopped value or the hop that cannot
 * be used is ANOTHER entry than the one that was asked for, whatever the sentence says; this function alone decides, from `mayView`, whether the
 * agent may read that sentence. When it may not, it reads {@link SECOND_ENTRY_REFUSED}, which names the addressed entry only, and the line for
 * the relation goes to the journal. `message` and `second.id` never enter that line. No `second`, or one the agent may view: the message as it
 * was, and no note. It imports nothing: the question is a function, so the module stays pure and a test needs no stub.</p>
 */
export function agentRefusal(
  said: { readonly message: string; readonly second?: SecondEntry },
  entityName: string,
  mayView: (entityId: string) => boolean,
): { readonly message: string; readonly note?: string } {
  if (said.second === undefined || mayView(said.second.id)) {
    return { message: said.message };
  }
  return {
    message: SECOND_ENTRY_REFUSED(entityName),
    note: `${entityName}: ${RELATION_LINE[said.second.relation]} (the agent was told only that another entry stopped the call)`,
  };
}
