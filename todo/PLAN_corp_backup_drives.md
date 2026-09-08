# PLAN — OneDrive and Google Drive as backup destinations

> Status: **plan only, nothing implemented yet.** Scope: a third and fourth `IArchiveTarget`, the
> consent flow that gets a refresh token, and the server's custody of it.
>
> Extracted from [PLAN_corp_server_backup.md](../research/PLAN_corp_server_backup.md) when that plan
> was promoted on 2026-09-07. Its *Phase 2* section reserved the seam and built nothing behind it,
> and a whole unbuilt feature living inside a document filed as documentation is a feature nobody
> finds. The seam itself is real and shipped: `IArchiveTarget` in
> `src_minimalapi_server/src/ArchiveTarget.cs`, with two implementations against it.
>
> Related docs: [module_server.md](../research/module_server.md) (the backup run, the targets, the
> save-time probe), [module_deployment.md](../research/module_deployment.md),
> [PLAN_corp_control_plane.md](../research/PLAN_corp_control_plane.md) (the umbrella's Boundaries
> table and its growth budgets).

## The symptom

A deployment that wants its encrypted archive off the machine needs an S3-compatible bucket or an
Azure Blob container. That is the right first pair — they are what a company running its own server
usually already has — and it is a poor fit for the smallest deployments this product is also for: a
consultancy of four people has a Microsoft 365 or a Google Workspace tenant and no object storage at
all, and asking them to open an AWS account to keep one 400 MB file is asking them to run
infrastructure they otherwise do not need.

## Why this is a separate plan and not a fourth target

Because it is not a fourth target. S3 and Azure Blob authenticate with a **static credential the
administrator already holds** — an access key, an account key — which the server seals under the
deployment KEK and uses for ever. A drive authenticates with a **delegated grant**, and that is a
different shape in three ways the existing code has nowhere to put:

1. **Somebody has to consent, in a browser.** There is no key to paste. The extension has to run an
   authorization-code flow and hand the result to the server.
2. **What the server custodies is a refresh token**, not a credential — a third class of secret on
   this server, after vault ciphertext and cloud credentials.
3. **A grant can be revoked from the other side.** An access key stops working when somebody deletes
   it, which is rare and deliberate; a refresh token stops working when an administrator leaves, when
   a tenant policy changes, or when a user clicks *remove access* in a settings page this product
   does not control. That is a failure mode with no equivalent today, and the run's status has to be
   able to say it in words an admin can act on.

## What must be true when it is done

1. An administrator picks **OneDrive** or **Google Drive** as a destination kind, consents once in a
   browser, and the archive lands in a folder they chose.
2. The server holds the refresh token sealed under the deployment KEK, returns it on no route, and
   refreshes its own access token per run.
3. A grant that has been revoked produces a NAMED failure — "this deployment's access to
   *name*'s OneDrive was withdrawn; re-consent" — rather than a 401 with a stack trace, and the
   backup notice says it out loud, because a destination that silently stopped accepting archives is
   the failure this whole epic exists to end.
4. Retention works there exactly as it does at a bucket, including the floor that never empties a
   destination.
5. Nothing about the existing two targets changes. `IArchiveTarget` is the contract; if it needs
   widening, that widening is part of this plan and is stated as a deviation.

## The open questions, and they are the reason this is a plan rather than a task

- **Whose grant is it?** The consent belongs to a PERSON — the administrator who clicked — and the
  backup belongs to the DEPLOYMENT. When that person leaves the company, the deployment's off-site
  backup stops working, and nobody finds out until the notice fires. The alternatives are an
  application-level grant (Entra app permissions / a Google service account with domain-wide
  delegation), which is a different consent given by a different person and not available in every
  tenant, or accepting the personal grant and making its fragility loud. **This is an owner
  decision** and it should be made before anything is built.
- **Where does the consent happen?** The extension already runs an authorization-code + PKCE flow
  against a loopback listener for Google sign-in (`googleAuthProvider.ts`), and VS Code's built-in
  Microsoft provider covers the other. Reusing them means the files scope is added to the
  deployment's existing application registration, which the operator must do by hand and which
  changes what every developer's sign-in asks for. Reusing them is still almost certainly right —
  the alternative is a second application to register — but the consequence belongs in the plan.
- **Does the refresh token travel through the extension?** It has to reach the server, and the
  server cannot open a browser. So it passes through the client that did the consenting, once. That
  is a secret in the extension's hands for the length of one request, which is a thing this product
  has been careful never to need.

## Files, provisionally

| File | New/modify | Responsibility |
|---|---|---|
| `src_minimalapi_server/src/DriveTarget.cs` | new | Microsoft Graph and Google Drive over their REST APIs, against `IArchiveTarget` |
| `src_minimalapi_server/src/DriveGrant.cs` | new | The refresh token sealed under the KEK, and the access-token exchange per run |
| `src_minimalapi_server/src/BackupTargets.cs` | modify | Two more `TargetKinds`, two more branches in the factory's switch — which already refuses an unknown kind rather than defaulting to one |
| `src_minimalapi_server/src/OrgBackupEndpoints.cs` | modify | The route that accepts a consent result |
| `src_vs_code/src/orgBackupPanel.ts` | modify | The consent button and what it does with what comes back |

## Test plan

The signers' pattern applies: whatever can be pinned against a published example is. Beyond that,
the same stubbed-transport tier the S3 and Azure clients use (`StubTransport.cs`) — what the client
SENDS, and what it makes of each answer, including the revoked-grant answer, which is the one worth
writing first because it is the one that will actually happen.

**What no test will cover, and should be said now:** nothing here will prove that Microsoft or Google
accept what this client sends. The save-time write probe is the honest substitute, exactly as it is
for the buckets.

## Risks

1. **A third class of custodied secret**, and the first one whose validity depends on somebody else's
   policy.
2. **The personal-grant problem above.** If it is not decided first, it will be decided by accident.
3. **Two more API surfaces to keep working**, both of which version independently of this product.

## Definition of Done

- [ ] The owner decision on whose grant it is, recorded here before any code.
- [ ] Both targets ship with the stubbed-transport tier and the revoked-grant case among the first
      tests written.
- [ ] The save-time probe writes and deletes, as it does for the other two.
- [ ] `research/module_server.md` and `module_deployment.md` updated; the umbrella's growth budget
      gains a row per destination kind.
- [ ] The `coai` gate: plan round to `proceed`, code round, findings resolved.
