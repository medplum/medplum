---
sidebar_position: 21
---

# Resource $expunge

The `$expunge` operation permanently deletes a resource and all of its history from the database. Unlike a standard FHIR delete (which creates a "tombstone" record by marking it as deleted), expunge completely removes all traces of the resource.

:::warning
This operation is **irreversible**. Once a resource is expunged, it cannot be recovered. Use with caution.
:::

## Use Cases

- **Data Cleanup**: Remove test data from development environments
- **Compliance**: Fulfill data deletion requests under regulations like GDPR
- **Tenant Offboarding**: Clean up all data when a tenant leaves the platform
- **Error Correction**: Remove erroneously created resources that shouldn't exist

## Authorization

This operation requires **admin privileges**. You must be a project admin (`Membership.admin = true`).

## Invoke the `$expunge` operation

### Single Resource

```
[base]/[resourceType]/[id]/$expunge
```

For example, to expunge a single Patient:

```bash
curl -X POST 'https://api.medplum.com/fhir/R4/Patient/example-id/$expunge' \
  -H "Content-Type: application/fhir+json" \
  -H "Authorization: Bearer MY_ACCESS_TOKEN"
```

### Parameters

| Name         | Type      | Description                                                    | Required |
| ------------ | --------- | -------------------------------------------------------------- | -------- |
| `everything` | `boolean` | Expunge all resources in the compartment (for Projects only)   | No       |

### Expunge Everything (Project Compartment)

When expunging a Project or using `everything=true`, the operation deletes all resources belonging to that compartment. This runs as an async job due to the potentially large number of resources involved.

```bash
curl -X POST 'https://api.medplum.com/fhir/R4/Project/project-id/$expunge?everything=true' \
  -H "Content-Type: application/fhir+json" \
  -H "Authorization: Bearer MY_ACCESS_TOKEN"
```

## Response

### Successful Single Resource Expunge

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "information",
      "code": "informational",
      "details": {
        "text": "All OK"
      }
    }
  ]
}
```

### Async Job Started (Everything Mode)

When expunging a project or using `everything=true`, the operation returns immediately with a 202 Accepted status and a location header pointing to the async job:

```
HTTP/1.1 202 Accepted
Content-Location: https://api.medplum.com/fhir/R4/AsyncJob/job-id
```

You can poll the AsyncJob to check the status:

```bash
curl 'https://api.medplum.com/fhir/R4/AsyncJob/job-id' \
  -H "Authorization: Bearer MY_ACCESS_TOKEN"
```

### Access Denied

If you don't have admin privileges:

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

## Behavior

### Single Resource Expunge
- Deletes the resource and all of its history versions
- Removes associated Binary resources referenced by the resource
- The operation is synchronous and returns immediately

### Everything Mode (Project Expunge)
- Iterates through all resource types in the compartment
- Deletes resources in batches of 10,000
- Also deletes associated Binary resources
- Runs as an async job to handle large datasets

## Related Documentation

- [AsyncJob $cancel](/docs/api/fhir/operations/asyncjob-cancel) - Cancel a running expunge job
- [FHIR Delete](/docs/api/fhir/operations) - Standard FHIR delete (creates tombstone)
