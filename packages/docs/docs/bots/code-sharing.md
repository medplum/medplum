---
sidebar_position: 11
---

# Code Sharing in Medplum Bots

This guide covers how to implement effective code sharing patterns in Medplum bots to reduce duplication, improve maintainability, and ensure consistency across your bot ecosystem.

## Overview

Code sharing in bots involves creating reusable utilities, helpers, and patterns that can be used across multiple bots. This includes:

- **Shared Validation Functions**: Common validation logic for FHIR resources
- **Shared HTTP Helpers**: Reusable HTTP request utilities
- **Shared Audit Functions**: Consistent logging and audit event creation
- **Shared Type Definitions**: Common interfaces and types
- **Shared Configuration**: Environment-specific settings and constants

## Benefits of Code Sharing

- **Reduced Duplication**: Write once, use everywhere
- **Consistent Behavior**: Same validation and processing logic across bots
- **Easier Maintenance**: Update shared code to fix issues everywhere
- **Better Testing**: Test shared functions once, reuse across bots
- **Standardization**: Enforce consistent patterns and practices

## Project Structure

Organize your bot project with shared code:

```
src/
├── shared/
│   ├── validation-helpers.ts    # Shared validation functions
│   ├── audit-helpers.ts         # Shared audit and logging functions
│   ├── http-helpers.ts          # Shared HTTP request utilities
│   ├── types.ts                 # Shared type definitions
│   └── constants.ts             # Shared constants and configuration
└── bots/
    ├── patient-validation-bot.ts
    ├── patient-audit-bot.ts
    └── resource-sync-bot.ts
```

## Shared Validation Functions

Create reusable validation logic for FHIR resources:

```typescript
// src/shared/validation-helpers.ts
import { Patient, ValidationResult } from '@medplum/fhirtypes';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Comprehensive patient validation using shared logic
 */
export function validatePatientComprehensive(patient: Patient): ValidationResult {
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

  // Validate birth date format
  if (patient.birthDate) {
    const birthDate = new Date(patient.birthDate);
    if (isNaN(birthDate.getTime())) {
      errors.push('Invalid birth date format');
    }
    
    // Check if birth date is in the future
    if (birthDate > new Date()) {
      warnings.push('Birth date is in the future');
    }
  }

  // Validate identifiers
  if (patient.identifier) {
    for (const identifier of patient.identifier) {
      if (!identifier.system || !identifier.value) {
        errors.push('Invalid identifier: missing system or value');
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate patient address information
 */
export function validatePatientAddress(patient: Patient): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (patient.address && patient.address.length > 0) {
    for (const address of patient.address) {
      if (!address.line || address.line.length === 0) {
        errors.push('Address line is required');
      }
      if (!address.city) {
        errors.push('Address city is required');
      }
      if (!address.state) {
        errors.push('Address state is required');
      }
      if (!address.postalCode) {
        errors.push('Address postal code is required');
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
```

## Shared HTTP Helpers

Create reusable HTTP request utilities:

```typescript
// src/shared/http-helpers.ts
import { MedplumClient } from '@medplum/core';

export enum HTTP_VERBS {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
}

export interface ExternalRequestConfig {
  baseUrl: string;
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * Make a conditional FHIR request to an external server
 */
export async function makeConditionalFhirRequest(
  baseUrl: string,
  resourceType: string,
  conditionalQuery: string,
  verb: HTTP_VERBS,
  body?: any
): Promise<any> {
  const url = `${baseUrl}/${resourceType}?${conditionalQuery}`;
  
  const response = await fetch(url, {
    method: verb,
    headers: {
      'Content-Type': 'application/fhir+json',
      'Accept': 'application/fhir+json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Log external HTTP requests for audit purposes
 */
export async function logExternalRequest(
  operation: string,
  resourceId: string,
  externalUrl: string,
  success: boolean,
  error?: string
): Promise<void> {
  // This would typically create an AuditEvent in Medplum
  console.log(`External Request: ${operation} for ${resourceId} to ${externalUrl} - ${success ? 'SUCCESS' : 'FAILED'}`);
  
  if (error) {
    console.error(`Error: ${error}`);
  }
}
```

## Shared Audit Functions

Create consistent audit and logging functions:

