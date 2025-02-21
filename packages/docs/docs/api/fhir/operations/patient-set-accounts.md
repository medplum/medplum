---
sidebar_position: 5.1
---

# Patient $set-accounts Operation

Medplum implements a custom `$set-accounts` operation for Patient resources to manage account references. __This is the recommended way to manage account references for patients__.

This operation sets the Patient's _meta.accounts_ references and propogates them to the resources in that patient's compartment. This is useful when you need to ensure consistent accounts access across all resources related to a patient.

:::warning

This operation will only update the first 1,000 resources in the patient's compartment.

:::

For example, after a patient has a new organization added to its _meta.accounts_ list, this operation will update all resources in the patient's compartment to include that organization in their _meta.accounts_ list. By updating the account references, each resource's _meta.compartment_ will be refreshed to include the new _meta.accounts_ references.

:::note

Resources in a patient's compartment are defined by the [FHIR Patient CompartmentDefinition](https://hl7.org/fhir/R4/compartmentdefinition-patient.html). This includes resources where the patient is the _subject_, as well as resources that are directly linked to the patient through specific references (_performer_, _author_, _participant_, etc.).

The operation will update the patient's own `meta.accounts` and propagate those changes to related resources.

:::

## Invoke the `$set-accounts` operation

```
POST [base]/R4/Patient/<id>/$set-accounts
```

### Input
The input is a [FHIR Parameters](/docs/api/fhir/resources/parameters) resource containing:
- `accounts` a reference to set as the patient's accounts

Example request payload:
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