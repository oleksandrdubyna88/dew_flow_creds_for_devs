# PLAN — a woven password, and a PIN on an entry or a folder

> Status: **plan only, nothing implemented yet.** The foundation both halves rest on IS built and
> shipped — `src_vs_code/src/secretEnvelope.ts` and its tests, from
> [PLAN_payment_polish_and_entity_pin.md](../research/PLAN_payment_polish_and_entity_pin.md) §6.0.
> What remains is everything that USES it.
>
> Related docs: [module_extension.md](../research/module_extension.md),
> [PLAN_payment_polish_and_entity_pin.md](../research/PLAN_payment_polish_and_entity_pin.md),
> [PLAN_sharing.md](../research/PLAN_sharing.md),
> [PLAN_org_recovery.md](../research/PLAN_org_recovery.md).

## Why this is its own plan

Both features were §6 of the batch of 2026-09-03, and nine of that plan's ten items shipped. These
two did not, and the reason is worth stating rather than leaving as a gap in a checklist: **§6.2
changes how every secret in the product is read.** It touches `storageManager` (which sits at its
size-ratchet baseline and may only shrink), the sync, the share flow, the agent broker, the SSH
agent, the tree renderer and the headless CLI. A PIN checkbox that is wired to a form but not to
every read path is worse than no checkbox at all: it would promise a protection the storage does
not perform, in a product whose entire claim is that it does not do that.

The design below is not fresh. It went through the `coai` plan gate as part of the parent plan, and
six findings against it were accepted — they are folded in here, in the places they belong, rather
than kept in a review log.

## What is already built and can be relied on

`secretEnvelope.ts` — a secret that describes itself:

