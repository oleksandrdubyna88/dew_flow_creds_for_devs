# Changelog

All notable changes to **CredsForDevs** are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.27.0] — 2026-08-24

### Fixed

- **The `Terminal` folder type could not be chosen.** The folder-type picker was a second,
  hand-written copy of the kind list and it was never extended, so the type shipped in
  0.26.0 was reachable only by brand-new accounts — which seed the default folders once,
  at creation. Every existing account was offered five types and could not create the
  sixth. The picker now derives from the kind list itself, and a test fails if the two
  ever drift apart again.

### Changed

- **`Run in Terminal` runs it.** 0.26.0 put the line on the prompt and left Enter to you;
  the operator asked for the button to do the whole job, which is theirs to decide — these
  are commands you wrote and saved yourself, not something arriving from elsewhere.
  *Copy Command* is still there for the times you want to edit before running.
- The run button is the same **green triangle** as *Connect via SSH*, in the row and in the
  context menu. Two buttons that both mean "start this" should not look like two different
  ideas.

## [0.26.0] — 2026-08-23

### Added

- **Terminal commands as entries**, with a `terminal` folder in the default set. The case:
  `aws sso login --sso-session OD-org` is unfindable in shell history a week later, and the
  part you have forgotten is never the verb — it is which value belongs to which
  environment, and why.

  So an argument is a **row**, not a word inside a string: each has its own value, its own
  explanation underneath it, and a tick to keep a flag without using it (`--debug` is what
  you want back next week; deleting it means retyping it from memory). Rows can be added,
  removed and reordered, and a live preview shows exactly what will run.

  *Run in Terminal* puts the command on the prompt **without pressing Enter** — a
  credential-adjacent command that executes the instant you click a tree item is a way to
  lose an afternoon. Also *Copy Command* and *Show Command and Notes*.

- **Clone…** on every folder and entity. Copies the settings, deliberately **not** the
  secrets: duplicating passwords would double them on disk and in every backup, and the
  usual reason to clone is a near-identical entry that needs its own credential anyway.

- **The account icon is green when that account can actually sync**, grey otherwise — and
  the row says why. A security key with no Sync PIN is deliberately *not* green: a timer
  cannot touch a key, so background sync would keep stopping to ask, and calling that
  "ready" would make the colour mean "you configured something" rather than "this works".

- **Sync now reports what it could not do.** If nothing can sync it says which account and
  what is missing, and offers the fix. If some can, it syncs those and names the rest
  instead of reporting success and quietly leaving accounts behind.

  Worth knowing: the setup is **per account**, not per location. The Sync PIN is stored
  under the account id and the security-key wraps live inside that account's own vault, so
  two accounts pointing at the same folder still have two vaults and two separate ways in.

## [0.25.0] — 2026-08-23

### Security

- **`Lock Vaults` now actually locks.** It used to clear the cached master key and nothing
  else — so the next automatic sync, five minutes later by default, silently reopened the
  vault using the Sync PIN saved in the OS keychain. The command told you the next sync
  "will ask for the PIN or a key touch". It did not ask; it just used the saved one.

  Locking now also **refuses that stored PIN** until somebody unlocks deliberately.
  Background sync cannot prompt, so while locked it pauses and says so instead of quietly
  undoing what you just did. Anything you trigger yourself — *Sync Now*, *Unlock Vault* —
  counts as unlocking.

- **Auto-lock after idle** (`autoLockMinutes`, 60 by default, `0` disables). The master key
  previously stayed in the extension host's memory for the whole window's life, with the
  manual command as its only eviction.

  **Idle means *you* have been idle** — an action of yours that touches a stored secret:
  opening or copying a credential, connecting, installing a key, editing an entry,
  unlocking. Not mouse movement, and explicitly **not background sync**: a cycle running
  on a timer is not you being present. That distinction is the whole feature — measuring
  "time since the key was last used" made the setting do nothing at all once `autoSync`
  was on, because sync touches the key every five minutes.

  What locking does **not** do, stated plainly because the previous message implied
  otherwise: your credentials keep working locally. Passwords, SSH keys, VPN configs and
  DB connection strings live in the OS keychain and are not protected by the vault key —
  the vault key only opens the encrypted copy that leaves the machine.

## [0.24.0] — 2026-08-23

Renamed to **CredsForDevs**, and the first release that talks to a Cred Vault Server
with a precondition rather than hoping two machines never write at once.

### Added

