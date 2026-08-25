# todo/

Plans for work that is **not finished**. Documentation of the system as it *is* belongs in
[`../research/`](../research/).

The test is one question: **is someone still supposed to build this?** If yes it lives here; once it
ships, the plan moves to `research/` with its status changed to `IMPLEMENTED <date>` and its
deviations recorded.

Every plan starts with a status line on line 2–3 and carries: the symptom or goal before any
solution, references to real code as `file.ts:line` / `file.cs:line` (verified, not guessed), a build
order, a test plan, and a Definition of Done.

## Currently open

| plan | status | scope |
|---|---|---|
| [PLAN_audit_roadmap_2026_08_25.md](PLAN_audit_roadmap_2026_08_25.md) | **blocks B and C shipped 2026-08-25** (B + B8 in 0.57.0; C1–C4 in 0.57.0, C5 in 0.57.1); the one HIGH finding shipped separately as 0.56.1; A, D, E and B10 remain | Roadmap from the four 2026-08-25 audits (architecture, security/sync/broker, UX, market comparison), written in Russian at the owner's request: split the 3,078-line `extension.ts`, ESLint, tests for the 19 untested `vscode`-bound modules, the readiness-cache and View-Details defects, tree/filter performance, the `EntityMetadata` union + AAD format touch, and the ranked feature gaps (SSH agent, TOTP, secret references, import, generator, hygiene reports, jump hosts, MCP broker). Five owner decisions listed at the end |
| [PLAN_ephemeral_secrets.md](PLAN_ephemeral_secrets.md) | plan only | TTL / one-use / expire-on-close secrets that really delete themselves. The hard half already exists: `deleteNodeRecursive` writes a causal tombstone and wipes all eight SecretStorage keys **including revision history**, so an expiry routed through it propagates like a human delete. Owner decision: burn fires **only** through the Exec Broker. **Subsumes roadmap D10** (expiry dates + reminders) |
| [PLAN_headless_cli.md](PLAN_headless_cli.md) | plan only | `creds ssh prod-db` from any terminal. ~75% exists (`agentCli.ts` already talks to the broker headlessly). Owner decisions: a standalone **.NET Native AOT** binary — same toolchain as the server, same four RIDs (win-x64/arm64, linux-x64/arm64), auto-built in GitHub Actions on a `cli-v*` tag, reusing the server's existing release matrix. The wire contract becomes a generated JSON spec with a test on both sides. Also carries a **live bug**: `env`/`vpn-up`/`vpn-down` report success as exit 95 |
| [PLAN_ai_context_masking.md](PLAN_ai_context_masking.md) | plan only | Mask vault secrets in Exec Broker output before it reaches an AI's context — one interception point (`credsAgentServer.respond`) covers every action. The clipboard half of the original idea is **deliberately rejected** as undeliverable (VS Code has no clipboard event; Windows Clipboard History captures at copy time) and replaced with on-demand scans |
| [PLAN_remote_broker_bridge.md](PLAN_remote_broker_bridge.md) | plan only | Broker reachable from **WSL (primary)** and **Remote-SSH** — both must work; Dev Container deprioritized by the owner. The .NET AOT CLI decision changes the WSL mechanism for the better: because both halves of the bridge are ours, the Linux `creds` re-executes `creds.exe` through WSL interop — no mirrored networking, no firewall rule, no `npiperelay`+`socat`, zero user configuration. Remote-SSH reuses the extension's own `ssh` argv builder and stored credential for an `ssh -R` socket forward. Phase 1 (pipe/socket listener) pays for itself locally; phase 4 (ssh-agent) waits on the frozen D1 |
| [PLAN_git_sync_transport.md](PLAN_git_sync_transport.md) | plan only | A third `VaultTransport` over a private git repo. The merge engine is fully transport-agnostic, so it reuses `syncManager`/`syncMerge`/`versionVector` unchanged; net-new is the system `git` dependency, commit-vs-overwrite semantics, history retention and a location-keyed credential. Owner chose the **full** version with commit history, cost accepted |
| [PLAN_broker_itest_defects.md](PLAN_broker_itest_defects.md) | plan only — **two confirmed defects in released builds** | A denied grant answers 401/unknown instead of 403/denied once any later grant is minted (`prune()` evicts denied grants); and two concurrent execs share one materialized key path, so the first to finish deletes it under the second — a regression `research/PLAN_agent_ssh_broker.md` records as already fixed once. Both reproduce at `ecb49f4` and at HEAD. Root cause of their invisibility: `agent-broker-itest.cjs` runs in neither CI nor `npm test` |
| [PLAN_server_ops.md](PLAN_server_ops.md) | **item 1 shipped 2026-08-23**; 2–5 remain and 6–8 were added | Operational hardening of the server. Restart policy, log rotation and backups shipped with the Docker stack. What remains: the atomic-rename filesystem requirement, inbox TTL, optimistic concurrency on `PUT /api/vault`, a metrics surface, the per-call health probe write, contract versioning between the two halves, the restore rehearsal is **done** (2026-08-23, re-checked 2026-08-25) |
| [PLAN_extension_security_tail.md](PLAN_extension_security_tail.md) | **item 4 shipped**; 1, 2, 3 and 5 remain | The medium/low findings from the 2026-08-23 review that each need a migration or a product decision: the WebAuthn RP ID scoped to bare `localhost` (and the re-registration migration that fixing it forces), a length-only PIN policy, and a comment that claims a POSIX guarantee Windows does not make. Idle auto-lock shipped — the status line had lagged it |
| [PLAN_logging_convention.md](PLAN_logging_convention.md) | plan only | Serilog with a file per run shipped; the family's `AnsiConsoleSink` did not, and the deviation is recorded in `Logging.cs`. Port that sink, add a retention sweep for run files, and register this repository in the shared logging rule's mirror list |
| [PLAN_marketplace_listing.md](PLAN_marketplace_listing.md) | **the text is done 2026-08-24; the screenshots are not** | The README now opens with a table of everything the extension does, and the drift it was hiding is fixed — seven shipped features had never reached the listing at all. What remains is what the plan always said mattered most: four screenshots and a GIF, with fabricated data, plus a clean-profile walk-through. Neither can be produced without a person driving the UI |

