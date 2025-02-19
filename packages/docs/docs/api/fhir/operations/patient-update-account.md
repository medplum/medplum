---
sidebar_position: 5.1
---

# Patient $update-account Operation

Medplum implements a custom `$update-account` operation for Patient resources to manage account associations.

This operation updates the account references for all resources in the patient compartment to match the patient's accounts. This is useful when you need to ensure consistent account access across all resources related to a patient.

For example, after a patient has a new organization added to its _meta.accounts_ list, this operation will update all resources in the patient's compartment to include that organization in their _meta.accounts_ list. By updating the account references, the resources _meta.compartment_ will be refreshed to include the new account references.

:::note

Resources in a patient's compartment are defined by the [FHIR Patient CompartmentDefinition](https://hl7.org/fhir/R4/compartmentdefinition-patient.html). This includes resources where the patient is the _subject_, as well as resources that are directly linked to the patient through specific references ( _performer_, _author_, _participant_, etc.).

:::

## Invoke the `$update-account` operation

```
POST [base]/R4/Patient/<id>/$update-account
```

### Output

The output is a [FHIR Parameters](/docs/api/fhir/resources/parameters) resource containing:
- `resourcesUpdated`: The number of resources that were updated

Example response:
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

## Behavior

The operation:
1. Retrieves all resources in the patient's compartment
2. Updates each resource's `meta.accounts` to match the patient's accounts
3. Returns the total count of resources updated


This ensures that all resources related to the patient have consistent account access settings. 

:::note

The operation does not modify the patient's own `meta.accounts`.

:::
