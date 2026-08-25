# research/

Documentation of the system **as it is** — including design records of plans that already shipped.
Work still to be done lives in [`../todo/`](../todo/).

The test for which folder a document belongs in is one question: *does this describe code that
exists today?*

> Cross-repository citations are written as **paths, not links** (`dew_flow_mcp · research/x.md:12`).
> A relative link that resolves only on one machine is worse than a citation that names its source.

## Start here

| Document | What it answers |
|---|---|
| [architecture.md](architecture.md) | How the extension and the server fit together, and the trust boundary everything follows from |
| [module_extension.md](module_extension.md) | The extension's layers, cryptography, sync algorithm and packaging |
| [module_server.md](module_server.md) | Every endpoint, its authorization rule, the storage layout — **the single statement of the HTTP contract** |
| [module_deployment.md](module_deployment.md) | The container stack, the four TLS modes, updates and backups, and why each is shaped that way |

## Reviews

| Document | Landed |
|---|---|
| [SECURITY_REVIEW_2026-08-25.md](SECURITY_REVIEW_2026-08-25.md) | 2026-08-25 — post-merge review of the agent-broker/v3/signatures/scripts/scope merge across security, performance and resilience. Ten findings confirmed in code and fixed red-first: a psql option-injection on the agent DB path, an auto-lock/sync key-wipe race and a non-atomic backup that could each brick a vault, a scrypt-storm freeze, an unvalidated server-advertised OAuth scope, a cross-window key-purge race, a one-shot broker-start failure, a MAC-tamper that healed itself (now fail-closed), an unbounded grant map, and a blocking audit write. Nothing deferred — finding 4’s deeper fix (retire the v1 vault envelope) also shipped |
| [SECURITY_REVIEW_2026-08-24.md](SECURITY_REVIEW_2026-08-24.md) | 2026-08-24 — the pre-launch review of the whole product, public server included. Three CRITICAL findings, each reproduced before it was fixed: two shell/argv injections through an entity’s `host` field, and a share size cap that could be walked around into a repeatable server OOM. Git history scanned for secrets across every commit: clean |
| [SECURITY_REVIEW_2026-08-23.md](SECURITY_REVIEW_2026-08-23.md) | 2026-08-23 — security, reliability and architecture. Five high findings fixed with a red-first test each; the rest are plans |

## Implemented plans

Newest first.

| Plan | Landed | What it delivered |
|---|---|---|
| [PLAN_v1_vault_migration.md](PLAN_v1_vault_migration.md) | 2026-08-25 | Retired the v1 vault envelope: every vault is written v3 (wrapped/HKDF, scrypt once at unlock) — a legacy PIN-only vault migrates on its next sync with the same PIN and no data loss, a new PIN-only vault is v3 from the first write, and backups convert on their next run keeping their own standalone PIN. Closes the deferred tail of the 2026-08-25 review's finding 4 |
| [PLAN_nas_sender_pki.md](PLAN_nas_sender_pki.md) | 2026-08-25 | Sender authenticity for the folder transport: Ed25519 signatures over a transcript that binds recipient, payload and the sender’s own key, pinned on first contact. Shipped with the ceiling stated rather than hidden — trust-on-first-use is weak against an attacker already in place, and only the out-of-band fingerprint closes that |
| [PLAN_agent_ssh_broker.md](PLAN_agent_ssh_broker.md) | 2026-08-24 | *Share with Claude Code…* — an AI coding agent can run commands on an SSH host and open its terminal without ever receiving the password or key: it holds a capability token, and the window that holds the credential runs `ssh` on its behalf, gated by a first-use consent modal and recorded in an audit channel. Two claims did not survive contact: `BatchMode=yes` under forced askpass (unproven, so the password branch avoids depending on it) and per-call key cleanup (a finished exec deleted the file a concurrent one was still using) |
| [PLAN_monorepo_consolidation.md](PLAN_monorepo_consolidation.md) | 2026-08-23 | Both products into one conventions-compliant repository: the submodule mount and .NET baseline, the move (134 MB → 614 KB), the server's test suite converted to in-process xUnit v3, CI for both halves separately, MIT licensing and Marketplace preparation, the one-command Docker stack with four TLS modes, and the review above. Three defects surfaced only by verifying rather than reasoning — a Linux-only first-boot crash from a root-owned bind mount, `nginx:alpine` having no `openssl`, and nginx's stock `default.conf` shadowing the API |
| [PLAN_sharing.md](PLAN_sharing.md) | 2026-08-21 (v0.13.0) | Sharing one sealed entity with a colleague. Deviated from the plan: shares live as a plaintext array inside the recipient's envelope rather than one file per share. Its open residual — an unauthenticated sender label on the folder transport — is finding 7 of the security review |
| [PLAN_audit_followups.md](PLAN_audit_followups.md) | 2026-08-21 (v0.19.0–v0.22.0) | The six follow-ups from the 2026-08-21 audit that each needed a decision or a data migration: KDF parameter versioning, causal version-vector merge, the envelope MAC, PIN re-key, remote vault deletion on account removal, and notes moved into SecretStorage. Handed the server-side operational items to `../todo/PLAN_server_ops.md` |

## Conventions

The family-wide rules are a submodule at `.claude/rules/shared`. Repository-specific rules are in
[../CLAUDE.md](../CLAUDE.md). The `research/` + `todo/` split, and the promotion procedure that moves
a plan between them, are defined in `.claude/rules/shared/common/planning-docs.md` and enforced in CI
by `plan-lifecycle.mjs`.