```typescript
// src/shared/audit-helpers.ts
import { MedplumClient } from '@medplum/core';
import { Patient, AuditEvent, AuditEventAction } from '@medplum/fhirtypes';

/**
 * Create a standardized audit event for patient changes
 */
export async function createPatientAuditEvent(
  medplum: MedplumClient,
  patient: Patient,
  action: AuditEventAction,
  description: string
): Promise<AuditEvent> {
  return await medplum.createResource({
    resourceType: 'AuditEvent',
    action: action,
    recorded: new Date().toISOString(),
    outcome: '0', // Success
    outcomeDesc: description,
    agent: [
      {
        who: {
          reference: 'Bot/patient-audit-bot',
        },
        requestor: false,
      },
    ],
    entity: [
      {
        what: {
          reference: `Patient/${patient.id}`,
        },
        type: {
          system: 'http://terminology.hl7.org/CodeSystem/audit-entity-type',
          code: '1',
          display: 'Person',
        },
      },
    ],
  });
}

/**
 * Log patient changes with consistent formatting
 */
export function logPatientChange(
  patient: Patient,
  action: string,
  description: string
): void {
  console.log(`[PATIENT ${action.toUpperCase()}] ${patient.id} - ${description}`);
  console.log(`  Name: ${patient.name?.[0]?.given?.join(' ')} ${patient.name?.[0]?.family}`);
  console.log(`  Birth Date: ${patient.birthDate}`);
  console.log(`  Timestamp: ${new Date().toISOString()}`);
}

/**
 * Log general messages with consistent formatting
 */
export function logMessage(level: 'INFO' | 'WARN' | 'ERROR', message: string, context?: any): void {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    context,
  };
  
  console.log(`[${level}] ${timestamp} - ${message}`);
  
  if (context) {
    console.log('  Context:', JSON.stringify(context, null, 2));
  }
}
```

## Shared Type Definitions

Define common interfaces and types:

```typescript
// src/shared/types.ts
import { Patient, Practitioner, Organization } from '@medplum/fhirtypes';

export interface ValidationContext {
  patient: Patient;
  practitioner?: Practitioner;
  organization?: Organization;
  timestamp: Date;
}

export interface ExternalSystemConfig {
  name: string;
  baseUrl: string;
  apiKey?: string;
  timeout: number;
  retryAttempts: number;
}

export interface SyncResult {
  success: boolean;
  externalId?: string;
  error?: string;
  timestamp: Date;
}

export interface QualityMetrics {
  completeness: number;
  accuracy: number;
  consistency: number;
  overall: number;
}
```

## Shared Constants

Define environment-specific constants:

```typescript
// src/shared/constants.ts
export const EXTERNAL_SYSTEMS = {
  HAPI_SERVER: 'http://hapi-server:8080',
  LAB_SYSTEM: 'https://lab.example.com/api',
  PHARMACY_SYSTEM: 'https://pharmacy.example.com/api',
} as const;

export const VALIDATION_RULES = {
  MIN_NAME_LENGTH: 2,
  MAX_NAME_LENGTH: 100,
  MIN_AGE: 0,
  MAX_AGE: 150,
  REQUIRED_ADDRESS_FIELDS: ['line', 'city', 'state', 'postalCode'],
} as const;

export const AUDIT_EVENT_TYPES = {
  PATIENT_CREATED: 'patient-created',
  PATIENT_UPDATED: 'patient-updated',
  PATIENT_DELETED: 'patient-deleted',
  VALIDATION_FAILED: 'validation-failed',
  SYNC_COMPLETED: 'sync-completed',
  SYNC_FAILED: 'sync-failed',
} as const;

export const ERROR_MESSAGES = {
  INVALID_PATIENT_DATA: 'Invalid patient data provided',
  EXTERNAL_SYSTEM_UNAVAILABLE: 'External system is currently unavailable',
  VALIDATION_FAILED: 'Resource validation failed',
  SYNC_TIMEOUT: 'External system sync timed out',
} as const;
```

## Using Shared Code in Bots

Import and use shared functions in your bots:

```typescript
// src/bots/patient-validation-bot.ts
import { BotEvent, MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { 
  validatePatientComprehensive, 
  validatePatientAddress 
} from '../shared/validation-helpers';
import { 
  createPatientAuditEvent, 
  logPatientChange,
  logMessage 
} from '../shared/audit-helpers';
import { VALIDATION_RULES, ERROR_MESSAGES } from '../shared/constants';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  const patient = event.input as Patient;
  
  logMessage('INFO', `Starting patient validation for ${patient.id}`);
  
  // Use shared validation functions
  const comprehensiveValidation = validatePatientComprehensive(patient);
  const addressValidation = validatePatientAddress(patient);
  
  // Combine validation results
  const allErrors = [...comprehensiveValidation.errors, ...addressValidation.errors];
  const allWarnings = [...comprehensiveValidation.warnings, ...addressValidation.warnings];
  
  if (allErrors.length > 0) {
    logMessage('ERROR', `Patient validation failed: ${allErrors.join(', ')}`);
    
    // Create audit event for validation failure
    await createPatientAuditEvent(
      medplum,
      patient,
      'E', // Execute
      `Validation failed: ${allErrors.join(', ')}`
    );
    
    throw new Error(ERROR_MESSAGES.VALIDATION_FAILED);
  }
  
  // Log warnings if any
  if (allWarnings.length > 0) {
    logMessage('WARN', `Patient validation warnings: ${allWarnings.join(', ')}`);
  }
  
  // Log successful validation
  logPatientChange(patient, 'validated', 'Patient validation completed successfully');
  
  return {
    success: true,
    warnings: allWarnings,
    timestamp: new Date().toISOString(),
  };
}
```

