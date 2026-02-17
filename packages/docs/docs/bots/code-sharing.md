---
sidebar_position: 11
---

# Code Sharing in Medplum Bots

This guide explains how to enable and implement code sharing in Medplum bots, using external system integration examples to demonstrate reusable functions, utilities, and patterns across multiple bots.

## Overview

Code sharing in Medplum bots is achieved through **shared modules** that are bundled with each bot during deployment. Unlike traditional applications where shared code is deployed separately, Medplum bots must include all their dependencies in the deployed code.

## How Code Sharing Works in Medplum Bots

### The Challenge

Medplum bots are deployed as self-contained functions. Each bot runs in isolation and cannot access external libraries or shared code at runtime. This means:

- **No external dependencies**: Bots cannot import from npm packages at runtime
- **No shared services**: Bots cannot call external APIs for shared functionality
- **No file system access**: Bots cannot read shared files from disk

### The Solution: Bundled Code Sharing

Code sharing in Medplum bots works by **bundling shared code directly into each bot** during the build process. This approach:

- **Includes shared functions**: All shared code is copied into each bot
- **Maintains isolation**: Each bot remains self-contained
- **Enables reuse**: Multiple bots can use the same shared functions
- **Supports updates**: Changes to shared code are deployed with each bot

## Project Structure for Code Sharing

The CI/CD bots example demonstrates effective code sharing with this structure:

```
src/
├── shared/                    # Shared code modules
│   └── http-helpers.ts       # Shared HTTP utilities for external APIs
├── bots/                    # Individual bot implementations
│   ├── hapi-sync-bot.ts
│   └── hapi-sync-simple-bot.ts
├── scripts/                 # Build and deployment scripts
│   └── setup-bots-and-subscriptions.ts
├── esbuild-script.mjs       # Build configuration
└── package.json
```

## Step 1: Create Shared Modules

### Shared HTTP Helpers

The example project includes comprehensive HTTP utilities for external API communication:

```typescript
// src/shared/http-helpers.ts
import { OperationOutcomeError } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';

/** HTTP methods used for external API operations */
export enum HTTP_VERBS {
  'PUT', // Create or update resource
  'DELETE', // Delete resource
}

/**
 * Makes an HTTP request to an external service with standardized error handling
 */
export async function makeExternalRequest(
  url: string,
  method: HTTP_VERBS,
  body?: any,
  headers: Record<string, string> = {}
): Promise<any> {
  try {
    const response = await fetch(url, {
      method: HTTP_VERBS[method],
      headers: {
        accept: 'application/fhir+json',
        'Content-Type': 'application/fhir+json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : null,
    });

    if (!response.ok) {
      // Create standardized OperationOutcome error
      const operationOutcome: OperationOutcome = {
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'processing',
            diagnostics: `External request failed: ${response.status} ${response.statusText}`,
          },
        ],
      };
      throw new OperationOutcomeError(operationOutcome);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof OperationOutcomeError) {
      throw error;
    }
    
    // Convert other errors to OperationOutcome
    const operationOutcome: OperationOutcome = {
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'exception',
          diagnostics: `Network or processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
    };
    throw new OperationOutcomeError(operationOutcome);
  }
}

/**
 * Makes a conditional FHIR request to an external FHIR server
 */
export async function makeConditionalFhirRequest(
  baseUrl: string,
  resourceType: string,
  conditionalQuery: string,
  method: HTTP_VERBS,
  resource?: any
): Promise<any> {
  const url = `${baseUrl}/${resourceType}?${conditionalQuery}`;
  return await makeExternalRequest(url, method, resource);
}

/**
 * Logs external request results for monitoring and debugging
 */
export function logExternalRequest(
  operation: string,
  resourceId: string,
  success: boolean,
  error?: string
): void {
  console.log(`External Request: ${operation} for ${resourceId} - ${success ? 'SUCCESS' : 'FAILED'}`);
  if (error) {
    console.error(`Error: ${error}`);
  }
}
```

## Step 2: Configure Build Process

### Install Required Dependencies

```bash
npm install --save-dev esbuild @types/node typescript
```

### Create Build Configuration

```javascript
// esbuild-script.mjs
import { build } from 'esbuild';
import { readdirSync } from 'fs';
import { join } from 'path';

async function buildBot(botFile, outputFile) {
  await build({
    entryPoints: [botFile],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outfile: outputFile,
    external: ['@medplum/core', '@medplum/fhirtypes'],
    format: 'cjs',
    sourcemap: true,
  });
}

