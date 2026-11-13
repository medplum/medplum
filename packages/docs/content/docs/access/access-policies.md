---
id: access-policies
title: Access Policies
weight: 20
docs_tags: [auth]
---

{{< tip title="Planning access control?" >}}
Use the [Access Control Decision Guide](/docs/decision-guides/access-control) to define roles, permissions, and administration. For a multi-tenant application, first choose the project and Patient boundaries in the [Tenancy Design Decision Guide](/docs/decision-guides/tenancy-design).
{{< /tip >}}

## Introduction

This document describes the core concepts of Medplum Access Controls. Security and access controls are notoriously difficult. Complex business and regulatory requirements often lead to a mess of incomprehensible rules. Medplum strives to create a simple and understandable model, which is flexible enough to handle all unique security needs.

## Core Model

Resources belong to a Project, a top-level container. An application can represent multiple customer organizations or service lines within one project, with access policies enforcing their permissions. Self-hosted applications can also use [a project per customer](/docs/access/projects#project-per-customer-tenancy).

Every user account can have one or more "Project Memberships". A project membership represents access to resources within a project. The user can either be granted access to all resources within the project, or limited access to a set of compartments.

## Access Policies

Users within a Project can be assigned Access Policies. Access Policies are an advanced method of restricting access to certain resource types or even certain fields within a resource type.

Access policies allow you to:

- Block access to any resource type
- Grant read only access to any resource type
- Grant read/write access to any resource type
- Grant read only access to any property
- Grant read/write access to any property

Access policies also allow you to grant access by "Compartment".

## Examples

### Resource Type

The following access policy grants read/write access to _only_ the "Patient" resource type:

```json
{
  "resourceType": "AccessPolicy",
  "name": "Patient Example",
  "resource": [
    {
      "resourceType": "Patient"
    }
  ]
}
```

### Criteria-based Access Control

You can narrow the set of resources the user has access to by using the `criteria` field. The following policy uses a [FHIR Search Query](/docs/search/basic-search) to grant access only to [`Patient`](/docs/api/fhir/resources/patient) resources who live in California.

See the [Search documentation](/docs/search/basic-search) for more information on the types of filtering available.

```json
{
  "resourceType": "AccessPolicy",
  "name": "Criteria Based Access Policy",
  "resource": [
    {
      "resourceType": "Patient",
      "criteria": "Patient?address-state=CA"
    }
  ]
}
```

{{< warning title="Limitations" >}}
While Medplum `AccessPolicies` use the [FHIR search syntax](/docs/search), it does not implement the full search specification. Specifically, the `criteria` syntax has the following limitations:

- Only `:not` and `:missing` [modifiers](/docs/search/basic-search#search-modifiers) are allowed.
- [Chained searches](/docs/search/chained-search#forward-chained-search) are **not** allowed.

{{< /warning >}}

### Read-only Access

The following access policy grants read-only access to the [`Patient`](/docs/api/fhir/resources/patient) resource type:

```json
{
  "resourceType": "AccessPolicy",
  "name": "Patient Example",
  "resource": [
    {
      "resourceType": "Patient",
      "readonly": true
    }
  ]
}
```

Similarly, the following access policy grants read/write access to the Patient resource, and also grants _only_ read access to all other resources:

```json
{
  "resourceType": "AccessPolicy",
  "name": "Read Only Example",
  "resource": [
    {
      "resourceType": "Patient"
    },
    {
      "resourceType": "*",
      "readonly": true
    }
  ]
}
```

Attempting to modify a read-only resource will result in an HTTP [`403 Forbidden`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/403) response.

### FHIR Interactions

The above read-only access is special case of the more general ability to control which interactions are allowed for a set of resources. The `AccessPolicy.resource.interaction` field can specify a subset of [FHIR interactions](http://hl7.org/fhir/R4/codesystem-restful-interaction.html) that can be performed on resources of the given type. The following are equivalent:

```js
{
  "resourceType": "AccessPolicy",
  "name": "Read-only modes",
  "resource": [
    // Legacy shorthand
    {
      "resourceType": "*",
      "readonly": true,
    },
    // Explicit list of interactions
    {
      "resourceType": "*",
      "interaction": ["read", "search", "history", "vread"]
    }
  ]
}
```

The `interaction` array can contain any of the supported interaction types:

- `create`: Write new resources
- `read`: Read a specific resource by ID
- `update`: Update an existing resource, including patch operations
- `delete`: Soft-delete resources
- `search`: Search for resources of the given type
- `history`: View the list of previous versions of a resource
- `vread`: View a specific previous version of a resource

{{< tip title="Related interactions" >}}

Some FHIR interactions are used in concert by the server, and so should be considered together:

- [Upserts](/docs/fhir-datastore/working-with-fhir#upsert) require `search` to identify existing resources, in addition to both `create` and `update`
- `search` access may be required as part of a `create` or `update` if the resource contains any [Conditional references](/docs/migration/convert-to-fhir#linking-data-using-conditional-references), in order to resolve references to individual resources
- `read` access to referenced resource types is required in `create` and `update` interactions, if [`Project.checkReferencesOnWrite`](/docs/api/fhir/medplum/project) is set
- `history` and `vread` are often specified together, to grant access to the entire [version history](/docs/fhir-datastore/resource-history) of resources

{{< /tip >}}

For example, this policy allows creating new resources and viewing any resources for which the ID is known, but will
prevent searching for or modifying existing resources:

```json
{
  "resourceType": "AccessPolicy",
  "name": "Write-only Sandbox",
  "resource": [
    {
      "resourceType": "*",
      "interaction": ["create", "read"]
    }
  ]
}
```

### Read-only Elements

The following access policy grants read-only access to the `Patient.name` and `Patient.address` elements:

```json
{
  "resourceType": "AccessPolicy",
  "name": "Patient Example",
  "resource": [
    {
      "resourceType": "Patient",
      "readonlyFields": ["name", "address"]
    }
  ]
}
```

### Hidden Elements

The following access policy grants read-only access to the "Patient" resource type, but hides "name" and "address":

```json
{
  "resourceType": "AccessPolicy",
  "name": "Patient Example",
  "resource": [
    {
      "resourceType": "Patient",
      "hiddenFields": ["name", "address"]
    }
  ]
}
```

### Write Constraints

Constraints on writes to a resource can also be specified using [FHIRPath expressions][fhirpath] in the `AccessPolicy.resource.writeConstraint` field. These expressions may contain the special variable `%before` to refer to the resource as it existed before the write. Any property accesses will by default refer to the resource as it exists with updates applied, but the `%after` variable is also provided for convenience.

{{< tip >}}

In case of a resource being created, `%before` will be undefined, so any expressions that refer to `%before` must account for this case. To select only updates or only creates, prefix the criteria with `%before.exists() implies` or `%before.exists().not() implies` respectively.

{{< /tip >}}

For example, an access policy with write constraints could be used to manage state transitions by prohibiting changing the status once a resource is marked as `final`, and ensure that a `subject` is set when the resource is finalized:

```json
{
  "resourceType": "AccessPolicy",
  "name": "Write Constraints Access Policy",
  "resource": [
    {
      "resourceType": "Observation",
      "writeConstraint": [
        {
          "language": "text/fhirpath",
          "expression": "%before.exists() implies %before.status != 'final'"
        },
        {
          "language": "text/fhirpath",
          "expression": "status = 'final' implies subject.exists()"
        }
      ]
    }
  ]
}
```

[fhirpath]: https://hl7.org/fhirpath/#expressions

### Compartments

A compartment groups resources related to an anchor resource. Compartments are not mutually exclusive; a resource can belong to several. Medplum computes patient-compartment membership from defined references, such as an Observation's `subject`. See the [FHIR Patient CompartmentDefinition](https://hl7.org/fhir/R4/compartmentdefinition-patient.html).

Using `_compartment` in an application search narrows that request's results; using it in policy criteria restricts permitted access. UI filtering can also use ordinary [search parameters](/docs/search/basic-search), such as owner or status where supported, without compartment assignments. Choose policies when the restriction must apply to direct API access.

For application tenants or finer access groups within a project, Medplum also includes explicit `meta.accounts` references in its computed `meta.compartment`. Assign them with [`$set-accounts`](/docs/api/fhir/operations/set-accounts), then grant access through matching policy criteria. Organization, HealthcareService, and CareTeam can represent these groups. Compartments can overlap and do not create an automatic hierarchy; see [Layering tenant and care-team access](/docs/access/multi-tenant-access-policy#layering-tenant-and-care-team-access). Patient-wide assignment is appropriate when the Patient and its clinical records share the intended audience.

You can use compartments to succinctly create an [AccessPolicy](/docs/api/fhir/medplum/accesspolicy) for resources related to a single patient.

The AccessPolicy below grants access to all `Observation` resources that belong to `Patient/xyz`. The example takes advantage of the [`_compartment` search parameter](/docs/search/advanced-search-parameters#_compartment)

```json
{
  "resourceType": "AccessPolicy",
  "name": "Write Constraints Access Policy",
  "resource": [
    {
      "resourceType": "Observation",
      "criteria": "Observation?_compartment=Patient/xyz"
    }
  ]
}
```

### Binaries

The FHIR `Binary` resource is a special case. It is used to store arbitrary binary data, such as images or documents. Unlike other resources, `Binary` resources are not searchable, and therefore do not have search parameters, and therefore cannot use the `criteria` field in an `AccessPolicy`.

To control access to `Binary` resources, you must use the `securityContext` field. This field is a reference to another resource, such as a `Patient`, `Practitioner`, or `Organization`, that defines the context in which the binary data is relevant.

See [Binary Security Context](/docs/access/binary-security-context) for more information on how to use the `securityContext` field to control access to `Binary` resources.

### Parameterized Policies

For more advanced access control configurations, You can use `%` variables to parameterize the access policy.

Medplum provides the following built-in variables:

| Variable      | Description                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------- |
| `%profile`    | Reference to the current user's profile resource (e.g., `Practitioner/123` or `Patient/123`) |
| `%profile.id` | The ID portion of the user's profile resource (e.g., `123`)                                  |

<details open>
<summary>
  Example: General Practitioner Access Policy
</summary>

The following access policy grants access to all [`Patient`](/docs/api/fhir/resources/patient) resources where the current user (a [`Practitioner`](/docs/api/fhir/resources/practitioner)) is listed as the general practitioner:

```json
{
  "resourceType": "AccessPolicy",
  "name": "GP Access Policy",
  "resource": [
    {
      "resourceType": "Patient",
      "criteria": "Patient?general-practitioner=%profile"
    }
  ]
}
```

</details>

You can also set custom variables for access policies on the user's [ProjectMembership](/docs/api/fhir/medplum/projectmembership) resource.
This policy then acts like a _template_, that can be instantiated, potentially multiple times, with different values for each variable.

<details open>
<summary>
  Example: Custom Access Policy Variables
</summary>

In this example, the user with the parameterized policy shown above will only have access to Patient and DiagnosticReport resources, filtered by the relevant organizations.

```json
{
  "resourceType": "AccessPolicy",
  "id": "123",
  "name": "Parameterized Access Policy",
  "resource": [
    {
      "resourceType": "Patient",
      "criteria": "Patient?organization=%provider_organization"
    },
    {
      "resourceType": "DiagnosticReport",
      "criteria": "DiagnosticReport?performer=%provider_organization"
    }
  ]
}
```

We can set these variables on the user's [ProjectMembership](/docs/api/fhir/medplum/projectmembership) resource, as follows

```js
{
  "resourceType": "ProjectMembership",
  "access": [
    // Provide access to Patients and Diagnostic Reports in Organization/abc
    {
      "policy": { "reference": "AccessPolicy/123" },
      "parameter": [
        {
          "name": "provider_organization",
          "valueReference": { "reference": "Organization/abc" }
        }
      ]
    },
    // Provide access to Patients and Diagnostic Reports in Organization/def
    {
      "policy": { "reference": "AccessPolicy/123" },
      "parameter": [
        {
          "name": "provider_organization",
          "valueReference": { "reference": "Organization/def" }
        }
      ]
    }
  ]
}
```

</details>

Some common use cases for parameterized policies include:

- Granting access to parents of pediatric patients
- Granting clinicians access to patients in a specific state, based on the clinician's state license

See this [video demo](https://www.youtube.com/watch?v=IDhsWiIxK3o) for an illustration.

See [this Github Discussion](https://github.com/medplum/medplum/discussions/1453) for more examples of access scenarios that can be created using these policies.

Parameterized policies are also the recommended pattern for temporary operational access, such as emergency patient access or temporary tenant access.

### Emergency Access

Emergency access, sometimes called Break Glass access, is a controlled workflow for granting temporary access to protected health information when normal access paths are not sufficient. This pattern supports ONC criterion [d6 Emergency Access](/docs/compliance/onc#criteria-certified).

When implementing emergency access, keep the grant narrow, time-bound, and auditable:

- Require an explicit reason before access is granted.
- Scope access to the smallest useful resource set, such as one patient or one tenant.
- Prefer short-lived sessions or a temporary `ProjectMembership` entry instead of standing broad access.
- Record who requested access, who approved it, the reason, the patient or tenant scope, and the revocation time.
- Review `AuditEvent` records after the access window closes.

For patient-specific escalation, one pattern is to add the support user or clinician's `Practitioner` profile to the patient's `generalPractitioner` list, then use an access policy scoped to that relationship:

```json
{
  "resourceType": "AccessPolicy",
  "name": "Emergency Patient Access",
  "resource": [
    {
      "resourceType": "Patient",
      "criteria": "Patient?general-practitioner=%profile"
    }
  ]
}
```

After the emergency window, remove the temporary `generalPractitioner` reference and confirm that the user can no longer read the patient record.

### Temporary tenant access

For support workflows, use a parameterized policy to grant access to one tenant for a limited operational window. Add a temporary `ProjectMembership.access` entry with the tenant reference as the parameter value, capture the reason and approval in your support system, and remove the entry when the work is complete.

```json
{
  "resourceType": "ProjectMembership",
  "access": [
    {
      "policy": { "reference": "AccessPolicy/tenant-support-readonly" },
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

### Migrating from top-level compartments

Older access policies may use the top-level `compartment` element to describe a broad compartment rule. For new policies, prefer resource-level `criteria` with parameterized values. This keeps each resource rule explicit and lets the same policy template be reused with different `ProjectMembership.access.parameter` values.

A top-level compartment can also stamp account references on new resources. Resource-level criteria only restrict access; preserve the intended assignment behavior through a controlled [$set-accounts workflow](/docs/api/fhir/operations/set-accounts) when migrating.

For example, define the tenant filter on each resource that should be visible:

```json
{
  "resourceType": "AccessPolicy",
  "name": "Organization Tenant Access",
  "resource": [
    {
      "resourceType": "Patient",
      "criteria": "Patient?_compartment=%organization"
    },
    {
      "resourceType": "Observation",
      "criteria": "Observation?_compartment=%organization"
    },
    {
      "resourceType": "DiagnosticReport",
      "criteria": "DiagnosticReport?_compartment=%organization"
    }
  ]
}
```

Then set the concrete tenant value on each membership:

```json
{
  "resourceType": "ProjectMembership",
  "access": [
    {
      "policy": { "reference": "AccessPolicy/organization-tenant-access" },
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

## Example Access Policies

### Healthcare Partnerships

A lab provider may need read access to Patients assigned to a specific client organization. This example uses an **Organization tenant** within one project:

1. Create the Organization representing the client.
2. Assign the intended Patients to it using [`$set-accounts`](/docs/api/fhir/operations/set-accounts). The operation sets `meta.accounts`; Medplum computes the corresponding compartment references.
3. Grant the lab's membership the read-only policy below, replacing `<organization-id>` with the stored Organization ID.

```json
{
  "resourceType": "AccessPolicy",
  "name": "Client Organization Patients",
  "resource": [
    {
      "resourceType": "Patient",
      "criteria": "Patient?_compartment=Organization/<organization-id>",
      "readonly": true
    }
  ]
}
```

The rule grants Patient reads. Grant access to selected clinical resource types separately if required. For reuse across clients, replace the Organization reference with a [membership policy parameter](#parameterized-policies).

Older implementations may use the singular `meta.account` field and top-level `AccessPolicy.compartment`. Use `meta.accounts`, `$set-accounts`, and resource-level criteria for the patterns in this guide; see [Migrating from top-level compartments](#migrating-from-top-level-compartments).

### Patient Access

If you are building a patient-facing application (such as [FooMedical](https://github.com/medplum/foomedical)), a common requirement is to restrict each patient's access to only their own data. In this case it is recommended to use templated access policies, that also implement compartments as shown below.

{{< warning title="Open Patient Registration" >}}

Open patient self-registration is disabled by default. You can invite patients without enabling it. See [Open Patient Registration](/docs/user-management/open-patient-registration) to configure self-registration and the required default policy.

{{< /warning >}}

For an example Patient Access Policy template, see [your project's Default Access Policy](#default-access-policies).

{{< warning title="Binary Security Context" >}}

`Binary` access follows the permissions on its `securityContext` resource. Use a Patient reference when the file should be available to readers authorized for that Patient, as in this example:

```json
{
  "resourceType": "Binary",
  "contentType": "application/pdf",
  "securityContext": {
    "reference": "Patient/homer-simpson"
  }
}
```

For a file restricted to one tenant or care team, choose a context with that same audience. A shared Patient may be too broad even when the file's clinical record has narrower permissions. See [Binary Security Context](/docs/access/binary-security-context) for details.

{{< /warning >}}

You can configure your project to support open registration for patients, therefore it is crucial that you setup a Default Access Policy similar to the one above.

### Caregiver Access

The [patient access policy](#patient-access) above can be combined with [policy parameterization](#parameterized-policies) to create an policy that allows caregivers to access data on behalf of patients (e.g parents on behalf of children.

```js
{
  "resourceType": "ProjectMembership",
  "access": [
    // Provide access to Patients and Diagnostic Reports in Organization/abc
    {
      "policy": { "reference": "AccessPolicy/patient-access-policy-template" },
      "parameter": [
        {
          "name": "patient",
          "valueReference": { "reference": "Patient/xyz" }
        }
      ]
    },
    // Provide access to Patients and Diagnostic Reports in Organization/def
    {
      "policy": { "reference": "AccessPolicy/patient-access-policy-template" },
      "parameter": [
        {
          "name": "patient",
          "valueReference": { "reference": "Patient/uvw" }
        }
      ]
    }
  ]
}
```

### WebSocket Subscriptions (`useSubscription` Hook)

To use the [`useSubscription`](/docs/react/use-subscription) hook, users need two things in their access policy:

1. **Permission to create `Subscription` resources** — The hook creates an in-memory `Subscription` on behalf of the user. Use a criteria scoped to websocket subscriptions owned by the current user so that users can only manage their own subscriptions:

   ```
   Subscription?type=websocket&author=%profile
   ```

2. **Read access to each subscribed resource type** — Users must also have `read` access for every resource type they intend to subscribe to. For example, if your app calls `useSubscription('Communication?...')`, the policy must grant at least `read` on `Communication`.

```json
{
  "resourceType": "AccessPolicy",
  "name": "WebSocket Subscription Policy",
  "resource": [
    {
      "resourceType": "Subscription",
      "criteria": "Subscription?type=websocket&author=%profile"
    },
    {
      "resourceType": "Communication"
    }
  ]
}
```

Add one entry per resource type your application subscribes to.

### Streamlined linkage and RBAC Control with AccessPolicy.basedOn

In Medplum, users can attach one or more parameterized AccessPolicy resources to their ProjectMembership. During runtime, the Medplum server consolidates these resources into a single enforceable AccessPolicy.  
The recent enhancements introduce the **AccessPolicy.basedOn element**, which enhances traceability and linkage of access policies. These improvements are made accessible to the front end via the /auth/me endpoint, enabling seamless role-based access control (RBAC) for users. For more information, see the [PR](https://github.com/medplum/medplum/pull/4925) detailing the changes.

This update allows for more granular control and visibility in RBAC implementations, where users have varying access levels based on their group or policy.

- **Endpoint: /auth/me**
  - This endpoint provides access to the user's AccessPolicy information, including the basedOn element.

- **AccessPolicy.basedOn**
  - This element is an array containing references to original AccessPolicy resources.
  - It provides traceability by linking the resolved AccessPolicy back to its source policies.
  - At runtime, Medplum resolves all nested and parameterized policies to build the basedOn array.

- **Client-Side**
  - The introduction of AccessPolicy.basedOn allows for client-side changes based on the user's group/policy.
  - This is especially useful for Role-Based Access Control (RBAC) implementations where different users may have varying access levels.

## Default Access Policies

New projects are created with a set of **default access policies**, one per profile type. These are stored on the [`Project.defaultAccessPolicies`](/docs/api/fhir/medplum/project) element, which maps a `profileType` to the `AccessPolicy` applied when a user of that type is invited without an explicit policy:

| Profile type        | Default policy grants                                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Practitioner`      | Read/write access to all resource types, **except** read-only access to a curated set of knowledge, terminology, and conformance resource types.                      |
| `Admin`             | Full read/write access to all resource types (equivalent to having no access policy).                                                                                 |
| `Patient`           | Access scoped to the patient's own compartment.                                                                                                                       |
| `RelatedPerson`     | Access scoped to the associated patient's compartment, parameterized by `patient`.                                                                                    |
| `Bot`               | Read/write access to all resource types, **except** read-only access to `AccessPolicy`, `Bot`, and `ClientApplication`, and no access to `ClientApplication` secrets. |
| `ClientApplication` | Read/write access to all resource types, **except** read-only access to `AccessPolicy`, `Bot`, and `ClientApplication`, and no access to `ClientApplication` secrets. |

When you [invite a user](/docs/app/invite) without specifying an access policy, Medplum applies the matching default for that profile type. Practitioners invited with the **admin** flag receive the `Admin` default; all other practitioners receive the `Practitioner` default. Likewise, when you [create a Bot](/docs/bots/bot-basics) or [create a ClientApplication](/docs/auth/client-credentials) without specifying an access policy, it receives the `Bot` or `ClientApplication` default. This includes the default client created with each new project.

{{< note title="Deploying Bots with a ClientApplication" >}}

Because the `ClientApplication` default makes `Bot` read-only, a client with that policy cannot save or deploy Bots, for example with `medplum bot save` or `medplum bot deploy` (`Bot/$deploy` returns `403 Forbidden`). This applies to the default client of new projects. To deploy Bots from the CLI or a CI/CD pipeline, use a ClientApplication whose access policy grants write access to `Bot`.

{{< /note >}}

### Switching a user to (or from) admin

The `admin` flag does **not** bypass a user's access policy — it only grants access to project administration resource types (such as [`ProjectMembership`](/docs/api/fhir/medplum/projectmembership) and [`User`](/docs/api/fhir/medplum/user)) on top of the existing policy. Changing the `admin` flag never changes the membership's `accessPolicy`.

When you promote a user to admin, also set their `accessPolicy` to the access they need, such as the project's `Admin` default. Otherwise they remain restricted by their current policy, for example the read-only rules of the `Practitioner` default. Likewise, when you demote an admin, replace the `Admin` default with a non-admin policy such as the `Practitioner` default.

## Related Resources

- [Registration React Component](https://storybook.medplum.com/?path=/docs/medplum-registerform--basic)
