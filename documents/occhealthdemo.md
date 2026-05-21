# DHS OHS Industry Day Occupational Health EHR/MIS Demo Plan

**Based on**: DHS Office of Health Security - Statement of Objectives (April 14, 2026)  
**Purpose**: Configure the current Medplum/Ubix demo environment into a credible DHS OHS Industry Day demonstration for occupational injury, illness, return-to-work, duty-location association, and exposure tracking workflows.

---

## 1. Executive Summary

This plan assumes the build will not be staffed or measured like a traditional people-day program. Instead, delivery is organized around:

- Parallel AI agent execution across design, implementation, test, documentation, and integration work
- Small, reviewable slices with explicit acceptance criteria
- Strong automated validation at every step
- Human oversight concentrated on policy, privacy, safety, and final product decisions

The objective is to produce a credible DHS occupational health demo in Medplum that proves:

- A unified occupational health record can be modeled cleanly in FHIR and Medplum
- Occupational surveillance and case management can be driven through configuration-first workflows
- Privacy, segmentation, and minimum-necessary disclosure rules can be enforced
- AI agents can accelerate delivery without weakening validation, auditability, or security discipline

## Industry Day Demo Focus

The Industry Day demonstration should focus on two DHS OHS scenarios that map directly to the SOO language and to the synthetic data already transferred into Medplum.

### Focus Area 1: Injury, Illness, and Return-to-Work Workflows

Hiive will demonstrate an end-to-end occupational injury and illness workflow: incident capture, OEM templates for common injuries, restriction management, follow-up scheduling, stakeholder notification, and return-to-work tracking. The demo should show clinicians documenting a work-related event, applying duty restrictions, scheduling reevaluation, generating or attaching required forms, and tracking recovery through tasks, dashboards, and patient timeline events.

### Focus Area 2: Employee Duty Locations and Exposure Tracking

Hiive will demonstrate how employees are associated with duty locations over time and how those associations support exposure tracking, incident response, duty-status management, targeted notifications, and follow-up activities. The demo should show component, location, job-role, exposure-event, and occupational-health workflow data linked inside the employee record with privacy-aware access.

## Current Live Demo Baseline

The current Medplum environment already contains enough generated data to anchor the story, but it needs a small amount of Medplum configuration and UI polish before it is ready for the DHS Industry Day audience.

| Item | Current value |
| --- | --- |
| Medplum project | `Ubix Data` / `Project/7e472dfd-3ab9-4b75-adac-38e0c5c5d6c8` |
| Provider app | Local: `http://127.0.0.1:5172/`; planned hosted app: `https://provider.ehr.hiivehealth.net/` |
| Patient app | Local: `http://127.0.0.1:5173/`; planned hosted app: `https://patient.ehr.hiivehealth.net/` |
| Provider demo profile | `Practitioner/59ea2d1d-f436-437c-a785-74850bddbfd3` / Dr Alex Demo |
| Provider membership | `ProjectMembership/4e9c0e27-9cfa-4d6b-ac9a-275ae863b9da` |
| Provider access policy | `AccessPolicy/05fa99c3-6400-4d8c-af38-8b00b890315d` |
| Import author | `ClientApplication/69a636e6-b110-4de7-ac73-4c2b642b48a2` / `ubix-data` |
| Workflow tasks loaded | 1,437 `Task` resources authored by `ubix-data` |
| Patients with tasks | 598 distinct patients |
| Demo provider tasks | 44 tasks assigned to Dr Alex Demo after linking the provider membership to the imported practitioner profile |
| RTW sample patient | `Patient/a3562d64-680b-4802-bc78-4b1d0d487080` / Avery Rivera |
| RTW sample task | `Task/6b0849f7-bd0e-42f0-a835-b441c2dccade` / RTW case follow-up |
| RTW sample case | `EpisodeOfCare/e2cf8f66-b22b-4577-b858-b0481d24f0b8` / Exposure Incident |

Current baseline behavior:

- The provider demo user can sign into the `Ubix Data` project and view patient charts.
- The provider navigation shows `Tasks 44` for Dr Alex Demo.
- Patient charts expose generated workflow tasks through the `Tasks` tab and the timeline.
- RTW appears today as `RTW case follow-up` workflow tasks focused on `EpisodeOfCare` resources.
- Occupational events such as `Exposure Incident` appear in the patient summary/problem list for generated patients.
- Timeline card authors now resolve to `ubix-data` instead of `[Forbidden]` because the provider policy can read `ClientApplication` author references.

Current gaps to close before Industry Day:

