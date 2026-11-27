# Remote Bridge pilot — the owner's check (change 11.1, S5)

The last step of the 72-hour slice ([PLAN_remote_bridge_scoped.md](../todo/PLAN_remote_bridge_scoped.md), *The 72-hour slice*, S5,
and M7 in its §7). It is done by the owner, on the owner's Windows PC and Ubuntu server, with a **pilot build**. The pilot is never
released: in every published build the new flow is off (`src_vs_code/src/bridgeFlowSwitch.ts`).

No host name, login, address or path of the owner's machines is written here. `<server>` is the SSH entry of the server, `<folder>`
is where the pilot was copied on the server.

## 1. What the pilot folder holds

`node src_vs_code/scripts/build-pilot.mjs --out <folder outside the repository>` builds it from one commit (it refuses a work tree
with changes). The commit is in every file name.

| File | What it is |
|---|---|
| `creds-for-devs-<version>-bridge-pilot-<sha>.vsix` | The extension with the new flow ON and `onStartupFinished` (every VS Code window activates the extension at start). Its name in VS Code ends with "(Remote Bridge pilot)" |
| `SHA256SUMS` | The checksum of the VSIX |
| `linux-x64/creds`, `linux-x64/creds-mcp` | The server clients of the same commit, version `<released>-pilot.<sha>` |
| `linux-x64/creds-pilot.sh` | Install, status and undo on the server |
| `linux-x64/SHA256SUMS` | The checksums of the three files above; the script checks the two binaries |

## 2. Install

**On the PC.** VS Code → Extensions → `...` → *Install from VSIX…* → the pilot VSIX → reload the window. It replaces the
Marketplace version. It has the same version number, so VS Code does not update it back by itself.

**On the server.** Copy the `linux-x64` folder (for example with `scp -r`), then, as the login that runs Claude Code:

```sh
sh <folder>/creds-pilot.sh install <folder>
```

It links `creds` and `creds-mcp` in `~/.local/bin` to the pilot (an old file there is moved aside, and comes back on undo). If the
tools that you use today are in another folder, name it: `CREDS_PILOT_BIN=/usr/local/bin sh <folder>/creds-pilot.sh install <folder>`
(a system folder needs root). A folder outside your home serves every login of the server, so the pilot's binaries then go beside
it, in `<parent>/lib/creds-pilot` (for `/usr/local/bin`: `/usr/local/lib/creds-pilot`), readable by every login, and not into one
login's home (`CREDS_PILOT_HOME` sets another folder). Run the script as the login whose Claude Code you register: with `sudo`,
the registration goes to the Claude Code of root. Registration with Claude Code:

- no registration named `creds`: the script adds one, with the link's absolute path;
- one that already runs that link: it is kept;
- one that runs another path: it is **not** changed, and the script prints the two commands that change it. Run them if you want
  the pilot used; undo then does not change them back.

Then **restart the Claude session once**, so that it starts the new `creds-mcp`. `sh <folder>/creds-pilot.sh status` shows the state.

## 3. Open the bridge

On the PC: unlock the vault, right-click `<server>` → *Open Remote Bridge…* → tick the entries that the agent on the server may
use. Nothing is pasted on the server: `creds` and `creds-mcp` find the bridge's note in `~/.creds-for-devs/bridge/`.

## 4. The checks (M7 for the slice)

Write the result of each line (pass / fail, and what you saw). Do not write a secret value in the record.

| # | Do | Pass when |
|---|---|---|
| 1 | From Claude on the server, and from `creds` in a shell: an SSH use of an entry in the scope | The output comes back; the consent dialog is on the PC |
| 2 | An entry **not** in the scope, the same way | Refused; nothing runs |
| 3 | On the PC: *Prepare Database Container* (Command Palette; it needs `wslc`). Then a database query through the bridge (ODBC `sqlcmd`, server with a public CA certificate) | The rows come back. A wrong password fails with "Login failed". No password in Task Manager's command lines or in the CredsForDevs log |
| 4 | A stored command whose entry says *Runs on: Windows* and uses a password (`creds://`) | It runs on the PC; the password does not show in the output (masked) |
| 5 | A stored script (for example `vpn-up`), no *Runs on* | It runs on the server as your login; the exit status and output come back |
| 6 | A network drop: Wi-Fi off for about a minute, then on | The bridge comes back by itself. A `creds-mcp` tool call from the SAME tmux session as before works, with no restart. Note how long the old `ssh` took to end |
| 7 | *Lock Vaults*, then a call from the server | Refused. After unlock the bridge comes back with no click |
| 8 | *Restart* the PC with the vault **unlocked** at the time. After it: VS Code restores the window **with Explorer showing, not the CredsForDevs view**; unlock the vault | The row reads up with no click once you open the view; the old tmux session's `creds-mcp` works with nothing done on the server; the old note is gone (the old socket FILE may stay where the server keeps `StreamLocalBindUnlink no`; a client passes it over) |
| 9 | Lock the vault, then *Shut down* and power on (Fast Startup is on). Then open VS Code | **Observe and record:** does the bridge come back by itself after unlock, or does it stay closed? The full design (§4.7) wants it held with *Reopen*; the slice did not build *Reopen*, so this line is a finding to record, not a pass or fail |
| 10 | *Close Remote Bridge*, then *Restart* | The bridge stays closed |

The permanent cost of `onStartupFinished` (what the flip will make true for every user, told here as the plan asks): every VS Code
window activates CredsForDevs at start, so the broker starts and the vault toasts can show in a window where you did not open the view.

## 5. Undo

- Server: `sh <folder>/creds-pilot.sh undo` (the same `CREDS_PILOT_BIN` as install). It removes the links and the registration it
  added, and puts back what it moved aside. Restart the Claude session.
- PC: Extensions → CredsForDevs → *Install Another Version…* (or uninstall, then install from the Marketplace).

## 6. After the check

The record of section 4 goes into the plan (M7) and decides the next step: the client tags, then the flip (the constant and
`onStartupFinished` in one commit), then the extension tag (the plan's E4 order).
