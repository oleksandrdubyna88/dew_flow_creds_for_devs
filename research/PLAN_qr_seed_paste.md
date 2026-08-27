# PLAN — a TOTP seed arrives as a pasted QR image, not as text nobody can get

> Status: **IMPLEMENTED, 2026-08-27.** Scope: `src_vs_code/src/` — five new modules
> (`qrSample.ts`, `qrDecode.ts`, `otpMigration.ts`, `qrPaste.ts`, `qrPasteScript.ts`), the TOTP
> section of the entity form, and one new round-trip in the form panel.
>
> Related docs: [module_extension.md](module_extension.md),
> [PLAN_totp.md](PLAN_totp.md) (this closes the input its *Open tail* named),
> [PLAN_import.md](PLAN_import.md).
>
> **Deviations from the plan, and what they cost.**
>
> - **The reader is two modules, not one.** `qrSample.ts` (pixels → modules) and `qrDecode.ts`
>   (modules → text) split because the 800-line ceiling would not hold both, and the split turned
>   out to be the right seam anyway: the tests decode fixture *matrices* through one and rendered
>   *pictures* through the other, so a failure says which half broke.
> - **Four bugs found by the fixtures, each invisible to the case above it.** (1) Stepping over the
>   vertical timing column must move the loop variable itself, or every column pair to its left
>   overlaps. (2) Berlekamp–Massey's swap is not an alternative to the locator update but a choice
>   of what to update — written as an `else` it passes every clean symbol and repairs nothing, which
>   is the least useful place for a bug to hide. (3) A threshold block that falls entirely inside one
>   dark module has no statistics of its own; without the neighbour rule the reader fails only on
>   *large* pictures. (4) The module size measured across a row is inflated by up to forty per cent
>   when the symbol is rotated — measuring it along the axis between finders is what made 33° work.
> - **The finder triple is chosen by geometry, not by vote count.** The first version-18 fixture had
>   its true bottom-left pushed out of the top three by a false pattern with equally many votes.
> - **Shift-JIS was added after the fact.** A great many symbols carry Japanese with no ECI header;
>   read as UTF-8 they "succeed" as replacement characters, which is worse than failing.
> - **The corpus grew from the plan's six cases to forty-one**, at the owner's request, and they are
>   real payload shapes — app stores, device sign-in, café wi-fi and menu, vCard/MECARD, SEPA, UPI,
>   bitcoin, a poster campaign, a calendar invitation, Ukrainian and Japanese text.
> - **`encodeBase32` was added to `totp.ts`** rather than written again: that module already owns the
>   alphabet, and a second copy of it is a second thing to keep right.
> - **Two neighbouring extractions were forced by the ceiling**, exactly as `PLAN_depends_on.md`
>   records happening to it: the page script moved to `qrPasteScript.ts`, the Steam marker helpers to
>   `totpSteam.ts`, and `answerRoundTrip` became a dispatch table rather than a fourth `if`.
>
> **Measured.** All 41 corpus symbols decode from their matrices and from rendered pictures at 2 and
> 9 px per module, inverted, noisy, blurred, cropped to one module of quiet zone, and rotated by 7°,
> 33° and 90°; a symbol pasted with page furniture around it decodes; damage past what the level can
> carry is refused rather than guessed at every level tested. Against 44 hand-held **photographs**
> from a third-party corpus — a far harder input than the screenshot this feature is for, and used at
> authoring time only — 26 decode.
>
> **Open tail.** Three things, none of them in this plan's scope:
> 1. **Bulk import** — "take every account in this export as new entities". The owner chose the form
>    button; `importEntities` (`extension.ts:4619`) already takes exactly what `otpMigration.ts`
>    produces, so it is a small addition rather than a design question.
> 2. **The photograph path.** 18 of the 44 hard photographs fail, mostly at the format code, which
>    means the grid is laid out slightly wrong on a perspective-distorted symbol. A camera-grade
>    reader would refine the finder centres and follow the timing pattern; a paste-a-screenshot
>    reader does not need to.
> 3. **The manual check with a real phone** is the one thing no test can do — see the DoD below.

