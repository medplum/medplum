# MedsScript — Overnight Progress & Morning Brief

_Autonomous build session. Everything is committed to branch
**`medsscript-branding-and-cicd`** and pushed — **not merged to `main`**, so no
auto-deploys fired. Review the diff, then merge when happy. Static apps were
deployed manually (URLs below) so you can click around now._

## ✅ Live right now
| URL | What |
|---|---|
| https://api.medsscript.com | Medplum API (healthcheck ok) |
| https://app.medsscript.com | Base Medplum admin (super-admin) |
| https://provider.medsscript.com | **MedsScript clinic portal** — teal-themed, Protocols, Billing, Marketplace |
| https://patient.medsscript.com | **MedsScript patient portal** — rebranded |

Non-prod backend trimmed: **1 NAT gateway**, 1 Aurora t3.medium, 1 Fargate task (2 GB), 1 Redis node. The two apps cost ~$0 (CloudFront free tier).

## 🛠️ Built tonight (branch `medsscript-branding-and-cicd`)
- **`apps/provider`** — standalone clinic portal (published `@medplum` SDK): MedsScript teal theme + logo, **Protocols** page (list PlanDefinitions → enroll patient = CarePlan), **Billing** dashboard (plan cards, this-month ChargeItems, invoices), **Marketplace** catalog + client-side cart (gated on instance mode), `MEDPLUM_INSTANCE_MODE` flag (marketplace|api).
- **`apps/patient`** — standalone patient portal from foomedical, rebranded to MedsScript.
- **`seed/`** — one re-runnable FHIR transaction, **31 resources**: demo group + clinic + AccessPolicy, 3 billing plans, 6 questionnaires, 7 clinical protocols, 12 catalog products. Uploader script + README.
- **`bots/`** — platform billing: `meter-transaction` (Rx/diagnostic → ChargeItem per clinic) + `monthly-invoice` (aggregate + subscription → Invoice). Type-checks clean.
- **`.github/workflows/deploy-provider.yml`** — provider auto-deploy on push to main (OIDC).
- **cdk** — new `natGateways` config knob; non-prod set to 1.
- Server CORS `allowedOrigins` now includes provider + patient (+ localhosts for dev).

## 📊 Phase status
| Phase | State |
|---|---|
| 0 — Provider scaffold | ✅ done, deployed |
| 1 — Group/clinic tenancy (MSO) | 🟡 expressed as code in the seed (Org + AccessPolicy); enrollment flows + Project-per-group not built |
| 2 — Whitelabel theming + instance mode | ✅ provider themed + mode flag; per-group dynamic theming not built |
| 3 — Marketplace & ordering | 🟡 catalog + cart done; **checkout/order submission deferred** |
| 3.5 — Platform billing | 🟡 bots + clinic dashboard done; **owner (cross-clinic) dashboard + Stripe not built**; bots not deployed |
| 4 — Fulfillment / pharmacy routing | ⬜ not started (needs Shopify/pharmacy creds) |
| 5 — Protocols/subscriptions/revenue | 🟡 protocols page done; subscriptions/revenue split not built |
| 6 — Patient portal | ✅ live (foomedical base); custom surfaces (wearables, protocol timeline) not built |
| 7 — Integrations & AI | ⬜ not started (needs external creds) |

## 🟢 Decisions I made (flag any you'd change)
- Tenancy = group→Project, clinic→Organization, isolation via AccessPolicy (MSO).
- Apps standalone under `apps/*` on published SDK; `medplum/` core stays pristine.
- Billing: transaction = Rx + diagnostic + marketplace order; subscription per clinic; plans Starter/Growth/Scale.
- Catalog + billing plans modeled as FHIR `Basic` with `medsscript.com` extensions (no core changes).
- Marketplace nav/route gated by `MEDPLUM_INSTANCE_MODE` (default `marketplace`).

## 🔴 Your inputs needed (nothing blocked on these overnight)
1. **Run the seed** — needs a ClientApplication credential (I can't use your login):
   ```
   cd medplum/seed && npm install
   MEDPLUM_BASE_URL=https://api.medsscript.com/ MEDPLUM_CLIENT_ID=<id> MEDPLUM_CLIENT_SECRET=<secret> npm run seed
   ```
   (Create the client in app.medsscript.com → Project → Client Applications.)
2. **Deploy the Bots** — steps in `bots/README.md` (create Bot + Subscriptions on MedicationRequest/ServiceRequest + cron for monthly-invoice). Needs auth.
3. **Review the Bot assumptions** — esp. clinic↔plan mapping + how a clinic is derived from a transaction (listed in `bots/README.md`).
4. **Clinical review** — questionnaires/protocol doses are starter templates; a prescriber should review.
5. **AccessPolicy review** — validate the seed AccessPolicy vs `examples/medplum-mso-demo` before real PHI.
6. **Merge the PR** to enable provider auto-deploy on push.
7. **Later-phase creds** — Shopify, Stripe, GoHighLevel, Oura/Whoop, pharmacy APIs.

## ⏭️ Suggested next (when you're back)
Checkout/order flow (Phase 3), owner cross-clinic billing dashboard + Stripe (Phase 3.5), fulfillment bots (Phase 4). I paused these because they either need product decisions or external credentials.
