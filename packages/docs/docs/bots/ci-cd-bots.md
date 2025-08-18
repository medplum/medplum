---
sidebar_position: 10
---

# CI/CD for Medplum Bots

This guide covers how to implement Continuous Integration and Continuous Deployment (CI/CD) for Medplum bots, using external system integration examples to demonstrate automated testing, deployment, and subscription management.

## Overview

CI/CD for bots involves automating the entire lifecycle of bot development, from code changes to production deployment. This includes:

- **Automated Testing**: Unit tests, integration tests, and validation
- **Automated Deployment**: Building and deploying bots to Medplum
- **Subscription Management**: Automatically creating and managing FHIR subscriptions
- **Environment Management**: Supporting multiple environments (dev, staging, prod)
- **Code Reuse**: Shared modules and utilities across multiple bots

## Project Structure

The CI/CD bots example demonstrates external system integration with this structure:

```
medplum-ci-cd-bots/
├── src/
│   ├── shared/           # Shared utilities and helpers
│   │   └── http-helpers.ts
│   └── bots/            # Individual bot implementations
│       ├── hapi-sync-bot.ts
│       └── hapi-sync-simple-bot.ts
├── scripts/
│   └── setup-bots-and-subscriptions.ts
├── package.json
├── medplum.config.json
├── tsconfig.json
├── esbuild-script.mjs
└── README.md
```

## Configuration

### medplum.config.json

Define your bots and their configurations:

```json
{
  "bots": [
    {
      "name": "sync-bot",
      "id": "ea43eb5a-6caa-4ee0-8292-d6b528d8b737",
      "source": "src/bots/hapi-sync-bot.ts",
      "dist": "dist/bots/hapi-sync-bot.js"
    },
    {
      "name": "sync-simple-bot",
      "id": "735d3edc-c9a5-4f90-b497-6ae08c07aa2b",
      "source": "src/bots/hapi-sync-simple-bot.ts",
      "dist": "dist/bots/hapi-sync-simple-bot.js"
    }
  ]
}
```

### Environment Variables

Set up environment-specific configuration:

```bash
# Development
export MEDPLUM_BASE_URL="https://dev.medplum.com"
export MEDPLUM_CLIENT_ID="your-dev-client-id"
export MEDPLUM_CLIENT_SECRET="your-dev-client-secret"
export NODE_ENV="development"

# Staging
export MEDPLUM_BASE_URL="https://staging.medplum.com"
export MEDPLUM_CLIENT_ID="your-staging-client-id"
export MEDPLUM_CLIENT_SECRET="your-staging-client-secret"
export NODE_ENV="staging"

# Production  
export MEDPLUM_BASE_URL="https://api.medplum.com"
export MEDPLUM_CLIENT_ID="your-prod-client-id"
export MEDPLUM_CLIENT_SECRET="your-prod-client-secret"
export NODE_ENV="production"
```

## Automated Deployment

### Build Process

The project uses esbuild for automated TypeScript compilation and bundling:

```javascript
// esbuild-script.mjs
import { build } from 'esbuild';
import { readdirSync } from 'fs';
import { join } from 'path';

async function buildBots() {
  const botFiles = readdirSync('./src/bots')
    .filter(file => file.endsWith('.ts'))
    .map(file => join('./src/bots', file));

  for (const botFile of botFiles) {
    const botName = botFile.replace('./src/bots/', '').replace('.ts', '');
    console.log(`Building ${botName}...`);
    
    await build({
      entryPoints: [botFile],
      bundle: true,
      platform: 'node',
      target: 'node20',
      outfile: `dist/bots/${botName}.js`,
      external: ['@medplum/core', '@medplum/fhirtypes'],
      format: 'cjs',
      sourcemap: true,
    });
  }
}

buildBots().catch(console.error);
```

### Deployment Script

The setup script automates bot deployment and subscription management:

```typescript
// scripts/setup-bots-and-subscriptions.ts
import { MedplumClient } from '@medplum/core';
import { readFileSync } from 'fs';

async function deployBots(medplum: MedplumClient): Promise<void> {
  const config = JSON.parse(readFileSync('./medplum.config.json', 'utf8'));
  
  for (const bot of config.bots) {
    console.log(`Deploying ${bot.name}...`);
    
    const botSource = readFileSync(bot.source, 'utf8');
    
    if (bot.id) {
      // Update existing bot
      await medplum.updateResource({
        resourceType: 'Bot',
        id: bot.id,
        name: bot.name,
        description: `CI/CD Bot: ${bot.name}`,
        code: botSource,
        runtimeVersion: 'awslambda',
        meta: {
          tag: [
            {
              system: 'https://medplum.com/tags',
              code: 'ci-cd-bot',
              display: 'CI/CD Bot',
            },
          ],
        },
      });
    } else {
      // Create new bot
      await medplum.createResource({
        resourceType: 'Bot',
        name: bot.name,
        description: `CI/CD Bot: ${bot.name}`,
        code: botSource,
        runtimeVersion: 'awslambda',
        meta: {
          tag: [
            {
              system: 'https://medplum.com/tags',
              code: 'ci-cd-bot',
              display: 'CI/CD Bot',
            },
          ],
        },
      });
    }
    
    console.log(`✅ Deployed ${bot.name}`);
  }
}
```

