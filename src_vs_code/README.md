# CredsForDevs

Your SSH hosts and keys, VPN configs, database connections, passwords and the CLI commands
nobody remembers a week later — in the editor you already have open.

**Zero-trust is a property of the design here, not a promise.** Secrets live in the **OS
keychain**. Anything that leaves your machine is encrypted **in the editor**, under a PIN or a
security key that never leaves it — so the folder, the NAS or the server holding your vault
holds ciphertext and nothing else. Whoever runs that storage, **including you**, cannot read
what is in it.

It works with **no account, no server and no network**. Point it at a folder to sync your own
machines; add the optional self-hosted server when a team needs to share.

> **Where it runs, and two honest caveats.**
>
> The extension is pinned to your **local machine** (`"extensionKind": ["ui"]`). Under Remote-SSH,
> WSL or a Dev Container it therefore keeps running on your own computer, which is the only place
> `~/.ssh`, your keychain and your VPN client actually are. The cost is that *Share with Claude
> Code* reaches an agent running on that same machine — an agent running **inside** a container
> cannot see the broker's loopback port. Run Claude Code on the client for that feature.
>
> Secrets go to `vscode.SecretStorage`, which is the OS keychain **when there is one**. On a Linux
> box with no reachable Secret Service — headless, a minimal container, WSL used as a plain shell,
> SSH with no D-Bus — VS Code silently falls back to a basic store that is obfuscated rather than
> encrypted, and says nothing about it
> ([microsoft/vscode#204552](https://github.com/microsoft/vscode/issues/204552)). Install
> `gnome-keyring` or `kwallet` on those machines, or treat that vault as unprotected at rest.

## Everything it does

| | |
|---|---|
| **SSH in one click** | The stored password is supplied to `ssh` through `SSH_ASKPASS` — never retyped, never on a command line, never in scrollback. A key kept in the vault is written out `0600` for that session and deleted when the terminal closes |
| **SSH keys** | Store the key pair itself, or point at a file on this machine. One connection can borrow another entity's key. *Install SSH Key to System* writes the pair into `~/.ssh` — dir `0700`, private `0600`, public `0644` |
| **VPN** | OpenVPN / WireGuard / IKEv2 / L2TP / other, with host, login, port and a key or certificate. The config file is a secret like any other; *Start VPN* / *Stop VPN* bring the tunnel up and down through the OS's own elevation prompt |
| **Databases** | postgres / mysql / mssql / mongodb, entered as a connection string **or** as fields that rebuild it in the right dialect. *Open in DB Extension* hands the connection to Database Client, MongoDB for VS Code or the SQL Server extension |
| **Terminal commands** | `aws sso login --sso-session OD-org` is unfindable in shell history a week later, and the part you forgot is never the verb. So each argument is a **row** with its own note and a tick to keep a flag without using it. *Run in Terminal*, *Copy Command*, *Show Command and Notes* |
| **Plain credentials** | Anything that is just a login and a password, with notes that live in the keychain rather than in plaintext metadata |
| **Attachments** | Every entity can carry one encrypted **file** (PDF, Office, text, archives — the executable family is refused, double extensions included) and one encrypted **image**, 4 MB each, shown as a zoomable preview |
| **Environment variables** | Export a secret field into every new integrated terminal under a name you choose. The **name** syncs; the value is written only from the local keychain, so a binding arriving by sync is a name waiting for a value, never a secret in transit. A `✓?` button echoes it in a fresh terminal so you *see* it |
| **Share with an AI agent** | *Share with Claude Code…* lets a coding agent run commands on an SSH host **without ever receiving the password or key** — see below |
| **Team sharing** | Send one entity, or a whole folder, sealed to a colleague with a one-time PIN. *Create Entity for…* authors one directly for someone else |
| **Multi-machine sync** | One AES-256-GCM file per profile, merged causally (version vectors) rather than overwritten, so two machines editing at once converge on the same answer |
| **Dated snapshots** | Separate from sync and deliberately so: sync merges, and a merge propagates a deletion. A snapshot is the copy that still has the thing you deleted |
| **Security keys** | Open the vault by touching a YubiKey (WebAuthn PRF) — several keys plus the PIN, any of them opens it, adding or removing one never re-encrypts your data |
| **Auto-lock** | Locks after an idle window measured in *your* actions, not mouse movement and not background sync |
| **Filter the tree** | The first row of the sidebar is a search box: type and the tree narrows live, folders holding a hit open themselves, accounts with nothing matching drop out, and the row says how many entries survived. It matches what a row already shows you — name, user, host, port, command — and **never a secret**: a filter over passwords would confirm one a keystroke at a time to anyone at an unlocked window |
| **Several accounts** | Microsoft and Google profiles side by side, each with its own tree, its own vault location, and its own team |

Screenshots: see the tree, the entity form and the share flow on the
[repository page](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs).

## The tree

Activity Bar → key icon. Top-level items are **account profiles** added via
the VS Code Authentication API (Microsoft is built-in; Google via the
extension's own OAuth provider — see below). Inside a profile: folders and
entities.

- **Single click** on a row only selects it.
- **Double click** on an entity opens the **read-only viewer**: only the
  fields that actually hold a value, each with a copy-icon button (secrets
  stay masked; copying goes through SecretStorage, never through the page),
  a download icon on the VPN config row (Save As), plus a kind-aware
  **Copy All**.
- **Green ▶** (hover, SSH entities) connects SSH; **green database icon**
  (DB entities) opens the entity in a DB extension. Nothing ever runs on a
  plain click.
- **Right-click** menus are capability-filtered: an entry only offers what
  it can actually do (`Connect SSH`/`Toggle SSH` need a host, `Copy
  Password` needs a stored password, key/VPN/DB actions need those kinds).
- Move items between folders by **drag & drop** or **Move to Folder…**
  (within one profile). The toolbar **+** buttons create at the profile
  root; the inline **+** on an account/folder row creates inside that row.

## Folders: types and ordering

- **Default folders for a new account**: the first time you add an account, and
  only when it starts out empty, it is seeded with five typed folders — `db`
  (Database), `vpn` (VPN), `ssh keys` (SSH key), `ssh connections` (SSH
  connection) and `passwords` (Credential). This is one-time: if the account
  already has data (e.g. a returning user whose vault is pulled from the NAS
  first), or once you rename or delete the defaults, they are never re-created.
- Creating a folder asks for its **content type** — Credential (default),
  SSH connection, SSH key, VPN, Database, or **Any type**; right-click →
  **Change Folder Type…** updates it later. The folder row shows the
  type's icon (lock/remote/key/shield/database) and name.
- **A typed folder holds only its own kind**: entities created inside it
  get the form's Type selector preset and locked, and moving/dragging a
  mismatched entity in is blocked with a warning. Existing entities are
  never retro-converted.
- **Manual ordering**: right-click a folder → **Move Up / Move Down**.
  The order persists and syncs across machines; untouched folders stay
  alphabetical after the manually placed ones. Entities stay alphabetical.

## Entities

**Add Entity / Edit** opens a single webview form with a **Type selector**
— Credential (default) / SSH connection / SSH key / VPN / Database /
Terminal command / Script — and
only the chosen kind's section is shown. Saving scrubs the other kinds'
fields, so switching type leaves no stale data. Inside a typed folder the
selector is preset and locked. Validation errors render inline, and any
script failure is printed into the form's error area (never a silently
dead form).

- **Password / secret value** → `context.secrets` (OS keychain), key
  `${accountId}_${entityId}`. Never in `globalState`, settings, or logs.
- **SSH private key content** → SecretStorage
  (`${accountId}_${entityId}:sshPrivateKey`); **public key** → metadata.
- **SSH key path** — alternative to content: a pointer to a key file on
  this machine's disk (the path syncs, the file does not).
- **SSH key source** — an SSH connection can reference another entity as
  its key. Resolution order when connecting: referenced entity → stored
  key content (materialized to a `0600` file under extension storage) →
  plain key path.
- **Install SSH Key to System** (entities flagged as SSH keys): writes the
  pair into `~/.ssh` — dir `0700`, private `0600`, public `.pub` `0644` —
  with an overwrite confirmation.
- **One encrypted file and one encrypted image**, on an entity of any kind.
  *Additional file* takes what people actually attach — PDF, Office, text, data,
  archives — and refuses the executable family outright, including as the tail of a
  double extension (`invoice.pdf.exe`). Both are capped at 4 MB, checked before
  anything is stored, and both live where every other secret lives: the OS keychain
  locally, the sealed vault in transit — sync, backups and snapshots carry them like
  passwords. In the viewer a stored file is a row with a save button and a stored
  image is a **200×200 preview** (click to zoom ×2, twice; a third click resets).
  Only the file name is plaintext metadata; the content never is.

In edit mode stored secrets are never shown or sent into the webview:
leaving a secret field empty keeps the current value; explicit "clear"
checkboxes remove it.

## VPN entities

Pick the **VPN** type in the form: choose the protocol (openvpn /
wireguard / ikev2 / l2tp / other) and upload the config file (`.ovpn` / `.conf` — the
picker runs in the webview, so it browses the client OS's files, i.e.
Windows even under WSL). The config **content is a secret**: SecretStorage
locally, inside the AES-256-GCM payload on the NAS — never plaintext in a
backup; only the original filename is metadata. VPN entities show a shield
icon; **Save VPN Config As…** writes the decrypted file back out for your
VPN client; the viewer shows the type and a masked, copyable config.

A VPN entity also carries **host / gateway, login, port, and a key or certificate** — the key
goes to the OS keychain like an SSH private key; host, login and port travel only inside the
encrypted vault. The viewer shows exactly the fields that are filled; an empty one adds no row.

**Start VPN / Stop VPN** bring the tunnel up and down. The config is materialized to a
`0600` file, the launcher is located on this machine (`wg-quick`, `wireguard.exe`,
`openvpn`, or the OpenVPN Connect GUI on Windows — recognised as the different product it is,
rather than reported as a missing binary), and the composed line is **shown in a terminal
rather than run silently**. The extension never elevates itself: Windows raises its own UAC
prompt, POSIX its own `sudo` password prompt. That dialog is the trust boundary, and it
should be.

## Database entities

Pick the **Database** type in the form: choose postgres / mysql / mssql /
mongodb and fill **either** the connection string **or** the component
fields (Host / Port / Database / User / Password) — they are two-way
linked: typing the string fills the fields, editing a field rebuilds the
string in the right dialect (URI for postgres/mysql/mongodb,
`Server=…;Database=…` for mssql). The port is optional with per-type
default placeholders (5432/3306/1433/27017); a host pasted with a scheme
(`http://…`) is auto-cleaned. The string is the single stored secret —
prefilled and editable in Edit mode (the one deliberate secret-in-webview
exception); emptying it clears it. The viewer shows the parsed parts with
copy buttons (password masked, default port labeled), and **Copy All**
emits type, string, and all parts. The inline **green database button =
Connect** opens the entity in a dedicated DB extension:

1. Target resolution: your override in `credSshManager.dbExtensions`
   (e.g. `{ "mysql": "cweijan.vscode-mysql-client2" }`) → the first
   installed candidate → the recommended default, offered with a one-click
   **Install** when missing.
2. Launch: the connection string is copied to the clipboard, the target is
   activated, and its add-connection flow opens — Database Client
   (`mysql.connection.add`; flip its "Use Connection String" toggle and
   paste, all fields fill at once), MongoDB for VS Code
   (`mdb.connectWithURI`, takes the URI directly), SQL Server
   (`mssql.addObjectExplorer`); for other extensions the command is
   discovered from their own manifest. The post-open notification carries
   the exact paste instruction per target.
3. Honest limitation (verified against Database Client's source: no
   exported API, no settings store, no URI handler): extensions without a
   public connection API get the open-form-plus-one-paste treatment — we
   never write into another extension's private storage.

## Terminal command entities

Pick the **Terminal command** type in the form. The case it exists for:
`aws sso login --sso-session OD-org` is unfindable in shell history a week later, and the
part you have forgotten is never the verb — it is which value belongs to which environment,
and why.

So an argument is a **row**, not a word inside a string: each has its own value, its own
explanation underneath it, and a tick that keeps a flag without using it (`--debug` is what
you want back next week; deleting it means retyping it from memory). Rows can be added,
removed and reordered, and a live preview shows exactly what will run.

- **Run in Terminal** (the same green ▶ as *Connect SSH*) runs the assembled line.
- **Copy Command** for the times you want to edit before running; **Show Command and Notes**
  prints the line with every argument's explanation.
- **The notes can fill themselves in.** With `credSshManager.readCliHelp` on (default), pasting
  a whole command reads what each flag means by running `<tool> --help`. It runs only the tool
  you just typed, with no shell and none of our own arguments, and only when every word of the
  command is a plain tool name — anything carrying a shell metacharacter is refused rather than
  probed.

## Environment variables in the terminal

Each secret field — password, private key, public key, connection string, DB password — has a
toggle in Edit (off by default). Switching it on mints a name from the entity (entity *git key*,
private key → `ENV_GITKEY_PRIVATEKEY`); edit it if you want another. Saving writes the value
into every **new** integrated terminal, persistently across reloads.

What syncs is the **name** — a name is not a secret. The value is written only on the machine
that saved or pressed the button, from that machine's own keychain, so a binding arriving by
sync is a name waiting for a value, never a secret that travelled. Renaming or disabling a
binding deletes the old variable on save rather than leaving it set forever.

The viewer shows the variable's name with a copy button, a **Set** button that re-writes the
value on demand (the collection can be lost with extension storage, and recovering must not
require re-saving the entity), and a **`✓?`** button that opens a *fresh* terminal and echoes
the variable — so it is seen rather than trusted from a notification. The probe's spelling
follows the actual default shell, not the OS: PowerShell gets `$env:NAME`, cmd `%NAME%`, bash
`$NAME`. Fair warning it carries: echoing prints the secret into that terminal's scrollback.

## Script entities

A script is the sibling of a terminal command: the same "I will never remember this
next month" problem, one size larger.

> **Know where the body lives.** A script and its variables are stored as entity
> **metadata**, not in the OS keychain — like a terminal command's arguments and unlike
> a password. Locally that means `globalState`, in plaintext; in transit and at rest on
> your NAS or vault server it is inside the same AES-256-GCM envelope as everything else.
> So a script is safe to sync and safe to share, and it is **not** the place to paste a
> token: put the token in a credential entity and let the script read it from an
> environment binding.

- **Language** decides both the highlighting in the form and whether *Run Script* is
  offered at all. Only a language with an unambiguous interpreter can run:

  | Language | Runs with | File |
  |---|---|---|
  | Bash | `bash` (on Windows: the one git-bash ships) | `.sh` |
  | PowerShell | `powershell -ExecutionPolicy Bypass -File` on Windows, `pwsh -File` elsewhere | `.ps1` |
  | Python | `python` | `.py` |
  | JavaScript | `node` | `.js` |

  SQL, YAML, JSON, Dockerfile and *other* are stored, highlighted and copyable, but
  **not runnable** — SQL needs a database and a data format is not a program. *Run
  Script* refuses those with the reason rather than piping them into a shell.
- **Variables** are rows, exactly like a terminal command's arguments: a name, a value
  and a tick to keep one without using it. **The values never enter the script text.**
  They are handed to the run through the **process environment**, and the body reads them
  by name in its own language's syntax — bash needs no change at all (`${NAME}` already
  *is* that), PowerShell gets `$env:NAME`, Python `os.environ.get('NAME', '')` with the
  `import os` added only when something was actually translated, JavaScript
  `process.env.NAME`. The file on disk, the viewer and *Copy All* carry names where they
  used to carry values.

  Two consequences worth knowing. A script runs in a **fresh terminal** every time, because
  VS Code can only set a terminal's environment when it is created — reusing one would run
  the script with the previous entry's values. And a script can still *print* its own
  variables: env injection stops the value leaking into the file, not into anything the
  script chooses to echo, so an entry whose body does that is flagged rather than silently
  trusted.
- **Where it runs from.** The file is written into the extension's own private storage
  (`keys/`, dir `0700`, file `0600`, owner-only ACL on Windows) — the same directory
  materialized SSH keys use, and purged on both activate and deactivate. Nothing of it
  outlives the session.

## Export / Import externally

*Share with…* is for people on your team — it needs them to have the extension, an
account and a vault. **Export / Share Externally…** is for everyone else: a contractor,
a client, a colleague who has not installed anything yet.

- Right-click an **entity** to export it, or a **folder** to export its whole subtree.
  Secrets travel with it — password, private key, VPN config, connection string, notes,
  the attachment and the image.
- You are asked for a **password**. The file is then sealed with the same envelope the
  vault itself uses (scrypt + AES-256-GCM), so what lands on disk is ciphertext and the
  password is what opens it. Choosing to export **plain JSON** is offered and is exactly
  what it says — nothing protects it; send that over nothing you would not shout across
  a room.
- **Import from External…** takes such a file, asks for the password if it is sealed,
  and gives every imported node a **new id**. The sender's ids belong to the sender's
  tree; colliding with your own would corrupt the next sync merge.

## Sharing (Team / Shared with me / Create for…)

- **Team is account-scoped**: every account row carries its own **Team**
  subtree — the people discovered on THAT account's NAS folder (owners of
  `vault_*.enc` there; people appear after their first sync), you marked
  "(you)". Two companies on two NAS folders = two separate teams that
  never see each other.
