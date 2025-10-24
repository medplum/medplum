---
sidebar_position: 12
---

# Agent Fetch Logs

Fetches log entries from a given agent or agents. Useful for debugging and monitoring agent behavior.

## Invoke the `$fetch-logs` operation

### Single Agent

```
[base]/Agent/[id]/$fetch-logs
```

For example:

```bash
medplum get 'Agent/[id]/$fetch-logs'
```

### Multiple Agents

```
[base]/Agent/$fetch-logs
```

For example:

```bash
medplum get 'Agent/$fetch-logs?_tag=Group+A'
```

## Parameters

- `limit` (optional; default: `20`): Maximum number of log entries to return per agent

## Single Agent Response

When querying a single agent by ID, the response is a `Parameters` resource containing the logs.

### Valid Response

Example response when logs are successfully retrieved:

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "logs",
      "valueString": "{\"level\":\"INFO\",\"timestamp\":\"2024-04-19T00:00:00.000Z\",\"msg\":\"Agent started successfully\"}\n{\"level\":\"INFO\",\"timestamp\":\"2024-04-19T00:01:00.000Z\",\"msg\":\"Processing message\"}\n{\"level\":\"ERROR\",\"timestamp\":\"2024-04-19T00:02:00.000Z\",\"msg\":\"An error occurred\",\"error\":\"Error: Connection failed\"}"
    }
  ]
}
```

The `logs` parameter contains a newline-separated string of JSON objects, where each object represents a log message with:

- `level`: Log level (`ERROR`, `WARN`, `INFO`, `DEBUG`)
- `timestamp`: ISO 8601 timestamp
- `msg`: Log message
- Additional fields may be present (e.g., `error` for error logs)

## Multi-Agent Response

When querying multiple agents, the response is a `Bundle` of `Parameters`. Each `Parameters` within the `Bundle` contains an `agent` and a `result`, which is the result of calling the `$fetch-logs` operation on this `Agent`, either a `Parameters` or `OperationOutcome` resource.

### Valid Response

Example response for multiple agents:

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
                  "name": "logs",
                  "valueString": "{\"level\":\"INFO\",\"timestamp\":\"2024-04-19T00:00:00.000Z\",\"msg\":\"Agent started\"}\n{\"level\":\"INFO\",\"timestamp\":\"2024-04-19T00:01:00.000Z\",\"msg\":\"Processing message\"}"
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
              "id": "a1b2c3d4-5e6f-7890-abcd-ef1234567890",
              "meta": {
                "versionId": "f293201a-6925-467f-a92b-496193fb4c39",
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
                    "text": "Failed to fetch logs: Agent not responding"
                  }
                }
              ]
            }
          }
        ]
      }
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

All of the `Agent` search parameters can be used to select which agents to query logs from when using the multi-agent endpoint.

Some useful search parameters are:

- `name`
- `status`
- `_count` and `_offset`

## Recipes

### Single Agent by ID

Fetch logs from a specific agent by ID:

```bash
medplum get 'Agent/93f8b2fb-65a3-4977-a175-71b73b26fde7/$fetch-logs'
```

### Single Agent by ID with Limit

Fetch the last 10 log entries from a specific agent:

```bash
medplum get 'Agent/93f8b2fb-65a3-4977-a175-71b73b26fde7/$fetch-logs?limit=10'
```

### Single Agent by Identifier

Fetch logs from a specific agent by identifier:

```bash
medplum get 'Agent/$fetch-logs?identifier=agent-007'
```

### Multiple Agents by Name

Fetch logs from all agents with a specific name prefix:

```bash
medplum get 'Agent/$fetch-logs?name=Production+Agent'
```

### Multiple Agents by Status

Fetch logs from all active agents:

```bash
medplum get 'Agent/$fetch-logs?status=active'
```

### Multiple Agents with Limit

Fetch logs from all agents, limited to 5 entries per agent:

```bash
medplum get 'Agent/$fetch-logs?limit=5'
```

### Paging Through Agent Logs

Fetch logs from agents in batches, 50 agents at a time:

```bash
medplum get 'Agent/$fetch-logs?_count=50&_offset=0'
medplum get 'Agent/$fetch-logs?_count=50&_offset=50'
```