## Symptom

TOTP shipped with one input: the `otpauth://` URI or the base32 secret, as text. That text is exactly
what a person cannot get. Google Authenticator exports **only** as a QR image — *Transfer accounts →
Export accounts* draws `otpauth-migration://offline?data=<base64 protobuf>` on the screen and offers
no other form. Microsoft Authenticator exports nothing at all, in any form, which is a fact about that
product and not a gap this plan can close. And the everyday case has the same shape: a service shows a
QR at enrolment, and the "can't scan?" text key is a link some sites bury and some omit.

So the field exists and stays empty. The owner's requirement is explicit and it is the right one:
**paste the picture from the clipboard** (`Ctrl+V`), not pick a file — the gesture that already exists
on Windows is `Win+Shift+S`, which puts the snip on the clipboard and nowhere else.

## Goal

- The TOTP section of the entity form takes a **pasted image**, decodes the QR in it, and fills the
  seed field with a canonical `otpauth://` URI.
- Both payloads are understood: a plain `otpauth://totp/…` (one account) and Google's
  `otpauth-migration://offline?data=…` (N accounts in one picture).
- Several accounts in the picture → the page lists them by issuer and label and takes one. HOTP
  entries are listed as **refused, with the reason**, never silently dropped.
- **No runtime dependency is added.** The owner chose this explicitly over `jsqr@1.4.0`; the
  extension's zero-dependency property is stated in [README.md:166](../README.md) and
  [module_extension.md:3](../research/module_extension.md) and stays true.

## Where it plugs in (verified 2026-08-27)

| Concern | File | Today |
|---|---|---|
| Seed field markup | `entityFormPage.ts:259-275` | one `<input id="totp">`, a Steam checkbox, a Clear checkbox |
| Page CSP | `entityFormPage.ts:346-347` | `default-src 'none'; script-src 'nonce-…'` — a canvas needs nothing more |
| Binary already crosses the boundary | `entityFormScript.ts:481-509` | `wireBinary` reads a *file* as base64 through `FileReader`; a paste has no file input at all |
| Save-time shape check | `entityFormScript.ts:699-703` | the page pre-checks the seed, the host re-checks with the real parser |
| Round-trips (page asks, host answers) | `entityFormPanel.ts:359-379` (`answerRoundTrip`) | three of them; nothing is stored on either side |
| Message union | `entityFormPanel.ts:186-203` | `FormMessage` — seven types |
| The real parser | `totp.ts:parseTotpSecret` | takes `otpauth:`, takes bare base32, **refuses every other scheme** — so `otpauth-migration://` is refused today, correctly |
| The bulk alternative, not built | `extension.ts:4619` (`importEntities`) | takes `ImportedEntity[]` (`importFormats.ts:25-45`), which is the exact shape a decoded export produces |

## Design

**1. `qrDecode.ts` — pure, `vscode`-free, no dependencies.**
`decodeQr(gray, width, height)` answers the decoded text or a reason. Otsu threshold over the whole
image (a screen capture is uniformly lit), the 1:1:3:1:1 finder scan, three finder centres →
orientation and module size, version from the module count, a four-point homography refined by the
bottom-right alignment pattern when the version has one, format info by minimum Hamming distance over
the 32 valid BCH words, unmask, the zigzag codeword read, de-interleave by the version/EC block table,
Reed–Solomon over GF(256) (syndromes → Berlekamp–Massey → Chien/Forney), then numeric / alphanumeric /
byte segments. Rotation is free: the homography comes from the finders, so a sideways snip decodes.

**2. `otpMigration.ts` — pure.** `parseOtpQrText(text)` → `{ accounts, skipped }`. A plain `otpauth:`
string is one account, handed straight to `parseTotpSecret`. A migration URI is base64 (URL-safe or
standard) → a **minimal protobuf wire reader** (varint + length-delimited only, ~60 lines; the schema
is five fields on one message) → per account: secret bytes → base32 → a canonical `otpauth://totp/…`
built with the algorithm, digits and period the export carried. `type=HOTP` is skipped with its name
and the reason, because a counter-based code cannot survive being in two places.

