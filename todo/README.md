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
| [PLAN_server_ops.md](PLAN_server_ops.md) | **item 1 shipped 2026-08-23**; 2–5 remain and 6–8 were added | Operational hardening of the server. Restart policy, log rotation and backups shipped with the Docker stack. What remains: the atomic-rename filesystem requirement, inbox TTL, optimistic concurrency on `PUT /api/vault`, a metrics surface, the per-call health probe write, contract versioning between the two halves, and — the largest reliability risk in the product — **actually rehearsing a restore**, which nobody has done |
| [PLAN_extension_security_tail.md](PLAN_extension_security_tail.md) | **item 4 shipped**; 1, 2, 3 and 5 remain | The medium/low findings from the 2026-08-23 review that each need a migration or a product decision: the WebAuthn RP ID scoped to bare `localhost` (and the re-registration migration that fixing it forces), unauthenticated share metadata on the folder transport, a length-only PIN policy, and a comment that claims a POSIX guarantee Windows does not make. Idle auto-lock shipped — the status line had lagged it |
| [PLAN_logging_convention.md](PLAN_logging_convention.md) | plan only | Serilog with a file per run shipped; the family's `AnsiConsoleSink` did not, and the deviation is recorded in `Logging.cs`. Port that sink, add a retention sweep for run files, and register this repository in the shared logging rule's mirror list |
| [PLAN_marketplace_listing.md](PLAN_marketplace_listing.md) | **the text is done 2026-08-24; the screenshots are not** | The README now opens with a table of everything the extension does, and the drift it was hiding is fixed — seven shipped features had never reached the listing at all. What remains is what the plan always said mattered most: four screenshots and a GIF, with fabricated data, plus a clean-profile walk-through. Neither can be produced without a person driving the UI |
| [PLAN_nas_sender_pki.md](PLAN_nas_sender_pki.md) | plan only — **optional / backlog** | Ed25519 sender signatures and key pinning for the folder transport, so a NAS share's sender cannot be forged. Deliberately deprioritised: the server transport already solves this, and the project's position is that teams use the server |

## Promoted

Implemented plans live in [`../research/`](../research/), newest first.

| plan | landed | what it delivered |
|---|---|---|
| [PLAN_agent_ssh_broker.md](../research/PLAN_agent_ssh_broker.md) | 2026-08-24 | *Share with Claude Code…* — an AI agent can run commands on an SSH host and open its terminal without ever receiving the password or key: the window that holds the credential runs `ssh` on the agent's behalf, gated by a first-use consent modal and written down in an audit channel |
| [PLAN_monorepo_consolidation.md](../research/PLAN_monorepo_consolidation.md) | 2026-08-23 | Both products into one conventions-compliant repository, with CI, MIT licensing, Marketplace preparation, a one-command Docker deployment, and a security/reliability review whose five high-severity fixes each carry a test watched failing first |
| [PLAN_sharing.md](../research/PLAN_sharing.md) | 2026-08-21 | Sharing one sealed entity with a colleague |
| [PLAN_audit_followups.md](../research/PLAN_audit_followups.md) | 2026-08-21 | KDF versioning, causal merge, envelope MAC, PIN re-key, remote vault deletion, notes into SecretStorage |

## A note on what belongs here

`todo/` holds plans meant to be executed. It is not a scratchpad: session notes, transient checklists
and "look at this later" reminders do not go here, because a folder that collects those stops being
readable as a list of commitments.
