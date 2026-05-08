---
sidebar_position: 1
title: Designing Charting
keywords:
  - charting
  - visit templates
  - discovery
tags:
  - charting
---

# Designing Charting

Use this page during discovery before you model FHIR resources. It frames care context, visit types, structured capture, signing, and who owns templates. After decisions are clear, implement them with [Visit Templates](/docs/charting/visit-templates), the [chart data model](/docs/charting/chart-data-model), [Structured Data Capture](/docs/questionnaires/structured-data-capture), [PlanDefinition `$apply`](/docs/api/fhir/operations/plandefinition-apply), and [Provider visits](/docs/provider/visits) for Medplum Provider setup.

## Section 1: Use Case and Clinical Context

### 1.1 What Care Setting and Specialty?

- Primary care
- Urgent care
- Specialty (cardiology, dermatology, orthopedics, etc.)
- Behavioral health
- Multi-specialty / mixed

Why it matters: care settings have different visit templates and charting needs. Behavioral health leans on standardized screening instruments; primary care emphasizes vitals and preventive care; specialty care often runs on protocol-driven order sets. That shapes every visit template in section 2.1.

### 1.2 What Types of Encounters Will Be Charted?

- In-person visits
- Telehealth visits
- Async / messaging-based encounters
- Group visits
- Some combination

Why it matters: encounter types may need distinct visit templates. Async encounters chart differently — subjective context may come from a messaging thread. Group visits raise one note per patient versus a shared note.

### 1.3 What Are Clinicians Used to Today?

- What EHR or charting tool are clinicians coming from?
- What note formats or workflows do they want to preserve?
- What gaps drove the move?

Why it matters: charting changes carry adoption risk. Knowing what clinicians expect to stay the same matters as much as what to improve.

## Section 2: Key Decisions

### 2.1 What Visit Types Do You Provide, and What Does Each Entail?

The recommended baseline is one visit template ([`PlanDefinition`](/docs/api/fhir/resources/plandefinition)) per distinct visit type, combining structured forms ([`Questionnaire`](/docs/api/fhir/resources/questionnaire)) with embedded order actions ([`ActivityDefinition`](/docs/api/fhir/resources/activitydefinition)). [`$apply`](/docs/api/fhir/operations/plandefinition-apply) generates the [`CarePlan`](/docs/api/fhir/resources/careplan) and [`Task`](/docs/api/fhir/resources/task) resources at visit start.

:::caution[Visit types and scheduling]

Visit types are the bridge to scheduling. A visit template should align with healthcare service and scheduling conventions (for example, consistent service type codes). See [Scheduling](/docs/scheduling/) when you wire booking to templates.

:::

Questions:

- What are the distinct visit types? (annual wellness, acute sick, behavioral health intake, post-op follow-up, specialty consult, etc.)
- For each visit type, what does the clinician do during the encounter?
  - Measurements (vitals — BP, HR, weight, BMI, temp, SpO2)
  - Screening instruments (PHQ-9, GAD-7, AUDIT, fall risk, pediatric screens)
  - Orders (labs, imaging, referrals, prescriptions)
  - Narrative documentation
  - Review of patient history (problem list, allergies, meds)

What the answers drive:

For each visit type, map elements to `PlanDefinition` actions:

| Visit element                                      | How it is modeled in the visit template                                                      |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Vitals                                             | Questionnaire action; parse responses to Observations (`category = vital-signs`, LOINC codes) |
| Screening instruments (PHQ-9, GAD-7, etc.)       | Questionnaires per instrument                                                                |
| Orders (labs, imaging, referrals, prescriptions) | ActivityDefinition action — generates ServiceRequest or MedicationRequest Tasks              |
| Narrative documentation                          | [`ClinicalImpression`](/docs/api/fhir/resources/clinicalimpression).`note` (SOAP assessment)    |
| Patient history review                           | Surfaced via patient summary / sidebar — not encoded inside the PlanDefinition alone        |

