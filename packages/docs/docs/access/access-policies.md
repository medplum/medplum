---
sidebar_position: 1
tags: [auth]
---

# Access Policies

## Introduction

This document describes the core concepts of Medplum Access Controls. Security and access controls are notoriously difficult. Complex business and regulatory requirements often lead to a mess of incomprehensible rules. Medplum strives to create a simple and understandable model, which is flexible enough to handle all unique security needs.

## Core Model

All resources exist within a "Project". A project is a top-level container. In general, each healthcare organization will have one project for all of their resources.

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

:::warning Limitations
While Medplum `AccessPolicies` use the [FHIR search syntax](/docs/search), it does not implement the full search specification. Specifically, the `criteria` syntax has the following limitations:

- Only `:not` and `:missing` [modifiers](/docs/search/basic-search#search-modifiers) are allowed.
- [Chained searches](/docs/search/chained-search#forward-chained-search) are **not** allowed.

:::

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

:::tip Related interactions

Some FHIR interactions are used in concert by the server, and so should be considered together:

- [Upserts](/docs/fhir-datastore/working-with-fhir#upsert) require `search` to identify existing resources, in addition to both `create` and `update`
- `search` access may be required as part of a `create` or `update` if the resource contains any [Conditional references](/docs/migration/convert-to-fhir#linking-data-using-conditional-references), in order to resolve references to individual resources
- `read` access to referenced resource types is required in `create` and `update` interactions, if [`Project.checkReferencesOnWrite`](/docs/api/fhir/medplum/project) is set
- `history` and `vread` are often specified together, to grant access to the entire [version history](/docs/fhir-datastore/resource-history) of resources

:::

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

:::tip

In case of a resource being created, `%before` will be undefined, so any expressions that refer to `%before` must account for this case. To select only updates or only creates, prefix the criteria with `%before.exists() implies` or `%before.exists().not() implies` respectively.

:::

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

All resources can be tagged with one or more "Compartments". A compartment is simply a group of resources. Importantly, compartments are not mutually exclusive. A resource can (and often will) exist in multiple compartments.

For example, consider an "Observation" resource representing a blood pressure measurement. That Observation resource will fall into the following Compartments:

- "Patient" - for the "subject" of the observation
- "Practitioner" - for the "performer" of the observation
- "Encounter" - for the "encounter" of the observation

Resources are automatically assigned to compartments based on rules. Currently, the Medplum server automatically assigns resources to the "Patient" compartment. You can find the full definition of the patient compartment [here](https://hl7.org/fhir/R4/compartmentdefinition-patient.html).

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

## Example Access Policies

### Healthcare Partnerships

A common need is to grant access to a subset of resources for a healthcare partnership. For example, a lab provider may want to grant access to all patient records that _originated from a specific client organization_.

This can be achieved using Access Policy compartments.

Assume that we have an Organization resource representing the customer:

```json
{
  "resourceType": "Organization",
  "name": "Example Customer Organization",
  "id": "abc-123"
}
```

This access policy grants read-only access to all Patients that are within that customer's "account" compartment:

```js
{
  "resourceType": "AccessPolicy",
  "name": "Patient Example",
  // Any resource created or updated will be tagged with `meta.account` set to `Organization/abc-123`
  "compartment": {
    "reference": "Organization/abc-123",
    "display": "Example Customer Organization"
  },
  "resource": [
  // Any read or search operation will filter on `meta.account` equals `Organization/abc-123`
    {
      "resourceType": "Patient",
      "criteria": "Patient?_compartment=Organization/abc-123"
      "readonly": true
    }
  ]
}
```

The `meta.account` property is not FHIR standard. It is an extra `Reference` property in the `Meta` section.

For example, here's how the Patient resource would look:

```json
{
  "resourceType": "Patient",
  "id": "54aa8595-e3a7-48ae-af91-9c7cb940149b",
  "meta": {
    "versionId": "02900c57-4da8-498f-85d5-5077077e3e2c",
    "lastUpdated": "2022-01-13T16:21:11.870Z",
    "account": {
      "reference": "Organization/abc-123",
      "display": "Example Customer Organization"
    }
  },
  "name": [
    {
      "given": ["Homer"],
      "family": "Simpson"
    }
  ]
}
```

Because the account-tagging is handled within the resource, project administrators and API users can set the account directly.

### Patient Access

If you are building a patient-facing application (such as [FooMedical](https://github.com/medplum/foomedical)), a common requirement is to restrict each patient's access to only their own data. In this case it is recommended to use templated access policies, that also implement compartments as shown below.

:::caution Open Patient Registration

Patient Access is disabled by default. See our article on [enabling open patient registration](/docs/auth/open-patient-registration) for instructions on enabling this functionality.

:::

:::danger Binary Access

Binary resources cannot use compartment-based access controls. They require explicit `securityContext` declaration. See the [Binary Security Context](/docs/access/binary-security-context) documentation for more information.

:::

```json
{
  "resourceType": "AccessPolicy",
  "name": "Patient Access Policy Template",
  "id": "patient-access-policy-template",
  "compartment": {
    "reference": "%patient"
  },
  "resource": [
    {
      "resourceType": "Patient",
      "criteria": "Patient?_compartment=%patient"
    },
    {
      "resourceType": "Observation",
      "criteria": "Observation?_compartment=%patient"
    },
    {
      "resourceType": "DiagnosticReport",
      "criteria": "DiagnosticReport?_compartment=%patient"
    },
    {
      "resourceType": "MedicationRequest",
      "criteria": "MedicationRequest?_compartment=%patient"
    },
    {
      "resourceType": "Coverage",
      "criteria": "Coverage?_compartment=%patient"
    },
    {
      "resourceType": "PaymentNotice",
      "criteria": "PaymentNotice?_compartment=%patient"
    },
    {
      "resourceType": "CarePlan",
      "criteria": "CarePlan?_compartment=%patient"
    },
    {
      "resourceType": "Immunization",
      "criteria": "Immunization?_compartment=%patient"
    },
    {
      "resourceType": "Communication",
      "criteria": "Communication?_compartment=%patient"
    },
    {
      "resourceType": "Organization",
      "readonly": true
    },
    {
      "resourceType": "Practitioner",
      "readonly": true
    },
    {
      "resourceType": "Schedule",
      "readonly": true
    },
    {
      "resourceType": "Slot",
      "readonly": true
    },
    {
      "resourceType": "Binary"
    }
  ]
}
```

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

## Related Resources

- [Registration React Component](https://storybook.medplum.com/?path=/docs/medplum-registerform--basic)
