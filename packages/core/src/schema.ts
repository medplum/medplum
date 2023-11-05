import { OperationOutcomeIssue } from '@medplum/fhirtypes';
import { createStructureIssue, OperationOutcomeError, validationError } from './outcomes';
import { isResourceType } from './typeschema/types';

/**
 * Validates that the given string is a valid FHIR resource type.
 *
 * On success, silently returns void.
 * On failure, throws an OperationOutcomeError.
 *
 * @example
 * ```ts
 * validateResourceType('Patient'); // nothing
 * validateResourceType('XYZ'); // throws OperationOutcomeError
 * ```
 *
 * Note that this depends on globalSchema, which is populated by the StructureDefinition loader.
 *
 * @example
 * In a server context, you can load all schema definitions:
 *
 * ```ts
 * import { indexStructureDefinitionBundle } from '@medplum/core';
 * import { readJson } from '@medplum/definitions';
 * import { Bundle } from '@medplum/fhirtypes';
 *
 * indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
 * ```
 *
 * @example
 * In a client context, you can load the schema definitions using MedplumClient:
 *
 * ```ts
 * import { MedplumClient } from '@medplum/core';
 *
 * const medplum = new MedplumClient();
 * await medplum.requestSchema('Patient');
 * ```
 *
 * @param resourceType - The candidate resource type string.
 */
export function validateResourceType(resourceType: string): void {
  if (!resourceType) {
    throw new OperationOutcomeError(validationError('Resource type is null'));
  }
  if (!isResourceType(resourceType)) {
    throw new OperationOutcomeError(validationError('Unknown resource type'));
  }
}

/**
 * Recursively checks for null values in an object.
 *
 * Note that "null" is a special value in JSON that is not allowed in FHIR.
 * @param value - Input value of any type.
 * @param path - Path string to the value for OperationOutcome.
 * @param issues - Output list of issues.
 */
export function checkForNull(value: unknown, path: string, issues: OperationOutcomeIssue[]): void {
  if (value === null) {
    issues.push(createStructureIssue(path, 'Invalid null value'));
  } else if (Array.isArray(value)) {
    checkArrayForNull(value, path, issues);
  } else if (typeof value === 'object') {
    checkObjectForNull(value as Record<string, unknown>, path, issues);
  }
}

function checkArrayForNull(array: unknown[], path: string, issues: OperationOutcomeIssue[]): void {
  for (let i = 0; i < array.length; i++) {
    if (array[i] === undefined) {
      issues.push(createStructureIssue(`${path}[${i}]`, 'Invalid undefined value'));
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