- **Share with…** (context menu on an entity **or a folder** — a folder
  shares every entity in its subtree, one item each, preserving the folder
  chain + types on the recipient's side): pick recipients (only the sending
  account's team is offered), enter a **one-time share PIN** — each entity
  (metadata + all its secrets) is sealed with
  `scrypt(recipientAccountId + PIN)` and appended as a plaintext-array item
  into the recipient's vault envelope (their encrypted payload is untouched;
  only name/kind/sender are visible). Tell them the PIN out-of-band.
- **Shared with me** (appears when something is pending; aggregates all your
  accounts): grouped by sender. **Accept** (inline ✓, enter PIN) imports the
  entity into the addressed account's vault (same id → re-shares update the
  copy) and removes the item; **Decline** (inline ✗, confirmed) removes
  without importing. **Accept all** (per sender or global) tries known PINs
  on everything and asks a new PIN for the first item that resists, round by
  round.
- **Create Entity for…** (Team context menu): author an entity in the normal
  form directly for someone else, sent from the account whose Team you
  clicked — after a successful share nothing remains in your own storage.
- **Sender identity is signed** (Ed25519, since 0.45) — see *Sender
  signatures* below for what that proves and what it does not.
- Honest note: a share is a **copy**. There is no remote revoke; a
  recipient who has accepted it holds it.

