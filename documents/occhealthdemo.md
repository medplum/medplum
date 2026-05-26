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

| Item                        | Current value                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| Medplum project             | `Ubix Data` / `Project/7e472dfd-3ab9-4b75-adac-38e0c5c5d6c8`                                 |
| Provider app                | Local: `http://127.0.0.1:5172/`; planned hosted app: `https://provider.ehr.hiivehealth.net/` |
| Patient app                 | Local: `http://127.0.0.1:5173/`; planned hosted app: `https://patient.ehr.hiivehealth.net/`  |
| Provider demo profile       | `Practitioner/59ea2d1d-f436-437c-a785-74850bddbfd3` / Dr Alex Demo                           |
| Provider membership         | `ProjectMembership/4e9c0e27-9cfa-4d6b-ac9a-275ae863b9da`                                     |
| Provider access policy      | `AccessPolicy/05fa99c3-6400-4d8c-af38-8b00b890315d`                                          |
| Import author               | `ClientApplication/69a636e6-b110-4de7-ac73-4c2b642b48a2` / `ubix-data`                       |
| Workflow tasks loaded       | 1,437 `Task` resources authored by `ubix-data`                                               |
| Patients with tasks         | 598 distinct patients                                                                        |
| Demo provider tasks         | 45 open tasks assigned to Dr Alex Demo, including the curated RTW follow-up task             |
| RTW sample patient          | `Patient/a3562d64-680b-4802-bc78-4b1d0d487080` / Avery Rivera                                |
| RTW sample task             | `Task/6b0849f7-bd0e-42f0-a835-b441c2dccade` / RTW case follow-up                             |
| RTW sample case             | `EpisodeOfCare/e2cf8f66-b22b-4577-b858-b0481d24f0b8` / Exposure Incident                     |
| Curated exposure location   | `Location/c8b8e306-1947-4a17-95dd-082cca4fe2ba` / Headquarters / Component A                 |
| Curated exposure cohort     | 7 Headquarters employees with RTW status observations and open follow-up tasks               |
| Provider exposure dashboard | Local: `http://127.0.0.1:5172/Occupational/Exposure`                                         |
| Provider supervisor summary | Local: `http://127.0.0.1:5172/Occupational/Supervisor`                                       |

Current baseline behavior:

- The provider demo user can sign into the `Ubix Data` project and view patient charts.
- The provider navigation shows `Tasks 45` for Dr Alex Demo.
- Patient charts expose generated workflow tasks through the `Tasks` tab and the timeline.
- RTW appears today as `RTW case follow-up` workflow tasks focused on `EpisodeOfCare` resources, plus `Observation.code=return-to-work-status` resources with canonical RTW status values.
- Occupational events such as `Exposure Incident` appear in the patient summary/problem list for generated patients.
- Timeline card authors now resolve to `ubix-data` instead of `[Forbidden]` because the provider policy can read `ClientApplication` author references.
- The provider policy can read/search/history/vread `EpisodeOfCare`, so clinicians can inspect RTW case containers directly.
- The curated Avery Rivera RTW case now has a structured `pending-reevaluation` status observation with restriction type, summary, limit, effective date, expiration date, and reevaluation date components.
- The Provider app now includes a patient-chart `Occupational` tab, an occupational exposure dashboard, and a minimum-necessary supervisor summary view.
- The exposure dashboard derives readable cohorts from exposure `Encounter.location` links because the provider demo role does not currently read `Group` or `List` resources.

Remaining readiness items before Industry Day:

- Run the reset validator with a privileged token before each rehearsal.
- Capture final screenshots or screen recordings for backup.
- The live Industry Day supervisor/HR persona now uses a separate Provider app login with a minimum-necessary Medplum access policy and a supervisor-only navigation shell.

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

| Resource                                    | Interactions                                 | Why it is needed                                                                 |
| ------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------- |
| `EpisodeOfCare`                             | read, search, history, vread                 | RTW and exposure cases are represented as occupational case containers.          |
| `Task`                                      | read, search, create, update, history, vread | Follow-up scheduling, task assignment, and RTW workflow tracking.                |
| `Observation`                               | read, search, create, update, history, vread | Work status, restriction status, vitals, screening, and exposure measurements.   |
| `DetectedIssue`                             | read, search, create, update, history, vread | Exposure incidents, care gaps, and safety signals.                               |
| `ServiceRequest`                            | read, search, create, update, history, vread | Surveillance orders, follow-up requests, and occupational program requirements.  |
| `DocumentReference`                         | read, search, create, update, history, vread | Injury forms, RTW forms, external documents, and privacy-aware attachments.      |
| `Questionnaire` and `QuestionnaireResponse` | read, search, create, update, history, vread | Incident intake, OEM templates, restriction forms, and clearance questionnaires. |
| `Communication`                             | read, search, create, update, history, vread | Privacy-aware stakeholder notifications.                                         |
| `ClientApplication`                         | read, search, history, vread                 | Resolves timeline `meta.author` references such as `ubix-data`.                  |
| `Location` and `Organization`               | read, search, history, vread                 | Duty location, DHS component, clinic, lab, and worksite context.                 |