- RTW status is not yet modeled as a first-class field such as `full duty`, `modified duty`, `off work`, or `cleared`.
- Work restrictions are not yet visible as structured restrictions such as lifting limits, PPE requirements, schedule limits, or reevaluation date.
- The sample RTW tasks are visible from the patient chart, but representative RTW tasks should also be assigned to the demo provider so they appear in `My Tasks`.
- `EpisodeOfCare` should be added to the provider access policy for read/search/history/vread so clinicians can inspect RTW case containers directly.
- Duty-location and exposure associations exist in the generated data strategy, but the provider app needs a dedicated occupational summary card or tab so the audience does not have to interpret raw FHIR lists.
- Supervisor and HR views should be configured as minimum-necessary views, not as full clinical chart access.

## Medplum Configuration Plan for the Demo

The demo should stay Medplum-native: use Medplum projects, project memberships, access policies, ClientApplication resources, FHIR R4 resources, provider/patient apps, Bots or Subscriptions where useful, and FHIR search/history APIs. Do not bypass Medplum with direct database reads or custom side channels.

### 1. Project, Apps, and Login Configuration

1. Use the `Ubix Data` project as the system of record for the demo.
2. Keep the `ubix-data` client as machine-to-machine import infrastructure only.
3. Use human `User` plus `ProjectMembership` records for demo personas.
4. Keep the provider demo membership linked to the imported Dr Alex Demo practitioner so assigned tasks appear in the Provider app.
5. Create two additional non-admin demo personas if the script needs role switching:
	- Occ health clinician: full clinical and occupational workflow access.
	- Supervisor or HR reviewer: minimum-necessary duty status, restriction summary, clearance status, and notification status only.
6. Use the existing patient and provider `ClientApplication` resources for browser sign-in.
7. Do not demonstrate with bootstrap admin credentials.

### 2. Access Policy Configuration

The provider access policy must support clinical chart review, occupational case review, and timeline attribution without granting project administration.

Provider policy additions required for Industry Day:

| Resource | Interactions | Why it is needed |
| --- | --- | --- |
| `EpisodeOfCare` | read, search, history, vread | RTW and exposure cases are represented as occupational case containers. |
| `Task` | read, search, create, update, history, vread | Follow-up scheduling, task assignment, and RTW workflow tracking. |
| `Observation` | read, search, create, update, history, vread | Work status, restriction status, vitals, screening, and exposure measurements. |
| `DetectedIssue` | read, search, create, update, history, vread | Exposure incidents, care gaps, and safety signals. |
| `ServiceRequest` | read, search, create, update, history, vread | Surveillance orders, follow-up requests, and occupational program requirements. |
| `DocumentReference` | read, search, create, update, history, vread | Injury forms, RTW forms, external documents, and privacy-aware attachments. |
| `Questionnaire` and `QuestionnaireResponse` | read, search, create, update, history, vread | Incident intake, OEM templates, restriction forms, and clearance questionnaires. |
| `Communication` | read, search, create, update, history, vread | Privacy-aware stakeholder notifications. |
| `ClientApplication` | read, search, history, vread | Resolves timeline `meta.author` references such as `ubix-data`. |
| `Location` and `Organization` | read, search, history, vread | Duty location, DHS component, clinic, lab, and worksite context. |

Supervisor and HR policies should be separate and narrower:

- Permit patient identity, duty location, role/component, active restriction summary, clearance status, next reevaluation date, and notification status.
- Deny or omit clinical details such as diagnoses, lab results, behavioral health observations, full notes, and sensitive attachments.
- Demonstrate this with a separate login or a scripted before/after role comparison.

### 3. FHIR Resource Configuration

The generated data should be shaped into a small number of clear Medplum-native resource patterns for the demo.

| Demo concept | FHIR/Medplum representation | Demo behavior |
| --- | --- | --- |
| Employee | `Patient` | The employee chart is the longitudinal occupational health record. |
| DHS component | `Organization` | Component context for assignment, care delivery, and reporting. |
| Duty location | `Location` | Worksite or operational location used for exposure tracking. |
| Employee duty assignment | `Observation` or extension-backed occupational assignment record with `effectivePeriod`, `Location`, `Organization`, and job role components | Shows where an employee worked and when. |
| Incident or exposure event | `DetectedIssue`, `Condition`, `Encounter`, and `EpisodeOfCare` | Captures the event, case container, diagnosis/problem, and care context. |
| OEM injury template | `Questionnaire` plus `QuestionnaireResponse` | Provides configurable injury/illness documentation forms. |
| RTW case | `EpisodeOfCare` | Tracks the active case from incident through clearance. |
| RTW status | `Observation` with a demo code system such as `work-duty-status` | Displays `off work`, `modified duty`, `full duty`, or `cleared`. |
| Work restrictions | `Observation` or `QuestionnaireResponse` with structured components | Captures restriction type, limit, effective date, expiration, and reevaluation date. |
| Follow-up schedule | `Task`, `Appointment`, `Schedule`, and `Slot` | Drives clinician work queue and reevaluation scheduling. |
| Required forms | `DocumentReference` or `Composition` | Shows generated or attached injury, clearance, and RTW forms. |
| Notifications | `Communication` and optionally `Subscription`/Bot-created tasks | Shows privacy-aware communication to employee, supervisor, HR, or component safety contact. |
| Exposure cohort | `Group` or `List` | Shows employees associated with a duty location or exposure event. |
| Audit trail | `AuditEvent` and resource history | Shows who viewed or changed sensitive occupational health data. |

