---
sidebar_position: 20
---

# Subscription $get-ws-binding-token Operation

Medplum implements the FHIR R5 [`$get-ws-binding-token` operation](https://build.fhir.org/subscription-operation-get-ws-binding-token.html) (backported to R4).

This operation is used to get a token for a WebSocket client to use when connecting to the Medplum WebSocket endpoint for real-time subscription notifications.

## Prerequisites

WebSocket subscriptions must be enabled for your project. Contact your Medplum administrator or enable it in your project settings.

## Invoke the `$get-ws-binding-token` operation

### For a Specific Subscription

```
[base]/Subscription/[id]/$get-ws-binding-token
```

For example:

```bash
curl -X POST 'https://api.medplum.com/fhir/R4/Subscription/[id]/$get-ws-binding-token' \
  -H "Content-Type: application/fhir+json" \
  -H "Authorization: Bearer MY_ACCESS_TOKEN"
```

### Parameters

| Name | Type | Description                                          | Required |
| ---- | ---- | ---------------------------------------------------- | -------- |
| `id` | `id` | The ID of the Subscription to get a binding token for | No*      |

*At the instance level (with ID in URL), this parameter is ignored.

### Output

| Name            | Type       | Description                                               |
| --------------- | ---------- | --------------------------------------------------------- |
| `token`         | `string`   | An access token for WebSocket authentication              |
| `expiration`    | `dateTime` | The date and time when the token expires (1 hour)         |
| `subscription`  | `string`   | The subscription ID this token is valid for               |
| `websocket-url` | `url`      | The WebSocket URL to connect to                           |

### Example Response

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "token",
      "valueString": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
    },
    {
      "name": "expiration",
      "valueDateTime": "2024-01-15T15:30:00.000Z"
    },
    {
      "name": "subscription",
      "valueString": "abc123-subscription-id"
    },
    {
      "name": "websocket-url",
      "valueUrl": "wss://api.medplum.com/ws/subscriptions-r4"
    }
  ]
}
```

## Using the Token

Once you have the binding token, connect to the WebSocket URL and use the token for authentication:

```javascript
const response = await medplum.get(
  `fhir/R4/Subscription/${subscriptionId}/$get-ws-binding-token`
);

const token = response.parameter.find(p => p.name === 'token')?.valueString;
const wsUrl = response.parameter.find(p => p.name === 'websocket-url')?.valueUrl;

const ws = new WebSocket(`${wsUrl}?token=${token}`);

ws.onmessage = (event) => {
  const notification = JSON.parse(event.data);
  console.log('Received notification:', notification);
};
```

## Error Responses

### WebSocket Subscriptions Not Enabled

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": {
        "text": "WebSocket subscriptions not enabled for current project"
      }
    }
  ]
}
```

### Subscription Not Found

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "not-found",
      "details": {
        "text": "Error reading subscription: Not found"
      }
    }
  ]
}
```

## Related Documentation

- [Subscriptions Overview](/docs/subscriptions) - Learn about Medplum subscriptions
- [Publish and Subscribe](/docs/subscriptions/publish-and-subscribe) - Real-time data patterns
- [WebSocket Subscriptions Demo](https://github.com/medplum/medplum/tree/main/examples/medplum-websocket-subscriptions-demo) - Example implementation