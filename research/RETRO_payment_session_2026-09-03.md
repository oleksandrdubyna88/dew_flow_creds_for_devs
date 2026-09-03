# RETRO — the mistakes of one long session, and which of them the rules already forbade

> Written 2026-09-03, covering the work from `da9b3fe` to `4de7be4`: the payment UI tail (three
> stages, released as `extension-v0.94.0`), the stale-entry fix (`0.94.1`), the Monero wordlist
> (`0.95.0`), and the cross-window reproduction.
>
> Companion to [RESULTS_review_gate_payment_ui_tail.md](RESULTS_review_gate_payment_ui_tail.md),
> which counts what the REVIEW caught. This one counts what I got wrong, which is a different list
> and the more useful one.

## Why this is worth writing down

Seven mistakes are recorded below. **Three of them were already forbidden by a rule that exists**,
which is the finding that matters: the family's problem is not mainly a shortage of doctrine. Two were
genuine gaps. Two were nobody's rule and are just care.

The distinction is the whole point of the exercise. A retrospective that answers "we should write a
rule" to everything grows an always-loaded rule set that every future session pays for, while the
rules that were already there go on being unread.

## The seven

| # | what happened | already covered? | cost |
|---|---|---|---|
| 1 | A review finding was fixed at the one site the reviewer quoted; the same shape existed at four more, one of them reachable | **yes** — `security.md`, *A measure applied at SOME of its sites* | a real defect shipped in 0.94.0 and was fixed in 0.94.1 |
| 2 | A merge produced a CHANGELOG that was valid and wrong: a section above the file's preamble, and a heading style that would have served one release's notes as part of another's | **no** | caught by hand; nothing would have failed |
| 3 | A previous session recorded a deviation as impossible without naming what it had checked | **no** | a whole feature (Monero) deferred for a month on a conclusion that did not follow |
| 4 | A concurrency primitive was designed on an API with no atomic operation | partly — `reliability.md` covers waits and cancellation, not locks | caught by the plan gate before a line was written |
| 5 | A summary table's parts were wrong while its total was right | no, and it should stay that way | caught by re-deriving it from the appendix |
| 6 | A test double minted a fresh object per call, which an identity check reads as "the panel re-rendered" | no | caught by the suite, in the same run that introduced the check |
| 7 | A `cd` inside a compound shell command silently relocated the next several git commands to another repository | tooling note, not a rule | caught before anything was committed there |

## 1. The one that shipped — and the rule that already said so

The code round found that a gated Copy could copy the previous entry, and quoted
`entityViewPanel.ts`. I fixed it there. The same shape — an `await` between reading the current entry
and acting on it — existed on the four paths `PaymentViewHost` owns, which are routed **eleven lines
earlier and return** before the panel's guard. One of those, the clipboard, was reachable.

`common/security.md` has said this since before the session started, under *A measure applied at SOME
of its sites is the defect this family keeps writing*, item 5: **"When you find one instance, sweep
for the class in the same task."**

Why I did not apply it, stated plainly because it is the useful part: **I read the finding as a bug
report about a file, and the rule as being about escaping.** Its four examples are all escapers and
sanitisers, and it lives in `security.md`. Nothing in it says that a review finding naming a defect
is itself a report of a shape — and that the site the reviewer quotes is the least reliable guide to
how many there are, because a reviewer quotes where they happened to be reading.

That is the narrow gap: not a missing rule, a rule whose framing does not catch the reader who needs
it. The proposal below widens it rather than adding a second copy — which is what `reuse-first` would
say about a second copy of anything.

## 2. The merge that produced a valid, wrong document

Merging `main` into the branch auto-merged `CHANGELOG.md` cleanly. The result put the other branch's
`## 0.93.0` section **above this file's own preamble**, and left its heading unbracketed while every
other heading in the file is `## [x]`.

Nothing failed. Nothing could: no test reads the changelog. But the release workflow slices notes from
`'## [' + version + ']'` to the next `'\n## ['` — so an unbracketed heading sitting between two
versions is invisible as a terminator, and the section above it would have been published as part of
somebody else's release notes.

The general shape: **auto-merge is textual, and a file that TOOLING parses can come out of it
syntactically fine and semantically wrong.** Changelogs, index tables, manifests, generated contracts,
`todo/README.md`. Git will not tell you, and neither will the build.

## 3. "Impossible" without naming what was checked

The payment plan's deviation 4 read: *"Monero's 1626-word list is NOT included. It is not available as
plain data from any reachable package, and inventing it for a checksum validator is exactly the
failure the verification above exists to prevent."*

Every clause of that is true. The conclusion does not follow, and it cost a month: `monerojs` carries
no list and `mymonero-core-js` and `monero-ts` carry it only inside WebAssembly — but
`src/mnemonics/english.h` in monero-project/monero is a plain header, and nobody had looked at it.
**"No package ships it" is not "it cannot be had."**

The deviation was recorded honestly and it was still unfalsifiable as written, because it named a
conclusion and not a search. Had it said *"checked: npm (three packages) — none carries it as data;
upstream source not checked"*, the next reader would have seen the hole in one line. Which is what the
proposal below asks for.

## 4. A lock designed on an API that cannot lock

The cross-window plan's steps 2–4 proposed a lease key in `globalState`, with a write-then-read-back
to settle a tie. The plan round returned **three Blocking findings from three vendors independently**,
all the same: `Memento.update` is asynchronous, both windows can read empty, both write, and each can
re-read its own value. Two windows enter, and the reproduction still destroys the import.

I had written down that the memento has no compare-and-swap **in the same document** and then designed
as though a read-back substituted for one. The corrected primitive is `fs.mkdir` without `recursive`,
which is atomic on every platform this ships to.

The generalisable form: **before designing a lock, name the atomic operation it rests on.** If you
cannot name one, what you are designing is advisory coordination, and the design has to say so in the
primitive's own header rather than in a paragraph a caller will not read.

## 5, 6 and 7 — caught, and not rule material

- The **tally** whose total was right and whose parts were wrong survived a careful read precisely
  because it summed to thirty. It was caught by re-deriving it from the appendix. The lesson is real
  and it is already the shape of `security.md`'s *leave the enumeration behind*; it does not need its
  own rule, and adding one would cost every session a paragraph to buy a habit.
- The **test double** that minted a new object per call defeated an identity check the same hour the
  check was written. Worth knowing when writing one; not worth a rule.
- The **`cd` in a compound command** relocated four subsequent git commands into
  `dew_flow_conventions` and I ran `git checkout` there before noticing. Nothing was committed. This
  is a tooling habit — prefer absolute paths — and the harness's own guidance already says it.

## What is proposed for the shared conventions

Three changes, each with the evidence above behind it. None of them is a new file.

1. **`common/security.md` — widen the enumeration rule to review findings.** A finding names a SHAPE;
   the site it quotes is where the reviewer was reading, not the extent of the defect. Evidence: the
   0.94.1 fix.
2. **`common/git-workflow.md` — a new short section on merge artefacts in tool-consumed files.** After
   a merge, read the files that tooling parses, because auto-merge produces valid-and-wrong documents
   and nothing downstream will complain. Evidence: the CHANGELOG.
3. **`common/planning-docs.md` — a deviation that records something as impossible names what was
   checked.** Evidence: Monero, deferred on a true statement and an unexamined conclusion.

A fourth is arguable and is offered rather than urged: **`common/reliability.md` — before designing a
lock, name the atomic operation.** It is narrow, and locks are rare; when they are wrong the cost is
silent data loss, which is the shape the rest of that file is made of.
