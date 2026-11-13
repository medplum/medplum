---
id: access-control
title: Access Control Decision Guide
sidebar_label: Access Control
weight: 100
download_slug: access-control
toc_max_heading_level: 2
---

Use this guide to define who can access which resources and what actions they can perform in your application. It applies whether you serve one care operation or multiple tenants. If you need separate tenant boundaries, choose them in the [Tenancy Design Decision Guide](/docs/decision-guides/tenancy-design#do-you-need-tenant-boundaries), then carry those choices into the permissions below.

_Companion to the [Authorization and Access Control](/docs/access) docs._

Plan access control around three choices:

1. **[Choose each role's data scope](#role-data-scope).** Decide whether each role can access all permitted patients or only assigned patients or care teams. Add tenant scope when your application has tenant boundaries.
2. **[Define role permissions](#role-permissions).** Choose resource types and interactions, then add field restrictions, write constraints, or attribute filters where needed.
3. **[Assign administration](#administration).** Decide who manages users, memberships, and configuration, including the clinical access those administrators need.

Also plan [patient and caregiver access](#patient-and-caregiver-access), [third-party app access](#third-party-app-access), and [network restrictions](#network-restrictions) where applicable. Use the [Authentication Decision Guide](/docs/decision-guides/authentication) for login and identity-provider choices.

## Before you start

### Who needs access?

- Patients / caregivers only
- Providers / staff / partners (clients or outside vendors) only
- Both

### Does this restriction need to prevent API access, or only change what the UI displays?

#### Option A: Prevent access to the data

The user must not retrieve or modify the data, including through direct API requests. Enforce the restriction through `AccessPolicy` and `ProjectMembership` configuration.

#### Option B: Change the displayed view

The user is authorized to access the data, but the application should show a narrower view. **UI filtering does not require compartments.** Use [search parameters](/docs/search/basic-search) based on existing fields and relationships, such as a Task's owner and status, or filter already-loaded authorized data. Compartment filters are an option when you use those assignments.

For example, a clinician authorized for three clinics can view one clinic at a time using a UI selector. If each session must only access one clinic's data, its authenticated permissions must also be limited to that clinic.

**Both can apply:** the API defines the permitted access; the UI selects what to display within it. Apply this distinction to tenant boundaries, resource permissions, and individual fields throughout the guide.

<div id="decision-1-how-will-you-separate-and-share-data"></div>

## Data separation and sharing

If you have tenant boundaries, use the decisions from [Tenancy Design](/docs/decision-guides/tenancy-design) as inputs to authorization. Otherwise, continue to [Role data scope](#role-data-scope).

| Design decision | Permission design it informs |
| :--- | :--- |
| Project boundary and trusted administrators | Where memberships live and who can administer their grants. |
| One shared Patient per person or a separate Patient per tenant | Which Patient records a role can access and whose updates affect their fields. |
| Clinical sharing and transfer behavior | Which clinical resources are accessible to each tenant before and after enrollment changes. |
| Provider, staff, and patient account experience | Whether people use separate accounts, switch practice sessions, or work across practices in one session. |

Implementation details live in [Patient Records and Clinical Sharing](/docs/tenancy-design/patient-records) and [Tenant Assignment and Access](/docs/access/multi-tenant-access-policy).

**Next:** Define each role's data scope below.

<div id="decision-2-which-data-should-each-role-be-able-to-access"></div>

## Role data scope

List your roles, such as physician, RN, MA, front desk, billing, care coordinator, and medical director. Choose each role's patient scope, then its tenant scope if applicable.

### Patient and care-team scope

| Your requirement | Permission design |
| :--- | :--- |
| A role may access all patients in its authorized organization | Grant the required resource types across that scope; use UI filters for focused worklists. |
| A role must only access specific patients | Grant only the verified Patient references and their permitted records. |
| A role must only access patients assigned to its care teams | Maintain care-team assignments and matching policy grants. Team participation alone does not grant access. |

These choices apply with or without multi-tenancy. A "My team's patients" view can use UI filters while the clinician retains practice-wide access. If the API must restrict the clinician to Team 1 within Practice A, apply both restrictions together; granting all of Practice A would also expose patients outside that team. See [Layering tenant and care-team access](/docs/access/multi-tenant-access-policy#layering-tenant-and-care-team-access).

### Tenant scope, if applicable

#### Option A: Access to one tenant

Parameterize each grant with the intended tenant. Use a tenant-wide grant only when the role may access all relevant records within it.

#### Option B: Combined access to several tenants

Repeat the policy with the approved tenant parameters, preserving any patient or care-team restrictions within each tenant.

#### Option C: Organization-wide or cross-tenant oversight

Grant the approved resource types across the project only when that role is authorized for every tenant. Otherwise enumerate the permitted tenants, so later tenant additions do not silently expand access.

<div id="if-tenants-form-a-hierarchy-how-will-access-extend-to-child-tenants"></div>

For regional or hierarchical access, expand grants to the approved lowest-level tenants and maintain them as the hierarchy changes. See [Tenant hierarchies](/docs/access/multi-tenant-access-policy#tenant-hierarchies-and-shared-directories).

#### Option D: Separate authenticated sessions for each tenant

Give each session a membership limited to one tenant. Switching practices then changes the session’s permissions. One account can have several memberships, and switching to a saved login can avoid another password prompt. See [One account, separate practice sessions](/docs/access/tenant-selector#option-1-one-tenant-per-session).

### How do these policies combine?

**Policy grants are additive, not a way to subtract access.** Do not add a restrictive policy to narrow an existing broad grant. For overlapping resource rules, the first matching rule determines field restrictions and write constraints; design and test those rules together.

Implementation: [Parameterized Policies](/docs/access/access-policies#parameterized-policies), [Identity, Memberships, and Sessions](/docs/access/tenant-selector), [Invite API](/docs/api/project-admin/invite).

**Next:** Choose what each role can do with that data in [Role permissions](#role-permissions).

<div id="decision-3-what-should-each-role-be-allowed-to-do"></div>

## Role permissions

### Which resource types and interactions does the role need?

For each role, list the resource types it needs and choose which interactions it can perform, such as reading, creating, updating, searching, or deleting.

| Permission option                                                 | Approach                                                |
| :---------------------------------------------------------------- | :------------------------------------------------------ |
| All supported FHIR interactions                                   | Standard `resource` entry, no `interaction` restriction |
| Read-only                                                         | `readonly: true`                                        |
| Selected interactions, such as create-only or read without search | Explicit `interaction` array                            |

### Does the role need additional restrictions?

**Apply only the restrictions your roles need.**

#### Should any fields be hidden or read-only?

Use field-level restrictions for specific elements, such as a Patient's address.

| Situation                             | Approach                                                                        |
| :------------------------------------ | :------------------------------------------------------------------------------ |
| Readable but not writable             | `readonlyFields`                                                                |
| Hidden from returned resources        | `hiddenFields`; these restrictions also affect writes, not just returned output |
| No access to a clinical resource type | Omit that type from the role's grants; ensure no broader rule grants access     |

Field masking is not a substitute for denying access to a resource. For presentation-only changes, hide fields in the UI.

#### Should writes enforce required fields or state transitions?

Use write constraints to enforce these rules at the policy layer:

| Situation                                       | Approach                                                                              |
| :---------------------------------------------- | :------------------------------------------------------------------------------------ |
| Prevent a field changing after a terminal state | Use `writeConstraint` to check the prior state and compare the field before and after |
| Require a field when entering a state           | Check `%after` and field presence in a `writeConstraint`                              |
| Apply a constraint only to updates              | Prefix with `%before.exists() implies ...`                                            |
| Apply a constraint only to creates              | Prefix with `%before.exists().not() implies ...`                                      |

These prefixes control when a constraint applies; use `interaction` to allow only creates or updates. Keep FHIRPath simple. If a Bot enforces complex rules, use a controlled invocation path; a Subscription-triggered Bot runs after the write and cannot reject it.

#### Should access depend on resource attributes?

Use criteria-based filtering for attributes such as geography, code, or status:

| Situation                  | Approach                                      |
| :------------------------- | :-------------------------------------------- |
| Patient address filtering  | `Patient?address-state=%state`, parameterized |
| Several allowed states     | One `access` entry per state                  |
| Specialty or status filter | `criteria` with code/status filter            |
| Criteria \+ tenant         | Single `criteria` string combining both       |

Address filtering restricts records; it does not validate practitioner licensure. `criteria` supports a subset of FHIR search, with `:not` and `:missing` modifiers and no chained searches. Denormalize or assign tenant references through an enrollment workflow where needed.

**Files:** `Binary` resources do not support policy `criteria`; set an appropriate `securityContext`. See [Binary Security Context](/docs/access/binary-security-context).

Implementation: [Access Policies](/docs/access/access-policies), [Licensure and Scheduling](/docs/scheduling/state-by-state-licensure).

### Should the UI change based on the role?

**If your frontend shows or hides UI based on the user’s role.**

| Situation                | Approach                                                         |
| :----------------------- | :--------------------------------------------------------------- |
| UI changes based on role | Read the effective policy's `basedOn` references from `/auth/me` |

`basedOn` identifies the policies used to build the effective policy; it is not a policy-inheritance setting. Use it to inform the UI, while continuing to enforce access at the API.

**Next:** Assign administrative responsibilities in [Administration](#administration).

<div id="decision-4-who-will-administer-users-and-configuration"></div>

## Administration

Decide who manages users and memberships, who manages Bots, ClientApplications, and AccessPolicies, and whether those administrators should see clinical data. Identify any server-level needs, such as project creation or overwriting protected fields.

| Situation                                          | Approach                                                                                                                               |
| :------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------- |
| Trusted project administrator                      | `ProjectMembership.admin` grants project administration capabilities                                                                   |
| Admin with limited routine clinical access         | Assign an explicit custom AccessPolicy limiting clinical resources                                                                     |
| A role that must not access clinical content       | Use a non-admin role with narrowly scoped permissions; do not rely on `hiddenFields` or an admin's clinical policy as a hard boundary  |
| Project creation or protected server-level changes | Super-admin operations; for hosted Medplum, coordinate with Medplum                                                                    |
| Separate user-management and technical duties      | Define the permitted operations and use controlled backend workflows where needed; stacking policies does not subdivide the admin flag |

**Project admins are trusted administrators.** They can manage access policies and memberships, and act on behalf of users. A clinical policy limits their routine access but does not prevent them from changing grants. The admin flag does not bypass clinical policies; omitting a policy can still grant broad access.

**Default or custom policy?** The built-in Admin default grants broad read/write access. When admin status changes, Medplum swaps the recognized Practitioner/Admin default to the matching default, if configured. Custom policy assignments are unchanged by this swap; the admin flag still changes administrative capabilities. Use an explicit custom policy when the defaults are too broad.

Implementation: [Admin Users](/docs/access/admin), [Default Access Policies](/docs/access/access-policies#default-access-policies), [On-Behalf-Of](/docs/auth/on-behalf-of).

**Next:** Review the additional decisions below that apply to your application.

<div id="additional-decisions-if-applicable"></div>

<div id="how-will-patients-and-caregivers-get-access"></div>

## Patient and caregiver access

**For applications with a patient portal.**

For a single care operation, start with each person's verified Patient and caregiver relationships. If your portal spans tenants, use the account experience chosen in [Tenancy Design](/docs/decision-guides/tenancy-design#staff-workflows-and-patient-accounts). A person may have multiple tenant-specific Patient records; each grant must identify the intended record. See [Patient login and memberships](/docs/access/tenant-selector#patient-login-and-memberships).

Choose how patients register, whether caregivers or proxies need access (such as parents, adult children, or guardians), and how those relationships are established and revoked.

### How will patients register?

| Registration option    | Approach                                                                 |
| :--------------------- | :----------------------------------------------------------------------- |
| Invite-only            | Use the Invite API with a patient-scoped policy                          |
| Open self-registration | Set `Project.setting` `openPatientRegistration` to `true`, and keep a Patient policy in `defaultAccessPolicies` (or the deprecated `defaultPatientAccessPolicy` when that entry is absent) |

**Check both enrollment paths.** Open registration requires the `openPatientRegistration` setting and a Patient access policy. The policy is the Patient entry in `Project.defaultAccessPolicies`, falling back to the deprecated `defaultPatientAccessPolicy` when that entry is absent. Patient invitations and [SCIM](/docs/api/scim/users) patient provisioning use the same resolution and do not require the setting. SCIM refuses to create a Patient when neither policy is set. Changing the policy affects future registrations and invites; it does not migrate existing memberships. See [Default Access Policies](/docs/access/access-policies#default-access-policies).

### Which patient records can each person access?

| Access option                                          | Approach                                                                                                   |
| :----------------------------------------------------- | :--------------------------------------------------------------------------------------------------------- |
| Patient sees own data                                  | Parameterized policy with an explicitly verified `%patient` reference on clinical resources                                                 |
| Single caregiver, single patient                       | One `access` entry with `%patient`                                                                         |
| One caregiver, multiple patients                       | Multiple `access` entries, different `%patient`                                                            |
| Multiple caregivers per patient                        | Each caregiver has their own ProjectMembership                                                             |
| Revoke caregiver                                       | Remove the corresponding grants and verify API access is revoked                                           |
| Time-bound caregiver access (e.g., expires at age 18\) | Automate removal of the corresponding membership grants at expiry; hiding access in the UI is insufficient |

Implementation: [Patient and Caregiver Policies](/docs/access/access-policies#caregiver-access), [Open Patient Registration](/docs/user-management/open-patient-registration).

<div id="how-will-third-party-apps-get-access"></div>

## Third-party app access

**If an app needs SMART launch or delegated access.** SMART is commonly used for third-party integrations, but is not limited to them.

Choose patient-context, provider-context, or standalone launch. Define the scopes the app needs and whether it needs offline access.

| Situation                                           | Approach                                                                             |
| :-------------------------------------------------- | :----------------------------------------------------------------------------------- |
| Your own frontend without SMART launch requirements | Use a standard ClientApplication and AccessPolicy                                    |
| App launched from an EHR or portal                  | Request `launch` plus the clinical data scopes the app needs                         |
| Standalone app needing patient selection            | Request `launch/patient` plus patient data scopes, such as `patient/*.rs`            |
| Patient data access                                 | Use `patient/` scopes with patient context; narrow the resource types where possible |
| Access within the current user's permissions        | Use `user/` scopes and the user's AccessPolicy                                       |
| Access after the user is offline                    | Request `offline_access` for a refresh token                                         |

Launch scopes request context; they do not grant clinical data access. Clinical scopes work alongside AccessPolicy restrictions. Use `.rs` for read/search access or `.cruds` for full access within the policy; enforce finer interaction restrictions through `AccessPolicy.resource.interaction` rather than assuming arbitrary SMART permission-letter combinations are enforced.

Implementation: [SMART Scopes](/docs/access/smart-scopes).

<div id="should-access-be-restricted-to-specific-networks"></div>

## Network restrictions

**If access should be restricted by IP range.**

Choose which networks can connect, such as a VPN or clinic network, and whether different roles need different rules.

| Situation    | Approach                               |
| :----------- | :------------------------------------- |
| VPN-only     | Allow VPN ranges \+ wildcard block     |
| On-prem only | Allow clinic network \+ wildcard block |
| Mixed        | Different AccessPolicies per role      |

Use the documented IPv4 address or address-prefix rules, not CIDR notation. The first matching rule wins; end an allowlist with a wildcard block.

These rules apply to supported authentication paths, but are not enforced on refresh-token requests or rechecked on every bearer-token API call. Do not use them as the sole control for a requirement that every request originate from an approved network.

Implementation: [IP Access Rules](/docs/access/ip-access-rules).
