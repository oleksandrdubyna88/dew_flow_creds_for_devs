# PLAN — Import from `~/.ssh/config` and other managers

> Status: **IMPLEMENTED, 2026-08-25.** Scope: `src_vs_code/src/importFormats.ts` (pure readers) and
> the `credSshManager.importFrom` command.
>
> Related docs: [module_extension.md](module_extension.md),
> [PLAN_audit_roadmap_2026_08_25.md](../todo/PLAN_audit_roadmap_2026_08_25.md) (item **D4**).

## Symptom

Migration cost is the main obstacle to adopting a manager with sixty commands. Somebody with forty
hosts in `~/.ssh/config` and a hundred logins in Bitwarden will not retype them, so a tool that
cannot be moved INTO is one that never gets tried.

## What shipped

One command — *Import from ~/.ssh/config or another manager…* — reading four shapes:

| Source | Reader | Notes |
|---|---|---|
| `~/.ssh/config` | `parseSshConfig` | `Host`/`HostName`/`User`/`Port`/`IdentityFile`; wildcard hosts skipped, `ProxyJump` carried into notes |
| Bitwarden / KeePass / LastPass / Termius CSV | `parseCsvExport` | one reader, column-name aliases per tool |
| Bitwarden / 1Password JSON | `parseJsonExport` | login items only |
| anything else | — | refused, with the header as the reason |

`detectFormat` chooses by CONTENT rather than by extension, so a misnamed file still imports.

## Deviations, and the one thing deliberately not built

- **KDBX is not implemented**, and the module says so where a reader will look. A KeePass database is
  AES/ChaCha20 over an Argon2 or AES-KDF key with a compressed, optionally inner-encrypted XML
  payload; **Argon2 is not in Node**, and this extension has no runtime dependencies. Doing it badly
  would be worse than not doing it — KeePass exports CSV and XML, and the CSV path takes those.
- **An imported login is NOT marked SSH.** A URL from a password manager is a website; guessing
  otherwise would put a Connect button on four hundred entries that cannot connect.
- **A skipped row is reported, never dropped in silence** — with its row number, or its name. An
  import that quietly loses a quarter of a file is worse than one that refuses it outright.
- **Every node gets a fresh id.** An id from somebody else's export would collide in the next sync
  merge; the same rule `remapExternalIds` already follows.

## Test plan (done)

`importFormats.test.ts`: an `~/.ssh/config` with a multi-name host, a wildcard, a bare alias and a
`ProxyJump`; a Bitwarden CSV with quoting, doubled quotes and embedded newlines; an unrecognisable
header; a nameless row; a JSON export with a card and a nameless item; format detection; and the two
structural guarantees — fresh ids, and secrets that travel beside the node rather than inside its
metadata.

## Open tail

`ProxyJump` is a note rather than a link to another entity — the typed jump-host field is **D7**.
