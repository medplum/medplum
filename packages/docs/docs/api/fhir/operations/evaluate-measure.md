---
sidebar_position: 20
---

# Measure $evaluate-measure

The `$evaluate-measure` operation executes a defined clinical quality measure against your patient population and returns aggregated results. This enables healthcare organizations to programmatically calculate quality metrics, track clinical outcomes, and generate reports for regulatory compliance without manual data extraction.

**Use Cases:**

- **Quality reporting**: Calculate eCQM (electronic Clinical Quality Measures) for CMS reporting, MIPS, or other regulatory requirements
- **Population health analytics**: Track clinical outcomes across patient populations to identify care gaps and improvement opportunities
- **Performance dashboards**: Generate real-time metrics for provider performance tracking and quality improvement initiatives
- **Research cohort analysis**: Count and analyze patient populations meeting specific clinical criteria for research studies

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

## Related

- [FHIR Measure Resource](https://hl7.org/fhir/R4/measure.html) - FHIR specification for Measure
- [FHIR MeasureReport Resource](https://hl7.org/fhir/R4/measurereport.html) - FHIR specification for MeasureReport
- [FHIR $evaluate-measure](https://hl7.org/fhir/R4/measure-operation-evaluate-measure.html) - FHIR specification for the operation
- [CMS eCQM Information](https://ecqi.healthit.gov/ecqms) - Electronic clinical quality measures resources
- [Medplum Analytics Guide](/docs/analytics) - Building analytics and dashboards with Medplum
