---
sidebar_position: 26
---

# ConceptMap $import

The `$import` operation allows you to import code mappings into a ConceptMap. This is useful for bulk loading terminology mappings from external sources or programmatically adding mappings to an existing ConceptMap.

## Authorization

This operation requires **admin privileges**. You must be a project admin (`Membership.admin = true`).

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
| `url`     | `uri`     | The canonical URL of the ConceptMap to import into        | No*      |
| `mapping` | `complex` | One or more mappings to import (see structure below)      | Yes      |

*Either the instance ID in the URL or the `url` parameter must be provided.

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

Valid values from the [concept-map-equivalence](http://hl7.org/fhir/ValueSet/concept-map-equivalence) ValueSet:
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
  "group": [
    {
      "source": "http://example.org/source-system",
      "target": "http://example.org/target-system",
      "element": [
        {
          "code": "ABC",
          "display": "Source Code ABC",
          "target": [
            {
              "code": "XYZ",
              "display": "Target Code XYZ",
              "equivalence": "equivalent"
            }
          ]
        }
      ]
    }
  ]
}
```

## Behavior

- **Upsert Logic**: Mappings are inserted or updated based on the unique combination of (conceptMap, sourceSystem, sourceCode, targetSystem, targetCode)
- **Duplicate Handling**: Duplicate mappings in the input are deduplicated
- **Transaction**: The entire import runs within a database transaction
- **Existing Mappings**: Mappings already defined in the ConceptMap resource are also imported into the database

## Error Responses

### Missing Source Code

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": {
        "text": "Source code for mapping is required"
      }
    }
  ]
}
```

### URL Not Permitted for Instance Operation

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

### Access Denied

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "forbidden",
      "details": {
        "text": "Forbidden"
      }
    }
  ]
}
```

## Use Cases

- **Terminology Migration**: Bulk import mappings from another terminology system
- **External Data Integration**: Import mappings from external standards organizations
- **Automated Mapping**: Programmatically create mappings based on external mapping files
- **Mapping Updates**: Update existing mappings with new versions

## Related Documentation

- [ConceptMap $translate](/docs/api/fhir/operations/conceptmap-translate) - Translate codes using ConceptMaps
- [Terminology](/docs/terminology) - Overview of terminology support in Medplum
- [FHIR ConceptMap](https://hl7.org/fhir/conceptmap.html) - FHIR specification
