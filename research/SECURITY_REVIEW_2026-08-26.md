# Security & architecture review — 2026-08-26, the coverage pass

> Scope: the whole shipped extension, reviewed while closing audit A3 (unit tests for every
> module no test loaded). Twenty-one modules gained tests; three defects were found in the
> process, each red-first, all of a class this repository has produced repeatedly. Verified on
> Windows (1625 tests, 1621 pass + 4 POSIX-only skips) and under WSL, `tsc` and lint clean.
>
> Predecessor: [SECURITY_REVIEW_2026-08-25.md](SECURITY_REVIEW_2026-08-25.md). None of its fixed
> items were re-opened. This review is not a fresh audit of that ground; it is what looking at
> every untested module turned up.

## The short version

**Three defects, and two ways of describing what they share.** By mechanism, each is a
protective measure that exists in this codebase and is applied at some of the sites that need it
— the shape the previous review named twice. By INPUT, two of the three are the same untrusted
value (an entity id) reaching two different mechanisms, which is the more useful framing because
it names a fix that closes both.

None was found by looking for it. Each fell out of writing a test that had to describe what the
module guarantees — which is the argument for the coverage pass having been worth doing at all.

The rest held up under a deliberate sweep: process spawning is argv-array almost everywhere and
the one shell path is trust-gated; network egress is loopback, one constant endpoint, and the
address the operator configured; no `console.*` reaches production; the tooltip refuses to render
sender-controlled markdown; the broker's consent, masking, audit and one-use burn are behind a
single seam that both its entry points provably share.

## Fixed

| # | Sev | Finding | Fix | Commit |
|---|-----|---------|-----|--------|
| 1 | **HIGH** | `depPickerScript.ts` interpolated four values — folder list, entity names, colours, saved rows — into the entity form's `<script>` element with raw `JSON.stringify`. That leaves `<` untouched, and an HTML parser ends a script element at `</script>` wherever it appears, inside a string literal included. A folder or entity named `</script><img src=x onerror=…>` closed the script early and the rest of the form's own code was parsed as markup. Names arrive from a **synced** vault, a shared entry or a restored backup. | All four go through `jsonForScript`. `webauthnPrf.ts` also lost its hand-rolled copy of the same escape. A scan now fails on any new site. | `dffc889` |
| 2 | **HIGH** | Six places built a file name out of vault data — the materialised private key, the VPN config, the per-entity `known_hosts`, and a script body. An id of `x/../../../../evil` resolved clean out of `keys/<pid>/`, so connecting to a crafted entity wrote its **private key** to an arbitrary path. The prefix two of them add (`script-`, `known_hosts-`) stops the obvious `../` and nothing more: the prefixed segment is popped by the `..` that follows. | `safeFileComponent`, then `materializedKeyPath` as the only road into the directory, plus a scan. | `909eaf9`, `3e198a1` |
| 3 | **HIGH** | SecretStorage keys are concatenated — `${accountId}_${entityId}`, plus a `:sshPrivateKey` / `:vpnConfig` / … suffix per kind — so `secretKey('a1', 'x:sshPrivateKey')` and `privateKeySecretKey('a1', 'x')` are **the same string**. An entity with that id, given a password, destroys entity `x`'s stored private key; reading that key back returns the attacker's password. Nothing reports an error. | `keyPart` escapes the three separators (`%`, `:`, `_`), none of which occurs in a uuid — so every key an installed build already wrote is unchanged, asserted by test. | `c523d8d` |

### Why #2 is reachable, and why the audit did not stop at "shares are safe"

Accepting a share is **not** a way in: `shareInbox.importShared` gives every accepted entry a
fresh local id, deliberately, with a comment saying that a peer must never be able to address an
entity that already exists locally. That is correct and it is tested.

But **import and restore write an envelope's nodes with their own ids**. So a backup file someone
is talked into importing, or a sync location an attacker can write to, puts an arbitrary id into
the tree. The envelope is encrypted and MAC'd, which bounds this to an attacker who supplies the
file *and* its PIN — a social step, not a cryptographic break.

`vpnCommand.ts` had been sanitising its own name since it was written, for exactly this reason.
The other four sites had not.

## Three findings, one unvalidated input

Findings 2 and 3 are the same input reaching two different mechanisms. **An entity id is trusted
everywhere it is used**, and it is only trusted because it is normally a uuid:

| mechanism | what a crafted id did |
|---|---|
| `path.join` into `keys/<pid>/` | wrote a private key — and, at two sites, an executable script — anywhere on disk |
| SecretStorage key concatenation | destroyed another entity's private key, and served the attacker's password in its place |

Both are fixed at the point of use, which is defence in depth rather than the class fix. **The
class fix is validating the id where the envelope is opened**, and it is the first open item
below — it needs a decision about vaults that already hold odd ids, which is why it was not taken
unilaterally.

Finding 2 also shows the sub-pattern the next section is about: sanitising four sites by hand,
then finding two more only by enumerating them properly.

