---
sidebar_position: 33
---

# Resource $graph

The `$graph` operation fetches all resources related to a given resource as defined by a `GraphDefinition`. This allows you to retrieve a complete graph of related resources in a single request.

## Use Cases

- **Patient Summary with Related Resources**: Fetch a patient along with their conditions, medications, and allergies in a single request
- **Care Team Retrieval**: Load a care team with all practitioners, organizations, and the patient
- **Profile Validation Setup**: Load all profiles needed to validate a resource
- **UI Data Loading**: Efficiently load complex data relationships for clinical dashboards

## Invocation

```
GET [base]/[ResourceType]/[id]/$graph?graph=[GraphDefinition name]
```

## Input Parameters

| Parameter | Cardinality | Type | Description |
|-----------|-------------|------|-------------|
| `graph` | 1..1 | `string` | The name of the GraphDefinition to apply |

## Output

Returns a `Bundle` of type `collection` containing all resources found by traversing the graph.

## GraphDefinition Structure

A `GraphDefinition` defines how to traverse from a starting resource to related resources. It consists of:

- **start**: The resource type where the graph begins
- **link**: An array of links defining how to find related resources

### Link Types

Links can be defined using two methods:

#### 1. FHIRPath Links

Use a FHIRPath expression to evaluate references on the current resource:

```json
{
  "path": "subject",
  "target": [
    {
      "type": "Patient",
      "link": []
    }
  ]
}
```

#### 2. Search Links

Use search parameters to find resources that reference the current resource:

```json
{
  "target": [
    {
      "type": "Observation",
      "params": "subject={ref}"
    }
  ]
}
```

The `{ref}` placeholder is replaced with the current resource reference.

## Example

### GraphDefinition

```json
{
  "resourceType": "GraphDefinition",
  "name": "patient-with-observations",
  "status": "active",
  "start": "Patient",
  "link": [
    {
      "target": [
        {
          "type": "Observation",
          "params": "subject={ref}",
          "link": [
            {
              "path": "performer",
              "target": [
                {
                  "type": "Practitioner"
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "path": "generalPractitioner",
      "target": [
        {
          "type": "Practitioner"
        }
      ]
    }
  ]
}
```

### Request

```http
GET /fhir/R4/Patient/patient123/$graph?graph=patient-with-observations
```

### Response

```json
{
  "resourceType": "Bundle",
  "type": "collection",
  "entry": [
    {
      "resource": {
        "resourceType": "Patient",
        "id": "patient123",
        "generalPractitioner": [
          {
            "reference": "Practitioner/dr-smith"
          }
        ]
      }
    },
    {
      "resource": {
        "resourceType": "Observation",
        "id": "obs1",
        "subject": {
          "reference": "Patient/patient123"
        },
        "performer": [
          {
            "reference": "Practitioner/dr-jones"
          }
        ]
      }
    },
    {
      "resource": {
        "resourceType": "Practitioner",
        "id": "dr-smith"
      }
    },
    {
      "resource": {
        "resourceType": "Practitioner",
        "id": "dr-jones"
      }
    }
  ]
}
```

## Behavior

1. **Starting Resource**: Reads the resource specified in the URL
2. **Link Traversal**: Recursively follows all links defined in the GraphDefinition
3. **Deduplication**: Removes duplicate resources from the result
4. **Caching**: Caches resources during traversal to avoid redundant reads
5. **Canonical Resolution**: Supports resolving canonical URLs to resources

### Safety Limits

- **Maximum Resources**: 1000 resources per request
- **Maximum Depth**: 5 levels of nested links
- **Search Cardinality**: Respects the `max` field in links (defaults to 20, max 5000)

## Link Path Expressions

FHIRPath expressions can target:

- **Reference fields**: `subject`, `performer`, `author`
- **Canonical fields**: `instantiatesCanonical`, `profile`

For canonical fields, the operation searches for resources with matching `url` values.

## Search Parameter Links

Search links must include `{ref}` in the params string:

```json
{
  "type": "Observation",
  "params": "subject={ref}&status=final"
}
```

Multiple search parameters can be combined with `&`.

## Error Responses

| Status Code | Description |
|-------------|-------------|
| `400 Bad Request` | Missing `graph` parameter |
| `400 Bad Request` | Missing or incorrect `start` type in GraphDefinition |
| `400 Bad Request` | Invalid link configuration |
| `400 Bad Request` | Link target params missing `{ref}` |
| `404 Not Found` | GraphDefinition not found |
| `404 Not Found` | Starting resource not found |

## Example GraphDefinitions

### Patient Summary with Related Resources

```json
{
  "name": "patient-summary",
  "start": "Patient",
  "link": [
    {
      "target": [
        { "type": "Condition", "params": "subject={ref}" },
        { "type": "MedicationRequest", "params": "subject={ref}" },
        { "type": "AllergyIntolerance", "params": "patient={ref}" }
      ]
    }
  ]
}
```

### Care Team

```json
{
  "name": "care-team-graph",
  "start": "CareTeam",
  "link": [
    {
      "path": "participant.member",
      "target": [
        { "type": "Practitioner" },
        { "type": "Organization" }
      ]
    },
    {
      "path": "subject",
      "target": [
        { "type": "Patient" }
      ]
    }
  ]
}
```

## Related Documentation

- [FHIR $graph Operation](https://hl7.org/fhir/resource-operation-graph.html)
- [GraphDefinition Resource](https://www.hl7.org/fhir/graphdefinition.html)
- [FHIRPath](https://hl7.org/fhirpath/)