async function buildAllBots() {
  const botFiles = readdirSync('./src/bots')
    .filter(file => file.endsWith('.ts'))
    .map(file => join('./src/bots', file));

  for (const botFile of botFiles) {
    const botName = botFile.replace('./src/bots/', '').replace('.ts', '');
    const outputFile = `dist/bots/${botName}.js`;
    
    console.log(`Building ${botName}...`);
    await buildBot(botFile, outputFile);
  }
}

buildAllBots().catch(console.error);
```

### Update package.json Scripts

```json
{
  "scripts": {
    "build": "npm run clean && npm run lint && tsc && node --no-warnings esbuild-script.mjs",
    "clean": "rimraf dist",
    "lint": "eslint src/",
    "test": "vitest run",
    "setup:bots": "npm run build && node --loader ts-node/esm scripts/setup-bots-and-subscriptions.ts"
  }
}
```

## Step 3: Import Shared Code in Bots

### Example Bot Using Shared HTTP Functions

```typescript
// src/bots/hapi-sync-bot.ts
import { BotEvent, MedplumClient } from '@medplum/core';
import { Patient, Identifier } from '@medplum/fhirtypes';
import { 
  makeConditionalFhirRequest, 
  HTTP_VERBS, 
  logExternalRequest 
} from '../shared/http-helpers';

/** Base URL for the external system */
const EXTERNAL_SERVER = 'http://external-system:8080';

/**
 * Synchronizes a patient resource to the external system
 */
