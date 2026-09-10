# PLAN — a failed share says WHY, instead of blaming the PIN

> Status: **IMPLEMENTED, 2026-09-10.** Shipped in extension **1.5.0**. Scope: the transit-secret
> paths of the extension — `shareInbox.ts`, `shareFormat.ts`, `shareDelivery.ts`, `cryptoUtils.ts`,
> `commands/exportCommand.ts`, `commands/treeMutationCommands.ts`, plus four new pure modules and
> their tests.
>
> Related docs: [module_extension.md](module_extension.md) §*A failed share says which of three
> things went wrong*, [architecture.md](architecture.md).

## What shipped differently from this plan

The plan reached the `coai` gate with a `good_enough` verdict, 16 findings from three reviewers,
15 of which were accepted. Four of them changed the design before a line was written, and they are
the part of this record worth reading:

1. **The fingerprint is reported out of the derivation that already ran, not re-derived.** The plan
   proposed `derivedKeyFingerprint(blob, passphrase)`, a separate function that runs `scrypt` again.
   Two reviewers independently costed it: one extra ~250 ms derivation per item per recipient on the
   send path, and one per item per PIN on a batch accept — so a wrong PIN against a large inbox
   would have doubled a freeze the user already feels. `sealBlob` and `openBlob` take an optional
   report callback instead and hand over the key they hold. On the open path it fires BEFORE the tag
   is checked, which is the only ordering that reports the value when the open is about to throw.
2. **Unusual characters are named from a fixed table, never printed as arbitrary code points.** The
   plan said "every code point outside printable ASCII with its index". A secret written entirely in
   a non-Latin script would have been spelled out in the log, character by character — the exact
   promise the module exists to keep. Named substitutions come from a nineteen-entry table and are
   printed only while the value also holds printable ASCII; everything else is counted. Writing the
   test for that found a second defect in the first implementation: a value made ENTIRELY of named
   characters named nothing, counted nothing, and reported `unusual=none`.
3. **A non-secret blob fingerprint was added, which the plan did not have at all.** It does two jobs
   the plan needed and had no answer for: it PAIRS the two machines' lines (the server mints its own
   share id, so nothing else is the same on both ends), and it separates *the bytes changed in
   transit* from *the secret is wrong* — which the plan's own three-step reasoning wrongly collapsed
   onto the label.
4. **The logger is a REQUIRED dependency, not an optional one.** Two reviewers made the same point
   from different directions: an optional logger is a promise of diagnostics that some construction
   path quietly does not keep, which is the failure being fixed.

Two further accepted findings changed the batch path: `resolveShares` gained an `onFailedAttempt`
callback so each item that never opened is reported with its own `BackupError.kind`, and every
caller-supplied field goes through `logSafe` so a newline in an entity name cannot forge a second
log line.

**One finding was rejected**: adding a timeout guard and exponential-backoff retry around the log
write. `diagnosticLog.ts` refuses exactly that in its own header — every write there is a guarded,
synchronous best-effort append on the same turn as the failure, so there is no pending flush to
lose, and a retry loop would introduce the "diagnostics take the product down" failure the module
was built to exclude.

**One unplanned change**: `senderVerdictDetail` moved out of `shareInbox.senderCheck` into
`senderPinning.ts`. `shareInbox.ts` was 18 lines under the 800-line ceiling and the wiring did not
fit; the sentences a blocking signature verdict shows are pure, belong beside the verdict, and were
untestable inside a `vscode` method. Nothing about the wording changed in the move.

## What the CODE round then changed

The code round came back `revise` with 34 findings from twelve reviewers, 24 gating. Four were real
defects in the first implementation and every one of them was found by more than one reviewer:

1. **A batch accept wrote a failure line for every item the CURRENT PIN did not open.** A
   round-robin routinely opens those with the next PIN — so a share sealed under a second sender's
   PIN got a permanent `ACCEPT FAILED` line, carrying the FIRST sender's PIN shape and key
   fingerprint, moments before it imported correctly. `acceptMany` now accumulates one attempt per
   item across the whole conversation and writes once at the end, and an item nobody ever tried is
   not written at all.
2. **`share SENT` was written whether the delivery landed or not.** `deliverToRecipient` returns its
   sealed diagnostics on the failure path deliberately, and the caller wrote them unconditionally —
   claiming a pairing for items the server accepted none of. The write moved INTO
   `deliverToRecipient`, past the append, where `ok` is not a caller's decision to get wrong.
3. **The import command's file read sat outside its `try`.** A file deleted, locked or on a share
   that dropped between the picker and the read produced no diagnostic and no message at all — the
   command rejected into VS Code's generic "running the contributed command failed".
4. **`ShareDiagnostic` carried the plaintext PIN across module boundaries.** It is a shape now,
   reduced at the capture site, so the type cannot carry a secret even by accident.

Three smaller ones were taken: `logSafe` escapes the field separator as well as control characters
(a name containing `·` could otherwise forge a `blob=` field ahead of the real one), both lines
carry `entity=` so a pair can be found by eye, and the import failure handler reuses the envelope it
already parsed instead of parsing a multi-megabyte export a second time inside a failure path.

