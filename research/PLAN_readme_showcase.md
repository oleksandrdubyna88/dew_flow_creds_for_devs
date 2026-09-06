# PLAN — the README stops being a monorepo front door and starts being the product's first screen

> Status: **IMPLEMENTED 2026-09-06.** `README.md` rewritten, the listing's two errors corrected, the
> manifest updated, and `src_vs_code/src/test/readmeClaims.test.ts` written so the claims cannot rot
> quietly. The About line and the topic list are handed to the owner below; applying them is theirs.
>
> **Five deviations, and the third is the one worth reading.**
>
> - **The About line stays at 217 characters.** A reviewer said GitHub's limit is 160 and it must be
>   cut. Measured instead of assumed: the limit is 350, `ory/hydra` carries a 298-character
>   description today, and this repository already carried a 228-character one. What the finding was
>   right about is that search cards truncate near 150, so the differentiating clause leads.
> - **The repository already had a description and ten topics.** The plan was written as though both
>   were empty. The handover is therefore *add these eight*, not *set these*, and it is written that
>   way below.
> - **The suite caught its own test.** The first version of the picture-promise detector shipped to
>   the code round with literal backspace bytes where word boundaries were meant — an escaping
>   accident in the script that wrote it. It matched nothing, reported no promise, and passed. Three
>   reviewers found it independently. The detector now has a test of its own, fed the exact sentence
>   that was live on the listing, and blinding the regex turns that test red. **A test that cannot
>   fail is worse than no test, because it is counted** — which is this plan's own thesis, arriving
>   from the direction it was not looking.
> - **The install.sh line count is absent rather than corrected.** Pinning a script's exact length in
>   prose makes an unrelated comment a failing build; the README claims it reads in a minute, and the
>   test asserts that claim instead.
> - **No badges on the listing, four on the front door, and no installs badge anywhere.** The
>   Marketplace listing's badge refusal stands on its original reasoning. The front door takes
>   version, licence and the two CI workflows — but not the install count, which reads as weakness
>   at 9 and would have to be removed later anyway.
>
> Related docs: [PLAN_marketplace_listing.md](PLAN_marketplace_listing.md),
> [ЗАДАЧА_скриншоты_для_маркетплейса.md](../todo/ЗАДАЧА_скриншоты_для_маркетплейса.md),
> [architecture.md](architecture.md), [module_extension.md](module_extension.md).

## The symptom

Three things, and the third is the one that costs the most.

**1. The repository page has no images and promises some.** `src_vs_code/README.md:73` tells every
Marketplace visitor *"Screenshots: see the tree, the entity form and the share flow on the repository
page"*. `README.md` contains no `![`, no `<img>`, no `.png` — the promise is live and false today.
`src_vs_code/media/docs/` does not exist. `PLAN_marketplace_listing.md:26-28` already named this *"the
item that matters"* and `src_vs_code/docs/PUBLISHING.md:140` calls it *"the biggest gap in the
listing"*.

**2. The front door introduces a monorepo, not a product.** `README.md:1` is
`# dew_flow_creds_for_devs`, followed by a two-row "two products, one repository" table. That is a
correct document for somebody who already arrived and a poor one for somebody deciding whether to.
`package.json` names this file as `homepage`, so it is what a Marketplace reader clicks through to.

**3. The one thing nobody else does is not on the first screen, and the words for it have been
taken.** Measured 2026-09-06 against the field:

| who | their words | what they broker |
|---|---|---|
| Infisical Agent Vault (2,187★) | *"agents should never see the underlying secret in the first place"* | **HTTPS only** — a MITM forward proxy |
| Anthropic Managed Agents Vaults | *"The agent never sees the secret value"* | **HTTP egress only**, and *"substitution is outbound only"* |
| 1Password for Claude | *"Give Claude access without giving up your credentials"* | browser autofill + process env |
| Bitwarden Agent Access SDK | *"use a credential to complete a task without ever seeing it in plain text"* | SDK |
| HashiCorp Vault MCP | *"may expose certain Vault data, **including Vault secrets**, to MCP clients and LLMs"* | hands the secret over |

So *"the agent never sees the secret"* is no longer a surprising sentence — it is the category's
wallpaper. **What no one brokers is SSH, database wire protocols, VPN and terminal sessions.** The
closest architectural precedent, CyberArk's Secretless Broker, does exactly those protocols, was
built in 2019 for applications, sits at 387★ and was never repositioned for agents.

The first screen must therefore lead with **which protocols**, not with the property.

## What is TRUE, verified before any of it is printed

Every claim below was checked against the code on 2026-09-06. The ones that failed are in the next
section, and they matter more.

