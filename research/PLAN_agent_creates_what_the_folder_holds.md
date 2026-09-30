# PLAN — an agent learns what a folder holds, and creates an entry with exactly that kind's fields

> Status: **IMPLEMENTED, 2026-09-30.** Every build step S1–S7 landed (bar S7's code round and releases) on
> `feat/agent-creates-what-the-folder-holds`; what shipped differently, and what is still open (a real agent
> session against the installed relay, the code round, the release), is §11. Plan gate passed (`proceed`,
> 2 of 2 reviewers, one round, four findings accepted — §10). Scope: `src_mcp/src` (the agent-facing
> tools: `UseTools.cs`, `FolderTools.cs`, `Tools.cs`, their tests), `contract/mcp-tools-v1.json`
> (regenerated), `src_vs_code/src` (`mcpCreate.ts`, `mcpHooks.ts`, `mcpFolders.ts`, a new per-kind field
> table, the broker routes that serve it, the consent summary, `sshCommand.ts` / `entityViewPage.ts` for
> the SSH rows), help, CHANGELOG and tests. Ships in the same release as
> [PLAN_entry_pin_keeps_its_promise.md](PLAN_entry_pin_keeps_its_promise.md): extension 1.12.0 and the MCP
> relay 0.9.0.
>
> Related docs: [PLAN_mcp_server.md](PLAN_mcp_server.md) (the six switches, the create level),
> [PLAN_agent_folder_ops.md](PLAN_agent_folder_ops.md), [module_extension.md](module_extension.md),
> [PLAN_creds_cli_reachable_from_every_caller.md](../todo/PLAN_creds_cli_reachable_from_every_caller.md) (also
> edits the agent-facing instructions in `src_mcp`, §7).

`file:line` references are to `origin/main` at `6905e9f`.

## 1. The symptom, as the owner reported it

> *"я попросил другого клод создать 2 записи — павер шел для проверки остатков лимитов. он создал, но оно
> пишет ссш, хотя физически записи в терминале, и не могут быть ссш. что не так?"* — 2026-09-29.

Another Claude session was asked to store two PowerShell commands that check a vendor's remaining quota,
in a folder whose type is **Terminal command**. It created *"qwen token plan: quota left"* and *"grok key:
status and limits"*. The viewer of the first shows **Host** `token-plan.ap-southeast-1.maas.aliyuncs.com`
and **SSH command** `ssh token-plan.ap-southeast-1.maas.aliyuncs.com`; the Edit form of the second is a
Terminal command whose **Command** box is empty. Neither entry can do what it was made for.

## 2. Why — three defects and one missing capability

1. **The agent could not say what the entry is.** `creds_create` takes `name`, `kind`, `secret` /
   `secretKind`, `host`, `user`, `port`, `folder` and the draw options — nothing else
   (`src_mcp/src/UseTools.cs:175-203`; the body the window reads, `mcpHooks.ts:171-185`; the request type,
   `mcpCreate.ts:35-66`). A Terminal entry's substance — `command`, `commandArgs`, `commandNote`,
   `terminalOs` (`types.ts:154-158`, `execFormFields.ts:86-87`) — has no route in. So the agent put the
   only thing it had, the API endpoint, into `host`.
2. **The window stores a host on a kind that has none.** `detailsFor` (`mcpCreate.ts:223-234`) writes
   `host`, `user` and `port` for EVERY kind. The form keeps them only for SSH and VPN
   (`entityFormPanel.ts:612-614`: `host: isSsh || isVpn ? … : undefined`). The kind itself is right —
   the folder dictates it (`kindFor`, `mcpCreate.ts:200-210`) and `stampVector` stamps the legacy flags
   from it (`storageManager.ts:470-478`) — so the entry IS a Terminal entry carrying a field its kind does
   not have.
3. **The viewer offers an SSH command for anything with a host.** `buildSshCommand`
   (`sshCommand.ts:124-157`) checks only `isSafeSshTarget`, never the kind, and the viewer draws *Host* and
   *SSH command* / *SSH command (any machine)* from it for every entry (`entityViewPage.ts:432, 468-469`;
   `entityViewerCommands.ts:127, 238`). A VPN with a host gets an `ssh …` line too.
4. **Missing: the agent is never told what a folder holds or what a kind may carry.** The folder answer
   already carries `folderType` (`mcpFolders.ts:33, 87`), but the `creds_folders` description says only
   *"Each carries `id`, `name`, `parent` and `can`"* (`src_mcp/src/FolderTools.cs:26-35`), and nothing
   anywhere lists a kind's fields. The kind lists in the two descriptions have drifted:
   `UseTools.cs:180-181` and `FolderTools.cs:42-43` both omit `payment`, which `ENTITY_KINDS` has
   (`types.ts:318-328`).

## 3. What the owner asked for (2026-09-29)

> *"тут нужно расширить мсп. и выдавать, что есть такие то типы записей. когда он берет папку — говорить,
> что эта папка такого то типа, сущность может иметь такие то поля и все. никакие другие (только то, что
> клод может засетать. то есть поля мсп аксеса ему не говорятся вообще). и плюс клод через мсп должен
> узнать какие типы сущностей есть, запросить подробную справку по каждой сущности если нужно, если у него
> нет четкой команды куда и как создавать."*

So:

- **O1** — an agent can ask which kinds of entry exist.
- **O2** — an agent can ask for detailed help on one kind: its fields, which are required, what each means,
  and an example.
- **O3** — when an agent looks at a folder it is told the folder's kind and the fields an entry there may
  have — **and nothing else**.
- **O4** — only fields an agent may SET are ever named. The agent-access fields (the six MCP switches, the
  consent cadence, `mcpCreatedByAgent`) and every other window-owned field (dates, vectors, PIN marks,
  colours, dependencies, attachments) are **not mentioned at all** — not listed as "forbidden", simply
  absent.
- **O5** — `creds_create` accepts exactly those fields for the kind and refuses anything else with a
  sentence the agent can act on.

## 4. Design

### 4.1 One table: what an agent may set, per kind — `agentKindFields.ts` (new, pure)

```ts
export interface AgentField {
  readonly name: string;            // the request key, e.g. 'command'
  readonly type: 'string' | 'integer' | 'boolean' | 'args' | 'enum';
  readonly values?: readonly string[];   // for 'enum' (dbType, terminalOs, configFormat…)
  readonly required?: true;
  readonly secret?: true;           // arrives only as `secret` / `secretKind`, never in `fields`
  readonly summary: string;         // one line, for the folder answer
  readonly help: string;            // the paragraph for the kind help
  readonly example?: unknown;
}
export const AGENT_KIND_FIELDS: Readonly<Record<EntityKind, readonly AgentField[]>>;
export function agentKinds(): readonly { kind: EntityKind; label: string; summary: string }[];
```

- `Record<EntityKind, …>` makes a new kind without an entry a **compile error**.
- **Derived rule, not a second opinion:** each kind's field list is the set the FORM keeps for that kind in
  `toValues` (`entityFormPanel.ts:574-664`, `execFormFields.ts:81-89`) intersected with what an agent may
  set. A test (§6) pins it: for every kind, posting each listed field through the real `toValues` keeps
  it, and a field the form scrubs for that kind is not in the table. That is what stops the table and the
  form from drifting, the way the two kind lists in §2.4 already have.
- **Step 1 of the build is the inventory** — reading `toValues` kind by kind and writing the table. The
  expected shape, to be confirmed there and not trusted from here:

  | Kind | Agent-settable fields (besides `name`) |
  |---|---|
  | ssh | `host` (required), `user`, `port`, `publicKey`, `sshKeyPath`, `tags` |
  | vpn | `host`, `user`, `port` (plus the config via `secret`) |
  | db | `dbType` (enum), the connection via `secret` |
  | terminal | `command` (required), `args` (`[{ value, note?, enabled? }]`), `commandNote`, `terminalOs` (enum) |
  | script | `scriptLanguage`, `script` (the body — not a secret; `${NAME}` placeholders), `scriptVars` names |
  | config | `configFormat` (enum), the body via `secret` |
  | credential | `login`, `url`, `notes` |
  | sshkey | `publicKey`, the private key via `secret` |
  | payment | **decision D-A below** |

  `notes` is a secret slot (`entitySlots.ts`) and is written through the secret path, not into details.
- **Excluded by construction (O4):** `mcp` and every agent-access switch, `mcpCreatedByAgent`,
  `pinProtected`, `pinEpoch`, `notForExport`, `expiresAt`/`burnPolicy` (lifetime), `dependsOn`,
  `depColor`, `runDependencies`, `jumpHostEntityId`, `portForwards`, `agentForward`, `hostKey`,
  `sshKeyEntityId`, `vpnLauncherEntityId`, attachments, images, dates, vectors. They are not in the table,
  so no answer can name them.

### 4.2 Two new tools (O1, O2)

Both read-only, answered by the window from the table (the relay stays a relay — no second copy of the
table in C#), no consent prompt, no entry access needed.

- **`creds_kinds`** — *"List the kinds of entry this vault holds, with one line each. Call it when you do
  not know which kind fits, or before creds_kind_help."* Answer: `[{ kind, label, summary }]`.
- **`creds_kind_help`** — *"Everything you may set on an entry of one kind: each field, whether it is
  required, what it means, and an example request. Fields not listed here cannot be set by you."*
  Parameter `kind`. Answer: `{ kind, label, fields: [{ name, type, values?, required, secret, help }],
  example }`, where `example` is a complete `creds_create` body. A secret field says *"send it as `secret`,
  or prefer `secretKind` so the window makes it"*.

New broker route(s) in `brokerMcpRoutes.ts` (`GET`-shaped, no grant — the catalogue holds no vault data);
`contract/broker-v1.json` gains them; `src_vs_code/scripts/emit-mcp-tools.mjs` regenerates
`contract/mcp-tools-v1.json`.

### 4.3 `creds_folders` says what a folder holds (O3)

- The description names `folderType` (it is already in the answer, `mcpFolders.ts:87`) and says what it
  means: *"A folder with a `holds` kind accepts only that kind; its `fields` are everything an entry
  created there may carry — nothing else can be set."*
- The answer gains, per typed folder, `holds: <kind>` (the existing value, clearer name kept alongside
  `folderType` for compatibility) and `fields: [{ name, required, summary }]` from the table. An untyped
  folder answers `holds: "any"` with **no `fields` list**, and its description points at `creds_kinds` /
  `creds_kind_help`: in such a folder `creds_create` validates against the kind the agent NAMES (`kindFor`
  is `folderType ?? request.kind`, `mcpCreate.ts:201`), and an unknown kind is refused naming
  `creds_kinds` *(plan gate, finding 1)*.
- The server's own instructions (`src_mcp/src/Program.cs`) get one sentence, not the table: *"Before
  creating, look at the folder's `holds` and `fields`; if you are not told exactly what to create, call
  creds_kinds and creds_kind_help."* The instructions block is already long; a table there would be
  truncated by clients (the 2 KiB limit observed in the family), which is exactly why the detail lives in
  a tool.

### 4.4 `creds_create` accepts exactly the kind's fields (O5, defect 1-2)

- The tool gains an object parameter `fields` (kind-specific, validated by the window). `host`, `user` and
  `port` at the top level stay accepted for backward compatibility **only where the kind has them**.
- **The wire schema** *(plan gate, finding 2)*: `fields` is a JSON object; a `string` field is a JSON
  string, `integer` a JSON integer, `boolean` a JSON boolean, `enum` a string from the listed `values`, and
  `args` an array of `{ "value": string, "note"?: string, "enabled"?: boolean }`. The MCP `inputSchema`
  declares `fields` as an object and each kind's shape is documented by `creds_kind_help`, so a client can
  validate before sending; the window validates again and is the authority. A field marked `secret` is
  **refused inside `fields`** with *"send it as `secret`, or prefer `secretKind` so the window makes it"* —
  secret values travel only in the top-level `secret` / `secretKind`, and are routed by kind to the
  matching slot (password, private key, VPN config, DB connection, config body).
- `readCreateRequest` (`mcpHooks.ts:171-185`) reads `fields`; a new pure `validateAgentFields(kind,
  fields)` checks every key against `AGENT_KIND_FIELDS[kind]`: unknown or foreign key → refused, **nothing
  is created**, answer *"`host` is not a field of a terminal entry. A terminal entry takes: command
  (required), args, commandNote, terminalOs — see creds_kind_help."*; wrong type or enum → the same shape;
  a missing required field → refused. The folder's kind is decided first (`kindFor`), so the fields are
  validated against the kind the entry WILL have, not the one the agent named.
- `detailsFor` (`mcpCreate.ts:223-234`) builds details only from validated fields and then applies the same
  per-kind scrub the form applies, so a field can never land on a kind that does not have it (defect 2).
  Reuse, not a copy: the scrub is extracted from `toValues` into a function both call if the inventory
  shows it can be, otherwise the table test of §6 is the single guard.
- **The consent prompt shows what will run — all of it.** For `terminal` and `script`, `summarizeCreate`
  (`mcpCreate.ts:241-243`) shows the full composed command line and the **complete** script, never a
  preview *(plan gate, finding 3: a harmless first few lines can hide a destructive tail)* — the person is
  approving a command an agent wrote that they may later run with one click, and must see it before it is
  stored. The journal records the full text the same way (a script is details, not a secret slot).
- `creds_create`'s description lists the kinds from the table (fixing the drift in §2.4) and says:
  *"Look at the target folder's `holds` and `fields` first; send only those."*

### 4.5 SSH rows only for SSH (defect 3)

`buildSshCommand` stays a pure builder; the viewer asks it only when `resolveKind(details) === 'ssh'`
(`entityKind.ts:83-85`, the only kind-answering path). `entityViewerCommands.ts:127, 238` pass `undefined`
otherwise, so *SSH command* and *SSH command (any machine)* disappear from Terminal, VPN and every other
kind. The *Host* row (`entityViewPage.ts:432`) is drawn only for the kinds that have a host (ssh, vpn) —
from the §4.1 table, not from a second list. Any other place that composes an ssh line from a host
(`terminalManager.ts:26`, Connect) is checked for the same gate in step 1 and recorded.

### 4.6 The two entries that already exist

No migration: a stray `host` on a Terminal entry is harmless once §4.5 stops drawing it, and the next Save
from the form scrubs it (`entityFormPanel.ts:612`). The owner fixes the two entries by hand (fill
**Command** and **Arguments**, or delete and recreate them through the new tool). Recorded here so nobody
writes a migration for two rows.

### 4.7 Owner decisions (confirmed 2026-09-29)

- **D-A — payment through an agent: not creatable.** `ENTITY_KINDS` has `payment`; neither description
  lists it, and whether an agent may store a card number or CVV at all is a product decision, not a drift
  to fix. `creds_kinds` lists it as held but `creds_kind_help` says it cannot be created by an agent, and
  `creds_create` refuses it with that sentence.
- **D-B — a folder that asks for a PIN on new entries: the consent step asks for the PIN.** The person's
  create path honours `folderAsksForPin` (`pinOnCreate.ts:74`); the agent create path
  (`mcpHooks.ts:30-60`) does not. An agent cannot type a PIN, so after the person approves the creation the
  window asks them for the folder's PIN (checked against a protected sibling exactly as `pinOnCreate`
  does), and the entry is sealed before it is written (the sealing rule R3 of
  [PLAN_entry_pin_keeps_its_promise.md](PLAN_entry_pin_keeps_its_promise.md) §4); a declined PIN creates
  nothing and the agent is told so. The PIN is asked **inside the same consent step**, bounded by that
  step's existing timeout: dismissed, wrong three times, or timed out → the tool answers a refusal sentence
  and nothing is created or left half-made, because the PIN is checked and the values sealed before
  `runCreate` writes anything *(plan gate, finding 0)*.

## 5. Build order

- [x] **S0** — Gate this plan (coai `review_plan` until `proceed`).
- [x] **S1** — Inventory `toValues` per kind → `agentKindFields.ts` + the table test (RED first: a table
      entry the form would scrub fails).
- [x] **S2** — SSH rows gated by kind (RED: a Terminal entry with a host shows no SSH command).
- [x] **S3** — `validateAgentFields`, `readCreateRequest` reads `fields`, `detailsFor` builds from validated
      fields with the per-kind scrub (RED: creating a terminal entry with `host` stores a host today).
- [x] **S4** — Terminal/script consent summary shows the command (RED: the summary omits it).
- [x] **S5** — Broker routes for the catalogue; `creds_kinds`, `creds_kind_help` in `src_mcp`; the
      `creds_folders` answer and descriptions; `creds_create` `fields` parameter and description; server
      instructions sentence. Regenerate `contract/mcp-tools-v1.json`.
- [x] **S6** — D-A and D-B as decided.
- [x] **S7** *(docs and help done; the coai code round and the releases are the open tail, §11)* — Help (the agent-access section ×5), CHANGELOG, `research/module_extension.md` (the MCP
      create section: the table, the refusal rule, O4), `src_mcp/RELEASES` via release-please; coai
      `review_code`; releases.

## 6. Test plan

| Guarantee | Test | Template |
|---|---|---|
| every kind has a field list; a new kind without one does not compile | `Record<EntityKind, …>` + a runtime keys check | — |
| each listed field survives the real form save for its kind, and no field the form scrubs is listed | new `agentKindFields.test.ts` driving `toValues` | `entityFormPanel.test.ts` |
| no agent-access or window-owned field is ever named by `creds_kinds`, `creds_kind_help` or `creds_folders` | same file: a deny-list of the O4 names asserted absent from every answer | — |
| a terminal entry is created with its command, args, note and OS, and runs as composed | `mcpCreate.test.ts` / `mcpHooks` create test over the real `StorageManager` | `mcpFolderOps` tests |
| `host` on a terminal request is refused and nothing is created; the refusal names the allowed fields | same | — |
| a missing required field / a bad enum is refused with the kind's sentence | same | — |
| the consent summary for a terminal entry shows the full command line | `mcpCreate.test.ts` `summarizeCreate` | — |
| a Terminal or VPN entry with a host shows no SSH command; an SSH entry still does | `entityViewPage` test on the options builder | `wovenViewPicture.test.ts` style |
| `creds_kinds` / `creds_kind_help` / `creds_folders` descriptions and schemas are what the contract says | `src_mcp/tests/UseToolsTests.cs`, `FolderToolsTests.cs`, `ToolsTests.cs`; contract regeneration diff | existing |
| the kind lists in the descriptions come from one place | `ToolsTests.cs`: the description's kinds equal the catalogue's | — |
| D-A / D-B as decided | create tests | — |

Every RED watched failing first, then green; C# tests run through the test executable, never `dotnet test`
(`CLAUDE.md`).

## 7. Boundaries

| Item | Built by | The other plan's part |
|---|---|---|
| Agent-facing instructions text in `src_mcp` | this plan: one sentence (§4.3) | [PLAN_creds_cli_reachable_from_every_caller.md](../todo/PLAN_creds_cli_reachable_from_every_caller.md) also edits them; whichever lands second rebases the text, neither rewrites the other's sentence. |
| The viewer's SSH rows | this plan (§4.5) | [PLAN_entry_pin_keeps_its_promise.md](PLAN_entry_pin_keeps_its_promise.md) edits `entityViewerCommands.ts` (the PIN door, D1) but not the SSH rows; land the PIN plan's P2 first, this S2 rebases onto it. |
| Sealing an agent-created entry in a PIN folder (D-B) | this plan, using that plan's `sealValue` (R3) | The PIN plan's P1 lands `sealValue` first. |

## 8. Growth, size and compatibility

- No new store; the catalogue is a constant. No in-flight state.
- `src_mcp` gains two tools; `UseTools.cs` (451) and `FolderTools.cs` (171) stay far from the 800 limit;
  `mcpCreate.ts` (248), `mcpHooks.ts` (255), `mcpFolders.ts` (277) likewise.
- **Compatibility:** an older relay (≤0.8) talking to a new window never sends `fields` — its top-level
  `host`/`user`/`port` still work where the kind has them, and a `host` on a terminal is now REFUSED
  rather than stored: that is the fix, and it is named in the release notes. A new relay talking to an old
  window gets "unknown route" for the catalogue tools; the relay answers with a sentence telling the agent
  to update the extension (the existing contract-version handshake, `contractVersion.ts`, decides).
- Release order: extension 1.12.0 first (it serves the routes), then relay 0.9.0 — each tag pushed alone.

## 9. Definition of Done

- [ ] An agent asked to "store a PowerShell command that checks the quota" in a Terminal folder produces an
      entry whose View shows the command and its arguments and no SSH line — verified with a real agent
      session against the built relay, not only in tests.
- [x] `creds_kinds` and `creds_kind_help` exist, answer from the one table, and never name an agent-access
      or window-owned field (asserted).
- [x] `creds_folders` tells the agent what each folder holds and which fields it may set.
- [x] `creds_create` refuses any field its kind does not have, with a sentence naming the allowed ones, and
      creates nothing on a refusal.
- [x] The consent prompt shows a terminal/script entry's command before it is stored.
- [x] SSH rows appear only on SSH entries.
- [x] D-A and D-B built as the owner decided (§4.7).
- [ ] Tests green (`npm test`, the C# test executable), contract regenerated, help ×5, CHANGELOG,
      `research/module_extension.md` updated; coai plan and code rounds `proceed`. *(All of it but the code
      round, which has not run — §11.)*
- [x] Promoted to `research/` with `IMPLEMENTED <date>` and deviations; `todo/README.md` in the same commit.

## 10. Plan gate — 2026-09-29

coai session `f639c6b7`, one round, codex + gemini (2 of 2 answered), verdict **proceed** (4 gating against
a threshold of 6). Every finding was accepted:

| # | Finding | Where it changed the plan |
|---|---|---|
| 0 | *(Blocking)* D-B's PIN prompt can hang the agent's call | §4.7 — asked inside the consent step, bounded by its timeout, refusal answered, nothing half-made |
| 1 | untyped folders contradict "validated against the folder's kind" | §4.3 — `holds: "any"`, no `fields`, validate against the named kind |
| 2 | no wire schema for `fields`, `args` and secret routing | §4.4 — the JSON shapes, secrets refused inside `fields` |
| 3 | a script approved from its first lines only | §4.4 — the complete script in the consent prompt and the journal |

Operator commands applied: build as one unit, autonomously, red-green-red, docs with every change, all
tests before release, the pull-request comment check, and a re-read against the repository's rules.

## 11. As built — 2026-09-30

Branch `feat/agent-creates-what-the-folder-holds`, rebased onto `main` after the entry-PIN pull request
(#165). Commits, in order: the per-kind table (S1), validated fields (S3), the full command and script in
consent (S4), the window's catalogue and `holds` (S5, window half), the relay's tools (S5, relay half),
a test read raw after the rebase, SSH rows by kind (S2), PIN folders (D-B), the itest stand-ins, and the
docs with this promotion (S7). D-A rode with S1/S3.

### Deviations — what shipped differently from §4–§8

- **The table was not the plan's guess** (S1). The test that posts every field through the real
  `toValues` failed it four ways: sshkey also keeps `sshKeyPath`; `notes` is kept for EVERY kind, not
  credential alone; vpn has `vpnType` and `vpnConfigFileName`; config has `configFileName`. `script` is
  required on a script entry, `tags` is an ssh field, and the field types shipped are `string`,
  `integer`, `enum`, `args` and `vars` — no `boolean`, which no agent-settable field needed. The shipped
  table is in [module_extension.md](module_extension.md) §*A folder says what it holds*.
- **No scrub was extracted from `toValues`** (§4.4 offered it "if the inventory shows it can be"):
  `detailsFor` builds from validated values only, and the table test is the single guard. The secret goes
  through the form's own additions pass to the kind's slot, and `secretKind` is refused where that slot
  cannot be drawn.
- **The catalogue routes are in `brokerReadRoutes.ts`**, at `GET /v1/mcp/kinds` and
  `GET /v1/mcp/kind-help?kind=` — beside health, aliases, entries and folders — not in
  `brokerMcpRoutes.ts` (§4.2).
- **The kind lists come from the contract.** `contract/broker-v1.json` gained `entityKinds` and
  `agentCreatableKinds`, emitted off the window's table; the relay reads them through
  `BrokerContract.CreatableKinds()` (falling back to the list its build knew), so no hand-typed kind list
  remains in `src_mcp`.
- **A project folder holds `"any"`**, like an untyped one (§4.3 named only untyped folders).
- **The old-window sentence is the relay's `NoAnswer` path, not `contractVersion.ts`** (§8). A create that
  carries `fields` first reads the catalogue route; a window older than it — which would drop the fields and
  store a terminal with no command — is answered the existing "update the extension" sentence and sent
  nothing. The catalogue tools answer the same way.
- **The hint wording changed for every relay tool**, not only the two new ones: an `invalid_request`
  refusal has its own hint, and the `denied` hint no longer only says to turn a switch on (for payment
  there is none).
- **`Program.Instructions` became `internal`** so a test can measure it. The instructions block is
  **2414 bytes**, already past the ~2 KiB point clients cut at; the new sentence ends at byte **1451**,
  inside the part that survives.
- **The Native-AOT link of the relay was not run locally**; the Debug build and its test executable were.
- **S2 went wider than the viewer** (§4.5 said "checked and recorded"). The same gate now also holds in
  Copy All (`formatEntityBlock`), `canConnectSsh` (the tree's *Connect via SSH*, and so `openSshTerminal`
  behind it), the CLI row's verb (`cliCommandText`) and the tree description (`treeRowText.baseTarget`).
  `canConnectSsh` keeps its documented breadth only for the record it was kept for — one whose kind falls
  back to `credential` — so that legacy record keeps Connect. `agentCommands`' agent snippet already asked
  `kind === 'ssh'`.
- **The viewer's SSH rows follow `canConnectSsh`, not `resolveKind(details) === 'ssh'`** (decided
  2026-09-30, after the branch first shipped the narrower gate). With two predicates the legacy host-only
  record offered *Connect via SSH* in the tree while its viewer hid the Host and the SSH line Connect runs —
  two answers to one question. `sshLineFor` now asks `canConnectSsh`, so the viewer, the revision viewer
  and Copy All show an SSH line exactly when the entry can be connected to over SSH; `hostIsAField` draws
  the Host row for a kind whose table has a host OR a record `canConnectSsh` admits, and the tree
  description reads the same function. A Terminal, VPN or config entry with a stray host still shows
  neither SSH row; the Host row test now expects it on a credential entry with a host, the one record
  `canConnectSsh`'s breadth admits.
- **D-B is a third step on the create door.** `McpCreateHooks` gained `settle(decision, deadline)` between
  the consent modal and `make`, and `make` receives what it settled. The deadline is taken BEFORE the modal
  (`Date.now() + CONSENT_TIMEOUT_MS`), so the PIN gets what is left of the step's five minutes, not five
  more — the relay's call waits ten. Reuse, not a copy: `pinForAgentEntry` is `pinForNewEntry` asked again;
  the sealing is `editPrefill.sealedWriter` over a new `NOTHING_OPENED`; the mark and the first `pinEpoch`
  are `applyCreatePin`. Two widenings made that possible: `CreatePin`'s cancel carries `typed` (a PIN was
  typed, then its count declined) and `asksForPinOnCreate` answers "does this folder ask" on its own, so a
  folder that asks nothing is never timed out.
- **"Wrong three times" means three typed PINs whose count was declined.** `pinForNewEntry` checks a typed
  PIN against the protected entries and asks the person to agree to the count; a declined count is what a
  wrong PIN looks like there, and it is asked again, three at most. A dismissed box ends it at once. In a
  folder that asks with no protected entry yet, the PIN is typed twice by `newPin`, which answers a mismatch
  exactly as a dismissal — so there a mismatch ends it at once too.
- **The two MCP itests' JavaScript stand-ins needed `settle`**; the compiler never sees `.cjs`, and
  `itest:mcp` died on the first create until they answered it (111 checks pass on Windows after).

### Open tail

- **A real agent session against the built relay** (§9, first item) — "store a PowerShell command that
  checks the quota" in a Terminal folder, then View shows the command and its arguments and no SSH line.
  Needs extension 1.12.0 and relay 0.9.0 installed; not done.
- **The release itself**: extension 1.12.0 first (it serves the routes), then relay 0.9.0, each tag pushed
  alone (§8). `src_mcp/RELEASES.md` is release-please's to write from these commits.
- **The coai code round** (S7) has not run on this branch.
- **The instructions block is over 2 KiB** (2414 bytes). The sentence this plan added survives the cut; the
  tail of the block does not, for clients that cut. Shortening it is shared with
  [PLAN_creds_cli_reachable_from_every_caller.md](../todo/PLAN_creds_cli_reachable_from_every_caller.md) (§7).
- ~~**A PIN box can outlive the step.**~~ **Closed 2026-09-30.** `settleAgentCreate` makes a
  `vscode.CancellationTokenSource`, cancels it when the deadline passes and disposes it either way, and its
  token rides an optional trailing parameter through `pinForAgentEntry` → `pinForNewEntry` → `newPin` and
  `pinCheckedAgainstFolder` to every `showInputBox`, so a box still open then closes with the step. What
  remains: the sibling check's count modal (`showWarningMessage`, which takes no token) stays until it is
  answered; its answer is ignored as before.
- **Whether to narrow Connect** for the legacy host-only record is still the product decision
  `canConnectSsh`'s comment names. The viewer question is decided (above): its rows match `canConnectSsh`,
  so narrowing Connect later narrows the viewer with it.
- **Not run here**: the WSL itest (`itest:mcp-wsl`), and a D-B leg through the real binary — D-B is covered
  by the unit suite and a test through the real broker door.
