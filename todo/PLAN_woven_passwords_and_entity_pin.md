# PLAN — a woven password, and a PIN on an entry or a folder

> Status: **Part 1 IMPLEMENTED 2026-09-04 (extension v0.98.0); Part 2 open.** The plan stays here
> because the majority of its value — the PIN — is still unbuilt.
>
> **Part 1 (a woven password) shipped** and is documented in
> [module_extension.md](../research/module_extension.md) under *A woven password*. It went through
> the coai gate twice: 14 plan findings and 29 code findings resolved, the second code round
> `proceed`. Two deviations from what is written below, both from review:
>
> - §1.2 said the mark could not be switched off. What cannot be undone is UNWEAVING the stored
>   value; replacing the password always works, and saying otherwise made the form contradict
>   itself. The wording is now exact and the box arrives ticked for an already-woven entry.
> - §1.4 grew a boundary the plan did not anticipate. `FieldReading` = `value | withheld(reason) |
>   absent`, because every automatic path answered `string | undefined` and a `creds://` reference
>   to a woven password therefore reported *"has no password stored"* — false in both halves. An
>   agent ROTATION is refused for the same reason: it would store an unwoven value under a mark
>   that still said `Woven — on`.
>
> The foundation Part 2 rests on IS built and shipped — `src_vs_code/src/secretEnvelope.ts` and its
> tests, from
> [PLAN_payment_polish_and_entity_pin.md](../research/PLAN_payment_polish_and_entity_pin.md) §6.0.
> What remains is everything that USES it.
>
> Related docs: [module_extension.md](../research/module_extension.md),
> [PLAN_payment_instruments.md](../research/PLAN_payment_instruments.md),
> [PLAN_sharing.md](../research/PLAN_sharing.md),
> [PLAN_mcp_server.md](../research/PLAN_mcp_server.md).

## The shape of the PIN, decided by the owner (2026-09-03)

This is written first because it is what makes Part 2 buildable, and because the first draft got it
wrong in an expensive direction.

**A folder's checkbox is an ACTION, not a live property.** It does not encrypt a folder and entries
do not inherit anything from it at read time: it walks the folder recursively and gives every entry
inside its own PIN wrap. **Each entry therefore carries a complete, independent wrap** — and that
one sentence is what removes most of the risk the first draft was built around:

| what the first draft planned for | why it does not arise |
|---|---|
| a resumable folder migration with a committed marker | there is no cross-entry invariant to break. A run interrupted halfway leaves some entries protected and some not, each readable by its own means. The person runs it again. Nothing is lost, so nothing needs resuming |
| a background sweep that lacks the children's PINs | there is no background sweep. The PIN is typed by the person, there, while they watch |
| re-wrapping on a move across a folder boundary | there is no boundary. Protection belongs to the ENTRY, so a move is a move |
| folder rename / delete / PIN removal transitions | the wrap was never the folder's, so none of these touch it |

Two things follow that must be said out loud rather than assumed:

1. **An entry that is already protected is SKIPPED by a folder run, and keeps its own PIN.** The run
   would otherwise need that entry's existing PIN to unwrap it before re-wrapping, which is a
   question nobody wants asked once per entry — and silently replacing an override is worse.
   The run reports what it skipped.
