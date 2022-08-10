import { OperationOutcomeError } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { OperationOutcome, OperationOutcomeIssue, Resource } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { JSONSchema4 } from 'json-schema';

let schema: JSONSchema4 | undefined = undefined;

export function getSchema(): JSONSchema4 {
  if (!schema) {
    schema = readJson('fhir/r4/fhir.schema.json') as JSONSchema4;
  }
  return schema;
}

export function getSchemaDefinitions(): { [k: string]: JSONSchema4 } {
  return getSchema().definitions as { [k: string]: JSONSchema4 };
}

export function getSchemaDefinition(resourceType: string): JSONSchema4 {
  return getSchemaDefinitions()[resourceType];
}

export function getResourceTypes(): string[] {
  return Object.keys(getSchema().discriminator.mapping);
}

export function isResourceType(resourceType: string): boolean {
  return resourceType in getSchemaDefinitions();
}

export function validateResourceType(resourceType: string): void {
  if (!resourceType) {
    throw validationError('Resource type is null');
  }
  if (!isResourceType(resourceType)) {
    throw validationError('Unknown resource type');
  }
}

export function validateResource<T extends Resource>(resource: T): void {
  if (!resource) {
    throw validationError('Resource is null');
  }

  const resourceType = resource.resourceType;
  if (!resourceType) {
    throw validationError('Missing resource type');
  }

  const definition = getSchemaDefinitions()[resourceType];
  if (!definition) {
    throw validationError('Unknown resource type');
  }

  const issues: OperationOutcomeIssue[] = [];
  const propertyDefinitions = definition.properties;

  checkForNull(resource, '', issues);
  checkProperties(resource, propertyDefinitions, issues);
  checkAdditionalProperties(resource, propertyDefinitions, issues);
  checkRequiredProperties(resource, definition, issues);

  if (issues.length > 0) {
    throw new OperationOutcomeError({
      resourceType: 'OperationOutcome',
      id: randomUUID(),
      issue: issues,
    });
  }
}

function checkForNull(value: unknown, path: string, issues: OperationOutcomeIssue[]): void {
  if (value === null) {
    issues.push(createIssue(path, `Invalid null value`));
  } else if (Array.isArray(value)) {
    checkArrayForNull(value, path, issues);
  } else if (typeof value === 'object') {
    checkObjectForNull(value as Record<string, unknown>, path, issues);
  }
}

function checkArrayForNull(array: unknown[], path: string, issues: OperationOutcomeIssue[]): void {
  for (let i = 0; i < array.length; i++) {
    if (array[i] === undefined) {
      issues.push(createIssue(`${path}[${i}]`, `Invalid undefined value`));
    } else {
      checkForNull(array[i], `${path}[${i}]`, issues);
    }
  }
}

function checkObjectForNull(obj: Record<string, unknown>, path: string, issues: OperationOutcomeIssue[]): void {
  for (const [key, value] of Object.entries(obj)) {
    checkForNull(value, `${path}${path ? '.' : ''}${key}`, issues);
  }
}

function checkProperties(resource: Resource, propertyDefinitions: any, issues: OperationOutcomeIssue[]): void {
  for (const [key, value] of Object.entries(propertyDefinitions)) {
    if (key in resource) {
      checkProperty(resource, key, value, issues);
    }
  }
}

function checkProperty(
  resource: Resource,
  propertyName: string,
  propertyDetails: any,
  issues: OperationOutcomeIssue[]
): void {
  const value = (resource as any)[propertyName];
  if (propertyDetails.type === 'array') {
    if (!Array.isArray(value)) {
      issues.push(createIssue(propertyName, `Expected array for property "${propertyName}"`));
    }
  }
}

function checkAdditionalProperties(
  resource: Resource,
  propertyDefinitions: any,
  issues: OperationOutcomeIssue[]
): void {
  for (const key of Object.keys(resource)) {
    if (key === 'meta' || key === '_baseDefinition') {
      continue;
    }
    if (!(key in propertyDefinitions)) {
      issues.push(createIssue(key, `Invalid additional property "${key}"`));
    }
  }
}

function checkRequiredProperties(resource: Resource, definition: any, issues: OperationOutcomeIssue[]): void {
  const requiredProperties = definition.required;
  if (requiredProperties) {
    for (const key of requiredProperties) {
      if (!(key in resource)) {
        issues.push(createIssue(key, `Missing required property "${key}"`));
      }
    }
  }
}

function validationError(details: string): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    id: randomUUID(),
    issue: [
      {
        severity: 'error',
        code: 'structure',
        details: {
          text: details,
        },
      },
    ],
  };
}

function createIssue(expression: string, details: string): OperationOutcomeIssue {
  return {
    severity: 'error',
    code: 'structure',
    details: {
      text: details,
    },
    expression: [expression],
  };
}
