# Medplum RBAC Admin UI Design & Documentation

## Overview

This document describes the design and implementation of a no-code admin UI for configurable Role-Based Access Control (RBAC) in Medplum. The UI allows operators to define permissions, roles, access models, and minimum-necessary views without writing code or manually hand-editing AccessPolicy JSON.

Design principle: use Medplum-native FHIR resources and Medplum tooling first; only add custom services when there is a proven gap.

**Target users**: Project admins, security officers, occupational health compliance teams  
**Scope**: Single Medplum project with multiple role personas  
**Goal**: Make RBAC configuration as intuitive as traditional IAM tools (Okta, Auth0, etc.)

---

## Core Concepts

### 1. Role (Medplum-Native Pattern)

A role is a named, reusable collection of permissions represented directly by Medplum `AccessPolicy` resources. Keep one primary `AccessPolicy` per role and use naming/tag conventions for discoverability.

Recommended naming convention:
- `RBAC: Clinical Provider`
- `RBAC: Supervisor/HR Minimum Necessary`
- `RBAC: Patient Self-Service`

Recommended metadata tags in `AccessPolicy.meta.tag`:
- `rbac-role`
- `minimum-necessary`
- `occupational-health`

Example roles for occupational health:
- **Clinical Provider**: Full clinical access + chart documentation + task management
- **Supervisor/HR**: Duty status + restrictions only, no diagnosis/clinical narrative
- **Occupational Safety Coordinator**: Exposure events + affected employee cohorts + notification routing
- **Patient (Employee)**: Self-service patient portal + own tasks/messages
- **Admin**: Full project access (rare, non-demo)

### 2. Permission (Atomic Unit)

A permission is a single allow-rule: `{resource_type, interaction, criteria, hidden_fields}`.

Examples:
- `allow Patient read where criteria="Patient?_id=ALLOWED_IDS" hide=[address, birthDate, gender, telecom]`
- `allow Observation read where criteria="Observation?subject=ALLOWED_PATIENTS"`
- `allow Task read where criteria="Task?owner=CURRENT_USER"`

### 3. Access Model (Composition)

An access model maps a profile type (Practitioner, RelatedPerson, Patient) to one primary role policy (`AccessPolicy`) plus optional overlays (additional policies for constrained scenarios).

Example:
```
Profile: Practitioner (Dr. Alex Demo)
Roles: [Clinical Provider]
Custom criteria override: none
Result: Full clinical permissions
```

Another example:
```
Profile: RelatedPerson (Supervisor/HR)
Roles: [Supervisor/HR]
Custom criteria override: restrict to employees in my organization only
Result: Supervisor view + org-scoped employee list
```

### 4. Minimum-Necessary View

A minimum-necessary view is a UI route + corresponding `AccessPolicy` that shows only allowed fields for a role. Medplum enforces field-level hiding; the UI respects it by rendering only fields present in responses.

Example: `/Occupational/Supervisor` renders duty status, restrictions, readiness, reevaluation date, but skips diagnosis, clinical notes, labs because the RelatedPerson profile's AccessPolicy hides those fields.

---

## Architecture

### High-Level Flow

```
Admin configures AccessPolicy-as-role → role policy defines permissions → 
ProjectMembership links user/profile to policy → login selects membership → 
Medplum enforces permissions/hidden fields → UI renders allowed fields
```

### Storage Model (Native-First)

Store RBAC configuration in standard Medplum/FHIR resources:

1. **AccessPolicy**
- Canonical role artifact (permissions, criteria, hiddenFields)
- One policy per role (or role + policy overlays for edge cases)

2. **ProjectMembership**
- Assignment artifact linking `User` + profile (`Practitioner` / `RelatedPerson` / `Patient`) + `AccessPolicy`

3. **Group** (optional, recommended)
- Use for dynamic or managed cohorts (e.g., supervisor employee panel)
- Reference group-based criteria in role policy where possible

4. **AuditEvent**
- Immutable audit trail for role/policy/membership changes

5. **Bot** (optional automation)
- Use Medplum Bots for generation/validation jobs if logic must run server-side
- Prefer Bot over a standalone custom backend service

This approach keeps RBAC config queryable, versionable, and enforceable directly in Medplum.

### Admin UI Components

