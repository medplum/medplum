---
sidebar_position: 5
---

# Patient $everything

The `$everything` operation retrieves a complete bundle of all resources associated with a patient in a single API call. This provides a comprehensive view of a patient's clinical record-including encounters, observations, medications, conditions, and related resources-without requiring multiple queries.

This operation is essential for scenarios requiring complete patient data, such as care transitions, patient record requests, and regulatory compliance with data portability requirements.

## Use Cases

- **Patient Record Requests**: Fulfill patient requests for their complete medical record (21st Century Cures Act compliance)
- **Care Transitions**: Grabbing a patient's full history when transferring care to another provider
- **Analytics and Research**: Extract comprehensive patient data for population health analysis or research studies

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

## Related

- [MedplumClient.readPatientEverything](/docs/sdk/core.medplumclient.readpatienteverything) - TypeScript SDK method
- [Patient $ccda-export](/docs/api/fhir/operations/ccda-export) - Export patient data as C-CDA document
- [ONC Certification](/docs/compliance/onc) - Compliance requirements for patient data export
- [FHIR Patient Compartment](https://hl7.org/fhir/R4/compartmentdefinition-patient.html) - FHIR specification for patient-related resources
- [FHIR $everything Operation](https://hl7.org/fhir/R4/patient-operation-everything.html) - FHIR specification for $everything
