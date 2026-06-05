---
sidebar_position: 14
---

# Agent Upgrade

Remotely upgrades the Medplum Agent software for a given agent or agents. Useful for rolling out new agent versions without needing physical or remote access to the host machine running the agent.

:::info[Minimum versions]

The `$upgrade` operation requires **Medplum Server > 3.1.9** and **Medplum Agent > 3.1.10**. See the [feature matrix](./features.md) for more details.

:::

## Invoke the `$upgrade` operation

### Single Agent

```
[base]/Agent/[id]/$upgrade
```

For example:

```bash
medplum get 'Agent/[id]/$upgrade'
```

### Multiple Agents

```
[base]/Agent/$upgrade
```

For example:

```bash
medplum get 'Agent/$upgrade?status=active'
```

Here, `status=active` is an `Agent` search parameter used to select which agents to upgrade. See [Using Agent search parameters in bulk operations](./using-search-parameters.md) for more ways to select operation targets.

## Parameters

- `version` (optional; default: latest published version): The version to upgrade the agent(s) to. When omitted, the agent upgrades to the latest available version.
- `timeout` (optional; default: `45000`, max: `56000`): How long, in milliseconds, the server waits for the agent to acknowledge the upgrade request before returning an error. Values above the maximum are clamped to `56000`.
- `force` (optional; default: `false`): When `true`, instructs the agent to upgrade even if it is already running the requested version.

> The parameters above configure _how_ the upgrade runs. To select _which_ agents to upgrade when using the multi-agent endpoint, use `Agent` search parameters — see [Using Agent search parameters in bulk operations](./using-search-parameters.md).

## Single Agent Response

When invoking the operation on a single agent by ID, the response is the result of the upgrade request for that agent, either an `OperationOutcome` or `Parameters` resource.

### Valid Response

Example response when the agent accepts the upgrade request:

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

When invoking the operation without an ID (querying multiple agents via search parameters), the response is a `Bundle` of `Parameters`. Each `Parameters` within the `Bundle` contains an `agent` and a `result`, which is the result of calling the `$upgrade` operation on that `Agent`, either a `Parameters` or `OperationOutcome` resource.

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

All of the `Agent` search parameters can be used to select which agents to upgrade when using the multi-agent endpoint.

Some useful search parameters are:

- `name`
- `status`
- `_count` and `_offset`

:::note[Default page size]

When `_count` is omitted, the operation upgrades at most the **default page of 20 agents** — it does _not_ automatically run against every matching agent. The maximum allowed `_count` is `100`. To upgrade more agents than fit on one page, use `_count` and `_offset` to page through the results (see [Paging Through Agents](#paging-through-agents)).

:::

## Recipes

### Single Agent by ID

Upgrade a specific agent to the latest version:

```bash
medplum get 'Agent/93f8b2fb-65a3-4977-a175-71b73b26fde7/$upgrade'
```

### Single Agent to a Specific Version

Upgrade a specific agent to a pinned version:

```bash
medplum get 'Agent/93f8b2fb-65a3-4977-a175-71b73b26fde7/$upgrade?version=3.1.10'
```

### Single Agent by Identifier

Upgrade a specific agent by identifier:

```bash
medplum get 'Agent/$upgrade?identifier=agent-007'
```

### Multiple Agents by Name

Upgrade agents with a specific name prefix (without a `_count`, this acts on at most the default page of 20 agents):

```bash
medplum get 'Agent/$upgrade?name=Production+Agent'
```

### Multiple Agents by Status

Upgrade active agents (without a `_count`, this acts on at most the default page of 20 agents):

```bash
medplum get 'Agent/$upgrade?status=active'
```

### Force an Upgrade

Upgrade an agent even if it is already running the requested version:

```bash
medplum get 'Agent/93f8b2fb-65a3-4977-a175-71b73b26fde7/$upgrade?version=3.1.10&force=true'
```

### Setting a Custom Timeout

Wait up to 30 seconds for the agent to acknowledge the upgrade request:

```bash
medplum get 'Agent/93f8b2fb-65a3-4977-a175-71b73b26fde7/$upgrade?timeout=30000'
```

### Paging Through Agents

Upgrade agents in batches, 50 agents at a time:

```bash
medplum get 'Agent/$upgrade?_count=50&_offset=0'
medplum get 'Agent/$upgrade?_count=50&_offset=50'
```

:::tip[CLI]

You can also invoke this operation using the Medplum CLI's [`agent upgrade` command](./agent-cli-commands.md#upgrade-command).

:::
