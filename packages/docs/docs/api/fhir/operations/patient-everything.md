---
sidebar_position: 5
---

# Patient $everything Operation

Medplum implements the FHIR [`$everything` operation](https://hl7.org/fhir/R4/operation-patient-everything.html)

FHIR has the option to query everything associated to an individual patient. This is useful when transmitting batch data or getting the full patient history.

## Invoke the `$everything` operation

```
[base]/R4/Patient/<id>/$everything
```

### Output

The output of the request is a [FHIR bundle](/docs/api/fhir/resources/bundle) with all resources belonging to the patient for whom the request is made. The FHIR Bundle created from this operation is the supported machine readable Electronic Health Information Export (EHI) format for Medplum.

## Related Documentation

- Refer to [readPatientEverything](/docs/sdk/core.medplumclient.readpatienteverything) in the TypeScript SDK
- FHIR Bundles created are required as part of [ONC Certification](/docs/compliance/onc)
