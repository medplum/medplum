# MedsScript — Overnight Progress & Morning Brief

_Autonomous build session. I made scoped decisions myself and staged anything
needing your approval below. Nothing was merged to `main` (so no auto-deploys
fired) — review the PR, then merge when happy._

## ✅ Live right now
- **API**: https://api.medsscript.com (`/healthcheck` ok, postgres+redis)
- **Admin app**: https://app.medsscript.com (base Medplum, super-admin)
- **Provider portal**: https://provider.medsscript.com (MedsScript-branded, standalone)
- Backend trimmed for non-prod: **1 NAT gateway**, 1 Aurora t3.medium, 1 Fargate task (2 GB), 1 Redis node.

## 🟢 Decisions I made autonomously (FYI — flag any you disagree with)
- **Tenancy**: group = Medplum `Project`, clinic = `Organization`, isolation via `AccessPolicy` (MSO pattern). Chosen for shared-marketplace + clinic-switching + PHI-safe.
- **App hosting**: each app standalone under `apps/*` on the **published** `@medplum` SDK; `medplum/` core stays pristine. Static → S3+CloudFront (~$0).
- **Billing model**: transaction = Rx + diagnostic orders + marketplace orders; subscription **per clinic**. Plans seeded: Starter/Growth/Scale.
- **CORS**: server `allowedOrigins` now lists provider + localhost:3001 (app auto-allowed).

## 🔴 Needs YOU in the morning (staged — did not block on these)
1. **Run the seed** — needs a ClientApplication credential (I can't use your login). Steps in `seed/README.md`.
2. **Deploy the Bots** — Bot deploy needs auth; code is in `bots/`, deploy steps in `bots/README.md`.
3. **Clinical review** — questionnaire/protocol content are starter templates; a prescriber should review doses/schedules.
4. **AccessPolicy review** — validate `seed/seed-bundle.json` AccessPolicy vs `examples/medplum-mso-demo` before real PHI.
5. **External integration creds** (later phases): Shopify, Stripe, GoHighLevel, Oura/Whoop, pharmacy APIs.

## 🛠️ Built tonight
_(updated as work lands — see PR for the diff)_