| `PlanDefinition` and `ActivityDefinition` | read, search, history, vread | Care template lookup and referenced activity resolution for creating visits from the schedule. |
| `Appointment`, `Schedule`, and `Slot` | read, search, create, update, history, vread | Calendar availability, visit booking, and occupied slot tracking. |
| `CarePlan`, `RequestGroup`, `ClinicalImpression`, and `ChargeItem` | read, search, create, update, history, vread | Visit setup artifacts created after applying a care template. |

The curated demo repair script also seeds an active occupational exposure follow-up `PlanDefinition` so **Care template** behaves as a searchable resource picker with a real selectable option.

Supervisor and HR policies are separate and narrower:

- Permit patient identity, duty location, role/component, active restriction summary, clearance status, next reevaluation date, and notification status.
- Deny or omit clinical details such as diagnoses, lab results, behavioral health observations, full notes, and sensitive attachments.
- Demonstrate this with the separate supervisor/HR login, which lands directly on `/Occupational/Supervisor`.

### 3. FHIR Resource Configuration

The generated data should be shaped into a small number of clear Medplum-native resource patterns for the demo.

| Demo concept                 | FHIR/Medplum representation                                                                                                                  | Demo behavior                                                                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Employee                     | `Patient`                                                                                                                                    | The employee chart is the longitudinal occupational health record.                                                                                                                            |
| Work unit / agency component | `Organization`                                                                                                                               | Organizational context for assignment, care delivery, and reporting.                                                                                                                          |
| Duty location                | `Location`                                                                                                                                   | Worksite or operational location used for exposure tracking.                                                                                                                                  |
| Employee duty assignment     | `Observation` or extension-backed occupational assignment record with `effectivePeriod`, `Location`, `Organization`, and job role components | Shows where an employee worked and when.                                                                                                                                                      |
| Incident or exposure event   | `DetectedIssue`, `Condition`, `Encounter`, and `EpisodeOfCare`                                                                               | Captures the event, case container, diagnosis/problem, and care context.                                                                                                                      |
| OEM injury template          | `Questionnaire` plus `QuestionnaireResponse`                                                                                                 | Provides configurable injury/illness documentation forms.                                                                                                                                     |
| RTW case                     | `EpisodeOfCare`                                                                                                                              | Tracks the active case from incident through clearance.                                                                                                                                       |
| RTW status                   | `Observation` with `code=return-to-work-status`                                                                                              | Displays canonical values `full-duty`, `restricted-duty`, `not-fit`, or `pending-reevaluation` with user-facing labels such as Full duty, Restricted duty, Not fit, and Pending reevaluation. |
| Work restrictions            | `Observation` or `QuestionnaireResponse` with structured components                                                                          | Captures restriction type, limit, effective date, expiration, and reevaluation date.                                                                                                          |
| Follow-up schedule           | `Task`, `Appointment`, `Schedule`, and `Slot`                                                                                                | Drives clinician work queue and reevaluation scheduling.                                                                                                                                      |
| Required forms               | `DocumentReference` or `Composition`                                                                                                         | Shows generated or attached injury, clearance, and RTW forms.                                                                                                                                 |
| Notifications                | `Communication` and optionally `Subscription`/Bot-created tasks                                                                              | Shows privacy-aware communication to employee, supervisor, HR, or component safety contact.                                                                                                   |
| Exposure cohort              | `Group` or `List`                                                                                                                            | Shows employees associated with a duty location or exposure event.                                                                                                                            |
| Audit trail                  | `AuditEvent` and resource history                                                                                                            | Shows who viewed or changed sensitive occupational health data.                                                                                                                               |

### 4. Data Configuration Work

Use the generated synthetic data as the base, then curate a small number of high-signal demo employees. The live environment should not rely on random search during the presentation.

Required curated cases:

1. **Avery Rivera - RTW/exposure case**
   - Existing patient: `Patient/a3562d64-680b-4802-bc78-4b1d0d487080`.
   - Existing RTW task: `Task/6b0849f7-bd0e-42f0-a835-b441c2dccade`.
   - Existing case container: `EpisodeOfCare/e2cf8f66-b22b-4577-b858-b0481d24f0b8`.
   - Curated RTW status observation: `Observation/6729703e-7f98-462e-9e08-15ed2465dca1` with `valueString=pending-reevaluation` and structured restriction components.
   - Curated RTW task is assigned to Dr Alex Demo for the provider `My Tasks` workflow.

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
   - Work unit or agency component.
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
- Provider app shows `Tasks 45` or another intentional task count for the demo practitioner.
- At least one `RTW case follow-up` task is visible in `My Tasks`.
- RTW sample patient has an active RTW status and at least one structured restriction.
- Patient timeline shows tasks and author names without `[Forbidden]`.
- Provider can read the RTW `EpisodeOfCare` and linked resources.
- Duty-location dashboard has a named location, exposed employee cohort, and follow-up tasks.
- Supervisor/HR view hides clinical details while showing restrictions and duty-status impact.
- All direct demo URLs are tested in the browser before the presentation.

