---
id: set-accounts
title: Resource $set-accounts
weight: 61
---

Medplum implements a custom `$set-accounts` operation to manage `meta.accounts` references for compartment-based access. The server includes these references in the resource's computed `meta.compartment`.

Within one project, an account reference can identify a tenant or finer access group, such as an `Organization`, `HealthcareService`, or `CareTeam`. It does not have to reference the FHIR `Account` resource. Choose the representation in [Modeling your tenants](/docs/access/multi-tenant-access-policy#step-1-modeling-your-tenants). Multiple assignments form a set; they do not create nested compartments. See [Layering tenant and care-team access](/docs/access/multi-tenant-access-policy#layering-tenant-and-care-team-access) when both scopes must apply.

## Use Cases

- **Multi-Tenant Data Segmentation**: Assign resources to application tenants represented by organizations or services
- **Care-Team Access**: Assign finer access groups within a tenant or a single care operation
- **Tenant Access Control**: Set account references that parameterized access policies can match
- **Patient Compartment Management**: Propagate account assignments to all resources in a patient's compartment for consistent access
- **Batch Account Assignment**: Update account references across large sets of resources during migrations or onboarding

For a Patient target, optional propagation applies account additions and removals to existing resources in its patient compartment. Use this when the Patient and those resources have the same intended tenant audience. Resource assignment and permission grants must both be configured.

## Required access

Calling `$set-accounts` requires project-admin or super-admin authority, and access checks apply to the target resource. Generic read/write access alone does not grant permission to run this operation. This requirement also applies to the membership used by a Bot or ClientApplication.

Propagation applies only to compartment resources in the target project that the caller can read and update. It skips inaccessible or read-only resources and resources in linked projects. Verify the resulting assignments before treating a transfer as complete; successful completion can leave some resources unchanged.

{{< warning >}}

It is recommended that you run this operation with `Prefer: respond-async` header to avoid any timeouts while waiting for resources in patient compartment to update.

{{< /warning >}}

For example, when this operation is used to add a new organization to a patient's `meta.accounts`, it can update both the patient and all resources in the patient's compartment to include a new organization in their `meta.accounts` lists. Additionally, each resource's _meta.compartment_ will also be updated to include the references in _meta.accounts_.

{{< note >}}

Resources in a patient's compartment are defined by the [FHIR Patient CompartmentDefinition](https://hl7.org/fhir/R4/compartmentdefinition-patient.html). This includes resources where the patient is the `subject`, as well as resources that are directly linked to the patient through specific references (`performer`, `author`, `participant`, etc.).

{{< /note >}}

## Patient sharing and clinical isolation

Choose [shared or tenant-specific Patient records](/docs/tenancy-design/patient-records) before applying patient-wide assignments. Propagating two tenant references to one Patient's compartment can make the clinical records match both tenant policies.

`propagate: false` skips updates to existing compartment resources. It does not disable account inheritance on later resource writes. A shared Patient with separate clinical records needs [resource-specific access rules and write handling](/docs/tenancy-design/patient-records#clinical-record-isolation).

## Assign accounts during a resource write

A trusted backend with project-admin or super-admin authority can include `meta.accounts` in a resource create or update request with the `X-Medplum: extended` header. The supplied accounts override Patient-account inheritance for that write, so the resource can have its intended assignment from creation. Medplum still computes its Patient and Project compartment references.

Include the complete intended account list on every such write. If `meta` is present but both `meta.accounts` and legacy `meta.account` are absent, the write clears explicit account assignments. Extended responses include legacy `meta.account`; remove or update it when replacing `meta.accounts`, because the server combines both fields.

Direct writes affect only the target resource. Use `$set-accounts` when you need to propagate a Patient's account changes to existing patient-compartment resources.

## Invoke the `$set-accounts` operation

```
POST [base]/R4/<ResourceType>/<id>/$set-accounts
```

### Input

The input is a [FHIR Parameters](/docs/api/fhir/resources/parameters) resource containing:

- `accounts`: repeat this parameter for every intended account reference. The list replaces the target resource’s account list; include existing accounts that should remain.
- `propagate`: an optional boolean that applies the Patient account additions and removals to existing resources in its patient compartment.

Example request payload:

```http
POST /fhir/R4/Patient/f1dc4eed-0b7f-4c23-9059-d4b672cb9177/$set-accounts
```

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "accounts",
      "valueReference": {
        "reference": "Organization/<organization-id>"
      }
    },
    {
      "name": "accounts",
      "valueReference": {
        "reference": "Practitioner/<practitioner-id>"
      }
    },
    {
      "name": "propagate",
      "valueBoolean": true
    }
  ]
}
```

### Output

The output is a [FHIR Parameters](/docs/api/fhir/resources/parameters) resource containing:

- `resourcesUpdated` The number of resources that were updated

Example response if patient has 3 resources in their compartment:

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "resourcesUpdated",
      "valueInteger": 3
    }
  ]
}
```
