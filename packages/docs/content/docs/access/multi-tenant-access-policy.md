---
id: multi-tenant-access-policy
title: Tenant Assignment and Access
breadcrumb_parent: docs/tenancy-design
---

{{< tip title="Choosing your tenancy design?" >}}
Use the [Tenancy Design Decision Guide](/docs/decision-guides/tenancy-design) to choose your tenant boundary, Patient model, and account experience. This page implements compartment-based access within one project.
{{< /tip >}}

Represent your tenants, assign their records, then grant users access. The same compartment mechanism can add finer permissions within a tenant, such as care-team access. For a separate project per tenant, see [Projects](/docs/access/projects#project-per-customer-tenancy).

The enrollment examples below assign a Patient and its patient-compartment resources to the same tenants. They support tenant-specific Patients and intentional chart sharing. A shared Patient with isolated clinical records needs the [resource-specific rules](/docs/tenancy-design/patient-records#clinical-record-isolation) described in the Patient-records guide.

## Overview

### What is a tenant?

A tenant is a customer organization or organizational unit that your application treats as a distinct operating context, with defined rules for its data, users, and administration. The resource representing that group describes its meaning; access policies and membership grants enforce access. The same compartment mechanism can implement smaller access groups within a tenant, or care-team permissions in an application with no multi-tenant design.

This guide configures the tenant resources, assignments, and permissions for the selected model. Here is an overview of the steps you will take:

1. **Model your tenants:** Choose the FHIR resources representing your tenant boundaries.
2. **Assign data to tenants:** Set the account references used by your access rules.
3. **Grant users access:** Configure policies and membership grants for the approved records.

## Step 1: Model your tenants {#step-1-modeling-your-tenants}

Choose the resource that represents your tenant in the operating model. An `Organization` fits a customer practice or organizational unit. A `HealthcareService` can anchor access for a service offering when that service corresponds to the separately governed unit you selected.

| Your boundary | Resource | Example |
| :--- | :--- | :--- |
| A customer practice or organizational unit | `Organization` | Each member practice in an MSO. |
| A separately governed service offering | `HealthcareService` | Cardiology and oncology services with independent data-governance requirements. |

Use `Organization` for a department as an organizational unit, and `HealthcareService` for the services it provides. See [Modeling Provider Organizations](/docs/administration/provider-directory/provider-organizations) for the clinical relationships. Choosing a resource type does not itself establish the access boundary; the assignments and grants below enforce it.

Other FHIR resource types can also anchor account-based groups when their meaning fits your model. Use the chosen representation consistently; [project boundaries](/docs/access/projects) are configured separately.

The diagrams show how the membership grant and Patient assignment refer to the same group. **Boxes are FHIR resources. Solid arrows follow reference fields; dashed arrows show permitted access.** [Care-team permissions](#layering-tenant-and-care-team-access) are an additional access layer within a tenant.

{{< tabs groupId="access-group-type" >}}
  {{< tab value="organization" label="Organization" >}}

![ProjectMembership references an AccessPolicy and supplies an Organization parameter. The policy matches the Patient’s meta.accounts assignment to that Organization.](/img/tenancy-design/assignment-organization.svg)

  {{< /tab >}}
  {{< tab value="healthcare-service" label="HealthcareService" >}}

![ProjectMembership references an AccessPolicy and supplies a HealthcareService parameter. The policy matches the Patient’s meta.accounts assignment to that HealthcareService.](/img/tenancy-design/assignment-service.svg)

  {{< /tab >}}
{{< /tabs >}}

The membership supplies the group reference to its policy; the Patient carries the matching assignment in `meta.accounts`. Creating the group or setting `Patient.managingOrganization` alone does not establish these grants.

### Optional: Add care-team restrictions {#layering-tenant-and-care-team-access}

A [CareTeam](https://hl7.org/fhir/R4/careteam.html) represents participants in care. Use the pattern below when the API must restrict clinicians to their care team's patients. For a focused worklist within broader permitted access, UI filters can use existing fields and relationships without compartment assignments. See [UI filtering versus API restrictions](/docs/decision-guides/access-control#does-this-restriction-need-to-prevent-api-access-or-only-change-what-the-ui-displays).

If a team operates as a separately governed business unit, model that unit with an Organization and its care participants with CareTeam.

For patient-specific teams, one pattern is a CareTeam per Patient, with `CareTeam.subject` referencing that Patient. Give each clinician one access grant per assigned team, or per practice/team pair when both restrictions apply. Keep those grants synchronized with care assignments; updating `CareTeam.participant` alone does not update permissions.

![Patient meta.accounts references both Organization A and CareTeam 1. The access policy requires both assignments.](/img/tenancy-design/care-team-layer.svg)

_The membership supplies this policy with the approved practice and care-team parameters. The Patient must match both assignments. CareTeam participation alone does not grant access._

You can preserve the practice boundary while limiting clinicians to their assigned care teams:

- **One project per practice:** The project provides the outer boundary. Use care-team criteria within that project for clinicians who must only access their assigned patients.
- **Several practices in one project:** Enforce the practice and care-team conditions together. Separate practice-wide and team-only grants combine access; the team grant does not narrow the practice-wide grant.

For tenant-specific Patients whose charts share one team audience, assign both the practice and approved CareTeam references with `$set-accounts`. A resource may belong to several compartments; those assignments form a set, with no automatic parent-child containment. `CareTeam.managingOrganization` describes the responsible organization and does not create an authorization hierarchy.

This read-only example requires **both** the practice and care-team compartments for Patient and Encounter access:

{{< code-example file="packages/examples/src/access/tenant-access-layers.ts" language="ts" blocks="practice-care-team-policy" >}}

Supply `organization` and `care_team` as reference parameters in the **same** `ProjectMembership.access` entry. Verify that the team belongs to the intended practice and that the member is authorized for it. Repeat the combined grant for each approved practice/team pair. Repeated `_compartment` parameters require both matches; comma-separated values would match either.

The example grants only Patient and Encounter reads. Add explicit rules for other needed types and keep broader grants off memberships that need this restriction. Maintain the assignments when teams change. Patient-wide assignment and propagation apply to the whole patient compartment; if a shared Patient has different clinical audiences, use [resource-specific clinical rules](/docs/tenancy-design/patient-records#clinical-record-isolation).

### Tenant hierarchies {#tenant-hierarchies-and-shared-directories}

For a hierarchy such as region → clinic, one approach is to grant access through the lowest-level tenants:

- Assign each Patient only to the lowest-level clinic or clinics it belongs to within that hierarchy. Keep any separate care-team assignments required by your policies.
- For staff authorized at a region or higher level, expand its descendants into one `ProjectMembership.access` grant per approved clinic, preserving any care-team conditions.
- When a clinic is added, moved, or removed, update every affected membership with access at an ancestor level.

`Organization.partOf` describes the hierarchy; it does not automatically grant access to descendants. Use patient-wide propagation only when the Patient and its clinical records have the same intended audience.

### Shared directories and automation

For a shared practitioner directory, explicitly grant the permitted `Practitioner` reads. If practitioner records must be tenant-specific, assign tenant accounts to them and apply corresponding criteria. Make the same choice for Questionnaires, terminology, PlanDefinitions, and ActivityDefinitions. Include the CodeSystem and ValueSet reads needed by terminology-backed UI controls. [Projects](/docs/access/projects#project-linking) covers exported reference data and read-only access across linked projects.

For shared Bots, configure permission to invoke the Bot separately from its execution permissions. A Bot normally uses its own ProjectMembership policy; [`runAsUser`](/docs/bots/bot-run-as-user) selects the caller's permissions instead.

## Step 2: Assign data to tenants {#step-2-assigning-data-to-tenants}

For this compartment-based pattern, assign the chosen group references with `$set-accounts`, then configure policies to match them. The Organization and HealthcareService examples assign tenant scope. The **Care-team access** tabs apply the same mechanism to finer groups; combine those assignments with the tenant scope when both restrictions are required.

The IDs below are illustrative. Substitute the actual resource IDs returned by Medplum before running the examples.

When a Patient and its patient-compartment resources have the same intended tenant audience, assign the Patient to those tenants and use propagation for existing resources. For tenant-specific Patients, assign each Patient only to its intended tenant. For a shared Patient with different clinical audiences, follow [Clinical-record isolation](/docs/tenancy-design/patient-records#clinical-record-isolation).

{{< info >}}
Tenant assignment controls which tenant-scoped policies can match the Patient. Portal permissions come from the User’s membership and policy. See [Patient login and memberships](/docs/access/tenant-selector#patient-login-and-memberships).
{{< /info >}}

<details>
  <summary>Example Method: Assigning a Patient to an Organization Tenant</summary>

{{< code-example file="packages/examples/src/access/multi-tenant-access-policy.ts" language="ts" blocks="enroll-patient" >}}

</details>

Find other example enrollment methods [here](https://github.com/medplum/medplum/blob/main/examples/medplum-mso-demo/src/utils/enrollment.ts).

### Understanding Compartments

FHIR compartments group resources related to an anchor resource. For example, a Patient compartment includes clinical resources linked to that Patient through defined fields. Medplum also supports explicit account references for application tenants and finer access groups.

| Concept | What it does |
| :--- | :--- |
| Patient-compartment references, such as `Encounter.subject` | Relate a clinical resource to a Patient according to the compartment definition. |
| `meta.accounts` | Holds explicit references used to assign tenants or finer access groups, such as an Organization, HealthcareService, or CareTeam. Set these through `$set-accounts`. |
| `meta.compartment` | Server-computed membership, including applicable patient, project, and account references. Read it to inspect assignments. |
| `AccessPolicy` and `ProjectMembership.access` | Determine which assigned records the authenticated member can access. Assignment alone does not grant a user access. |

Organization, HealthcareService, and CareTeam account compartments use Medplum's account mechanism. They are distinct from the standard FHIR Patient compartment.

### Assigning account references {#adding-references-to-the-metacompartment-field}

The server computes `meta.compartment`. Use [$set-accounts](/docs/api/fhir/operations/set-accounts) to set the resource’s tenant or care-team account references, which contribute to its compartments. Supply the complete intended account list, including existing accounts you want to retain. The operation requires project-admin or super-admin authority and checks access to the target resource.

{{< tabs groupId="access-group-type" >}}
  {{< tab value="organization" label="Organization" >}}

{{< code-example file="packages/examples/src/access/multi-tenant-access-policy.ts" language="ts" blocks="set-accounts-organization" >}}

This will update the **meta.compartment** field of the Patient resource to include the reference to the Organization. This excerpt shows the account assignment; other metadata and compartment references are omitted:

```json
{
  "resourceType": "Patient",
  "meta": {
    "accounts": [{ "reference": "Organization/clinic-a" }],
    "compartment": [{ "reference": "Organization/clinic-a" }]
  }
}
```

  {{< /tab >}}
  {{< tab value="healthcare-service" label="HealthcareService" >}}

{{< code-example file="packages/examples/src/access/multi-tenant-access-policy.ts" language="ts" blocks="set-accounts-healthcare-service" >}}

This will update the **meta.compartment** field of the Patient resource to include the reference to the HealthcareService. This excerpt shows the account assignment; other metadata and compartment references are omitted:

```json
{
  "resourceType": "Patient",
  "meta": {
    "accounts": [{ "reference": "HealthcareService/cardiology-service" }],
    "compartment": [{ "reference": "HealthcareService/cardiology-service" }]
  }
}
```

  {{< /tab >}}
  {{< tab value="careteam" label="Care-team access" >}}

{{< code-example file="packages/examples/src/access/multi-tenant-access-policy.ts" language="ts" blocks="set-accounts-careteam" >}}

This will update the **meta.compartment** field of the Patient resource to include the reference to the CareTeam. This excerpt shows the account assignment; other metadata and compartment references are omitted:

```json
{
  "resourceType": "Patient",
  "meta": {
    "accounts": [{ "reference": "CareTeam/diabetes-care-team" }],
    "compartment": [{ "reference": "CareTeam/diabetes-care-team" }]
  }
}
```

{{< /tab >}}
{{< /tabs >}}

Resources that support compartment-based access can be assigned to tenants with this model. `Binary` uses [securityContext](/docs/access/binary-security-context) instead. For example, you could also assign a [Questionnaire](/docs/api/fhir/resources/questionnaire) to a tenant by calling the [$set-accounts](/docs/api/fhir/operations/set-accounts) operation on that specific resource.

{{< tabs groupId="access-group-type" >}}
  {{< tab value="organization" label="Organization" >}}

{{< code-example file="packages/examples/src/access/multi-tenant-access-policy.ts" language="ts" blocks="set-accounts-questionnaire-organization" >}}

  {{< /tab >}}
  {{< tab value="healthcare-service" label="HealthcareService" >}}

{{< code-example file="packages/examples/src/access/multi-tenant-access-policy.ts" language="ts" blocks="set-accounts-questionnaire-healthcare-service" >}}

  {{< /tab >}}
  {{< tab value="careteam" label="Care-team access" >}}

{{< code-example file="packages/examples/src/access/multi-tenant-access-policy.ts" language="ts" blocks="set-accounts-questionnaire-careteam" >}}

  {{< /tab >}}
{{< /tabs >}}

### Why is Patient a special case?

**Patient supports propagation to existing patient-compartment resources.** Ordinary writes of resources referring to the Patient can also inherit the Patient’s tenant accounts. These behaviors are useful when the Patient and its clinical records share a tenant audience. **A resource is determined to _"belong"_ to a Patient based on the resource relationships defined by the [Patient CompartmentDefinition](https://hl7.org/fhir/R4/compartmentdefinition-patient.html)**.

For example, a [QuestionnaireResponse](/docs/api/fhir/resources/questionnaireresponse) belongs to a Patient if it has a reference to the Patient in the `subject` or `author` field, a [Communication](/docs/api/fhir/resources/communication) belongs to a Patient if it has a reference to the Patient in the `subject`, `recipient`, or `sender` field, etc.

To apply account changes to existing patient-compartment resources, call [$set-accounts](/docs/api/fhir/operations/set-accounts) with `propagate: true`. Propagation updates resources in the target project that the caller can read and update; verify the resulting assignments before treating a transfer as complete.

{{< tabs groupId="access-group-type" >}}
  {{< tab value="organization" label="Organization" >}}

{{< code-example file="packages/examples/src/access/multi-tenant-access-policy.ts" language="ts" blocks="set-accounts-propagate-organization" >}}

  {{< /tab >}}
  {{< tab value="healthcare-service" label="HealthcareService" >}}

{{< code-example file="packages/examples/src/access/multi-tenant-access-policy.ts" language="ts" blocks="set-accounts-propagate-healthcare-service" >}}

  {{< /tab >}}
  {{< tab value="careteam" label="Care-team access" >}}

{{< code-example file="packages/examples/src/access/multi-tenant-access-policy.ts" language="ts" blocks="set-accounts-propagate-careteam" >}}

  {{< /tab >}}
{{< /tabs >}}

With this Patient-based assignment model, ordinary writes of patient-compartment resources inherit the Patient’s account references; the server computes their compartments. Propagation follows each resource’s own patient-compartment references, such as `subject`, rather than arbitrary links like `Communication.partOf`. `propagate: false` skips the existing-resource sweep; it does not turn off inheritance on future writes.

### Assigning a Patient to multiple tenants or teams {#what-if-you-need-to-assign-a-patient-to-multiple-tenants}

Use the examples below when the organizations, services, or care teams intentionally share the Patient and its patient-compartment records. They call [$set-accounts](/docs/api/fhir/operations/set-accounts) with multiple account references and propagation. Matching policies can then grant access to the assigned resources.

For independent Patient information, provision [tenant-specific Patients](/docs/tenancy-design/patient-records#tenant-specific-patient-records). For shared Patient information with separate clinical records, use [resource-specific clinical rules](/docs/tenancy-design/patient-records#clinical-record-isolation).

{{< tabs groupId="access-group-type" >}}
  {{< tab value="organization" label="Organization" >}}

{{< code-example file="packages/examples/src/access/multi-tenant-access-policy.ts" language="ts" blocks="set-accounts-multiple-organization" >}}

  {{< /tab >}}
  {{< tab value="healthcare-service" label="HealthcareService" >}}

{{< code-example file="packages/examples/src/access/multi-tenant-access-policy.ts" language="ts" blocks="set-accounts-multiple-healthcare-service" >}}

  {{< /tab >}}
  {{< tab value="careteam" label="Care-team access" >}}

{{< code-example file="packages/examples/src/access/multi-tenant-access-policy.ts" language="ts" blocks="set-accounts-multiple-careteam" >}}

  {{< /tab >}}
{{< /tabs >}}

## Step 3: Grant users access {#step-3-user-registration--management}

Once you've modeled your tenants and associated data with them, you also need to give your Practitioner Users access to those tenants. This is done through [AccessPolicies](/docs/access/access-policies) and [ProjectMembership](/docs/api/fhir/medplum/projectmembership) configuration.

Use [Parameterized Access Policies](/docs/access/access-policies#parameterized-policies) to supply the tenant references in each membership grant.

### Create AccessPolicies with Parameterized Variables

Your AccessPolicy uses parameterized variables (like `%organization`, `%healthcare_service`, or `%care_team`) that get replaced at runtime with tenant or care-team references from the user's ProjectMembership. These variables are used in the [compartment](/docs/access/access-policies#compartments) section and for [Criteria-based Access Control](/docs/access/access-policies#compartments).

For new multi-tenant policies, prefer resource-level `criteria` with parameterized values instead of legacy top-level `AccessPolicy.compartment` rules. This makes each resource rule explicit and lets one policy template be reused across many `ProjectMembership.access` entries.

In your design, you should decide which resource types you want to restrict access to within your tenants versus which resource types you want to allow access to.

{{< tabs groupId="access-group-type" >}}
  {{< tab value="organization" label="Organization" >}}

{{< code-example file="packages/examples/src/access/multi-tenant-access-policy.ts" language="ts" blocks="access-policy-organization" >}}

  {{< /tab >}}
  {{< tab value="healthcare-service" label="HealthcareService" >}}

{{< code-example file="packages/examples/src/access/multi-tenant-access-policy.ts" language="ts" blocks="access-policy-healthcare-service" >}}

  {{< /tab >}}
  {{< tab value="careteam" label="Care-team access" >}}

{{< code-example file="packages/examples/src/access/multi-tenant-access-policy.ts" language="ts" blocks="access-policy-careteam" >}}

  {{< /tab >}}
{{< /tabs >}}

### Configure membership grants {#configure-projectmemberships-to-reference-tenants}

In this pattern, the User's `ProjectMembership` supplies its approved tenant or care-team references through `access.parameter`. This is a permission grant; it does not assign the User's profile or clinical records to a tenant. Each parameter name must match the variable name used in the `AccessPolicy` (e.g., if your AccessPolicy uses `%organization`, the User's ProjectMembership `access.parameter` should be named `"organization"`).

{{< tabs groupId="access-group-type" >}}
  {{< tab value="organization" label="Organization" >}}

```json
{
  "resourceType": "ProjectMembership",
  "access": [
    {
      "policy": { "reference": "AccessPolicy/mso-policy" },
      "parameter": [
        {
          "name": "organization",
          "valueReference": { "reference": "Organization/clinic-a" }
        }
      ]
    }
  ]
}
```

  {{< /tab >}}
  {{< tab value="healthcare-service" label="HealthcareService" >}}

```json
{
  "resourceType": "ProjectMembership",
  "access": [
    {
      "policy": { "reference": "AccessPolicy/service-policy" },
      "parameter": [
        {
          "name": "healthcare_service",
          "valueReference": { "reference": "HealthcareService/cardiology-service" }
        }
      ]
    }
  ]
}
```

  {{< /tab >}}
  {{< tab value="careteam" label="Care-team access" >}}

```json
{
  "resourceType": "ProjectMembership",
  "access": [
    {
      "policy": { "reference": "AccessPolicy/careteam-policy" },
      "parameter": [
        {
          "name": "care_team",
          "valueReference": { "reference": "CareTeam/diabetes-care-team" }
        }
      ]
    }
  ]
}
```

  {{< /tab >}}
{{< /tabs >}}

### When should you assign a User to a tenant?

You can assign a User to a tenant at **invite time** or **after they have been invited**.

#### Invite `Practitioner` Users at Invite Time

Invite `Practitioner` Users associated with their respective tenants via the [`/admin/invite` endpoint](/docs/api/project-admin/invite):

<details>
  <summary>Example: Inviting a Practitioner User with Tenant Access</summary>

{{< code-example file="packages/examples/src/access/multi-tenant-access-policy.ts" language="ts" blocks="invite-practitioner" >}}

</details>

#### Assign `Practitioner` Users to a Tenant After Invite

The helper below assumes the Practitioner has one membership in the project. If you provision multiple memberships for that profile, select the intended membership by ID before updating its grants.

<details>
  <summary>Example Method: Enrolling a Practitioner in an Organization Tenant After Invite</summary>

{{< code-example file="packages/examples/src/access/multi-tenant-access-policy.ts" language="ts" blocks="enroll-practitioner" >}}

</details>

### Granting access to multiple tenants or teams {#what-if-your-user-needs-to-access-multiple-tenants}

To grant access to multiple groups, include multiple entries in the `access` array with the approved parameters. The standalone CareTeam example below uses one entry per team. Where practice and team conditions must both apply, repeat the [combined grant](#layering-tenant-and-care-team-access) instead. The resulting session can access the combined grants. Use [separate authenticated sessions](/docs/access/tenant-selector#option-1-one-tenant-per-session) when each session must be limited to one tenant.

{{< tabs groupId="access-group-type" >}}
  {{< tab value="organization" label="Organization" >}}

```json
{
  "resourceType": "ProjectMembership",
  "access": [
    {
      "policy": { "reference": "AccessPolicy/mso-policy" },
      "parameter": [
        {
          "name": "organization",
          "valueReference": { "reference": "Organization/clinic-a" }
        }
      ]
    },
    {
      "policy": { "reference": "AccessPolicy/mso-policy" },
      "parameter": [
        {
          "name": "organization",
          "valueReference": { "reference": "Organization/clinic-b" }
        }
      ]
    }
  ]
}
```

  {{< /tab >}}
  {{< tab value="healthcare-service" label="HealthcareService" >}}

```json
{
  "resourceType": "ProjectMembership",
  "access": [
    {
      "policy": { "reference": "AccessPolicy/service-policy" },
      "parameter": [
        {
          "name": "healthcare_service",
          "valueReference": { "reference": "HealthcareService/cardiology-service" }
        }
      ]
    },
    {
      "policy": { "reference": "AccessPolicy/service-policy" },
      "parameter": [
        {
          "name": "healthcare_service",
          "valueReference": { "reference": "HealthcareService/neurology-service" }
        }
      ]
    }
  ]
}
```

  {{< /tab >}}
  {{< tab value="careteam" label="Care-team access" >}}

```json
{
  "resourceType": "ProjectMembership",
  "access": [
    {
      "policy": { "reference": "AccessPolicy/careteam-policy" },
      "parameter": [
        {
          "name": "care_team",
          "valueReference": { "reference": "CareTeam/alice-smith" }
        }
      ]
    },
    {
      "policy": { "reference": "AccessPolicy/careteam-policy" },
      "parameter": [
        {
          "name": "care_team",
          "valueReference": { "reference": "CareTeam/bob-jones" }
        }
      ]
    }
    // ... one entry per patient CareTeam the user is assigned to
  ]
}
```

  {{< /tab >}}
{{< /tabs >}}

### Can some resource types still be accessed by Users, regardless of the tenant(s) they are assigned to?

A good thing to consider is that your application may need to allow some resource types to be accessed by Users, regardless of the tenant(s) they are assigned to. For example, you may want to allow Questionnaires to be accessed by Users, regardless of the tenant(s) they are assigned to because you want one single Patient Onboarding Questionnaire or you want Practitioners to be able to view each other's profiles, even if they are not assigned to the same tenant.

For a resource type intentionally shared in full, grant reads without the tenant criterion. If only some resources are shared, use criteria that match those designated shared resources alongside the tenant rules. An unfiltered rule for that resource type would also expose other tenants’ resources.

{{< code-example file="packages/examples/src/access/multi-tenant-access-policy.ts" language="ts" blocks="access-policy-mixed" >}}

## Tenant selection and sessions

Choose whether staff work in one authenticated tenant context or combine authorized tenant access. A tenant selector can narrow the visible records within combined access. Keep any care-team restrictions in effect within the selected practice or service.

See [Identity, Memberships, and Sessions](/docs/access/tenant-selector).

## Verify and continue

Test each tenant’s direct reads, searches, and writes, including files and records created by Bots or imports. Check [Patient-record behavior and transfers](/docs/tenancy-design/patient-records#verify-the-boundary) with the chosen shared or tenant-specific Patient model.

Use [Access Policies](/docs/access/access-policies) for resource and field permissions and [Identity, Memberships, and Sessions](/docs/access/tenant-selector) for authenticated context. If the application’s sharing requirements change, revisit the [Tenancy Design Decision Guide](/docs/decision-guides/tenancy-design).
