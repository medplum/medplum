---
title: Referrals Decision Guide
sidebar_label: Referrals
sidebar_position: 2
download_slug: referrals
---

# Referrals Decision Guide

**For Reference**: [https://www.medplum.com/docs/careplans/referrals](https://www.medplum.com/docs/careplans/referrals)

## Section 1: Use Case & Participants

**1.1 Which side(s) of the referral lifecycle do you build for?**

- Outbound only – you originate referrals to others  
- Inbound only – you receive referrals from others  
- Both

*Why: determines which Section 3 deep dives apply.*

**1.2 Who interacts with referrals, and is the patient part of the workflow?**

- Sending side: which roles author, edit, and send referrals (clinicians, MAs, coordinators, intake staff)?  
- Receiving side: which roles triage, accept, and work referrals on intake?  
- Patient: do patients see referrals, get notified, or take action (e.g. view in portal, self-schedule, decline)?

*Why: drives how forms are designed (3.2), who notes are written for (3.4), who owns the work (3.7), and whether patient-facing content is in scope.*

**1.3 Where do receiving providers live relative to your tenant?**

- Inside your tenant only  
- Partner tenants or organizations  
- External organizations without FHIR connectivity  
- Some combination

*Why: drives how recipients are stored and selected (3.3), and which outbound channels you support (3.5).*

**1.4 Is this a new build or replacing/extending something, and what other systems must it work with?**

- If replacing: what system or workflow, and what gaps drove the change?  
- If new: is referrals central to the product or additive?  
- What other systems will referrals flow to or from (source EHR, downstream EHRs at receivers, billing, HIE, payer portals, include DirectMessage)?

*Why: surfaces migration needs and integration boundaries that affect outbound channels (3.5), inbound intake (3.6), and matching of patient and provider records across systems.*

---

## Section 2: Feature Scoping

*Go through each row together. For each cell under Yes / No / Nice-to-have / Not sure, mark the customer’s answer. The* **§** *column points to the deep-dive subsection that covers each feature.*

| \# | Feature | § | Yes | No | Nice-to-have | Not sure |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | Multiple referral forms by specialty (vs one generic form) | 3.2 |  |  |  |  |
| 2 | Tie every referral to the visit where it was created | 3.2 |  |  |  |  |
| 3 | Pull in chart context automatically when sending (recent labs, problems, meds, allergies, coverage) | 3.4 |  |  |  |  |
| 4 | Different audiences for notes on the referral – patient, receiving provider, internal staff, or mix | 3.4 |  |  |  |  |
| 5 | Maintain your own directory of referral recipients (clinicians, sites, queues) in Medplum, vs sourcing from another system | 3.3 |  |  |  |  |
| 6 | Send referrals to recipients outside your product (printed or PDF summary, care-summary document, fax, secure messaging, email) | 3.5 |  |  |  |  |
| 7 | Accept referrals from outside (fax or scanned mail, secure inbox, Direct Message, care-summary drops, API or health-information exchange, typed in by staff) | 3.6 |  |  |  |  |
| 8 | Route / assign referrals and track work on open referrals (intake pools, ownership, aging or SLA dashboards) | 3.7 |  |  |  |  |
| 9 | Prior authorization workflow (eligibility checks, payer auth submissions before scheduling) | 3.7 |  |  |  |  |
| 10 | In-network / coverage check against patient insurance when selecting or verifying a recipient | 3.3 3.7 |  |  |  |  |
| 11 | Custom status steps for where the referral sits in workflow (e.g. sent → accepted → scheduled → done) | 3.8 |  |  |  |  |
| 12 | Tie results and visit notes back to the original referral so the thread stays complete | 3.9 |  |  |  |  |

---

## Section 3: Feature Deep Dives

*Cover each feature flagged Yes or Nice-to-have in Section 2\. The goal is to land on a clear recommended approach by the end of each section.*

Section 3 is grouped into four lanes:

| Lane | Subsections | When to read |
| :---- | :---- | :---- |
| **Referral Resource** | 3.1 | Always |
| **Sending Referrals** | 3.2 – 3.5 | When you originate referrals |
| **Receiving Referrals** | 3.6 | When you accept referrals from outside |
| **Lifecycle & Processing** | 3.7 – 3.9 | Always |

---

### Referral Resource

#### 3.1 Referral Semantics – Type, Coding, Intent, Priority

Each referral is one `ServiceRequest`. Decide how you classify it, how urgency is expressed, whether you expose a staff-facing reference number, and whether drafts exist before send.

**Questions:**

- How do you classify referrals (specialty, service, program), using standard codes, your own list, or both?  
- What urgency options do users pick, and should they match triage and reporting?  
- Do you show a referral number or reference beyond the system id?  
- Is the referral final at send/commit, or do you need a draft first?

| Situation | Approach |
| :---- | :---- |
| Category and service type | Bind `category` / `code` to agreed ValueSets (SNOMED, custom, or mix); drives search and reporting. |
| Priority | Set `ServiceRequest.priority`; keep labels aligned with clinical operations. |
| Display referral number | `ServiceRequest.identifier` with your namespace; assign at create when needed for ops or correspondence. |
| Default – signed at send | `intent = order` when the referral is transmitted or committed. |
| Draft before release (less common) | `intent = proposal` until release, or hold draft state outside FHIR until create – align with compliance and audit needs. |

---

### Sending Referrals

#### 3.2 Capture Flow – Form Library & Originating Context

Decide how referral intake is structured in the UI – one flow vs several by specialty or program, how answers are constrained, and whether every referral must link to an originating visit.

**Questions:**

- Do you use one referral intake flow for everyone, or different flows by specialty, service, or program?  
- Which fields must be chosen from lists or structured inputs (e.g. specialty, recipient, urgency), which allow free text, and what is required before the referral can be sent?  
- Must every referral tie to the visit where it was created, or can referrals start without a linked visit (e.g. intake, triage, outreach)?

| Situation | Approach |
| :---- | :---- |
| One form | One Questionnaire; Bot maps to one consistent `ServiceRequest` shape. |
| Specialty forms (e.g., variation based on specialty, service, etc.) or supplemental forms (specific extra information needed based on receiving clinic preferences) | Multiple Questionnaires; shared core fields \+ specialty-specific items (specialty forms) or additional Questionnaires specific to receiving clinics (supplemental forms); map each to `ServiceRequest`. |
| Encounter required | Require `encounter` when referrals always start from a scheduled or in-progress visit. |
| Encounter optional | Allow missing `encounter` when referrals can start outside a visit (e.g. intake); enforce `subject` and clinical reason instead. |

---

#### 3.3 Recipient & Directory Model

Decide who users may send a referral *to* (person vs site vs queue) and where your recipient directory lives – maintained in Medplum, fed from another system, or both.

**⚠ One-way door:** If recipients start as free text and you move to a structured directory later, expect to reconcile historical referrals against the new directory.

**Questions:**

- Can a referral go to a specific clinician, to a site, department, or queue, or either, depending on referral type?  
- Is your recipient directory edited and stored in Medplum, synced from another system, or mixed?  
- Should the recipient picker show or filter by in-network status for the patient's coverage – and where does that network status come from (synced payer provider directory, internal preferred-provider list, or a real-time eligibility query)?

| Situation | Approach |
| :---- | :---- |
| Named individual | performer → Practitioner with display for UX. |
| Pool or department | performer → Organization or HealthcareService when the referral is to a group or queue. |
| Directory in Medplum | Maintain Practitioner / Organization / HealthcareService; forms use references or search-backed pickers. |
| External directory | Sync or resolve selections to FHIR references at submit time via Bot or integration. |
| Network-aware picker | Filter or label recipients by in-network status. Approaches include: (1) internal preferred-provider list on Practitioner / Organization / HealthcareService, segmented per payer via OrganizationAffiliation; (2) per-patient CoverageEligibilityRequest at selection; (3) synced DaVinci PDEX Plan-Net  |

---

#### 3.4 What the Referral Carries – Notes & Clinical Package

Decide what leaves with the referral, how much is automated versus curated at send, and which audiences see each part of the narrative.

**Questions:**

- What clinical material must travel with the referral (reason for referral, problems or diagnoses, key meds and allergies, recent labs or imaging, coverage), and what should be filled in automatically versus selected or edited by the sender before send?  
- Should internal staff-only notes appear on the referral, or only content intended for the receiving provider and the patient?

| Situation | Approach |
| :---- | :---- |
| Receiver \+ patient messaging | `note` for receiving provider; `patientInstruction` for patient-facing instructions. |
| Lean vs rich package | Minimal `reasonReference` \+ short `note` vs broader `supportingInfo` and `DocumentReference` attachments for labs, imaging, PDFs. |
| Context at send | Auto-populate from chart where policy allows; let clinicians add or remove items before send. |

---

#### 3.5 Outbound Transmission – Channels & Payload Format

Decide how referrals leave your product – whether recipients get structured exchange versus documents – and what you produce for each sending path.

**Questions:**

- Do any recipients accept referrals through structured exchange with your system, or only as documents (e.g. PDF or care-summary packages)?  
- What outbound channels do you plan to use? (e.g., secure email, fax, API?)  
- For each outbound channel you plan to use, what do you actually send or generate – structured data export, PDF, care-summary document, or a mix?  
- Is the outbound channel the same for every recipient (e.g. always fax) or does it vary per recipient – and if it varies, where does that preference live (recipient directory, referral type, picked at send time)?  
- For each channel, do you need to confirm delivery, retry on failure, and show send history to staff – and what counts as "successfully sent"?

| Situation | Approach |
| :---- | :---- |
| FHIR-capable peer | Send or expose `ServiceRequest` and related resources via API; record transmission with `Communication` when useful for audit. |
| No FHIR API (e.g., secure email, fax channels) | Bot-generated PDF or C-CDA; attach or link via `DocumentReference` / Binary; log outbound `Communication`. |
| More than one channel | Keep one `ServiceRequest` as source of truth; run separate send paths per channel without divergent clinical content. |

---

### Receiving Referrals

#### 3.6 Inbound Intake – Channels & Ingestion

Decide how inbound referrals get created, reviewed, and matched to patients.

**Questions:**

- Which channels feed referrals into your product (e.g. automated exchange with a partner, fax or scanned documents, imported files or care-summary packages, typed in by staff)?  
- For each channel, does a referral become active in your system automatically, or only after staff review or cleanup?  
- When inbound patient information is incomplete or inconsistent, how do you find or confirm the correct patient record?  
- After accepting (or declining) a new inbound referral, do you need to send an acknowledgment or response back to the originator – and through what path?  
- When the same referral arrives more than once (e.g. fax \+ secure inbox), how do you detect and handle duplicates?

| Situation | Approach |
| :---- | :---- |
| Structured FHIR inbound | Validate and persist `ServiceRequest` (+ related resources); acknowledge per your protocol. |
| Structured documents or payloads you can parse (e.g. C-CDA XML, FHIR Bundles) | Bot or integration **parses** and **maps** fields → `ServiceRequest` (+ related resources); retain source as `DocumentReference` / `Binary`. Native structured interchange does **not** require OCR; image-only or bitmap PDF renditions may. |
| Fax, scanned, or image-like documents | **OCR** (often plus layout/template rules) → abstract fields → map to `ServiceRequest` \+ source `DocumentReference`; human review when confidence is low. |
| Patient identity | Match against existing `Patient` records using your identifiers and fallback workflow when match is unclear. |

---

### Lifecycle & Processing

#### 3.7 Working the Referral – Assignment, Authorization, Scheduling

After a referral is created or accepted, decide how it gets to the right person, what authorization and coverage steps gate the work, and how it turns into an actual visit or service that ties back to the referral.

*Note: Scheduling is covered in depth in its own Medplum discovery guide. This section stays at the level needed to align scheduling and authorization steps with the referral lifecycle.*

**Questions:**

- Who picks up a new referral first – an intake pool, a department queue, or an assigned coordinator (+ how does assignment logic work) – and how is ownership tracked and reassigned over time?  
- Does the referral need to confirm in-network status or covered benefits for the patient's plan before scheduling – and is that check separate from prior auth, or rolled into the same eligibility request?  
- Does the referral need to clear an authorization or coverage check before scheduling, and how do you track that authorization through to approval or denial?  
- When the referral becomes an actual visit (appointment, procedure, completed encounter), how do you tie that visit back to the originating referral?  
- Do you track aging or service-level expectations on open referrals (e.g. days since received, days pending an action), and how do staff find work that is overdue?

| Situation | Approach |
| :---- | :---- |
| Ownership and assignment | Task.owner (and Task.requester for the originator); pool ownership via Organization / HealthcareService; reassignments preserve audit. |
| Check in-network status / covered benefits | CoverageEligibilityRequest with purpose: benefits; response returns network participation (X12 271 EB-12: Y/N/U/W) and benefit details. Same clearinghouse path as prior auth. Run at recipient selection (3.3) or as a pre-schedule gate. |
| Check whether prior auth is required | CoverageEligibilityRequest with purpose: auth-requirements; response indicates authorizationRequired and any supporting documentation needed. |
| Submit a prior auth request | Claim with use: preauthorization (distinct from claim for completed services); ClaimResponse carries the payer's decision. Bots typically convert FHIR ↔ X12 EDI for transmission via clearinghouses (Availity, Change Healthcare, Waystar, etc.). |
| Gate scheduling on authorization | Hold the referral in an auth-pending Task.businessStatus until ClaimResponse returns approval; then transition to a scheduling-ready state. |
| Scheduling the work | Covered in the Scheduling discovery guide. From the referral side, link the resulting Appointment and downstream Encounter back to the referral via basedOn → ServiceRequest. |
| Aging and SLA | Search and dashboards over Task.lastModified / authoredOn; Subscriptions or scheduled Bots surface overdue items. |

---

#### 3.8 Lifecycle & BusinessStatus CodeSystem

Decide how you track a referral from request through completion – or cancellation – including naming those steps and handling cancel vs reroute.

**Questions:**

- Which milestones matter enough to show and operate on (e.g. sent, accepted, scheduled, completed, cancelled)?  
- How do you standardize labels for those milestones so reports, queues, and integrations all use the same meanings?  
- If a referral is cancelled or the recipient changes, do you revise the existing referral or create a new one?

| Situation | Approach |
| :---- | :---- |
| Linear milestones | Few `businessStatus` codes; move `Task.status` with clear transitions. |
| External signals | Bots or subscriptions update `businessStatus` when external systems report acceptance or completion. |
| Cancel / reroute | Terminal or superseded `Task` with reason; consistent rule for updating `ServiceRequest.performer` vs new referral. |

---

#### 3.9 Results & Closure Round-Trip

Decide what should come back after the referral is acted on, how those items attach to the right referral, and what counts as done for the referring side, the receiving side, or both.

**Questions:**

- After the referral goes out, what do you expect back – structured results (e.g. labs or imaging), a consult or visit summary, documents or letters, several of those, or nothing beyond tracking the referral itself?  
- When results or documents arrive, how do you attach them to the correct referral – including when human confirmation is needed?  
- What marks the referral complete for your operations – the referring organization, the receiving one, both, or different definitions for each?

| Situation | Approach |
| :---- | :---- |
| Labs / imaging | `DiagnosticReport` with `basedOn` → `ServiceRequest`. |
| Completed specialist visit | `Encounter` with `basedOn` → `ServiceRequest` when that models your workflow. |
| Narrative / PDF reply | `DocumentReference` with context pointing at the referral. |
| Linking | Manual selection or automated match using identifiers you control – define when human confirmation is required. |
| Closure | Terminal `businessStatus` or equivalent completion signal aligned with 3.8. |

