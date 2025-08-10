---
sidebar_position: 10
---

# CI/CD for Medplum Bots

This guide covers how to implement Continuous Integration and Continuous Deployment (CI/CD) for Medplum bots, including automated testing, deployment, and subscription management.

## Overview

CI/CD for bots involves automating the entire lifecycle of bot development, from code changes to production deployment. This includes:

- **Automated Testing**: Unit tests, integration tests, and validation
- **Automated Deployment**: Building and deploying bots to Medplum
- **Subscription Management**: Automatically creating and managing FHIR subscriptions
- **Environment Management**: Supporting multiple environments (dev, staging, prod)

## Project Structure

A typical CI/CD bot project structure looks like this:

```
medplum-ci-cd-bots/
├── src/
│   ├── shared/           # Shared utilities and helpers
│   │   ├── validation-helpers.ts
│   │   ├── audit-helpers.ts
│   │   └── http-helpers.ts
│   └── bots/            # Individual bot implementations
│       ├── patient-validation-bot.ts
│       ├── patient-audit-bot.ts
│       └── resource-sync-bot.ts
├── scripts/
│   └── setup-bots-and-subscriptions.ts
├── package.json
├── medplum.config.json
└── README.md
```

## Configuration

### medplum.config.json

Define your bots and their configurations:

```json
{
  "bots": [
    {
      "name": "patient-validation-bot",
      "source": "src/bots/patient-validation-bot.ts",
      "description": "Validates patient data using shared validation functions"
    },
    {
      "name": "patient-audit-bot", 
      "source": "src/bots/patient-audit-bot.ts",
      "description": "Creates audit events for patient changes"
    }
  ],
  "subscriptions": [
    {
      "botName": "patient-validation-bot",
      "resourceType": "Patient",
      "criteria": "Patient?_lastUpdated=gt2023-01-01",
      "description": "Validate all patient updates"
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

# Production  
export MEDPLUM_BASE_URL="https://api.medplum.com"
export MEDPLUM_CLIENT_ID="your-prod-client-id"
export MEDPLUM_CLIENT_SECRET="your-prod-client-secret"
```

## Automated Deployment

### Build Process

Create a build script that compiles all bots:

```typescript
// scripts/build.ts
import { build } from 'esbuild';
import { readdirSync } from 'fs';
import { join } from 'path';

async function buildBots(): Promise<void> {
  const botFiles = readdirSync('./src/bots')
    .filter(file => file.endsWith('.ts'))
    .map(file => join('./src/bots', file));

  for (const botFile of botFiles) {
    await build({
      entryPoints: [botFile],
      bundle: true,
      platform: 'node',
      target: 'node18',
      outfile: `dist/${botFile.replace('./src/bots/', '').replace('.ts', '.js')}`,
      external: ['@medplum/core', '@medplum/fhirtypes'],
    });
  }
}

buildBots().catch(console.error);
```

### Deployment Script

Automate bot deployment using the Medplum API:

```typescript
// scripts/deploy.ts
import { MedplumClient } from '@medplum/core';
import { readFileSync } from 'fs';

async function deployBots(medplum: MedplumClient): Promise<void> {
  const config = JSON.parse(readFileSync('./medplum.config.json', 'utf8'));
  
  for (const bot of config.bots) {
    console.log(`Deploying ${bot.name}...`);
    
    const botSource = readFileSync(bot.source, 'utf8');
    
    const botResource = await medplum.createResource({
      resourceType: 'Bot',
      name: bot.name,
      description: bot.description,
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
    
    console.log(`✅ Deployed ${bot.name} with ID: ${botResource.id}`);
  }
}
```

## Subscription Management

### Automated Subscription Creation

Create subscriptions automatically for all bots:

```typescript
// scripts/create-subscriptions.ts
import { MedplumClient } from '@medplum/core';

async function createSubscription(
  medplum: MedplumClient,
  botName: string,
  botId: string,
  resourceType: string,
  criteria: string
): Promise<any> {
  return await medplum.createResource({
    resourceType: 'Subscription',
    status: 'active',
    reason: `CI/CD Bot: ${botName}`,
    criteria: criteria,
    channel: {
      type: 'rest-hook',
      endpoint: `https://api.medplum.com/bots/${botName}`,
      payload: 'application/fhir+json',
    },
  });
}

async function createAllSubscriptions(medplum: MedplumClient): Promise<void> {
  const config = JSON.parse(readFileSync('./medplum.config.json', 'utf8'));
  
  for (const subscription of config.subscriptions) {
    console.log(`Creating subscription for ${subscription.botName}...`);
    
    await createSubscription(
      medplum,
      subscription.botName,
      subscription.botId,
      subscription.resourceType,
      subscription.criteria
    );
    
    console.log(`✅ Created subscription for ${subscription.botName}`);
  }
}
```

## Testing

### Unit Testing

Test individual bot functions:

```typescript
// tests/patient-validation-bot.test.ts
import { validatePatientComprehensive } from '../src/shared/validation-helpers';
import { Patient } from '@medplum/fhirtypes';

