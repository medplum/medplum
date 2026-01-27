---
sidebar_position: 10
---

# Patient $ccda-export

The `$ccda-export` operation generates a Consolidated Clinical Document Architecture (C-CDA) document for a patient. C-CDA is the industry-standard XML format for exchanging clinical summaries between healthcare systems, making this operation essential for interoperability and regulatory compliance.

This operation produces a complete or time-windowed patient history in a format that can be consumed by EHRs, health information exchanges (HIEs), and patient portals-enabling seamless care coordination across organizational boundaries.

## Use Cases

- **Health Information Exchange**: Share patient records with other healthcare organizations via HIEs
- **Care Transitions**: Generate discharge summaries or transfer documents when patients move between care settings
- **Patient Portal Downloads**: Allow patients to download their medical records in a standard format
- **ONC Certification Compliance**: Meet certification requirements for patient data export capabilities
- **Referral Documentation**: Provide comprehensive clinical summaries when referring patients to specialists

## Invoke the `$ccda-export` operation

To specify which patient you want to export a C-CDA for, construct the URL as follows:


```bash
curl 'https://api.medplum.com/fhir/R4/Patient/<PATIENT_ID>/$ccda-export' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

## Related

- [C-CDA Integration Guide](/docs/integration/c-cda) - Detailed guide on working with C-CDA documents
- [Patient $everything](/docs/api/fhir/operations/patient-everything) - Export all patient data in FHIR format
- [ONC Certification](/docs/compliance/onc) - Compliance requirements for patient data export
- [FHIR Patient Resource](https://hl7.org/fhir/R4/patient.html) - FHIR specification for Patient
- [HL7 C-CDA Specification](https://www.hl7.org/implement/standards/product_brief.cfm?product_id=492) - Official C-CDA implementation guide
