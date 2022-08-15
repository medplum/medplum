import { OperationOutcomeError, TypeSchema } from '@medplum/core';
import { ElementDefinition, OperationOutcomeIssue, Resource } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { getStructureDefinitions } from './structure';
import { checkForNull, createStructureIssue, validationError } from './utils';

export function getResourceTypes(): string[] {
  return Object.keys(getStructureDefinitions().types);
}

export function isResourceType(resourceType: string): boolean {
  return resourceType in getStructureDefinitions().types;
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

  const definition = getStructureDefinitions().types[resourceType];
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

function checkProperties(
  resource: Resource,
  propertyDefinitions: Record<string, ElementDefinition>,
  issues: OperationOutcomeIssue[]
): void {
  for (const [key, value] of Object.entries(propertyDefinitions)) {
    if (key in resource) {
      checkProperty(resource, key, value, issues);
    }
  }
}

function checkProperty(
  resource: Resource,
  propertyName: string,
  propertyDetails: ElementDefinition,
  issues: OperationOutcomeIssue[]
): void {
  const value = (resource as any)[propertyName];
  if (propertyDetails.max === '*') {
    if (!Array.isArray(value)) {
      issues.push(createStructureIssue(propertyName, `Expected array for property "${propertyName}"`));
    }
  }
}

function checkAdditionalProperties(
  resource: Resource,
  propertyDefinitions: ElementDefinition,
  issues: OperationOutcomeIssue[]
): void {
  for (const key of Object.keys(resource)) {
    if (key === 'resourceType' || key === 'id' || key === 'meta' || key === '_baseDefinition') {
      continue;
    }
    if (!(key in propertyDefinitions)) {
      // Try to find a "choice of type" property (e.g., "value[x]")
      // TODO: Consolidate this logic with FHIRPath lookup
      const choiceOfTypeKey = key.replace(/[A-Z].+/, '[x]');
      if (!(choiceOfTypeKey in propertyDefinitions)) {
        issues.push(createStructureIssue(key, `Invalid additional property "${key}"`));
      }
    }
  }
}

function checkRequiredProperties(resource: Resource, definition: TypeSchema, issues: OperationOutcomeIssue[]): void {
  for (const [key, elementDefinition] of Object.entries(definition.properties)) {
    if (elementDefinition.min === 1 && !(key in resource)) {
      issues.push(createStructureIssue(key, `Missing required property "${resource.resourceType}.${key}"`));
    }
  }
}