describe('Patient Validation Bot', () => {
  test('should validate patient with valid data', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      name: [{ given: ['John'], family: 'Doe' }],
      birthDate: '1990-01-01',
    };
    
    const result = validatePatientComprehensive(patient);
    expect(result.isValid).toBe(true);
  });
  
  test('should reject patient with missing required fields', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      // Missing name and birthDate
    };
    
    const result = validatePatientComprehensive(patient);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Name is required');
  });
});
```

### Integration Testing

Test bot execution with real Medplum resources:

```typescript
// tests/integration.test.ts
import { MedplumClient } from '@medplum/core';

describe('Bot Integration Tests', () => {
  let medplum: MedplumClient;
  
  beforeAll(() => {
    medplum = new MedplumClient({
      clientId: process.env.MEDPLUM_CLIENT_ID!,
      clientSecret: process.env.MEDPLUM_CLIENT_SECRET!,
      baseUrl: process.env.MEDPLUM_BASE_URL,
    });
  });
  
  test('should process patient update through validation bot', async () => {
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
    
    // Verify bot created audit event
    const auditEvents = await medplum.search('AuditEvent', {
      'entity.reference': `Patient/${patient.id}`,
    });
    
    expect(auditEvents.entry).toBeDefined();
    expect(auditEvents.entry!.length).toBeGreaterThan(0);
  });
});
```

## GitHub Actions Workflow

Automate the entire CI/CD process:

```yaml
# .github/workflows/deploy-bots.yml
name: Deploy Bots

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test
      - run: npm run lint

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - run: npm run deploy
        env:
          MEDPLUM_CLIENT_ID: ${{ secrets.MEDPLUM_CLIENT_ID }}
          MEDPLUM_CLIENT_SECRET: ${{ secrets.MEDPLUM_CLIENT_SECRET }}
          MEDPLUM_BASE_URL: ${{ secrets.MEDPLUM_BASE_URL }}
      - run: npm run setup:subscriptions
        env:
          MEDPLUM_CLIENT_ID: ${{ secrets.MEDPLUM_CLIENT_ID }}
          MEDPLUM_CLIENT_SECRET: ${{ secrets.MEDPLUM_CLIENT_SECRET }}
          MEDPLUM_BASE_URL: ${{ secrets.MEDPLUM_BASE_URL }}
```

## Monitoring and Observability

### Bot Execution Monitoring

Monitor bot performance and errors:

```typescript
// scripts/monitor-bots.ts
import { MedplumClient } from '@medplum/core';

async function monitorBots(medplum: MedplumClient): Promise<void> {
  // Check bot execution logs
  const logs = await medplum.search('AuditEvent', {
    'agent.who.reference': 'Bot/*',
    '_lastUpdated': 'gt2023-01-01T00:00:00Z',
  });
  
  console.log(`Found ${logs.total} bot executions`);
  
  // Check for errors
  const errors = logs.entry?.filter(entry => 
    entry.resource.outcome?.issue?.some(issue => 
      issue.severity === 'error'
    )
  );
  
  if (errors && errors.length > 0) {
    console.error(`Found ${errors.length} bot errors:`);
    errors.forEach(error => {
      console.error(`- ${error.resource.description}`);
    });
  }
}
```

### Subscription Health Checks

Monitor subscription status:

```typescript
// scripts/check-subscriptions.ts
import { MedplumClient } from '@medplum/core';

async function checkSubscriptions(medplum: MedplumClient): Promise<void> {
  const subscriptions = await medplum.search('Subscription', {
    'reason': 'CI/CD Bot',
  });
  
  for (const entry of subscriptions.entry || []) {
    const subscription = entry.resource;
    console.log(`Subscription ${subscription.id}: ${subscription.status}`);
    
    if (subscription.status !== 'active') {
      console.warn(`⚠️  Subscription ${subscription.id} is not active`);
    }
  }
}
```

## Best Practices

### Code Organization
- Keep bots focused on single responsibilities
- Use shared utilities for common functionality
- Implement consistent error handling
- Document all functions and their parameters

### Deployment Strategy
- Use semantic versioning for bot releases
- Implement rollback procedures
- Test in staging environment before production
- Monitor deployment success rates

### Security
- Use environment-specific credentials
- Implement proper access controls
- Audit bot permissions regularly
- Secure API keys and secrets

### Performance
- Optimize bot execution time
- Implement proper error handling
- Use appropriate subscription criteria
- Monitor resource usage

## Troubleshooting

### Common Issues

1. **Bot Deployment Failures**
   - Check API credentials and permissions
   - Verify bot code syntax
   - Ensure all dependencies are available

2. **Subscription Creation Failures**
   - Verify bot endpoints are correct
   - Check subscription criteria syntax
   - Ensure proper permissions for subscription creation

3. **Bot Execution Errors**
   - Review bot execution logs
   - Check input data validation
   - Verify external service connectivity

### Debugging Tips

- Use detailed logging in bot code
- Test bots locally before deployment
- Monitor subscription delivery status
- Check Medplum dashboard for bot status

## Example Implementation

See the complete [CI/CD Bots Example](https://github.com/medplum/medplum/tree/main/examples/medplum-ci-cd-bots) for a full implementation of these patterns.

This example includes:
- Automated bot deployment
- Subscription management
- Shared code utilities
- Comprehensive testing
- GitHub Actions workflow
- Monitoring and observability 