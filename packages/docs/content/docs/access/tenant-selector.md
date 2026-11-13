---
id: tenant-selector
title: Identity, Memberships, and Sessions
breadcrumb_parent: docs/tenancy-design
weight: 110
toc_max_heading_level: 3
docs_tags: [auth, multi-tenant]
keywords: [tenant selector, active tenant, allowed tenants, multi-tenant, ProjectMembership, patient login]
---

This page covers providers, staff, and patient portals. First choose your [Patient and clinical-record model](/docs/tenancy-design/patient-records) and configure [tenant permissions](/docs/access/multi-tenant-access-policy).

{{< tip title="Choosing an account experience?" >}}
Use [Tenancy Design: How should people work across tenants?](/docs/decision-guides/tenancy-design#staff-workflows-and-patient-accounts) to compare separate practice sessions, access across practices, and independent accounts.
{{< /tip >}}

An account identifies the person signing in. A session selects their membership and permissions. The application can then display one practice or a combined workspace within those permissions. Separate Patient records can use any of the account approaches below.

**Building a tenant picker?** See [Tenant selector](#building-the-selector) to change the displayed practice within one session, or [Switching the active ProjectMembership](#switching-the-active-projectmembership) to switch authenticated practice sessions.

## Resource connections {#patient-login-and-memberships}

| Resource | Role and connections |
| :--- | :--- |
| `User` | Sign-in identity, including the login email and credential configuration. One User can have several memberships. |
| `Login` | Created during authentication. `user` references the User; `membership` references the selected ProjectMembership once selection completes. The issued token uses that membership. |
| `ProjectMembership` | Connects `user` to a `project`, one `profile`, and access grants. Staff normally use a Practitioner profile; portal users normally use a Patient profile. |
| `AccessPolicy` | Defines permissions. `ProjectMembership.access` supplies policy references and parameters for the approved tenants or patients. |
| `Patient` / `Practitioner` | The profile resource is distinct from the User's sign-in identity. A Patient can exist without portal access. |

**Read the diagrams:** Purple boxes are FHIR resources; solid arrows follow their reference fields. Dashed arrows show permissions. Labels identify Practice A, Practice B, and shared resources. The examples use two tenant-specific Patients for the same person in one project; each membership also references that Project and its User. For staff, substitute the intended Practitioner profile; separate memberships can share one Practitioner.

## At a glance

| Approach | Identity and membership arrangement | Switching behavior |
| :--- | :--- | :--- |
| [1. One account, separate practice sessions](#option-1-one-tenant-per-session) | One User; a membership per practice. | Switch the authenticated Login. A saved login may avoid another password prompt. |
| [2. One account, access across practices](#option-2-combined-access-with-a-tenant-selector) | One User and membership with combined grants. | Change the displayed practice or use a combined workspace. Permissions stay the same. |
| [3. Independent practice accounts](#independent-user-identities) | Separate Users with their own memberships. | Use each practice's account. Credential prompts depend on authentication and SSO. |

<div id="option-1-strict-isolation-separate-accounts--separate-projects"></div>
<div id="one-user-with-separate-patient-memberships"></div>

## 1. One account, separate practice sessions {#option-1-one-tenant-per-session}

Providers switch between practice schedules and charts; patients select a practice before using its forms or messages. Each authenticated session has the permissions of one practice membership. Shared credentials and recovery belong to the User.

For tenant-specific Patients, create one membership per intended Patient profile:

![Two Logins share one User. Each Login selects a membership with its own Patient profile.](/img/tenancy-design/login-separate-sessions.svg)

_Two Logins share one User. Each Login selects one membership, which supplies its Patient profile and permissions._

### Provision the memberships {#how-to-configure-a-user-with-multiple-memberships}

Use the [Invite API](/docs/api/project-admin/invite) from a trusted backend with project-admin authority:

1. Supply the intended `membership.profile` and tenant- or patient-scoped policy grants.
2. Keep the same email and identity scope to reuse the User. Use `forceNewMembership: true` for each additional membership; normal User and profile matching still runs.
3. Save the returned membership IDs. Repeating a forced invite creates another membership, so reconcile uncertain results before retrying.

For patients, provision and assign the [tenant-specific Patients](/docs/tenancy-design/patient-records#provision-the-data-before-access) first. The following example assumes the referenced policy restricts access to the selected profile's patient compartment using `%profile`. Use actual resource IDs and the same project-scoped email for both calls; set `additionalMembership` false for the first and true for the second.

{{< code-example file="packages/examples/src/access/tenant-patient-records.ts" language="ts" blocks="invite-tenant-patient" >}}

Supplying only an email may reuse an existing Patient by email or fail if multiple Patients match. Explicit `membership.profile` selects the intended record. The example uses `sendEmail: false`; complete activation through your [custom invitation flow](/docs/user-management/custom-emails), or enable built-in invitation email. Adding a membership preserves an existing User's sign-in identity.

<details>
<summary>Practitioner invitation examples</summary>

A staff membership uses a Practitioner profile and grants for the approved tenant. A membership can have several grants for finer groups within that tenant; preserve any [care-team restrictions](/docs/access/multi-tenant-access-policy#layering-tenant-and-care-team-access).

#### Creating the First `ProjectMembership`

{{< code-example file="packages/examples/src/access/tenant-selector.ts" language="ts" blocks="invite-practitioner-first-membership" >}}

#### Creating an Additional `ProjectMembership`

{{< code-example file="packages/examples/src/access/tenant-selector.ts" language="ts" blocks="invite-practitioner-second-membership" >}}

</details>

### Switching the active ProjectMembership {#switching-the-active-projectmembership}

The OAuth login flow selects a membership before issuing tokens. With one membership it is selected automatically; with several, the login UI submits the chosen membership to `POST /auth/profile`. A UI preference alone cannot change the token's permissions.

Switch to another saved Login, or start a login flow that selects the other membership. The SDK exposes `medplum.getLogins()` and `medplum.setActiveLogin(login)` for saved logins. Its saved-login list identifies entries by profile reference. If staff memberships share one Practitioner, use explicit membership selection and manage session state by membership instead of expecting separate saved-login entries. Label the selected practice and clear or partition caches when switching. Carry the selected Patient through forms and messages, and define what happens to unsaved work.

<div id="option-2-single-account-multi-tenant-access--ui-level-tenant-context"></div>
<div id="one-membership-with-a-combined-portal"></div>

## 2. One account, access across practices {#option-2-combined-access-with-a-tenant-selector}

One membership grants the approved cross-practice access. Providers can work through a combined queue; patients can view appointments from several practices. A practice selector can narrow the view without another login.

![One Login and membership use Patient A as the profile. AccessPolicy grants access to both Patient A and Patient B.](/img/tenancy-design/login-combined.svg)

_One Login selects one membership and Patient A profile. Its policy grants access to both Patients. Patient B remains a separate record and is not the membership’s profile._

For patient portals, add separate parameterized policy entries for explicitly verified Patient records, as in [Caregiver Access](/docs/access/access-policies#caregiver-access). Verify the person's relationship to each Patient before granting access.

The membership still has **one profile**. `medplum.getProfile()` returns Patient A in this example, even while the portal displays Patient B. Use the selected Patient for clinical subjects and recipients, including in components that default to the authenticated profile. Ordinary direct writes retain that authenticated profile as `meta.author`; use separate sessions if actions must be attributed to each tenant-specific Patient profile.

### Grant staff access across practices {#how-to-grant-access-to-multiple-tenants}

For an Organization-based policy using `%organization`, repeat the grant with each approved organization reference. These are illustrative IDs; substitute actual stored resources.

```json
{
  "resourceType": "ProjectMembership",
  "access": [
    {
      "policy": { "reference": "AccessPolicy/mso-policy" },
      "parameter": [
        { "name": "organization", "valueReference": { "reference": "Organization/clinic-a" } }
      ]
    },
    {
      "policy": { "reference": "AccessPolicy/mso-policy" },
      "parameter": [
        { "name": "organization", "valueReference": { "reference": "Organization/clinic-b" } }
      ]
    }
  ]
}
```

A criterion such as `Patient?_compartment=%organization` then permits reads across the approved assignments. Where care-team or patient restrictions also apply, [combine the conditions](/docs/access/multi-tenant-access-policy#layering-tenant-and-care-team-access) in each grant. Independent grants add access.

### Choose the workspace {#key-concept-allowed-tenants-vs-active-tenant}

- **Allowed tenants** are enforced by membership policy grants.
- **Active tenant** is an application preference selecting the current view from those allowed tenants.

A selector changes the active tenant; it leaves the session's permissions unchanged. Both workspace choices below use the same combined grants.

#### Tenant selector {#building-the-selector}

Persist the selected practice in a URL, local session state, or `UserConfiguration`. Validate the selection against approved tenants, particularly before a backend acts on it. Apply the selected practice to displayed records and write destinations.

![The membership permits Patient A and Patient B. Selecting Practice B shows Patient B while both permissions remain.](/img/tenancy-design/workspace-selector.svg)

_Left: the membership’s permitted Patient records. Right: the same records as displayed in the application. Selecting Practice B changes the view while access to A and B remains. No new login is required._

##### Persisting the Active Tenant in `UserConfiguration`

```json
{
  "resourceType": "UserConfiguration",
  "option": [
    {
      "id": "activeTenant",
      "valueReference": { "reference": "Organization/clinic-b" }
    }
  ]
}
```

Reference this configuration from the membership as described in [User Configuration](/docs/access/user-configuration).

##### Filtering the active tenant in queries {#enforcing-the-active-tenant-in-queries}

UI filtering does not require compartments. Use supported [search parameters](/docs/search/basic-search) for existing resource fields and relationships, or filter already-loaded authorized data. For example, a "My tasks" view can filter by owner and status. Compartment filters are useful when your model already uses those assignments.

For Organization-based assignment, a screen can filter with `Patient?_compartment=Organization/clinic-b`. Omitting that UI filter shows the records permitted by the effective policy across practices. The API continues to enforce all policy restrictions.

With a shared Patient and separate clinical audiences, use the [resource-specific clinical rules](/docs/tenancy-design/patient-records#clinical-record-isolation) for those screens. A Patient-wide compartment filter alone does not express that separation.

#### Combined workspace {#option-3-unified-view-no-tenant-context}

Show a consolidated work queue, schedule, or portal across authorized practices. Label each item with its practice, and require a clear destination for every form, order, and message. Shared account access does not merge the underlying Patients or clinical records.

![The same membership permits Patient A and Patient B. A combined workspace displays both records.](/img/tenancy-design/workspace-combined.svg)

_The same permissions now support a view of both Patient records. The underlying records stay separate, and each write still needs an explicit destination._

## 3. Independent practice accounts {#independent-user-identities}

Providers and patients activate and use a distinct account for each practice. The application must identify which account is in use and which practice handles its support and offboarding.

![Separate Users have separate Logins, memberships, and Patient profiles for practices A and B.](/img/tenancy-design/login-independent.svg)

_Each User has separate account state and memberships. Each membership grants access to its intended Patient records._

Within one project, email-based invites normally reuse a User in the selected scope. Inviting the same email twice with `forceNewMembership` adds memberships to that identity. A separate Patient or Organization alone does not establish another sign-in identity. For email/password accounts in the same project scope, use distinct sign-in email addresses. For externally managed identities, consider [subject-based matching](/docs/user-management/external-ids) and define the identities in your [authentication design](/docs/decision-guides/authentication).

Separate Medplum Users do not guarantee independent upstream credentials. If SSO maps both accounts to one identity-provider account, that provider's password, MFA, and recovery remain shared. Require independent upstream identities when independent credential lifecycles are part of your design.

## Account lifecycle and project boundaries

Editing Patient or Practitioner contact information leaves `User.email` unchanged. For a User with multiple memberships, use [`$update-email`](/docs/api/fhir/operations/user-update-email) with `updateProfileTelecom: false`, then update intended profiles explicitly. Its optional profile update selects one membership and cannot target a particular Patient. Changing a shared User's login email affects every membership and revokes its active sessions.

When access to one practice ends, revoke the intended membership or grants and verify existing-session behavior while preserving other authorized access. If credentials come from an identity provider, coordinate its account lifecycle too.

Each Login selects a membership in one project. For [project-per-tenant designs](/docs/access/projects#project-per-customer-tenancy), shared server-scoped identities can have memberships in several projects; project-scoped identities have separate account scope. A combined workspace must coordinate the authorized project sessions. See [Project vs Server Scoped Users](/docs/user-management/project-vs-server-scoped-users).

**Next:** Verify sign-in, practice switching, write destinations, and revocation for both staff and patient users against your [Access Control](/docs/decision-guides/access-control) decisions.
