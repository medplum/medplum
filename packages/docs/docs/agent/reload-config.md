---
sidebar_position: 12
---

# Agent Reload Config

Instructs an agent to reload its configuration from the server. This is useful when you've updated the Agent resource (such as changing endpoints or settings) and want the agent to apply those changes without restarting.

## Invoke the `$reload-config` operation

### Single Agent

```
[base]/Agent/[id]/$reload-config
```

For example:

```bash
medplum get 'Agent/[id]/$reload-config'
```

### All Agents (Bulk Operation)

```
[base]/Agent/$reload-config
```

This will send a reload-config request to all agents matching the search criteria.

```bash
medplum get 'Agent/$reload-config'
```

## Response

### Valid Response

A successful response indicates that the agent received the reload-config request and is reloading its configuration:

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

If the agent is not connected or the request times out:

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

## Use Cases

- **Configuration Updates**: When you modify an Agent's channel settings, endpoints, or other properties
- **Certificate Rotation**: After updating SSL/TLS certificates referenced by the agent
- **Feature Flag Changes**: When enabling or disabling features that require config reload

## Related Documentation

- [Agent Status](./status.md) - Check if an agent is connected before reloading
- [Agent Configuration](./configuration.md) - Learn about agent configuration options