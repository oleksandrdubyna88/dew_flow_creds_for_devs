# PLAN — Generate passwords, passphrases and Ed25519 keys

> Status: **IMPLEMENTED, 2026-08-25.** Scope: `src_vs_code/src/secretGenerator.ts`, the entity form,
> and `credSshManager.generateSecret`.
>
> Related docs: [module_extension.md](module_extension.md),
> [PLAN_audit_roadmap_2026_08_25.md](../todo/PLAN_audit_roadmap_2026_08_25.md) (item **D5**).

## Symptom

A manager that stores a password but cannot make one leaves the user inventing it — and an invented
password is the weak one the health report (**D6**) then complains about. The audit named the sharper
case too: generating an SSH key in the form is *the only way a fresh key never touches disk*, because
`ssh-keygen` writes to a file by definition.

## What shipped

- `generatePassword` — length, four selectable classes, an ambiguous-character filter, one character
  guaranteed per selected class, then shuffled so the guaranteed ones are not at fixed positions.
- `generatePassphrase` — exactly **256** four-letter words, so the strength is eight bits per word
  with no rounding. Capitalisation and a trailing digit satisfy composition rules and are
  deliberately **not** counted as entropy.
- `generateEd25519` — a PKCS#8 PEM in memory, straight into SecretStorage; with the SSH agent
  (**D1**) it is then used without ever becoming a file.
- Buttons in the form's Secret and SSH key sections, plus a palette command for the passwords that
  are not stored here at all.

## Deviations

- **The word list is ours, not the EFF's.** The EFF short list is 1296 words under CC-BY; an
  attribution obligation inside an MIT extension, for 2.3 extra bits per word, is a poor trade. The
  test asserts the count *and* the uniqueness, which is what the arithmetic actually rests on.
- **The reported entropy is that of the plain uniform draw**, which very slightly overstates the
  constrained one. Said in the code rather than quietly rounded; the difference is under a bit at
  these lengths.
- **Generation happens in the extension host, not the page.** `crypto.randomInt` is a Node API, and a
  webview reaching for `Math.random()` would produce something that only looks random. The value then
  travels INTO the form — the one panel where that is correct, because its inputs already hold typed
  secrets by design. The read-only viewer still receives none.

## Test plan (done)

`secretGenerator.test.ts`: length and alphabet, every selected class present over 200 draws, a
switched-off class never present, the ambiguous filter, the shuffle (the first character varies), two
draws differing, entropy tracking the alphabet, the empty-selection case, the 256-word list and its
uniqueness, decoration not counted as strength, and a generated key that `sshKeyParse` accepts and
the agent can serve.
