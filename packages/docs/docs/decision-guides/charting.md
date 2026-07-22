---
title: Charting Decision Guide
sidebar_label: Charting
sidebar_position: 3
download_slug: charting
---

# Charting Decision Guide

**For Reference:** [Medplum Charting docs](https://www.medplum.com/docs/charting) (covers SOAP Notes, Representing Diagnoses, Capturing Vital Signs, Allergies & Intolerances) · [Medplum Provider Visits](https://www.medplum.com/docs/provider/visits) · [Structured Data Capture](https://www.medplum.com/docs/questionnaires/structured-data-capture) · [PlanDefinition `$apply`](https://www.medplum.com/docs/api/fhir/operations/plandefinition-apply) · [QuestionnaireResponse `$extract`](https://www.medplum.com/docs/api/fhir/operations/extract)

---

## Section 1: Use Case & Clinical Context

### 1.1 What care setting and specialty?

- Primary care  
- Urgent care  
- Specialty (cardiology, dermatology, orthopedics, etc.)  
- Behavioral health  
- Multi-specialty / mixed

*Why it matters: care settings have different visit templates and charting needs. Behavioral health leans on standardized screening instruments; primary care emphasizes vitals and preventive care; specialty care often runs on protocol-driven order sets. Shapes every Visit Template in §2.1.*

### 1.2 What types of encounters will be charted?

- In-person visits  
- Telehealth visits  
- Async / messaging-based encounters  
- Group visits  
- Some combination

*Why it matters: encounter types may need distinct Visit Templates. Async encounters chart differently — the Subjective section may come from a messaging thread. Group visits raise the question of one note per patient vs. a shared note.*

### 1.3 What are clinicians used to today, and what do they want to keep consistent?

- What EHR or charting tool are clinicians coming from?  
- What note formats or workflows do they want to preserve?  
- What gaps drove the move?

*Why it matters: charting changes have high adoption risk. Knowing what clinicians expect to stay the same is as important as knowing what to improve.*

---

## Section 2: Key Decisions

### 2.1 What visit types do you provide, and what does each entail?

The recommended baseline is one Visit Template (PlanDefinition) per distinct visit type, combining structured forms (Questionnaires) with embedded order actions (ActivityDefinitions). `$apply` generates the CarePlan and Tasks at visit start.

**⚠ Visit types are the bridge to scheduling.** A Visit Template links to a HealthcareService by `serviceType` code — the same code that drives scheduling. See the Scheduling Discovery and Decision Guide.

**Questions:**

- What are the distinct visit types? (annual wellness, acute sick, behavioral health intake, post-op follow-up, specialty consult, etc.)  
- For each visit type, what does the clinician do during the encounter?  
  - Measurements (vitals — BP, HR, weight, BMI, temp, SpO2)  
  - Screening instruments (PHQ-9, GAD-7, AUDIT, fall risk, pediatric screens)  
  - Orders (labs, imaging, referrals, prescriptions)  
  - Narrative documentation  
  - Review of patient history (problem list, allergies, meds)

**What the answers drive:**

For each visit type, the elements map to PlanDefinition components:

| Visit element | How it's modeled in the PlanDefinition |
| :---- | :---- |
| Vitals | Questionnaire action; parses responses to Observations (`category = vital-signs`, LOINC codes) |
| Screening instruments (PHQ-9, GAD-7, etc.) | Questionnaires per each standard form |
| Orders (labs, imaging, referrals, prescriptions) | ActivityDefinition action — generates ServiceRequest or MedicationRequest Tasks |
| Narrative documentation | `ClinicalImpression.note` (captures the 'Assessment' part of SOAP) |
| Patient history review | Surfaced via the patient sidebar (see §2.2), not modeled in the PlanDefinition itself |

If visit types share most of their structure: factor common pieces into shared Questionnaires / ActivityDefinitions referenced by multiple PlanDefinitions, or use conditional actions on a single PlanDefinition.

---

### 2.2 How structured should the chart be?

**Medplum Recommendation:** Structured wherever possible. Medplum's documented [SOAP note approach](https://www.medplum.com/docs/charting/soap-notes) maps each section to discrete resources — Observations for findings, ClinicalImpression for assessment, ServiceRequest / MedicationRequest / CarePlan for the plan. Reserve free-text (`ClinicalImpression.note`) for the assessment (A) component of SOAP.

**⚠ Recommended pattern.** Surface a patient sidebar (problem list, allergies, active medications) alongside the active note, with inline edit.

**Questions:**

- For each visit type from §2.1, what mix of structured forms vs. free-text does the workflow require?  
- Are orders placed inline within the chart, or in a separate orders area?

**What the answers drive:**

| Decision | Medplum Recommendation | Alternative (and tradeoff) |
| :---- | :---- | :---- |
| Structured vs. freeform | Structured forms; free-text only where clinicians require it | Heavy free-text. Tradeoff: not queryable; does not leverage FHIR data advantages |
| Order placement | Inline in the Visit Template, generated as Tasks | Separate orders module. Tradeoff: loses inline ordering context |

---

### 2.3 How will form responses be parsed into queryable data?

**Medplum Recommendation:** always parse — without parsing, form data isn't queryable for analytics, alerting, or dashboards. The decision is *how*, driven by parsing complexity.

**Questions:**

- Does parsing need complex conditional behavior (score thresholds, external calls, multi-resource creation)?

**What the answers drive:**

| Situation | Approach |
| :---- | :---- |
| Logic is relatively simple | **SDC \+ `$extract`.** Annotate the Questionnaire with SDC extensions; invoke `$extract` on submission. Less flexible, but extraction logic lives in one place with the form |
| Logic is complex | **Subscription \+ Bot.** Subscribe to QuestionnaireResponse and parse in code. More flexible (conditional logic, external calls), but Bot code changes are required when the form changes |

---

### 2.4 What are the signing requirements?

The standard pattern: mark `ClinicalImpression.status = completed` and create a Provenance on the Encounter capturing the signer and timestamp. The Provenance on the Encounter is what makes the entire visit chart legally a signed note. Signing and locking are typically separate actions — signing records the signature; locking prevents further edits.

**Questions:**

- Is co-signing required (attending co-signs resident, provider co-signs scribe)?  
- Should signing lock immediately, or leave a post-sign editable window?  
- Will amendments be possible / needed after a chart is locked?  
- Is a queryable audit trail of every signing event required?

**What the answers drive:**

| Situation | Approach |
| :---- | :---- |
| Single signer | ClinicalImpression `completed` \+ Provenance on the Encounter |
| Co-signature | Append additional Provenance entries per co-signer; surfaces multi-signer state. Typically a custom build |
| Lock timing | Sign and lock together for immediate lock; sign without locking if a post-sign editable window is needed |
| Post-lock amendments | Addendum: a separate DocumentReference linked to the Encounter, preserving the original signed chart |
| Audit trail | Provenance per signing event; query via `Provenance?target=Encounter/{id}` |

---

### 2.5 Who owns and edits Visit Templates?

**Default:** engineering implements template changes from a spec maintained by clinical operations — clinical ops owns *what* should change, engineering implements via API or migration scripts. Works well when changes are infrequent or warrant review.

If clinical ops needs to edit directly, the Medplum App provides a builder interface out of the box. It's relatively bare-bones (FHIR-shaped), so customers wanting a more visual or user-friendly experience for non-technical users can build a custom admin UI on top.

**Questions:**

- Will engineering implement template changes from a clinical-ops spec, or does clinical ops need to edit directly?

**What the answers drive:**

| Situation | Approach |
| :---- | :---- |
| Engineering implements from a spec (default) | API or migration scripts; treated as code-reviewed artifacts |
| Clinical ops edits directly | Use the Medplum App's builder interface out of the box; build a custom admin UI on top if a more visual / user-friendly experience is required |