## Share with Claude Code — an agent that uses a credential it never receives

An AI coding agent needs your server. Pasting the password into its chat puts the plaintext in
a transcript and in every log downstream of it; exporting it to a file is no better.

Right-click **any entity an agent can do something with** → **Share with Claude Code…** —
SSH hosts, scripts, terminal commands, databases, VPN tunnels, and bare credentials. A capability token is minted and a
paste-ready snippet lands on your clipboard. Give it to the agent, and it can:

```bash
node "<extension>/out/agentCli.js" ssh <token> -- systemctl status nginx   # runs it, returns stdout/stderr/exit code
node "<extension>/out/agentCli.js" terminal <token>                        # asks for the interactive terminal, for you
node "<extension>/out/agentCli.js" db <token> -- "select count(*) from orders"
node "<extension>/out/agentCli.js" script <token>     # runs your stored script, exactly as saved
node "<extension>/out/agentCli.js" run <token>        # runs your stored command, exactly as saved
node "<extension>/out/agentCli.js" env <token>        # exports the secret into new terminals; returns NAMES
node "<extension>/out/agentCli.js" vpn-up <token>     # opens the tunnel; you answer the elevation prompt
```

Two of these deliberately **ignore whatever the agent sends**: `script` and `run` execute exactly
what you saved, so no agent-authored text ever reaches an interpreter or a shell. They also require
that you have run the entry yourself once on this machine — the broker's Allow covers a *token*, not
a body, and a body can be replaced by a sync after you clicked it.

