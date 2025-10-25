---
sidebar_position: 10
---

# C-CDA Export

Medplum supports the C-CDA Export, which produces an XML C-CDA document with the complete or time windowed patient history.

## Patient Export

To specify which patient you want to export a C-CDA for, construct the URL as follows:


```bash
curl 'https://api.medplum.com/fhir/R4/Patient/<PATIENT_ID>/$ccda-export' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

## Related Reading

- [ONC Certification](/docs/compliance/onc) compliance docs
- [C-CDA Docs](/docs/integration/c-cda)