| claim | proof |
|---|---|
| MIT | `LICENSE:1`, `src_vs_code/package.json:7` |
| .NET 10 Minimal API, **and Native AOT** | `Directory.Build.props:4`, `CredVaultServer.csproj:1,12` |
| CLI 2.3–3.1 MB compressed, 6.8 MB on disk, no runtime, **six** RIDs | `.github/workflows/release.yml` — six `rid:` entries: linux-x64/arm64, win-x64/arm64, osx-x64/arm64. A reviewer caught the first citation pointing at `research/README.md`, which still said *"Four RID builds"* — the stale number this table exists to catch, in the document being cited as proof of it. Corrected there too. |
| server binary ~21 MB, chiselled image **50 MB** (from 275) | `research/module_server.md:847,873,879-880` |
| AES-256-GCM; scrypt N=2¹⁷ (~128 MiB, ~1 s) guarding the **wrap**, HKDF for the payload key | `cryptoUtils.ts:80-81,209,232`; `keyWrap.ts:15-33` |
| the server has no decryption routine — only SHA-256 and HMAC | `VaultStore.cs:10-11,34,52`; `Program.cs:385,556` |
| **no response shape can carry a secret** | `brokerProtocol.ts:7-10` — *"no shape it could arrive in exists"*; `:86-94`, `:96`, `:159-165`, `:207-210` |
| `{{creds:new}}` rotation, verbatim, incl. the `ALTER USER` example | `secretRotation.ts:32`; `contract/mcp-tools-v1.json:428`; `UseTools.cs:125-127` |
| lifetimes: Forever / 1 hour / 1 day / until VS Code closes / until an agent uses it once | `entityExpiry.ts:26-34,41-51` |
| one encrypted file + one encrypted image, 4 MiB each, executables refused incl. double extensions | `attachment.ts:14-29` |
| **nine** entity kinds | `types.ts:269-279` |
| **ten** permission switches — six over entries, four over folders | `mcpSwitches.ts:34-108` |
| 16 MCP tools, none returning a secret | `contract/mcp-tools-v1.json` |
| every call still raises a consent modal naming the real entry and the real command | `PLAN_mcp_server.md` |

## What is FALSE, and must never be printed

These came out of the same pass. Three of them would be expensive for a security product.

1. **There is no master password.** `keyWrap.ts:38` — the wraps are exactly
   `'pin' | 'webauthn' | 'recovery' | 'org-escrow'`. Naming a factor the product does not implement
   is the most damaging error available here.
2. **Nothing is "stamped by the verified identity provider".** The server stamps `FromEmail` from a
   verified token (`Program.cs:1307-1311`) — attribution, not a signature. The real Ed25519
   signatures (`shareSignature.ts:39-45`) are trust-on-first-use plus key continuity, and line **25**
   of that file says: ***"It must never be described as eliminating spoofing."*** The README may not
   contradict a rule the source states about itself.
3. **There is no tenancy model.** It is per-verified-email vault scoping plus an allowed-domain check
   (`Program.cs:493-507`, `:608-612`). In this codebase "tenant" only ever means the Entra issuer.
4. **Rotation is wired to db and ssh entries only** (`extension.ts:746-747`). Printed without that
   limit, the first reader to try it on a plain credential gets a refusal.
5. **"Completely standalone offline" is not true of the first run.** `types.ts:5` —
   `AuthProvider = 'microsoft' | 'google'`, and every profile hangs off one
   (`accountCommands.ts:109-121`). The server is optional; the sign-in is not. `src_vs_code/README.md:12`
   currently overclaims this and gets corrected in the same change.
6. Stale numbers not to copy from the current text: *"Seven kinds of entry"* (`README.md:43` — nine),
   *"install.sh is 120 lines"* (`README.md:119` — 130), *"Four RID builds"*
   (`research/README.md:61` — six), and the five-row switch table at `README.md:137-143` (ten).

**The rule that governs the whole rewrite** is `.claude/rules/shared/common/knowledge-base.md`:
shortening drops the caveat. This README's claims are qualified on purpose — masking covers commands
run *through* CredsForDevs, TOFU is weak against an attacker already in place, Linux without a Secret
Service falls back to an obfuscated store. **A shorter README that loses those reads as an
endorsement of what they forbade.** Every caveat that exists today survives, moved rather than cut.

## The first screen, drafted

Two surfaces with different capabilities, and the difference decides the markup:

| | GitHub | Marketplace |
|---|---|---|
| ` ```mermaid ` | renders | **does not** |
| `> [!NOTE]` alerts | renders | **does not** |
| relative image paths | work | **fragile** — absolute raw URLs only |
| `- [x]` checkboxes | render | render |

So: mermaid stays in `research/`, the root README's diagram ships as plain fenced text, and every
image uses an absolute `raw.githubusercontent.com` URL.

```markdown
# CredsForDevs

