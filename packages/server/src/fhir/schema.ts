import { allOk } from '@medplum/core';
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
  return Object.keys((getSchema() as any).discriminator.mapping);
}

export function isResourceType(resourceType: string): boolean {
  return resourceType in getSchemaDefinitions();
}

export function validateResourceType(resourceType: string): OperationOutcome {
  if (!resourceType) {
    return validationError('Resource type is null');
  }
  return isResourceType(resourceType) ? allOk : validationError('Unknown resource type');
}

export function validateResource(resource: Resource): OperationOutcome {
  if (!resource) {
    return validationError('Resource is null');
  }

  const resourceType = resource.resourceType;
  if (!resourceType) {
    return validationError('Missing resource type');
  }

  const definition = getSchemaDefinitions()[resourceType];
  if (!definition) {
    return validationError('Unknown resource type');
  }

  const issues: OperationOutcomeIssue[] = [];
  const propertyDefinitions = definition.properties;

  checkProperties(resource, propertyDefinitions, issues);
  checkAdditionalProperties(resource, propertyDefinitions, issues);
  checkRequiredProperties(resource, definition, issues);

  if (issues.length === 0) {
    return allOk;
  }

  return {
    resourceType: 'OperationOutcome',
    id: randomUUID(),
    issue: issues,
  };
}

function checkProperties(resource: Resource, propertyDefinitions: any, issues: OperationOutcomeIssue[]) {
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
) {
  const value = (resource as any)[propertyName];

  if (propertyDetails.type === 'array' && !Array.isArray(value)) {
    issues.push(createIssue(propertyName, `Expected array for property "${propertyName}"`));
  }
}

function checkAdditionalProperties(resource: Resource, propertyDefinitions: any, issues: OperationOutcomeIssue[]) {
  for (const key of Object.keys(resource)) {
    if (key === 'meta' || key === '_baseDefinition') {
      continue;
    }
    if (!(key in propertyDefinitions)) {
      issues.push(createIssue(key, `Invalid additional property "${key}"`));
    }
  }
}

function checkRequiredProperties(resource: Resource, definition: any, issues: OperationOutcomeIssue[]) {
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
