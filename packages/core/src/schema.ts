import { ElementDefinition, OperationOutcomeIssue, Resource } from '@medplum/fhirtypes';
import { getTypedPropertyValue, toTypedValue } from './fhirpath';
import { OperationOutcomeError, createStructureIssue, validationError } from './outcomes';
import { PropertyType, TypedValue, globalSchema } from './types';
import { fhirTypeToJsType } from './typeschema/validation';
import { capitalize, getExtensionValue, isEmpty, isLowerCase } from './utils';

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

/**
 * Returns true if the given string is a valid FHIR resource type.
 *
 * ```ts
 * isResourceType('Patient'); // true
 * isResourceType('XYZ'); // false
 * ```
 *
 * Note that this depends on globalSchema, which is populated by the StructureDefinition loader.
 *
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
 * In a client context, you can load the schema definitions using MedplumClient:
 *
 * ```ts
 * import { MedplumClient } from '@medplum/core';
 *
 * const medplum = new MedplumClient();
 * await medplum.requestSchema('Patient');
 * ```
 * @param resourceType The candidate resource type string.
 * @returns True if the resource type is a valid FHIR resource type.
 */
export function isResourceType(resourceType: string): boolean {
  const typeSchema = globalSchema.types[resourceType];
  return (
    typeSchema &&
    typeSchema.structureDefinition.id === resourceType &&
    typeSchema.structureDefinition.kind === 'resource'
  );
}

/**
 * Validates that the given string is a valid FHIR resource type.
 * On success, silently returns void.
 * On failure, throws an OperationOutcomeError.
 *
 * ```ts
 * validateResourceType('Patient'); // nothing
 * validateResourceType('XYZ'); // throws OperationOutcomeError
 * ```
 *
 * Note that this depends on globalSchema, which is populated by the StructureDefinition loader.
 *
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
 * In a client context, you can load the schema definitions using MedplumClient:
 *
 * ```ts
 * import { MedplumClient } from '@medplum/core';
 *
 * const medplum = new MedplumClient();
 * await medplum.requestSchema('Patient');
 * ```
 * @param resourceType The candidate resource type string.
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
 * Validates a candidate FHIR resource object.
 * On success, silently returns void.
 * On failure, throws an OperationOutcomeError with issues for each violation.
 *
 * ```ts
 * validateResource({ resourceType: 'Patient' }); // nothing
 * validateResource({ resourceType: 'XYZ' }); // throws OperationOutcomeError
 * ```
 *
 * Note that this depends on globalSchema, which is populated by the StructureDefinition loader.
 *
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
 * In a client context, you can load the schema definitions using MedplumClient:
 *
 * ```ts
 * import { MedplumClient } from '@medplum/core';
 *
 * const medplum = new MedplumClient();
 * await medplum.requestSchema('Patient');
 * ```
 * @param resource The candidate resource.
 * @deprecated use validate() instead
 */
export function validateResource<T extends Resource>(resource: T): void {
  new FhirSchemaValidator(resource).validate();
}

export class FhirSchemaValidator<T extends Resource> {
  private readonly issues: OperationOutcomeIssue[];
  private readonly root: T;

  constructor(root: T) {
    this.issues = [];
    this.root = root;
  }

  validate(): void {
    const resource = this.root;
    if (!resource) {
      throw new OperationOutcomeError(validationError('Resource is null'));
    }

    const resourceType = resource.resourceType;
    if (!resourceType) {
      throw new OperationOutcomeError(validationError('Missing resource type'));
    }

    // Check for "null" once for the entire object hierarchy
    checkForNull(resource, '', this.issues);

    this.validateObject(toTypedValue(resource), resourceType);

    if (this.issues.length > 0) {
      throw new OperationOutcomeError({
        resourceType: 'OperationOutcome',
        issue: this.issues,
      });
    }
  }

  private validateObject(typedValue: TypedValue, path: string): void {
    const definition = globalSchema.types[typedValue.type];
    if (!definition) {
      throw new OperationOutcomeError(validationError('Unknown type: ' + typedValue.type));
    }

    const propertyDefinitions = definition.properties;
    this.checkProperties(path, propertyDefinitions, typedValue);
    this.checkAdditionalProperties(path, typedValue, propertyDefinitions);
  }

  private checkProperties(
    path: string,
    propertyDefinitions: Record<string, ElementDefinition>,
    typedValue: TypedValue
  ): void {
    for (const [key, elementDefinition] of Object.entries(propertyDefinitions)) {
      this.checkProperty(path + '.' + key, elementDefinition, typedValue);
    }
  }

  private checkProperty(path: string, elementDefinition: ElementDefinition, typedValue: TypedValue): void {
    const propertyName = path.split('.').pop() as string;
    const value = getTypedPropertyValue(typedValue, propertyName);

    if (isEmpty(value)) {
      if (elementDefinition.min !== undefined && elementDefinition.min > 0) {
        this.issues.push(createStructureIssue(path, 'Missing required property'));
      }
      return;
    }

    if (elementDefinition.max === '*') {
      if (!Array.isArray(value)) {
        this.issues.push(createStructureIssue(path, 'Expected array for property'));
        return;
      }
      for (const item of value) {
        this.checkPropertyValue(path, elementDefinition, item);
      }
    } else {
      if (Array.isArray(value)) {
        this.issues.push(createStructureIssue(path, 'Expected single value for property'));
        return;
      }
      this.checkPropertyValue(path, elementDefinition, value as TypedValue);
    }
  }