#### 1. Role Management Panel

**Create / Edit Role**
- Name, description, parent role (optional, for inheritance)
- Permission matrix: resource type → interactions (read/search/create/update/delete)
- Hidden fields selector per resource type
- Save as draft or publish

**Permission Builder** (visual no-code flow):
- Select resource type from dropdown
- Select interactions via checkboxes
- (Optional) Add criteria filters via query builder
- (Optional) Mark fields as hidden via field selector
- Add/remove permissions to/from role

#### 2. Access Model Configuration

**Assign Roles to Profile Types**
- Select profile type (Practitioner, RelatedPerson, Patient, etc.)
- Select one or more roles
- Define custom criteria overrides (e.g., "only patients in org X")
- Generate or review the resulting AccessPolicy JSON

**Profile Type Role Matrix**
- Rows: profile types
- Columns: available roles
- Cells: checkboxes to enable role per profile

#### 3. AccessPolicy Generator

Auto-generate an AccessPolicy resource from selected roles + overrides:
- Combines all permission rules from attached roles
- Applies criteria overrides
- Outputs valid Medplum AccessPolicy JSON
- Save as new AccessPolicy or update existing

#### 4. Membership / ProjectMembership Manager

**Link User to Role**
- Select or create User
- Select profile (Practitioner, RelatedPerson, Patient, etc.)
- Select access model (which auto-selects the AccessPolicy)
- Create ProjectMembership
- Optionally set admin flag (non-zero-trust scenario only)

**Bulk Role Assignment**
- Upload CSV: email, profile_type, role_name
- Admin UI validates and creates/updates ProjectMemberships in batch

#### 5. Minimum-Necessary View Validator

**Test a role's actual visibility**
- Select a role
- Display a sample patient record with all fields
- Show which fields are hidden per role
- Highlight sensitive fields that ARE or ARE NOT exposed
- Allow preview of what end-user will see

### Medplum Native-First Checklist

Use this checklist before adding any custom service or data model:

1. Can this be represented directly in `AccessPolicy.resource[]`?
2. Can assignment be represented directly in `ProjectMembership`?
3. Can cohort scoping be represented using `Group` references/criteria?
4. Can auditing be captured using `AuditEvent`?
5. Can server-side automation be implemented with a Medplum `Bot`?
6. Can this be built in the admin UI with Medplum client SDK calls only?

Only add a custom backend endpoint after all six checks are exhausted and documented.

---

## UI Workflows

### Workflow 1: Create a New Role (Supervisor/HR Example)

1. Admin clicks **"+ New Role"**
2. Enters name: `Supervisor/HR Minimum Necessary`
3. Adds description: `Occupational readiness and restriction visibility only`
4. **Permission Builder**:
   - Adds Patient: `read, search`
     - Criteria: filter to allowed employee IDs
     - Hidden: address, birthDate, communication, contact, deceased*, gender, generalPractitioner, identifier, maritalStatus, photo, telecom
   - Adds Observation: `read, search`
     - Criteria: only RTW and restriction observations
     - Hidden: referenceRange, interpretation, method, performer, device
   - Adds Task: `read`
     - Criteria: only RTW follow-up tasks
     - No hidden fields (minimal task data needed anyway)
   - Does NOT add: Encounter, Condition, DiagnosticReport, DocumentReference, MedicationRequest
5. Saves role
6. Admin then creates a `RelatedPerson` access model, attaches this role, generates AccessPolicy
7. Creates a ProjectMembership linking supervisor user → RelatedPerson profile → generated AccessPolicy

### Workflow 2: Update a Role Without Code

1. Admin opens existing `Clinical Provider` role
2. Sees current permissions listed
3. Clicks "Edit" on Condition permission
4. Changes interaction from `[create, read, update, delete]` to `[read, search]` (read-only after a certain date)
5. Saves
6. Admin UI automatically re-generates any AccessPolicies that use this role
7. All ProjectMemberships using Clinical Provider role get updated AccessPolicy in real-time or on next login

### Workflow 3: Test Minimum-Necessary View

1. Admin selects `Supervisor/HR Minimum Necessary` role
2. Clicks **"Test Visibility"**
3. UI loads a sample patient (Avery Rivera) with all fields populated
4. Shows table:
   - Field name | Visible? | Role-level reason
   - name → ✓ (allowed)
   - birthDate → ✗ (hidden in role)
   - gender → ✗ (hidden in role)
   - address → ✗ (hidden in role)