## Step-by-Step Industry Day Demo Guide

This runbook assumes the provider app is available locally at `http://127.0.0.1:5172/` or deployed at `https://provider.ehr.hiivehealth.net/`. Use the non-admin provider demo login documented in the deployment guide.

### Demo Login Credentials

Use only non-admin demo users during the live walkthrough. Do not put passwords in this tracked runbook; the current passwords are stored in the gitignored local file `hiive-build-demo-logins.local.md`.

| Persona                      | App                           | Login email                      | Password source                                            | FHIR profile                                        | Notes                                                                                                                              |
| ---------------------------- | ----------------------------- | -------------------------------- | ---------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Occupational health provider | Provider app                  | `ubix.provider.alex@example.com` | `hiive-build-demo-logins.local.md` / Provider demo login   | `Practitioner/59ea2d1d-f436-437c-a785-74850bddbfd3` | Primary live demo user. Shows `Tasks 45`, Avery Rivera's RTW case, exposure dashboard, and supervisor summary route.               |
| Employee / patient           | Patient app                   | `ubix.patient.riley@example.com` | `hiive-build-demo-logins.local.md` / Patient demo login    | `Patient/5506b4b2-6557-4876-8367-7e398914bce4`      | Use only if the patient-facing portion is part of the live script.                                                                 |
| Supervisor / HR reviewer     | Provider app restricted route | `ubix.supervisor.hr@example.com` | `hiive-build-demo-logins.local.md` / Supervisor HR login   | `RelatedPerson` profile created by curation         | Separate minimum-necessary login. Lands on `/Occupational/Supervisor` with supervisor-only navigation.                             |
| Privileged reset operator    | Medplum API / script only     | N/A                              | Secure token or machine-client secret, not a browser login | N/A                                                 | Only for pre-demo validation with `node scripts/curate-occhealth-demo.mjs --validate-only`; never use during the live walkthrough. |

### Pre-Demo Setup

1. Confirm the Medplum API is reachable at `https://api.ehr.hiivehealth.net/`.
2. Start or open the Provider app.
3. First-time supervisor/HR login setup: run `MEDPLUM_SUPERVISOR_PASSWORD=<local-password> node scripts/curate-occhealth-demo.mjs` from `medplum-ubix` using a privileged token or machine client. Store the password only in `hiive-build-demo-logins.local.md`.
4. Run `node scripts/curate-occhealth-demo.mjs --validate-only` and confirm the summary includes the supervisor/HR login and policy.
5. Sign in as `ubix.provider.alex@example.com` using the Provider demo password from `hiive-build-demo-logins.local.md`.
6. Confirm the left navigation shows `Tasks 45` or the expected curated task count.
7. Open the direct RTW patient URL in a separate tab for quick recovery: `http://127.0.0.1:5172/Patient/a3562d64-680b-4802-bc78-4b1d0d487080/Task`.
8. Open the surveillance/timeline example in another tab: `http://127.0.0.1:5172/Patient/af7f6287-2dc4-4b2a-89f9-d4437ea17607/timeline`.
9. Have the Patient demo login ready only if the patient-facing app is part of the live script.
10. Have the supervisor or HR demo login ready for the minimum-necessary role switch.

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
8. Schedule the follow-up visit from the Provider calendar:
   - Create a new visit for `Avery Rivera 1971` or `EMP-12345-000028`.
   - Select **Occupational exposure follow-up visit** as the care template.
   - Open the created encounter from the patient chart or schedule flow.
9. Complete the follow-up visit documentation:
   - On **Note & Tasks**, use **Return-to-Work Documentation** as the clinical decision point.
   - Update **Return-to-work status** to the demo outcome, such as `full-duty` for clearance or `restricted-duty` for continued restrictions.
   - Confirm the restriction summary, reevaluation date, and follow-up plan.
   - Select **Save and complete follow-up** to update `Observation.code=return-to-work-status` and complete the related RTW/current-visit tasks.