2. **A new entry created inside a flagged folder has the PIN as a REQUIRED field**, and the form
   offers **"Use this folder's PIN", ticked by default** — untick it to set the entry its own
   (the owner's answers, 2026-09-03). Not a prompt that can be dismissed and not a box that can be
   left empty: the form does not save without it. The flag is persisted for this reason alone —
   without it a folder that says "protected" quietly accumulates unprotected entries, which is a
   promise the interface would be making and the storage would not be keeping.

   **There may be no single "folder PIN", and the interface must not pretend there is.** *(Two
   reviewers, one finding.)* A run with PIN A protects some entries; a later run with PIN B skips
   those and protects the rest, so a folder can hold entries under two PINs — which is a legitimate
   state, not a corruption. The checkbox therefore means **"the PIN another entry in this folder
   already uses"**, and it is accepted when the typed value opens AT LEAST ONE protected sibling.
   Opening none is not refused — introducing a second PIN deliberately is allowed — but it is SAID,
   so nobody discovers it a month later. The folder run itself reports how many entries it
   protected and how many it skipped, and that the skipped ones keep their own.

   **An EMPTY or wholly unprotected folder has nothing to verify against** *(a reviewer's
   finding)*, so there the PIN is typed TWICE, which is the only check available and the same one
   every other new PIN in this product gets.

   **The folder's PIN has to be TYPED, and checked before it is used.** It is stored nowhere, which
   is the point of it, so "use the folder's PIN" cannot mean "fetch it" — it means the person enters
   it. And it must be VERIFIED, by unwrapping any already-protected sibling in that folder: without
   that check a typo creates an entry wrapped under a PIN the person believes is the folder's and
   is not, which nothing would discover until the day they need the value. A folder whose entries
   are all still unprotected has no sibling to check against; there the typed PIN is simply what
   the entry gets, and the form says so.

**An agent never sees a PIN-protected entry at all.** Not "refused when used" — absent from the
listing. An agent that can see an entry it can never open will keep trying, and every one of those
is a door somebody has to answer. This is `mcpAccess` / the door filter, not a new mechanism.

**Every other operation simply asks.** View, edit, copy, use — the PIN is entered and the value is
unwrapped for that operation.

---

## What is already built and can be relied on

`secretEnvelope.ts` — a secret that describes itself:

- a fresh random data key seals the value; the data key is wrapped under the PIN
  (`sealBlob` + `wrapWithPin`, the vault's own primitives — no new cryptography);
- the envelope holds ciphertext and the wrapped key, and the plaintext **nowhere** (asserted);
- a string this build never wrote **is** a plaintext secret, so there is no migration and a
  rollback reads its own writes;
- envelope-SHAPED text that will not parse, and an envelope carrying both a lock and a value, are
  answered `corrupt` — never as a plain value;
- reading answers a typed `{ kind: 'locked' }` and **never prompts**.

---

## Part 1 — a woven password *(IMPLEMENTED 2026-09-04)*

**Goal.** The card can store a number, a CVV or a PIN woven with a decoy under a method kept only in
the person's memory. A password is the value most people would want that for, and cannot have it.

### 1.1 A password-shaped decoy

`decoyDigits.ts` knows four shapes — `card`, `iban`, `account`, `digits`. A password needs a fifth:
**the same length and the same character classes** as the value it hides. The charset logic already
exists in `secretGenerator.ts`, so this is a new `DecoyKind` served from the existing generator.

**A reviewer proposed drawing the decoy from the full charset instead, to avoid leaking the real
password's class composition. That was rejected, and the reasoning belongs here.** A woven value is
the INTERLEAVING of the two halves. If the decoy carries characters from classes the real password
does not use, every one of them is provably decoy: the halves separate by inspection, with no method
and no guessing, and the twelve methods become irrelevant. Mirroring leaks that the pair shares a
class set. Not mirroring collapses the mechanism. `decoyDigits` already makes this argument for a
card's BIN, and it is the same argument.

### 1.2 The mark, and where it lives

The stored password becomes `plainSecret(woven, true)` — the envelope, carrying `woven: true`. One
write, which is the entire reason the envelope exists.

### 1.3 The controls, and the read-back — specified rather than assumed

*(A reviewer found this missing, and it is the finding that would have produced an unrecoverable
password with every listed test passing.)*

**Writing.** The Secret section gets the same three controls the card's weaving has, from the same
modules: the checkbox, the method picker (twelve, shuffled in order, named by code), and the worked
example. Nothing new is invented — the person marks the field, picks a method, and sees on two
made-up samples what that method does before the choice becomes irreversible.

**Reading.** The viewer shows the same two-column row the card shows: pick a method, and two rows
come back. **The build never says which is real**, exactly as it never does for a card — a tick, an
ordering or a "looks valid" would do the guessing for whoever is reading over the shoulder. The
person knows their own password when they see it.

**A wrong method** answers in the same shape as a right one. That is the property, not an omission.

### 1.4 The automatic paths must refuse (owner's decision)

Ticking the box **disables** this entry's env exposure (`ENV_ENTITY_PASSWORD`), terminal injection
and agent access, and says so at the moment it is ticked. Nothing — the extension included — can
know which half is real, so an automatic path could only hand out a guess, and a wrong password in a
terminal or an env var is an account lockout nobody sees happen.

**Where**: `envApply` / `envBinding`, the terminal launch, and `credsAgentServer`'s read path. Each
says WHY, naming the entry, rather than returning nothing.

### 1.5 Editing — and NOT making the entry immutable

*(A reviewer's finding, accepted: the card's answer would be wrong here.)*

A woven value cannot go back into the form: saving would weave the woven value a second time,
doubling its length under two unknown methods. `mixedFieldGuard` refuses a woven payment record for
this reason, and a payment record is only its fields — so refusing the whole form costs little.

**A credential is not.** It carries a login, a URL, notes, env bindings, dependencies, agent doors.
Making all of that immutable because the password is woven would be a worse defect than the one the
guard prevents. So:

- the form OPENS, with every other field editable;
- the password box is replaced by a statement that the value is woven and is not shown here, plus
  **Replace the password…**, which writes a new value (woven or not) without ever reading the old
  one;
- saving without touching that control leaves the stored secret byte-identical.

---

## Part 2 — a PIN on an entry or a folder

### 2.1 Every read path learns about `locked`

`storageManager`'s accessors return `SecretRead`. Interactive hosts ask; non-interactive ones refuse
or skip. **This does not get simpler under the owner's model and is the bulk of the work**: a reader
that has not been taught will hang, throw, or hand envelope JSON to something expecting a password.

**The file is at its size-ratchet baseline and may only shrink**, so this begins with an extraction.

**Every named reader is enumerated in the test matrix** *(a reviewer's finding — the first draft said
"every read path" and then tested two of them)*: background sync, the tree renderer, the share and
the export, the SSH agent, the terminal launch, env exposure, `credsAgentServer`, the headless CLI,
the MCP tools, the hygiene scan, the revision history.

### 2.2 The gate

View and edit ask. The answer is remembered no longer than the window is unlocked — the shape
`PaymentViewHost`'s grant already has, including its "the panel may have been re-rendered for
another entry" check.

### 2.3 The folder run

A recursive walk that wraps every entry inside under one PIN the person types once.

- **Already-protected entries are skipped and reported**, keeping their own PIN.
- Interrupted, it leaves a mix of protected and unprotected entries, all readable. There is nothing
  to resume and nothing to roll back; the person runs it again.
- The flag persists so a **new entry created in that folder is asked for the PIN as it is created**.

### 2.4 Agents do not see protected entries

Absent from the listing, not refused on use. `mcpAccess` and the door filter already decide what an
agent may see; this is one more reason for an entry not to appear.

### 2.5 Sharing: the flag is an instruction to ask, never a key

Every share is *already* PIN-sealed — the sender types the PIN twice at share time and the recipient
must enter it to open. Three of the five things the owner asked for are already shipped.

What this adds is the **mark**. The recipient receives a sealed payload and a boolean, but no key
material — so "re-apply the protection" can only mean **ask them for their own PIN** on opening.
Re-using the share's transit PIN would wrap the entry under a one-time transfer secret the recipient
never chose. Importing it unprotected is refused: a person who protected an entry did not agree to
share it unprotected.

**Headless import** *(a reviewer's finding)* fails fast with a message naming the required PIN
argument, rather than blocking on a prompt nothing can answer.

**Not negotiable:** the flag is a payload field, sealed with the rest. The server must not learn
which entries are PIN-protected — repository rule 1.

---

### 2.6 A woven password that is also PIN-protected

*(A reviewer's finding: the two marks meet and the order was undefined.)* The woven string is the
VALUE; the envelope wraps a value. So: **weave first, wrap second** — the envelope's ciphertext is
the woven string, and `passwordWoven` stays on the entry where it always was. Unlocking gives back
the woven string, which is then read through the two-column row exactly as an unprotected woven
password is. The two features compose in one direction only, and it is the one that needs no new
code in either.

## Build order

1. **1.1** the password decoy shape — pure, testable on its own.
2. **1.3** extract the woven row out of `paymentViewCard.ts`; both kinds render from it.
3. **1.2 + 1.4 + 1.5** the checkbox, the save, the replace-not-refuse edit, and the three refusals.
4. **2.1** the extraction out of `storageManager`, then `SecretRead` through every enumerated reader.
5. **2.2** the gate on view and edit.
6. **2.3** the folder run, and asking on create inside a flagged folder.
7. **2.4** protected entries absent from an agent's listing.
8. **2.5** the share mark and the recipient's own PIN.

Steps 1–3 ship on their own. Step 4 is the one that must be finished once started.

## Test plan

| what | test |
|---|---|
| 1.1 | a password decoy matches its value's length and character classes, and is never the value |
| 1.1 | the decoy uses no class the real value does not — otherwise the halves separate by inspection |
| 1.3 | one woven row renders for a card and for a credential and produces the same shape |
| 1.3 | a wrong method answers in the same shape as a right one, and nothing marks either row |
| 1.4 | env, terminal and agent each REFUSE a woven entry, and each says why |
| 1.5 | the form opens for a woven credential; every other field saves; the secret is untouched |
| 1.5 | Replace the password… writes a new value without reading the old one |
| 2.1 | each enumerated reader handles `locked`: it skips, refuses or asks — none throws or hangs |
| 2.2 | the grant is per entry and dies with the window; a re-render for another entry drops it |
| 2.3 | a folder run wraps every unprotected entry, SKIPS the protected ones, and says which |
| 2.3 | a run interrupted halfway leaves every entry readable — some protected, some not |
| 2.3 | a new entry in a flagged folder cannot be saved without a PIN |
| 2.3 | "use the folder's PIN" is ticked by default, and a WRONG folder PIN is refused by checking it against a protected sibling |
| 2.3 | unticking it takes a new PIN, twice, and the sibling check does not apply |
| 2.4 | a protected entry is absent from EVERY agent-facing surface, enumerated: the MCP entry list, the MCP search, the tree an agent reads, the broker's own listing — not merely refused on use *(a reviewer's finding: "every list" tested at two of them proves nothing about the others)* |
| 2.6 | a woven password inside a PIN wrap unlocks to the woven string, and reads back through the same row |
| 2.5 | a shared protected entry asks the RECIPIENT for a PIN; the transit PIN is never the local one |
| 2.5 | the share payload's flag is inside the sealed part — the server sees nothing |
| 2.5 | a headless import of a protected share fails fast, naming the argument it needs |

## Definition of Done

- [ ] `npm run typecheck`, `npm run lint` and `npm test` green in `src_vs_code`.
- [ ] Every enumerated reader handles a locked secret, and none of them prompts from
      `storageManager`.
- [ ] A woven password's automatic paths refuse and say why; its entry still EDITS.
- [ ] A folder run interrupted at any point leaves every entry readable.
- [ ] `research/module_extension.md` updated, and `architecture.md` if a cross-module seam changed.
- [ ] The `coai` gate: the plan round of 2026-09-03 (nine findings accepted, one rejected with its
      reasoning recorded in §1.1), then `review_code` on the branch.
