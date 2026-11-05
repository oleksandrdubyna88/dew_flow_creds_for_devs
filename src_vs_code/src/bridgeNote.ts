/**
 * The words a Remote Bridge shares between the door, the router and (from E1.3) the notes it writes.
 *
 * <p>Pure: imports no `vscode`. This story holds the one constant; E1.3 adds the rest.</p>
 */

/** The header a Remote Bridge client sends its per-listener key in. Node lower-cases it on arrival. */
export const BRIDGE_KEY_HEADER = 'X-Creds-Bridge';