10. Show the occupational summary card, including RTW status, active restrictions, effective dates and expiration, and reevaluation date.
11. Demonstrate restriction management from Avery Rivera's **Occupational** tab or `http://127.0.0.1:5172/Patient/a3562d64-680b-4802-bc78-4b1d0d487080/occupational`. In **Work Restrictions**, point out the structured restriction summary and limit: no field deployment, administrative duty only, and avoiding exposure response or prolonged standing. In **Source Resources**, click **RTW observation** to open the underlying `Observation/6729703e-7f98-462e-9e08-15ed2465dca1`. To document a new incident after rehearsal, select **Report Incident** from the Occupational tab and submit the Medplum `QuestionnaireForm` that creates the `QuestionnaireResponse`, `EpisodeOfCare`, `Encounter`, RTW `Observation`, and RTW follow-up `Task` consumed by the occupational summary and exposure dashboard. For the live talk track, keep Avery's preloaded structured restriction as the primary evidence path unless the presenter has rehearsed creating a new incident record end to end.

12. Demonstrate privacy-aware notification:
    - Show the clinician can see the clinical details.
    - Show the supervisor or HR view only displays duty status and restrictions.
    - Emphasize that clinical diagnosis and sensitive results are not disclosed in the minimum-necessary view.
13. Close the scenario by showing RTW status moving toward clearance or follow-up.

### Focus Area 2 Demo: Duty Locations and Exposure Tracking

1. Open the exposure tracking dashboard.
2. Select a duty location with an active or historical exposure event.
3. Show the location profile:
   - Work unit / agency component.
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

| Role                | Primary Responsibility                               | Outputs                                       |
| ------------------- | ---------------------------------------------------- | --------------------------------------------- |
| Orchestrator Agent  | Break work into slices, assign agents, enforce gates | Work queue, acceptance criteria, merge order  |
| FHIR Modeling Agent | Profiles, extensions, value sets, example resources  | FHIR artifacts, example bundles               |
| UI Agent            | React screens, forms, dashboards, workflow pages     | UI components, routes, interaction flows      |
| Workflow Agent      | Business rules, enrollment logic, recalls, RTW flows | Services, rules, task orchestration           |
| Integration Agent   | HR, lab, analytics, import/export adapters           | Connectors, transforms, API contracts         |
| Test Agent          | Unit, integration, E2E, regression checks            | Tests, fixtures, failure analysis             |
| Security Agent      | RBAC, audit events, segmentation, risk review        | Access rules, audit coverage, security checks |
| Documentation Agent | Demo scripts, runbooks, technical docs               | Docs, walkthroughs, setup guidance            |

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

## 8. Industry Day Delivery Workstreams

The workstreams below convert the demo plan into executable delivery lanes. They should run in parallel where possible, but each stream must produce a browser-verifiable demo outcome, not only a design artifact.

### Workstream Summary

| ID    | Workstream                                  | Primary outcome                                                           | Depends on          |
| ----- | ------------------------------------------- | ------------------------------------------------------------------------- | ------------------- |
| WS-01 | Demo Narrative and Persona Lock             | Final Industry Day storyline, personas, and success criteria              | None                |
| WS-02 | Medplum Environment and App Baseline        | Stable provider/patient apps connected to the `Ubix Data` project         | WS-01               |
| WS-03 | Access Policies and Minimum-Necessary Roles | Provider, supervisor, and HR access policies that prove segmentation      | WS-02               |
| WS-04 | RTW Data Model and Curated Case             | First-class RTW status and restriction data for the curated case          | WS-01               |
| WS-05 | Injury and Illness Intake Templates         | OEM-style injury/illness templates that create case artifacts             | WS-04               |
| WS-06 | Provider Occupational Summary UI            | Patient chart card/tab for duty location, exposure, RTW, and restrictions | WS-03, WS-04        |
| WS-07 | RTW Workflow Automation and Task Queue      | RTW tasks, reevaluation scheduling, and notifications visible in Provider | WS-04, WS-05        |
| WS-08 | Duty Location and Exposure Data Model       | Employee-location associations and exposure cohorts                       | WS-01               |
| WS-09 | Exposure Tracking Dashboard                 | Duty-location exposure view with affected employees and follow-up status  | WS-03, WS-08        |
| WS-10 | Supervisor and HR Demo Views                | Minimum-necessary restriction/readiness view without clinical detail      | WS-03, WS-04, WS-08 |
| WS-11 | Demo Data Curation and Reset                | Repeatable curated data set and known direct URLs                         | WS-04, WS-08        |
| WS-12 | Validation, Dry Run, and Release Readiness  | Tested runbook, fallback path, and go/no-go checklist                     | All workstreams     |

Current kickoff status:

