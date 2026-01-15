---
sidebar_position: 13
---

# Agent Upgrade

Instructs an agent to upgrade itself to a newer version. The agent will download and install the specified version (or the latest version if not specified) and restart with the new code.

## Invoke the `$upgrade` operation

### Single Agent

```
[base]/Agent/[id]/$upgrade
```

For example:

```bash
medplum get 'Agent/[id]/$upgrade'
```

### All Agents (Bulk Operation)

```
[base]/Agent/$upgrade
```

This will send an upgrade request to all agents matching the search criteria.

```bash
medplum get 'Agent/$upgrade'
```

## Parameters

| Name      | Type      | Description                                                             | Required |
| --------- | --------- | ----------------------------------------------------------------------- | -------- |
| `version` | `string`  | The version to upgrade to. If not specified, upgrades to latest version | No       |
| `timeout` | `integer` | Request timeout in milliseconds (default: 45000, max: 56000)            | No       |
| `force`   | `boolean` | Force upgrade even if already on the target version                     | No       |

### Example with Parameters

Upgrade to a specific version:

```bash
medplum get 'Agent/[id]/$upgrade?version=3.2.0'
```

Force upgrade with extended timeout:

```bash
medplum get 'Agent/[id]/$upgrade?version=3.2.0&force=true&timeout=50000'
```

## Response

### Valid Response

A successful response indicates that the agent received the upgrade request and is processing the upgrade:

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
              "id": "example-agent-id",
              "name": "My Agent"
            }
          },
          {
            "name": "result",
            "resource": {
              "resourceType": "Parameters",
              "parameter": [
                {
                  "name": "success",
                  "valueBoolean": true
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

### Error Response

If the agent is not connected, the upgrade fails, or the request times out:

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "exception",
      "details": {
        "text": "Timeout waiting for agent response"
      }
    }
  ]
}
```

## Upgrade Process

1. The server sends the upgrade command to the connected agent
2. The agent downloads the new version from the Medplum release server
3. The agent validates the download and prepares for upgrade
4. The agent restarts with the new version
5. After restart, the agent reconnects to the server

:::note
The agent will be temporarily unavailable during the upgrade process. Plan upgrades during maintenance windows when possible.
:::

## Use Cases

- **Security Updates**: Apply security patches to agents
- **Feature Updates**: Deploy new agent capabilities
- **Bug Fixes**: Roll out fixes for known issues
- **Fleet Management**: Keep all agents on consistent versions

## Related Documentation

- [Agent Status](./status.md) - Check agent version and connection status
- [Agent Bulk Status](./bulk-status.md) - Check versions across multiple agents