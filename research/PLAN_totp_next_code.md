# PLAN — the next code, shown on purpose: enrolment asks for two in a row

> Status: **IMPLEMENTED, 2026-09-11.** Scope: `src_vs_code/src/` — one preference on the entity
> record, one checkbox in the edit form's TOTP section, a second code row in the read-only viewer,
> and the `totpSnapshot` seam that both sides already go through.
>
> **Deviations from the plan, and what they cost.**
>
> - **The copy guard was redesigned twice, once per review round, and the second time is the one to
>   read.** The plan shipped with the pair's identity carried on each Copy button, frozen on the
>   first click. The code round found that the latch was never released: after one rollover the
>   second button was refused forever, so a race had been turned into a button that did nothing
>   until the panel was reopened. It also found the other order unguarded — copying *next* first,
>   then *now* after a tick, yields the same code twice, which is exactly the failure on the
>   screenshot this plan started from. What shipped binds from the CLICK, symmetrically: copying
>   either half binds the OTHER half to that pair and leaves the clicked one live, so every refusal
>   is recovered by the gesture the message already asks for. It is less code than the version it
>   replaced.
> - **`ViewerSecretField` and `secretResolver` were NOT touched**, though the plan said they would
>   be. `options.totp()` already returns the whole snapshot, so the paired fields resolve inside
>   `copyValueFor` and the ordinary `totp` field keeps its existing path untouched — which is also
>   what makes "with the preference off, nothing changes" literally true rather than approximately.
> - **The ordinary viewer's Copy button was nearly broken by this feature.** The first version
>   stamped `totp|<validUntil>` on every code message including entries with no pair, so a copy at a
>   period boundary would have been refused as stale in a viewer that had never asked for any of
>   this. Caught by the code round; the bare field is now never stamped unless a pair is on screen.
> - **`totpSnapshot` hit the complexity ceiling** at 5 and was split (`nextCodeOf`) rather than given
>   an `eslint-disable`.
> - **The QR reader was suspected and cleared before any code was written** — see the symptom below.
>   That is recorded because it is the more likely thing for the next reader to suspect too.
> - **A backtick in a comment inside the page's script template ended the template**, for the fourth
>   time in this repository's history. It cost one compile.
>
> **Open tail.** The webview's own script is still exercised only through its pure halves — there is
> no scenario harness that opens a viewer, which `research/module_tests.md` already records as a gap
> for every webview flow here, not only this one. A code round asked for one; adding a webview
> harness is its own plan, not this one's tail.
>
> Related docs: [module_extension.md](module_extension.md) (§TOTP),
> [PLAN_totp.md](PLAN_totp.md) (the field this extends),
> [PLAN_qr_seed_paste.md](PLAN_qr_seed_paste.md) (the input path, unchanged here).

## Symptom

Binding a virtual MFA device to a cloud console asks for **two consecutive codes**, not one. Huawei
Cloud's *Bind Virtual MFA Device* page has two fields and its own documentation says "enter two
consecutive verification codes"; AWS, Alibaba Cloud and Oracle Cloud ask the same way, for the same
reason — two codes in a row prove the clock is aligned, which one code cannot.

The viewer shows exactly one code (`entityViewPage.ts:436-444`), and `totpSnapshot`
(`totp.ts:145-156`) computes exactly one. So the only way to fill the second field today is to wait
out the period, watch the row redraw, and read it again — and the failure when somebody does not is
silent and confusing: the service answers "codes not accepted", which reads like a wrong seed.

Observed 2026-09-11 on a real Huawei enrolment: the same code was entered into both fields and the
binding was refused. The seed was correct, the QR was correct, the reader read it — the product had
simply never offered the second code.

**What was checked first, and was NOT the cause.** The QR on that page was suspected. It is not:
the screenshot decodes through this extension's own reader (`readPastedQr`) to
`otpauth://totp/huawei:<login>?secret=...&issuer=huawei&algorithm=SHA1&digits=6&period=30`, one
account, zero skipped, empty error — a 130x126 px capture at 2.7 px per module. The base32 key
printed beside it parses too, with the embedded space stripped by `normalizeBase32`
(`totp.ts:38-45`). Nothing on the input path needs changing.

## Goal

- An entity carries an optional preference: **show the next code as well as the current one**.
- The read-only viewer, when that preference is on, draws a second row — *next code* — with its own
  Copy button, so both fields of an enrolment form can be filled without waiting.
- The preference is **per entity and off by default**. The everyday viewer is unchanged: one code,
  expiring, which is the whole point of the field.
- The seed still never reaches the webview.

## Constraints this must not break

1. **The viewer receives derived codes, never the seed.** This is the second documented exception to
   "the read-only viewer never receives a secret" (`PLAN_totp.md`, `module_extension.md` §TOTP), and
   it stays exactly that: a derived value that expires.
2. **It widens that exception and must say so.** With the preference on, the page holds a code that
   is valid for up to *two* periods rather than one. That is a real widening, it is what the feature
   IS, and it happens only where a person switched it on for one entry.