- WS-02 is complete for the current demo environment: provider login, project linkage, imported practitioner profile, and assigned task count are verified.
- WS-03 is complete for the provider demo role: provider policy now includes `ClientApplication` for timeline authors and `EpisodeOfCare` for RTW/exposure case containers. Separate supervisor and HR memberships remain an optional hardening task if the restricted route is not sufficient for the live demo.
- WS-04 is complete for the curated RTW case: the curated Avery Rivera case has `Observation/6729703e-7f98-462e-9e08-15ed2465dca1` with `valueString=pending-reevaluation` and structured restriction components.
- WS-06 is complete for the current curated case: the Provider patient chart `Occupational` tab surfaces RTW status, restrictions, case context, component, duty location, source-resource links, and the open RTW task. Browser verification passed against Avery Rivera on the configured local provider origin.
- WS-07 is complete for the current demo slice: `Task/6b0849f7-bd0e-42f0-a835-b441c2dccade` is assigned to Dr Alex Demo and appears in the provider task count. Reevaluation appointment and notification flow can remain verbal unless the agenda requires a live scheduling handoff.
- WS-08 is complete for the current demo slice: the Headquarters / Component A exposure location and seven-person affected cohort are frozen in the curated manifest.
- WS-09 is complete for the current demo slice: the Provider app includes `/Occupational/Exposure`, browser-verified against live generated exposure data.
- WS-10 is complete for the current demo slice: the Provider app includes `/Occupational/Supervisor`, browser-verified as a minimum-necessary restriction/readiness view with no diagnosis, note, lab, or document detail.
- WS-11 is complete for the current demo slice: the curated RTW patient, task, episode, status observation, exposure location, cohort, dashboard URLs, manifest, and reset script are documented.
- WS-12 is complete for technical readiness: focused tests, production build, manifest validation, reset-script syntax validation, and browser smoke tests have passed. A final narrated rehearsal should still be run as the event-readiness gate.

### WS-01: Demo Narrative and Persona Lock

**Goal**: Freeze the Industry Day story so engineering work supports the two proposed focus areas without wandering into generic EHR functionality.

**Scope**:

- Confirm the two primary demo focus areas and the talk track.
- Select final demo personas: occ health clinician, employee/patient, supervisor, HR reviewer, and optional safety/exposure coordinator.
- Select final named employees for the RTW case and exposure-tracking case.
- Define what will be shown live, what will be described verbally, and what will be held as backup.

**Deliverables**:

- Final demo script with timing targets.
- Direct URLs for each live screen.
- Persona-to-login matrix.
- Executive success criteria and likely DHS evaluation points.

**Definition of done**:

- A presenter can explain the demo in under two minutes before touching the keyboard.
- Every demo step maps to either RTW workflow or duty-location exposure tracking.
- No live step depends on random search or ad hoc data discovery.

### WS-02: Medplum Environment and App Baseline

**Goal**: Ensure the Medplum environment is stable, repeatable, and demo-ready.

**Scope**:

- Verify `Ubix Data` is the project of record.
- Verify provider and patient `ClientApplication` resources and OAuth settings.
- Verify local and hosted app origins are allowed by Medplum CORS configuration.
- Keep the provider demo membership linked to the imported Dr Alex Demo practitioner.
- Verify browser login, token `fhirUser`, and app navigation.

**Deliverables**:

- Environment checklist covering API, provider app, patient app, storage, and login.
- Confirmed provider demo login with visible assigned tasks.
- Updated deployment documentation for app URLs, project IDs, client IDs, memberships, and policies.

**Definition of done**:

- Provider login succeeds without admin credentials.
- Provider nav shows the expected assigned task count.
- Timeline authors render as `ubix-data`, not `[Forbidden]`.
- All direct demo URLs load in a fresh browser session.

### WS-03: Access Policies and Minimum-Necessary Roles

**Goal**: Prove Medplum can enforce clinical access for clinicians and restricted views for supervisor/HR stakeholders.

**Scope**:

- Add `EpisodeOfCare` read/search/history/vread to the provider policy.
- Confirm provider access for `Patient`, `Task`, `Observation`, `DetectedIssue`, `ServiceRequest`, `DocumentReference`, `Questionnaire`, `QuestionnaireResponse`, `Communication`, `Location`, `Organization`, and `ClientApplication`.
- Create or verify supervisor and HR demo policies.
- Limit supervisor/HR access to employee identity, component, duty location, RTW status, active restrictions, reevaluation date, and notification status.
- Exclude clinical diagnoses, sensitive notes, lab values, behavioral health details, and full chart timeline from minimum-necessary roles.

**Deliverables**:

- Provider policy update.
- Supervisor and HR access policies.
- Demo users and memberships for role switching.
- Access-policy test checklist with allowed and denied examples.

**Definition of done**:

- Clinician can inspect RTW case resources and linked workflow data.
- Supervisor/HR can see restrictions and readiness impact only.
- A browser demonstration can show the same employee under clinician and restricted roles.

### WS-04: RTW Data Model and Curated Case

**Goal**: Make RTW status and restriction management visible as structured FHIR data rather than only task text.

**Scope**:

- Use `Observation.code=return-to-work-status` as the canonical RTW status location.
- Use canonical RTW values: `full-duty`, `restricted-duty`, `not-fit`, and `pending-reevaluation`.
- Display user-facing labels as Full duty, Restricted duty, Not fit, and Pending reevaluation.
- Add structured restriction components such as restriction type, limit, effective date, expiration date, reevaluation date, and supervisor-visible summary.
- Link RTW status and restrictions to the selected `EpisodeOfCare` and patient.
- Curate Avery Rivera or another named employee as the primary RTW case.

