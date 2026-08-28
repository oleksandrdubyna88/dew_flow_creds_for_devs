# PLAN — The health report

> Status: **IMPLEMENTED, 2026-08-25.** Scope: `src_vs_code/src/hygiene.ts` (pure) +
> `hygieneScan.ts` (the reading half) + `credSshManager.healthReport`.
>
> Related docs: [module_extension.md](module_extension.md),
> [PLAN_audit_roadmap_2026_08_25.md](PLAN_audit_roadmap_2026_08_25.md) (item **D6**).

## Symptom

Every major manager ships a "watchtower"; the developer version of it — keys in `~/.ssh`, `.env`
files in a workspace, a database password that is also the staging one — is a niche nobody occupies.

## What shipped

Four local checks, and one that is opt-in:

| Check | Severity | Why that severity |
|---|---|---|
| Reused passwords | high | Invisible by eye, and it turns one breach into several |
| Weak passwords (< 60 bits) | high / medium | 60 bits is where an offline attacker moves from years to a weekend |
| Unencrypted keys in `~/.ssh` | **medium** | This is the NORMAL state of a key on a personal machine; calling it a catastrophe teaches people to ignore the report |
| Plaintext credentials in a workspace `.env` | high | And the advice names the `creds://` reference that fixes it |
| Breach corpus (HIBP) | high | **Off by default, and asks before each run** |

## Decisions worth keeping

- **No finding, and no rendered report, ever contains the value that caused it.** It is the first
  test in the file. A health report is a document people paste into a chat window; if the value were
  in it, the report would be the leak.
- **The estimator is `pinPolicy`'s own**, exported rather than reimplemented. A second opinion about
  what "weak" means is how two halves of one product start disagreeing with each other.
- **k-anonymity, stated precisely** in the setting's own description: five hex characters of a
  SHA-1 — one bucket in 2²⁰, shared by hundreds of thousands of passwords — and the bucket is matched
  on this machine, so the service cannot know which password was asked about. "We use k-anonymity" is
  a claim a reader cannot check; this is one they can.
- **An unparseable key file produces no finding.** A false "your key has no passphrase" costs the
  reader's trust in every other line. Deliberately the opposite direction from `sshKeyParse`, which
  needs a parse failure to fall through to the real error — both tests name the difference.

## What the post-implementation review caught (2026-08-25)

The breach check ran its lookups **one at a time**, each with a 10-second timeout, inside a
progress notification that was not cancellable — so a vault of forty passwords against a slow
endpoint could hold the window for minutes with no way out but reloading it. Now six run at once
(the requests are independent, so there is nothing to order) and the notification is cancellable,
checked per item so cancelling stops the *next* request rather than waiting for the slowest one
already in flight.

## Open tail

The report is a document, not a state: nothing tracks which findings were dismissed, so it says the
same thing next time. A "known and accepted" list is the obvious next step if anyone runs it twice.
