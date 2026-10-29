---
sidebar_position: 4
---

# AI Gateway

The Medplum AI gateway exposes Claude through the standard Anthropic Messages API. Clients authenticate with a Medplum access token, and Medplum forwards each request to Anthropic models on AWS Bedrock. Because the gateway speaks the standard API, the Anthropic SDKs and agents that accept a custom base URL work without changes, and no model provider credentials leave the Medplum server.

## Endpoint

```
POST https://api.medplum.com/ai/anthropic/v1/messages
```

Set your client's base URL to `https://api.medplum.com/ai/anthropic` and use a Medplum access token as the API key. The token can be sent as `x-api-key` (the Anthropic SDK default) or as `Authorization: Bearer`.

The request and response bodies are those of the [Anthropic Messages API](https://docs.claude.com/en/api/messages), including streaming with server-sent events and tool use. Errors use the Anthropic error shape.

## Requirements

- The project must have the `ai-gateway` feature enabled.
- The caller must be a Practitioner or a ClientApplication. Patient and RelatedPerson logins, and logins limited by SMART resource scopes, are not allowed.
- The `model` is an Anthropic model ID on Bedrock, such as `us.anthropic.claude-sonnet-4-5-20250929-v1:0`. See [Choosing a model](#choosing-a-model).

## Choosing a model

Clients choose the model with the `model` field. Send any Anthropic model or cross-region inference profile ID available on Bedrock (`anthropic.claude-…`, or with a `us.`, `eu.`, `apac.` or `global.` prefix). Other models are rejected.

The server calls Bedrock in its own AWS region, so use a prefix that matches it: `us.` for US regions, `eu.` for EU regions, or `global.` for any region.

## Examples

### Anthropic SDK

```ts
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  baseURL: 'https://api.medplum.com/ai/anthropic',
  apiKey: medplum.getAccessToken(),
});

const message = await anthropic.messages.create({
  model: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Summarize this patient note: ...' }],
});
```

### Coding agents

Agents that read the Anthropic base URL from the environment can use the gateway directly:

```bash
export ANTHROPIC_BASE_URL=https://api.medplum.com/ai/anthropic
export ANTHROPIC_AUTH_TOKEN=<medplum access token>
export ANTHROPIC_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0
export ANTHROPIC_SMALL_FAST_MODEL=us.anthropic.claude-haiku-4-5-20251001-v1:0
```

Set the small model too: agents use it for background tasks, and without it they request a model name the gateway does not accept.

## Self-hosting

The gateway is available on every server and is enabled per project with the `ai-gateway` project feature. The server calls Bedrock in `awsRegion`, and request bodies may be up to 20 MB.

The server uses its own AWS credentials. Grant its role `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream`. With the Medplum CDK, set `aiGatewayBedrockEnabled: true` in the infra config.
