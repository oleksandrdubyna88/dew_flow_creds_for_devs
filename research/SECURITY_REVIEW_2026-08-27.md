# Security, leak & performance review — 2026-08-27, the MCP surface

> Scope: everything built for [PLAN_mcp_server.md](PLAN_mcp_server.md) between 0.65.0 and 0.75.0 —
> the five permission rungs, three route prefixes, eight tools, the `creds-mcp` binary, the journal
> and both install buttons. Reviewed immediately after the feature landed, by hunting rather than
> by reading: every finding below was reproduced before it was fixed.
>
> Six findings, one of them HIGH. All fixed, each red-first. Verified on Windows: 2132 extension
> tests (2128 pass + 4 POSIX-only skips), 21 MCP, 24 broker-library, 73 CLI, and 64 integration
> checks against the real AOT binary. `tsc` and lint clean.
>
> Predecessor: [SECURITY_REVIEW_2026-08-26.md](SECURITY_REVIEW_2026-08-26.md). None of its fixed
> items were re-opened.

## The short version

**The HIGH one is a renamed field.** The whole rotation design rests on a value the agent never
sees, and its own doc comment names the last hole and claims the masker closes it: the far side's
own output, because a statement can be composed to print what it was given. The masker did not
close it, because it masked two fields by name — `stdout` and `stderr` — and the rotation answered
in a third it called `output`. A `SELECT '{{creds:new}}'` appended to an `ALTER USER` returned the
freshly generated password to the agent in plaintext.

Nothing about that was subtle, and it survived a feature, a test suite and an integration test.
The integration test's stub answered `"ALTER ok"` — so the assertion *"the new secret is not in
what the agent received"* passed by proving nothing had echoed, not by proving the masker worked.

**Two of the six are the same shape as findings in the previous two reviews**: a protective
measure that exists in this codebase and is applied at some of the sites that need it. The masker's
field list is one. The install checksum is the other — `install.sh` has refused a mismatch since it
was written, and the button inside the extension, downloading the same binary from the same release
for the same person, verified nothing.

**Two came from measuring rather than reading.** Neither is a vulnerability; both are the kind of
cost that is invisible until somebody has a large vault or a busy agent.

## Fixed

| # | Sev | Finding | Fix |
|---|-----|---------|-----|
| 1 | **HIGH** | `maskResponseBody` masked `stdout` and `stderr` by name. `rotate` answered with the far side's output in a field called `output`, so a statement that echoed its own argument returned the newly generated secret to the agent unmasked — the one hole the rotation's design claims is closed. | Every string field is masked now, not a list of two; and the field has its honest name, `stdout`. The integration test's stub **echoes the statement**, so the assertion has teeth. |
| 2 | MEDIUM | `creds_create` picked the **first** folder whose name matched. Folder names carry no uniqueness rule anywhere in this product — `secretRef.ts` refuses an ambiguous reference for exactly this reason — so two accounts each with a "Servers" folder open to creation would file a production credential in whichever the scan reached first, until the day it chose the other. | Refused, naming the collision. |
| 3 | MEDIUM | Building the agent-visible list costs **five keychain reads per visible entry**; measured at **1000 reads** for a vault with 200 entries opened. That route raises no prompt and is therefore not throttled, so an agent's ordinary work waited most of a second per list and a local process could hold the extension host thread down by asking in a loop. | An event-invalidated cache (`mcpEntriesCache.ts`), forgotten by `mutated()` — the moment the answer stops being true. |
| 4 | MEDIUM | The extension's **Install…** button verified nothing, while `install.sh` refuses a checksum mismatch. Two ways to install the same binary, one of which trusted whatever arrived. The `mcp-v*` release also published no `.sha256` at all. | The button verifies and refuses a mismatch; a release with no checksum warns out loud rather than skipping silently. The MCP release job publishes one. |
| 5 | LOW | The journal was unbounded. A fortnight of a busy agent measured at **42,000 rows and 10.2 MB of HTML** in one string, with an in-page filter walking every row on each of five buttons. | Capped at 2000, newest first — 0.49 MB, 6 ms — and the page says how many older calls are still on disk. |
| 6 | LOW | An entry name from an agent had no length bound; the 64 KB body cap was the only limit, so a name could be sixty thousand characters — a consent prompt whose buttons are off the screen. | 200 characters, refused above it. |

### A second defect the cache's own test found

Writing #3's test turned up one that was not in the plan for it. `forget()` cleared the held value
and the in-flight promise — but a rebuild that had already started still assigned its result when
it finished, so a build begun *before* a write was stored as current *after* it. That is the one
way a cache invalidated by an event can still serve something that was never true. An era counter
fixes it: a build whose era has passed hands its answer to the caller that asked and stores
nothing.

The test was written for the property before the property existed, which is why it was found.

## What held

A deliberate sweep of the rest of the new surface turned up nothing:

- **The ladder.** Every rung is checked per action, not per call; `rotate` asks for `edit` and the
  use verbs for `use`, so a rotation cannot ride in on a permission granted for a read-only query.
  An action the table does not know asks for the **top** rung, so a verb added to the broker and
  forgotten there fails closed.
- **The delete scope is not a boolean.** "What they created themselves" depends on the entry as
  well as the switch, and the mark it keys on is set by the only path that can create one.
- **Three prefixes, three authorization stories**, and a test that no path parses as two of them.
- **Consent is never skipped.** Every route that performs anything mints a fresh grant, so the
  consent registry's memory of an earlier answer can never apply. An entry whose switch is off is
  refused *before* the prompt, which is what stops a person being trained to click Allow.
- **The throttle is shared** by every route that can make the window ask a human, which is the
  correct budget: it is a limit on prompts, not on callers.
- **No response shape carries a secret by construction.** The read route names every field it
  discloses one at a time; a test searches the whole serialized answer for each of five stored
  secrets; and a second test asserts that a field added to a stored record does not reach the wire
  on its own.
- **Grants do not accumulate.** `mint` prunes, and there is a cap behind that.
- **Every webview** — the folder form, the journal — carries a nonce CSP and no local resource
  roots, and every interpolated value goes through `escapeHtml`. A folder name of
  `</script><img src=x onerror=…>` is asserted inert in both.
- **The C# side** parses only through source-generated contexts, treats an unreadable answer from
  one window as an answer rather than as absence, and falls through to the next window only on
  `not_found` — read from the error code, because `not_supported` shares its HTTP status.
- **No `console.*` reaches production**, and the stdio server writes diagnostics to stderr, which
  the integration test asserts by checking nothing but JSON-RPC appears on stdout.

## What is still open, and deliberately

**The read route carries no token.** Any local process running as this user can read the
non-secret half of what was opened to agents. That is the design and it is argued in
`isMcpEntriesRoute`: the disclosure is not "what this vault holds" but "what its owner chose to
show an agent", a set assembled deliberately and emptied in one gesture. A token would have to be
minted, stored where the MCP client can read it, and rotated when a window restarts — and would
not help against the threat it leaves open, which is a hostile process already running as this
user.

**`creds_create` with a supplied secret is the one path where a value moves toward the vault.**
It cannot be otherwise: the agent provisioned the thing and is the only party holding the key. The
product's answer is to count them by name in the journal rather than to pretend the path does not
exist — and to make the alternative easier, which is what `secretKind` is for.

**The generators stop somewhere**, and the journal now counts where. A run of *could not generate*
followed by *secrets from the agent* is the leak this product exists to avoid, and it is visible
before it happens rather than after.
