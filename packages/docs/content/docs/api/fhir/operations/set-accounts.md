---
id: set-accounts
title: Resource $set-accounts
weight: 61
---

Medplum implements a custom `$set-accounts` operation to manage `meta.accounts` references for tenant and care-team access. The server includes these references in the resource's computed `meta.compartment`.

Within one project, an account reference can identify a tenant or finer access group, such as an `Organization`, `HealthcareService`, or `CareTeam`. Choose the representation in [Modeling your tenants](/docs/access/multi-tenant-access-policy#step-1-modeling-your-tenants). Multiple account references in `meta.compartment` form a set, with no automatic parent-child containment. See [Layering tenant and care-team access](/docs/access/multi-tenant-access-policy#layering-tenant-and-care-team-access) when both scopes must apply.

{{< note >}}

The **Patient's FHIR compartment** is the collection of related resources, such as Observations, Tasks, and DiagnosticReports, identified by the [FHIR Patient CompartmentDefinition](https://hl7.org/fhir/R4/compartmentdefinition-patient.html). For example, an Observation belongs to this collection when its `subject` references the Patient.

The **Patient's `meta.compartment` field** is server-computed metadata describing the Patient resource's membership in Patient, Project, and account-based groups, including tenant assignments. It contains references such as `Organization/clinic-a`, rather than a list of the Patient's clinical records. `$set-accounts` updates `meta.accounts`, and Medplum computes `meta.compartment`. See [Understanding Compartments](/docs/access/multi-tenant-access-policy#understanding-compartments) for the full distinction.

{{< /note >}}

## Use Cases

- **Multi-Tenant Data Segmentation**: Assign resources to application tenants represented by organizations or services
- **Care-Team Access**: Assign finer access groups within a tenant or a single care operation
- **Tenant Access Control**: Set account references that parameterized access policies can match
- **Patient Compartment Management**: Propagate account assignments to resources in the Patient's FHIR compartment, such as Observations and Tasks
- **Batch Account Assignment**: Update account references across large sets of resources during migrations or onboarding

This operation sets the target resource's `meta.accounts` references. For a Patient, it can also propagate account changes to existing resources in the Patient's FHIR compartment, such as Observations and Tasks. This keeps account assignments consistent across the Patient and its related records.

## Required access

Calling `$set-accounts` requires explicit permission to run the operation. Generic read, create, update, or delete access to the target resource type does not automatically grant access to `$set-accounts`.

If a `User`, `Bot`, or `ClientApplication` receives `403 Forbidden` when calling `$set-accounts`, confirm that the principal's access configuration grants the operation in addition to the resource interactions needed for the target resources.

{{< warning >}}

Use the `Prefer: respond-async` header when propagating account changes to avoid timeouts while related resources, such as Observations and Tasks, are updated.

{{< /warning >}}

For example, adding an Organization to a Patient's `meta.accounts` with propagation can add that Organization to the `meta.accounts` of related Observations and Tasks. Medplum also includes the Organization in each updated resource's `meta.compartment` field.

## Patient sharing and clinical isolation

Choose [shared or tenant-specific Patient records](/docs/tenancy-design/patient-records) before applying patient-wide assignments. Propagating two tenant references to resources in one Patient's FHIR compartment, such as Observations and Tasks, can make the clinical records match both tenant policies.

`propagate: false` skips updates to existing resources in the Patient's FHIR compartment, such as Observations and Tasks. It does not disable account inheritance on later resource writes. A shared Patient with separate clinical records needs [resource-specific access rules and write handling](/docs/tenancy-design/patient-records#clinical-record-isolation).

## Invoke the `$set-accounts` operation

```
POST [base]/R4/<ResourceType>/<id>/$set-accounts
```

### Input

The input is a [FHIR Parameters](/docs/api/fhir/resources/parameters) resource containing:

- `accounts`: repeat this parameter for every intended account reference. The list replaces the target resource’s account list; include existing accounts that should remain.
- `propagate`: an optional boolean that applies the Patient account additions and removals to existing resources in its FHIR compartment, such as Observations and Tasks.

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

Example response when 3 resources were updated:

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

## Assign accounts during a resource write

A trusted backend with project-admin or super-admin authority can include `meta.accounts` in a resource create or update request with the `X-Medplum: extended` header. The supplied accounts override Patient-account inheritance for that write, so the resource can have its intended assignment from creation. Medplum still includes its applicable Patient and Project references in `meta.compartment`.

Include the complete intended account list on every such write. If `meta` is present but both `meta.accounts` and legacy `meta.account` are absent, the write clears explicit account assignments. Extended responses include legacy `meta.account`; remove or update it when replacing `meta.accounts`, because the server combines both fields.

Direct writes affect only the target resource. Use `$set-accounts` when you need to propagate a Patient's account changes to existing resources in its FHIR compartment, such as Observations and Tasks.
