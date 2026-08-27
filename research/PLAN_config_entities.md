# PLAN — configs live in the vault, and an app reads one at startup

> Status: **IMPLEMENTED, 2026-08-27.** All seven phases shipped. Scope as built: a `config` entity
> kind across `src_vs_code`, a broker read route, a `creds config` verb — and, instead of the .NET
> package this plan called for, a per-language snippet panel in the viewer. The deviations are at
> the bottom and the largest of them is that one.
>
> Tail: [PLAN_config_sharing.md](PLAN_config_sharing.md) — sharing, which shipped the same day when
> the owner tried it and found the JSON did not survive.
>
> Related docs: [module_extension.md](module_extension.md), [module_server.md](module_server.md),
> [architecture.md](architecture.md).

## The symptom

`appsettings.Development.json` cannot be committed, so it is passed between developers by hand and
lost regularly. Losing it costs days, because nothing describes what was in it. `dotnet user-secrets`
solves "do not commit"; it solves neither "hand it to a colleague" nor "do not lose it". That second
pair is what this is for, and it is the part .NET has no answer to at all.

## Decisions taken before design

Recorded because each one closes an alternative that looks reasonable from the outside.

**1. A config is its OWN entity kind, not a switch on `script`.** `creds script <token>` means "run
the saved script" (`src_cli/src/CommandLine.cs:130`); on an `appsettings.json` that verb is nonsense.
The field is `scriptLanguage` and JSON sits in it beside Bash and Dockerfile
(`src_vs_code/src/scriptRender.ts:20`). A separate kind gets its own verbs, its own icon, its own
validation, and a FORMAT rather than a language. `kindIcon` ends in `assertNever`
(`src_vs_code/src/treeIcons.ts:23`), so adding the kind turns every place that switches on kind into
a compile error — the new kind cannot be silently forgotten anywhere.

**2. The config BODY is a secret, and lives in SecretStorage — never in `EntityMetadata`.** A script
body is what a person typed at a shell; a config body holds connection strings with passwords in
them. Notes were moved out of plaintext metadata into SecretStorage in 0.20 for exactly this reason
and are stripped from a shared entry — `src_vs_code/src/mcpEntries.ts` says so in its own comment. A
config that went into metadata would be the one secret in the product sitting in the clear. It
follows the `notes` pattern precisely: `notesSecretKey`, `src_vs_code/src/storageManager.ts:806`.

**3. Everything goes through the extension. The server is backup only.** Repository rule 1 forbids a
server that can decrypt, so "the app asks our API for the decrypted JSON" is the one shape that
cannot be built. The app talks to the local `creds` binary or to the window's broker; the server
continues to store ciphertext it cannot read, for sync and for the day the laptop dies.

**4. The access key is NOT a grant token.** Grants die with the window — "that is the entire
revocation story", `src_vs_code/src/grantRegistry.ts:5` — and a token carries the window's port in
its own text (`src_cli/src/Program.cs:97`). A key pasted into `Program.cs` or an `.env` must survive
a year of restarts, so it is a new, persisted, per-entity credential with its own revoke and rotate.

**5. Reading a config raises NO consent modal.** A program starting cannot answer one, and a modal
that appeared on every `dotnet run` would be clicked through blind within a day, which is worse than
not asking. The key IS the authorization. This is a real weakening against the grant path, and it
belongs in the UI where the key is minted, not only in this document. What backs it instead: the
switch is off by default and opt-in per entry; the key is revocable and rotatable; every read is
written to the audit log (`src_vs_code/src/agentAuditLog.ts`); and the key names one entity, so it
can buy nothing else in the vault.

**6. No new runtime dependency.** `src_vs_code/package.json` declares no `dependencies` at all,
deliberately, for a product that holds secrets. A YAML/XML/TOML parser therefore cannot simply be
added. JSON and ENV are validated exactly (`JSON.parse`, and ENV is a line grammar); YAML, XML and
TOML get hand-written STRUCTURAL checks whose limits are stated in the message the user sees, so
nobody reads "valid" as more than it is.

**7. The invalid marker is a name prefix, not an icon.** Both icon channels are already taken: the
icon slot carries the MCP access ladder (`src_vs_code/src/treeIcons.ts:56`) and the row decoration
carries dependency colour (`src_vs_code/src/depDecorations.ts`), whose own comment says that one
channel carrying two meanings tells you neither. The label is free, so an invalid config reads as
`!!!-name`.

## Build order

Each phase ships something that works on its own.

### Phase 1 — the kind and the body

