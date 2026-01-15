---
sidebar_position: 5
---

# Patient $everything

Medplum implements the FHIR [`$everything` operation](https://hl7.org/fhir/R4/operation-patient-everything.html)

FHIR has the option to query everything associated to an individual patient. This is useful when transmitting batch data or getting the full patient history.

## Invoke the `$everything` operation

```
[base]/R4/Patient/<id>/$everything
```

### Parameters

| Name      | Type         | Description                                                              | Required |
| --------- | ------------ | ------------------------------------------------------------------------ | -------- |
| `start`   | `date`       | Start date for filtering resources by care date                          | No       |
| `end`     | `date`       | End date for filtering resources by care date                            | No       |
| `_since`  | `instant`    | Only include resources updated since this time                           | No       |
| `_count`  | `integer`    | Maximum number of results to return (default: 1000)                      | No       |
| `_offset` | `integer`    | Offset for pagination                                                    | No       |
| `_type`   | `string[]`   | Restrict output to specific resource types (comma-separated)             | No       |

### Output

The output of the request is a [FHIR bundle](/docs/api/fhir/resources/bundle) with all resources belonging to the patient for whom the request is made. The FHIR Bundle created from this operation is the supported machine readable Electronic Health Information Export (EHI) format for Medplum.

#### Resources Included

Medplum's patient `$everything` operation includes:

1. **Patient Compartment Resources** - All resources defined in the [FHIR R4 Patient Compartment](https://hl7.org/fhir/R4/compartmentdefinition-patient.html)

2. **Referenced Resources** - Additional resources referenced by patient compartment resources but outside the compartment itself:
   - Organizations
   - Practitioners  
   - PractitionerRoles
   - Locations
   - Medications
   - Devices

## Related Documentation

- Refer to [readPatientEverything](/docs/sdk/core.medplumclient.readpatienteverything) in the TypeScript SDK
- FHIR Bundles created are required as part of [ONC Certification](/docs/compliance/onc)