5. Admin can then preview `/Occupational/Supervisor` route using a test supervisor account
6. Confirms only relevant readiness/restriction fields are shown

---

## Implementation Work Slices

### Slice 1: AccessPolicy Role Catalog & Seed Data

**Objective**: Define role catalog directly as `AccessPolicy` resources and seed into Ubix Data project.

**Tasks**:
- [ ] Define standard role naming/tagging convention for AccessPolicy resources
- [ ] Create seed script (Node.js or Python) to POST role policies:
  - RBAC: Clinical Provider
  - RBAC: Supervisor/HR Minimum Necessary
  - RBAC: Patient Self-Service
  - RBAC: Occupational Safety Coordinator (optional)
- [ ] Add `meta.tag` markers (e.g., `rbac-role`, `minimum-necessary`)
- [ ] Verify policies are queryable/filterable via Medplum API
- [ ] Document policy IDs for later slices

**Deliverable**: 4 role AccessPolicy resources in project 7e472dfd-3ab9-4b75-adac-38e0c5c5d6c8 + seed script

---

### Slice 2: Role Management UI Panel (AccessPolicy-Backed)

**Objective**: Build the admin UI for listing, creating, editing, and deleting roles.

**Tasks**:
- [ ] Create React component: `RoleListPanel.tsx` (role list with actions)
- [ ] Create React component: `RoleEditorModal.tsx` (create/edit role form)
- [ ] Add to Provider app at route: `/admin/rbac/roles`
- [ ] Integrate CRUD operations with Medplum API (GET, POST, PUT, DELETE AccessPolicy)
- [ ] Add form validation (required fields, unique names)
- [ ] Add confirmation dialogs for delete actions
- [ ] Test role creation and editing workflow

**Deliverable**: Functional role management panel in Provider app

---

### Slice 3: Permission Builder Component

**Objective**: Build no-code UI for adding/editing permissions within a role.

**Tasks**:
- [ ] Create React component: `PermissionBuilder.tsx`
- [ ] Build resource type selector (dropdown or autocomplete from Medplum available resources)
- [ ] Build interaction checklist (read, search, create, update, delete)
- [ ] Build criteria field (text input for FHIR search queries, with validation helper)
- [ ] Build hidden fields selector (multi-select or tag input, with field suggestions per resource type)
- [ ] Add inline preview: "This permission allows [interactions] on [resource] where [criteria], hiding [fields]"
- [ ] Test with Patient, Observation, Task, Encounter resource types

**Deliverable**: Embedded permission builder that edits AccessPolicy `resource[]` entries in RoleEditorModal

---

### Slice 4: AccessPolicy Composer

**Objective**: Compose valid Medplum AccessPolicy JSON from UI selections using Medplum-native validation patterns.

**Tasks**:
- [ ] Create function: `composeAccessPolicy(input: RolePolicyInput, overrides?: AccessPolicyOverride): AccessPolicy`
- [ ] Build/merge AccessPolicy `resource[]` rules from UI selections
- [ ] Apply custom criteria overrides (e.g., org-scoped filters)
- [ ] Validate composed policy shape before save
- [ ] Save directly with Medplum API from the client or via Medplum Bot
- [ ] Test policies against real Medplum API to confirm enforcement

**Deliverable**: Working policy composer that outputs and saves valid AccessPolicy resources

---

### Slice 5: Access Model Configuration UI

**Objective**: Build UI to map profile types (Practitioner, RelatedPerson, Patient) to roles + generate AccessPolicy.

**Tasks**:
- [ ] Create React component: `AccessModelEditor.tsx`
- [ ] Build profile type selector (Practitioner, RelatedPerson, Patient, etc.)
- [ ] Build role policy selector (checkboxes showing AccessPolicy role catalog)
- [ ] Build custom criteria override field (advanced, optional)
- [ ] Add "Generate AccessPolicy" button that calls Slice 4 generator
- [ ] Display generated AccessPolicy JSON (read-only preview)
- [ ] Allow save as new AccessPolicy or update existing
- [ ] Integrate with Medplum API to persist AccessPolicy

