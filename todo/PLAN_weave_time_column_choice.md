# PLAN — which column holds the real value, chosen at WEAVE time

> Status: **plan only, nothing implemented yet, 2026-09-16.** Scope: `src_vs_code/src` — the two
> weaving choke points, the stored value's shape, and the reading side that presents the two rows.
> Extension only; no HTTP contract, no server change.
>
> Raised by the automated reviewer on [PR #97](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/pull/97)
> and left open there deliberately: the owner decided to SHIP #97 and state the bound honestly, and
> this is the tracked item that bound points at. It is the ONLY change that would close it.
>
> Related docs: [module_extension.md](../research/module_extension.md) — *"What that buys, exactly,
> and what it does not"*.

## The symptom, stated as a reader can reproduce it

A woven value is two halves interleaved under one of twelve positional methods, and the method is
stored nowhere. #97 added a second bit to the READING: the two rows are presented in a random order
per render, so which row is drawn first tells nobody which one is real.

That bit does not hold against the developer inspector, and the reason is arithmetic rather than a
mistake in the page:

1. `weaveSecret` (`src_vs_code/src/wovenSecret.ts:49`) always weaves the person's value as the FIRST
   argument to `shuffleTokens`, so it is always the arithmetic first column. `weaveOne`
   (`src_vs_code/src/paymentWeaving.ts:83`) does the same for a payment field.
2. `shuffleLayout(length, code)` is a pure function of the shipped source, so anybody holding the
   source and the `code` can compute which stored position belongs to which column.
3. The viewer's message carries `code`, because the picture is drawn from it
   (`src_vs_code/src/wovenPicture.ts:66-67`).

So a person with webview developer tools, on this machine, while a reading is on screen, recovers
the row order and therefore which row is the real value. The feature's stated reader — a shoulder, a
screen share, a screenshot, a backup file — is unaffected, and this is not a regression: before #97,
row one was the person's value for EVERY reader. It is simply the bound, and it is written down.

## The goal

Make the stored value carry no answer at all, by choosing at WEAVE time — at random, per value —
which column holds the real half. Then there is nothing for an inspector to recover, because the
information is not in the record, not in the message, and not in the source.

## Why this is buildable, and the one fact that makes it so

**Nothing automatic unweaves a woven value.** `automaticRefusal`
(`src_vs_code/src/envApply.ts:44-50`) refuses every automatic use of a woven password with the
sentence *"nothing here knows which of the two halves is yours"*, and `byPassword`
(`src_vs_code/src/sshExecAuth.ts:86`) refuses SSH the same way. Only a person reads a woven value
back, and a person recognises their own value on sight.

That is what makes the column free: no consumer depends on the real half being first, so randomising
it breaks nothing that reads today. Had one existed, the column would have to be STORED, and storing
it is precisely the hint this plan exists to remove.

## What must be decided before any code (owner decisions)

1. **What happens to values already stored.** A record woven before this change has its real half in
   column one, and nothing marks it as old. Three candidates: leave them (the bound stays for every
   existing value, for ever), re-weave on the next save of that entry (quiet, and it changes a stored
   secret the person did not ask to change), or offer it (a notice on the entry, which tells anybody
   reading the screen that this entry is one of the old ones). **Recommended: leave them, and say so
   on the row** — this is a bound on old records, and silently rewriting stored secrets is the worse
   of the two risks.
2. **Whether the reading side should stop sending `code` to the page.** With the column randomised,
   `code` no longer answers anything on its own — the picture needs it, and knowing the layout
   without knowing which column is real is not a disclosure. Recommended: keep sending it, and say
   in the module doc why it is no longer a leak.

## Build order

- **S1 — the column, chosen and not recorded.** `weaveSecret` and `weaveOne` draw a bit from the
  same `Random` they already take and pass the two halves in that order. Nothing is written to say
  which way it went: no field, no mark, no length trick, no ordering convention.
  *Tests:* over many weaves of one value with one method, both columns occur (a seeded random, so it
  is deterministic); the stored string still unweaves to the two halves under that method; and the
  RECORD is asserted to be identical in shape either way — same keys, same lengths, same marks — so
  nothing distinguishes the two cases on disk.
- **S2 — the reading side presents two rows and claims nothing.** It already does, since #97; what
  changes is the note, which may stop saying the first row is yours.
  *Tests:* the message under both columns differs only in the two rows, the check #97's
  `entityViewPanelWiring.test.ts` already makes.
- **S3 — the doc.** `module_extension.md`'s *"What that buys, exactly, and what it does not"* becomes
  the record of a bound that WAS and how it closed, including what remains true for values woven
  before the change.

## Test plan

`npm test` in `src_vs_code` after `rm -rf out`. The new assertions are pure-module ones; the seeded
random is the existing test pattern (`phraseForm.test.ts:93-106` for the throwing random, the same
shape for a counting one).

**The test that would have caught this in the first place** belongs here too: for a value woven with
a known method, compute `shuffleLayout` over the stored length and assert that it does NOT determine
which half is real — which is exactly the measurement the automated reviewer made by hand on #97.

## Definition of Done

- [ ] `npm run typecheck`, `npm test` and `npx eslint src` green after a cleared `out/`.
- [ ] The column varies per weave, is stored nowhere, and no field, mark or shape distinguishes it.
- [ ] Nothing automatic can unweave — the two refusals still stand and are still tested.
- [ ] The layout test: holding `code` and the source does not identify the real half.
- [ ] `research/module_extension.md` records the closed bound and what stays true for old values.
- [ ] The `coai` gate: a plan round before implementation and a code round on the pull request.
- [ ] The thread on #97 is answered with the pull request that closes it.