- a fresh random data key seals the value; the data key is wrapped under the PIN
  (`sealBlob` + `wrapWithPin`, the vault's own primitives — no new cryptography);
- the envelope holds ciphertext and the wrapped key, and the plaintext **nowhere** (asserted);
- a string this build never wrote **is** a plaintext secret, so there is no migration and a
  rollback reads its own writes;
- reading answers a typed `{ kind: 'locked' }` and **never prompts**, because the readers include
  background sync, the tree renderer and headless tooling, none of which can show a modal.

---

## Part 1 — a woven password (§6.1 of the parent plan)

**Goal.** The card can store a number, a CVV or a PIN woven with a decoy under a method kept only in
the person's memory. A password is the value most people would want that for, and cannot have it.

### 1.1 A password-shaped decoy

`decoyDigits.ts` knows four shapes — `card`, `iban`, `account`, `digits`. A password needs a fifth:
**the same length and the same character classes** as the value it hides. A decoy that is visibly a
different kind of string announces which column is which, which is the one thing a decoy must not
do. The charset logic already exists in `secretGenerator.ts` (`LOWER` / `UPPER` / `DIGITS` /
`SYMBOLS`), so this is a new `DecoyKind` served from the existing generator, never a second one.

### 1.2 The mark, and where it lives

The stored password becomes `plainSecret(woven, true)` — the envelope, carrying `woven: true`. That
is one write, which is the entire reason the envelope exists.

### 1.3 The viewer has to grow a second consumer

The two-column woven row lives inside `paymentViewCard.ts` and is written for a payment card. A
credential's viewer needs the same row. **Extracting it is the work**; a second copy would drift
from the first, and the two would then disagree about what a woven value looks like — which is a
disagreement about whether a person can read their own password back.

### 1.4 The automatic paths must refuse (owner's decision, 2026-09-03)

Ticking the box **disables** this entry's env exposure (`ENV_ENTITY_PASSWORD`), terminal injection
and agent access, and says so at the moment it is ticked. Nothing — the extension included — can
know which of the two halves is the real one, so an automatic path could only ever hand out a guess,
and a wrong password injected into a terminal or an env var is an account lockout nobody can see
happen. The alternative the owner rejected was prompting for the method and the column at each use.

**Where to refuse**: `envApply` / `envBinding`, the terminal launch, and `credsAgentServer`'s read
path. Each should say WHY, naming the entry, rather than returning nothing.

---

## Part 2 — a PIN on an entry or a folder (§6.2 of the parent plan)

**Goal.** A checkbox in **General**, and the same on a folder. Ticking it means every view and every
edit asks for a PIN. A folder's PIN covers its entries; an entry may override with its own.

**The owner chose the real wrap over a UI gate**, with its price accepted: the `pinPolicy` floor
applies (8 characters, 12 if all digits), and a wrapped entry is unreadable to the agent, to env
exposure and to terminal injection without the PIN.

### 2.1 Every read path learns about `locked`

`storageManager`'s accessors return `SecretRead`. Interactive hosts ask; background callers skip.
This is the largest single piece of the work and the one that cannot be done partially — a reader
that has not been taught will either hang, throw, or hand envelope JSON to something expecting a
password.

**The file is at its ratchet baseline and may only shrink**, so this begins with an extraction, not
with an edit.

### 2.2 The gate

View and edit ask, and the answer is remembered no longer than the window is unlocked — the shape
`PaymentViewHost`'s grant already has, including its "the panel may have been re-rendered for
another entry" check.

### 2.3 Folder inheritance, and the migration nobody plans for

A folder's flag means its entries are wrapped under the folder's PIN; an entry may override (enter
the existing one, then the new one twice), leaving its siblings untouched.

**Turning a folder's PIN on, or changing it, re-wraps every child — and gets interrupted.** Killed
halfway, the folder's flag and its children disagree and some entries are unreadable. So the re-wrap
is a **resumable migration with a committed marker**: the marker names the folder, the target state
and which children are done; the old wrap is kept until every child has succeeded; startup resumes
or rolls back. This mirrors the startup sweeps this repository already runs for orphaned in-flight
work. *(Accepted finding.)*

### 2.4 Moving an entry across a PIN boundary

A tree move is metadata-only today. Moving an unprotected entry INTO a protected folder would leave
its secret unwrapped while the interface claims it is protected; moving one OUT would leave it
wrapped under a PIN nothing records any more. So a move that crosses the boundary **asks and
re-wraps**, and is refused if the PIN is not given. A silent metadata-only move across that boundary
must not be reachable. *(Accepted finding.)*

### 2.5 Sharing: the flag is an instruction to ask, never a key

Every share is *already* PIN-sealed — `sealBlob(payload, recipientKeyId + pin, aad)`, the sender
types the PIN twice at share time, and the recipient must enter it to open. Three of the five things
the owner asked for are therefore already shipped.

What this adds is the **mark**. Two reviewers found the same hole from different sides: the
recipient receives a sealed payload and a boolean, but no key material and no PIN, so "re-apply the
protection locally" cannot mean anything — and re-using the share's own transit PIN would wrap the
entry under a one-time transfer secret the recipient never chose.

So: on opening a share marked PIN-protected, the recipient **chooses their own PIN** (or inherits
the destination folder's, when it has one), and the entry is wrapped under that. Importing it
unprotected is refused — a person who protected an entry did not agree to share it unprotected.
*(Accepted findings, both.)*

**Not negotiable:** the flag is a payload field, sealed with the rest. The server must not learn
which entries are PIN-protected — repository rule 1.

---

## Build order

1. **1.1** the password decoy shape — pure, and testable on its own.
2. **1.3** extract the woven row out of `paymentViewCard.ts`; both kinds render from it.
3. **1.2 + 1.4** the checkbox, the save, and the three refusals.
4. **2.1** the extraction out of `storageManager`, then `SecretRead` through every reader.
5. **2.2** the gate on view and edit.
6. **2.3** folder inheritance and the resumable re-wrap.
7. **2.4** moves across the boundary.
8. **2.5** the share mark and the recipient's own PIN.

Steps 1–3 ship on their own and are worth shipping on their own. Step 4 is the one that must be
finished once started.

## Test plan

| what | test |
|---|---|
| 1.1 | a password decoy matches its value's length and character classes, and is never the value |
| 1.3 | one woven row, rendered for a card and for a credential, produces the same shape |
| 1.4 | env exposure, terminal injection and agent access each REFUSE a woven entry, and say why |
| 2.1 | every reader handles `locked`: background sync skips it, the tree renders it, nothing throws |
| 2.2 | the grant is per entry and dies with the window; a re-render for another entry drops it |
| 2.3 | a re-wrap killed halfway resumes; the old wrap still opens every child that was not reached |
| 2.4 | a move into a protected folder without the PIN is refused, and changes nothing |
| 2.5 | a shared protected entry asks the RECIPIENT for a PIN; the transit PIN is never the local one |
| 2.5 | the share payload's flag is inside the sealed part — the server sees nothing |

## Definition of Done

- [ ] `npm run typecheck`, `npm run lint` and `npm test` green in `src_vs_code`.
- [ ] Every read path in the product handles a locked secret, and none of them prompts from
      `storageManager`.
- [ ] A woven password's automatic paths refuse and say why.
- [ ] An interrupted folder re-wrap leaves every child readable under one PIN or the other.
- [ ] `research/module_extension.md` and `research/architecture.md` updated; diagrams re-rendered.
- [ ] The `coai` gate: a fresh `review_plan` round on THIS document (its parent's round covered the
      design, not the split), then `review_code` on the branch.