**Deliverable**: Access model editor that can generate and save AccessPolicies

---

### Slice 6: ProjectMembership Manager

**Objective**: Build UI to assign users to roles via ProjectMembership + AccessPolicy linkage.

**Tasks**:
- [ ] Create React component: `MembershipManager.tsx`
- [ ] Build user/email selector (search existing Users or create new)
- [ ] Build profile selector (browse Practitioner/RelatedPerson/Patient profiles)
- [ ] Build access model selector (shows roles + generated AccessPolicy)
- [ ] Create ProjectMembership via Medplum API with:
  - User reference
  - Profile reference
  - AccessPolicy reference
- [ ] Optional: Add admin flag (for non-zero-trust scenarios)
- [ ] Display success confirmation with membership ID
- [ ] List existing memberships with edit/delete actions

**Deliverable**: Functional membership creator/manager in Provider app

---

### Slice 7: Minimum-Necessary View Tester

**Objective**: Build UI to preview which fields are visible/hidden for a role on real patient data.

**Tasks**:
- [ ] Create React component: `RoleVisibilityTester.tsx`
- [ ] Role selector (dropdown of available role AccessPolicies)
- [ ] Patient selector (search for test patient, e.g., Avery Rivera)
- [ ] Load sample patient record from Medplum API
- [ ] Display field visibility matrix:
  - Field name | Visible? (✓/✗) | Reason (hidden in role / allowed in role)
- [ ] Highlight sensitive fields (address, birthDate, contact, etc.) in red if visible
- [ ] Optional: Show side-by-side before/after (full record vs. role-filtered record)
- [ ] Add "Test Login" button to launch test session as supervisor role

**Deliverable**: Interactive visibility tester panel

---

### Slice 8: Bulk Role Assignment (CSV Import)

**Objective**: Enable admins to assign roles to multiple users via CSV upload.

**Tasks**:
- [ ] Create React component: `BulkAssignmentUI.tsx`
- [ ] Build file uploader (CSV format: email, profile_type, role_name)
- [ ] Parse CSV and validate rows (required fields, valid profile types, role exists)
- [ ] Batch create/update ProjectMemberships via Medplum API
- [ ] Show progress indicator
- [ ] Display results: [N] created, [M] updated, [X] errors
- [ ] Link errors to specific rows for troubleshooting
- [ ] Optional: Generate downloadable success report

**Deliverable**: CSV importer for bulk membership assignment

---

### Slice 9: Admin UI Routing & Access Control

**Objective**: Wire up `/admin/rbac/*` routes in Provider app and restrict to admins only.

**Tasks**:
- [ ] Create parent route: `/admin/rbac` with navigation menu
- [ ] Sub-routes:
  - `/admin/rbac/roles` → RoleListPanel
  - `/admin/rbac/access-models` → AccessModelEditor
  - `/admin/rbac/members` → MembershipManager
  - `/admin/rbac/test` → RoleVisibilityTester
  - `/admin/rbac/bulk-assign` → BulkAssignmentUI
- [ ] Wrap routes with admin-only guard (check ProjectMembership.admin flag or admin AccessPolicy)
- [ ] Add breadcrumb navigation
- [ ] Add help/info section with links to this design document

**Deliverable**: Functional admin UI nav with all components wired

---

### Slice 10: Audit Logging & Change History

**Objective**: Log all role/permission/membership changes for compliance and debugging.

**Tasks**:
- [ ] Create log schema (user, action, resource type, resource ID, before/after state, timestamp)
- [ ] Add POST hook to log role creates/updates/deletes
- [ ] Add POST hook to log AccessPolicy creates/updates
- [ ] Add POST hook to log ProjectMembership creates/updates/deletes
- [ ] Create React component: `AuditLogViewer.tsx` (searchable log browser)
- [ ] Store logs in Medplum as `AuditEvent` resources (native-first)
- [ ] Display in Admin UI for compliance review

**Deliverable**: Audit log infrastructure + viewer component

---

### Slice 11: Role Templates & Composition

**Objective**: Support role composition and reuse patterns (optional, lower priority).

**Tasks**:
- [ ] Create role template library using baseline AccessPolicy resources
- [ ] Add "Clone from template" option in role editor
- [ ] Add optional composition rules (base policy + overlay policy)
- [ ] Test composition merge behavior and conflict handling