**MongoDB is refused, on purpose.** `mongosh` has no password environment variable and its `--eval`
runs in the same JavaScript interpreter that can read `process.env` — so a "query" could print the
password straight back. No SQL client has that channel. A capability that leaks by design is worse
than one that is absent, so this one says no.

**SSH keys are excluded** for a duller reason: a key means nothing except attached to a host, and the
host entry already has `exec`.

**What the agent never gets is the secret.** `ssh` is spawned by the extension — the half that
already holds the credential — and the password rides that child process's environment through
the same `SSH_ASKPASS` machinery a human *Connect* uses. The broker has no endpoint that returns
plaintext, and this is structural rather than a promise in a comment: no response type in the
protocol has a field a secret could ride in.

- **The token is a capability, not a credential.** It reaches exactly one entity, and it carries
  the broker's loopback port, so the CLI dials the exact window that minted it.
- **It dies with the window.** Grants live in memory only; closing or reloading VS Code revokes
  every one of them. That is the whole revocation story — there is nothing to expire and nothing
  left on disk.
- **First use asks.** A modal names the entity and the exact command about to run. Afterwards
  that grant runs silently, but every call — allowed, denied or refused — is a line in the
  **CredsForDevs: Agent Access** output channel. A dismissed dialog is not remembered as a
  refusal: a missed notification must not lock an agent out for the window's life.
- **Bounded by construction**: the loopback server binds `127.0.0.1` only, a bearer token
  authorizes every call, output is capped and truncated rather than buffered without limit, a
  hung command is killed at its ceiling, and eight execs may run at once — a runaway agent loop
  cannot fork-bomb the machine.
- **Auto-lock is not fooled by it.** Your click on *Allow* counts as presence; the agent's calls
  count as nothing, for the same reason a background sync never postponed the lock.

Honest about the boundary: an agent that can run commands on a host can do anything that host
lets it do. What this removes is the plaintext credential, not the access — the access is the
point.

## Selecting several at once

Ctrl-click or Shift-click in the tree, then **Delete**, **Export / Share Externally…** or
**Share with…** — one confirmation, one recipient pick, one PIN, one file, however many rows are
selected. Everything else still acts on the row you clicked.

Rows that cannot take part are left out and named: an account row, a team member, an inbox item.
Rows from a *different* profile are left out too — ctrl-clicking across two account roots is an
ordinary gesture, so it is reported rather than refused. And a folder quietly swallows anything of
its own you also selected, at any depth, because deleting or exporting the folder already covers it.

## Dates and history

Every entry carries **when it was created** and **when it last changed**, shown in both the viewer
and the edit form. The creation date is stamped once and never moves again, so it survives every
later edit; entries made before this feature existed say the date is unknown rather than inventing
one.

The **last 3 versions** of an entry are kept. An entry with history wears a **blue-tinted icon**, so
"this has been changed" is visible in the tree rather than only after opening it, and the viewer
lists each kept version — when it was replaced, what it was called then, and a button to copy that
version's secret.

Two limits, so they are not discovered the hard way: a kept version does **not** include attachments
(three copies of a 4 MB file per entry would cost more than the history is worth), and history is
**local to the machine** — it is not part of the encrypted vault that syncs, so another machine keeps
its own. And one fact worth knowing before you rely on it: history means a replaced password stays
retrievable. That is the point of it, and it is why the kept versions live in the same encrypted
store as the current ones.

## When somebody re-shares the same thing

A colleague sends you the password for an account. Six months later they change it and send it
again. Rather than a second copy appearing beside the first with nothing saying which is current,
the second one asks: **Update it** — in place, keeping its folder, its identity and its history — or
**Keep both**.

**Dismissing that question leaves the item in "Shared with me."** Deciding usually needs a look at
what you already have, and consuming the share to ask you would destroy the only copy of the
decision. Come back to it when you know.