- `EntityKind` gains `config`; `ENTITY_KINDS` at `src_vs_code/src/types.ts:202`.
- `EntityMetadata` gains `isConfig`, `configFormat` (json | yaml | env | xml | toml | ini) and
  `configFileName` (`appsettings.Development.json` — what materialising writes).
  **No body field**: the body is a secret.
- `storageManager` gains `getConfigBody` / `setConfigBody`, mirroring `getNotes` / `setNotes`,
  tenant-scoped, and joins the export walk at `src_vs_code/src/storageManager.ts:874`.
- The form gains a `configSection` fieldset (format, file name, body) in `FORM_SECTIONS`. The body is
  prefilled in edit mode the way the DB connection string is — a config is meant to be edited, and
  the empty-means-keep rule would make editing one impossible.
- Every `assertNever` switch updated. The compiler names them; none is found by reading.
- Sharing and `mcpEntries` treat the body as a secret: `hasConfig`, never the text.

### Phase 2 — validation and the marker

- New pure `configFormat.ts`: `validateConfig(format, body)` answering valid, or invalid with a
  message and a line. Plus the unresolved-`${NAME}` check, which is a DIFFERENT failure from a syntax
  one and has to read differently: "`${DB_PASSWORD}` has no variable" is not "a brace is unclosed",
  and a body can be perfect JSON while being useless for that reason.
- The save path does not block. It saves and reports "saved, but this is not valid JSON".
- `entityItem` (`src_vs_code/src/treeDataProvider.ts:617`) prefixes the label with `!!!` while the
  stored body is invalid; a save that parses removes it.
- The verdict is RECOMPUTED on load, never only stored — a body that arrived from a colleague's sync
  must not wear this window's stale verdict.

### Phase 3 — the Fields tab

