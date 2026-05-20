# Occupational Health EHR/MIS Demo - Agent-First Medplum Delivery Plan

**Based on**: DHS Office of Health Security - Statement of Objectives (April 14, 2026)  
**Purpose**: Build a configurable Medplum demo for Occupational Health EHR/MIS using AI agents as the primary execution engine, with humans focused on direction, policy, validation, and acceptance.

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

1. Define the canonical occupational health FHIR profile set and example bundle package
2. Create the agent work queue as small mergeable slices instead of large epics
3. Stand up seed data that supports all primary DHS demo personas
4. Build the first end-to-end vertical slice: pre-placement -> surveillance enrollment -> clearance
5. Add automated validation gates so agent-generated PRs cannot merge without passing checks

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

---

## 15. References

- DHS OHS Statement of Objectives (April 14, 2026)
- FHIR R4 Specification (HL7)
- OSHA 1910.1020 Occupational Record Keeping
- Medplum Documentation: https://www.medplum.com/docs