**Deliverables**:

- RTW status observation for the curated patient.
- Work restriction observation or questionnaire response for the curated patient.
- Clear links among `Patient`, `EpisodeOfCare`, `Task`, `Observation`, `Appointment`, and `Communication`.
- Known before/after state for the live demo.

**Definition of done**:

- Provider can see current RTW status and restrictions from the patient chart.
- A FHIR search for the patient and `return-to-work-status` returns the expected observation.
- Supervisor/HR can see only the minimum-necessary restriction summary.

### WS-05: Injury and Illness Intake Templates

**Goal**: Demonstrate configurable OEM-style templates for common occupational injuries and illnesses.

**Scope**:

- Configure `Questionnaire` resources for common injury/illness templates.
- Include structured fields for incident type, body part, mechanism, severity, duty location, job role, initial treatment, RTW status, restrictions, and follow-up need.
- Ensure completed `QuestionnaireResponse` resources generate or link to downstream case artifacts.
- Support at least one template suitable for a live walk-through.

**Deliverables**:

- At least one production-quality injury/illness intake questionnaire.
- Completed questionnaire response for the curated case.
- Generated or linked `Encounter`, `Condition`, `EpisodeOfCare`, `Observation`, `Task`, and `DocumentReference` resources.

**Definition of done**:

- Presenter can show a clinician documenting a work-related injury or illness.
- The resulting chart state updates the RTW case, restrictions, and follow-up queue.
- The flow reads as configurable template behavior, not hard-coded demo magic.

### WS-06: Provider Occupational Summary UI

**Goal**: Give the clinician a high-signal occupational health view inside the patient chart.

**Scope**:

- Add a patient chart occupational summary card or dedicated occupational tab.
- Show current duty location, component, job role, exposure program, RTW status, active restrictions, reevaluation date, and open occupational tasks.
- Link from summary rows to source FHIR resources.
- Keep the UI dense and operational, not marketing-oriented.

**Deliverables**:

- Provider patient chart UI for occupational summary.
- Empty/loading/error states.
- Data formatting helpers for RTW values and restriction labels.
- Browser test or manual verification script for the curated patient.

**Definition of done**:

- Presenter can explain the employee's occupational state from one screen.
- RTW and exposure status are visible without opening raw FHIR resource tables.
- The UI still supports drill-down to timeline, tasks, documents, and forms.

### WS-07: RTW Workflow Automation and Task Queue

**Goal**: Show Medplum workflow orchestration for RTW follow-up, reevaluation, and notifications.

**Scope**:

- Assign a representative RTW task to the provider demo practitioner.
- Create or verify reevaluation `Task` and `Appointment` resources.
- Create privacy-aware `Communication` or `CommunicationRequest` resources for employee, supervisor, HR, and safety contact as needed.
- Optionally add Bot logic that reacts to incident intake or restriction changes.
- Keep generated tasks idempotent and resettable.

**Deliverables**:

- Provider `My Tasks` starts with a clear RTW task.
- RTW reevaluation appointment or scheduling artifact.
- Supervisor/HR notification artifact with minimum-necessary payload.
- Workflow automation notes and fallback manual steps.

**Definition of done**:

- Provider can start in `My Tasks`, open an RTW task, and navigate to the patient case.
- Updating RTW status or restrictions creates the expected follow-up artifacts.
- Demo can proceed even if automation is disabled, using pre-seeded resources.

### WS-08: Duty Location and Exposure Data Model

**Goal**: Model longitudinal association of employees with duty locations and exposure events.

**Scope**:

- Confirm or create `Location` resources for duty locations.
- Confirm or create `Organization` resources for DHS components and clinics.
- Represent employee-location assignment history with effective dates.
- Link exposure events to locations, components, and affected employee cohorts.
- Use readable exposure `Encounter.location` links for the provider demo route. `Group` or `List` resources can be added later for a stricter cohort container once the provider/supervisor policies include those resource types.

**Deliverables**:

- Curated duty location with enough employees for an exposure story.
- Employee assignment records with current and historical duty locations.
- Exposure event linked to location and cohort.
- Follow-up tasks or service requests for affected employees.
- Frozen demo cohort: Headquarters / Component A with seven affected employees, seven RTW status observations, and seven open follow-up tasks.

**Definition of done**:

- Presenter can answer who was assigned to a location during an exposure window.
- Employee chart shows duty location context.
- Exposure event links to affected employees and follow-up status.

**Implementation status**: Complete for the current demo slice. The frozen resources are listed in `documents/occhealthdemo-curated-manifest.json`, and `scripts/curate-occhealth-demo.mjs` validates that the Headquarters exposure location, encounters, episodes, RTW observations, and open follow-up tasks still resolve.

