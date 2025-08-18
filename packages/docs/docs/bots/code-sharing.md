---
sidebar_position: 11
---

# Code Sharing in Medplum Bots

This guide explains how to enable and implement code sharing in Medplum bots, allowing you to reuse functions, utilities, and patterns across multiple bots.

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

Organize your bot project to enable effective code sharing:

```
src/
├── shared/                    # Shared code modules
│   ├── validation.ts         # Shared validation functions
│   ├── http.ts              # Shared HTTP utilities
│   ├── audit.ts             # Shared audit functions
│   ├── types.ts             # Shared type definitions
│   └── constants.ts         # Shared constants
├── bots/                    # Individual bot implementations
│   ├── patient-validation-bot.ts
│   ├── patient-audit-bot.ts
│   └── resource-sync-bot.ts
├── build/                   # Build configuration
│   └── esbuild.config.js
└── package.json
```

## Step 1: Create Shared Modules

### Shared Validation Functions

```typescript
// src/shared/validation.ts
import { Patient } from '@medplum/fhirtypes';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validatePatient(patient: Patient): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate required fields
  if (!patient.name || patient.name.length === 0) {
    errors.push('Patient name is required');
  }

  if (!patient.birthDate) {
    errors.push('Patient birth date is required');
  }

  // Validate name format
  if (patient.name && patient.name.length > 0) {
    const name = patient.name[0];
    if (!name.given || name.given.length === 0) {
      errors.push('Patient given name is required');
    }
    if (!name.family) {
      errors.push('Patient family name is required');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
```

### Shared HTTP Utilities

```typescript
// src/shared/http.ts
export async function makeExternalRequest(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: any
): Promise<any> {
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

export function logExternalRequest(operation: string, success: boolean, error?: string): void {
  console.log(`External Request: ${operation} - ${success ? 'SUCCESS' : 'FAILED'}`);
  if (error) {
    console.error(`Error: ${error}`);
  }
}
```

### Shared Audit Functions

```typescript
// src/shared/audit.ts
import { MedplumClient } from '@medplum/core';
import { Patient, AuditEvent } from '@medplum/fhirtypes';

export async function createAuditEvent(
  medplum: MedplumClient,
  patient: Patient,
  action: string,
  description: string
): Promise<AuditEvent> {
  return await medplum.createResource({
    resourceType: 'AuditEvent',
    action: 'E', // Execute
    recorded: new Date().toISOString(),
    outcome: '0', // Success
    outcomeDesc: description,
    agent: [
      {
        who: {
          reference: 'Bot/audit-bot',
        },
        requestor: false,
      },
    ],
    entity: [
      {
        what: {
          reference: `Patient/${patient.id}`,
        },
      },
    ],
  });
}
```

## Step 2: Configure Build Process

### Install Required Dependencies

```bash
npm install --save-dev esbuild @types/node
```

### Create Build Configuration

```javascript
// build/esbuild.config.js
const esbuild = require('esbuild');
const { readdirSync } = require('fs');
const { join } = require('path');

async function buildBot(botFile, outputFile) {
  await esbuild.build({
    entryPoints: [botFile],
    bundle: true,
    platform: 'node',
    target: 'node18',
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
    const outputFile = `dist/${botName}.js`;
    
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
    "build": "node build/esbuild.config.js",
    "build:watch": "node build/esbuild.config.js --watch",
    "clean": "rm -rf dist",
    "deploy": "npm run build && npm run deploy:bots"
  }
}
```

## Step 3: Import Shared Code in Bots

### Example Bot Using Shared Functions

```typescript
// src/bots/patient-validation-bot.ts
import { BotEvent, MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { validatePatient } from '../shared/validation';
import { createAuditEvent } from '../shared/audit';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  const patient = event.input as Patient;
  
  console.log(`Validating patient ${patient.id}`);
  
  // Use shared validation function
  const validationResult = validatePatient(patient);
  
  if (!validationResult.isValid) {
    console.error(`Validation failed: ${validationResult.errors.join(', ')}`);
    
    // Use shared audit function
    await createAuditEvent(
      medplum,
      patient,
      'validation-failed',
      `Validation failed: ${validationResult.errors.join(', ')}`
    );
    
    throw new Error(`Patient validation failed: ${validationResult.errors.join(', ')}`);
  }
  
  // Log warnings if any
  if (validationResult.warnings.length > 0) {
    console.warn(`Validation warnings: ${validationResult.warnings.join(', ')}`);
  }
  
  console.log(`Patient ${patient.id} validation successful`);
  
  return {
    success: true,
    warnings: validationResult.warnings,
  };
}
```

## Step 4: Deploy with Shared Code

### Manual Deployment

1. **Build the bots** with shared code included:
   ```bash
   npm run build
   ```

2. **Deploy each bot** with the bundled code:
   ```bash
   # Deploy each bot individually
   medplum bot create patient-validation-bot dist/patient-validation-bot.js
   medplum bot create patient-audit-bot dist/patient-audit-bot.js
   ```

### Automated Deployment

```typescript
// scripts/deploy.ts
import { MedplumClient } from '@medplum/core';
import { readFileSync } from 'fs';

async function deployBots(medplum: MedplumClient): Promise<void> {
  const botFiles = [
    'dist/patient-validation-bot.js',
    'dist/patient-audit-bot.js',
    'dist/resource-sync-bot.js',
  ];
  
  for (const botFile of botFiles) {
    const botName = botFile.replace('dist/', '').replace('.js', '');
    console.log(`Deploying ${botName}...`);
    
    const botCode = readFileSync(botFile, 'utf8');
    
    await medplum.createResource({
      resourceType: 'Bot',
      name: botName,
      code: botCode,
      runtimeVersion: 'awslambda',
    });
    
    console.log(`✅ Deployed ${botName}`);
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
   npm run deploy
   ```

### Example: Adding New Validation Rule

```typescript
// src/shared/validation.ts
export function validatePatient(patient: Patient): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Existing validation...
  
  // New validation rule
  if (patient.birthDate) {
    const birthDate = new Date(patient.birthDate);
    if (birthDate > new Date()) {
      errors.push('Birth date cannot be in the future');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
```

After updating the shared validation function, rebuild and redeploy all bots that use it.

## Best Practices

### Code Organization

- **Keep shared functions pure**: Avoid side effects in shared functions
- **Use consistent interfaces**: Standardize function signatures across shared modules
- **Document shared functions**: Include JSDoc comments for all shared functions
- **Group related functions**: Organize shared code by functionality

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
- Shared validation and audit functions
- Automated build and deployment process
- Proper project structure for code sharing
- Testing strategies for shared code
- Monitoring and observability patterns 