How it knows, and why a sender cannot abuse it: the record is **local to your machine** and keyed by
*who sent it* together with *what they called it*. A sender can never address an entry they never
sent you, whatever identity they claim — which is exactly the protection that made every accepted
share a new entry in the first place.

## Accounts

- **Add Account** → Microsoft (works out of the box) or Google.
- **Google**: VS Code has no built-in Google provider, so the extension
  registers its own (OAuth 2.0 code flow + PKCE, system browser, loopback
  redirect on `127.0.0.1`). One-time setup, prompted inline on first
  sign-in: create a **Desktop app** OAuth client in
  [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
  (consent screen → External, add yourself as a test user), paste the
  client id (saved to `credSshManager.googleClientId`) and the client
  secret (SecretStorage). `Reset Google OAuth` clears both.
- **Sign Out / Remove Account** (inline icon or context menu) removes the
  profile, its tree, and its secrets; for Google it also drops the auth
  session (Microsoft sessions are owned by VS Code's Accounts menu).

## Vault locations: NAS folder or vault server

Every account syncs to a **location**, set per account (account row →
**Set Sync Location…**, stored in `credSshManager.accountNasPaths`; the
global `credSshManager.nasBackupPath` is the fallback):

- **a folder** (`/mnt/v/vault`, `Z:\Backups`, `\\NAS\Vault`) — the original
  transport: one `vault_<email>.enc` per person in a shared folder, pending
  shares carried inside each file's plaintext envelope array. Anyone with
  folder access can read everyone's ciphertext.
- **a server URL** (`https://vault.company.com`) — the
  **Cred Vault Server** (`cred-vault-server/` in this repository): every request carries
  that account's own OAuth token, so you can read **only your own** vault and
  inbox, and the server stamps a share's sender from the verified token
  (unforgeable). Recommended for company-wide use.

Mixed setups are normal: the corporate account on the company server, the
personal one on your own NAS. Shares are bound to the recipient's account id
on folders and to their **email** on the server (that is the identity the
server enforces) — the transport handles this transparently.

### Which transport for what (architectural boundary)

- **NAS folder → personal / solo sync, now with signed senders.** It remains the
  right choice for one person syncing their own vault across their own machines.
  A share sent over a folder is signed with the sender's Ed25519 key, and the
  recipient **pins that key on first contact**: every later share from that
  address must match it, and one that does not is refused with both fingerprints
  shown side by side.

  **What that is and is not.** A signature proves *"signed by the holder of key
  K"*. Tying K to a person is a separate problem, and if keys travel over the same
  folder an attacker can write, they can publish their own. So this is
  **trust-on-first-use plus continuity** — strong against somebody who turns up
  after you have exchanged a share, weak against somebody already in place before
  the first one. The only thing that closes that gap is reading the fingerprint to
  each other out of band, which is why the first-contact dialog shows it and why
  *Show Signing Fingerprint…* exists on your own account row. It is
  forgery-resistant, not forgery-proof, and should never be described as the
  latter.

  A share from an older build carries no signature and is shown as unsigned rather
  than refused. A sender who **has** signed before and suddenly does not is a
  different matter and is refused: that is what stripping a signature looks like.
- **Server transport → the recommended standard for teams.** The Cred Vault
  Server authenticates every request with that account's OAuth token and
  **stamps the share sender from the verified token**, so `fromEmail` is
  unforgeable. Any deployment where people share credentials with each other
  should use the server, not a shared NAS.

## Unlocking with a security key (YubiKey / FIDO2)

A vault can be opened by **several security keys plus the PIN**, in the
"touch your key" style of a Microsoft sign-in — no typed password.

- **Add**: account row → **Add Security Key (YubiKey)…**. The browser opens a
  local `http://localhost` page, the OS shows its native security-key prompt,
  and the key's **WebAuthn PRF** secret becomes a wrapping key.
- **How it is stored**: a v2 vault encrypts its payload with a random master
  key, and that master key is wrapped once per unlock method — the PIN wrap
  and one wrap per registered key — as plaintext metadata in the envelope
  (`wraps[]`). Any wrap opens the vault, so **adding or removing a key never
  re-encrypts your data** and never invalidates the others.
- **Every vault is v3 now — PIN-only included — so update every machine BEFORE anyone syncs.**
  A vault used to stay on the slow v1 format (PIN-derived key, scrypt on every read and write)
  unless you registered a security key. As of this release nothing writes v1 any more: the next
  save migrates a PIN-only vault to **v3** (a random master key, wrapped once under your PIN, read
  with HKDF), a brand-new vault is v3 from the start, and your **backups** convert on their next
  run too. The migration is automatic and keeps the **same PIN** — nothing is converted by hand and
  no data is touched. The catch is the same as any format bump: a build older than this one refuses
  a v3 file (*"Unsupported backup version: 3"*), so one updated laptop syncing to a shared folder
  can lock a colleague still on an old build out of their own vault. **Roll the extension out to
  everyone first, then sync.** Reading a legacy v1/v2 file keeps working forever.
- **Unlock**: the master key is cached in memory for the window, so
  background sync never asks for a touch again. `Lock Vaults (clear cached
  keys)` drops the cache; `Unlock Vault (Security Key)…` prompts on demand.
- **Auto-lock** (`credSshManager.autoLockMinutes`, default 60, `0` disables) locks the
  vaults after an idle window measured in **your** actions — opening or copying a
  credential, connecting, installing a key, editing an entry, unlocking. Not mouse
  movement, and deliberately not background sync: a five-minute sync timer counted as
  activity would mean the window never elapses and the setting silently does nothing.
  Locking forgets the cached master key; local credentials keep working, because they
  live in the OS keychain and are not protected by the vault key.
- **Remove**: account row → **Remove Security Key…** (pick from the list).
- **The PIN always remains a fallback** — losing every key does not lock you
  out, and losing the PIN does not either as long as one key is registered.
- Requirements & limits: PRF needs **Chrome or Edge** as the default browser
  and a **FIDO2 key with hmac-secret** (YubiKey 5 or newer). Firefox/Safari
  currently return no PRF result — the flow reports that and the PIN keeps
  working. Credentials are registered against the RP id `localhost`, so the
  same physical key works on every machine.

## NAS backup & automatic multi-PC sync

Everything travels as **one AES-256-GCM encrypted file per profile**
(`vault_<sanitized email>.enc`) in the folder set by
`credSshManager.nasBackupPath`. The key is profile-bound:
`scryptSync(accountId + PIN, salt, 32)` — restoring needs both an active
auth session for that account and the PIN. Filenames are collision-safe
(same email under two providers gets distinct names). The envelope keeps
`account` metadata in plaintext (needed to verify the session and derive
the key *before* decryption); salt/IV/GCM-tag are public by design; the
payload (tree, passwords, private keys, VPN configs, DB connection
strings, tombstones) is ciphertext.
**The PIN is the only protection — use a real passphrase, not 4 digits.**

- **Manual**: `Backup to NAS` / `Import / Restore` (also reachable as the
  original spec's command ids `extension.exportSecrets` /
  `extension.importSecrets`). These prompt for the PIN every time.
- **Automatic** (`credSshManager.autoSync`): runs ~5s after every change,
  on startup, and every `autoSyncIntervalMinutes` (default 5); manual
  trigger via the toolbar's **Sync Now**. The sync PIN is **per account,
  per machine** (`Set Sync PIN` asks which account; a previously set
  machine-wide PIN keeps working as the fallback) and must match across
  machines for that account.
- **Per-account folders**: each account can sync to its own NAS — account
  row → **Set Sync Folder…** (stored in `credSshManager.accountNasPaths`,
  email → path; unmapped accounts use the global `nasBackupPath`). The
  corporate account lives on the company NAS, the personal one on yours;
  teams, shares, and backups all follow the account's folder.
- **Merge, not overwrite** (causal version vectors): both PCs may change
  data. Each machine has a persistent `deviceId` and a monotonic counter;
  every node carries a **version vector** `v` (`{deviceId: seq}`) alongside
  `updatedAt`. On merge, the vector that **causally dominates** wins — so a
  later edit beats an earlier one even when a skewed clock disagrees. Truly
  concurrent edits (neither vector dominates) fall back to the higher
  `updatedAt`, then to the lexicographically-greater last-writer `deviceId`,
  so both machines converge to the **same** winner regardless of merge order.
- **Deletions and rollback protection**: deletions leave lightweight
  tombstones (`{deletedAt, v}`, no secret payload); an edit whose vector is
  causally newer than the delete resurrects the node, otherwise the deletion
  wins. A per-profile **horizon** (element-wise max of every vector ever
  seen, never pruned) lets tombstones be hard-deleted after 90 days *without*
  losing the causal memory: a node restored from a stale backup whose vector
  the horizon already covers is rejected as a phantom instead of resurrecting.
  Legacy pre-vector vaults (no `v`) still merge by `updatedAt`/tombstone time
  and adopt a vector on their first write. Secrets follow the winning side;
  orphaned children re-parent to root. NAS writes are temp-file + atomic
  rename; a file that fails to decrypt (wrong PIN / corrupted) is reported
  once and **never overwritten** — mismatched PINs pause sync, they cannot
  destroy data.

### Per-machine setup (WSL example)

```bash
# make the NAS/drive visible inside WSL (network drives are not auto-mounted)
wsl.exe -u root -e sh -c 'mkdir -p /mnt/v && mount -t drvfs V: /mnt/v'
# persist: echo 'V: /mnt/v drvfs defaults,uid=1000,gid=1000,metadata 0 0' >> /etc/fstab
```

Then set `credSshManager.nasBackupPath` (e.g. `/mnt/v/vs code extn passw
manager`), enable `credSshManager.autoSync`, run **Set Sync PIN** with the
shared PIN, and sign into the same account profile.

## Dated snapshots (separate from sync, deliberately)

Sync keeps one *live* vault and **merges** — which means a deletion propagates. Delete a
credential on the laptop and the desktop's next sync agrees it is gone. That is correct for a
live vault and useless as a safety net, so snapshots are a second, independent path:

- **Where**: `credSshManager.backupLocation`, or per account via account row → **Set Backup
  Location…** (`accountBackupPaths`). A NAS folder, an external drive, a Google Drive or
  OneDrive sync folder. Empty disables it.
- **When**: `backupIntervalHours` (24 daily, 168 weekly, `0` off), or per account via **Set
  Backup Schedule…**. **Snapshot Vault Now** takes one on demand.
- **A snapshot identical to the previous one is not written**, so a quiet vault does not fill a
  metered folder with copies of itself.
- **Retention**: `backupRetainDays` deletes older ones (`0` keeps everything). The **newest is
  never deleted whatever its age** — a laptop closed for a year must not come back to an empty
  backup folder.

Snapshots are the same encrypted format as everything else: they open with the account and the
PIN, and carry attachments, images and VPN configs like passwords.

## Settings

**Almost nothing here needs editing by hand.** Every setting that belongs to one account has a
right-click command on the account row, and that is the intended way in — the entries below say
which one. The raw keys are documented because a settings.json is what an admin pushes to a
fleet, and because a value you cannot find is a value you cannot trust.

Two rules govern how they combine:

- **Per-account beats global.** `accountNasPaths` / `accountBackupPaths` /
  `accountBackupIntervals` map an **email** to a value; an account with no mapping falls back to
  the global `nasBackupPath` / `backupLocation` / `backupIntervalHours`. That is what lets a
  work profile on a company server and a personal profile on a home NAS live in one window.
- **Nothing here holds a secret.** Locations, intervals, client ids and scopes — all of it is
  safe in a synced settings.json or a fleet policy. Every actual secret is in the OS keychain.

### Where the vault lives

| Setting | Default | What it does |
|---|---|---|
| `nasBackupPath` | *(empty)* | The **default vault location** for accounts with no mapping of their own: either a **folder** for the encrypted `vault_<email>.enc` files (`/mnt/z/Backups`, `Z:\Backups`, `\\NAS\Vault`) **or** a **Cred Vault Server URL** (`https://vault.company.com`). A URL switches that account to authenticated server sync — the two transports differ in more than spelling, see *Which transport for what* above |
| `accountNasPaths` | `{}` | Per-account override: `{ "work@corp.com": "https://vault.corp.com", "me@gmail.com": "/mnt/home-nas/vault" }`. **From the UI:** account right-click → *Set Sync Location…* |
| `autoSync` | `false` | Sync every profile automatically — after each change, at startup, and on the interval below. Edits from several machines are **merged** per node, not overwritten. Needs the **same Sync PIN** on every machine (*Set Sync PIN*) |
| `autoSyncIntervalMinutes` | `5` | How often auto-sync pulls. Lower it on a fast LAN, raise it on a metered link |

### Snapshots — the safety net, deliberately not the same thing as sync

| Setting | Default | What it does |
|---|---|---|
| `backupLocation` | *(empty — off)* | Where **dated snapshots** are written. **Point it at different storage from `nasBackupPath`**: the sync location *merges*, so a deletion travels to every machine; the snapshot is the copy that still has what you deleted. Same encrypted bytes, no PIN needed to take one, restored with *Import / Restore* |
| `accountBackupPaths` | `{}` | Per-account snapshot folder. **From the UI:** account right-click → *Set Backup Location…* |
| `backupIntervalHours` | `24` | `1` hourly · `24` daily · `168` weekly · **`0` off**. A snapshot identical to the previous one is not written, so a quiet vault does not fill a metered folder with copies of itself |
| `accountBackupIntervals` | `{}` | Per-account schedule, in hours. **From the UI:** account right-click → *Set Backup Schedule…* (hourly / 6h / daily / weekly / off / custom) |
| `backupRetainDays` | `30` | Delete snapshots older than this; `0` keeps them forever. The **newest is never deleted** whatever its age — a laptop closed for a year must not come back to an empty backup folder |

### Locking

| Setting | Default | What it does |
|---|---|---|
| `autoLockMinutes` | `60` | Lock after this many minutes **without you using the vault**; `0` disables. "Using" means an action of yours that touches a secret — open, copy, connect, install a key, edit, unlock. It is **not** mouse movement and **not** background sync: a timer firing is not you being present. Locking forgets the cached master key and refuses the saved Sync PIN until you unlock deliberately; your credentials keep working locally, because they live in the OS keychain and are not protected by the vault key. **From the UI:** *Set Auto-Lock…* |

### Sign-in

| Setting | Default | What it does |
|---|---|---|
| `microsoftApiScope` | *(empty)* | The API scope of **your own Entra app registration**, e.g. `api://<client-id>/vault.access`. **Against server 0.2.3 and newer, leave this empty** — the server publishes the value on `/api/client-config` and the extension asks for the right scope by itself. Set it only to override a server advertising the wrong value, or to work against an older server. *Why it exists:* with no scope the extension receives a Microsoft **Graph** token, and Graph tokens are deliberately unverifiable by third parties, so every server refuses them with 401 — see *When the Team is empty* below |
| `googleClientId` | *(empty)* | OAuth 2.0 client id of your **Desktop app** credential (Google Cloud Console → APIs & Services → Credentials). Required for *Sign in with Google*. The client **secret** is prompted once and kept in SecretStorage, never in settings |

### Behaviour

| Setting | Default | What it does |
|---|---|---|
| `dbExtensions` | `{}` | Which extension *Open in DB Extension* hands a connection to, per DB type: `{ "mysql": "cweijan.vscode-mysql-client2" }`. Empty = the first installed candidate wins |
| `secretClipboardTtlSeconds` | `45` | How long a copied secret stays on the clipboard before it is cleared — and only if the clipboard still holds exactly what was copied, so a later copy of your own is never destroyed. **What no extension can control:** Windows Clipboard History (Win+V) and cross-device sync capture the value the moment it is copied, and clearing the clipboard afterwards does not reach them. Turn those off if you copy secrets on a machine you do not control |
| `readCliHelp` | `true` | When you paste a whole command into a terminal entry, fill the **empty** notes by running `<tool> --help`. It runs the tool **you just typed**, with no shell and no arguments of ours, and only when every word of the command is a plain tool name — anything containing a shell metacharacter is never run. It never overwrites a note you wrote. Turn it off if you would rather nothing were executed while you edit |

### When the Team is empty

The one failure this product used to produce on its own — everyone signed in, sync green, no
error, and nobody in each other's Team. Three things now stand between you and it:

1. **0.46** stopped swallowing the server's refusal. A 401/403 when listing the team is shown
   with the reason and what to do about it, instead of returning an empty list that looks
   exactly like a team nobody has joined yet.
2. **Server 0.2.3** makes it not happen: the server advertises its scope, the extension
   configures itself, and a developer signs in and is done.
3. On an **older server**, set `microsoftApiScope` to match that server's `MS_AUDIENCES`.
   Any other cause — a domain missing from the server's allow-list, a token for a different
   audience — the message names as such.

## Commands

All **52** commands live under the **`CredsForDevs:`** category in the palette, and each one is
also on the right-click menu where it applies.

- **Accounts** — Add Account · Sign Out / Remove Account · Set Sync Location… · Set Backup
  Location… · Set Backup Schedule… · Show Signing Fingerprint… · Reset Google OAuth
- **Vault** — Set Sync PIN · Add Security Key (YubiKey)… · Remove Security Key… · Unlock Vault
  (Security Key)… · Lock Vaults (clear cached keys) · Set Auto-Lock…
- **Tree** — Add Folder · Add Entity · Edit · Clone… · Delete · Move to Folder… · Change Folder
  Type… · Move Up · Move Down · View Details · Refresh
- **SSH** — Connect SSH · Toggle SSH (on/off) · Copy Password · Install SSH Key to System
  (~/.ssh)
- **VPN** — Start VPN · Stop VPN · Save VPN Config As…
- **Databases** — Open in DB Extension · Copy Connection String
- **Terminal commands** — Run in Terminal · Copy Command · Show Command and Notes
- **Scripts** — Run Script
- **Agents** — Share with Claude Code…
- **Sharing** — Share with… · Create Entity for… · Accept… · Decline · Accept All from Sender… ·
  Accept All Shared…
- **Outside the team** — Export / Share Externally… · Import from External…
- **Sync & backup** — Sync Now (NAS) · Backup to NAS · Import / Restore · Snapshot Vault Now
  (the original spec's `extension.exportSecrets` / `extension.importSecrets` still work)

## Security notes

A full audit of every place a secret could be read without opening the vault ran in 0.50, and
each finding is closed or bounded below. One of them had been introduced two releases earlier
by the same hand that found it; it is listed rather than quietly patched, because the
invariant it broke is written down and a broken invariant that leaves no trace breaks again.

- **A script's variables never enter the script text.** They travel in the process
  environment, and the body reads them by name in its own language. So the file on disk, the
  viewer, and *Copy All* carry names where they used to carry values. A script that prints its
  own variable is still your code — that is noticed and mentioned once, not blocked.
- **The env-variable check button reports presence and length, never the value.** It used to
  echo `NAME=value`, which put a bound private key into terminal scrollback in full.
- **File permissions on Windows are real now.** `chmod 0600` is nearly a no-op there, and the
  inherited NTFS list gives SYSTEM and the local Administrators group full control of
  everything under your profile — the wrong audience precisely on a machine where you are not
  the administrator. Every file this extension writes a secret into now breaks that
  inheritance and grants its owner alone.
- **Installing a key into `~/.ssh` says that the copy is permanent**, and *Remove Installed
  Key…* is the way back.
- **Copying a DB connection string says the password is in it**, and *Copy Connection String
  (no password)* is the companion for when it should not be.
- Passwords, private keys, VPN configs, and DB connection strings live
  only in SecretStorage and inside the encrypted `.enc` files; they are
  never written to `globalState`, settings, or logs, and never sent into
  webview HTML. (Tree metadata — host/user/port/notes/public key — is
  `globalState` plaintext by design; don't put secrets in **notes**.)
- **PIN strength is enforced** (min 8 chars) everywhere a PIN is set — it is
  the sole barrier on ciphertext that lives off your machine.
- **Removing the last security key re-keys the vault** under your PIN, so a
  removed YubiKey (and stale backups holding its wrap) can no longer open
  future versions. With other keys still registered, removal drops that
  wrap but does not re-key existing copies (you're told so).
- **Accepting a share always creates a fresh local entity** — a sender can
  never address, and thus silently overwrite, something already in your vault.
- **An AI agent granted access never receives the secret.** It holds a token that buys
  one entity's worth of work; `ssh` is run by the extension, the password rides that
  child process's environment, and no response the broker can send has a field a secret
  could travel in. The grant dies with the VS Code window, its first use needs your click,
  and every call is written down. What it does not remove is the access itself — an agent
  that can run commands on a host can do what that host allows.
- **Decrypted SSH keys are ephemeral**: materialized only for an active `ssh
  -i` session (`0600`), deleted when that terminal closes and purged on every
  activate/deactivate — they never accumulate on disk.
- **Server sync must be HTTPS**: a plain-`http://` server URL (except
  localhost) triggers a modal warning before use, since the bearer token
  would otherwise travel in clear.
- The WebAuthn unlock page is served only at an unguessable loopback path, so
  another local process can't read its challenge/nonce.
- **KDF cost is versioned in the header**: new data is sealed at scrypt
  N=2^17 (params recorded per blob); older data reads at N=2^15 and upgrades
  to the higher cost the next time its vault is written.
- **Cross-machine merge is causal** (version vectors + a per-profile horizon),
  so a stale/rolled-back backup can't resurrect a deleted entry even after its
  tombstone is GC'd — see the sync section above.
- On a **shared folder**, the envelope's integrity check covers your own
  metadata but not the cross-user share list, because any member has to be able
  to append to it. Share metadata on a NAS is therefore not forgery-proof by
  cryptography — it is by deployment: **teams use the server transport**, which
  stamps the sender from the verified sign-in token. The folder transport is for
  one person on several machines.
- Backups decrypt only with the exact account + PIN pair; there is no
  recovery for a lost PIN.
- "Copy" actions put plaintext on the system clipboard — clear it after
  use on shared machines.
- A Google "Desktop app" client secret is not confidential by Google's
  definition, but it is still kept in SecretStorage, not in settings.

---

## The server, and raising it in Docker

Everything above works with **no server at all** — a folder is enough for one person on
several machines. The server is what makes a **team** work: it authenticates every request
against Microsoft Entra or Google, and stamps the sender of a shared credential from that
verified identity, so a share cannot be forged by anyone with write access to a folder.

**It is zero-trust by construction: the server stores ciphertext and never holds a key.**
Encryption and decryption happen in your editor, under your PIN or your security key.
Whoever runs the box — including you — cannot read what is in the vault. That is a property
of the design, not a policy anyone has to keep.

Raising it is three commands on any machine with Docker:

```bash
git clone https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs
cd dew_flow_creds_for_devs/deploy

cp .env.example .env
$EDITOR .env            # who may sign in, and your domain or public IP
docker compose up -d
```

That starts the API, an nginx in front of it, and a certbot that obtains a Let's Encrypt
certificate and then renews it forever — **by domain or by bare IP**, whichever you have.
Then point the extension at `https://your-host` with *Set Sync Location…* and sign in.

The image is prebuilt and published for **amd64 and arm64** — a ~50 MB Native-AOT build with no
shell and no .NET inside, so nothing is compiled on your server and there is very little in the
container to attack. Vault data, logs and certificates live in **host folders you choose**, so
updating the image never touches them. Prefer no Docker at all? Every release also ships
**standalone binaries** for Linux and Windows, x64 and ARM64 — one file, no runtime to install.
`deploy/README.md`
covers the rest: sign-in providers, TLS by IP against by domain, scheduled backups to a NAS,
restore rehearsal, and one-command updates.

## Source, issues, licence

- **Repository:** [github.com/oleksandrdubyna88/dew_flow_creds_for_devs](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs)
- **Issues and feature requests:** [github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues)
- **Deploying the server:** [deploy/README.md](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/blob/main/deploy/README.md)
- **Licence:** MIT — use it, fork it, run it wherever you like.