### WS-09: Exposure Tracking Dashboard

**Goal**: Provide an operational dashboard for duty-location exposure investigation and follow-up.

**Scope**:

- Build a dashboard showing duty locations, exposure events, affected employee counts, follow-up completion, overdue tasks, and open surveillance requests.
- Allow drill-down from location to employee cohort to patient chart.
- Show targeted notification and follow-up status.
- Support the Industry Day exposure tracking script without relying on raw FHIR search screens.

**Deliverables**:

- Exposure tracking dashboard route.
- Location/cohort detail view.
- Links to patient chart and task follow-up.
- Browser verification for the curated exposure scenario.
- Local dashboard route: `http://127.0.0.1:5172/Occupational/Exposure`.

**Definition of done**:

- Presenter can demonstrate exposure investigation from location to employee follow-up in under five minutes.
- Dashboard counts match the curated data.
- No protected clinical detail leaks into location-level operational views.

**Implementation status**: Complete for the current demo slice. Browser smoke verification passed on `http://127.0.0.1:5172/Occupational/Exposure`; the page showed two duty locations, 16 affected employees, 16 open follow-ups, and the Headquarters / Component A cohort with RTW status and chart drill-down links.

### WS-10: Supervisor and HR Demo Views

**Goal**: Demonstrate minimum-necessary operational visibility for non-clinical stakeholders.

**Scope**:

- Create supervisor and HR demo accounts or a scripted access-policy comparison.
- Build or configure a restricted view showing employee, component, duty location, RTW status, restrictions, clearance impact, and reevaluation date.
- Hide diagnoses, clinical notes, lab values, behavioral health results, and sensitive documents.
- Include an explanation of how Medplum access policies enforce this separation.

**Deliverables**:

- Supervisor/HR restricted route.
- Minimum-necessary summary screen.
- Positive and negative access examples.
- Presenter talking points for privacy-aware workflows.

**Definition of done**:

- Same employee can be shown in clinician and restricted views.
- Restricted view is useful for operations but does not expose clinical detail.
- Access-policy behavior is demonstrable without showing admin screens.

**Implementation status**: Complete for the current demo slice via the restricted route `http://127.0.0.1:5172/Occupational/Supervisor`. Browser smoke verification passed; the page showed employee, component, duty location, RTW, restriction, reevaluation, notification, and action fields without diagnosis, clinical note, lab, or document detail.

### WS-11: Demo Data Curation and Reset

**Goal**: Make the demo repeatable, resilient, and independent of random generated-data discovery.

**Scope**:

- Freeze curated patient, task, episode, location, cohort, and dashboard IDs.
- Write a seed or patch script for the curated resources.
- Support idempotent re-run before the demo.
- Document fallback direct URLs and expected resource counts.

**Deliverables**:

- Curated demo manifest: `documents/occhealthdemo-curated-manifest.json`.
- Idempotent seed/patch script: `scripts/curate-occhealth-demo.mjs`.
- Direct URL list in the manifest.
- Reset checklist:
  - Set `MEDPLUM_ACCESS_TOKEN` for a privileged admin/project token, or set `MEDPLUM_CLIENT_ID` and `MEDPLUM_CLIENT_SECRET` for a privileged client.
   - Do not use the Provider or Patient frontend client IDs for curation. Those app clients are for local app login only and cannot create project memberships.
   - The `ubix-data` client (`69a636e6-b110-4de7-ac73-4c2b642b48a2`) can authenticate curation, but supervisor/HR login creation calls Medplum's admin invite endpoint. If Medplum returns `Forbidden` at `upsert supervisor/HR login`, use a project-admin access token/client or create `ubix.supervisor.hr@example.com` manually in Medplum admin, then rerun curation to attach and validate the policy.
  - Run `node scripts/curate-occhealth-demo.mjs --validate-only` before rehearsal to check current state.
  - Run `node scripts/curate-occhealth-demo.mjs` to repair provider policy, the occupational incident questionnaire, curated RTW task assignment, and curated RTW observation components.
  - Optionally set `MEDPLUM_PROVIDER_ACCESS_TOKEN` to prove the provider role can read the curated task, RTW observation, case container, and exposure location.

**Definition of done**:

- Demo state can be recreated from scratch or repaired after a rehearsal.
- Presenter does not need to search for a suitable patient during the live demo.
- Validation confirms all curated references resolve.

**Implementation status**: Complete for the current demo slice. The manifest includes direct patient, task, case, RTW observation, exposure location, occupational summary, exposure dashboard, and supervisor summary URLs. The reset script validates the curated RTW case and Headquarters exposure cohort, repairs the provider access policy, and upgrades `OccupationalIncidentIntakeQuestionnaire` with the RTW and restriction fields needed by the Provider intake flow.

