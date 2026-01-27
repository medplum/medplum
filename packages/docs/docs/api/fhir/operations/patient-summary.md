---
sidebar_position: 31
---

# Patient $summary

The `$summary` operation generates an International Patient Summary (IPS) document for a patient. This creates a comprehensive clinical summary following the [IPS Implementation Guide](https://hl7.org/fhir/uv/ips/).

## Use Cases

- **Care Transitions and Referrals**: Generate standardized clinical summaries when patients move between care settings or providers
- **Patient Portal Health Summaries**: Provide patients with comprehensive, readable summaries of their health record
- **Emergency Department Quick Views**: Give ED clinicians rapid access to essential patient information during emergencies
- **Cross-Border Health Record Sharing**: Share patient data internationally using the standardized IPS format

## Invocation

```
GET [base]/Patient/[id]/$summary
POST [base]/Patient/[id]/$summary
```

## Input Parameters

| Parameter | Cardinality | Type | Description |
|-----------|-------------|------|-------------|
| `author` | 0..1 | `Reference` | Reference to Practitioner, PractitionerRole, or Organization to list as the composition author. Defaults to the current user. |
| `authoredOn` | 0..1 | `instant` | The date/time the summary was authored. Defaults to current time. |
| `start` | 0..1 | `date` | Start date for filtering resources |
| `end` | 0..1 | `date` | End date for filtering resources |
| `_since` | 0..1 | `instant` | Only include resources modified since this date |
| `identifier` | 0..1 | `string` | Identifier for the composition |
| `profile` | 0..1 | `canonical` | Profile to validate against |

## Output

Returns a `Bundle` of type `document` containing:

1. **Composition** - The IPS Composition resource organizing all sections
2. **Patient** - The patient resource
3. **Author** - The author (Practitioner/PractitionerRole/Organization)
4. **Clinical Resources** - All relevant clinical data organized into sections

## IPS Sections

The summary includes the following sections (when data is available):

| Section | LOINC Code | Resources |
|---------|------------|-----------|
| Allergies | 48765-2 | AllergyIntolerance |
| Immunizations | 11369-6 | Immunization |
| Medications | 10160-0 | MedicationRequest |
| Problem List | 11450-4 | Condition |
| Results | 30954-2 | DiagnosticReport, Observation |
| Social History | 29762-2 | Observation (social-history category) |
| Vital Signs | 8716-3 | Observation (vital-signs category) |
| Procedures | 47519-4 | Procedure |
| Encounters | 46240-8 | Encounter |
| Devices | 46264-8 | DeviceUseStatement |
| Assessments | 51848-0 | ClinicalImpression |
| Plan of Treatment | 18776-5 | CarePlan, Goal, ServiceRequest |
| Goals | 61146-7 | Goal |
| Health Concerns | 75310-3 | Condition (health-concern category) |
| Functional Status | 47420-5 | Observation (survey category) |
| Notes | 34109-9 | ClinicalImpression (note type) |
| Reason for Referral | 42349-1 | ServiceRequest (referral type) |
| Insurance | 48768-6 | Account |

## Example

### Request

```http
GET /fhir/R4/Patient/patient123/$summary
```

### Response

```json
{
  "resourceType": "Bundle",
  "type": "document",
  "timestamp": "2026-01-08T15:30:00.000Z",
  "entry": [
    {
      "resource": {
        "resourceType": "Composition",
        "id": "composition123",
        "status": "final",
        "type": {
          "coding": [
            {
              "system": "http://loinc.org",
              "code": "60591-5",
              "display": "Patient Summary"
            }
          ]
        },
        "subject": {
          "reference": "Patient/patient123"
        },
        "date": "2026-01-08T15:30:00.000Z",
        "author": [
          {
            "reference": "Practitioner/practitioner456"
          }
        ],
        "title": "Medical Summary",
        "section": [
          {
            "title": "Allergies",
            "code": {
              "coding": [
                {
                  "system": "http://loinc.org",
                  "code": "48765-2"
                }
              ]
            },
            "text": {
              "status": "generated",
              "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">...</div>"
            },
            "entry": [
              {
                "reference": "AllergyIntolerance/allergy789"
              }
            ]
          }
        ]
      }
    },
    {
      "resource": {
        "resourceType": "Patient",
        "id": "patient123"
      }
    },
    {
      "resource": {
        "resourceType": "AllergyIntolerance",
        "id": "allergy789"
      }
    }
  ]
}
```

## Resource Types Included

The operation collects and organizes the following resource types:

- Account
- AllergyIntolerance
- CarePlan
- ClinicalImpression
- Condition
- Coverage
- DeviceUseStatement
- DiagnosticReport
- Encounter
- Goal
- Immunization
- MedicationRequest
- Observation
- Procedure
- RelatedPerson
- ServiceRequest

## Behavior

1. **Data Collection**: Uses the `$everything` operation internally to gather all patient-related resources
2. **Section Assignment**: Automatically assigns resources to appropriate IPS sections based on resource type and category codes
3. **Nested Resources**: Handles nested resources (e.g., Observations that are members of other Observations) appropriately
4. **HTML Generation**: Generates human-readable HTML tables for each section
5. **Event Period**: Calculates the composition event period from resource timestamps

## Error Responses

| Status Code | Description |
|-------------|-------------|
| `404 Not Found` | Patient not found |
| `403 Forbidden` | Insufficient permissions |

## Related Documentation

- [International Patient Summary IG](https://hl7.org/fhir/uv/ips/)
- [Patient $everything](./patient-everything)
- [Composition Resource](https://www.hl7.org/fhir/composition.html)
