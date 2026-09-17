/**
 * The other ways an agent can reach an entry — the ones the six MCP switches do not show
 * (tails T24b, the owner's yes on 2026-08-28).
 *
 * <p>The switches cover the broker's entry-level actions. Five more doors exist and each has
 * its own lifecycle. Two of them are genuinely modal-free and are listed first: a config's
 * code-access key (a key, not a grant — no dialog at all) and, since #95, an entry whose consent
 * policy resolves to `never`. The other three raise a dialog on every call and the consent policy
 * does not change that: a CLI alias (`creds ssh <name>`, reachable from an agent's terminal), the
 * Remote Bridge, and the WSL agent relay. The CLI row used to claim it had no consent modal, which
 * was never true — `handleAlias` mints a grant and calls `perform`, which calls `consent` — and the
 * sentence that replaced it went the other way, handing the alias route to a cadence that is wired
 * into the MCP use door alone. Duplicating their on/off here would make
 * two owners for one door; what the form does instead is REFUSE TO HIDE THEM: a read-only
 * footer under the switches lists whichever are live for this entry, each with the command
 * that manages it. Nothing agent-reachable is invisible from the place a person reasons about
 * agent access.</p>
 *
 * <p>Pure: the state comes in, the rows come out, and the text is one table.</p>
 */

export interface AgentDoors {
  /** CLI alias names pointing at this entry. */
  readonly cliAliases: readonly string[];
  /** A code-access key has been minted (configs only). */
  readonly codeAccess: boolean;
  /** A Remote Bridge is open for this entry right now. */
  readonly bridgeOpen: boolean;
  /** The WSL agent relay is on — every key entity is reachable from inside WSL. */
  readonly wslRelay: boolean;
  /**
   * An agent may USE this entry with no dialog at all (#95) — the cadence resolved to `never` AND
   * the use rung is on.
   *
   * <p>Both halves, because the row says an agent may use this entry without being asked: with
   * `use` off no agent can use it at all, and the row would be naming a door that is not there.
   * This footer's whole promise is that what it lists is LIVE.</p>
   */
  readonly standingConsent: boolean;
}

export interface AgentDoorRow {
  readonly label: string;
  readonly detail: string;
  /**
   * The command that manages this door — the "go there" the footer offers.
   *
   * <p>Absent for a door managed on the page the footer is ON. The consent cadence is the only one
   * so far: its control is a few lines above this row on the entity form, and offering `editNode`
   * there would re-open the form somebody is filling in and throw away what they had typed. The
   * detail says where to change it instead, which is what the viewer needs too.</p>
   */
  readonly command?: string;
}

/** Every door, in the order a person should read them — the modal-free ones first. */
const DOORS: ReadonlyArray<{ live: (d: AgentDoors) => boolean; row: (d: AgentDoors) => AgentDoorRow }> = [
  {
    live: (d) => d.standingConsent,
    row: () => ({
      label: 'No consent prompt',
      // "Saved as", because this is the one row on this footer whose value the form itself can
      // change: the consent group is on the same page. A row phrased in the present tense would be
      // false the moment somebody picked another cadence and had not saved yet.
      detail:
        'Saved as: an agent may USE this entry without being asked. Change it in Agent access, '
        + 'under the consent setting. Creating and deleting still ask, and every call is still recorded.',
    }),
  },
  {
    live: (d) => d.codeAccess,
    row: () => ({
      label: 'Code access key',
      detail: 'An application — or an agent that holds the key — reads this config with no consent modal.',
      command: 'credSshManager.revokeConfigAccess',
    }),
  },
  {
    live: (d) => d.cliAliases.length > 0,
    row: (d) => ({
      label: `CLI: ${d.cliAliases.map((name) => `creds … ${name}`).join(', ')}`,
      // Not "no consent modal", which was false — and not "follows this entry's consent setting",
      // which was false the other way. `preConsent` is wired into the MCP use door alone (D1);
      // `handleAlias` mints a fresh grant per call and hands it to `perform`, so `consent` asks
      // even for a never-ask entry. Said plainly, because a person reading the row above it will
      // otherwise carry "without being asked" over to their terminal.
      detail: 'Usable from any terminal on this machine while this window is open — an agent in a terminal included. It asks every time, whatever the consent setting above says: the cadence governs what an agent does through MCP, and this route mints a fresh grant per call.',
      command: 'credSshManager.enableCliAccess',
    }),
  },
  {
    live: (d) => d.bridgeOpen,
    row: () => ({
      label: 'Remote Bridge open',
      detail: 'The same CLI route, from the Remote-SSH host.',
      command: 'credSshManager.closeRemoteBridge',
    }),
  },
  {
    live: (d) => d.wslRelay,
    row: () => ({
      label: 'WSL agent relay on',
      detail: 'ssh and git inside WSL can use this key, with a dialog per signature.',
      command: 'credSshManager.setUpWslRelay',
    }),
  },
];

/** The live doors only. */
export function agentDoorRows(doors: AgentDoors): AgentDoorRow[] {
  return DOORS.filter((door) => door.live(doors)).map((door) => door.row(doors));
}

/** What the activate scope reads the doors from — plain callbacks, so this stays vscode-free. */
export interface DoorSources {
  readonly aliasesFor: (accountId: string, entityId: string) => readonly string[];
  readonly bridgeOpen: (accountId: string, entityId: string) => boolean;
  readonly wslRelayOn: () => boolean;
  readonly isKeyEntity: (details: unknown) => boolean;
}

/** The doors of one entry, from the sources — the form gets plain data. */
export function doorsOf(
  sources: DoorSources,
  accountId: string,
  entityId: string,
  details: { configKeyHash?: string } | undefined,
  /**
   * Whether an agent may use this entry with no dialog (#95).
   *
   * <p>A BOOLEAN rather than a node and a tree walk, so this function stays what it is — state in,
   * rows out — and its tests need no synthetic hierarchy. The walk is `standingConsentFor` in
   * `mcpAccess.ts`, where the policy lives: a broker or a command that needs the same answer must
   * not have to import this UI module to get it.</p>
   */
  standingConsent: boolean,
): AgentDoors {
  return {
    cliAliases: sources.aliasesFor(accountId, entityId),
    codeAccess: details?.configKeyHash !== undefined,
    bridgeOpen: sources.bridgeOpen(accountId, entityId),
    wslRelay: details !== undefined && sources.isKeyEntity(details) && sources.wslRelayOn(),
    standingConsent,
  };
}