### 4. Data Configuration Work

Use the generated synthetic data as the base, then curate a small number of high-signal demo employees. The live environment should not rely on random search during the presentation.

Required curated cases:

1. **Avery Rivera - RTW/exposure case**
	- Existing patient: `Patient/a3562d64-680b-4802-bc78-4b1d0d487080`.
	- Existing RTW task: `Task/6b0849f7-bd0e-42f0-a835-b441c2dccade`.
	- Existing case container: `EpisodeOfCare/e2cf8f66-b22b-4577-b858-b0481d24f0b8`.
	- Add or verify structured RTW status and work restriction observations.
	- Assign one RTW task to Dr Alex Demo or the demo occ health clinician.

2. **Jamie Brown - clean timeline and surveillance example**
	- Existing patient: `Patient/af7f6287-2dc4-4b2a-89f9-d4437ea17607`.
	- Use this case to show importer author attribution, surveillance requirements, and timeline readability.

3. **Duty-location exposure cohort**
	- Pick one generated duty location with enough employees for a credible exposure investigation.
	- Create or verify a `Group` or `List` of exposed employees.
	- Link each employee to assignment history and follow-up tasks.

4. **Supervisor/HR minimum-necessary case**
	- Reuse the RTW case but show only duty status, restrictions, expected reevaluation date, and clearance impact.
	- Hide clinical diagnosis, notes, and sensitive lab details.

### 5. Provider UI Configuration

The generic Provider app can show the data today, but the Industry Day story needs a purpose-built path. Configure or add the following views:

1. **Occupational Summary card on the patient chart**
	- Current duty location.
	- DHS component or operating unit.
	- Job role or exposure program.
	- Active RTW status.
	- Current restrictions.
	- Next reevaluation or clearance date.

2. **Occupational Health tab**
	- Incident timeline.
	- RTW case status.
	- Restrictions and expiration dates.
	- Exposure events and linked duty locations.
	- Related tasks, appointments, forms, and notifications.

3. **RTW dashboard**
	- Open RTW cases.
	- Restricted-duty employees.
	- Reevaluations due in the next 7, 14, and 30 days.
	- Cases awaiting supervisor/HR notification.
	- Cases pending clearance.

4. **Exposure tracking dashboard**
	- Duty locations with active exposure events.
	- Employees assigned to the location during the exposure window.
	- Follow-up status by employee.
	- Surveillance orders, lab status, and outstanding tasks.

5. **Minimum-necessary supervisor view**
	- Employee name, component, duty location, work status, restrictions, and expected reevaluation date.
	- No diagnosis, clinical notes, lab values, or behavioral health details.

### 6. Workflow Automation Configuration

Use Medplum Bots or scheduled scripts where automation strengthens the story.

1. When an incident intake `QuestionnaireResponse` is completed, create or update:
	- `Encounter` for the occupational visit.
	- `Condition` or `DetectedIssue` for the injury/illness/exposure signal.
	- `EpisodeOfCare` for the RTW case.
	- `Task` for clinician follow-up.
	- `Observation` for initial RTW status and restrictions.
	- `DocumentReference` for generated or attached forms.

2. When restrictions are added or changed:
	- Create a reevaluation `Task`.
	- Optionally create an `Appointment` request.
	- Create privacy-aware `Communication` records for the employee, supervisor, HR, or safety contact.
	- Write an audit event or rely on Medplum resource history for change review.

3. When a duty-location exposure event is logged:
	- Identify employees assigned to the location during the exposure window.
	- Create a `Group` or `List` cohort.
	- Create targeted follow-up `Task` resources.
	- Generate surveillance `ServiceRequest` resources where required.
	- Notify only the appropriate roles with minimum-necessary content.

### 7. Validation and Demo Readiness Checks

Before the Industry Day demo, verify the following:

- Provider demo login works without admin credentials.
- Provider app shows `Tasks 44` or another intentional task count for the demo practitioner.
- At least one `RTW case follow-up` task is visible in `My Tasks`.
- RTW sample patient has an active RTW status and at least one structured restriction.
- Patient timeline shows tasks and author names without `[Forbidden]`.
- Provider can read the RTW `EpisodeOfCare` and linked resources.
- Duty-location dashboard has a named location, exposed employee cohort, and follow-up tasks.
- Supervisor/HR view hides clinical details while showing restrictions and duty-status impact.
- All direct demo URLs are tested in the browser before the presentation.