**Deliverable**: Role templates + composable policy overlays (optional feature)

---

### Slice 12: Integration Testing & Validation

**Objective**: End-to-end test that newly created roles actually enforce access correctly.

**Tasks**:
- [ ] Create test suite (Jest/Vitest):
  - Create test role via admin UI
  - Generate AccessPolicy
  - Create ProjectMembership
  - Login as that membership
  - Query a resource (should be allowed or denied per role)
  - Verify hidden fields are stripped from response
- [ ] Test with real Medplum API (against staging project)
- [ ] Test role update scenario (change permissions, verify old sessions still work, new sessions get new permissions)
- [ ] Performance test: create 50+ roles, measure query/generation time
- [ ] Document any Medplum quirks or limitations found

**Deliverable**: Passing integration test suite + documented limitations

---

### Slice 13: Runbook & Best Practices Documentation

**Objective**: Document common role patterns and admin workflows.

**Tasks**:
- [ ] Write runbook: "Create a Read-Only Role"
- [ ] Write runbook: "Create a Minimum-Necessary Role (supervisor pattern)"
- [ ] Write runbook: "Update a Role Without Downtime"
- [ ] Write runbook: "Audit Access Changes for Compliance"
- [ ] Write runbook: "Migrate from Hardcoded AccessPolicy to Role-Based"
- [ ] Add troubleshooting section (common errors + fixes)
- [ ] Add FAQ (role inheritance questions, performance, role limits)

**Deliverable**: Runbook document + inline help in admin UI

---

### Slice 14: Staging Validation Checklist

**Objective**: Prepare for production deployment with validation steps.

