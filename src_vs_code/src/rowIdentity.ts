/**
 * Which tree rows have been re-created, and how many times (tails T11).
 *
 * <p>VS Code reads a node's `collapsibleState` only for a NEW node; a node it already holds keeps
 * its expansion across a refresh (`PreserveOrCollapsed` in its async tree — measured on the
 * owner's tree, where a same-id refresh restored nothing). So putting a twisty back where the
 * workbench's double-click toggle moved it means giving the row a new id, and the count of
 * re-creations is what rides it.</p>
 */
export class RowGenerations {
  private readonly counts = new Map<string, number>();

  /** One more incarnation for this key. */
  bump(key: string): void {
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }

  /** The row's id: the base alone until it has been re-created, then the base and the count. */
  idFor(base: string, key: string): string {
    const generation = this.counts.get(key) ?? 0;
    return generation === 0 ? base : `${base}#${generation}`;
  }
}