## Step-by-Step Industry Day Demo Guide

This runbook assumes the provider app is available locally at `http://127.0.0.1:5172/` or deployed at `https://provider.ehr.hiivehealth.net/`. Use the non-admin provider demo login documented in the deployment guide.

### Pre-Demo Setup

1. Confirm the Medplum API is reachable at `https://api.ehr.hiivehealth.net/`.
2. Start or open the Provider app.
3. Sign in as the provider demo user.
4. Confirm the left navigation shows `Tasks 44` or the expected curated task count.
5. Open the direct RTW patient URL in a separate tab for quick recovery: `http://127.0.0.1:5172/Patient/a3562d64-680b-4802-bc78-4b1d0d487080/Task`.
6. Open the surveillance/timeline example in another tab: `http://127.0.0.1:5172/Patient/af7f6287-2dc4-4b2a-89f9-d4437ea17607/timeline`.
7. Have the supervisor or HR demo login ready only if the minimum-necessary role switch is part of the live script.

### Opening Narrative

1. State that the demo is running on a Medplum-native FHIR R4 platform.
2. Explain that generated data was transferred into the `Ubix Data` project and is accessed through Medplum APIs, not a separate database path.
3. Point out that the same longitudinal employee chart supports clinical care, occupational workflows, exposure investigations, and role-based views.
4. Frame the demo around the two DHS OHS focus areas: RTW workflows and duty-location exposure tracking.

### Focus Area 1 Demo: Injury, Illness, and RTW Workflow

1. From the Provider app, open **Tasks**.
2. Show the clinician work queue and explain that Medplum `Task` resources drive follow-up scheduling and operational work.
3. Open an RTW task. If curated RTW tasks are assigned to the demo provider, use **My Tasks**. If not, use the direct patient URL for Avery Rivera and the patient **Tasks** tab.
4. In Avery Rivera's chart, show the patient summary:
	- Employee demographics.
	- Occupational problem context such as `Exposure Incident`.
	- Related surveillance or lab items.
5. Select **Tasks** and open **RTW case follow-up**.
6. Show task details:
	- Status, currently `REQUESTED` until acted on.
	- Owner or assignee.
	- Patient reference.
	- Focus reference to the RTW case container.
	- Description or reason for follow-up.
7. Navigate to **Timeline** to show that the RTW task is part of the employee's longitudinal record.
8. After the RTW-status configuration is added, show the occupational summary card:
	- RTW status, such as `modified duty`.
	- Active restrictions.
	- Effective dates and expiration.
	- Reevaluation date.
9. Demonstrate restriction management:
	- Open the restriction form or questionnaire.
	- Add a restriction such as limited lifting, no field duty, or PPE requirement.
	- Save it as structured FHIR data.
	- Show the new task or appointment generated for reevaluation.
10. Demonstrate privacy-aware notification:
	- Show the clinician can see the clinical details.
	- Show the supervisor or HR view only displays duty status and restrictions.
	- Emphasize that clinical diagnosis and sensitive results are not disclosed in the minimum-necessary view.
11. Close the scenario by showing RTW status moving toward clearance or follow-up.

### Focus Area 2 Demo: Duty Locations and Exposure Tracking

1. Open the exposure tracking dashboard.
2. Select a duty location with an active or historical exposure event.
3. Show the location profile:
	- DHS component.
	- Physical or operational location.
	- Exposure event or hazard context.
	- Employees assigned during the relevant time window.
4. Open the exposed employee cohort.
5. Select one employee and open the employee chart.
6. Show the occupational summary card:
	- Current duty location.
	- Prior duty location history.
	- Job role or exposure program.
	- Related exposure events.
7. Show how the exposure event is linked to follow-up:
	- `DetectedIssue` or event resource.
	- Surveillance `ServiceRequest`.
	- Follow-up `Task`.
	- Any generated document or communication.
8. Demonstrate targeted notification:
	- Create or show the generated follow-up task for affected employees.
	- Show the employee, clinician, supervisor, and HR each receive only the information their role permits.
9. Close with the dashboard view showing follow-up completion, overdue items, and unresolved cases.

### Suggested Talk Track

- "This is not a separate occupational health sidecar. The workflow is built on Medplum's FHIR data model, access policies, tasks, forms, history, and search APIs."
- "A clinician can move from an incident or exposure signal to a case, restriction, reevaluation task, and clearance workflow without leaving the employee record."
- "Duty location is not just an address. It becomes a longitudinal association that can drive exposure investigation, notifications, and follow-up."
- "The same data supports different views: full clinical context for clinicians, and minimum-necessary restriction status for supervisors or HR."

