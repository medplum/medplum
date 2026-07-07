---
sidebar_position: 15
---

# Agent Reload Config

Remotely reloads the configuration of a given agent or agents from the Medplum Server. Useful for pushing changes made to an `Agent` resource (such as adding, removing, or modifying channels) to a running agent without restarting the agent service.

:::info[Minimum versions]

The `$reload-config` operation requires **Medplum Server > 3.1.6** and **Medplum Agent > 3.1.6**. See the [feature matrix](./features.md) for more details.

:::

## Invoke the `$reload-config` operation

### Single Agent

```
[base]/Agent/[id]/$reload-config
```

For example:

```bash
medplum get 'Agent/[id]/$reload-config'
```

### Multiple Agents

```
[base]/Agent/$reload-config
```

For example:

```bash
medplum get 'Agent/$reload-config?status=active'
```

Here, `status=active` is an `Agent` search parameter used to select which agents to reload. See [Using Agent search parameters in bulk operations](./using-search-parameters.md) for more ways to select operation targets.

## Single Agent Response

When invoking the operation on a single agent by ID, the response is the result of the reload request for that agent, either an `OperationOutcome` or `Parameters` resource.

### Valid Response

Example response when the agent accepts the reload request:

```json
{
  "resourceType": "OperationOutcome",
  "id": "ok",
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

## Multi-Agent Response

When invoking the operation without an ID (querying multiple agents via search parameters), the response is a `Bundle` of `Parameters`. Each `Parameters` within the `Bundle` contains an `agent` and a `result`, which is the result of calling the `$reload-config` operation on that `Agent`, either a `Parameters` or `OperationOutcome` resource.

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
              "resourceType": "OperationOutcome",
              "id": "ok",
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
                    "text": "Timeout"
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

Example outcome when no agents match the given query:

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": {
        "text": "No agent(s) for given query"
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

All of the `Agent` search parameters can be used to select which agents to reload when using the multi-agent endpoint.

Some useful search parameters are:

- `name`
- `status`
- `_count` and `_offset`

:::note[Default page size]

When `_count` is omitted, the operation reloads at most the **default page of 20 agents** — it does _not_ automatically run against every matching agent. The maximum allowed `_count` is `100`. To reload more agents than fit on one page, use `_count` and `_offset` to page through the results (see [Paging Through Agents](#paging-through-agents)).

:::

> For more recipes and details on selecting operation targets, see [Using Agent search parameters in bulk operations](./using-search-parameters.md).

## Recipes

### Single Agent by ID

Reload the config for a specific agent:

```bash
medplum get 'Agent/93f8b2fb-65a3-4977-a175-71b73b26fde7/$reload-config'
```

### Single Agent by Identifier

Reload the config for a specific agent by identifier:

```bash
medplum get 'Agent/$reload-config?identifier=agent-007'
```

### Multiple Agents by Name

Reload agents with a specific name prefix (without a `_count`, this acts on at most the default page of 20 agents):

```bash
medplum get 'Agent/$reload-config?name=Production+Agent'
```

### Multiple Agents by Status

Reload active agents (without a `_count`, this acts on at most the default page of 20 agents):

```bash
medplum get 'Agent/$reload-config?status=active'
```

### Paging Through Agents

Reload agents in batches, 50 agents at a time:

```bash
medplum get 'Agent/$reload-config?_count=50&_offset=0'
medplum get 'Agent/$reload-config?_count=50&_offset=50'
```

:::tip[CLI]

You can also invoke this operation using the Medplum CLI's [`agent reload-config` command](./agent-cli-commands.md#reload-config-command).

:::
