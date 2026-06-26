---
sidebar_position: 13
---

# Agent Stats

Fetches runtime statistics from a given agent or agents. Useful for monitoring connection counts, queue depths, RTT metrics, and overall agent health.

## Invoke the `$stats` operation

### Single Agent

```
[base]/Agent/[id]/$stats
```

For example:

```bash
medplum get 'Agent/[id]/$stats'
```

### Multiple Agents

```
[base]/Agent/$stats
```

For example:

```bash
medplum get 'Agent/$stats?_tag=Group+A'
```

Here, `_tag=Group+A` is an `Agent` search parameter used to select which agents to fetch stats from. For example, to fetch stats from all active agents use `status=active`. See [Using Agent search parameters in bulk operations](./using-search-parameters.md) for more ways to select operation targets.

## Single Agent Response

When querying a single agent by ID, the response is a `Parameters` resource containing the stats payload.

### Valid Response

Example response when stats are successfully retrieved:

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "stats",
      "valueString": "{\"hl7ConnectionsOpen\":1,\"ping\":5,\"webSocketQueueDepth\":0,\"hl7QueueDepth\":0,\"hl7ClientCount\":0,\"live\":true,\"outstandingHeartbeats\":0,\"channelStats\":{},\"clientStats\":{}}"
    }
  ]
}
```

The `stats` parameter contains a JSON-encoded object describing the agent's runtime state. Known fields include:

- `hl7ConnectionsOpen`: Number of currently open inbound HL7 connections
- `ping`: Most recent measured ping (round-trip time) to the Medplum server, in milliseconds
- `webSocketQueueDepth`: Number of messages currently queued for delivery over the WebSocket
- `hl7QueueDepth`: Number of HL7 messages currently queued for processing
- `hl7ClientCount`: Number of outbound HL7 client connections currently held in the pool
- `live`: Whether the agent considers itself live and connected to the server
- `outstandingHeartbeats`: Number of outstanding (unacknowledged) heartbeats sent to the server
- `channelStats`: Per-channel statistics, including round-trip-time metrics for inbound channels
- `clientStats`: Per-remote statistics for outbound HL7 clients, including round-trip-time metrics

Additional fields may be present and should be treated as informational.

## Multi-Agent Response

When querying multiple agents, the response is a `Bundle` of `Parameters`. Each `Parameters` within the `Bundle` contains an `agent` and a `result`, which is the result of calling the `$stats` operation on this `Agent`, either a `Parameters` or `OperationOutcome` resource.

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
                  "name": "stats",
                  "valueString": "{\"hl7ConnectionsOpen\":1,\"ping\":5,\"webSocketQueueDepth\":0,\"hl7QueueDepth\":0,\"hl7ClientCount\":0,\"live\":true,\"outstandingHeartbeats\":0,\"channelStats\":{},\"clientStats\":{}}"
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
                    "text": "Failed to fetch stats: Agent not responding"
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

## Using search parameters

All of the `Agent` search parameters can be used to select which agents to query stats from when using the multi-agent endpoint.

Some useful search parameters are:

- `name`
- `status`
- `_count` and `_offset`

:::note[Default page size]

When `_count` is omitted, the operation fetches stats from at most the **default page of 20 agents** — it does _not_ automatically run against every matching agent. The maximum allowed `_count` is `100`. To cover more agents than fit on one page, use `_count` and `_offset` to page through the results (see [Paging Through Agent Stats](#paging-through-agent-stats)).

:::

> For more recipes and details on selecting operation targets, see [Using Agent search parameters in bulk operations](./using-search-parameters.md).

## Recipes

### Single Agent by ID

Fetch stats from a specific agent by ID:

```bash
medplum get 'Agent/93f8b2fb-65a3-4977-a175-71b73b26fde7/$stats'
```

### Single Agent by Identifier

Fetch stats from a specific agent by identifier:

```bash
medplum get 'Agent/$stats?identifier=agent-007'
```

### Multiple Agents by Name

Fetch stats from agents with a specific name prefix (without a `_count`, this acts on at most the default page of 20 agents):

```bash
medplum get 'Agent/$stats?name=Production+Agent'
```

### Multiple Agents by Status

Fetch stats from active agents (without a `_count`, this acts on at most the default page of 20 agents):

```bash
medplum get 'Agent/$stats?status=active'
```

### Paging Through Agent Stats

Fetch stats from agents in batches, 50 agents at a time:

```bash
medplum get 'Agent/$stats?_count=50&_offset=0'
medplum get 'Agent/$stats?_count=50&_offset=50'
```