## Advanced Code Sharing Patterns

### Shared Configuration Management

```typescript
// src/shared/config.ts
export interface BotConfig {
  environment: 'development' | 'staging' | 'production';
  externalSystems: Record<string, ExternalSystemConfig>;
  validationRules: typeof VALIDATION_RULES;
  auditSettings: {
    enabled: boolean;
    logLevel: 'INFO' | 'WARN' | 'ERROR';
  };
}

export function getBotConfig(): BotConfig {
  const environment = process.env.NODE_ENV || 'development';
  
  return {
    environment,
    externalSystems: {
      hapi: {
        name: 'HAPI FHIR Server',
        baseUrl: EXTERNAL_SYSTEMS.HAPI_SERVER,
        timeout: 5000,
        retryAttempts: 3,
      },
      lab: {
        name: 'Lab System',
        baseUrl: EXTERNAL_SYSTEMS.LAB_SYSTEM,
        apiKey: process.env.LAB_API_KEY,
        timeout: 10000,
        retryAttempts: 2,
      },
    },
    validationRules: VALIDATION_RULES,
    auditSettings: {
      enabled: true,
      logLevel: 'INFO',
    },
  };
}
```

### Shared Error Handling

```typescript
// src/shared/error-handlers.ts
import { logMessage } from './audit-helpers';

export class BotError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: any
  ) {
    super(message);
    this.name = 'BotError';
  }
}

export function handleBotError(error: unknown, context: string): never {
  if (error instanceof BotError) {
    logMessage('ERROR', `Bot error in ${context}: ${error.message}`, {
      code: error.code,
      context: error.context,
    });
    throw error;
  }
  
  if (error instanceof Error) {
    logMessage('ERROR', `Unexpected error in ${context}: ${error.message}`);
    throw new BotError(error.message, 'UNEXPECTED_ERROR', { originalError: error });
  }
  
  logMessage('ERROR', `Unknown error in ${context}: ${String(error)}`);
  throw new BotError('Unknown error occurred', 'UNKNOWN_ERROR', { error });
}
```

### Shared Testing Utilities

```typescript
// src/shared/test-helpers.ts
import { Patient } from '@medplum/fhirtypes';

export function createTestPatient(overrides: Partial<Patient> = {}): Patient {
  return {
    resourceType: 'Patient',
    name: [{ given: ['Test'], family: 'Patient' }],
    birthDate: '1990-01-01',
    ...overrides,
  };
}

export function createTestPatientWithInvalidData(): Patient {
  return {
    resourceType: 'Patient',
    // Missing required fields to trigger validation errors
  };
}

export async function waitForBotExecution(delay: number = 2000): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, delay));
}
```

## Best Practices

### Code Organization
- Keep shared functions focused and single-purpose
- Use consistent naming conventions
- Document all shared functions with JSDoc
- Group related functions in the same file

### Error Handling
- Use consistent error types and messages
- Log errors with appropriate context
- Provide meaningful error messages
- Handle both expected and unexpected errors

### Testing Shared Code
- Write comprehensive tests for shared functions
- Test edge cases and error conditions
- Mock external dependencies appropriately
- Use shared test utilities for consistency

### Version Management
- Use semantic versioning for shared code
- Document breaking changes
- Maintain backward compatibility when possible
- Update all bots when shared code changes

### Performance Considerations
- Cache frequently used validation results
- Use efficient data structures
- Minimize external API calls
- Implement proper error handling to avoid retries

## Example Implementation

See the complete [CI/CD Bots Example](https://github.com/medplum/medplum/tree/main/examples/medplum-ci-cd-bots) for a full implementation of these code sharing patterns.

This example demonstrates:
- Shared validation functions
- Shared HTTP utilities
- Shared audit and logging functions
- Shared type definitions and constants
- Comprehensive error handling
- Testing utilities and patterns 