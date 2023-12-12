---
sidebar_position: 9
---

# ConceptMap Translate

Medplum implements the [`ConceptMap/$translate`][translate-operation] operation, which allows mapping a coded value
between code systems.

[translate-operation]: http://hl7.org/fhir/R4/conceptmap-operation-translate.html

## Invoke the `$translate` operation

```
[base]/ConceptMap/$translate
[base]/ConceptMap/[id]/$translate
```

### Parameters

| Name              | Type              | Description                                                      | Required |
| ----------------- | ----------------- | ---------------------------------------------------------------- | -------- |
| `url`             | `uri`             | Canonical URL of the ConceptMap, if not specified by ID          | No       |
| `source`          | `uri`             | Canonical URL of source ValueSet, used to look up ConceptMap     | No       |
| `code`            | `code`            | Code to translate using the ConceptMap                           | No       |
| `system`          | `uri`             | System the code (above) is drawn from                            | No       |
| `coding`          | `Coding`          | Full coding to translate using the ConceptMap                    | No       |
| `codeableConcept` | `CodeableConcept` | Concept with one or more codes to translate using the ConceptMap | No       |
| `targetsystem`    | `uri`             | Target code system, used to filter results                       | No       |

:::note Required Parameters

Although no individual parameter for the operation is required, both of the following must be satisfied for the
operation to proceed:

- Either the ConceptMap ID must be present in the request path (e.g. by calling `ConceptMap/[id]/$translate`), or
  one of `url` or `source` must be populated to look up the ConceptMap
- Exactly one of the following must be set to specify the source code(s) to translate:
  - Both `code` and `system`
  - `coding`
  - `codeableConcept`

:::

### Example

As an example, assume the following `ConceptMap` resource exists in the system:

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

To translate a code using this ConceptMap, one would make an API request like the following:

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