**3. Decoding happens in the HOST, not in the page.** The page script is a template string that the
compiler never type-checks (`entityFormScript.ts` says so itself, and `webviewHtml.test.ts` parses it
for exactly that reason) — seven hundred lines of table-driven bit work do not belong there. The page
does only the part the host cannot: get the bitmap out of the clipboard. So:

- page: `paste` → `clipboardData` image → `createImageBitmap` → canvas → `getImageData` → grayscale,
  longest side capped at 1600 px (downscale only) → base64 → `postMessage({type:'qrImage', …})`;
- host: `answerRoundTrip` → `decodeQr` → `parseOtpQrText` → `postMessage({type:'qrResult', accounts,
  skipped, error})`;
- page: one account fills `#totp`; several draw a list; none shows why.

Grayscale rather than the PNG bytes because the host has **no image decoder** — Node has none and we
are adding no dependency, and the webview's canvas is the only one in the process. Base64 rather than
a typed array because a webview message is JSON: a `Uint8Array` arrives as an object with numeric keys.

**4. What crosses into the webview is a seed, and that is consistent.** `PLAN_totp.md` records that
the *viewer* never receives a seed. This is the *form*, which already holds every plaintext secret it
is editing; the seed field is where a person types a seed today.

**5. Deliberately not built:** "import every account in this export as new entities". The owner chose
the form button. Nothing is closed off — `importEntities` takes exactly what `otpMigration.ts`
produces.

## Build order

1. `qrDecode.ts` + its tests, against matrices generated by a third-party encoder (`qrcode` on npm,
   used **at authoring time only, outside the repository**) — the tables are the risk, and a
   round-trip against my own encoder would cancel a table bug out.
2. `otpMigration.ts` + its tests, including a real Google export payload shape and an HOTP refusal.
3. The form: markup (`entityFormPage.ts`), paste + picker (`entityFormScript.ts`), the round-trip
   (`entityFormPanel.ts`).
4. `research/module_extension.md` — the TOTP section gains the input path; the "zero runtime
   dependencies" line gains the reason it survived a QR decoder.

## Test plan

- `qrDecode.test.ts`: versions 1 / 5 / 20+ at EC levels L and M, byte and alphanumeric segments, a
  quiet zone, 3× and 7× module scales, a 90°-rotated matrix, an inverted (dark-mode) render, a render
  with added noise, and a garbage image that must answer a reason rather than throw.
- `otpMigration.test.ts`: a single `otpauth://`, a two-account migration payload, URL-safe base64,
  SHA256 / 8-digit / 60-second parameters preserved, an HOTP entry skipped **with its name**, a
  truncated payload refused.
- `entityFormPage.test.ts` / `webviewHtml.test.ts`: the new markup and the new script still parse.
- Manual, because only a person has the clipboard: a real Google Authenticator export QR, snipped with
  `Win+Shift+S`, pasted into the form — the code the extension then shows must match the phone.

## Definition of Done

- [x] `npm test` green in `src_vs_code`: **2305 passed, 0 failed** (4 pre-existing skips), including
      the three new suites — `qrDecode.test.ts`, `qrSample.test.ts`, `otpMigration.test.ts`.
- [x] `npm run typecheck` and `npm run lint` clean; no file over the 800-line ceiling.
- [x] `package.json` has no `dependencies` key — the property the README claims is still true.
- [x] **A pasted QR fills the field and the entry produces working codes.** Checked by the owner on
      2026-08-27 against a **real VPN** enrolment QR — the one thing no test can do, because it needs
      a clipboard, a picture nobody made for this reader, and a service that accepts the result.
- [x] An image with no QR, and a QR that is not an OTP payload, both say so instead of failing
      silently — `a picture with no QR code in it says so instead of inventing one`, and
      `a QR that is not an authenticator code says what it actually is`.
- [x] `research/module_extension.md` updated; this plan promoted per
      [planning-docs.md](../.claude/rules/shared/common/planning-docs.md).
