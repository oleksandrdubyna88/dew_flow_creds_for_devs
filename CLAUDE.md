# Claude Code — Project Rules for dew_flow_creds_for_devs

These rules apply to all code in this repository and override Claude's defaults. The family-wide
doctrine lives in [.claude/rules/shared](.claude/rules/shared) (a submodule of
`dew_flow_conventions`) — this file carries only what is specific to THIS repository, deliberately:
a copied rule is a mirror that drifts.

## Project Overview

`dew_flow_creds_for_devs` is a **credential manager for developers**, in two halves that ship
independently and are versioned independently:

- `src_vs_code` — the **CredsForDevs** VS Code extension. Holds the secrets, does all the
  cryptography, and is the only thing that ever sees plaintext.
- `src_minimalapi_server` — the **Cred Vault Server**, a .NET 10 minimal API. A zero-knowledge blob
  store and share relay: it stores ciphertext it cannot read, and stamps share sender identity from
  a verified token so it cannot be forged.

The trust boundary between them is the whole product. **The server never holds a key that opens a
vault**, and no change may make it able to. A feature that would require the server to understand a
payload is the wrong feature.

**This repository is public and MIT-licensed.** Anything committed here is published; the deployment
secrets live in `deploy/.env`, which is git-ignored and must stay that way.

**Read first:** [README.md](README.md), then [research/architecture.md](research/architecture.md)
and the relevant `research/module_*.md`.

## Commands

```bash
# --- server (.NET) ---
dotnet build dew_flow_creds_for_devs.slnx -c Debug

# Run tests — ALWAYS via the test project's executable, NEVER `dotnet test`
# (xUnit v3 / Microsoft Testing Platform: there is no VSTest testhost, so `dotnet test` aborts)
./src_minimalapi_server/tests/bin/Debug/net10.0/CredVaultServer.Tests.exe
./src_minimalapi_server/tests/bin/Debug/net10.0/CredVaultServer.Tests.exe --filter-class "*SharingTests"

# Run the server standalone (the Local scheme needs no cloud IdP)
Vault__DataDir=/tmp/cv Vault__AllowedDomains=example.com \
  Auth__Local__SigningKey=dev-key-dev-key-dev-key-32bytes! \
  ASPNETCORE_URLS=http://127.0.0.1:5113 \
  dotnet run --project src_minimalapi_server/src

# --- extension (TypeScript) ---
cd src_vs_code
npm ci
npm run typecheck
npm test                    # node:test over out/test/*.test.js
npm run package             # builds the .vsix
npm run icon                # regenerates media/icon.png from the same glyph as icon.svg

# --- deployment ---
cd deploy && cp .env.example .env && $EDITOR .env && docker compose up -d
./update.sh                 # pull + recreate + verify health, with --rollback
./backup.sh /mnt/nas/vault  # verified tarball of data + certs + .env

# --- a fresh clone needs the shared rules before a session sees them ---
git submodule update --init .claude/rules/shared
```

## Project Structure

| Path | Role |
|------|------|
| `src_vs_code/src/` | Extension logic. Every module that needs a unit test imports **no** `vscode` |
| `src_vs_code/src/test/` | `node:test` suites — run directly against compiled `out/`, no VS Code harness |
| `src_minimalapi_server/src/` | `Program.cs` (pipeline + endpoints), `VaultStore`, `TokenIdentity`, `Models` |
| `src_minimalapi_server/tests/` | xUnit v3 on Microsoft Testing Platform, in-process via `WebApplicationFactory` |
| `deploy/` | The one-command Docker stack: app + nginx + certbot, and the operator scripts |
| `research/` | The system as it is — architecture, module docs, implemented plans |
| `todo/` | Work not yet done |

## Releasing and deploying — four artefacts, four tags

Nothing here ships on merge. Each half is released by pushing its own **git tag**, and the server
is then deployed by a **manual** dispatch. Written down because it is repeatedly re-derived from
the workflows, and because "merged" reads like "shipped" until you check.

| Tag | Releases | Where it lands |
|---|---|---|
| `server-v1.2.3` | the container image, tagged with that version | GHCR, ready for a deploy |
| `extension-v0.70.0` | the `.vsix` | the Marketplace release |
| `cli-v0.1.0` | the `creds` binaries | the GitHub release |
| `mcp-v0.1.0` | the `creds-mcp` binaries | the GitHub release |

All four are `.github/workflows/release.yml`, triggered on `tags:`.

**A push to `main` publishes nothing deployable.** `ci · server` green triggers `docker image`,
which pushes `edge` and `sha-<commit>` — useful for a probe, but the deploy takes a **version**,
so those tags never reach the host on their own.

