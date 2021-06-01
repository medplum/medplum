import { randomUUID } from 'crypto';
import { readJson } from '@medplum/definitions';
import { OperationOutcome, OperationOutcomeIssue, Resource } from '@medplum/core';
import { allOk } from './outcomes';

export const schema = readJson('fhir/r4/fhir.schema.json');
export const definitions = schema.definitions;
export const resourceTypes = Object.keys(schema.discriminator.mapping);

export function validateResourceType(resourceType: string): OperationOutcome {
  if (!resourceType) {
    return validationError('Resource type is null');
  }

  const definition = definitions[resourceType];
  if (!definition) {
    return validationError('Unknown resource type "' + resourceType + '"');
  }

  return allOk;
}

export function validateResource(resource: Resource): OperationOutcome {
  if (!resource) {
    return validationError('Resource is null');
  }

  const resourceType = resource.resourceType;
  if (!resourceType) {
    return validationError('Missing resource type');
  }

  const definition = definitions[resourceType];
  if (!definition) {
    return validationError('Unknown resource type "' + resourceType + '"');
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
    issue: issues
  };
}

function checkProperties(
  resource: Resource,
  propertyDefinitions: any,
  issues: OperationOutcomeIssue[]) {

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
  issues: OperationOutcomeIssue[]) {

  const value = (resource as any)[propertyName];

  if (propertyDetails.type === 'array' && !Array.isArray(value)) {
    issues.push({
      severity: 'error',
      code: 'structure',
      details: {
        text: 'Expected array for property "' + propertyName + '"'
      }
    });
  }
}

function checkAdditionalProperties(
  resource: Resource,
  propertyDefinitions: any,
  issues: OperationOutcomeIssue[]) {

  for (const key of Object.keys(resource)) {
    if (key === 'meta' || key === '_baseDefinition') {
      continue;
    }
    if (!(key in propertyDefinitions)) {
      issues.push({
        severity: 'error',
        code: 'structure',
        details: {
          text: 'Invalid additional property "' + key + '"'
        }
      });
    }
  }
}

function checkRequiredProperties(
  resource: Resource,
  definition: any,
  issues: OperationOutcomeIssue[]) {

  const requiredProperties = definition.required;
  if (requiredProperties) {
    for (const key of requiredProperties) {
      if (!(key in resource)) {
        issues.push({
          severity: 'error',
          code: 'structure',
          details: {
            text: 'Missing required property "' + key + '"'
          }
        });
      }
    }
  }
}

const validationError: (details: string) => OperationOutcome = (details: string) => ({
  resourceType: 'OperationOutcome',
  id: randomUUID(),
  issue: [{
    severity: 'error',
    code: 'structure',
    details: {
      text: details
    }
  }]
});
