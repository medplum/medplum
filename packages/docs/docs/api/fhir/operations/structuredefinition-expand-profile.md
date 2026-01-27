---
sidebar_position: 34
---

# StructureDefinition $expand-profile

The `$expand-profile` operation expands a `StructureDefinition` profile by recursively loading all nested `StructureDefinition` resources referenced in the profile's element type definitions. This is useful for obtaining a complete set of profiles needed to validate or render resources conforming to a profile.

## Use Cases

- **Profile Validation Setup**: Load all profiles needed to validate a resource against a profile hierarchy
- **UI Schema Generation**: Load all profiles to generate a complete UI schema with proper constraints
- **Profile Documentation**: Generate documentation that includes all referenced profiles
- **Implementation Guide Support**: Work with complex profile hierarchies from implementation guides like US Core

## Invocation

```
GET [base]/StructureDefinition/$expand-profile?url=[profile URL]
```

## Input Parameters

| Parameter | Cardinality | Type | Description |
|-----------|-------------|------|-------------|
| `url` | 1..1 | `string` | The canonical URL of the StructureDefinition to expand |

## Output

Returns a `Bundle` of type `searchset` containing the requested profile and all nested StructureDefinition resources.

## Behavior

1. **Profile Lookup**: Searches for a StructureDefinition with the given URL
2. **Element Scanning**: Scans the profile's `snapshot.element` array for type profiles
3. **Recursive Loading**: Recursively loads all referenced profiles
4. **Deduplication**: Avoids loading the same profile multiple times
5. **Depth Limiting**: Limits recursion to 10 levels to prevent infinite loops

## Example

### Request

```http
GET /fhir/R4/StructureDefinition/$expand-profile?url=http://example.org/fhir/StructureDefinition/custom-patient
```

### Response

```json
{
  "resourceType": "Bundle",
  "type": "searchset",
  "entry": [
    {
      "fullUrl": "https://api.medplum.com/fhir/R4/StructureDefinition/custom-patient-id",
      "resource": {
        "resourceType": "StructureDefinition",
        "id": "custom-patient-id",
        "url": "http://example.org/fhir/StructureDefinition/custom-patient",
        "name": "CustomPatient",
        "status": "active",
        "kind": "resource",
        "type": "Patient",
        "snapshot": {
          "element": [
            {
              "id": "Patient.identifier",
              "path": "Patient.identifier",
              "type": [
                {
                  "code": "Identifier",
                  "profile": [
                    "http://example.org/fhir/StructureDefinition/custom-identifier"
                  ]
                }
              ]
            }
          ]
        }
      }
    },
    {
      "fullUrl": "https://api.medplum.com/fhir/R4/StructureDefinition/custom-identifier-id",
      "resource": {
        "resourceType": "StructureDefinition",
        "id": "custom-identifier-id",
        "url": "http://example.org/fhir/StructureDefinition/custom-identifier",
        "name": "CustomIdentifier",
        "status": "active",
        "kind": "complex-type",
        "type": "Identifier"
      }
    }
  ]
}
```

## Example Usage

### Profile Validation Setup

Load all profiles needed to validate a resource:

```typescript
const bundle = await medplum.get(
  'StructureDefinition/$expand-profile?url=http://example.org/fhir/StructureDefinition/my-profile'
);

// Extract all profiles for validator
const profiles = bundle.entry.map(e => e.resource);
```

### UI Schema Generation

Load all profiles to generate a complete UI schema:

```typescript
const bundle = await medplum.get(
  'StructureDefinition/$expand-profile?url=http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'
);

// Use profiles to build form fields with proper constraints
```

### Profile Documentation

Generate documentation that includes all referenced profiles:

```typescript
const bundle = await medplum.get(
  'StructureDefinition/$expand-profile?url=http://example.org/fhir/StructureDefinition/custom-resource'
);

// Generate documentation for each profile
for (const entry of bundle.entry) {
  generateDocumentation(entry.resource);
}
```

## Version Resolution

When multiple versions of a profile exist, the operation returns the **latest version** based on the `version` field (sorted descending).

## Error Responses

| Status Code | Description |
|-------------|-------------|
| `400 Bad Request` | Missing `url` parameter |
| `400 Bad Request` | Profile with the specified URL not found |

## Notes

- The operation only includes profiles referenced in `element.type.profile`
- Base FHIR types are not included in the expansion
- The response includes the original requested profile as the first entry
- Circular references are handled gracefully through deduplication

## Related Documentation

- [StructureDefinition Resource](https://www.hl7.org/fhir/structuredefinition.html)
- [Profiling FHIR](https://www.hl7.org/fhir/profiling.html)
- [FHIR Implementation Guides](/docs/fhir-datastore/profiles)
