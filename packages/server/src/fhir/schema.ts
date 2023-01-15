import {
  capitalize,
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
  xhtml: 'string',
  'http://hl7.org/fhirpath/System.String': 'string',
};

const baseResourceProperties = new Set<string>([
  // Resource
  'resourceType',
  'id',
  'meta',
  'implicitRules',
  'language',

  // DomainResource
  'text',
  'contained',
  'extension',
  'modifierExtension',
]);

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

    // Check for "null" once for the entire object hierarchy
    checkForNull(resource, '', this.#issues);

    this.#validateObject(toTypedValue(resource), resourceType);

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

    const propertyDefinitions = definition.properties;
    this.#checkProperties(path, propertyDefinitions, typedValue);
    this.#checkAdditionalProperties(path, typedValue, propertyDefinitions);
  }

  #checkProperties(path: string, propertyDefinitions: Record<string, ElementDefinition>, typedValue: TypedValue): void {
    for (const [key, elementDefinition] of Object.entries(propertyDefinitions)) {
      this.#checkProperty(path + '.' + key, elementDefinition, typedValue);
    }
  }

  #checkProperty(path: string, elementDefinition: ElementDefinition, typedValue: TypedValue): void {
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
        this.#checkPropertyValue(path, elementDefinition, item);
      }
    } else {
      this.#checkPropertyValue(path, elementDefinition, value as TypedValue);
    }
  }

  #checkPropertyValue(path: string, elementDefinition: ElementDefinition, typedValue: TypedValue): void {
    if (typedValue.value === null) {
      // Null handled separately
      return;
    }

    if (isLowerCase(typedValue.type.charAt(0))) {
      this.#validatePrimitiveType(elementDefinition, typedValue);
    } else {
      this.#validateObject(typedValue, path);
    }
  }

  #validatePrimitiveType(elementDefinition: ElementDefinition, typedValue: TypedValue): void {
    const { type, value } = typedValue;

    if (value === null) {
      // Null handled separately
      return;
    }

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
    path: string,
    typedValue: TypedValue,
    propertyDefinitions: Record<string, ElementDefinition>
  ): void {
    const object = typedValue.value as Record<string, unknown>;
    for (const key of Object.keys(object)) {
      this.#checkAdditionalProperty(path, key, typedValue, propertyDefinitions);
    }
  }

  /**
   * Checks if the given property is allowed on the given object.
   * @param path The path of the current object.
   * @param key The key of a property to check.
   * @param typedValue The current object.
   * @param propertyDefinitions The property definitions of the current object.
   */
  #checkAdditionalProperty(
    path: string,
    key: string,
    typedValue: TypedValue,
    propertyDefinitions: Record<string, ElementDefinition>
  ): void {
    if (
      !baseResourceProperties.has(key) &&
      !(key in propertyDefinitions) &&
      !isChoiceOfType(key, typedValue, propertyDefinitions) &&
      !this.#checkPrimitiveElement(path, key, typedValue)
    ) {
      const expression = `${path}.${key}`;
      this.#issues.push(createStructureIssue(expression, `Invalid additional property "${expression}"`));
    }
  }

  /**
   * Checks the element for a primitive.
   *
   * FHIR elements with primitive data types are represented in two parts:
   *   1) A JSON property with the name of the element, which has a JSON type of number, boolean, or string
   *   2) a JSON property with _ prepended to the name of the element, which, if present, contains the value's id and/or extensions
   *
   * See: https://hl7.org/fhir/json.html#primitive
   *
   * @param path The path to the property
   * @param key
   * @param typedValue
   */
  #checkPrimitiveElement(path: string, key: string, typedValue: TypedValue): boolean {
    // Primitive element starts with underscore
    if (!key.startsWith('_')) {
      return false;
    }

    // Validate the non-underscore property exists
    const primitiveKey = key.slice(1);
    if (!(primitiveKey in typedValue.value)) {
      return false;
    }

    // Then validate the element
    this.#validateObject({ type: 'Element', value: typedValue.value[key] }, path);
    return true;
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

function isChoiceOfType(
  key: string,
  typedValue: TypedValue,
  propertyDefinitions: Record<string, ElementDefinition>
): boolean {
  for (const propertyName of Object.keys(propertyDefinitions)) {
    if (!propertyName.endsWith('[x]')) {
      continue;
    }
    const basePropertyName = propertyName.replace('[x]', '');
    if (!key.startsWith(basePropertyName)) {
      continue;
    }
    let typedPropertyValue = getTypedPropertyValue(typedValue, propertyName);
    if (!typedPropertyValue) {
      continue;
    }
    if (Array.isArray(typedPropertyValue)) {
      typedPropertyValue = typedPropertyValue[0];
    }
    if (typedPropertyValue && key === basePropertyName + capitalize(typedPropertyValue.type)) {
      return true;
    }
  }
  return false;
}