**Your coding agent can run the migration. It can never read the password.**

A credential vault in VS Code — SSH hosts and keys, database connections, VPN profiles, terminal
commands, config files and secrets — with an MCP broker that lets Claude Code execute against them
over SSH, database and VPN protocols, which no HTTP proxy can broker.

Marketplace · How the broker works · Security model · Self-host · Reviews
‹five links, root-relative: the marketplace page, `research/PLAN_agent_ssh_broker.md`,
`research/architecture.md`, `deploy/README.md`, `research/`›

[badges: Marketplace version · installs · MIT · build]

▶ ‹the GIF slot — see "What only a human can do" below›

Your SSH keys are in `~/.ssh`, your connection strings are in `appsettings.Development.json`, your
`.ovpn` files are in Downloads, and the moment you point a coding agent at any of them it can read
all of it.

- [x] SSH hosts, keys, jump hosts and port forwards
- [x] Databases — Postgres, MySQL, SQL Server, MongoDB
- [x] VPN profiles — WireGuard and OpenVPN, started and stopped from the tree
- [x] Terminal commands and scripts, arguments as rows
- [x] Config files kept out of git, read back from code in twenty languages
- [x] Payment instruments, one-time codes, seed phrases
- [x] An MCP broker for Claude Code — execute, never read
- [x] Ten permission switches, all off by default, and a consent prompt every time
- [x] A single-binary CLI, 6.8 MB, no runtime
- [x] Optional self-hosted team sync the server cannot decrypt

## What makes it different

**Execute, never read.** There is no response shape in the broker protocol with a field for a
password or a key — not a policy, a structure: *"no shape it could arrive in exists"*
(`src_vs_code/src/brokerProtocol.ts:7`).

**Protocols, not just HTTP.** Every other agent broker proxies HTTPS. This one performs SSH commands,
database queries, VPN connections and saved terminal commands on the agent's behalf.