async function syncExternalResource(patient: Patient, verb: HTTP_VERBS): Promise<Patient> {
  try {
    // Add Medplum identifier to the patient for tracking
    const patientForExternal = {
      ...patient,
      identifier: [
        ...(patient.identifier || []),
        {
          system: 'https://medplum.com/patient-id',
          value: patient.id || 'unknown',
        } as Identifier,
      ],
    };

    // Use shared HTTP function for external request
    const responseData = await makeConditionalFhirRequest(
      EXTERNAL_SERVER,
      'Patient',
      `https://medplum.com/patient-id|${patient.id}`,
      verb,
      patientForExternal
    );

    // Log successful request using shared logging function
    logExternalRequest(
      `External sync ${verb}`,
      patient.id || 'unknown',
      true
    );

    // Process response and return updated patient
    const externalPatientId = responseData.id;
    if (externalPatientId && verb === HTTP_VERBS['PUT']) {
      // Add external system identifier to patient
      const updatedIdentifiers = [...(patient.identifier || [])];
      const existingExternalIdentifier = updatedIdentifiers.find(
        (id) => id.system === 'https://external-system.com/patient-id'
      );

      if (!existingExternalIdentifier) {
        updatedIdentifiers.push({
          system: 'https://external-system.com/patient-id',
          value: externalPatientId,
        } as Identifier);
      } else {
        existingExternalIdentifier.value = externalPatientId;
      }

      return {
        ...patient,
        identifier: updatedIdentifiers,
      };
    }

    return patient;
  } catch (error) {
    // Log failed request using shared logging function
    logExternalRequest(
      `External sync ${verb}`,
      patient.id || 'unknown',
      false,
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  const patient = event.input as Patient;
  const verb = event.headers?.['x-medplum-delete'] ? HTTP_VERBS.DELETE : HTTP_VERBS.PUT;
  
  return await syncExternalResource(patient, verb);
}
```

### Simplified Bot Using Shared Functions

```typescript
// src/bots/hapi-sync-simple-bot.ts
import { BotEvent, MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { 
  makeConditionalFhirRequest, 
  HTTP_VERBS, 
  logExternalRequest 
} from '../shared/http-helpers';

const EXTERNAL_SERVER = 'http://external-system:8080';

async function syncExternalResource(patient: Patient, verb: HTTP_VERBS): Promise<boolean> {
  try {
    const patientForExternal = {
      ...patient,
      identifier: [
        ...(patient.identifier || []),
        {
          system: 'https://medplum.com/patient-id',
          value: patient.id || 'unknown',
        },
      ],
    };

    // Use shared HTTP function
    await makeConditionalFhirRequest(
      EXTERNAL_SERVER,
      'Patient',
      `https://medplum.com/patient-id|${patient.id}`,
      verb,
      patientForExternal
    );

    // Use shared logging function
    logExternalRequest(
      `External sync ${verb}`,
      patient.id || 'unknown',
      true
    );

    return true;
  } catch (error) {
    logExternalRequest(
      `External sync ${verb}`,
      patient.id || 'unknown',
      false,
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  const patient = event.input as Patient;
  const verb = event.headers?.['x-medplum-delete'] ? HTTP_VERBS.DELETE : HTTP_VERBS.PUT;
  
  return await syncExternalResource(patient, verb);
}
```

## Step 4: Deploy with Shared Code

### Automated Deployment

The setup script handles the complete CI/CD pipeline:

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

## Step 5: Update Shared Code

When you update shared code, you must redeploy all bots that use it:

### Update Process

1. **Modify shared code** in `src/shared/`
2. **Rebuild all bots** to include updated shared code:
   ```bash
   npm run build
   ```
3. **Redeploy all affected bots**:
   ```bash
   npm run setup:bots
   ```

### Example: Adding New HTTP Helper Function

```typescript
// src/shared/http-helpers.ts
// Add new function for authentication
export async function makeAuthenticatedRequest(
  url: string,
  method: HTTP_VERBS,
  authToken: string,
  body?: any
): Promise<any> {
  return await makeExternalRequest(url, method, body, {
    'Authorization': `Bearer ${authToken}`,
  });
}
```

After updating the shared HTTP helpers, rebuild and redeploy all bots that use them.

## Testing Shared Code

### Unit Testing Shared Functions

```typescript
// tests/http-helpers.test.ts
import { makeConditionalFhirRequest, HTTP_VERBS, logExternalRequest } from '../src/shared/http-helpers';

describe('HTTP Helpers', () => {
  test('should make conditional FHIR request', async () => {
    // Mock fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'test-123' }),
    });

    const result = await makeConditionalFhirRequest(
      'http://test-server.com',
      'Patient',
      'identifier=test|123',
      HTTP_VERBS.PUT,
      { resourceType: 'Patient' }
    );

    expect(result.id).toBe('test-123');
  });

  test('should handle HTTP errors with OperationOutcome', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
    });

    await expect(
      makeConditionalFhirRequest(
        'http://test-server.com',
        'Patient',
        'identifier=test|123',
        HTTP_VERBS.PUT
      )
    ).rejects.toThrow('OperationOutcomeError');
  });
});
```

## Best Practices

### Code Organization

- **Keep shared functions pure**: Avoid side effects in shared functions
- **Use consistent interfaces**: Standardize function signatures across shared modules
- **Document shared functions**: Include JSDoc comments for all shared functions
- **Group related functions**: Organize shared code by functionality (HTTP, validation, etc.)

### Build Process

- **Use a bundler**: Tools like esbuild, webpack, or rollup to bundle shared code
- **External dependencies**: Keep Medplum packages as external dependencies
- **Source maps**: Enable source maps for easier debugging
- **Minification**: Consider minifying production builds

### Deployment Strategy

- **Deploy all affected bots**: When shared code changes, redeploy all bots that use it
- **Version shared code**: Consider versioning shared modules for better tracking
- **Test thoroughly**: Test shared code changes before deploying to production
- **Rollback plan**: Keep previous versions of bots for rollback if needed

### Performance Considerations

- **Bundle size**: Monitor the size of bundled bots
- **Shared code size**: Keep shared modules focused and lightweight
- **Tree shaking**: Use bundlers that support tree shaking to remove unused code
- **Caching**: Consider caching strategies for shared functions

## Troubleshooting

### Common Issues

1. **Import Errors**
   - Ensure shared modules are properly exported
   - Check file paths in import statements
   - Verify TypeScript compilation

2. **Bundle Size Too Large**
   - Remove unused shared functions
   - Use tree shaking to eliminate dead code
   - Consider splitting large shared modules

3. **Runtime Errors**
   - Test shared functions independently
   - Check for missing dependencies
   - Verify function signatures match

4. **Deployment Failures**
   - Ensure all shared code is included in the bundle
   - Check for syntax errors in shared code
   - Verify bot code size limits

### Debugging Tips

- **Use source maps**: Enable source maps for easier debugging
- **Log shared function calls**: Add logging to track shared function usage
- **Test shared functions**: Create unit tests for shared functions
- **Monitor bundle contents**: Inspect bundled code to verify shared functions are included

## Example: Complete Code Sharing Setup

See the [CI/CD Bots Example](https://github.com/medplum/medplum/tree/main/examples/medplum-ci-cd-bots) for a complete implementation of code sharing patterns.

This example demonstrates:
- Shared HTTP utilities for external API communication
- Automated build and deployment process with esbuild
- Proper project structure for code sharing
- Testing strategies for shared code
- CI/CD pipeline integration
- External system synchronization patterns 