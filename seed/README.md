# MedsScript seed content

Re-runnable starter content for the MedsScript platform, uploaded as a single
FHIR **transaction** (`seed-bundle.json`). Every entry is a *conditional update*
keyed by `identifier`/`name`, so running it repeatedly **updates in place** —
no duplicates. Treat this like Odoo data files: version it, edit it, re-run it.

## What it seeds

| Resource | What | Identifier |
|---|---|---|
| `Organization` | Demo **group** "MedShiftRX Group" | `group\|medshiftrx` |
| `Organization` | Demo **clinic** "Vital Core Wellness" (partOf the group) | `clinic\|vitalcore` |
| `AccessPolicy` | Clinic-scoped isolation (MSO pattern) | name |
| `Basic` ×3 | **Billing plans** Starter / Growth / Scale (monthly + per-transaction fee) | `billing-plan\|*` |
| `Questionnaire` | New Patient Intake | `questionnaire\|new-patient-intake` |
| `Questionnaire` | GLP-1 Weight Management Eligibility | `questionnaire\|glp1-eligibility` |
| `PlanDefinition` | Semaglutide Titration Protocol | `protocol\|semaglutide-titration` |
| `PlanDefinition` | TRT Protocol (Standard) | `protocol\|trt-standard` |

> ⚠️ **Clinical + security review required.** The questionnaires, protocol
> schedules/doses, and the `AccessPolicy` are **starter templates**. Review the
> clinical content with a prescriber and validate the `AccessPolicy` against the
> `examples/medplum-mso-demo` pattern before real use.

## How to run

**1. Create a machine credential (once).** In the app (`app.medsscript.com`),
as an admin: **Project → Client Applications → New**. Copy the **Client ID** and
**Client Secret**. (This is a service credential — no user password involved.)

**2. Install + run:**
```bash
cd seed
npm install
MEDPLUM_BASE_URL=https://api.medsscript.com/ \
MEDPLUM_CLIENT_ID=<client-id> \
MEDPLUM_CLIENT_SECRET=<client-secret> \
npm run seed
```

You'll see one line per resource (`ok 200/201 …`). Re-run any time after editing
`seed-bundle.json`.

## Extending

Add more questionnaires/protocols/plans by appending entries to
`seed-bundle.json` — copy an existing entry, change the `identifier` and the
`request.url` filter, and re-run. Keep identifiers stable so updates are in-place.
