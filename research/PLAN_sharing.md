# PLAN — Team sharing: Team section, Share with…, Shared with me, Create for…

> Status: **IMPLEMENTED, 2026-08-21 (v0.13.0).**
>
> Deviations from the plan: per the owner's decision, shares live as a
> PLAINTEXT `shares` array **inside the recipient's `vault_*.enc` envelope**
> (next to, never inside, the owner's encrypted payload) — not as per-item
> files; the write-race risk is handled with verify-and-retry on append and
> remove, and every vault writer (sync, manual backup) carries the array
> through rewrites. Modules landed as `shareFormat.ts` (pure, tested) +
> `sharingManager.ts` (NAS IO) instead of one `sharing.ts`. Defaulted open
> questions: accept imports to the profile root; re-share keeps the entity
> id (accept overwrites); sender identity is claimed (no signatures yet);
> entityName+kind plaintext; self-share allowed; the 90-day inbox prune was
> NOT implemented (parked).

## Goal

1. **Team** — discover everyone using the extension on this NAS and list them.
2. **Share with…** — send my entity (metadata + secrets) to one or several
   people, encrypted with a one-time PIN; it appears in their "Shared with me"
   and, on accept, merges into their own vault.
3. **Create for…** — author an entity directly for someone else; nothing
   remains in my own storage after a successful share.

## Wire format (NAS)

### Team discovery
Every `vault_<email>.enc` already carries plaintext `account`
metadata (`accountId`, `email`, `provider`) readable via
`readBackupAccount()` without any PIN. The Team list = the accounts of all
vault files in `credSshManager.nasBackupPath`. People who have never synced
have no vault file → not shareable (documented).

### Share items (inbox)
Per recipient, a directory of one file per share item (see Q1 — the
user-described "one file with an array" is kept as the logical model; the
physical layout avoids write races):

```
<nasBackupPath>/shares/<sanitized recipient email>/<uuid>.json
```

Each file is a JSON envelope; header plaintext, payload encrypted:

```json
{
  "format": "cred-ssh-manager-share",
  "version": 1,
  "from":   { "accountId": "…", "email": "admin@…", "provider": "google" },
  "to":     "user@…",
  "entityName": "orchestrator db",     // shown BEFORE decryption
  "entityKind": "db",                  // icon in the list (see Q6)
  "createdAt": 1766300000000,
  "kdf": "scrypt", "salt": "…", "iv": "…", "tag": "…",
  "data": "…"                          // AES-256-GCM ciphertext
}
```

- **Payload** (`data`, decrypted): `{ node: TreeNode (parentId → null),
  secrets: { password?, privateKey?, vpnConfig?, dbConnection? } }`.
- **Passphrase**: `scrypt(recipientAccountId + sharePin)` — binds the item to
  the recipient, so the PIN alone cannot open an item copied from another
  inbox. Reuses `cryptoUtils.encryptJson/decryptJson` (envelope gains an
  optional generic header, or a sibling `encryptShareItem` wrapper).
- Sender identity is **claimed** (see Q5): plaintext `from`, no signature in
  v0.13.

## UI

New top-level tree sections (below account profiles):

- **Team** (`$(organization)`): one row per discovered person
  (`email · provider`), self included and marked `(you)`. Row context menu:
  **Share entity with…** (opens the entity picker), **Create for…**.
- **Shared with me** (`$(gift)`, visible only when the own inbox is
  non-empty): grouped by sender email; leaves = `entityName` with the kind
  icon. Actions:
  - item: **Accept…** (inline ✓ + context), **Decline** (delete without
    accepting);
  - sender group: **Accept all from <sender>…**;
  - section: **Accept all…**.

Existing entity context menu gains **Share with…** (all entity kinds).

## Flows

### Share with… (sender)
1. Right-click entity → Share with… → **multi-select QuickPick** of Team
   emails (QuickPick's built-in filtering = the autocomplete), self excluded
   by default but allowed (self-share = handy test path).
2. Prompt **one-time PIN** (+ confirmation, non-empty).
3. For each recipient: build payload (entity node + all its secrets read from
   SecretStorage), encrypt with `recipientAccountId + PIN`, write
   `shares/<recipient>/<uuid>.json` (temp + rename).
4. Report: "Shared 'X' with N people. Tell them the PIN out-of-band."

### Shared with me (recipient)
1. The sync cycle (and the Refresh button) additionally scans
   `shares/<own email>/`; new items surface a notification and the tree
   section.
2. **Accept one**: prompt PIN → decrypt → import into the main vault → delete
   the share file → sync pushes the vault. Import keeps the original entity
   id: re-sharing an updated credential **overwrites** the recipient's copy
   (deliberate — see Q3). Target folder: root by default (see Q2).
3. **Accept all (from sender / global)** — the round-robin the user described:
   - maintain a `knownPins: string[]`, seeded by one prompt;
   - pass over remaining items, decrypting each with every known PIN;
     import successes, delete their files;
   - if items remain, prompt: "'<entityName>' from <sender> does not decrypt —
     enter its PIN (Esc = skip the rest)"; add to `knownPins`, repeat;
   - stop when done or Esc; report imported/skipped counts.
   - The multi-PIN resolver is a pure function
     (`resolveShares(items, pins) → {opened, remaining}`) → unit-testable.
4. **Decline** deletes the file without decrypting (confirmation).

### Create for… (devops flow)
1. Team row → Create for… (or Command Palette; multi-select recipients like
   Share).
2. The **existing entity form** opens (create mode, no locked kind, title
   "Create for user@…").
3. On save: prompt one-time PIN → encrypt → write share item(s) directly.
   **Nothing is written to the author's own vault** (the form result is
   routed to the share writer instead of `storage.addNode`).

## Build order

1. `src/sharing.ts`: share-item encrypt/decrypt (+ passphrase binding), inbox
   list/write/delete (vscode.fs, temp+rename), team discovery (vault scan
   with per-cycle cache), pure `resolveShares()`.
   Unit tests: round-trip, wrong PIN, tampering, recipient binding
   (other accountId fails), multi-PIN resolution rounds.
2. Tree: new `TreeElement` variants (`teamRoot | teamMember | sharedRoot |
   sharedSender | sharedItem`), sections rendered from cached scans; refresh
   integrates with `SyncManager` cycle.
3. Commands + menus: `shareEntity`, `createForUser`, `acceptShare`,
   `declineShare`, `acceptAllFromSender`, `acceptAllShares`.
4. Accept/import path: id-preserving upsert into the vault + secrets, then
   `mutated()`.
5. Docs (README section "Sharing"), version bump, package, install.

## Definition of Done

- [ ] Team lists every account discovered from NAS vault files, marked (you).
- [ ] Share with… writes one encrypted item per recipient; PIN never stored.
- [ ] Shared with me groups by sender; Accept (single / per-sender / all with
      multi-PIN rounds) imports into the vault and removes the item;
      Decline removes without decrypting.
- [ ] Create for… stores nothing locally on success.
- [ ] Unit tests for the crypto + resolver; suite and rendered-script check
      green; README updated.

## Open questions (answers change the plan)

1. **Physical layout**: spec said "one file per recipient with an array";
   plan uses one file per item to avoid read-modify-write races between two
   senders and the accepting recipient. Same UX. OK?
2. **Accept target folder**: root (default) or ask per accept-batch?
   Typed-folder rule would apply if asked.
3. **Re-share = update**: keeping the entity id means a second share of the
   same entity overwrites the recipient's accepted copy on accept. Wanted?
4. **PIN binding**: passphrase = recipientAccountId + PIN (recommended, in
   plan). Alternative: PIN only (item openable by anyone holding the file +
   PIN).
5. **Sender authenticity**: `from` is claimed, not proven — anyone with NAS
   write access could label a share "from admin". Acceptable on the private
   NAS for v0.13; public-key signatures are the v0.14 upgrade path.
6. **Metadata visibility**: entityName + kind are plaintext in the inbox (needed
   for the pre-accept list). OK, or name-only?
7. **Hygiene**: auto-prune inbox items older than 90 days (like tombstones)?
8. **Self-share** allowed as a test path — OK?