If visit types share most structure: factor common pieces into shared Questionnaires or ActivityDefinitions referenced by multiple PlanDefinitions, or use conditional actions on a single PlanDefinition.

### 2.2 How Structured Should the Chart Be?

Medplum recommendation: structure data wherever possible. Map SOAP-style sections to discrete resources — Observations for findings, ClinicalImpression for assessment, ServiceRequest / MedicationRequest / CarePlan for the plan. Reserve free-text (`ClinicalImpression.note`) where clinicians need narrative.

Recommended pattern: surface a patient sidebar (problem list, allergies, active medications) alongside the active note, with inline edit where your product allows it.

Questions:

- For each visit type from section 2.1, what mix of structured forms versus free-text does the workflow require?
- Are orders placed inline within the chart, or in a separate orders area?

What the answers drive:

| Decision                | Medplum recommendation                                       | Alternative (tradeoff)                                                                  |
| ----------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Structured vs. freeform | Structured forms; free-text only where clinicians require it | Heavy free-text — not queryable; analytics and population health become custom work      |
| Order placement         | Inline in the visit template, generated as Tasks             | Separate orders module — loses inline ordering context                                  |

### 2.3 How Will Form Responses Become Queryable Data?

Medplum recommendation: parse questionnaire responses into FHIR resources whenever you need search, analytics, alerting, or interoperability. The choice is how to parse, driven by complexity. See [Structured Data Capture](/docs/questionnaires/structured-data-capture) for SDC plus `$extract` versus Subscription plus Bot patterns.

Questions:

- Does parsing need complex conditional behavior (score thresholds, external calls, multi-resource creation)?

What the answers drive:

| Situation                  | Approach                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Logic is relatively simple | SDC plus `$extract` — annotate the Questionnaire; invoke `$extract` on submission; logic lives with the form             |
| Logic is complex           | Subscription plus Bot — parse in code; more flexible, but Bot changes track form changes                                  |

### 2.4 What Are the Signing Requirements?

Standard pattern: set [`ClinicalImpression`](/docs/api/fhir/resources/clinicalimpression).`status` to `completed` and create [`Provenance`](/docs/api/fhir/resources/provenance) on the [`Encounter`](/docs/api/fhir/resources/encounter) for signer and timestamp. Signing records attestation; locking prevents edits — treat them as separate product decisions where needed.

Questions:

- Is co-signing required?
- Should signing lock immediately, or allow a post-sign editable window?
- Will amendments be needed after lock?
- Is a queryable audit trail of every signing event required?

What the answers drive:

| Situation            | Approach                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| Single signer        | ClinicalImpression `completed` plus Provenance on the Encounter                                |
| Co-signature         | Additional Provenance entries per co-signer — often needs custom UI                             |
| Lock timing          | Sign and lock together, or sign without locking for a post-sign window                         |
| Post-lock amendments | Addendum as a separate resource (for example DocumentReference) linked to the Encounter        |
| Audit trail          | Provenance per signing event; query `Provenance?target=Encounter/{id}`                         |

### 2.5 Who Owns and Edits Visit Templates?

Default: engineering implements template changes from a spec owned by clinical operations — clinical ops owns what changes; engineering ships via API or migrations when changes need review.

If clinical ops edits directly: use the Medplum App builder (FHIR-shaped), or build a custom admin UI for a friendlier authoring experience.

Questions:

- Will engineering implement from a clinical-ops spec, or does clinical ops need direct editing?

What the answers drive:

| Situation                                      | Approach                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Engineering implements from a spec (default) | API or migration scripts; templates as reviewed artifacts                                       |
| Clinical ops edits directly                   | Medplum App builder, or custom admin UI                                                          |

## See Also

- [Visit Templates](/docs/charting/visit-templates)
- [Chart Data Model](/docs/charting/chart-data-model)
- [Structured Data Capture](/docs/questionnaires/structured-data-capture)
- [Authoring Clinical Protocols](/docs/careplans/protocols)