## Subscription Management

### Automated Subscription Creation

The setup script automatically creates subscriptions for all bots:

```typescript
// scripts/setup-bots-and-subscriptions.ts
async function createSubscription(
  medplum: MedplumClient,
  botName: string,
  botId: string
): Promise<any> {
  return await medplum.createResource({
    resourceType: 'Subscription',
    status: 'active',
    reason: `CI/CD Bot: ${botName}`,
    criteria: 'Patient?_lastUpdated=gt2023-01-01',
    channel: {
      type: 'rest-hook',
      endpoint: `https://api.medplum.com/bots/${botName}`,
      payload: 'application/fhir+json',
    },
  });
}

async function createAllSubscriptions(medplum: MedplumClient): Promise<void> {
  const config = JSON.parse(readFileSync('./medplum.config.json', 'utf8'));
  
  for (const bot of config.bots) {
    console.log(`Creating subscription for ${bot.name}...`);
    
    await createSubscription(medplum, bot.name, bot.id);
    
    console.log(`✅ Created subscription for ${bot.name}`);
  }
}
```

## Testing

### Unit Testing

Test individual bot functions and shared utilities:

```typescript
// tests/sync-bot.test.ts
import { makeConditionalFhirRequest, HTTP_VERBS } from '../src/shared/http-helpers';
import { Patient } from '@medplum/fhirtypes';

describe('Sync Bot', () => {
  test('should sync patient to external system', async () => {
    const patient: Patient = {
      resourceType: 'Patient',
      id: 'test-patient-123',
      name: [{ given: ['John'], family: 'Doe' }],
      birthDate: '1990-01-01',
    };
    
    // Mock the external request
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'external-patient-456' }),
    });
    
    const result = await makeConditionalFhirRequest(
      'http://external-system:8080',
      'Patient',
      'identifier=https://medplum.com/patient-id|test-patient-123',
      HTTP_VERBS.PUT,
      patient
    );
    
    expect(result.id).toBe('external-patient-456');
  });
});
```

### Integration Testing

Test bot execution with real Medplum resources:

```typescript
// tests/integration.test.ts
import { MedplumClient } from '@medplum/core';

describe('Sync Bot Integration Tests', () => {
  let medplum: MedplumClient;
  
  beforeAll(() => {
    medplum = new MedplumClient({
      clientId: process.env.MEDPLUM_CLIENT_ID!,
      clientSecret: process.env.MEDPLUM_CLIENT_SECRET!,
      baseUrl: process.env.MEDPLUM_BASE_URL,
    });
  });
  
  test('should sync patient update to external system', async () => {
    // Create a test patient
    const patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ given: ['Test'], family: 'Patient' }],
      birthDate: '1990-01-01',
    });
    
    // Update the patient to trigger the bot
    const updatedPatient = await medplum.updateResource({
      ...patient,
      name: [{ given: ['Updated'], family: 'Patient' }],
    });
    
    // Wait for bot processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verify bot execution logs
    // Note: In a real test, you would check the external system
    // to verify the patient was synced correctly
    expect(updatedPatient.id).toBeDefined();
  });
});
```

## GitHub Actions Workflow

Automate the entire CI/CD process:

```yaml
# .github/workflows/deploy-bots.yml
name: Deploy Sync Bots

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test
      - run: npm run lint

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - run: npm run setup:bots
        env:
          MEDPLUM_CLIENT_ID: ${{ secrets.MEDPLUM_CLIENT_ID }}
          MEDPLUM_CLIENT_SECRET: ${{ secrets.MEDPLUM_CLIENT_SECRET }}
          MEDPLUM_BASE_URL: ${{ secrets.MEDPLUM_BASE_URL }}
```

## Package.json Scripts

The project includes comprehensive CI/CD scripts:

```json
{
  "scripts": {
    "build": "npm run clean && npm run lint && tsc && node --no-warnings esbuild-script.mjs",
    "clean": "rimraf dist",
    "lint": "eslint src/",
    "test": "vitest run",
    "setup:bots": "npm run build && node --loader ts-node/esm scripts/setup-bots-and-subscriptions.ts",
    "deploy:bots": "npm run build && node --loader ts-node/esm scripts/setup-bots-and-subscriptions.ts --deploy-only"
  }
}
```

## Example Implementation

See the complete [CI/CD Bots Example](https://github.com/medplum/medplum/tree/main/examples/medplum-ci-cd-bots) for a full implementation of these patterns.

This example includes:
- External system synchronization bots
- Automated bot deployment and subscription management
- Shared HTTP utilities and error handling
- Comprehensive testing and CI/CD pipeline
- Environment-specific configuration management