The round also asked for the integration test this change was missing: the export half was driven
end to end and the IMPORT half only through its line format. `importExternalDiagnostics.test.ts`
drives the real command, and writing it found a trap of its own — a hand-rolled `Module._load`
patch reused the module the previous case had bound to ITS stub, so the second case read the first
case's file while logging into its own host and passed while proving nothing.

A second code round brought it to `good_enough` with 10 findings, of which four were taken and six
described code the first round's fixes had already changed. The two that mattered:

- **A terminal failure was relabelled by a later wrong PIN.** The batch map kept the LAST attempt,
  so an item that failed as `unsupported-version` or `corrupted` was reported as a wrong password as
  soon as the person tried another PIN — losing exactly the distinction this change exists to make.
  `rememberAttempt` now replaces only a `wrong-password`, the one kind a later PIN can change.
- **`blob=` did not cover the KDF parameters**, which `openBlob` derives with. A change touching only
  that metadata would have left `blob=` equal while `key=` differed, sending the reader towards the
  secret for a change in the blob.

Two smaller ones: `ShareAttempt` carries a shape rather than the PIN (the map is held for the whole
conversation, which is a long time for a plaintext secret to sit in a model), and a file path where
no password was ever asked for says `password not-asked` instead of describing an empty one.

**Deliberately still not done**, unchanged from the plan: trimming or normalising the transit secret
(it changes the derived key, so it must be symmetric across two independently released halves and
would strand shares already sitting in an inbox), changing the drawn passphrase's separator, and
gating the project share form on `SHARE_PROJECT_CONTRACT` — the last is a real defect found while
diagnosing this and it needs its own plan and its own test.

## The symptom, as reported

Two people on extension **1.4.0**, one on **Windows** (sender), one on **macOS** (recipient).

- macOS → Windows: share over the vault server, accepted with its PIN. **Works.**
- Windows → macOS, over the vault server: the share arrives (it is visible in *Shared with me*, the
  counter reads 1) and the PIN is refused.
- Windows → macOS, as a password-protected export file: `Import failed: Decryption failed: wrong
  master PIN/password or the data was modified.`
- Windows → Windows, both directions, twice, with a third person: **works.**

Both failing channels report a wrong secret. Nobody can tell whether the secret is actually wrong,
because every path that could say so throws the same sentence away:

- `openWithKey` raises `BackupError('wrong-password', 'Decryption failed: wrong master PIN/password
  or the data was modified.')` — `src_vs_code/src/cryptoUtils.ts:253`.
- `acceptOne` replaces it with `"X" does not decrypt with that PIN — or its label was edited after it
  was sealed.` — `src_vs_code/src/shareInbox.ts:435`.
- `acceptMany` swallows it entirely inside `resolveShares`' per-PIN `try/catch`
  (`src_vs_code/src/shareFormat.ts:436-444`) and reports `That PIN did not open any of the items.`
  (`src_vs_code/src/shareInbox.ts:531`).
- `importExternal` prefixes it and shows it — `src_vs_code/src/commands/treeMutationCommands.ts:522`.

**And none of them writes a single line to the diagnostic channel.** `shareInbox.ts` has no
`DiagnosticLog` and no way to obtain one, so a bug report about a failed share arrives with a
screenshot of a toast and nothing else. That — not the wording of the toast — is why this is
unresolvable today.

## The goal

After this change, a failed share or a failed external import leaves, on **both** machines, one line
in `CredsForDevs: Show Diagnostics` that is enough to decide between the only two things that can be
wrong. Nothing in that line is a secret.

The two candidate causes, and what separates them:

1. **The secret does not arrive byte-identical.** The drawn PIN is six BIP39-English words joined by
   `-` (`src_vs_code/src/secretGenerator.ts:254-259`, `sharePin.ts:38`). Nothing trims or normalises
   it at either end — the sender resolves the raw field value (`transitPinPrompt.ts:320`),
   `validatePin` accepts surrounding whitespace (`pinPolicy.ts:77-94`), and both recipient boxes take
   a raw `showInputBox` (`shareInbox.ts:392-404`, `treeMutationCommands.ts:508-518`). A trailing
   space or a dash substituted somewhere in transit is invisible in a masked field and is reported as
   a wrong PIN.
2. **The key is assembled from two different addresses.** A server share is sealed under
   `recipientKeyId + pin`, where the sender takes the address from the server ROSTER
   (`serverTransport.ts:321`) and the recipient derives it from their LOCAL stored account
   (`serverTransport.ts:342`). Both lower-case, but they are two different sources. Routing is done
   server-side from the verified token, so a share can arrive and still never open if those two
   strings differ (an alias against a primary address, say).

A third possibility — the label bound as AAD differing between the two ends — is cheap to rule out
from the same line and is therefore included.

## What gets logged, and why none of it is a secret

Three facts per line, plus context:

- **The transit secret's SHAPE** — code-unit length, code-point count, whether it has leading or
  trailing whitespace, and every code point outside printable ASCII with its index (`U+2013@4`).
  This names cause 1 directly: a trailing space or a substituted dash is visible, and the value is
  not. A secret cannot be reconstructed from a length and a list of code-point CLASSES.