### Fallback Path if a Custom Dashboard Is Not Ready

If the dedicated occupational dashboard is not ready in time, use the built-in Provider views:

1. **Tasks** for workflow queue and RTW follow-up.
2. **Patient chart -> Tasks** for patient-specific occupational follow-up.
3. **Patient chart -> Timeline** for the longitudinal record.
4. **Patient chart -> Documents** for attached forms and external records.
5. Direct resource views for `EpisodeOfCare`, `DetectedIssue`, `ServiceRequest`, and `Observation` only if the audience is technical.

This fallback is acceptable for an internal dry run, but the Industry Day presentation should use the occupational summary and dashboard views so the demo reads as an occupational health product rather than a generic FHIR resource explorer.

---

## 2. Agent-First Planning Assumptions

### 2.1 What Changes in an Agent-Driven Build

The original plan assumed sequential delivery and human queue time. This revised plan replaces that with:

- **Work package orchestration instead of staged handoff plans**
- **Parallel execution instead of mostly serial handoffs**
- **Exit criteria instead of schedule estimates**
- **Automated validation gates instead of manual status checkpoints**
- **Prompted task decomposition instead of large implementation batches**

### 2.2 What Humans Still Own

AI agents should not be treated as autonomous policy owners. Human leads still own:

- Clinical and occupational health policy interpretation
- Privacy and legal decisions
- Final approval of data sharing rules and minimum-necessary views
- Security acceptance and deployment approval
- Demo prioritization and scope cuts

### 2.3 What Agents Should Own

AI agents should do the bulk of:

- Code generation and refactoring
- FHIR profile and schema authoring
- UI scaffolding and iterative refinement
- Test generation
- Data mapping and synthetic data generation
- Documentation drafting
- Integration adapters and transformation logic
- Regression analysis across PRs

---

## 3. Delivery Model

### 3.1 Recommended Agent Roles

The demo should be executed by a coordinator plus specialized agent roles.

| Role | Primary Responsibility | Outputs |
|------|------------------------|---------|
| Orchestrator Agent | Break work into slices, assign agents, enforce gates | Work queue, acceptance criteria, merge order |
| FHIR Modeling Agent | Profiles, extensions, value sets, example resources | FHIR artifacts, example bundles |
| UI Agent | React screens, forms, dashboards, workflow pages | UI components, routes, interaction flows |
| Workflow Agent | Business rules, enrollment logic, recalls, RTW flows | Services, rules, task orchestration |
| Integration Agent | HR, lab, analytics, import/export adapters | Connectors, transforms, API contracts |
| Test Agent | Unit, integration, E2E, regression checks | Tests, fixtures, failure analysis |
| Security Agent | RBAC, audit events, segmentation, risk review | Access rules, audit coverage, security checks |
| Documentation Agent | Demo scripts, runbooks, technical docs | Docs, walkthroughs, setup guidance |

### 3.2 Work Package Shape

Every work item should be expressed as a small, agent-executable slice with:

- Problem statement
- Target files or implementation surface
- Acceptance criteria
- Validation commands
- Risk notes
- Required reviewers

Each slice should ideally be mergeable independently.

### 3.3 Merge Strategy

- Keep one active branch per slice or tightly related slice cluster
- Require automated validation before merge
- Prefer short-lived branches and incremental PRs
- Merge foundational model changes before dependent UI and workflow branches
- Use feature flags or route-level isolation where partial features need to coexist

---

## 4. System Architecture for the Demo

### 4.1 Three-Layer Domain Model

#### Layer 1: Clinical / Occupational Health Record
- Encounter documentation for pre-placement, periodic, fitness-for-duty, post-exposure, and exit exams
- Lab results, imaging, vitals, and structured findings
- Immunizations, fit testing, outside records, and exam-review-only ingestion

#### Layer 2: Occupational / Exposure Intelligence
- Job history and duty locations
- Similar Exposure Groups (SEGs)
- Exposure programs and surveillance participation
- Incidents, near misses, hazard classifications, and controls
- Longitudinal exposure-aware clinical context

#### Layer 3: Case Management / Decision Support
- Follow-up tasks and reminders
- Clearance and work restriction workflows
- Notifications and outreach
- Clinical override tracking
- Readiness dashboards and cohort views

### 4.2 Architectural Constraint

The demo must still reflect the DHS premise that this is a **commercial, configurable, standards-based solution**, not a custom greenfield system. Agent speed should not turn the demo into a highly bespoke architecture that would be unrealistic to operate.

That means:

- Prefer Medplum-native resource modeling and configuration over custom subsystems
- Use standard FHIR resources and extensions before inventing new storage models
- Keep custom code concentrated in workflow orchestration, UI composition, and integration adapters

