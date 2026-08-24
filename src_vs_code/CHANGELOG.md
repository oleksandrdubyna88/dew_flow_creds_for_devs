# Changelog

All notable changes to **CredsForDevs** are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.31.0] — 2026-08-24

### Security

- **`Backup to NAS` destroyed a registered security key.** It asked for a master PIN and
  wrote the old PIN-only envelope — over **the same file the sync location uses**, since
  both sides get the name from `planBackupFileNames`. A vault with a YubiKey registered
  therefore came back as one without: the key wraps were not migrated, they were
  overwritten. Nothing failed and nothing warned; the key simply stopped opening the
  vault, and the only way back was a snapshot from before the backup.

  The command now looks at what is already in that file. A wrapped vault is unlocked
  through its own key slots — the security key is touched, or a stored PIN is used — and
  written back with its wraps intact. The PIN is asked for only when there is genuinely
  no other key: a vault that does not exist yet, or an old PIN-only one. Content that
  cannot be parsed counts as a vault to protect, not as a blank slate.

  If you took a backup between registering a key and this release, re-register the key.

### Added

- **`Set Backup Schedule…` on the account menu** — hourly, every 6 hours, daily, weekly,
  off, or a custom number of hours. The interval was only ever reachable by editing
  `settings.json`, which is not "choose a folder and how often", and the menu offered the
  folder while quietly keeping the other half to itself.

  Per account, like the folder, because the menu item sits on an account: a schedule set
  there that silently changed every other account would be a worse surprise than no menu
  item at all. Accounts without one keep using `backupIntervalHours`.

### Fixed

- **Two menu items shared one slot and neither could say which came first.** The account
  menu had the new schedule item colliding with *Set Sync PIN*, and *Clone…* had been
  sitting on *Move to Folder*'s slot since 0.26.0. VS Code picks an order and renders
  something — which is why this went unnoticed. There is now a test for it, next to the
  one for `3_manage@0b`; it was written first and failed on both.

## [0.30.0] — 2026-08-24

### Fixed

- **A terminal entry showed its name and nothing else.** Double-clicking one gave a Name
  field and a *Copy All* that copied exactly that — no command, no argument notes, no
  assembled line. Both the details viewer and the text block simply had no branch for the
  kind; `describeCommand` had produced all three for the tooltip all along and was never
  reached from either.

  The viewer now shows the command, what it is for, **every argument on its own row with
  its explanation underneath** — the same shape as the form, because a value and its note
  read as a pair or not at all — and the full line that runs. A disabled argument is shown
  and labelled `(off)` rather than hidden: it was kept deliberately, and hiding it makes
  the entry look like it lost one.

- **The help lookup failed in silence.** With the tool not installed, the notes simply
  stayed empty and nothing said why — which reads as a broken feature rather than a fact
  about the machine. It now says which of the four things happened: the lookup is switched
  off, the command was not a plain tool name so nothing was run, the tool could not be
  found on PATH, or its help documents none of these arguments.

### Changed

- `formatEntityBlock` and the `ssh` command builder moved into `entityText.ts` and
  `sshCommand.ts`, free of `vscode`. Not tidying: the details block could not be tested
  where it was, which is why a whole entity kind could go missing from it unnoticed. The
  regression test for the bug above now exists because of the move.

## [0.29.0] — 2026-08-24

### Security

- **Unlock asked for nothing.** It announced `Vault of … unlocked.` without a key touch or a
  PIN — because the Sync PIN stored in the OS keychain opened the vault two steps before
  the security-key branch was ever reached. *Unlock Vault* could have asked, so it counted
  as deliberate; it simply never did. Anyone at an unattended machine clicked Unlock and
  was in, which is the single situation Lock exists for.

  While the lock stands, the cached master key and the stored PIN are both skipped — on
  old v1 vaults as well as v2 — so opening the vault costs a touch, or the PIN typed.
  Locking is unchanged and was already correct.

  Only the **lock** demands this. Reading a password from an unlocked vault does not, and
  no credential-read path is affected at all: credentials live in the OS keychain and are
  not protected by the vault key.

### Fixed

- **The account icon stayed grey after unlocking.** Readiness is recomputed when it can
  change — and unlocking was missing from that list, so the colour went on saying "locked"
  after the vault was open. It now repaints immediately, and again once the sync that
  follows has finished, because whether a security key is registered is something only a
  completed cycle knows.

## [0.28.0] — 2026-08-24

### Added

- **Start / Stop on WireGuard and OpenVPN entries** — a green triangle in the row, same as
  SSH and terminal commands. The stored config is written into the extension's private
  storage under the file name the tool insists on (`wg-quick` takes the interface name
  from the *file* name, so `a1b2c3.key` would simply not come up), and the command runs in
  a terminal.

  **Elevation is the operating system's, never ours.** Both tools create a network
  interface, which no editor extension can be granted. So Windows gets a UAC prompt via
  `Start-Process -Verb RunAs` and POSIX gets `sudo` in the terminal you are looking at —
  the line that will run is on screen before it runs, and nothing is elevated quietly.

  IKEv2 and L2TP entries deliberately get **no** button: they are profiles in the OS
  network settings, not a file a binary can be pointed at, and a button that could only
  ever explain itself is worse than none. Use *Save Config* and import it where your OS
  expects it.

  Stop exists because start without it is half a feature — on Windows `/installtunnelservice`
  makes the tunnel a *service* that outlives VS Code, deliberately, and there has to be a
  way back. OpenVPN has no Stop and says why: it runs in the foreground, and killing every
  `openvpn` on the machine is not a Stop button.

- **Paste a whole command and it splits itself into rows.** `aws sso login --sso-session
  OD-org` becomes a verb and one argument row, quotes and all — what was pasted is exactly
  what will run, which is asserted by a round-trip test, because a parse that silently
  changes a command is worse than no parse.

- **The notes are read from the tool's own `--help`.** The alternative was a table of flags
  for the tools we happened to think of, which would be wrong for every private tool and
  stale for every public one. Empty notes only — what you wrote is never overwritten by a
  guess — and a private tool with no help still gets its rows split, with the notes yours
  to write, which is what you were doing anyway.

  Only a plain tool name is ever run: every word must be letters, digits and the few marks
  that appear in real tool names, so nothing containing a shell metacharacter is executed
  at all. That matters because a *shared* entry is exactly where such a string would come
  from. Turn the lookup off entirely with `credSshManager.readCliHelp`.

### Fixed

Both of these were found by running the lookup against real tools on a real machine after
the invented test cases had all passed:

- **A usage synopsis was being served as a description.** `git commit -m` came back as
  `[--allow-empty-message] [--no-verify] [-e] [--author=<author>]` — confident, attached to
  the row, and nonsense. A flag inside a `[...]` group is a synopsis mention, not a
  definition, and the search now keeps looking for the real one.
- **Wrapped descriptions were truncated at the first line break.** `docker run --rm` read
  "Automatically remove the", which is not a shortened meaning but a different one.
- `-it` and other bundled short flags are explained letter by letter — and only when
  *every* letter is found, because half an answer presented as the answer is the same
  failure as the first item.

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
