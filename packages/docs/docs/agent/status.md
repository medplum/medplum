---
sidebar_position: 10
---

# Agent Status

Gets the status of a given agent. Useful for seeing whether an agent is connected and listing its current software version.

> For querying multiple agent statuses at once, or using `SearchParameters` to select agents to query, see [Bulk Status](./bulk-status.md).

## Invoke the `$status` operation

```
[base]/Agent/[id]/$status
```

For example:

```bash
medplum get 'Agent/[id]/$status'
```

### Valid Response

Valid status codes include:
- `connected`
- `disconnected`
- `unknown`

Example response when the `Agent` is known and connected:

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "status",
      "valueCode": "connected"
    },
    {
      "name": "version",
      "valueString": "3.1.4"
    },
    {
      "name": "lastUpdated",
      "valueInstant": "2024-04-19T00:00:00Z"
    }
  ]
}
```

In cases where status has not been reported yet, `status` and `version` may be `unknown`, and `lastUpdated` may not be present.

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "status",
      "valueCode": "unknown"
    },
    {
      "name": "version",
      "valueString": "unknown"
    }
  ]
}
```

### Invalid Response

Example outcome when an ID was not supplied to the operation:

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": {
        "text": "Must specify agent ID or identifier"
      }
    }
  ]
}
```
