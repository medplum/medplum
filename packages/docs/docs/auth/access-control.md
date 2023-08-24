---
sidebar_position: 4
tags: [auth]
---

# Access Controls

## Introduction

This document describes the core concepts of Medplum Access Controls. Security and access controls are notoriously difficult. Complex business and regulatory requirements often lead to a mess of incomprehensible rules. Medplum strives to create a simple and understandable model, which is flexible enough to handle all unique security needs.

## Core Model

Medplum is built on FHIR, an international standard for healthcare interoperability. FHIR includes standard definitions for almost every imaginable healthcare concept.

One of the central concepts of FHIR is the "Resource". Everything is a resource: patients, practitioners, observations, medications, and many more. Every resource has a "Resource Type". There are more than 100 standard resource types.

All resources exist within a "Project". A project is a top-level container. In general, each healthcare organization will have one project for all of their resources. If you are self-hosting Medplum, then you probably only need one project. Importantly, projects are mutually exclusive. For example, a "Patient" resource can only be in one "Project". If you need to represent the same patient in multiple projects, you need to create a copy.

All resources can be tagged with one or more "Compartments". A compartment is simply a group of resources. Importantly, compartments are not mutually exclusive. A resource can (and often will) exist in multiple compartments.

For example, consider an "Observation" resource representing a blood pressure measurement. That Observation resource will fall into the following Compartments:

- "Patient" - for the "subject" of the observation
- "Practitioner" - for the "performer" of the observation
- "Encounter" - for the "encounter" of the observation

Resources are automatically assigned to compartments based on rules. The FHIR standard includes definitions for standard compartments such as "Patient", "Practitioner", and "Encounter". Developers can create custom compartments using the "CompartmentDefinition" resource.

Now that we have defined "Resource", "Resource Type", "Project", and "Compartment", we can discuss how they relate to security and access controls.

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

The following access policy grants read/write access to the "Patient" resource type:

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

### Read-only Resource Type

The following access policy grants read-only access to the "Patient" resource type:

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

Attempting to modify a read-only resource will result in an HTTP result of [`403: Forbidden`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/403).

### Hidden fields

The following access policy grants read-only access to the "Patient" resource type, but hides "name" and "address":

```json
{
  "resourceType": "AccessPolicy",
  "name": "Patient Example",
  "resource": [
    {
      "resourceType": "Patient",
      "readonly": true,
      "hiddenFields": ["name", "address"]
    }
  ]
}
```

### Criteria-based Access Control

The following policy uses a FHIR Search Query to grant access only to Coverage whose `payor` is `Organization/123`:

```json
{
  "resourceType": "AccessPolicy",
  "name": "Criteria Based Access Policy",
  "resource": [
    {
      "resourceType": "Coverage",
      "criteria": "Coverage?payor=Organization/123"
    }
  ]
}
```

Note that in this implementation access policy, only the `Coverage` resources that have `payor=Organization/123` will be visible.

Criteria for writes to a resource can also be specified using [FHIRPath expressions][fhirpath] in the `AccessPolicy.resource.writeCriteria` field. These expressions may contain the special variable `%before` to refer to the resource as it existed before the write. Any property accesses will by default refer to the resource as it exists with updates applied, but the `%after` variable is also provided for convenience.

:::tip

On resource creation, `%before` will be undefined, so any expressions that refer to `%before` must account for this case. To select only updates or only creates, prefix the criteria with `%before.exists() implies` or `%before.exists().not() implies` respectively.

:::

For example, an access policy with write criteria could be used to manage state transitions by prohibiting changing the status once a resource is marked as `final`, and ensure that a `subject` is set when the resource is finalized:

```json
{
  "resourceType": "AccessPolicy",
  "name": "Write Criteria Access Policy",
  "resource": [
    {
      "resourceType": "Observation",
      "writeCriteria": [
        "%before.exists() implies %before.status != 'final'",
        "status = 'final' implies subject.exists()"
      ]
    }
  ]
}
```

[fhirpath]: https://hl7.org/fhirpath/#expressions

### Parameterized Policies (Beta)

:::caution

