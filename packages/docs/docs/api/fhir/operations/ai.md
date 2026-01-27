---
sidebar_position: 23
---

# Parameters $ai

The `$ai` operation provides an interface for calling AI language models (like OpenAI's GPT) through Medplum. This operation supports both standard request/response and streaming modes.

## Use Cases

- **Clinical Decision Support**: Get AI assistance for clinical questions
- **Documentation Assistance**: Help generate clinical notes and summaries
- **Patient Education**: Create patient-friendly explanations of medical concepts
- **Data Analysis**: Analyze and summarize patient data with AI assistance

## Prerequisites

The AI feature must be enabled for your project. Contact your Medplum administrator or ensure `ai` is included in your project's features list.

## Invoke the `$ai` operation

```
[base]/Parameters/$ai
```

For example:

```bash
curl -X POST 'https://api.medplum.com/fhir/R4/Parameters/$ai' \
  -H "Content-Type: application/fhir+json" \
  -H "Authorization: Bearer MY_ACCESS_TOKEN" \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      {
        "name": "messages",
        "valueString": "[{\"role\": \"user\", \"content\": \"What is FHIR?\"}]"
      },
      {
        "name": "apiKey",
        "valueString": "sk-your-openai-api-key"
      },
      {
        "name": "model",
        "valueString": "gpt-4"
      }
    ]
  }'
```

## Parameters

| Name       | Type     | Description                                                    | Required |
| ---------- | -------- | -------------------------------------------------------------- | -------- |
| `messages` | `string` | JSON string containing the conversation messages array         | Yes      |
| `apiKey`   | `string` | OpenAI API key                                                 | Yes      |
| `model`    | `string` | OpenAI model to use (e.g., `gpt-4`, `gpt-3.5-turbo`)           | Yes      |
| `tools`    | `string` | JSON string containing the tools array for function calling    | No       |

### Messages Format

The `messages` parameter should be a JSON-encoded array of message objects following the OpenAI chat format:

```json
[
  {"role": "system", "content": "You are a helpful healthcare assistant."},
  {"role": "user", "content": "What is the normal range for blood pressure?"}
]
```

### Tools Format (Function Calling)

The `tools` parameter enables function calling capabilities:

```json
[
  {
    "type": "function",
    "function": {
      "name": "get_patient_vitals",
      "description": "Retrieve patient vital signs",
      "parameters": {
        "type": "object",
        "properties": {
          "patient_id": {
            "type": "string",
            "description": "The patient's ID"
          }
        },
        "required": ["patient_id"]
      }
    }
  }
]
```

## Output

| Name         | Type     | Description                               |
| ------------ | -------- | ----------------------------------------- |
| `content`    | `string` | The AI response content                   |
| `tool_calls` | `string` | JSON string containing tool calls array   |

### Example Response

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "content",
      "valueString": "FHIR (Fast Healthcare Interoperability Resources) is a standard for exchanging healthcare information electronically..."
    }
  ]
}
```

### Response with Tool Calls

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "tool_calls",
      "valueString": "[{\"id\": \"call_abc123\", \"type\": \"function\", \"function\": {\"name\": \"get_patient_vitals\", \"arguments\": {\"patient_id\": \"patient-123\"}}}]"
    }
  ]
}
```

## Streaming Mode

The operation supports Server-Sent Events (SSE) streaming for real-time responses. To enable streaming, set the `Accept` header to `text/event-stream`:

```bash
curl -X POST 'https://api.medplum.com/fhir/R4/Parameters/$ai' \
  -H "Content-Type: application/fhir+json" \
  -H "Accept: text/event-stream" \
  -H "Authorization: Bearer MY_ACCESS_TOKEN" \
  -d '...'
```

Streaming responses arrive as SSE events:

```
data: {"content": "FHIR "}
data: {"content": "(Fast "}
data: {"content": "Healthcare "}
data: {"content": "Interoperability "}
data: {"content": "Resources) "}
data: [DONE]
```

:::note
Tool calls are not supported in streaming mode.
:::

## Error Responses

### Feature Not Enabled

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "forbidden",
      "details": {
        "text": "Forbidden"
      }
    }
  ]
}
```

### Invalid Messages Format

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": {
        "text": "Messages must be an array"
      }
    }
  ]
}
```

## Security Considerations

- The API key is sent with each request - ensure you're using HTTPS
- Consider using server-side bots to proxy AI calls and protect your API key
- Review AI responses before using them in clinical settings

## Related Documentation

- [Medplum AI Documentation](/docs/ai) - Overview of AI capabilities in Medplum
- [Bots](/docs/bots) - Create server-side automation with AI capabilities
