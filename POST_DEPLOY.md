# Post-deploy checks — cred vault server

Per [`.claude/rules/shared/common/post-deploy-checks.md`](.claude/rules/shared/common/post-deploy-checks.md).
Every item below is something a green build cannot tell you, because it is decided by the host rather
than by the code: the reverse proxy, the certificate, an environment variable, and whether the deploy
happened at all. Twelve is the cap; there are seven.

Target: the deployed vault, as an origin — `--target https://vault.example.com`
Last verified: 2026-09-03 · http://127.0.0.1:5099 — **a local server, not the deployment**: items 1 and 2 PASS; item 5 correctly FAILS there because no Microsoft scope is configured; items 3, 4, 6 and 7 need the real host. Run it against the deployment after the next deploy and replace this line with what you saw.

| # | What a person loses if this is broken | Check | Auto |
|---|---|---|---|
| 1 | Nothing works: no sync, no sharing, no sign-in — and if the volume is merely unwritable, every write fails while the process looks alive | `node -e "fetch(process.env.TARGET+'/api/health').then(r=>r.json()).then(h=>process.exitCode=+(h.status==='ok'&&h.storage==='writable'?0:1))"` | auto |
| 2 | Everyone keeps running against last week's server while the release notes say otherwise — the deploy is a separate manual dispatch, and on 2026-08-26 nobody had triggered it | `node -e "fetch(process.env.TARGET+'/api/health').then(r=>process.exitCode=+(r.headers.get('x-creds-contract')===(process.env.EXPECTED_CONTRACT\|\|'2')?0:1))"` | auto |
| 3 | The certificate expires and every client fails to connect at once, with no warning and nothing to roll back | `node -e "const t=require('tls'),u=new URL(process.env.TARGET);const s=t.connect({host:u.hostname,port:u.port\|\|443,servername:u.hostname},()=>{const d=(new Date(s.getPeerCertificate().valid_to)-Date.now())/86400000;console.log(Math.round(d)+' days left');s.end();process.exitCode=+(d>14?0:1)})"` | auto |
| 4 | Somebody's token travels in the clear because the plaintext port answers instead of redirecting | `node -e "const u=new URL(process.env.TARGET);fetch('http://'+u.hostname+'/api/health',{redirect:'manual'}).then(r=>process.exitCode=+(r.status>=300&&r.status<400?0:1)).catch(()=>process.exitCode=+(0))"` | auto |
| 5 | Sign-in appears to work and the Team is empty with no error — the scope the server advertises is unset, so every developer must paste it into their own settings | `node -e "fetch(process.env.TARGET+'/api/client-config').then(r=>r.json()).then(c=>process.exitCode=+(c.microsoftScope?0:1))"` | auto |
| 6 | The backups are not being written, and nobody finds out until a restore is needed | Look at `BACKUP_DIR` on the host: last night's archive exists and its size is in the usual range. `deploy/restore.sh` is what would read it | manual |
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