### WS-12: Validation, Dry Run, and Release Readiness

**Goal**: Prove the demo works end to end before Industry Day.

**Scope**:

- Validate Medplum access policies and FHIR search behavior.
- Run provider and patient app builds/tests where applicable.
- Execute the browser runbook against the final environment.
- Capture screenshots or screen recordings for backup.
- Define go/no-go criteria and fallback paths.

**Deliverables**:

- Completed dry-run checklist.
- Browser verification notes.
- Known issues and workarounds.
- Final go/no-go recommendation.

**Definition of done**:

- Full demo can be completed twice without data repair.
- Fallback path is tested for each high-risk screen.
- Final runbook matches the live app and current resource IDs.

**Implementation status**: Complete for technical readiness. Focused Provider tests passed, the Provider production build passed, manifest JSON parsing passed, reset script syntax validation passed, and browser smoke verification passed for the patient occupational tab, exposure dashboard, and supervisor summary.

**Event prep evidence captured on 2026-05-22**:

- Reset validation and repair: `node scripts/curate-occhealth-demo.mjs --validate-only` ran with the `ubix-data` client credentials. The repair run updated the provider policy and occupational incident questionnaire, while the curated RTW task and RTW observation were already current. A second validate-only run returned `validation: ok` with provider policy, occupational incident questionnaire, curated RTW task, and curated RTW observation unchanged. Provider-token read validation also passed after acquiring a provider user access token through the local Provider demo login.
- Static validation: `node --check scripts/curate-occhealth-demo.mjs` passed, and `documents/occhealthdemo-curated-manifest.json` parsed as valid JSON.
- Provider validation: focused occupational tests passed, 5 test files / 35 tests; Provider production build passed.
- Browser rehearsal: `http://127.0.0.1:5172/Patient/a3562d64-680b-4802-bc78-4b1d0d487080/occupational` loaded Avery Rivera with `pending-reevaluation`, Headquarters, Component A, structured restrictions, reevaluation date `2026-05-26`, and 1 open RTW task.
- Browser rehearsal: `http://127.0.0.1:5172/Occupational/Exposure` loaded the exposure dashboard with 2 duty locations, 16 affected employees, 5 active cases, 16 open follow-ups, and the Headquarters / Component A cohort.
- Browser rehearsal: `http://127.0.0.1:5172/Occupational/Supervisor` loaded the minimum-necessary summary with 16 employees, 12 restricted-or-pending employees, and 16 open follow-ups without diagnosis, note, lab, or document detail.
- Backup screenshots are saved in `documents/event-prep-screenshots/`:
  - `01-provider-occupational-summary.png`
  - `02-exposure-dashboard.png`
  - `03-supervisor-summary.png`

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

## 13. Remaining Event Actions

1. Run `node scripts/curate-occhealth-demo.mjs --validate-only` with a privileged token before each rehearsal, then run without `--validate-only` if the curated case needs repair.
2. Do one presenter-paced rehearsal from the top of the Industry Day talk track using the three verified Provider URLs.
3. Confirm `hiive-build-demo-logins.local.md` is available to the presenter on the demo machine.
4. Sign in once with `ubix.supervisor.hr@example.com` and confirm it lands on `/Occupational/Supervisor` with only the supervisor summary navigation visible.

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
- [x] Add curated demo manifest and idempotent reset/patch script
- [x] Run package build validation once a Node toolchain is available in the environment
- [x] Add test coverage or validation examples for the occupational health artifacts

### Next Product Slices

- [x] Add supervisor and HR minimum-necessary occupational health examples
- [x] Add surveillance dashboard or readiness-oriented example queries
- [x] Add injury / exposure / RTW operational examples
- [x] Add `EpisodeOfCare` access to the provider demo policy
- [x] Add structured RTW status and restriction resources to the curated RTW patient
- [x] Assign curated RTW tasks to the provider demo practitioner
- [x] Add a Provider occupational summary card or tab
- [x] Browser-verify the Provider occupational summary tab with the curated live patient
- [x] Add a duty-location exposure tracking dashboard
- [x] Add a supervisor/HR minimum-necessary demo view
- [x] Complete a technical browser smoke dry run using the step-by-step guide screens

---

## 15. References

- DHS OHS Statement of Objectives (April 14, 2026)
- FHIR R4 Specification (HL7)
- OSHA 1910.1020 Occupational Record Keeping
- Medplum/Ubix generated FHIR data elements: `../../hiivecare-dev-data-pipeline/docs/medplum-ubix-demo-fhir-data-elements.md`
- Medplum/Ubix UI glossary: `../../hiivecare-dev-data-pipeline/docs/medplum-ubix-demo-ui-glossary.md`
- Medplum/Ubix implementation notes: `../../hiivecare-dev-data-pipeline/docs/medplum-ubix-demo-implementation-notes.md`
- Medplum Documentation: https://www.medplum.com/docs