**Tasks**:
- [ ] Migrate existing Ubix Data memberships to roles (don't break current access)
- [ ] Test role updates don't interrupt active sessions
- [ ] Verify audit logs capture all role changes
- [ ] Load test: 100+ concurrent users on role visibility tester
- [ ] Security audit: verify role creation restricted to admins
- [ ] Backup AccessPolicy resources before migration
- [ ] Rollback plan documented (revert to hardcoded AccessPolicies if needed)

**Deliverable**: Pre-deploy validation checklist + rollback runbook

---

## Data Model (AccessPolicy-Backed)

```typescript
interface RolePolicy extends AccessPolicy {
  // AccessPolicy used as the canonical role artifact
  resourceType: 'AccessPolicy';
  id: string;
  name: string;
  description?: string;
  resource: PermissionRule[];
  status?: 'active' | 'draft';
  created: string; // ISO date
  updated: string;
  createdBy: Reference<User>;
  updatedBy: Reference<User>;
  meta: {
    project: string;
    tag: [{ code: 'rbac-role' | 'minimum-necessary' | 'occupational-health' | 'clinical' | 'admin', ... }];
  };
}

interface PermissionRule {
  resourceType: string; // 'Patient', 'Observation', 'Task', etc.
  interactions: ('read' | 'search' | 'create' | 'update' | 'delete')[]; // allowed interactions
  criteria?: string; // FHIR search criteria, e.g. "Patient?_id=ALLOWED_IDS"
  hiddenFields?: string[]; // fields to strip from API responses
  description?: string; // why this permission exists
}

interface MembershipBinding {
  resourceType: 'ProjectMembership';
  user: Reference<User>;
  profile: Reference<Practitioner | RelatedPerson | Patient>;
  accessPolicy: Reference<AccessPolicy>;
  admin?: boolean;
}
```

---

## Example: Complete Supervisor/HR Setup Flow

### Step 1: Create Supervisor/HR Role

Admin navigates to **Roles** → **+ New Role**:

```
Name: Supervisor/HR Minimum Necessary
Description: Occupational readiness and restriction visibility only
Active: true

Permissions:
  - Resource: Patient
    Interactions: read, search
    Criteria: Patient?_id=ALLOWED_EMPLOYEE_IDS
    Hidden: address, birthDate, communication, contact, deceasedBoolean, 
            deceasedDateTime, gender, generalPractitioner, identifier, 
            maritalStatus, photo, telecom

  - Resource: Observation
    Interactions: read, search
    Criteria: Observation?code=return-to-work-status OR Observation?code=work-restriction
    Hidden: referenceRange, interpretation, method, performer

  - Resource: Task
    Interactions: read
    Criteria: Task?code=work-readiness OR Task?code=rtw-follow-up
    Hidden: (none)
```

### Step 2: Create Supervisor/HR Access Model

Admin navigates to **Access Models** → **+ New Access Model**:

```
Profile Type: RelatedPerson
Role Policies: [RBAC: Supervisor/HR Minimum Necessary]
Custom Criteria Override: RelatedPerson.patient.where(
  managingOrganization = 'Organization/my-org-id'
)
```

Admin clicks **Generate AccessPolicy**:

```json
{
  "resourceType": "AccessPolicy",
  "name": "Ubix Demo Supervisor/HR Minimum Necessary",
  "resource": [
    {
      "resourceType": "Patient",
      "criteria": "Patient?_id=ALLOWED_EMPLOYEE_IDS",
      "interaction": ["read", "search", "history", "vread"],
      "hiddenFields": ["address", "birthDate", "communication", "contact", ...]
    },
    {
      "resourceType": "Observation",
      "criteria": "Observation?code=return-to-work-status OR Observation?code=work-restriction",
      "interaction": ["read", "search", "history", "vread"],
      "hiddenFields": ["referenceRange", "interpretation", "method", "performer"]
    },
    {
      "resourceType": "Task",
      "criteria": "Task?code=work-readiness OR Task?code=rtw-follow-up",
      "interaction": ["read", "search"],
      "hiddenFields": []
    }
  ]
}
```

Admin saves this as AccessPolicy/abc123.

### Step 3: Create or Identify RelatedPerson Profile

Admin navigates to **Profiles** and either:
- Selects existing RelatedPerson (if supervisor already has a profile)
- Creates new RelatedPerson for `ubix.supervisor.hr@example.com`

### Step 4: Create ProjectMembership

Admin navigates to **Members** → **+ Add Member**:

```
User: ubix.supervisor.hr@example.com (existing or create)
Profile: RelatedPerson/supervisor-hr-id
Access Model: Supervisor/HR Minimum Necessary
Access Policy: AccessPolicy/abc123 (auto-selected)
Admin: false
```

Admin clicks **Create Membership**.

### Step 5: Test Visibility

Admin navigates to **Testing** → **Test Role Visibility**:

```
Select Role: Supervisor/HR Minimum Necessary
Select Test Patient: Avery Rivera (Patient/a3562d64...)

[Load Sample Record]

Field Visibility Table:
├─ name: ✓ Visible
├─ identifier: ✗ Hidden (field in role hiddenFields)
├─ telecom: ✗ Hidden (field in role hiddenFields)
├─ address: ✗ Hidden (field in role hiddenFields)
├─ birthDate: ✗ Hidden (field in role hiddenFields)
├─ gender: ✗ Hidden (field in role hiddenFields)
└─ ...

[Preview Route: /Occupational/Supervisor]
[Test Login as Supervisor]
```

---

## Security Considerations

1. **Guided Policy Editing**: Admin UI should default to form-driven editing for AccessPolicy role rules; raw JSON can be view-only or restricted to break-glass admins.
2. **Audit Logging**: All role/permission changes must be logged with user, timestamp, and before/after state.
3. **Separation of Duties**: Role creation requires one approval, membership assignment requires another (or same person with time delay).
4. **Versioning**: Keep historical versions of roles so rollback is possible.
5. **Testing Before Deployment**: All role changes should be testable in a staging project before production promotion.

---

## UI Mockups & Interaction Patterns

### Role Management Panel Layout

```
┌─────────────────────────────────────────────────────────────┐
│ RBAC Admin › Roles                                           │
├─────────────────────────────────────────────────────────────┤
│ [+ New Role] [Import CSV] [Export]                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ Roles (4):                                                    │
│                                                               │
│ ┌─ Clinical Provider ────────────────────────────────────┐   │
│ │ Description: Full clinical access                      │   │
│ │ Permissions: 12                                        │   │
│ │ Used by: 3 memberships                                │   │
│ │ [Edit] [Clone] [Delete] [Test]                        │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                               │
│ ┌─ Supervisor/HR Minimum Necessary ─────────────────────┐   │
│ │ Description: Occupational readiness only              │   │
│ │ Permissions: 3                                        │   │
│ │ Used by: 1 membership                                 │   │
│ │ [Edit] [Clone] [Delete] [Test]                        │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                               │
│ ┌─ Patient (Employee) ──────────────────────────────────┐   │
│ │ Description: Self-service patient portal              │   │
│ │ Permissions: 5                                        │   │
│ │ Used by: 15 memberships                               │   │
│ │ [Edit] [Clone] [Delete] [Test]                        │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Permission Builder Panel

```
┌──────────────────────────────────────────────────────────────┐
│ RBAC Admin › Edit Role: Supervisor/HR Minimum Necessary      │
├──────────────────────────────────────────────────────────────┤
│ Name: Supervisor/HR Minimum Necessary                        │
│ Description: [text field]                                    │
│ Template: [dropdown: none]                                   │
│                                                               │
│ Permissions (3):                                             │
│                                                               │
│ ┌─ Patient ─────────────────────────────────────────────┐   │
│ │ Interactions: [☑ read] [☑ search] [ ] create ...    │   │
│ │ Criteria: Patient?_id=ALLOWED_EMPLOYEE_IDS           │   │
│ │ Hidden Fields:                                         │   │
│ │   [☑] address [☑] birthDate [☑] gender              │   │
│ │   [☑] telecom [☑] contact [☑] identifier            │   │
│ │   [☑] maritalStatus [☑] photo [☑] deceasedBoolean   │   │
│ │ [Edit] [Delete]                                       │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                               │
│ ┌─ Observation ─────────────────────────────────────────┐   │
│ │ Interactions: [☑ read] [☑ search] [ ] create ...    │   │
│ │ Criteria: [custom query] ...                          │   │
│ │ Hidden Fields: [☑] referenceRange [☑] interpretation│   │
│ │ [Edit] [Delete]                                       │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                               │
│ ┌─ Task ────────────────────────────────────────────────┐   │
│ │ Interactions: [☑ read] [ ] search [ ] create ...     │   │
│ │ Criteria: Task?code=work-readiness OR rtw-follow-up  │   │
│ │ Hidden Fields: (none)                                 │   │
│ │ [Edit] [Delete]                                       │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                               │
│ [+ Add Permission] [Generate AccessPolicy] [Save]           │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## Integration with Existing Demo

Apply to current Ubix Data project (7e472dfd-3ab9-4b75-adac-38e0c5c5d6c8):

1. **Seed Roles**:
   - Clinical Provider (Dr. Alex Demo)
   - Supervisor/HR Minimum Necessary
   - Patient (Riley)
   - Occupational Safety Coordinator (optional, future)

2. **Map Existing Memberships**:
   - Provider membership → Clinical Provider role → existing AccessPolicy/05fa99c3...
   - Supervisor membership → Supervisor/HR Minimum Necessary role → new AccessPolicy/dff2d5eb... (from screenshot)
   - Patient membership → Patient role → existing AccessPolicy/ca3a5687...

3. **Enable Admin UI**:
   - Deploy admin panel as new Provider app route: `/admin/rbac`
   - Restrict access to project admins only
   - Test role editing without affecting live logins

---

## Next Steps

1. **Finalize AccessPolicy role catalog conventions** (naming, tagging, criteria patterns)
2. **Prototype UI components** in React (role list, permission builder, access model editor)
3. **Build AccessPolicy generator** that validates output against Medplum schema
4. **Integration test** with live Ubix Data project: create a test role, assign it, verify policy enforcement
5. **Document runbooks** for common role patterns (clinical, admin, read-only, minimum-necessary, etc.)

---

## References

- Medplum AccessPolicy API: https://www.medplum.com/docs/api/fhir/resources/accesspolicy
- Medplum ProjectMembership: https://www.medplum.com/docs/api/fhir/resources/projectmembership
- Medplum AuditEvent API: https://www.medplum.com/docs/api/fhir/resources/auditevent
- Medplum Bot framework: https://www.medplum.com/docs/bots
- Medplum Group API: https://www.medplum.com/docs/api/fhir/resources/group
- RBAC best practices: https://en.wikipedia.org/wiki/Role-based_access_control
- Occupational health minimum-necessary: DOL FECA privacy guidelines