  private checkPropertyValue(path: string, elementDefinition: ElementDefinition, typedValue: TypedValue): void {
    if (typedValue.value === null) {
      // Null handled separately
      return;
    }

    if (isLowerCase(typedValue.type.charAt(0))) {
      this.validatePrimitiveType(elementDefinition, typedValue);
    } else {
      this.validateObject(typedValue, path);
    }
  }

  private validatePrimitiveType(elementDefinition: ElementDefinition, typedValue: TypedValue): void {
    const { type, value } = typedValue;

    if (value === null) {
      // Null handled separately, so this code should never be reached
      // Leaving this check in place for now, in case we change the null handling
      return;
    }

    // First, make sure the value is the correct JS type
    if (!(typedValue.type in fhirTypeToJsType)) {
      this.createIssue(elementDefinition, `${type} is not a valid FHIR type`);
      return;
    }
    const expectedType = fhirTypeToJsType[typedValue.type as keyof typeof fhirTypeToJsType];

    // rome-ignore lint/suspicious/useValidTypeof: `expectedValue` guaranteed to be one of: 'string' | 'boolean' | 'number'
    if (typeof value !== expectedType && typeof value?.valueOf() !== expectedType) {
      this.createIssue(elementDefinition, 'Invalid type for ' + type);
      return;
    }

    // Then, perform additional checks for specialty types
    if (expectedType === 'string') {
      this.validateString(elementDefinition, type as PropertyType, value as string);
    } else if (expectedType === 'number') {
      this.validateNumber(elementDefinition, type as PropertyType, value as number);
    }
  }

  private validateString(elementDefinition: ElementDefinition, type: PropertyType, value: string): void {
    if (!value.trim()) {
      this.createIssue(elementDefinition, 'Invalid empty string');
      return;
    }

    // Try to get the regex
    const valueDefinition = globalSchema.types[type]?.properties['value'];
    if (valueDefinition?.type) {
      const regex = getExtensionValue(valueDefinition.type[0], 'http://hl7.org/fhir/StructureDefinition/regex');
      if (regex) {
        if (!new RegExp(regex).exec(value)) {
          this.createIssue(elementDefinition, 'Invalid ' + type + ' format');
        }
      }
    }
  }

  private validateNumber(elementDefinition: ElementDefinition, type: PropertyType, value: number): void {
    if (isNaN(value) || !isFinite(value)) {
      this.createIssue(elementDefinition, 'Invalid ' + type + ' value');
      return;
    }

    if (isIntegerType(type) && !Number.isInteger(value)) {
      this.createIssue(elementDefinition, 'Number is not an integer');
    }

    if (type === PropertyType.positiveInt && value <= 0) {
      this.createIssue(elementDefinition, 'Number is less than or equal to zero');
    }

    if (type === PropertyType.unsignedInt && value < 0) {
      this.createIssue(elementDefinition, 'Number is negative');
    }
  }

  private checkAdditionalProperties(
    path: string,
    typedValue: TypedValue,
    propertyDefinitions: Record<string, ElementDefinition>
  ): void {
    const object = typedValue.value as Record<string, unknown>;
    for (const key of Object.keys(object)) {
      this.checkAdditionalProperty(path, key, typedValue, propertyDefinitions);
    }
  }

  /**
   * Checks if the given property is allowed on the given object.
   * @param path The path of the current object.
   * @param key The key of a property to check.
   * @param typedValue The current object.
   * @param propertyDefinitions The property definitions of the current object.
   */
  private checkAdditionalProperty(
    path: string,
    key: string,
    typedValue: TypedValue,
    propertyDefinitions: Record<string, ElementDefinition>
  ): void {
    if (
      !baseResourceProperties.has(key) &&
      !(key in propertyDefinitions) &&
      !isChoiceOfType(key, typedValue, propertyDefinitions) &&
      !this.checkPrimitiveElement(path, key, typedValue)
    ) {
      const expression = `${path}.${key}`;
      this.issues.push(createStructureIssue(expression, `Invalid additional property "${expression}"`));
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
   * @param path The path to the property
   * @param key The key in the current typed value.
   * @param typedValue The current typed value.
   * @returns True if the primitive element is valid.
   */
  private checkPrimitiveElement(path: string, key: string, typedValue: TypedValue): boolean {
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
    this.validateObject({ type: 'Element', value: typedValue.value[key] }, path);
    return true;
  }

  private createIssue(elementDefinition: ElementDefinition, message: string): void {
    this.issues.push(createStructureIssue(elementDefinition.path as string, message));
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
      // At present, there are no choice types that are arrays in the FHIR spec
      // Leaving this here to make TypeScript happy, and in case that changes
      typedPropertyValue = typedPropertyValue[0];
    }
    if (typedPropertyValue && key === basePropertyName + capitalize(typedPropertyValue.type)) {
      return true;
    }
  }
  return false;
}

/**
 * Recursively checks for null values in an object.
 *
 * Note that "null" is a special value in JSON that is not allowed in FHIR.
 * @param value Input value of any type.
 * @param path Path string to the value for OperationOutcome.
 * @param issues Output list of issues.
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