---

## 5. FHIR Data Model

### 5.1 Core Resources

**People and Organization**
- `Patient` for DHS employees
- `RelatedPerson` for emergency or administrative contacts
- `Organization` for DHS components, clinics, vendors, and labs
- `Practitioner` and `PractitionerRole` for occupational health staff and reviewers

**Clinical Record**
- `Encounter` for occupational exam and injury-related visits
- `Observation` for vitals, audiometry, spirometry, lab values, and surveillance findings
- `DiagnosticReport` for lab and imaging summaries
- `Condition` for occupational illness, injury, and relevant chronic findings
- `Procedure` for exams, fit testing, immunization-related procedures, and interventions
- `Immunization` for occupational vaccine history
- `ServiceRequest` for ordered surveillance services and follow-up work
- `DocumentReference` for scanned outside records and imported exam packets

**Occupational Health / Surveillance**
- `CarePlan` for surveillance program enrollment and management
- `Task` for recalls, follow-ups, review queues, and outreach work
- `List` for surveillance cohorts and readiness cohorts
- `Flag` for important employee-level alerts and review markers

**Governance / Access / Audit**
- `Consent` for data sharing rules where represented at the resource layer
- `AuditEvent` for access logging and disclosure tracking
- `Provenance` for imported records and agent-produced transformations where useful

### 5.2 Required Profiles and Extensions

Create profiles or implementation guides for:

- Occupational encounter classification
- Employee job history and duty location summary
- Exposure history and incident linkage
- Surveillance panel participation
- Clearance status and work restrictions
- Clinical override rationale and review trail
- Minimum-necessary disclosure artifacts for supervisors and HR

### 5.3 Demo Data Expectations

The synthetic dataset should show meaningful occupational complexity, not just happy-path CRUD.

Include:

- Multiple DHS components
- Direct-care and exam-review-only operating modes
- At least 50 realistic employee records
- Exposure-heavy personas and low-risk personas
- Longitudinal observations across multiple years
- Injury, RTW, surveillance due, and override scenarios

---

## 6. Core Demo Workflows

### 6.1 Pre-Placement and Baseline Exam
- Ingest employee identity and role context from HR feed
- Apply job and exposure mapping rules
- Auto-enroll surveillance requirements
- Complete baseline encounter and labs
- Record initial clearance decision

### 6.2 Periodic Surveillance Review
- Generate due and overdue queue
- Compare annual findings against baseline and prior trends
- Surface relevant exposures and prior incidents
- Support clinical override capture when policy allows
- Update readiness and clearance state

### 6.3 Injury / Illness / Exposure Event
- Document incident details and exposure category
- Link event to role, location, SEG, and surveillance program
- Generate OSHA-related artifacts and follow-up tasks
- Start RTW or case-management sequence where applicable

### 6.4 Return-to-Work Workflow
- Capture fit / restricted / not fit outcome
- Track time-bounded restrictions and re-evaluation dates
- Present minimum-necessary views to HR and supervisors
- Audit every disclosure and status change

### 6.5 Exposure Program and Recall Engine
- Define configurable surveillance panels
- Map panels to jobs, tasks, exposures, and locations
- Auto-enroll eligible employees
- Create recall queues and reminder tasks

### 6.6 Medical Readiness and Longitudinal Review
- Aggregate trends across years and encounters
- Show surveillance compliance and readiness state
- Identify at-risk cohorts and outstanding actions
- Support enterprise, component, and employee drill-down

---

## 7. Dependency-Ordered Backlog

This build should be organized as dependency-managed backlog domains. Items below are listed in logical dependency order, but independent slices can run in parallel whenever their prerequisites are satisfied.

### Delivery Controls and Repo Safety

**Objective**: Establish an environment where agents can work repeatedly without destabilizing the repo.

**Completion Criteria**
- Medplum environment runs locally or in shared staging
- Validation commands are documented and runnable
- Synthetic data seeding path exists
- PR template and acceptance format exist for agent-generated slices

**Typical Slice Types**
- Environment setup scripts
- Repo conventions and validation tasks
- Demo seed data pipeline
- Baseline CI checks

### Canonical Occupational Health Model

**Objective**: Lock down the FHIR and Medplum representation before dependent UI and workflow slices expand.

**Completion Criteria**
- Core profiles and extensions are implemented
- Example employee records load successfully
- Exposure, surveillance, clearance, and restriction concepts are represented consistently
- Example longitudinal patient bundle is available for testing

**Typical Slice Types**
- FHIR profile authoring
- Example bundles
- Value set and terminology mapping
- Data dictionary generation

### Core Clinical Vertical Slice

**Objective**: Prove that the occupational health record is functional end to end for clinician and reviewer workflows.