3. **No new runtime dependency** (`package.json` has no `dependencies` key and the README claims it).
4. **The tree's plaintext-flag discipline.** The preference is metadata, never a keychain read.
5. **800-line file ceiling**, and complexity kept low enough that no new `eslint-disable` appears.

## Where it plugs in (verified 2026-09-11, against the current working tree)

| Concern | File:line | Today |
|---|---|---|
| Entity metadata flags | `types.ts:206-212` | `sshAgent` and `hasTotp` — the two precedents: a PREFERENCE that syncs, and a plaintext flag |
| Form TOTP section | `entityFormPage.ts:331-350` | seed input, QR paste button, `totpSteam` checkbox at `:343-344`, conditional `clearTotp` |
| A checkbox that reflects stored details | `entityFormPage.ts:313` | `agentForward` — `${d?.agentForward === true ? 'checked' : ''}` |
| Save payload assembly | `entityFormScript.ts:716-718` | an explicit list; `totpSteam: chk('totpSteam')` sits at `:716` |
| Form to record | `entityFormPanel.ts:657-667` (totp), `:704` (`agentForward` read) | `hasTotp` computed at `:660` |
| The one snapshot both displays use | `totp.ts:134-156` | `TotpSnapshot { code, validUntil, period, description }` |
| Viewer seam | `viewerOptions.ts:33-39` (`ViewerSecretField`), `:61-78` (`secretResolver`), `:82-84` (`totpViewFor`) | |
| Viewer wiring | `entityViewerCommands.ts:96,125` | `totp: hasTotp ? totpViewFor(totpReader) : undefined` |
| Viewer message loop | `entityViewPanel.ts:165-173` | `postMessage({ type: 'totp', ...snapshot })` — a spread, so a new field rides for free |
| Viewer markup | `entityViewPage.ts:436-444` | the single code row |
| Viewer countdown script | `entityViewPage.ts:705-726` | 250 ms tick, re-asks the host at expiry |
| Copy ladder | `entityViewCopy.ts:59-67` | one `case` per secret field |
| Help article | `helpOrder.ts:27` + `helpEn.ts:167-174` and its Ru/Uk/De/Es siblings | the `totp` article, six fields, five languages |

## Design

**1. `totpShowNext?: boolean` on `EntityMetadata` (`types.ts`).** A preference, documented as
`sshAgent` is: not a secret, it syncs, and a machine that receives the entry shows the pair too.
Written next to `hasTotp` because that is where a reader looks for it.

**2. `totpSnapshot` grows one optional argument, not a second function.**

```ts
export interface TotpSnapshot {
  code: string;
  /** The code of the FOLLOWING period — present only when it was asked for. */
  next?: string;
  validUntil: number;
  period: number;
  description: string;
}

export function totpSnapshot(storedUri: string | undefined, nowMs: number, withNext = false)
```

The next code is `totpCode(config, validUntil)` and needs no new arithmetic: `validUntil` is already
the first millisecond of the following period, so its counter is this one's plus exactly one. Asking
for it explicitly — rather than always returning it — is what keeps "the page receives only what it
shows" true for every caller that did not opt in.

**3. `totpViewFor(read, withNext = false)`** passes it through; `entityViewerCommands.ts:125` reads
the preference off the record it already holds:
`totpViewFor(totpReader, details.totpShowNext === true)`.

**4. The page draws the second row when told to.** `EntityViewOptions` gains `totpShowNext?: boolean`
(markup is built once, at mount, and the preference is known then). The script fills it from
`event.data.next` on the same message it already handles — no second round-trip, no second timer:
when the current code expires the page re-asks and the host answers with a fresh pair.

**Both rows are redrawn by one message, and a rollover is SAID.** The pair is replaced atomically
because it arrives atomically — but a person mid-enrolment must see that it happened, or they will
paste the first code of a pair that no longer exists. So the row's live region announces the change
once when a pair is replaced while one was already on screen, and the second row is blanked whenever
a message arrives without `next` rather than keeping the value it had.

The two rows are labelled so they cannot be swapped: **One-time code (now)** and **Next code**, each
Copy button naming which one it takes. Entering them in the wrong order fails the same way a wrong
seed does, and the label is the only thing standing between a person and that.

**5. Copy is anchored to the pair on screen.** Two reviewers found the same defect in the first
version of this design, independently, and they are right: resolving the second code by computing
`totpSnapshot(uri, Date.now(), true)?.next` at the moment of the click answers the code of whatever
period is current *then*. Copy A, let the period tick, copy the second row — and the clipboard holds
the pair after the one on screen. The console receives two codes that are not consecutive and
refuses a seed that is perfectly correct, which is exactly the failure this feature exists to end.

So the page carries the pair's identity into the copy request, using the `field|variant` convention
`entityViewCopy.ts` already has for `pay_<key>|<variant>` and `snippet|…`: both buttons of the pair
send `totp|<validUntil>` and `totpNext|<validUntil>`, re-stamped from every `totp` message. The host
re-reads the snapshot, compares `validUntil`, and **refuses when they differ** — the pair the person
is looking at is gone, and handing them half of a newer one is the bug. The refusal says so.

