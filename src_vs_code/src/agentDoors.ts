/**
 * The other ways an agent can reach an entry — the ones the six MCP switches do not show
 * (tails T24b, the owner's yes on 2026-08-28).
 *
 * <p>The switches cover the broker's entry-level actions. Four more doors exist and each has
 * its own lifecycle: a CLI alias (`creds ssh <name>` — reachable from an agent's terminal, with
 * no consent modal on the alias routes), the Remote Bridge, the WSL agent relay, and a config's
 * code-access key (a standing door, no modal at all). Duplicating their on/off here would make
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
}

export interface AgentDoorRow {
  readonly label: string;
  readonly detail: string;
  /** The command that manages this door — the "go there" the footer offers. */
  readonly command: string;
}

/** Every door, in the order a person should read them — the modal-free ones first. */
const DOORS: ReadonlyArray<{ live: (d: AgentDoors) => boolean; row: (d: AgentDoors) => AgentDoorRow }> = [
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
      detail: 'Usable from any terminal on this machine while this window is open — an agent in a terminal included.',
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
): AgentDoors {
  return {
    cliAliases: sources.aliasesFor(accountId, entityId),
    codeAccess: details?.configKeyHash !== undefined,
    bridgeOpen: sources.bridgeOpen(accountId, entityId),
    wslRelay: details !== undefined && sources.isKeyEntity(details) && sources.wslRelayOn(),
  };
}
