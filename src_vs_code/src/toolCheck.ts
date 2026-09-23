/**
 * Which external tools the extension launches, and how to install a missing one (tails T20).
 *
 * <p>Every launch that depends on a binary the extension does not ship — `ssh`, the VPN
 * clients, the DB CLIs — used to fail at its own pace: ssh died inside the terminal it had just
 * opened, the VPN path said "install it" with no help, the DB path refused silently to the
 * agent. One table now owns the answer to "and how do I get it?", per tool, per platform.</p>
 *
 * <p><b>The Linux recipes open with `sudo apt update && sudo apt upgrade -y` by the owner's
 * explicit instruction</b> — recorded as an owner decision in the plan, since an upgrade is
 * more than an install strictly needs. Distro detection is deliberately minimal: apt present →
 * the apt recipe; anything else gets the command named so a person can adapt it. Guessing five
 * package managers wrong is worse than naming one and saying so.</p>
 *
 * <p>Pure: platform and the apt probe are arguments. The modal and the terminal live in
 * `toolEnsure.ts`.</p>
 */

export interface InstallRecipe {
  /** What the person is told is missing — a product name, not a path. */
  readonly display: string;
  /** The command the offered terminal runs. */
  readonly command: string;
  /** A caveat worth one line — admin needed, GUI alternative — or empty. */
  readonly note: string;
}

const APT_PREAMBLE = 'sudo apt update && sudo apt upgrade -y && ';

interface ToolRecipes {
  readonly display: string;
  readonly windows: { command: string; note: string };
  readonly apt: { command: string; note: string };
  /** The Homebrew formula — macOS's own answer, not the apt one renamed. */
  readonly brew: { formula: string; note: string };
}

const RECIPES: Readonly<Record<string, ToolRecipes>> = {
  ssh: {
    display: 'the OpenSSH client',
    windows: {
      command: "Add-WindowsCapability -Online -Name 'OpenSSH.Client~~~~0.0.1.0'",
      note: 'Needs an administrator PowerShell.',
    },
    apt: { command: 'sudo apt install -y openssh-client', note: '' },
    brew: { formula: 'openssh', note: 'macOS ships an ssh client already; this adds the newer one.' },
  },
  'wg-quick': {
    display: 'WireGuard',
    windows: { command: 'winget install --id WireGuard.WireGuard -e', note: '' },
    apt: { command: 'sudo apt install -y wireguard', note: '' },
    brew: { formula: 'wireguard-tools', note: '' },
  },
  openvpn: {
    display: 'OpenVPN',
    windows: { command: 'winget install --id OpenVPNTechnologies.OpenVPN -e', note: '' },
    apt: { command: 'sudo apt install -y openvpn', note: '' },
    brew: { formula: 'openvpn', note: '' },
  },
  psql: {
    display: 'the PostgreSQL client (psql)',
    windows: {
      command: 'winget install --id PostgreSQL.PostgreSQL -e',
      note: 'Installs the whole PostgreSQL package; psql rides along.',
    },
    apt: { command: 'sudo apt install -y postgresql-client', note: '' },
    brew: { formula: 'libpq', note: 'libpq is keg-only: run `brew link --force libpq` to put psql on PATH.' },
  },
  mysql: {
    display: 'the MySQL client',
    windows: { command: 'winget install --id Oracle.MySQL -e', note: '' },
    apt: { command: 'sudo apt install -y mysql-client', note: '' },
    brew: { formula: 'mysql-client', note: '' },
  },
  sqlcmd: {
    display: 'the SQL Server client (sqlcmd)',
    windows: { command: 'winget install --id Microsoft.Sqlcmd -e', note: '' },
    apt: {
      command: 'sudo apt install -y sqlcmd',
      note: "Microsoft's repo may be needed; see learn.microsoft.com for your distribution.",
    },
    brew: { formula: 'sqlcmd', note: '' },
  },
  mongosh: {
    display: 'the MongoDB shell (mongosh)',
    windows: { command: 'winget install --id MongoDB.Shell -e', note: '' },
    apt: {
      command: 'sudo apt install -y mongodb-mongosh',
      note: "MongoDB's repo may be needed; see mongodb.com/docs for your distribution.",
    },
    brew: { formula: 'mongosh', note: '' },
  },
  git: {
    display: 'Git',
    windows: { command: 'winget install --id Git.Git -e', note: '' },
    apt: { command: 'sudo apt install -y git', note: '' },
    brew: { formula: 'git', note: '' },
  },
};

/** The tools this table knows — pinned by test so a new launcher cannot forget to register. */
export const KNOWN_TOOLS: readonly string[] = Object.keys(RECIPES);

/**
 * The install recipe for `tool` on this machine, or undefined for a tool this table does not
 * know — the caller then falls back to its old, uninformative message rather than guessing.
 */
export function installRecipe(
  tool: string,
  platform: NodeJS.Platform,
  hasApt: boolean,
  hasBrew?: boolean,
): InstallRecipe | undefined {
  const recipes = RECIPES[tool];
  if (recipes === undefined) {
    return undefined;
  }
  if (platform === 'win32') {
    return { display: recipes.display, ...recipes.windows };
  }
  return platform === 'darwin' ? macRecipe(recipes, hasBrew === true) : linuxRecipe(recipes, hasApt);
}

/**
 * macOS is a platform, not "a Linux without apt" (issue #103): Homebrew is how these tools
 * arrive there. Without brew the person is told the formula and where brew itself comes from.
 */
function macRecipe(recipes: ToolRecipes, hasBrew: boolean): InstallRecipe {
  const command = `brew install ${recipes.brew.formula}`;
  const caveat = recipes.brew.note;
  return hasBrew
    ? { display: recipes.display, command, note: caveat }
    : {
        display: recipes.display,
        command,
        note: `This Mac has no Homebrew — install it from https://brew.sh first.${caveat === '' ? '' : ` ${caveat}`}`,
      };
}

function linuxRecipe(recipes: ToolRecipes, hasApt: boolean): InstallRecipe {
  if (hasApt) {
    // The update-upgrade preamble is the owner's explicit instruction (plan T20).
    return {
      display: recipes.display,
      command: APT_PREAMBLE + recipes.apt.command,
      note: recipes.apt.note,
    };
  }
  return {
    display: recipes.display,
    command: recipes.apt.command,
    note: 'This machine has no apt — adapt the command to its package manager.',
  };
}
