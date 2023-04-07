import { checkForNull, createStructureIssue, OperationOutcomeError, validationError } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { OperationOutcomeIssue, Resource } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { JSONSchema4, JSONSchema6 } from 'json-schema';

/*
 * This file contains helper methods for using fhir.schema.json,
 * which is included with the official FHIR download bundle.
 *
 * Our long term goal is to eliminate usage of fhir.schema.json
 * and use FHIR StructureDefinition resources for all meta programming.
 * The JSON schema is not as detailed or expressive as StructureDefinitions.
 *
 * Once upon a time, fhir.schema.json was used for all resource validation.
 * Now it is only used for "non-strict" mode, which may be deprecated in the future.
 */

let schema: JSONSchema4 | undefined = undefined;

function getJsonSchema(): JSONSchema4 {
  if (!schema) {
    schema = readJson('fhir/r4/fhir.schema.json') as JSONSchema4;
  }
  return schema;
}

export function getJsonSchemaDefinitions(): { [k: string]: JSONSchema4 } {
  return getJsonSchema().definitions as { [k: string]: JSONSchema4 };
}

export function getJsonSchemaDefinition(resourceType: string): JSONSchema4 {
  return getJsonSchemaDefinitions()[resourceType];
}

export function getJsonSchemaResourceTypes(): string[] {
  return Object.keys(getJsonSchema().discriminator.mapping);
}

export function validateResourceWithJsonSchema<T extends Resource>(resource: T): void {
  if (!resource) {
    throw new OperationOutcomeError(validationError('Resource is null'));
  }

  const resourceType = resource.resourceType;
  if (!resourceType) {
    throw new OperationOutcomeError(validationError('Missing resource type'));
  }

  const definition = getJsonSchemaDefinitions()[resourceType];
  if (!definition) {
    throw new OperationOutcomeError(validationError('Unknown resource type'));
  }

  const issues: OperationOutcomeIssue[] = [];
  const propertyDefinitions = definition.properties as { [k: string]: JSONSchema4 };

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
  propertyDefinitions: { [k: string]: JSONSchema4 },
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
  propertyDetails: { [k: string]: JSONSchema4 },
  issues: OperationOutcomeIssue[]
): void {
  const value = (resource as any)[propertyName];
  if ((propertyDetails as JSONSchema6).type === 'array') {
    if (!Array.isArray(value)) {
      issues.push(createStructureIssue(propertyName, `Expected array for property "${propertyName}"`));
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
      issues.push(createStructureIssue(key, `Invalid additional property "${key}"`));
    }
  }
}

function checkRequiredProperties(resource: Resource, definition: any, issues: OperationOutcomeIssue[]): void {
  const requiredProperties = definition.required;
  if (requiredProperties) {
    for (const key of requiredProperties) {
      if (!(key in resource)) {
        issues.push(createStructureIssue(key, `Missing required property "${key}"`));
      }
    }
  }
}