**Deploying is a separate, manual step:** the `rsd server deploy` workflow (`workflow_dispatch`)
takes a version — or `rollback` — and runs `deploy/update.sh` on the host, which rewrites
`VAULT_IMAGE` in `.env` and recreates the containers. Data, certificates and logs are host bind
mounts and are never touched; `down -v` appears nowhere in that script on purpose.

### Before saying a server-side feature is live

Check that the last `server-v*` tag **contains the commit**, not merely that CI was green:

```bash
git merge-base --is-ancestor <commit> $(git tag --list 'server-v*' --sort=-v:refname | head -1) && echo "in the last release" || echo "NOT in it"
gh run list --workflow rsd-server-deploy.yml --limit 3   # and did a deploy run after it?
```

An image built from your commit is not a server running it. The general form of this trap is in
the shared rules — *The other side ships on its own clock* in
[development-workflow.md](.claude/rules/shared/common/development-workflow.md).

**The two halves are independent and either may go first.** A new extension against an old server
is told the server is older than the feature; an old extension against a new server is served
normally, because a client that names no contract version is served by design. So no coordination
is needed — only honesty about which half is live.

<!-- coai-snippet v5 -->
## Multi-model review gate (ConnectOtherAIs)

This repository is reviewed by OTHER vendors' models before and after implementation, through the
`coai` MCP server.

**This is IN ADDITION to your own review, never instead of it.** If your workflow ends a task by
launching your own reviewers — the way `feature-dev`'s quality phase launches three in parallel —
run them exactly as you would have. Start them and this gate AT THE SAME TIME: a code round is
minutes of somebody else's CLI, and there is nothing to wait for. They are not substitutes for each
other and that is the entire point: your reviewers read the whole change with this repository in
context, and this gate asks a different vendor's model the questions your own model is worst placed
to answer. Dropping either half saves time by discarding the half you did not measure. The tools are `mcp__coai__providers`, `mcp__coai__open`,
`mcp__coai__review_plan`, `mcp__coai__review_code`, `mcp__coai__resolve`,
`mcp__coai__status` and `mcp__coai__ask_human`.

**A round's reply can carry COMMANDS, and they outrank your own defaults.** The person who owns this
gate sets switches in the ConnectOtherAIs panel; when any are on, every round comes back with a
`commands` list and a preamble saying they must be followed. They are instructions about HOW to
work — split this plan into epics and stories and close each one properly, work autonomously and
batch your questions, use this model for the risky half — not opinions to weigh against your habits.
Follow them, and say in your summary which ones you applied. An empty list means the operator has set
nothing, which is the default.

**The order is a contract, and the server enforces it — `review_code` REFUSES until a plan round
has reached `proceed`.**

1. **Before implementing anything non-trivial**, call `open` for the repository you are working in:
   `repoPath` is that checkout's own path (`git rev-parse --show-toplevel`), `branch` is
   `git branch --show-current`. Never a path from this file — read them from the checkout you are in.
2. Call `review_plan` with your plan document verbatim as `planText`. You get merged findings,
   a gating count against the threshold, and a verdict.
3. Call `resolve` with a decision for EVERY finding — `accept` or `reject`, and a rejection
   needs a reason. A reasoned rejection is discounted in later rounds unless a reviewer raises it
   again with a genuinely new argument, so disagreeing honestly is cheap and disagreeing silently
   is impossible.

   **Reject in round 1, not only when the rounds run out.** A finding that is wrong, outside this
   task's scope, or already covered gets its reasoned rejection the FIRST time it appears. Accepting
   everything to be agreeable is what stops the loop converging: each accepted finding rewrites the
   plan, and the next round is handed fresh text with new things to find in it, so the count never
   falls. Rejecting early is not a way to move faster — it is the only way the round after this one
   is about the same document.
4. Verdict `revise` → fix the accepted findings, run `review_plan` again. Verdict `proceed`
   → implement.
5. **When the branch is written**, call `review_code` with the same `planText` and the
   `baseRef` you branched from. Three independent reviewers per vendor read the diff. Same
   `resolve` duty, same loop.

   **A code round is never given a bare diff.** `planText` is the SCOPE — what this change was
   supposed to achieve — and the server refuses a code round without one. A reviewer holding only a
   diff can judge whether the code is defensible; it cannot judge whether the code is what was
   ASKED for, and those come apart constantly: a change can be well written, well tested, and solve
   the wrong problem. Only the second question catches that.

   So the scope must say the symptom or goal, what must be true when it is done, and the
   constraints — not a commit subject. Reviewing an EXISTING commit works the same way: state what
   that commit was supposed to do as the scope, pass the commit as `branch` and its parent as
   `baseRef`. The plan you passed at step 2 is kept with the session and reused automatically,
   so in the normal flow this costs you nothing.