**Completion Criteria**
- Pre-placement workflow works end to end
- Periodic exam workflow works end to end
- Exam-review-only flow works with imported results
- Employee summary shows longitudinal occupational context

**Typical Slice Types**
- Exam forms and routes
- Encounter orchestration
- Longitudinal summary UI
- Result ingestion and rendering

### Surveillance and Readiness Engine

**Objective**: Demonstrate that the system behaves like an occupational health platform rather than a generic EHR.

**Completion Criteria**
- Surveillance panel definition is configurable
- Auto-enrollment rules run correctly
- Recall queue is generated from real sample data
- Clinical overrides are visible and auditable
- Readiness dashboard surfaces compliance and risk signals

**Typical Slice Types**
- Eligibility engine
- Recall services
- Trend comparison views
- Readiness dashboards

### Injury, Exposure, and RTW Operations

**Objective**: Show operational case-management workflows beyond encounter documentation.

**Completion Criteria**
- Injury/exposure event capture works
- RTW restrictions and re-evaluations work
- Task-driven follow-up works
- OSHA support artifacts are generated from captured data

**Typical Slice Types**
- Incident forms
- Case management board
- Restriction logic
- OSHA and FECA-oriented export views

### Privacy, Audit, and Interoperability Controls

**Objective**: Prove the demo is credible for DHS privacy, governance, and integration expectations.

**Completion Criteria**
- Role-based segmentation is enforced
- Supervisor and HR views are minimum-necessary only
- Audit logging is visible and queryable
- At least one HR ingest path and one lab/import path are demonstrated

**Typical Slice Types**
- Access policies
- Disclosure views
- Audit dashboards
- Integration adapters and import mappings

### Demo Hardening and Narrative Quality

**Objective**: Turn the implementation into a repeatable, high-confidence demonstration.

**Completion Criteria**
- Demo script is documented
- Sample personas cover major DHS scenarios
- Seed data can fully recreate the demo
- Core paths have automated regression coverage
- User-facing and technical docs are ready

**Typical Slice Types**
- Demo walkthroughs
- Persona scripting
- Regression packs
- Runbooks and architecture docs

---

## 8. Cross-Cutting Workstreams

The following workstreams should run continuously once the canonical model backbone is stable enough to support dependent slices.

### Workstream A: FHIR and Data Modeling
- Profiles and extensions
- Synthetic sample bundles
- Terminology/value set normalization

### Workstream B: UI and Interaction Design
- Clinician forms
- Employee summary views
- Dashboards and case boards

### Workstream C: Workflow Automation
- Enrollment rules
- Recall generation
- Notifications and task orchestration

### Workstream D: Privacy and Security
- Role segmentation
- Minimum-necessary views
- Audit completeness

### Workstream E: Integration and Migration
- HR ingest
- External exam import
- Lab import and analytics export

### Workstream F: Validation and Demo Reliability
- Test generation
- Regression fixtures
- Demo reset and re-seed capabilities

---

## 9. Agent Operating Rules

### 9.1 Slice Size

Agents should not be given broad prompts like "build surveillance." They should receive narrow instructions such as:

- Add the `Encounter` occupational classification extension and tests
- Build the recall queue page using existing seeded employees
- Implement minimum-necessary supervisor summary for work restrictions only

### 9.2 Validation Requirements

Every agent-generated PR should include:

- A short problem statement
- Acceptance criteria
- Files changed
- Validation run and result
- Known follow-ups or risks

### 9.3 Human Review Requirements

Require human review for:

- Privacy rule changes
- Security-sensitive access changes
- Clinical override logic
- OSHA / FECA output assumptions
- Any change that reframes DHS policy intent

### 9.4 Prompt and Artifact Hygiene

Maintain reusable prompt packs for:

- FHIR modeling tasks
- React workflow tasks
- Security review tasks
- Test generation tasks
- Documentation generation tasks

Prompt packs should include local validation commands and repo-specific conventions so each agent does less rediscovery.

---

## 10. Technology Stack

**Core Platform**
- Medplum server and Medplum app extension points
- PostgreSQL
- React + TypeScript

**Integration and Automation**
- FHIR R4 APIs
- HL7 v2 ingestion where needed
- Background jobs for recalls and notifications
- Synthetic data loaders and bundle import utilities

**Agent Enablement**
- Strong repo scripts for lint, test, typecheck, seed, and reset
- Repeatable local/staging environments
- CI that mirrors what agents run locally

**Visualization and Demo UX**
- Trend visualization for surveillance data
- Dashboarding for readiness and cohort analytics
- Route-level views for clinician, supervisor, HR, and admin personas

---

## 11. Demo Persona Set

Use a persona set that exercises different workflows and access models.