- **Scheduled vault snapshots.** Right-click an account → *Set Backup Location…*, and the
  extension writes a dated, encrypted snapshot into that folder on a timer
  (`backupIntervalHours`, 24 by default). Any folder works — a NAS mount, an rclone
  mount, a Google Drive or OneDrive sync folder — because the folder is all it knows.

  A snapshot is a **copy of ciphertext**: the same encrypted envelope the sync location
  already holds, so no PIN is needed to take one and it runs unattended. Restore one with
  the existing *Import / Restore*.

  This is deliberately separate from the sync location, and the difference is the point:
  **sync merges, so a deletion travels to every machine.** Snapshots are what you go back
  to when the deletion was the mistake. Choosing a folder inside the sync location asks
  for confirmation, because on one disk they die together.

  Four rules it inherits from the server's backup, each of which came from an actual
  failure rather than from taste: identical bytes are not re-written; retention never
  deletes the newest snapshot whatever its age; an empty vault is never snapshotted over
  a good history; and each file is written under a temporary name and renamed only once
  complete, because a sync client uploads whatever appears the moment it appears.

### Fixed

- **`Set Backup Location…` did not appear in the menu at all.** It was contributed with the
  group `3_manage@0b`; VS Code expects an integer after the `@`, so the item was silently
  dropped. Nothing errored — the feature was simply invisible.
- **`Lock Vaults` was reachable only from the command palette**, while `Unlock Vault` sat in
  the account menu. They are a pair: testing a security key means locking and then
  unlocking, and half of that could not be found. Lock now sits directly under Unlock.
- **You no longer appear in your own Team list.** Neither the server's `/api/team` nor the
  folder scan excludes the caller — they cannot, since neither knows which of your
  accounts is being looked at — so the account you were viewing offered to share a
  credential with itself. Your *other* accounts stay, because moving a credential from a
  work vault to a personal one is a real thing people do.

### Security

- **Copied secrets now expire.** Every clipboard copy of a password, private key, DB
  connection string or "all fields" block is cleared after 45 seconds — but only if the
  clipboard still holds exactly what was copied, so a later copy of your own is never
  destroyed. Previously a copied password stayed on the clipboard indefinitely, where
  OS clipboard history and cross-device sync could retain it.

### Fixed

- **A wedged vault server no longer hangs sync forever.** Requests to the Cred Vault
  Server had no timeout: a server that accepted the connection and then stopped answering
  left the request pending for the life of the window, and auto-sync's single-cycle guard
  meant nothing synced again. Every request now fails after 60 seconds with a message that
  distinguishes "did not answer" from "unreachable".
- `npm test` ran no tests. `node --test out/test/` resolves the directory as a module on
  Node 22+ and exited with `MODULE_NOT_FOUND`; the script now passes a glob.

### Changed

- **Renamed to CredsForDevs.** The display name, the activity-bar container, the settings
  section and all 37 command titles now read *CredsForDevs*, and the package identifier is
  `creds-for-devs`.

  Two things deliberately did **not** change, because renaming them would break data rather
  than branding:

  - the **vault format identifiers** (`cred-ssh-manager-backup`, and the HKDF context strings
    `cred-ssh-manager/webauthn` and `cred-ssh-manager/envelope-mac`). They are on-disk format
    contracts; renaming them would make every existing vault and every security-key wrap
    unreadable, including ones already sitting on a NAS or a server.
  - the **command and settings namespace** (`credSshManager.*`). Renaming settings keys would
    silently discard every user's configuration. The namespace is internal; nothing shows it
    to a user except `settings.json`.

  Because the package identifier is half the extension ID, and VS Code keys `SecretStorage`
  by that ID, **upgrading from `cred-ssh-manager` does not carry secrets across**. Export
  first (*Backup to NAS* / *Export Secrets*), install, then import.

- The extension moved into the `dew_flow_creds_for_devs` monorepo alongside the server it
  talks to (`src_vs_code/` and `src_minimalapi_server/`). The server was previously an
  undiscoverable sibling checkout.
- Licensed under MIT (was `UNLICENSED`), and prepared for Marketplace publication.

## [0.23.0] and earlier

Developed as a private extension; see `research/PLAN_sharing.md` and
`research/PLAN_audit_followups.md` in the repository for the design records of the
sharing feature and the security audit follow-ups (KDF versioning, causal-merge sync,
envelope MAC, PIN re-key, remote vault deletion, notes moved to SecretStorage).