**Local-first.** Secrets live in the OS keychain. The team server is optional, stores ciphertext, and
holds no key — `VaultStore.cs` has no decryption routine to call.
```

Then, unchanged in substance and moved rather than rewritten: the zero-knowledge section with its
comparison table, the agent section with the ten switches and the `{{creds:new}}` rotation **with its
db/ssh limit stated**, the quickstart in three steps, `creds` on another machine, the caveats, and
the deep links into `research/`.

## The other three surfaces

**`src_vs_code/README.md`** keeps its completeness — it is the listing, and `PLAN_marketplace_listing.md`
established that its *Everything it does* table is the right first screen for a reader who is already
in the store. Three changes only: the false screenshot promise at `:73` goes or gains real images; the
offline overclaim at `:12` is corrected; the stale switch counts are fixed. **No badges here** — that
refusal was deliberate and its reasoning holds: *"a CI badge on a listing whose reader cannot act on a
red build is decoration."*

**`package.json.description`** is the highest-leverage string in the product: it is the only copy that
appears in in-editor search, the sidebar and the storefront card. 1Password's is *"Say goodbye to
plaintext secrets in your code"* — pure reader-pain, no product noun. Ours should carry the
differentiator in the same register.

**About and Topics** are set in the GitHub UI, so this plan proposes and the owner applies.

About, 217 characters:

> The credential vault your AI agent can use but never read. VS Code extension for SSH hosts, DB
> connections, VPN profiles and secrets — with an MCP broker for Claude Code and optional self-hosted
> zero-knowledge sync.

Topics, 18 of 20, in render order:

```
credentials, secrets-management, secret-management, secrets,
vscode-extension, vscode,
mcp, mcp-server, model-context-protocol, claude-code, ai-agents,
security, zero-trust, ssh,
self-hosted, end-to-end-encryption,
developer-tools, dotnet
```

Four exclusions with reasons, because a topic list is easier to argue about than to justify:
`password-manager` (4,530 repos — mis-positions the product in a consumer category against
Bitwarden and KeePassXC, and the readers it attracts have no SSH hosts), `csharp` (redundant with
`dotnet`; the language bar already says it), `docker` (218,347 repos, says nothing about what this
is), and **`ssh-broker`, which GitHub reports as *"hasn't been used on any public repositories,
yet"*** — a zero-use topic cannot be browsed or recommended. The word "broker" belongs in the About
line, where Secretless Broker proves it works, and `ssh` (10,332) takes the slot.

The asymmetry worth acting on: the secrets topics are small and uncurated (`credentials` 1,028,
`secret-management` 638, `zero-trust` 2,379) and winnable on the topic page; the AI topics are huge
and curated (`mcp` 73,373, `claude-code` 69,720) and unwinnable by browsing — but they are the only
ones with an inbound related-topic graph, so they are claimed for recommendations rather than for
ranking. The intersection **`credentials` × `vscode-extension` × `mcp` is currently occupied by zero
repositories.**

## What only a human can do, and it is the single highest-value item

The GIF. A negative capability — the *absence* of a secret from a transcript — is the least credible
thing prose can assert, and per the table above the assertion itself is now wallpaper. A recording
where the reader watches the command succeed **and sees the secret is not in the transcript** turns
an assertion into an observation.

Eight seconds: Claude Code issues `creds_exec` → the VS Code approval prompt showing the real entry
and the real command → the command's output in the agent transcript → the secret visibly absent.

This is the same ask as [ЗАДАЧА_скриншоты_для_маркетплейса.md](../todo/ЗАДАЧА_скриншоты_для_маркетплейса.md),
which already carries the fabricated-data rules and three traps: the Marketplace does not render
relative image paths, `media/docs/**` must reach `.vscodeignore` before it bloats the `.vsix`, and
the tables wrap badly at Marketplace width. **This plan ships without images** — the README must read
well with the slot empty, because a README waiting on a photo shoot is a README that never lands.

## Build order

1. The verification pass above is done; it is the input, not a step.
2. `README.md` rewritten to the structure above, every caveat carried across, every stale number
   fixed.
3. `src_vs_code/README.md` — the three corrections, no restructure.
4. `package.json` `description` and `keywords`.
5. Hand the owner the About line and the topic list; they apply them.
6. `research/module_extension.md` — a line recording that the front door now leads with the broker,
   and why the protocol claim is the one that is defensible.

## Test plan — as it SHIPPED

Ten assertions in `src_vs_code/src/test/readmeClaims.test.ts`, listed here as written rather than as
planned. A reviewer was right that the two disagreed; what follows is the file.

| what | test |
|---|---|
| the suite reads the right documents | both READMEs, `install.sh` and `brokerProtocol.ts` must exist and the two READMEs must not resolve to one file, naming the resolved root when they do not |
| no false claim ships | seven banned patterns in BOTH READMEs: `master[- ]password`, `tenant isolation`, `stamped by the (verified )?identity provider`, `eliminat\w* spoofing`, `seven kinds of entry`, `six switches`, `completely standalone offline` |
| the numbers stay true | reads `ENTITY_KINDS.length` and `MCP_SWITCHES.length` and asserts the README's words, plus that the switch table lists at least as many rows as there are switches |
| `install.sh` stays readable | the file is under 200 lines, and the README does **not** state an exact line count — the planned line-count assertion was replaced, because pinning it in prose makes an unrelated comment a failing build |
| every caveat survives | six required caveats by pattern: the Linux Secret Service fallback, trust-on-first-use, the masker failing open, agents in containers, the sign-in on first run, rotation's db/ssh scope |
| the promise detector works | fed the exact sentence that was live on the listing, plus a negative: "screenshot pipelines" is a mention, not a promise |
| pictures promised are pictures present | no README promises one with no image referenced, and every image reference is https, is a badge or an image file, and exists on disk when it is local |
| links resolve | every non-protocol, non-anchor link in `README.md` resolves, with query strings stripped |
| both surfaces | no mermaid fence and no `> [!` alert in either README |
| the guarantee holds structurally | every exported `*Response*` shape in `brokerProtocol.ts`, `interface` or `type`, is refused a secret-shaped field |
| the storefront card | the manifest's description leads with the differentiator, stays under 220 characters, and the keywords carry `mcp` and `model context protocol` |

The point is the second and third rows: this document's thesis is that a marketing claim rots faster
than the code under it, so the claims that can be checked mechanically should be.

## Definition of Done

- [x] `npm test` green in `src_vs_code` — 3,302 tests, 3,298 passing, 4 skipped, 0 failing.
- [x] Every claim in the "FALSE" list is absent from both READMEs, and asserted absent.
- [x] Every caveat present before the rewrite is still present, and asserted present.
- [x] The screenshot promise is removed, and cannot be re-broken without an image.
- [x] `research/module_extension.md` updated per the Knowledge Base DoD.
- [x] The `coai` gate: plan round `good_enough` (14 findings, 9 accepted), code round **`proceed`**
      (22 findings, 16 accepted, 6 rejected with measurements).
- [x] The About line and topic list are handed over in the pull request; applying them is the
      owner's step, and the repository already carries a description and ten topics, so it is *add
      these eight*.
