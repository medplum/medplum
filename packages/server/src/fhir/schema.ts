import {
  getExtensionValue,
  getTypedPropertyValue,
  IndexedStructureDefinition,
  isEmpty,
  isLowerCase,
  OperationOutcomeError,
  PropertyType,
  toTypedValue,
  TypedValue,
} from '@medplum/core';
import { ElementDefinition, OperationOutcomeIssue, Resource } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { getStructureDefinitions } from './structure';
import { checkForNull, createStructureIssue, validationError } from './utils';

/*
 * This file provides schema validation utilities for FHIR JSON objects.
 *
 * See: [JSON Representation of Resources](https://hl7.org/fhir/json.html)
 * See: [FHIR Data Types](https://www.hl7.org/fhir/datatypes.html)
 */

const fhirTypeToJsType: Record<string, string> = {
  base64Binary: 'string',
  boolean: 'boolean',
  canonical: 'string',
  code: 'string',
  date: 'string',
  dateTime: 'string',
  decimal: 'number',
  id: 'string',
  instant: 'string',
  integer: 'number',
  markdown: 'string',
  oid: 'string',
  positiveInt: 'number',
  string: 'string',
  time: 'string',
  unsignedInt: 'number',
  uri: 'string',
  url: 'string',
  uuid: 'string',
  'http://hl7.org/fhirpath/System.String': 'string',
};

export function isResourceType(resourceType: string): boolean {
  const typeSchema = getStructureDefinitions().types[resourceType];
  return (
    typeSchema &&
    typeSchema.structureDefinition.id === resourceType &&
    typeSchema.structureDefinition.kind === 'resource'
  );
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
  new FhirSchemaValidator(resource).validate();
}

export class FhirSchemaValidator<T extends Resource> {
  readonly #schema: IndexedStructureDefinition;
  readonly #issues: OperationOutcomeIssue[];
  readonly #root: T;

  constructor(root: T) {
    this.#schema = getStructureDefinitions();
    this.#issues = [];
    this.#root = root;
  }

  validate(): void {
    const resource = this.#root;
    if (!resource) {
      throw validationError('Resource is null');
    }

    const resourceType = resource.resourceType;
    if (!resourceType) {
      throw validationError('Missing resource type');
    }

    this.#validateObject(toTypedValue(resource), '');

    if (this.#issues.length > 0) {
      throw new OperationOutcomeError({
        resourceType: 'OperationOutcome',
        id: randomUUID(),
        issue: this.#issues,
      });
    }
  }

  #validateObject(typedValue: TypedValue, path: string): void {
    const definition = this.#schema.types[typedValue.type];
    if (!definition) {
      throw validationError('Unknown type: ' + typedValue.type);
    }

    const object = typedValue.value as Record<string, unknown>;
    const propertyDefinitions = definition.properties;

    checkForNull(object, path, this.#issues);
    this.#checkProperties(propertyDefinitions, typedValue);
    this.#checkAdditionalProperties(object, propertyDefinitions);
  }

  #checkProperties(propertyDefinitions: Record<string, ElementDefinition>, typedValue: TypedValue): void {
    for (const elementDefinition of Object.values(propertyDefinitions)) {
      this.#checkProperty(elementDefinition, typedValue);
    }
  }

  #checkProperty(elementDefinition: ElementDefinition, typedValue: TypedValue): void {
    const path = elementDefinition.path as string;
    const propertyName = path.split('.').pop() as string;
    const value = getTypedPropertyValue(typedValue, propertyName);

    if (isEmpty(value)) {
      if (elementDefinition.min !== undefined && elementDefinition.min > 0) {
        this.#issues.push(createStructureIssue(path, 'Missing required property'));
      }
      return;
    }

    if (elementDefinition.max === '*') {
      if (!Array.isArray(value)) {
        this.#issues.push(createStructureIssue(path, 'Expected array for property'));
        return;
      }
      for (const item of value) {
        this.#checkPropertyValue(elementDefinition, item);
      }
    } else {
      this.#checkPropertyValue(elementDefinition, value as TypedValue);
    }
  }

  #checkPropertyValue(elementDefinition: ElementDefinition, typedValue: TypedValue): void {
    if (isLowerCase(typedValue.type.charAt(0))) {
      this.#validatePrimitiveType(elementDefinition, typedValue);
    }
  }

  #validatePrimitiveType(elementDefinition: ElementDefinition, typedValue: TypedValue): void {
    const { type, value } = typedValue;

    // First, make sure the value is the correct JS type
    const expectedType = fhirTypeToJsType[typedValue.type];
    if (typeof value !== expectedType) {
      this.#createIssue(elementDefinition, 'Invalid type for ' + type);
      return;
    }

    // Then, perform additional checks for specialty types
    if (expectedType === 'string') {
      this.#validateString(elementDefinition, type as PropertyType, value as string);
    } else if (expectedType === 'number') {
      this.#validateNumber(elementDefinition, type as PropertyType, value as number);
    }
  }

  #validateString(elementDefinition: ElementDefinition, type: PropertyType, value: string): void {
    if (!value.trim()) {
      this.#createIssue(elementDefinition, 'Invalid empty string');
      return;
    }

    // Try to get the regex
    const valueDefinition = this.#schema.types[type]?.properties?.['value'];
    if (valueDefinition?.type) {
      const regex = getExtensionValue(valueDefinition.type[0], 'http://hl7.org/fhir/StructureDefinition/regex');
      if (regex) {
        if (!value.match(new RegExp(regex))) {
          this.#createIssue(elementDefinition, 'Invalid ' + type + ' format');
        }
      }
    }
  }

  #validateNumber(elementDefinition: ElementDefinition, type: PropertyType, value: number): void {
    if (isNaN(value) || !isFinite(value)) {
      this.#createIssue(elementDefinition, 'Invalid ' + type + ' value');
      return;
    }

    if (isIntegerType(type) && !Number.isInteger(value)) {
      this.#createIssue(elementDefinition, 'Number is not an integer');
    }

    if (type === PropertyType.positiveInt && value <= 0) {
      this.#createIssue(elementDefinition, 'Number is less than or equal to zero');
    }

    if (type === PropertyType.unsignedInt && value < 0) {
      this.#createIssue(elementDefinition, 'Number is negative');
    }
  }

  #checkAdditionalProperties(
    object: Record<string, unknown>,
    propertyDefinitions: Record<string, ElementDefinition>
  ): void {
    for (const key of Object.keys(object)) {
      if (key === 'resourceType' || key === 'id' || key === 'meta' || key === '_baseDefinition') {
        continue;
      }
      if (!(key in propertyDefinitions)) {
        // Try to find a "choice of type" property (e.g., "value[x]")
        // TODO: Consolidate this logic with FHIRPath lookup
        const choiceOfTypeKey = key.replace(/[A-Z].+/, '[x]');
        if (!(choiceOfTypeKey in propertyDefinitions)) {
          this.#issues.push(createStructureIssue(key, `Invalid additional property "${key}"`));
        }
      }
    }
  }

  #createIssue(elementDefinition: ElementDefinition, message: string): void {
    this.#issues.push(createStructureIssue(elementDefinition.path as string, message));
  }
}

function isIntegerType(propertyType: PropertyType): boolean {
  return (
    propertyType === PropertyType.integer ||
    propertyType === PropertyType.positiveInt ||
    propertyType === PropertyType.unsignedInt
  );
}
