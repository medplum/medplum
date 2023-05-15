---
sidebar_position: 20
---

# Measure $evaluate-measure

Medplum supports the Measure [$evaluate-measure](https://hl7.org/fhir/R4/measure-operation-evaluate-measure.html) operation.

:::caution

`$evaluate-measure` is early and limited. At present, it only supports calculating counts using "application/x-fhir-query". Using FHIR `Library` is currently unsupported.

:::

## Usage

First, create a FHIR `Measure`:

```json
{
  "resourceType": "Measure",
  "status": "active",
  "url": "https://example.com/test-measure",
  "group": [
    {
      "population": [
        {
          "code": {
            "coding": [
              {
                "code": "measure-population"
              }
            ]
          },
          "criteria": {
            "language": "application/x-fhir-query",
            "expression": "Patient"
          }
        }
      ]
    }
  ]
}
```

Next, make an HTTP POST request to the `$evaluate-measure` endpoint:

```bash
curl 'https://api.medplum.com/fhir/R4/Measure/MY_MEASURE_ID/$evaluate-measure' \
  -X POST \
  -H "Content-Type: application/fhir+json" \
  -H "Authorization: Bearer MY_ACCESS_TOKEN" \
  -d '{"resourceType":"Parameters","parameter":[{"name":"periodStart","valueDate":"2020-01-01"},{"name":"periodEnd","valueDate":"2030-01-01"}]}'
```

The result will be a FHIR `MeasureReport` resource:

```json
{
  "resourceType": "MeasureReport",
  "id": "b40f97d9-385f-4336-8c6c-8892160a7fa1",
  "meta": {
    "versionId": "182948fb-e287-4f05-a313-1d6df883ee0f",
    "lastUpdated": "2023-05-15T02:23:22.301Z"
  },
  "status": "complete",
  "type": "summary",
  "measure": "https://example.com/test-measure",
  "date": "2023-05-15T02:23:22.298Z",
  "period": {
    "start": "2020-01-01",
    "end": "2030-01-01"
  },
  "group": [
    {
      "population": [
        {
          "code": {
            "coding": [
              {
                "code": "measure-population"
              }
            ]
          },
          "count": 1000
        }
      ]
    }
  ]
}
```
