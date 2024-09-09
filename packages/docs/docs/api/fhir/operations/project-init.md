---
sidebar_position: 8
---

# Project Initialization

Medplum implements a custom `Project/$init` operation, which can create a new Project and set up the admin user,
resulting in a ready-to-use empty Project.

## Invoke the `$init` operation

```
[base]/Project/$init
```

For example:

```bash
curl 'https://api.medplum.com/fhir/R4/Project/$init' \
  -X POST \
  -H "Content-Type: application/fhir+json" \
  -H "Authorization: Bearer MY_ACCESS_TOKEN" \
  -d '{"resourceType":"Parameters", "parameter":[ {"name":"name", "valueString":"Test Project"} ]}'
```

### Success Response

Example outcome:

```json
{
  "resourceType": "Project",
  "id": "59aa86af-9673-4862-a441-5200e6163bfb",
  "name": "Test Project",
  "strictMode": true,
  "owner": {
    "reference": "User/eb0f26b9-1e42-4886-85fc-31919aeebc55"
  }
}
```

### Error Response

Example outcome when Project name not provided:

```json
{
  "resourceType": "OperationOutcome",
  "id": "3820fda7-c6d4-4207-b597-90631f0881f9",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": { "text": "Expected required input parameter 'name'" },
      "expression": ["Parameters.parameter"]
    }
  ]
}
```
