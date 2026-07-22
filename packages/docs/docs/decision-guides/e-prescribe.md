---
title: E-Prescribe Decision Guide
sidebar_label: E-Prescribe
sidebar_position: 7
download_slug: e-prescribe
---

# E-Prescribe Decision Guide

**For Reference**: [E-Prescribe (eRx)](https://www.medplum.com/docs/medications/e-prescibe)

E-prescribing in Medplum runs through an integration with an e-prescribing vendor connected to the SureScripts network. This space is less about the FHIR data model than a sequence of **integration and enrollment decisions**: how much prescribing UI you build, whether you send controlled substances, and how prescribers get enrolled and verified. This guide moves from those high-level decisions down to feature detail.

## Section 1: Use Case & Participants

*Two of these — what you prescribe (1.1) and how much you build (1.2) — cascade into most of Section 3. Land them first.*

**1.1 What are you prescribing?**

- Non-controlled medications only
- Controlled substances too (Schedule II–V)
- Not sure / depends on specialty

*Why: controlled substances require **EPCS**, which adds a per-prescriber enrollment path (DEA, identity proofing, two-factor auth). If you never prescribe them, skip the entire Controlled Substances lane (3.4) and enrollment shrinks substantially.*

**1.2 How much of the prescribing experience do you want to build?**

- **Hosted iframe** — embed the vendor's prescribing UI. Minimal build; drug search, dosing, pharmacy, and send all happen inside the vendor's screens.
- **Integrated (API-driven)** — build your own prescribing UI on Medplum's FHIR operations and bots; only the final, regulation-required **review-and-send** step stays a hosted widget.
- Not sure

*Why: the core build-vs-UX trade-off. The iframe is fastest to live but UX is fixed and you generally can't prescribe from inside your own chart. Integrated lets you own the workflow and prescribe in context, at the cost of building it. See 3.1.*

**1.3 New build or replacing an existing e-Rx system?**

- New — no e-prescribing today
- Replacing another EHR or e-Rx vendor
- Adding alongside an existing clinical system

*Why: replacing an existing system means a **Change of Vendor** on SureScripts so refills and history follow prescribers over — a distinct migration workstream (3.11).*

**1.4 Who is involved in prescribing?**

- Prescribers (sign and send)
- Prescribing agents / proxies (stage but can't send)
- Administrators (enroll prescribers, manage practices, configure favorites)
- Any offshore or non-US staff using the prescribing UI?

*Why: prescriber vs. agent vs. admin map to distinct enrollment roles (3.3), and only fully-enrolled prescribers can transmit. Non-prescribing roles don't need an NPI.*

---

## Section 2: Feature Scoping

*For each row, mark Yes / No / Nice-to-have / Not sure. The* **§** *column points to the deep dive.*

| \# | Feature | § | Yes | No | Nice-to-have | Not sure |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | Integration model (hosted iframe vs. integrated/API) | 3.1 |  |  |  |  |
| 2 | Prescriber enrollment & identity proofing | 3.2 |  |  |  |  |
| 3 | Provider & practice identity data (NPI, DEA, roles) | 3.3 |  |  |  |  |
| 4 | Non-prescriber staff access (pharmacy / history ops) | 3.3 |  |  |  |  |
| 5 | Controlled substances / EPCS | 3.4 |  |  |  |  |
| 6 | Formulary/benefit checks & prior authorization | 3.5 |  |  |  |  |
| 7 | Refills, reorders & discontinuation | 3.6 |  |  |  |  |
| 8 | Clinic favorites / order sets | 3.7 |  |  |  |  |
| 9 | Pediatric prescribing | 3.7 |  |  |  |  |
| 10 | Medication history retrieval (with consent) | 3.8 |  |  |  |  |
| 11 | Multi-location / multi-practice prescribing | 3.9 |  |  |  |  |
| 12 | Multi-tenant / platform deployment (multiple downstream clients) | 3.10 |  |  |  |  |
| 13 | Migration from an existing e-Rx system (Change of Vendor) | 3.11 |  |  |  |  |

---

## Section 3: Feature Deep Dives

*Cover each feature flagged Yes or Nice-to-have. Each question below maps to a row in the table beneath it, in order. The goal is a clear recommended approach by the end of each section.*

| Lane | Subsections | When to read |
| :---- | :---- | :---- |
| **Foundations** | 3.1 – 3.3 | Always |
| **Controlled Substances** | 3.4 | Only if you prescribe controlled substances (1.1) |
| **Prescribing Workflow** | 3.5 – 3.8 | Always |
| **Practice Structure** | 3.9 – 3.10 | When prescribing across multiple locations, entities, or downstream clients |
| **Situational** | 3.11 | When replacing an existing e-Rx system (1.3) |

---

### Foundations

#### 3.1 Integration Model

How much of the prescribing UI you build — the decision that shapes almost every section below.

**Questions:**

- Do prescribers need to write prescriptions *in context* (from inside your chart), or is a standalone screen fine?
- How much engineering do you want to invest in the prescribing UI, now and ongoing?
- Do you need to control the look and steps of the flow, or is a vendor-standard flow acceptable?

| Situation | Approach |
| :---- | :---- |
| Standalone screen fine; minimal build | **Hosted iframe** — the vendor's prescribing UI, embedded. Fastest to live; UX is fixed and not customizable. |
| Must prescribe from within your own chart | **Integrated (API-driven)** — build the pre-approval flow on FHIR operations and bots; the prescriber stays in your UI until the final send. |
| Own the branding and steps | **Integrated** — you control everything up to the vendor-hosted review-and-send widget (stylable; transmitted content is not). |
| Either model | The final review-and-send step is always vendor-hosted and compliance-controlled — neither model replaces the moment of transmission with your own code. |

> **⚠ Choose deliberately.** This is expensive to reverse — it determines whether you build a prescribing UI at all, whether "prescribe from the chart" is possible, and how enrollment and favorites surface. Align on 1.2 before committing engineering.

#### 3.2 Prescriber Enrollment & Identity Proofing

Every prescriber must be enrolled before transmitting. Decide who drives enrollment and how much your platform automates.

**Questions:**

- Who initiates enrollment — an ops admin, or the prescriber on first login?
- Do prescribers send controlled substances (which adds identity proofing and 2FA — see 3.4)?
- How will you see which prescribers are stuck mid-enrollment?

| Situation | Approach |
| :---- | :---- |
| Ops admin drives it, stage by stage | **Admin-driven enrollment bot** — invoked per practitioner; the admin controls when each stage advances. Requires a project admin with vendor admin access. |
| Prescriber self-enrolls on first use | **Self-service enrollment bot** — auto-advances through registration as the prescriber opens the iframe. Requires an admin-level vendor user id as a project secret and an active prescriber role record. |
| Non-controlled only | Enrollment completes at basic registration — the prescriber can prescribe non-controlled meds immediately; no identity proofing or 2FA. |
| Track enrollment state | The bots return a status that progresses registration → identity proofing → 2FA; surface it to admins so stuck prescribers are visible. |

#### 3.3 Provider & Practice Identity Data

Accurate provider identity data prevents the most common enrollment failures.

**Questions:**

- Do you have complete, validated `Practitioner` records (name, DOB, address, work phone/fax, email, NPI)?
- Do controlled-substance prescribers have a valid DEA number with issuing state?
- Which roles do users need — prescriber, agent/proxy, admin?
- Do non-prescriber staff (front desk, MAs) need to perform prescribing-adjacent tasks — searching pharmacies, setting a preferred pharmacy, viewing history — without an NPI?

| Situation | Approach |
| :---- | :---- |
| Standard prescriber | `Practitioner` with full name, birth date, complete address, work phone and fax, email, and a valid 10-digit **NPI**. Missing or malformed fields are the top cause of enrollment errors. |
| Controlled-substance prescriber | Additionally a **DEA number** with the issuing **state** present (2-letter abbreviation) — required to trigger EPCS enrollment (3.4). |
| Staff who stage but don't send | Enroll as a **prescribing agent** or **proxy** role — no NPI required; cannot finalize or transmit. |
| Users who enroll others | Enroll with an **admin/clinician-admin** role to invite and manage other prescribers and configure favorites (3.7). |
| Non-prescriber staff running pharmacy/history ops | Even without prescribing rights, staff must be **enrolled with a vendor identifier** to call pharmacy-directory or medication-history operations — an un-enrolled user is rejected. Confirm which staff need these ops and provision a non-prescribing role for them. |

---

### Controlled Substances

*Read only if 1.1 includes controlled substances. Otherwise skip to 3.5.*

#### 3.4 EPCS (Electronic Prescriptions for Controlled Substances)

Supported, but a regulated, multi-step enrollment on top of basic registration. Treat it as its own workstream.

**Questions:**

- Which prescribers will send controlled substances, and does each have a valid, active DEA registration (with state)?
- Are prescribers ready to complete identity proofing and set up two-factor auth?
- Have any prescribers previously enrolled in EPCS with this vendor under another organization?

| Situation | Approach |
| :---- | :---- |
| Enable EPCS for a prescriber | Three stages on top of registration: **(1)** registration with DEA present → **(2)** identity proofing (Experian-based) → **(3)** two-factor auth activation. All three required before transmitting controlled substances. |
| Missing or inactive DEA | Blocks identity proofing; the DEA number **and** issuing state must be on the `Practitioner` (3.3). |
| Prior enrollment elsewhere | Can cause verification conflicts (e.g. reused phone number). Identify these prescribers up front so vendor support can resolve them before onboarding. |

> **⚠ EPCS is a one-way gate on go-live.** Identity proofing and 2FA are per-prescriber, take real calendar time, and are the most common onboarding delay. Start early and build admin visibility into each prescriber's stage (3.2). Controlled-substance prescriptions also require effective dates and often a diagnosis — confirm your workflow captures these.

---

### Prescribing Workflow

#### 3.5 Formulary/Benefit Checks & Prior Authorization

Whether prescribers see coverage and cost at the point of prescribing, and how prior auth is handled.

**Questions:**

- Do prescribers need formulary status, patient cost, and covered alternatives while prescribing?
- Do you need to initiate electronic prior authorization (ePA) — through the eRx vendor, the standards-based payer path, or both?
- Is your timeline driven by upcoming e-prescribing mandates?

| Situation | Approach |
| :---- | :---- |
| Show coverage & cost | The vendor pulls active benefit info from pharmacy-benefit data via patient demographics and surfaces formulary status, cost, and alternatives. Coverage comes from the benefit network, **not** insurance data stored only in Medplum, and prescription cost is **not** retrievable via the Medplum API — keep demographics accurate so the match succeeds. |
| ePA via the eRx vendor | The e-prescribing vendor can initiate ePA from the medication when formulary data flags it's required. This may require **separate enablement** with the vendor rather than being part of the base integration — confirm it's in scope. |
| Standards-based ePA (payer path) | The emerging FHIR path for payer-connected prior auth — CDS Hooks with CRD / DTR / PAS (ONC criteria (g)(31)–(g)(33)). Currently [alpha](https://www.medplum.com/docs/integration/electronic-prior-auth). |
| Compliance-driven timeline | HTI-4 (effective Oct 1, 2025) mandates **NCPDP SCRIPT v2023011** with ePA in the prescribing workflow and **RTPB v13** for real-time cost display. Payer ePA APIs are due **Jan 1, 2027**; eRx modules must be certified to SCRIPT v2023011 by **Jan 1, 2028**. Factor these into the 3.1 decision. See [HTI-4 & CMS-0057-F](https://www.medplum.com/docs/compliance/hti-4). |

#### 3.6 Refills, Reorders & Discontinuation

How prescribers handle prescriptions after the first send.

**Questions:**

- Do prescribers respond to pharmacy-initiated refill requests?
- Do they re-prescribe previously prescribed medications?
- Do you need to discontinue or expire prescriptions — automatically on change?

| Situation | Approach |
| :---- | :---- |
| Refills | Pharmacy-initiated requests for more of an existing prescription; prescribers approve or deny. |
| Reorders | Prescriber-initiated new prescription for a previously prescribed medication. |
| Discontinuation / expiry | Manual today — no automatic discontinue-on-change or auto-expire. High-polypharmacy populations should plan an explicit medication-reconciliation workflow. |

#### 3.7 Favorites, Order Sets & Pediatric Prescribing

**Questions:**

- Does the practice repeatedly prescribe a common set of medications worth curating?
- Do you prescribe to pediatric patients?

| Situation | Approach |
| :---- | :---- |
| Common medication set | Configure **clinic favorites / order sets** — curated, reusable entries, including specialty/compounded configurations. Requires an admin/clinician-admin role (3.3); confirm who may create and edit them. |
| Highly variable prescribing | Skip favorites — the maintenance overhead isn't worth it. |
| Pediatric patients | The **prescriber is responsible** for dosages within guidelines for the patient's height and weight; vendors often add pediatric validation — confirm requirements before go-live. |

#### 3.8 Medication History

Whether prescribers can see a patient's external medication history, and the consent required to retrieve it.

**Questions:**

- Do prescribers need a patient's medication history from outside your system (pharmacy fill history, active prescriptions elsewhere)?
- Can you capture and record the patient consent required to query external history?
- Are you importing prescription history from a prior system?

| Situation | Approach |
| :---- | :---- |
| Need external history | Retrieved from the SureScripts network (pharmacy fill history and/or active prescriptions) — a distinct capability from writing prescriptions, so scope it explicitly. |
| Consent gate | External history retrieval requires **patient consent**; capture and record it (e.g. a `Consent` resource) before querying, and confirm the consent language your workflow presents. |
| Importing prior history | History migrated from a prior system generally loses prescriber/pharmacy linkage and may not appear in the vendor's native "past prescriptions" view — set expectations accordingly. |

---

### Practice Structure

#### 3.9 Multi-Location / Multi-Practice Prescribing

Read when prescribers work across more than one location or legal entity.

**Questions:**

- Do prescribers prescribe on behalf of more than one practice?
- How should the system know which practice a prescription belongs to?
- Do you need a default pharmacy per patient or per clinic?

| Situation | Approach |
| :---- | :---- |
| Multiple practices/locations | Model each **practice** as an `Organization` (linked to a parent business-unit `Organization` via `partOf`) and associate prescribers via `PractitionerRole`. |
| Resolving the practice per prescription | Precedence: explicit organization id on the operation → the prescriber's single affiliation → a configured default. **If a prescriber has multiple affiliations and no organization id is passed, the request errors** — pass it explicitly for them. |
| Default pharmacy | Settable per patient or per clinic; often irrelevant for nationwide telehealth where patients are everywhere. |

#### 3.10 Multi-Tenant / Platform Deployments

Read when one Medplum project serves multiple **downstream clients** that prescribe independently (a platform or enablement model) — distinct from one organization's own locations (3.9). This is an architecture fork worth settling before the second client onboards.

**Questions:**

- Does a single Medplum project serve multiple downstream clients or brands that prescribe independently?
- Must each client's prescribers and patients be isolated from the others?
- Does the originating clinic's identity or branding need to reach the pharmacy?
- Do downstream clients' admins need scoped self-service access to manage their own prescribers?

| Situation | Approach |
| :---- | :---- |
| One organization, many sites | Not multi-tenant — use Multi-Location (3.9). |
| Platform serving independent clients | Model each downstream client as its own practice/tenant so prescribers, patients, and rosters are scoped per client rather than pooled. |
| Roster / patient isolation required | Scope prescriber pickers and patient lists to the client's tenant — a single shared tenant can expose one client's prescribers or patients to another. Decide isolation before onboarding the second client. |
| Origin branding at the pharmacy | If the medication must reach the pharmacy carrying the originating clinic's identity/branding, model a distinct tenant per client rather than one shared tenant. |
| Scoped admin access | The **integrated** path can grant client admins access scoped to their own tenant (cross-tenant admin access is blocked for HIPAA); the **hosted-iframe** path generally cannot expose a scoped admin portal — a factor in the 3.1 decision. |
| Shared vs. per-client tenant | A single shared tenant is simplest but limits isolation and branding; a tenant-per-client isolates cleanly but adds enrollment and ops overhead (prescribers may need enrolling in each). Choose based on how much the clients must be kept apart. |

---

### Situational

#### 3.11 Migration from an Existing e-Rx System (Change of Vendor)

Read only when replacing an existing EHR or e-Rx vendor (1.3).

**Questions:**

- Are prescribers currently sending through another system on SureScripts?
- Do pending refills and history need to follow prescribers over?
- Can migration be phased prescriber-by-prescriber, or must it be all at once?

| Situation | Approach |
| :---- | :---- |
| Already on SureScripts | Coordinate a **Change of Vendor** so the new system is recognized; without it, new prescriptions may work while refills and edits fail. |
| Preserving pending refills | The approach depends on whether pending refills must be preserved vs. whether the old system must keep operating during cutover — these pull opposite ways. Scope with the vendor before scheduling. |
| Phased rollout | Migration can generally be coordinated per prescriber, enabling a phased cutover. |
