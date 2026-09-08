# Post-deploy checks — cred vault server

Per [`.claude/rules/shared/common/post-deploy-checks.md`](.claude/rules/shared/common/post-deploy-checks.md).
Every item below is something a green build cannot tell you, because it is decided by the host rather
than by the code: the reverse proxy, the certificate, an environment variable, and whether the deploy
happened at all. Twelve is the cap; there are seven.

Target: the deployed vault, as an origin — `--target https://vault.example.com`
Last verified: 2026-09-08 · **the deployment**, immediately after `rsd server deploy` shipped **0.6.0** · all five automated items PASS, run by the deploy workflow itself — including item 2 at its new expectation (see below). The certificate had 75 days left. Items 6 and 7 are a person's and were not covered by that run.

> **Item 2's new expectation has now been watched passing.** Epic 3 raised the contract floor to 4,
> so `EXPECTED_CONTRACT` defaults to `4` here — and between 2026-09-06 and the 0.6.0 deploy that value
> was a check nobody had seen pass, which is why the stamp was deliberately left behind until it had.
> The 0.6.0 deploy is that run: the server answers `X-Creds-Contract: 4`.
>
> **What 0.6.0 does NOT cover, on this deployment specifically.** Its `.env` carries no recovery
> officers and no login-key KEK, so corp mode is off and `Vault:LoginKey:Kek` is unset. Every
> `/api/org/*` route is therefore refused after authentication, and the backup subsystem cannot mint
> a key or take a run at all. The routes themselves ARE live — probed from the host,
> `/api/org/backup/status` and `/api/org/backup/archive` answer `401` and `/api/org/backup/settings`
> answers `405` to a GET, against `404` for a route that does not exist on this build — but item
> 6(b) cannot be satisfied here until somebody decides to make this a corporate deployment. That is
> a decision rather than a setting: turning on the officer roster seals every vault on the server to
> a quorum, which is what item 7 exists to make deliberate.

| # | What a person loses if this is broken | Check | Auto |
|---|---|---|---|
| 1 | Nothing works: no sync, no sharing, no sign-in — and if the volume is merely unwritable, every write fails while the process looks alive | `node -e "fetch(process.env.TARGET+'/api/health').then(r=>r.json()).then(h=>process.exitCode=+(h.status==='ok'&&h.storage==='writable'?0:1))"` | auto |
| 2 | Everyone keeps running against last week's server while the release notes say otherwise — the deploy is a separate manual dispatch, and on 2026-08-26 nobody had triggered it | `node -e "fetch(process.env.TARGET+'/api/health').then(r=>process.exitCode=+(r.headers.get('x-creds-contract')===(process.env.EXPECTED_CONTRACT\|\|'4')?0:1))"` | auto |
| 3 | The certificate expires and every client fails to connect at once, with no warning and nothing to roll back | `node -e "const t=require('tls'),u=new URL(process.env.TARGET);const s=t.connect({host:u.hostname,port:u.port\|\|443,servername:u.hostname},()=>{const d=(new Date(s.getPeerCertificate().valid_to)-Date.now())/86400000;console.log(Math.round(d)+' days left');s.end();process.exitCode=+(d>14?0:1)})"` | auto |
| 4 | Somebody's token travels in the clear because the plaintext port answers instead of redirecting | `node -e "const u=new URL(process.env.TARGET);fetch('http://'+u.hostname+'/api/health',{redirect:'manual'}).then(r=>process.exitCode=+(r.status>=300&&r.status<400?0:1)).catch(()=>process.exitCode=+(0))"` | auto |
| 5 | Sign-in appears to work and the Team is empty with no error — the scope the server advertises is unset, so every developer must paste it into their own settings | `node -e "fetch(process.env.TARGET+'/api/client-config').then(r=>r.json()).then(c=>process.exitCode=+(c.microsoftScope?0:1))"` | auto |
| 6 | The backups are not being written, and nobody finds out until a restore is needed | **Both of them, since epic 5.** (a) `BACKUP_DIR` on the host: last night's tar exists and its size is in the usual range — `deploy/restore.sh` reads it. (b) The server's own encrypted backup: open ***Server Backup…*** on an admin account and press **Back up now** — a SUCCESSFUL run after this deploy, not the last one on the page. A stale success survives a deploy that lost `Vault:LoginKey:Kek`, and in that state the server writes `LOGIN KEYS ARE OFF` at startup, mints no key and refuses every scheduled run while the page still shows last week's green | manual |
| 7 | Every vault on the server is (or is not) sealed to a recovery quorum, against the operator's intention — an escrow nobody meant to enable, or one they did | `docker compose logs vault` names `CORPORATE RECOVERY IS ON/OFF` at startup: read it and confirm it matches what this deployment is meant to do | manual |

## What is deliberately not here

**An authenticated round trip.** It is the check worth the most — `GET /api/whoami` and `GET /api/vault`
prove authorization, storage and the proxy in one call — and it cannot run unattended today: Microsoft
and Google tokens exist only after an interactive sign-in, and the `Local` scheme's key mints a token
for *any* email, so putting it where CI can reach it is a decision nobody has made. The three options
are recorded in
[`todo/PLAN_prod_checks_and_http_contracts.md`](.claude/rules/shared/todo/PLAN_prod_checks_and_http_contracts.md)
in the conventions repository. Until one is chosen, items 1–5 are what runs.

**The extension.** It ships on its own clock, to the marketplace, and its post-deploy checks belong
with it rather than with the server — the two halves are deployed separately, which is the whole reason
this file exists.

**The six `/api/org/backup/*` routes (epic 5).** Every one is behind `RequireAdmin`, so they fall
under the exclusion above for the same reason epic 3's do: there is no unattended way to reach them
today, and inventing one would mean putting a token where CI can read it. They are covered before the
deploy by the `.http` contract suite against a started stack. What a deploy CAN break and a suite
cannot see is whether `Vault:LoginKey:Kek` reached the container — without it the server answers every
backup route and logs `LOGIN KEYS ARE OFF` at startup, which is the same line item 7 is read for.
That is why item 6 now names the server backup as well as the host's tar: the two fail for completely
different reasons and only one of them is visible on the host's disk.

**The corporate project routes (epic 3).** Every one of them — the project store, the assignments, the
share rule, the folder-removal acknowledgement — is behind authentication, so they fall under the
exclusion above rather than being a new item: there is no unattended way to reach them today, and
inventing one would mean putting a token where CI can read it. They are covered before the deploy
instead, by the `.http` contract suite against a started stack. **What the deploy DOES have to get
right is item 2**: epic 3 raises the contract floor, so `EXPECTED_CONTRACT` moves with the release —
a server left on the previous build serves the old number and every updated client is refused at the
door, which is exactly the failure item 2 exists to catch.

## Running it

```bash
node .claude/rules/shared/tools/post-deploy-check.mjs --target https://vault.example.com
```

Nothing is executed without `--target`; without it the check only reads this file's shape (the cap, a
command or an admitted `manual` on every item, the stamp). The prod-safe half of the `.http` suite is
the same idea one level down:

```bash
node .claude/rules/shared/tools/http-run.mjs --tag prod --target https://vault.example.com
```
