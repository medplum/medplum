---
sidebar_position: 26
---

# ConceptMap $import

The `$import` operation allows you to import code mappings into a ConceptMap. This is useful for bulk loading terminology mappings from external sources or programmatically adding mappings to an existing ConceptMap.

## Use Cases

- **Bulk Import from External Sources**: Import mappings from other terminology systems or external standards organizations, including programmatically creating mappings from external mapping files
- **Mapping Updates**: Update existing mappings with new versions

## Authorization

This operation requires **admin privileges**. You must be a project admin (`ProjectMembership.admin = true`).

## Invoke the `$import` operation

### By Instance ID

```
[base]/ConceptMap/[id]/$import
```

### By URL (Type Level)

```
[base]/ConceptMap/$import
```

## Parameters

| Name      | Type      | Description                                               | Required |
| --------- | --------- | --------------------------------------------------------- | -------- |
| `url`     | `uri`     | The canonical URL of the ConceptMap to import into        | No<sup>*</sup>      |
| `mapping` | `complex` | One or more mappings to import (see structure below)      | Yes      |

::: note
<sup>*</sup> Either the instance ID in the URL or the `url` parameter must be provided.
:::

### Mapping Structure

Each mapping has the following parts:

| Part           | Type     | Description                                                 | Required |
| -------------- | -------- | ----------------------------------------------------------- | -------- |
| `source`       | `Coding` | The source code (system, code, display)                     | Yes      |
| `target`       | `Coding` | The target code (system required; code optional for null map) | Yes |
| `relationship` | `code`   | Equivalence type (default: `equivalent`)                    | No       |
| `comment`      | `string` | Comment about the mapping                                   | No       |
| `property`     | `array`  | Additional properties on the mapping                        | No       |
| `dependsOn`    | `array`  | Dependencies for the mapping                                | No       |
| `product`      | `array`  | Products of the mapping                                     | No       |

### Relationship Values

Valid values from the [concept-map-equivalence](http://hl7.org/fhir/R4/valueset-concept-map-equivalence.html) ValueSet:
- `equivalent` (default)
- `equal`
- `wider`
- `narrower`
- `inexact`
- `unmatched`
- `disjoint`

## Example Request

```bash
curl -X POST 'https://api.medplum.com/fhir/R4/ConceptMap/my-concept-map/$import' \
  -H "Content-Type: application/fhir+json" \
  -H "Authorization: Bearer MY_ACCESS_TOKEN" \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      {
        "name": "mapping",
        "part": [
          {
            "name": "source",
            "valueCoding": {
              "system": "http://example.org/source-system",
              "code": "ABC",
              "display": "Source Code ABC"
            }
          },
          {
            "name": "target",
            "valueCoding": {
              "system": "http://example.org/target-system",
              "code": "XYZ",
              "display": "Target Code XYZ"
            }
          },
          {
            "name": "relationship",
            "valueCode": "equivalent"
          }
        ]
      },
      {
        "name": "mapping",
        "part": [
          {
            "name": "source",
            "valueCoding": {
              "system": "http://example.org/source-system",
              "code": "DEF",
              "display": "Source Code DEF"
            }
          },
          {
            "name": "target",
            "valueCoding": {
              "system": "http://example.org/target-system",
              "code": "UVW",
              "display": "Target Code UVW"
            }
          }
        ]
      }
    ]
  }'
```

## Output

The operation returns the ConceptMap resource that was imported into.

### Example Response

```json
{
  "resourceType": "ConceptMap",
  "id": "my-concept-map",
  "url": "http://example.org/ConceptMap/my-mappings",
  "status": "active",
}
```

## Behavior

- **Upsert Logic**: Mappings are inserted or updated based on the unique combination of (conceptMap, sourceSystem, sourceCode, targetSystem, targetCode)
- **Transaction**: The entire import runs within a database transaction
- **Existing Mappings**: Mappings already defined in the ConceptMap resource are also imported into the database

## Error Responses

### URL Not Permitted for Instance Operation

Occurs when calling the instance-level operation (`/ConceptMap/[id]/$import`) while also providing the `url` parameter. The target ConceptMap is already identified by the instance ID in the path, so `url` is redundant and not allowed. Omit the `url` parameter when using the instance URL, or call the type-level operation (`/ConceptMap/$import`) and provide `url` in the request body instead.

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": {
        "text": "Parameter `url` not permitted for instance operation"
      }
    }
  ]
}
```

## Related Documentation

- [ConceptMap $translate](/docs/api/fhir/operations/conceptmap-translate) - Translate codes using ConceptMaps
- [Terminology](/docs/terminology) - Overview of terminology support in Medplum
- [FHIR ConceptMap](http://hl7.org/fhir/R4/conceptmap.html) - FHIR specification