## Promoted

Implemented plans live in [`../research/`](../research/), newest first.

| plan | landed | what it delivered |
|---|---|---|
| [PLAN_v1_vault_migration.md](../research/PLAN_v1_vault_migration.md) | 2026-08-25 | Retired the v1 vault envelope: every vault is now v3 (wrapped/HKDF, scrypt once at unlock), PIN-only included. A legacy v1 vault migrates on its next sync (same PIN, data preserved); a new PIN-only vault is v3 from the first write. Closes the deferred tail of the 2026-08-25 review's finding 4 |
| [PLAN_nas_sender_pki.md](../research/PLAN_nas_sender_pki.md) | 2026-08-25 | Ed25519 signatures on folder shares with trust-on-first-use pinning and a fingerprint to read aloud — forgery-resistant, deliberately not described as forgery-proof. Teams should still use the server, where the sender is stamped from a verified sign-in |
| [PLAN_agent_ssh_broker.md](../research/PLAN_agent_ssh_broker.md) | 2026-08-24 | *Share with Claude Code…* — an AI agent can run commands on an SSH host and open its terminal without ever receiving the password or key: the window that holds the credential runs `ssh` on the agent's behalf, gated by a first-use consent modal and written down in an audit channel |
| [PLAN_monorepo_consolidation.md](../research/PLAN_monorepo_consolidation.md) | 2026-08-23 | Both products into one conventions-compliant repository, with CI, MIT licensing, Marketplace preparation, a one-command Docker deployment, and a security/reliability review whose five high-severity fixes each carry a test watched failing first |
| [PLAN_sharing.md](../research/PLAN_sharing.md) | 2026-08-21 | Sharing one sealed entity with a colleague |
| [PLAN_audit_followups.md](../research/PLAN_audit_followups.md) | 2026-08-21 | KDF versioning, causal merge, envelope MAC, PIN re-key, remote vault deletion, notes into SecretStorage |

## A note on what belongs here

`todo/` holds plans meant to be executed. It is not a scratchpad: session notes, transient checklists
and "look at this later" reminders do not go here, because a folder that collects those stops being
readable as a list of commitments.
