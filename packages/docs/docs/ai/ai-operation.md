---
sidebar_position: 5
---

# Medplum `$ai` Operation

Medplum's `$ai` operation enables integration with large language models (LLMs) through a FHIR-compliant interface. This operation allows you to leverage AI capabilities for conversational interactions and FHIR function calling within your healthcare applications.

## Overview

The AI operation provides:

- **Direct OpenAI Integration**: Call OpenAI models (GPT-4, GPT-3.5-turbo, etc.) through Medplum's FHIR API
- **FHIR Function Calling**: Enable AI models to suggest FHIR operations (search, create, update, delete resources)
- **Streaming Support**: Get real-time streaming responses for conversational interfaces
- **Conversation History**: Maintain multi-turn conversations with full message history

## Prerequisites

Before using the `$ai` operation, you need:

1. **Enable AI Feature**: The `ai` feature must be enabled on your Medplum project
2. **OpenAI API Key**: A valid OpenAI API key (starts with `sk-`)

## Endpoint

```
POST [baseUrl]/fhir/R4/$ai
```

## Parameters

### Input Parameters

| Name       | Type   | Required | Description                                                                                                                                          |
| ---------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `messages` | string | Yes      | JSON string containing the conversation messages array. Each message should have `role` (`user`, `assistant`, or `system`) and `content` properties. |
| `apiKey`   | string | Yes      | Your OpenAI API key (e.g., `sk-...`)                                                                                                                 |
| `model`    | string | Yes      | OpenAI model to use (e.g., `gpt-4`, `gpt-3.5-turbo`, `gpt-4-turbo`)                                                                                  |
| `tools`    | string | No       | JSON string containing the tools array for function calling (optional)                                                                               |

### Output Parameters

| Name         | Type   | Description                                                                   |
| ------------ | ------ | ----------------------------------------------------------------------------- |
| `content`    | string | The AI-generated response text                                                |
| `tool_calls` | string | JSON string containing tool calls array (if the AI decided to call functions) |

## Basic Usage

### Simple Conversation

Here's a basic example without function calling:

```bash
curl 'https://api.medplum.com/fhir/R4/$ai' \
  -X POST \
  -H "Content-Type: application/fhir+json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      {
        "name": "messages",
        "valueString": "[{\"role\":\"user\",\"content\":\"What is FHIR?\"}]"
      },
      {
        "name": "apiKey",
        "valueString": "sk-your-api-key"
      },
      {
        "name": "model",
        "valueString": "gpt-4"
      }
    ]
  }'
```

**Response**:

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

### Multi-Turn Conversation

To maintain conversation context, include previous messages:

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "messages",
      "valueString": "[{\"role\":\"user\",\"content\":\"What is FHIR?\"},{\"role\":\"assistant\",\"content\":\"FHIR is a standard...\"},{\"role\":\"user\",\"content\":\"What resources does it define?\"}]"
    },
    {
      "name": "apiKey",
      "valueString": "sk-your-api-key"
    },
    {
      "name": "model",
      "valueString": "gpt-4"
    }
  ]
}
```

## FHIR Function Calling

The AI operation supports function calling, enabling AI models to suggest FHIR operations based on user requests.

### Defining FHIR Tools

Define a `fhir_request` tool to allow the AI to interact with FHIR resources:

```json
{
  "type": "function",
  "function": {
    "name": "fhir_request",
    "description": "Make a FHIR request to the Medplum server. Use this to search, read, create, update, or delete FHIR resources.",
    "parameters": {
      "type": "object",
      "properties": {
        "method": {
          "type": "string",
          "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"],
          "description": "HTTP method for the FHIR request"
        },
        "path": {
          "type": "string",
          "description": "FHIR resource path (e.g., 'Patient?name=Smith' or 'Patient/123')"
        },
        "body": {
          "type": "object",
          "description": "FHIR resource to create or update (for POST, PUT, PATCH)"
        }
      },
      "required": ["method", "path"]
    }
  }
}
```

### Example: AI-Suggested Patient Search

**Request**:

```bash
curl 'https://api.medplum.com/fhir/R4/$ai' \
  -X POST \
  -H "Content-Type: application/fhir+json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      {
        "name": "messages",
        "valueString": "[{\"role\":\"user\",\"content\":\"Find patient with phone 718-564-9483\"}]"
      },
      {
        "name": "apiKey",
        "valueString": "sk-your-api-key"
      },
      {
        "name": "model",
        "valueString": "gpt-4"
      },
      {
        "name": "tools",
        "valueString": "[{\"type\":\"function\",\"function\":{\"name\":\"fhir_request\",\"description\":\"Make a FHIR request...\",\"parameters\":{...}}}]"
      }
    ]
  }'
```

**Response**:

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "content",
      "valueString": "I'll search for the patient with that phone number."
    },
    {
      "name": "tool_calls",
      "valueString": "[{\"id\":\"call_123\",\"type\":\"function\",\"function\":{\"name\":\"fhir_request\",\"arguments\":{\"method\":\"GET\",\"path\":\"Patient?phone=718-564-9483\"}}}]"
    }
  ]
}
```

### Example: AI-Suggested Resource Creation