This feature is still in Beta. If you have questions about your specific AccessPolicy needs, please [reach out to the Medplum team.](https://discord.gg/medplum)

:::

For more advanced access control configurations, You can use `%` variables to parameterize the access policy.

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

This policy acts like a template, that can be instantiated (potentially multiple times) on a user's [ProjectMembership](/docs/api/fhir/medplum/projectmembership) resource.

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

In this example, the user with the parameterized policy shown above will only have access to Patient and DiagnosticReport resources, filtered by the relevant organizations. See this [video demo](https://www.youtube.com/watch?v=IDhsWiIxK3o) for an illustration.

See [this Github Discussion](https://github.com/medplum/medplum/discussions/1453) for more examples of access scenarios that can be created using these policies.

### Healthcare Partnerships

A common need is to grant access to a subset of resources for a healthcare partnership. For example, a lab provider may want to grant access to all patient records that originated from a specific lab customer.

This can be achieved using Access Policy compartments.

Assume that we have an Organization resource representing the customer:

```json
{
  "resourceType": "Organization",
  "name": "Example Customer Organization",
  "id": "a23a2966-d58a-4098-b41b-e8f18bcda339"
}
```

This access policy grants read-only access to all Patients that are within that customer's "account" compartment:

```json
{
  "resourceType": "AccessPolicy",
  "name": "Patient Example",
  "compartment": {
    "reference": "Organization/a23a2966-d58a-4098-b41b-e8f18bcda339",
    "display": "Example Customer Organization"
  },
  "resource": [
    {
      "resourceType": "Patient",
      "readonly": true,
      "compartment": {
        "reference": "Organization/a23a2966-d58a-4098-b41b-e8f18bcda339",
        "display": "Example Customer Organization"
      }
    }
  ]
}
```

When a [user](/docs/auth/user-management-guide#background-user-model) or [client application](/docs/auth/client-credentials#obtaining-credentials) has such an Access Policy like the one above that specifies an `Organization` in the compartment, the following happens:

- Any resource created or updated will be tagged with `meta.account` set to `Organization/a23a2966-d58a-4098-b41b-e8f18bcda339`
- Any read or search operation will filter on `meta.account` equals `Organization/a23a2966-d58a-4098-b41b-e8f18bcda339`

The `meta.account` property is not FHIR standard. It is an extra `Reference` property in the `Meta` section.

For example:

```json
{
  "resourceType": "Patient",
  "id": "54aa8595-e3a7-48ae-af91-9c7cb940149b",
  "meta": {
    "versionId": "02900c57-4da8-498f-85d5-5077077e3e2c",
    "lastUpdated": "2022-01-13T16:21:11.870Z",
    "account": {
      "reference": "Organization/a23a2966-d58a-4098-b41b-e8f18bcda339",
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

:::caution Note

Patient Access is disabled by default. Contact your info@medplum.com if you'd like to enable patient registration and default patient access policy.

:::

```json
{
  "resourceType": "AccessPolicy",
  "name": "Patient Access Policy Template",
  "compartment": {
    "reference": "%patient"
  },
  "resource": [
    {
      "resourceType": "Patient",
      "compartment": {
        "reference": "%patient"
      }
    },
    {
      "resourceType": "Observation",
      "compartment": {
        "reference": "%patient"
      }
    },
    {
      "resourceType": "DiagnosticReport",
      "compartment": {
        "reference": "%patient"
      }
    },
    {
      "resourceType": "MedicationRequest",
      "compartment": {
        "reference": "%patient"
      }
    },
    {
      "resourceType": "Coverage",
      "compartment": {
        "reference": "%patient"
      }
    },
    {
      "resourceType": "PaymentNotice",
      "compartment": {
        "reference": "%patient"
      }
    },
    {
      "resourceType": "CarePlan",
      "compartment": {
        "reference": "%patient"
      }
    },
    {
      "resourceType": "Immunization",
      "compartment": {
        "reference": "%patient"
      }
    },
    {
      "resourceType": "Communication",
      "compartment": {
        "reference": "%patient"
      }
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

## Related Resources

- [Registration React Component](https://storybook.medplum.com/?path=/docs/medplum-registerform--basic)
