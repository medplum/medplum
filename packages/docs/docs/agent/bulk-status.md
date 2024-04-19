---
sidebar_position: 11
---

# Agent Bulk Status

Gets the status of an agent or agents based on given search criteria. Useful for seeing whether agents are connected and listing their current software version.

## Invoke the `$bulk-status` operation

```
[base]/Agent/$bulk-status
```

For example:

```bash
medplum get 'Agent/$bulk-status'
```

### Valid Response

The response to this operation is a `Bundle` of `Parameters`. Each `Parameters` within the `Bundle` contains an `agent` and a `result`, 
which is the result of calling the `$status` operation on this `Agent`, either a `Parameters` or `OperationOutcome` resource.

Example response:

```json
{
  "resourceType": "Bundle",
  "type": "collection",
  "entry": [
    {
      "resource": {
        "resourceType": "Parameters",
        "parameter": [
          {
            "name": "agent",
            "resource": {
              "resourceType": "Agent",
              "name": "Test Agent 1",
              "status": "active",
              "id": "93f8b2fb-65a3-4977-a175-71b73b26fde7",
              "meta": {
                "versionId": "e182201a-6925-467f-a92b-496193fb4c39",
                "lastUpdated": "2024-04-19T20:29:25.087Z"
              }
            }
          },
          {
            "name": "result",
            "resource": {
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
          }
        ]
      }
    },
    {
      "resource": {
        "resourceType": "Parameters",
        "parameter": [
          {
            "name": "agent",
            "resource": {
              "resourceType": "Agent",
              "name": "Test Agent 2",
              "status": "active",
              "id": "93f8b2fb-65a3-4977-a175-71b73b26fde7",
              "meta": {
                "versionId": "e182201a-6925-467f-a92b-496193fb4c39",
                "lastUpdated": "2024-04-19T20:29:25.087Z"
              }
            }
          },
          {
            "name": "result",
            "resource": {
              "resourceType": "Parameters",
              "parameter": [
                {
                  "name": "status",
                  "valueCode": "disconnected"
                },
                {
                  "name": "version",
                  "valueString": "3.1.2"
                },
                {
                  "name": "lastUpdated",
                  "valueInstant": "2024-04-19T00:00:00Z"
                }
              ]
            }
          }
        ]
      }
    },
    {
      "resource": {
        "resourceType": "Parameters",
        "parameter": [
          {
            "name": "agent",
            "resource": {
              "resourceType": "Agent",
              "name": "Test Agent 3",
              "status": "off",
              "id": "93f8b2fb-65a3-4977-a175-71b73b26fde7",
              "meta": {
                "versionId": "e182201a-6925-467f-a92b-496193fb4c39",
                "lastUpdated": "2024-04-19T20:29:25.087Z"
              }
            }
          },
          {
            "name": "result",
            "resource": {
              "resourceType": "OperationOutcome",
              "issue": [
                {
                  "severity": "error",
                  "code": "exception",
                  "details": {
                    "text": "Something weird happened when getting the status"
                  }
                }
              ],
            }
          }
        ]
      }
    }
  ]
}
```

### Invalid Response

Example outcome when exceeding max `_count` limit:

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": {
        "text": "'_count' of 101 is greater than max of 100"
      }
    }
  ]
}
```

## Using search parameters

All of the `Agent` search parameters can be used to select which agents to query the status of.

Some useful search parameters are:
- `name`
- `status`
- `_count` and `_offset`

### Recipes

Getting the status for one agent by name:

```bash
medplum get 'Agent/$bulk-status?name=Test+Agent+1'
```

Getting the status of all active agents:

```bash
medplum get 'Agent/$bulk-status?status=active'
```

Paging through all agent statuses, 50 at a time:

```bash
medplum get 'Agent/$bulk-status?_count=50&_offset=0'
medplum get 'Agent/$bulk-status?_count=50&_offset=50'
```
