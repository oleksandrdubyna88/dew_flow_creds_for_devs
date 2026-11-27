# Side findings of the Remote Bridge pilot check (2026-11-27)

> Status: **not started, a stub, 2026-11-27.** Found during the owner's check of the 72-hour slice (M7,
> [PLAN_remote_bridge_scoped.md](PLAN_remote_bridge_scoped.md), *M7 record*). All three are older than the slice; the slice's own
> findings (F-M7-1, F-M7-3) stay in that plan.

## 1. Lock is one-way on a computer with no sync location (F-M7-2)

*Lock Vaults* sets an in-memory mark (`src_vs_code/src/lockState.ts:27`, through `vaultKeys.ts:193`). *Unlock Vault (Security
Key)…* reads the vault file from the account's sync location first, and with none it answers `No vault stored for <email> yet.`
(`src_vs_code/src/commands/keyCommands.ts:349-351`; the transport is `undefined` when `nasPathFor` is, `transportFactory.ts:91-93`).
So on a computer whose accounts have no sync location, nothing clears the lock but a new window. The account list of the unlock
(`dialogs.ts:127`) also offers accounts that have no vault. Since the bridge flow makes a lock close a bridge, this now stops an
agent's work until every window is closed.

Fix ideas (none chosen): an unlock with no vault file clears the lock after a person's gesture (the lock guards the cached key and
the Sync PIN, and neither exists then); or the list shows only accounts with a vault and says why the others are missing.

## 2. *Run with Secrets* closes its terminal as the command ends

A short command (`echo`) opens the masked terminal, runs, and the terminal is gone before a person can read the output
(`src_vs_code/src/maskedTerminal.ts`, the `closer` event, `:150-184`; its comment at `:129` says the terminal reports the exit code
rather than vanishing). Seen on Windows, VS Code, 2026-11-27.

## 3. A bash script run from the tree on Windows

The run typed `bash 'c:\Users\…\keys\<pid>\script-<id>.sh'` into PowerShell. On this PC `bash` is WSL's, which reads the backslashes
as escapes: `No such file or directory`. The trust modal before it still recorded the first run, so an agent's bridged run worked.

## Test plan

- 1: a fake transport with no location: lock, then unlock → the lock is cleared after the gesture (or the list leaves the account out,
  by the fix chosen). RED first.
- 2: the masked terminal stays open after the child ends until a key or a close (a test on the pseudo-terminal's `close`).
- 3: on Windows, a bash script's path given to WSL's `bash` is a `/mnt/<drive>/…` path, or the run says that no bash is usable.

## Definition of done

Each item has its fix and its test, the CHANGELOG names it, and this file moves to `research/`.
