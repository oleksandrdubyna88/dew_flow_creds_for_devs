# Changelog

All notable changes to **CredsForDevs** are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
