---
title: E-Prescribe Decision Guide
sidebar_label: E-Prescribe
sidebar_position: 4
download_slug: e-prescribe
toc_max_heading_level: 2
---

# E-Prescribe Decision Guide

Use this guide to choose an e-prescribing integration and plan the workflow around it. Work through hosted versus custom prescribing workflows, prescriber enrollment, controlled substances, and practice structure to define what your application builds, what the vendor handles, and what must be ready before go-live.

_Companion to the [E-Prescribe (eRx)](/docs/medications/e-prescibe) docs._

E-prescribing in Medplum is part of the [Medplum EHR](/solutions/medplum-ehr), not a standalone product. It runs through an integration with a vendor connected to the e-prescribing network. See [Related Integrations](#related-integrations) for the available first-party options.

Choose the prescribing experience, then plan what supports it:

1. **[Choose hosted or custom prescribing](#hosted-or-custom-prescribing).** Decide which workflow your application builds and which interface the integration provides.
2. **[Plan enrollment and staff roles](#enrollment-and-staff-roles).** Define onboarding, identity requirements, supervision, and evidence that each user is ready to prescribe or assist.
3. **[Plan EPCS enrollment](#how-will-epcs-enrollment-work)** if prescribers will send controlled-substance prescriptions.
4. **[Define prescribing and follow-up](#prescribing-and-follow-up).** Identify required benefits and authorization checks, refills, presets, pediatric workflows, and medication history.
5. **[Define practice structure and transition](#practices-and-transition).** Choose practice context; address multiple locations, independent clients, or migration from an existing system where applicable.

Use the [questions below](#before-you-start) to establish your use case, then follow the relevant sections. Add requirements beyond these examples where needed.

<div id="section-1-use-case--participants"></div>

## Before you start

<div id="q1-what-are-you-prescribing"></div>

### What are you prescribing?

- Non-controlled medications only
- Controlled substances too (Schedule II–V)
- Not sure / depends on specialty

*Why: controlled substances require **EPCS**, which adds a per-prescriber enrollment path (DEA, identity proofing, two-factor auth). If you never prescribe them, skip the controlled-substance decision ([EPCS](#how-will-epcs-enrollment-work)) and enrollment shrinks substantially.*

<div id="q2-do-you-want-the-hosted-flow-or-a-custom-workflow"></div>

### Do you want the hosted flow, or a custom workflow?

- **Hosted iframe** — embed the vendor's prescribing screens. Drug search, dosing, pharmacy, and send all happen inside the vendor's flow.
- **Custom workflow** — prescribe from the chart using Medplum's FHIR operations and bots. Only the final, regulation-required **review-and-send** step stays a hosted widget.
- Not sure

*Why: the iframe is fastest to live, and the steps stay the vendor's. A custom workflow keeps prescribing in the chart. Presets — clinic favorites and order sets — standardize repeat orders on either path. Either way, transmission stays on the vendor's review-and-send step. See [Prescribing workflow](#hosted-or-custom-prescribing).*

<div id="q3-new-build-or-replacing-an-existing-e-rx-system"></div>

### New build or replacing an existing e-Rx system?

- New — no e-prescribing today
- Replacing another EHR or e-Rx vendor
- Adding alongside an existing clinical system

*Why: replacing an existing system requires coordinating a **Change of Vendor** with the prescribing network so refills and history follow prescribers over, a distinct migration workstream ([Transition](#how-will-prescribers-transition-from-an-existing-e-rx-system)).*

<div id="q4-who-is-involved-in-prescribing"></div>

### Who is involved in prescribing?

- Prescribers (sign and send)
- Clinicians prescribing under supervision
- Non-prescribing proxies or staff who stage orders
- Administrators (enroll prescribers, manage practices, configure favorites)
- Any offshore or non-US staff using e-prescribing?

*Why: enrollment and permissions depend on the vendor and role ([Identity and roles](#what-identity-data-roles-and-supervision-relationships-are-required)). Supervised prescribing and non-prescribing order preparation are different responsibilities. Confirm which roles can stage, sign, send, or administer, and the vendor's requirements for non-US staff before designing the workflow.*

<div id="section-2-feature-scoping"></div>

<div id="scope-checklist"></div>

<div id="section-3-feature-deep-dives"></div>

<div id="decisions"></div>

<div id="foundations"></div>

<div id="31-custom-workflow"></div>

<div id="decision-1"></div>

<div id="decision-1-which-prescribing-interface-fits-your-workflow"></div>

## Hosted or custom prescribing?

Whether prescribing follows the vendor's hosted flow or a custom workflow in the chart. This choice shapes almost every section below.

**Questions:**

- Do prescribers write prescriptions from inside the chart, or is the vendor's hosted flow enough?
- Do you want presets — clinic favorites and order sets — for medications the practice sends often?
- Is the vendor's standard sequence of steps acceptable?

| Situation | Approach |
| :---- | :---- |
| Hosted flow is enough | **Hosted iframe** — the vendor's screens, embedded. Fastest to live; the steps are the vendor's. |
| Prescribe from the chart | **Custom workflow** — stage the order with FHIR operations and bots; the prescriber stays in the chart until the final send. |
| Repeat medications | **Presets** — clinic favorites and order sets ([Presets and pediatrics](#are-favorites-order-sets-or-pediatric-workflows-needed)). These are configuration, not a separate prescribing interface. |
| Either path | The final review-and-send step is always vendor-hosted and compliance-controlled. A custom workflow does not replace transmission. |

> **⚠ Choose deliberately.** This is expensive to reverse — it determines whether prescribers stay in the chart, and how enrollment and presets surface. Align on [Hosted or custom workflow](#do-you-want-the-hosted-flow-or-a-custom-workflow) before you commit to a workflow.

<div id="decision-2"></div>

<div id="decision-2-how-will-prescribers-and-staff-become-ready-to-prescribe"></div>

## Enrollment and staff roles

<div id="32-prescriber-enrollment--identity-proofing"></div>

<div id="decision-2a-who-drives-enrollment-and-how-is-readiness-tracked"></div>

### Who drives enrollment, and how is readiness tracked?

Every prescriber must be enrolled before transmitting. Choose who drives enrollment and how much your platform automates. Map the selected integration's states to actionable progress; an invitation, account registration, and readiness to prescribe are different milestones.

**Questions:**

- Who initiates enrollment — an ops admin, or the prescriber on first login?
- Do prescribers send controlled substances (which adds identity proofing and 2FA — see [EPCS](#how-will-epcs-enrollment-work))?
- How will you see which prescribers are stuck mid-enrollment?

| Situation | Approach |
| :---- | :---- |
| Admin-driven enrollment | Use the integration's supported administrative workflow. Define caller permissions, required credentials, and which steps still need prescriber participation |
| Provider self-service | Choose a supported invite or embedded enrollment flow. Track completion and link the vendor user account to the Medplum user; launching the flow alone is not completed enrollment |
| Bulk onboarding or profile updates | Confirm support for administrative sync, activation, and network registration. Decide who approves changes and handles failed or incomplete records |
| Non-controlled only | Complete the requirements for non-controlled prescribing; track additional EPCS enrollment separately if controlled substances are later added |
| Track enrollment state | Show progress, errors, the next required action, and its owner. Keep basic registration and EPCS readiness distinct |

<div id="33-provider--practice-identity-data"></div>

<div id="decision-2b-what-identity-data-roles-and-supervision-relationships-are-required"></div>

### What identity data, roles, and supervision relationships are required?

Accurate provider identity data prevents the most common enrollment failures.

**Questions:**

- Do Practitioner records satisfy the selected vendor's required profile and role?
- Do controlled-substance prescribers have a valid DEA number with issuing state?
- Which roles do users need: independent prescriber, supervised prescribing clinician, non-prescribing proxy, or admin?
- Who validates and maintains supervising-prescriber relationships for each clinic?
- Do non-prescriber staff (front desk, MAs) need to perform prescribing-adjacent tasks — searching pharmacies, setting a preferred pharmacy, viewing history — without an NPI?
- Are any of those staff offshore or otherwise outside the US?

| Situation | Approach |
| :---- | :---- |
| Prescriber profile | Populate the selected integration's required Practitioner fields and identifiers. Validate demographic, contact, NPI, and license data before enrollment; required fields vary by vendor |
| Controlled-substance prescriber | Complete the selected vendor's EPCS requirements, including its required DEA data and issuing-state representation |
| Staff who stage but do not prescribe | Use a non-prescribing role and confirm its permitted actions. Order preparation must not imply authority to sign or send |
| Clinician requiring supervision | Confirm supported prescribing and supervising roles, then configure the relationship for the intended clinic. Assign ownership for eligibility checks, updates, and removal |
| Users who enroll others | Provision the required administrative role and credentials to manage prescribers and favorites ([Presets and pediatrics](#are-favorites-order-sets-or-pediatric-workflows-needed)); confirm the scope of that access |
| Non-prescriber staff running pharmacy/history ops | Confirm which operations staff need and whether each requires a vendor account, identifier, or additional permission. Provision the supported non-prescribing role |
| Offshore / non-US staff | Confirm permitted activities, enrollment requirements, and administrative access with the selected vendor before designing the staffing model |

Validate both clinicians' eligibility before assigning a supervisor, and confirm what the integration checks itself. Successfully linking enrolled accounts does not by itself establish that the relationship is appropriate for the intended clinic.

<div id="controlled-substances"></div>

<div id="34-epcs-electronic-prescriptions-for-controlled-substances"></div>

<div id="decision-3"></div>

<div id="decision-3-how-will-controlled-substance-prescribing-be-enabled"></div>

## How will EPCS enrollment work?

*Read only if [Medication scope](#what-are-you-prescribing) includes controlled substances. Otherwise skip to [Benefits and authorization](#will-prescribers-need-benefit-checks-and-prior-authorization).*

Supported, but a regulated, multi-step enrollment on top of basic registration. Treat it as its own workstream.

**Questions:**

- Which prescribers will send controlled substances, and does each have a valid, active DEA registration (with state)?
- Are prescribers ready to complete identity proofing and set up two-factor auth?
- Have any prescribers previously enrolled in EPCS with this vendor under another organization?

| Situation | Approach |
| :---- | :---- |
| EPCS enrollment | Follow the selected vendor's registration, required agreements, identity proofing, and two-factor activation workflow. Track completion before allowing controlled-substance prescribing |
| Readiness check | Confirm EPCS activation for each prescriber in the selected integration. Stage names and identity-proofing providers vary; basic enrollment is not proof of EPCS readiness |
| Missing DEA data | Resolve the selected vendor's required DEA data and state information before EPCS enrollment ([Identity and roles](#what-identity-data-roles-and-supervision-relationships-are-required)) |
| Prior enrollment elsewhere | Can cause verification conflicts (e.g. reused phone number). Identify these prescribers up front so vendor support can resolve them before onboarding. |

> **⚠ EPCS is a one-way gate on go-live.** Identity proofing and 2FA are per-prescriber, take real calendar time, and are the most common onboarding delay. Start early and build admin visibility into each prescriber's stage ([Enrollment](#who-drives-enrollment-and-how-is-readiness-tracked)). Controlled-substance prescriptions also require effective dates and often a diagnosis — confirm your workflow captures these.

<div id="decision-4"></div>

<div id="decision-4-how-will-prescribing-history-and-follow-up-work"></div>

## Prescribing and follow-up

<div id="prescribing-workflow"></div>

<div id="35-formularybenefit-checks--prior-authorization"></div>

<div id="decision-4a-will-prescribers-need-benefit-checks-and-prior-authorization"></div>

### Will prescribers need benefit checks and prior authorization?

Whether prescribers see coverage and cost at the point of prescribing, and how prior auth is handled.

**Questions:**

- Do prescribers need formulary status, patient cost, and covered alternatives while prescribing?
- Do you need to initiate electronic prior authorization (ePA) — through the eRx vendor, the standards-based payer path, or both?
- Is your timeline driven by upcoming e-prescribing mandates?

| Situation | Approach |
| :---- | :---- |
| Show coverage & cost | The vendor pulls active benefit info from pharmacy-benefit data via patient demographics and surfaces formulary status, cost, and alternatives. Coverage comes from the benefit network, **not** insurance data stored only in Medplum, and prescription cost is **not** retrievable via the Medplum API — keep demographics accurate so the match succeeds. |
| ePA via the eRx vendor | The e-prescribing vendor can initiate ePA from the medication when formulary data flags it's required. This may require **separate enablement** with the vendor rather than being part of the base integration — confirm it's in scope. |
| Standards-based ePA (payer path) | The emerging FHIR path for payer-connected prior auth — CDS Hooks with CRD / DTR / PAS (ONC criteria (g)(31)–(g)(33)). Currently [alpha](/docs/integration/electronic-prior-auth). |
| Compliance-driven timeline | HTI-4 (effective Oct 1, 2025) mandates **NCPDP SCRIPT v2023011** with ePA in the prescribing workflow and **RTPB v13** for real-time cost display. Payer ePA APIs are due **Jan 1, 2027**; eRx modules must be certified to SCRIPT v2023011 by **Jan 1, 2028**. Factor these into [Prescribing workflow](#hosted-or-custom-prescribing). See [HTI-4 & CMS-0057-F](/docs/compliance/hti-4). |

<div id="36-refills-reorders--discontinuation"></div>

<div id="decision-4b-how-will-refills-reorders-and-discontinuation-be-handled"></div>

### How will refills, reorders, and discontinuation be handled?

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

<div id="37-favorites-order-sets--pediatric-prescribing"></div>

<div id="decision-4c-are-favorites-order-sets-or-pediatric-workflows-needed"></div>

### Are favorites, order sets, or pediatric workflows needed?

**Questions:**

- Does the practice repeatedly prescribe a common set of medications worth curating?
- Do you prescribe to pediatric patients?

| Situation | Approach |
| :---- | :---- |
| Common medication set | Configure supported **clinic favorites / order sets**, including specialty/compounded configurations where available. Confirm which administrative role may create and edit them ([Identity and roles](#what-identity-data-roles-and-supervision-relationships-are-required)). |
| Highly variable prescribing | Skip favorites — the maintenance overhead isn't worth it. |
| Pediatric patients | The **prescriber is responsible** for dosages within guidelines for the patient's height and weight; vendors often add pediatric validation — confirm requirements before go-live. |

<div id="38-medication-history"></div>

<div id="decision-4d-what-medication-history-is-needed-and-how-is-consent-captured"></div>

### What medication history is needed, and how is consent captured?

Whether prescribers can see a patient's external medication history, and the consent required to retrieve it.

**Questions:**

- Do prescribers need a patient's medication history from outside your system (pharmacy fill history, active prescriptions elsewhere)?
- Can you capture and record the patient consent required to query external history?
- Are you importing prescription history from a prior system?

| Situation | Approach |
| :---- | :---- |
| Need external history | Confirm the integration's access to network medication history, including pharmacy fill history and/or active prescriptions. This is a distinct capability from writing prescriptions, so scope it explicitly. |
| Consent gate | External history retrieval requires **patient consent**; capture and record it (e.g. a `Consent` resource) before querying, and confirm the consent language your workflow presents. |
| Importing prior history | History migrated from a prior system generally loses prescriber/pharmacy linkage and may not appear in the vendor's native "past prescriptions" view — set expectations accordingly. |

<div id="decision-5"></div>

<div id="decision-5-how-will-practice-structure-and-transition-be-managed"></div>

## Practices and transition

<div id="practice-structure"></div>

<div id="39-multi-location--multi-practice-prescribing"></div>

<div id="decision-5a-how-will-prescriptions-resolve-to-the-correct-practice"></div>

### How will prescriptions resolve to the correct practice?

Read when prescribers work across more than one location or legal entity.

**Questions:**

- Do prescribers prescribe on behalf of more than one practice?
- How should the system know which practice a prescription belongs to?
- Do you need a default pharmacy per patient or per clinic?

| Situation | Approach |
| :---- | :---- |
| Multiple practices/locations | Model practices as `Organization` resources and prescriber affiliations with `PractitionerRole`. Map that structure to the vendor's practice hierarchy and enrollment requirements |
| Resolving the practice per prescription | Select the intended practice explicitly when a prescriber has multiple affiliations. Confirm how the integration accepts that context and handles missing or ambiguous selections |
| Default pharmacy | Decide whether pharmacy preferences belong to the patient or clinic, confirm supported behavior, and allow the correct pharmacy to be selected for each prescription |

<div id="310-multi-tenant--platform-deployments"></div>

<div id="decision-5b-how-will-independent-clients-be-isolated-and-administered"></div>

### How will independent clients be isolated and administered?

Read when one Medplum project serves multiple **downstream clients** that prescribe independently (a platform or enablement model) — distinct from one organization's own locations ([Practice selection](#how-will-prescriptions-resolve-to-the-correct-practice)). This is an architecture fork worth settling before the second client onboards.

**Questions:**

- Does a single Medplum project serve multiple downstream clients or brands that prescribe independently?
- Must each client's prescribers and patients be isolated from the others?
- Does the originating clinic's identity or branding need to reach the pharmacy?
- Do downstream clients' admins need scoped self-service access to manage their own prescribers?

| Situation | Approach |
| :---- | :---- |
| One organization, many sites | Not multi-tenant — use Multi-Location ([Practice selection](#how-will-prescriptions-resolve-to-the-correct-practice)). |
| Platform serving independent clients | Model each downstream client as its own practice/tenant so prescribers, patients, and rosters are scoped per client rather than pooled. |
| Roster / patient isolation required | Scope prescriber pickers and patient lists to the client's tenant — a single shared tenant can expose one client's prescribers or patients to another. Decide isolation before onboarding the second client. |
| Origin branding at the pharmacy | If the medication must reach the pharmacy carrying the originating clinic's identity/branding, model a distinct tenant per client rather than one shared tenant. |
| Scoped admin access | Confirm whether the selected hosted or custom workflow can restrict client admins to their own prescribers and patients. Define and verify those permissions in Medplum and the vendor system before granting access; include this in [Prescribing workflow](#hosted-or-custom-prescribing) |
| Shared vs. per-client tenant | A single shared tenant is simplest but limits isolation and branding; a tenant-per-client isolates cleanly but adds enrollment and ops overhead (prescribers may need enrolling in each). Choose based on how much the clients must be kept apart. |

<div id="situational"></div>

<div id="311-migration-from-an-existing-e-rx-system-change-of-vendor"></div>

<div id="decision-5c-how-will-prescribers-transition-from-an-existing-e-rx-system"></div>

### How will prescribers transition from an existing e-Rx system?

Read only when replacing an existing EHR or e-Rx vendor ([Existing systems](#new-build-or-replacing-an-existing-e-rx-system)).

**Questions:**

- Are prescribers currently sending through another system on the prescribing network?
- Do pending refills and history need to follow prescribers over?
- Can migration be phased prescriber-by-prescriber, or must it be all at once?

| Situation | Approach |
| :---- | :---- |
| Already prescribing through another system | Coordinate the network's **Change of Vendor** process so the new system is recognized; without it, new prescriptions may work while refills and edits fail. |
| Preserving pending refills | The approach depends on whether pending refills must be preserved vs. whether the old system must keep operating during cutover — these pull opposite ways. Scope with the vendor before scheduling. |
| Phased rollout | Migration can generally be coordinated per prescriber, enabling a phased cutover. |

## Related Integrations

<div id="scriptsure"></div>

<div id="dosespot"></div>

See the integration docs for setup and implementation details:

- [ScriptSure](/docs/integration/scriptsure): custom prescribing workflows using FHIR operations and Bots, with hosted review and send.
- [DoseSpot](/docs/integration/dosespot): embedded prescribing through a hosted iframe.