**Request** (asking AI to create a task):

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "messages",
      "valueString": "[{\"role\":\"user\",\"content\":\"Create a task to fill up chart note\"}]"
    },
    {
      "name": "apiKey",
      "valueString": "sk-your-api-key"
    },
    {
      "name": "model",
      "valueString": "gpt-4"
    },
    {
      "name": "tools",
      "valueString": "[{\"type\":\"function\",\"function\":{\"name\":\"fhir_request\",\"description\":\"Make a FHIR request...\",\"parameters\":{...}}}]"
    }
  ]
}
```

**Response**:

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "content",
      "valueString": "I'll create a task for filling up the chart note."
    },
    {
      "name": "tool_calls",
      "valueString": "[{\"id\":\"call_xyz\",\"type\":\"function\",\"function\":{\"name\":\"fhir_request\",\"arguments\":{\"method\":\"POST\",\"path\":\"Task\",\"body\":{\"resourceType\":\"Task\",\"status\":\"requested\",\"intent\":\"order\",\"description\":\"Fill up chart note\"}}}}]"
    }
  ]
}
```

## Streaming Responses

For real-time conversational interfaces, you can enable streaming by setting the `Accept` header:

```bash
curl 'https://api.medplum.com/fhir/R4/$ai' \
  -X POST \
  -H "Content-Type: application/fhir+json" \
  -H "Accept: text/event-stream" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      {
        "name": "messages",
        "valueString": "[{\"role\":\"user\",\"content\":\"Explain FHIR resources\"}]"
      },
      {
        "name": "apiKey",
        "valueString": "sk-your-api-key"
      },
      {
        "name": "model",
        "valueString": "gpt-4"
      }
    ]
  }'
```

The response will be in Server-Sent Events (SSE) format:

```
data: {"content":"FHIR"}

data: {"content":" resources"}

data: {"content":" are"}

data: [DONE]
```

**Note**: Tool calls are not supported in streaming mode.

## Using with TypeScript SDK

```typescript
import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient();

// Simple conversation
const response = await medplum.fhirUrl('$ai').post({
  resourceType: 'Parameters',
  parameter: [
    {
      name: 'messages',
      valueString: JSON.stringify([{ role: 'user', content: 'What is FHIR?' }]),
    },
    {
      name: 'apiKey',
      valueString: 'sk-your-api-key',
    },
    {
      name: 'model',
      valueString: 'gpt-4',
    },
  ],
});

const content = response.parameter?.find((p) => p.name === 'content')?.valueString;
console.log(content);
```

### With Function Calling

```typescript
const fhirTools = [
  {
    type: 'function' as const,
    function: {
      name: 'fhir_request',
      description: 'Make a FHIR request to the Medplum server...',
      parameters: {
        type: 'object' as const,
        properties: {
          method: {
            type: 'string' as const,
            enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
          },
          path: {
            type: 'string' as const,
            description: 'FHIR resource path',
          },
          body: {
            type: 'object' as const,
            description: 'Resource body for POST/PUT/PATCH',
          },
        },
        required: ['method', 'path'],
      },
    },
  },
];

const response = await medplum.fhirUrl('$ai').post({
  resourceType: 'Parameters',
  parameter: [
    {
      name: 'messages',
      valueString: JSON.stringify([{ role: 'user', content: 'Create a patient named John Smith' }]),
    },
    {
      name: 'apiKey',
      valueString: 'sk-your-api-key',
    },
    {
      name: 'model',
      valueString: 'gpt-4',
    },
    {
      name: 'tools',
      valueString: JSON.stringify(fhirTools),
    },
  ],
});

// Check for tool calls
const toolCallsParam = response.parameter?.find((p) => p.name === 'tool_calls');
if (toolCallsParam?.valueString) {
  const toolCalls = JSON.parse(toolCallsParam.valueString);
  console.log('AI suggested:', toolCalls);

  // Execute the suggested FHIR operation
  for (const call of toolCalls) {
    const { method, path, body } = call.function.arguments;
    // Implement your logic to execute the FHIR request
  }
}
```

## Security Considerations

1. **API Key Management**: Never expose your OpenAI API key in client-side code. Store it securely and only pass it from server-side code.

2. **Feature Gating**: The AI feature must be explicitly enabled on your project. This prevents unauthorized usage.

3. **Tool Execution**: The `$ai` operation returns suggested tool calls but does not execute them. Your application is responsible for:
   - Validating tool call parameters
   - Checking user permissions
   - Executing FHIR operations safely

4. **Rate Limiting**: Consider implementing rate limiting to prevent excessive OpenAI API usage and costs.

5. **Input Validation**: Always validate and sanitize user input before passing it to the AI operation.

## Error Handling

### Missing API Key

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": {
        "text": "Expected 1 value(s) for input parameter apiKey, but 0 provided"
      }
    }
  ]
}
```

### Invalid OpenAI API Key

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": {
        "text": "Failed to call OpenAI API: OpenAI API error: 401 Unauthorized - Incorrect API key provided"
      }
    }
  ]
}
```

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

## Limitations

- **Streaming Mode**: Tool calls are not supported when streaming is enabled
- **Model Support**: Only OpenAI models are currently supported
- **Tool Execution**: The operation returns suggested tool calls but does not execute them automatically

## Common Use Cases

1. **AI-Assisted Patient Search**: Use natural language to search for patients
2. **Clinical Documentation**: Generate structured clinical notes from conversational input
3. **FHIR Resource Creation**: Create FHIR resources through natural language commands
4. **Data Extraction**: Extract structured data from unstructured clinical text
5. **Patient Communication**: Build AI-powered chatbots for patient engagement
6. **Clinical Decision Support**: Provide AI-assisted recommendations based on patient data

## Related Documentation

- [FHIR Operations Framework](/docs/api/fhir/operations)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Medplum Project Features](/docs/access/projects)
- [AI and Medplum](/docs/ai)
