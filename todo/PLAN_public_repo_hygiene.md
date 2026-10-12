# PLAN — the public repository carries no real people, private projects or private hosts

> Status: **plan only, 2026-10-12.** Scope: literals in tests, fixtures, comments and docs across
> `src_vs_code`, `src_broker_client/tests`, `src_cli`, `src_mcp/tests`, `src_minimalapi_server`,
> `research/`, `todo/`, `README.md`, `src_vs_code/CHANGELOG.md`; one new CI guard
> (`.github/scripts/public-hygiene.mjs` + a step in `docs.yml`). No product behaviour changes.
>
> Related: [PLAN_release_binaries_carry_their_version.md](../research/PLAN_release_binaries_carry_their_version.md)
> (the earlier sweep that removed real user names and home paths, and found what this plan fixes).

## Symptom

This repository is public. The owner's rule: no real user names, home paths, real people's e-mail
addresses, private project names, private network addresses, keys or tokens. The earlier sweep
(#223/#224) found but did not fix three classes. Measured on `origin/main` (`a9428905`) with the
guard below, before any cleanup: **243 findings** — `name 224`, `e-mail 13`, `private-ip 6` — plus
items no pattern can see:

| class | what | count |
|---|---|---|
| real work e-mail | two real people at the owner's employer's domain | 15 occurrences, 4 files (13 the e-mail rule sees; 2 more are regex literals in `shareDiagnostics.test.ts:40-41`) |
| private project name | the owner's private app (a private Azure DevOps repo), a work VPN profile, two real vault entry names from a real report, the private sibling repository | 224 word hits, 46 files |
| private IP | two real 10.x hosts | 6 occurrences, 6 files |
| private folder | the owner's private top-level folder in `D:\…` paths (also a private repo's name) | 9 occurrences, 6 files |
| real secret fragment | a real DB login, the first characters of its real password, a real RDS host — in the "do not publish" table of `todo/ЗАДАЧА_скриншоты_для_маркетплейса.md:45-48` | 1 table |

Names are not written here on purpose; the guard holds them as digests, and each finding is
reproducible with `node .github/scripts/public-hygiene.mjs` on the parent commit.

## How each class is decided (evidence, not guesses)

- **E-mail.** An address at a real organisation's domain that names a person → a placeholder at
  `example.com` (RFC 2606). Shape kept: two people stay two addresses (`sender@`, `colleague@`); the
  alias test keeps a *different spelling of the same person* (`colleague@` vs
  `colleague.surname@`). Generic local parts at public services or fictional domains (`me@gmail.com`,
  `user1@outlook.com`, `work@corp.com`, `cto@x.dev`) name nobody and stay.
- **Private project names.** Classified by evidence: `gh repo view` says PRIVATE (the sibling
  repository; the three-letter folder name is also a private repo); the app's git remote is a private
  Azure DevOps organisation; the owner's own "must not publish" table names one entry; one entry and
  its host came from a real incident report (`addKeyToAgentReference.test.ts:8`); the VPN name matches
  a real `.ovpn` profile on the owner's machine. Public and kept: CredsForDevs, creds, creds-mcp,
  cred-vault-server, every PUBLIC `dew_flow_*` repo, coai / ConnectOtherAIs, wsl_care, Agent-relay, the
  Marketplace publisher id and SonarCloud organisation (public by nature), the LICENSE holder.
  `ask_consultants` was asked about the three least certain names: `none_available`.
- **Replacements keep the test meaningful.** Each replacement keeps the first letter where a fixture
  is sorted or compared (`depGraph.test.ts`, `treeProviderDependsOn.test.ts`), keeps case and spacing
  variants in step (`'  X   Y  '` → `'X Y'` in `brokerCaller.test.ts:163`), and keeps the derived
  forms consistent (`d:\…\Folder` → `d--…-Folder` in `SessionTitleTests.cs:269`). Both sides of every
  assertion change together.
- **Private IPs.** No affected test depends on the address being private (a form title, a stored
  host, a comment quoting a report) → RFC 5737 `203.0.113.x`. Tests that DO check private-range or
  "on our network" logic already use neutral addresses (`10.0.0.5`, `192.168.1.10`) and stay.
- **The secret fragment.** The table's "must not" column becomes a description of each class ("a
  real internal IP of a work host", …), never the value. Rewriting history is out of scope (not asked,
  destructive); the owner is told to rotate that DB password, because the fragment is in history.
- **Left for the owner** (listed in the PR, by file:line): the deploy workflow's file name, display
  name, concurrency group and GitHub environment name — renaming the environment would orphan its
  secrets, so it is the owner's move, not a hygiene edit. `.claude/rules/shared` (another repo's
  submodule) is not touched.
- **CHANGELOG.** Released history is replaced in place only where it holds a private name (4 lines);
  the PR says so.

## The guard

`.github/scripts/public-hygiene.mjs` scans every tracked file (and every tracked path) and fails on:

1. `e-mail` — a domain outside an allowlist of placeholder (RFC 2606/6761, `.internal`), fictional and
   public-service domains already used by fixtures;
2. `private-ip` — an RFC 1918 address outside `10.0.0.0/24`, `172.16.0.0/24`, `192.168.0.0/23`, and
   `10.255.255.1` (the conventional black hole the broker itest uses);
3. `home-path` — `C:\Users\<x>`, `/mnt/<d>/Users/<x>`, `/home/<x>`, `/Users/<x>` with `<x>` not a
   placeholder;
4. `name` — a word, or two words joined by one `-`, `_`, `.`, space or slash, whose SHA-256 is in a
   digest list. The list never spells a name; a short name's digest can be brute-forced, which the
   script says — the goal is that names do not come back, not that they become secret.

`--selftest` runs 22 fixture cases (each rule fires; each placeholder passes; a planted digest of a
made-up word is caught in three spellings and not in near misses). `docs.yml` runs both.
Not covered by design: secret fragments (no pattern separates one from a fixture) and the deploy
workflow name (left for the owner).

## Build order

1. Guard + selftest; record RED on the untouched tree (243).
2. Clean e-mails, IPs, the secret table, private folder paths.
3. Clean private project names (tests first, then code comments, docs, CHANGELOG).
4. Guard GREEN; plant one sample → RED; remove the plant → GREEN.
5. Wire into `docs.yml`. Tests, typecheck, lint. Promote this plan.

## Test plan

- `node .github/scripts/public-hygiene.mjs --selftest` → 22 ok; the tree scan RED (243) before, GREEN
  after, RED with one planted sample.
- xUnit v3 executables one after another, at lowered priority: CredsBroker.Tests, CredsCli.Tests,
  CredsMcp.Tests, CredVaultServer.Tests (touched: `CallerIdentityTests`, `SessionTitleTests`,
  `CliContractTests`, `CallerForwardingTests`, `FolderToolsTests`, `StartupTests`, `UseToolsTests`,
  `InstanceFileTests`).
- `src_vs_code`: `npm run typecheck`, `npm run lint`, `npm test` — all touched test files pass with
  every assertion still comparing the same two things.
- `plan-lifecycle.mjs` clean after promotion.

## Definition of Done

- [ ] The guard reports `clean` on the branch, and is a step of `docs.yml`.
- [ ] RED (before) / GREEN (after) / RED (planted) recorded in the PR.
- [ ] All suites green; no assertion weakened.
- [ ] No private name in a commit message, PR text, comment, test name or this plan.
- [ ] PR typed `chore:` (no release proposed), merged green, Sonar gate passed.
- [ ] This plan promoted to `research/` with `IMPLEMENTED <date>` and a `research/README.md` row.
