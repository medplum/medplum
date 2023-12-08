---
sidebar_position: 9
---

# ConceptMap Translate

Medplum implements the [`ConceptMap/$translate`][translate-operation] operation, which allows mapping a coded value from

[translate-operation]: http://hl7.org/fhir/R4/conceptmap-operation-translate.html

## Invoke the `$translate` operation

```
[base]/ConceptMap/$translate
[base]/ConceptMap/[id]/$translate
```

For example, given the following `ConceptMap` resource:

```json
{
  "resourceType": "ConceptMap",
  "url": "http://example.com/concept-map",
  "status": "active",
  "sourceCanonical": "http://example.com/labs",
  "group": [
    {
      "source": "http://snomed.info/sct",
      "target": "http://loinc.org",
      "element": [
        {
          "code": "313444004",
          "target": [
            {
              "code": "15067-2",
              "display": "Follitropin Qn",
              "equivalence": "equivalent"
            }
          ]
        }
      ]
    },
    {
      "source": "http://snomed.info/sct",
      "target": "http://www.ama-assn.org/go/cpt",
      "element": [
        {
          "code": "313444004",
          "target": [{ "code": "83001", "equivalence": "equivalent" }]
        }
      ]
    }
  ]
}
```

```bash
curl 'https://api.medplum.com/fhir/R4/ConceptMap/[id]/$translate' \
  -X POST \
  -H "Content-Type: application/fhir+json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"resourceType":"Parameters","parameter":[ {"name":"code","valueCode":"313444004"}, {"name":"system","valueUri":"http://snomed.info/sct"} ]}'
```

### Success Response

Example outcome:

```json
{
  "resourceType": "Parameters",
  "parameter": [
    { "name": "result", "valueBoolean": true },
    {
      "name": "match",
      "part": [
        { "name": "equivalence", "valueCode": "equivalent" },
        { "name": "concept", "valueCoding": {
          "system": "http://loinc.org",
          "code": "15067-2",
          "display": "Follitropin Qn"
        }}
      ]
    }
    {
      "name": "match",
      "part": [
        { "name": "equivalence", "valueCode": "equivalent" },
        { "name": "concept", "valueCoding": {
          "system": "http://www.ama-assn.org/go/cpt",
          "code": "83001"
        }}
      ]
    }
  ]
}
```

### Error Response

Example outcome when ambiguous input parameters are provided, e.g.:

**Request**:

```http
POST /fhir/R4/ConceptMap/$translate
```

```json
{
  "resourceType": "Parameters",
  "parameter": [
    { "name": "url", "valueCode": "http://example.com/concept-map" },
    { "name": "code", "valueCode": "foo" },
    { "name": "system", "valueUri": "http://example.com/code-system" },
    { "name": "coding", "valueCoding": { "code": "bar", "system": "http://example.com/code-system" } }
  ]
}
```

**Response**:

```http
400 Bad Request
```

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": { "text": "Ambiguous input: multiple source codings provided" }
    }
  ]
}
```
