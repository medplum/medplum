---
sidebar_position: 4
toc_max_heading_level: 2
---

# Bot Secrets

## Introduction

- Bots can be used to connect to 3rd party services via API
- Often, this involves reading sensitive data, such as API keys
- To avoid hard-coding this sensitive data in your Bot code, Medplum provides the ability to store secret data on the Bot Resource
- The advantage of this is
  - avoiding leaking keys to unauthorized users
  - Ability to use different keys for development and production projects

## Saving Secrets

Secrets are stored on a per-project basis, and you must be a project administrator to edit secrets.

1. Go to the **Project Admin** page (either by clicking "Project" on the left sidebar, or navigating to https://app.medplum.com/admin/project)
2. Click on the "Secrets" tab
3. Click "Add" to add your new secret. Secrets can have type `string`, `number`, or `boolean`.

![Secrets Tab](/img/tutorials/bot-secrets/secrets-tab.png)

## Using Secrets in Your Bot

Secrets can be accessed from the `event.secret` property, which contains an map from the secret name to the `ProjectSecret` object. [See here](/sdk/interfaces/BotEvent.md#secrets) for more details about `event.secret`

```ts
import { BotEvent, MedplumClient } from '@medplum/core';
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  // Print one secret
  console.log(`Secret: ${event.secrets['MY_API_KEY'].valueString}`);
  return true;
}

// Output: 'Secret: 123456'
```
