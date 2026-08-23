# Changelog

All notable changes to **CredsForDevs** are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
