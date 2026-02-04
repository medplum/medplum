---
sidebar_position: 25
---

# AsyncJob $cancel

The `$cancel` operation allows you to cancel a running asynchronous job. This is useful when you need to stop a long-running operation that is no longer needed.

## Use Cases

- **Resource Management**: Cancel jobs that are no longer needed to free up server resources
- **Error Recovery**: Stop a job that was started with incorrect parameters
- **User Control**: Allow users to cancel long-running exports or operations they initiated

## Invoke the `$cancel` operation

```
[base]/AsyncJob/[id]/$cancel
```

For example:

```bash
curl -X POST 'https://api.medplum.com/fhir/R4/AsyncJob/job-id/$cancel' \
  -H "Content-Type: application/fhir+json" \
  -H "Authorization: Bearer MY_ACCESS_TOKEN"
```

## Parameters

This operation has no input parameters. The job ID is specified in the URL path.

## Output

The operation returns an OperationOutcome indicating success or failure.

### Successful Response

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

## Behavior

The operation behavior depends on the current status of the AsyncJob:

| Current Status | Behavior                                           |
| -------------- | -------------------------------------------------- |
| `accepted`     | Job is cancelled, status changes to `cancelled`    |
| `cancelled`    | No action taken (already cancelled)                |
| Other          | Error returned - job cannot be cancelled           |

### Status Transitions

```
accepted → cancelled (via $cancel)
```

:::note
Only jobs with `accepted` status can be cancelled. Jobs that are already `completed`, `failed`, or in other terminal states cannot be cancelled.
:::

## Error Responses

### Job Already Completed

If the job has already completed or is in a non-cancellable state:

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": {
        "text": "AsyncJob cannot be cancelled if status is not 'accepted', job had status 'completed'"
      }
    }
  ]
}
```

### Job Not Found

If the AsyncJob doesn't exist or you don't have access:

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "not-found",
      "details": {
        "text": "Not found"
      }
    }
  ]
}
```

## AsyncJob Lifecycle

AsyncJobs are created by various long-running operations:

1. **Bulk FHIR Export** - `$export` operations
2. **Project Expunge** - `$expunge` with `everything=true`
3. **Reindex Operations** - `$reindex` operations
4. **Other Async Operations** - Various operations that run asynchronously

### Example: Cancel a Bulk Export

```bash
# Start a bulk export
curl -X GET 'https://api.medplum.com/fhir/R4/$export' \
  -H "Authorization: Bearer MY_ACCESS_TOKEN" \
  -H "Prefer: respond-async"

# Response includes Content-Location header
# Content-Location: https://api.medplum.com/fhir/R4/AsyncJob/abc123

# Cancel the export if needed
curl -X POST 'https://api.medplum.com/fhir/R4/AsyncJob/abc123/$cancel' \
  -H "Authorization: Bearer MY_ACCESS_TOKEN"
```

## Related Documentation

- [Bulk FHIR Export](/docs/api/fhir/operations/bulk-fhir) - Operations that create AsyncJobs
- [Resource $expunge](/docs/api/fhir/operations/expunge) - Expunge operations that may run async