This needs no new `ViewerSecretField` and no change to `secretResolver`: `options.totp()` already
returns the whole snapshot, and the bare `'totp'` field keeps its existing, unanchored path so an
entry without the preference behaves exactly as before.

**6. The form.** A checkbox under the Steam one:

```html
<div class="check"><input id="totpShowNext" type="checkbox" ${d?.totpShowNext === true ? 'checked' : ''}>
  <label for="totpShowNext">Show the next code too — some consoles ask for two consecutive codes when enrolling</label></div>
```

`entityFormScript.ts:716` posts `totpShowNext: chk('totpShowNext')`; `toValues` stores it only when
the entry actually has a seed —
`totpShowNext: hasTotp && bool(data, 'totpShowNext') ? true : undefined` — so a preference about a
code that does not exist never enters the record.

**7. Deliberately NOT in scope.**

- The tree's *Copy One-Time Code* keeps copying the current code alone. A tree command cannot show a
  pair, and a clipboard holding two codes is not what two input fields want.
- No global setting. The preference is per entry because the need is per service.
- Nothing on the MCP/agent surface. Whether an agent may be handed a code at all is an open owner
  decision ([PLAN_tails_2.md](../todo/PLAN_tails_2.md) section 1.3) and must not be pre-empted by this.

## Build order

1. `totp.ts` — `next` on the snapshot, the `withNext` argument, and its tests. Pure, no `vscode`.
2. `viewerOptions.ts` — `totpViewFor`'s argument, `'totpNext'` in the field union and the resolver.
3. `types.ts` + form (`entityFormPage.ts`, `entityFormScript.ts`, `entityFormPanel.ts`).
4. Viewer (`entityViewPage.ts` markup + script, `entityViewCopy.ts`, `entityViewerCommands.ts`).
5. Help article sentence in all five languages; `CHANGELOG.md`; `research/module_extension.md`.

## Test plan

`node:test`, run as `npm test` in `src_vs_code` (compile, then `node --test "out/test/*.test.js"`).

- `totp.test.ts`
  - `withNext` returns the code of the following period, and it equals `totpCode(config, validUntil)`
    computed independently — the pair is *consecutive*, which is the property the service checks.
  - Without the argument, `next` is `undefined` — the default caller receives nothing extra.
  - A 60-second period and an 8-digit seed both pair correctly (the step is the period, not 30 s).
  - Steam pairs too (5-character alphabet, both members).
- `viewerOptions.test.ts`
  - `totpViewFor(read, true)` yields a snapshot carrying `next`; `totpViewFor(read)` does not.
  - No seed gives `undefined`, not a throw.
- `entityViewCopy.test.ts` — **the boundary, which is the defect the gate found**
  - `totpNext|<validUntil>` against a snapshot carrying that same `validUntil` returns the next code,
    shaped `/^[0-9]{6}$/`, and never the seed.
  - `totpNext|<a stale validUntil>` returns `undefined` — the pair moved on, and half of a newer pair
    is worse than nothing.
  - `totp|<validUntil>` returns the current code; a bare `totp` still resolves the old way, so an
    entry without the preference is untouched.
- `entityFormPanel.test.ts`
  - The checkbox round-trips: checked plus a seed gives `details.totpShowNext === true`; unchecked
    gives `undefined`; checked with no seed and none stored gives `undefined`.
  - An existing preference survives an edit that does not touch the seed.
- `webviewHtml.test.ts` / the viewer page tests
  - With the option on, the page contains the second row and its Copy button; with it off, neither.
  - The rendered HTML contains no seed in either case — the assertion `PLAN_totp.md` established.
  - The page script, parsed as the existing webview tests parse it, re-stamps both Copy buttons'
    `data-field` from each `totp` message, and blanks the next row when a message carries no `next` —
    an implementation that redraws the current code and leaves the second row stale would otherwise
    pass every other check here while showing a pair that is not one.
- Manual, because only a person has a cloud console: bind a real virtual MFA device using the two
  codes the viewer shows, in one pass, without waiting for a redraw.

## Definition of Done

- [ ] `npm test` green in `src_vs_code`, with the new cases named above; `npm run typecheck` and
      `npm run lint` clean; no file over 800 lines; no new `eslint-disable`.
- [ ] `package.json` still has no `dependencies` key.
- [ ] The preference is off by default, and with it off the viewer renders exactly as before.
- [ ] The widened viewer exception is recorded in `research/module_extension.md` §TOTP, alongside the
      sentence it qualifies.
- [ ] The `totp` help article says how to turn the pair on — in all five languages, changed in the
      same commit (a stale translation is invisible to the coverage test).
- [ ] `CHANGELOG.md` [Unreleased] gains an Added entry.
- [ ] The stale `(unreleased)` heading on the QR-paste section of `module_extension.md` is corrected —
      it shipped in 0.78.0.
- [ ] `coai` gate: a `review_plan` round reached `proceed`, a `review_code` round ran on the branch,
      every finding resolved, and the summary reports the verdicts and how many reviewers answered.
- [ ] This plan promoted to `research/` with its deviations recorded.