1. **Law Enforcement Officer**: annual fitness review, hearing conservation, prior incident exposure
2. **Administrative Employee**: standard pre-placement and periodic monitoring, minimal exposure profile
3. **HAZMAT / High-Exposure Employee**: respiratory surveillance, chemical exposure history, multiple follow-ups
4. **Training Center Instructor**: fit-for-duty requirements, repeated evaluations, RTW scenario
5. **Supervisor Persona**: minimum-necessary visibility into restrictions and readiness impact
6. **HR Persona**: clearance and restriction management without clinical details

---

## 12. Success Criteria

The revised plan should be judged by delivery quality and demo credibility, not schedule assumptions.

### Product Success
- Core occupational health workflows work end to end
- Longitudinal surveillance and trend views are credible
- Privacy and segmentation behavior is demonstrable
- Integration and import stories are believable and standards-based
- Demo data supports realistic scenarios instead of toy examples

### Delivery Success
- Agents can implement slices in parallel without destabilizing the codebase
- CI reliably catches regressions from agent-generated changes
- Each merged slice is independently reviewable and reversible
- Documentation stays current with the implementation
- Demo environments can be recreated from seed scripts and configuration

### Executive Demo Success
- The system clearly differentiates itself from a general EHR
- The demo shows surveillance, readiness, RTW, and exposure-aware longitudinal review
- The demo communicates configuration-first extensibility rather than one-off custom code

---

## 13. Immediate Next Actions

1. Add `EpisodeOfCare` read/search/history/vread to the provider access policy so RTW case containers are visible to clinicians.
2. Curate the Avery Rivera RTW case with first-class RTW status and structured work restriction resources.
3. Assign at least one representative `RTW case follow-up` task to the provider demo practitioner so the story starts from **My Tasks**.
4. Add an occupational summary card or tab to the Provider patient chart for duty location, exposure context, RTW status, restrictions, and reevaluation date.
5. Configure an exposure tracking dashboard using generated duty-location and cohort data.
6. Create or verify supervisor/HR minimum-necessary demo access for restrictions and readiness impact without clinical details.
7. Dry-run the step-by-step Industry Day guide in the browser and update patient/task IDs if the curated data changes.

---

## 14. Active Implementation Checklist

### FHIR Model Foundation
- [x] Create a reusable occupational health foundation transaction bundle
- [x] Add canonical occupational health profile, extension, identifier, and code system URL constants
- [x] Add example employee, encounter, surveillance, task, and work-status resources
- [x] Add a Medplum client loader example for the foundation bundle
- [x] Add initial occupational health `StructureDefinition` examples for employee and encounter modeling
- [x] Add missing extension `StructureDefinition` examples referenced by the core profiles
- [x] Add occupational health `CodeSystem` and `ValueSet` examples for core terminology

### FHIR Workflow Examples
- [x] Add CRUD and search workflow examples for occupational health enrollment and recall flows
- [x] Add a surveillance recall bot example using existing Medplum task patterns
- [x] Add example resources for minimum-necessary HR/supervisor views
- [x] Add an example for imported outside exam-review-only workflows

### Demo Data and Validation
- [x] Expand the synthetic dataset beyond the initial employee scenario set
- [x] Add example personas for direct-care, review-only, RTW, and injury workflows
- [ ] Run package build validation once a Node toolchain is available in the environment
- [x] Add test coverage or validation examples for the occupational health artifacts

### Next Product Slices
- [x] Add supervisor and HR minimum-necessary occupational health examples
- [x] Add surveillance dashboard or readiness-oriented example queries
- [x] Add injury / exposure / RTW operational examples
- [ ] Add `EpisodeOfCare` access to the provider demo policy
- [ ] Add structured RTW status and restriction resources to the curated RTW patient
- [ ] Assign curated RTW tasks to the provider demo practitioner
- [ ] Add a Provider occupational summary card or tab
- [ ] Add a duty-location exposure tracking dashboard
- [ ] Add a supervisor/HR minimum-necessary demo view
- [ ] Complete a timed Industry Day browser dry run using the step-by-step guide

---

## 15. References

- DHS OHS Statement of Objectives (April 14, 2026)
- FHIR R4 Specification (HL7)
- OSHA 1910.1020 Occupational Record Keeping
- Medplum/Ubix generated FHIR data elements: `../../hiivecare-dev-data-pipeline/docs/medplum-ubix-demo-fhir-data-elements.md`
- Medplum/Ubix UI glossary: `../../hiivecare-dev-data-pipeline/docs/medplum-ubix-demo-ui-glossary.md`
- Medplum/Ubix implementation notes: `../../hiivecare-dev-data-pipeline/docs/medplum-ubix-demo-implementation-notes.md`
- Medplum Documentation: https://www.medplum.com/docs
