---
sidebar_position: 10
---

# Patient $ccda-export

The `$ccda-export` operation generates a Consolidated Clinical Document Architecture (C-CDA) document for a patient. C-CDA is the industry-standard XML format for exchanging clinical summaries between healthcare systems, making this operation essential for interoperability and regulatory compliance.

This operation produces a complete or time-windowed patient history in a format that can be consumed by EHRs, health information exchanges (HIEs), and patient portals-enabling seamless care coordination across organizational boundaries.

Internally, `$ccda-export` builds an IPS-style patient summary ([`$summary`](./patient-summary)), then converts that FHIR Composition bundle to C-CDA XML via `@medplum/ccda`.

## Use Cases

- **Health Information Exchange**: Share patient records with other healthcare organizations via HIEs
- **Care Transitions**: Generate discharge summaries or transfer documents when patients move between care settings
- **Patient Portal Downloads**: Allow patients to download their medical records in a standard format
- **ONC Certification Compliance**: Meet certification requirements for patient data export capabilities
- **Referral Documentation**: Provide comprehensive clinical summaries when referring patients to specialists

## Invocation

```
GET [base]/Patient/[id]/$ccda-export
POST [base]/Patient/[id]/$ccda-export
```

```bash
curl 'https://api.medplum.com/fhir/R4/Patient/<PATIENT_ID>/$ccda-export' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

## Input Parameters

`$ccda-export` accepts the same clinical filtering and authorship parameters as [`$summary`](./patient-summary), plus a C-CDA-specific `type` parameter that selects the document-level template.

| Parameter | Cardinality | Type | Description |
|-----------|-------------|------|-------------|
| `type` | 0..1 | `code` | C-CDA document type. Use `referral` to generate a Referral Note. When omitted (or any other value), Medplum generates a Continuity of Care Document (CCD) / Summarization of Episode Note. |
| `author` | 0..1 | `Reference` | Reference to Practitioner, PractitionerRole, or Organization to list as the composition author. Defaults to the current user. |
| `authoredOn` | 0..1 | `instant` | The date/time the summary was authored. Defaults to current time. |
| `start` | 0..1 | `date` | Start date for filtering resources by care date. If omitted, all records prior to `end` are in scope. |
| `end` | 0..1 | `date` | End date for filtering resources by care date. If omitted, all records after `start` are in scope. |
| `_since` | 0..1 | `instant` | Only include resources modified since this date |
| `identifier` | 0..1 | `string` | Identifier for the composition (accepted; reserved for IPS alignment) |
| `profile` | 0..1 | `canonical` | Profile to validate against (accepted; reserved for IPS alignment) |

### Document types (`type`)

| `type` value | Document | LOINC | Notes |
|--------------|----------|-------|-------|
| *(omitted)* | Continuity of Care Document (CCD) | `34133-9` Summarization of Episode Note | Default export used by the Medplum App **C-CDA** option |
| `referral` | Referral Note | `57133-1` Referral Note | Used by the Medplum App **C-CDA Referral** option. Sets Referral Note document template IDs and uses Reason for Referral / `ServiceRequest` content when present |

### Example: Referral Note

```bash
curl -X POST 'https://api.medplum.com/fhir/R4/Patient/<PATIENT_ID>/$ccda-export' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -H 'Content-Type: application/fhir+json' \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      { "name": "type", "valueCode": "referral" },
      { "name": "start", "valueDate": "2024-01-01" },
      { "name": "end", "valueDate": "2024-12-31" },
      {
        "name": "author",
        "valueReference": { "reference": "Practitioner/example" }
      }
    ]
  }'
```

You can also pass parameters as query string values on GET, for example:

```bash
curl 'https://api.medplum.com/fhir/R4/Patient/<PATIENT_ID>/$ccda-export?type=referral' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

## Output

Returns C-CDA XML (`application/cda+xml`) as a raw Binary response.

## Behavior

1. **Data collection**: Uses [`$summary`](./patient-summary) (which gathers patient data via [`$everything`](./patient-everything)) to build an IPS Composition bundle
2. **Document template**: Applies CCD or Referral Note document-level template IDs and LOINC document type codes based on `type`
3. **XML serialization**: Converts the FHIR bundle to C-CDA with `@medplum/ccda`, then returns the XML

## Related

- [C-CDA Integration Guide](/docs/integration/c-cda) - Detailed guide on working with C-CDA documents
- [Patient $summary](./patient-summary) - IPS summary used as the FHIR source for export
- [Patient $everything](./patient-everything) - Export all patient data in FHIR format
- [ONC Certification](/docs/compliance/onc) - Compliance requirements for patient data export
- [FHIR Patient Resource](https://hl7.org/fhir/R4/patient.html) - FHIR specification for Patient
- [HL7 C-CDA Specification](https://www.hl7.org/implement/standards/product_brief.cfm?product_id=492) - Official C-CDA implementation guide