- **A fingerprint of the DERIVED KEY** — the first 8 hex characters of a SHA-256 over the key that
  `scrypt(passphrase, this blob's salt, this blob's KDF params)` produces. Both machines compute the
  same value for the same share when, and only when, both the secret and the key id match. Equal
  fingerprints on the two machines therefore acquit causes 1 and 2 together and convict the AAD;
  different fingerprints convict one of the first two, and the shape line says which.

  **Why the derived key rather than the secret.** A truncated hash OF THE PIN would be an offline
  guessing oracle: a candidate could be tested with one SHA-256 instead of one scrypt, which is
  precisely the wall `pinPolicy.ts:1-26` argues the whole design rests on. Fingerprinting the derived
  key gives an attacker nothing they did not have — testing a candidate against it costs exactly the
  same scrypt as testing it against the ciphertext — and 32 bits of a 256-bit key is not a
  meaningful leak.
- **The key id and the bound label** — the address the key was built from, and the AAD fields
  actually bound. Both are already plaintext on the wire and already shown in the UI.

## Build order

1. **`src_vs_code/src/transitSecretReport.ts`** (new, imports no `vscode`). `transitSecretReport()`
   and `describeTransitSecret()` — the shape above, as data and as one string.
2. **`cryptoUtils.derivedKeyFingerprint(blob, passphrase, loginKey?)`** (new export). Re-derives with
   the blob's own salt and `paramsOf(blob)` and returns 8 hex characters. Deliberately a separate
   function rather than a callback on `sealBlob`/`openBlob`: those two write and read a persisted
   shape, and a fingerprint must never be able to end up inside it.
3. **`src_vs_code/src/shareDiagnostics.ts`** (new, imports no `vscode`). Builds the four log lines —
   share sent, accept failed, external import failed, export written — from plain data. All the
   logic lives here so it is tested without a window.
4. **Wiring.** `ShareInboxDeps` gains an optional `log`; `deliverBatch` logs once per recipient,
   `acceptOne` and `acceptMany` log on failure. `exportCommand` and the `importExternal` handler log
   through the `log` they can already reach from `extension.ts:174`.
5. **Docs.** `research/module_extension.md` gains the diagnostics section; `CHANGELOG.md` and
   `package.json` go to **1.5.0**; this plan is promoted.

## Test plan

`node:test` under `src_vs_code/src/test/`, run by `npm test` (compile + `node --test out/test/*.test.js`).

- `transitSecretReport.test.ts` — a clean six-word passphrase reports `ws=none unusual=none`; a
  trailing space is reported; an en dash is reported as `U+2013` at its index; an astral code point
  counts once in `cp` and twice in `len`; **the value itself never appears in the output** (the
  fixture secret is distinctive and the assertion greps for it).
- `cryptoUtils.test.ts` — the fingerprint of the same (blob, passphrase) is stable; a different
  passphrase gives a different one; a different blob (new salt) gives a different one; the
  fingerprint contains no part of the passphrase; it agrees with the key `openBlob` actually used
  (seal, fingerprint, open — all three consistent).
- `shareDiagnostics.test.ts` — each of the four lines contains the fields the plan promises and
  none of the secret; a share with no project omits `projectId` rather than printing `undefined`.
- `shareInboxDiagnostics.test.ts` — the RED test for the reported defect: a share whose recipient
  types a PIN with a trailing space fails to open, and the inbox writes a line whose shape field
  says `ws=trailing`. Watched failing first (no line is written at all today), then passing.
- The existing `diagnosticLog.test.ts` secret-grep suite must stay green.

## Definition of Done

- [ ] `npm run typecheck` and `npm run lint` clean in `src_vs_code`.
- [ ] `npm test` green, run after `rm -rf out` (a stale `out/` runs both names after a rename and
      inflates the count).
- [ ] The RED test was watched failing with a message describing the real symptom, and the summary
      reports that message and the pass.
- [ ] No new module that holds pure logic imports `vscode` (repository rule 3).
- [ ] No secret can reach the log: asserted by test, not by inspection.
- [ ] `research/module_extension.md` updated; `CHANGELOG.md` carries a 1.5.0 entry; `package.json`
      version bumped.
- [ ] This plan promoted to `research/` with its deviations recorded, and `todo/README.md` updated.
- [ ] The `coai` gate: a `review_plan` round reached `proceed`, a `review_code` round ran on the
      finished branch, every finding resolved.

## Explicitly NOT in this change

- **Trimming or normalising the transit secret.** It is the obvious fix for cause 1 and it changes
  the derived key, so it would have to be symmetric across two independently-released halves and
  would break shares already sitting in an inbox. It is a separate plan, and it should be written
  from what these logs actually show rather than from this document's guess.
- **Changing the separator in the drawn passphrase**, for the same reason.
- **Gating the project share form on `SHARE_PROJECT_CONTRACT`** — a real defect found while
  diagnosing this (`shareDelivery.ts:61-63` chooses the project form without checking that the
  server is new enough to carry `projectId`, and the constant is referenced nowhere else), but a
  different bug with a different test. It gets its own plan.