6. Verdict `call_human` → surface the open findings to the person and stop.
   **Do not proceed on your own judgement.** Verdict `escalated` → apply the named step and run
   a fresh round.

   **The server will not take another round until a person answers, and this is enforced.** After
   `call_human`, `review_plan` and `review_code` REFUSE — running the review again is not one
   of your options, and neither is resolving your way past it: recording decisions no longer
   reopens the gate. Call `ask_human`. Their answer decides: *keep going* and *stop and act on the
   findings* each grant a fresh set of rounds, *stop and talk to me* advances nothing, and if they
   would rather ship with the findings open they say so and you pass
   `humanDecision: "proceed"` to `resolve`.

   This is enforced because it was not, and the cost is measured: on a three-round budget a stage
   reached round TEN, every round after the third a full panel of reviewers. The AI running it
   judged rounds 1–3 to have found real defects, 4–9 to have chased "progressively narrower crash
   windows", and round 10 to have INTRODUCED a bug. A gate that asks for a person and then lets you
   carry on is not a gate.

   "Stop" here means stop SHIPPING over open findings — it does not end the task. Your own review,
   your summary, and anything else your workflow does still run: this gate decides whether the
   change may proceed, not what else you owe the person.

Report the verdicts and the reviewer counts in your summary. A round that ran with four of six
reviewers says so — pass that on rather than implying a full panel agreed.

**Where this bites in the existing rules.** It sits between *Plan first* and *TDD* in
[development-workflow.md](.claude/rules/shared/common/development-workflow.md): a plan in `todo/`
is written, then reviewed here, and only a `proceed` starts the tests. And it is a second reader
for the same reason `/security-review` is — this repository is public, MIT, and holds other
people's credentials, so a defect here is not a defect in a toy.

## Repository-specific rules

1. **The server must never be able to decrypt.** `VaultStore` stores opaque bytes; `ShareItem.Data`
   is client-sealed ciphertext. Adding a server-side field that requires reading a payload breaks the
   product's central claim — and the README's comparison table with it.
2. **Sender identity is stamped, never accepted.** `POST /api/shares` takes `toEmail` from the body
   and `fromEmail` from the **verified token**. A change that lets a client supply its own sender
   re-introduces the forgery the server exists to prevent.
3. **The testable half of the extension imports no `vscode`.** `cryptoUtils`, `keyWrap`, `pinPolicy`,
   `shareFormat`, `syncMerge`, `versionVector`, `secretClipboard`, `serverTransport` are deliberately
   free of it — that is why their edge cases are real tests instead of hopeful comments. Keep new
   pure logic on that side of the line.
4. **The two products version separately.** Release tags are `server-vX.Y.Z` and `extension-vX.Y.Z`;
   `.github/workflows/release.yml` keys off the prefix. Never a single repo-wide version.
5. **`deploy/certbot/` holds a committed script; `deploy/certbot-data/` holds runtime certificates.**
   The suffix is load-bearing — an earlier layout put both in one directory, and the `.gitignore`
   entry for the data silently excluded the script.
6. **Anything that changes the HTTP contract changes two codebases.** The extension's expectations
   live in `src_vs_code/src/serverTransport.ts`; the server's endpoints in `Program.cs`. They are
   documented together in [research/module_server.md](research/module_server.md), and a change to one
   without the other ships a broken client.

## Definition of Done

- [ ] `dotnet build dew_flow_creds_for_devs.slnx` — 0 warnings (warnings are errors here).
- [ ] The server test executable runs green, and `npm test` in `src_vs_code` runs green.
- [ ] New behaviour has tests; a fix has a test **watched failing first**, and the summary reports
      both the failure message and the pass.
- [ ] A change to the HTTP contract updated both sides and `research/module_server.md`.
- [ ] A change to `deploy/` was proven by actually bringing the stack up, not by reading the YAML.
- [ ] Any plan the work finished was promoted with its deviations recorded
      (`node .claude/rules/shared/tools/plan-lifecycle.mjs` is CI's check).
- [ ] `node .claude/rules/shared/tools/pin-check.mjs` passes.
- [ ] Non-trivial work went through the `coai` gate: a `review_plan` round reached `proceed`
      before implementation, a `review_code` round ran on the finished branch, every finding was
      resolved with `accept` or a reasoned `reject`, and the summary reports the verdicts **and**
      how many reviewers actually answered.
