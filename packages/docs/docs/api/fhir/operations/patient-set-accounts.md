---
sidebar_position: 5.1
---

# Patient $set-accounts Operation

Medplum implements a custom `$set-accounts` operation for Patient resources to manage account references. __This is the recommended way to manage account references for patients__.

This operation sets the Patient's _meta.accounts_ references and propogates them to the resources in that patient's compartment. This is useful when you need to ensure consistent _meta.accounts_ access across all resources related to a patient.

:::warning

This operation will only update the first 1,000 resources in the patient's compartment.

:::

For example, when this operation is used to add a new organization to a patient's _meta.accounts_, it will update both the patient and all resources in the patient's compartment to include that organization in each of their _meta.accounts_ list. Then, by updating the references in _meta.accounts_, each resource's _meta.compartment_ will also be refreshed to include the references in _meta.accounts_.

:::note

Resources in a patient's compartment are defined by the [FHIR Patient CompartmentDefinition](https://hl7.org/fhir/R4/compartmentdefinition-patient.html). This includes resources where the patient is the _subject_, as well as resources that are directly linked to the patient through specific references (_performer_, _author_, _participant_, etc.).

:::

## Invoke the `$set-accounts` operation

```
POST [base]/R4/Patient/<id>/$set-accounts
```

### Input
The input is a [FHIR Parameters](/docs/api/fhir/resources/parameters) resource containing:
- `accounts` a reference to set in each resource's _meta.accounts_

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