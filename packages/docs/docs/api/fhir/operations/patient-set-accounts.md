---
sidebar_position: 5.1
---

# Set Resource Accounts

Medplum implements a custom `$set-accounts` operation to manage account references. **This is the recommended way to manage account references for all resources**.

This operation sets the target resource's `meta.accounts` references and optionally propagates changes to resources in that resources's compartment. This is useful when you need to ensure consistent `meta.accounts` access across all resources related to a patient, for example.

:::warning

It is recommended that you run this operation with `Prefer: respond-async` header to avoid any timeouts while waiting for resources in patient compartment to update.

:::

For example, when this operation is used to add a new organization to a patient's `meta.accounts`, it can update both the patient and all resources in the patient's compartment to include a new organization in their `meta.accounts` lists. Additionally, each resource's _meta.compartment_ will also be updated to include the references in _meta.accounts_.

:::note

Resources in a patient's compartment are defined by the [FHIR Patient CompartmentDefinition](https://hl7.org/fhir/R4/compartmentdefinition-patient.html). This includes resources where the patient is the `subject`, as well as resources that are directly linked to the patient through specific references (`performer`, `author`, `participant`, etc.).

:::

## Invoke the `$set-accounts` operation

```
POST [base]/R4/<ResourceType>/<id>/$set-accounts
```

### Input

The input is a [FHIR Parameters](/docs/api/fhir/resources/parameters) resource containing:

- `accounts` a reference to set in each resource's _meta.accounts_
- `propagate` an optional boolean, which instructs the operation to also update resources in the target compartment

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
