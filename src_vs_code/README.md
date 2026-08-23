# Cred SSH Manager

A local VS Code extension for managing credentials, SSH keys, VPN configs,
and database connections — with quick SSH connectivity — across multiple
account profiles and multiple machines.

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
— Credential (default) / SSH connection / SSH key / VPN / Database — and
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
- Honest notes: sender identity is claimed, not cryptographically proven
  (fine on a private NAS; signatures are a future upgrade), and a share is a
  copy — there is no remote revoke.

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

- **NAS folder → personal / solo sync.** It is the right choice for one person
  syncing their own vault across their own machines. A share's `fromEmail` is a
  **self-asserted claim** written into the file: anyone who can write to the
  shared folder can forge a share that appears to come from someone else (the
  envelope MAC covers the owner's own metadata but deliberately **not** the
  cross-user `shares` array — [cryptoUtils.ts:239](src/cryptoUtils.ts#L239)).
  So the folder transport gives **no cryptographic sender authenticity** for
  team sharing.
- **Server transport → the recommended standard for teams.** The Cred Vault
  Server authenticates every request with that account's OAuth token and
  **stamps the share sender from the verified token**, so `fromEmail` is
  unforgeable. Any deployment where people share credentials with each other
  should use the server, not a shared NAS.

A future, optional hardening (Ed25519 signatures + key pinning + a fingerprint
check) could give the NAS transport forgery resistance for organizations that
are strictly forbidden from running a server — it is **backlog only**, designed
in [todo/PLAN_nas_sender_pki.md](todo/PLAN_nas_sender_pki.md) and not built.
Even then it is TOFU-based (see that plan); the server remains the stronger,
recommended answer.

Verify a server deployment end-to-end (13 checks: vault round-trip,
isolation, team, share delivery, sender stamping, PIN accept/reject,
removal): `npm run itest:server` against a running server — see
`scripts/server-transport-itest.cjs` for the exact invocation.

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
- **First key upgrades the vault** from v1 (PIN-derived) to v2, re-encrypting
  the payload under the new master key in one step. Update the extension on
  all your machines before adding a key — older builds cannot read v2.
- **Unlock**: the master key is cached in memory for the window, so
  background sync never asks for a touch again. `Lock Vaults (clear cached
  keys)` drops the cache; `Unlock Vault (Security Key)…` prompts on demand.
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

## Settings & commands

| Setting | Purpose |
|---|---|
| `credSshManager.nasBackupPath` | Default vault location: a folder **or** a vault-server URL |
| `credSshManager.accountNasPaths` | Per-account location override (email → folder or URL); set via account right-click → *Set Sync Location…* |
| `credSshManager.autoSync` | Enable automatic merge-sync (default off) |
| `credSshManager.autoSyncIntervalMinutes` | Pull interval, default 5 |
| `credSshManager.dbExtensions` | Per-DB-type extension override for Connect (`{"mysql": "…"}`) |
| `credSshManager.googleClientId` | Desktop-app OAuth client id for Google sign-in |

Commands (`Cred SSH:` category): Add Account, Sign Out / Remove Account,
Set Sync Location…, Add/Remove Security Key…, Unlock Vault (Security Key)…,
Lock Vaults, Add Folder/Entity, Edit, Delete, Move to Folder…,
Change Folder Type…, Move Up/Down, View Details, Copy Password, Connect
SSH, Toggle SSH, Install SSH Key to System, Save VPN Config As…, Open in
DB Extension, Copy Connection String, Share with…, Create Entity for…,
Accept… / Decline / Accept All…, Backup to NAS, Import / Restore, Sync Now
(NAS), Set Sync PIN (per account), Reset Google OAuth, Refresh.

## Build, test, package, install

```bash
npm install
npm test                 # tsc + node:test unit suite (57 tests)
npm run package          # produces cred-ssh-manager-<version>.vsix
code --install-extension cred-ssh-manager-*.vsix   # then reload the window
```

## Module map

| File | Role |
|------|------|
| `src/extension.ts` | Activation, command registration and wiring |
| `src/treeDataProvider.ts` | Tree (accounts → folders → entities), capability contextValues, drag & drop |
| `src/entityFormPanel.ts` | Create/edit webview form (dynamic field visibility) |
| `src/entityViewPanel.ts` | Read-only double-click viewer with per-field copy |
| `src/dialogs.ts` | QuickPick details view, folder/account/move pickers |
| `src/storageManager.ts` | Tenant-scoped `globalState` + SecretStorage, tombstones, snapshots |
| `src/syncManager.ts` | Auto-sync scheduling, NAS I/O, PIN cache |
| `src/syncMerge.ts` | Pure two-way merge (unit-tested) |
| `src/backupManager.ts` | Manual NAS export/import flows |
| `src/backupNaming.ts` | Collision-safe vault filenames (unit-tested) |
| `src/cryptoUtils.ts` | AES-256-GCM + scrypt envelope (unit-tested) |
| `src/authManager.ts` | getSession wrappers, session verification |
| `src/googleAuthProvider.ts` | The registered `google` auth provider (PKCE + loopback) |
| `src/googleOauth.ts` | Pure OAuth helpers (unit-tested) |
| `src/terminalManager.ts` | SSH command builder, terminal reuse by `user@host:port` |
| `src/keyInstaller.ts` | `~/.ssh` install + key materialization |
| `src/dbLauncher.ts` | Opens DB entities in the matching DB extension |
| `src/dbConnString.ts` | Connection-string parse/build, default ports (unit-tested) |
| `src/shareFormat.ts` | Share sealing/opening, envelope shares, multi-PIN resolver (unit-tested) |
| `src/sharingManager.ts` | Team discovery across NAS folders, share delivery/removal |
| `src/nasPaths.ts` | Global + per-account location resolution |
| `src/keyWrap.ts` | Master-key wrapping for PIN + security keys (unit-tested) |
| `src/vaultKeys.ts` | Unlock coordinator: PIN, security keys, in-memory master-key cache |
| `src/webauthnPrf.ts` | WebAuthn PRF flow over a loopback page (native key prompt) |
| `src/vaultTransport.ts` | Transport interface (folder vs server) |
| `src/folderTransport.ts` | Shared-folder transport (`vault_*.enc` + envelope shares) |
| `src/serverTransport.ts` | Cred Vault Server transport (token-authenticated HTTPS) |
| `src/transportFactory.ts` | Location → transport, incl. per-provider token resolution |
| `src/types.ts` | Shared schema + runtime guards (unit-tested) |

## Security notes

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
- The six audit-follow-up code items (#1–#6: versioned KDF, version-vector
  merge, envelope MAC, PIN re-key, remote-vault deletion, notes →
  SecretStorage) have all shipped — the record is in
  `research/PLAN_audit_followups.md`. One residual is called out there: the
  folder transport's envelope MAC covers `account`/`wraps` but **not** `shares`
  (cross-user appends), so team share-metadata forgery on a shared NAS is
  **by design** addressed by the transport boundary above — teams use the
  **server** transport, which stamps the sender from the OAuth token. A NAS-only
  cryptographic hardening (Ed25519 + key pinning + fingerprint check) is backlog
  only in `todo/PLAN_nas_sender_pki.md`. Remaining open items are server
  operational/infra decisions (`todo/PLAN_server_ops.md`), not code.
- Backups decrypt only with the exact account + PIN pair; there is no
  recovery for a lost PIN.
- "Copy" actions put plaintext on the system clipboard — clear it after
  use on shared machines.
- A Google "Desktop app" client secret is not confidential by Google's
  definition, but it is still kept in SecretStorage, not in settings.
