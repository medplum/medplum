---
sidebar_position: 28
---

# Claim $export

The `$export` operation exports a `Claim` resource as a CMS-1500 PDF document. This is useful for generating standardized claim forms for healthcare billing.

## Use Cases

- **Insurance Claim Submission**: Generate CMS-1500 forms for submission to insurance payers
- **Medical Billing Documentation**: Create standardized billing documents for patient records
- **Claims Reconciliation**: Generate PDF copies of claims for auditing and reconciliation
- **Patient Billing Records**: Provide patients with copies of claims submitted on their behalf

## Invocation

### Instance Level (GET)

```
GET [base]/Claim/[id]/$export
```

### Type Level (POST)

```
POST [base]/Claim/$export
```

## Input Parameters

### GET Request

No parameters required - the Claim is identified by the URL path.

### POST Request

| Parameter | Cardinality | Type | Description |
|-----------|-------------|------|-------------|
| `resource` | 1..1 | `Claim` | The Claim resource to export as PDF |

## Output

Returns a `Media` resource containing a reference to the generated PDF document stored as a `Binary` resource.

| Field | Description |
|-------|-------------|
| `Media.status` | `completed` |
| `Media.subject` | Reference to the patient from the Claim |
| `Media.operator` | Reference to the provider from the Claim |
| `Media.issued` | Timestamp of PDF generation |
| `Media.content.contentType` | `application/pdf` |
| `Media.content.url` | Reference to the Binary containing the PDF |
| `Media.content.title` | `cms-1500.pdf` |

## Example

### GET Request

```http
GET /fhir/R4/Claim/claim123/$export
```

### POST Request

```http
POST /fhir/R4/Claim/$export
Content-Type: application/fhir+json

{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "resource",
      "resource": {
        "resourceType": "Claim",
        "status": "active",
        "type": {
          "coding": [
            {
              "system": "http://terminology.hl7.org/CodeSystem/claim-type",
              "code": "professional"
            }
          ]
        },
        "use": "claim",
        "patient": {
          "reference": "Patient/patient123"
        },
        "provider": {
          "reference": "Organization/org456"
        },
        "created": "2026-01-08",
        "priority": {
          "coding": [
            {
              "code": "normal"
            }
          ]
        }
      }
    }
  ]
}
```

### Response

```json
{
  "resourceType": "Media",
  "status": "completed",
  "subject": {
    "reference": "Patient/patient123"
  },
  "operator": {
    "reference": "Organization/org456"
  },
  "issued": "2026-01-08T15:30:00.000Z",
  "content": {
    "contentType": "application/pdf",
    "url": "Binary/binary789",
    "title": "cms-1500.pdf"
  }
}
```

## Downloading the PDF

To download the actual PDF file, retrieve the Binary resource referenced in the Media:

```http
GET /fhir/R4/Binary/binary789
Accept: application/pdf
```

## Error Responses

| Status Code | Description |
|-------------|-------------|
| `400 Bad Request` | Claim ID is required (GET) or resource parameter missing (POST) |
| `404 Not Found` | Claim not found |
| `403 Forbidden` | Insufficient permissions |

## Notes

- This operation is marked as **experimental**
- The generated PDF follows the CMS-1500 form format
- The Binary resource containing the PDF is automatically created during the operation

## Related Documentation

- [Claim Resource](https://www.hl7.org/fhir/claim.html)
- [Media Resource](https://www.hl7.org/fhir/media.html)
- [Binary Resource](https://www.hl7.org/fhir/binary.html)
