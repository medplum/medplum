---
sidebar_position: 2
---

# AI Operation ($ai)

The `$ai` operation is a specialized FHIR operation that allows you to interface with Large Language Models (LLMs) while maintaining clinical context. It supports conversational interactions and can suggest FHIR-based actions through function calling.

## Purpose

Use the `$ai` operation to build natural language interfaces into your application, such as:

- Searching for patients using natural language.
- Drafting clinical notes or `Communication` resources.
- Suggesting structured resource updates based on chat.

## Request Signature

**Endpoint:** `POST [baseUrl]/fhir/R4/$ai`

**Resource Type:** `Parameters`

### Core Input Parameters

| Parameter  | Type     | Required | Description                                     |
| ---------- | -------- | -------- | ----------------------------------------------- |
| `messages` | `string` | Yes      | Stringified JSON array of conversation history. |
| `model`    | `string` | Yes      | The specific model ID (e.g., `gpt-4`).          |
| `apiKey`   | `string` | Yes      | Your OpenAI API key.                            |
| `tools`    | `string` | No       | Definitions for FHIR function calling.          |

## Quick Example

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "messages",
      "valueString": "[{\"role\":\"user\",\"content\":\"Find patient Alice\"}]"
    },
    { "name": "model", "valueString": "gpt-4" },
    { "name": "apiKey", "valueString": "sk-..." }
  ]
}
```

## Response

The operation returns a `Parameters` resource containing a `content` string (the AI's text response) and an optional `tool_calls` string containing suggested FHIR operations.

> **Note:** The server suggests actions but does not execute them. The client application is responsible for validating and performing any suggested FHIR writes.

## Links

[Read the full implementation guide](/docs/ai/ai-operation)
