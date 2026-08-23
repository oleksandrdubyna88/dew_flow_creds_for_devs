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
| [SECURITY_REVIEW_2026-08-23.md](SECURITY_REVIEW_2026-08-23.md) | 2026-08-23 — security, reliability and architecture. Five high findings fixed with a red-first test each; the rest are plans |

## Implemented plans

Newest first.

| Plan | Landed | What it delivered |
|---|---|---|
| [PLAN_monorepo_consolidation.md](PLAN_monorepo_consolidation.md) | 2026-08-23 | Both products into one conventions-compliant repository: the submodule mount and .NET baseline, the move (134 MB → 614 KB), the server's test suite converted to in-process xUnit v3, CI for both halves separately, MIT licensing and Marketplace preparation, the one-command Docker stack with four TLS modes, and the review above. Three defects surfaced only by verifying rather than reasoning — a Linux-only first-boot crash from a root-owned bind mount, `nginx:alpine` having no `openssl`, and nginx's stock `default.conf` shadowing the API |
| [PLAN_sharing.md](PLAN_sharing.md) | 2026-08-21 (v0.13.0) | Sharing one sealed entity with a colleague. Deviated from the plan: shares live as a plaintext array inside the recipient's envelope rather than one file per share. Its open residual — an unauthenticated sender label on the folder transport — is finding 7 of the security review |
| [PLAN_audit_followups.md](PLAN_audit_followups.md) | 2026-08-21 (v0.19.0–v0.22.0) | The six follow-ups from the 2026-08-21 audit that each needed a decision or a data migration: KDF parameter versioning, causal version-vector merge, the envelope MAC, PIN re-key, remote vault deletion on account removal, and notes moved into SecretStorage. Handed the server-side operational items to `../todo/PLAN_server_ops.md` |

## Conventions

The family-wide rules are a submodule at `.claude/rules/shared`. Repository-specific rules are in
[../CLAUDE.md](../CLAUDE.md). The `research/` + `todo/` split, and the promotion procedure that moves
a plan between them, are defined in `.claude/rules/shared/common/planning-docs.md` and enforced in CI
by `plan-lifecycle.mjs`.
