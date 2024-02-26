---
sidebar_position: 5
toc_max_heading_level: 2
---

# Bot Secrets

## Introduction

One of the use cases for Bots is to connect to 3rd-party APIs, which often involves using sensitive data, such as API keys. To avoid hard-coding these keys, Medplum provides the ability to store secrets in your Project.

The advantage of handling secrets this way is:

- It avoids leaking keys to unauthorized users
- You can use different keys for in different projects. For example, you might have a "development" project to prototype your integration, and a "production" that serves your customers.

## Saving Secrets

Secrets are stored on a per-project basis, and you must be a project administrator to edit secrets.

1. Go to the **Project Admin** page (either by clicking "Project" on the left sidebar, or navigating to https://app.medplum.com/admin/project)
2. Click on the "Secrets" tab
3. Click "Add" to add your new secret. Secrets can have type `string`, `number`, or `boolean`.

![Secrets Tab](/img/tutorials/bot-secrets/secrets-tab.png)

## Using Secrets in Your Bot

Secrets can be accessed from the `event.secret` property, which contains an map from the secret name to the `ProjectSecret` object. [See here](/docs/sdk/core.botevent.secrets) for more details about `event.secret`

```ts
import { BotEvent, MedplumClient } from '@medplum/core';
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  // Print one secret
  console.log(`Secret: ${event.secrets['MY_API_KEY'].valueString}`);
  return true;
}

// Output: 'Secret: 123456'
```