## The root cause the findings share

> A measure that exists in the codebase, applied at some of the sites that need it.

This is now the third, fourth and fifth instance:

| measure | applied | missing |
|---|---|---|
| `jsonForScript` (script interpolation) | `webauthnPrf` (by hand) | `entityFormScript`, then `depPickerScript` |
| path-component sanitising | `vpnCommand` | key, VPN config, `known_hosts`, script |
| `escapeHtml` (earlier) | three private copies | hardening one left two behind |
| the surface-name check (earlier) | three copies | adding a surface updated two |

Every instance was caught by a person happening to look. That is not a control, and the count says
so. `scriptInterpolation.test.ts` is the first mechanical answer: it scans every shipped source
file and fails, **naming file and line**, on any `${JSON.stringify(…)}` inside a template literal,
with a short allowlist of named exceptions that a second test fails on if it goes stale.

**The path-building equivalent is `keysDirPaths.test.ts`**, and it is narrower on purpose: a scan
for "vault data reaching `path.join`" anywhere has 49 call sites, most of them legitimate, and a
rule that cries wolf is a rule people disable. So it guards the one directory where the secrets
are — `materializedKeyPath` is the only sanctioned road in, and anything else joining into
`keys/<pid>/` fails the suite by name.

That guard is also what found two of the six sites in finding 2. It was written BEFORE the fix,
and its failure listed six when the fix in hand covered four. Without it, four of six would have
shipped as complete — which is exactly what the `jsonForScript` sweep did earlier the same day.

## Swept and found sound

- **Process spawning.** `sshExecRunner`, `sshBridgeManager`, `childKill`, `materializedKeys` and
  `helpLookup` all pass argv arrays with `shell:false`. The two shell paths are deliberate and
  gated: `maskedTerminal` runs a command line the person wrote, behind `commandTrust`; and
  `helpLookup` sets `shell:true` only on Windows (for `.cmd` shims) after `isProbeSafe` has
  rejected everything a shell could read.
- **SSH command lines.** `buildSshCommand` refuses anything `isSafeSshTarget` rejects and quotes
  the rest; `sshOptions.ts` composes the connection-manager arguments for **both** the human and
  the agent path, so the two surfaces cannot reach a host by different routes.
- **Network egress.** Loopback (`agentCli`, the WebAuthn page), two constant Google endpoints,
  HIBP behind a setting AND a modal that states what leaves, and the server the operator
  configured. Nothing else.
- **Logging.** No `console.*` in shipped code. The diagnostic log takes a source and a message and
  holds no way to reach a secret; the broker's audit records how many values were masked, never
  which.
- **Tooltips.** `buildTooltip` uses `appendText` and leaves `isTrusted` false, so a shared
  entity's name or notes cannot become a link, a command URI, or an image that phones home when
  the row is hovered.
- **The broker's seam.** `perform()` is reached by a bearer token and by a CLI alias; consent,
  masking, the audit line and the one-use burn sit behind it once. Proved by breaking it: removing
  masking reddens tests on both paths, and so does removing the consent gate.
- **The sync cycle's three refusals** — locked vault, detected tamper, unreadable local tree —
  each now has a test that goes red when the guard is removed, and the third one *writes the
  emptied vault* when it does, which is the catastrophe itself.

## Open

1. **Entity ids are still not validated on import or restore, and this is now the main item.**
   Two mechanisms have been hit by the same input; both are fixed at the point of use, which
   closes the instances and not the class. A third mechanism is unfixed by either: an id is also
   a `TreeItem.id`, so `${accountId}:${node.id}:rev${index}` is concatenated the same way and a
   crafted id can collapse two rows onto one identity in the tree. That one is cosmetic today —
   it is worth listing because it shows the pattern does not stop at the two that were expensive.
   Validating where the envelope is opened would close all of them at once. It needs a decision
   about vaults that already hold odd ids, which is why it was not taken unilaterally.
2. **No mechanical guard on vault-data-to-path in general.** `keysDirPaths.test.ts` closes the
   key directory, which is where the secrets are; a name built for somewhere else is not covered.
3. **`extension.ts` remains 3,490 lines.** Its four real decisions moved to `commandTargets.ts`
   and are tested; what is left is registration, whose manifest↔handler correspondence
   `commandsRegistered.test.ts` checks by scanning the tree. No further extraction is proposed —
   the remainder genuinely is wiring.

## Coverage, as it now stands

Every module in `src/` is loaded by some test. The two the naive scan reports as uncovered are
false positives worth recording, because the scan will report them again:

- `agentCli.ts` is spawned as a **subprocess** by its tests rather than imported — which is the
  only honest way to test a file whose whole body runs on import.
- `extension.ts` is scanned as **source text** by `commandsRegistered.test.ts` rather than loaded.

"No test imports this module" is not "no test covers this module", and the inverse trap is worse:
a test file named after a module may import something else entirely — `keyInstaller.test.ts`
imported only `keysPurge` for months.