- Two tabs in the config section: **Raw** (today's textarea) and **Fields**.
- New pure `configFields.ts`: body to flat rows (`Serilog:MinimumLevel:Default` = `Information`) and
  back. JSON and ENV first; a format whose round-trip cannot be exact offers Raw only, and says why
  rather than silently hiding the tab.
- The round-trip is the whole risk of this phase: parse, edit one value, serialise must not reorder
  keys, drop comments, or restyle the document. Tested as a property over real config files rather
  than on one example.

### Phase 4 — put it on disk

- A context-menu command, "Write config file here…" — the escape hatch for `docker compose`, Vite and
  `dotnet ef`, which no configuration provider covers. Follows `src_vs_code/src/materializedKeys.ts`.
- It refuses to write into a path git TRACKS, which is Phase 7's check reused rather than a second
  copy of it.

### Phase 5 — reachable from code

- An "Available from code" switch on the config entity. Switching it on mints a **config key**:
  persisted, per-entity, shown once with a copy button, revocable and rotatable.
- Broker: a new entry under `reads` in `contract/broker-v1.json` — `/v1/config/read`, authenticated
  by the config key, answering `{format, body}`. Generated from `brokerProtocol.ts` like everything
  else there, so the test on each side keeps the two implementations honest.
- CLI: `creds config <key>` prints the body to stdout. One verb, no `--`.
- Every read is written to the audit log with the entity and the caller.

### Phase 6 — the .NET provider

- A small package: `builder.Configuration.AddCredsForDevs()`, taking the key from
  `CREDSFORDEVS_KEY` or an explicit argument, calling the local broker, parsing per format.
- It fails LOUDLY by default. A silently empty configuration is how an application starts against the
  wrong database; `optional: true` exists for the case where that is genuinely wanted.
- Other languages come after C#, and only once the contract has survived one real consumer.

### Phase 7 — leak check and sync diff

- On save and on materialise: if the body matches a file that git TRACKS in an open workspace, warn.
  `secretScan.ts` and `hygieneScan.ts` already do the neighbouring work.
- On a pulled sync: show WHICH keys a colleague added, removed or changed — not "the config changed".
  Built on the existing revision history. This is the feature that makes a shared config reviewable
  rather than merely delivered, and it is why a config belongs in a vault rather than in a chat.

## Test plan

- `configFormat.test.ts` — valid and invalid per format, the unclosed brace, the unresolved
  `${NAME}`, and the honest limits of the structural checkers. A case the checker accepts that a real
  parser would reject is written as a TEST, so the limit is recorded rather than discovered later.
- `configFields.test.ts` — the round-trip property: parse then serialise is byte-identical for an
  untouched body, and editing one value changes exactly one value.
- `storageManager` — the body is stored and read as a secret, deleted with the entity, and present in
  the export walk.
- Tree — `!!!` appears for an invalid body and disappears after a valid save.
- Broker — the contract test on each side; a wrong key is refused; a revoked key is refused.
- Sharing and `mcpEntries` — the body never crosses either wire. Asserted, not assumed.

## Definition of Done

- [ ] `config` is a kind, and every `assertNever` switch names it.
- [ ] The body lives in SecretStorage; no test can find it in metadata, in a share, or in an MCP answer.
- [ ] An invalid save is allowed, marked `!!!`, and clears on a valid save.
- [ ] The Fields tab round-trips without reordering or losing anything.
- [ ] A config key survives a window restart and is revocable.
- [ ] `contract/broker-v1.json` regenerated, and both sides' tests are green.
- [ ] `npm test` and the server test executable green; `dotnet build` at 0 warnings.
- [ ] `research/module_extension.md` updated, and this plan promoted with its deviations recorded.

## What shipped differently

The most valuable part of this record, per the convention. Ten of them, and the first is the one
that changed what the feature IS.

**1. There is no NuGet package.** Phase 6 was a .NET configuration provider, published and
versioned. It became a per-language snippet panel in the viewer instead, and the owner's question
is what surfaced it: *"can't we just have an instruction?"* Checking rather than answering showed
that .NET already ships the half a package would wrap — `IConfigurationBuilder.AddJsonStream` takes
a stream, so what was missing is "run the CLI and hand over the bytes", about ten lines. A package
carrying ten lines would have bought a fifth release line, a public API and a version story. A
snippet covers **twenty** languages instead of one. The one real thing a package would still buy —
no CLI dependency, by talking to the broker through `src_broker_client` — is recorded here and not
built, because nothing has asked for it.

**2. Twenty languages, not "C# first and others later".** Depth is stated rather than implied:
three plug into their platform's own configuration system and seventeen hand you a parsed
document. Twenty entries that all looked equally deep would have been the dishonest version.

**3. The viewer grew a second column.** Not in this plan at all — the owner asked for it during the
work, laid out with the form's own two-column rule so the two pages narrow identically.

**4. Validation asks BEFORE saving.** The plan said "saves anyway and reports". That shipped, and a
live window showed why it is wrong: the report arrived in a toast after the form had closed, by
which point the only thing to do about it was reopen the entry. It is now a modal question with
Cancel, asked while the form is still open.

**5. The Fields tab distinguishes three outcomes, not two.** `configFields` answered `undefined`
for two unrelated reasons and this plan's own module comment called them "two different reasons
that read the same to the caller". They do not: a JSON config with one missing brace reported "No
field view for this format", which is false about JSON and silent about the brace. Reported from a
live window.

**6. The Fields tab is a VIEW over the raw text, not a second representation.** Parse-edit-serialise
cannot keep a document — indentation, blank lines, comments and the trailing newline all go. Each
field records where its value SITS, and an edit is spliced into that span.

**7. `config` cannot burn on first agent use.** Found while adding the kind. `sshkey` is excluded
from that policy because nothing could ever fire it; `config` is excluded for the opposite reason —
something would fire it on the first application start, and an application reads its configuration
at every start.

**8. The body joined `RevisionSecrets`.** Found while fixing the viewer: previous versions of a
config were falling out of history, so an edit that broke one could not be undone. `revisionSnapshot.ts`
exists precisely because a secret added to one path and forgotten in another vanishes silently, and
its test counts the secrets — which is what turned this from a thought into a red line.

**9. The diff runs against the newest revision, not at sync time.** The plan said "on a pulled
sync". A body arrives from a colleague's sync, an accepted share, a restore, or the person's own
edit, and all four put the previous one into history — so asking history covers every route with
one answer instead of adding a UI side effect to a merge.

**10. Three extractions the line ceilings forced, all of which improved the code.** `kindOf` moved
from `types.ts` into `entityKind.ts`, where that module's own header already said the kind is asked
in one place. `entitySecretKeys()` replaced a nine-key list written out by hand TWICE — the failure
mode being a plaintext secret left in the keychain after its entity is gone. And the config route's
HTTP half went into `brokerConfigRoute.ts`, the same extraction `brokerReadRoutes.ts` already is.

## Measured, not assumed

- **V8 reports a JSON error position only sometimes.** `Expected ',' or '}' … at position 13 (line 4
  column 1)` carries one; `Unexpected token 'o', …` carries a context snippet and no position. The
  snippet spans the failure rather than pointing at it, on a message format that is not a contract —
  so the line is reported when known and omitted when not.
- **A JS `Set` iterator tolerates deleting the element it is on.** The first sweep comment claimed
  otherwise; breaking the implementation on purpose showed the naive version passing.
- **The `${` check cannot look for "the next `}` anywhere".** `{"pw": "${DB_PASSWORD"}` has one, at
  the end of the object. The name must be an identifier and the character after it must be `}`.
